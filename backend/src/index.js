import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { buildSeedData } from './excel.js';
import { collectFlags } from './flags.js';
import { createDailyFlashPdf } from './reportPdf.js';
import { buildSourceStatus } from './sources.js';

const app = express();
const port = process.env.PORT || 4000;
const dataDir = path.resolve(process.cwd(), 'data');
const accessPin = process.env.DAILYFLASH_PIN || process.env.ACCESS_PIN;
const tokenSecret = process.env.JWT_SECRET || process.env.DAILYFLASH_PIN || 'change-me';

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
  await ensureDataDir();
  const filePath = path.join(dataDir, `${date}.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeDailyData(date, payload) {
  await ensureDataDir();
  const filePath = path.join(dataDir, `${date}.json`);
  await fs.writeFile(filePath, JSON.stringify({ ...payload, date, savedAt: new Date().toISOString() }, null, 2));
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

app.get('/api/seed', async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  res.json({ seed, saved, date });
});

for (const route of ['bank-position', 'pnl', 'hotels', 'fnb', 'rabbits', 'mickys', 'purosoul', 'settlement']) {
  app.get(`/api/${route}`, async (req, res) => {
    const key = route.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const seed = buildSeedData();
    const saved = await readDailyData(req.query.date || dateKey());
    res.json(saved?.[key] ?? seed[key] ?? null);
  });
}

app.post('/api/data', async (req, res) => {
  const date = req.body.date || dateKey();
  await writeDailyData(date, req.body.data ?? req.body);
  res.json({ ok: true, date });
});

app.get('/api/flags', async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  res.json(collectFlags({ ...seed, ...(saved ?? {}) }));
});

app.get('/api/source-status', async (req, res) => {
  const seed = buildSeedData();
  const saved = await readDailyData(req.query.date || dateKey());
  res.json(buildSourceStatus({ ...seed, ...(saved ?? {}) }));
});

app.get('/api/report.pdf', async (req, res) => {
  const date = req.query.date || dateKey();
  const seed = buildSeedData();
  const saved = await readDailyData(date);
  const data = { ...seed, ...(saved ?? {}) };
  const filename = `cp-daily-flash-${date}.pdf`;

  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${filename}"`);
  const doc = createDailyFlashPdf(data, date);
  doc.pipe(res);
  doc.end();
});

app.post('/api/ai-notes', async (req, res) => {
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
});

app.listen(port, () => {
  console.log(`CP Flash Report API running on http://localhost:${port}`);
});
