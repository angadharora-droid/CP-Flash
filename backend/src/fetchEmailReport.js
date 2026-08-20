/**
 * Runs at 8 AM daily via Windows Task Scheduler.
 * Logs into report@cpgh.in, routes each overnight email to the right importer.
 *
 * Email → Handler mapping:
 *   "Night Audit Report of HCP Nagpur"           → importHotelReport       (XLS attachment)
 *   "Occupency Analysis report of HCP Nagpur"     → importOccupancyReport   (XLS attachment)
 *   "HCP REPORT" (HCP_OCC.xlsx attachment)        → importOccupancyMix      (XLS attachment)
 *   "Report Notification: PABLO …"               → importPetpoojaReport    (HTML body, no attachment)
 *   "Report Notification: DALI …"                → importPetpoojaReport    (HTML body, no attachment)
 *   "Payment Wise Summary : PABLO …"             → importPetpoojaPaymentSummary (XLS attachment)
 *   "Payment Wise Summary : DALI …"              → importPetpoojaPaymentSummary (XLS attachment)
 *   "Hotel Centre Point … Vijan Motors …"        → importCpNmManagerFlash  (Manager_Flash_Report_* XLS)
 *     (same email, bundled)                      → importCpNmHistForecast  (History_and_Forecast_* XLS)
 *   "Market Segment Report" (account.navimumbai@cpgh.in) → importCpNmMarketSegment (Market Analysis Comparison XLSX)
 *
 * After email processing, fetches bank positions from Google Sheets.
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { readDaily, writeDaily, readDailyJson, closeDailyStore } from './dailyStore.js';
import { importHotelReport } from './importHotelReport.js';
import { importOccupancyReport } from './importOccupancyReport.js';
import { importOccupancyMix } from './importOccupancyMix.js';
import { importPosSales } from './importPosSales.js';
import { importForecast, FORECAST_IMPORT_VERSION } from './importForecast.js';
import { importEvents, EVENTS_IMPORT_VERSION } from './importEvents.js';
import { importPetpoojaReport } from './importPetpoojaReport.js';
import { importPetpoojaPaymentSummary } from './importPetpoojaPaymentSummary.js';
import { importPetpoojaTimeSalesReport } from './importPetpoojaTimeSalesReport.js';
import { importBankPosition } from './importBankPosition.js';
import { importDaliCostHistory } from './importDaliCostHistory.js';
import { importPabloCostHistory } from './importPabloCostHistory.js';
import { importPurosoulSalesReport, importMickysSalesReport } from './importDailySalesReport.js';
import { importPurosoulFlashReport } from './importPurosoulFlashReport.js';
import { importMickysCrmReport } from './importMickysCrmReport.js';
import { importCiferonReport } from './importCiferonReport.js';
import { attachReportPreviews } from './attachmentPreview.js';
import { importCpNmManagerFlash, importCpNmHistForecast, importCpNmPayType, importCpNmMarketSegment } from './importCpNmReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACH_DIR = path.resolve(__dirname, '..', 'data', 'attachments');

// When a cloud backend is configured, importers write to fast local JSON files
// and syncToCloud pushes the result once per date via the REST API. Without
// this, every handler's read-modify-write hits remote MongoDB directly (many
// seconds each), which made scheduled imports far slower than the manual
// "Refresh Sources" button (which already stripped MONGODB_URI when spawning).
if (process.env.CLOUD_API_URL && process.env.DAILYFLASH_PIN && process.env.MONGODB_URI) {
  process.env.MONGODB_URI = '';
  console.log(`[${new Date().toISOString()}] Cloud sync configured — using fast local-JSON mode (skipping direct MongoDB writes).`);
}
const SHEET_REFRESH_MINUTES = Number(process.env.SHEET_REFRESH_MINUTES) || 30;
const SHEET_REFRESH_MS = SHEET_REFRESH_MINUTES * 60 * 1000;
const TIME_SALES_IMPORT_VERSION = 3;

const IMAP_HOST = process.env.REPORT_IMAP_HOST || 'imap.rediffmailpro.com';
const IMAP_PORT = Number(process.env.REPORT_IMAP_PORT) || 993;
const EMAIL_USER = process.env.REPORT_EMAIL || 'report@cpgh.in';
const EMAIL_PASS = process.env.REPORT_EMAIL_PASSWORD;
const IMAP_SECURE = IMAP_PORT === 993;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function istIso(offsetDays = 0) {
  // Render runs UTC; shift to IST (+5:30) so date boundaries match the frontend.
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const d = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function yesterday() {
  return istIso(-1);
}

// IST calendar date the email was received (from its Date header).
function emailIstDate(parsed) {
  const d = parsed.date instanceof Date ? parsed.date : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// The Micky's/Purosoul Tally report for business date D is mailed the next
// morning (D+1), so an email received on date R covers business date R-1.
// Filing every email under the run date wrote a false "Mail received — no
// sale" marker for dates whose mail hadn't arrived yet. An older email keeps
// its own business date (R-1): its invoice rows are content-dated anyway, and
// a genuine no-sale day is marked on the date that email actually covers.
function salesBusinessDate(parsed, date) {
  const receivedDate = emailIstDate(parsed);
  if (!receivedDate) return date;
  const covers = addDaysIso(receivedDate, -1);
  return covers > date ? date : covers;
}

// ── Per-email business-date detection ────────────────────────────────────────
// Source timing model (confirmed with operations):
//   AUTOMATED, always on schedule → night audit, occupancy analysis, Petpooja,
//     CP NM. These keep strict run-date filing; CP NM additionally reads the
//     exact date embedded in its PDF filename (authoritative, not a heuristic).
//   MANUAL, may arrive late/backdated → the "HCP REPORT" bundle and the
//     Micky's/Purosoul Tally reports. The HCP bundle anchors on its subject date
//     ("hcp report DD.MM.YY" = business day D, proven against the night audit),
//     falling back to the email's sent date − 1 since the subject dropped its date
//     (Aug 2026). Unanchored forecasts still self-date. Tally rows are invoice-dated.

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Reject garbage parses: calendar-valid, not in the future, not absurdly old.
function clampBusinessDate(candidate, runDate) {
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  // Hand-typed subjects produce calendar-invalid dates ("31.06.26" → 2026-06-31);
  // round-trip through Date so they fall back instead of keying phantom records.
  const ms = Date.parse(`${candidate}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== candidate) return null;
  if (candidate > istIso(0)) return null;
  if (candidate < addDaysIso(runDate, -45)) return null;
  return candidate;
}

// The manual "HCP REPORT" bundle's subject used to carry the business date it covers
// ("hcp report 12.07.26", often behind mail-filter prefixes like "[SUSPICIOUS:]").
// Proven against the night audit's outlet revenue (2026-07-13): the subject date
// IS the closed business day D. Anchoring the whole bundle on it keeps multiple
// late-sent bundles (e.g. Saturday's + Sunday's both mailed on Monday) filing
// under their own days regardless of arrival order or the events-file layout.
// Since 2026-08-08 the subject is just "HCP REPORT" with no date, but the bundle
// is still mailed the morning after its business day closes (proven against the
// events files' D..D+2 window on the 2026-08-10 and 2026-08-12 bundles), so the
// fallback anchor is the email's own sent date − 1 in IST — never the run date,
// which misfiles older bundles when a catch-up run processes several at once.
function hcpSubjectDate(parsed, runDate) {
  const m = /hcp[\s_-]*report[^\d]{0,10}(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})/i.exec(parsed.subject ?? '');
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const clamped = clampBusinessDate(iso, runDate);
    if (clamped) return clamped;
  }
  return sentDateMinusOne(parsed, runDate);
}

// Morning-after fallback anchor: the email's own sent date − 1 in IST. Used by
// daily report mails whose subject carries no parseable business date.
function sentDateMinusOne(parsed, runDate) {
  const sentMs = parsed.date instanceof Date ? parsed.date.getTime() : Date.parse(parsed.date ?? '');
  if (!Number.isFinite(sentMs)) return null;
  const sentIstDay = new Date(sentMs + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return clampBusinessDate(addDaysIso(sentIstDay, -1), runDate);
}

// "Micky's CRM Daily Report — 11 Aug 2026" → the covered business date.
function mickysCrmSubjectDate(parsed, runDate) {
  const m = /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i.exec(parsed.subject ?? '');
  if (m) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()) + 1;
    const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const clamped = clampBusinessDate(iso, runDate);
    if (clamped) return clamped;
  }
  return sentDateMinusOne(parsed, runDate);
}

// Ciferon mails "Summary for Hotel Centre Point : Wednesday, August 12, 2026"
// the next morning; the subject's own "<Month> <D>, <YYYY>" is the business day
// it covers (the body repeats the same date). Fall back to sent date − 1.
function ciferonSubjectDate(parsed, runDate) {
  const m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i.exec(parsed.subject ?? '');
  if (m) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1;
    const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const clamped = clampBusinessDate(iso, runDate);
    if (clamped) return clamped;
  }
  return sentDateMinusOne(parsed, runDate);
}

// The Market Segment Report email's attachment embeds the exact business date in its
// filename: "Market Analysis Comparison Report Between Aug 17, 2026 and Aug 17, 2026.xlsx"
// (a daily report — the "Between X and Y" range is always the same single day).
function marketSegmentFileDate(parsed, runDate) {
  const att = findAttachmentByName(parsed, /Market Analysis Comparison/i);
  const m = /Between\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i.exec(att?.filename ?? '');
  if (m) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1;
    const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const clamped = clampBusinessDate(iso, runDate);
    if (clamped) return clamped;
  }
  return sentDateMinusOne(parsed, runDate);
}

// CP NM PDFs embed exact dates in the attachment filename
// (e.g. "Manager_Flash_Report_For_2026-05-31_2097_20260531183719.pdf").
function attachmentNameDate(parsed, filePattern, datePattern, runDate) {
  const att = parsed.attachments?.find((a) => filePattern.test(a.filename ?? ''));
  const m = datePattern.exec(att?.filename ?? '');
  if (!m) return runDate;
  const raw = m[1].length === 8 ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}` : m[1];
  return clampBusinessDate(raw, runDate) ?? runDate;
}

function subjectContains(subject, ...keywords) {
  const lower = subject.toLowerCase();
  return keywords.every((kw) => lower.includes(kw.toLowerCase()));
}

function messageText(parsed) {
  const attachments = parsed.attachments ?? [];
  return [
    parsed.subject,
    parsed.from?.text,
    parsed.from?.value?.map((addr) => addr.address).join(' '),
    attachments.map((att) => att.filename).join(' ')
  ].filter(Boolean).join(' ').toLowerCase();
}

function shouldRefreshSheetSource(importSource, key) {
  if (process.env.FORCE_IMPORT === 'true') return true;
  const importedAt = importSource?.[key];
  if (!importedAt) return true;
  const importedTime = new Date(importedAt).getTime();
  if (!Number.isFinite(importedTime)) return true;
  return Date.now() - importedTime >= SHEET_REFRESH_MS;
}

const MANUAL_SALES_SOURCES = {
  mickys: {
    kpiBucket: 'mickys',
    kpiNames: ['Order Revenue Today'],
    pnlUnit: "Micky's"
  },
  purosoul: {
    kpiBucket: 'purosoul',
    kpiNames: ['Total Revenue Today', 'Revenue MTD'],
    pnlUnit: 'Purosoul'
  }
};

function logSheetSkip(label, importedAt) {
  const nextAt = new Date(new Date(importedAt).getTime() + SHEET_REFRESH_MS);
  log(`${label} refreshed recently — skipping until ${nextAt.toLocaleString('en-IN')}.`);
}

/** Accepts spreadsheet attachments */
function findSpreadsheet(parsed) {
  return parsed.attachments?.find((a) => /\.(xlsx|xls|csv)$/i.test(a.filename ?? ''));
}

