import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { readAttachmentPreview } from './attachmentPreview.js';
import { buildSeedData } from './excel.js';
import { collectFlags } from './flags.js';
import { createDailyFlashPdf } from './reportPdf.js';
import { buildSourceStatus } from './sources.js';
import { normalizeRabbitsCategoryBreakdown, UNITS } from './schema.js';
import { encryptJson, decryptJson, isEncryptionEnabled } from './crypto.js';
import { readDailyJson, writeDailyJson, readGenericJson, writeGenericJson } from './dailyStore.js';

const app = express();
const port = process.env.PORT || 4000;
const dataDir = path.resolve(process.cwd(), 'data');
const attachmentsDir = path.resolve(__dirname, '..', 'data', 'attachments');
const accessPin = process.env.DAILYFLASH_PIN || process.env.ACCESS_PIN;
const tokenSecret = process.env.JWT_SECRET || process.env.DAILYFLASH_PIN || 'change-me';
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me' || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a strong random value (>= 32 chars) in production.');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY must be set in production. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const emailImportScript = path.join(__dirname, 'fetchEmailReport.js');
const backendDir = path.resolve(__dirname, '..');
const LOGIN_LOCKOUT_FILE = path.join(dataDir, 'auth-lockout.json');
const MAX_FAILED_LOGIN_ATTEMPTS = 3;
const LOGIN_LOCKOUT_MS = 5 * 60 * 60 * 1000;
let loginLockoutState = null;
let emailImportJob = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  error: '',
  output: '',
  force: false
};

// MongoDB — used when MONGODB_URI is set; falls back to local JSON files otherwise.
let _mongoDb = null;
async function getDb() {
  if (!process.env.MONGODB_URI) return null;
  if (_mongoDb) return _mongoDb;
  try {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    _mongoDb = client.db('dailyflash');
    return _mongoDb;
  } catch (err) {
    console.error('MongoDB connection failed, falling back to JSON files:', err.message);
    return null;
  }
}

// Wrap async route handlers so Express 4 catches thrown errors.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!isProd && !allowedOrigins.length) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: false
}));
app.use(express.json({ limit: '10mb' }));

const loginAttemptsByIp = new Map();
const LOGIN_IP_WINDOW_MS = 60_000;
const LOGIN_IP_MAX = 10;
function loginIpRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttemptsByIp.get(ip) ?? { count: 0, resetAt: now + LOGIN_IP_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + LOGIN_IP_WINDOW_MS;
  }
  entry.count += 1;
  loginAttemptsByIp.set(ip, entry);
  if (entry.count > LOGIN_IP_MAX) {
    res.status(429).json({ error: 'Too many requests from this IP. Try again in a minute.' });
    return;
  }
  next();
}

function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function auditLog(event, details) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), audit: event, ...details }));
}

app.set('trust proxy', 1);

// Stateless signed tokens — survive server restarts.
function createSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function isValidSession(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url');
  if (sig !== expected) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Date.now() < exp;
  } catch {
    return false;
  }
}

function authToken(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.query.token ?? '');
}

function appendEmailImportOutput(chunk) {
  const text = String(chunk ?? '');
  emailImportJob.output = `${emailImportJob.output}${text}`.slice(-12000);
}

function emailImportStatus() {
  return {
    running: emailImportJob.running,
    startedAt: emailImportJob.startedAt,
    finishedAt: emailImportJob.finishedAt,
    exitCode: emailImportJob.exitCode,
    error: emailImportJob.error,
    output: emailImportJob.output,
    force: Boolean(emailImportJob.force)
  };
}

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readLoginLockoutState() {
  if (loginLockoutState) return loginLockoutState;
  const fallback = { failedAttempts: 0, lockedUntil: null };
  const db = await getDb();
  if (db) {
    const doc = await db.collection('authLockouts').findOne({ _id: 'pin' });
    const decoded = doc?.payloadEnc ? decryptJson(doc.payloadEnc) : doc;
    loginLockoutState = {
      failedAttempts: Number(decoded?.failedAttempts ?? 0),
      lockedUntil: decoded?.lockedUntil ?? null
    };
    return loginLockoutState;
  }
  await ensureDataDir();
  const saved = await readGenericJson(LOGIN_LOCKOUT_FILE, null);
  if (saved) {
    loginLockoutState = {
      failedAttempts: Number(saved.failedAttempts ?? 0),
      lockedUntil: saved.lockedUntil ?? null
    };
  } else {
    loginLockoutState = fallback;
  }
  return loginLockoutState;
}

