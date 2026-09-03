import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';
import { buildSeedData } from './excel.js';
import { ensureHotelUnitRows, fixedCostDefaults, settlementModes } from './schema.js';
import { readDaily, writeDaily } from './dailyStore.js';

// CP Amravati (Centre Point Amravati) runs on the StayLink PMS. Its scheduled
// "Report E-Mail Service : M/D/YYYY hh:mm AM/PM ( Report )" mail
// (foodpos@staylink.in) attaches three PDFs, named "<Report>_CENTRE POINT
// AMRAVATI_<yyyymmdd>_<hhmmss>.pdf" after the print timestamp:
//   Room Revenue_…   ← the "Night Audit Report": Property (rooms sold / occupancy /
//                      ADR / RevPAR), Inventory, Room revenue, Tax, Payments by
//                      mode, House counters, and a Revenue by Source page.
//                      THE report parsed here.
//   House report_…   ← folio-level register for the window (saved for preview).
//   Monthly Room Occupancy Report_… ← occupied room-days by room type for the
//                      report window — NOT a month-to-date figure (preview only).
//
// The Night Audit is a two-column grid of "label | value" cells. pdf-parse's flat
// text interleaves the columns ("0Today bookings", "Expected arrivals3"), so this
// parser works from the positioned text items instead: items are grouped by
// baseline, every numeric item is paired with the label to its left, and each
// pair is filed under the nearest section heading above it in its own column
// (full-width headings such as "Payments report" apply to both columns).

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const UNIT = 'CP Amravati';
export const CP_AMRAVATI_IMPORT_VERSION = 1;

const SECTION_HEADINGS = [
  [/^property\s+report$/i, 'property'],
  [/^inventory\s+report$/i, 'inventory'],
  [/^room\s+revenue\s+report$/i, 'revenue'],
  [/^tax\s+report$/i, 'tax'],
  [/^payments?\s+report$/i, 'payments'],
  [/^house\s+report$/i, 'house'],
  [/^revenue\s+by\s+source$/i, 'source']
];

// "5", "7.6", "Rs. 2,526.6", "12633.0", "-3.5", "0.25%"
const VALUE_PATTERN = /^(?:rs\.?\s*)?-?\d[\d,]*(?:\.\d+)?%?$/i;

function num(value) {
  const cleaned = String(value ?? '').replace(/rs\.?/i, '').replace(/[,\s%]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value, decimals = 2) {
  return String(Math.round((Number(value) || 0) * (10 ** decimals)) / (10 ** decimals));
}

function normalizeLabel(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s:.-]+$/g, '').trim();
}

// ─── Positioned extraction ───────────────────────────────────────────────────
async function extractPositionedPages(buffer) {
  const pages = [];
  await pdfParse(buffer, {
    pagerender: async (pageData) => {
      let width = 612;
      try {
        // pdf.js ≥2 takes an options object, the pdf-parse default build (1.10) a number.
        const viewport = pageData.getViewport({ scale: 1 });
        width = Number(viewport?.width) || Number(pageData.getViewport(1)?.width) || 612;
      } catch {
        try { width = Number(pageData.getViewport(1)?.width) || 612; } catch { /* keep default */ }
      }
      const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      const items = (content.items ?? [])
        .map((item) => {
          const text = String(item.str ?? '').trim();
          const fontSize = Math.abs(Number(item.transform?.[0]) || Number(item.height) || 10);
          return {
            x: Number(item.transform?.[4]) || 0,
            y: Number(item.transform?.[5]) || 0,
            width: Number(item.width) || text.length * fontSize * 0.5,
            text
          };
        })
        .filter((item) => item.text);
      pages.push({ width, items });
      return '';
    }
  });
  return pages;
}

function groupRows(items, tolerance = 3) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row.y - item.y) <= tolerance) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

function headingColumn(item, pageWidth) {
  const center = item.x + item.width / 2;
  const mid = pageWidth / 2;
  if (Math.abs(center - mid) < pageWidth * 0.1) return 'full';
  return center < mid ? 'left' : 'right';
}

/**
 * Turns the Night Audit PDF into { sections, printedAt }, where sections maps a
 * section key to an ordered list of { label, key, value } pairs.
 */