/** Picks a specific attachment by filename — the "HCP REPORT" email bundles several. */
function findAttachmentByName(parsed, pattern) {
  return parsed.attachments?.find((a) => pattern.test(a.filename ?? ''));
}

function logAttachments(parsed) {
  const all = parsed.attachments ?? [];
  if (!all.length) {
    log('  (no attachments — data may be in HTML body)');
    return;
  }
  log(`  Attachments: ${all.map((a) => `"${a.filename}" (${a.contentType}, ${a.size}B)`).join(', ')}`);
}

async function saveAttachment(attachment, label, date) {
  await fs.mkdir(ATTACH_DIR, { recursive: true });
  const safeName = (attachment.filename || `${label}-${date}.xls`).replace(/[/\\:*?"<>|]/g, '_');
  let filePath = path.join(ATTACH_DIR, safeName);
  try {
    await fs.access(filePath);
    const parsed = path.parse(safeName);
    filePath = path.join(ATTACH_DIR, `${parsed.name}-${Date.now()}${parsed.ext}`);
  } catch {
    // No existing file with this name.
  }
  await fs.writeFile(filePath, attachment.content);
  return filePath;
}

function isDetailedSalesReport(subject, parsed, outletPattern) {
  const text = messageText(parsed);
  return outletPattern.test(text)
    && !subjectContains(subject, 'payment wise')
    && !subjectContains(subject, 'daily sales report')
    && /(bill|order|sales).*(wise|detail|summary|register|report)|day\s*end|broader|border/i.test(text);
}

/**
 * Handlers — each receives the full mailparser `parsed` object and the date string.
 * Attachment-based handlers call findSpreadsheet(); HTML-body handlers use parsed.text.
 */
const HANDLERS = [
  {
    name: 'Night Audit (CP Nagpur)',
    importSourceKey: 'importedAt',
    // Automated by IDS, always on schedule — file under the run date.
    matches: (s, parsed) => subjectContains(s, 'night audit') && /nagpur|centre point|hcp/i.test(messageText(parsed)),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'night-audit-nagpur', date);
      return importHotelReport(filePath, date);
    }
  },
  {
    name: 'Occupancy Analysis (CP Nagpur)',
    importSourceKey: 'occupancyImportedAt',
    // Automated by IDS, always on schedule — file under the run date.
    // actual subject has typo: "Occupency"
    matches: (s, parsed) => (subjectContains(s, 'occupancy analysis') || subjectContains(s, 'occupency analysis')) && /nagpur|centre point|hcp/i.test(messageText(parsed)),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'occupancy-nagpur', date);
      return importOccupancyReport(filePath, date, 'CP Nagpur');
    }
  },
  {
    // HCP_OCC is the guest-level in-house report (Mar.Seg + S.O.B) bundled in the
    // "HCP REPORT" email alongside HCP_EVENT/HCP_FORE/HCP_POS_SALE. Matched by filename
    // so it's independent of the subject line. `bundled: true` lets the sibling HCP_*
    // handlers (e.g. HCP_POS_SALE below) also run on the same email — see processMessage.
    name: 'HCP Occupancy Mix (CP Nagpur)',
    importSourceKey: 'occupancyMixImportedAt',
    bundled: true,
    businessDate: hcpSubjectDate,
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[\s_-]?OCC/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[\s_-]?OCC/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_OCC attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-occ-nagpur', date);
      return importOccupancyMix(filePath, date, 'CP Nagpur');
    }
  },
  {
    // HCP_POS_SALE is the outlet-wise bill register bundled in the same "HCP REPORT"
    // email. Since Aug 2026 the bundle names its files with spaces and this one plain
    // "HCP SALE.xlsx" (no POS) — hence the SALE alternative in the pattern.
    // It feeds deduped daily covers for Meeting Point / Freakk / High Steak
    // into the hotels "F&B Outlets" table. `bundled: true` so it runs alongside
    // HCP Occupancy Mix above (both match the one email by attachment name).
    name: 'HCP POS Sales / Covers (CP Nagpur)',
    importSourceKey: 'posSalesImportedAt',
    bundled: true,
    businessDate: hcpSubjectDate,
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[\s_-]?(POS|SALE)/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[\s_-]?(POS|SALE)/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_POS_SALE attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-pos-nagpur', date);
      return importPosSales(filePath, date, 'CP Nagpur');
    }
  },
  {
    // HCP_FORE — next-day occupancy forecast, bundled in the same "HCP REPORT" email.
    // Feeds the hotels "Forecast" KPIs (Tomorrow Occupancy %, Arrivals, Departures);
    // the forecast row is dated `date + 1` and lands in the report-date JSON.
    name: 'HCP Forecast (CP Nagpur)',
    importSourceKey: 'forecastImportedAt',
    importVersion: FORECAST_IMPORT_VERSION,
    bundled: true,
    validatesDate: true,
    businessDate: hcpSubjectDate,
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[\s_-]?FORE/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[\s_-]?FORE/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_FORE attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-fore-nagpur', date);
      // An anchored date (subject or sent-date − 1) wins over the file's own
      // forecast-row self-dating, whose offset from D has drifted (D+1 vs D+2).
      return importForecast(filePath, date, 'CP Nagpur', { anchored: hcpSubjectDate(parsed, date) != null });
    }
  },
  {
    // HCP_EVENT — confirmed banquet bookings for the report day + next day, bundled in
    // the same "HCP REPORT" email. Feeds banquetToday / banquetTomorrow function lists.
    name: 'HCP Banquet Events (CP Nagpur)',
    importSourceKey: 'eventsImportedAt',
    importVersion: EVENTS_IMPORT_VERSION,
    bundled: true,
    validatesDate: true,
    businessDate: hcpSubjectDate,
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[\s_-]?EVENT/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[\s_-]?EVENT/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_EVENT attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-event-nagpur', date);
      // A parsed subject date is authoritative — importEvents must keep it even
      // when the (sparse) events file carries no section for that day.
      return importEvents(filePath, date, 'CP Nagpur', { anchored: hcpSubjectDate(parsed, date) != null });
    }
  },
  {
    name: 'Petpooja Billing – Pablo',
    importSourceKey: 'pabloPetpoojaImportedAt',
    matches: (s, parsed) => !findSpreadsheet(parsed) && subjectContains(s, 'report notification') && subjectContains(s, 'pablo') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Pablo', date)
  },
  {
    name: 'Petpooja Billing – Dali',
    importSourceKey: 'daliPetpoojaImportedAt',
    matches: (s, parsed) => !findSpreadsheet(parsed) && subjectContains(s, 'report notification') && subjectContains(s, 'dali') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Dali', date)
  },
  {
    name: 'Petpooja Payment Summary – Pablo',
    importSourceKey: 'pabloPaymentImportedAt',
    matches: (s) => subjectContains(s, 'payment wise summary') && subjectContains(s, 'pablo'),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-pablo-payment', date);
      return importPetpoojaPaymentSummary(filePath, 'Pablo', date);
    }
  },
  {
    name: 'Petpooja Payment Summary – Dali',
    importSourceKey: 'daliPaymentImportedAt',
    matches: (s) => subjectContains(s, 'payment wise summary') && subjectContains(s, 'dali'),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-dali-payment', date);
      return importPetpoojaPaymentSummary(filePath, 'Dali', date);
    }
  },
  {
    name: 'Petpooja Time Sales - Pablo',
    importSourceKey: 'pabloTimeSalesImportedAt',
    matches: (s, parsed) => isDetailedSalesReport(s, parsed, /pablo/i),
    currentFile: (file) => /item.*bill|item_bill/i.test(file),
    importVersion: TIME_SALES_IMPORT_VERSION,
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-pablo-time-sales', date);
      return importPetpoojaTimeSalesReport(filePath, 'Pablo', date);
    }
  },
  {
    name: 'Petpooja Time Sales - Dali',
    importSourceKey: 'daliTimeSalesImportedAt',
    matches: (s, parsed) => isDetailedSalesReport(s, parsed, /dali/i),
    currentFile: (file) => /item.*bill|item_bill/i.test(file),
    importVersion: TIME_SALES_IMPORT_VERSION,
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-dali-time-sales', date);
      return importPetpoojaTimeSalesReport(filePath, 'Dali', date);
    }
  },
  {
    name: 'Petpooja Billing - Rabbit',
    importSourceKey: 'rabbitsPetpoojaImportedAt',
    matches: (s, parsed) => !findSpreadsheet(parsed) && subjectContains(s, 'report notification') && subjectContains(s, 'rabbit') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Rabbit', date)
  },
  {
    name: 'Petpooja Payment Summary - Rabbit',
    importSourceKey: 'rabbitsPaymentImportedAt',
    matches: (s) => subjectContains(s, 'payment wise summary') && subjectContains(s, 'rabbit'),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-rabbits-payment', date);
      return importPetpoojaPaymentSummary(filePath, 'Rabbit', date);
    }
  },
  {
    name: 'Petpooja Time Sales - Rabbit',
    importSourceKey: 'rabbitsTimeSalesImportedAt',
    matches: (s, parsed) => isDetailedSalesReport(s, parsed, /rabbit/i),
    currentFile: (file) => /item.*bill|item_bill/i.test(file),
    importVersion: TIME_SALES_IMPORT_VERSION,
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-rabbits-time-sales', date);
      return importPetpoojaTimeSalesReport(filePath, 'Rabbit', date);
    }
  },
  {
    // Ciferon POS daily transaction summary (alerts@ciferon.com, HTML body, no
    // attachment) — Centre Point's home-delivery channel, filed as CP Delivery.
    // Distinct from the CP NM "Hotel Centre Point … Vijan Motors" bundle, which
    // always carries PDF attachments and never this subject.
    name: 'Ciferon Delivery Summary (CP Delivery)',
    importSourceKey: 'cpDeliveryImportedAt',
    businessDate: ciferonSubjectDate,
    matches: (s, parsed) => subjectContains(s, 'summary for hotel centre point')
      || (/@ciferon\.com/i.test(messageText(parsed)) && subjectContains(s, 'summary')),
    run: async (parsed, date) => importCiferonReport(parsed.html || '', date)
  },
  // ── CP NM (Centre Point, Vashi — Unit of Vijan Motors) ──────────────────────
  // All 6 attachments in the IDS Next email are PDFs (not XLS).  Three handlers
  // run bundled from the same email (navimumbaicentrepoint@gmail.com).
  {
    // Manager Flash Report (PDF) → Occupancy %, Rooms Sold, Room Revenue, ARR, RevPAR,
    //                              F&B Revenue, Tomorrow Arrivals/Departures, P&L total.
    name: 'CP NM Manager Flash Report',
    importSourceKey: 'cpNmImportedAt',
    bundled: true,
    // Exact business date is in the filename: Manager_Flash_Report_For_YYYY-MM-DD_…
    businessDate: (parsed, runDate) => attachmentNameDate(parsed, /Manager_Flash_Report/i, /For_(\d{4}-\d{2}-\d{2})/i, runDate),
    matches: (s, parsed) => {
      const isCpNm = /navimumbaicentrepoint@gmail\.com/i.test(messageText(parsed))
        || (subjectContains(s, 'hotel centre point') && subjectContains(s, 'vijan motors'));
      return isCpNm && !!findAttachmentByName(parsed, /Manager_Flash_Report/i);
    },
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /Manager_Flash_Report/i);
      if (!att) { logAttachments(parsed); throw new Error('No Manager Flash Report attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-manager-flash', date);
      return importCpNmManagerFlash(filePath, date);
    }
  },
  {
    // History & Forecast Report (PDF) → Tomorrow Occupancy Forecast %.
    name: 'CP NM History & Forecast Report',
    importSourceKey: 'cpNmForecastImportedAt',
    bundled: true,
    // The H&F filename carries only a month range plus a generation timestamp
    // (…_2098_YYYYMMDDhhmmss.pdf), and the hotel sometimes generates it after
    // midnight — the timestamp date is then business date + 1 (e.g.
    // …_20260713005825.pdf belongs to the 12th's audit). The sibling PDFs in the
    // same email embed the exact business date; prefer those, keep the timestamp
    // date only as a last resort.
    businessDate: (parsed, runDate) => {
      const siblings = [
        [/Manager_Flash_Report/i, /For_(\d{4}-\d{2}-\d{2})/i],
        [/Pay_Type_Report/i, /Between_(\d{4}-\d{2}-\d{2})/i]
      ];
      for (const [filePattern, datePattern] of siblings) {
        const att = parsed.attachments?.find((a) => filePattern.test(a.filename ?? ''));
        const date = clampBusinessDate(datePattern.exec(att?.filename ?? '')?.[1] ?? null, runDate);
        if (date) return date;
      }
      return attachmentNameDate(parsed, /History_and_Forecast_Report/i, /_(\d{8})\d{6}\.pdf$/i, runDate);
    },
    matches: (s, parsed) => {
      const isCpNm = /navimumbaicentrepoint@gmail\.com/i.test(messageText(parsed))
        || (subjectContains(s, 'hotel centre point') && subjectContains(s, 'vijan motors'));
      return isCpNm && !!findAttachmentByName(parsed, /History_and_Forecast_Report/i);
    },
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /History_and_Forecast_Report/i);
      if (!att) { logAttachments(parsed); throw new Error('No History & Forecast Report attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-hist-forecast', date);
      return importCpNmHistForecast(filePath, date);
    }
  },
  {
    // Pay Type Report (PDF) → Cash / Credit Card / UPI / City Ledger settlement.
    name: 'CP NM Pay Type Report',
    importSourceKey: 'cpNmPayTypeImportedAt',
    bundled: true,
    // Exact business date is in the filename: Pay_Type_Report_Between_YYYY-MM-DD_and_…
    businessDate: (parsed, runDate) => attachmentNameDate(parsed, /Pay_Type_Report/i, /Between_(\d{4}-\d{2}-\d{2})/i, runDate),
    matches: (s, parsed) => {
      const isCpNm = /navimumbaicentrepoint@gmail\.com/i.test(messageText(parsed))
        || (subjectContains(s, 'hotel centre point') && subjectContains(s, 'vijan motors'));
      return isCpNm && !!findAttachmentByName(parsed, /Pay_Type_Report/i);
    },
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /Pay_Type_Report/i);
      if (!att) { logAttachments(parsed); throw new Error('No Pay Type Report attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-pay-type', date);
      return importCpNmPayType(filePath, date);
    }
  },
  {
    // Market Segment Report (separate email, account.navimumbai@cpgh.in) → real
    // segment-wise nights/pax/revenue for the CP NM occupancy-mix donut. CP NM has
    // no Source of Business breakdown, so this feeds Market Segment only.
    name: 'CP NM Market Segment Report',
    importSourceKey: 'cpNmMarketSegmentImportedAt',
    businessDate: marketSegmentFileDate,
    matches: (s, parsed) => subjectContains(s, 'market segment report') || !!findAttachmentByName(parsed, /Market Analysis Comparison/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /Market Analysis Comparison/i);
      if (!att) { logAttachments(parsed); throw new Error('No Market Analysis Comparison attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-market-segment', date);
      return importCpNmMarketSegment(filePath, date);
    }
  },
  {
    name: 'Purosoul Daily Sales Report',
    importSourceKey: 'purosoulSalesImportedAt',
    // The report mailed on day R covers business date R-1.
    businessDate: salesBusinessDate,
    matches: (s, parsed) => (/(daily\s+sales|sales report)/i.test(s) || !!findAttachmentByName(parsed, /AFVPL|purosoul/i)) && /amarjit fiscal|afvpl|purosoul/i.test(messageText(parsed)),
    currentFile: (file) => /AFVPL|purosoul/i.test(file),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      await saveAttachment(att, 'purosoul-sales', att.filename);
      return importPurosoulSalesReport(att.content, att.filename, date);
    }
  },
  {
    name: "Micky's Daily Sales Report",
    importSourceKey: 'mickysSalesImportedAt',
    // The report mailed on day R covers business date R-1.
    businessDate: salesBusinessDate,
    matches: (s, parsed) => (subjectContains(s, 'daily sales report') || !!findAttachmentByName(parsed, /CP[_\s-]?FOODS/i)) && /cp[\s_-]?foods/i.test(messageText(parsed)),
    currentFile: (file) => /CP[_\s-]?FOODS/i.test(file),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      await saveAttachment(att, 'mickys-sales', att.filename);
      return importMickysSalesReport(att.content, att.filename, date);
    }
  },
  {
    // Automated "Micky's CRM Daily Report — DD Mon YYYY" HTML mail (sales@mickys.in,
    // no attachment): day totals for leads/visits/kits plus user-wise and city-wise
    // breakdowns. Replaced the manual Google-Sheets leads import in Aug 2026.
    name: "Micky's CRM Leads",
    importSourceKey: 'mickysCrmImportedAt',
    businessDate: mickysCrmSubjectDate,
    matches: (s) => subjectContains(s, 'crm daily report') && /micky/i.test(s),
    run: async (parsed, date) => importMickysCrmReport(parsed.html || '', date)
  }
];

