import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily } from './dailyStore.js';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLabel(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findRow(rows, ...labels) {
  const needles = labels.map(normalizeLabel);
  return rows.find((row) => needles.includes(normalizeLabel(row[0]))) ?? [];
}

function net(row) {
  return { actual: num(row[3]), mtd: num(row[7]) };
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
  const data = (await readDaily(outDate)) ?? buildSeedData();

  const room        = net(findRow(rows, 'Total ( A )', 'Total (A)', 'TOTAL ( A )'));
  const fnb         = net(findRow(rows, 'Total ( B )', 'Total (B)', 'TOTAL ( B )'));
  const otherSales  = net(findRow(rows, 'Total ( C )', 'Total (C)', 'TOTAL ( C )'));

  // Individual F&B rows — kept for the KPI tables, not used for P&L total
  const meetingPoint  = net(findRow(rows, 'MEETING POINT', 'Meeting Point'));
  const freakk        = net(findRow(rows, 'FREAKK', 'Freakk'));
  const roomService   = net(findRow(rows, 'ROOM SERVICE', 'Room Service'));
  const bougainvillea = net(findRow(rows, 'BOUGAINVILLEA', 'Bougainvillea'));
  const banquet       = net(findRow(rows, 'BANQUET', 'Banquet'));
  const highSteak     = net(findRow(rows, 'HIGH STEAK', 'HIGH STEAKS', 'High Steaks'));

  setKpi(data, unit, 'Room Revenue',        room);
  setKpi(data, unit, 'Meeting Point Revenue', meetingPoint);
  setKpi(data, unit, 'Freakk Revenue',      freakk);
  setKpi(data, unit, 'Bougainvillea Revenue', bougainvillea);
  setKpi(data, unit, 'High Steaks Revenue', highSteak);
  setKpi(data, unit, 'In-Room Dining Revenue', roomService);
  setKpi(data, unit, 'Revenue Today',       banquet);

  // P&L revenue = Total A + Total B + Total C (matches the night audit report totals exactly)
  const totalRevenue = room.actual + fnb.actual + otherSales.actual;
  data.pnl = data.pnl.map((row) =>
    row.unit === unit ? { ...row, revenueToday: String(Math.round(totalRevenue * 100) / 100) } : row
  );

  // Collections section: Cash, UPI, Credit Card, Company rows in the same sheet
  const cashRow = findRow(rows, 'Cash', 'CASH');
  const upiRow = findRow(rows, 'UPI');
  const ccRow = findRow(rows, 'Credit Card', 'CREDIT CARD', 'Credit card');
  const companyRow = findRow(rows, 'Company', 'COMPANY', 'City Ledger', 'CITY LEDGER');

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

  await writeDaily(outDate, data);

  return {
    ok: true, date: outDate, file: `${outDate}.json`,
    mapped: {
      totalA: room.actual,
      totalB: fnb.actual,
      totalC: otherSales.actual,
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
