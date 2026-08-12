import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

const SECTION_TITLE = 'Forecast';

// Persisted as `forecastVersion`; the handler's matching `importVersion` forces a
// one-time re-import when this changes. v3: file under the run's flash date (outDate),
// not a date derived from the forecast row. v4: persist forecastDate for the header.
// v5: forecast row is D+2 (the HCP email is generated the morning the D flash is read).
// v6: parse the reservation-level "Expected Arrival List" layout the bundle switched
// to in Aug 2026, and honour an anchored business date instead of re-dating from the
// forecast row (whose offset from D has drifted between D+1 and D+2).
export const FORECAST_IMPORT_VERSION = 6;

// HCP Nagpur's room inventory. The old summary layout printed it (the Resv. "Rooms"
// column, 136 in every file on record); the arrival-list layout carries no inventory
// at all, so the occupancy % has to be computed against this constant.
const HCP_TOTAL_ROOMS = 136;

const clean = (value) => String(value ?? '').trim();

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(clean(value).replace(/[,%]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "2026-05-30" + 1 → "2026-05-31". */
function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "30/05/2026" (DD/MM/YYYY) → "2026-05-30". Returns '' if not a date. */
function toISO(value) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(clean(value));
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "11-AUG-2026" → "2026-08-11". Returns '' if not a date. */
function monthNameToISO(value) {
  const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/i.exec(clean(value));
  if (!m) return '';
  const mo = MONTHS.indexOf(m[2].toUpperCase()) + 1;
  if (!mo) return '';
  return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Resolve the summary-layout forecast columns. That header spans two rows (group
 * labels then sub-headers); we key off the unique sub-headers we need. "Arr"
 * (Expected Arrivals) appears before the "ARR" rate column, so the first match wins.
 */
function resolveColumns(rows) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row) continue;
    const idx = {};
    row.forEach((cell, c) => {
      const label = clean(cell).toLowerCase();
      if (label === 'date' && idx.date == null) idx.date = c;
      else if (label === 'arr' && idx.arr == null) idx.arr = c;
      else if (label === 'dep' && idx.dep == null) idx.dep = c;
      else if (label === '%' && idx.occPct == null) idx.occPct = c;
    });
    if (idx.date != null && idx.arr != null && idx.dep != null && idx.occPct != null) {
      return { headerRow: r, ...idx };
    }
  }
  return null;
}

/**
 * Parses the pre-Aug-2026 summary layout: a single row per forecast day with
 * Date / Arr / Dep / Occ.Forecast % columns. Returns null if the header is absent.
 */
function parseSummaryLayout(wb) {
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    const cols = resolveColumns(rows);
    if (!cols) continue;
    // First data row carrying a real date in the Date column (the "Total" row has none).
    for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
      const iso = toISO(rows[r]?.[cols.date]);
      if (!iso) continue;
      return {
        layout: 'summary',
        forecastDate: iso,
        arrivals: Math.round(num(rows[r][cols.arr])),
        departures: Math.round(num(rows[r][cols.dep])),
        occPct: Math.round(num(rows[r][cols.occPct]) * 100) / 100
      };
    }
    throw new Error('No forecast data row with a date found.');
  }
  return null;
}

/**
 * Parses the Aug-2026 reservation-level "Expected Arrival List" layout: detail rows
 * (Res# | name | Rooms | Type | Arrival | Departure | …) grouped under EXPECTED
 * ARRIVALS / Stay Over / Occupancy sections, closed by a Grand Total row. The
 * forecast night is the EXPECTED ARRIVALS section's arrival date; expected occupied
 * rooms = arrivals + stay-overs + long-stay in-house (the Grand Total). The layout
 * carries no departures, so that KPI is left untouched.
 */
