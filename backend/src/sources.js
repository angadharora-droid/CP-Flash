const valueFields = ['actual', 'mtd', 'ytd', 'revenueToday', 'purchasesToday', 'fixedCost', 'mtdNetProfit', 'ytdNetProfit'];

// Every forced import run re-stamps *ImportedAt, so it reads "2:00 PM" for a mail that
// came at 4:29 AM. The fetcher also records the mail's own send time under this key.
export function receivedAtKey(importedAtKey) {
  if (!importedAtKey) return null;
  return importedAtKey === 'importedAt' ? 'receivedAt' : importedAtKey.replace(/ImportedAt$/, 'ReceivedAt');
}

// Google Sheet sources are re-read on every run, so "imported" says nothing about whether
// anyone updated the sheet. These fingerprint what each sheet writes so a day can be
// checked against the previous one; null means there is nothing to compare.
const BANK_FIELDS = ['actualBalance', 'fdTotal', 'chequesIssued', 'chequeTotalAmount', 'netBalance'];
function bankFingerprint(data) {
  const rows = (data?.bankPosition ?? []).filter((row) => BANK_FIELDS.some((field) => isFilled(row[field])));
  return rows.length ? JSON.stringify(rows.map((row) => [row.unit, row.account, ...BANK_FIELDS.map((field) => row[field])])) : null;
}

const COST_SHEET_KPIS = ['Food Purchase Today', 'Liquor Purchase Today', 'Total Purchase'];
function costSheetFingerprint(unit) {
  return (data) => {
    const kpis = (data?.fnb?.[unit] ?? [])
      .filter((row) => COST_SHEET_KPIS.includes(row.name))
      .map((row) => [row.name, row.actual]);
    const purchases = (data?.pnl ?? []).find((row) => row.unit === unit)?.purchasesToday;
    return kpis.some(([, actual]) => isFilled(actual)) || isFilled(purchases) ? JSON.stringify([kpis, purchases]) : null;
  };
}

function purosoulFlashFingerprint(data) {
  const rows = (data?.purosoulSku ?? []).filter((row) => isFilled(row.produced) || isFilled(row.dispatched));
  return rows.length ? JSON.stringify(rows.map((row) => [row.sku, row.produced, row.dispatched, row.clStock])) : null;
}

