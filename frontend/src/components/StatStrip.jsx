import React from 'react';

// Accent palette keyed off the same tone strings the pages already pass.
const ACCENT = {
  'text-emerald-700': {
    iconBg: 'bg-emerald-50 ring-1 ring-emerald-100',
    iconText: 'text-emerald-600',
    stripe: 'from-emerald-400/80 via-emerald-500 to-emerald-600',
    dot: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    progressBg: 'bg-emerald-100',
    progressFill: 'bg-emerald-500'
  },
  'text-red-700': {
    iconBg: 'bg-rose-50 ring-1 ring-rose-100',
    iconText: 'text-rose-600',
    stripe: 'from-rose-400/80 via-rose-500 to-rose-600',
    dot: 'bg-rose-500',
    badgeBg: 'bg-rose-50 text-rose-700 ring-rose-100',
    progressBg: 'bg-rose-100',
    progressFill: 'bg-rose-500'
  },
  'text-rose-700': {
    iconBg: 'bg-rose-50 ring-1 ring-rose-100',
    iconText: 'text-rose-600',
    stripe: 'from-rose-400/80 via-rose-500 to-rose-600',
    dot: 'bg-rose-500',
    badgeBg: 'bg-rose-50 text-rose-700 ring-rose-100',
    progressBg: 'bg-rose-100',
    progressFill: 'bg-rose-500'
  },
  'text-amber-700': {
    iconBg: 'bg-amber-50 ring-1 ring-amber-100',
    iconText: 'text-amber-600',
    stripe: 'from-amber-400/80 via-amber-500 to-amber-600',
    dot: 'bg-amber-500',
    badgeBg: 'bg-amber-50 text-amber-700 ring-amber-100',
    progressBg: 'bg-amber-100',
    progressFill: 'bg-amber-500'
  },
  'text-teal-700': {
    iconBg: 'bg-app-accentTint ring-1 ring-teal-100',
    iconText: 'text-app-accentDark',
    stripe: 'from-teal-400/80 via-teal-500 to-teal-600',
    dot: 'bg-teal-500',
    badgeBg: 'bg-teal-50 text-teal-700 ring-teal-100',
    progressBg: 'bg-teal-100',
    progressFill: 'bg-teal-500'
  }
};

const DEFAULT_ACCENT = ACCENT['text-teal-700'];

const defaultIconPath = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
  />
);

export default function StatStrip({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      {items.map((item) => {
        const accent = ACCENT[item.tone] ?? DEFAULT_ACCENT;
        const progress = typeof item.progress === 'number'
          ? Math.max(0, Math.min(100, item.progress))
          : null;
        return (
          <div
            key={item.label}
            className="group relative overflow-hidden rounded-2xl border border-app-border bg-white/90 shadow-card backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-app-borderStrong hover:shadow-cardHover"
          >
            <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent.stripe}`} />
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 sm:size-11 ${accent.iconBg} ${accent.iconText}`}>
                  <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                    {item.icon ?? defaultIconPath}
                  </svg>
                </span>
                {item.badge ? (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ${accent.badgeBg}`}>
                    {item.badge}
                  </span>
                ) : item.pulse ? (
                  <span className={`size-2 animate-pulse rounded-full ${accent.dot}`} />
                ) : item.meta ? (
                  <span className="text-[11px] font-medium text-app-subtle">{item.meta}</span>
                ) : null}
              </div>
              <h3 className="mt-3 truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-app-muted sm:text-[10.5px] sm:tracking-[0.18em]">
                {item.label}
              </h3>
              <div className={`num mt-1.5 flex items-baseline gap-2 text-[22px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[26px] ${item.tone ?? 'text-app-text'}`}>
                <span>{item.value}</span>
                {item.delta ? (
                  <span className={`text-xs font-bold ${item.delta.tone ?? 'text-app-muted'}`}>{item.delta.label}</span>
                ) : null}
              </div>
              {progress != null ? (
                <div className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${accent.progressBg}`}>
                  <div
                    className={`h-full rounded-full ${accent.progressFill} transition-all duration-500`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : item.caption ? (
                <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-app-muted">
                  <span className={`size-1.5 rounded-full ${accent.dot}`} />
                  {item.caption}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
