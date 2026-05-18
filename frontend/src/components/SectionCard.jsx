import React, { useState } from 'react';

export default function SectionCard({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card transition-all duration-200 hover:border-app-borderStrong">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-app-panel/60"
      >
        <div className="flex items-center gap-3">
          <span
            className={`relative flex size-5 items-center justify-center rounded-md transition-all duration-200 ${
              open ? 'bg-app-accentTint text-app-accentDark' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <svg className={`size-3 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="text-[13px] font-bold tracking-tight text-app-text">{title}</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-app-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-app-divider px-5 py-5 animate-fade-in-up">
          {children}
        </div>
      ) : null}
    </section>
  );
}
