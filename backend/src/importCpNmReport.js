import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { canonicalMixName, pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

// CP NM (Vashi) IDS Next reports arrive as PDFs, not XLS files.
// All 6 attachments in the nightly email are PDFs:
//   Manager_Flash_Report_For_*          ← room/occupancy/F&B stats + tomorrow's arrivals/departures
//   History_and_Forecast_Report_*       ← tomorrow's occupancy forecast %
//   Pay_Type_Report_*                   ← settlement modes (Cash / Card / UPI / City Ledger)
//   Arrival_Report_*, Departure_Report_*, Guest_In_House_Report_* ← not imported
// A separate "Market Segment Report" email (account.navimumbai@cpgh.in) attaches the
// "Market Analysis Comparison Report Between …" XLSX → importCpNmMarketSegment.

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const UNIT = 'CP NM';
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function extractPdfText(filePath) {
  const buffer = await fs.readFile(filePath);
  const result = await pdfParse(buffer);
  return result.text;
}

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, decimals = 2) {
  return String(Math.round(num(value) * (10 ** decimals)) / (10 ** decimals));
}

function setKpi(data, name, values) {
  const row = data.hotels.find((r) => r.unit === UNIT && r.name === name);
  if (!row) return;
  if (values.actual !== undefined) row.actual = values.actual === 0 ? '0' : fmt(values.actual);
  if (values.mtd !== undefined && values.mtd !== 0) row.mtd = fmt(values.mtd, 0);
}

