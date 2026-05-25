/**
 * Parses the Purosoul monthly Flash Report CSV (side-by-side SKU layout).
 *
 * Sheet structure (0-indexed columns):
 *   Row 5: SKU group headers  — "250 ML" at col 1, "500 ML" at col 10, "1 Ltr" at col 19
 *   Row 6: Sub-headers        — Date, Op.Stock, Production, Bill Dispatch, Scheme Dispatch, Cl.Stock, Tally, Variance
 *   Row 7+: Data              — each row has the same date repeated for each SKU block
 *
 * Per-block column offsets (relative to block start):
 *   0=Date, 1=Op.Stock, 2=Production, 3=Bill Dispatch, 4=Scheme Dispatch, 5=Cl.Stock
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

const SKU_BLOCKS = [
  { col: 1,  sku: '250ml' },
  { col: 10, sku: '500ml' },
  { col: 19, sku: '1L'    },
];

// Handles "1/5/26", "01/05/26", "01/05/2026" or Date objects → "2026-05-01"
function parseDate(cell) {
  if (!cell && cell !== 0) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const s = String(cell).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
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

async function readData(date) {
  return (await readDailyJson(date)) ?? buildSeedData();
}

export async function importPurosoulFlashReport(csvPathOrBuffer) {
  let wb;
  if (typeof csvPathOrBuffer === 'string') {
    const content = await fs.readFile(csvPathOrBuffer, 'utf8');
    wb = XLSX.read(content, { type: 'string', cellDates: true });
  } else {
    wb = XLSX.read(csvPathOrBuffer, { type: 'buffer', cellDates: true });
  }

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: true, raw: false });

  // Collect data rows: skip header rows (first 6), skip Total row, skip rows with no parseable date
  const dataRows = rows.slice(6).filter((r) => {
    const date = parseDate(r[SKU_BLOCKS[0].col]);
    return date !== null && String(r[SKU_BLOCKS[0].col + 1] ?? '').trim().toLowerCase() !== 'total';
  });

  if (dataRows.length === 0) throw new Error('No data rows found in Purosoul flash report');

  // Track MTD cumulative dispatch per SKU, resetting at month boundary
  const mtd = {};
  let lastMonth = null;

  const written = [];

  for (const row of dataRows) {
    const date = parseDate(row[SKU_BLOCKS[0].col]);
    if (!date) continue;

    const month = date.slice(0, 7);
    if (month !== lastMonth) {
      SKU_BLOCKS.forEach((b) => { mtd[b.sku] = 0; });
      lastMonth = month;
    }

    // Extract per-SKU values
    const skuData = {};
    for (const block of SKU_BLOCKS) {
      const production    = num(row[block.col + 2]);
      const billDispatch  = num(row[block.col + 3]);
      const schemeDispatch = num(row[block.col + 4]);
      const clStock       = num(row[block.col + 5]);
      const dispatched    = billDispatch + schemeDispatch;
      mtd[block.sku] += dispatched;
      skuData[block.sku] = { production, dispatched, clStock, mtd: mtd[block.sku] };
    }

    const data = await readData(date);

    // Normalize SKU list to the canonical set (migrate away from old seed SKUs)
    const EXPECTED_SKUS = ['250ml', '500ml', '1L'];
    const existingBySku = {};
    (data.purosoulSku ?? []).forEach((r) => { existingBySku[r.sku] = r; });

    data.purosoulSku = EXPECTED_SKUS.map((sku) => {
      const base = existingBySku[sku] ?? { sku, produced: '', dispatched: '', clStock: '', mtd: '', ytd: '' };
      const d = skuData[sku];
      if (!d) return base;
      return { ...base, produced: String(d.production), dispatched: String(d.dispatched), clStock: String(d.clStock), mtd: String(d.mtd) };
    });

    data.importSource = {
      ...(data.importSource ?? {}),
      purosoulFlashFile: typeof csvPathOrBuffer === 'string' ? path.basename(csvPathOrBuffer) : 'purosoul-flash.csv',
      purosoulFlashImportedAt: new Date().toISOString(),
    };

    await writeDailyJson(date, data);
    written.push(date);
  }

  return { ok: true, written, rowCount: dataRows.length };
}

// CLI: node importPurosoulFlashReport.js [path-to-csv]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const csvPath = process.argv[2] ?? path.resolve(process.cwd(), 'data', 'attachments', 'purosoul-flash-2026-05.csv');
  importPurosoulFlashReport(csvPath)
    .then((r) => console.log(`Imported ${r.rowCount} rows → ${r.written.join(', ')}`))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
