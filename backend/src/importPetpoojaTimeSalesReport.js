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

function norm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setKpi(rows, name, actual) {
  const row = rows?.find((item) => item.name === name);
  if (row && actual !== null && actual !== undefined) row.actual = round(actual);
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
    const hasTime = normalized.some((cell) => ['time', 'ordertime', 'billtime', 'invoicetime', 'settlementtime'].includes(cell));
    const hasAmount = normalized.some((cell) => /^(netamount|nettotal|total|amount|grandtotal|billamount|sales|totalsales)$/.test(cell));
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
  const amountCol = findColumn(
    header,
    ['Net Amount', 'Net Total', 'Bill Amount', 'Grand Total', 'Total', 'Amount', 'Sales', 'Total Sales'],
    [/net.*amount/, /grand.*total/, /bill.*amount/, /^amount$/, /^total$/, /sales/]
  );
  const statusCol = findColumn(header, ['Status', 'Order Status', 'Bill Status'], [/status/]);

  if (timeCol === -1 || amountCol === -1) {
    throw new Error('Detailed sales report is missing time or amount columns.');
  }

  const split = { lunch: 0, supper: 0, dinner: 0 };
  let mappedRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (!row?.length || /^total$/i.test(String(row[0] ?? '').trim())) continue;
    if (isCancelled(row, statusCol)) continue;
    if (dateCol !== -1 && parseDate(row[dateCol]) !== outDate) continue;

    const bucket = bucketForHour(parseHour(row[timeCol]));
    if (!bucket) continue;

    split[bucket] += num(row[amountCol]);
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

  const targetRows = outlet === 'Rabbits' ? data.rabbits : data.fnb?.[outlet];
  if (outlet === 'Pablo' || outlet === 'Dali') {
    setKpi(targetRows, 'Lunch Revenue', split.lunch);
    setKpi(targetRows, 'Supper Revenue', split.supper);
    setKpi(targetRows, 'Dinner Revenue', split.dinner);
  }

  const key = outlet.toLowerCase();
  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}TimeSalesFile`]: path.basename(file),
    [`${key}TimeSalesImportedAt`]: new Date().toISOString(),
    [`${key}TimeSalesSplit`]: split
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return { ok: true, date: outDate, outlet, mappedRows, split };
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
