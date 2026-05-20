import React, { useState } from 'react';

export default function SectionCard({ title, children, defaultOpen = true, meta = null, actions = null }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card transition-all duration-200 hover:border-app-borderStrong">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-app-panel/60 sm:px-5 sm:py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`relative flex size-5 items-center justify-center rounded-md transition-all duration-200 ${
              open ? 'bg-app-accentTint text-app-accentDark' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <svg className={`size-3 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="text-[13px] font-bold tracking-tight text-app-text">{title}</span>
            {meta ? <span className="ml-3 text-sm font-medium text-app-muted">{meta}</span> : null}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-semibold uppercase tracking-wider text-app-subtle transition-colors duration-200 hover:text-app-text"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-app-divider px-3 py-4 animate-fade-in-up sm:px-5 sm:py-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
