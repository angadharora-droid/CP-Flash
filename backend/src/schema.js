export const UNITS = ['CP Nagpur', 'CP NM', 'Pablo', 'Dali', 'Rabbit', "Micky's", 'Purosoul'];

export const UNITS_WITHOUT_FIXED_COST = [];

export const fixedCostDefaults = {
  'CP Nagpur': 185000,
  'CP NM': 135000,
  Pablo: 0,
  Dali: 0,
  Rabbit: 0,
  "Micky's": 12000,
  Purosoul: 8000
};

export const rabbitsCategoryRows = [
  ['FOOD(I.T.) Orders', 15],
  ['FOOD(I.T.) Revenue', 338],
  ['Rolls Orders', 20],
  ['Rolls Revenue', 4000],
  ['Main Course Orders', 15],
  ['Main Course Revenue', 1000],
  ['Kebabs Orders', 15],
  ['Kebabs Revenue', 3000],
  ['Sides Orders', 2],
  ['Sides Revenue', 50]
];

// Pablo and Dali run the same KPI set — same names, same order, same sections —
// so the two outlets stay directly comparable in the daily and weekly flash.
// Only the AOP target defaults differ per outlet; a KPI added here is added to
// both. "Covers/day" is that day's covers (averaged over a week); "Total Covers"
// is the same number daily but sums over a week.
function fnbOutletSections(targets) {
  return [
    {
      title: 'Sales + AOP KPIs',
      rows: [
        ['Gross Sales', targets.grossSales],
        ['APC', targets.apc],
        ['Covers/day', targets.covers],
        ['Total Covers', targets.covers],
        ['Table Turnover', 50],
        ['Beverage Attach Rate', 1.5],
        ['Core 4 Revenue %', 65],
        ['Combo Sales %', 28, 'max'],
        ['Lunch Revenue', targets.lunch],
        ['Supper Revenue', targets.supper],
        ['Dinner Revenue', targets.dinner]
      ]
    },
    {
      title: 'Cost',
      rows: [
        ['Food Cost %', targets.foodCost],
        ['Liquor Cost %', targets.liquorCost],
        ['Food Purchase Today', targets.foodPurchase],
        ['Liquor Purchase Today', targets.liquorPurchase],
        ['Total Purchase', targets.totalPurchase]
      ]
    }
  ];
}