async function processMessage(parsed, date, existingData, touchedDates) {
  const subject = parsed.subject || '';
  log(`Processing: "${subject}"`);

  const primary = HANDLERS.find((h) => h.matches(subject, parsed));
  if (!primary) {
    log('  No handler — skipping.');
    return;
  }

  // The "HCP REPORT" email bundles several attachments, each for a different importer.
  // Beyond the first match, also run any handlers flagged `bundled` that match the same
  // email so sibling attachments (HCP_OCC, HCP_POS_SALE, …) are all processed.
  const handlers = [primary, ...HANDLERS.filter((h) => h !== primary && h.bundled && h.matches(subject, parsed))];
  // Run date-detecting handlers (forecast/events) first — they derive the true business
  // date from file content. Subsequent bundled handlers (occ-mix / pos-sales) then receive
  // the correct date via effectiveDate rather than always using yesterday's run date.
  handlers.sort((a, b) => (b.validatesDate ? 1 : 0) - (a.validatesDate ? 1 : 0));
  let effectiveDate = date;
  for (const handler of handlers) {
    const result = await runHandler(handler, parsed, effectiveDate, existingData, touchedDates, date);
    // If a handler detected a different business date (backdated report), use it for the
    // remaining bundled handlers so occ-mix / pos-sales file under the same correct date.
    if (result?.detectedDate && result.detectedDate !== effectiveDate) {
      log(`  Backdated bundle: effective date updated to ${result.detectedDate} (was ${effectiveDate}).`);
      effectiveDate = result.detectedDate;
    }
  }
}

