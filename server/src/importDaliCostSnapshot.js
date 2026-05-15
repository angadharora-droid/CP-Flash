import fs from 'node:fs/promises';
import path from 'node:path';

const outDate = process.argv[2] || '2026-05-11';
const fileName = process.argv[3] || '2 Dali 26-27.xlsx';
const dataPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);

const values = {
  latestAvailableDate: '2026-05-10',
  grossSales: { actual: '106773.4', mtd: '747432.27' },
  foodSales: { actual: '76489.62', mtd: '537758.27' },
  liquorSales: { actual: '30283.78', mtd: '209674' },
  foodCostPercent: { actual: '0', mtd: '22.58' },
  liquorCostPercent: { actual: '0', mtd: '38.18' },
  foodPurchase: { actual: '0', mtd: '121430.01' },
  liquorPurchase: { actual: '0', mtd: '80049.19' },
  totalPurchase: { actual: '0', mtd: '201479.2' }
};

function setKpi(data, name, nextValues) {
  const row = data.fnb?.Dali?.find((item) => item.name === name);
  if (!row) return;
  row.actual = nextValues.actual;
  row.mtd = nextValues.mtd;
}

const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));

setKpi(data, 'Food Cost %', values.foodCostPercent);
setKpi(data, 'Liquor Cost %', values.liquorCostPercent);
setKpi(data, 'Food Purchase Today', values.foodPurchase);
setKpi(data, 'Liquor Purchase Today', values.liquorPurchase);
setKpi(data, 'Total Purchase', values.totalPurchase);
setKpi(data, 'Gross Sales', values.grossSales);

data.pnl = (data.pnl ?? []).map((row) => (
  row.unit === 'Dali'
    ? { ...row, revenueToday: values.grossSales.actual, purchasesToday: values.totalPurchase.actual }
    : row
));
data.importSource = {
  ...(data.importSource ?? {}),
  daliCostFile: fileName,
  daliCostImportedAt: new Date().toISOString(),
  daliCostNotes: 'Mapped Dali May 2026 food/liquor cost snapshot. May 11 daily row is blank/zero, so latest available daily values are from May 10; MTD values are from the May summary.'
};

await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

console.log(JSON.stringify({
  ok: true,
  date: outDate,
  file: dataPath,
  mapped: values
}, null, 2));
