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

let _seedCache = null;
export function invalidateSeedCache() { _seedCache = null; }

// Always hand out a deep copy: importers mutate the returned object in place
// (setKpi etc.), and sharing the cached template across dates would let one
// date's import bleed into every other date that fell back to the seed.
export function buildSeedData() {
  if (_seedCache) return structuredClone(_seedCache);
  const hotels = ['CP Nagpur', 'CP NM'].flatMap((unit) => schemaRowsToKpis(unit, 'hotels', pageSchemas.hotels));
  const fnb = {
    Pablo: schemaRowsToKpis('Pablo', 'fnb', pageSchemas.fnb.Pablo),
    Dali: schemaRowsToKpis('Dali', 'fnb', pageSchemas.fnb.Dali)
  };

  _seedCache = {
    generatedAt: new Date().toISOString(),
    workbook: null,
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
    purosoulSku: ['250ml', '500ml', '1L', '20L Jar'].map((sku) => ({ sku, produced: '', dispatched: '', clStock: '', mtd: '', ytd: '' }))
  };
  return structuredClone(_seedCache);
}
