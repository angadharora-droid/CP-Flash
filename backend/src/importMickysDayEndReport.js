import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';
import { pageSchemas, schemaRowsToKpis } from './schema.js';

// Parses the automated "Micky’s Day End Report — DD Mon YYYY" HTML mail
// (sales@mickys.in, no attachment, ~1 PM the day after). It replaced the
// "Micky's CRM Daily Report" leads mail in Oct 2026.
//
// Mail layout (CRM generator, sections in this order):
//   headline tiles   → Sales (Tally) / Collection / Receivables / Closing Stock
//   <h2> Sales                       Particular | Yesterday | Month to date / remarks
//   <h2> Sales Executive KPI         Executive | Visits (target N) | Calls (target N) | New leads made / assigned (target N)
//   <h2> Due Customer List           Customer | Amount Due | Due Since / Days | Follow-up Status
//   <h2> Production                  (a note "Nothing was produced or planned." on idle days)
//   <h2> Production Cost / Kg        (a note "No production to cost." on idle days)
//   <h2> Closing Stock – SKU Wise    family table, then a "Critical SKUs" batch table
//   <h2> Top 20% High-Value Closing Stock
//
// Every section is stored as-is (ordered notes + tables, cell = main line + sub
// caption + ✓/✗/CRITICAL tone) under data.mickysDayEnd for the dashboard and PDF
// to render — Production and Production Cost have only ever arrived empty, so
// their columns are taken from the mail rather than assumed. The figures that
// aggregate over a week/month are also written as Micky's KPI rows. Total Sales
// is NOT: the Tally "Daily Sales Report" mail stays the one writer of Order
// Revenue Today / P&L revenue (same Tally figure, proven equal on 06 Oct 2026).

const UNIT = "Micky's";

const decode = (s) => String(s ?? '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

const stripTags = (s) => decode(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "₹14,69,358.50" → 1469358.5; "—"/blank → null. */
function amount(text) {
  const m = /(-)?\s*₹?\s*(-)?([\d,]+(?:\.\d+)?)/.exec(String(text ?? ''));
  if (!m) return null;
  const value = Number(m[3].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return m[1] || m[2] ? -value : value;
}

const kpiValue = (value) => (value == null ? '' : String(Math.round(value * 100) / 100));

/**
 * One table cell → { text, sub?, tone?, right? }. Block-level children (<div>,
 * <br>) separate the bold figure from its caption ("₹1,60,072.00" / "4 invoices").
 * The ✓ / ✗ / ● marks become a tone so the dashboard can colour them.
 */
function parseCell(html) {
  const lines = String(html ?? '')
    .split(/<\/?(?:div|p|br)\b[^>]*>/i)
    .map(stripTags)
    .filter(Boolean);
  const all = lines.join(' ');
  const tone = all.includes('✓') ? 'good'
    : all.includes('✗') ? 'bad'
      : /critical|expired/i.test(all) ? 'critical'
        : null;
  const clean = (s) => s.replace(/[✓✗●]/g, '').replace(/\s+/g, ' ').replace(/^[\s·]+|[\s·]+$/g, '').trim();
  const [text = '', ...rest] = lines.map(clean).filter(Boolean);
  const cell = { text };
  if (rest.length) cell.sub = rest.join(' · ');
  if (tone) cell.tone = tone;
  if (/text-align\s*:\s*right/i.test(html)) cell.right = true;
  return cell;
}

function parseTable(html) {
  let columns = [];
  const rows = [];
  let total = null;
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    if (!cells.length) continue;
    if (cells.every((c) => c[1].toLowerCase() === 'th')) {
      columns = cells.map((c) => stripTags(c[2]));
      continue;
    }
    const row = cells.map((c) => parseCell(c[2]));
    if (/^total$/i.test(row[0]?.text ?? '')) total = row;
    else rows.push(row);
  }
  return { type: 'table', columns, rows, total };
}

/** A section's notes and tables in mail order; the CRM link and footer are kept out. */
function parseBlocks(html) {
  const blocks = [];
  for (const m of html.matchAll(/<table\b[\s\S]*?<\/table>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (m[0].toLowerCase().startsWith('<table')) {
      blocks.push(parseTable(m[0]));
      continue;
    }
    if (/<a\b/i.test(m[1])) continue;
    const text = stripTags(m[1]);
    if (text && !/^automated day end report/i.test(text)) blocks.push({ type: 'note', text });
  }
  return blocks;
}

/** Headline tiles: a bold value <div> immediately followed by its label <div>. */
function parseTiles(html) {
  const tiles = [];
  for (const m of html.matchAll(/<div[^>]*>\s*(-?₹?\s*[\d,.]+)\s*<\/div>\s*<div[^>]*>\s*([^<]+?)\s*<\/div>/gi)) {
    tiles.push({ label: stripTags(m[2]), value: amount(m[1]) });
  }
  return tiles;
}

export function parseMickysDayEndReport(html) {
  const source = String(html ?? '');
  if (!/day\s*end\s*report/i.test(stripTags(source))) {
    throw new Error("Not a Micky's Day End Report mail (title not found).");
  }

  const headings = [...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  if (!headings.length) throw new Error("Micky's Day End Report has no sections.");

  const sections = headings.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : source.length;
    return { title: stripTags(m[1]), blocks: parseBlocks(source.slice(start, end)) };
  });

  const intro = source.slice(0, headings[0].index);
  const introNotes = parseBlocks(intro).filter((b) => b.type === 'note').map((b) => b.text);
  const footer = stripTags(/automated day end report[^<]*/i.exec(source)?.[0] ?? '');

  return {
    tiles: parseTiles(intro),
    tallyNote: introNotes.find((t) => /tally/i.test(t)) ?? introNotes[0] ?? '',
    coversDate: /covers\s+(\d{1,2}\s+[a-z]+\s+\d{4})/i.exec(footer)?.[1] ?? '',
    crmUrl: /<a\b[^>]*href="([^"]+)"/i.exec(source.slice(headings.at(-1).index))?.[1] ?? '',
    sections
  };
}

