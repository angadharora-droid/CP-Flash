import PDFDocument from 'pdfkit';
import { UNITS, settlementModes } from './schema.js';

const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

const UNIT_REVENUE_META = {
  'CP Nagpur': { title: 'Centre Point Nagpur', source: 'IDS (CP Nagpur)' },
  'CP NM': { title: 'Centre Point Navi Mumbai', source: 'Hotelogix (CP Navi Mumbai)' },
  Pablo: { title: 'Pablo', source: 'Petpooja (Pablo)' },
  Dali: { title: 'Dali', source: 'Petpooja (Dali)' },
  Rabbit: { title: 'Rabbit', source: 'Petpooja (Rabbit)' },
  "Micky's": { title: "Micky's", source: "Micky's Sales Report" },
  Purosoul: { title: 'Purosoul', source: 'Purosoul Sales Report' }
};

const HIDDEN_PUROSOUL_REVENUE_COST_ROWS = new Set(['RM Cost Today', 'RM Cost %', 'Revenue MTD', 'Purchase MTD']);

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

function moneyCompact(value) {
  const amount = numberValue(value);
  if (Math.abs(amount) >= 10000000) return `Rs. ${+(amount / 10000000).toFixed(2)} Cr`;
  if (Math.abs(amount) >= 100000) return `Rs. ${+(amount / 100000).toFixed(2)} L`;
  if (Math.abs(amount) >= 1000) return `Rs. ${+(amount / 1000).toFixed(2)} K`;
  return `Rs. ${Math.round(amount).toLocaleString('en-IN')}`;
}

