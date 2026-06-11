import path from 'node:path';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily } from './dailyStore.js';

function num(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function round(v) {
  return String(Math.round(v * 100) / 100);
}

// Handles "2026-05-01T18:29:50.000Z" → "2026-05-01"
function parseDate(cell) {
  if (!cell) return null;
  const s = cell instanceof Date ? cell.toISOString() : String(cell);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

function isoDate(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function parseVisibleDate(cell) {
  if (!cell) return null;
  if (cell instanceof Date) {
    const d = new Date(cell.getTime() + (5.5 * 60 * 60 * 1000));
    return d.toISOString().slice(0, 10);
  }

  const s = String(cell).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return isoDate(year, Number(slash[2]), Number(slash[1]));
  }

  const namedMonth = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (namedMonth) {
    const month = MONTHS[namedMonth[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = Number(namedMonth[3].length === 2 ? `20${namedMonth[3]}` : namedMonth[3]);
    return isoDate(year, month, Number(namedMonth[1]));
  }

  return null;
}

async function readData(date) {
  return (await readDaily(date)) ?? buildSeedData();
}

function setKpi(rows, name, actual, mtd) {
  const row = rows?.find((r) => r.name === name);
  if (!row) return;
  if (actual !== undefined) row.actual = String(actual);
  if (mtd !== undefined) row.mtd = String(mtd);
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase();
}

function findColumn(header, names, fallback) {
  const normalizedNames = names.map(normalizeHeader);
  const idx = header.findIndex((cell) => normalizedNames.includes(normalizeHeader(cell)));
  return idx === -1 ? fallback : idx;
}

function parseInvoiceSheet(rows) {
  // Find header row (has "Date" / "DATE" / "date" in col[0])
  const headerIdx = rows.findIndex((r) => /^date$/i.test(String(r[0]).trim()));
  if (headerIdx === -1) throw new Error('No header row found (expected a row whose first cell is "Date")');

  const header = rows[headerIdx];
  const amountCol = findColumn(header, ['Sales', 'Sales A/c', 'Basic Value', 'Value'], -1);
  if (amountCol === -1) throw new Error('No invoice amount column found');
  const byDate = {};
  let grandTotal = null;

  for (const row of rows.slice(headerIdx + 1)) {
    // Grand Total row
    if (row.some((cell) => String(cell).trim() === 'Grand Total')) {
      grandTotal = num(row[amountCol]);
      continue;
    }

    const date = parseVisibleDate(row[0]);
    if (!date) continue;

    const value = num(row[amountCol]);
    byDate[date] = (byDate[date] || 0) + value;
  }

  const dates = Object.keys(byDate).sort();
  const latestDate = dates.at(-1);
  const mtd = grandTotal ?? Object.values(byDate).reduce((a, b) => a + b, 0);

  return { byDate, latestDate, mtd };
}

function getInvoiceRows(wb, preferredSheetNames, reportName, targetDate) {
  const errors = [];
  const sheetNames = [
    ...preferredSheetNames,
    ...wb.SheetNames.filter((name) => !preferredSheetNames.includes(name))
  ];
  let best = null;

  for (const sheetName of sheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      errors.push(`${sheetName}: sheet not found`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: false });
    try {
      const parsed = parseInvoiceSheet(rows);
      if (targetDate && Object.hasOwn(parsed.byDate, targetDate)) return { rows, sheetName, parsed };
      if ((targetDate || Object.keys(parsed.byDate).length) && !best) best = { rows, sheetName, parsed };
    } catch (err) {
      errors.push(`${sheetName}: ${err.message}`);
    }
  }

  if (targetDate && best) {
    return { ...best, noSaleDate: targetDate };
  }
  if (best) return best;
  throw new Error(`No invoice sheet found in ${reportName}. Tried: ${errors.join('; ')}`);
}

function buildMtdByDate(byDate) {
  // Running cumulative sum within each calendar month, keyed by date.
  // A multi-day Tally report that straddles a month boundary should reset MTD at month start.
  const dates = Object.keys(byDate).sort();
  const runningByMonth = {};
  const mtdByDate = {};
  for (const date of dates) {
    const month = date.slice(0, 7);
    runningByMonth[month] = (runningByMonth[month] ?? 0) + byDate[date];
    mtdByDate[date] = runningByMonth[month];
  }
  return mtdByDate;
}

async function writeInvoiceReport({ byDate, fileName, sheetName, kpiBucket, kpiRevenueName, pnlUnit, sourceKeyPrefix, notesByDate = {} }) {
  const mtdByDate = buildMtdByDate(byDate);
  const importedAt = new Date().toISOString();
  const written = [];

  for (const date of Object.keys(byDate).sort()) {
    const revenue = byDate[date];
    const mtdForDate = mtdByDate[date];
    const data = await readData(date);

    setKpi(data[kpiBucket], kpiRevenueName, round(revenue), round(mtdForDate));
    setKpi(data[kpiBucket], 'Revenue MTD',  round(mtdForDate), '');

    data.pnl = (data.pnl ?? []).map((r) =>
      r.unit === pnlUnit ? { ...r, revenueToday: round(revenue) } : r
    );
    data.importSource = {
      ...(data.importSource ?? {}),
      [`${sourceKeyPrefix}SalesFile`]: fileName,
      [`${sourceKeyPrefix}SalesSheet`]: sheetName,
      [`${sourceKeyPrefix}SalesDate`]: date,
      [`${sourceKeyPrefix}SalesImportedAt`]: importedAt,
    };
    if (notesByDate[date]) data.importSource[`${sourceKeyPrefix}SalesNotes`] = notesByDate[date];

    await writeDaily(date, data);
    written.push({ date, revenueToday: revenue, mtd: mtdForDate });
  }

  return written;
}

async function writeNoSaleReport({ date, fileName, sheetName, kpiBucket, kpiRevenueName, pnlUnit, sourceKeyPrefix }) {
  return writeInvoiceReport({
    byDate: { [date]: 0 },
    fileName,
    sheetName,
    kpiBucket,
    kpiRevenueName,
    pnlUnit,
    sourceKeyPrefix,
    notesByDate: { [date]: `Mail received for ${date}; no sale done on this date.` }
  });
}

// ─── Purosoul ────────────────────────────────────────────────────────────────

export async function importPurosoulSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });

  let invoiceRows;
  try {
    invoiceRows = getInvoiceRows(wb, ['Sales'], 'Purosoul report', targetDate);
  } catch (err) {
    if (!targetDate || !/^No invoice sheet found/.test(err.message)) throw err;
    const sheetName = wb.SheetNames[0] ?? 'Sales';
    const written = await writeNoSaleReport({
      date: targetDate,
      fileName,
      sheetName,
      kpiBucket: 'purosoul',
      kpiRevenueName: 'Total Revenue Today',
      pnlUnit: 'Purosoul',
      sourceKeyPrefix: 'purosoul'
    });
    return { ok: true, date: targetDate, sheetName, dates: written, grandTotal: 0, noSale: true };
  }

  const { sheetName, parsed, noSaleDate } = invoiceRows;
  const { latestDate, mtd: grandTotal, byDate } = parsed;
  if (!latestDate && !noSaleDate) throw new Error('No dated invoice rows found in Purosoul report');
  const writeByDate = noSaleDate ? { ...byDate, [noSaleDate]: 0 } : byDate;
  const notesByDate = noSaleDate ? { [noSaleDate]: `Mail received for ${noSaleDate}; no sale done on this date.` } : {};

  const written = await writeInvoiceReport({
    byDate: writeByDate, fileName, sheetName,
    kpiBucket: 'purosoul',
    kpiRevenueName: 'Total Revenue Today',
    pnlUnit: 'Purosoul',
    sourceKeyPrefix: 'purosoul',
    notesByDate
  });

  const focusDate = noSaleDate ?? (targetDate && Object.hasOwn(byDate, targetDate) ? targetDate : latestDate);
  return { ok: true, date: focusDate, sheetName, dates: written, grandTotal, noSale: Boolean(noSaleDate) };
}

