import React, { useEffect, useState } from 'react';
import { loginWithPin } from '../lib/api';
import { money } from '../lib/calculations';
import KpiRow from './KpiRow';
import cpLogo from '../cp-logo.png';

const NOW = new Date().toISOString().slice(0, 10);

// Status tone classes used by SourceControlPage and friends. Pill-shaped pills with M3 hues.
export const statusTone = {
  Imported: 'border-secondary/20 bg-secondary/10 text-secondary',
  Entered:  'border-secondary/20 bg-secondary-container/30 text-on-secondary-container',
  Pending:  'border-tertiary/30 bg-tertiary-container/60 text-on-tertiary-container'
};

// Material Symbol names by section, used by SectionCard usage sites and the source page.
export const SECTION_ICONS = {
  hotel: 'hotel',
  restaurant: 'restaurant',
  factory: 'factory',
  bank: 'account_balance',
  banquet: 'celebration',
  topItems: 'star',
  config: 'tune',
  kpi: 'monitoring',
  sku: 'inventory_2',
  spark: 'auto_awesome',
  hub: 'hub'
};

// ---- Tiny Material-Symbol helper ----
const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>
    {name}
  </span>
);

function fmtDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function getFreshness(importedAt, hasData, fileDate) {
  if (!importedAt && !hasData) return { label: 'Pending', cls: 'border-outline-variant/40 bg-surface-container-high/40 text-on-surface-variant' };
  const label = fmtDate(fileDate);
  const diff = Math.round((new Date(NOW) - new Date(fileDate)) / 86400000);
  if (importedAt) {
    if (diff === 0) return { label, cls: 'border-secondary/20 bg-secondary/10 text-secondary' };
    if (diff === 1) return { label, cls: 'border-tertiary/20 bg-tertiary/10 text-tertiary' };
    return { label, cls: 'border-error/20 bg-error/10 text-error' };
  }
  if (diff === 0) return { label, cls: 'border-secondary/20 bg-secondary-container/30 text-on-secondary-container' };
  if (diff === 1) return { label, cls: 'border-tertiary/20 bg-tertiary/10 text-tertiary' };
  return { label, cls: 'border-outline-variant/40 bg-surface-container-high/40 text-on-surface-variant' };
}

export function hasKpiData(rows) {
  return (rows ?? []).some((r) => String(r.actual ?? '').trim() !== '');
}

export function FreshnessBadge({ label, cls, className = '' }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${cls} ${className}`}>
      {label}
    </span>
  );
}

export function BrandLoader({ className = '', label = '', size = 64 }) {
  const loaderSize = `clamp(${Math.max(18, Math.round(size * 0.78))}px, ${Math.round(size / 16)}rem, ${size}px)`;
  return (
    <div className={`inline-flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className="brand-loader-mark shrink-0" style={{ '--brand-loader-size': loaderSize }}>
        <div className="brand-loader-petals-frame">
          <img src={cpLogo} alt="" className="brand-loader-layer brand-loader-petals" />
        </div>
        <img src={cpLogo} alt="" className="brand-loader-layer brand-loader-center" />
      </div>
      {label ? <p className="text-sm font-semibold text-on-surface-variant">{label}</p> : null}
    </div>
  );
}

export function ReportValue({ value, className = '', numeric = false }) {
  const empty = value === '' || value == null;
  return (
    <span className={`num block min-w-24 rounded-md px-2.5 py-1.5 text-sm ${numeric ? 'text-right tabular-nums' : ''} ${empty ? 'text-on-surface-variant/35' : 'bg-surface-container-low text-on-surface ring-1 ring-outline-variant/35'} ${className}`}>
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
      <div className="rounded-lg border border-dashed border-outline-variant/70 bg-surface-container-low px-4 py-5 text-sm font-medium text-on-surface-variant">
        Top items pending
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_82px_52px] gap-2 border-b border-outline-variant/60 bg-surface-container px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant sm:grid-cols-[64px_minmax(0,1fr)_120px_88px] sm:gap-3 sm:px-4">
        <span>Rank</span>
        <span>Item</span>
        <span className="text-right">Revenue</span>
        <span className="text-right">Qty</span>
      </div>
      {parsed.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="grid grid-cols-[40px_minmax(0,1fr)_82px_52px] items-center gap-2 border-b border-outline-variant/15 px-3 py-2.5 last:border-b-0 sm:grid-cols-[64px_minmax(0,1fr)_120px_88px] sm:gap-3 sm:px-4 sm:py-3"
        >
          <span className={`flex size-7 items-center justify-center rounded-md text-[13px] font-bold tabular-nums sm:size-8 sm:text-sm ${
            index === 0 ? 'bg-tertiary/15 text-tertiary' :
              index === 1 ? 'bg-surface-container-high text-on-surface-variant' :
                'bg-secondary-container/30 text-on-secondary-container'
          }`}>
            {index + 1}
          </span>
          <span className="min-w-0 truncate text-[13px] font-bold text-on-surface sm:text-sm">{item.name}</span>
          <span className="num text-right text-[13px] font-bold tabular-nums text-secondary sm:text-sm">{item.sales ? money(item.sales) : '-'}</span>
          <span className="num text-right text-[13px] font-bold tabular-nums text-on-surface-variant sm:text-sm">{item.qty || '-'}</span>
        </div>
      ))}
    </div>
  );
}