export const pageSchemas = {
  hotels: [
    {
      title: 'Room Revenue & Occupancy',
      rows: [
        ['Occupancy %', 78],
        ['Rooms Sold', 96],
        ['Room Revenue', 650000],
        ['ARR', 6800],
        ['RevPAR', 5300]
      ]
    },
    {
      title: 'Forecast',
      rows: [
        ['Tomorrow Occupancy Forecast %', 80],
        ['Arrivals', 42],
        ['Departures', 38]
      ]
    },
    {
      // APC (average per cover = revenue ÷ covers) is tracked for the outlets whose
      // covers the HCP POS report carries (Meeting Point, Freakk, High Steaks).
      // Bougainvillea and In-Room Dining have no covers source, so no APC row.
      title: 'F&B Outlets',
      rows: [
        ['Meeting Point Revenue', 85000],
        ['Meeting Point Covers', 90],
        ['Meeting Point APC', 950],
        ['Freakk Revenue', 70000],
        ['Freakk Covers', 72],
        ['Freakk APC', 970],
        ['Bougainvillea Revenue', 125000],
        ['High Steaks Revenue', 115000],
        ['High Steaks Covers', 80],
        ['High Steaks APC', 1440],
        ['In-Room Dining Revenue', 45000],
        ['Food Cost %', 38],
        ['Liquor Cost %', 42]
      ]
    },
    { title: 'Banquets', rows: [['Revenue Today', 220000], ['No. of Functions', 2], ['Covers', 180], ['APC', 1220]] },
    {
      // Fed daily (rooms) by importOccupancyMix.js from HCP_OCC:
      //   Corporate←CORPORATE, FIT/Leisure←FIT       (Mar.Seg)
      //   OTA (MMT/Booking.com)←ONLINE TR, Walk-ins←WALK-IN  (S.O.B)
      // Group Bookings / Cancellations have no report match → blank (manual entry).
      // Other S.O.B channels (Sales Office, CRO, etc.) are dropped (no "Other" row).
      title: 'Market Segments',
      rows: [
        ['Corporate', 45],
        ['FIT/Leisure', 25],
        ['OTA (MMT/Booking.com)', 18],
        ['Walk-ins', 8],
        ['Group Bookings', 10],
        ['Cancellations/No-shows', 3]
      ]
    }
  ],
  fnb: {
    Pablo: fnbOutletSections({
      grossSales: 160000, apc: 1185, covers: 135,
      lunch: 55000, supper: 25000, dinner: 80000,
      foodCost: 40, liquorCost: 42, foodPurchase: 42000, liquorPurchase: 30000, totalPurchase: 72000
    }),
    Dali: fnbOutletSections({
      grossSales: 100700, apc: 950, covers: 106,
      lunch: 35000, supper: 20000, dinner: 45700,
      foodCost: 28, liquorCost: 30, foodPurchase: 25000, liquorPurchase: 18000, totalPurchase: 43000
    })
  },
  rabbits: [
    { title: 'Sales', rows: [['Total Revenue', 15000], ['Total Orders', 80], ['AOV', 180], ['Cancelled Orders', 8, 'max'], ['Revenue MTD', 450000]] },
    { title: 'Platform Split', rows: [['Swiggy Revenue', 7500], ['Swiggy Orders', 38], ['Zomato Revenue', 6000], ['Zomato Orders', 32], ['Direct Revenue', 1500], ['Direct Orders', 10], ['Swiggy MTD', 225000], ['Zomato MTD', 180000]] },
    { title: 'Category Breakdown', rows: rabbitsCategoryRows },
    { title: 'Cost', rows: [['Purchase/RM Cost Today', 5200], ['Purchase/RM Cost MTD', 156000], ['Purchase/RM Cost YTD', 1600000]] }
  ],
  mickys: [
    // Fed by the automated "Micky's CRM Daily Report" mail (importMickysCrmReport):
    // day totals + city splits here; per-user "<Name> Leads/Visits" rows are added
    // dynamically by the importer. (Sheet-era rows — Leads Contacted/Converted/
    // Conversion Rate/Pipeline Value — retired Aug 2026 with the Google Sheet import.)
    { title: 'Leads Pipeline', rows: [['New Leads Today', 5], ['Visits Today', 4], ['Kits Generated', 2], ['Kits Delivered', 2], ['Nagpur Leads', 4], ['Pune Leads', 3], ['Mumbai Leads', 2], ['Delhi Leads', 1]] },
    { title: 'Orders & Revenue', rows: [['Orders Confirmed', 8], ['Order Revenue Today', 30000], ['Revenue MTD', 900000], ['Revenue YTD', 9500000]] },
    { title: 'SKU-wise Sales', rows: [['Makhani Gravy Units Sold', 100], ['Makhani Gravy Revenue', 12000], ['Korma Base Units Sold', 80], ['Korma Base Revenue', 10000], ['Achari Sauce Units Sold', 60], ['Achari Sauce Revenue', 8000], ['Total SKU Revenue MTD', 900000]] }
  ],
  purosoul: [
    { title: 'Revenue & Cost', rows: [['Total Revenue Today', 25000], ['RM Cost Today', 9000], ['RM Cost %', 38, 'max'], ['Revenue MTD', 750000], ['Purchase MTD', 270000]] },
    { title: 'SKU Production & Dispatch', rows: [] }
  ]
};

export const settlementModes = [
  'Cash',
  'Credit Card',
  'UPI',
  'City Ledger/Credit',
  'Due Payment',
  'Zomato/Swiggy',
  'NEFT/Bank Transfer',
  'OTA Credit (MMT/Booking.com)',
  'Complementary',
  'Discounts/Staff'
];

export function schemaRowsToKpis(unit, pageKey, sections) {
  return sections.flatMap((section) =>
    section.rows.map(([name, target, direction = 'min']) => ({
      id: `${pageKey}:${unit}:${section.title}:${name}`.replaceAll(/\s+/g, '-').toLowerCase(),
      unit,
      section: section.title,
      name,
      target,
      actual: '',
      mtd: '',
      ytd: '',
      direction
    }))
  );
}

export function canonicalUnit(unit) {
  return unit === 'Rabbit' + 's' ? 'Rabbit' : unit;
}

