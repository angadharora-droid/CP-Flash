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
// Mail layout (fixed generator, ~54KB of nested layout tables):
//   "Revenue Updates"      Particulars | On <date> rows: Sales (with indented
//                          Dine-In / Home Delivery / Take Away / Token
//                          sub-rows), then Orders, Discount, Tax. Sales is
//                          gross (sub-channels sum to it); Discount is already
//                          applied within Sales.
//   "Customer Details"     New / Repeat / Total Customers (not imported)
//   "Payment Mode Breakup" Card / Cash / Google Pay / Paytm / PhonePe /
//                          Swiggy / Zomato — the Swiggy+Zomato rows are the
//                          platform split (they sum to Sales)
//   "Categorywise Sales"   Category | Qty | Total Sales (not imported)
// Every Revenue Updates row also carries a commented-out MTD <td> — comments
// must be stripped before cell-matching or that empty cell reads as the value.

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
 * Label → number map across the mail's tables. First write wins: the
 * "Revenue Updates" table leads the mail, so a later block repeating a label
 * can't overwrite the headline figures. The value is the first numeric cell
 * after the label — today's only value column, and still the day column if
 * Ciferon ever enables the (currently commented-out) MTD column.
 */
export function parseCiferonHtml(html) {
  const map = new Map();
  const cleaned = String(html ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const rows = cleaned.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1]));
    if (cells.length < 2) continue;
    const label = cells[0].replace(/\([\s\S]*?\)/g, '').trim().toLowerCase();
    const value = cells.slice(1).map(num).find((v) => v !== null) ?? null;
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
  const swiggy = values.get('swiggy');
  const zomato = values.get('zomato');

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
    setKpi('Swiggy Revenue', swiggy);
    setKpi('Zomato Revenue', zomato);

    // Payment Mode Breakup → the settlement matrix. The modes sum to Sales exactly,
    // so the whole day is accounted for and nothing double-counts. In practice CP
    // Delivery is entirely Swiggy/Zomato (the aggregator collects from the customer,
    // so the direct modes read 0), but all four are written unconditionally: a direct
    // order must land somewhere, and a re-import has to be able to correct a mode
    // back down to zero rather than leave a stale figure standing.
    data.settlement = data.settlement ?? {};
    const setMode = (mode, amount) => {
      data.settlement[mode] = { ...(data.settlement[mode] ?? {}), [UNIT]: round(amount) };
    };
    setMode('Cash', values.get('cash') ?? 0);
    setMode('Credit Card', values.get('card') ?? 0);
    setMode('UPI', (values.get('google pay') ?? 0) + (values.get('paytm') ?? 0) + (values.get('phonepe') ?? 0));
    setMode('Zomato/Swiggy', (swiggy ?? 0) + (zomato ?? 0));

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
    mapped: { sales, orders, discount, homeDelivery, dineIn, takeAway, swiggy, zomato }
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
