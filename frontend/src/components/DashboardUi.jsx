import React, { useEffect, useState } from 'react';
import { loginWithPin } from '../lib/api';
import { money } from '../lib/calculations';
import { NAV_GROUPS } from '../lib/navigation';
import KpiRow from './KpiRow';
import cpLogo from '../cp-logo.png';

const NOW = new Date().toISOString().slice(0, 10);

export const statusTone = {
  Imported: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-100',
  Entered: 'border-teal-200/80 bg-teal-50/80 text-teal-700 ring-1 ring-teal-100',
  Pending: 'border-amber-200/80 bg-amber-50/80 text-amber-700 ring-1 ring-amber-100'
};

// Shared SVG path snippets used as `icon` for SectionCard / metric tiles.
export const SECTION_ICONS = {
  hotel:      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V8.25c0-.621.504-1.125 1.125-1.125H6.75V4.5c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125v2.625h2.625c.621 0 1.125.504 1.125 1.125V21M3 21h18M9 21V12h6v9" />,
  restaurant: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v6.75a3 3 0 003 3v8.25m0-18v6.75a3 3 0 01-3 3m6-9.75v18M17.25 3v18" />,
  factory:    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V11.25l6 3.75v-3.75l6 3.75V8.25l6 3.75V21H3z" />,
  bank:       <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 4.5M3 7.5h18M5.25 10.5v7.5M9.75 10.5v7.5M14.25 10.5v7.5M18.75 10.5v7.5M3 21h18" />,
  banquet:    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M4.5 7.5v9A2.25 2.25 0 006.75 18.75h10.5A2.25 2.25 0 0019.5 16.5v-9M9 11.25h6" />,
  topItems:   <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />,
  config:     <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />,
  kpi:        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  sku:        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />,
  spark:      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />,
  hub:        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM12 15a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM4.5 12a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM15 12a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM9 12h6m-3-3v-1.5m0 9V15" />
};

function fmtDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function getFreshness(importedAt, hasData, fileDate) {
  if (!importedAt && !hasData) return { label: 'Pending', cls: 'border-slate-200 bg-slate-50/80 text-slate-500 ring-1 ring-slate-100' };
  const label = fmtDate(fileDate);
  const diff = Math.round((new Date(NOW) - new Date(fileDate)) / 86400000);
  if (importedAt) {
    if (diff === 0) return { label, cls: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-100' };
    if (diff === 1) return { label, cls: 'border-amber-200/80 bg-amber-50/80 text-amber-700 ring-1 ring-amber-100' };
    return { label, cls: 'border-rose-200/80 bg-rose-50/80 text-rose-700 ring-1 ring-rose-100' };
  }
  if (diff === 0) return { label, cls: 'border-teal-200/80 bg-teal-50/80 text-teal-700 ring-1 ring-teal-100' };
  if (diff === 1) return { label, cls: 'border-amber-200/80 bg-amber-50/80 text-amber-700 ring-1 ring-amber-100' };
  return { label, cls: 'border-slate-200 bg-slate-50/80 text-slate-500 ring-1 ring-slate-100' };
}

export function hasKpiData(rows) {
  return (rows ?? []).some((r) => String(r.actual ?? '').trim() !== '');
}

export function FreshnessBadge({ label, cls }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

export function ReportValue({ value, className = '', numeric = false }) {
  const empty = value === '' || value == null;
  return (
    <span className={`num block min-w-24 rounded-lg px-2.5 py-1.5 text-sm ${numeric ? 'text-right tabular-nums' : ''} ${empty ? 'text-slate-300' : 'bg-app-panel/80 text-app-text'} ${className}`}>
      {empty ? '—' : value}
    </span>
  );
}

function parseTopItem(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^(.*) - ([\d,.]+) \(([\d,.]+) qty\)$/);
  if (!match) return { name: text, sales: '', qty: '' };
  return {
    name: match[1],
    sales: match[2],
    qty: match[3]
  };
}

export function TopItemsList({ items = [] }) {
  const parsed = items.map(parseTopItem).filter((item) => item.name);
  if (!parsed.length) {
    return (
      <div className="rounded-xl border border-dashed border-app-border bg-app-panel/60 px-4 py-5 text-sm font-medium text-app-muted">
        Top items pending
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-app-border bg-white/90 shadow-sm ring-1 ring-white/70">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_82px_52px] gap-2 border-b border-app-divider bg-app-panel/80 px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-app-muted sm:grid-cols-[64px_minmax(0,1fr)_120px_88px] sm:gap-3 sm:px-4 sm:text-xs">
        <span>Rank</span>
        <span>Item</span>
        <span className="text-right">Revenue</span>
        <span className="text-right">Qty</span>
      </div>
      {parsed.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="grid grid-cols-[40px_minmax(0,1fr)_82px_52px] items-center gap-2 border-b border-app-divider px-3 py-2.5 last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_120px_88px] sm:gap-3 sm:px-4 sm:py-3"
        >
          <span className={`flex size-7 items-center justify-center rounded-lg text-[13px] font-extrabold tabular-nums sm:size-8 sm:text-sm ${
            index === 0 ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' :
              index === 1 ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' :
                'bg-teal-50 text-teal-700 ring-1 ring-teal-100'
          }`}>
            {index + 1}
          </span>
          <span className="min-w-0 truncate text-[13px] font-bold text-app-text sm:text-sm">{item.name}</span>
          <span className="num text-right text-[13px] font-extrabold tabular-nums text-emerald-700 sm:text-sm">{item.sales ? money(item.sales) : '-'}</span>
          <span className="num text-right text-[13px] font-bold tabular-nums text-app-muted sm:text-sm">{item.qty || '-'}</span>
        </div>
      ))}
    </div>
  );
}

