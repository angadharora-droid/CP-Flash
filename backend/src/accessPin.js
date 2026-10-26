import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { readGenericJson } from './dailyStore.js';

const scrypt = promisify(crypto.scrypt);
const STORE_PATH = path.resolve(process.cwd(), 'data', 'access-pin.json');
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const HASH_BYTES = 64;

// Matches PIN_LENGTH on the frontend PinPage — the login screen accepts six digits only.
export const PIN_PATTERN = /^\d{6}$/;

let warnedEnvFallback = false;

// Repeated (111111) or straight-run (123456, 987654) PINs are the first ones guessed.
export function isWeakPin(pin) {
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((digit, i) => digit - digits[i]));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]);
}

async function hashPin(pin, salt, params) {
  return scrypt(String(pin), salt, HASH_BYTES, params);
}

async function readPinRecord(getDb) {
  const db = getDb ? await getDb() : null;
  if (db) return db.collection('accessPin').findOne({ _id: 'singleton' });
  return readGenericJson(STORE_PATH, null);
}

// Stored as a salted scrypt hash, never the PIN itself. Deliberately not wrapped in
// encryptJson: the record has to stay readable across ENCRYPTION_KEY rotations, and
// set-pin may run on a machine whose key differs from the cloud host's.
export async function buildPinRecord(pin) {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = (await hashPin(pin, salt, SCRYPT_PARAMS)).toString('base64');
  return { algo: 'scrypt', ...SCRYPT_PARAMS, salt, hash, savedAt: new Date().toISOString() };
}

export async function writePin(pin, getDb) {
  const record = await buildPinRecord(pin);
  const db = getDb ? await getDb() : null;
  if (db) {
    await db.collection('accessPin').replaceOne({ _id: 'singleton' }, record, { upsert: true });
    return 'mongo';
  }
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(record, null, 2));
  return STORE_PATH;
}

// Resolves to a (pin) => Promise<boolean> checker, or null when no PIN is configured.
// The stored hash wins; DAILYFLASH_PIN / ACCESS_PIN in the environment is only a
// fallback for hosts that have not run set-pin yet.
export async function loadPinVerifier(getDb) {
  const record = await readPinRecord(getDb);
  if (record?.hash && record?.salt) {
    const expected = Buffer.from(record.hash, 'base64');
    const params = { N: record.N, r: record.r, p: record.p };
    return async (pin) => {
      const actual = await hashPin(pin, record.salt, params);
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    };
  }

  const envPin = process.env.DAILYFLASH_PIN || process.env.ACCESS_PIN;
  if (!envPin) return null;
  if (!warnedEnvFallback) {
    console.warn('[auth] Checking logins against DAILYFLASH_PIN from the environment. Run "npm run set-pin" to store the PIN in the database instead.');
    warnedEnvFallback = true;
  }
  const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return async (pin) => crypto.timingSafeEqual(digest(pin), digest(envPin));
}
