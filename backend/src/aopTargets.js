import path from 'node:path';
import { readGenericJson, writeGenericJson } from './dailyStore.js';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'aop-targets.json');

function sanitize(payload) {
  const result = { daily: {}, weekly: {} };
  for (const scope of ['daily', 'weekly']) {
    const input = payload?.[scope];
    if (!input || typeof input !== 'object') continue;
    for (const [id, value] of Object.entries(input)) {
      if (!id) continue;
      const text = String(value ?? '').trim();
      if (text === '') continue;
      const num = Number(text.replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(num)) result[scope][id] = num;
    }
  }
  return result;
}

export async function readAopTargets(getDb) {
  const db = getDb ? await getDb() : null;
  if (db) {
    const doc = await db.collection('aopTargets').findOne({ _id: 'singleton' });
    return sanitize(doc?.payload ?? {});
  }
  const raw = await readGenericJson(STORE_PATH, { daily: {}, weekly: {} });
  return sanitize(raw);
}

export async function writeAopTargets(payload, getDb) {
  const sanitized = sanitize(payload);
  const db = getDb ? await getDb() : null;
  if (db) {
    await db.collection('aopTargets').updateOne(
      { _id: 'singleton' },
      { $set: { payload: sanitized, savedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return sanitized;
  }
  await writeGenericJson(STORE_PATH, { ...sanitized, savedAt: new Date().toISOString() });
  return sanitized;
}

export function applyDailyTargetOverrides(data, overrides) {
  if (!overrides || !Object.keys(overrides).length) return data;
  const overrideRow = (row) => {
    if (!row?.id || overrides[row.id] === undefined) return row;
    return { ...row, target: String(overrides[row.id]) };
  };
  const overrideRows = (rows) => Array.isArray(rows) ? rows.map(overrideRow) : rows;
  return {
    ...data,
    hotels: overrideRows(data.hotels),
    rabbits: overrideRows(data.rabbits),
    cpDelivery: overrideRows(data.cpDelivery),
    mickys: overrideRows(data.mickys),
    purosoul: overrideRows(data.purosoul),
    purosoulSku: overrideRows(data.purosoulSku),
    fnb: data.fnb ? {
      ...data.fnb,
      Pablo: overrideRows(data.fnb.Pablo),
      Dali: overrideRows(data.fnb.Dali)
    } : data.fnb
  };
}

export function collectKpiCatalog(data) {
  const sections = [
    { key: 'hotels', rows: data.hotels },
    { key: 'fnb.Pablo', rows: data.fnb?.Pablo },
    { key: 'fnb.Dali', rows: data.fnb?.Dali },
    { key: 'rabbits', rows: data.rabbits },
    { key: 'cpDelivery', rows: data.cpDelivery },
    { key: 'mickys', rows: data.mickys },
    { key: 'purosoul', rows: data.purosoul }
  ];
  const catalog = [];
  for (const { key, rows } of sections) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row?.id) continue;
      catalog.push({
        id: row.id,
        page: key,
        unit: row.unit ?? '',
        section: row.section ?? '',
        name: row.name ?? '',
        defaultTarget: row.target ?? ''
      });
    }
  }
  return catalog;
}
