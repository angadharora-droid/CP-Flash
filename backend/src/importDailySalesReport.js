import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

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

async function readData(dataPath) {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; return buildSeedData(); }
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
  // Find header row (has "Date" in col[0])
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === 'Date');
  if (headerIdx === -1) throw new Error('No header row found');

  const header = rows[headerIdx];
  const amountCol = findColumn(header, ['Sales', 'Sales A/c', 'Basic Value', 'Value'], 9);
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

function getInvoiceRows(wb, preferredSheetNames, reportName) {
  const errors = [];
  for (const sheetName of preferredSheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      errors.push(`${sheetName}: sheet not found`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: false });
    try {
      parseInvoiceSheet(rows);
      return { rows, sheetName };
    } catch (err) {
      errors.push(`${sheetName}: ${err.message}`);
    }
  }

  throw new Error(`No invoice sheet found in ${reportName}. Tried: ${errors.join('; ')}`);
}

function pickSalesDate(byDate, targetDate, reportName) {
  if (!targetDate) return Object.keys(byDate).sort().at(-1);
  if (Object.hasOwn(byDate, targetDate)) return targetDate;
  const available = Object.keys(byDate).sort().join(', ');
  throw new Error(`${reportName} has no sales rows for ${targetDate}. Available dates: ${available}`);
}

// ─── Purosoul ────────────────────────────────────────────────────────────────

export async function importPurosoulSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });

  const { rows, sheetName } = getInvoiceRows(wb, ['Sales'], 'Purosoul report');
  const { latestDate, mtd, byDate } = parseInvoiceSheet(rows);
  if (!latestDate) throw new Error('No dated invoice rows found in Purosoul report');

  const salesDate = pickSalesDate(byDate, targetDate, 'Purosoul report');
  const revenueToday = byDate[salesDate];
  const fileDate = targetDate ?? salesDate;
  const dataPath = path.resolve(process.cwd(), 'data', `${fileDate}.json`);
  const data = await readData(dataPath);

  setKpi(data.purosoul, 'Total Revenue Today', round(revenueToday), round(mtd));
  setKpi(data.purosoul, 'Revenue MTD',         round(mtd),          '');

  data.pnl = (data.pnl ?? []).map((r) =>
    r.unit === 'Purosoul' ? { ...r, revenueToday: round(revenueToday) } : r
  );
  data.importSource = {
    ...(data.importSource ?? {}),
    purosoulSalesFile: fileName,
    purosoulSalesSheet: sheetName,
    purosoulSalesDate: salesDate,
    purosoulSalesImportedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: fileDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: fileDate, sheetName, salesDate, revenueToday, mtd };
}

// ─── Micky's ─────────────────────────────────────────────────────────────────

export async function importMickysSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });

  const { rows, sheetName } = getInvoiceRows(wb, ['Sheet1'], 'Micky\'s report');
  const { latestDate, mtd, byDate } = parseInvoiceSheet(rows);
  if (!latestDate) throw new Error('No dated invoice rows found in Micky\'s report');

  const salesDate = pickSalesDate(byDate, targetDate, 'Micky\'s report');
  const revenueToday = byDate[salesDate];
  const fileDate = targetDate ?? salesDate;
  const dataPath = path.resolve(process.cwd(), 'data', `${fileDate}.json`);
  const data = await readData(dataPath);

  setKpi(data.mickys, 'Order Revenue Today', round(revenueToday), round(mtd));
  setKpi(data.mickys, 'Revenue MTD',         round(mtd),          '');

  data.pnl = (data.pnl ?? []).map((r) =>
    r.unit === "Micky's" ? { ...r, revenueToday: round(revenueToday) } : r
  );
  data.importSource = {
    ...(data.importSource ?? {}),
    mickysSalesFile: fileName,
    mickysSalesSheet: sheetName,
    mickysSalesDate: salesDate,
    mickysSalesImportedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: fileDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: fileDate, sheetName, salesDate, revenueToday, mtd };
}