function percent(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

function isMoneyKpi(name) {
  return /revenue|sales|purchase|cost|profit|pipeline|balance|cheque|revpar|bill/i.test(name);
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
  if (!targetValue) return { label: 'ON TRACK', ratio: 100 };
  const ratio = direction === 'max' ? (targetValue / Math.max(actualValue, 0.0001)) * 100 : (actualValue / targetValue) * 100;
  return { label: ratio >= 90 ? 'ON TRACK' : 'ACTION', ratio };
}

function aopTargetValue() {
  return 0;
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

function collectPdfKpis(data) {
  return [
    ...(data.hotels ?? []),
    ...Object.values(data.fnb ?? {}).flat(),
    ...(data.rabbits ?? []),
    ...(data.mickys ?? []),
    ...(data.purosoul ?? [])
  ];
}

function collectPdfFlags(data) {
  return collectPdfKpis(data).map((kpi) => {
    const target = aopTargetValue(kpi);
    const flag = calcFlag(kpi.actual, target, kpi.direction);
    return {
      unit: kpi.unit === 'Rabbit' + 's' ? 'Rabbit' : kpi.unit,
      kpiName: kpi.name,
      aopTarget: target,
      todayActual: kpi.actual,
      percentVsTarget: Math.round(flag.ratio),
      flag: flag.label
    };
  });
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
  const enabledSections = new Set(['bank', 'pnl', 'flags', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']);
  if (isWeekly) enabledSections.delete('bank');
  if (!isWeekly) enabledSections.delete('settlement');

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

  function sourceNotice(text) {
    if (!text) return;
    ensureSpace(18);
    const y = doc.y;
    doc.roundedRect(36, y, width, 16, 3).fill(colors.amberSoft);
    doc.fillColor(colors.amber).font('Helvetica-Bold').fontSize(7).text(safeText(text), 44, y + 5, { width: width - 16, lineBreak: false });
    doc.y = y + 20;
  }

  function manualSalesNote(prefix) {
    const importSource = data.importSource ?? {};
    const note = importSource[`${prefix}SalesNotes`];
    if (note) return note;
    return importSource[`${prefix}SalesImportedAt`] ? '' : 'Report not uploaded.';
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

  function barChart(title, subtitle, rows, options = {}) {
    const chartRows = rows.filter((row) => numberValue(row.value) > 0);
    if (!chartRows.length) return;
    const rowHeight = options.rowHeight ?? 18;
    const chartHeight = 44 + rowHeight * chartRows.length;
    ensureSpace(chartHeight);
    const y = doc.y;
    const x = 36;
    doc.roundedRect(x, y, width, chartHeight - 6, 8).fill(colors.white);
    doc.roundedRect(x, y, width, chartHeight - 6, 8).strokeColor(colors.line).lineWidth(0.6).stroke();
    doc.rect(x, y, 4, 34).fill(options.accent ?? colors.accent);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(title), x + 14, y + 11, { width: width - 28, lineBreak: false });
    if (subtitle) doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(safeText(subtitle), x + 14, y + 24, { width: width - 28, lineBreak: false });

    const max = Math.max(...chartRows.map((row) => numberValue(row.value)), 1);
    let cy = y + 44;
    chartRows.forEach((row, index) => {
      const labelW = 104;
      const valueW = 76;
      const barX = x + 18 + labelW;
      const barW = width - 36 - labelW - valueW;
      const filled = Math.max(2, (numberValue(row.value) / max) * barW);
      const color = row.color ?? [colors.accent, '#6f3d74', '#9a5a00', '#0f9487', colors.red, '#3f6fb5'][index % 6];
      doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(7).text(safeText(row.name), x + 18, cy + 3, { width: labelW - 8, lineBreak: false });
      doc.roundedRect(barX, cy + 3, barW, 8, 4).fill(colors.panelAlt);
      doc.roundedRect(barX, cy + 3, filled, 8, 4).fill(color);
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(7).text(safeText(row.label ?? money(row.value)), barX + barW + 8, cy + 1, { width: valueW - 10, align: 'right', lineBreak: false });
      cy += rowHeight;
    });
    doc.y = y + chartHeight;
  }

  const CHART_PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a', '#3f6fb5', '#b5447a'];

  function normalizedDonutRows(entries) {
    return entries.filter((e) => numberValue(e.value) > 0).sort((a, b) => b.value - a.value);
  }

  function donutChart(title, subtitle, entries, chartOptions = {}) {
    const chartRows = normalizedDonutRows(entries);
    if (!chartRows.length) return;
    const total = chartRows.reduce((sum, e) => sum + numberValue(e.value), 0);
    const CARD_H = Math.max(188, 44 + chartRows.length * 20 + 10);
    ensureSpace(CARD_H + 6);
    const y = doc.y;
    const x = 36;
    const outerR = 60;
    const innerR = 36;
    const cx = x + 120;
    const cy = y + 44 + outerR;

    doc.roundedRect(x, y, width, CARD_H, 8).fill(colors.white);
    doc.roundedRect(x, y, width, CARD_H, 8).strokeColor(colors.line).lineWidth(0.6).stroke();
    doc.rect(x, y, 4, 36).fill(chartOptions.accent ?? colors.accent);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(title), x + 14, y + 10, { width: width - 28, lineBreak: false });
    if (subtitle) {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(safeText(subtitle), x + 14, y + 24, { width: width - 28, lineBreak: false });
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    let startAngle = -90;
    chartRows.forEach((row, i) => {
      const sliceAngle = (numberValue(row.value) / total) * 358;
      const endAngle = startAngle + sliceAngle;
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const x1 = cx + outerR * Math.cos(toRad(startAngle));
      const y1 = cy + outerR * Math.sin(toRad(startAngle));
      const x2 = cx + outerR * Math.cos(toRad(endAngle));
      const y2 = cy + outerR * Math.sin(toRad(endAngle));
      const x3 = cx + innerR * Math.cos(toRad(endAngle));
      const y3 = cy + innerR * Math.sin(toRad(endAngle));
      const x4 = cx + innerR * Math.cos(toRad(startAngle));
      const y4 = cy + innerR * Math.sin(toRad(startAngle));
      const largeArc = sliceAngle > 180 ? 1 : 0;
      const pathD = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
      doc.path(pathD).fill(color);
      startAngle = endAngle + 1;
    });

    doc.fillColor(colors.subtle).font('Helvetica-Bold').fontSize(6).text('TOTAL', cx - 26, cy - 14, { width: 52, align: 'center', characterSpacing: 1, lineBreak: false });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(moneyCompact(total)), cx - 32, cy - 4, { width: 64, align: 'center', lineBreak: false });

    const legendX = cx + outerR + 20;
    const legendW = x + width - legendX - 4;
    chartRows.forEach((row, i) => {
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const share = total ? Math.round((numberValue(row.value) / total) * 100) : 0;
      const ly = y + 44 + i * 20;
      doc.circle(legendX + 5, ly + 6, 3.5).fill(color);
      doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(safeText(row.name), legendX + 13, ly + 1, { width: legendW - 82, lineBreak: false });
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(8).text(safeText(moneyCompact(row.value)), legendX + legendW - 78, ly + 1, { width: 52, align: 'right', lineBreak: false });
      doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(`${share}%`, legendX + legendW - 22, ly + 1, { width: 24, align: 'right', lineBreak: false });
    });

    doc.y = y + CARD_H + 6;
  }

  function compactDonutCardHeight(entries) {
    const chartRows = normalizedDonutRows(entries);
    return Math.max(166, 50 + chartRows.length * 16);
  }

  function drawCompactDonutCard(title, subtitle, entries, x, y, cardW, cardH, chartOptions = {}) {
    const chartRows = normalizedDonutRows(entries);
    if (!chartRows.length) return;
    const total = chartRows.reduce((sum, e) => sum + numberValue(e.value), 0);
    const outerR = 42;
    const innerR = 25;
    const cx = x + 62;
    const cy = y + 50 + outerR;

    doc.roundedRect(x, y, cardW, cardH, 7).fill(colors.white);
    doc.roundedRect(x, y, cardW, cardH, 7).strokeColor(colors.line).lineWidth(0.6).stroke();
    doc.rect(x, y, 4, 32).fill(chartOptions.accent ?? colors.accent);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(8.5).text(safeText(title), x + 12, y + 10, { width: cardW - 24, lineBreak: false });
    if (subtitle) {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(5.8).text(safeText(subtitle), x + 12, y + 23, { width: cardW - 24, lineBreak: false });
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    let startAngle = -90;
    chartRows.forEach((row, i) => {
      const sliceAngle = (numberValue(row.value) / total) * 358;
      const endAngle = startAngle + sliceAngle;
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const x1 = cx + outerR * Math.cos(toRad(startAngle));
      const y1 = cy + outerR * Math.sin(toRad(startAngle));
      const x2 = cx + outerR * Math.cos(toRad(endAngle));
      const y2 = cy + outerR * Math.sin(toRad(endAngle));
      const x3 = cx + innerR * Math.cos(toRad(endAngle));
      const y3 = cy + innerR * Math.sin(toRad(endAngle));
      const x4 = cx + innerR * Math.cos(toRad(startAngle));
      const y4 = cy + innerR * Math.sin(toRad(startAngle));
      const largeArc = sliceAngle > 180 ? 1 : 0;
      const pathD = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
      doc.path(pathD).fill(color);
      startAngle = endAngle + 1;
    });

    doc.fillColor(colors.subtle).font('Helvetica-Bold').fontSize(5.3).text('TOTAL', cx - 22, cy - 13, { width: 44, align: 'center', characterSpacing: 0.6, lineBreak: false });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(7.5).text(safeText(moneyCompact(total)), cx - 28, cy - 3, { width: 56, align: 'center', lineBreak: false });

    const legendX = x + 122;
    const legendW = x + cardW - legendX - 8;
    chartRows.forEach((row, i) => {
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const share = total ? Math.round((numberValue(row.value) / total) * 100) : 0;
      const ly = y + 48 + i * 16;
      doc.circle(legendX + 4, ly + 5, 3).fill(color);
      doc.fillColor(colors.muted).font('Helvetica').fontSize(5.9).text(safeText(row.name), legendX + 10, ly, { width: legendW - 54, lineBreak: false });
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(5.9).text(safeText(moneyCompact(row.value)), legendX + legendW - 50, ly, { width: 34, align: 'right', lineBreak: false });
      doc.fillColor(color).font('Helvetica-Bold').fontSize(5.9).text(`${share}%`, legendX + legendW - 14, ly, { width: 16, align: 'right', lineBreak: false });
    });
  }

  function donutChartPair(left, right) {
    const leftRows = normalizedDonutRows(left.entries ?? []);
    const rightRows = normalizedDonutRows(right.entries ?? []);
    if (!leftRows.length && !rightRows.length) return;
    if (!leftRows.length) {
      donutChart(right.title, right.subtitle, rightRows, right.options);
      return;
    }
    if (!rightRows.length) {
      donutChart(left.title, left.subtitle, leftRows, left.options);
      return;
    }

    const gap = 8;
    const cardW = (width - gap) / 2;
    const cardH = Math.max(compactDonutCardHeight(leftRows), compactDonutCardHeight(rightRows));
    ensureSpace(cardH + 8);
    const y = doc.y;
    drawCompactDonutCard(left.title, left.subtitle, leftRows, 36, y, cardW, cardH, left.options);
    drawCompactDonutCard(right.title, right.subtitle, rightRows, 36 + cardW + gap, y, cardW, cardH, right.options);
    doc.y = y + cardH + 8;
  }

  function columnChart(title, subtitle, entries, chartOptions = {}) {
    const chartRows = entries.filter((e) => numberValue(e.value) > 0).sort((a, b) => b.value - a.value);
    if (!chartRows.length) return;
    const total = chartRows.reduce((sum, e) => sum + numberValue(e.value), 0);
    const maxVal = Math.max(...chartRows.map((e) => numberValue(e.value)));
    const scaleMax = maxVal * 1.18;
    const CARD_H = 280;
    ensureSpace(CARD_H + 10);
    const y = doc.y;
    const x = 36;
    const leftPad = 60;
    const rightPad = 8;
    const chartX = x + leftPad;
    const chartY = y + 48;
    const chartW = width - leftPad - rightPad;
    const chartH = 168;
    const bottomY = chartY + chartH;

    doc.roundedRect(x, y, width, CARD_H, 8).fill(colors.white);
    doc.roundedRect(x, y, width, CARD_H, 8).strokeColor(colors.line).lineWidth(0.6).stroke();
    doc.rect(x, y, 4, 36).fill(chartOptions.accent ?? colors.accent);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(10).text(safeText(title), x + 14, y + 10, { width: width - 28, lineBreak: false });
    if (subtitle) {
      doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(safeText(subtitle), x + 14, y + 24, { width: width - 28, lineBreak: false });
    }

    // Gridlines and Y-axis labels
    const gridCount = 4;
    for (let gi = 0; gi <= gridCount; gi++) {
      const lineY = bottomY - (chartH / gridCount) * gi;
      const lineVal = (scaleMax / gridCount) * gi;
      doc.strokeColor(colors.lineSoft).lineWidth(0.4).dash(3, { space: 3 }).moveTo(chartX, lineY).lineTo(chartX + chartW, lineY).stroke().undash();
      doc.fillColor(colors.subtle).font('Helvetica').fontSize(6.5).text(safeText(moneyCompact(lineVal)), x + 4, lineY - 4, { width: leftPad - 8, align: 'right', lineBreak: false });
    }

    // Bars
    const n = chartRows.length;
    const barGroupW = chartW / n;
    const barW = Math.min(58, barGroupW * 0.54);
    const r = 4;

    chartRows.forEach((row, i) => {
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const value = numberValue(row.value);
      const barH = scaleMax > 0 ? (value / scaleMax) * chartH : 0;
      const bx = chartX + i * barGroupW + (barGroupW - barW) / 2;
      const bty = bottomY - barH;

      if (barH > r * 2) {
        // Rounded top, square bottom
        doc.roundedRect(bx, bty, barW, barH, r).fill(color);
        doc.rect(bx, bottomY - r, barW, r).fill(color);
      } else if (barH > 0) {
        doc.rect(bx, bty, barW, barH).fill(color);
      }

      // Value label above bar
      doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(7).text(
        safeText(moneyCompact(value)), bx - 10, bty - 12, { width: barW + 20, align: 'center', lineBreak: false }
      );

      // X-axis name
      doc.fillColor(colors.muted).font('Helvetica').fontSize(7).text(
        safeText(row.name), bx - 10, bottomY + 5, { width: barW + 20, align: 'center', lineBreak: false }
      );
    });

    // Share pills
    const pillsY = bottomY + 24;
    const pillW = Math.floor(chartW / chartRows.length) - 6;
    chartRows.forEach((row, i) => {
      const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
      const share = total ? Math.round((numberValue(row.value) / total) * 100) : 0;
      const px = chartX + i * (pillW + 6);
      doc.roundedRect(px, pillsY, pillW, 14, 7).fill(`${color}18`);
      doc.roundedRect(px, pillsY, pillW, 14, 7).strokeColor(`${color}50`).lineWidth(0.4).stroke();
      doc.fillColor(color).font('Helvetica-Bold').fontSize(6.5).text(
        safeText(`${row.name}  ${share}%`), px + 4, pillsY + 3, { width: pillW - 8, align: 'center', lineBreak: false }
      );
    });

    doc.y = y + CARD_H + 6;
  }

  function revenueShareChart(dataRows, title, subtitle) {
    const entries = dataRows
      .map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
      .filter((e) => e.value > 0);
    donutChart(title, subtitle, entries, { accent: colors.accent });
  }

  function flagCell(label) {
    const normalized = String(label).includes('ACTION') ? 'ACTION' : String(label);
    const color = normalized === 'ACTION' ? colors.red : colors.headerSoft;
    return { text: normalized, color, bold: true };
  }

  function kpiTable(title, rows, options = {}) {
    const actualColumn = isWeekly ? 'Week' : 'Today';
    const visibleRows = rows.filter((row) => !/\bytd\b|year\s*to\s*date/i.test(row?.name ?? ''));
    const tableOptions = { widths: [145, 90, 86, 90, 112] };
    sectionTitle(title, (options.note ? 20 : 0) + tablePreviewHeight(visibleRows, tableOptions));
    sourceNotice(options.note);
    table(
      ['KPI', actualColumn, 'AOP Target', 'MTD', 'Flag'],
      visibleRows.map((row) => {
        const target = aopTargetValue(row);
        const flag = calcFlag(row.actual, target, row.direction).label;
        return [row.name, formatValue(row.actual, row.name), formatValue(target, row.name), formatValue(row.mtd, row.name), flagCell(flag)];
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

  function mailStatusCard(title, importedAt, revenue) {
    const noMail = !importedAt;
    const noSales = !noMail && numberValue(revenue) === 0;
    // mail received AND has sales → no card needed, show tables normally
    if (!noMail && !noSales) return false;
    ensureSpace(62);
    const y = doc.y;
    const x = 36;
    const H = 56;
    const accentColor = noMail ? colors.red : colors.amber;
    const message = noMail
      ? 'Report not uploaded — daily sales email not received'
      : 'Mail received — no sales recorded for this date';
    doc.roundedRect(x, y, width, H, 6).fill(noMail ? colors.redSoft : colors.amberSoft);
    doc.roundedRect(x, y, width, H, 6).strokeColor(accentColor).lineWidth(0.5).stroke();
    doc.rect(x, y, 4, H).fill(accentColor);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(9).text(safeText(title), x + 14, y + 10, { width: width - 28, lineBreak: false });
    doc.fillColor(accentColor).font('Helvetica-Bold').fontSize(8).text(safeText(message), x + 14, y + 28, { width: width - 28, lineBreak: false });
    doc.y = y + H + 6;
    return true;
  }

  decoratePage();

  // ── Shared data ──────────────────────────────────────────────────────────────
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
    acc.actual += row.actual; acc.fd += row.fd; acc.issued += row.issued;
    acc.hand += row.hand; acc.net += row.net; return acc;
  }, { actual: 0, fd: 0, issued: 0, hand: 0, net: 0 });
  const pnl = pnlRows(data);
  const pnlTotals = pnl.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday); acc.purchases += numberValue(row.purchasesToday);
    acc.gp += row.grossProfit; acc.net += row.netProfit; return acc;
  }, { revenue: 0, purchases: 0, gp: 0, net: 0 });
  const settlement = settlementTotals(data);
  const settlementDiff = groupRevenue(data) - settlement.groupTotal;

  // ── Helper: render P&L table ─────────────────────────────────────────────────
  function renderPnlTable() {
    const pnlTableRows = [
      ...pnl.map((row) => [row.unit, money(row.revenueToday), money(row.purchasesToday), money(row.grossProfit), percent(row.gpPercent), { text: money(row.netProfit), color: row.netProfit >= 0 ? colors.green : colors.red, bold: true }]),
      [{ text: 'GROUP TOTAL', bold: true }, { text: money(pnlTotals.revenue), bold: true }, { text: money(pnlTotals.purchases), bold: true }, { text: money(pnlTotals.gp), bold: true }, '', { text: money(pnlTotals.net), bold: true, color: pnlTotals.net >= 0 ? colors.green : colors.red }]
    ];
    const pnlTableOptions = { widths: [112, 88, 88, 88, 62, 85] };
    sectionTitle('Unit-wise Estimated P&L', tablePreviewHeight(pnlTableRows, pnlTableOptions));
    table(['Unit', isWeekly ? 'Revenue WTD' : 'Revenue', 'Purchases', 'Gross Profit', 'GP%', 'Est. Net Profit'], pnlTableRows, pnlTableOptions);
  }

  // ── Helper: render flags table ───────────────────────────────────────────────
  function renderUnitRevenueSummary() {
    sectionTitle('Unit Revenue Summary', 26 + UNITS.length * 38);
    for (const unit of UNITS) {
      const row = pnl.find((item) => item.unit === unit);
      const meta = UNIT_REVENUE_META[unit] ?? { title: unit, source: unit };
      hero(meta.title, meta.source, money(row?.revenueToday));
    }
  }

  function renderFlags() {
    const flags = collectPdfFlags(data).filter((row) => row.flag === 'ACTION').slice(0, 16);
    const flagTableRows = flags.map((row) => [row.unit, row.kpiName, formatValue(aopTargetValue(row), row.kpiName), formatValue(row.todayActual, row.kpiName), flagCell(row.flag), '']);
    if (!flagTableRows.length) return;
    const flagTableOptions = { widths: [78, 120, 62, 62, 72, 129], leftColumns: [1, 5], fontSize: 7 };
    sectionTitle('Action Flag Summary', tablePreviewHeight(flagTableRows, flagTableOptions));
    table(['Unit', 'KPI', 'Target', isWeekly ? 'Week' : 'Today', 'Flag', 'Action Required'], flagTableRows, flagTableOptions);
  }

  // ── Helper: render hotel section for a unit ──────────────────────────────────
  function renderHotelSections(unit, sectionNames) {
    const label = unit === 'CP NM' ? 'CP Navi Mumbai' : unit;
    const hotelRows = data.hotels ?? [];
    for (const section of sectionNames) {
      const rows = hotelRows.filter((row) => row.unit === unit && row.section === section);
      if (rows.length) kpiTable(`${label} - ${section}`, rows);
    }
  }

  // ── Helper: render F&B outlet column chart ───────────────────────────────────
  function renderFnbOutletChart() {
    const outletRows = fnbOutletRows(data);
    if (outletRows.filter((e) => e.value > 0).length) {
      columnChart('F&B Outlet Sales', isWeekly ? 'Week-to-date outlet revenue' : 'Today outlet revenue', outletRows);
    }
  }

  // ── Helper: render SKU table ─────────────────────────────────────────────────
  function renderSkuTable() {
    const skuTableRows = (data.purosoulSku ?? []).map((row) => {
      const rawCl = String(row.clStock ?? '').trim();
      const clStock = rawCl !== '' ? rawCl : String(numberValue(row.produced) - numberValue(row.dispatched));
      return [row.sku, row.produced || '-', row.dispatched || '-', clStock || '-', row.mtd || '-'];
    });
    if (!skuTableRows.length) return;
    const skuOpts = { widths: [112, 94, 108, 108, 101] };
    sectionTitle('Purosoul - SKU Production & Dispatch', tablePreviewHeight(skuTableRows, skuOpts));
    table(['SKU', 'Produced', 'Dispatched', 'Closing Stock', 'MTD Dispatched'], skuTableRows, skuOpts);
  }

  // ── Helper: render settlement ────────────────────────────────────────────────
  function renderSettlement() {
    const settlementRows = settlementModes.map((mode) => [mode, ...UNITS.map((unit) => money(data.settlement?.[mode]?.[unit])), { text: money(settlement.rowTotals[mode]), bold: true }]);
    const settlementOptions = { widths: [95, 50, 50, 50, 50, 50, 50, 50, 78], fontSize: 6.3, leftColumns: [0] };
    sectionTitle('Settlement Summary', tablePreviewHeight(settlementRows, settlementOptions));
    table(['Mode', ...UNITS, 'Group Total'], settlementRows, settlementOptions);
    sectionTitle('Reconciliation', 54);
    summaryCards([
      { label: 'Total Revenue', value: money(groupRevenue(data)), tone: colors.header },
      { label: 'Total Settled', value: money(settlement.groupTotal), tone: colors.green },
      { label: 'Difference', value: money(settlementDiff), tone: settlementDiff === 0 ? colors.green : colors.red },
      { label: 'Status', value: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', tone: settlementDiff === 0 ? colors.green : colors.red }
    ]);
    const recRows = [[money(groupRevenue(data)), money(settlement.groupTotal), { text: money(settlementDiff), color: settlementDiff === 0 ? colors.green : colors.red, bold: true }, { text: settlementDiff === 0 ? 'MATCHED' : 'MISMATCH', color: settlementDiff === 0 ? colors.green : colors.red, bold: true }]];
    const recOpts = { widths: [132, 132, 132, 127] };
    ensureSpace(tablePreviewHeight(recRows, recOpts));
    table(['Total Revenue', 'Total Settled', 'Difference', 'Status'], recRows, recOpts);
  }

  if (!isWeekly) {
    // ════════════════════════════════════════════════════════════
    // DAILY — matches dashboard daily tab order
    // ════════════════════════════════════════════════════════════

    // 1. Bank Position
    if (hasSection('bank')) {
      const bankTableRows = [
        ...bankRows.map((row) => [row.unit, money(row.actual), money(row.fd), money(row.issued), money(row.hand), { text: money(row.net), color: colors.green, bold: true }]),
        [{ text: 'GROUP TOTAL', bold: true }, { text: money(bankTotals.actual), bold: true }, { text: money(bankTotals.fd), bold: true }, { text: money(bankTotals.issued), bold: true }, { text: money(bankTotals.hand), bold: true }, { text: money(bankTotals.net), bold: true, color: bankTotals.net >= 0 ? colors.green : colors.red }]
      ];
      const bankTableOptions = { widths: [126, 78, 62, 78, 78, 101], fontSize: 6.7 };
      sectionTitle('Bank Position - Daily Cash Summary', tablePreviewHeight(bankTableRows, bankTableOptions));
      table(['Unit', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheques in Hand', 'Net Available'], bankTableRows, bankTableOptions);
    }

    // 2. P&L table
    if (hasSection('pnl')) renderUnitRevenueSummary();
    if (hasSection('pnl')) renderPnlTable();

    // 3. Unit-wise Revenue Share donut
    if (hasSection('pnl')) revenueShareChart(pnl, 'Unit-wise Revenue Share', 'P&L revenue contribution by unit - today');

    // 4. CP Nagpur: Room Revenue & Occupancy → Forecast → Banquets → Banquet Function Lists
    if (hasSection('hotels')) {
      renderHotelSections('CP Nagpur', ['Room Revenue & Occupancy', 'Forecast', 'Banquets']);
      for (const list of [
        { title: 'CP Nagpur - Banquet Function List Today', rows: data.banquetToday ?? [] },
        { title: 'CP Nagpur - Banquet Function List Tomorrow', rows: data.banquetTomorrow ?? [] }
      ]) {
        const banqRows = list.rows.map((row) => [
          String(row.marketSegment ?? '-'),
          String(row.pax ?? '-'),
          String(row.venue ?? '-'),
          String(row.session ?? '-'),
          row.revenue ? money(row.revenue) : '-',
          String(row.notes ?? '-')
        ]);
        const banqOpts = { widths: [110, 40, 90, 70, 80, 133], fontSize: 7, leftColumns: [0, 2, 3, 5] };
        sectionTitle(list.title, tablePreviewHeight(banqRows, banqOpts));
        if (banqRows.length) {
          table(['Party / Client', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes'], banqRows, banqOpts);
        }
      }
    }

    // 5. CP NM: Room Revenue & Occupancy → Forecast
    if (hasSection('hotels')) renderHotelSections('CP NM', ['Room Revenue & Occupancy', 'Forecast']);

    // 6. F&B Outlet Sales column chart
    if (hasSection('fnb')) renderFnbOutletChart();

    // 7. Micky's: Leads Pipeline always shows when mail received; amber notice on Orders & Revenue if no sales
    if (hasSection('mickys')) {
      const mickysRows = data.mickys ?? [];
      const mickysImportedAt = data.importSource?.mickysSalesImportedAt;
      if (!mickysImportedAt) {
        mailStatusCard("Micky's by CP Foods", null, 0);
      } else {
        const leadsRows = mickysRows.filter((row) => row.section === 'Leads Pipeline');
        if (leadsRows.length) kpiTable("Micky's - Leads Pipeline", leadsRows);
        const orderRows = mickysRows.filter((row) => row.section === 'Orders & Revenue');
        const orderRevenue = numberValue(revenueFor(orderRows));
        if (orderRevenue > 0) {
          if (orderRows.length) kpiTable("Micky's - Orders & Revenue", orderRows);
        } else {
          mailStatusCard("Micky's - Orders & Revenue", null, 0);
        }
      }
    }

    // 8. Purosoul sections + SKU
    if (hasSection('purosoul')) {
      const purosoulRows = data.purosoul ?? [];
      const purosoulImportedAt = data.importSource?.purosoulSalesImportedAt;
      const purosoulRevenue = revenueFor(purosoulRows);
      if (purosoulImportedAt && numberValue(purosoulRevenue) > 0) {
        for (const section of [...new Set(purosoulRows.map((row) => row.section))]) {
          const rows = purosoulRows.filter((row) => (
            row.section === section
            && !(section === 'Revenue & Cost' && HIDDEN_PUROSOUL_REVENUE_COST_ROWS.has(row.name))
          ));
          if (rows.length) kpiTable(`Purosoul - ${section}`, rows);
        }
        renderSkuTable();
      } else {
        mailStatusCard('Purosoul', null, 0);
      }
    }

  } else {
    // ════════════════════════════════════════════════════════════
    // WEEKLY — matches dashboard weekly tab order
    // ════════════════════════════════════════════════════════════

    // 1. P&L table
    if (hasSection('pnl')) renderUnitRevenueSummary();
    if (hasSection('pnl')) renderPnlTable();

    // 2. Action Flag Summary
    if (hasSection('flags')) renderFlags();

    // 3. Unit-wise Revenue Share donut
    if (hasSection('pnl')) revenueShareChart(pnl, 'Unit-wise Revenue Share', 'P&L revenue contribution by unit - week to date');

    // 4. CP Nagpur: Room Revenue & Occupancy → F&B Outlets → Banquets → SOB → MS
    if (hasSection('hotels')) {
      renderHotelSections('CP Nagpur', ['Room Revenue & Occupancy', 'F&B Outlets', 'Banquets']);
      const cpnMix = week?.occupancyMix?.['CP Nagpur'];
      if (cpnMix) {
        const sobRows = (cpnMix.sbo ?? []).map((r) => ({ name: r.name, value: r.revenue })).filter((r) => r.value > 0);
        const msRows  = (cpnMix.segment ?? []).map((r) => ({ name: r.name, value: r.revenue })).filter((r) => r.value > 0);
        donutChartPair(
          { title: 'CP Nagpur: Source of Business', subtitle: 'Week-to-date room source mix', entries: sobRows },
          { title: 'CP Nagpur: Market Segment', subtitle: 'Week-to-date room segment mix', entries: msRows }
        );
      }
    }

    // 5. CP NM: Room Revenue & Occupancy → SOB → MS
    if (hasSection('hotels')) {
      renderHotelSections('CP NM', ['Room Revenue & Occupancy']);
      const cpNmMix = week?.occupancyMix?.['CP NM'];
      if (cpNmMix) {
        const sobRows = (cpNmMix.sbo ?? []).map((r) => ({ name: r.name, value: r.revenue })).filter((r) => r.value > 0);
        const msRows  = (cpNmMix.segment ?? []).map((r) => ({ name: r.name, value: r.revenue })).filter((r) => r.value > 0);
        donutChartPair(
          { title: 'CP NM: Source of Business', subtitle: 'Week-to-date room source mix', entries: sobRows },
          { title: 'CP NM: Market Segment', subtitle: 'Week-to-date room segment mix', entries: msRows }
        );
      }
    }

    // 6. F&B Outlet Sales column chart
    if (hasSection('fnb')) renderFnbOutletChart();

    // 7. Pablo sections
    if (hasSection('fnb')) {
      const pabloRows = data.fnb?.Pablo ?? [];
      for (const section of [...new Set(pabloRows.map((row) => row.section))]) {
        kpiTable(`Pablo - ${section}`, pabloRows.filter((row) => row.section === section));
      }
    }

    // 8. Dali sections
    if (hasSection('fnb')) {
      const daliRows = data.fnb?.Dali ?? [];
      for (const section of [...new Set(daliRows.map((row) => row.section))]) {
        kpiTable(`Dali - ${section}`, daliRows.filter((row) => row.section === section));
      }
    }

    // 9. Rabbit sections (excluding Cost — matches dashboard filter)
    if (hasSection('rabbits')) {
      const rabbitRows = (data.rabbits ?? []).filter((row) => row.section !== 'Cost');
      for (const section of [...new Set(rabbitRows.map((row) => row.section))]) {
        kpiTable(`Rabbit - ${section}`, rabbitRows.filter((row) => row.section === section));
      }
    }

    // 10. Micky's sections
    if (hasSection('mickys')) {
      const mickysRows = data.mickys ?? [];
      for (const section of [...new Set(mickysRows.map((row) => row.section))]) {
        kpiTable(`Micky's - ${section}`, mickysRows.filter((row) => row.section === section));
      }
    }

    // 11. Purosoul sections + SKU
    if (hasSection('purosoul')) {
      const purosoulRows = data.purosoul ?? [];
      for (const section of [...new Set(purosoulRows.map((row) => row.section))]) {
        const rows = purosoulRows.filter((row) => (
          row.section === section
          && !(section === 'Revenue & Cost' && HIDDEN_PUROSOUL_REVENUE_COST_ROWS.has(row.name))
        ));
        if (rows.length) kpiTable(`Purosoul - ${section}`, rows);
      }
      renderSkuTable();
    }

    // 12. Settlement Summary
    if (hasSection('settlement')) renderSettlement();
  }

  return doc;
}

function revenueFor(rows) {
  const revenueRow = rows.find((row) => /total revenue|gross sales|order revenue|revenue today/i.test(row.name));
  return revenueRow?.actual ?? 0;
}

function fnbOutletRows(data) {
  const configs = [
    { name: 'High Steaks', rows: data.hotels ?? [], kpi: 'High Steaks Revenue', color: colors.accent },
    { name: 'Meeting Point', rows: data.hotels ?? [], kpi: 'Meeting Point Revenue', color: '#6f3d74' },
    { name: 'Dali', rows: data.fnb?.Dali ?? [], kpi: 'Gross Sales', color: '#9a5a00' },
    { name: 'Pablo', rows: data.fnb?.Pablo ?? [], kpi: 'Gross Sales', color: '#0f9487' },
    { name: 'Freakk', rows: data.hotels ?? [], kpi: 'Freakk Revenue', color: colors.red }
  ];
  return configs.map((config) => ({
    name: config.name,
    color: config.color,
    value: config.rows
      .filter((row) => row.name === config.kpi)
      .reduce((sum, row) => sum + numberValue(row.actual), 0)
  })).sort((a, b) => b.value - a.value);
}
