import React, { useEffect, useState } from 'react';
import SectionCard from './SectionCard';
import { statusTone } from './DashboardUi';
import { getSourceStatus } from '../lib/api';

// Rabbit's rows arrive with a date-only importedAt fallback (no time of day to show).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function arrivedAt(value) {
  if (!value) return '';
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return when.toDateString() === new Date().toDateString()
    ? time
    : `${when.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

function ReportRow({ source, arrived }) {
  const detail = arrived
    ? (source.status === 'Entered' ? 'Entered manually' : arrivedAt(source.importedAt))
    : '';
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-semibold text-on-surface">{source.label}</div>
        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/65">{source.type}</div>
        {source.notes ? <div className="mt-1 text-[11px] leading-4 text-on-surface-variant">{source.notes}</div> : null}
      </div>
      {detail ? <span className="num shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-on-surface-variant">{detail}</span> : null}
    </li>
  );
}

function ReportColumn({ title, tone, sources, arrived = false, empty }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${tone}`}>{title}</span>
        <span className="num text-[11px] font-semibold text-on-surface-variant">{sources.length}</span>
      </div>
      {sources.length ? (
        <ul className="space-y-1.5">
          {sources.map((source) => <ReportRow key={source.id} source={source} arrived={arrived} />)}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-outline-variant/60 px-3 py-3 text-[12px] text-on-surface-variant">{empty}</p>
      )}
    </div>
  );
}

// Collapsed by default; the header alone answers "is everything in?" and opening it
// splits the day's sources into yet-to-come vs arrived.
export default function ReportArrivalsCard({ date, authToken, importSource }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  // importSource changes whenever an import lands, so the card follows Refresh without polling.
  useEffect(() => {
    if (!authToken || !date) return undefined;
    let active = true;
    getSourceStatus(date, authToken)
      .then((next) => {
        if (!active) return;
        setStatus({ ...next, date });
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => { active = false; };
  }, [date, authToken, importSource]);

  const loaded = status?.date === date;
  const sources = loaded ? status.sources ?? [] : [];
  const pending = sources.filter((source) => source.status === 'Pending');
  const arrived = sources.filter((source) => source.status !== 'Pending');

  let subtitle = 'Checking reports…';
  let tone = 'slate';
  if (error) {
    subtitle = 'Could not load report status';
    tone = 'rose';
  } else if (loaded) {
    subtitle = pending.length
      ? `${arrived.length} of ${sources.length} arrived · ${pending.length} yet to come`
      : `All ${sources.length} reports arrived`;
    tone = pending.length ? 'amber' : 'emerald';
  }

  return (
    <SectionCard title="Report Arrivals" subtitle={subtitle} icon="inbox" tone={tone} defaultOpen={false}>
      {error ? (
        <p className="text-[12px] text-error">{error}</p>
      ) : !loaded ? (
        <p className="text-[12px] text-on-surface-variant">Checking reports…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ReportColumn title="Yet to come" tone={statusTone.Pending} sources={pending} empty="Every report for this date is in." />
          <ReportColumn title="Arrived" tone={statusTone.Imported} sources={arrived} arrived empty="Nothing has arrived for this date yet." />
        </div>
      )}
    </SectionCard>
  );
}
