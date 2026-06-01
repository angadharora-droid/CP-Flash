const valueFields = ['actual', 'mtd', 'ytd', 'revenueToday', 'purchasesToday', 'fixedCost', 'mtdNetProfit', 'ytdNetProfit'];

export const dailySources = [
  {
    id: 'bank-position',
    label: 'Bank Position',
    unit: 'Bank Statement',
    type: 'Google Sheet',
    paths: ['bankPosition'],
    meta: { importedAt: 'bankPositionImportedAt' },
    cadence: 'Daily',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/'
  },
  {
    id: 'cpn-ids-night-audit',
    label: 'CP Nagpur Night Audit',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['hotels', 'pnl', 'settlement', 'banquetToday'],
    meta: {
      file: 'file',
      importedAt: 'importedAt',
      notes: 'notes',
      reportLabels: { file: 'Night Audit Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpn-occupancy',
    label: 'CP Nagpur Occupancy',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['hotels', 'pnl'],
    meta: {
      file: 'occupancyFile',
      importedAt: 'occupancyImportedAt',
      notes: 'occupancyNotes',
      reportLabels: { occupancyFile: 'Occupancy Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpn-occupancy-mix',
    label: 'CP Nagpur Occupancy Mix',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['occupancyMix'],
    meta: {
      file: 'occupancyMixFile',
      importedAt: 'occupancyMixImportedAt',
      reportLabels: { occupancyMixFile: 'Occupancy Mix Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpn-pos-sales',
    label: 'CP Nagpur F&B Covers',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['hotels'],
    meta: {
      file: 'posSalesFile',
      importedAt: 'posSalesImportedAt',
      reportLabels: { posSalesFile: 'POS Sales / Covers Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpn-forecast',
    label: 'CP Nagpur Forecast',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['hotels'],
    meta: {
      file: 'forecastFile',
      importedAt: 'forecastImportedAt',
      reportLabels: { forecastFile: 'Occupancy Forecast Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpn-banquet-events',
    label: 'CP Nagpur Banquet Events',
    unit: 'CP Nagpur',
    type: 'Mail / Excel',
    paths: ['banquetToday', 'banquetTomorrow'],
    meta: {
      file: 'eventsFile',
      importedAt: 'eventsImportedAt',
      reportLabels: { eventsFile: 'Banquet Function List' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpnm-manager-flash',
    label: 'CP NM Manager Flash',
    unit: 'CP NM',
    type: 'Mail / Excel',
    paths: ['hotels', 'pnl', 'settlement'],
    meta: {
      file: 'cpNmFile',
      importedAt: 'cpNmImportedAt',
      notes: 'cpNmNotes',
      reportLabels: { cpNmFile: 'Manager Flash Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpnm-hist-forecast',
    label: 'CP NM History & Forecast',
    unit: 'CP NM',
    type: 'Mail / Excel',
    paths: ['hotels'],
    meta: {
      file: 'cpNmForecastFile',
      importedAt: 'cpNmForecastImportedAt',
      reportLabels: { cpNmForecastFile: 'History & Forecast Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'pablo-cost',
    label: 'Pablo Cost Sheet',
    unit: 'Pablo',
    type: 'Excel / Sheet',
    paths: ['fnb', 'pnl'],
    meta: {
      file: 'pabloCostFile',
      importedAt: 'pabloCostImportedAt',
      notes: 'pabloCostNotes',
      reportLabels: { pabloCostFile: 'Cost Sheet' }
    },
    cadence: 'Daily',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/'
  },
  {
    id: 'dali-cost',
    label: 'Dali Cost Sheet',
    unit: 'Dali',
    type: 'Excel / Sheet',
    paths: ['fnb', 'pnl'],
    meta: {
      file: 'daliCostFile',
      importedAt: 'daliCostImportedAt',
      notes: 'daliCostNotes',
      reportLabels: { daliCostFile: 'Cost Sheet' }
    },
    cadence: 'Daily',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/'
  },
  {
    id: 'pablo-sales',
    label: 'Pablo Sales Reports',
    unit: 'Pablo',
    type: 'Petpooja / Mail',
    paths: ['fnb', 'topItems', 'settlement'],
    meta: {
      files: ['pabloPaymentFile', 'pabloTimeSalesFile'],
      importedAtFields: ['pabloPetpoojaImportedAt', 'pabloPaymentImportedAt', 'pabloTimeSalesImportedAt'],
      reportLabels: {
        pabloPaymentFile: 'Payment Wise Summary',
        pabloTimeSalesFile: 'Item Wise Bill Report'
      }
    },
    cadence: 'Daily'
  },
  {
    id: 'dali-sales',
    label: 'Dali Sales Reports',
    unit: 'Dali',
    type: 'Petpooja / Mail',
    paths: ['fnb', 'topItems', 'settlement'],
    meta: {
      files: ['daliPaymentFile', 'daliTimeSalesFile'],
      importedAtFields: ['daliPetpoojaImportedAt', 'daliPaymentImportedAt', 'daliTimeSalesImportedAt'],
      reportLabels: {
        daliPaymentFile: 'Payment Wise Summary',
        daliTimeSalesFile: 'Item Wise Bill Report'
      }
    },
    cadence: 'Daily'
  },
  {
    id: 'rabbits-sales',
    label: 'Rabbit POS EOD',
    unit: 'Rabbit',
    type: 'Mail / POS',
    paths: ['rabbits', 'settlement'],
    meta: {
      file: 'rabbitsPaymentFile',
      files: ['rabbitsTimeSalesFile'],
      importedAtFields: ['rabbitsPetpoojaImportedAt', 'rabbitsPaymentImportedAt', 'rabbitsTimeSalesImportedAt'],
      reportLabels: {
        rabbitsPaymentFile: 'Payment Wise Summary',
        rabbitsTimeSalesFile: 'Item Wise Bill Report'
      }
    },
    cadence: 'Daily'
  },
  {
    id: 'mickys-orders',
    label: "Micky's Orders",
    unit: "Micky's",
    type: 'Mail / Excel',
    paths: ['mickys'],
    meta: {
      file: 'mickysSalesFile',
      importedAt: 'mickysSalesImportedAt',
      filePattern: /CP_FOODS|CP FOODS/i,
      reportLabels: { mickysSalesFile: 'Daily Sales Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'mickys-leads',
    label: "Micky's Leads Pipeline",
    unit: "Micky's",
    type: 'Google Sheet',
    paths: ['mickys'],
    meta: { file: 'mickysLeadsFile', importedAt: 'mickysLeadsImportedAt' },
    cadence: 'Daily',
    sheetUrl: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
  },
  {
    id: 'purosoul-production',
    label: 'Purosoul Sales',
    unit: 'Purosoul',
    type: 'Mail / Excel',
    paths: ['purosoul', 'purosoulSku'],
    meta: {
      file: 'purosoulSalesFile',
      importedAt: 'purosoulSalesImportedAt',
      filePattern: /AFVPL/i,
      reportLabels: { purosoulSalesFile: 'Daily Sales Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'purosoul-flash',
    label: 'Purosoul Flash Report',
    unit: 'Purosoul',
    type: 'Excel / CSV',
    paths: ['purosoulSku'],
    meta: {
      file: 'purosoulFlashFile',
      importedAt: 'purosoulFlashImportedAt',
      reportLabels: { purosoulFlashFile: 'Flash Report' }
    },
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

function importSourceValue(importSource, key) {
  if (!key) return undefined;
  if (isFilled(importSource[key])) return importSource[key];
  if (key.startsWith('rabbits')) {
    const singularKey = `rabbit${key.slice('rabbits'.length)}`;
    return importSource[singularKey];
  }
  return undefined;
}

function pickMeta(importSource, source) {
  if (!source.meta) return {};

  const fileKeys = [
    source.meta.file,
    ...(source.meta.files ?? [])
  ].filter(Boolean);
  const reports = fileKeys
    .map((key) => ({ key, label: source.meta.reportLabels?.[key] ?? source.label, file: importSourceValue(importSource, key) }))
    .filter((report) => isFilled(report.file))
    .filter((report) => !source.meta.filePattern || source.meta.filePattern.test(String(report.file)));
  const reportFiles = reports
    .map((report) => report.file)
    .filter((file) => /\.(xlsx|xls|csv)$/i.test(String(file)));
  const importedFile = reports[0]?.file ?? '';
  const importedAtFields = source.meta.importedAtFields ?? [source.meta.importedAt];
  const importedAt = importedAtFields
    .map((key) => importSourceValue(importSource, key))
    .filter(isFilled)
    .sort()
    .at(-1) ?? '';

  return {
    file: importedFile,
    reportFiles,
    reports,
    importedAt: importedFile || !source.meta.filePattern ? importedAt : '',
    notes: importSource[source.meta.notes] ?? ''
  };
}

export function buildSourceStatus(data = {}) {
  const importSource = data.importSource ?? {};
  const sources = dailySources.map((source) => {
    const meta = pickMeta(importSource, source);
    const hasData = source.paths.some((key) => hasEnteredValue(data[key]));
    const hasRabbitKpis = source.id === 'rabbits-sales' && hasEnteredValue(data.rabbits);
    const hasImport = isFilled(meta.importedAt) || hasRabbitKpis;
    const status = hasImport ? 'Imported' : hasData ? 'Entered' : 'Pending';

    return {
      ...source,
      status,
      importedAt: meta.importedAt || (hasRabbitKpis ? data.date : ''),
      file: meta.file,
      reportFiles: meta.reportFiles ?? [],
      reports: meta.reports ?? [],
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
