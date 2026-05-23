import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

function num(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return String(Math.round(value * 100) / 100);
}

function topItemText(name, item) {
  return `${name} - ${round(item.sales)} (${round(item.qty)} qty)`;
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setKpi(rows, name, actual) {
  const row = rows?.find((item) => item.name === name);
  if (row && actual !== null && actual !== undefined) row.actual = round(actual);
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
  return [...mergedSeedRows, ...savedRows.filter((row) => !seen.has(row.id))];
}

function parseDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!dmy) return null;
  const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
  return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
}

function parseHour(value) {
  if (value instanceof Date) return value.getHours();
  if (typeof value === 'number') return Math.floor(value * 24) % 24;
  const text = String(value ?? '').trim().toLowerCase();
  const timestamp = text.match(/^\d{4}-\d{1,2}-\d{1,2}\s+(\d{1,2})(?::\d{2})/);
  if (timestamp) {
    const hour = Number(timestamp[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }

  const match = text.match(/(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridian = match[3];
  if (meridian === 'pm' && hour < 12) hour += 12;
  if (meridian === 'am' && hour === 12) hour = 0;
  return hour >= 0 && hour <= 23 ? hour : null;
}

function findHeader(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
    const normalized = rows[rowIndex].map(norm);
    const hasTime = normalized.some((cell) => /time/.test(cell));
    const hasAmount = normalized.some((cell) => /(net|gross|grand|bill|total|amount|sale|subtotal)/.test(cell));
    if (hasTime && hasAmount) return rowIndex;
  }
  return -1;
}

function findColumn(header, names, patterns = []) {
  const normalized = header.map(norm);
  const wanted = names.map(norm);
  const exact = normalized.findIndex((cell) => wanted.includes(cell));
  if (exact !== -1) return exact;
  return normalized.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function isCancelled(row, statusCol) {
  if (statusCol === -1) return false;
  return /cancel|void|complimentary/i.test(String(row[statusCol] ?? ''));
}

function bucketForHour(hour) {
  if (hour === null) return null;
  if (hour < 16) return 'lunch';
  if (hour < 19) return 'supper';
  return 'dinner';
}

function readRows(file) {
  const wb = XLSX.readFile(file, { cellDates: true });
  return wb.SheetNames.flatMap((sheetName) =>
    XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: false, raw: false })
  );
}

export async function importPetpoojaTimeSalesReport(file, outlet, outDate) {
  const rows = readRows(file);
  const headerIndex = findHeader(rows);
  if (headerIndex === -1) {
    throw new Error('No time-level sales table found. Need columns for time and amount.');
  }

  const header = rows[headerIndex];
  const dateCol = findColumn(header, ['Date', 'Bill Date', 'Invoice Date', 'Order Date'], [/date/]);
  const timeCol = findColumn(header, ['Time', 'Bill Time', 'Invoice Time', 'Order Time', 'Settlement Time'], [/time/]);
  const categoryCol = findColumn(header, ['Category', 'Item Category'], [/category/]);
  const itemCol = findColumn(header, ['Item', 'Item Name', 'Menu Item'], [/^item$/, /item.*name/, /menu.*item/]);
  const qtyCol = findColumn(header, ['Qty.', 'Qty', 'Quantity'], [/qty/, /quantity/]);
  const amountCol = findColumn(
    header,
    ['Net Amount', 'Net Total', 'Net Sales', 'Bill Amount', 'Grand Total', 'Sub Total', 'Subtotal', 'Total', 'Amount', 'Sales', 'Total Sales'],
    [/net.*amount/, /net.*sale/, /grand.*total/, /bill.*amount/, /sub.*total/, /^amount$/, /^total$/, /sales/]
  );
  const statusCol = findColumn(header, ['Status', 'Order Status', 'Bill Status'], [/status/]);

  if (timeCol === -1 || amountCol === -1) {
    throw new Error('Detailed sales report is missing time or amount columns.');
  }

  const split = { lunch: 0, supper: 0, dinner: 0 };
  const itemTotals = new Map();
  let comboSales = 0;
  let totalSales = 0;
  let mappedRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row?.length || /^total$/i.test(String(row[0] ?? '').trim())) continue;
    if (isCancelled(row, statusCol)) continue;
    if (dateCol !== -1 && parseDate(row[dateCol]) !== outDate) continue;

    const bucket = bucketForHour(parseHour(row[timeCol]));
    if (!bucket) continue;

    const amount = num(row[amountCol]);
    split[bucket] += amount;
    totalSales += amount;

    const category = String(categoryCol === -1 ? '' : row[categoryCol] ?? '');
    const itemName = String(itemCol === -1 ? '' : row[itemCol] ?? '').trim();
    if (/mix|match|combo/i.test(`${category} ${itemName}`)) comboSales += amount;
    if (itemName) {
      const item = itemTotals.get(itemName) ?? { qty: 0, sales: 0 };
      item.qty += qtyCol === -1 ? 0 : num(row[qtyCol]);
      item.sales += amount;
      itemTotals.set(itemName, item);
    }

    mappedRows += 1;
  }

  if (!mappedRows) throw new Error(`No dated time-level rows found for ${outDate}.`);

  const dataPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
  let data;
  try { data = JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    data = buildSeedData();
  }

  if (outlet === 'Pablo' || outlet === 'Dali') {
    const seed = buildSeedData();
    data.fnb = {
      ...(data.fnb ?? {}),
      [outlet]: mergeSeedKpiRows(seed.fnb?.[outlet], data.fnb?.[outlet])
    };
  }

  const targetRows = outlet === 'Rabbits' ? data.rabbits : data.fnb?.[outlet];
  if (outlet === 'Pablo' || outlet === 'Dali') {
    setKpi(targetRows, 'Lunch Revenue', split.lunch);
    setKpi(targetRows, 'Supper Revenue', split.supper);
    setKpi(targetRows, 'Dinner Revenue', split.dinner);
    setKpi(targetRows, 'Combo Sales %', totalSales ? (comboSales / totalSales) * 100 : 0);
    data.topItems = {
      ...(data.topItems ?? {}),
      [outlet]: [...itemTotals.entries()]
        .sort((a, b) => b[1].sales - a[1].sales)
        .slice(0, 3)
        .map(([name, item]) => topItemText(name, item))
    };
  }

  const key = outlet.toLowerCase();
  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}TimeSalesFile`]: path.basename(file),
    [`${key}TimeSalesImportedAt`]: new Date().toISOString(),
    [`${key}TimeSalesVersion`]: 3,
    [`${key}TimeSalesSplit`]: split,
    [`${key}TimeSalesComboSales`]: comboSales,
    [`${key}TimeSalesTotalSales`]: totalSales
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: outDate, outlet, mappedRows, split, comboSales, totalSales };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outlet = 'Pablo', outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) {
    console.error('Usage: node src/importPetpoojaTimeSalesReport.js <file> <Pablo|Dali|Rabbits> [YYYY-MM-DD]');
    process.exit(1);
  }
  importPetpoojaTimeSalesReport(file, outlet, outDate).then((result) => console.log(JSON.stringify(result, null, 2)));
}