async function runHandler(handler, parsed, date, existingData, touchedDates, runDate = date) {
  log(`  → Handler: ${handler.name}`);

  // `date` is the bundle's effective business date (possibly detected by an
  // earlier content-dated handler in the same email); `runDate` is the run's
  // default. Handlers with a businessDate rule (CP NM filename dates) override.
  const targetDate = handler.businessDate
    ? (handler.businessDate(parsed, date) ?? date)
    : date;
  if (targetDate !== runDate) {
    log(`  Business date: ${targetDate} (run date ${runDate}).`);
  }

  // Content-dated handlers (validatesDate: forecast/events) must NOT be
  // pre-skipped off the run-date record: they derive the true business date
  // while running and are idempotent. Pre-skipping them dropped the older of
  // two manually-sent bundles arriving in the same run (e.g. Sunday's and
  // Monday's HCP REPORT both sent on Monday).
  if (handler.importSourceKey && !handler.validatesDate && targetDate === runDate
    && existingData?.importSource?.[handler.importSourceKey]) {
    const att = findSpreadsheet(parsed);
    const existingFileKey = handler.importSourceKey.replace(/ImportedAt$/, 'File');
    const existingVersionKey = handler.importSourceKey.replace(/ImportedAt$/, 'Version');
    const existingFile = existingData?.importSource?.[existingFileKey] ?? '';
    const existingVersionIsCurrent = !handler.importVersion
      || existingData?.importSource?.[existingVersionKey] === handler.importVersion;
    const importedFileIsCurrent = handler.currentFile
      ? handler.currentFile(String(existingFile)) && (!att?.filename || handler.currentFile(String(att.filename)))
      : true;

    if (importedFileIsCurrent && existingVersionIsCurrent) {
      log(`  Already imported today — skipping.`);
      return;
    }

    log(`  Re-importing because saved file "${existingFile}" does not match ${handler.name}.`);
  }

  // Backdated email (e.g. occ-mix/pos-sales following a backdated bundle date):
  // dedupe against the target date's own saved record, not the run-date record
  // (FORCE_IMPORT reprocesses regardless — imports are idempotent).
  if (handler.importSourceKey && !handler.validatesDate && targetDate !== runDate && process.env.FORCE_IMPORT !== 'true') {
    const targetData = await readDaily(targetDate);
    // A date carrying only the auto "no sale done" marker must not block a
    // covering email — reprocessing is idempotent and lets real (or corrected)
    // data replace a marker that was written before the date's mail arrived.
    const notesKey = handler.importSourceKey.replace(/ImportedAt$/, 'Notes');
    const noSaleMarked = /no sale done/i.test(String(targetData?.importSource?.[notesKey] ?? ''));
    if (targetData?.importSource?.[handler.importSourceKey] && !noSaleMarked) {
      log(`  Already imported for ${targetDate} — skipping.`);
      return;
    }
  }

  try {
    const result = await handler.run(parsed, targetDate);
    if (result?.pending) {
      log(`  Pending: ${result.reason ?? 'not imported'} — leaving source unset.`);
    } else {
      log(`  Done: ${JSON.stringify(result?.mapped ?? result)}`);
      // Handlers may file under a date other than the run date (content-dated
      // reports use their own date) — track every written date for cloud sync.
      const filedDate = result?.date ?? targetDate;
      touchedDates?.add(targetDate);
      touchedDates?.add(filedDate);
      // Multi-day reports (monthly Tally invoices) return every date they wrote;
      // sync those as well, not just the focus date.
      for (const entry of result?.dates ?? []) {
        if (entry?.date) touchedDates?.add(entry.date);
      }
      // Only a run-date import marks the in-run "already imported" tracker —
      // a backdated import must not block the current day's email (or vice versa).
      if (handler.importSourceKey && filedDate === runDate) {
        existingData.importSource = {
          ...(existingData.importSource ?? {}),
          [handler.importSourceKey]: new Date().toISOString()
        };
      }
    }
    return result;
  } catch (err) {
    log(`  ERROR: ${err.message}`);
    return null;
  }
}

