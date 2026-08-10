import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { canonicalMixName, pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

// Canonical mix category → preset row in the "Market Segments" KPI table.
// (Mix entries are tallied under the shared canonical vocabulary — see
// canonicalMixName in schema.js.) Mar.Seg and S.O.B value sets don't overlap, so
// both feed the one table. Categories without a matching row (Non-Contracted,
// Sales Office, CRO, Hotel Website, Travel Agent) are dropped — no "Other" row.
const MARKET_SEGMENT_MAP = {
  Corporate: 'Corporate',                          // Mar.Seg
  'FIT/Leisure': 'FIT/Leisure',                    // Mar.Seg
  'OTA (MMT/Booking.com)': 'OTA (MMT/Booking.com)', // S.O.B
  'Walk-ins': 'Walk-ins'                           // S.O.B
};

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

const clean = (value) => String(value ?? '').trim();

// D.O.A cells are "dd/mm" with no year; anchor on the business date's year.
// A result far in the future is last year's long-stay arrival (a December
// guest on a January report), not a late snapshot — only small forward drift
// (a bundle generated days after its business date) is real.
function arrivalIso(doa, outDate) {
  const m = /^(\d{1,2})\/(\d{1,2})/.exec(clean(doa));
  if (!m) return null;
  const mk = (y) => `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = mk(Number(outDate.slice(0, 4)));
  const driftDays = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${outDate}T00:00:00Z`)) / 86400000;
  return driftDays > 45 ? mk(Number(outDate.slice(0, 4)) - 1) : iso;
}

// Section labels that appear in the "Status" column (col H) of the HCP_OCC report.
const SECTION_PRESENT = 'Present Occupancy';
const SECTIONS = new Set([
  SECTION_PRESENT,
  'Retention Charges',
  'Day Use / Checked Out  Rooms',
  'Part Settlements',
  'Checked Out Rooms with Allowances',
  'Inhouse Rooms with Allowances',
  'Summary'
]);

/** Locate the header row and resolve the column indices we care about by name. */
function resolveColumns(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const idx = {};
    row.forEach((cell, c) => {
      const label = clean(cell).toLowerCase();
      if (label === 'mar.seg') idx.segment = c;
      else if (label === 's.o.b') idx.sob = c;
      else if (label === 'pax') idx.pax = c;
      else if (label === 'nett') idx.nett = c;
      else if (label === 'room#') idx.room = c;
      else if (label === 'd.o.a') idx.doa = c;
    });
    if (idx.segment != null && idx.sob != null) {
      return { headerRow: r, ...idx };
    }
  }
  return null;
}

function tallyInto(map, key, rooms, revenue, pax) {
  const name = key || 'Unspecified';
  const entry = map.get(name) ?? { name, rooms: 0, revenue: 0, pax: 0 };
  entry.rooms += rooms;
  entry.revenue += revenue;
  entry.pax += pax;
  map.set(name, entry);
}

const toSortedArray = (map) =>
  [...map.values()]
    .map((e) => ({ ...e, revenue: Math.round(e.revenue) }))
    .sort((a, b) => b.rooms - a.rooms || b.revenue - a.revenue);

/** Makes sure a hotels KPI section's rows exist for `unit` (older daily files predate new sections). */
function ensureSectionRows(data, unit, sectionTitle) {
  const section = pageSchemas.hotels.find((s) => s.title === sectionTitle);
  if (!section) return;
  data.hotels = data.hotels ?? [];
  const existingIds = new Set(data.hotels.map((r) => r.id));
  for (const row of schemaRowsToKpis(unit, 'hotels', [section])) {
    if (!existingIds.has(row.id)) data.hotels.push(row);
  }
}

/**
 * Maps an aggregated breakdown (entries of { name, rooms }) onto a KPI section's rows by
 * room count, routing unmapped report categories into the section's "Other" row.
 */
function applyMixToKpis(data, unit, sectionTitle, entries, nameToRow) {
  ensureSectionRows(data, unit, sectionTitle);
  const roomsByRow = new Map();
  for (const entry of entries) {
    const rowName = nameToRow[entry.name] ?? 'Other';
    roomsByRow.set(rowName, (roomsByRow.get(rowName) ?? 0) + entry.rooms);
  }
  for (const [rowName, rooms] of roomsByRow) {
    const row = data.hotels.find((r) => r.unit === unit && r.section === sectionTitle && r.name === rowName);
    if (row) row.actual = String(rooms);
  }
}

/**
 * Parses the HCP_OCC guest-level in-house occupancy report for CP Nagpur and
 * builds the daily occupancy mix by Source of Business (S.O.B — primary) and
 * Market Segment (Mar.Seg — secondary).
 *
 * Sheet layout: a header row (Room# | Guest Name | Mar.Seg | … | Nett | S.O.B),
 * then guest detail rows grouped under section headers in the "Status" column
 * ("Present Occupancy", "Retention Charges", "Day Use…", "Summary").
 * Only the "Present Occupancy" block (in-house guests) is tracked.
 */
