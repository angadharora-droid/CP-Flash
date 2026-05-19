import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function findRow(rows, label) {
  return rows.find((row) => String(row[0]).trim().toLowerCase() === label.toLowerCase()) ?? [];
}

function net(row) {
  return { actual: num(row[3]), mtd: num(row[7]), ytd: num(row[11]) };
}

function setKpi(data, unit, name, values) {
  const row = data.hotels.find((item) => item.unit === unit && item.name === name);
  if (!row) return;
  row.actual = values.actual === 0 ? '0' : String(Math.round(values.actual * 100) / 100);
  if (values.mtd !== undefined) row.mtd = values.mtd === 0 ? '0' : String(Math.round(values.mtd * 100) / 100);
  if (values.ytd !== undefined) row.ytd = values.ytd === 0 ? '0' : String(Math.round(values.ytd * 100) / 100);
}

export async function importHotelReport(file, outDate) {
  const wb = XLSX.readFile(file, { cellDates: true });

  // Find first sheet with meaningful data (the file uses Sheet2 as the data sheet)
  let rows = [];
  let usedSheet = '';
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (r.length > 10) { rows = r; usedSheet = sheetName; break; }
  }
  if (!rows.length) throw new Error(`No data found. Sheets: ${wb.SheetNames.join(', ')}`);

  const unit = 'CP Nagpur';
  // Read existing daily file so we don't overwrite data written by other importers
  // (e.g. occupancy report may have already run before this one)
  const outPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
  let data;
  try { data = JSON.parse(await fs.readFile(outPath, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; data = buildSeedData(); }

  const room = net(findRow(rows, 'Total ( A )'));
  const meetingPoint = net(findRow(rows, 'MEETING POINT'));
  const freakk = net(findRow(rows, 'FREAKK'));
  const roomService = net(findRow(rows, 'ROOM SERVICE'));
  const bougainvillea = net(findRow(rows, 'BOUGAINVILLEA'));
  const banquet = net(findRow(rows, 'BANQUET'));
  const highSteak = net(findRow(rows, 'HIGH STEAK'));
  const otherSales = net(findRow(rows, 'Total ( C )'));

  setKpi(data, unit, 'Room Revenue', room);
  setKpi(data, unit, 'Meeting Point Revenue', meetingPoint);
  setKpi(data, unit, 'Freakk Revenue', freakk);
  setKpi(data, unit, 'Bougainvillea Revenue', bougainvillea);
  setKpi(data, unit, 'High Steaks Revenue', highSteak);
  setKpi(data, unit, 'In-Room Dining Revenue', roomService);
  setKpi(data, unit, 'Revenue Today', banquet);

  const totalRevenue = room.actual + meetingPoint.actual + freakk.actual + roomService.actual +
    bougainvillea.actual + banquet.actual + highSteak.actual + otherSales.actual;
  data.pnl = data.pnl.map((row) =>
    row.unit === unit ? { ...row, revenueToday: String(Math.round(totalRevenue * 100) / 100) } : row
  );

  // Collections section: Cash, UPI, Credit Card, Company rows in the same sheet
  const cashRow = findRow(rows, 'Cash');
  const upiRow = findRow(rows, 'UPI');
  const ccRow = findRow(rows, 'Credit Card');
  const companyRow = findRow(rows, 'Company');

  data.settlement = data.settlement ?? {};
  data.settlement.Cash = { ...(data.settlement.Cash ?? {}), [unit]: String(num(cashRow[3])) };
  data.settlement['Credit Card'] = { ...(data.settlement['Credit Card'] ?? {}), [unit]: String(num(ccRow[3])) };
  data.settlement.UPI = { ...(data.settlement.UPI ?? {}), [unit]: String(num(upiRow[3])) };
  data.settlement['City Ledger/Credit'] = {
    ...(data.settlement['City Ledger/Credit'] ?? {}),
    [unit]: String(num(companyRow[3]))
  };

  data.importSource = {
    ...(data.importSource ?? {}),
    file: path.basename(file),
    importedAt: new Date().toISOString(),
    notes: `Mapped from sheet "${usedSheet}": room, F&B, collections.`
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return {
    ok: true, date: outDate, file: outPath,
    mapped: {
      roomRevenue: room.actual,
      fnbRevenue: meetingPoint.actual + freakk.actual + roomService.actual + bougainvillea.actual + highSteak.actual,
      banquetRevenue: banquet.actual,
      otherSales: otherSales.actual,
      pnlRevenue: totalRevenue,
      cash: num(cashRow[3]),
      creditCard: num(ccRow[3]),
      upi: num(upiRow[3]),
      cityLedger: num(companyRow[3])
    }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importHotelReport.js <file> [YYYY-MM-DD]'); process.exit(1); }
  importHotelReport(file, outDate).then((r) => console.log(JSON.stringify(r, null, 2)));
}