const SECTION_ACCENTS = {
  Overview: {
    stripe: 'bg-gradient-to-b from-teal-400 to-teal-600',
    glow: 'radial-gradient(620px 200px at 0% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0) 70%), radial-gradient(540px 220px at 100% 100%, rgba(99,102,241,0.07) 0%, rgba(99,102,241,0) 70%)'
  },
  'Unit Data': {
    stripe: 'bg-gradient-to-b from-indigo-400 to-indigo-600',
    glow: 'radial-gradient(620px 200px at 0% 0%, rgba(99,102,241,0.13) 0%, rgba(99,102,241,0) 70%), radial-gradient(540px 220px at 100% 100%, rgba(20,184,166,0.06) 0%, rgba(20,184,166,0) 70%)'
  },
  'Close of Day': {
    stripe: 'bg-gradient-to-b from-amber-400 to-amber-600',
    glow: 'radial-gradient(620px 200px at 0% 0%, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0) 70%), radial-gradient(540px 220px at 100% 100%, rgba(20,184,166,0.06) 0%, rgba(20,184,166,0) 70%)'
  }
};

function getSectionAccent(activeKey) {
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.key === activeKey));
  return SECTION_ACCENTS[group?.label] ?? SECTION_ACCENTS.Overview;
}

export function PageTitle({ title, subtitle, badge, actions, activeKey }) {
  const accent = getSectionAccent(activeKey);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-app-border bg-white/85 backdrop-blur-xl shadow-card animate-fade-in-up">
      <div className="absolute inset-0 opacity-[0.6] pointer-events-none" style={{ background: accent.glow }} />
      <div className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${accent.stripe}`} />
      <div className="relative flex flex-wrap items-start justify-between gap-3 px-4 py-5 sm:gap-4 sm:px-7 sm:py-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-lg font-bold tracking-tight text-app-text text-balance sm:text-2xl">{title}</h1>
            {badge ? <FreshnessBadge {...badge} /> : null}
          </div>
          {subtitle ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-app-muted sm:text-sm">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function KpiTable({ rows }) {
  const headers = ['KPI Name', 'AOP Target', 'Today Actual', 'MTD', 'YTD', 'Status'];
  return (
    <div className="scroll-touch overflow-auto rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-b from-slate-50/90 to-white text-left">
            {headers.map((h, i) => (
              <th key={h} className={`whitespace-nowrap border-b border-app-divider px-3 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-app-subtle sm:px-4 sm:py-3.5 ${i === 0 ? 'sticky left-0 z-[2] bg-gradient-to-b from-slate-50 to-white' : ''} ${i === 2 ? 'bg-app-accentTint/40 text-app-accentDark' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((kpi) => <KpiRow key={kpi.id} kpi={kpi} />)}
        </tbody>
      </table>
    </div>
  );
}