// Merge saved KPI values onto the current schema rows. Saved rows are matched by
// id first, then by unit + name, so a schema rename (of a section, and therefore
// of every row id under it) still lands its history on the right row instead of
// leaving the seed blank and trailing the saved rows as extras.
export function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const keyOf = (row) => `${canonicalUnit(row.unit) ?? ''}::${row.name ?? ''}`;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const savedByKey = new Map();
  for (const row of savedRows) {
    const k = keyOf(row);
    if (!savedByKey.has(k)) savedByKey.set(k, []);
    savedByKey.get(k).push(row);
  }
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const directMatch = savedById.get(seedRow.id);
    const keyMatches = savedByKey.get(keyOf(seedRow)) ?? [];
    const savedRow = directMatch ?? keyMatches[0];
    if (directMatch?.id) seen.add(directMatch.id);
    for (const m of keyMatches) if (m?.id) seen.add(m.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id, unit: seedRow.unit, section: seedRow.section } : seedRow;
  });
  const extraRows = savedRows.filter((row) => !seen.has(row.id));
  return [...mergedSeedRows, ...extraRows];
}

// Pablo carried its own KPI names before its set was aligned with Dali's, so map
// the saved rows onto the current names — otherwise mergeSeedKpiRows can't match
// them and every pre-alignment date shows blank Covers/day + APC rows with the
// legacy rows trailing behind. Scoped to F&B outlet rows on purpose: "Covers" is
// also a CP Nagpur banquet KPI and must not be renamed there.
const LEGACY_FNB_KPI_NAMES = new Map([
  ['Covers', 'Covers/day'],
  ['Avg Bill', 'APC']
]);

export function normalizeFnbKpiRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const names = new Set(rows.map((row) => row?.name));
  const renamed = rows.flatMap((row) => {
    const currentName = LEGACY_FNB_KPI_NAMES.get(row?.name);
    if (!currentName) return [row];
    // A row already stored under the current name wins; drop the stale duplicate.
    return names.has(currentName) ? [] : [{ ...row, name: currentName }];
  });

  // Total Covers was added after Covers/day, so dates imported before it existed
  // have no row for it. For a single day the two are the same count, so seed it
  // from Covers/day — without this the weekly sum silently undercounts history.
  const coversPerDay = renamed.find((row) => row?.name === 'Covers/day');
  const totalCovers = renamed.find((row) => row?.name === 'Total Covers');
  const dayCovers = String(coversPerDay?.actual ?? '').trim();
  if (!dayCovers || String(totalCovers?.actual ?? '').trim() !== '') return renamed;
  if (totalCovers) {
    return renamed.map((row) => (row === totalCovers ? { ...row, actual: dayCovers } : row));
  }
  // Carry only identity + value: target/mtd/ytd must come from the schema row,
  // and the id has to differ from Covers/day's or the merge would match this row
  // back onto Covers/day and rename it.
  return [...renamed, {
    id: `${coversPerDay.id ?? 'covers'}::derived-total-covers`,
    unit: coversPerDay.unit,
    section: coversPerDay.section,
    name: 'Total Covers',
    actual: dayCovers
  }];
}

// One shared vocabulary for the occupancy-mix donuts (Source of Business / Market
// Segment), so CP Nagpur (raw IDS codes from HCP_OCC) and CP NM (Manager Flash
// counters) chart the SAME categories and stay directly comparable. Lookup is by
// uppercased raw name; unknown values pass through unchanged so nothing is lost.
// The legacy CP NM labels are included so stored history lands in the same buckets.
const MIX_SOB_LABELS = {
  'ONLINE TR': 'OTA (MMT/Booking.com)',
  'WALK-IN': 'Walk-ins',
  'SALES OFF': 'Sales Office',
  'HOTEL WEB': 'Hotel Website',
  'TRAV AGEN': 'Travel Agent',
  'HOUSEGUES': 'House Guest',
  'GSTREF': 'Guest Reference',
  'TRAVEL AGENT / OTA': 'OTA (MMT/Booking.com)', // legacy CP NM label
  'NO-SHOWS': 'Cancellations/No-shows'           // legacy CP NM label
};

const MIX_SEGMENT_LABELS = {
  'CORPORATE': 'Corporate',
  'FIT': 'FIT/Leisure',
  'FIT/LEISURE': 'FIT/Leisure',
  'NON-CONTRA': 'Non-Contracted',
  'GROUP RESI': 'Group Bookings',
  'RESIWED': 'Wedding Groups',
  'HOSUEG': 'House Guest',
  'BQTCOR': 'Banquet Corporate'
};

