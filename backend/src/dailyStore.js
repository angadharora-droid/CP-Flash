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

let _mongoDb = null;
async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  if (_mongoDb) return _mongoDb;
  try {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    _mongoDb = client.db('dailyflash');
    return _mongoDb;
  } catch (err) {
    console.error('[dailyStore] MongoDB connection failed, using JSON files:', err.message);
    return null;
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
