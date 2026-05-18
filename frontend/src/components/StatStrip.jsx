import React from 'react';

const accentGradient = {
  'text-emerald-700': 'from-emerald-400/80 via-emerald-500 to-emerald-600',
  'text-red-700':     'from-rose-400/80 via-rose-500 to-rose-600',
  'text-rose-700':    'from-rose-400/80 via-rose-500 to-rose-600',
  'text-amber-700':   'from-amber-400/80 via-amber-500 to-amber-600',
  'text-teal-700':    'from-teal-400/80 via-teal-500 to-teal-600',
};

const dotStyle = {
  'text-emerald-700': 'bg-emerald-500',
  'text-red-700':     'bg-rose-500',
  'text-rose-700':    'bg-rose-500',
  'text-amber-700':   'bg-amber-500',
  'text-teal-700':    'bg-teal-500',
};

export default function StatStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const gradient = accentGradient[item.tone] ?? 'from-teal-400/80 via-teal-500 to-teal-600';
        const dot = dotStyle[item.tone] ?? 'bg-teal-500';
        return (
          <div
            key={item.label}
            className="group relative overflow-hidden rounded-2xl border border-app-border bg-white/85 backdrop-blur-xl shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cardHover hover:border-app-borderStrong"
          >
            <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${gradient}`} />
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`size-1.5 rounded-full ${dot}`} />
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-app-muted">{item.label}</div>
                </div>
                {item.meta ? <div className="text-[11px] font-medium text-app-subtle">{item.meta}</div> : null}
              </div>
              <div className={`num mt-2.5 text-[26px] font-extrabold leading-none tracking-tight ${item.tone ?? 'text-app-text'}`}>
                {item.value}
              </div>
              {item.caption ? <div className="mt-1.5 text-xs font-medium text-app-muted">{item.caption}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
