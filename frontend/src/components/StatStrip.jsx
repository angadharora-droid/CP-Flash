import React from 'react';

const accentBar = {
  'text-emerald-700': 'bg-emerald-500',
  'text-red-700': 'bg-red-500',
  'text-amber-700': 'bg-amber-500',
  'text-teal-700': 'bg-teal-500',
};

export default function StatStrip({ items }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="overflow-hidden rounded-xl border border-app-border bg-white shadow-sm transition-shadow hover:shadow-md">
          <div className={`h-1 ${accentBar[item.tone] ?? 'bg-teal-600'}`} />
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-app-muted">{item.label}</div>
              {item.meta ? <div className="text-xs text-app-muted">{item.meta}</div> : null}
            </div>
            <div className={`mt-1.5 text-2xl font-extrabold leading-none tracking-tight ${item.tone ?? 'text-app-text'}`}>
              {item.value}
            </div>
            {item.caption ? <div className="mt-1 text-xs text-app-muted">{item.caption}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
