export const UNITS = ['CP Nagpur', 'CP NM', 'Pablo', 'Dali', 'Rabbits', "Micky's", 'Purosoul'];

export const fixedCostDefaults = {
  'CP Nagpur': 185000,
  'CP NM': 135000,
  Pablo: 42000,
  Dali: 36000,
  Rabbits: 9000,
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

export const pageSchemas = {
  hotels: [
    {
      title: 'Room Revenue & Occupancy',
      rows: [
        ['Occupancy %', 78],
        ['Tomorrow Occupancy Forecast %', 80],
        ['Arrivals', 42],
        ['Departures', 38],
        ['Rooms Sold', 96],
        ['Room Revenue', 650000],
        ['ARR', 6800],
        ['RevPAR', 5300]
      ]
    },
    {
      title: 'F&B Outlets',
      rows: [
        ['Meeting Point Revenue', 85000],
        ['Meeting Point Covers', 90],
        ['Meeting Point Avg Bill', 950],
        ['Freakk Revenue', 70000],
        ['Freakk Covers', 72],
        ['Bougainvillea Revenue', 125000],
        ['High Steaks Revenue', 115000],
        ['In-Room Dining Revenue', 45000],
        ['Food Cost %', 38],
        ['Liquor Cost %', 42]
      ]
    },
    { title: 'Banquets', rows: [['Revenue Today', 220000], ['No. of Functions', 2], ['Covers', 180]] },
    {
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
    Pablo: [
      { title: 'Sales', rows: [['Gross Sales', 160000], ['Covers', 135], ['Avg Bill', 1185], ['Combo Sales %', 28, 'max'], ['Lunch Revenue', 55000], ['Supper Revenue', 25000], ['Dinner Revenue', 80000]] },
      { title: 'Cost', rows: [['Food Cost %', 40], ['Liquor Cost %', 42], ['Food Purchase Today', 42000], ['Liquor Purchase Today', 30000], ['Total Purchase', 72000]] }
    ],
    Dali: [
      {
        title: 'Sales + AOP KPIs',
        rows: [
          ['Gross Sales', 100700],
          ['APC', 950],
          ['Covers/day', 106],
          ['Table Turnover', 50],
          ['Beverage Attach Rate', 1.5],
          ['Core 4 Revenue %', 65],
          ['Combo Sales %', 28, 'max'],
          ['Lunch Revenue', 35000],
          ['Supper Revenue', 20000],
          ['Dinner Revenue', 45700]
        ]
      },
      { title: 'Cost', rows: [['Food Cost %', 28], ['Liquor Cost %', 30], ['Food Purchase Today', 25000], ['Liquor Purchase Today', 18000], ['Total Purchase', 43000]] }
    ]
  },
  rabbits: [
    { title: 'Sales', rows: [['Total Revenue', 15000], ['Total Orders', 80], ['AOV', 180], ['Cancelled Orders', 8, 'max'], ['Revenue MTD', 450000]] },
    { title: 'Platform Split', rows: [['Swiggy Revenue', 7500], ['Swiggy Orders', 38], ['Zomato Revenue', 6000], ['Zomato Orders', 32], ['Direct Revenue', 1500], ['Direct Orders', 10], ['Swiggy MTD', 225000], ['Zomato MTD', 180000]] },
    { title: 'Category Breakdown', rows: rabbitsCategoryRows },
    { title: 'Cost', rows: [['Purchase/RM Cost Today', 5200], ['Purchase/RM Cost MTD', 156000], ['Purchase/RM Cost YTD', 1600000]] }
  ],
  mickys: [
    { title: 'Leads Pipeline', rows: [['New Leads Today', 5], ['Leads Contacted', 10], ['Leads Converted', 3], ['Conversion Rate %', 60], ['Pipeline Value', 150000], ['Nagpur Leads', 4], ['Pune Leads', 3], ['Mumbai Leads', 2], ['Delhi Leads', 1]] },
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

export function normalizeRabbitsCategoryBreakdown(data) {
  if (!data?.rabbits) return data;

  const categorySection = pageSchemas.rabbits.find((section) => section.title === 'Category Breakdown');
  const fixedRows = schemaRowsToKpis('Rabbits', 'rabbits', [categorySection]);
  const savedByName = new Map(data.rabbits.map((row) => [row.name, row]));
  const normalizedCategoryRows = fixedRows.map((seedRow) => {
    const savedRow = savedByName.get(seedRow.name);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id } : seedRow;
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
    nextRows.push(row);
  }

  data.rabbits = inserted ? nextRows : [...data.rabbits, ...normalizedCategoryRows];

  return data;
}
