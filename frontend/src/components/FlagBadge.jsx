import React from 'react';

const styles = {
  OUTPERFORM:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  'ON TRACK':      'bg-teal-50 text-teal-700 border-teal-200',
  WATCH:           'bg-amber-50 text-amber-700 border-amber-200',
  'ACTION NEEDED': 'bg-red-50 text-red-700 border-red-200',
};

const dots = {
  OUTPERFORM:      'bg-emerald-500',
  'ON TRACK':      'bg-teal-500',
  WATCH:           'bg-amber-500',
  'ACTION NEEDED': 'bg-red-500',
};

export default function FlagBadge({ label }) {
  return (
    <span className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${styles[label] ?? styles['ON TRACK']}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dots[label] ?? dots['ON TRACK']}`} />
      {label}
    </span>
  );
}
