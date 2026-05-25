import React from 'react';

// Map the tone hint from pages onto M3 palette buckets.
// Pages pass values like 'text-emerald-700', 'text-amber-700', 'text-rose-700' etc.
const ACCENT = {
  'text-emerald-700': { iconBg: 'bg-secondary/10', iconText: 'text-secondary',  dot: 'bg-secondary',  value: 'text-secondary',  badgeBg: 'bg-secondary/10 text-secondary border-secondary/20',  progressBg: 'bg-secondary/15',  progressFill: 'bg-secondary' },
  'text-teal-700':    { iconBg: 'bg-secondary/10', iconText: 'text-secondary',  dot: 'bg-secondary',  value: 'text-secondary',  badgeBg: 'bg-secondary/10 text-secondary border-secondary/20',  progressBg: 'bg-secondary/15',  progressFill: 'bg-secondary' },
  'text-rose-700':    { iconBg: 'bg-error/10',     iconText: 'text-error',      dot: 'bg-error',      value: 'text-error',      badgeBg: 'bg-error/10 text-error border-error/20',              progressBg: 'bg-error/15',     progressFill: 'bg-error' },
  'text-red-700':     { iconBg: 'bg-error/10',     iconText: 'text-error',      dot: 'bg-error',      value: 'text-error',      badgeBg: 'bg-error/10 text-error border-error/20',              progressBg: 'bg-error/15',     progressFill: 'bg-error' },
  'text-amber-700':   { iconBg: 'bg-tertiary/10',  iconText: 'text-tertiary',   dot: 'bg-tertiary',   value: 'text-tertiary',   badgeBg: 'bg-tertiary/10 text-tertiary border-tertiary/20',     progressBg: 'bg-tertiary/15',  progressFill: 'bg-tertiary' }
};

const DEFAULT_ACCENT = { iconBg: 'bg-primary/5', iconText: 'text-primary', dot: 'bg-primary', value: 'text-on-surface', badgeBg: 'bg-primary/10 text-primary border-primary/20', progressBg: 'bg-primary/10', progressFill: 'bg-primary' };

// `icon` may be: undefined | Material-Symbol name (string) | inline SVG <path/> elements.
function IconSlot({ icon, className }) {
  if (!icon) {
    return <span className={`material-symbols-outlined ${className}`} aria-hidden>insights</span>;
  }
  if (typeof icon === 'string') {
    return <span className={`material-symbols-outlined ${className}`} aria-hidden>{icon}</span>;
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      {icon}
    </svg>
  );
}

export default function StatStrip({ items }) {
  return (
    <div className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const accent = ACCENT[item.tone] ?? DEFAULT_ACCENT;
        const progress = typeof item.progress === 'number'
          ? Math.max(0, Math.min(100, item.progress))
          : null;
        return (
          <div
            key={item.label}
            className="glass-card group flex flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accent.iconBg} ${accent.iconText} transition-transform duration-200 group-hover:scale-105`}>
                <IconSlot icon={item.icon} className="text-[23px]" />
              </div>
              {item.badge ? (
                <span className={`rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${accent.badgeBg}`}>
                  {item.badge}
                </span>
              ) : item.pulse ? (
                <span className={`size-2.5 animate-pulse rounded-full ${accent.dot}`} />
              ) : item.meta ? (
                <span className="text-[11px] font-medium text-on-surface-variant">{item.meta}</span>
              ) : null}
            </div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              {item.label}
            </h3>
            <div className={`num mt-1.5 flex items-baseline gap-2 text-[28px] font-bold leading-none tracking-normal tabular-nums sm:text-[30px] ${accent.value}`}>
              <span>{item.value}</span>
              {item.delta ? (
                <span className={`text-xs font-bold ${item.delta.tone ?? 'text-on-surface-variant'}`}>{item.delta.label}</span>
              ) : null}
            </div>
            {progress != null ? (
              <div className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${accent.progressBg}`}>
                <div
                  className={`h-full rounded-full ${accent.progressFill} transition-all duration-500`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : item.caption ? (
              <div className="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-on-surface-variant">
                <span className={`size-1.5 rounded-full ${accent.dot}`} />
                {item.caption}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
