import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

// Persisted in importSource as `eventsVersion`; the email handler's matching
// `importVersion` triggers a one-time re-import when this changes. v4: file under the
// run's flash date (outDate), not the earliest event date. v5: persist banquet*Date for
// the section headers. v6: 3-day file (D business-day / D+1 today / D+2 tomorrow) — D+1/D+2
// feed the function lists and D feeds the Banquets Covers + No. of Functions KPIs.
// v7: supports the newer detailed "Function Details" banquet report layout.
// v8: anchor on outDate (subject-derived business date) instead of the earliest
// section — the hotel's export now starts at D−1, so "earliest = D" misfiled every
// bundle one day early (proven 2026-07-13 against night-audit outlet revenue).
export const EVENTS_IMPORT_VERSION = 8;

const BANQUETS_SECTION = 'Banquets';

/** "2026-05-30" + 1 → "2026-05-31". */
function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Makes sure the Banquets KPI rows exist for `unit` (older daily files predate them). */
function ensureSectionRows(data, unit) {
  const section = pageSchemas.hotels.find((s) => s.title === BANQUETS_SECTION);
  if (!section) return;
  data.hotels = data.hotels ?? [];
  const existingIds = new Set(data.hotels.map((r) => r.id));
  for (const row of schemaRowsToKpis(unit, 'hotels', [section])) {
    if (!existingIds.has(row.id)) data.hotels.push(row);
  }
}

const clean = (value) => String(value ?? '').trim();

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(clean(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

const MONTHS = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
};

/** "29-MAY-2026" → "2026-05-29". Returns '' if not a date. */
function toISO(value) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(clean(value));
  if (!m) return '';
  const mo = MONTHS[m[2].toUpperCase()];
  return mo ? `${m[3]}-${mo}-${m[1].padStart(2, '0')}` : '';
}

/** Pull the "HH:MM" half out of a "29-MAY-2026 / 07:00" timestamp cell. */
function timePart(value) {
  const m = /(\d{1,2}:\d{2})\s*$/.exec(clean(value));
  return m ? m[1] : '';
}

const isFunctionRow = (cell) => /^\d+\s*\/\s*\d+(?:\s*\/\s*[A-Za-z])?$/.test(clean(cell)); // "28978 / 1" or "29559 / 1 / C"

function parseFunctionTiming(value) {
  const m = /Function:\s*(.*?)\s*\(\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s+(\d{1,2}:\d{2})/i.exec(clean(value));
  if (!m) return {};
  return {
    functionName: clean(m[1]),
    date: toISO(m[2]),
    session: `${m[3]}-${m[5]}`
  };
}

function parseDetailedEvents(rows) {
  const events = [];
  let eventDate = '';

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const c0 = clean(row?.[0]);

    if (/^Event Date:/i.test(c0)) { eventDate = toISO(c0); continue; }
    if (/^S\s*U\s*M\s*M\s*A\s*R\s*Y/i.test(c0)) break;
    if (!isFunctionRow(c0) || !eventDate) continue;

    const block = [];
    for (let i = r; i < rows.length; i += 1) {
      const nextC0 = clean(rows[i]?.[0]);
      if (i > r && (/^Event Date:/i.test(nextC0) || isFunctionRow(nextC0) || /^S\s*U\s*M\s*M\s*A\s*R\s*Y/i.test(nextC0))) break;
      block.push(rows[i]);
    }

    const joinedRows = block.map((b) => b.map(clean).join(' | '));
    const partyRow = block.find((b) => /^Confirm/i.test(clean(b?.[0]))) ?? [];
    const functionRow = block.find((b) => clean(b?.[1]).startsWith('Room:') && /^Function:/i.test(clean(b?.[2]))) ?? [];
    const timing = parseFunctionTiming(functionRow[2]);
    const paxMatch = /Pax Exp\s*\/\s*Gau:\s*([\d,.]+)\s*\/\s*([\d,.]+)/i.exec(joinedRows.join(' | '));
    const revenueMatch = /Exp\.?Rev:\s*([\d,.]+)/i.exec(joinedRows.join(' | '));
    const marketMatch = /Mkt\.?\s*Sgmt:\s*([^|]+)/i.exec(joinedRows.join(' | '));
    const party = clean(partyRow[1]) || clean(partyRow[2]) || c0;

    events.push({
      date: timing.date || eventDate,
      marketSegment: party,
      pax: String(Math.round(num(paxMatch?.[1]))),
      venue: clean(functionRow[1]).replace(/^Room:\s*/i, ''),
      session: timing.session || '',
      revenue: String(Math.round(num(revenueMatch?.[1]))),
      notes: [timing.functionName, marketMatch?.[1]?.trim()].filter(Boolean).join(' - ')
    });
  }

  return events.filter((event) => event.date && (Number(event.pax) > 0 || event.venue || event.session));
}

