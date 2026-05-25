import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return String(Math.round(value * 100) / 100);
}

function setKpi(rows, name, actual) {
  if (actual === null || actual === undefined) return;
  const row = rows?.find((item) => item.name === name);
  if (row) row.actual = round(actual);
}

function rowAmount(row) {
  return [9, 10, 11, 12, 13, 14, 15].reduce((sum, index) => sum + num(row[index]), 0);
}

function isSuccessRow(row) {
  return String(row[4]).trim().toLowerCase() === 'success';
}

function isDineInRow(row) {
  return String(row[3]).trim().toLowerCase() === 'dine in';
}

function buildSuccessTotals(rows) {
  const totals = {
    cash: 0,
    card: 0,
    other: 0,
    upi: 0,
    online: 0,
    revenue: 0,
    covers: 0,
    dineInRevenue: 0
  };

  for (const row of rows) {
    if (!isSuccessRow(row)) continue;

    const cash = num(row[9]);
    const card = num(row[10]);
    const other = num(row[12]);
    const upi = num(row[14]);
    const online = num(row[15]);
    const amount = cash + card + other + upi + online;

    totals.cash += cash;
    totals.card += card;
    totals.other += other;
    totals.upi += upi;
    totals.online += online;
    totals.revenue += amount;

    if (isDineInRow(row)) {
      totals.covers += num(row[5]);
      totals.dineInRevenue += amount;
    }
  }

  return totals;
}

function buildAreaSplit(rows) {
  const split = {
    swiggy: { revenue: 0, orders: 0 },
    zomato: { revenue: 0, orders: 0 },
    direct: { revenue: 0, orders: 0 }
  };

  for (const row of rows) {
    if (String(row[0]).trim() === 'Total') continue;
    if (!isSuccessRow(row)) continue;

    const area = String(row[6] ?? '').trim().toLowerCase();
    const bucket = area.includes('swiggy')
      ? split.swiggy
      : area.includes('zomato')
        ? split.zomato
        : split.direct;

    bucket.revenue += rowAmount(row);
    bucket.orders += 1;
  }

  return split;
}

/**
 * Parses Petpooja payment_wise_summary XLS.
 * Row 3 = headers: Invoice No., Date, Payment Type, Order Type, Status, Persons, Area,
 *                  Assign To, Not Paid, Cash[9], Card[10], Due Payment[11],
 *                  Other[12], Wallet[13], UPI[14], Online[15]
 * Last row with col[0]="Total" = column sums.
 */
export async function importPetpoojaPaymentSummary(file, outlet, outDate) {
  const wb = XLSX.readFile(file, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });

  const totalRow = rows.find((r) => String(r[0]).trim() === 'Total');
  if (!totalRow) throw new Error('No "Total" row found in payment summary');

  const successTotals = buildSuccessTotals(rows);
  const cash   = successTotals.cash;
  const card   = successTotals.card;
  const other  = successTotals.other; // Zomato Gold, Swiggy Dineout (aggregator dine-in)
  const upi    = successTotals.upi;
  const online = successTotals.online; // Zomato/Swiggy delivery

  const data = (await readDailyJson(outDate)) ?? { settlement: {}, importSource: {} };

  data.settlement = data.settlement ?? {};
  data.settlement['Cash'] = { ...(data.settlement['Cash'] ?? {}), [outlet]: String(cash) };
  data.settlement['Credit Card'] = { ...(data.settlement['Credit Card'] ?? {}), [outlet]: String(card) };
  data.settlement['UPI'] = { ...(data.settlement['UPI'] ?? {}), [outlet]: String(upi) };
  data.settlement['Zomato/Swiggy'] = {
    ...(data.settlement['Zomato/Swiggy'] ?? {}),
    [outlet]: String(other + online)
  };

  if (outlet === 'Pablo' || outlet === 'Dali') {
    const rowsToUpdate = data.fnb?.[outlet] ?? [];
    const averagePerCover = successTotals.covers
      ? successTotals.dineInRevenue / successTotals.covers
      : null;

    setKpi(rowsToUpdate, 'Gross Sales', successTotals.revenue);
    if (outlet === 'Pablo') {
      setKpi(rowsToUpdate, 'Covers', successTotals.covers);
      setKpi(rowsToUpdate, 'Avg Bill', averagePerCover);
    } else {
      setKpi(rowsToUpdate, 'Covers/day', successTotals.covers);
      setKpi(rowsToUpdate, 'APC', averagePerCover);
    }

    data.pnl = (data.pnl ?? []).map((row) =>
      row.unit === outlet ? { ...row, revenueToday: round(successTotals.revenue) } : row
    );
  }

  let rabbitSplit = null;
  if (outlet === 'Rabbits') {
    rabbitSplit = buildAreaSplit(rows);
    const totalOrders = rabbitSplit.swiggy.orders + rabbitSplit.zomato.orders + rabbitSplit.direct.orders;
    const totalRevenue = rabbitSplit.swiggy.revenue + rabbitSplit.zomato.revenue + rabbitSplit.direct.revenue;
    const rowsToUpdate = data.rabbits ?? [];

    setKpi(rowsToUpdate, 'Total Revenue', totalRevenue);
    setKpi(rowsToUpdate, 'Total Orders', totalOrders);
    if (totalRevenue && totalOrders) setKpi(rowsToUpdate, 'AOV', totalRevenue / totalOrders);
    setKpi(rowsToUpdate, 'Swiggy Revenue', rabbitSplit.swiggy.revenue);
    setKpi(rowsToUpdate, 'Swiggy Orders', rabbitSplit.swiggy.orders);
    setKpi(rowsToUpdate, 'Zomato Revenue', rabbitSplit.zomato.revenue);
    setKpi(rowsToUpdate, 'Zomato Orders', rabbitSplit.zomato.orders);
    setKpi(rowsToUpdate, 'Direct Revenue', rabbitSplit.direct.revenue);
    setKpi(rowsToUpdate, 'Direct Orders', rabbitSplit.direct.orders);

    data.pnl = (data.pnl ?? []).map((row) =>
      row.unit === outlet ? { ...row, revenueToday: round(totalRevenue) } : row
    );
  }

  const key = outlet.toLowerCase();
  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}PaymentFile`]: path.basename(file),
    [`${key}PaymentImportedAt`]: new Date().toISOString()
  };

  await writeDailyJson(outDate, data);

  return {
    ok: true, date: outDate, outlet,
    mapped: { cash, card, upi, aggregatorDineIn: other, aggregatorDelivery: online, zomatoSwiggyTotal: other + online, rabbitSplit }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outlet = 'Dali', outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importPetpoojaPaymentSummary.js <file> <Pablo|Dali> [YYYY-MM-DD]'); process.exit(1); }
  importPetpoojaPaymentSummary(file, outlet, outDate).then((r) => console.log(JSON.stringify(r, null, 2)));
}