export function parseNightAuditPages(pages) {
  const sections = {};
  let printedAt = '';
  let carrySection = null;

  for (const page of pages) {
    const rows = groupRows(page.items);
    const headings = [];
    const pairs = [];

    for (const row of rows) {
      const joined = row.items.map((item) => item.text).join(' ');
      if (/^\d+\s+of\s+\d+$/i.test(joined)) continue; // page footer "1 of 2"
      const printed = /report printed on\s*[-:]?\s*(.+)$/i.exec(joined);
      if (printed && !printedAt) printedAt = printed[1].trim();

      // Section headings sit on their own row (one per column at most).
      let isHeadingRow = false;
      for (const item of row.items) {
        const heading = SECTION_HEADINGS.find(([pattern]) => pattern.test(item.text));
        if (heading) {
          headings.push({ key: heading[1], y: row.y, col: headingColumn(item, page.width) });
          isHeadingRow = true;
        }
      }
      if (isHeadingRow) continue;

      // Pair each numeric cell with the label immediately to its left. Adjacent
      // text fragments of one label are joined; a large gap means the next column.
      let label = null;
      for (const item of row.items) {
        if (VALUE_PATTERN.test(item.text)) {
          if (label) pairs.push({ y: row.y, x: label.x, label: label.text, value: item.text });
          label = null;
          continue;
        }
        if (label && item.x - (label.x + label.width) < 15) {
          label = { x: label.x, width: item.x + item.width - label.x, text: `${label.text} ${item.text}` };
        } else {
          label = { x: item.x, width: item.width, text: item.text };
        }
      }
    }

    for (const pair of pairs) {
      const col = pair.x < page.width / 2 ? 'left' : 'right';
      const above = headings
        .filter((heading) => heading.y > pair.y && (heading.col === 'full' || heading.col === col))
        .sort((a, b) => a.y - b.y)[0];
      const section = above?.key ?? carrySection;
      if (!section) continue;
      carrySection = section;
      (sections[section] ??= []).push({ label: pair.label, key: normalizeLabel(pair.label), value: num(pair.value) });
    }
    if (!pairs.length && headings.length) carrySection = headings.sort((a, b) => a.y - b.y)[0].key;
  }

  return { sections, printedAt };
}

function lookup(sections, section, ...prefixes) {
  const entries = sections[section] ?? [];
  for (const prefix of prefixes) {
    const hit = entries.find((entry) => entry.key === prefix || entry.key.startsWith(prefix));
    if (hit && hit.value !== null) return hit.value;
  }
  return undefined;
}

function entriesOf(sections, section) {
  return (sections[section] ?? []).filter((entry) => entry.value !== null);
}

