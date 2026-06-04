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
import { normalizeRabbitCategoryBreakdown, settlementModes, UNITS, UNITS_WITHOUT_FIXED_COST } from './schema.js';
import { encryptJson, decryptJson, isEncryptionEnabled } from './crypto.js';
import { readDailyJson, writeDailyJson, readGenericJson, writeGenericJson } from './dailyStore.js';
import { readAopTargets, writeAopTargets, applyDailyTargetOverrides, collectKpiCatalog } from './aopTargets.js';

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
// _mongoConnecting deduplicates concurrent connection attempts so only one
// MongoClient is ever created. _mongoFailed caches permanent failure so
// subsequent calls return null immediately without re-attempting.
let _mongoDb = null;
let _mongoFailed = false;
let _mongoConnecting = null;
async function getDb() {
  if (!process.env.MONGODB_URI) return null;
  if (_mongoDb) return _mongoDb;
  if (_mongoFailed) return null;
  if (_mongoConnecting) return _mongoConnecting;
  _mongoConnecting = (async () => {
    try {
      const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      await client.connect();
      _mongoDb = client.db('dailyflash');
      return _mongoDb;
    } catch (err) {
      console.error('MongoDB connection failed, falling back to JSON files:', err.message);
      _mongoFailed = true;
      return null;
    } finally {
      _mongoConnecting = null;
    }
  })();
  return _mongoConnecting;
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

function parseIsoDate(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekRangeForDate(date) {
  const parsed = parseIsoDate(date);
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(parsed, mondayOffset);
  const end = addDays(start, 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function weekRangeFromStart(weekStart) {
  const start = parseIsoDate(weekStart);
  const end = addDays(start, 6);
  return { start: isoDate(start), end: isoDate(end) };
}

const CUMULATIVE_KPI_PATTERN = /\b(mtd|ytd|month to date|year to date)\b/i;

function isCumulativeKpiName(name) {
  return CUMULATIVE_KPI_PATTERN.test(String(name ?? ''));
}

const PNL_VALUE_KEYS = ['revenueToday', 'purchasesToday', 'mtdNetProfit', 'ytdNetProfit'];

function hasEnteredPnlValues(row) {
  return PNL_VALUE_KEYS.some((key) => String(row?.[key] ?? '').trim() !== '');
}

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalUnit(unit) {
  return unit === 'Rabbit' + 's' ? 'Rabbit' : unit;
}

function firstKpiValue(rows = [], unit, names = []) {
  const match = rows.find((row) => canonicalUnit(row.unit) === unit && names.some((name) => row.name === name));
  return match?.actual;
}

function sumKpiValues(rows = [], unit, names = []) {
  const total = rows
    .filter((row) => canonicalUnit(row.unit) === unit && names.some((name) => row.name === name))
    .reduce((sum, row) => sum + numberValue(row.actual), 0);
  return total ? String(Math.round(total * 100) / 100) : '';
}

function derivePnlRows(data) {
  const revenueByUnit = {
    'CP Nagpur': () => sumKpiValues(data.hotels, 'CP Nagpur', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    'CP NM': () => sumKpiValues(data.hotels, 'CP NM', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Gross Sales']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Gross Sales']),
    Rabbit: () => firstKpiValue(data.rabbits, 'Rabbit', ['Total Revenue']),
    "Micky's": () => firstKpiValue(data.mickys, "Micky's", ['Order Revenue Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['Total Revenue Today'])
  };
  const purchasesByUnit = {
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Total Purchase']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Total Purchase']),
    Rabbit: () => firstKpiValue(data.rabbits, 'Rabbit', ['Purchase/RM Cost Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['RM Cost Today'])
  };
  return (data.pnl ?? []).map((row) => {
    const revenueToday = String(row.revenueToday ?? '').trim() || revenueByUnit[row.unit]?.() || '';
    const purchasesToday = String(row.purchasesToday ?? '').trim() || purchasesByUnit[row.unit]?.() || '';
    return { ...row, revenueToday, purchasesToday };
  });
}

function mergePnlRows(seedRows = [], savedRows = []) {
  const savedByUnit = new Map(savedRows.map((row) => [canonicalUnit(row.unit), row]));
  return seedRows.map((seedRow) => {
    const savedRow = savedByUnit.get(seedRow.unit);
    if (!savedRow) return seedRow;
    if (hasEnteredPnlValues(savedRow)) return { ...seedRow, ...savedRow, unit: seedRow.unit };
    return seedRow;
  });
}

function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const keyOf = (row) => `${canonicalUnit(row.unit) ?? ''}::${row.name ?? ''}`;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const savedByKey = new Map();
  for (const row of savedRows) {
    const k = keyOf(row);
    if (!savedByKey.has(k)) savedByKey.set(k, []);
    savedByKey.get(k).push(row);
  }
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const directMatch = savedById.get(seedRow.id);
    const keyMatches = savedByKey.get(keyOf(seedRow)) ?? [];
    const savedRow = directMatch ?? keyMatches[0];
    if (directMatch?.id) seen.add(directMatch.id);
    for (const m of keyMatches) if (m?.id) seen.add(m.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id, unit: seedRow.unit, section: seedRow.section } : seedRow;
  });
  const extraRows = savedRows.filter((row) => !seen.has(row.id));
  return [...mergedSeedRows, ...extraRows];
}

function mergeDailyData(seed, saved) {
  if (!saved) return seed;
  const merged = {
    ...seed,
    ...saved,
    hotels: mergeSeedKpiRows(seed.hotels, saved.hotels),
    rabbits: mergeSeedKpiRows(seed.rabbits, saved.rabbits),
    fnb: {
      ...(saved.fnb ?? {}),
      Pablo: mergeSeedKpiRows(seed.fnb?.Pablo, saved.fnb?.Pablo),
      Dali: mergeSeedKpiRows(seed.fnb?.Dali, saved.fnb?.Dali)
    },
    pnl: mergePnlRows(seed.pnl, saved.pnl)
  };
  return normalizeRabbitCategoryBreakdown({ ...merged, pnl: derivePnlRows(merged) });
}

let cachedAopTargets = null;
async function getAopTargets() {
  if (cachedAopTargets) return cachedAopTargets;
  cachedAopTargets = await readAopTargets(getDb);
  return cachedAopTargets;
}
function invalidateAopTargetsCache() {
  cachedAopTargets = null;
}

const pnlPeriodCache = new Map();
const dailyDataCache = new Map();
const listDailyDatesCache = new Map();
function invalidatePnlPeriodCache(date) {
  for (const key of pnlPeriodCache.keys()) {
    if (!date || key === date || key.startsWith(date.slice(0, 7)) || key.startsWith(date.slice(0, 4))) {
      pnlPeriodCache.delete(key);
    }
  }
}

function decodeDailyDoc(doc) {
  if (!doc) return null;
  if (doc.payloadEnc) return decryptJson(doc.payloadEnc);
  return doc.data ?? null;
}

function cacheDailyData(date, data) {
  dailyDataCache.set(date, data ?? null);
  return data ?? null;
}

function invalidateDailyCaches(date) {
  if (date) dailyDataCache.delete(date);
  else dailyDataCache.clear();
  listDailyDatesCache.clear();
}

function invalidateReportCaches(date) {
  invalidateDailyCaches(date);
  if (date) invalidatePnlPeriodCache(date);
  else pnlPeriodCache.clear();
}

async function readDailyData(date = dateKey()) {
  if (dailyDataCache.has(date)) return dailyDataCache.get(date);
  const db = await getDb();
  if (db) {
    const doc = await db.collection('reports').findOne({ date });
    return cacheDailyData(date, decodeDailyDoc(doc));
  }
  return cacheDailyData(date, await readDailyJson(date));
}

async function readDailyDataMany(dates) {
  const uniqueDates = [...new Set(dates)].sort();
  const missingDates = uniqueDates.filter((date) => !dailyDataCache.has(date));

  if (missingDates.length) {
    const db = await getDb();
    if (db) {
      const docs = await db.collection('reports')
        .find({ date: { $in: missingDates } })
        .toArray();
      const docsByDate = new Map(docs.map((doc) => [doc.date, doc]));
      for (const date of missingDates) {
        cacheDailyData(date, decodeDailyDoc(docsByDate.get(date)));
      }
    } else {
      await Promise.all(missingDates.map(async (date) => {
        cacheDailyData(date, await readDailyJson(date));
      }));
    }
  }

  return uniqueDates.map((date) => [date, dailyDataCache.get(date) ?? null]);
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
    cacheDailyData(date, record);
    invalidatePnlPeriodCache(date);
    listDailyDatesCache.clear();
    return;
  }
  await writeDailyJson(date, payload);
  cacheDailyData(date, record);
  invalidatePnlPeriodCache(date);
  listDailyDatesCache.clear();
}

async function listDailyDates(prefix) {
  if (listDailyDatesCache.has(prefix)) return listDailyDatesCache.get(prefix);
  const db = await getDb();
  if (db) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await db.collection('reports')
      .find({ date: { $regex: `^${escaped}` } }, { projection: { date: 1 } })
      .toArray();
    const dates = docs.map((doc) => doc.date).filter(Boolean).sort();
    listDailyDatesCache.set(prefix, dates);
    return dates;
  }
  try {
    const entries = await fs.readdir(dataDir);
    const dates = entries
      .filter((name) => name.endsWith('.json') && name.startsWith(prefix))
      .map((name) => name.slice(0, -5))
      .sort();
    listDailyDatesCache.set(prefix, dates);
    return dates;
  } catch (err) {
    if (err.code === 'ENOENT') {
      listDailyDatesCache.set(prefix, []);
      return [];
    }
    throw err;
  }
}

async function listDailyDatesInRange(startDate, endDate) {
  const prefixes = new Set();
  let cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  while (cursor <= end) {
    prefixes.add(isoDate(cursor).slice(0, 7));
    cursor = addDays(cursor, 1);
  }
  const groupedDates = await Promise.all(Array.from(prefixes, (prefix) => listDailyDates(prefix)));
  return groupedDates
    .flat()
    .filter((dailyDate) => dailyDate >= startDate && dailyDate <= endDate)
    .sort();
}

function collectKpiRows(data) {
  return [
    ...(data.hotels ?? []),
    ...(data.fnb?.Pablo ?? []),
    ...(data.fnb?.Dali ?? []),
    ...(data.rabbits ?? []),
    ...(data.mickys ?? []),
    ...(data.purosoul ?? []),
    ...(data.purosoulSku ?? [])
  ];
}

function getKpiAggregationMode(name) {
  const label = String(name ?? '').toLowerCase();
  if (isCumulativeKpiName(label)) return 'latest';
  if (
    label.includes('%')
    || label.includes('avg')
    || label.includes('occupancy')
    || label.includes('arr')
    || label.includes('revpar')
    || label.includes('aov')
    || label.includes('apc')
    || label.includes('rate')
    || label.includes('turnover')
    || label.includes('margin')
    || label.includes('covers/day')
  ) {
    return 'avg';
  }
  return 'sum';
}

async function aggregatePeriodForDates(dates) {
  const seedTemplate = buildSeedData();
  const fixedCostByUnit = Object.fromEntries(
    (seedTemplate.pnl ?? []).map((row) => [row.unit, numberValue(row.fixedCost)])
  );
  const pnlByUnit = Object.fromEntries(
    UNITS.map((unit) => [unit, {
      revenue: 0,
      purchases: 0,
      gp: 0,
      netProfit: 0,
      days: 0,
      fixedCost: fixedCostByUnit[unit] ?? 0
    }])
  );
  const kpiTotals = Object.create(null);
  const kpiModes = Object.create(null);

  const sortedDates = [...dates].sort();
  const rawByDate = await readDailyDataMany(sortedDates);
  for (const [date, raw] of rawByDate) {
    if (!raw) continue;
    const merged = mergeDailyData(seedTemplate, raw);

    for (const row of derivePnlRows(merged)) {
      const entry = pnlByUnit[row.unit];
      if (!entry) continue;
      const revenue = numberValue(row.revenueToday);
      const purchases = numberValue(row.purchasesToday);
      const fixed = UNITS_WITHOUT_FIXED_COST.includes(row.unit)
        ? 0
        : (numberValue(row.fixedCost) || entry.fixedCost);
      entry.revenue += revenue;
      entry.purchases += purchases;
      entry.gp += revenue - purchases;
      entry.netProfit += revenue - purchases - fixed;
      entry.days += 1;
    }

    for (const kpi of collectKpiRows(merged)) {
      if (!kpi?.id) continue;
      const actual = String(kpi.actual ?? '').trim();
      if (actual === '') continue;
      const aggregate = kpiTotals[kpi.id] ??= {
        mode: getKpiAggregationMode(kpi.name),
        sum: 0,
        count: 0,
        latest: 0,
        latestDate: ''
      };
      kpiModes[kpi.id] = aggregate.mode;
      const value = numberValue(actual);
      if (aggregate.mode === 'latest') {
        if (date >= aggregate.latestDate) {
          aggregate.latest = value;
          aggregate.latestDate = date;
        }
      } else {
        aggregate.sum += value;
        aggregate.count += 1;
      }
    }
  }

  const kpiSums = Object.fromEntries(
    Object.entries(kpiTotals).map(([id, aggregate]) => {
      if (aggregate.mode === 'latest') return [id, aggregate.latest];
      if (aggregate.mode === 'avg') return [id, aggregate.count ? aggregate.sum / aggregate.count : 0];
      return [id, aggregate.sum];
    })
  );

  return { pnl: pnlByUnit, kpis: kpiSums, kpiModes };
}

async function aggregateYtdFromMonthlyMtd(dates) {
  const datesByMonth = new Map();
  for (const date of dates) {
    const month = date.slice(0, 7);
    datesByMonth.set(month, [...(datesByMonth.get(month) ?? []), date]);
  }
  const monthlyAggregates = await Promise.all(
    Array.from(datesByMonth.values(), (monthDates) => aggregatePeriodForDates(monthDates))
  );

  const seedTemplate = buildSeedData();
  const fixedCostByUnit = Object.fromEntries(
    (seedTemplate.pnl ?? []).map((row) => [row.unit, numberValue(row.fixedCost)])
  );
  const pnlByUnit = Object.fromEntries(
    UNITS.map((unit) => [unit, {
      revenue: 0,
      purchases: 0,
      gp: 0,
      netProfit: 0,
      days: 0,
      fixedCost: fixedCostByUnit[unit] ?? 0
    }])
  );
  const kpiTotals = Object.create(null);

  for (const monthAggregate of monthlyAggregates) {
    for (const [unit, monthPnl] of Object.entries(monthAggregate.pnl)) {
      const entry = pnlByUnit[unit];
      if (!entry) continue;
      entry.revenue += monthPnl.revenue;
      entry.purchases += monthPnl.purchases;
      entry.gp += monthPnl.gp;
      entry.netProfit += monthPnl.netProfit;
      entry.days += monthPnl.days;
    }

    for (const [id, value] of Object.entries(monthAggregate.kpis)) {
      const mode = monthAggregate.kpiModes[id] ?? 'sum';
      const aggregate = kpiTotals[id] ??= { mode, sum: 0, count: 0 };
      aggregate.sum += numberValue(value);
      aggregate.count += 1;
    }
  }

  const kpis = Object.fromEntries(
    Object.entries(kpiTotals).map(([id, aggregate]) => [
      id,
      aggregate.mode === 'avg' && aggregate.count
        ? aggregate.sum / aggregate.count
        : aggregate.sum
    ])
  );

  return { pnl: pnlByUnit, kpis };
}

async function aggregateOccupancyMixForDates(dates) {
  const rawByDate = await readDailyDataMany(dates);
  const byUnit = {};

  function mixEntryFromNotes(raw) {
    const notes = raw?.importSource?.cpNmNotes;
    if (!notes) return null;
    const get = (key) => {
      const match = new RegExp(`${key}=([^,]+)`).exec(notes);
      return match ? numberValue(match[1]) : 0;
    };
    const roomRevenue = get('roomRev');
    const segments = {
      corporate: get('corp'),
      fit: get('fit'),
      ota: get('ota'),
      group: get('grp'),
      walkin: get('walkin'),
      noshow: get('noshow')
    };
    const totalRooms = Object.values(segments).reduce((sum, value) => sum + value, 0);
    if (!totalRooms) return null;
    const entry = (name, rooms) => ({
      name,
      rooms,
      pax: rooms,
      revenue: roomRevenue ? Math.round((roomRevenue * rooms) / totalRooms) : 0
    });
    return {
      unit: 'CP NM',
      totalRooms,
      totalPax: totalRooms,
      totalRevenue: Math.round(roomRevenue),
      sbo: [
        entry('Travel Agent / OTA', segments.ota),
        entry('Walk-ins', segments.walkin),
        entry('Group Bookings', segments.group),
        entry('No-shows', segments.noshow)
      ].filter((item) => item.rooms > 0),
      segment: [
        entry('Corporate', segments.corporate),
        entry('FIT/Leisure', segments.fit),
        entry('Group Bookings', segments.group)
      ].filter((item) => item.rooms > 0)
    };
  }

  function addMix(mix) {
    if (!mix) return;
    const unit = mix.unit || 'CP Nagpur';
    const entry = byUnit[unit] ??= {
      totalRooms: 0,
      totalPax: 0,
      totalRevenue: 0,
      sbo: new Map(),
      segment: new Map()
    };
    entry.totalRooms += numberValue(mix.totalRooms);
    entry.totalPax += numberValue(mix.totalPax);
    entry.totalRevenue += numberValue(mix.totalRevenue);

    for (const key of ['sbo', 'segment']) {
      for (const item of mix[key] ?? []) {
        const name = String(item.name ?? '').trim() || 'Unspecified';
        const bucket = entry[key].get(name) ?? { name, rooms: 0, pax: 0, revenue: 0 };
        bucket.rooms += numberValue(item.rooms);
        bucket.pax += numberValue(item.pax);
        bucket.revenue += numberValue(item.revenue);
        entry[key].set(name, bucket);
      }
    }
  }

  for (const [, raw] of rawByDate) {
    if (!raw) continue;
    for (const mix of Object.values(raw.occupancyMixByUnit ?? {})) {
      addMix(mix);
    }
    if (raw.occupancyMix) addMix(raw.occupancyMix);
    if (!raw.occupancyMixByUnit?.['CP NM']) addMix(mixEntryFromNotes(raw));
  }

  return Object.fromEntries(Object.entries(byUnit).map(([unit, entry]) => [
    unit,
    {
      totalRooms: entry.totalRooms,
      totalPax: entry.totalPax,
      totalRevenue: Math.round(entry.totalRevenue),
      sbo: [...entry.sbo.values()].map((item) => ({ ...item, revenue: Math.round(item.revenue) })).sort((a, b) => b.rooms - a.rooms || b.revenue - a.revenue),
      segment: [...entry.segment.values()].map((item) => ({ ...item, revenue: Math.round(item.revenue) })).sort((a, b) => b.rooms - a.rooms || b.revenue - a.revenue)
    }
  ]));
}

async function aggregateSettlementForDates(dates) {
  const seedTemplate = buildSeedData();
  const rawByDate = await readDailyDataMany(dates);
  const matrix = Object.fromEntries(settlementModes.map((mode) => [mode, {}]));

  for (const [, raw] of rawByDate) {
    if (!raw) continue;
    const merged = mergeDailyData(seedTemplate, raw);
    for (const mode of settlementModes) {
      const sourceRow = merged.settlement?.[mode] ?? {};
      for (const unit of UNITS) {
        const value = unit === 'Rabbit'
          ? numberValue(sourceRow.Rabbit ?? sourceRow['Rabbit' + 's'])
          : numberValue(sourceRow[unit]);
        if (!value) continue;
        matrix[mode][unit] = String(numberValue(matrix[mode][unit]) + value);
      }
    }
  }

  return matrix;
}

async function aggregatePurosoulSkuForDates(dates) {
  const rawByDate = await readDailyDataMany(dates);
  const bySku = new Map();

  for (const [date, raw] of rawByDate) {
    if (!raw) continue;
    for (const row of raw.purosoulSku ?? []) {
      const sku = String(row.sku ?? '').trim();
      if (!sku) continue;
      const entry = bySku.get(sku) ?? {
        sku,
        produced: 0,
        dispatched: 0,
        clStock: '',
        mtd: '',
        ytd: '',
        latestDate: ''
      };
      entry.produced += numberValue(row.produced);
      entry.dispatched += numberValue(row.dispatched);
      if (date >= entry.latestDate) {
        entry.clStock = row.clStock ?? '';
        entry.mtd = row.mtd ?? '';
        entry.ytd = row.ytd ?? '';
        entry.latestDate = date;
      }
      bySku.set(sku, entry);
    }
  }

  return [...bySku.values()].map(({ latestDate, ...row }) => ({
    ...row,
    produced: String(row.produced),
    dispatched: String(row.dispatched)
  }));
}

function formatAggregate(value) {
  return String(Math.round(numberValue(value) * 100) / 100);
}

function applyKpiAggregatesToActuals(data, aggregate, options = {}) {
  const weekSums = aggregate?.kpis ?? {};
  const kpiModes = aggregate?.kpiModes ?? {};
  const periodDays = Math.max(1, options.periodDays ?? 7);
  const blankMissing = options.blankMissing !== false;
  const stripCumulative = options.stripCumulative !== false;
  const weeklyOverrides = options.weeklyTargets ?? {};
  const mergeRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    const filtered = stripCumulative
      ? rows.filter((row) => !isCumulativeKpiName(row?.name))
      : rows;
    return filtered.map((row) => {
      if (!row?.id) return row;
      const hasAggregate = weekSums[row.id] !== undefined;
      const target = numberValue(row.target);
      const mode = kpiModes[row.id];
      const overrideTarget = weeklyOverrides[row.id];
      const scaledTarget = overrideTarget !== undefined
        ? String(overrideTarget)
        : target && mode === 'sum'
          ? formatAggregate(target * periodDays)
          : row.target;
      if (!hasAggregate) {
        return { ...row, actual: blankMissing ? '' : row.actual, target: scaledTarget };
      }
      return {
        ...row,
        actual: formatAggregate(weekSums[row.id]),
        target: scaledTarget
      };
    });
  };
  return {
    ...data,
    hotels: mergeRows(data.hotels).filter((row) => row.section !== 'Forecast'),
    rabbits: mergeRows(data.rabbits),
    mickys: mergeRows(data.mickys),
    purosoul: mergeRows(data.purosoul),
    purosoulSku: mergeRows(data.purosoulSku),
    fnb: {
      ...(data.fnb ?? {}),
      Pablo: mergeRows(data.fnb?.Pablo),
      Dali: mergeRows(data.fnb?.Dali)
    }
  };
}

