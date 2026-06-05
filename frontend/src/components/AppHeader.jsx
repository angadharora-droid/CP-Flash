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
  onHome,
  onToggleDesktopSidebar,
  desktopSidebarOpen = false
}) {
  return (
    <header className="fixed top-0 z-50 flex h-14 w-full items-center border-b border-slate-200/80 bg-white shadow-[0_1px_0_rgba(0,0,0,0.05),0_4px_20px_-6px_rgba(0,0,0,0.07)] md:h-[58px]">

      {/* Brand block — fixed width matches desktop sidebar */}
      <div className="hidden h-full w-72 shrink-0 items-center gap-3 border-r border-slate-100 px-5 md:flex">
        <button
          type="button"
          onClick={onToggleDesktopSidebar ?? onHome}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-slate-200 shadow-sm transition-all hover:ring-primary/50 hover:shadow-md active:scale-95"
          title={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <img src={cpLogo} alt="" className="h-full w-full object-contain" />
        </button>
        <button
          type="button"
          onClick={onHome}
          className="flex min-w-0 flex-col items-start"
          aria-label="Home"
        >
          <span className="truncate text-[15px] font-extrabold tracking-tight text-slate-900">DailyFlash</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80">
            <span className="size-1 rounded-full bg-primary/60" aria-hidden />
            Centre Point Group
          </span>
        </button>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="ml-3 flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 md:hidden"
        aria-label="Open menu"
      >
        <MIcon name="menu" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-1 pr-3 sm:gap-1.5 sm:pr-4 md:gap-2 md:pr-5">
        <DateControl value={date} onChange={onDateChange} latest={latestDate} />

        <div className="mx-1 hidden h-6 w-px bg-slate-200 md:block" />

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh (R)"
          aria-label="Refresh data"
          className="hidden size-9 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-primary active:scale-90 disabled:opacity-40 md:flex"
        >
          <MIcon name="sync" rotating={refreshing} className={refreshing ? 'text-primary' : ''} />
        </button>

        <button
          type="button"
          onClick={onPreviewPdf}
          disabled={!canPreviewPdf}
          className="hidden h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[11.5px] font-bold uppercase tracking-[0.06em] text-white shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 lg:flex"
        >
          <MIcon name="picture_as_pdf" className="text-[17px]" />
          Preview PDF
        </button>
        <button
          type="button"
          onClick={onPreviewPdf}
          disabled={!canPreviewPdf}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm active:scale-95 disabled:opacity-50 lg:hidden"
          aria-label="Preview PDF"
        >
          <MIcon name="picture_as_pdf" />
        </button>
      </div>
    </header>
  );
}
