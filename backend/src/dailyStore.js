import fs from 'node:fs/promises';
import path from 'node:path';
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