async function writeLoginLockoutState(state) {
  loginLockoutState = {
    failedAttempts: Number(state.failedAttempts ?? 0),
    lockedUntil: state.lockedUntil ?? null
  };
  const db = await getDb();
  if (db) {
    await db.collection('authLockouts').updateOne(
      { _id: 'pin' },
      { $set: { payloadEnc: encryptJson(loginLockoutState) }, $unset: { failedAttempts: '', lockedUntil: '' } },
      { upsert: true }
    );
    return;
  }
  await ensureDataDir();
  await writeGenericJson(LOGIN_LOCKOUT_FILE, loginLockoutState);
}

function isLoginLocked(state) {
  return state.lockedUntil && Date.now() < new Date(state.lockedUntil).getTime();
}

function sendLoginLockout(res, lockedUntil) {
  res.status(423).json({
    error: 'Too many unsuccessful attempts. Desktop access is blocked for 5 hours.',
    lockedUntil
  });
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const PNL_VALUE_KEYS = ['revenueToday', 'purchasesToday', 'mtdNetProfit', 'ytdNetProfit'];

function hasEnteredPnlValues(row) {
  return PNL_VALUE_KEYS.some((key) => String(row?.[key] ?? '').trim() !== '');
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstKpiValue(rows = [], unit, names = []) {
  const match = rows.find((row) => row.unit === unit && names.some((name) => row.name === name));
  return match?.actual;
}

function sumKpiValues(rows = [], unit, names = []) {
  const total = rows
    .filter((row) => row.unit === unit && names.some((name) => row.name === name))
    .reduce((sum, row) => sum + numberValue(row.actual), 0);
  return total ? String(Math.round(total * 100) / 100) : '';
}

function derivePnlRows(data) {
  const revenueByUnit = {
    'CP Nagpur': () => sumKpiValues(data.hotels, 'CP Nagpur', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    'CP NM': () => sumKpiValues(data.hotels, 'CP NM', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Gross Sales']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Gross Sales']),
    Rabbits: () => firstKpiValue(data.rabbits, 'Rabbits', ['Total Revenue']),
    "Micky's": () => firstKpiValue(data.mickys, "Micky's", ['Order Revenue Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['Total Revenue Today'])
  };
  const purchasesByUnit = {
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Total Purchase']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Total Purchase']),
    Rabbits: () => firstKpiValue(data.rabbits, 'Rabbits', ['Purchase/RM Cost Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['RM Cost Today'])
  };
  return (data.pnl ?? []).map((row) => {
    const revenueToday = String(row.revenueToday ?? '').trim() || revenueByUnit[row.unit]?.() || '';
    const purchasesToday = String(row.purchasesToday ?? '').trim() || purchasesByUnit[row.unit]?.() || '';
    return { ...row, revenueToday, purchasesToday };
  });
}

function mergePnlRows(seedRows = [], savedRows = []) {
  const savedByUnit = new Map(savedRows.map((row) => [row.unit, row]));
  return seedRows.map((seedRow) => {
    const savedRow = savedByUnit.get(seedRow.unit);
    if (!savedRow) return seedRow;
    if (hasEnteredPnlValues(savedRow)) return { ...seedRow, ...savedRow };
    return seedRow;
  });
}

function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const savedRow = savedById.get(seedRow.id);
    seen.add(seedRow.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id } : seedRow;
  });
  const extraRows = savedRows.filter((row) => !seen.has(row.id));
  return [...mergedSeedRows, ...extraRows];
}

function mergeDailyData(seed, saved) {
  if (!saved) return seed;
  const merged = {
    ...seed,
    ...saved,
    fnb: {
      ...(saved.fnb ?? {}),
      Pablo: mergeSeedKpiRows(seed.fnb?.Pablo, saved.fnb?.Pablo),
      Dali: mergeSeedKpiRows(seed.fnb?.Dali, saved.fnb?.Dali)
    },
    pnl: mergePnlRows(seed.pnl, saved.pnl)
  };
  return normalizeRabbitsCategoryBreakdown({ ...merged, pnl: derivePnlRows(merged) });
}

async function readDailyData(date = dateKey()) {
  const db = await getDb();
  if (db) {
    const doc = await db.collection('reports').findOne({ date });
    if (!doc) return null;
    if (doc.payloadEnc) return decryptJson(doc.payloadEnc);
    return doc.data ?? null;
  }
  return readDailyJson(date);
}

async function writeDailyData(date, payload) {
  const record = { ...payload, date, savedAt: new Date().toISOString() };
  const db = await getDb();
  if (db) {
    await db.collection('reports').updateOne(
      { date },
      { $set: { date, payloadEnc: encryptJson(record) }, $unset: { data: '' } },
      { upsert: true }
    );
    return;
  }
  await writeDailyJson(date, payload);
}

async function listDailyDates(prefix) {
  const db = await getDb();
  if (db) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await db.collection('reports')
      .find({ date: { $regex: `^${escaped}` } }, { projection: { date: 1 } })
      .toArray();
    return docs.map((doc) => doc.date).filter(Boolean).sort();
  }
  try {
    const entries = await fs.readdir(dataDir);
    return entries
      .filter((name) => name.endsWith('.json') && name.startsWith(prefix))
      .map((name) => name.slice(0, -5))
      .sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function aggregatePnlForDates(dates) {
  const seedTemplate = buildSeedData();
  const fixedCostByUnit = Object.fromEntries(
    (seedTemplate.pnl ?? []).map((row) => [row.unit, numberValue(row.fixedCost)])
  );
  const totalsByUnit = Object.fromEntries(
    UNITS.map((unit) => [unit, {
      revenue: 0,
      purchases: 0,
      gp: 0,
      netProfit: 0,
      days: 0,
      fixedCost: fixedCostByUnit[unit] ?? 0
    }])
  );

  for (const date of dates) {
    const raw = await readDailyData(date);
    if (!raw) continue;
    const merged = mergeDailyData(seedTemplate, raw);
    const rows = derivePnlRows(merged);
    for (const row of rows) {
      const entry = totalsByUnit[row.unit];
      if (!entry) continue;
      const revenue = numberValue(row.revenueToday);
      const purchases = numberValue(row.purchasesToday);
      const fixed = numberValue(row.fixedCost) || entry.fixedCost;
      entry.revenue += revenue;
      entry.purchases += purchases;
      entry.gp += revenue - purchases;
      entry.netProfit += revenue - purchases - fixed;
      entry.days += 1;
    }
  }

  return totalsByUnit;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', loginIpRateLimit, wrap(async (req, res) => {
  if (!accessPin) {
    res.status(500).json({ error: 'DAILYFLASH_PIN is not configured on the backend.' });
    return;
  }

  const lockout = await readLoginLockoutState();
  if (isLoginLocked(lockout)) {
    auditLog('login.blocked.lockout', { ip: clientIp(req) });
    sendLoginLockout(res, lockout.lockedUntil);
    return;
  }
  if (lockout.lockedUntil) {
    await writeLoginLockoutState({ failedAttempts: 0, lockedUntil: null });
    lockout.failedAttempts = 0;
    lockout.lockedUntil = null;
  }

  const pin = String(req.body.pin ?? '').trim();
  if (!pin || !constantTimeEqual(pin, accessPin)) {
    const failedAttempts = lockout.failedAttempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString()
      : null;
    await writeLoginLockoutState({ failedAttempts, lockedUntil });
    auditLog('login.fail', { ip: clientIp(req), failedAttempts, lockedUntil });

    if (lockedUntil) {
      sendLoginLockout(res, lockedUntil);
      return;
    }

    res.status(401).json({
      error: `Invalid PIN. ${MAX_FAILED_LOGIN_ATTEMPTS - failedAttempts} attempt${MAX_FAILED_LOGIN_ATTEMPTS - failedAttempts === 1 ? '' : 's'} remaining before a 5-hour block.`
    });
    return;
  }
  await writeLoginLockoutState({ failedAttempts: 0, lockedUntil: null });
  auditLog('login.ok', { ip: clientIp(req) });
  res.json({ ok: true, token: createSession() });
}));

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  if (!isValidSession(authToken(req))) {
    res.status(401).json({ error: 'PIN required' });
    return;
  }
  next();
});