function applyPnlAggregatesToWeeklyData(data, aggregate, options = {}) {
  const pnlByUnit = aggregate?.pnl ?? {};
  const periodDays = Math.max(1, options.periodDays ?? 7);
  return {
    ...data,
    pnl: (data.pnl ?? []).map((row) => {
      const weekRow = pnlByUnit[row.unit];
      const dailyFixed = UNITS_WITHOUT_FIXED_COST.includes(row.unit)
        ? 0
        : (numberValue(row.fixedCost) || (weekRow ? weekRow.fixedCost : 0));
      const weeklyFixed = dailyFixed * periodDays;
      const revenue = weekRow ? weekRow.revenue : 0;
      const purchases = weekRow ? weekRow.purchases : 0;
      return {
        ...row,
        revenueToday: formatAggregate(revenue),
        purchasesToday: formatAggregate(purchases),
        fixedCost: formatAggregate(weeklyFixed),
        mtdNetProfit: '',
        ytdNetProfit: ''
      };
    })
  };
}

async function buildWeeklyReportData(data, date, options = {}) {
  const range = options.weekStart
    ? weekRangeFromStart(options.weekStart)
    : weekRangeForDate(date);
  const { start, end } = range;
  const weekDates = await listDailyDatesInRange(start, end);
  const [weeklyAggregate, weeklySettlement, weeklyPurosoulSku] = await Promise.all([
    aggregatePeriodForDates(weekDates),
    aggregateSettlementForDates(weekDates),
    aggregatePurosoulSkuForDates(weekDates)
  ]);
  const overrides = await getAopTargets();
  const withoutForecast = {
    ...data,
    bankPosition: [],
    hotels: (data.hotels ?? []).filter((row) => row.section !== 'Forecast')
  };
  const aggregateOptions = { periodDays: 7, weeklyTargets: overrides.weekly };
  const withKpis = applyKpiAggregatesToActuals(withoutForecast, weeklyAggregate, aggregateOptions);
  const withPnl = applyPnlAggregatesToWeeklyData(withKpis, weeklyAggregate, aggregateOptions);
  const withDashboardWeekData = {
    ...withPnl,
    settlement: weeklySettlement,
    purosoulSku: weeklyPurosoulSku.length ? weeklyPurosoulSku : withPnl.purosoulSku
  };
  return { data: withDashboardWeekData, week: { start, end, dates: weekDates } };
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
  const overrides = await getAopTargets();
  const seedWithOverrides = applyDailyTargetOverrides(seed, overrides.daily);
  const saved = rawSaved ? applyDailyTargetOverrides(mergeDailyData(seed, rawSaved), overrides.daily) : null;
  res.json({ seed: seedWithOverrides, saved, date });
}));

