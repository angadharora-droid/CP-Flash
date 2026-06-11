import React, { useState } from 'react';

const TONE = {
  teal:    { iconBg: 'bg-teal-100',    iconText: 'text-teal-700' },
  amber:   { iconBg: 'bg-amber-100',   iconText: 'text-amber-700' },
  rose:    { iconBg: 'bg-rose-100',    iconText: 'text-rose-700' },
  indigo:  { iconBg: 'bg-indigo-100',  iconText: 'text-indigo-700' },
  emerald: { iconBg: 'bg-emerald-100', iconText: 'text-emerald-700' },
  slate:   { iconBg: 'bg-surface-container-high', iconText: 'text-on-surface-variant' },
};
const DEFAULT_TONE = { iconBg: 'bg-surface-container', iconText: 'text-on-surface-variant' };

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
  const palette = TONE[tone] ?? DEFAULT_TONE;

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((v) => !v)}
        className="flex cursor-pointer select-none items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon != null && (
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${palette.iconBg} ${palette.iconText}`}>
              <IconSlot icon={icon} className="text-[16px]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-on-surface">{title}</div>
            {(subtitle || meta) ? (
              <div className="mt-0.5 truncate text-[11px] text-on-surface-variant">{subtitle ?? meta}</div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Keep clicks on header actions (toggles, save buttons) from collapsing the card. */}
          {actions ? (
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {actions}
            </span>
          ) : null}
          <span
            className={`material-symbols-outlined text-[18px] text-on-surface-variant transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            expand_more
          </span>
        </div>
      </div>

      {open ? (
        <div className="px-4 py-4 animate-fade-in">
          {children}
        </div>
      ) : null}

      {open && footer ? (
        <div className="border-t border-outline-variant/30 bg-surface-container-low px-4 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
