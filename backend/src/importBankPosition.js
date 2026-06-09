import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

const SHEET_ID = '1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf';

// Each field spec: { match: RegExp, col: 'F' } — finds the first row whose
// cols A/B/C contain the label text, then reads value from `col`.
// For rows with no label text (rare), use { row: N, col: 'F' } as a fixed fallback.
const OUTLET_ACCOUNTS = [
  {
    unit: 'CP Nagpur', account: 'HDFC Wardha', gid: 1969859912,
    labels: {
      actualBalance:     { match: /balance available as per bank/i, col: 'F' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'E' },
      chequesIssued:     { match: /cheques issued/i,                col: 'G' },
      fdTotal:           { match: /cheques in hand/i,               col: 'J' },
      netBalance:        { match: /effective available balance/i,   col: 'G' },
    },
  },
  {
    unit: 'CP Nagpur', account: 'HDFC Dhantoli', gid: 556642800,
    labels: {
      actualBalance:     { match: /available as per bank/i,         col: 'E' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'E' },
      chequesIssued:     { match: /cheques issued/i,                col: 'F' },
      fdTotal:           { match: /cheques issued/i,                col: 'J' },
      netBalance:        { match: /effective available balance/i,   col: 'F' },
    },
  },
  {
    unit: 'CP Nagpur', account: 'IDBI BANK C AC 742', gid: 1919634794,
    labels: {
      actualBalance:     { row: 5, col: 'F' }, // this row has no label text
      chequeTotalAmount: { match: /cheques issued/i,                col: 'E' },
      chequesIssued:     { match: /cheques issued/i,                col: 'G' },
      netBalance:        { match: /balance available.*books/i,      col: 'G' },
    },
  },
  {
    unit: 'CP Nagpur', account: 'HAPL YES BANK', gid: 1771716053,
    labels: {
      actualBalance:     { match: /balance available as per bank/i, col: 'F' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'E' },
      chequesIssued:     { match: /cheques issued/i,                col: 'G' },
      netBalance:        { match: /effective available balance/i,   col: 'G' },
    },
  },
  {
    unit: 'CP NM', account: 'VIJAN MOTORS SERVICE PVT. LTD.', gid: 1599252269,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: 'Pablo', account: 'UFO HDFC', gid: 543029293,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      fdTotal:           { match: /od limit/i,                      col: 'C' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: 'Dali', account: 'DALI SCB', gid: 366389011,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: "Micky's", account: 'C P FOODS HDFC BANK 980197', gid: 2045197235,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: "Micky's", account: 'C P FOODS 36961', gid: 1945926804,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: 'Purosoul', account: 'AFVPL YES Bank', gid: 146782452,
    labels: {
      actualBalance:     { match: /balance as per bank/i,           col: 'C' },
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      fdTotal:           { match: /od limit/i,                      col: 'C' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
  {
    unit: 'Purosoul', account: 'AFVPL IDBI', gid: 1150494269,
    labels: {
      actualBalance:     { row: 5, col: 'C' }, // this row has no label text
      chequeTotalAmount: { match: /cheques issued/i,                col: 'C' },
      chequesIssued:     { match: /cheques issued/i,                col: 'D' },
      netBalance:        { match: /effective balance/i,             col: 'D' },
    },
  },
];

function num(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/[,\s]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value) {
  return value == null ? '' : String(Math.round(value * 100) / 100);
}

function colToIndex(col) {
  return [...col.toUpperCase()].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

async function fetchSheetRows(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching gid ${gid}`);
  const csv = await res.text();
  const wb = XLSX.read(csv, { type: 'string' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: true });
}

// Scan cols A, B, C of each row for the label; return the row index or -1.
function findRowByLabel(rows, labelMatch) {
  for (let i = 0; i < rows.length; i++) {
    const text = [0, 1, 2].map((c) => String(rows[i][c] ?? '').trim()).join('\n');
    if (labelMatch instanceof RegExp ? labelMatch.test(text) : text.toLowerCase().includes(labelMatch.toLowerCase())) {
      return i;
    }
  }
  return -1;
}

function fieldValue(rows, spec) {
  const colIdx = colToIndex(spec.col);
  if (spec.row != null) {
    return num(rows[spec.row - 1]?.[colIdx]) ?? 0;
  }
  const rowIdx = findRowByLabel(rows, spec.match);
  return rowIdx === -1 ? 0 : (num(rows[rowIdx][colIdx]) ?? 0);
}

function extractAccount(rows, acct) {
  const L = acct.labels;
  const actualBalance     = fieldValue(rows, L.actualBalance);
  const fdTotal           = L.fdTotal ? fieldValue(rows, L.fdTotal) : 0;
  const chequeTotalAmount = fieldValue(rows, L.chequeTotalAmount);
  const chequesIssued     = fieldValue(rows, L.chequesIssued);
  const chequesInHand     = chequeTotalAmount - chequesIssued;
  const netBalance        = fieldValue(rows, L.netBalance);
  return { actualBalance, fdTotal, chequesIssued, chequeTotalAmount, chequesInHand, netBalance };
}

export async function importBankPosition(outDate) {
  const accountRows = await Promise.all(OUTLET_ACCOUNTS.map(async (acct) => {
    const rows = await fetchSheetRows(acct.gid);
    const vals = extractAccount(rows, acct);
    return {
      unit: acct.unit,
      account: acct.account,
      actualBalance:     fmt(vals.actualBalance),
      fdTotal:           fmt(vals.fdTotal),
      chequesIssued:     fmt(vals.chequesIssued),
      chequeTotalAmount: fmt(vals.chequeTotalAmount),
      chequesInHand:     fmt(vals.chequesInHand),
      netBalance:        fmt(vals.netBalance),
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
