import React from 'react';

const accentGradient = {
  'text-emerald-700': 'from-emerald-400 to-emerald-500',
  'text-red-700': 'from-red-400 to-red-500',
  'text-amber-700': 'from-amber-400 to-amber-500',
  'text-teal-700': 'from-teal-400 to-teal-500',
};

export default function StatStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="overflow-hidden rounded-xl border border-app-border bg-white shadow-sm transition-all duration-200 hover:border-app-borderStrong hover:shadow-md">
          <div className={`h-1 bg-gradient-to-r ${accentGradient[item.tone] ?? 'from-teal-500 to-teal-600'}`} />
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-app-muted">{item.label}</div>
              {item.meta ? <div className="text-xs text-app-muted">{item.meta}</div> : null}
            </div>
            <div className={`mt-2 text-2xl font-extrabold leading-none tracking-tight ${item.tone ?? 'text-app-text'}`}>
              {item.value}
            </div>
            {item.caption ? <div className="mt-1.5 text-xs text-app-muted">{item.caption}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
