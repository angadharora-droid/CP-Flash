import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

function num(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
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

  const cash   = num(totalRow[9]);
  const card   = num(totalRow[10]);
  const other  = num(totalRow[12]); // Zomato Gold, Swiggy Dineout (aggregator dine-in)
  const upi    = num(totalRow[14]);
  const online = num(totalRow[15]); // Zomato/Swiggy delivery

  const dataPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
  let data;
  try { data = JSON.parse(await fs.readFile(dataPath, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // Settlement can be seeded even without a base file
    data = { settlement: {}, importSource: {} };
  }

  data.settlement = data.settlement ?? {};
  data.settlement['Cash'] = { ...(data.settlement['Cash'] ?? {}), [outlet]: String(cash) };
  data.settlement['Credit Card'] = { ...(data.settlement['Credit Card'] ?? {}), [outlet]: String(card) };
  data.settlement['UPI'] = { ...(data.settlement['UPI'] ?? {}), [outlet]: String(upi) };
  data.settlement['Zomato/Swiggy'] = {
    ...(data.settlement['Zomato/Swiggy'] ?? {}),
    [outlet]: String(other + online)
  };

  const key = outlet.toLowerCase();
  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}PaymentFile`]: path.basename(file),
    [`${key}PaymentImportedAt`]: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return {
    ok: true, date: outDate, outlet,
    mapped: { cash, card, upi, aggregatorDineIn: other, aggregatorDelivery: online, zomatoSwiggyTotal: other + online }
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outlet = 'Dali', outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importPetpoojaPaymentSummary.js <file> <Pablo|Dali> [YYYY-MM-DD]'); process.exit(1); }
  importPetpoojaPaymentSummary(file, outlet, outDate).then((r) => console.log(JSON.stringify(r, null, 2)));
}
