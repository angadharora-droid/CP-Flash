import React from 'react';

const styles = {
  'ON TRACK': 'bg-secondary-container/30 text-on-secondary-container border-secondary/15',
  ACTION:     'bg-error/10 text-error border-error/20'
};

const dots = {
  'ON TRACK': 'bg-secondary',
  ACTION:     'bg-error'
};

export default function FlagBadge({ label }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[label] ?? styles['ON TRACK']}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[label] ?? dots['ON TRACK']}`} aria-hidden />
      {label}
    </span>
  );
}
