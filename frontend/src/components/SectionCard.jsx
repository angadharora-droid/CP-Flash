import React, { useState } from 'react';

const TONE = {
  teal:    { tile: 'bg-gradient-to-b from-app-accentSoft to-app-accent text-white shadow-pop', accent: 'bg-app-accentTint text-app-accentDark' },
  indigo:  { tile: 'bg-gradient-to-b from-indigo-400 to-indigo-600 text-white shadow-[0_14px_34px_-18px_rgba(99,102,241,0.55)]', accent: 'bg-indigo-50 text-indigo-700' },
  amber:   { tile: 'bg-gradient-to-b from-amber-400 to-amber-600 text-white shadow-[0_14px_34px_-18px_rgba(245,158,11,0.55)]', accent: 'bg-amber-50 text-amber-700' },
  emerald: { tile: 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_14px_34px_-18px_rgba(16,185,129,0.55)]', accent: 'bg-emerald-50 text-emerald-700' },
  rose:    { tile: 'bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-[0_14px_34px_-18px_rgba(244,63,94,0.55)]', accent: 'bg-rose-50 text-rose-700' },
  slate:   { tile: 'bg-slate-100 text-slate-700', accent: 'bg-slate-100 text-slate-600' }
};

export default function SectionCard({
  title,
  subtitle,
  icon,
  tone = 'teal',
  children,
  defaultOpen = true,
  meta = null,
  actions = null,
  footer = null
}) {
  const [open, setOpen] = useState(defaultOpen);
  const palette = TONE[tone] ?? TONE.teal;
  const hasIconHeader = !!icon || !!subtitle;

  return (
    <section className="overflow-hidden rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card transition-all duration-200 hover:border-app-borderStrong">
      <div className={`flex w-full flex-wrap items-center justify-between gap-3 transition-colors duration-150 hover:bg-app-panel/60 ${hasIconHeader ? 'border-b border-app-divider bg-app-panel/40 px-4 py-4 sm:px-6 sm:py-5' : 'px-4 py-3.5 sm:px-5 sm:py-4'}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-3.5"
        >
          {hasIconHeader ? (
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${palette.tile}`}>
              {icon ? (
                <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  {icon}
                </svg>
              ) : (
                <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
                </svg>
              )}
            </span>
          ) : (
            <span
              className={`relative flex size-5 shrink-0 items-center justify-center rounded-md transition-all duration-200 ${
                open ? palette.accent : 'bg-slate-100 text-slate-400'
              }`}
            >
              <svg className={`size-3 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-bold tracking-tight text-app-text ${hasIconHeader ? 'text-[15px] sm:text-base' : 'text-[13px]'}`}>
              {title}
              {meta && !hasIconHeader ? <span className="ml-3 text-sm font-medium text-app-muted">{meta}</span> : null}
            </span>
            {hasIconHeader && (subtitle || meta) ? (
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-app-muted">
                {subtitle ?? meta}
              </span>
            ) : null}
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
      {open && footer ? (
        <div className="border-t border-app-divider bg-app-panel/50 px-5 py-3 sm:px-7">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