export function canonicalMixName(kind, name) {
  const raw = String(name ?? '').trim();
  const map = kind === 'sbo' ? MIX_SOB_LABELS : MIX_SEGMENT_LABELS;
  return map[raw.toUpperCase()] ?? raw;
}

// Renames a stored mix's sbo/segment entries onto the shared vocabulary, merging
// buckets that collapse into the same canonical name.
export function canonicalizeOccupancyMix(mix) {
  if (!mix || typeof mix !== 'object') return mix;
  const mapList = (kind, items) => {
    if (!Array.isArray(items)) return items;
    const byName = new Map();
    for (const item of items) {
      const name = canonicalMixName(kind, item?.name) || 'Unspecified';
      const bucket = byName.get(name);
      if (bucket) {
        bucket.rooms = (Number(bucket.rooms) || 0) + (Number(item?.rooms) || 0);
        bucket.pax = (Number(bucket.pax) || 0) + (Number(item?.pax) || 0);
        bucket.revenue = (Number(bucket.revenue) || 0) + (Number(item?.revenue) || 0);
      } else {
        byName.set(name, { ...item, name });
      }
    }
    return [...byName.values()].sort((a, b) => b.rooms - a.rooms || b.revenue - a.revenue);
  };
  return { ...mix, sbo: mapList('sbo', mix.sbo), segment: mapList('segment', mix.segment) };
}

// Hotels KPI renames: map saved rows onto the current names (see the F&B note on
// LEGACY_FNB_KPI_NAMES). "Meeting Point Avg Bill" became "Meeting Point APC" when
// APC rows were added across the CP Nagpur outlets. The id is rebuilt so importer
// ensure-rows helpers (which match by id) don't append a duplicate schema row.
const LEGACY_HOTEL_KPI_NAMES = new Map([
  ['Meeting Point Avg Bill', 'Meeting Point APC']
]);

export function normalizeHotelKpiRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const keys = new Set(rows.map((row) => `${row?.unit}::${row?.name}`));
  return rows.flatMap((row) => {
    const currentName = LEGACY_HOTEL_KPI_NAMES.get(row?.name);
    if (!currentName) return [row];
    // A row already stored under the current name wins; drop the stale duplicate.
    if (keys.has(`${row?.unit}::${currentName}`)) return [];
    const renamed = { ...row, name: currentName };
    if (row?.unit && row?.section) {
      renamed.id = `hotels:${row.unit}:${row.section}:${currentName}`.replaceAll(/\s+/g, '-').toLowerCase();
    }
    return [renamed];
  });
}

/** Appends any missing schema rows for one hotels section (older daily files predate new rows). */
export function ensureHotelSectionRows(data, unit, sectionTitle) {
  const section = pageSchemas.hotels.find((s) => s.title === sectionTitle);
  if (!section) return;
  data.hotels = data.hotels ?? [];
  const existingIds = new Set(data.hotels.map((r) => r.id));
  for (const row of schemaRowsToKpis(unit, 'hotels', [section])) {
    if (!existingIds.has(row.id)) data.hotels.push(row);
  }
}

export function normalizeRabbitCategoryBreakdown(data) {
  if (!data?.rabbits) return data;

  const categorySection = pageSchemas.rabbits.find((section) => section.title === 'Category Breakdown');
  const fixedRows = schemaRowsToKpis('Rabbit', 'rabbits', [categorySection]);
  const savedByName = new Map(data.rabbits.map((row) => [row.name, row]));
  const normalizedCategoryRows = fixedRows.map((seedRow) => {
    const savedRow = savedByName.get(seedRow.name);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id, unit: seedRow.unit } : seedRow;
  });
  const nextRows = [];
  let inserted = false;

  for (const row of data.rabbits) {
    if (row.section === 'Category Breakdown') {
      if (!inserted) {
        nextRows.push(...normalizedCategoryRows);
        inserted = true;
      }
      continue;
    }
    nextRows.push({ ...row, unit: row.unit === 'Rabbit' + 's' ? 'Rabbit' : row.unit });
  }

  data.rabbits = inserted ? nextRows : [...nextRows, ...normalizedCategoryRows];

  return data;
}
