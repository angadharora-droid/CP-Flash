import React from 'react';

const styles = {
  OUTPERFORM:      'bg-emerald-50/80 text-emerald-700 border-emerald-200/80 ring-1 ring-emerald-100',
  'ON TRACK':      'bg-teal-50/80 text-teal-700 border-teal-200/80 ring-1 ring-teal-100',
  WATCH:           'bg-amber-50/80 text-amber-700 border-amber-200/80 ring-1 ring-amber-100',
  'ACTION NEEDED': 'bg-rose-50/80 text-rose-700 border-rose-200/80 ring-1 ring-rose-100',
};

const dots = {
  OUTPERFORM:      'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]',
  'ON TRACK':      'bg-teal-500 shadow-[0_0_0_3px_rgba(20,184,166,0.18)]',
  WATCH:           'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]',
  'ACTION NEEDED': 'bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.20)]',
};

export default function FlagBadge({ label }) {
  return (
    <span className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${styles[label] ?? styles['ON TRACK']}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dots[label] ?? dots['ON TRACK']}`} />
      {label}
    </span>
  );
}
