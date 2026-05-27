import React from 'react';
import { DateControl } from './DashboardUi';

const MIcon = ({ name, className = '', filled = false, rotating = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${rotating ? 'animate-spin' : ''} ${className}`} aria-hidden>
    {name}
  </span>
);

export default function AppHeader({
  title,
  date,
  latestDate,
  onDateChange,
  onOpenMenu,
  onRefresh,
  refreshing,
  onPreviewPdf,
  canPreviewPdf
}) {
  return (
    <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between gap-2 border-b border-outline-variant/70 bg-surface-container-lowest/88 px-3 shadow-sm backdrop-blur-xl sm:gap-3 sm:px-4 md:left-72 md:h-20 md:w-[calc(100%-18rem)] md:px-5 md:shadow-none lg:px-6 xl:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high sm:size-10 md:hidden"
          aria-label="Open menu"
        >
          <MIcon name="menu" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-extrabold tracking-normal text-on-surface sm:text-base md:text-lg lg:text-xl">{title}</h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
        <DateControl value={date} onChange={onDateChange} latest={latestDate} />
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            className="rounded-lg p-2.5 text-on-surface-variant transition-all hover:bg-surface-container-high active:scale-90 disabled:opacity-40"
          >
            {refreshing ? <MIcon name="sync" rotating /> : <MIcon name="sync" />}
          </button>
          <div className="mx-1 h-6 w-px bg-outline-variant/30" />
        </div>
        <button
          type="button"
          onClick={onPreviewPdf}
          disabled={!canPreviewPdf}
          className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-on-primary shadow-primary transition-all hover:bg-primary-container hover:shadow-lg active:scale-95 disabled:opacity-50 lg:flex"
        >
          <MIcon name="picture_as_pdf" className="text-[18px]" />
          Preview PDF
        </button>
        <button
          type="button"
          onClick={onPreviewPdf}
          disabled={!canPreviewPdf}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary active:scale-95 disabled:opacity-50 sm:size-10 lg:hidden"
          aria-label="Preview PDF"
        >
          <MIcon name="picture_as_pdf" />
        </button>
      </div>
    </header>
  );
}
