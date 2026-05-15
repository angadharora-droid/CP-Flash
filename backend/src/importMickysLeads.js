import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';

const SHEET_ID = '1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs';
const GID = 871818724;

// Excel serial number → "YYYY-MM-DD"
function excelSerialToDate(v) {
  const s = parseFloat(v);
  if (!Number.isFinite(s) || s < 1) return null;
  // Excel epoch offset: serial 1 = 1900-01-01; Unix epoch offset = 25569 days
  const ms = Math.round((s - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function readData(dataPath) {
  try { return JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; return buildSeedData(); }
}

function setMtd(mickys, name, value) {
  const row = mickys?.find((r) => r.name === name);
  if (!row) return;
  row.actual = '';
  row.mtd = String(value);
}

// Check if a city string contains the keyword
function cityIncludes(city, keyword) {
  return city.toLowerCase().includes(keyword);
}

export async function importMickysLeads(targetDate) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Micky's leads sheet`);
  const csv = await res.text();

  const wb = XLSX.read(csv, { type: 'string' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });

  // Row 0 = title row ("Mickys Active Leads"), Row 1 = column headers, Row 2+ = data
  const dataRows = rows.slice(2).filter((r) => String(r[1] ?? '').trim() !== '');

  const getStage = (r) => String(r[7] ?? '').trim().toLowerCase();
  const getCity  = (r) => String(r[3] ?? '').trim();

  const active    = dataRows.filter((r) => !['lost', ''].includes(getStage(r)));
  const converted = dataRows.filter((r) => getStage(r) === 'converted');
  // "Contacted" includes Follow-up, Contacted, and Sample Sent stages
  const contacted = dataRows.filter((r) => ['follow-up', 'contacted', 'sample sent'].includes(getStage(r)));

  // Leads added on targetDate (Excel serial → date string)
  const newThisMonth = dataRows.filter((r) => {
    const d = excelSerialToDate(r[0]);
    return d && d.slice(0, 7) === targetDate.slice(0, 7);
  }).length;

  // Pipeline value: use Expected Value (col 11) if non-zero, else Monthly Order × Probability (col 9 × col 10)
  const pipelineValue = active.reduce((sum, r) => {
    const expected = num(r[11]);
    if (expected > 0) return sum + expected;
    const monthly = num(r[9]);
    const prob = num(r[10]);
    // Probability column is 0–1 in this sheet
    return sum + monthly * prob;
  }, 0);

  // Active lead counts by city — use includes() to catch "new delhi", "mumbai head office" etc.
  const nagpurCount  = active.filter((r) => cityIncludes(getCity(r), 'nagpur')).length;
  const puneCount    = active.filter((r) => cityIncludes(getCity(r), 'pune')).length;
  const mumbaiCount  = active.filter((r) => cityIncludes(getCity(r), 'mumbai') || cityIncludes(getCity(r), 'thane') || cityIncludes(getCity(r), 'andheri')).length;
  const delhiCount   = active.filter((r) => cityIncludes(getCity(r), 'delhi')).length;

  const nonLost  = dataRows.filter((r) => getStage(r) !== 'lost' && getStage(r) !== '');
  const convRate = nonLost.length > 0 ? Math.round((converted.length / nonLost.length) * 100) : 0;

  const dataPath = path.resolve(process.cwd(), 'data', `${targetDate}.json`);
  const data = await readData(dataPath);

  setMtd(data.mickys, 'New Leads Today',   newThisMonth);
  setMtd(data.mickys, 'Leads Contacted',   contacted.length);
  setMtd(data.mickys, 'Leads Converted',   converted.length);
  setMtd(data.mickys, 'Conversion Rate %', convRate);
  setMtd(data.mickys, 'Pipeline Value',    Math.round(pipelineValue));
  setMtd(data.mickys, 'Nagpur Leads',      nagpurCount);
  setMtd(data.mickys, 'Pune Leads',        puneCount);
  setMtd(data.mickys, 'Mumbai Leads',      mumbaiCount);
  setMtd(data.mickys, 'Delhi Leads',       delhiCount);

  data.importSource = {
    ...(data.importSource ?? {}),
    mickysLeadsFile: `Micky's Leads Sheet (gid=${GID})`,
    mickysLeadsImportedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: targetDate, savedAt: new Date().toISOString() }, null, 2));

  return {
    ok: true, targetDate,
    total: dataRows.length,
    active: active.length,
    converted: converted.length,
    contacted: contacted.length,
    newThisMonth,
    pipelineValue: Math.round(pipelineValue),
  };
}

// CLI: node importMickysLeads.js [YYYY-MM-DD]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const date = process.argv[2] ?? d.toISOString().slice(0, 10);
  importMickysLeads(date)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
