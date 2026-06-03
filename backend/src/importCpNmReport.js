import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';
import { buildSeedData } from './excel.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

// CP NM (Vashi) IDS Next reports arrive as PDFs, not XLS files.
// All 6 attachments in the nightly email are PDFs:
//   Manager_Flash_Report_For_*          ← room/occupancy/F&B stats + tomorrow's arrivals/departures
//   History_and_Forecast_Report_*       ← tomorrow's occupancy forecast %
//   Pay_Type_Report_*                   ← settlement modes (Cash / Card / UPI / City Ledger)
//   Arrival_Report_*, Departure_Report_*, Guest_In_House_Report_* ← not imported

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

  // POS (F&B) breakdown
  const roomServiceRevenue = firstRs(find(/^Room ServiceRs/i));
  const bougainvilleaRevenue = firstRs(find(/^BougainvilleaRs/i));
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
  if (bougainvilleaRevenue > 0) setKpi(data, 'Bougainvillea Revenue', { actual: bougainvilleaRevenue });
  if (roomServiceRevenue > 0)   setKpi(data, 'In-Room Dining Revenue', { actual: roomServiceRevenue });

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
      totalFnbRevenue, totalRevenue,
      segments: { corporate: segCorporate, fit: segFit, ota: segOta, group: segGroup, walkIn: segWalkIn, noShow: segNoShow }
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
  const [, arrRooms] = splitSmallInts(intStr, totalRooms, 3); // second value = arrivals

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
  const [depRooms] = splitSmallInts(afterRsStr, totalRooms, 1);

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
    console.error('Usage: node importCpNmReport.js <flash|forecast|paytype> <file.pdf> [YYYY-MM-DD]');
    process.exit(1);
  }
  const { closeDailyStore } = await import('./dailyStore.js');
  const fn = mode === 'forecast' ? importCpNmHistForecast
    : mode === 'paytype' ? importCpNmPayType
    : importCpNmManagerFlash;
  fn(file, outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
