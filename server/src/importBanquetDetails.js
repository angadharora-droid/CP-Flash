import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

const [file, outDateArg] = process.argv.slice(2);

if (!file) {
  console.error('Usage: node src/importBanquetDetails.js <workbook.xlsx> [YYYY-MM-DD]');
  process.exit(1);
}

const outDate = outDateArg || '2026-05-11';
const workbook = XLSX.readFile(file, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false });

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value) {
  const parsed = Number(clean(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value) {
  const [day, mon, year] = clean(value).split('-');
  const months = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12'
  };
  return `${year}-${months[mon?.toUpperCase()] ?? '01'}-${day?.padStart(2, '0')}`;
}

function prefixed(row, prefix) {
  const cell = row.find((value) => clean(value).startsWith(prefix));
  return cell ? clean(cell).slice(prefix.length).trim() : '';
}

function parseFunction(value) {
  const text = clean(value).replace(/^Function:\s*/i, '');
  const match = text.match(/^(.*?)\s*\(\s*(\d{2}-[A-Z]{3}-\d{4})\s+(\d{2}:\d{2})\s+-\s+(\d{2}-[A-Z]{3}-\d{4})\s+(\d{2}:\d{2})\s*\)$/i);
  if (!match) return { functionType: text, date: '', session: text };

  const [, functionType, startDate, startTime, endDate, endTime] = match;
  return {
    functionType: clean(functionType),
    date: isoDate(startDate),
    session: `${startTime} - ${endTime}${startDate === endDate ? '' : ` (${endDate})`}`
  };
}

function parseEvents() {
  let currentDate = '';
  const events = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const firstCell = clean(row[0]);

    if (firstCell.startsWith('Event Date:')) {
      currentDate = isoDate(firstCell.slice('Event Date:'.length));
      continue;
    }

    if (!/^\d+\s+\//.test(firstCell)) continue;

    const eventRows = [row];
    let cursor = index + 1;
    while (cursor < rows.length && !clean(rows[cursor][0]).startsWith('Event Date:') && !/^\d+\s+\//.test(clean(rows[cursor][0]))) {
      eventRows.push(rows[cursor]);
      cursor += 1;
    }

    const partyRow = eventRows.find((item) => clean(item[0]) === 'Confirm') ?? [];
    const functionRow = eventRows.find((item) => clean(item[1]).startsWith('Room:')) ?? [];
    const commercialRow = eventRows.find((item) => clean(item[1]).startsWith('Room Charges:')) ?? [];
    const segmentRow = eventRows.find((item) => clean(item[1]).startsWith('Pay Mode:')) ?? [];
    const paxRow = eventRows.find((item) => clean(item[1]).startsWith('Sales Executive:')) ?? [];
    const revenueRow = eventRows.find((item) => eventRows.indexOf(item) > -1 && item.some((cell) => clean(cell).startsWith('Exp.Rev:'))) ?? [];
    const functionInfo = parseFunction(functionRow[2]);
    const pax = prefixed(paxRow, 'Pax Exp / Gau:');
    const revenue = num(prefixed(revenueRow, 'Exp.Rev:'));
    const room = prefixed(functionRow, 'Room:');
    const marketSegment = prefixed(segmentRow, 'Mkt. Sgmt:');
    const rate = prefixed(commercialRow, 'Rate / Pax:');
    const payMode = prefixed(segmentRow, 'Pay Mode:');
    const bookedBy = prefixed(paxRow, 'Booked By:');

    events.push({
      reservation: firstCell,
      date: functionInfo.date || currentDate,
      marketSegment: marketSegment || 'Banquet',
      pax,
      venue: room,
      session: `${functionInfo.functionType} ${functionInfo.session}`.trim(),
      revenue: String(revenue),
      notes: [
        clean(partyRow[1]),
        clean(partyRow[2]),
        rate ? `Rate/Pax ${rate}` : '',
        payMode ? `Pay ${payMode}` : '',
        bookedBy ? `Booked by ${bookedBy}` : ''
      ].filter(Boolean).join(' | ')
    });

    index = cursor - 1;
  }

  return events;
}

function setKpi(data, name, values) {
  const row = data.hotels.find((item) => item.unit === 'CP Nagpur' && item.name === name);
  if (!row) return;
  row.actual = String(values.actual ?? '');
  row.mtd = String(values.mtd ?? '');
  row.ytd = String(values.ytd ?? '');
}

const data = buildSeedData();
const events = parseEvents();
const todayEvents = events.filter((event) => event.date === outDate);
const tomorrowEvents = events.filter((event) => event.date > outDate);
const todayRevenue = todayEvents.reduce((sum, event) => sum + num(event.revenue), 0);
const todayPax = todayEvents.reduce((sum, event) => sum + num(event.pax.split('/')[0]), 0);

data.banquetToday = todayEvents.map(({ date, reservation, ...event }) => event);
data.banquetTomorrow = tomorrowEvents.map(({ date, reservation, ...event }) => event);
setKpi(data, 'Revenue Today', { actual: todayRevenue });
setKpi(data, 'No. of Functions', { actual: todayEvents.length });
setKpi(data, 'Covers', { actual: todayPax });
data.pnl = data.pnl.map((row) => (row.unit === 'CP Nagpur' ? { ...row, revenueToday: String(todayRevenue) } : row));
data.importSource = {
  file: path.basename(file),
  importedAt: new Date().toISOString(),
  notes: `Mapped banquet detail sheet ${sheetName} into CP Nagpur banquetToday and banquetTomorrow.`
};

const outPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

console.log(JSON.stringify({
  ok: true,
  date: outDate,
  file: outPath,
  mapped: {
    todayFunctions: todayEvents.length,
    todayPax,
    todayRevenue,
    tomorrowFunctions: tomorrowEvents.length
  }
}, null, 2));
