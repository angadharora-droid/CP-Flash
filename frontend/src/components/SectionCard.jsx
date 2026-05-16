import React, { useState } from 'react';

export default function SectionCard({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-app-border bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          <div className={`h-4 w-0.5 rounded-full transition-colors duration-200 ${open ? 'bg-teal-500' : 'bg-slate-300'}`} />
          <span className="text-sm font-bold tracking-tight text-app-text">{title}</span>
        </div>
        <svg
          className={`size-4 shrink-0 text-slate-400 transition-transform duration-250 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? <div className="border-t border-app-border/60 px-5 py-4">{children}</div> : null}
    </section>
  );
}