export function SheetLink({ url, label = 'View Source Sheet' }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-app-border bg-white/85 px-3.5 py-2 text-xs font-bold text-app-text shadow-card backdrop-blur-xl transition-all duration-200 hover:-translate-y-px hover:border-app-borderStrong hover:bg-white hover:shadow-cardHover"
    >
      <span className="flex size-5 items-center justify-center rounded-md bg-app-accentTint text-app-accentDark transition-colors duration-200 group-hover:bg-app-accent group-hover:text-white">
        <svg className="size-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </span>
      {label}
    </a>
  );
}

export function googleSheetPreviewUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return url;
    const gid = parsed.searchParams.get('gid');
    const previewUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/preview`);
    previewUrl.searchParams.set('rm', 'minimal');
    if (gid) previewUrl.searchParams.set('gid', gid);
    return previewUrl.toString();
  } catch {
    return url;
  }
}

export function ActionButton({ children, onClick, type = 'button', variant = 'secondary', disabled = false, className = '' }) {
  const cls = variant === 'primary'
    ? 'border-app-accentDark bg-gradient-to-b from-app-accentSoft to-app-accent text-white shadow-pop hover:from-teal-400 hover:to-teal-600 active:from-app-accent active:to-app-accentDark'
    : 'border-app-border bg-white/85 backdrop-blur-xl text-app-text shadow-card hover:border-app-borderStrong hover:bg-white hover:shadow-cardHover active:bg-app-panel';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

export function SegmentedControl({ items, value, onChange }) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-app-border bg-white/70 p-1 shadow-card backdrop-blur-xl">
      {items.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ${value === key ? 'bg-gradient-to-b from-white to-app-panel text-app-accentDark shadow-sm ring-1 ring-app-border' : 'text-app-muted hover:bg-app-panel/60 hover:text-app-text'}`}
        >
          <span>{label}</span>
          {badge ? <FreshnessBadge {...badge} /> : null}
        </button>
      ))}
    </div>
  );
}

function formatDisplayDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const ddd = d.toLocaleDateString('en-IN', { weekday: 'short' });
  return { full: `${dd}/${mm}/${yyyy}`, day: ddd };
}

function shiftIso(iso, delta) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function DateControl({ value, onChange, latest }) {
  const inputRef = React.useRef(null);
  const isAfter = value > latest;
  const display = formatDisplayDate(value);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch (e) { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="inline-flex items-stretch gap-1 rounded-xl border border-app-border bg-white/85 p-1 shadow-card backdrop-blur-xl">
      <button
        type="button"
        onClick={() => onChange(shiftIso(value, -1))}
        title="Previous day (←)"
        aria-label="Previous day"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition-all duration-150 hover:bg-app-panel hover:text-app-text active:scale-95"
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        type="button"
        onClick={openPicker}
        title="Pick date"
        className="num group flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-all duration-150 hover:bg-app-panel"
      >
        <svg className="size-4 shrink-0 text-app-accentDark" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className="text-sm font-bold tracking-tight text-app-text">{display.full}</span>
        <span className="rounded-md bg-app-panel px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-app-muted">{display.day}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftIso(value, 1))}
        disabled={isAfter}
        title="Next day (→)"
        aria-label="Next day"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-app-muted transition-all duration-150 hover:bg-app-panel hover:text-app-text active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-app-muted"
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={latest}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}

