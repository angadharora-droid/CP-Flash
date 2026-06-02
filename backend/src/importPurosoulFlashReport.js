import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

const SHEET_ID = '1NeheL3S8opBiwpQLLR_0CHjFxbZONk_uxLGKkPPip90';

// Side-by-side SKU layout — gviz CSV has a leading empty col, so dates land at 1/10/19
// Per-block offsets: +0=Date, +1=Op.Stock, +2=Production, +3=Bill Dispatch, +4=Scheme Dispatch, +5=Cl.Stock
const SKU_BLOCKS = [
  { col: 1,  sku: '250ml' },
  { col: 10, sku: '500ml' },
  { col: 19, sku: '1L'    },
];

// "13/05/26", "1/5/2026", "01/05/26" → "2026-05-01"
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

async function fetchAllRows() {
  // Discover all tab names from the workbook
  const xlsxRes = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  if (!xlsxRes.ok) throw new Error(`HTTP ${xlsxRes.status} fetching Purosoul sheet`);
  const wb = XLSX.read(await xlsxRes.arrayBuffer(), { type: 'array' });

  // Fetch each tab as CSV so dates stay as text strings (e.g. "13/05/26")
  const allRows = await Promise.all(
    wb.SheetNames.map(async (name) => {
      const csvRes = await fetch(
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name.trim())}`
      );
      if (!csvRes.ok) return [];
      const csvWb = XLSX.read(await csvRes.text(), { type: 'string' });
      return XLSX.utils.sheet_to_json(csvWb.Sheets[csvWb.SheetNames[0]], { header: 1, defval: '', blankrows: true });
    })
  );
  return allRows.flat();
}

async function readData(date) {
  return (await readDailyJson(date)) ?? buildSeedData();
}

export async function importPurosoulFlashReport() {
  const allRawRows = await fetchAllRows();

  // Keep only daily rows — serial-date rows and blank rows are filtered by parseDate
  const daily = allRawRows
    .map((r) => ({ date: parseDate(r[SKU_BLOCKS[0].col]), row: r }))
    .filter(({ date }) => date !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (daily.length === 0) throw new Error('No daily rows found in Purosoul flash report');

  // MTD resets each month; YTD resets each year
  const mtd = {};
  const ytd = {};
  SKU_BLOCKS.forEach((b) => { mtd[b.sku] = 0; ytd[b.sku] = 0; });
  let lastMonth = null;
  let lastYear = null;
  const written = [];

  for (const { date, row } of daily) {
    const month = date.slice(0, 7);
    const year = date.slice(0, 4);

    if (year !== lastYear) {
      SKU_BLOCKS.forEach((b) => { ytd[b.sku] = 0; });
      lastYear = year;
    }
    if (month !== lastMonth) {
      SKU_BLOCKS.forEach((b) => { mtd[b.sku] = 0; });
      lastMonth = month;
    }

    const skuData = {};
    for (const block of SKU_BLOCKS) {
      const production     = num(row[block.col + 2]);
      const billDispatch   = num(row[block.col + 3]);
      const schemeDispatch = num(row[block.col + 4]);
      const clStock        = num(row[block.col + 5]);
      const dispatched     = billDispatch + schemeDispatch;
      mtd[block.sku] += dispatched;
      ytd[block.sku] += dispatched;
      skuData[block.sku] = { production, dispatched, clStock, mtd: mtd[block.sku], ytd: ytd[block.sku] };
    }

    const data = await readData(date);
    const EXPECTED_SKUS = ['250ml', '500ml', '1L'];
    const existingBySku = {};
    (data.purosoulSku ?? []).forEach((r) => { existingBySku[r.sku] = r; });

    data.purosoulSku = EXPECTED_SKUS.map((sku) => {
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

    data.importSource = {
      ...(data.importSource ?? {}),
      purosoulFlashFile: 'Purosoul Flash Report (all tabs)',
      purosoulFlashImportedAt: new Date().toISOString(),
    };

    await writeDailyJson(date, data);
    written.push(date);
  }

  return { ok: true, written, rowCount: daily.length };
}

// CLI: node importPurosoulFlashReport.js
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  importPurosoulFlashReport()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
