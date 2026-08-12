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

/** Existing row for `name` (values carried over), or a fresh one following schemaRowsToKpis' id convention. */
function rowFor(data, name) {
  const existing = (data.mickys ?? []).find((r) => r.section === SECTION && r.name === name);
  return existing ?? {
    id: `mickys:${UNIT}:${SECTION}:${name}`.replaceAll(/\s+/g, '-').toLowerCase(),
    unit: UNIT,
    section: SECTION,
    name,
    target: '',
    actual: '',
    mtd: '',
    ytd: '',
    direction: 'min'
  };
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

    // The section is rebuilt in a fixed display sequence on every import (the
    // saved array order IS the render order on the dashboard and in the PDF):
    // total leads → user-wise leads → total visits → user-wise visits → kits →
    // city splits. Per-user rows land right under their total.
    const ordered = [];
    const push = (name, { actual, mtd } = {}) => {
      const row = rowFor(data, name);
      if (actual !== undefined) row.actual = String(actual);
      if (mtd !== undefined) row.mtd = String(mtd);
      ordered.push(row);
    };
    push('New Leads Today', { actual: newLeads });
    for (const { user, count } of userLeads) push(`${user} Leads`, { actual: count });
    push('Visits Today', { actual: visits });
    for (const { user, count } of userVisits) push(`${user} Visits`, { actual: count });
    push('Kits Generated', { actual: kitsGenerated });
    push('Kits Delivered', { actual: kitsDelivered });
    // City rows: actual = the day's new leads, mtd = the CRM's own running total
    // (mail-provided — the computed month-to-date fill leaves it alone).
    for (const city of ['Nagpur', 'Pune', 'Mumbai', 'Delhi']) {
      const entry = cities.get(city);
      push(`${city} Leads`, entry ? { actual: entry.newLeads, mtd: entry.totalLeads } : {});
    }
    // Leads rows outside today's sequence (e.g. a user present in an earlier
    // import of the same date) trail the block; other sections keep their place.
    const orderedSet = new Set(ordered);
    const leftovers = (data.mickys ?? []).filter((r) => r.section === SECTION && !orderedSet.has(r));
    const otherSections = (data.mickys ?? []).filter((r) => r.section !== SECTION);
    data.mickys = [...ordered, ...leftovers, ...otherSections];

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
