const valueFields = ['actual', 'mtd', 'ytd', 'revenueToday', 'purchasesToday', 'fixedCost', 'mtdNetProfit', 'ytdNetProfit'];

export const dailySources = [
  {
    id: 'bank-position',
    label: 'Bank Position',
    unit: 'Group',
    type: 'Google Sheet',
    paths: ['bankPosition'],
    meta: { importedAt: 'bankPositionImportedAt' },
    cadence: 'Daily'
  },
  {
    id: 'cpn-ids-night-audit',
    label: 'CP Nagpur Night Audit',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['hotels', 'pnl', 'settlement', 'banquetToday'],
    meta: { file: 'file', importedAt: 'importedAt', notes: 'notes' },
    cadence: 'Daily'
  },
  {
    id: 'cpnm-occupancy',
    label: 'CP Navi Mumbai Occupancy',
    unit: 'CP Navi Mumbai',
    type: 'Mail / Excel',
    paths: ['hotels', 'pnl'],
    meta: { file: 'occupancyFile', importedAt: 'occupancyImportedAt', notes: 'occupancyNotes' },
    cadence: 'Daily'
  },
  {
    id: 'pablo-cost',
    label: 'Pablo Cost Sheet',
    unit: 'Pablo',
    type: 'Excel / Sheet',
    paths: ['fnb', 'pnl'],
    meta: { file: 'pabloCostFile', importedAt: 'pabloCostImportedAt', notes: 'pabloCostNotes' },
    cadence: 'Daily'
  },
  {
    id: 'dali-cost',
    label: 'Dali Cost Sheet',
    unit: 'Dali',
    type: 'Excel / Sheet',
    paths: ['fnb', 'pnl'],
    meta: { file: 'daliCostFile', importedAt: 'daliCostImportedAt', notes: 'daliCostNotes' },
    cadence: 'Daily'
  },
  {
    id: 'fnb-sales',
    label: 'F&B Sales EOD',
    unit: 'Pablo / Dali',
    type: 'Petpooja / Mail',
    paths: ['fnb', 'topItems', 'settlement'],
    cadence: 'Daily'
  },
  {
    id: 'rabbits-sales',
    label: 'Rabbits POS EOD',
    unit: 'Rabbits',
    type: 'Mail / POS',
    paths: ['rabbits', 'settlement'],
    cadence: 'Daily'
  },
  {
    id: 'mickys-orders',
    label: "Micky's Orders",
    unit: "Micky's",
    type: 'Mail / Excel',
    paths: ['mickys'],
    meta: { file: 'mickysSalesFile', importedAt: 'mickysSalesImportedAt' },
    cadence: 'Daily'
  },
  {
    id: 'mickys-leads',
    label: "Micky's Leads Pipeline",
    unit: "Micky's",
    type: 'Google Sheet',
    paths: ['mickys'],
    meta: { file: 'mickysLeadsFile', importedAt: 'mickysLeadsImportedAt' },
    cadence: 'Daily'
  },
  {
    id: 'purosoul-production',
    label: 'Purosoul Sales',
    unit: 'Purosoul',
    type: 'Mail / Excel',
    paths: ['purosoul', 'purosoulSku'],
    meta: { file: 'purosoulSalesFile', importedAt: 'purosoulSalesImportedAt' },
    cadence: 'Daily'
  },
  {
    id: 'purosoul-flash',
    label: 'Purosoul Flash Report',
    unit: 'Purosoul',
    type: 'Excel / CSV',
    paths: ['purosoulSku'],
    meta: { file: 'purosoulFlashFile', importedAt: 'purosoulFlashImportedAt' },
    cadence: 'Daily'
  },
  {
    id: 'settlement',
    label: 'Settlement Reconciliation',
    unit: 'Group',
    type: 'Mail / Sheet',
    paths: ['settlement'],
    cadence: 'Daily'
  }
];

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasEnteredValue(value) {
  if (Array.isArray(value)) return value.some(hasEnteredValue);
  if (!value || typeof value !== 'object') return isFilled(value);

  return Object.entries(value).some(([key, nested]) => {
    if (valueFields.includes(key)) return isFilled(nested);
    if (['target', 'name', 'unit', 'section', 'id', 'direction', 'sku'].includes(key)) return false;
    return hasEnteredValue(nested);
  });
}

function pickMeta(importSource, source) {
  if (!source.meta) return {};

  return {
    file: importSource[source.meta.file] ?? '',
    importedAt: importSource[source.meta.importedAt] ?? '',
    notes: importSource[source.meta.notes] ?? ''
  };
}

export function buildSourceStatus(data = {}) {
  const importSource = data.importSource ?? {};
  const sources = dailySources.map((source) => {
    const meta = pickMeta(importSource, source);
    const hasImport = isFilled(meta.importedAt);
    const hasData = source.paths.some((key) => hasEnteredValue(data[key]));
    const status = hasImport ? 'Imported' : hasData ? 'Entered' : 'Pending';

    return {
      ...source,
      status,
      importedAt: meta.importedAt,
      file: meta.file,
      notes: meta.notes
    };
  });

  return {
    total: sources.length,
    imported: sources.filter((source) => source.status === 'Imported').length,
    entered: sources.filter((source) => source.status === 'Entered').length,
    pending: sources.filter((source) => source.status === 'Pending').length,
    sources
  };
}
