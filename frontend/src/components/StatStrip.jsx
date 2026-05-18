import React from 'react';

const accentGradient = {
  'text-emerald-700': 'from-emerald-400/80 via-emerald-500 to-emerald-600',
  'text-red-700':     'from-rose-400/80 via-rose-500 to-rose-600',
  'text-rose-700':    'from-rose-400/80 via-rose-500 to-rose-600',
  'text-amber-700':   'from-amber-400/80 via-amber-500 to-amber-600',
  'text-teal-700':    'from-teal-400/80 via-teal-500 to-teal-600',
};

const haloBg = {
  'text-emerald-700': 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  'text-red-700':     'bg-rose-50 text-rose-600 ring-rose-100',
  'text-rose-700':    'bg-rose-50 text-rose-600 ring-rose-100',
  'text-amber-700':   'bg-amber-50 text-amber-600 ring-amber-100',
  'text-teal-700':    'bg-teal-50 text-teal-600 ring-teal-100',
};

const dotStyle = {
  'text-emerald-700': 'bg-emerald-500',
  'text-red-700':     'bg-rose-500',
  'text-rose-700':    'bg-rose-500',
  'text-amber-700':   'bg-amber-500',
  'text-teal-700':    'bg-teal-500',
};

const defaultIconPath = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
  />
);

export default function StatStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const gradient = accentGradient[item.tone] ?? 'from-teal-400/80 via-teal-500 to-teal-600';
        const dot = dotStyle[item.tone] ?? 'bg-teal-500';
        const halo = haloBg[item.tone] ?? 'bg-teal-50 text-teal-600 ring-teal-100';
        return (
          <div
            key={item.label}
            className="group relative overflow-hidden rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cardHover hover:border-app-borderStrong"
          >
            <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${gradient}`} />
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex size-6 items-center justify-center rounded-lg ring-1 ${halo}`}>
                    <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      {item.icon ?? defaultIconPath}
                    </svg>
                  </span>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-app-muted">{item.label}</div>
                </div>
                {item.meta ? <div className="text-[11px] font-medium text-app-subtle">{item.meta}</div> : null}
              </div>
              <div className={`num mt-3 flex items-baseline gap-1.5 text-[26px] font-extrabold leading-none tracking-tight ${item.tone ?? 'text-app-text'}`}>
                <span>{item.value}</span>
                {item.delta ? (
                  <span className={`text-xs font-bold ${item.delta.tone ?? 'text-app-muted'}`}>{item.delta.label}</span>
                ) : null}
              </div>
              {item.caption ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-app-muted">
                  <span className={`size-1.5 rounded-full ${dot}`} />
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