for (const route of ['bank-position', 'pnl', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']) {
  app.get(`/api/${route}`, wrap(async (req, res) => {
    const key = route.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const seed = buildSeedData();
    const saved = await readDailyData(req.query.date || dateKey());
    const overrides = await getAopTargets();
    const data = applyDailyTargetOverrides(mergeDailyData(seed, saved), overrides.daily);
    res.json(data[key] ?? null);
  }));
}

app.post('/api/data', wrap(async (req, res) => {
  const date = req.body.date || dateKey();
  await writeDailyData(date, req.body.data ?? req.body);
  invalidatePnlPeriodCache(date);
  res.json({ ok: true, date });
}));

app.get('/api/flags', wrap(async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  const overrides = await getAopTargets();
  res.json(collectFlags(applyDailyTargetOverrides(mergeDailyData(seed, saved), overrides.daily)));
}));

app.get('/api/aop-targets', wrap(async (_req, res) => {
  const seed = buildSeedData();
  const overrides = await getAopTargets();
  const kpis = collectKpiCatalog(seed);
  res.json({ kpis, daily: overrides.daily, weekly: overrides.weekly });
}));

app.post('/api/aop-targets', wrap(async (req, res) => {
  const saved = await writeAopTargets(req.body ?? {}, getDb);
  invalidateAopTargetsCache();
  res.json({ ok: true, daily: saved.daily, weekly: saved.weekly });
}));

