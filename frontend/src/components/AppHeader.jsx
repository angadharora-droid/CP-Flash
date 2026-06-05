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
    <header className="fixed top-0 z-50 flex h-14 w-full border-b border-outline-variant/50 bg-white/95 shadow-[0_1px_0_rgba(202,211,218,0.5),0_8px_24px_-12px_rgba(8,120,108,0.18)] backdrop-blur-xl md:h-15">
      {/* Brand block — anchors above the desktop sidebar. */}
      <div className="hidden h-full w-72 shrink-0 items-center gap-3 border-r border-outline-variant/55 bg-gradient-to-br from-white via-white to-surface-container-lowest px-4 md:flex">
        <button
          type="button"
          onClick={onToggleDesktopSidebar ?? onHome}
          className="group relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-outline-variant/55 shadow-sm transition-all hover:ring-primary/55 hover:shadow-md active:scale-95"
          title={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={desktopSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
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
          <div className="flex min-w-0 flex-1 items-center gap-3" />
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
