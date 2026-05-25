/**
 * One-shot migration: re-write every daily JSON file (and Mongo document)
 * as an encrypted payload using the current ENCRYPTION_KEY.
 *
 * Safe to run repeatedly — already-encrypted records are skipped.
 *
 * Local:   node src/migrateEncrypt.js
 * Render:  add as a one-off job, or run from a shell with the env loaded.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { encryptJson, decryptJson, looksEncrypted, isEncryptionEnabled } from './crypto.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

async function migrateDisk() {
  let entries;
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return { scanned: 0, encrypted: 0, alreadyEncrypted: 0 };
    throw err;
  }
  let scanned = 0;
  let encrypted = 0;
  let alreadyEncrypted = 0;
  for (const name of entries) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name !== 'auth-lockout.json') continue;
    const full = path.join(DATA_DIR, name);
    const raw = await fs.readFile(full, 'utf8');
    scanned += 1;
    if (looksEncrypted(raw)) { alreadyEncrypted += 1; continue; }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (err) {
      console.warn(`Skipping ${name}: not valid JSON (${err.message})`);
      continue;
    }
    await fs.writeFile(full, encryptJson(obj));
    encrypted += 1;
    console.log(`encrypted ${name}`);
  }
  return { scanned, encrypted, alreadyEncrypted };
}

async function migrateMongo() {
  if (!process.env.MONGODB_URI) return null;
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  try {
    const db = client.db('dailyflash');
    let encrypted = 0;
    let alreadyEncrypted = 0;
    const reports = db.collection('reports');
    const reportCursor = reports.find({});
    while (await reportCursor.hasNext()) {
      const doc = await reportCursor.next();
      if (doc.payloadEnc) { alreadyEncrypted += 1; continue; }
      if (!doc.data) continue;
      await reports.updateOne(
        { _id: doc._id },
        { $set: { payloadEnc: encryptJson(doc.data) }, $unset: { data: '' } }
      );
      encrypted += 1;
      console.log(`encrypted report ${doc.date}`);
    }

    const lockouts = db.collection('authLockouts');
    const lockoutCursor = lockouts.find({});
    while (await lockoutCursor.hasNext()) {
      const doc = await lockoutCursor.next();
      if (doc.payloadEnc) { alreadyEncrypted += 1; continue; }
      const state = { failedAttempts: doc.failedAttempts ?? 0, lockedUntil: doc.lockedUntil ?? null };
      await lockouts.updateOne(
        { _id: doc._id },
        { $set: { payloadEnc: encryptJson(state) }, $unset: { failedAttempts: '', lockedUntil: '' } }
      );
      encrypted += 1;
      console.log(`encrypted lockout ${doc._id}`);
    }

    return { encrypted, alreadyEncrypted };
  } finally {
    await client.close();
  }
}

async function main() {
  if (!isEncryptionEnabled()) {
    console.error('ENCRYPTION_KEY is not set. Aborting — set it before running this migration.');
    process.exit(1);
  }
  const disk = await migrateDisk();
  console.log(`Disk: scanned ${disk.scanned}, encrypted ${disk.encrypted}, already encrypted ${disk.alreadyEncrypted}`);
  const mongo = await migrateMongo();
  if (mongo) {
    console.log(`Mongo: encrypted ${mongo.encrypted}, already encrypted ${mongo.alreadyEncrypted}`);
  } else {
    console.log('Mongo: skipped (no MONGODB_URI).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
