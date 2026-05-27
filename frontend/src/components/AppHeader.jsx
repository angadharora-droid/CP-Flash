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
  icon = 'dashboard',
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
    <header className="fixed top-0 z-50 flex h-14 w-full border-b border-outline-variant/60 bg-white/92 shadow-[0_1px_0_rgba(202,211,218,0.6),0_6px_22px_-16px_rgba(8,120,108,0.22)] backdrop-blur-xl md:h-16">
      {/* Brand block — anchors above the desktop sidebar. */}
      <div className="hidden h-full w-72 shrink-0 items-center gap-3 border-r border-outline-variant/55 bg-gradient-to-br from-white via-white to-surface-container-lowest px-4 md:flex">
        <button
          type="button"
          onClick={onHome}
          className="group relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-outline-variant/55 shadow-sm transition-all hover:ring-primary/55 hover:shadow-md active:scale-95"
          title="Back to dashboard"
          aria-label="Home"
        >
          <img src={cpLogo} alt="" className="h-full w-full object-contain" />
        </button>
        <button
          type="button"
          onClick={onHome}
          className="flex min-w-0 flex-col items-start leading-tight"
          aria-label="Home"
        >
          <span className="truncate text-[15px] font-extrabold tracking-tight text-on-surface">DailyFlash</span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-primary/85">
            <span className="size-1 rounded-full bg-primary/70" aria-hidden />
            Centre Point Group
          </span>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 md:px-5 lg:px-6 xl:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface sm:size-10 md:hidden"
            aria-label="Open menu"
          >
            <MIcon name="menu" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/18 via-primary/10 to-primary/5 text-primary ring-1 ring-primary/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] md:flex">
              <MIcon name={icon} filled className="text-[21px]" />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-base font-extrabold tracking-tight text-on-surface sm:text-lg md:text-xl">{title}</h1>
              <p className="mt-0.5 hidden items-center gap-1.5 truncate text-[11px] font-medium text-on-surface-variant/70 md:flex">
                <span
                  className={`size-1.5 rounded-full ${refreshing ? 'bg-primary animate-pulse' : 'bg-emerald-500'}`}
                  aria-hidden
                />
                {refreshing ? 'Refreshing data…' : 'Live • Auto-refresh every 2 min'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-2.5">
          <DateControl value={date} onChange={onDateChange} latest={latestDate} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh (R)"
            aria-label="Refresh data"
            className="hidden size-10 items-center justify-center rounded-lg text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-primary active:scale-90 disabled:opacity-40 md:flex"
          >
            <MIcon name="sync" rotating={refreshing} className={refreshing ? 'text-primary' : ''} />
          </button>
          <button
            type="button"
            onClick={onPreviewPdf}
            disabled={!canPreviewPdf}
            className="hidden h-10 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary/85 px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-on-primary shadow-primary transition-all hover:shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:hover:brightness-100 lg:flex"
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
