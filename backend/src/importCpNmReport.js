import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

// Parses the IDS Next FortuneNext automated night-audit email for CP NM (Vashi).
//
//   importCpNmManagerFlash   ← "Manager_Flash_Report_*"
//                               Room Revenue, Occupancy %, Rooms Sold, ARR, RevPAR,
//                               F&B Revenue, Settlement modes.
//
//   importCpNmHistForecast   ← "History_and_Forecast_Report_*"  (the "History_and_…" attachment)
//                               Tomorrow Occupancy %, Expected Arrivals, Expected Departures.

const UNIT = 'CP NM';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, decimals = 2) {
  return String(Math.round(num(value) * (10 ** decimals)) / (10 ** decimals));
}

// Find row whose col-0 or col-1 exactly matches any of the given labels
// (case-insensitive, whitespace-normalised).
function findRow(rows, ...labels) {
  const lower = labels.map((l) => l.toLowerCase().replace(/\s+/g, ' ').trim());
  return rows.find((row) => {
    const c0 = String(row[0] ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const c1 = String(row[1] ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    return lower.includes(c0) || lower.includes(c1);
  }) ?? [];
}

// Revenue rows — standard hotel layout:
//   col 0: label | col 1: Amount | col 2: Allowance | col 3: NET  (today)
//   col 4: blank | col 5: Amount | col 6: Allowance | col 7: NET  (MTD)
// Falls back to col 1 / col 5 when col 3 / col 7 are absent.
function revenueNet(row) {
  const todayNet = row[3] !== undefined && row[3] !== '' ? num(row[3]) : num(row[1]);
  const mtdNet   = row[7] !== undefined && row[7] !== '' ? num(row[7]) : num(row[5]);
  return { actual: todayNet, mtd: mtdNet };
}

// For stat rows (Occ%, ARR, RevPAR, Rooms Sold): return the first non-zero
// numeric value found starting from col 1.
function statFirstVal(row) {
  for (let c = 1; c < row.length; c++) {
    const raw = String(row[c] ?? '').trim();
    if (raw !== '' && !raw.startsWith('-')) {
      const v = num(row[c]);
      if (v !== 0) return v;
    }
  }
  return 0;
}

function setKpi(data, name, values) {
  const row = data.hotels.find((r) => r.unit === UNIT && r.name === name);
  if (!row) return;
  if (values.actual !== undefined) row.actual = values.actual === 0 ? '0' : fmt(values.actual);
  if (values.mtd !== undefined && values.mtd !== 0) row.mtd = fmt(values.mtd, 0);
}

function ensureForecastRows(data) {
  const section = pageSchemas.hotels.find((s) => s.title === 'Forecast');
  if (!section) return;
  data.hotels = data.hotels ?? [];
  const ids = new Set(data.hotels.map((r) => r.id));
  for (const row of schemaRowsToKpis(UNIT, 'hotels', [section])) {
    if (!ids.has(row.id)) data.hotels.push(row);
  }
}

function loadSheet(file) {
  const wb = XLSX.readFile(file, { cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (rows.length > 5) return { rows, sheetName };
  }
  throw new Error(`No usable sheet found. Sheets: ${wb.SheetNames.join(', ')}`);
}

// "30/05/2026" or "30/05/2026(F)" → "2026-05-30".  Handles JS Date objects too.
function toISO(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value ?? '').replace(/\([^)]*\)/g, '').trim(); // strip "(F)" suffix
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  return '';
}

function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Manager Flash Report ─────────────────────────────────────────────────────
// Extracts: Occupancy %, Rooms Sold, Room Revenue, ARR, RevPAR, F&B Revenue,
//           settlement modes (Cash / Card / UPI / City Ledger).
export async function importCpNmManagerFlash(file, outDate) {
  const { rows, sheetName } = loadSheet(file);
  const data = (await readDailyJson(outDate)) ?? buildSeedData();

  // ── Occupancy stats ───────────────────────────────────────────────────────
  const occPctRow    = findRow(rows, 'occupancy %', 'occupancy%', 'occ %', 'occ.%', 'occupancy');
  const roomsSoldRow = findRow(rows,
    'occupied', 'rooms occupied', 'occupied rooms', 'occ. rooms', 'rooms sold', 'occ rooms'
  );
  const arrRow    = findRow(rows, 'arr', 'a.r.r', 'average room rate', 'average rate', 'avg rate');
  const revparRow = findRow(rows, 'rev par', 'revpar', 'revenue per available room', 'rev. par', 'rev.par');

  const occupancyPct = statFirstVal(occPctRow);
  const roomsSold    = Math.round(statFirstVal(roomsSoldRow));
  const arr          = statFirstVal(arrRow);
  const revpar       = statFirstVal(revparRow);
  // MTD rooms — col 2 or 3 depending on layout
  const mtdRooms = num(roomsSoldRow[2]) || num(roomsSoldRow[3]) || 0;

  if (occupancyPct > 0) setKpi(data, 'Occupancy %', { actual: occupancyPct });
  if (roomsSold > 0)    setKpi(data, 'Rooms Sold', { actual: roomsSold, mtd: mtdRooms || undefined });
  if (arr > 0)          setKpi(data, 'ARR', { actual: arr });
  if (revpar > 0)       setKpi(data, 'RevPAR', { actual: revpar });

  // ── Revenue ───────────────────────────────────────────────────────────────
  // "Accommodation" or "Tariff" for room revenue; IDS Next uses "Accommodation".
  const roomRow = findRow(rows,
    'accommodation', 'tariff', 'room revenue', 'rooms revenue', 'total ( a )', 'total (a)'
  );
  const room = revenueNet(roomRow);

  // F&B total
  const fnbRow = findRow(rows,
    'food & beverage', 'food and beverage', 'f & b', 'f&b', 'total ( b )', 'total (b)',
    'restaurant', 'food and bev'
  );
  const fnb = revenueNet(fnbRow);

  // Banquet
  const banquetRow = findRow(rows, 'banquet');
  const banquet    = revenueNet(banquetRow);

  // Other / Miscellaneous
  const otherRow = findRow(rows, 'others', 'other', 'miscellaneous', 'total ( c )', 'total (c)', 'other sales');
  const other    = revenueNet(otherRow);

  if (room.actual > 0)    setKpi(data, 'Room Revenue', room);
  if (fnb.actual > 0)     setKpi(data, 'Bougainvillea Revenue', fnb); // schema catch-all for CP NM F&B
  if (banquet.actual > 0) setKpi(data, 'Revenue Today', banquet);

  const pnlTotal = room.actual + fnb.actual + banquet.actual + other.actual;
  if (pnlTotal > 0) {
    data.pnl = (data.pnl ?? []).map((r) =>
      r.unit === UNIT ? { ...r, revenueToday: fmt(pnlTotal) } : r
    );
  }

  // ── Settlement ────────────────────────────────────────────────────────────
  const cashRow    = findRow(rows, 'cash');
  const ccRow      = findRow(rows, 'credit card', 'card', 'debit card');
  const upiRow     = findRow(rows, 'upi');
  const companyRow = findRow(rows, 'city ledger', 'company', 'company account', 'ledger');

  const getAmt = (row) => {
    const v3 = row[3] !== undefined && row[3] !== '' ? num(row[3]) : null;
    return v3 !== null ? v3 : num(row[1]);
  };

  data.settlement = data.settlement ?? {};
  const cashAmt    = getAmt(cashRow);
  const ccAmt      = getAmt(ccRow);
  const upiAmt     = getAmt(upiRow);
  const companyAmt = getAmt(companyRow);

  if (cashAmt > 0)    data.settlement.Cash = { ...(data.settlement.Cash ?? {}), [UNIT]: String(cashAmt) };
  if (ccAmt > 0)      data.settlement['Credit Card'] = { ...(data.settlement['Credit Card'] ?? {}), [UNIT]: String(ccAmt) };
  if (upiAmt > 0)     data.settlement.UPI = { ...(data.settlement.UPI ?? {}), [UNIT]: String(upiAmt) };
  if (companyAmt > 0) data.settlement['City Ledger/Credit'] = { ...(data.settlement['City Ledger/Credit'] ?? {}), [UNIT]: String(companyAmt) };

  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmFile: path.basename(file),
    cpNmImportedAt: new Date().toISOString(),
    cpNmNotes: `Sheet "${sheetName}": occ=${occupancyPct}%, rooms=${roomsSold}, arr=${arr}, revpar=${revpar}, room=${room.actual}, fnb=${fnb.actual}`
  };

  await writeDailyJson(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT,
    mapped: {
      occupancyPct, roomsSold, arr, revpar,
      roomRevenue: room.actual, fnbRevenue: fnb.actual,
      banquetRevenue: banquet.actual, pnlTotal,
      cash: cashAmt, creditCard: ccAmt, upi: upiAmt, cityLedger: companyAmt
    }
  };
}