app.get('/api/seed', wrap(async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const rawSaved = await readDailyData(date);
  const saved = rawSaved ? mergeDailyData(seed, rawSaved) : null;
  res.json({ seed, saved, date });
}));

for (const route of ['bank-position', 'pnl', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']) {
  app.get(`/api/${route}`, wrap(async (req, res) => {
    const key = route.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const seed = buildSeedData();
    const saved = await readDailyData(req.query.date || dateKey());
    const data = mergeDailyData(seed, saved);
    res.json(data[key] ?? null);
  }));
}

app.post('/api/data', wrap(async (req, res) => {
  const date = req.body.date || dateKey();
  await writeDailyData(date, req.body.data ?? req.body);
  res.json({ ok: true, date });
}));

app.get('/api/flags', wrap(async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  res.json(collectFlags(mergeDailyData(seed, saved)));
}));

app.get('/api/source-status', wrap(async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  res.json(buildSourceStatus(mergeDailyData(seed, saved)));
}));

app.get('/api/pnl-period', wrap(async (req, res) => {
  const date = String(req.query.date || dateKey());
  const monthPrefix = date.slice(0, 7);
  const yearPrefix = date.slice(0, 4);

  const [monthDates, yearDates] = await Promise.all([
    listDailyDates(monthPrefix),
    listDailyDates(yearPrefix)
  ]);

  const [mtd, ytd] = await Promise.all([
    aggregatePnlForDates(monthDates),
    aggregatePnlForDates(yearDates)
  ]);

  res.json({
    date,
    monthPrefix,
    yearPrefix,
    mtdDates: monthDates,
    ytdDates: yearDates,
    mtd,
    ytd
  });
}));

