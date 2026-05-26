import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { fixedCostDefaults, pageSchemas, schemaRowsToKpis, UNITS } from './schema.js';

const workbookPath = path.resolve(process.cwd(), '..', 'reference', 'cp-flash-kpi-framework.xlsx');

export function readWorkbookSummary() {
  if (!fs.existsSync(workbookPath)) {
    return { found: false, sheets: [] };
  }

  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  return {
    found: true,
    sheets: workbook.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false });
      return { name, rowCount: rows.length, preview: rows.slice(0, 8) };
    })
  };
}

export function buildSeedData() {
  const hotels = ['CP Nagpur', 'CP NM'].flatMap((unit) => schemaRowsToKpis(unit, 'hotels', pageSchemas.hotels));
  const fnb = {
    Pablo: schemaRowsToKpis('Pablo', 'fnb', pageSchemas.fnb.Pablo),
    Dali: schemaRowsToKpis('Dali', 'fnb', pageSchemas.fnb.Dali)
  };

  return {
    generatedAt: new Date().toISOString(),
    workbook: readWorkbookSummary(),
    fixedCosts: fixedCostDefaults,
    bankPosition: UNITS.map((unit) => ({ unit, account: 'Consolidated', actualBalance: '', fdTotal: '', chequesIssued: '', chequeTotalAmount: '', chequesInHand: '', netBalance: '' })),
    pnl: UNITS.map((unit) => ({ unit, revenueToday: '', purchasesToday: '', fixedCost: fixedCostDefaults[unit], mtdNetProfit: '', ytdNetProfit: '' })),
    hotels,
    fnb,
    rabbits: schemaRowsToKpis('Rabbit', 'rabbits', pageSchemas.rabbits),
    mickys: schemaRowsToKpis("Micky's", 'mickys', pageSchemas.mickys),
    purosoul: schemaRowsToKpis('Purosoul', 'purosoul', pageSchemas.purosoul),
    settlement: {},
    banquetToday: [],
    banquetTomorrow: [],
    topItems: { Pablo: ['', '', ''], Dali: ['', '', ''] },
    purosoulSku: ['250ml', '500ml', '1L'].map((sku) => ({ sku, produced: '', dispatched: '', clStock: '', mtd: '', ytd: '' }))
  };
}
