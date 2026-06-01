import PDFDocument from 'pdfkit';
import { UNITS, settlementModes, UNITS_WITHOUT_FIXED_COST } from './schema.js';
import { collectFlags } from './flags.js';

const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

const PDF_SECTIONS = new Set(['summary', 'bank', 'pnl', 'flags', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']);

const colors = {
  header:     '#0f172a',
  headerSoft: '#475569',
  accent:     '#08786c',
  accentDark: '#075e55',
  accentSoft: '#cfeee8',
  accentTint: '#edf8f6',
  page:       '#ffffff',
  panel:      '#f7f9fa',
  panelAlt:   '#eef2f5',
  line:       '#cad3da',
  lineSoft:   '#e4eaee',
  lineDark:   '#94a3b8',
  ink:        '#0f172a',
  muted:      '#5a6872',
  subtle:     '#94a3b8',
  green:      '#0d7c4d',
  greenSoft:  '#dcf5ea',
  amber:      '#b45309',
  amberSoft:  '#fef0d6',
  red:        '#b91c1c',
  redSoft:    '#fde2e2',
  white:      '#ffffff'
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
    const fixed = UNITS_WITHOUT_FIXED_COST.includes(row.unit) ? 0 : numberValue(row.fixedCost);
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
  return String(value ?? '').replace(/\u20b9/g, 'Rs.');
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

  const FIRST_PAGE_TOP = 124;
  const SUBSEQUENT_PAGE_TOP = 44;
  const contentBottom = 776;
  const width = doc.page.width - 72;

  function decoratePage() {
    pageNo += 1;
    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.page);

    if (pageNo === 1) {
      // Brand header band
      doc.rect(0, 0, doc.page.width, 102).fill(colors.accent);
      doc.rect(0, 102, doc.page.width, 4).fill(colors.accentDark);

      doc.fillColor('#ffffff').opacity(0.78).font('Helvetica-Bold').fontSize(7).text('CENTRE POINT HOSPITALITY', 36, 26, { characterSpacing: 1.2 });
      doc.opacity(1);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(isWeekly ? 'Weekly Flash Report' : 'Daily Flash Report', 36, 42);
      doc.fillColor('#ffffff').opacity(0.82).font('Helvetica').fontSize(8).text('Internal management report - Centre Point Group', 36, 72);
      doc.opacity(1);

      // Date pill on the right
      const dateLabel = isWeekly && week ? `${niceDate(week.start)} - ${niceDate(week.end)}` : niceDate(date);
      const pillWidth = Math.max(150, doc.widthOfString(dateLabel) + 28);
      const pillX = doc.page.width - 36 - pillWidth;
      doc.roundedRect(pillX, 36, pillWidth, 26, 13).fill('#ffffff').opacity(1);
      doc.fillColor(colors.accentDark).font('Helvetica-Bold').fontSize(6.5).text(isWeekly ? 'REPORT PERIOD' : 'REPORT DATE', pillX + 14, 41, { width: pillWidth - 28, characterSpacing: 0.9 });
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9.5).text(dateLabel, pillX + 14, 51, { width: pillWidth - 28, lineBreak: false });

      doc.fillColor('#ffffff').opacity(0.7).font('Helvetica').fontSize(6.5).text(`Generated ${new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}`, pillX, 75, { width: pillWidth, align: 'right' });
      doc.opacity(1);
    } else {
      // Slim header for subsequent pages
      doc.rect(0, 0, doc.page.width, 32).fill(colors.accentTint);
      doc.rect(0, 32, doc.page.width, 2).fill(colors.accent);
      doc.fillColor(colors.accentDark).font('Helvetica-Bold').fontSize(8).text(`Centre Point Hospitality | ${isWeekly ? 'Weekly' : 'Daily'} Flash Report`, 36, 12);
      const dateLabel = isWeekly && week ? `${niceDate(week.start)} - ${niceDate(week.end)}` : niceDate(date);
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(dateLabel, 36, 12, { width: width, align: 'right' });
    }

    // Footer
    doc.strokeColor(colors.line).lineWidth(0.5).moveTo(36, 790).lineTo(559, 790).stroke();
    doc.fillColor(colors.subtle).font('Helvetica').fontSize(6.5).text(`Centre Point Hospitality | ${isWeekly ? 'Weekly' : 'Daily'} Flash Report | Internal Use Only`, 36, 798, { lineBreak: false });
    doc.fillColor(colors.accentDark).font('Helvetica-Bold').fontSize(6.5).text(`Page ${pageNo}`, 36, 798, { width, align: 'right', lineBreak: false });
    doc.restore();
    doc.y = pageNo === 1 ? FIRST_PAGE_TOP : SUBSEQUENT_PAGE_TOP;
  }

  function ensureSpace(height) {
    if (doc.y + height > contentBottom) {
      doc.addPage();
      decoratePage();
    }
  }

  function tablePreviewHeight(rows = [], options = {}) {
    const rowHeight = options.rowHeight ?? 22;
    const headerHeight = options.headerHeight ?? rowHeight;
    return headerHeight + rowHeight * Math.min(rows.length, 1);
  }

  function sectionTitle(title, followingHeight = 0) {
    ensureSpace(26 + followingHeight);
    // Strip any old leading "1. " style labels before rendering.
    const displayTitle = String(title).replace(/^\s*\d+\.\s*/, '');

    const y = doc.y;
    doc.roundedRect(36, y, width, 22, 4).fill(colors.accentTint);
    doc.rect(36, y, 4, 22).fill(colors.accent);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(displayTitle), 50, y + 7, { width: width - 28, lineBreak: false });
    doc.y = y + 26;
  }

  function hero(title, source, value, change = '') {
    ensureSpace(38);
    const y = doc.y;
    // Dark unit title band
    doc.roundedRect(36, y, width, 34, 5).fill(colors.header);
    doc.rect(36, y, 4, 34).fill(colors.accent);
    // Title
    doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(12).text(safeText(title), 48, y + 7, { width: 200, lineBreak: false });
    // Source
    doc.fillColor(colors.white).opacity(0.72).font('Helvetica').fontSize(7.5).text(safeText(source), 48, y + 23, { width: 280, lineBreak: false });
    doc.opacity(1);
    // Value (right)
    doc.fillColor(colors.white).opacity(0.72).font('Helvetica-Bold').fontSize(6).text('REVENUE', 420, y + 6, { width: 127, align: 'right', characterSpacing: 1.2 });
    doc.opacity(1);
    doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(13).text(safeText(value), 420, y + 15, { width: 127, align: 'right', lineBreak: false });
    if (change) {
      doc.fillColor(change.startsWith('-') ? colors.red : colors.green).font('Helvetica-Bold').fontSize(7).text(safeText(change), 420, y + 30, { width: 127, align: 'right', lineBreak: false });
    }
    doc.y = y + 38;
  }

  function unitDivider() {
    ensureSpace(10);
    const y = doc.y;
    doc.strokeColor(colors.lineSoft).lineWidth(0.5).dash(2, { space: 3 }).moveTo(36, y + 3).lineTo(559, y + 3).stroke().undash();
    doc.y = y + 8;
  }

  function summaryCards(items) {
    ensureSpace(54);
    const y = doc.y;
    const gap = 8;
    const cardW = (width - gap * (items.length - 1)) / items.length;
    const cardH = 50;
    items.forEach((item, index) => {
      const x = 36 + index * (cardW + gap);
      // Card body
      doc.roundedRect(x, y, cardW, cardH, 6).fill(colors.white);
      doc.roundedRect(x, y, cardW, cardH, 6).strokeColor(colors.line).lineWidth(0.6).stroke();
      // Top accent stripe
      doc.rect(x, y, cardW, 3).fill(item.tone ?? colors.accent);
      // Label
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(6).text(safeText(item.label).toUpperCase(), x + 12, y + 11, { width: cardW - 24, characterSpacing: 1.1, lineBreak: false });
      // Value
      doc.fillColor(item.tone ?? colors.ink).font('Helvetica-Bold').fontSize(13).text(safeText(item.value), x + 12, y + 22, { width: cardW - 24, lineBreak: false });
      // Caption
      if (item.caption) {
        doc.fillColor(colors.subtle).font('Helvetica').fontSize(6.5).text(safeText(item.caption), x + 12, y + 39, { width: cardW - 24, lineBreak: false });
      }
    });
    doc.y = y + cardH + 12;
  }

  function table(columns, rows, options = {}) {
    if (!rows.length) return;
    const rowHeight = options.rowHeight ?? 22;
    const headerHeight = options.headerHeight ?? rowHeight;
    const colWidths = options.widths ?? columns.map(() => width / columns.length);
    const fontSize = options.fontSize ?? 7.5;
    const x = 36;

    ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 1));
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
    let firstRowOnPage = true;
    rows.forEach((row, rowIndex) => {
      if (y + rowHeight > contentBottom) {
        doc.y = y;
        doc.addPage();
        decoratePage();
        y = doc.y;
        drawHeader();
        firstRowOnPage = true;
      }

      doc.rect(x, y, width, rowHeight).fill(rowIndex % 2 ? colors.panel : colors.white);
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
      if (!firstRowOnPage) {
        doc.strokeColor(colors.line).lineWidth(0.25).moveTo(x, y).lineTo(x + width, y).stroke();
      }
      firstRowOnPage = false;
      y += rowHeight;
    });

    doc.strokeColor(colors.line).lineWidth(0.6).rect(x, doc.y, width, y - doc.y).stroke();
    doc.y = y + 6;
  }

  function flagCell(label) {
    const normalized = String(label).includes('ACTION') ? 'ACTION' : String(label);
    const color = normalized === 'ACTION' ? colors.red : normalized === 'WATCH' ? colors.amber : normalized === 'OUTPERFORM' ? colors.green : colors.headerSoft;
    return { text: normalized, color, bold: true };
  }

  function kpiTable(title, rows, includeYtd = true) {
    const actualColumn = isWeekly ? 'Week' : 'Today';
    const tableOptions = { widths: includeYtd ? [126, 70, 74, 74, 74, 105] : [145, 90, 86, 90, 112] };
    sectionTitle(title, tablePreviewHeight(rows, tableOptions));
    table(
      includeYtd ? ['KPI', actualColumn, 'AOP Target', 'MTD', 'YTD', 'Flag'] : ['KPI', actualColumn, 'AOP Target', 'MTD', 'Flag'],
      rows.map((row) => {
        const flag = calcFlag(row.actual, row.target, row.direction).label;
        const base = [row.name, formatValue(row.actual, row.name), formatValue(row.target, row.name), formatValue(row.mtd, row.name)];
        if (includeYtd) base.push(formatValue(row.ytd, row.name));
        base.push(flagCell(flag));
        return base;
      }),
      tableOptions
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
    const bankTableRows = [
      ...bankRows.map((row) => [row.unit, money(row.actual), money(row.fd), money(row.issued), money(row.hand), { text: money(row.net), color: colors.green, bold: true }]),
      [{ text: 'GROUP TOTAL', bold: true }, { text: money(bankTotals.actual), bold: true }, { text: money(bankTotals.fd), bold: true }, { text: money(bankTotals.issued), bold: true }, { text: money(bankTotals.hand), bold: true }, { text: money(bankTotals.net), bold: true, color: bankTotals.net >= 0 ? colors.green : colors.red }]
    ];
    const bankTableOptions = { widths: [126, 78, 62, 78, 78, 101], fontSize: 6.7 };
    sectionTitle('Bank Position - Daily Cash Summary', tablePreviewHeight(bankTableRows, bankTableOptions));
    sheetRef(SHEET_URLS.bankPosition);
    table(
      ['Unit', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheques in Hand', 'Net Available'],
      bankTableRows,
      bankTableOptions
    );
  }

  if (hasSection('pnl')) {
    const pnlTableRows = [
      ...pnl.map((row) => [row.unit, money(row.revenueToday), money(row.purchasesToday), money(row.grossProfit), percent(row.gpPercent), { text: money(row.netProfit), color: row.netProfit >= 0 ? colors.green : colors.red, bold: true }]),
      [{ text: 'GROUP TOTAL', bold: true }, { text: money(pnlTotals.revenue), bold: true }, { text: money(pnlTotals.purchases), bold: true }, { text: money(pnlTotals.gp), bold: true }, '', { text: money(pnlTotals.net), bold: true, color: pnlTotals.net >= 0 ? colors.green : colors.red }]
    ];
    const pnlTableOptions = { widths: [112, 88, 88, 88, 62, 85] };
    sectionTitle('Unit-wise Estimated P&L', tablePreviewHeight(pnlTableRows, pnlTableOptions));
    table(
      ['Unit', 'Revenue', 'Purchases', 'Gross Profit', 'GP%', 'Est. Net Profit'],
      pnlTableRows,
      pnlTableOptions
    );
  }

  if (hasSection('flags')) {
    const flags = collectFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').slice(0, 16);
    const flagTableRows = flags.map((row) => [row.unit, row.kpiName, formatValue(row.aopTarget, row.kpiName), formatValue(row.todayActual, row.kpiName), flagCell(row.flag), actionFor(row, { isWeekly })]);
    if (flagTableRows.length) {
      const flagTableOptions = { widths: [78, 120, 62, 62, 72, 129], leftColumns: [1, 5], fontSize: 7 };
      sectionTitle('Watch Out Flag Summary', tablePreviewHeight(flagTableRows, flagTableOptions));
      table(
        ['Unit', 'KPI', 'Target', isWeekly ? 'Week' : 'Today', 'Flag', 'Action Required'],
        flagTableRows,
        flagTableOptions
      );
    }
  }

  if (hasSection('hotels')) {
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
    hero('Rabbit', 'POS EOD Email | Delivery Platforms', money(revenueFor(rabbitsRows)), '');
    for (const section of [...new Set(rabbitsRows.map((row) => row.section))]) {
      kpiTable(`Rabbit - ${section}`, rabbitsRows.filter((row) => row.section === section), true);
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
    const skuTableRows = (data.purosoulSku ?? []).map((row) => {
      const rawCl = String(row.clStock ?? '').trim();
      const clStock = rawCl !== '' ? rawCl : String(numberValue(row.produced) - numberValue(row.dispatched));
      return [row.sku, row.produced || '-', row.dispatched || '-', clStock || '-', row.mtd || '-', row.ytd || '-'];
    });
    if (skuTableRows.length) {
      const skuTableOptions = { widths: [100, 80, 90, 90, 80, 83] };
      sectionTitle('Purosoul - SKU Production & Dispatch', tablePreviewHeight(skuTableRows, skuTableOptions));
      table(
        ['SKU', 'Produced', 'Dispatched', 'Closing Stock', 'MTD Dispatched', 'YTD'],
        skuTableRows,
        skuTableOptions
      );
    }
  }

  if (hasSection('settlement')) {
    const settlementRows = settlementModes.map((mode) => [mode, ...UNITS.map((unit) => money(data.settlement?.[mode]?.[unit])), { text: money(settlement.rowTotals[mode]), bold: true }]);
    const settlementOptions = { widths: [95, 50, 50, 50, 50, 50, 50, 50, 78], fontSize: 6.3, leftColumns: [0] };
    sectionTitle('Settlement', tablePreviewHeight(settlementRows, settlementOptions));
    table(
      ['Mode', ...UNITS, 'Group Total'],
      settlementRows,
      settlementOptions
    );
    sectionTitle('Reconciliation', 54);
    summaryCards([
      { label: 'Total Revenue', value: money(groupRevenue(data)), tone: colors.header },
      { label: 'Total Settled', value: money(settlement.groupTotal), tone: colors.green },
      { label: 'Difference', value: money(settlementDiff), tone: settlementDiff === 0 ? colors.green : colors.red },
      { label: 'Status', value: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', tone: settlementDiff === 0 ? colors.green : colors.red }
    ]);
    const reconciliationRows = [[money(groupRevenue(data)), money(settlement.groupTotal), { text: money(settlementDiff), color: settlementDiff === 0 ? colors.green : colors.red, bold: true }, { text: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', color: settlementDiff === 0 ? colors.green : colors.red, bold: true }]];
    const reconciliationOptions = { widths: [132, 132, 132, 127] };
    ensureSpace(tablePreviewHeight(reconciliationRows, reconciliationOptions));
    table(
      ['Total Revenue Today', 'Total Settled', 'Difference', 'Status'],
      reconciliationRows,
      reconciliationOptions
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