const findSection = (report, pattern) => report.sections.find((s) => pattern.test(s.title));
const firstTable = (section) => section?.blocks.find((b) => b.type === 'table');
const tile = (report, pattern) => report.tiles.find((t) => pattern.test(t.label))?.value ?? null;

/** Sales table → { 'orders received': { today, mtd }, … } keyed by lowercased particular. */
function salesFigures(report) {
  const out = {};
  for (const row of firstTable(findSection(report, /^sales$/i))?.rows ?? []) {
    out[row[0].text.toLowerCase()] = { today: amount(row[1]?.text), mtd: amount(row[2]?.text) };
  }
  return out;
}

/** Executive table → team totals plus the per-head targets stated in the column headers. */
function executiveFigures(report) {
  const table = firstTable(findSection(report, /executive/i));
  if (!table) return null;
  const col = (pattern) => table.columns.findIndex((c) => pattern.test(c));
  const visitsCol = col(/visit/i);
  const callsCol = col(/call/i);
  const leadsCol = col(/lead/i);
  const target = (index) => Number(/target\s*(\d+)/i.exec(table.columns[index] ?? '')?.[1]) || null;
  // "3 / 0" → made 3, assigned 0.
  const leads = (cell) => {
    const [made, assigned] = String(cell?.text ?? '').split('/').map((s) => amount(s));
    return { made: made ?? 0, assigned: assigned ?? 0 };
  };
  const sumOf = (fn) => table.rows.reduce((sum, row) => sum + fn(row), 0);
  const totalRow = table.total;
  const pick = (index, fn) => (totalRow ? fn(totalRow[index]) : sumOf((row) => fn(row[index])));
  const count = table.rows.length;
  const perHead = { visits: target(visitsCol), calls: target(callsCol), leads: target(leadsCol) };
  return {
    executives: count,
    visits: visitsCol < 0 ? null : pick(visitsCol, (c) => amount(c?.text) ?? 0),
    calls: callsCol < 0 ? null : pick(callsCol, (c) => amount(c?.text) ?? 0),
    leadsMade: leadsCol < 0 ? null : pick(leadsCol, (c) => leads(c).made),
    leadsAssigned: leadsCol < 0 ? null : pick(leadsCol, (c) => leads(c).assigned),
    // Team target for the day = the per-executive target × executives listed.
    targets: Object.fromEntries(Object.entries(perHead).map(([k, v]) => [k, v && count ? v * count : null]))
  };
}

function closingStockValue(report) {
  const totalRow = firstTable(findSection(report, /closing stock\s*[–-]\s*sku/i))?.total;
  return amount(totalRow?.[1]?.text) ?? tile(report, /closing stock/i);
}