app.get('/api/email-import', (_req, res) => {
  res.json(emailImportStatus());
});

app.post('/api/email-import', (req, res) => {
  if (emailImportJob.running) {
    res.json({ ok: true, alreadyRunning: true, ...emailImportStatus() });
    return;
  }

  const force = req.body?.force === true || req.query.force === 'true';
  emailImportJob = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    error: '',
    output: '',
    force
  };

  const child = spawn(process.execPath, [emailImportScript], {
    cwd: backendDir,
    env: {
      ...process.env,
      ...(force ? { FORCE_IMPORT: 'true' } : {})
    },
    windowsHide: true
  });

  child.stdout.on('data', appendEmailImportOutput);
  child.stderr.on('data', appendEmailImportOutput);
  child.on('error', (err) => {
    emailImportJob.running = false;
    emailImportJob.finishedAt = new Date().toISOString();
    emailImportJob.exitCode = 1;
    emailImportJob.error = err.message;
    appendEmailImportOutput(`\n${err.message}\n`);
  });
  child.on('exit', (code) => {
    emailImportJob.running = false;
    emailImportJob.finishedAt = new Date().toISOString();
    emailImportJob.exitCode = code ?? 0;
  });

  res.json({ ok: true, started: true, ...emailImportStatus() });
});

app.get('/api/source-report-preview', wrap(async (req, res) => {
  const date = req.query.date || dateKey();
  const sourceId = String(req.query.sourceId ?? '');
  const file = path.basename(String(req.query.file ?? ''));
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  const sourceStatus = buildSourceStatus(mergeDailyData(seed, saved));
  const source = sourceStatus.sources.find((item) => item.id === sourceId);

  if (!source) {
    res.status(404).json({ error: 'Source not found.' });
    return;
  }

  const allowedFiles = new Set((source.reportFiles ?? []).map((name) => path.basename(String(name))));
  if (!allowedFiles.has(file)) {
    res.status(404).json({ error: 'No previewable report found for this source.' });
    return;
  }

  try {
    res.json(await readAttachmentPreview(file, attachmentsDir));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const embeddedPreview = saved?.importSource?.reportPreviews?.[file];
      if (embeddedPreview) {
        res.json(embeddedPreview);
        return;
      }
      res.status(404).json({ error: 'The report preview was not synced yet. Run the email import/push again for this date.' });
      return;
    }
    throw err;
  }
}));