// ─── History & Forecast Report ────────────────────────────────────────────────
// Finds tomorrow's forecast row and writes:
//   Tomorrow Occupancy Forecast %, Arrivals, Departures  → Forecast section of CP NM.
//
// The report is a date-indexed table; each row has a Date column and sub-columns
// for Occ%, expected Arrivals (Arr), expected Departures (Dep).
// Forecast rows are typically marked with "(F)" in the date cell.
export async function importCpNmHistForecast(file, outDate) {
  const { rows, sheetName } = loadSheet(file);
  const data = (await readDailyJson(outDate)) ?? buildSeedData();
  ensureForecastRows(data);

  // ── Resolve column positions from the header row ──────────────────────────
  let cols = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const idx = {};
    row.forEach((cell, c) => {
      const label = String(cell ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
      if (/^date$/.test(label) && idx.date == null)             idx.date = c;
      if (/^arr(ivals?)?$/.test(label) && idx.arr == null)      idx.arr = c;
      if (/^dep(artures?)?$/.test(label) && idx.dep == null)    idx.dep = c;
      if (/occ\s*%|occupancy\s*%|^%$/.test(label) && idx.occPct == null) idx.occPct = c;
    });
    if (idx.date != null && (idx.occPct != null || idx.arr != null || idx.dep != null)) {
      cols = { headerRow: r, ...idx };
      break;
    }
  }
  if (!cols) throw new Error(`No forecast header (Date / Arr / Dep / Occ%) found. Sheet: ${sheetName}`);

  // ── Find tomorrow's forecast row ──────────────────────────────────────────
  const tomorrow = isoAddDays(outDate, 1);
  let forecastRow = null;
  for (let r = cols.headerRow + 1; r < rows.length; r++) {
    const iso = toISO(rows[r]?.[cols.date]);
    if (iso === tomorrow) { forecastRow = rows[r]; break; }
  }

  if (!forecastRow) {
    // Soft fail — report is accepted but data stays blank (stale / non-matching email)
    console.warn(`[importCpNmHistForecast] No row for ${tomorrow} found in ${sheetName}. Available dates: ${
      rows.slice(cols.headerRow + 1).map((r) => toISO(r[cols.date])).filter(Boolean).slice(0, 5).join(', ')
    }`);
    return { ok: false, pending: true, reason: 'no-forecast-row', date: outDate, forecastFor: tomorrow };
  }

  const occPct     = cols.occPct != null ? num(forecastRow[cols.occPct]) : 0;
  const arrivals   = cols.arr != null ? Math.round(num(forecastRow[cols.arr])) : 0;
  const departures = cols.dep != null ? Math.round(num(forecastRow[cols.dep])) : 0;

  const setForecast = (name, value) => {
    const row = data.hotels.find((r) => r.unit === UNIT && r.section === 'Forecast' && r.name === name);
    if (row && value > 0) row.actual = String(value);
  };

  setForecast('Tomorrow Occupancy Forecast %', occPct);
  setForecast('Arrivals', arrivals);
  setForecast('Departures', departures);
  data.forecastDate = tomorrow;

  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmForecastFile: path.basename(file),
    cpNmForecastImportedAt: new Date().toISOString()
  };

  await writeDailyJson(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT, forecastFor: tomorrow,
    mapped: { occPct, arrivals, departures }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , mode = 'flash', file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) {
    console.error('Usage: node importCpNmReport.js <flash|forecast> <file> [YYYY-MM-DD]');
    process.exit(1);
  }
  const { closeDailyStore } = await import('./dailyStore.js');
  const fn = mode === 'forecast' ? importCpNmHistForecast : importCpNmManagerFlash;
  fn(file, outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