function parseCompactEvents(rows) {
  const events = [];
  let eventDate = '';

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const c0 = clean(row?.[0]);

    if (/^Event Date:/i.test(c0)) { eventDate = toISO(c0); continue; }
    if (/^S\s*U\s*M\s*M\s*A\s*R\s*Y/i.test(c0)) break;
    if (!isFunctionRow(c0) || !eventDate) continue;

    const detail = rows[r + 1];
    const venue = detail && /^Room:/i.test(clean(detail[0])) ? clean(detail[1]) : '';

    const fromTime = timePart(row[3]);
    const toTime = timePart(row[4]);
    events.push({
      date: eventDate,
      marketSegment: clean(row[1]),
      pax: String(Math.round(num(row[5]))),
      venue,
      session: fromTime && toTime ? `${fromTime}-${toTime}` : (fromTime || ''),
      revenue: String(Math.round(num(row[10]) || num(row[7]))),
      notes: [clean(row[2]), clean(row[11])].filter(Boolean).join(' - ')
    });
  }

  return events.filter((event) => event.date && (Number(event.pax) > 0 || event.venue || event.session));
}

/**
 * Parses the HCP_EVENT banquet booking sheet into the daily function lists.
 *
 * The sheet groups confirmed functions under "Event Date:DD-MMM-YYYY" headers and
 * carries a variable window of days around the business date D (`outDate`): current
 * exports run D−1…D+2, older ones D…D+2. Each function is a main row
 * (Res#/Party/Function/From/To/Pax/…/Net.Amt/Status) followed by a "Room: <Hall>"
 * detail row.
 *
 * Date note: the HCP report for business date D is generated the morning the D flash is
 * read, so its day labels run one ahead of the flash. We select by explicit date:
 *   D   → Banquets Covers (Σ pax) + No. of Functions (count)
 *   D+1 → banquetToday list
 *   D+2 → banquetTomorrow list
 * Everything is filed under D (`outDate`, anchored on the email subject by the caller).
 */
export async function importEvents(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  let rows = null;
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (r.some((row) => isFunctionRow(row?.[0]) || row.some((cell) => /^Function Details:/i.test(clean(cell))))) { rows = r; break; }
  }
  if (!rows) throw new Error(`No function rows found. Sheets: ${wb.SheetNames.join(', ')}`);

  const hasDetailedRows = rows.some((row) => row.some((cell) => /^Function Details:/i.test(clean(cell))));
  const events = hasDetailedRows ? parseDetailedEvents(rows) : parseCompactEvents(rows);

  if (!events.length) throw new Error('No confirmed functions parsed.');

  // The export spans a variable window around business day D (July 2026 files run
  // D−1…D+2; older exports were D…D+2), so the earliest section is NOT a reliable
  // anchor — assuming "earliest = D" filed whole bundles one day early. `outDate`
  // arrives already anchored (subject "hcp report DD.MM.YY", else a sibling
  // handler's detected date, else the run date): trust it whenever the file's
  // window covers it, and only fall back to the D−1-start layout when it can't.
  const dates = [...new Set(events.map((e) => e.date))].sort();
  const businessDate = (outDate >= dates[0] && outDate <= dates.at(-1))
    ? outDate
    : isoAddDays(dates[0], 1);
  const todayDate = isoAddDays(businessDate, 1);   // D+1 — "today" from the reader's viewpoint
  const tomorrowDate = isoAddDays(businessDate, 2); // D+2 — "tomorrow"
  if (businessDate !== outDate) {
    console.log(`[importEvents] outDate ${outDate} outside file window ${dates[0]}…${dates.at(-1)} → filing under ${businessDate} (earliest section + 1).`);
  }

  const businessEvents = events.filter((e) => e.date === businessDate);
  const today = events.filter((e) => e.date === todayDate);
  const next = events.filter((e) => e.date === tomorrowDate);
  const reportDate = businessDate;

  const strip = (e) => ({ marketSegment: e.marketSegment, pax: e.pax, venue: e.venue, session: e.session, revenue: e.revenue, notes: e.notes });

  const data = (await readDaily(reportDate)) ?? buildSeedData();
  data.banquetToday = today.map(strip);
  data.banquetTomorrow = next.map(strip);
  data.banquetTodayDate = todayDate;
  data.banquetTomorrowDate = tomorrowDate;

  // Business-day (D) functions feed the Banquets KPI summary. Revenue Today is left to the
  // Night Audit importer (its source of truth), so only Covers + No. of Functions here.
  ensureSectionRows(data, unit);
  const setBanquetKpi = (name, value) => {
    const row = data.hotels.find((r) => r.unit === unit && r.section === BANQUETS_SECTION && r.name === name);
    if (row) row.actual = String(value);
  };
  const businessPax = businessEvents.reduce((sum, e) => sum + (Number(e.pax) || 0), 0);
  setBanquetKpi('Covers', businessPax);
  setBanquetKpi('No. of Functions', businessEvents.length);

  data.importSource = {
    ...(data.importSource ?? {}),
    eventsFile: path.basename(file),
    eventsImportedAt: new Date().toISOString(),
    eventsVersion: EVENTS_IMPORT_VERSION
  };

  await writeDaily(reportDate, data);

  return {
    ok: true,
    date: reportDate,
    detectedDate: businessDate,
    unit,
    mapped: {
      business: `${businessDate} (${businessEvents.length} fn, ${businessPax} pax)`,
      today: `${todayDate} (${today.length})`,
      tomorrow: `${tomorrowDate} (${next.length})`
    }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10), unit = 'CP Nagpur'] = process.argv;
  if (!file) { console.error('Usage: node importEvents.js <file> [YYYY-MM-DD] [unit]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importEvents(file, outDate, unit)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
