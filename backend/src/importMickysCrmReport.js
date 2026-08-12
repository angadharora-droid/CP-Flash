import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { buildSeedData } from './excel.js';
import { readDaily, writeDaily, withDateLock } from './dailyStore.js';

// Parses the automated "Micky's CRM Daily Report — DD Mon YYYY" HTML email
// (sales@mickys.in, no attachment) into the Micky's "Leads Pipeline" KPI table.
// Replaced the manual Google-Sheets leads import (importMickysLeads) in Aug 2026.
//
// Mail layout (fixed generator):
//   summary tiles     → New Leads / Visits / Kits Generated / Kits Delivered
//   "New Leads — User wise" / "Visits — User wise" tables with group header rows
//     "<Name> — N lead(s)/visit(s)" (or a "No new leads were created." note)
//   "Kits Generated" / "Kits Delivered" detail tables
//   "City-wise Leads" table: City | New Leads (date) | Total Leads

const UNIT = "Micky's";
const SECTION = 'Leads Pipeline';

const stripTags = (s) => String(s ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

/** Summary tile: a bold value <div> immediately followed by its label <div>. */
function tileValue(html, label) {
  const m = new RegExp(`>\\s*(\\d+)\\s*</div>\\s*<div[^>]*>\\s*${label}\\s*</div>`, 'i').exec(html);
  return m ? Number(m[1]) : 0;
}

/** Splits the mail into { lowercased h2 title → section html } chunks. */
function splitSections(html) {
  const matches = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)];
  const map = new Map();
  matches.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : html.length;
    map.set(stripTags(m[1]).toLowerCase(), html.slice(start, end));
  });
  return map;
}

/** "Sharath Kumar P — 2 visits" group header rows → [{ user, count }]. */
function userCounts(sectionHtml, word) {
  const out = [];
  for (const m of (sectionHtml ?? '').matchAll(/<td[^>]*colspan="?\d+"?[^>]*>([\s\S]*?)<\/td>/gi)) {
    const gm = new RegExp(`^(.+?)\\s*[—–-]\\s*(\\d+)\\s*${word}s?\\b`, 'i').exec(stripTags(m[1]));
    if (gm) out.push({ user: gm[1].trim(), count: Number(gm[2]) });
  }
  return out;
}

/** City-wise table rows: City | New Leads (date) | Total Leads. */
function cityLeads(sectionHtml) {
  const out = new Map();
  for (const tr of (sectionHtml ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => stripTags(c[1]));
    if (cells.length < 3) continue; // header row uses <th>
    const [city, newLeads, totalLeads] = cells;
    if (/^\d+$/.test(newLeads) && /^\d+$/.test(totalLeads)) {
      out.set(city, { newLeads: Number(newLeads), totalLeads: Number(totalLeads) });
    }
  }
  return out;
}

/** Creates a Leads Pipeline row when absent (per-user rows are mail-driven, not seeded). */
function ensureRow(data, name) {
  data.mickys = data.mickys ?? [];
  if (data.mickys.some((r) => r.section === SECTION && r.name === name)) return;
  data.mickys.push({
    id: `mickys:${UNIT}:${SECTION}:${name}`.replaceAll(/\s+/g, '-').toLowerCase(),
    unit: UNIT,
    section: SECTION,
    name,
    target: '',
    actual: '',
    mtd: '',
    ytd: '',
    direction: 'min'
  });
}

function setKpi(data, name, { actual, mtd } = {}) {
  ensureRow(data, name);
  const row = data.mickys.find((r) => r.section === SECTION && r.name === name);
  if (actual !== undefined) row.actual = String(actual);
  if (mtd !== undefined) row.mtd = String(mtd);
}

export async function importMickysCrmReport(html, outDate) {
  if (!String(html ?? '').trim()) throw new Error('CRM mail has no HTML body.');

  const newLeads = tileValue(html, 'New Leads');
  const visits = tileValue(html, 'Visits');
  const kitsGenerated = tileValue(html, 'Kits Generated');
  const kitsDelivered = tileValue(html, 'Kits Delivered');

  const sections = splitSections(html);
  const sectionFor = (needle) => [...sections.entries()].find(([title]) => title.includes(needle))?.[1] ?? '';
  const userLeads = userCounts(sectionFor('new leads'), 'lead');
  const userVisits = userCounts(sectionFor('visits'), 'visit');
  const cities = cityLeads(sectionFor('city-wise'));

  await withDateLock(outDate, async () => {
    const data = (await readDaily(outDate)) ?? buildSeedData();

    setKpi(data, 'New Leads Today', { actual: newLeads });
    setKpi(data, 'Visits Today', { actual: visits });
    setKpi(data, 'Kits Generated', { actual: kitsGenerated });
    setKpi(data, 'Kits Delivered', { actual: kitsDelivered });
    // City rows: actual = the day's new leads, mtd = the CRM's own running total
    // (mail-provided — the computed month-to-date fill leaves it alone).
    for (const city of ['Nagpur', 'Pune', 'Mumbai', 'Delhi']) {
      const entry = cities.get(city);
      if (entry) setKpi(data, `${city} Leads`, { actual: entry.newLeads, mtd: entry.totalLeads });
    }
    for (const { user, count } of userLeads) setKpi(data, `${user} Leads`, { actual: count });
    for (const { user, count } of userVisits) setKpi(data, `${user} Visits`, { actual: count });

    data.importSource = {
      ...(data.importSource ?? {}),
      mickysCrmImportedAt: new Date().toISOString(),
      mickysCrmNotes: `leads=${newLeads}, visits=${visits}, kitsGen=${kitsGenerated}, kitsDel=${kitsDelivered}, `
        + `users(leads)=${userLeads.map((u) => `${u.user}:${u.count}`).join('/') || 'none'}, `
        + `users(visits)=${userVisits.map((u) => `${u.user}:${u.count}`).join('/') || 'none'}`
    };

    await writeDaily(outDate, data);
  });

  return {
    ok: true,
    date: outDate,
    unit: UNIT,
    mapped: {
      newLeads,
      visits,
      kitsGenerated,
      kitsDelivered,
      userLeads,
      userVisits,
      cities: Object.fromEntries(cities)
    }
  };
}

// CLI: node importMickysCrmReport.js <saved.html> [YYYY-MM-DD]
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, outDate = new Date().toISOString().slice(0, 10)] = process.argv;
  if (!file) { console.error('Usage: node importMickysCrmReport.js <file.html> [YYYY-MM-DD]'); process.exit(1); }
  const { closeDailyStore } = await import('./dailyStore.js');
  importMickysCrmReport(await fs.readFile(file, 'utf8'), outDate)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .finally(() => closeDailyStore());
}
