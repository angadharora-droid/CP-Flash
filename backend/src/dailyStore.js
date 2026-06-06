import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { encryptJson, decryptJson } from './crypto.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');

function dataPathFor(date) {
  return path.join(DATA_DIR, `${date}.json`);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readDailyJson(date) {
  try {
    const raw = await fs.readFile(dataPathFor(date), 'utf8');
    return decryptJson(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeDailyJson(date, payload) {
  await ensureDir();
  const record = { ...payload, date, savedAt: new Date().toISOString() };
  await fs.writeFile(dataPathFor(date), encryptJson(record));
  return record;
}

let _mongoClient = null;
let _mongoDb = null;
let _mongoFailed = false;
let _mongoConnecting = null;
async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  if (_mongoDb) return _mongoDb;
  if (_mongoFailed) return null;
  if (_mongoConnecting) return _mongoConnecting;
  _mongoConnecting = (async () => {
    try {
      _mongoClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      await _mongoClient.connect();
      _mongoDb = _mongoClient.db('dailyflash');
      return _mongoDb;
    } catch (err) {
      console.error('[dailyStore] MongoDB connection failed, using JSON files:', err.message);
      _mongoClient = null;
      _mongoFailed = true;
      return null;
    } finally {
      _mongoConnecting = null;
    }
  })();
  return _mongoConnecting;
}

// Short-lived scripts (CLI importers, the email-fetch task) must call this before
// exiting — otherwise the open Mongo connection keeps the event loop alive forever.
// Long-running services (the API server) should NOT call this.
export async function closeDailyStore() {
  if (_mongoClient) {
    await _mongoClient.close().catch(() => { /* swallow shutdown errors */ });
    _mongoClient = null;
    _mongoDb = null;
  }
}

// Mongo-aware read. Falls back to local file when no Mongo doc exists for the date.
export async function readDaily(date) {
  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection('reports').findOne({ date });
    if (doc) {
      if (doc.payloadEnc) return decryptJson(doc.payloadEnc);
      return doc.data ?? null;
    }
  }
  return readDailyJson(date);
}

// Mongo-aware write. Writes Mongo (when available) AND file (always, as offline backup).
export async function writeDaily(date, payload) {
  const record = { ...payload, date, savedAt: new Date().toISOString() };
  const db = await getMongoDb();
  if (db) {
    await db.collection('reports').updateOne(
      { date },
      { $set: { date, payloadEnc: encryptJson(record) }, $unset: { data: '' } },
      { upsert: true }
    );
  }
  await writeDailyJson(date, payload);
  return record;
}

// Per-date mutex — prevents concurrent sheet importers from racing on read-modify-write
// of the same date file. Each call chains onto the previous promise for that date so
// concurrent callers are serialized, while different dates run freely in parallel.
const _dateLocks = new Map();
export function withDateLock(date, fn) {
  const prev = _dateLocks.get(date) ?? Promise.resolve();
  const current = prev.then(() => fn());
  _dateLocks.set(date, current.then(() => {}, () => {}));
  return current;
}

export async function readGenericJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return decryptJson(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeGenericJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, encryptJson(payload));
}
