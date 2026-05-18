/**
 * Runs at 8 AM daily via Windows Task Scheduler.
 * Logs into report@cpgh.in, routes each overnight email to the right importer.
 *
 * Email → Handler mapping:
 *   "Night Audit Report of HCP Nagpur"           → importHotelReport       (XLS attachment)
 *   "Occupency Analysis report of HCP Nagpur"     → importOccupancyReport   (XLS attachment)
 *   "Report Notification: PABLO …"               → importPetpoojaReport    (HTML body, no attachment)
 *   "Report Notification: DALI …"                → importPetpoojaReport    (HTML body, no attachment)
 *   "Payment Wise Summary : PABLO …"             → importPetpoojaPaymentSummary (XLS attachment)
 *   "Payment Wise Summary : DALI …"              → importPetpoojaPaymentSummary (XLS attachment)
 *
 * After email processing, fetches bank positions from Google Sheets.
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { importHotelReport } from './importHotelReport.js';
import { importOccupancyReport } from './importOccupancyReport.js';
import { importPetpoojaReport } from './importPetpoojaReport.js';
import { importPetpoojaPaymentSummary } from './importPetpoojaPaymentSummary.js';
import { importBankPosition } from './importBankPosition.js';
import { importDaliCostHistory } from './importDaliCostHistory.js';
import { importPabloCostHistory } from './importPabloCostHistory.js';
import { importPurosoulSalesReport, importMickysSalesReport } from './importDailySalesReport.js';
import { importMickysLeads } from './importMickysLeads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ATTACH_DIR = path.resolve(__dirname, '..', 'data', 'attachments');

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

/** Accepts .xls, .xlsx, .XLS, .XLSX */
function findSpreadsheet(parsed) {
  return parsed.attachments?.find((a) => /\.(xlsx|xls)$/i.test(a.filename ?? ''));
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
    name: 'Petpooja Billing – Pablo',
    importSourceKey: 'pabloPetpoojaImportedAt',
    matches: (s) => subjectContains(s, 'report notification') && subjectContains(s, 'pablo') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Pablo', date)
  },
  {
    name: 'Petpooja Billing – Dali',
    importSourceKey: 'daliPetpoojaImportedAt',
    matches: (s) => subjectContains(s, 'report notification') && subjectContains(s, 'dali') && !subjectContains(s, 'payment wise'),
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
    name: 'Petpooja Billing - Rabbits',
    importSourceKey: 'rabbitsPetpoojaImportedAt',
    matches: (s) => subjectContains(s, 'report notification') && subjectContains(s, 'rabbit') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Rabbits', date)
  },
  {
    name: 'Petpooja Payment Summary - Rabbits',
    importSourceKey: 'rabbitsPaymentImportedAt',
    matches: (s) => subjectContains(s, 'payment wise summary') && subjectContains(s, 'rabbit'),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      const filePath = await saveAttachment(att, 'petpooja-rabbits-payment', date);
      return importPetpoojaPaymentSummary(filePath, 'Rabbits', date);
    }
  },
  {
    name: 'Purosoul Daily Sales Report',
    importSourceKey: 'purosoulSalesImportedAt',
    matches: (s) => subjectContains(s, 'centre point foods') && subjectContains(s, 'daily sales report'),
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
    matches: (s) => subjectContains(s, 'amarjit fiscal') && subjectContains(s, 'daily sales report'),
    run: async (parsed, date) => {
      const att = findSpreadsheet(parsed);
      if (!att) { logAttachments(parsed); throw new Error('No spreadsheet attachment'); }
      log(`  File: "${att.filename}" (${att.size}B)`);
      await saveAttachment(att, 'mickys-sales', att.filename);
      return importMickysSalesReport(att.content, att.filename, date);
    }
  }
];

async function processMessage(msg, date, existingData) {
  const parsed = await simpleParser(msg.source);
  const subject = parsed.subject || '';
  log(`Processing: "${subject}"`);

  const handler = HANDLERS.find((h) => h.matches(subject));
  if (!handler) {
    log('  No handler — skipping.');
    return;
  }

  log(`  → Handler: ${handler.name}`);

  if (handler.importSourceKey && existingData?.importSource?.[handler.importSourceKey]) {
    log(`  Already imported today — skipping.`);
    return;
  }

  try {
    const result = await handler.run(parsed, date);
    if (!result?.pending) {
      log(`  Done: ${JSON.stringify(result?.mapped ?? result)}`);
      if (handler.importSourceKey) {
        existingData.importSource = {
          ...(existingData.importSource ?? {}),
          [handler.importSourceKey]: new Date().toISOString()
        };
      }
    }
  } catch (err) {
    log(`  ERROR: ${err.message}`);
  }
}

async function run() {
  const date = yesterday();

  // Load existing data once — used to skip sources already imported this run
  const dataPath = path.resolve(__dirname, '..', 'data', `${date}.json`);
  let existingData = null;
  try {
    existingData = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch {
    existingData = null;
  }
  existingData ??= { importSource: {} };
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
      for (const seq of [...seqs].reverse()) {
        const msg = await client.fetchOne(String(seq), { source: true });
        await processMessage(msg, date, existingData);
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
  if (existingData?.importSource?.bankPositionImportedAt) {
    log('Bank positions already imported today — skipping.');
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
  if (existingData?.importSource?.daliCostImportedAt) {
    log('Dali cost already imported today — skipping.');
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
  if (existingData?.importSource?.pabloCostImportedAt) {
    log('Pablo cost already imported today — skipping.');
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
  if (existingData?.importSource?.mickysLeadsImportedAt) {
    log("Micky's leads already imported today — skipping.");
  } else {
    log("Fetching Micky's leads pipeline from Google Sheets…");
    try {
      const leadsResult = await importMickysLeads(date);
      log(`Micky's leads imported: ${leadsResult.total} total, ${leadsResult.active} active, ${leadsResult.converted} converted`);
    } catch (err) {
      log(`Micky's leads ERROR: ${err.message}`);
    }
  }

  // Push processed data to cloud backend
  await syncToCloud(date);
}

async function syncToCloud(date) {
  const cloudUrl = process.env.CLOUD_API_URL;
  const pin = process.env.DAILYFLASH_PIN;
  if (!cloudUrl || !pin) {
    log('Cloud sync skipped — CLOUD_API_URL or DAILYFLASH_PIN not set.');
    return;
  }

  const dataPath = path.resolve(__dirname, '..', 'data', `${date}.json`);
  let localData;
  try {
    localData = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch {
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
    const dataToPush = mergeReportData(existingJson?.saved, localData);

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

run().catch((err) => {
  log(`FATAL: ${err.message}`);
  if (err.response) log(`Server: ${err.response}`);
  process.exit(1);
});
