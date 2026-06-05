import React from 'react';

const styles = {
  'ON TRACK':      'bg-secondary-container/30 text-on-secondary-container border-secondary/15',
  ACTION:          'bg-error/10 text-error border-error/20'
};

const dots = {
  'ON TRACK':      'bg-secondary',
  ACTION:          'bg-error'
};

export default function FlagBadge({ label }) {
  return (
    <span className={`inline-flex min-w-28 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[label] ?? styles['ON TRACK']}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${dots[label] ?? dots['ON TRACK']}`} />
      {label}
    </span>
  );
}