async function run() {
  const date = yesterday();
  // Every daily JSON a handler writes to — synced to the cloud at the end. Seeded with
  // the run date; forward-looking handlers (forecast/events) add their own content date.
  const touchedDates = new Set([date]);
  const forceImport = process.env.FORCE_IMPORT === 'true';

  // Load existing data once — used to skip sources already imported this run
  let existingData = (await readDailyJson(date)) ?? { importSource: {} };
  if (process.env.FORCE_IMPORT === 'true') {
    existingData.importSource = {};
    log('FORCE_IMPORT enabled: rebuilding sources for this run.');
  }

  if (!EMAIL_PASS) {
    log('Email import skipped: REPORT_EMAIL_PASSWORD is not set in backend/.env.');
  } else {
    const client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: IMAP_SECURE,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      logger: false
    });

    log(`Connecting to ${IMAP_HOST}:${IMAP_PORT} as ${EMAIL_USER}`);
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
    // Start of the mailbox window in IST. A forced source refresh should reprocess
    // today's received emails only; those emails may still contain report rows for
    // older business dates, and the importers file those rows by their content date.
    const sinceDate = forceImport
      ? (process.env.FULL_IMPORT_HISTORY === 'true' ? '1970-01-01' : istIso(0))
      : istIso(-1);
    const since = new Date(`${sinceDate}T00:00:00+05:30`);

    const seqs = await client.search({ since });
    log(`Found ${seqs.length} email(s) since ${sinceDate}`);

    if (!seqs.length) {
      log('No emails in the period — nothing to import.');
    } else {
      // Bulk-fetch all message sources in a single IMAP FETCH (vs. one round-trip per email).
      const sources = [];
      for await (const msg of client.fetch(seqs, { source: true })) {
        sources.push(msg.source);
      }
      // Parse all MIME bodies in parallel — pure CPU work, no shared state.
      const parsedAll = await Promise.all(sources.map((src) => simpleParser(src)));
      // Handlers stay sequential: they share the daily JSON / Mongo doc; parallelising them
      // would race on read-modify-write of the same record.
      for (const parsed of parsedAll.reverse()) {
        await processMessage(parsed, date, existingData, touchedDates);
      }
    }

    log('All emails processed.');
      } finally {
        lock.release();
        await client.logout();
        log('Disconnected.');
      }
    } catch (err) {
      log(`Email import ERROR: ${err.message}`);
      log('Continuing with Google Sheets imports and cloud sync.');
    }
  }

  if (forceImport) {
    await clearManualSalesSourcesNotImported(date, existingData);
  }

  // All Google Sheet imports are independent — run them in parallel.
  // Each importer uses withDateLock internally so concurrent writes to the same date are serialized.
  await Promise.all([
    (async () => {
      if (!shouldRefreshSheetSource(existingData?.importSource, 'bankPositionImportedAt')) {
        logSheetSkip('Bank positions', existingData.importSource.bankPositionImportedAt);
        return;
      }
      log('Fetching bank positions from Google Sheets…');
      try {
        const bankResult = await importBankPosition(date);
        log(`Bank positions imported: ${bankResult.mapped.map((row) => `${row.unit}/${row.account}: ${Math.round(Number(row.netBalance) || 0)}`).join(', ')}`);
      } catch (err) {
        log(`Bank position ERROR: ${err.message}`);
      }
    })(),
    (async () => {
      if (!shouldRefreshSheetSource(existingData?.importSource, 'daliCostImportedAt')) {
        logSheetSkip('Dali cost', existingData.importSource.daliCostImportedAt);
        return;
      }
      log('Fetching Dali cost sheet from Google Sheets…');
      try {
        const daliResult = await importDaliCostHistory();
        daliResult.written.forEach((d) => touchedDates.add(d));
        log(`Dali cost imported: ${daliResult.rowCount} rows, ${daliResult.written.length} changed → ${daliResult.written.join(', ') || 'none'}`);
      } catch (err) {
        log(`Dali cost ERROR: ${err.message}`);
      }
    })(),
    (async () => {
      if (!shouldRefreshSheetSource(existingData?.importSource, 'pabloCostImportedAt')) {
        logSheetSkip('Pablo cost', existingData.importSource.pabloCostImportedAt);
        return;
      }
      log('Fetching Pablo cost sheet from Google Sheets…');
      try {
        const pabloResult = await importPabloCostHistory();
        pabloResult.written.forEach((d) => touchedDates.add(d));
        log(`Pablo cost imported: ${pabloResult.rowCount} rows, ${pabloResult.written.length} changed → ${pabloResult.written.join(', ') || 'none'}`);
      } catch (err) {
        log(`Pablo cost ERROR: ${err.message}`);
      }
    })(),
    (async () => {
      if (!shouldRefreshSheetSource(existingData?.importSource, 'purosoulFlashImportedAt')) {
        logSheetSkip('Purosoul SKU flash report', existingData.importSource.purosoulFlashImportedAt);
        return;
      }
      log('Fetching Purosoul SKU flash report from Google Sheets…');
      try {
        const purosoulSkuResult = await importPurosoulFlashReport();
        purosoulSkuResult.written.forEach((d) => touchedDates.add(d));
        log(`Purosoul SKU imported: ${purosoulSkuResult.rowCount} rows, ${purosoulSkuResult.written.length} changed → ${purosoulSkuResult.written.join(', ') || 'none'}`);
      } catch (err) {
        log(`Purosoul SKU ERROR: ${err.message}`);
      }
    })()
  ]);

  // Push processed data to cloud backend — one sync per date any importer wrote to
  // (forward-looking reports and multi-day sheets may touch dates other than the
  // run date). Login once, then sync in small batches so a backfill of many dates
  // doesn't open dozens of simultaneous requests against the cloud API.
  if (!process.env.CLOUD_API_URL || !process.env.DAILYFLASH_PIN) {
    log('Cloud sync skipped — CLOUD_API_URL or DAILYFLASH_PIN not set.');
    return;
  }
  const syncDates = [...touchedDates].sort();
  const cloudToken = await getCloudToken();
  const SYNC_BATCH = 5;
  for (let i = 0; i < syncDates.length; i += SYNC_BATCH) {
    await Promise.all(syncDates.slice(i, i + SYNC_BATCH).map((d) => syncToCloud(d, cloudToken)));
  }
}

