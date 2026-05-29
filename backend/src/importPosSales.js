import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

// HCP_POS_SALE outlet section header (uppercased) → "Covers" row in the hotels
// "F&B Outlets" KPI table. Only these three outlets are tracked; the report also
// lists MINI BAR and ROOM SERVICE, which have no Covers row here.
const OUTLET_COVER_ROW = {
  FREAKK: 'Freakk Covers',
  'HIGH STEAK': 'High Steaks Covers',
  'MEETING POINT': 'Meeting Point Covers'
};

// All outlet section headers in the report, used to switch context. Meal-period
// sub-headers (LUNCH/DINNER/…) sit under an outlet and keep the current outlet.
const OUTLET_HEADERS = new Set([...Object.keys(OUTLET_COVER_ROW), 'MINI BAR', 'ROOM SERVICE']);
const PERIODS = new Set(['LUNCH', 'DINNER', 'NIGHT', 'BREAKFAST']);

const SECTION_TITLE = 'F&B Outlets';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

const clean = (value) => String(value ?? '').trim();
const isBillNumber = (value) => /^\d+(\(D\))?$/.test(clean(value));

/** Locate the header row (col0 = "Bill#") and resolve the columns we care about by name. */
function resolveColumns(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const idx = {};
    row.forEach((cell, c) => {
      const label = clean(cell).toLowerCase().replace(/[#.]/g, '');
      if (label === 'bill') idx.bill = c;
      else if (label.startsWith('table')) idx.table = c;
      else if (label === 'covfx' || label === 'cover' || label === 'covers') idx.cover = c;
      else if (label === 'fod' || label === 'food') idx.fod = c;
      else if (label === 'liq') idx.liq = c;
    });
    if (idx.bill != null && idx.cover != null && idx.table != null) {
      return { headerRow: r, ...idx };
    }
  }
  return null;
}

/**
 * Counts covers (guests) for an outlet's bill rows, treating a food bill and a
 * liquor bill for the same party as ONE cover instead of two.
 *
 * The POS splits a party that orders both food and liquor into two separate bills
 * that share the same table number (e.g. bills 24678/24679 both on table "G19").
 * The raw COVFX column counts each bill, double-counting the party — so we pair a
 * liquor-only bill with the most-recent unpaired food bill at the same table and
 * skip its covers. A table hosting several parties through the day is handled
 * because each food bill pairs at most once.
 */
function dedupCovers(bills) {
  const openFoodByTable = new Map();
  let covers = 0;
  for (const b of bills) {
    const isFood = b.fod > 0 && b.liq === 0;
    const isLiq = b.liq > 0 && b.fod === 0;
    if (isLiq) {
      const stack = openFoodByTable.get(b.table);
      if (stack?.length) {
        stack.pop(); // pair with an earlier food bill — same party, already counted
        continue;
      }
      covers += b.cover; // liquor-only party (no matching food bill)
      continue;
    }
    covers += b.cover; // food-only or mixed bill — count once
    if (isFood) {
      const stack = openFoodByTable.get(b.table) ?? [];
      stack.push(b);
      openFoodByTable.set(b.table, stack);
    }
  }
  return covers;
}

/** Makes sure the F&B Outlets KPI rows exist for `unit` (older daily files predate new rows). */
function ensureSectionRows(data, unit) {
  const section = pageSchemas.hotels.find((s) => s.title === SECTION_TITLE);
  if (!section) return;
  data.hotels = data.hotels ?? [];
  const existingIds = new Set(data.hotels.map((r) => r.id));
  for (const row of schemaRowsToKpis(unit, 'hotels', [section])) {
    if (!existingIds.has(row.id)) data.hotels.push(row);
  }
}

/**
 * Parses the HCP_POS_SALE outlet-wise bill report and writes deduped daily covers
 * for Meeting Point, Freakk and High Steak into the hotels "F&B Outlets" KPI table.
 */
export async function importPosSales(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  let rows = null;
  let cols = null;
  let usedSheet = '';
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    const resolved = resolveColumns(r);
    if (resolved) { rows = r; cols = resolved; usedSheet = sheetName; break; }
  }
  if (!cols) throw new Error(`No "Bill#"/"COVFX" header found. Sheets: ${wb.SheetNames.join(', ')}`);

  // Collect bill rows grouped by outlet section.
  const billsByOutlet = new Map();
  let outlet = null;
  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const c0 = clean(row[cols.bill]).toUpperCase();

    if (OUTLET_HEADERS.has(c0)) { outlet = c0; continue; }
    if (PERIODS.has(c0)) continue;            // meal sub-header — keep current outlet
    if (!outlet || !isBillNumber(row[cols.bill])) continue; // totals/summary/blank rows

    const list = billsByOutlet.get(outlet) ?? [];
    list.push({
      table: clean(row[cols.table]),
      cover: Math.round(num(row[cols.cover])),
      fod: num(row[cols.fod]),
      liq: num(row[cols.liq])
    });
    billsByOutlet.set(outlet, list);
  }

  if (!billsByOutlet.size) throw new Error(`No outlet bill rows found in sheet "${usedSheet}".`);

  const data = (await readDailyJson(outDate)) ?? buildSeedData();
  ensureSectionRows(data, unit);

  const covers = {};
  for (const [outletName, rowName] of Object.entries(OUTLET_COVER_ROW)) {
    const bills = billsByOutlet.get(outletName) ?? [];
    const value = dedupCovers(bills);
    covers[outletName] = value;
    const kpiRow = data.hotels.find((r) => r.unit === unit && r.section === SECTION_TITLE && r.name === rowName);
    if (kpiRow) kpiRow.actual = String(value);
  }

  data.importSource = {
    ...(data.importSource ?? {}),
    posSalesFile: path.basename(file),
    posSalesImportedAt: new Date().toISOString()
  };

  await writeDailyJson(outDate, data);

  return {
    ok: true,
    date: outDate,
    unit,
    file: `${outDate}.json`,
    mapped: covers
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10), unit = 'CP Nagpur'] = process.argv;
  if (!file) { console.error('Usage: node importPosSales.js <file> [YYYY-MM-DD] [unit]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importPosSales(file, outDate, unit)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
