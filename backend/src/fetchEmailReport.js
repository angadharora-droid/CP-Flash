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
 *
 * After email processing, fetches bank positions from Google Sheets.
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { readDailyJson, closeDailyStore } from './dailyStore.js';
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
import { importMickysLeads } from './importMickysLeads.js';
import { attachReportPreviews } from './attachmentPreview.js';
import { importCpNmManagerFlash, importCpNmHistForecast } from './importCpNmReport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACH_DIR = path.resolve(__dirname, '..', 'data', 'attachments');
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

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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
  const filePath = path.join(ATTACH_DIR, safeName);
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
    matches: (s) => subjectContains(s, 'night audit report', 'nagpur'),
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
    // actual subject has typo: "Occupency"
    matches: (s) => (subjectContains(s, 'occupancy analysis') || subjectContains(s, 'occupency analysis')) && subjectContains(s, 'nagpur'),
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
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[_-]?OCC/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[_-]?OCC/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_OCC attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-occ-nagpur', date);
      return importOccupancyMix(filePath, date, 'CP Nagpur');
    }
  },
  {
    // HCP_POS_SALE is the outlet-wise bill register bundled in the same "HCP REPORT"
    // email. It feeds deduped daily covers for Meeting Point / Freakk / High Steak
    // into the hotels "F&B Outlets" table. `bundled: true` so it runs alongside
    // HCP Occupancy Mix above (both match the one email by attachment name).
    name: 'HCP POS Sales / Covers (CP Nagpur)',
    importSourceKey: 'posSalesImportedAt',
    bundled: true,
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[_-]?POS/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[_-]?POS/i);
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
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[_-]?FORE/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[_-]?FORE/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_FORE attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-fore-nagpur', date);
      return importForecast(filePath, date, 'CP Nagpur');
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
    matches: (s, parsed) => !!findAttachmentByName(parsed, /HCP[_-]?EVENT/i),
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /HCP[_-]?EVENT/i);
      if (!att) { logAttachments(parsed); throw new Error('No HCP_EVENT attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'hcp-event-nagpur', date);
      return importEvents(filePath, date, 'CP Nagpur');
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
  // ── CP NM (Centre Point, Vashi — Unit of Vijan Motors) ──────────────────────
  // Both handlers match the same IDS Next automated email (sender
  // navimumbaicentrepoint@gmail.com, subject "Hotel Centre Point … Vijan Motors …").
  // They are bundled so both attachments are processed in one email pass.
  {
    // Manager Flash Report → Occupancy %, Rooms Sold, Room Revenue, ARR, RevPAR,
    //                         F&B Revenue, Settlement modes (Cash/Card/UPI/City Ledger).
    name: 'CP NM Manager Flash Report',
    importSourceKey: 'cpNmImportedAt',
    bundled: true,
    matches: (s, parsed) => {
      const isCpNm = /navimumbaicentrepoint@gmail\.com/i.test(messageText(parsed))
        || (subjectContains(s, 'hotel centre point') && subjectContains(s, 'vijan motors'));
      return isCpNm && !!findAttachmentByName(parsed, /manager.?flash|flash.?report/i);
    },
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /manager.?flash|flash.?report/i);
      if (!att) { logAttachments(parsed); throw new Error('No Manager Flash Report attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-manager-flash', date);
      return importCpNmManagerFlash(filePath, date);
    }
  },
  {
    // History & Forecast Report → Tomorrow Occupancy Forecast %, Arrivals, Departures.
    name: 'CP NM History & Forecast Report',
    importSourceKey: 'cpNmForecastImportedAt',
    bundled: true,
    matches: (s, parsed) => {
      const isCpNm = /navimumbaicentrepoint@gmail\.com/i.test(messageText(parsed))
        || (subjectContains(s, 'hotel centre point') && subjectContains(s, 'vijan motors'));
      return isCpNm && !!findAttachmentByName(parsed, /history.*forecast|hist.*fore|History_and/i);
    },
    run: async (parsed, date) => {
      const att = findAttachmentByName(parsed, /history.*forecast|hist.*fore|History_and/i);
      if (!att) { logAttachments(parsed); throw new Error('No History & Forecast Report attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'cpnm-hist-forecast', date);
      return importCpNmHistForecast(filePath, date);
    }
  },
  {
    name: 'Purosoul Daily Sales Report',
    importSourceKey: 'purosoulSalesImportedAt',
    matches: (s, parsed) => subjectContains(s, 'daily sales report') && /amarjit fiscal|afvpl/i.test(messageText(parsed)),
    currentFile: (file) => /AFVPL/i.test(file),
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
    matches: (s, parsed) => subjectContains(s, 'daily sales report') && /cp foods|cp_foods|cpfoods/i.test(messageText(parsed)),
    currentFile: (file) => /CP_FOODS|CP FOODS/i.test(file),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      await saveAttachment(att, 'mickys-sales', att.filename);
      return importMickysSalesReport(att.content, att.filename, date);
    }
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
  // Run date-validating handlers (forecast/events) first: if one finds the email is from
  // an older cycle, the whole bundle is stale, so skip the siblings that can't check
  // their own date (occ-mix / pos-sales) rather than import yesterday's data.
  handlers.sort((a, b) => (b.validatesDate ? 1 : 0) - (a.validatesDate ? 1 : 0));
  let bundleStale = false;
  for (const handler of handlers) {
    if (bundleStale && handler.bundled) {
      log(`  Skipping ${handler.name}: HCP bundle email is stale (older than run date).`);
      continue;
    }
    const result = await runHandler(handler, parsed, date, existingData, touchedDates);
    if (result?.pending && result?.reason === 'stale-report') bundleStale = true;
  }
}

async function runHandler(handler, parsed, date, existingData, touchedDates) {
  log(`  → Handler: ${handler.name}`);

  if (handler.importSourceKey && existingData?.importSource?.[handler.importSourceKey]) {
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

  try {
    const result = await handler.run(parsed, date);
    if (result?.pending) {
      log(`  Pending: ${result.reason ?? 'not imported'} — leaving source unset.`);
    } else {
      log(`  Done: ${JSON.stringify(result?.mapped ?? result)}`);
      // Handlers may file under a date other than the run date (forward-looking
      // reports use their own content date) — track it so the run syncs it too.
      if (result?.date) touchedDates?.add(result.date);
      if (handler.importSourceKey) {
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
    const since = new Date();
    since.setDate(since.getDate() - 1);
    since.setHours(0, 0, 0, 0);

    const seqs = await client.search({ since });
    log(`Found ${seqs.length} email(s) since ${since.toISOString().slice(0, 10)}`);

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

  // Fetch bank positions from Google Sheets (independent of email)
  if (!shouldRefreshSheetSource(existingData?.importSource, 'bankPositionImportedAt')) {
    logSheetSkip('Bank positions', existingData.importSource.bankPositionImportedAt);
  } else {
    log('Fetching bank positions from Google Sheets…');
    try {
      const bankResult = await importBankPosition(date);
      log(`Bank positions imported: ${bankResult.mapped.map((row) => `${row.unit}/${row.account}: ${Math.round(Number(row.netBalance) || 0)}`).join(', ')}`);
    } catch (err) {
      log(`Bank position ERROR: ${err.message}`);
    }
  }

  // Fetch Dali food + liquor cost from Google Sheet
  if (!shouldRefreshSheetSource(existingData?.importSource, 'daliCostImportedAt')) {
    logSheetSkip('Dali cost', existingData.importSource.daliCostImportedAt);
  } else {
    log('Fetching Dali cost sheet from Google Sheets…');
    try {
      const daliResult = await importDaliCostHistory();
      log(`Dali cost imported: ${daliResult.rowCount} rows → ${daliResult.written.join(', ')}`);
    } catch (err) {
      log(`Dali cost ERROR: ${err.message}`);
    }
  }

  // Fetch Pablo food + liquor cost from Google Sheet
  if (!shouldRefreshSheetSource(existingData?.importSource, 'pabloCostImportedAt')) {
    logSheetSkip('Pablo cost', existingData.importSource.pabloCostImportedAt);
  } else {
    log('Fetching Pablo cost sheet from Google Sheets…');
    try {
      const pabloResult = await importPabloCostHistory();
      log(`Pablo cost imported: ${pabloResult.rowCount} rows → ${pabloResult.written.join(', ')}`);
    } catch (err) {
      log(`Pablo cost ERROR: ${err.message}`);
    }
  }

  // Fetch Micky's leads pipeline from Google Sheet
  if (!shouldRefreshSheetSource(existingData?.importSource, 'mickysLeadsImportedAt')) {
    logSheetSkip("Micky's leads", existingData.importSource.mickysLeadsImportedAt);
  } else {
    log("Fetching Micky's leads pipeline from Google Sheets…");
    try {
      const leadsResult = await importMickysLeads(date);
      log(`Micky's leads imported: ${leadsResult.total} total, ${leadsResult.active} active, ${leadsResult.converted} converted`);
    } catch (err) {
      log(`Micky's leads ERROR: ${err.message}`);
    }
  }

  // Fetch Purosoul SKU production & dispatch from Google Sheet
  if (!shouldRefreshSheetSource(existingData?.importSource, 'purosoulFlashImportedAt')) {
    logSheetSkip('Purosoul SKU flash report', existingData.importSource.purosoulFlashImportedAt);
  } else {
    log('Fetching Purosoul SKU flash report from Google Sheets…');
    try {
      const purosoulSkuResult = await importPurosoulFlashReport();
      log(`Purosoul SKU imported: ${purosoulSkuResult.rowCount} rows → ${purosoulSkuResult.written.join(', ')}`);
    } catch (err) {
      log(`Purosoul SKU ERROR: ${err.message}`);
    }
  }

  // Push processed data to cloud backend — one sync per date any handler wrote to
  // (forward-looking reports may land on a different day than the run date).
  for (const d of [...touchedDates].sort()) {
    await syncToCloud(d);
  }
}

async function syncToCloud(date) {
  const cloudUrl = process.env.CLOUD_API_URL;
  const pin = process.env.DAILYFLASH_PIN;
  if (!cloudUrl || !pin) {
    log('Cloud sync skipped — CLOUD_API_URL or DAILYFLASH_PIN not set.');
    return;
  }

  const localData = await readDailyJson(date);
  if (!localData) {
    log(`Cloud sync skipped — no local data file for ${date}.`);
    return;
  }

  log(`Syncing ${date} to ${cloudUrl} …`);
  try {
    const loginRes = await fetch(`${cloudUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
    const { token } = await loginRes.json();

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

function mergeReportData(existingData = {}, localData = {}) {
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

  for (const key of ['hotels', 'rabbits', 'mickys', 'purosoul']) {
    merged[key] = mergeKpiRows(existingData[key], localData[key]);
  }

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
