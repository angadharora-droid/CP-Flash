import PDFDocument from 'pdfkit';
import { UNITS, settlementModes } from './schema.js';
import { collectFlags } from './flags.js';
import { buildSourceStatus } from './sources.js';

const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

const colors = {
  header: '#111827',
  headerSoft: '#4b5563',
  accent: '#6b7280',
  accentSoft: '#f5f6f8',
  page: '#ffffff',
  panel: '#fafafa',
  panelAlt: '#f6f7f9',
  line: '#d9dde3',
  lineDark: '#aeb6c2',
  ink: '#111827',
  muted: '#64748b',
  subtle: '#94a3b8',
  green: '#374151',
  amber: '#6b7280',
  red: '#7f1d1d',
  white: '#ffffff'
};

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  const amount = Math.round(numberValue(value));
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

function percent(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

function isMoneyKpi(name) {
  return /revenue|sales|purchase|cost|profit|pipeline|balance|cheque|arr|revpar|bill/i.test(name);
}

function formatValue(value, name = '') {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  if (isMoneyKpi(name) && Number.isFinite(numberValue(value))) return money(value);
  return String(value);
}

function calcFlag(actual, target, direction = 'min') {
  if (String(actual ?? '').trim() === '') return { label: 'ON TRACK', ratio: 100 };
  const actualValue = numberValue(actual);
  const targetValue = numberValue(target);
  if (!targetValue && !actualValue) return { label: 'ON TRACK', ratio: 100 };
  if (!targetValue) return { label: actualValue > 0 ? 'OUTPERFORM' : 'ON TRACK', ratio: 100 };
  const ratio = direction === 'max' ? (targetValue / Math.max(actualValue, 0.0001)) * 100 : (actualValue / targetValue) * 100;
  if (ratio >= 110) return { label: 'OUTPERFORM', ratio };
  if (ratio >= 95) return { label: 'ON TRACK', ratio };
  if (ratio >= 85) return { label: 'WATCH', ratio };
  return { label: 'ACTION' };
}

function pnlRows(data) {
  return (data.pnl ?? []).map((row) => {
    const revenue = numberValue(row.revenueToday);
    const purchases = numberValue(row.purchasesToday);
    const fixed = numberValue(row.fixedCost);
    const grossProfit = revenue - purchases;
    const netProfit = grossProfit - fixed;
    return {
      ...row,
      grossProfit,
      gpPercent: revenue ? (grossProfit / revenue) * 100 : 0,
      netProfit,
      netMargin: revenue ? (netProfit / revenue) * 100 : 0
    };
  });
}

function settlementTotals(data) {
  const matrix = data.settlement ?? {};
  const rowTotals = Object.fromEntries(settlementModes.map((mode) => [mode, UNITS.reduce((sum, unit) => sum + numberValue(matrix[mode]?.[unit]), 0)]));
  const unitTotals = Object.fromEntries(UNITS.map((unit) => [unit, settlementModes.reduce((sum, mode) => sum + numberValue(matrix[mode]?.[unit]), 0)]));
  const groupTotal = Object.values(rowTotals).reduce((sum, value) => sum + value, 0);
  return { rowTotals, unitTotals, groupTotal };
}

function groupRevenue(data) {
  return pnlRows(data).reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
}

function niceDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
}

function safeText(value) {
  return String(value ?? '').replace(/[₹]/g, 'Rs.');
}