// ---- PageTitle: compact page heading + action slot. ----
export function PageTitle({ title, subtitle, badge, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-outline-variant/70 pb-5 md:mb-7 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[24px] font-extrabold leading-tight tracking-normal text-on-surface md:text-[30px]">
            {title}
          </h2>
          {badge ? <FreshnessBadge {...badge} /> : null}
        </div>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-sm text-on-surface-variant md:text-[15px]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function KpiTable({ rows }) {
  const headers = ['KPI Name', 'AOP Target', 'Today Actual', 'MTD', 'YTD', 'Status'];
  return (
    <div className="scroll-touch glass-card max-w-full overflow-auto">
      <table className="min-w-[640px] text-sm md:min-w-full">
        <thead>
          <tr className="bg-surface-container text-left">
            {headers.map((h, i) => (
              <th key={h} className={`whitespace-nowrap border-b border-outline-variant/70 px-2.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-on-surface-variant sm:px-4 sm:py-3.5 ${i === 0 ? 'sticky left-0 z-[2] bg-surface-container' : ''} ${i === 2 ? 'bg-primary/10 text-primary' : ''}`}>
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
      className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-outline-variant/40 bg-surface-container-lowest px-4 py-2 text-xs font-bold text-on-surface shadow-sm transition-all duration-200 hover:border-primary/30 hover:bg-primary-container/10 hover:text-primary"
    >
      <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-on-primary">
        <MIcon name="open_in_new" className="text-[14px]" />
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

// ---- ActionButton: primary filled, secondary outlined.
export function ActionButton({ children, onClick, type = 'button', variant = 'secondary', disabled = false, className = '' }) {
  const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.05em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95';
  const cls = variant === 'primary'
    ? 'bg-primary text-on-primary shadow-primary hover:bg-primary-container hover:shadow-lg'
    : 'border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant shadow-sm hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${cls} ${className}`}>
      {children}
    </button>
  );
}

// ---- SegmentedControl ----
export function SegmentedControl({ items, value, onChange }) {
  return (
    <div className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-outline-variant/70 bg-surface-container-lowest p-1 shadow-sm">
      {items.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex shrink-0 items-center gap-2.5 rounded-md px-5 py-2 text-sm font-semibold transition-all duration-200 ${
            value === key
              ? 'bg-primary text-on-primary shadow-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >
          <span>{label}</span>
          {badge ? (
            <FreshnessBadge
              {...badge}
              className={value === key ? 'border-white/25 bg-white/10 text-white' : ''}
            />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function formatDisplayDate(iso) {
  if (!iso) return { full: '', day: '' };
  const d = new Date(iso);
  return {
    full: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    short: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    day: d.toLocaleDateString('en-IN', { weekday: 'short' })
  };
}

function shiftIso(iso, delta) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ---- DateControl ----
export function DateControl({ value, onChange, latest }) {
  const inputRef = React.useRef(null);
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
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftIso(value, -1))}
        title="Previous day"
        aria-label="Previous day"
        className="hidden size-9 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high md:flex"
      >
        <MIcon name="chevron_left" className="text-[20px]" />
      </button>
      <button
        type="button"
        onClick={openPicker}
        title="Pick date"
        className="group flex min-w-0 items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest py-1 pl-2 pr-1 shadow-sm transition-all hover:border-primary/40 hover:bg-surface-container-low active:scale-95 sm:gap-3 sm:py-1.5 sm:pl-2.5 sm:pr-1.5 md:pl-4"
      >
        <div className="flex min-w-0 flex-col items-start leading-none">
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.05em] text-on-surface-variant/60 md:inline">Business Date</span>
          <span className="truncate text-[12px] font-bold text-on-surface sm:text-[13px] md:text-sm">
            <span className="hidden md:inline">{display.full}</span>
            <span className="md:hidden">{display.short}</span>
          </span>
        </div>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-container/10 text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary sm:size-8">
          <MIcon name="calendar_today" className="text-[16px] sm:text-[18px]" />
        </div>
      </button>
      <button
        type="button"
        onClick={() => value < latest ? onChange(shiftIso(value, 1)) : null}
        disabled={value >= latest}
        title="Next day"
        aria-label="Next day"
        className="hidden size-9 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-30 disabled:hover:bg-transparent md:flex"
      >
        <MIcon name="chevron_right" className="text-[20px]" />
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

// ---- PIN gate ----
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
    if (!lockedUntil) { setLockoutRemaining(''); return undefined; }
    const update = () => {
      if (Date.now() >= new Date(lockedUntil).getTime()) {
        setLockedUntil(''); setStatus(''); setLockoutRemaining(''); return;
      }
      setLockoutRemaining(formatLockoutRemaining(lockedUntil));
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const submit = async (event) => {
    event.preventDefault();
    if (isLocked) return;
    setLoading(true); setStatus('');
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
    <main className="relative min-h-screen overflow-hidden bg-surface px-4 py-6 sm:px-6 lg:grid lg:place-items-center">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f4f6f8_42%,#eef2f5_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-accent-stripe" />

      <form
        onSubmit={submit}
        className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[28rem] animate-fade-in-up items-center sm:min-h-0 lg:min-h-0"
      >
        <section className="w-full overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-cardHover">
          <div className="border-b border-outline-variant/60 bg-surface-container-lowest px-5 py-6 text-center sm:px-8">
            <div
              className="mx-auto flex items-center justify-center rounded-2xl border border-outline-variant/70 bg-white p-2.5"
              style={{ width: '5rem', height: '5rem', boxShadow: '0 24px 60px -32px rgba(8, 120, 108, 0.52)' }}
            >
              <img src={cpLogo} alt="Centre Point logo" className="h-full w-full object-contain" />
            </div>
            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-primary">DailyFlash</div>
            <h1 className="mt-2 text-display-mobile font-bold tracking-tight text-on-surface">CP Flash Report</h1>
            <p className="mt-1.5 text-sm font-medium text-on-surface-variant">Centre Point Hospitality Group</p>
          </div>

          <div className="px-5 py-7 sm:px-8">
            <div className="w-full">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Secure Access</p>
                <h2 className="mt-2 text-headline-md font-bold tracking-tight text-on-surface">Enter PIN</h2>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <MIcon name="lock" filled className="text-[22px]" />
              </div>
            </div>

            <label className={`relative flex w-full cursor-text items-center justify-center gap-2.5 rounded-xl border bg-surface-container-low px-3 py-3.5 transition-all duration-200 sm:gap-3 sm:px-4 sm:py-4 ${
              shake
                ? 'border-error/60 shadow-[0_0_0_5px_rgba(186,26,26,0.16)] animate-shake'
                : focused
                  ? 'border-primary/70 shadow-[0_0_0_5px_rgba(8,120,108,0.14)]'
                  : 'border-outline-variant/70'
            }`}>
              {Array.from({ length: 6 }, (_, i) => {
                const filled = i < pin.length;
                const current = i === pin.length && focused;
                const slotBase = shake
                  ? 'border-error/45 bg-error/10'
                  : current
                    ? 'border-primary/60 bg-primary/10'
                    : filled
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-outline-variant/70 bg-surface-container-lowest';
                const dotBase = shake
                  ? 'bg-error'
                  : filled
                    ? 'bg-primary'
                    : current
                      ? 'bg-primary/40'
                      : 'bg-transparent';
                return (
                  <span key={i} className={`relative flex h-12 flex-1 items-center justify-center rounded-lg border transition-all duration-200 ${slotBase}`}>
                    <span className={`size-2.5 rounded-full transition-all duration-200 ${dotBase}`} />
                    {current && !shake ? <span className="absolute inset-x-3 bottom-2 h-0.5 rounded-full bg-primary" /> : null}
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
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-error/25 bg-error/10 px-3.5 py-3 text-sm font-semibold text-error">
                <MIcon name="error" className="mt-0.5 shrink-0" />
                <span>{status}{isLocked && lockoutRemaining ? ` Try again in ${lockoutRemaining}.` : ''}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || isLocked || pin.length < 4}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold uppercase tracking-[0.05em] text-on-primary shadow-primary transition-all duration-200 hover:bg-primary-container hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant disabled:shadow-none"
            >
              {loading ? (
                'Verifying...'
              ) : isLocked ? `Blocked ${lockoutRemaining || ''}` : 'Unlock Dashboard'}
            </button>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-on-surface-variant">
              <MIcon name="shield_lock" filled className="text-[16px] text-primary" />
              Authorized access only
            </div>
            </div>
          </div>
        </section>
      </form>
    </main>
  );
}
