import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

let cachedKey = null;
let cachedKeyMaterial = '';
let warnedMissingKey = false;

function loadKey() {
  const material = process.env.ENCRYPTION_KEY || '';
  if (!material) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
    }
    if (!warnedMissingKey) {
      console.warn('[crypto] ENCRYPTION_KEY not set — data will be stored as plaintext. Set ENCRYPTION_KEY before deploying.');
      warnedMissingKey = true;
    }
    return null;
  }
  if (cachedKey && cachedKeyMaterial === material) return cachedKey;

  let buf;
  try {
    buf = Buffer.from(material, 'base64');
  } catch {
    throw new Error('ENCRYPTION_KEY is not valid base64.');
  }
  if (buf.length !== 32) {
    buf = crypto.createHash('sha256').update(material, 'utf8').digest();
  }
  cachedKey = buf;
  cachedKeyMaterial = material;
  return cachedKey;
}

export function isEncryptionEnabled() {
  return Boolean(loadKey());
}

export function encryptString(plaintext) {
  const key = loadKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptString(payload) {
  if (typeof payload !== 'string') return payload;
  if (!payload.startsWith(`${VERSION}:`)) return payload;
  const key = loadKey();
  if (!key) throw new Error('Encrypted payload found but ENCRYPTION_KEY is not set.');
  const parts = payload.split(':');
  if (parts.length !== 4) throw new Error('Malformed encrypted payload.');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed encrypted payload.');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function encryptJson(obj) {
  return encryptString(JSON.stringify(obj));
}

export function decryptJson(payload) {
  if (payload == null) return null;
  if (typeof payload === 'object') return payload;
  const text = decryptString(payload);
  const trimmed = String(text).trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error('Decrypted payload is not JSON.');
  }
  return JSON.parse(text);
}

export function looksEncrypted(text) {
  return typeof text === 'string' && text.startsWith(`${VERSION}:`);
}
