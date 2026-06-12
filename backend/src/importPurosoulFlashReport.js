import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

// Purosoul "DISPATCH AND PRODUCTION" workbook. The daily tab is a vertical
// layout: each date spans one row per product —
//   DATE | PRODUCT | OPENING STOCK | PRODUCTION | BILL DISPATCH |
//   SCHEME DISPATCH | EXTRA | NC | TOTAL DISPATCH | CLOSING STOCK
// The date cell ("02.4.26") is filled only on the first product row of the
// day; month markers ("Apr/26") and "WEEKLY OFF" rows are interleaved, and a
// monthly summary block sits in unrelated columns further right.
const SHEET_ID = '1F_ygPqRUvzuecr3TICSztrVbNx1YhV-m';

const EXPECTED_SKUS = ['250ml', '500ml', '1L', '20L Jar'];

// "250 ml " → 250ml, "1 Ltr" → 1L, "20 L Jar " → 20L Jar
const SKU_ALIASES = {
  '250ml': '250ml',
  '500ml': '500ml',
  '1ltr': '1L',
  '1l': '1L',
  '20ljar': '20L Jar',
  '20l': '20L Jar'
};

function normalizeSku(cell) {
  const key = String(cell ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return SKU_ALIASES[key] ?? null;
}

// "01.4.26", "13/05/26", "1-5-2026" → "2026-04-01" (day first)
function parseDate(cell) {
  if (!cell && cell !== 0) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const s = String(cell).trim();
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findColumn(header, ...names) {
  return header.findIndex((cell) => names.includes(normalizeHeader(cell)));
}

export async function fetchWorkbook() {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Purosoul dispatch & production sheet`);
  return XLSX.read(await res.arrayBuffer(), { type: 'array' });
}

// Parse every tab that carries the DATE/PRODUCT/PRODUCTION header (the daily
// snapshot tab has a different layout and is skipped). First tab wins per
// date+SKU so a duplicated row can't double-count.
export function parseDailyRows(wb) {
  const byDate = {};

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: false, raw: false });
    const headerIdx = rows.findIndex((r) =>
      normalizeHeader(r[0]) === 'date' && findColumn(r, 'product') !== -1 && findColumn(r, 'production') !== -1
    );
    if (headerIdx === -1) continue;

    const header = rows[headerIdx];
    const cols = {
      product: findColumn(header, 'product'),
      opening: findColumn(header, 'opening stock'),
      production: findColumn(header, 'production'),
      bill: findColumn(header, 'bill dispatch'),
      scheme: findColumn(header, 'scheme dispatch'),
      extra: findColumn(header, 'extra'),
      nc: findColumn(header, 'nc'),
      total: findColumn(header, 'total dispatch'),
      closing: findColumn(header, 'closing stock')
    };
    // Cells the operator types in. TOTAL DISPATCH / CLOSING STOCK are formulas
    // that read "0" even on untouched future rows, so they can't be used to
    // tell a real zero day from a pre-created blank template row.
    const inputCols = [cols.opening, cols.production, cols.bill, cols.scheme, cols.extra, cols.nc];

    let currentDate = null;
    for (const row of rows.slice(headerIdx + 1)) {
      const date = parseDate(row[0]);
      if (date) {
        currentDate = date;
        if (!byDate[currentDate]) byDate[currentDate] = { skus: {}, offDay: false };
      }
      if (!currentDate) continue;

      // "WEEKLY OFF" appears in different columns depending on the day.
      if (row.some((cell) => /weekly\s*off|holiday/i.test(String(cell)))) {
        byDate[currentDate].offDay = true;
        continue;
      }

      const sku = normalizeSku(row[cols.product]);
      if (!sku || byDate[currentDate].skus[sku]) continue;
      if (inputCols.every((c) => String(row[c] ?? '').trim() === '')) continue;

      const totalCell = String(row[cols.total] ?? '').trim();
      const dispatched = totalCell !== ''
        ? num(totalCell)
        : num(row[cols.bill]) + num(row[cols.scheme]) + num(row[cols.extra]) + num(row[cols.nc]);

      byDate[currentDate].skus[sku] = {
        production: num(row[cols.production]),
        dispatched,
        clStock: num(row[cols.closing])
      };
    }
  }

  return byDate;
}

async function readData(date) {
  return (await readDaily(date)) ?? buildSeedData();
}

// Historical sheet rows never change once the day is closed — only dates in
// this window are read/written; MTD/YTD cumulative math still walks the full
// sheet so values stay exact. FULL_IMPORT_HISTORY=true rebuilds everything.
const HISTORY_WINDOW_DAYS = 45;
function historyCutoffDate() {
  if (process.env.FULL_IMPORT_HISTORY === 'true') return '0000-00-00';
  return new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export async function importPurosoulFlashReport() {
  const byDate = parseDailyRows(await fetchWorkbook());
  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) throw new Error('No daily rows found in Purosoul dispatch & production sheet');

  // MTD resets each month; YTD resets each year. Closing stock carries over
  // weekly-off days so an off day still shows a complete (zero-movement) row.
  const mtd = {};
  const ytd = {};
  const lastClosing = {};
  EXPECTED_SKUS.forEach((sku) => { mtd[sku] = 0; ytd[sku] = 0; lastClosing[sku] = 0; });
  let lastMonth = null;
  let lastYear = null;
  const written = [];
  const cutoff = historyCutoffDate();

  for (const date of dates) {
    const month = date.slice(0, 7);
    const year = date.slice(0, 4);

    if (year !== lastYear) {
      EXPECTED_SKUS.forEach((sku) => { ytd[sku] = 0; });
      lastYear = year;
    }
    if (month !== lastMonth) {
      EXPECTED_SKUS.forEach((sku) => { mtd[sku] = 0; });
      lastMonth = month;
    }

    const { skus, offDay } = byDate[date];
    const skuData = {};
    for (const sku of EXPECTED_SKUS) {
      const d = skus[sku];
      if (d) {
        mtd[sku] += d.dispatched;
        ytd[sku] += d.dispatched;
        lastClosing[sku] = d.clStock;
        skuData[sku] = { ...d, mtd: mtd[sku], ytd: ytd[sku] };
      } else if (offDay) {
        skuData[sku] = { production: 0, dispatched: 0, clStock: lastClosing[sku], mtd: mtd[sku], ytd: ytd[sku] };
      }
    }
    if (!Object.keys(skuData).length) continue;

    if (date < cutoff) continue;

    await withDateLock(date, async () => {
      const data = await readData(date);
      const existingBySku = {};
      (data.purosoulSku ?? []).forEach((r) => { existingBySku[r.sku] = r; });

      const nextSku = EXPECTED_SKUS.map((sku) => {
        const base = existingBySku[sku] ?? { sku, produced: '', dispatched: '', clStock: '', mtd: '', ytd: '' };
        const d = skuData[sku];
        if (!d) return base;
        return {
          ...base,
          produced: String(d.production),
          dispatched: String(d.dispatched),
          clStock: String(d.clStock),
          mtd: String(d.mtd),
          ytd: String(d.ytd),
        };
      });

      // Values identical to what's already stored — skip the write entirely.
      if (JSON.stringify(nextSku) === JSON.stringify(data.purosoulSku ?? [])
        && data.importSource?.purosoulFlashImportedAt) return;

      data.purosoulSku = nextSku;
      data.importSource = {
        ...(data.importSource ?? {}),
        purosoulFlashFile: 'Purosoul Dispatch & Production Sheet',
        purosoulFlashImportedAt: new Date().toISOString(),
      };

      await writeDaily(date, data);
      written.push(date);
    });
  }

  return { ok: true, written, rowCount: dates.length };
}

// CLI: node importPurosoulFlashReport.js
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  importPurosoulFlashReport()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
