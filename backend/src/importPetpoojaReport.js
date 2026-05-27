import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedData } from './excel.js';
import { normalizeRabbitCategoryBreakdown } from './schema.js';
import { readDailyJson, writeDailyJson } from './dailyStore.js';

function num(str) {
  const n = parseFloat(String(str ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  return String(Math.round(value * 100) / 100);
}

function stripHtmlTags(str) {
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, '')
    .trim();
}

function normalizeText(str) {
  return String(str ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const RABBITS_CATEGORIES = [
  { key: 'foodit', label: 'FOOD(I.T.)' },
  { key: 'rolls', label: 'Rolls' },
  { key: 'maincourse', label: 'Main Course' },
  { key: 'kebabs', label: 'Kebabs' },
  { key: 'sides', label: 'Sides' }
];

function normalizeCategoryKey(str) {
  return normalizeText(str)
    .replace(/â|Â/g, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parse key→value pairs from Petpooja HTML email body.
 * The email has a <table> with 2-column rows: label | value.
 * Returns a Map keyed by lowercase trimmed label.
 */
function parseHtml(html) {
  const map = new Map();
  if (!html) return map;

  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((m) => stripHtmlTags(m[1]));

    if (cells.length < 2) continue;

    // Label is first cell (strip parenthetical sub-labels like "(Core Amount - Discount)")
    const label = cells[0].replace(/\([\s\S]*?\)/g, '').trim().toLowerCase();
    // Value is last cell
    const value = num(cells[cells.length - 1]);

    if (label && value !== null) map.set(label, value);
  }
  return map;
}

function parseCategoryBreakdown(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const categories = new Map();
  let inCategoryTable = false;

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlTags(m[1]))
      .filter(Boolean);
    if (!cells.length) continue;

    const normalized = cells.map(normalizeText);
    const rowText = normalized.join(' ');

    if (normalized.includes('category') && normalized.includes('qty') && rowText.includes('total sales')) {
      inCategoryTable = true;
      continue;
    }

    if (!inCategoryTable) continue;
    if (rowText.includes('last 7 days')) break;
    if (cells.length < 6) continue;

    const key = normalizeCategoryKey(cells[0]);
    const qty = num(cells[1]);
    const totalSales = num(cells[cells.length - 1]);
    if (!key || qty === null || totalSales === null) continue;

    categories.set(key, { qty, totalSales });
  }

  return categories;
}

function parseComboCategorySales(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let inCategoryTable = false;
  let comboSales = 0;

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => stripHtmlTags(m[1]))
      .filter(Boolean);
    if (!cells.length) continue;

    const normalized = cells.map(normalizeText);
    const rowText = normalized.join(' ');

    if (normalized.includes('category') && normalized.includes('qty') && rowText.includes('total sales')) {
      inCategoryTable = true;
      continue;
    }

    if (!inCategoryTable) continue;
    if (rowText.includes('last 7 days')) break;
    if (!/mix|match|combo/i.test(cells[0])) continue;

    const numericCells = cells.map(num).filter((value) => value !== null);
    comboSales += numericCells.at(-1) ?? 0;
  }

  return comboSales;
}

function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const savedRow = savedById.get(seedRow.id);
    seen.add(seedRow.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id } : seedRow;
  });
  return [...mergedSeedRows, ...savedRows.filter((row) => !seen.has(row.id))];
}

function get(map, ...labels) {
  for (const label of labels) {
    if (map.has(label)) return map.get(label);
  }
  return null;
}

function getMatching(map, ...patterns) {
  for (const [label, value] of map) {
    if (patterns.some((pattern) => label.includes(pattern))) return value;
  }
  return null;
}

