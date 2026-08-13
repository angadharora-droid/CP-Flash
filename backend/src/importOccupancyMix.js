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
  'Walk-ins': 'Walk-ins',                          // S.O.B
  'Cancellations/No-shows': 'Cancellations/No-shows' // Retention Charges rows
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
const SECTION_RETENTION = 'Retention Charges';

// How each section feeds the tallies, mirroring the report's own Summary math so
// the mix's revenue equals the night audit's Room Revenue (proven 2026-08-12:
// Present 5,80,013 + Retention 6,840 = 5,86,853 = night audit):
//   rooms:false — the "*** Rooms/Pax Count Allowances Not Included in the Total"
//     footnote: allowance amounts adjust revenue but their rooms/pax are already
//     counted in Present Occupancy.
//   skip:true — Complimentary & House Guest sits mid-report but is excluded from
//     the grand total entirely (comp rooms, Nett 0). It still must be recognized
//     as a boundary or its rows would tally under Retention Charges.
const SECTION_RULES = {
  [SECTION_PRESENT]: { rooms: true },
  [SECTION_RETENTION]: { rooms: true },
  'Day Use / Checked Out  Rooms': { rooms: true },
  'Part Settlements': { rooms: true },
  'Checked Out Rooms with Allowances': { rooms: false },
  'Inhouse Rooms with Allowances': { rooms: false },
  'Complimentary & House Guest': { skip: true },
  Summary: { skip: true }
};
const SECTIONS = new Set(Object.keys(SECTION_RULES));

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
      else if (label === 'chg.') idx.chg = c;
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
 * All revenue-bearing sections are tallied per SECTION_RULES — not just Present
 * Occupancy — so the SOB/Market-Segment totals reconcile with the night audit's
 * Room Revenue. Retention rows print no S.O.B; they land in the shared
 * "Cancellations/No-shows" bucket.
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
  let presentRooms = 0;
  let latestArrival = '';
  let section = null;

  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;

    // Section headers print their label in a mid-table column (not a fixed one),
    // so scan the whole row for a known section name. (The Summary block reprints
    // the section names too — its lines flip state here and never reach the
    // detail-row tally below, since they carry no room number in col A.)
    const sectionLabel = row.map(clean).find((cell) => SECTIONS.has(cell));
    if (sectionLabel) {
      section = sectionLabel;
      continue;
    }
    const rule = SECTION_RULES[section];
    if (!rule || rule.skip) continue;

    // Detail row: a real room number in col A (separators are runs of underscores).
    // Requiring a segment or S.O.B also drops IDS's "999999" zero filler rows.
    const roomCell = clean(row[cols.room]);
    const segment = clean(row[cols.segment]);
    const sob = clean(row[cols.sob]).toUpperCase();
    if (!roomCell || roomCell.includes('___') || (!segment && !sob)) continue;

    const nett = num(row[cols.nett]);
    const pax = Math.round(num(row[cols.pax]));
    // "Chg." is the row's day/room-night count. The report's own Total Rooms
    // footers count each Chg>0 row as ONE room (a Chg-2 row is a two-day posting
    // for one room; the Chg sum is the separate "Day Ct" figure). A Chg-0 row
    // (e.g. a zero-day day-use room, or an in-house room settled early — room
    // number printed without the ** marker) still carries its Nett into revenue
    // but not into the room/pax counts.
    const chg = cols.chg != null ? Math.max(0, Math.round(num(row[cols.chg]))) : 1;
    const roomCount = rule.rooms && chg > 0 ? 1 : 0;
    const paxCount = roomCount ? pax : 0;

    // Tally under the shared canonical vocabulary so CP Nagpur and CP NM donuts
    // chart the same category names. Retention rows print no S.O.B — bucket them
    // with CP NM's existing Cancellations/No-shows category.
    const sobName = canonicalMixName('sbo', sob)
      || (section === SECTION_RETENTION ? 'Cancellations/No-shows' : '');
    tallyInto(sboMap, sobName, roomCount, nett, paxCount);
    tallyInto(segMap, canonicalMixName('segment', segment), roomCount, nett, paxCount);
    totalRooms += roomCount;
    totalPax += paxCount;
    totalRevenue += nett;
    if (section === SECTION_PRESENT) {
      presentRooms += roomCount;
      if (cols.doa != null) {
        // Only in-house rows drive the snapshot-date guard: a retention charge
        // can legitimately reference a future D.O.A (a no-show for a later stay).
        const arrival = arrivalIso(row[cols.doa], outDate);
        if (arrival && arrival > latestArrival) latestArrival = arrival;
      }
    }
  }

  if (!presentRooms) throw new Error(`No "${SECTION_PRESENT}" detail rows found in sheet "${usedSheet}".`);

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

  // Guardrails: warn if parsed totals drift from the report's own footer, which
  // signals a column/layout shift (or a new section) worth investigating.
  const footerRooms = findFooterPresentRooms(rows, cols);
  if (footerRooms != null && footerRooms !== presentRooms) {
    console.warn(
      `[importOccupancyMix] Parsed ${presentRooms} Present Occupancy rooms but footer says ${footerRooms} — possible layout shift.`
    );
  }
  const grand = findFooterGrandTotals(rows);
  if (grand) {
    if (grand.rooms !== totalRooms) {
      console.warn(`[importOccupancyMix] Parsed ${totalRooms} rooms across sections but the grand total says ${grand.rooms}.`);
    }
    if (grand.revenue != null && Math.round(grand.revenue) !== totalRevenue) {
      console.warn(`[importOccupancyMix] Parsed revenue ${totalRevenue} but the grand total says ${Math.round(grand.revenue)} — mix will not reconcile with Room Revenue.`);
    }
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

/**
 * The report's grand-total line: the LAST row carrying both "Total Rooms : N"
 * and "Total Pax : N" (per-section footers match too, but the grand total —
 * all sections combined, allowances' rooms excluded — always prints last).
 * Its final numeric cell is the nett revenue (5,86,853 on 2026-08-12).
 */
function findFooterGrandTotals(rows) {
  let grand = null;
  for (const row of rows) {
    const cells = row.map(clean);
    const roomsCell = cells.find((cell) => /Total Rooms\s*:\s*\d+/i.test(cell));
    const paxCell = cells.find((cell) => /Total Pax\s*:\s*\d+/i.test(cell));
    if (!roomsCell || !paxCell) continue;
    const numbers = cells.filter((cell) => /^-?[\d,]+\.?\d*$/.test(cell)).map(num);
    grand = {
      rooms: Number(/Total Rooms\s*:\s*(\d+)/i.exec(roomsCell)[1]),
      pax: Number(/Total Pax\s*:\s*(\d+)/i.exec(paxCell)[1]),
      revenue: numbers.length ? numbers[numbers.length - 1] : null
    };
  }
  return grand;
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