async function clearManualSalesSourcesNotImported(date, runData) {
  const data = await readDaily(date);
  if (!data) return;

  let changed = false;
  const importSource = { ...(data.importSource ?? {}) };

  for (const [prefix, config] of Object.entries(MANUAL_SALES_SOURCES)) {
    const importedAtKey = `${prefix}SalesImportedAt`;
    if (runData?.importSource?.[importedAtKey]) continue;

    for (const suffix of ['File', 'Sheet', 'Date', 'ImportedAt', 'Notes']) {
      const key = `${prefix}Sales${suffix}`;
      // Explicit null rather than delete/absent: syncToCloud merges local
      // importSource OVER the cloud copy, so a deleted or missing key would be
      // resurrected from the cloud's stale value, while a null overrides it
      // and the dashboard sees "not uploaded".
      if (importSource[key] !== null) {
        importSource[key] = null;
        changed = true;
      }
    }

    data[config.kpiBucket] = (data[config.kpiBucket] ?? []).map((row) => {
      if (!config.kpiNames.includes(row.name)) return row;
      if (!filled(row.actual) && !filled(row.mtd)) return row;
      changed = true;
      return { ...row, actual: '', mtd: '' };
    });

    data.pnl = (data.pnl ?? []).map((row) => {
      if (row.unit !== config.pnlUnit || !filled(row.revenueToday)) return row;
      changed = true;
      return { ...row, revenueToday: '' };
    });
  }

  if (changed) {
    data.importSource = importSource;
    await writeDaily(date, data);
    log('Cleared manual sales sources not found in this forced refresh.');
  }
}