function formatLockoutRemaining(lockedUntil) {
  if (!lockedUntil) return '';
  const remainingMs = Math.max(0, new Date(lockedUntil).getTime() - Date.now());
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} hr ${minutes} min`;
  if (hours) return `${hours} hr`;
  return `${Math.max(1, minutes)} min`;
}

export function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(false);
  const [lockedUntil, setLockedUntil] = useState('');
  const [lockoutRemaining, setLockoutRemaining] = useState('');
  const isLocked = lockedUntil && Date.now() < new Date(lockedUntil).getTime();

  useEffect(() => {
    if (!lockedUntil) {
      setLockoutRemaining('');
      return undefined;
    }

    const updateRemaining = () => {
      if (Date.now() >= new Date(lockedUntil).getTime()) {
        setLockedUntil('');
        setStatus('');
        setLockoutRemaining('');
        return;
      }
      setLockoutRemaining(formatLockoutRemaining(lockedUntil));
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 30000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const submit = async (event) => {
    event.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setStatus('');
    try {
      const token = await loginWithPin(pin);
      sessionStorage.setItem('dailyflashToken', token);
      onUnlock(token);
    } catch (err) {
      setStatus(err.message);
      if (err.lockedUntil) setLockedUntil(err.lockedUntil);
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 520);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      {/* Aurora background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-teal-300/30 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-indigo-300/25 blur-[100px]" />
        <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/20 blur-[120px]" />
      </div>
      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(rgba(15,23,42,0.55) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />

      <form onSubmit={submit} className="relative z-10 w-full max-w-sm animate-fade-in-up">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center gap-3.5 text-center">
          <div className="relative">
            <div
              className="flex items-center justify-center rounded-2xl bg-white/85 p-2 ring-1 ring-white/70"
              style={{ width: '4.5rem', height: '4.5rem', boxShadow: '0 24px 60px -10px rgba(183, 0, 114, 0.38)' }}
            >
              <img src={cpLogo} alt="Centre Point logo" className="h-full w-full object-contain" />
            </div>
            <div className="absolute -inset-3 rounded-[24px] bg-[#b70072]/20 blur-2xl -z-10" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-app-accentDark">DailyFlash</div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-app-text">CP Flash Report</h1>
            <p className="mt-1 text-sm text-app-muted">Centre Point Hospitality Group</p>
          </div>
        </div>

        {/* Glass auth card */}
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-glass backdrop-blur-2xl">
          <div className="border-b border-app-divider px-6 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-app-muted">Secure Access</p>
          </div>
          <div className="px-7 py-8">
            {/* PIN dot indicator (click to focus the hidden input) */}
            <label
              className={`relative mx-auto flex w-full max-w-[260px] cursor-text items-center justify-center gap-3.5 rounded-2xl border bg-white/80 py-4 transition-all duration-200 ${
                shake
                  ? 'border-rose-300 shadow-[0_0_0_4px_rgba(244,63,94,0.18)] animate-shake'
                  : focused
                    ? 'border-app-accent/60 shadow-[0_0_0_4px_rgba(13,148,136,0.15)]'
                    : 'border-app-border shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]'
              }`}
            >
              {Array.from({ length: 6 }, (_, i) => {
                const filled = i < pin.length;
                const current = i === pin.length && focused;
                const dotBase = shake
                  ? 'scale-110 bg-rose-500'
                  : filled
                    ? 'scale-110 bg-app-accent'
                    : 'bg-slate-200';
                const dotShadow = shake
                  ? { boxShadow: '0 0 0 4px rgba(244, 63, 94, 0.20)' }
                  : filled
                    ? { boxShadow: '0 0 0 4px rgba(13, 148, 136, 0.18)' }
                    : undefined;
                return (
                  <span
                    key={i}
                    className={`relative flex h-3 w-3 items-center justify-center rounded-full transition-all duration-300 ${dotBase}`}
                    style={dotShadow}
                  >
                    {current && !shake ? (
                      <span className="absolute inset-0 -m-1 animate-ping rounded-full bg-app-accent/40" />
                    ) : null}
                  </span>
                );
              })}
              <input
                autoFocus
                inputMode="numeric"
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(event) => {
                  if (!isLocked) setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label="PIN"
                disabled={isLocked}
                className="absolute inset-0 w-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none"
              />
            </label>

            {status ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span>
                  {status}
                  {isLocked && lockoutRemaining ? ` Try again in ${lockoutRemaining}.` : ''}
                </span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || isLocked || pin.length < 4}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-app-accentSoft to-app-accent px-4 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:from-teal-400 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ boxShadow: '0 14px 36px -10px rgba(13, 148, 136, 0.55)' }}
            >
              {loading ? (
                <>
                  <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying...
                </>
              ) : isLocked ? `Blocked ${lockoutRemaining || ''}` : 'Unlock Dashboard'}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-app-muted">Contact your administrator if you need access.</p>
      </form>
    </main>
  );
}
