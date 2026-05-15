import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedData } from './excel.js';

function num(str) {
  const n = parseFloat(String(str ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
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

function get(map, ...labels) {
  for (const label of labels) {
    if (map.has(label)) return map.get(label);
  }
  return null;
}

export async function importPetpoojaReport(emailHtml, outlet, outDate) {
  const values = parseHtml(emailHtml);

  const dataPath = path.resolve(process.cwd(), 'data', `${outDate}.json`);
  let data;
  try {
    data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    data = buildSeedData();
  }

  const fnbRows = outlet === 'Pablo' ? data.fnb?.Pablo : data.fnb?.Dali;
  function setKpi(name, actual) {
    const row = fnbRows?.find((item) => item.name === name);
    if (!row || actual === null) return;
    row.actual = String(Math.round(actual * 100) / 100);
  }

  // Net Sales = Core Amount − Discount (pre-tax revenue, what management tracks)
  const netSales = get(values, 'net sales');
  const totalSales = get(values, 'total sales');
  const grossSales = netSales ?? totalSales;

  setKpi('Gross Sales', grossSales);
  setKpi('Covers', get(values, 'no. of bills', 'number of bills', 'covers', 'total bills', 'no of bills'));
  setKpi('Avg Bill', get(values, 'avg bill', 'average bill', 'avg. bill'));
  setKpi('Lunch Revenue', get(values, 'lunch', 'lunch sales', 'lunch revenue'));
  setKpi('Dinner Revenue', get(values, 'dinner', 'dinner sales', 'dinner revenue'));

  data.pnl = (data.pnl ?? []).map((row) =>
    row.unit === outlet ? { ...row, revenueToday: String(Math.round((grossSales ?? 0) * 100) / 100) } : row
  );

  const key = outlet.toLowerCase();
  data.importSource = {
    ...(data.importSource ?? {}),
    [`${key}PetpoojaImportedAt`]: new Date().toISOString(),
    [`${key}PetpoojaValues`]: Object.fromEntries(values)
  };

  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.writeFile(dataPath, JSON.stringify({ ...data, date: outDate, savedAt: new Date().toISOString() }, null, 2));

  return {
    ok: true,
    date: outDate,
    outlet,
    mapped: {
      grossSales,
      covers: get(values, 'no. of bills', 'number of bills', 'covers', 'total bills', 'no of bills'),
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
