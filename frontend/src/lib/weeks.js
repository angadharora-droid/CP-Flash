// Calendar-week helpers shared by the Dashboard charts and the PDF preview.
// Weeks run Monday -> Sunday, computed in UTC from ISO date strings (YYYY-MM-DD).

const pad = (n) => String(n).padStart(2, '0');
const isoFromUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function monthKeyFromDate(dateStr) {
  return dateStr.slice(0, 7);
}

export function buildMonthOptions(referenceDate, count = 12) {
  const [refYear, refMonth] = referenceDate.slice(0, 7).split('-').map(Number);
  const options = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(refYear, refMonth - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    options.push({ key, label });
  }
  return options;
}

export function buildWeekOptions(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const day = firstOfMonth.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const cursor = new Date(firstOfMonth);
  cursor.setUTCDate(cursor.getUTCDate() + mondayOffset);
  const weeks = [];
  let weekNo = 1;
  while (cursor <= lastOfMonth) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setUTCDate(end.getUTCDate() + 6);
    const fmt = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    weeks.push({
      key: isoFromUtc(start),
      end: isoFromUtc(end),
      label: `W${weekNo}: ${fmt(start)} - ${fmt(end)}`
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    weekNo += 1;
  }
  return weeks;
}

export function weekStartContaining(dateStr) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return isoFromUtc(d);
}

export function weekEndFromStart(dateStr) {
  const end = new Date(`${dateStr}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return isoFromUtc(end);
}

export function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  });
}
