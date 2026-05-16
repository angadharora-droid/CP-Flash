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
import { buildSeedData } from './excel.js';
import { collectFlags } from './flags.js';
import { createDailyFlashPdf } from './reportPdf.js';
import { buildSourceStatus } from './sources.js';

const app = express();
const port = process.env.PORT || 4000;
const dataDir = path.resolve(process.cwd(), 'data');
const accessPin = process.env.DAILYFLASH_PIN || process.env.ACCESS_PIN;
const tokenSecret = process.env.JWT_SECRET || process.env.DAILYFLASH_PIN || 'change-me';

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

app.use(cors());
app.use(express.json({ limit: '4mb' }));

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

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function readDailyData(date = dateKey()) {
  const db = await getDb();
  if (db) {
    const doc = await db.collection('reports').findOne({ date });
    return doc?.data ?? null;
  }
  await ensureDataDir();
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, `${date}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function writeDailyData(date, payload) {
  const record = { ...payload, date, savedAt: new Date().toISOString() };
  const db = await getDb();
  if (db) {
    await db.collection('reports').updateOne(
      { date },
      { $set: { date, data: record } },
      { upsert: true }
    );
    return;
  }
  await ensureDataDir();
  await fs.writeFile(path.join(dataDir, `${date}.json`), JSON.stringify(record, null, 2));
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  if (!accessPin) {
    res.status(500).json({ error: 'DAILYFLASH_PIN is not configured on the backend.' });
    return;
  }
  const pin = String(req.body.pin ?? '').trim();
  if (!pin || pin !== accessPin) {
    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }
  res.json({ ok: true, token: createSession() });
});

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
  const saved = await readDailyData(date);
  res.json({ seed, saved, date });
}));

for (const route of ['bank-position', 'pnl', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']) {
  app.get(`/api/${route}`, wrap(async (req, res) => {
    const key = route.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const seed = buildSeedData();
    const saved = await readDailyData(req.query.date || dateKey());
    res.json(saved?.[key] ?? seed[key] ?? null);
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
  res.json(collectFlags({ ...seed, ...(saved ?? {}) }));
}));

app.get('/api/source-status', wrap(async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  res.json(buildSourceStatus({ ...seed, ...(saved ?? {}) }));
}));

app.get('/api/report.pdf', wrap(async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  const data = { ...seed, ...(saved ?? {}) };
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

  // Hosted import scheduler — runs fetchEmailReport.js every 10 minutes on Render.
  // Enable by setting ENABLE_CLOUD_IMPORT=true in Render environment variables.
  // Also requires: REPORT_EMAIL_PASSWORD, REPORT_EMAIL, REPORT_IMAP_HOST on Render.
  if (process.env.ENABLE_CLOUD_IMPORT === 'true') {
    const importScript = path.join(__dirname, 'fetchEmailReport.js');
    const backendDir = path.resolve(__dirname, '..');

    const runImport = () => {
      console.log(`[${new Date().toISOString()}] Running scheduled import…`);
      const child = spawn(process.execPath, [importScript], {
        env: process.env,
        cwd: backendDir,
        stdio: 'inherit'
      });
      child.on('exit', (code) => {
        console.log(`[${new Date().toISOString()}] Import finished (exit ${code ?? 0})`);
      });
    };

    // First run 90 seconds after startup (let the server fully boot), then every 10 minutes.
    setTimeout(runImport, 90_000);
    setInterval(runImport, 10 * 60 * 1000);
    console.log('Hosted import scheduler enabled — runs every 10 minutes.');
  }
});