app.get('/api/report.pdf', wrap(async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  const data = mergeDailyData(seed, saved);
  const filename = `cp-daily-flash-${date}.pdf`;

  const disposition = req.query.inline ? 'inline' : 'attachment';
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `${disposition}; filename="${filename}"`);
  const doc = createDailyFlashPdf(data, date);
  doc.pipe(res);
  doc.end();
}));

app.post('/api/ai-notes', wrap(async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(400).json({ error: 'ANTHROPIC_API_KEY is not configured on the backend.' });
    return;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 1200,
      messages: [{ role: 'user', content: req.body.prompt }]
    })
  });

  const json = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ error: json.error?.message || 'Claude API request failed.' });
    return;
  }
  res.json({ text: json.content?.map((part) => part.text).join('\n') ?? '' });
}));

// Global error handler — sends JSON instead of crashing.
app.use((err, req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

app.listen(port, () => {
  console.log(`CP Flash Report API running on http://localhost:${port}`);

  // Keep Render free tier alive — ping self every 14 minutes.
  const selfUrl = process.env.CLOUD_API_URL;
  if (selfUrl) {
    setInterval(() => {
      fetch(`${selfUrl}/health`).catch(() => {});
    }, 14 * 60 * 1000);
  }

  // Hosted import scheduler — runs fetchEmailReport.js every 30 minutes on Render.
  // Enable by setting ENABLE_CLOUD_IMPORT=true in Render environment variables.
  // Also requires: REPORT_EMAIL_PASSWORD, REPORT_EMAIL, REPORT_IMAP_HOST on Render.
  if (process.env.ENABLE_CLOUD_IMPORT === 'true') {
    const importScript = path.join(__dirname, 'fetchEmailReport.js');
    const backendDir = path.resolve(__dirname, '..');
    let importRunning = false;

    const runImport = () => {
      if (importRunning) {
        console.log(`[${new Date().toISOString()}] Import skipped because the previous run is still active.`);
        return;
      }
      importRunning = true;
      console.log(`[${new Date().toISOString()}] Running scheduled import…`);
      const child = spawn(process.execPath, [importScript], {
        env: process.env,
        cwd: backendDir,
        stdio: 'inherit'
      });
      child.on('exit', (code) => {
        importRunning = false;
        console.log(`[${new Date().toISOString()}] Import finished (exit ${code ?? 0})`);
      });
      child.on('error', (err) => {
        importRunning = false;
        console.error(`[${new Date().toISOString()}] Import failed to start: ${err.message}`);
      });
    };

    // First run 90 seconds after startup (let the server fully boot), then every 30 minutes.
    setTimeout(runImport, 90_000);
    setInterval(runImport, 30 * 60 * 1000);
    console.log('Hosted import scheduler enabled — runs every 30 minutes.');
  }
});