export function createDailyFlashPdf(data, date) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 36, right: 36, bottom: 24, left: 36 }, bufferPages: true });
  let pageNo = 0;

  const contentTop = 96;
  const contentBottom = 786;
  const width = doc.page.width - 72;

  function header() {
    pageNo += 1;
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.page);
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(6.5).text('CENTRE POINT HOSPITALITY', 36, 28);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(16).text('Daily Flash Report', 36, 43);
    doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text('Internal management report', 36, 64);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9).text(niceDate(date), 430, 35, { width: 129, align: 'right' });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(6.5).text(`Generated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} | Page ${pageNo}`, 430, 51, { width: 129, align: 'right' });
    doc.strokeColor(colors.lineDark).lineWidth(0.7).moveTo(36, 84).lineTo(559, 84).stroke();
    doc.strokeColor(colors.lineDark).lineWidth(0.5).moveTo(36, 802).lineTo(559, 802).stroke();
    doc.fillColor(colors.subtle).fontSize(6.5).text('Centre Point Hospitality | Daily Flash Report | Internal Use Only', 36, 810, { lineBreak: false });
    doc.restore();
    doc.y = contentTop;
  }

  function ensureSpace(height) {
    if (doc.y + height > contentBottom) {
      doc.addPage();
      header();
    }
  }

  function sectionTitle(title) {
    ensureSpace(28);
    doc.moveDown(0.1);
    const y = doc.y;
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(8.5).text(safeText(title), 36, y);
    doc.strokeColor(colors.line).lineWidth(0.5).moveTo(36, y + 13).lineTo(559, y + 13).stroke();
    doc.y = y + 24;
  }

  function hero(title, source, value, change = '') {
    ensureSpace(38);
    const y = doc.y;
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11).text(safeText(title), 36, y, { width: 170, lineBreak: false });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(safeText(source), 212, y + 2, { width: 190 });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(value), 420, y, { width: 139, align: 'right' });
    if (change) {
      doc.fillColor(change.startsWith('-') ? colors.red : colors.headerSoft).font('Helvetica-Bold').fontSize(7).text(safeText(change), 420, y + 14, { width: 139, align: 'right' });
    }
    doc.strokeColor(colors.line).lineWidth(0.5).moveTo(36, y + 23).lineTo(559, y + 23).stroke();
    doc.y = y + 36;
  }

  function summaryCards(items) {
    ensureSpace(44);
    const y = doc.y;
    const rowH = 34;
    const cardW = width / items.length;
    doc.rect(36, y, width, rowH).fill(colors.panel).strokeColor(colors.line).lineWidth(0.5).stroke();
    items.forEach((item, index) => {
      const x = 36 + index * cardW;
      if (index) doc.strokeColor(colors.line).lineWidth(0.4).moveTo(x, y).lineTo(x, y + rowH).stroke();
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(5.8).text(safeText(item.label).toUpperCase(), x + 8, y + 7, { width: cardW - 16 });
      doc.fillColor(item.tone ?? colors.ink).font('Helvetica-Bold').fontSize(9).text(safeText(item.value), x + 8, y + 19, { width: cardW - 16, lineBreak: false });
    });
    doc.y = y + 48;
  }

  function table(columns, rows, options = {}) {
    const rowHeight = options.rowHeight ?? 22;
    const headerHeight = options.headerHeight ?? rowHeight;
    const colWidths = options.widths ?? columns.map(() => width / columns.length);
    const fontSize = options.fontSize ?? 7.5;
    const x = 36;

    ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 3));
    let y = doc.y;

    function drawHeader() {
      doc.rect(x, y, width, headerHeight).fill(colors.panel);
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(6.8);
      let cursor = x;
      columns.forEach((column, index) => {
        doc.text(safeText(column), cursor + 7, y + 7, { width: colWidths[index] - 12, align: index === 0 ? 'left' : 'right' });
        cursor += colWidths[index];
      });
      y += headerHeight;
    }

    drawHeader();
    rows.forEach((row, rowIndex) => {
      if (y + rowHeight > contentBottom) {
        doc.y = y;
        doc.addPage();
        header();
        y = doc.y;
        drawHeader();
      }

      doc.rect(x, y, width, rowHeight).fill(rowIndex % 2 ? colors.panelAlt : colors.white);
      doc.fillColor(colors.ink).font('Helvetica').fontSize(fontSize);
      let cursor = x;
      row.forEach((cell, index) => {
        const align = index === 0 || options.leftColumns?.includes(index) ? 'left' : 'right';
        const text = typeof cell === 'object' ? cell.text : cell;
        const fill = typeof cell === 'object' && cell.color ? cell.color : colors.ink;
        const font = typeof cell === 'object' && cell.bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fillColor(fill).font(font).text(safeText(text), cursor + 7, y + 7, { width: colWidths[index] - 12, align, lineBreak: false });
        cursor += colWidths[index];
      });
      doc.strokeColor(colors.line).lineWidth(0.25).moveTo(x, y + rowHeight).lineTo(x + width, y + rowHeight).stroke();
      y += rowHeight;
    });

    doc.strokeColor(colors.line).lineWidth(0.6).rect(x, doc.y, width, y - doc.y).stroke();
    doc.y = y + 14;
  }

  function flagCell(label) {
    const normalized = String(label).includes('ACTION') ? 'ACTION' : String(label);
    const color = normalized === 'ACTION' ? colors.red : normalized === 'WATCH' ? colors.amber : normalized === 'OUTPERFORM' ? colors.green : colors.headerSoft;
    return { text: normalized, color, bold: true };
  }

  function kpiTable(title, rows, includeYtd = true) {
    sectionTitle(title);
    table(
      includeYtd ? ['KPI', 'Today', 'AOP Target', 'MTD', 'YTD', 'Flag'] : ['KPI', 'Today', 'AOP Target', 'MTD', 'Flag'],
      rows.map((row) => {
        const flag = calcFlag(row.actual, row.target, row.direction).label;
        const base = [row.name, formatValue(row.actual, row.name), formatValue(row.target, row.name), formatValue(row.mtd, row.name)];
        if (includeYtd) base.push(formatValue(row.ytd, row.name));
        base.push(flagCell(flag));
        return base;
      }),
      { widths: includeYtd ? [126, 70, 74, 74, 74, 105] : [145, 90, 86, 90, 112] }
    );
  }

  function sheetRef(url) {
    if (!url) return;
    ensureSpace(16);
    const y = doc.y;
    doc.fillColor(colors.muted).font('Helvetica').fontSize(6.5)
      .text('Source sheet available', 36, y);
    doc.y = y + 16;
  }

  header();

  const bankRowsRaw = data.bankPosition ?? [];
  const bankNet = (row) => String(row.netBalance ?? '').trim() !== ''
    ? numberValue(row.netBalance)
    : numberValue(row.actualBalance) + numberValue(row.fdTotal)
      - numberValue(row.chequesIssued) + numberValue(row.chequesInHand);
  const bankByUnit = new Map();
  for (const row of bankRowsRaw) {
    const unit = row.unit || 'Unspecified';
    const existing = bankByUnit.get(unit) ?? { unit, count: 0, actual: 0, fd: 0, issued: 0, hand: 0, net: 0 };
    existing.count += 1;
    existing.actual += numberValue(row.actualBalance);
    existing.fd += numberValue(row.fdTotal);
    existing.issued += numberValue(row.chequesIssued);
    existing.hand += numberValue(row.chequesInHand);
    existing.net += bankNet(row);
    bankByUnit.set(unit, existing);
  }
  const bankRows = [...bankByUnit.values()];
  const bankTotals = bankRows.reduce((acc, row) => {
    acc.actual += row.actual;
    acc.fd += row.fd;
    acc.issued += row.issued;
    acc.hand += row.hand;
    acc.net += row.net;
    return acc;
  }, { actual: 0, fd: 0, issued: 0, hand: 0, net: 0 });
  const pnl = pnlRows(data);
  const pnlTotals = pnl.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday);
    acc.purchases += numberValue(row.purchasesToday);
    acc.gp += row.grossProfit;
    acc.net += row.netProfit;
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, net: 0 });
  const flagCount = collectFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').length;
  const settlement = settlementTotals(data);
  const settlementDiff = groupRevenue(data) - settlement.groupTotal;

  summaryCards([
    { label: 'Group Revenue', value: money(pnlTotals.revenue), tone: colors.header, caption: 'Today' },
    { label: 'Est. Net Profit', value: money(pnlTotals.net), tone: pnlTotals.net >= 0 ? colors.green : colors.red, caption: 'After fixed cost' },
    { label: 'Bank Net Available', value: money(bankTotals.net), tone: colors.headerSoft, caption: `${bankRowsRaw.length} accounts` },
    { label: 'Open Risks', value: String(flagCount), tone: flagCount ? colors.amber : colors.green, caption: 'Watch / action flags' }
  ]);

  sectionTitle('1. Bank Position - Daily Cash Summary');
  sheetRef(SHEET_URLS.bankPosition);
  table(
    ['Unit', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheques in Hand', 'Net Available'],
    [
      ...bankRows.map((row) => [row.unit, money(row.actual), money(row.fd), money(row.issued), money(row.hand), { text: money(row.net), color: colors.green, bold: true }]),
      [{ text: 'GROUP TOTAL', bold: true }, { text: money(bankTotals.actual), bold: true }, { text: money(bankTotals.fd), bold: true }, { text: money(bankTotals.issued), bold: true }, { text: money(bankTotals.hand), bold: true }, { text: money(bankTotals.net), bold: true, color: bankTotals.net >= 0 ? colors.green : colors.red }]
    ],
    { widths: [126, 78, 62, 78, 78, 101], fontSize: 6.7 }
  );

  sectionTitle('2. Unit-wise Estimated P&L');
  table(
    ['Unit', 'Revenue', 'Purchases', 'Gross Profit', 'GP%', 'Est. Net Profit'],
    [
      ...pnl.map((row) => [row.unit, money(row.revenueToday), money(row.purchasesToday), money(row.grossProfit), percent(row.gpPercent), { text: money(row.netProfit), color: row.netProfit >= 0 ? colors.green : colors.red, bold: true }]),
      [{ text: 'GROUP TOTAL', bold: true }, { text: money(pnlTotals.revenue), bold: true }, { text: money(pnlTotals.purchases), bold: true }, { text: money(pnlTotals.gp), bold: true }, '', { text: money(pnlTotals.net), bold: true, color: pnlTotals.net >= 0 ? colors.green : colors.red }]
    ],
    { widths: [112, 88, 88, 88, 62, 85] }
  );

  sectionTitle('3. Watch Out Flag Summary');
  const flags = collectFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').slice(0, 16);
  table(
    ['Unit', 'KPI', 'Target', 'Today', 'Flag', 'Action Required'],
    flags.map((row) => [row.unit, row.kpiName, formatValue(row.aopTarget, row.kpiName), formatValue(row.todayActual, row.kpiName), flagCell(row.flag), actionFor(row)]),
    { widths: [78, 120, 62, 62, 72, 129], leftColumns: [1, 5], fontSize: 7 }
  );

  doc.addPage();
  header();
  const hotelRevenue = pnl.filter((row) => row.unit === 'CP Nagpur' || row.unit === 'CP NM').reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
  hero('Hotels', 'IDS (CP Nagpur) | Hotelogix (CP Navi Mumbai)', money(hotelRevenue), '');
  const cpNmExclude = ['F&B Outlets', 'Banquets'];
  for (const unit of ['CP Nagpur', 'CP NM']) {
    const label = unit === 'CP NM' ? 'CP Navi Mumbai' : unit;
    const rows = (data.hotels ?? []).filter((row) => row.unit === unit);
    const sections = [...new Set(rows.map((row) => row.section))].filter(
      (s) => unit !== 'CP NM' || !cpNmExclude.includes(s)
    );
    for (const section of sections) {
      kpiTable(`${label} - ${section}`, rows.filter((row) => row.section === section), false);
    }
  }

  doc.addPage();
  header();
  const fnbRevenue = pnl.filter((row) => row.unit === 'Pablo' || row.unit === 'Dali').reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
  hero('Standalone F&B', 'Pet Pooja API | Pablo & Dali', money(fnbRevenue), '');
  for (const brand of ['Pablo', 'Dali']) {
    const rows = data.fnb?.[brand] ?? [];
    sheetRef(brand === 'Pablo' ? SHEET_URLS.pabloCost : SHEET_URLS.daliCost);
    for (const section of [...new Set(rows.map((row) => row.section))]) {
      kpiTable(`${brand} - ${section}`, rows.filter((row) => row.section === section), false);
    }
  }

  doc.addPage();
  header();
  const rabbitsRows = data.rabbits ?? [];
  hero('Rabbits', 'POS EOD Email | Delivery Platforms', money(revenueFor(rabbitsRows)), '');
  for (const section of [...new Set(rabbitsRows.map((row) => row.section))]) {
    kpiTable(`Rabbits - ${section}`, rabbitsRows.filter((row) => row.section === section), true);
  }

  doc.addPage();
  header();
  const mickysRows = data.mickys ?? [];
  hero("Micky's by CP Foods", 'Google Sheet (Leads) | Tally Cloud (Day End)', money(revenueFor(mickysRows)), '');
  sheetRef(SHEET_URLS.mickysLeads);
  for (const section of [...new Set(mickysRows.map((row) => row.section))]) {
    kpiTable(`Micky's - ${section}`, mickysRows.filter((row) => row.section === section), true);
  }

  doc.addPage();
  header();
  const purosoulRows = data.purosoul ?? [];
  hero('Purosoul', 'Google Drive (Daily Flash) | Tally Cloud (Day End)', money(revenueFor(purosoulRows)), '');
  for (const section of [...new Set(purosoulRows.map((row) => row.section))]) {
    kpiTable(`Purosoul - ${section}`, purosoulRows.filter((row) => row.section === section), true);
  }
  sectionTitle('Purosoul - SKU Production & Dispatch');
  table(
    ['SKU', 'Produced', 'Dispatched', 'Closing Stock', 'MTD', 'YTD'],
    (data.purosoulSku ?? []).map((row) => [row.sku, row.produced || '-', row.dispatched || '-', numberValue(row.produced) - numberValue(row.dispatched), row.mtd || '-', row.ytd || '-']),
    { widths: [100, 80, 90, 90, 80, 83] }
  );

  doc.addPage();
  header();
  sectionTitle('Settlement');
  table(
    ['Mode', ...UNITS, 'Group Total'],
    settlementModes.map((mode) => [mode, ...UNITS.map((unit) => money(data.settlement?.[mode]?.[unit])), { text: money(settlement.rowTotals[mode]), bold: true }]),
    { widths: [95, 50, 50, 50, 50, 50, 50, 50, 78], fontSize: 6.3, leftColumns: [0] }
  );
  sectionTitle('Reconciliation');
  summaryCards([
    { label: 'Total Revenue', value: money(groupRevenue(data)), tone: colors.header },
    { label: 'Total Settled', value: money(settlement.groupTotal), tone: colors.green },
    { label: 'Difference', value: money(settlementDiff), tone: settlementDiff === 0 ? colors.green : colors.red },
    { label: 'Status', value: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', tone: settlementDiff === 0 ? colors.green : colors.red }
  ]);
  table(
    ['Total Revenue Today', 'Total Settled', 'Difference', 'Status'],
    [[money(groupRevenue(data)), money(settlement.groupTotal), { text: money(settlementDiff), color: settlementDiff === 0 ? colors.green : colors.red, bold: true }, { text: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', color: settlementDiff === 0 ? colors.green : colors.red, bold: true }]],
    { widths: [132, 132, 132, 127] }
  );

  sectionTitle('Source Control');
  const sourceStatus = buildSourceStatus(data);
  table(
    ['Source', 'Type', 'Status', 'Last Import / File'],
    sourceStatus.sources.map((source) => [
      source.sheetUrl ? { text: source.label, color: '#1a6b9a' } : source.label,
      source.type,
      flagCell(source.status === 'Pending' ? 'WATCH' : 'ON TRACK'),
      source.file || source.importedAt || '-'
    ]),
    { widths: [180, 100, 82, 161], leftColumns: [0, 3], fontSize: 7 }
  );

  doc.addPage();
  header();
  notesPage(doc, data);

  return doc;
}

function revenueFor(rows) {
  const revenueRow = rows.find((row) => /total revenue|gross sales|order revenue|revenue today/i.test(row.name));
  return revenueRow?.actual ?? 0;
}

function actionFor(row) {
  if (row.flag === 'ACTION NEEDED') return 'Manager review before noon.';
  if (/occupancy/i.test(row.kpiName)) return 'Push pickup and review forecast.';
  if (/cost|purchase/i.test(row.kpiName)) return 'Check purchase and wastage today.';
  if (/sales|revenue|orders|covers|apc/i.test(row.kpiName)) return 'Focus upsell, covers, and channel push.';
  return 'Track closely in daily meeting.';
}

function notesPage(doc, data) {
  const pnl = pnlRows(data);
  const settlement = settlementTotals(data);
  const risks = collectFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');
  const bestUnit = [...pnl].sort((a, b) => b.netProfit - a.netProfit)[0];
  const weakestUnit = [...pnl].sort((a, b) => a.netProfit - b.netProfit)[0];
  const notes = [
    `Group estimated net profit: ${money(pnl.reduce((sum, row) => sum + row.netProfit, 0))} today.`,
    bestUnit ? `Best contribution: ${bestUnit.unit} at ${money(bestUnit.netProfit)} estimated net profit.` : '',
    weakestUnit ? `Needs attention: ${weakestUnit.unit} at ${money(weakestUnit.netProfit)} estimated net profit.` : '',
    `${risks.length} watch/action flags need manager review.`,
    `Settlement difference: ${money(groupRevenue(data) - settlement.groupTotal)} across all units.`,
    'Close pending source feeds before final circulation.',
    'Use this report as the daily morning review copy for unit heads.'
  ].filter(Boolean);

  doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(13).text('Management Notes', 36, 122);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5).text('Prepared from the current daily flash data.', 36, 141);
  doc.strokeColor(colors.line).lineWidth(0.7).moveTo(36, 158).lineTo(559, 158).stroke();
  doc.roundedRect(36, 178, 523, 250, 3).fill(colors.white).strokeColor(colors.line).lineWidth(0.6).stroke();
  doc.fillColor(colors.ink).font('Helvetica').fontSize(8);
  let y = 198;
  for (const note of notes) {
    doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8).text(String(notes.indexOf(note) + 1).padStart(2, '0'), 54, y, { width: 18 });
    doc.fillColor(colors.ink).font('Helvetica').fontSize(8).text(safeText(note), 84, y, { width: 430, lineGap: 3 });
    y += 28;
  }

  doc.roundedRect(36, 462, 523, 96, 3).fill(colors.panel).strokeColor(colors.line).lineWidth(0.6).stroke();
  doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9).text('Close-of-day checklist', 56, 484);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(7.5);
  [
    'Confirm all pending source feeds before circulation.',
    'Review WATCH and ACTION flags with unit owners.',
    'Resolve settlement mismatch before final archive.'
  ].forEach((item, index) => {
    const rowY = 506 + index * 16;
    doc.rect(56, rowY - 1, 9, 9).strokeColor(colors.lineDark).lineWidth(0.7).stroke();
    doc.text(item, 74, rowY - 1, { width: 440 });
  });
}