export const dailySources = [
  {
    id: 'bank-position',
    label: 'Bank Position',
    unit: 'Bank Statement',
    type: 'Google Sheet',
    paths: ['bankPosition'],
    meta: { importedAt: 'bankPositionImportedAt' },
    cadence: 'Daily',
    compare: bankFingerprint,
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
    type: 'Mail / PDF',
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
    type: 'Mail / PDF',
    paths: ['hotels'],
    meta: {
      file: 'cpNmForecastFile',
      importedAt: 'cpNmForecastImportedAt',
      reportLabels: { cpNmForecastFile: 'History & Forecast Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpnm-pay-type',
    label: 'CP NM Pay Type',
    unit: 'CP NM',
    type: 'Mail / PDF',
    paths: ['settlement'],
    meta: {
      file: 'cpNmPayTypeFile',
      importedAt: 'cpNmPayTypeImportedAt',
      reportLabels: { cpNmPayTypeFile: 'Pay Type Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'cpnm-market-segment',
    label: 'CP NM Market Segment',
    unit: 'CP NM',
    type: 'Mail / Excel',
    paths: ['occupancyMixByUnit'],
    meta: {
      file: 'cpNmMarketSegmentFile',
      importedAt: 'cpNmMarketSegmentImportedAt',
      reportLabels: { cpNmMarketSegmentFile: 'Market Analysis Comparison Report' }
    },
    cadence: 'Daily'
  },
  {
    // StayLink PMS "Report E-Mail Service" mail (foodpos@staylink.in): the Night
    // Audit PDF ("Room Revenue_CENTRE POINT AMRAVATI_*") is parsed; the House
    // report and Monthly Room Occupancy PDFs from the same mail are kept for preview.
    id: 'cpamravati-night-audit',
    label: 'CP Amravati Night Audit',
    unit: 'CP Amravati',
    type: 'Mail / PDF',
    paths: ['hotels', 'pnl', 'settlement'],
    meta: {
      file: 'cpAmravatiFile',
      files: ['cpAmravatiHouseFile', 'cpAmravatiOccupancyFile'],
      importedAt: 'cpAmravatiImportedAt',
      notes: 'cpAmravatiNotes',
      pendingNote: 'StayLink report mail not received.',
      reportLabels: {
        cpAmravatiFile: 'Night Audit Report',
        cpAmravatiHouseFile: 'House Report',
        cpAmravatiOccupancyFile: 'Monthly Room Occupancy Report'
      }
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
    compare: costSheetFingerprint('Pablo'),
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
    compare: costSheetFingerprint('Dali'),
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
    id: 'cp-delivery-sales',
    label: 'Ciferon Delivery Summary',
    unit: 'CP Delivery',
    type: 'Mail / HTML',
    paths: ['cpDelivery'],
    meta: {
      importedAt: 'cpDeliveryImportedAt',
      notes: 'cpDeliveryNotes',
      pendingNote: 'Ciferon summary mail not received.'
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
      notes: 'mickysSalesNotes',
      pendingNote: 'Report not uploaded.',
      filePattern: /CP[_\s-]?FOODS/i,
      reportLabels: { mickysSalesFile: 'Daily Sales Report' }
    },
    cadence: 'Daily'
  },
  {
    // Replaced the "Micky's CRM Daily Report" leads mail (mickysCrm*) in Oct 2026.
    id: 'mickys-day-end',
    label: "Micky's Day End Report",
    unit: "Micky's",
    type: 'Mail / HTML',
    paths: ['mickysDayEnd'],
    meta: {
      importedAt: 'mickysDayEndImportedAt',
      notes: 'mickysDayEndNotes',
      pendingNote: 'Day End Report mail not received.'
    },
    cadence: 'Daily'
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
      notes: 'purosoulSalesNotes',
      pendingNote: 'Report not uploaded.',
      filePattern: /AFVPL|purosoul/i,
      reportLabels: { purosoulSalesFile: 'Daily Sales Report' }
    },
    cadence: 'Daily'
  },
  {
    id: 'purosoul-flash',
    label: 'Purosoul Dispatch & Production',
    unit: 'Purosoul',
    type: 'Google Sheets',
    paths: ['purosoulSku'],
    meta: {
      file: 'purosoulFlashFile',
      importedAt: 'purosoulFlashImportedAt',
      reportLabels: { purosoulFlashFile: 'Dispatch & Production Sheet' }
    },
    cadence: 'Daily',
    compare: purosoulFlashFingerprint
  }
];

// A source with no import stamp only counts as "Entered" from data no other report
// writes. CP Nagpur's `hotels` rows come from the night audit, occupancy, covers and
// forecast mails alike, so the forecast landing says nothing about the night audit.
// `pnl` is a roll-up — revenue derived from other reports' KPIs, fixedCost stamped on
// every row from the global config — so it never shows who supplied the day's data.
const pathWriters = new Map();
for (const { unit, paths } of dailySources) {
  for (const key of paths) pathWriters.set(`${unit}|${key}`, (pathWriters.get(`${unit}|${key}`) ?? 0) + 1);
}

function ownPaths(source) {
  return source.paths.filter((key) => key !== 'pnl' && pathWriters.get(`${source.unit}|${key}`) === 1);
}

function isFilled(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasEnteredValue(value) {
  if (Array.isArray(value)) return value.some(hasEnteredValue);
  if (!value || typeof value !== 'object') return isFilled(value);

  return Object.entries(value).some(([key, nested]) => {
    if (valueFields.includes(key)) return isFilled(nested);
    if (['target', 'name', 'unit', 'account', 'section', 'id', 'direction', 'sku'].includes(key)) return false;
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
    .filter((file) => /\.(xlsx|xls|csv|pdf)$/i.test(String(file)));
  const importedFile = reports[0]?.file ?? '';
  // Every file the source is expected to bring, fetched or not, so a partial delivery
  // (e.g. Amravati's House report missing) shows which file is still outstanding.
  const expectedReports = fileKeys.map((key) => {
    const file = importSourceValue(importSource, key);
    const fetched = isFilled(file) && (!source.meta.filePattern || source.meta.filePattern.test(String(file)));
    return { key, label: source.meta.reportLabels?.[key] ?? source.label, fetched, file: fetched ? file : '' };
  });
  const importedAtFields = source.meta.importedAtFields ?? [source.meta.importedAt];
  const latest = (keys) => keys
    .map((key) => importSourceValue(importSource, key))
    .filter(isFilled)
    .sort()
    .at(-1) ?? '';
  const importedAt = latest(importedAtFields);

  return {
    file: importedFile,
    reportFiles,
    reports,
    expectedReports,
    importedAt,
    receivedAt: importedAt ? latest(importedAtFields.map(receivedAtKey)) : '',
    notes: importedAt ? (importSource[source.meta.notes] ?? '') : '',
    pendingNote: source.meta.pendingNote ?? ''
  };
}

// Groups a mailbox scan (fetchEmailReport.js --scan-mailbox) by source: the inbox mails
// each source's handlers would file under the scanned date. Sources no mail handler
// feeds (the Google Sheets) are left out — "in the mailbox" doesn't apply to them.
export function mailboxBySource(scan) {
  const handlerKeys = new Set(scan.handlerKeys ?? []);
  const sources = {};
  for (const source of dailySources) {
    const keys = source.meta?.importedAtFields ?? [source.meta?.importedAt];
    if (!keys.some((key) => handlerKeys.has(key))) continue;
    // One mail can feed several of a source's handlers (Rabbit's Petpooja set) — list it once.
    const seen = new Set();
    sources[source.id] = (scan.mails ?? [])
      .filter((mail) => keys.includes(mail.importSourceKey))
      .filter((mail) => {
        const id = `${mail.sentAt}|${mail.subject}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(({ subject, from, sentAt, files }) => ({ subject, from, sentAt, files }))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }
  return {
    date: scan.date,
    checkedAt: scan.checkedAt,
    error: scan.error ?? '',
    sources,
    unrecognised: scan.unrecognised ?? []
  };
}

// previousData is the prior calendar day's saved record (or null); it only feeds the
// sheet sources' same-as-previous-day check.
export function buildSourceStatus(data = {}, previousData = null) {
  const importSource = data.importSource ?? {};
  const sources = dailySources.map(({ compare, ...source }) => {
    const meta = pickMeta(importSource, source);

    // Narrow each path to the source's own unit so CP Nagpur data doesn't make CP NM
    // sources (or Pablo's settlement Dali's) appear as "Entered".
    function pathData(key) {
      const val = data[key];
      const unit = source.unit;
      if (!unit || unit === 'Bank Statement' || !val || typeof val !== 'object') return val;
      if (Array.isArray(val)) return val.filter((r) => r.unit === unit || r.unit === `${unit}s`);
      // settlement is { mode: { unit: amount } }
      if (key === 'settlement') return Object.values(val).map((byUnit) => byUnit?.[unit] ?? byUnit?.[`${unit}s`]);
      // fnb, topItems, occupancyMixByUnit are { unit: ... }
      return unit in val ? val[unit] : val;
    }

    const hasData = ownPaths(source).some((key) => hasEnteredValue(pathData(key)));
    const hasRabbitKpis = source.id === 'rabbits-sales' && hasEnteredValue(data.rabbits);
    const hasImport = isFilled(meta.importedAt) || hasRabbitKpis;
    const status = hasImport ? 'Imported' : hasData ? 'Entered' : 'Pending';

    let sameAsPreviousDay = null;
    if (compare && status !== 'Pending' && previousData) {
      const current = compare(data);
      const previous = compare(previousData);
      if (current && previous) sameAsPreviousDay = current === previous;
    }

    return {
      ...source,
      status,
      importedAt: meta.importedAt || (hasRabbitKpis ? data.date : ''),
      receivedAt: meta.receivedAt ?? '',
      file: meta.file,
      reportFiles: meta.reportFiles ?? [],
      reports: meta.reports ?? [],
      expectedReports: meta.expectedReports ?? [],
      comparesWithPreviousDay: Boolean(compare),
      sameAsPreviousDay,
      notes: meta.notes || (status === 'Pending' ? meta.pendingNote : '')
    };
  });

  return {
    total: sources.length,
    imported: sources.filter((source) => source.status === 'Imported').length,
    entered: sources.filter((source) => source.status === 'Entered').length,
    pending: sources.filter((source) => source.status === 'Pending').length,
    sameAsPreviousDay: sources.filter((source) => source.sameAsPreviousDay === true).length,
    sources
  };
}
