import React from 'react';
import { DateControl } from './DashboardUi';
import cpLogo from '../cp-logo.png';

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
  canPreviewPdf,
  onHome
}) {
  return (
    <header className="fixed top-0 z-50 flex h-14 w-full border-b border-outline-variant/70 bg-surface-container-lowest/88 shadow-sm backdrop-blur-xl md:h-16 md:shadow-none">
      <div className="hidden h-full w-72 shrink-0 items-center gap-3 border-r border-outline-variant/70 px-4 md:flex">
        <button
          type="button"
          onClick={onHome}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-surface-container-lowest p-1.5 text-on-primary ring-1 ring-outline-variant/70 transition-all hover:ring-primary/40"
          title="DailyFlash"
          aria-label="Home"
        >
          <img src={cpLogo} alt="" className="h-full w-full object-contain" />
        </button>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-base font-extrabold tracking-normal text-on-surface">DailyFlash</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-on-surface-variant/75">Centre Point</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 md:px-5 lg:px-6 xl:px-8">
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
      </div>
    </header>
  );
}
