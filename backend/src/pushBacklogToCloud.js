/**
 * One-time script: pushes all local data/YYYY-MM-DD.json files to the cloud backend.
 * Run once to seed Render with existing data:
 *   node src/pushBacklogToCloud.js
 *
 * Optional: push a specific date range
 *   node src/pushBacklogToCloud.js 2026-05-01 2026-05-15
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachReportPreviews } from './attachmentPreview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ATTACH_DIR = path.resolve(DATA_DIR, 'attachments');

const cloudUrl = process.env.CLOUD_API_URL;
const pin = process.env.DAILYFLASH_PIN;

if (!cloudUrl || !pin) {
  console.error('ERROR: Set CLOUD_API_URL and DAILYFLASH_PIN in backend/.env');
  process.exit(1);
}

const [, , fromArg, toArg] = process.argv;

async function getToken() {
  const res = await fetch(`${cloudUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const { token } = await res.json();
  return token;
}

async function run() {
  const files = (await fs.readdir(DATA_DIR))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  const filtered = files.filter((f) => {
    const date = f.replace('.json', '');
    if (fromArg && date < fromArg) return false;
    if (toArg && date > toArg) return false;
    return true;
  });

  console.log(`Found ${filtered.length} file(s) to push to ${cloudUrl}`);
  if (!filtered.length) process.exit(0);

  const token = await getToken();
  let ok = 0;
  let fail = 0;

  for (const file of filtered) {
    const date = file.replace('.json', '');
    try {
      const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8'));
      const dataWithPreviews = await attachReportPreviews(data, ATTACH_DIR, (message) => console.log(`  ${message}`));
      const res = await fetch(`${cloudUrl}/api/data`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ date, data: dataWithPreviews })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`  ✓ ${date}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${date}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} pushed, ${fail} failed.`);
}

run().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
