import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

const SHEET_ID = '1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf';

const OUTLET_ACCOUNTS = [
  { unit: 'CP Nagpur', account: 'HDFC Wardha', gid: 1969859912, cells: { actualBalance: 'F5', fdTotal: 'J22', chequesIssued: 'G21', chequeTotalAmount: 'E21', netBalance: 'G30' } },
  { unit: 'CP Nagpur', account: 'HDFC Dhantoli', gid: 556642800, cells: { actualBalance: 'E5', fdTotal: 'J16', chequesIssued: 'F16', chequeTotalAmount: 'E16', netBalance: 'F24' } },
  { unit: 'CP Nagpur', account: 'IDBI BANK C AC 742', gid: 1919634794, cells: { actualBalance: 'F5', chequesIssued: 'G20', chequeTotalAmount: 'E20', netBalance: 'G22' } },
  { unit: 'CP Nagpur', account: 'HAPL YES BANK', gid: 1771716053, cells: { actualBalance: 'F5', chequesIssued: 'G17', chequeTotalAmount: 'E17', netBalance: 'G26' } },
  { unit: 'CP NM', account: 'VIJAN MOTORS SERVICE PVT. LTD.', gid: 1599252269, cells: { actualBalance: 'C4', chequesIssued: 'D9', chequeTotalAmount: 'C9', netBalance: 'D17' } },
  { unit: 'Pablo', account: 'UFO HDFC', gid: 543029293, cells: { actualBalance: 'C5', chequesIssued: 'D20', chequeTotalAmount: 'C20', netBalance: 'D27' } },
  { unit: 'Dali', account: 'DALI SCB', gid: 366389011, cells: { actualBalance: 'C5', chequesIssued: 'D22', chequeTotalAmount: 'C22', netBalance: 'D30' } },
  { unit: "Micky's", account: 'C P FOODS HDFC BANK 980197', gid: 2045197235, cells: { actualBalance: 'C5', chequesIssued: 'D13', chequeTotalAmount: 'C13', netBalance: 'D19' } },
  { unit: "Micky's", account: 'C P FOODS 36961', gid: 1945926804, cells: { actualBalance: 'C5', chequesIssued: 'D13', chequeTotalAmount: 'C13', netBalance: 'D17' } },
  { unit: 'Purosoul', account: 'AFVPL YES Bank', gid: 146782452, cells: { actualBalance: 'C5', chequesIssued: 'D11', chequeTotalAmount: 'C11', netBalance: 'D19' } },
  { unit: 'Purosoul', account: 'AFVPL IDBI', gid: 1150494269, cells: { actualBalance: 'C5', chequesIssued: 'D13', chequeTotalAmount: 'C13', netBalance: 'D25' } },
];

function num(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[, \s]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value) {
  return value == null ? '' : String(Math.round(value * 100) / 100);
}

async function fetchSheetRows(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching gid ${gid}`);
  const csv = await res.text();
  const wb = XLSX.read(csv, { type: 'string' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: true });
}

function cellRefToIndexes(ref) {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!match) throw new Error(`Invalid cell reference ${ref}`);
  const col = [...match[1].toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]) - 1, col };
}

function cell(rows, ref) {
  const { row, col } = cellRefToIndexes(ref);
  return num(rows[row]?.[col]) ?? 0;
}

function extractAccount(rows, acct) {
  const actualBalance = cell(rows, acct.cells.actualBalance);
  const fdTotal = acct.cells.fdTotal ? cell(rows, acct.cells.fdTotal) : 0;
  const chequesIssued = cell(rows, acct.cells.chequesIssued);
  const chequeTotalAmount = cell(rows, acct.cells.chequeTotalAmount);
  const chequesInHand = chequeTotalAmount - chequesIssued;
  const netBalance = cell(rows, acct.cells.netBalance);

  return { actualBalance, fdTotal, chequesIssued, chequeTotalAmount, chequesInHand, netBalance };
}

export async function importBankPosition(outDate) {
  // Fetch all 11 bank account tabs in parallel — each is an independent HTTP request.
  const accountRows = await Promise.all(OUTLET_ACCOUNTS.map(async (acct) => {
    const rows = await fetchSheetRows(acct.gid);
    const vals = extractAccount(rows, acct);
    return {
      unit: acct.unit,
      account: acct.account,
      actualBalance: fmt(vals.actualBalance),
      fdTotal: fmt(vals.fdTotal),
      chequesIssued: fmt(vals.chequesIssued),
      chequeTotalAmount: fmt(vals.chequeTotalAmount),
      chequesInHand: fmt(vals.chequesInHand),
      netBalance: fmt(vals.netBalance),
    };
  }));

  return withDateLock(outDate, async () => {
    const data = (await readDaily(outDate)) ?? buildSeedData();
    data.bankPosition = accountRows;
    data.importSource = {
      ...(data.importSource ?? {}),
      bankPositionImportedAt: new Date().toISOString(),
    };
    await writeDaily(outDate, data);
    return { ok: true, date: outDate, mapped: accountRows };
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const outDate = process.argv[2] || new Date().toISOString().slice(0, 10);
  importBankPosition(outDate).then((result) => console.log(JSON.stringify(result, null, 2)));
}