app.get('/api/source-status', wrap(async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  res.json(buildSourceStatus({ ...mergeDailyData(seed, saved), date }));
}));

app.get('/api/pnl-period', wrap(async (req, res) => {
  const date = String(req.query.date || dateKey());

  if (pnlPeriodCache.has(date)) {
    res.json(pnlPeriodCache.get(date));
    return;
  }

  const monthPrefix = date.slice(0, 7);
  const yearPrefix = date.slice(0, 4);
  const weekRange = weekRangeForDate(date);

  const [monthDates, yearDates] = await Promise.all([
    listDailyDates(monthPrefix),
    listDailyDates(yearPrefix)
  ]);
  const weekDates = (await listDailyDatesInRange(weekRange.start, weekRange.end))
    .filter((dailyDate) => dailyDate <= date);
  const mtdDates = monthDates.filter((dailyDate) => dailyDate <= date);
  const ytdDates = yearDates.filter((dailyDate) => dailyDate <= date);

  const [weekAgg, mtdAgg, ytdAgg, occupancyMix, settlement, purosoulSku] = await Promise.all([
    aggregatePeriodForDates(weekDates),
    aggregatePeriodForDates(mtdDates),
    aggregateYtdFromMonthlyMtd(ytdDates),
    aggregateOccupancyMixForDates(weekDates),
    aggregateSettlementForDates(weekDates),
    aggregatePurosoulSkuForDates(weekDates)
  ]);

  const payload = {
    date,
    monthPrefix,
    yearPrefix,
    weekStart: weekRange.start,
    weekEnd: weekRange.end,
    weekDates,
    mtdDates,
    ytdDates,
    week: weekAgg.pnl,
    settlement,
    purosoulSku,
    occupancyMix,
    mtd: mtdAgg.pnl,
    ytd: ytdAgg.pnl,
    kpis: { week: weekAgg.kpis, mtd: mtdAgg.kpis, ytd: ytdAgg.kpis },
    kpiModes: { week: weekAgg.kpiModes, mtd: mtdAgg.kpiModes, ytd: ytdAgg.kpiModes }
  };
  pnlPeriodCache.set(date, payload);
  res.json(payload);
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
    invalidateReportCaches();
    appendEmailImportOutput(`\n${err.message}\n`);
  });
  child.on('exit', (code) => {
    emailImportJob.running = false;
    emailImportJob.finishedAt = new Date().toISOString();
    emailImportJob.exitCode = code ?? 0;
    invalidateReportCaches();
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
  const reportType = String(req.query.reportType ?? 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
  const sections = String(req.query.sections ?? '')
    .split(',')
    .map((section) => section.trim())
    .filter(Boolean);
  const weekStartRaw = String(req.query.weekStart ?? '').trim();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw) ? weekStartRaw : null;
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  const overrides = await getAopTargets();
  const dailyData = applyDailyTargetOverrides(mergeDailyData(seed, saved), overrides.daily);
  const weekly = reportType === 'weekly'
    ? await buildWeeklyReportData(dailyData, date, weekStart ? { weekStart } : {})
    : null;
  const data = weekly?.data ?? dailyData;
  const filename = reportType === 'weekly'
    ? `cp-weekly-flash-${weekly.week.start}-to-${weekly.week.end}.pdf`
    : `cp-daily-flash-${date}.pdf`;

  const disposition = req.query.inline ? 'inline' : 'attachment';
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `${disposition}; filename="${filename}"`);
  const doc = createDailyFlashPdf(data, date, { sections, reportType, week: weekly?.week });
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
  // Pre-warm the seed cache so the first real request doesn't pay the Excel parse cost.
  setImmediate(() => { try { buildSeedData(); } catch { /* non-fatal */ } });

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
        // FORCE_IMPORT so each 30-min run re-fetches every source (matching the
        // manual "Refresh Sources" button) instead of skipping ones already imported.
        env: { ...process.env, FORCE_IMPORT: 'true' },
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
