import React from 'react';

const styles = {
  'ON TRACK': 'bg-slate-50 text-slate-600 border-slate-200',
  ACTION:     'bg-rose-50 text-rose-700 border-rose-200'
};

const dots = {
  'ON TRACK': 'bg-emerald-500',
  ACTION:     'bg-rose-500'
};

export default function FlagBadge({ label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] ${styles[label] ?? styles['ON TRACK']}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dots[label] ?? dots['ON TRACK']}`} aria-hidden />
      {label}
    </span>
  );
}
