// One-off: fetch the "Market Segment Report" email(s) from report@cpgh.in and
// save the Market Analysis attachment(s) to the scratchpad for inspection.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const OUT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const client = new ImapFlow({
  host: process.env.REPORT_IMAP_HOST || 'imap.rediffmailpro.com',
  port: Number(process.env.REPORT_IMAP_PORT) || 993,
  secure: true,
  auth: { user: process.env.REPORT_EMAIL || 'report@cpgh.in', pass: process.env.REPORT_EMAIL_PASSWORD },
  logger: false
});

await client.connect();
const lock = await client.getMailboxLock('INBOX');
try {
  const since = new Date(Date.now() - 14 * 86400000);
  const seqs = await client.search({ since });
  console.log(`Scanning ${seqs.length} email(s) since ${since.toISOString().slice(0, 10)}`);
  for await (const msg of client.fetch(seqs, { source: true })) {
    const parsed = await simpleParser(msg.source);
    const subject = parsed.subject ?? '';
    if (!/market\s*seg/i.test(subject) && !(parsed.attachments ?? []).some((a) => /market/i.test(a.filename ?? ''))) continue;
    console.log(`MATCH: "${subject}" from ${parsed.from?.text} sent ${parsed.date?.toISOString?.()}`);
    for (const att of parsed.attachments ?? []) {
      const safe = (att.filename || 'attachment').replace(/[/\\:*?"<>|]/g, '_');
      const stamp = parsed.date ? parsed.date.toISOString().slice(0, 10) : 'nodate';
      const file = path.join(OUT_DIR, `${stamp}__${safe}`);
      await fs.writeFile(file, att.content);
      console.log(`  saved: ${file} (${att.size}B, ${att.contentType})`);
    }
  }
} finally {
  lock.release();
  await client.logout();
}
console.log('done');
