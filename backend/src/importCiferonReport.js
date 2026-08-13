import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { buildSeedData } from './excel.js';
import { fixedCostDefaults, mergeSeedKpiRows } from './schema.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

// Parses the automated Ciferon "Summary for Hotel Centre Point : <Weekday>,
// <Month> <D>, <YYYY>" HTML mail (alerts@ciferon.com, no attachment) into the
// CP Delivery KPI table — the Centre Point home-delivery channel, reported as
// its own unit alongside Rabbit.
//
// Mail layout (fixed generator): a "Revenue Updates" table of
//   Particulars | On <date>  rows:
//   Sales (with indented Dine-In / Home Delivery / Take Away / Token sub-rows),
//   then Orders, Discount, Tax. Sales is the gross figure (sub-channels sum to
//   it); Discount is already applied within Sales.

const UNIT = 'CP Delivery';

function num(str) {
  const n = parseFloat(String(str ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  return String(Math.round(value * 100) / 100);
}

function stripTags(str) {
  return String(str ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Label → number map from the first table block. First write wins: the
 * "Revenue Updates" table leads the mail, so later blocks (payment modes,
 * item-wise tables) repeating a label can't overwrite the headline figures.
 */
export function parseCiferonHtml(html) {
  const map = new Map();
  const rows = String(html ?? '').match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 2) continue;
    const label = cells[0].replace(/\([\s\S]*?\)/g, '').trim().toLowerCase();
    const value = num(cells[cells.length - 1]);
    if (label && value !== null && !map.has(label)) map.set(label, value);
  }
  return map;
}

export async function importCiferonReport(html, outDate) {
  if (!String(html ?? '').trim()) throw new Error('Ciferon mail has no HTML body.');

  const values = parseCiferonHtml(html);
  if (!values.has('sales')) throw new Error('Ciferon mail has no "Sales" row — layout changed?');

  const sales = values.get('sales') ?? 0;
  const orders = values.get('orders') ?? 0;
  const discount = values.get('discount') ?? 0;
  const homeDelivery = values.get('home delivery');
  const dineIn = values.get('dine-in') ?? values.get('dine in');
  const takeAway = values.get('take away') ?? values.get('takeaway');

  await withDateLock(outDate, async () => {
    const data = (await readDaily(outDate)) ?? buildSeedData();

    // Older daily files predate the cpDelivery key — seed the schema rows first.
    data.cpDelivery = mergeSeedKpiRows(buildSeedData().cpDelivery, data.cpDelivery);
    function setKpi(name, actual) {
      const row = data.cpDelivery.find((item) => item.name === name);
      if (!row || actual === null || actual === undefined) return;
      row.actual = round(actual);
    }

    setKpi('Total Revenue', sales);
    setKpi('Total Orders', orders);
    setKpi('AOV', orders ? sales / orders : 0);
    setKpi('Discount', discount);
    setKpi('Home Delivery Revenue', homeDelivery);
    setKpi('Dine-In Revenue', dineIn);
    setKpi('Take Away Revenue', takeAway);

    // Saved pnl arrays from before this unit existed have no CP Delivery row —
    // append one instead of silently dropping the revenue.
    const pnlRows = data.pnl ?? [];
    data.pnl = pnlRows.some((row) => row.unit === UNIT)
      ? pnlRows.map((row) => (row.unit === UNIT ? { ...row, revenueToday: round(sales) } : row))
      : [...pnlRows, { unit: UNIT, revenueToday: round(sales), purchasesToday: '', fixedCost: fixedCostDefaults[UNIT] ?? 0, mtdNetProfit: '', ytdNetProfit: '' }];

    data.importSource = {
      ...(data.importSource ?? {}),
      cpDeliveryImportedAt: new Date().toISOString(),
      cpDeliveryValues: Object.fromEntries(values),
      cpDeliveryNotes: sales > 0
        ? `sales=${round(sales)}, orders=${orders}, discount=${round(discount)}`
        : 'Mail received — no sales for this date.'
    };

    await writeDaily(outDate, data);
  });

  return {
    ok: true,
    date: outDate,
    unit: UNIT,
    mapped: { sales, orders, discount, homeDelivery, dineIn, takeAway }
  };
}

// CLI: node importCiferonReport.js <saved.html> [YYYY-MM-DD]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importCiferonReport.js <file.html> [YYYY-MM-DD]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importCiferonReport(await fs.readFile(file, 'utf8'), outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
