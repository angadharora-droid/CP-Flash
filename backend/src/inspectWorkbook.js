import XLSX from 'xlsx';

const file = process.argv[2];
const wb = XLSX.readFile(file, { cellDates: true });

console.log(JSON.stringify(wb.SheetNames, null, 2));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  console.log(`\nSHEET: ${name} ROWS: ${rows.length}`);
  console.log(rows.slice(0, 30).map((row, index) => `${index + 1}: ${JSON.stringify(row.slice(0, 16))}`).join('\n'));
}
