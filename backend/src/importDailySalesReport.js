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

function parseInvoiceSheet(rows) {
  // Find header row (has "Date" in col[0])
  const headerIdx = rows.findIndex((r) => String(r[0]).trim() === 'Date');
  if (headerIdx === -1) throw new Error('No header row found');

  const byDate = {};
  let grandTotal = null;

  for (const row of rows.slice(headerIdx + 1)) {
    // Grand Total row
    if (String(row[1]).trim() === 'Grand Total') {
      grandTotal = num(row[9]);
      continue;
    }

    const date = parseDate(row[0]);
    if (!date) continue;

    const value = num(row[9]);
    byDate[date] = (byDate[date] || 0) + value;
  }

  const dates = Object.keys(byDate).sort();
  const latestDate = dates.at(-1);
  const mtd = grandTotal ?? Object.values(byDate).reduce((a, b) => a + b, 0);

  return { byDate, latestDate, mtd };
}

// ─── Purosoul ────────────────────────────────────────────────────────────────

export async function importPurosoulSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets['Sheet1'];
  if (!sheet) throw new Error('Sheet "Sheet1" not found in Purosoul report');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  const { latestDate, mtd, byDate } = parseInvoiceSheet(rows);
  if (!latestDate) throw new Error('No dated invoice rows found in Purosoul report');

  const revenueToday = byDate[latestDate];
  const fileDate = targetDate ?? latestDate;
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
    purosoulSalesImportedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: fileDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: fileDate, revenueToday, mtd };
}

// ─── Micky's ─────────────────────────────────────────────────────────────────

export async function importMickysSalesReport(xlsBuffer, fileName, targetDate) {
  const wb = XLSX.read(xlsBuffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets['Sales'];
  if (!sheet) throw new Error('Sheet "Sales" not found in Micky\'s report');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  const { latestDate, mtd, byDate } = parseInvoiceSheet(rows);
  if (!latestDate) throw new Error('No dated invoice rows found in Micky\'s report');

  const revenueToday = byDate[latestDate];
  const fileDate = targetDate ?? latestDate;
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
    mickysSalesImportedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: fileDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: fileDate, revenueToday, mtd };
}
