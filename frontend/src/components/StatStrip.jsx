import React from 'react';

const ACCENT = {
  'text-emerald-700': { iconBg: 'bg-secondary/10', iconText: 'text-secondary',  dot: 'bg-secondary',  value: 'text-secondary',  progressBg: 'bg-secondary/15',  progressFill: 'bg-secondary' },
  'text-teal-700':    { iconBg: 'bg-secondary/10', iconText: 'text-secondary',  dot: 'bg-secondary',  value: 'text-secondary',  progressBg: 'bg-secondary/15',  progressFill: 'bg-secondary' },
  'text-rose-700':    { iconBg: 'bg-error/10',     iconText: 'text-error',      dot: 'bg-error',      value: 'text-error',      progressBg: 'bg-error/15',     progressFill: 'bg-error' },
  'text-red-700':     { iconBg: 'bg-error/10',     iconText: 'text-error',      dot: 'bg-error',      value: 'text-error',      progressBg: 'bg-error/15',     progressFill: 'bg-error' },
  'text-amber-700':   { iconBg: 'bg-tertiary/10',  iconText: 'text-tertiary',   dot: 'bg-tertiary',   value: 'text-tertiary',   progressBg: 'bg-tertiary/15',  progressFill: 'bg-tertiary' },
};
const DEFAULT_ACCENT = { iconBg: 'bg-primary/10', iconText: 'text-primary', dot: 'bg-primary', value: 'text-on-surface', progressBg: 'bg-primary/10', progressFill: 'bg-primary' };

function IconSlot({ icon, className }) {
  if (!icon) return <span className={`material-symbols-outlined ${className}`} aria-hidden>insights</span>;
  if (typeof icon === 'string') return <span className={`material-symbols-outlined ${className}`} aria-hidden>{icon}</span>;
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      {icon}
    </svg>
  );
}

export default function StatStrip({ items }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => {
        const accent = ACCENT[item.tone] ?? DEFAULT_ACCENT;
        const progress = typeof item.progress === 'number' ? Math.max(0, Math.min(100, item.progress)) : null;
        return (
          <div key={item.label} className="rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent.iconBg} ${accent.iconText}`}>
                <IconSlot icon={item.icon} className="text-[20px]" />
              </div>
              {item.badge ? (
                <span className={`rounded-md border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${accent.iconBg} border-current ${accent.iconText}`}>
                  {item.badge}
                </span>
              ) : item.pulse ? (
                <span className={`size-2 shrink-0 animate-pulse rounded-full ${accent.dot}`} aria-hidden />
              ) : item.meta ? (
                <span className="text-[10.5px] font-medium text-on-surface-variant">{item.meta}</span>
              ) : null}
            </div>

            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant">
                {item.label}
              </div>
              <div className={`num mt-1 flex items-baseline gap-2 text-[20px] font-semibold leading-none tabular-nums ${accent.value}`}>
                <span>{item.value}</span>
                {item.delta ? (
                  <span className={`text-xs font-bold ${item.delta.tone ?? 'text-on-surface-variant'}`}>{item.delta.label}</span>
                ) : null}
              </div>
            </div>

            {progress != null ? (
              <div className={`mt-2 h-1 w-full overflow-hidden rounded-full ${accent.progressBg}`}>
                <div className={`h-full rounded-full ${accent.progressFill} transition-all duration-500`} style={{ width: `${progress}%` }} />
              </div>
            ) : item.caption ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-on-surface-variant">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} aria-hidden />
                <span className="truncate">{item.caption}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
