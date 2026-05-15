import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[,%]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, decimals = 2) {
  return String(Math.round(num(value) * (10 ** decimals)) / (10 ** decimals));
}

/**
 * Parses the Opera/IDS-style single-day occupancy snapshot.
 * Sheet structure: header row, one row per room type, then a "Day Total" summary row.
 * Columns: Type | Day Total | Occ | Sgl | Dbl | Tpl | QD | Pax | ARR | Occ. % | ARP | MTD Total
 */
export async function importOccupancyReport(file, outDate, unit = 'CP Nagpur') {
  const wb = XLSX.readFile(file, { cellDates: true });

  // Find first sheet with meaningful data
  let rows = [];
  let usedSheet = '';
  for (const sheetName of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (r.length > 3) { rows = r; usedSheet = sheetName; break; }
  }
  if (!rows.length) throw new Error(`No occupancy data found. Sheets: ${wb.SheetNames.join(', ')}`);

  const dayTotalRow = rows.find((r) => String(r[0]).trim() === 'Day Total');
  if (!dayTotalRow) throw new Error(`"Day Total" row not found in sheet "${usedSheet}"`);

  // Column mapping (from header: Type, Day Total, Occ, Sgl, Dbl, Tpl, QD, Pax, ARR, Occ. %, ARP, MTD Total)
  const roomsSold   = num(dayTotalRow[2]);   // Occ (occupied rooms today)
  const occupancy   = num(dayTotalRow[9]);   // Occ. % (string like "94.85")
  const arr         = num(dayTotalRow[8]);   // ARR
  const revpar      = num(dayTotalRow[10]);  // ARP = RevPAR
  const mtdRooms    = num(dayTotalRow[11]);  // MTD rooms sold

  const dataPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
  let data;
  try { data = JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; data = buildSeedData(); }

  function setKpi(name, actual, mtd) {
    const row = data.hotels.find((item) => item.unit === unit && item.name === name);
    if (!row) return;
    if (actual !== null && actual !== undefined) row.actual = String(actual);
    if (mtd !== null && mtd !== undefined) row.mtd = String(mtd);
  }

  setKpi('Occupancy %', fmt(occupancy), '');
  setKpi('Rooms Sold', fmt(roomsSold, 0), fmt(mtdRooms, 0));
  setKpi('ARR', fmt(arr), '');
  setKpi('RevPAR', fmt(revpar), '');

  data.importSource = {
    ...(data.importSource ?? {}),
    occupancyFile: path.basename(file),
    occupancyImportedAt: new Date().toISOString(),
    occupancyNotes: `Mapped Day Total row from sheet "${usedSheet}" into ${unit} occupancy KPIs.`
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return {
    ok: true, date: outDate, unit, file: dataPath,
    mapped: { occupancy: fmt(occupancy), roomsSold: fmt(roomsSold, 0), arr: fmt(arr), revpar: fmt(revpar), mtdRooms: fmt(mtdRooms, 0) }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10), unit = 'CP Nagpur'] = process.argv;
  if (!file) { console.error('Usage: node importOccupancyReport.js <file> [YYYY-MM-DD] [unit]'); process.exit(1); }
  importOccupancyReport(file, outDate, unit).then((r) => console.log(JSON.stringify(r, null, 2)));
}