export async function importOccupancyMix(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  // Pick the first sheet that actually contains the guest-detail header.
  let rows = null;
  let cols = null;
  let usedSheet = '';
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    const resolved = resolveColumns(r);
    if (resolved) { rows = r; cols = resolved; usedSheet = sheetName; break; }
  }
  if (!cols) throw new Error(`No "Mar.Seg"/"S.O.B" header found. Sheets: ${wb.SheetNames.join(', ')}`);

  const sboMap = new Map();
  const segMap = new Map();
  let totalRooms = 0;
  let totalPax = 0;
  let totalRevenue = 0;
  let latestArrival = '';
  let section = null;

  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;

    // Section headers print their label in a mid-table column (not a fixed one),
    // so scan the whole row for a known section name.
    const sectionLabel = row.map(clean).find((cell) => SECTIONS.has(cell));
    if (sectionLabel) {
      section = sectionLabel;
      continue;
    }
    if (section !== SECTION_PRESENT) continue;

    // Detail row: a real room number in col A (separators are runs of underscores).
    const roomCell = clean(row[cols.room]);
    const segment = clean(row[cols.segment]);
    if (!roomCell || roomCell.includes('___') || !segment) continue;

    const nett = num(row[cols.nett]);
    const pax = Math.round(num(row[cols.pax]));
    const sob = clean(row[cols.sob]).toUpperCase();

    // Tally under the shared canonical vocabulary so CP Nagpur and CP NM donuts
    // chart the same category names.
    tallyInto(sboMap, canonicalMixName('sbo', sob), 1, nett, pax);
    tallyInto(segMap, canonicalMixName('segment', segment), 1, nett, pax);
    totalRooms += 1;
    totalPax += pax;
    totalRevenue += nett;
    if (cols.doa != null) {
      const arrival = arrivalIso(row[cols.doa], outDate);
      if (arrival && arrival > latestArrival) latestArrival = arrival;
    }
  }

  if (!totalRooms) throw new Error(`No "${SECTION_PRESENT}" detail rows found in sheet "${usedSheet}".`);

  // HCP_OCC is a live "who's in-house now" snapshot with no printed date. A
  // bundle mailed days after a holiday carries a snapshot from send time; a
  // guest who arrived AFTER the business date proves it. Filing it would copy
  // a later day's mix onto this date (Jul 10 + 11 2026 held identical data
  // this way), so leave the date empty and let the fetch log it as pending.
  if (latestArrival > outDate) {
    return {
      ok: false,
      pending: true,
      date: outDate,
      unit,
      reason: `HCP_OCC snapshot postdates ${outDate} (guest arrived ${latestArrival}) — generated on a later day; not imported`
    };
  }

  const sbo = toSortedArray(sboMap);
  const segment = toSortedArray(segMap);
  totalRevenue = Math.round(totalRevenue);

  // Guardrail: warn if the parsed total drifts from the report's own footer count,
  // which signals a column/layout shift worth investigating.
  const footerRooms = findFooterPresentRooms(rows, cols);
  if (footerRooms != null && footerRooms !== totalRooms) {
    console.warn(
      `[importOccupancyMix] Parsed ${totalRooms} Present Occupancy rooms but footer says ${footerRooms} — possible layout shift.`
    );
  }

  const data = (await readDaily(outDate)) ?? buildSeedData();

  data.occupancyMix = {
    unit,
    asOf: outDate,
    totalRooms,
    totalPax,
    totalRevenue,
    sbo,
    segment
  };

  // Populate the Market Segments KPI table (rooms) — rendered by HotelsPage's section loop.
  // Both breakdowns feed it: Mar.Seg → Corporate/FIT, S.O.B → OTA/Walk-ins.
  applyMixToKpis(data, unit, 'Market Segments', [...segment, ...sbo], MARKET_SEGMENT_MAP);

  data.importSource = {
    ...(data.importSource ?? {}),
    occupancyMixFile: path.basename(file),
    occupancyMixImportedAt: new Date().toISOString()
  };

  await writeDaily(outDate, data);

  return {
    ok: true,
    date: outDate,
    unit,
    file: `${outDate}.json`,
    mapped: { totalRooms, totalRevenue, sbo: sbo.length, segment: segment.length }
  };
}

/** Reads "Total Rooms : N" from the Summary footer's Present Occupancy line, if present. */
function findFooterPresentRooms(rows, cols) {
  for (const row of rows) {
    const label = clean(row[0]);
    if (label === SECTION_PRESENT) {
      for (const cell of row) {
        const m = /Total Rooms\s*:\s*(\d+)/i.exec(clean(cell));
        if (m) return Number(m[1]);
      }
    }
  }
  return null;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10), unit = 'CP Nagpur'] = process.argv;
  if (!file) { console.error('Usage: node importOccupancyMix.js <file> [YYYY-MM-DD] [unit]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importOccupancyMix(file, outDate, unit)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
