import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

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

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pull the "HH:MM" half out of a "29-MAY-2026 / 07:00" timestamp cell. */
function timePart(value) {
  const m = /(\d{1,2}:\d{2})\s*$/.exec(clean(value));
  return m ? m[1] : '';
}

const isFunctionRow = (cell) => /^\d+\s*\/\s*\d+$/.test(clean(cell)); // "28978 / 1"

/**
 * Parses the HCP_EVENT banquet booking sheet into the daily function lists.
 *
 * The sheet groups confirmed functions under "Event Date:DD-MMM-YYYY" headers and
 * carries TWO days — the report day ("today") and the next day ("tomorrow"). Each
 * function is a main row (Res#/Party/Function/From/To/Pax/…/Net.Amt/Status) followed
 * by a "Room: <Hall>" detail row.
 *
 * Date note: events are placed by their actual date — functions on `outDate` go to
 * `banquetToday`, functions on `outDate + 1` go to `banquetTomorrow`. If the file's
 * dates don't line up with outDate (run-date drift), we fall back to treating the
 * earliest date in the file as "today" and the next as "tomorrow", and warn.
 */
export async function importEvents(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  let rows = null;
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (r.some((row) => isFunctionRow(row?.[0]))) { rows = r; break; }
  }
  if (!rows) throw new Error(`No function rows found. Sheets: ${wb.SheetNames.join(', ')}`);

  const events = [];
  let eventDate = '';
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const c0 = clean(row?.[0]);

    if (/^Event Date:/i.test(c0)) { eventDate = toISO(c0); continue; }
    if (/^S\s*U\s*M\s*M\s*A\s*R\s*Y/i.test(c0)) break; // summary block — stop
    if (!isFunctionRow(c0) || !eventDate) continue;

    // The hall sits on the following "Room:" detail row.
    const detail = rows[r + 1];
    const venue = detail && /^Room:/i.test(clean(detail[0])) ? clean(detail[1]) : '';

    const fromTime = timePart(row[3]);
    const toTime = timePart(row[4]);
    events.push({
      date: eventDate,
      marketSegment: clean(row[1]),                                  // party / client
      pax: String(Math.round(num(row[5]))),
      venue,
      session: fromTime && toTime ? `${fromTime}–${toTime}` : (fromTime || ''),
      revenue: String(Math.round(num(row[10]) || num(row[7]))),      // Net.Amt, else Value
      notes: [clean(row[2]), clean(row[11])].filter(Boolean).join(' · ') // Function · Status
    });
  }

  if (!events.length) throw new Error('No confirmed functions parsed.');

  // Primary mapping: by actual date against the report date and the day after.
  const tomorrow = addDays(outDate, 1);
  let today = events.filter((e) => e.date === outDate);
  let next = events.filter((e) => e.date === tomorrow);

  // Fallback for run-date drift: earliest date in file = "today", next = "tomorrow".
  if (!today.length && !next.length) {
    const dates = [...new Set(events.map((e) => e.date))].sort();
    console.warn(`[importEvents] No events on report date ${outDate}; using file dates ${dates.join(', ')} (earliest = today).`);
    today = events.filter((e) => e.date === dates[0]);
    next = dates[1] ? events.filter((e) => e.date === dates[1]) : [];
  }

  const strip = (e) => ({ marketSegment: e.marketSegment, pax: e.pax, venue: e.venue, session: e.session, revenue: e.revenue, notes: e.notes });

  const data = (await readDailyJson(outDate)) ?? buildSeedData();
  data.banquetToday = today.map(strip);
  data.banquetTomorrow = next.map(strip);

  data.importSource = {
    ...(data.importSource ?? {}),
    eventsFile: path.basename(file),
    eventsImportedAt: new Date().toISOString()
  };

  await writeDailyJson(outDate, data);

  return { ok: true, date: outDate, unit, mapped: { today: today.length, tomorrow: next.length } };
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
