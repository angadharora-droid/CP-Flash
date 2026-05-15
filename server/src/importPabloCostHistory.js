import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

const SHEET_ID = '1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH';
// One entry per monthly sheet tab — add new gids here each month
const GIDS = [67347192];

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

// "13/5/2026" → "2026-05-13"
function parseDate(cell) {
  if (typeof cell !== 'string') return null;
  const m = cell.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchRows(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Pablo cost sheet gid=${gid}`);
  const csv = await res.text();
  const wb = XLSX.read(csv, { type: 'string' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: true });
}

function setKpi(data, name, actual, mtd) {
  const row = data.fnb?.Pablo?.find((r) => r.name === name);
  if (!row) return;
  row.actual = String(actual);
  row.mtd = String(mtd);
}

async function readData(dataPath) {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; return buildSeedData(); }
}

export async function importPabloCostHistory() {
  const allRawRows = (await Promise.all(GIDS.map(fetchRows))).flat();

  // Keep only rows with a parseable DD/M/YYYY date AND actual food sales data (col[2] not blank)
  const daily = allRawRows
    .map((r) => ({ date: parseDate(String(r[1] ?? '')), row: r }))
    .filter(({ date, row }) => date !== null && String(row[2] ?? '').trim() !== '')
    .map(({ date, row }) => ({
      date,
      foodSales: num(row[2]),
      foodPurchase: num(row[3]),
      liquorSales: num(row[7]),
      liquorPurchase: num(row[8]),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (daily.length === 0) throw new Error('No daily rows found in Pablo cost sheet');

  let cumFS = 0, cumFP = 0, cumLS = 0, cumLP = 0;
  let lastMonth = null;
  const written = [];

  for (const row of daily) {
    const month = row.date.slice(0, 7);
    if (month !== lastMonth) {
      cumFS = cumFP = cumLS = cumLP = 0;
      lastMonth = month;
    }

    cumFS += row.foodSales;
    cumFP += row.foodPurchase;
    cumLS += row.liquorSales;
    cumLP += row.liquorPurchase;

    const totalPurchase = row.foodPurchase + row.liquorPurchase;
    const totalSales = row.foodSales + row.liquorSales;
    const cumTotalSales = cumFS + cumLS;
    const cumTotalPurchase = cumFP + cumLP;

    const dataPath = path.resolve(process.cwd(), 'data', `${row.date}.json`);
    const data = await readData(dataPath);

    setKpi(data, 'Gross Sales',           round(totalSales),              round(cumTotalSales));
    setKpi(data, 'Food Cost %',           costPct(row.foodPurchase, row.foodSales), costPct(cumFP, cumFS));
    setKpi(data, 'Liquor Cost %',         costPct(row.liquorPurchase, row.liquorSales), costPct(cumLP, cumLS));
    setKpi(data, 'Food Purchase Today',   round(row.foodPurchase),        round(cumFP));
    setKpi(data, 'Liquor Purchase Today', round(row.liquorPurchase),      round(cumLP));
    setKpi(data, 'Total Purchase',        round(totalPurchase),           round(cumTotalPurchase));

    data.pnl = (data.pnl ?? []).map((r) =>
      r.unit === 'Pablo'
        ? { ...r, revenueToday: round(totalSales), purchasesToday: round(totalPurchase) }
        : r
    );
    data.importSource = {
      ...(data.importSource ?? {}),
      pabloCostFile: `Pablo Cost Sheet (gids=${GIDS.join(',')})`,
      pabloCostImportedAt: new Date().toISOString(),
      pabloCostNotes: `Fetched from Google Sheet. MTD cumulative through ${row.date}.`,
    };

    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify({ ...data, date: row.date, savedAt: new Date().toISOString() }, null, 2));
    written.push(row.date);
  }

  return { ok: true, written, rowCount: daily.length };
}

// CLI: node importPabloCostHistory.js
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  importPabloCostHistory()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
