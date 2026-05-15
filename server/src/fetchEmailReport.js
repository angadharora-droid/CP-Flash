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
    matches: (s) => subjectContains(s, 'report notification') && subjectContains(s, 'pablo') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Pablo', date)
  },
  {
    name: 'Petpooja Billing – Dali',
    matches: (s) => subjectContains(s, 'report notification') && subjectContains(s, 'dali') && !subjectContains(s, 'payment wise'),
    run: async (parsed, date) => importPetpoojaReport(parsed.html || '', 'Dali', date)
  },
  {
    name: 'Petpooja Payment Summary – Pablo',
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
    name: 'Purosoul Daily Sales Report',
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

async function processMessage(msg, date) {
  const parsed = await simpleParser(msg.source);
  const subject = parsed.subject || '';
  log(`Processing: "${subject}"`);

  const handler = HANDLERS.find((h) => h.matches(subject));
  if (!handler) {
    log('  No handler — skipping.');
    return;
  }

  log(`  → Handler: ${handler.name}`);
  try {
    const result = await handler.run(parsed, date);
    if (!result?.pending) {
      log(`  Done: ${JSON.stringify(result?.mapped ?? result)}`);
    }
  } catch (err) {
    log(`  ERROR: ${err.message}`);
  }
}

async function run() {
  if (!EMAIL_PASS) {
    log('ERROR: REPORT_EMAIL_PASSWORD not set in server/.env');
    process.exit(1);
  }

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_SECURE,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    logger: false
  });

  log(`Connecting to ${IMAP_HOST}:${IMAP_PORT} as ${EMAIL_USER}`);
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
      return;
    }

    const date = yesterday();
    for (const seq of seqs) {
      const msg = await client.fetchOne(String(seq), { source: true });
      await processMessage(msg, date);
    }

    log('All emails processed.');
  } finally {
    lock.release();
    await client.logout();
    log('Disconnected.');
  }

  // Fetch bank positions from Google Sheets (independent of email)
  log('Fetching bank positions from Google Sheets…');
  try {
    const bankResult = await importBankPosition(yesterday());
    log(`Bank positions imported: ${bankResult.mapped.map((row) => `${row.unit}/${row.account}: ${Math.round(Number(row.netBalance) || 0)}`).join(', ')}`);
  } catch (err) {
    log(`Bank position ERROR: ${err.message}`);
  }

  // Fetch Dali food + liquor cost from Google Sheet
  log('Fetching Dali cost sheet from Google Sheets…');
  try {
    const daliResult = await importDaliCostHistory();
    log(`Dali cost imported: ${daliResult.rowCount} rows → ${daliResult.written.join(', ')}`);
  } catch (err) {
    log(`Dali cost ERROR: ${err.message}`);
  }

  // Fetch Pablo food + liquor cost from Google Sheet
  log('Fetching Pablo cost sheet from Google Sheets…');
  try {
    const pabloResult = await importPabloCostHistory();
    log(`Pablo cost imported: ${pabloResult.rowCount} rows → ${pabloResult.written.join(', ')}`);
  } catch (err) {
    log(`Pablo cost ERROR: ${err.message}`);
  }

  // Fetch Micky's leads pipeline from Google Sheet
  log("Fetching Micky's leads pipeline from Google Sheets…");
  try {
    const leadsResult = await importMickysLeads(yesterday());
    log(`Micky's leads imported: ${leadsResult.total} total, ${leadsResult.active} active, ${leadsResult.converted} converted`);
  } catch (err) {
    log(`Micky's leads ERROR: ${err.message}`);
  }
}

run().catch((err) => {
  log(`FATAL: ${err.message}`);
  if (err.response) log(`Server: ${err.response}`);
  process.exit(1);
});