export async function importPetpoojaReport(emailHtml, outlet, outDate) {
  const values = parseHtml(emailHtml);
  const categoryBreakdown = parseCategoryBreakdown(emailHtml);
  const comboCategorySales = parseComboCategorySales(emailHtml);

  const data = (await readDailyJson(outDate)) ?? buildSeedData();

  if (outlet === 'Rabbit') {
    normalizeRabbitCategoryBreakdown(data);
  } else if (outlet === 'Pablo' || outlet === 'Dali') {
    const seed = buildSeedData();
    data.fnb = {
      ...(data.fnb ?? {}),
      [outlet]: mergeSeedKpiRows(seed.fnb?.[outlet], data.fnb?.[outlet])
    };
  }

  const fnbRows = outlet === 'Pablo'
    ? data.fnb?.Pablo
    : outlet === 'Dali'
      ? data.fnb?.Dali
      : data.rabbits;
  function setKpi(name, actual) {
    const row = fnbRows?.find((item) => item.name === name);
    if (!row || actual === null) return;
    row.actual = round(actual);
  }

  // Net Sales = Core Amount − Discount (pre-tax revenue, what management tracks)
  const netSales = get(values, 'net sales');
  const totalSales = get(values, 'total sales');
  const grossSales = netSales ?? totalSales;
  const bills = get(values, 'no. of bills', 'number of bills', 'covers', 'total bills', 'no of bills');
  const avgBill = get(values, 'avg bill', 'average bill', 'avg. bill')
    ?? (grossSales && bills ? grossSales / bills : null);
  const key = outlet === 'Rabbit' ? 'rabbits' : outlet.toLowerCase();
  const hasPaymentImport = Boolean(data.importSource?.[`${key}PaymentImportedAt`]);

  if (outlet === 'Rabbit') {
    if (!hasPaymentImport) {
      setKpi('Total Revenue', grossSales);
      setKpi('Total Orders', bills);
      setKpi('AOV', avgBill);
      setKpi('Swiggy Revenue', get(values, 'swiggy online'));
      setKpi('Zomato Revenue', get(values, 'zomato online'));
    }
    if (categoryBreakdown.size) {
      for (const category of RABBITS_CATEGORIES) {
        const item = categoryBreakdown.get(category.key);
        setKpi(`${category.label} Orders`, item?.qty ?? 0);
        setKpi(`${category.label} Revenue`, item?.totalSales ?? 0);
      }
    } else {
      setKpi('Rolls Revenue', getMatching(values, 'rolls'));
      setKpi('Kebabs Revenue', getMatching(values, 'kebabs'));
      setKpi('Main Course Revenue', getMatching(values, 'main course'));
    }
  } else {
    if (!hasPaymentImport) {
      setKpi('Gross Sales', grossSales);
      setKpi('Covers', bills);
      setKpi('Covers/day', bills);
      setKpi('Avg Bill', avgBill);
      setKpi('APC', avgBill);
    }
    setKpi('Lunch Revenue', get(values, 'lunch', 'lunch sales', 'lunch revenue'));
    setKpi('Dinner Revenue', get(values, 'dinner', 'dinner sales', 'dinner revenue'));
    if (grossSales) setKpi('Combo Sales %', (comboCategorySales / grossSales) * 100);
  }

  if (!hasPaymentImport) {
    data.pnl = (data.pnl ?? []).map((row) =>
      row.unit === outlet ? { ...row, revenueToday: round(grossSales ?? 0) } : row
    );
  }

  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}PetpoojaImportedAt`]: new Date().toISOString(),
    [`${key}PetpoojaValues`]: Object.fromEntries(values)
  };

  await writeDailyJson(outDate, data);

  return {
    ok: true,
    date: outDate,
    outlet,
    mapped: {
      grossSales,
      covers: bills,
      netSales,
      totalSales
    }
  };
}

// CLI: node importPetpoojaReport.js <html-file> <Pablo|Dali> [YYYY-MM-DD]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , htmlFile, outlet = 'Pablo', outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!htmlFile) {
    console.error('Usage: node importPetpoojaReport.js <email-html-file> <Pablo|Dali> [YYYY-MM-DD]');
    process.exit(1);
  }
  const html = await fs.readFile(htmlFile, 'utf8');
  importPetpoojaReport(html, outlet, outDate).then((r) => console.log(JSON.stringify(r, null, 2)));
}
