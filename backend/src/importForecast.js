import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

const SECTION_TITLE = 'Forecast';

// Persisted as `forecastVersion`; the handler's matching `importVersion` forces a
// one-time re-import when this changes. v3: file under the run's flash date (outDate),
// not a date derived from the forecast row. v4: persist forecastDate for the header.
// v5: forecast row is D+2 (the HCP email is generated the morning the D flash is read).
export const FORECAST_IMPORT_VERSION = 5;

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

/**
 * Resolve the forecast columns. The HCP_FORE header spans two rows (group labels then
 * sub-headers); we key off the unique sub-headers we need. "Arr" (Expected Arrivals)
 * appears before the "ARR" rate column, so the first match wins.
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
 * Date note: HCP_FORE is forward-looking. The HCP report for business date D (`outDate`)
 * is generated the morning the D flash is read (D+1), so the forecast row is dated D+2 —
 * "tomorrow" from the reader's viewpoint. It maps onto the existing "Tomorrow …" rows and
 * is written into the run's flash-date (`outDate`) JSON.
 */
export async function importForecast(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  let rows = null;
  let cols = null;
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    const resolved = resolveColumns(r);
    if (resolved) { rows = r; cols = resolved; break; }
  }
  if (!cols) throw new Error(`No forecast header (Date/Arr/Dep/%) found. Sheets: ${wb.SheetNames.join(', ')}`);

  // First data row carrying a real date in the Date column (the "Total" row has none).
  let forecastDate = '';
  let arrivals = 0;
  let departures = 0;
  let occPct = 0;
  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const iso = toISO(rows[r]?.[cols.date]);
    if (!iso) continue;
    forecastDate = iso;
    arrivals = Math.round(num(rows[r][cols.arr]));
    departures = Math.round(num(rows[r][cols.dep]));
    occPct = Math.round(num(rows[r][cols.occPct]) * 100) / 100;
    break;
  }
  if (!forecastDate) throw new Error('No forecast data row with a date found.');

  // Stale-email guard: the forecast row is dated D+2 (the HCP email for business date D is
  // generated the morning the D flash is read, and forecasts the day after that). A
  // leftover email from a previous cycle forecasts D+1, which fails this check — so it
  // stays Pending rather than importing yesterday's report.
  const expectedForecastDate = isoAddDays(outDate, 2);
  if (forecastDate !== expectedForecastDate) {
    console.warn(`[importForecast] Skipping stale report: forecast is for ${forecastDate}, expected ${expectedForecastDate} (run date ${outDate}).`);
    return { ok: false, pending: true, reason: 'stale-report', unit, forecastFor: forecastDate, expected: expectedForecastDate };
  }

  // File under the run's flash date (outDate). The forecast row is a forward-looking
  // figure that belongs on the current report; it maps onto the existing "Tomorrow …"
  // rows. `forecastDate` (the day being forecast) is persisted for the section header.
  const reportDate = outDate;

  const data = (await readDailyJson(reportDate)) ?? buildSeedData();
  ensureSectionRows(data, unit);

  const setActual = (name, value) => {
    const row = data.hotels.find((r) => r.unit === unit && r.section === SECTION_TITLE && r.name === name);
    if (row) row.actual = String(value);
  };
  setActual('Tomorrow Occupancy Forecast %', occPct);
  setActual('Arrivals', arrivals);
  setActual('Departures', departures);
  data.forecastDate = forecastDate;

  data.importSource = {
    ...(data.importSource ?? {}),
    forecastFile: path.basename(file),
    forecastImportedAt: new Date().toISOString(),
    forecastVersion: FORECAST_IMPORT_VERSION
  };

  await writeDailyJson(reportDate, data);

  return { ok: true, date: reportDate, unit, forecastFor: forecastDate, mapped: { occPct, arrivals, departures } };
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