const filled = (value) => value !== null && value !== undefined && String(value).trim() !== '';

/**
 * Lays the Micky's KPI rows out in schema order, carrying saved values over.
 * Rows outside the schema (the retired CRM "Leads Pipeline", never-filled
 * placeholders) are kept only while they still hold a value for this date.
 */
function normalizeMickysRows(rows = []) {
  const used = new Set();
  const ordered = schemaRowsToKpis(UNIT, 'mickys', pageSchemas.mickys).map((seedRow) => {
    const saved = rows.find((r) => r.id === seedRow.id)
      ?? rows.find((r) => r.section === seedRow.section && r.name === seedRow.name);
    if (!saved) return seedRow;
    used.add(saved);
    return { ...seedRow, ...saved, id: seedRow.id, section: seedRow.section };
  });
  const extras = rows.filter((r) => !used.has(r) && (filled(r.actual) || filled(r.mtd)));
  return [...ordered, ...extras];
}

export async function importMickysDayEndReport(html, outDate) {
  const report = parseMickysDayEndReport(html);
  const sales = salesFigures(report);
  const exec = executiveFigures(report);
  const stock = closingStockValue(report);
  const receivables = sales['outstanding receivables']?.today ?? tile(report, /receivable/i);

  await withDateLock(outDate, async () => {
    const data = (await readDaily(outDate)) ?? buildSeedData();
    data.mickys = normalizeMickysRows(data.mickys);

    const set = (section, name, { actual, mtd, target } = {}) => {
      const row = data.mickys.find((r) => r.section === section && r.name === name);
      if (!row) return;
      if (actual !== undefined) row.actual = kpiValue(actual);
      if (mtd !== undefined) row.mtd = kpiValue(mtd);
      if (target != null) row.target = target;
    };
    // Flow figures carry the mail's own month-to-date; receivables and stock are
    // point-in-time balances (aggregated as "latest" over a week).
    for (const [particular, name] of [
      ['orders received', 'Orders Received'],
      ['orders dispatched', 'Orders Dispatched'],
      ['collection received', 'Collection Received']
    ]) {
      if (sales[particular]) set('Orders & Revenue', name, { actual: sales[particular].today, mtd: sales[particular].mtd });
    }
    if (receivables != null) set('Orders & Revenue', 'Outstanding Receivables', { actual: receivables });
    if (exec) {
      set('Sales Executive KPI', 'Visits Today', { actual: exec.visits, target: exec.targets.visits });
      set('Sales Executive KPI', 'Calls Today', { actual: exec.calls, target: exec.targets.calls });
      set('Sales Executive KPI', 'New Leads Today', { actual: exec.leadsMade, target: exec.targets.leads });
      set('Sales Executive KPI', 'Leads Assigned Today', { actual: exec.leadsAssigned });
    }
    if (stock != null) set('Closing Stock', 'Closing Stock Value', { actual: stock });

    data.mickysDayEnd = { ...report, date: outDate };
    data.importSource = {
      ...(data.importSource ?? {}),
      mickysDayEndImportedAt: new Date().toISOString(),
      mickysDayEndNotes: [
        `sales=${kpiValue(sales['total sales']?.today) || 0}`,
        `collection=${kpiValue(sales['collection received']?.today) || 0}`,
        `receivables=${kpiValue(receivables) || 0}`,
        `stock=${kpiValue(stock) || 0}`,
        exec ? `visits=${exec.visits}, calls=${exec.calls}, leads=${exec.leadsMade}/${exec.leadsAssigned} (${exec.executives} execs)` : 'no executive table'
      ].join(', ')
    };

    await writeDaily(outDate, data);
  });

  return {
    ok: true,
    date: outDate,
    unit: UNIT,
    mapped: {
      sales: Object.fromEntries(Object.entries(sales).map(([k, v]) => [k, v.today])),
      receivables,
      closingStock: stock,
      executives: exec,
      sections: report.sections.map((s) => `${s.title} (${s.blocks.filter((b) => b.type === 'table').map((b) => b.rows.length).join('+') || 'note'})`)
    }
  };
}

// CLI: node importMickysDayEndReport.js <saved.html> [YYYY-MM-DD]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importMickysDayEndReport.js <file.html> [YYYY-MM-DD]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importMickysDayEndReport(await fs.readFile(file, 'utf8'), outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