function setForecast(data, name, value) {
  const row = data.hotels.find((r) => r.unit === UNIT && r.section === 'Forecast' && r.name === name);
  if (row && value > 0) row.actual = String(value);
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

// Adds a CP NM-only F&B Outlets row that has no seed-schema counterpart (adding
// it to the shared schema would surface a permanently blank row for CP Nagpur).
// The id follows schemaRowsToKpis' convention; merge layers keep non-seed rows.
function ensureFnbOutletRow(data, name) {
  data.hotels = data.hotels ?? [];
  if (data.hotels.some((r) => r.unit === UNIT && r.name === name)) return;
  data.hotels.push({
    id: `hotels:${UNIT}:F&B Outlets:${name}`.replaceAll(/\s+/g, '-').toLowerCase(),
    unit: UNIT,
    section: 'F&B Outlets',
    name,
    target: '',
    actual: '',
    mtd: '',
    ytd: '',
    direction: 'min'
  });
}

// Extract all "Rs X,XXX.XX" values from a text segment.
// Use exactly 2 decimal places so trailing integers aren't swallowed greedily.
function extractRsValues(text) {
  return [...text.matchAll(/Rs\s*([\d,]+\.\d{2})/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')));
}

// First Rs value on a line, or 0
function firstRs(line) {
  return extractRsValues(line)[0] ?? 0;
}

// First decimal (float) value on a line, ignoring Rs amounts
function firstFloat(line) {
  const cleaned = line.replace(/Rs\s*[\d,]+\.\d+/g, '');
  return parseFloat(/(\d+\.\d+)/.exec(cleaned)?.[1] ?? '0') || 0;
}

// The History & Forecast row concatenates preceding integers with the occ% value:
// "Mon116228.95%" where true occ% is 28.95.  Find the decimal suffix ≤ 100.
function extractEmbeddedOccPct(str) {
  const m = /(\d+)(\.\d{2})%/.exec(str);
  if (!m) return 0;
  const intPart = m[1];
  const decPart = m[2]; // ".95"
  const direct = parseFloat(intPart + decPart);
  if (direct >= 0 && direct <= 100) return direct;
  // Strip leading digits until the remaining integer part gives a valid percentage
  for (let i = 1; i < intPart.length; i++) {
    const candidate = parseFloat(intPart.slice(i) + decPart);
    if (candidate >= 0 && candidate <= 100) return candidate;
  }
  return 0;
}

// Split a run of concatenated small integers — each must be ≤ `max`.
// e.g. splitSmallInts("1162", 39, 3) → [11, 6, 2]
function splitSmallInts(str, max, count) {
  const s = String(str ?? '').trim().replace(/\D/g, '');
  const result = [];
  let i = 0;
  for (let n = 0; n < count && i < s.length; n++) {
    // Try 2-digit first, then 1-digit
    const two = parseInt(s.slice(i, i + 2));
    if (s.length - i >= 2 && two <= max) { result.push(two); i += 2; }
    else { result.push(parseInt(s.slice(i, i + 1)) || 0); i += 1; }
  }
  return result;
}

// Fit a concatenated digit run to EXACTLY `count` columns, consuming the whole
// string. Greedy 2-digit-first splitting misreads runs like "30000024"
// ([Dep=3, DayUse..HouseUse=0×5, Pax=24] read as Dep=30) whenever the greedy
// token still fits under `max`; requiring an exact column fit rules those out.
// IDS Next never zero-pads, so only a lone "0" may start with 0. Every column
// is capped at `max` except the last (`lastMax`, e.g. Pax). Returns ALL valid
// splits — the caller picks by its own tie-break.
function fitConcatColumns(str, count, max, lastMax = max) {
  const s = String(str ?? '').trim().replace(/\D/g, '');
  const solutions = [];
  const walk = (i, acc) => {
    if (acc.length === count) {
      if (i === s.length) solutions.push([...acc]);
      return;
    }
    const isLast = acc.length === count - 1;
    const cap = isLast ? lastMax : max;
    for (let len = 1; len <= String(cap).length && i + len <= s.length; len++) {
      const tok = s.slice(i, i + len);
      if (len > 1 && tok[0] === '0') break; // no zero-padding
      const val = parseInt(tok, 10);
      if (val > cap) break;
      acc.push(val);
      walk(i + len, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return solutions;
}

// Extract the first (day-column) value from an IDS Next concatenated integer string.
// IDS Next never zero-pads: 0 → "0", 5 → "5", 12 → "12", so if the string starts
// with "0" the day value IS zero (e.g. "06150314" → day=0, month=6, year=15, …).
function firstSmallInt(str, max) {
  const s = String(str ?? '').trim().replace(/\D/g, '');
  if (!s) return 0;
  if (s[0] === '0') return 0;           // leading zero ⇒ day value is 0
  if (s.length >= 2) {
    const two = parseInt(s.slice(0, 2));
    if (two <= max) return two;
  }
  return parseInt(s[0]) || 0;
}

// "2026-05-31" + 2 → "2026-06-02"
function isoAddDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-05-31" + 1 → formatted "Jun 01, 2026"
function isoToDisplay(iso, daysDelta = 0) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysDelta);
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${mon} ${day}, ${d.getUTCFullYear()}`;
}

// ─── Manager Flash Report ─────────────────────────────────────────────────────
// Source: Manager_Flash_Report_For_YYYY-MM-DD_*.pdf  (one business day behind email date)
// Extracts:
//   Occupancy %, Rooms Sold, ADR, RevPAR, Room Revenue, F&B Revenue,
//   Tomorrow Arrivals, Tomorrow Departures, Total Revenue → P&L
export async function importCpNmManagerFlash(file, outDate) {
  const text = await extractPdfText(file);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const find = (pattern) => lines.find((l) => pattern.test(l)) ?? '';

  // Total rooms in hotel (used to split concatenated integers)
  const totalRoomsRaw = find(/Total Rooms in Hotel/i)
    .replace(/Total Rooms in Hotel[^)]*\)/i, '').trim();
  const totalRooms = parseInt(totalRoomsRaw.slice(0, 2)) || 39;

  // Occupancy % — "% Rooms Occupied minus OOO47.3760.40…" — first float is today
  const occPct = firstFloat(find(/% Rooms Occupied minus OOO/i));
  const roomsSold = Math.round(totalRooms * occPct / 100);

  // ADR — "ADRRs 4,573.06Rs …" (NOT "ADR minus Comp")
  const arr = firstRs(find(/^ADRRs/i));

  // RevPAR — "RevPARRs 2,166.00Rs …" (NOT "RevPAR Include DNR")
  const revpar = firstRs(find(/^RevPARRs/i));

  // Room Revenue
  const roomRevenue = firstRs(find(/^Room RevenueRs/i));

  // POS (F&B) breakdown — each line carries This-Year Day | MTD | YTD then
  // Last-Year Day | MTD | YTD; empty cells print "--", so tokenize both forms
  // to keep the columns aligned when a value is missing.
  const posRow = (pattern) => {
    const tokens = find(pattern).match(/Rs\s*[\d,]+\.\d{2}|--/g) ?? [];
    const vals = tokens.map((t) => (t === '--' ? 0 : num(t.replace(/^Rs\s*/, ''))));
    return { day: vals[0] ?? 0, mtd: vals[1] ?? 0, ytd: vals[2] ?? 0 };
  };
  const roomService = posRow(/^Room Service(?=Rs|--)/i);
  const bougainvillea = posRow(/^Bougainvillea(?=Rs|--)/i);
  const laundry = posRow(/^Laundry(?=Rs|--)/i);
  const roomServiceRevenue = roomService.day;
  const bougainvilleaRevenue = bougainvillea.day;
  const totalFnbRevenue = firstRs(find(/^Total POS RevenueRs/i));

  // Total Revenue
  const totalRevenue = firstRs(find(/^Total RevenueRs/i));

  // ── Market Segments (in-house room counts by booking category) ───────────────
  // IDS Next never zero-pads integers, so "0..." means the day value is 0.
  const segVal = (label) => {
    const raw = find(label).replace(label, '').trim();
    return firstSmallInt(raw, totalRooms);
  };
  const segCorporate  = segVal(/^Company Rooms In-House/i);
  const segFit        = segVal(/^Individual Rooms In-House/i);
  const segOta        = segVal(/^Travel Agent Rooms In-House/i); // TA + OTA combined
  const segGroup      = segVal(/^Block Rooms In-House/i);
  const segWalkIn     = segVal(/^Walk-in Rooms/i);
  const segNoShow     = segVal(/^No Show Rooms/i);

  // ── Write to daily JSON ──────────────────────────────────────────────────
  const data = (await readDaily(outDate)) ?? buildSeedData();
  ensureForecastRows(data);

  if (occPct > 0)          setKpi(data, 'Occupancy %', { actual: occPct });
  if (roomsSold > 0)       setKpi(data, 'Rooms Sold', { actual: roomsSold });
  if (arr > 0)             setKpi(data, 'ARR', { actual: arr });
  if (revpar > 0)          setKpi(data, 'RevPAR', { actual: revpar });
  if (roomRevenue > 0)     setKpi(data, 'Room Revenue', { actual: roomRevenue });
  // F&B Outlets — day value plus the flash's own MTD (authoritative over the
  // computed month-to-date fill). Laundry has no seed row in the shared schema
  // (it would render as a blank row for CP Nagpur), so it's created CP NM-only.
  if (bougainvillea.day > 0 || bougainvillea.mtd > 0) setKpi(data, 'Bougainvillea Revenue', { actual: bougainvillea.day, mtd: bougainvillea.mtd });
  if (roomService.day > 0 || roomService.mtd > 0)     setKpi(data, 'In-Room Dining Revenue', { actual: roomService.day, mtd: roomService.mtd });
  if (laundry.day > 0 || laundry.mtd > 0) {
    ensureFnbOutletRow(data, 'Laundry Revenue');
    setKpi(data, 'Laundry Revenue', { actual: laundry.day, mtd: laundry.mtd });
  }

  // Market Segments — best-effort from Manager Flash in-house counts
  // "Company Rooms In-House" → Corporate
  // "Individual Rooms In-House" → FIT/Leisure (non-block, non-company individual guests)
  // "Travel Agent Rooms In-House" → OTA (TA + OTA combined; closest available proxy)
  // "Block Rooms In-House" → Group Bookings
  // "Walk-in Rooms" → Walk-ins
  // "No Show Rooms" → Cancellations/No-shows
  setKpi(data, 'Corporate',               { actual: segCorporate });
  setKpi(data, 'FIT/Leisure',             { actual: segFit });
  setKpi(data, 'OTA (MMT/Booking.com)',   { actual: segOta });
  setKpi(data, 'Group Bookings',          { actual: segGroup });
  setKpi(data, 'Walk-ins',               { actual: segWalkIn });
  setKpi(data, 'Cancellations/No-shows', { actual: segNoShow });

  // Arrivals / Departures for "tomorrow" from the Manager Flash are D+1 (e.g. Jun 01
  // when the flash date is May 31).  The History & Forecast report provides the D+2 row
  // (Jun 02) which is what the Forecast section header shows — consistent with CP Nagpur.
  // So we do NOT write Manager Flash's tomorrow figures here; they come from importCpNmHistForecast.

  if (totalRevenue > 0) {
    data.pnl = (data.pnl ?? []).map((r) =>
      r.unit === UNIT ? { ...r, revenueToday: fmt(totalRevenue) } : r
    );
  }

  // The CP NM occupancy-mix donut is fed by importCpNmMarketSegment (real
  // segment-wise revenue from the Market Analysis Comparison report), not from
  // these in-house counters. Days without that report fall back to a
  // segment-only mix synthesized from cpNmNotes (mixEntryFromNotes in index.js).
  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmFile: path.basename(file),
    cpNmImportedAt: new Date().toISOString(),
    cpNmNotes: `occ=${occPct}%, rooms=${roomsSold}, arr=${arr}, revpar=${revpar}, roomRev=${roomRevenue}, fnb=${totalFnbRevenue}, total=${totalRevenue}, corp=${segCorporate}, fit=${segFit}, ota=${segOta}, grp=${segGroup}, walkin=${segWalkIn}, noshow=${segNoShow}`
  };

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT,
    mapped: {
      totalRooms, occupancyPct: occPct, roomsSold, arr, revpar,
      roomRevenue, bougainvilleaRevenue, roomServiceRevenue,
      laundryRevenue: laundry.day, totalFnbRevenue, totalRevenue,
      segments: { corporate: segCorporate, fit: segFit, ota: segOta, group: segGroup, walkIn: segWalkIn, noShow: segNoShow }
    }
  };
}

// ─── Market Segment Report ────────────────────────────────────────────────────
// Source: "Market Analysis Comparison Report Between <Mon> <D>, <YYYY> and ….xlsx"
// attached to the separate "Market Segment Report" email (account.navimumbai@cpgh.in).
// Sheet layout: a title row, then a two-block header row —
//   # | Market Segment | Nights | Occupancy% | Pax | Room Revenue | Revenue% | ARR/AGR | ARP | <last-year repeat>
// — then detail rows grouped under "History" / "Forecast" section labels (printed in
// the "#" column), each section closed by a SubTotal row and the sheet by a Total row.
// Detail rows across both sections sum to the Total row, so all are tallied and the
// SubTotal/Total rows are skipped (Total is kept as a reconciliation guard).
// Feeds the CP NM occupancy-mix donut with REAL segment-wise nights/pax/revenue.
// CP NM tracks no Source of Business breakdown, so sbo is written empty on purpose.
export async function importCpNmMarketSegment(file, outDate) {
  const wb = XLSX.readFile(file, { cellDates: true });

  let rows = null;
  let cols = null;
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    for (let i = 0; i < r.length && !cols; i += 1) {
      const label = (c) => String(r[i][c] ?? '').trim().toLowerCase();
      const nameCol = r[i].findIndex((_, c) => label(c) === 'market segment');
      if (nameCol === -1) continue;
      // The current-year block comes first, so take the FIRST Nights/Pax/Room
      // Revenue after the segment-name column (the last-year block repeats them).
      const firstAfterName = (want) => {
        for (let c = nameCol + 1; c < r[i].length; c += 1) if (label(c) === want) return c;
        return -1;
      };
      cols = {
        headerRow: i,
        name: nameCol,
        nights: firstAfterName('nights'),
        pax: firstAfterName('pax'),
        revenue: firstAfterName('room revenue')
      };
      rows = r;
    }
    if (cols) break;
  }
  if (!cols || cols.nights === -1 || cols.revenue === -1) {
    throw new Error(`No "Market Segment" header found. Sheets: ${wb.SheetNames.join(', ')}`);
  }

  const segMap = new Map();
  let footer = null;
  for (let r = cols.headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r];
    const name = String(row[cols.name] ?? '').trim();
    if (!name) continue; // "History" / "Forecast" section labels sit in the "#" column
    if (/^sub\s*total$/i.test(name)) continue;
    if (/^total$/i.test(name)) {
      footer = {
        rooms: Math.round(num(row[cols.nights])),
        pax: cols.pax !== -1 ? Math.round(num(row[cols.pax])) : 0,
        revenue: num(row[cols.revenue])
      };
      continue;
    }
    const rooms = Math.round(num(row[cols.nights]));
    const revenue = num(row[cols.revenue]);
    if (!rooms && !revenue) continue; // segments with last-year activity only
    // Shared canonical vocabulary (canonicalMixName in schema.js) so CP NM
    // charts the same category names as CP Nagpur's donuts.
    const canonical = canonicalMixName('segment', name) || 'Unspecified';
    const entry = segMap.get(canonical) ?? { name: canonical, rooms: 0, revenue: 0, pax: 0 };
    entry.rooms += rooms;
    entry.revenue += revenue;
    entry.pax += cols.pax !== -1 ? Math.round(num(row[cols.pax])) : 0;
    segMap.set(canonical, entry);
  }

  const segment = [...segMap.values()]
    .map((entry) => ({ ...entry, revenue: Math.round(entry.revenue) }))
    .sort((a, b) => b.rooms - a.rooms || b.revenue - a.revenue);
  if (!segment.length) throw new Error('No market-segment detail rows found.');

  const parsedRooms = [...segMap.values()].reduce((sum, entry) => sum + entry.rooms, 0);
  const parsedRevenue = [...segMap.values()].reduce((sum, entry) => sum + entry.revenue, 0);
  if (footer && footer.rooms !== parsedRooms) {
    console.warn(`[importCpNmMarketSegment] Parsed ${parsedRooms} nights but the Total row says ${footer.rooms} — possible layout shift.`);
  }
  if (footer && Math.round(footer.revenue) !== Math.round(parsedRevenue)) {
    console.warn(`[importCpNmMarketSegment] Parsed revenue ${Math.round(parsedRevenue)} but the Total row says ${Math.round(footer.revenue)}.`);
  }

  const totalRooms = footer?.rooms ?? parsedRooms;
  const totalPax = footer?.pax || segment.reduce((sum, entry) => sum + entry.pax, 0);
  const totalRevenue = Math.round(footer?.revenue ?? parsedRevenue);

  const data = (await readDaily(outDate)) ?? buildSeedData();

  data.occupancyMixByUnit = {
    ...(data.occupancyMixByUnit ?? {}),
    [UNIT]: {
      unit: UNIT,
      asOf: outDate,
      totalRooms,
      totalPax,
      totalRevenue,
      // CP NM has no Source of Business breakdown — Market Segment only.
      sbo: [],
      segment
    }
  };

  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmMarketSegmentFile: path.basename(file),
    cpNmMarketSegmentImportedAt: new Date().toISOString()
  };

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT,
    mapped: {
      totalRooms, totalPax, totalRevenue,
      segments: segment.map((entry) => `${entry.name}: ${entry.rooms} nights / ${entry.revenue}`)
    }
  };
}

// ─── History & Forecast Report ────────────────────────────────────────────────
// Source: History_and_Forecast_Report_Between_*.pdf
// The CP NM email is generated at midnight D+1 (e.g. Jun 01 00:07 for May 31 business date).
// When the user reads the May 31 flash on Jun 01 morning, "tomorrow" is Jun 02 (D+2).
// This matches CP Nagpur's convention where HCP_FORE always forecasts D+2 from outDate.
// Row format (concatenated by pdf-parse):
//   "Jun 02, 2026 Tue<rooms><arr><comp><occ%>Rs <rev>Rs <revpar>Rs <rate><dep><other><pax>"
export async function importCpNmHistForecast(file, outDate) {
  const text = await extractPdfText(file);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const data = (await readDaily(outDate)) ?? buildSeedData();
  ensureForecastRows(data);

  // Total rooms — re-derive from Manager Flash data already stored, or fall back to 39
  const cpNmRows = (data.hotels ?? []).filter((r) => r.unit === UNIT);
  const storedRoomsSold = num(cpNmRows.find((r) => r.name === 'Rooms Sold')?.actual ?? 0);
  const storedOcc = num(cpNmRows.find((r) => r.name === 'Occupancy %')?.actual ?? 0);
  const totalRooms = storedOcc > 0 ? Math.round(storedRoomsSold / (storedOcc / 100)) : 39;

  // D+2: "Jun 02, 2026" when outDate is "2026-05-31"
  const forecastDisplay = isoToDisplay(outDate, 2);
  const forecastIso = isoAddDays(outDate, 2);
  const forecastLine = lines.find((l) => l.startsWith(forecastDisplay));

  if (!forecastLine) {
    const available = lines
      .filter((l) => /^[A-Z][a-z]{2} \d{2}, \d{4}/.test(l))
      .map((l) => l.slice(0, 12))
      .slice(0, 5)
      .join(', ');
    console.warn(`[importCpNmHistForecast] No row for "${forecastDisplay}". Available: ${available}`);
    return { ok: false, pending: true, reason: 'no-forecast-row', date: outDate, forecastFor: forecastDisplay };
  }

  // Occ% is embedded after concatenated integers: "Tue104126.32%" → 26.32
  const occPct = extractEmbeddedOccPct(forecastLine);

  // Integers before occ% are embedded inside the occ match itself:
  // "Tue104126.32%" → occRaw="104126.32%", intPart="104126", occ=26.32, prefix="1041"
  // Extract prefix by finding where the percentage value starts within intPart.
  const afterDate = forecastLine.slice(forecastDisplay.length);
  const occMatchFull = /(\d+)(\.\d{2})%/.exec(afterDate);
  let intPrefix = '';
  if (occMatchFull) {
    const [intPart, decPart] = [occMatchFull[1], occMatchFull[2]];
    for (let i = 0; i < intPart.length; i++) {
      const candidate = parseFloat(intPart.slice(i) + decPart);
      if (candidate >= 0 && candidate <= 100) { intPrefix = intPart.slice(0, i); break; }
    }
  }
  const occRaw = occMatchFull?.[0] ?? '';
  const beforeOcc = afterDate.slice(0, afterDate.indexOf(occRaw));
  // beforeOcc has weekday letters only ("Tue"); the digit prefix is inside occRaw
  const intStr = beforeOcc.replace(/\D/g, '') + intPrefix;
  // [RoomsOccupied, ArrRooms, CompRooms] — among exact 3-column fits, pick the
  // one whose RoomsOccupied agrees with occ% × totalRooms (e.g. "6300" is
  // rooms 6 / arr 30 / comp 0, which greedy 2-digit splitting would misread).
  const expectedRooms = Math.round((occPct / 100) * totalRooms);
  const occFits = fitConcatColumns(intStr, 3, totalRooms)
    .sort((a, b) => Math.abs(a[0] - expectedRooms) - Math.abs(b[0] - expectedRooms));
  const arrRooms = occFits.length
    ? occFits[0][1]
    : (splitSmallInts(intStr, totalRooms, 3)[1] ?? 0); // second value = arrivals

  // Integers after the last Rs value: [Dep Rooms][Day Use][No Show][Cncl][DNR][HouseUse][Pax]
  const allRsM = [...forecastLine.matchAll(/Rs\s*[\d,]+\.\d{2}/g)];
  let afterRsStr = '';
  if (allRsM.length > 0) {
    const lastM = allRsM.at(-1);
    afterRsStr = forecastLine.slice(lastM.index + lastM[0].length).replace(/-+/g, '').trim();
  } else {
    const occEnd = forecastLine.indexOf(occRaw) + occRaw.length;
    afterRsStr = forecastLine.slice(occEnd).replace(/-+/g, '').trim();
  }
  // [Dep][DayUse][NoShow][Cncl][DNR][HouseUse][Pax] — the five middle columns
  // are almost always 0, so among exact 7-column fits prefer the one carrying
  // the most zero middles (then the smaller Dep). Pax may run to 3 digits.
  const depFits = fitConcatColumns(afterRsStr, 7, totalRooms, 999);
  const middleZeros = (sol) => sol.slice(1, -1).filter((v) => v === 0).length;
  depFits.sort((a, b) => middleZeros(b) - middleZeros(a) || a[0] - b[0]);
  const depRooms = depFits.length
    ? depFits[0][0]
    : splitSmallInts(afterRsStr, totalRooms, 1)[0];

  if (occPct > 0)    setForecast(data, 'Tomorrow Occupancy Forecast %', occPct);
  if (arrRooms > 0)  setForecast(data, 'Arrivals', arrRooms);
  if (depRooms > 0)  setForecast(data, 'Departures', depRooms);

  data.forecastDate = forecastIso;

  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmForecastFile: path.basename(file),
    cpNmForecastImportedAt: new Date().toISOString()
  };

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT, forecastFor: forecastDisplay,
    mapped: { occPct, arrRooms, depRooms }
  };
}

// ─── Pay Type Report ──────────────────────────────────────────────────────────
// Source: Pay_Type_Report_Between_*.pdf
// The report is a detailed transaction register.  Each payment mode section ends with
// "Total of <Mode>\nRs\n<amount>" or "Total of <Mode>  Rs <amount>" — we capture both.
export async function importCpNmPayType(file, outDate) {
  const text = await extractPdfText(file);

  // Collapse whitespace/newlines around "Rs" so "Total of X\nRs\n12,345.00" becomes parseable
  const collapsed = text.replace(/\s*\n\s*/g, ' ');

  // Extract all "Total of <Mode> Rs <amount>" patterns
  function totalFor(...patterns) {
    for (const pat of patterns) {
      const m = new RegExp(`Total of ${pat}[^R]*Rs\\s*([\\d,]+\\.\\d+)`, 'i').exec(collapsed);
      if (m) return parseFloat(m[1].replace(/,/g, ''));
    }
    return 0;
  }

  // IDS Next Pay Type categories → settlement modes:
  //   Bank Transfer  → NEFT/Bank Transfer  (includes advance deposits for future stays)
  //   Cash           → Cash
  //   Credit Card    → Credit Card
  //   UPI            → UPI  (may be absent; some setups classify UPI under "Others")
  //   City Ledger    → City Ledger/Credit
  //   Others         → UPI  (IDS Next "Others" in Indian hotels is typically UPI/wallets)
  const cashAmt    = totalFor('Cash');
  const ccAmt      = totalFor('Credit Card', 'Card');
  const upiAmt     = totalFor('UPI');
  const othersAmt  = totalFor('Others');          // UPI / wallets classified as Others
  const companyAmt = totalFor('City Ledger', 'Company', 'Ledger');
  const bankAmt    = totalFor('Bank Transfer', 'NEFT', 'Bank');

  // Merge UPI and Others (both represent digital wallet / UPI payments)
  const totalUpi = upiAmt + othersAmt;

  const data = (await readDaily(outDate)) ?? buildSeedData();
  data.settlement = data.settlement ?? {};

  const set = (key, amt) => {
    if (amt > 0) data.settlement[key] = { ...(data.settlement[key] ?? {}), [UNIT]: String(amt) };
  };

  set('Cash',              cashAmt);
  set('Credit Card',       ccAmt);
  set('UPI',               totalUpi);
  set('City Ledger/Credit', companyAmt);
  set('NEFT/Bank Transfer', bankAmt);

  data.importSource = {
    ...(data.importSource ?? {}),
    cpNmPayTypeFile: path.basename(file),
    cpNmPayTypeImportedAt: new Date().toISOString()
  };

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT,
    mapped: { cash: cashAmt, creditCard: ccAmt, upi: upiAmt, others: othersAmt, totalUpi, cityLedger: companyAmt, bankTransfer: bankAmt }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , mode = 'flash', file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) {
    console.error('Usage: node importCpNmReport.js <flash|forecast|paytype|segment> <file> [YYYY-MM-DD]');
    process.exit(1);
  }
  const { closeDailyStore } = await import('./dailyStore.js');
  const fn = mode === 'forecast' ? importCpNmHistForecast
    : mode === 'paytype' ? importCpNmPayType
    : mode === 'segment' ? importCpNmMarketSegment
    : importCpNmManagerFlash;
  fn(file, outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
