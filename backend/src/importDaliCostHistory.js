import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

const SHEET_ID = '1cgU6utD59v57HwlunQtSBCsVfpiMwX7F';

function num(v) {
  if (v == null) return 0;
  const s = String(v).replace(/[\s,]/g, '').replace(/[^\d.]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function round(v, dec = 2) {
  return String(Math.round(v * 10 ** dec) / 10 ** dec);
}

function costPct(purchase, sales) {
  return sales ? round((purchase / sales) * 100) : '0';
}

// "13/4/2026" or "3/5/2026" → "2026-04-13"
function parseDate(cell) {
  if (typeof cell !== 'string') return null;
  const m = cell.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchAllRows() {
  const xlsxRes = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  if (!xlsxRes.ok) throw new Error(`HTTP ${xlsxRes.status} fetching Dali cost sheet`);
  const wb = XLSX.read(Buffer.from(await xlsxRes.arrayBuffer()), { type: 'buffer' });

  return wb.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
      blankrows: true,
      raw: false
    })
  );
}

function cleanHeader(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function findColumn(headers, label, fallback) {
  const index = headers.findIndex((cell) => cleanHeader(cell) === label);
  return index >= 0 ? index : fallback;
}

function extractDailyRows(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => cleanHeader(cell) === 'date'));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex];
  const dateCol = findColumn(headers, 'date', 0);
  const foodSalesCol = findColumn(headers, 'food sales', dateCol + 1);
  const foodPurchaseCol = findColumn(headers, 'food purchase', dateCol + 2);
  const liquorSalesCol = findColumn(headers, 'liquor sales', dateCol + 6);
  const liquorPurchaseCol = findColumn(headers, 'liquor purchase', dateCol + 7);

  return rows.slice(headerIndex + 1)
    .map((row) => ({ date: parseDate(String(row[dateCol] ?? '')), row }))
    .filter(({ date, row }) => date !== null && String(row[foodSalesCol] ?? '').trim() !== '')
    .map(({ date, row }) => ({
      date,
      foodSales: num(row[foodSalesCol]),
      foodPurchase: num(row[foodPurchaseCol]),
      liquorSales: num(row[liquorSalesCol]),
      liquorPurchase: num(row[liquorPurchaseCol]),
    }));
}

// Returns true when the row's stored values actually changed, so callers can
// skip the expensive write for dates that are already up to date.
function setKpi(data, name, actual, mtd, { preserveActual = false } = {}) {
  const row = data.fnb?.Dali?.find((r) => r.name === name);
  if (!row) return false;
  let changed = false;
  if (!preserveActual || String(row.actual ?? '').trim() === '') {
    if (String(row.actual ?? '') !== String(actual)) { row.actual = String(actual); changed = true; }
  }
  if (String(row.mtd ?? '') !== String(mtd)) { row.mtd = String(mtd); changed = true; }
  return changed;
}

async function readData(date) {
  return (await readDaily(date)) ?? buildSeedData();
}

// Historical sheet rows never change once the day is closed — re-writing the
// whole history every 30-minute run is what made sheet imports slow. Only
// dates inside this window are read/written; cumulative MTD math still walks
// the full sheet so the values stay exact. FULL_IMPORT_HISTORY=true rebuilds everything.
const HISTORY_WINDOW_DAYS = 45;
function historyCutoffDate() {
  if (process.env.FULL_IMPORT_HISTORY === 'true') return '0000-00-00';
  return new Date(Date.now() - HISTORY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
}

export async function importDaliCostHistory() {
  const allRawRows = await fetchAllRows();

  // Keep only rows with a parseable DD/M/YYYY date and actual food sales data.
  const daily = extractDailyRows(allRawRows).sort((a, b) => a.date.localeCompare(b.date));

  if (daily.length === 0) throw new Error('No daily rows found in Dali cost sheet');

  let cumFS = 0, cumFP = 0, cumLS = 0, cumLP = 0;
  let lastMonth = null;
  const written = [];
  const cutoff = historyCutoffDate();

  for (const row of daily) {
    const month = row.date.slice(0, 7);
    if (month !== lastMonth) {
      // Reset MTD at the start of each new month
      cumFS = cumFP = cumLS = cumLP = 0;
      lastMonth = month;
    }

    cumFS += row.foodSales;
    cumFP += row.foodPurchase;
    cumLS += row.liquorSales;
    cumLP += row.liquorPurchase;

    if (row.date < cutoff) continue;

    const totalPurchase = row.foodPurchase + row.liquorPurchase;
    const totalSales = row.foodSales + row.liquorSales;
    const cumTotalSales = cumFS + cumLS;
    const cumTotalPurchase = cumFP + cumLP;

    const snapshot = { totalSales, totalPurchase, cumTotalSales, cumTotalPurchase, row };
    await withDateLock(row.date, async () => {
      const data = await readData(row.date);
      const kpiChanges = [
        setKpi(data, 'Gross Sales',           round(snapshot.totalSales),              round(snapshot.cumTotalSales), { preserveActual: true }),
        setKpi(data, 'Food Cost %',           costPct(snapshot.row.foodPurchase, snapshot.row.foodSales), costPct(cumFP, cumFS)),
        setKpi(data, 'Liquor Cost %',         costPct(snapshot.row.liquorPurchase, snapshot.row.liquorSales), costPct(cumLP, cumLS)),
        setKpi(data, 'Food Purchase Today',   round(snapshot.row.foodPurchase),        round(cumFP)),
        setKpi(data, 'Liquor Purchase Today', round(snapshot.row.liquorPurchase),      round(cumLP)),
        setKpi(data, 'Total Purchase',        round(snapshot.totalPurchase),           round(snapshot.cumTotalPurchase))
      ];
      const nextPnl = (data.pnl ?? []).map((r) =>
        r.unit === 'Dali'
          ? { ...r, revenueToday: String(r.revenueToday ?? '').trim() ? r.revenueToday : round(snapshot.totalSales), purchasesToday: round(snapshot.totalPurchase) }
          : r
      );
      const pnlChanged = JSON.stringify(nextPnl) !== JSON.stringify(data.pnl ?? []);
      if (pnlChanged) data.pnl = nextPnl;
      // Values identical to what's already stored — skip the write entirely.
      if (!kpiChanges.some(Boolean) && !pnlChanged && data.importSource?.daliCostImportedAt) return;
      data.importSource = {
        ...(data.importSource ?? {}),
        daliCostFile: `Dali Cost Sheet (all tabs)`,
        daliCostImportedAt: new Date().toISOString(),
        daliCostNotes: `Fetched from Google Sheet. MTD cumulative through ${snapshot.row.date}.`,
      };
      await writeDaily(row.date, data);
      written.push(row.date);
    });
  }

  return { ok: true, written, rowCount: daily.length };
}

// CLI: node importDaliCostHistory.js
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  importDaliCostHistory()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
