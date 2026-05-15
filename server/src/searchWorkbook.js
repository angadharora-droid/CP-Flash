import XLSX from 'xlsx';

const [file, ...terms] = process.argv.slice(2);
const needles = terms.map((term) => term.toLowerCase());
const wb = XLSX.readFile(file, { cellDates: true });

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
  rows.forEach((row, index) => {
    const haystack = row.join(' ').toLowerCase();
    if (needles.some((term) => haystack.includes(term))) {
      console.log(`${name} R${index + 1}: ${JSON.stringify(row)}`);
    }
  });
}
