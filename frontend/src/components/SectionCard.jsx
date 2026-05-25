import React, { useState } from 'react';

const TONE = {
  teal:    { tile: 'bg-secondary text-on-secondary', accent: 'bg-secondary/10 text-secondary' },
  indigo:  { tile: 'bg-primary text-on-primary',     accent: 'bg-primary/10 text-primary' },
  amber:   { tile: 'bg-tertiary text-on-tertiary',   accent: 'bg-tertiary/10 text-tertiary' },
  emerald: { tile: 'bg-secondary text-on-secondary', accent: 'bg-secondary/10 text-secondary' },
  rose:    { tile: 'bg-error text-on-error',         accent: 'bg-error/10 text-error' },
  slate:   { tile: 'bg-surface-container-high text-on-surface-variant', accent: 'bg-surface-container-high text-on-surface-variant' }
};

// `icon` accepts a Material-Symbol name (string) or inline SVG path elements.
function IconSlot({ icon, className }) {
  if (typeof icon === 'string') {
    return <span className={`material-symbols-outlined ${className}`} aria-hidden>{icon}</span>;
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      {icon}
    </svg>
  );
}

export default function SectionCard({
  title,
  subtitle,
  icon,
  tone = 'indigo',
  children,
  defaultOpen = true,
  meta = null,
  actions = null,
  footer = null
}) {
  const [open, setOpen] = useState(defaultOpen);
  const palette = TONE[tone] ?? TONE.indigo;
  const hasIconHeader = !!icon || !!subtitle;

  return (
    <section className="glass-card mb-6 overflow-hidden">
      <div className={`flex w-full flex-wrap items-center justify-between gap-3 ${hasIconHeader ? 'border-b border-outline-variant/15 bg-surface-container-lowest/60 px-5 py-4 md:px-6 md:py-5' : 'px-5 py-4'}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left md:gap-4"
        >
          {hasIconHeader ? (
            <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-md ${palette.tile}`}>
              <IconSlot icon={icon ?? 'dataset'} className="text-[22px]" />
            </span>
          ) : (
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-md transition-all duration-200 ${
              open ? palette.accent : 'bg-surface-container-high text-on-surface-variant/60'
            }`}>
              <span className={`material-symbols-outlined text-[16px] transition-transform duration-200 ${open ? '' : '-rotate-90'}`}>expand_more</span>
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-bold tracking-tight text-on-surface ${hasIconHeader ? 'text-[16px] md:text-lg' : 'text-[14px]'}`}>
              {title}
              {meta && !hasIconHeader ? <span className="ml-3 text-sm font-medium text-on-surface-variant">{meta}</span> : null}
            </span>
            {hasIconHeader && (subtitle || meta) ? (
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-on-surface-variant">
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
            className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 transition-colors duration-200 hover:text-on-surface"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open ? (
        <div className="px-5 py-5 animate-fade-in-up md:px-6">
          {children}
        </div>
      ) : null}
      {open && footer ? (
        <div className="border-t border-outline-variant/15 bg-surface-container-lowest/50 px-5 py-3 md:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