// ─── Micky's ─────────────────────────────────────────────────────────────────

export async function importMickysSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });

  let invoiceRows;
  try {
    invoiceRows = getInvoiceRows(wb, ['Sheet1'], 'Micky\'s report', targetDate);
  } catch (err) {
    if (!targetDate || !/^No invoice sheet found/.test(err.message)) throw err;
    const sheetName = wb.SheetNames[0] ?? 'Sheet1';
    const written = await writeNoSaleReport({
      date: targetDate,
      fileName,
      sheetName,
      kpiBucket: 'mickys',
      kpiRevenueName: 'Order Revenue Today',
      pnlUnit: "Micky's",
      sourceKeyPrefix: 'mickys'
    });
    return { ok: true, date: targetDate, sheetName, dates: written, grandTotal: 0, noSale: true };
  }

  const { sheetName, parsed, noSaleDate } = invoiceRows;
  const { latestDate, mtd: grandTotal, byDate } = parsed;
  if (!latestDate && !noSaleDate) throw new Error('No dated invoice rows found in Micky\'s report');
  const writeByDate = noSaleDate ? { ...byDate, [noSaleDate]: 0 } : byDate;
  const notesByDate = noSaleDate ? { [noSaleDate]: `Mail received for ${noSaleDate}; no sale done on this date.` } : {};

  const written = await writeInvoiceReport({
    byDate: writeByDate, fileName, sheetName,
    kpiBucket: 'mickys',
    kpiRevenueName: 'Order Revenue Today',
    pnlUnit: "Micky's",
    sourceKeyPrefix: 'mickys',
    notesByDate
  });

  const focusDate = noSaleDate ?? (targetDate && Object.hasOwn(byDate, targetDate) ? targetDate : latestDate);
  return { ok: true, date: focusDate, sheetName, dates: written, grandTotal, noSale: Boolean(noSaleDate) };
}