// One login for the whole run — the previous per-date login multiplied round
// trips and burned the login rate limit when many dates needed syncing.
async function getCloudToken() {
  const cloudUrl = process.env.CLOUD_API_URL;
  const pin = process.env.DAILYFLASH_PIN;
  if (!cloudUrl || !pin) return null;
  try {
    const loginRes = await fetch(`${cloudUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { token } = await loginRes.json();
    return token;
  } catch (err) {
    log(`Cloud login ERROR: ${err.message}`);
    return null;
  }
}

async function syncToCloud(date, token) {
  const cloudUrl = process.env.CLOUD_API_URL;
  const pin = process.env.DAILYFLASH_PIN;
  if (!cloudUrl || !pin) {
    log('Cloud sync skipped — CLOUD_API_URL or DAILYFLASH_PIN not set.');
    return;
  }
  if (!token) {
    log(`Cloud sync skipped for ${date} — no auth token (login failed).`);
    return;
  }

  const localData = await readDailyJson(date);
  if (!localData) {
    log(`Cloud sync skipped — no local data file for ${date}.`);
    return;
  }

  log(`Syncing ${date} to ${cloudUrl} …`);
  try {
    const existingRes = await fetch(`${cloudUrl}/api/seed?date=${date}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    const existingJson = existingRes.ok ? await existingRes.json() : null;
    const dataWithPreviews = await attachReportPreviews(localData, ATTACH_DIR, log);
    const dataToPush = mergeReportData(existingJson?.saved, dataWithPreviews);

    const pushRes = await fetch(`${cloudUrl}/api/data`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ date, data: dataToPush })
    });
    if (!pushRes.ok) throw new Error(`Push failed: ${pushRes.status}`);
    log(`Cloud sync done for ${date}.`);
  } catch (err) {
    log(`Cloud sync ERROR: ${err.message}`);
  }
}

