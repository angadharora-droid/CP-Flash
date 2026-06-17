import path from 'node:path';
import { readGenericJson, writeGenericJson } from './dailyStore.js';
import { UNITS, fixedCostDefaults } from './schema.js';

const STORE_PATH = path.resolve(process.cwd(), 'data', 'fixed-costs.json');

function canonicalUnit(unit) {
  return unit === 'Rabbit' + 's' ? 'Rabbit' : unit;
}

// Keep only known units with a finite numeric value. Stored as a flat
// { [unit]: number } map so the override is a global config, not per-date.
function sanitize(payload) {
  const result = {};
  const input = (payload && typeof payload === 'object' && payload.units && typeof payload.units === 'object')
    ? payload.units
    : payload;
  if (!input || typeof input !== 'object') return result;
  for (const unit of UNITS) {
    const raw = input[unit] ?? input[canonicalUnit(unit)];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const num = Number(String(raw).replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(num)) result[unit] = num;
  }
  return result;
}

export async function readFixedCosts(getDb) {
  const db = getDb ? await getDb() : null;
  if (db) {
    const doc = await db.collection('fixedCosts').findOne({ _id: 'singleton' });
    return sanitize(doc?.payload ?? {});
  }
  const raw = await readGenericJson(STORE_PATH, {});
  return sanitize(raw);
}

export async function writeFixedCosts(payload, getDb) {
  const sanitized = sanitize(payload);
  const db = getDb ? await getDb() : null;
  if (db) {
    await db.collection('fixedCosts').updateOne(
      { _id: 'singleton' },
      { $set: { payload: sanitized, savedAt: new Date().toISOString() } },
      { upsert: true }
    );
    return sanitized;
  }
  await writeGenericJson(STORE_PATH, { ...sanitized, savedAt: new Date().toISOString() });
  return sanitized;
}

// Effective per-unit fixed cost: the saved override when present, otherwise the
// built-in default. Used by the net-profit aggregates.
export function effectiveFixedCosts(overrides = {}) {
  const result = {};
  for (const unit of UNITS) {
    result[unit] = overrides[unit] ?? fixedCostDefaults[unit] ?? 0;
  }
  return result;
}

// Stamp the global override onto a data object's pnl rows + fixedCosts map so it
// shows on every date regardless of what each day's report doc has stored.
export function applyFixedCostOverrides(data, overrides) {
  if (!data || !overrides || !Object.keys(overrides).length) return data;
  const next = { ...data };
  if (Array.isArray(data.pnl)) {
    next.pnl = data.pnl.map((row) => {
      const unit = canonicalUnit(row.unit);
      return overrides[unit] === undefined ? row : { ...row, fixedCost: overrides[unit] };
    });
  }
  next.fixedCosts = { ...(data.fixedCosts ?? {}), ...overrides };
  return next;
}