// "Sep 03 2026 01:12 PM" → "2026-09-03"
export function printedAtIso(printedAt) {
  const m = /([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/.exec(printedAt ?? '');
  if (!m) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1;
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// ─── Settlement mode mapping ─────────────────────────────────────────────────
// StayLink payment modes are free-text names configured at the property. Bucket
// them onto the shared settlement modes; anything unrecognised is reported in
// the notes rather than silently dropped into a wrong column.
export function settlementModeFor(rawMode) {
  const mode = String(rawMode ?? '').toLowerCase().trim();
  if (!mode) return null;
  if (/\bcash\b/.test(mode)) return 'Cash';
  if (/upi|gpay|g-pay|google pay|phonepe|phone pe|paytm|bhim|wallet|\bqr\b/.test(mode)) return 'UPI';
  if (/card|visa|master|amex|rupay|swipe|pos machine|\bedc\b/.test(mode)) return 'Credit Card';
  if (/zomato|swiggy/.test(mode)) return 'Zomato/Swiggy';
  if (/agoda|make\s*my\s*trip|\bmmt\b|booking\.?com|goibibo|expedia|\boyo\b|cleartrip|ease\s*my\s*trip|yatra|airbnb|trivago|hostelworld|\bota\b|travel agent|online/.test(mode)) return 'OTA Credit (MMT/Booking.com)';
  if (/neft|rtgs|imps|bank|transfer|cheque|check|\bdd\b/.test(mode)) return 'NEFT/Bank Transfer';
  if (/city ledger|company|corporate|bill to|\bbtc\b|ledger|credit/.test(mode)) return 'City Ledger/Credit';
  if (/compl?e?ment|\bcomp\b/.test(mode)) return 'Complementary';
  if (/discount|staff/.test(mode)) return 'Discounts/Staff';
  if (/due|pending|unpaid|balance/.test(mode)) return 'Due Payment';
  return null;
}

// ─── KPI helpers ─────────────────────────────────────────────────────────────
function setKpi(data, name, value, { section } = {}) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return;
  const row = data.hotels.find((r) => r.unit === UNIT && r.name === name && (!section || r.section === section));
  if (!row) return;
  row.actual = fmt(value);
}

// Adds a CP Amravati-only F&B Outlets row (the shared schema names CP Nagpur's
// outlets, which don't exist here). Same id convention as schemaRowsToKpis.
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

// ─── Night Audit Report ──────────────────────────────────────────────────────
/**
 * Imports the StayLink "Room Revenue_CENTRE POINT AMRAVATI_*.pdf" Night Audit
 * Report for business date `outDate`.
 *   Property report  → Occupancy %, Rooms Sold, ARR (ADR), RevPAR
 *   Room revenue     → Room Revenue (pre-tax); POS / Services revenue as
 *                      CP Amravati-only F&B Outlets rows when non-zero;
 *                      Total → P&L revenueToday
 *   Payments report  → settlement matrix (Cash / UPI / Credit Card / OTA …)
 *   House report     → kept in notes (as-of-print-time counters, not a forecast)
 * `extraFiles` records the sibling attachments (house report, monthly occupancy)
 * on importSource so Source Control can preview them.
 */
export async function importCpAmravatiNightAudit(file, outDate, { extraFiles = {} } = {}) {
  const buffer = await fs.readFile(file);
  const pages = await extractPositionedPages(buffer);
  const { sections, printedAt } = parseNightAuditPages(pages);

  if (!sections.property && !sections.revenue) {
    throw new Error(`Night Audit layout not recognised (sections: ${Object.keys(sections).join(', ') || 'none'})`);
  }

  const roomsSold = lookup(sections, 'property', 'rooms sold') ?? lookup(sections, 'inventory', 'sold rooms');
  const totalRooms = lookup(sections, 'inventory', 'total rooms');
  const occupancyPct = lookup(sections, 'property', 'occupancy')
    ?? (totalRooms && roomsSold !== undefined ? (roomsSold / totalRooms) * 100 : undefined);
  const adr = lookup(sections, 'property', 'adr');
  const revpar = lookup(sections, 'property', 'revpar');

  const roomRevenue = lookup(sections, 'revenue', 'room revenue');
  const posRevenue = lookup(sections, 'revenue', 'pos revenue') ?? 0;
  const servicesRevenue = lookup(sections, 'revenue', 'services revenue', 'service revenue') ?? 0;
  const totalRevenue = lookup(sections, 'revenue', 'total')
    ?? (roomRevenue !== undefined ? roomRevenue + posRevenue + servicesRevenue : undefined);
  const netRevenue = lookup(sections, 'revenue', 'net revenue');
  const cancelledRevenue = lookup(sections, 'revenue', 'cancelled revenue') ?? 0;
  const voidedRevenue = lookup(sections, 'revenue', 'voided revenue') ?? 0;
  const totalTax = lookup(sections, 'tax', 'total') ?? 0;

  const paymentEntries = entriesOf(sections, 'payments').filter((entry) => entry.key !== 'total');
  const paymentsTotal = lookup(sections, 'payments', 'total')
    ?? paymentEntries.reduce((sum, entry) => sum + entry.value, 0);
  const house = Object.fromEntries(entriesOf(sections, 'house').map((entry) => [entry.key, entry.value]));
  const sourceEntries = entriesOf(sections, 'source');

  // ── Settlement buckets ────────────────────────────────────────────────────
  const settled = {};
  const unmapped = [];
  for (const entry of paymentEntries) {
    const mode = settlementModeFor(entry.label);
    if (!mode) { unmapped.push(`${entry.label}=${entry.value}`); continue; }
    settled[mode] = (settled[mode] ?? 0) + entry.value;
  }

  // ── Write to the daily record ─────────────────────────────────────────────
  const data = (await readDaily(outDate)) ?? buildSeedData();
  ensureHotelUnitRows(data, UNIT);

  const roomSection = 'Room Revenue & Occupancy';
  setKpi(data, 'Occupancy %', occupancyPct, { section: roomSection });
  setKpi(data, 'Rooms Sold', roomsSold, { section: roomSection });
  setKpi(data, 'Room Revenue', roomRevenue, { section: roomSection });
  setKpi(data, 'ARR', adr, { section: roomSection });
  setKpi(data, 'RevPAR', revpar, { section: roomSection });

  // Shared-schema F&B rows name CP Nagpur's outlets; StayLink only reports POS and
  // Services totals, so those get unit-only rows — and only when they carry money,
  // otherwise the section would be a permanent block of zeros.
  for (const [name, value] of [['POS Revenue', posRevenue], ['Services Revenue', servicesRevenue]]) {
    if (value > 0) {
      ensureFnbOutletRow(data, name);
      setKpi(data, name, value, { section: 'F&B Outlets' });
    }
  }

  if (totalRevenue !== undefined) {
    // Saved pnl arrays from before this unit existed have no CP Amravati row —
    // append one rather than silently writing nothing.
    const pnlRows = data.pnl ?? [];
    data.pnl = pnlRows.some((row) => row.unit === UNIT)
      ? pnlRows.map((row) => (row.unit === UNIT ? { ...row, revenueToday: fmt(totalRevenue) } : row))
      : [...pnlRows, { unit: UNIT, revenueToday: fmt(totalRevenue), purchasesToday: '', fixedCost: fixedCostDefaults[UNIT] ?? 0, mtdNetProfit: '', ytdNetProfit: '' }];
  }

  // Settlement: the report is the whole day's collections for this unit, so
  // clear its column first — a re-import must not leave a stale mode behind.
  data.settlement = data.settlement ?? {};
  for (const mode of settlementModes) {
    if (data.settlement[mode] && UNIT in data.settlement[mode]) {
      const { [UNIT]: _dropped, ...rest } = data.settlement[mode];
      data.settlement[mode] = rest;
    }
  }
  for (const [mode, amount] of Object.entries(settled)) {
    if (amount > 0) data.settlement[mode] = { ...(data.settlement[mode] ?? {}), [UNIT]: fmt(amount) };
  }

  const printedIso = printedAtIso(printedAt);
  const notes = [
    `occ=${fmt(occupancyPct ?? 0)}%`,
    `rooms=${roomsSold ?? '?'}/${totalRooms ?? '?'}`,
    `adr=${fmt(adr ?? 0)}`,
    `revpar=${fmt(revpar ?? 0)}`,
    `roomRev=${fmt(roomRevenue ?? 0)}`,
    `pos=${fmt(posRevenue)}`,
    `services=${fmt(servicesRevenue)}`,
    `total=${fmt(totalRevenue ?? 0)}`,
    `net=${fmt(netRevenue ?? totalRevenue ?? 0)}`,
    `tax=${fmt(totalTax)}`,
    `payments=${fmt(paymentsTotal)}`,
    `inHouse=${house['in house'] ?? '?'}`,
    `arrivals=${house['today arrivals'] ?? '?'}+${house['expected arrivals'] ?? '?'}`,
    `departures=${house['today departures'] ?? '?'}+${house['pending departures'] ?? '?'}`,
    printedAt ? `printed=${printedAt}` : '',
    unmapped.length ? `unmappedPayments=${unmapped.join('|')}` : ''
  ].filter(Boolean).join(', ');

  data.importSource = {
    ...(data.importSource ?? {}),
    cpAmravatiFile: path.basename(file),
    cpAmravatiImportedAt: new Date().toISOString(),
    cpAmravatiVersion: CP_AMRAVATI_IMPORT_VERSION,
    cpAmravatiNotes: notes,
    cpAmravatiValues: {
      printedAt,
      printedDate: printedIso,
      property: { roomsSold, totalRooms, occupancyPct, adr, revpar },
      revenue: { roomRevenue, posRevenue, servicesRevenue, totalRevenue, netRevenue, cancelledRevenue, voidedRevenue, totalTax },
      payments: Object.fromEntries(paymentEntries.map((entry) => [entry.label, entry.value])),
      paymentsTotal,
      house,
      source: Object.fromEntries(sourceEntries.map((entry) => [entry.label, entry.value]))
    },
    ...extraFiles
  };

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, unit: UNIT,
    mapped: {
      printedAt, roomsSold, totalRooms, occupancyPct, adr, revpar,
      roomRevenue, posRevenue, servicesRevenue, totalRevenue, totalTax,
      paymentsTotal, settlement: settled, unmappedPayments: unmapped,
      house
    }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) {
    console.error('Usage: node importCpAmravatiReport.js <Room Revenue_*.pdf> [YYYY-MM-DD]');
    process.exit(1);
  }
  const { closeDailyStore } = await import('./dailyStore.js');
  importCpAmravatiNightAudit(file, outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