function filled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function mergeKpiRows(existingRows = [], incomingRows = []) {
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  for (const row of incomingRows) {
    const previous = byId.get(row.id) ?? {};
    byId.set(row.id, {
      ...previous,
      ...row,
      actual: filled(row.actual) ? row.actual : previous.actual,
      mtd: filled(row.mtd) ? row.mtd : previous.mtd,
      ytd: filled(row.ytd) ? row.ytd : previous.ytd
    });
  }
  return [...byId.values()];
}

function mergePnlRows(existingRows = [], incomingRows = []) {
  const byUnit = new Map((existingRows ?? []).map((row) => [row.unit, row]));
  for (const row of (incomingRows ?? [])) {
    const previous = byUnit.get(row.unit) ?? {};
    byUnit.set(row.unit, {
      ...previous,
      ...row,
      revenueToday: filled(row.revenueToday) ? row.revenueToday : previous.revenueToday,
      purchasesToday: filled(row.purchasesToday) ? row.purchasesToday : previous.purchasesToday,
      fixedCost: filled(previous.fixedCost) ? previous.fixedCost : row.fixedCost
    });
  }
  return [...byUnit.values()];
}

function mergeReportData(existingData = {}, localData = {}) {
  existingData ??= {};
  localData ??= {};

  const merged = {
    ...existingData,
    ...localData,
    importSource: {
      ...(existingData.importSource ?? {}),
      ...(localData.importSource ?? {})
    },
    settlement: {
      ...(existingData.settlement ?? {}),
      ...(localData.settlement ?? {})
    }
  };

  for (const key of ['hotels', 'rabbits', 'cpDelivery', 'mickys', 'purosoul']) {
    merged[key] = mergeKpiRows(existingData[key], localData[key]);
  }

  // Merge FnB KPI rows by id so Pablo/Dali actuals are never overwritten with seed blanks.
  merged.fnb = {};
  for (const outlet of ['Pablo', 'Dali']) {
    merged.fnb[outlet] = mergeKpiRows(existingData.fnb?.[outlet], localData.fnb?.[outlet]);
  }

  // Merge P&L rows by unit so manually-entered revenue/purchases survive a re-import.
  merged.pnl = mergePnlRows(existingData.pnl, localData.pnl);

  return merged;
}

run()
  .catch((err) => {
    log(`FATAL: ${err.message}`);
    if (err.response) log(`Server: ${err.response}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDailyStore();
  });