function parseArrivalListLayout(wb) {
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (!rows.some((row) => /^EXPECTED ARRIVALS$/i.test(clean(row?.[0])))) continue;

    let section = '';
    let arrivals = 0;
    let totalRooms = 0;
    let forecastDate = '';
    let grandTotal = null;
    for (const row of rows) {
      const c0 = clean(row?.[0]);
      if (/^(EXPECTED ARRIVALS|Stay Over|Occupancy)$/i.test(c0)) { section = c0.toUpperCase(); continue; }
      if (/^Grand Total$/i.test(c0)) { grandTotal = Math.round(num(row[2])); continue; }
      if (/^Rm Type Wise Summary$/i.test(c0)) { section = ''; continue; }
      if (!/^\d+\/\d+/.test(c0) || !section) continue; // detail rows carry a Res# like "152939/1"

      const rooms = Math.round(num(row[2])) || 1;
      totalRooms += rooms;
      if (section === 'EXPECTED ARRIVALS') {
        arrivals += rooms;
        if (!forecastDate) forecastDate = monthNameToISO(row[4]);
      }
    }
    if (!forecastDate) throw new Error('Arrival-list layout found but no dated EXPECTED ARRIVALS row.');
    if (grandTotal != null && grandTotal !== totalRooms) {
      console.warn(`[importForecast] Detail rows sum to ${totalRooms} rooms but Grand Total says ${grandTotal} — possible layout shift.`);
      totalRooms = grandTotal;
    }
    return {
      layout: 'arrival-list',
      forecastDate,
      arrivals,
      departures: null,
      occPct: Math.round((totalRooms / HCP_TOTAL_ROOMS) * 10000) / 100,
      forecastRooms: totalRooms
    };
  }
  return null;
}

/** Makes sure the Forecast KPI rows exist for `unit` (older daily files predate them). */
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
 * Parses the HCP_FORE occupancy forecast and fills the hotels "Forecast" KPI table.
 *
 * Date note: HCP_FORE is forward-looking; the row it forecasts has drifted between
 * D+1 and D+2 relative to the bundle's business date D (the sender generates it
 * manually). When the caller anchored the bundle (subject date or sent-date − 1,
 * see hcpSubjectDate) the forecast files under that date as-is. Only unanchored
 * calls fall back to the historical forecastDate − 2 self-dating.
 */
export async function importForecast(file, outDate, unit = 'CP Nagpur', { anchored = false } = {}) {
  const wb = XLSX.readFile(file, { cellDates: true });

  const parsed = parseSummaryLayout(wb) ?? parseArrivalListLayout(wb);
  if (!parsed) throw new Error(`No forecast header (Date/Arr/Dep/%) or EXPECTED ARRIVALS section found. Sheets: ${wb.SheetNames.join(', ')}`);
  const { forecastDate, arrivals, departures, occPct } = parsed;

  const reportDate = anchored ? outDate : isoAddDays(forecastDate, -2);
  if (reportDate !== outDate) {
    console.log(`[importForecast] Backdated report: forecast for ${forecastDate} → filing under ${reportDate} (run date ${outDate}).`);
  }

  const data = (await readDaily(reportDate)) ?? buildSeedData();
  ensureSectionRows(data, unit);

  const setActual = (name, value) => {
    const row = data.hotels.find((r) => r.unit === unit && r.section === SECTION_TITLE && r.name === name);
    if (row) row.actual = String(value);
  };
  setActual('Tomorrow Occupancy Forecast %', occPct);
  setActual('Arrivals', arrivals);
  if (departures != null) setActual('Departures', departures);
  data.forecastDate = forecastDate;

  data.importSource = {
    ...(data.importSource ?? {}),
    forecastFile: path.basename(file),
    forecastImportedAt: new Date().toISOString(),
    forecastVersion: FORECAST_IMPORT_VERSION
  };

  await writeDaily(reportDate, data);

  return {
    ok: true,
    date: reportDate,
    detectedDate: reportDate,
    unit,
    forecastFor: forecastDate,
    mapped: { layout: parsed.layout, occPct, arrivals, ...(departures != null ? { departures } : {}) }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10), unit = 'CP Nagpur'] = process.argv;
  if (!file) { console.error('Usage: node importForecast.js <file> [YYYY-MM-DD] [unit]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importForecast(file, outDate, unit)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
