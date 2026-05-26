import PDFDocument from 'pdfkit';
import { UNITS, settlementModes } from './schema.js';
import { collectFlags } from './flags.js';

const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

const PDF_SECTIONS = new Set(['summary', 'bank', 'pnl', 'flags', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']);

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

export function createDailyFlashPdf(data, date, options = {}) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 36, right: 36, bottom: 24, left: 36 }, bufferPages: true });
  let pageNo = 0;
  const reportType = options.reportType === 'weekly' ? 'weekly' : 'daily';
  const isWeekly = reportType === 'weekly';
  const week = options.week ?? null;
  const requestedSections = Array.isArray(options.sections)
    ? options.sections.filter((section) => PDF_SECTIONS.has(section))
    : [];
  const enabledSections = requestedSections.length ? new Set(requestedSections) : new Set(PDF_SECTIONS);
  if (isWeekly) enabledSections.delete('bank');

  const FIRST_PAGE_TOP = 96;
  const SUBSEQUENT_PAGE_TOP = 40;
  const contentBottom = 786;
  const width = doc.page.width - 72;

  function decoratePage() {
    pageNo += 1;
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.page);
    if (pageNo === 1) {
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(6.5).text('CENTRE POINT HOSPITALITY', 36, 28);
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(16).text(isWeekly ? 'Weekly Flash Report' : 'Daily Flash Report', 36, 43);
      doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text('Internal management report', 36, 64);
      const dateLabel = isWeekly && week ? `${niceDate(week.start)} - ${niceDate(week.end)}` : niceDate(date);
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9).text(dateLabel, 360, 35, { width: 199, align: 'right' });
      doc.fillColor(colors.muted).font('Helvetica').fontSize(6.5).text(`Generated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, 430, 51, { width: 129, align: 'right' });
      doc.strokeColor(colors.lineDark).lineWidth(0.7).moveTo(36, 84).lineTo(559, 84).stroke();
    }
    doc.strokeColor(colors.lineDark).lineWidth(0.5).moveTo(36, 802).lineTo(559, 802).stroke();
    doc.fillColor(colors.subtle).font('Helvetica').fontSize(6.5).text(`Centre Point Hospitality | ${isWeekly ? 'Weekly' : 'Daily'} Flash Report | Internal Use Only`, 36, 810, { lineBreak: false });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(6.5).text(`Page ${pageNo}`, 430, 810, { width: 129, align: 'right', lineBreak: false });
    doc.restore();
    doc.y = pageNo === 1 ? FIRST_PAGE_TOP : SUBSEQUENT_PAGE_TOP;
  }

  function ensureSpace(height) {
    if (doc.y + height > contentBottom) {
      doc.addPage();
      decoratePage();
    }
  }

  function sectionTitle(title) {
    ensureSpace(24);
    const y = doc.y;
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(8.5).text(safeText(title), 36, y);
    doc.strokeColor(colors.line).lineWidth(0.5).moveTo(36, y + 13).lineTo(559, y + 13).stroke();
    doc.y = y + 19;
  }

  function hero(title, source, value, change = '') {
    ensureSpace(32);
    const y = doc.y;
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11).text(safeText(title), 36, y, { width: 170, lineBreak: false });
    doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(safeText(source), 212, y + 2, { width: 190 });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(value), 420, y, { width: 139, align: 'right' });
    if (change) {
      doc.fillColor(change.startsWith('-') ? colors.red : colors.headerSoft).font('Helvetica-Bold').fontSize(7).text(safeText(change), 420, y + 14, { width: 139, align: 'right' });
    }
    doc.strokeColor(colors.line).lineWidth(0.5).moveTo(36, y + 20).lineTo(559, y + 20).stroke();
    doc.y = y + 28;
  }

  function unitDivider() {
    ensureSpace(14);
    const y = doc.y;
    doc.strokeColor(colors.lineDark).lineWidth(0.75).moveTo(36, y).lineTo(559, y).stroke();
    doc.y = y + 14;
  }

  function summaryCards(items) {
    ensureSpace(40);
    const y = doc.y;
    const rowH = 32;
    const cardW = width / items.length;
    doc.rect(36, y, width, rowH).fill(colors.panel).strokeColor(colors.line).lineWidth(0.5).stroke();
    items.forEach((item, index) => {
      const x = 36 + index * cardW;
      if (index) doc.strokeColor(colors.line).lineWidth(0.4).moveTo(x, y).lineTo(x, y + rowH).stroke();
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(5.8).text(safeText(item.label).toUpperCase(), x + 8, y + 6, { width: cardW - 16 });
      doc.fillColor(item.tone ?? colors.ink).font('Helvetica-Bold').fontSize(9).text(safeText(item.value), x + 8, y + 18, { width: cardW - 16, lineBreak: false });
    });
    doc.y = y + rowH + 10;
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
        decoratePage();
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
    doc.y = y + 10;
  }

  function flagCell(label) {
    const normalized = String(label).includes('ACTION') ? 'ACTION' : String(label);
    const color = normalized === 'ACTION' ? colors.red : normalized === 'WATCH' ? colors.amber : normalized === 'OUTPERFORM' ? colors.green : colors.headerSoft;
    return { text: normalized, color, bold: true };
  }

  function kpiTable(title, rows, includeYtd = true) {
    sectionTitle(title);
    const actualColumn = isWeekly ? 'Week' : 'Today';
    table(
      includeYtd ? ['KPI', actualColumn, 'AOP Target', 'MTD', 'YTD', 'Flag'] : ['KPI', actualColumn, 'AOP Target', 'MTD', 'Flag'],
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

  function sheetRef() {
    // Intentionally a no-op: source-sheet reference removed for a denser layout.
  }

  function hasSection(section) {
    return enabledSections.has(section);
  }

  decoratePage();

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

  if (hasSection('summary')) {
    const cards = [
      { label: 'Group Revenue', value: money(pnlTotals.revenue), tone: colors.header, caption: 'Today' },
      { label: 'Est. Net Profit', value: money(pnlTotals.net), tone: pnlTotals.net >= 0 ? colors.green : colors.red, caption: 'After fixed cost' },
      { label: 'Bank Net Available', value: money(bankTotals.net), tone: colors.headerSoft, caption: `${bankRowsRaw.length} accounts` },
      { label: 'Open Risks', value: String(flagCount), tone: flagCount ? colors.amber : colors.green, caption: 'Watch / action flags' }
    ];
    if (isWeekly) {
      cards[0] = { ...cards[0], label: 'Weekly Revenue', caption: `${week?.dates?.length ?? 0} saved days` };
      cards[1] = { ...cards[1], label: 'Weekly Net Profit' };
      cards.splice(2, 1);
    }
    summaryCards(cards);
  }

  if (hasSection('bank')) {
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
  }

  if (hasSection('pnl')) {
    sectionTitle(`${isWeekly ? '1' : '2'}. Unit-wise Estimated P&L`);
    table(
      ['Unit', 'Revenue', 'Purchases', 'Gross Profit', 'GP%', 'Est. Net Profit'],
      [
        ...pnl.map((row) => [row.unit, money(row.revenueToday), money(row.purchasesToday), money(row.grossProfit), percent(row.gpPercent), { text: money(row.netProfit), color: row.netProfit >= 0 ? colors.green : colors.red, bold: true }]),
        [{ text: 'GROUP TOTAL', bold: true }, { text: money(pnlTotals.revenue), bold: true }, { text: money(pnlTotals.purchases), bold: true }, { text: money(pnlTotals.gp), bold: true }, '', { text: money(pnlTotals.net), bold: true, color: pnlTotals.net >= 0 ? colors.green : colors.red }]
      ],
      { widths: [112, 88, 88, 88, 62, 85] }
    );
  }

  if (hasSection('flags')) {
    sectionTitle(`${isWeekly ? '2' : '3'}. Watch Out Flag Summary`);
    const flags = collectFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').slice(0, 16);
    table(
      ['Unit', 'KPI', 'Target', isWeekly ? 'Week' : 'Today', 'Flag', 'Action Required'],
      flags.map((row) => [row.unit, row.kpiName, formatValue(row.aopTarget, row.kpiName), formatValue(row.todayActual, row.kpiName), flagCell(row.flag), actionFor(row, { isWeekly })]),
      { widths: [78, 120, 62, 62, 72, 129], leftColumns: [1, 5], fontSize: 7 }
    );
  }

  if (hasSection('hotels')) {
    const hotelRevenue = pnl.filter((row) => row.unit === 'CP Nagpur' || row.unit === 'CP NM').reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
    hero('Hotels', 'IDS (CP Nagpur) | Hotelogix (CP Navi Mumbai)', money(hotelRevenue), '');
    const cpNmExclude = ['F&B Outlets', 'Banquets'];
    for (const unit of ['CP Nagpur', 'CP NM']) {
      const label = unit === 'CP NM' ? 'CP Navi Mumbai' : unit;
      const rows = (data.hotels ?? []).filter((row) => row.unit === unit);
      const sections = [...new Set(rows.map((row) => row.section))].filter(
        (s) => s !== 'Forecast' && (unit !== 'CP NM' || !cpNmExclude.includes(s))
      );
      for (const section of sections) {
        kpiTable(`${label} - ${section}`, rows.filter((row) => row.section === section), false);
      }
      unitDivider();
    }
  }

  if (hasSection('fnb')) {
    const fnbRevenue = pnl.filter((row) => row.unit === 'Pablo' || row.unit === 'Dali').reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
    hero('Standalone F&B', 'Pet Pooja API | Pablo & Dali', money(fnbRevenue), '');
    for (const brand of ['Pablo', 'Dali']) {
      const rows = data.fnb?.[brand] ?? [];
      sheetRef(brand === 'Pablo' ? SHEET_URLS.pabloCost : SHEET_URLS.daliCost);
      for (const section of [...new Set(rows.map((row) => row.section))]) {
        kpiTable(`${brand} - ${section}`, rows.filter((row) => row.section === section), false);
      }
    }
  }

  if (hasSection('rabbits')) {
    const rabbitsRows = data.rabbits ?? [];
    hero('Rabbits', 'POS EOD Email | Delivery Platforms', money(revenueFor(rabbitsRows)), '');
    for (const section of [...new Set(rabbitsRows.map((row) => row.section))]) {
      kpiTable(`Rabbits - ${section}`, rabbitsRows.filter((row) => row.section === section), true);
    }
  }

  if (hasSection('mickys')) {
    const mickysRows = data.mickys ?? [];
    hero("Micky's by CP Foods", 'Google Sheet (Leads) | Tally Cloud (Day End)', money(revenueFor(mickysRows)), '');
    sheetRef(SHEET_URLS.mickysLeads);
    for (const section of [...new Set(mickysRows.map((row) => row.section))]) {
      kpiTable(`Micky's - ${section}`, mickysRows.filter((row) => row.section === section), true);
    }
  }

  if (hasSection('purosoul')) {
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
  }

  if (hasSection('settlement')) {
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
  }

  return doc;
}

function revenueFor(rows) {
  const revenueRow = rows.find((row) => /total revenue|gross sales|order revenue|revenue today/i.test(row.name));
  return revenueRow?.actual ?? 0;
}

function actionFor(row, { isWeekly = false } = {}) {
  if (row.flag === 'ACTION NEEDED') return 'Manager review before noon.';
  if (/occupancy/i.test(row.kpiName)) return isWeekly ? 'Push pickup and review occupancy pace.' : 'Push pickup and review forecast.';
  if (/cost|purchase/i.test(row.kpiName)) return 'Check purchase and wastage today.';
  if (/sales|revenue|orders|covers|apc/i.test(row.kpiName)) return 'Focus upsell, covers, and channel push.';
  return 'Track closely in daily meeting.';
}
