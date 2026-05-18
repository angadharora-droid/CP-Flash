import React, { useEffect, useMemo, useState } from 'react';
import { generateAiNotes, getSeed, getSourceReportPreview, getSourceStatus, loginWithPin, reportPdfPreviewUrl, reportPdfUrl, saveData } from './lib/api';
import { groupRevenue, money, moneyCompact, numberValue, percent, pnlRows, relativeTime, settlementModes, settlementTotals, UNITS, withFlags } from './lib/calculations';
import DataTable from './components/DataTable';
import FlagBadge from './components/FlagBadge';
import KpiRow from './components/KpiRow';
import SectionCard from './components/SectionCard';
import StatStrip from './components/StatStrip';
import cpLogo from './cp-logo.png';

const NOW = new Date().toISOString().slice(0, 10);
const AUTO_REFRESH_MS = 2 * 60 * 1000;
const d = new Date(); d.setDate(d.getDate() - 1);
const today = d.toISOString().slice(0, 10);

// Keys that should always carry seed defaults when the saved value is empty/missing.
// MongoDB has historically saved some of these as `[]`, which would otherwise blank the page.
const SEED_FALLBACK_KEYS = ['pnl', 'bankPosition', 'hotels', 'rabbits', 'mickys', 'purosoul', 'purosoulSku', 'fixedCosts'];

const PNL_VALUE_KEYS = ['revenueToday', 'purchasesToday', 'mtdNetProfit', 'ytdNetProfit'];

function hasEnteredPnlValues(row) {
  return PNL_VALUE_KEYS.some((key) => String(row?.[key] ?? '').trim() !== '');
}

function firstKpiValue(rows = [], unit, names = []) {
  const match = rows.find((row) => row.unit === unit && names.some((name) => row.name === name));
  return match?.actual;
}

function sumKpiValues(rows = [], unit, names = []) {
  const total = rows
    .filter((row) => row.unit === unit && names.some((name) => row.name === name))
    .reduce((sum, row) => sum + numberValue(row.actual), 0);
  return total ? String(Math.round(total * 100) / 100) : '';
}

function derivePnlRows(data) {
  const revenueByUnit = {
    'CP Nagpur': () => sumKpiValues(data.hotels, 'CP Nagpur', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    'CP NM': () => sumKpiValues(data.hotels, 'CP NM', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Gross Sales']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Gross Sales']),
    Rabbits: () => firstKpiValue(data.rabbits, 'Rabbits', ['Total Revenue']),
    "Micky's": () => firstKpiValue(data.mickys, "Micky's", ['Order Revenue Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['Total Revenue Today'])
  };
  const purchasesByUnit = {
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Total Purchase']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Total Purchase']),
    Rabbits: () => firstKpiValue(data.rabbits, 'Rabbits', ['Purchase/RM Cost Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['RM Cost Today'])
  };
  return (data.pnl ?? []).map((row) => {
    const revenueToday = String(row.revenueToday ?? '').trim() || revenueByUnit[row.unit]?.() || '';
    const purchasesToday = String(row.purchasesToday ?? '').trim() || purchasesByUnit[row.unit]?.() || '';
    return { ...row, revenueToday, purchasesToday };
  });
}

function mergePnlRows(seedRows = [], savedRows = [], previousRows = []) {
  const savedByUnit = new Map(savedRows.map((row) => [row.unit, row]));
  const previousByUnit = new Map(previousRows.map((row) => [row.unit, row]));
  return seedRows.map((seedRow) => {
    const savedRow = savedByUnit.get(seedRow.unit);
    const previousRow = previousByUnit.get(seedRow.unit);
    if (hasEnteredPnlValues(savedRow)) return { ...seedRow, ...savedRow };
    if (hasEnteredPnlValues(previousRow)) return { ...seedRow, ...previousRow };
    return savedRow ? { ...seedRow, ...savedRow } : seedRow;
  });
}

function mergeWithSeed(seed, saved, previous = null) {
  if (!saved) return seed;
  const merged = { ...seed, ...saved };
  for (const key of SEED_FALLBACK_KEYS) {
    const savedVal = saved[key];
    const seedVal = seed[key];
    if (Array.isArray(seedVal) && (!Array.isArray(savedVal) || savedVal.length === 0)) {
      merged[key] = seedVal;
    } else if (seedVal && typeof seedVal === 'object' && !Array.isArray(seedVal)
      && (savedVal == null || (typeof savedVal === 'object' && Object.keys(savedVal).length === 0))) {
      merged[key] = seedVal;
    }
  }
  merged.pnl = mergePnlRows(seed.pnl, saved.pnl, previous?.pnl);
  merged.pnl = derivePnlRows(merged);
  return merged;
}
const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

const pages = [
  ['sources', '00', 'Source Control'],
  ['bank', '01', 'Bank Position'],
  ['pnl', '02', 'Unit-wise P&L'],
  ['flags', '03', 'Flag Summary'],
  ['hotels', '04', 'Hotels'],
  ['fnb', '05', 'F&B Outlets'],
  ['rabbits', '06', 'Rabbits'],
  ['mickys', '07', "Micky's"],
  ['purosoul', '08', 'Purosoul'],
  ['settlement', '09', 'Settlement'],
  ['ai', '10', 'AI Notes'],
  ['pdf', '11', 'PDF Preview']
];

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { key: 'sources', label: 'Source Control', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></> },
      { key: 'bank',    label: 'Bank Position',  icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></> },
      { key: 'pnl',     label: 'P&L Summary',    icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></> },
      { key: 'flags',   label: 'Flag Summary',   icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" /></> },
    ]
  },
  {
    label: 'Unit Data',
    items: [
      { key: 'hotels',   label: 'Hotels',     icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></> },
      { key: 'fnb',      label: 'F&B Outlets', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5M6 10.608v4.372m12-4.372v4.372M3 18h18" /></> },
      { key: 'rabbits',  label: 'Rabbits',     icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016 2.993 2.993 0 002.25-1.016 3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.061.44l1.19 1.189a3 3 0 01-.621 4.72" /></> },
      { key: 'mickys',   label: "Micky's",     icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></> },
      { key: 'purosoul', label: 'Purosoul',    icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0-6.75h.008v.008H12V10.5zm0 0H8.625m3.375 0h3.375M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></> },
    ]
  },
  {
    label: 'Close of Day',
    items: [
      { key: 'settlement', label: 'Settlement', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" /></> },
      { key: 'ai',         label: 'AI Notes',   icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></> },
      { key: 'pdf',        label: 'PDF Preview', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></> },
    ]
  }
];

const statusTone = {
  Imported: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-100',
  Entered: 'border-teal-200/80 bg-teal-50/80 text-teal-700 ring-1 ring-teal-100',
  Pending: 'border-amber-200/80 bg-amber-50/80 text-amber-700 ring-1 ring-amber-100'
};

function fmtDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getFreshness(importedAt, hasData, fileDate) {
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

function hasKpiData(rows) {
  return (rows ?? []).some((r) => String(r.actual ?? '').trim() !== '');
}

function FreshnessBadge({ label, cls }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function ReportValue({ value, className = '', numeric = false }) {
  const empty = value === '' || value == null;
  return (
    <span className={`num block min-w-24 rounded-lg px-2.5 py-1.5 text-sm ${numeric ? 'text-right tabular-nums' : ''} ${empty ? 'text-slate-300' : 'bg-app-panel/80 text-app-text'} ${className}`}>
      {empty ? '—' : value}
    </span>
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

function PageTitle({ title, subtitle, badge, actions, activeKey }) {
  const accent = getSectionAccent(activeKey);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-app-border bg-white/85 backdrop-blur-xl shadow-card animate-fade-in-up">
      <div className="absolute inset-0 opacity-[0.6] pointer-events-none" style={{ background: accent.glow }} />
      <div className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${accent.stripe}`} />
      <div className="relative flex flex-wrap items-start justify-between gap-4 px-7 py-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-app-text text-balance">{title}</h1>
            {badge ? <FreshnessBadge {...badge} /> : null}
          </div>
          {subtitle ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-app-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function KpiTable({ rows }) {
  const headers = ['KPI Name', 'AOP Target', 'Today Actual', 'MTD', 'YTD', 'Status'];
  return (
    <div className="overflow-auto rounded-2xl border border-app-border bg-white/90 backdrop-blur-xl shadow-card">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gradient-to-b from-slate-50/90 to-white text-left">
            {headers.map((h, i) => (
              <th key={h} className={`whitespace-nowrap border-b border-app-divider px-4 py-3.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-app-subtle ${i === 2 ? 'bg-app-accentTint/40 text-app-accentDark' : ''}`}>
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

function SheetLink({ url, label = 'View Source Sheet' }) {
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

function ActionButton({ children, onClick, type = 'button', variant = 'secondary', disabled = false, className = '' }) {
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

function SegmentedControl({ items, value, onChange }) {
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

function DateControl({ value, onChange, latest, refreshing, onRefresh }) {
  const inputRef = React.useRef(null);
  const isLatest = value >= latest;
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
      <div className="mx-0.5 w-px self-stretch bg-app-divider" />
      <button
        type="button"
        onClick={() => isLatest ? onRefresh?.() : onChange(latest)}
        disabled={refreshing}
        title={isLatest ? 'Refresh (R)' : 'Jump to latest (T)'}
        className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold uppercase tracking-wider text-app-accentDark transition-all duration-150 hover:bg-app-accentTint active:scale-[0.97] disabled:opacity-50"
      >
        <svg className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          {isLatest ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.183m0-4.991v4.99" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
        {isLatest ? (refreshing ? 'Loading' : 'Refresh') : 'Today'}
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

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatus('');
    try {
      const token = await loginWithPin(pin);
      localStorage.setItem('dailyflashToken', token);
      onUnlock(token);
    } catch (err) {
      setStatus(err.message);
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
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                aria-label="PIN"
                className="absolute inset-0 w-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none"
              />
            </label>

            {status ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 text-sm font-medium text-rose-700">
                <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {status}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || pin.length < 4}
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
              ) : 'Unlock Dashboard'}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-app-muted">Contact your administrator if you need access.</p>
      </form>
    </main>
  );
}

function BankPage({ data, date }) {
  const rows = data.bankPosition ?? [];
  const badge = getFreshness(
    data.importSource?.bankPositionImportedAt,
    rows.some((r) => String(r.actualBalance ?? '').trim() !== ''),
    date
  );
  const totals = rows.reduce((acc, row) => {
    acc.actual += numberValue(row.actualBalance);
    acc.issued += numberValue(row.chequesIssued);
    acc.hand += numberValue(row.chequesInHand);
    acc.fd += numberValue(row.fdTotal);
    return acc;
  }, { actual: 0, issued: 0, hand: 0, fd: 0 });
  const net = (row) =>
    String(row.netBalance ?? '').trim() !== ''
      ? numberValue(row.netBalance)
      : numberValue(row.actualBalance) + numberValue(row.fdTotal)
        - numberValue(row.chequesIssued) + numberValue(row.chequesInHand);
  const netTotal = rows.reduce((sum, row) => sum + net(row), 0);

  return (
    <>
      <PageTitle
        title="Bank Position"
        subtitle="Daily unit-wise cash visibility."
        badge={badge}
        activeKey="bank"
        actions={<SheetLink url={SHEET_URLS.bankPosition} />}
      />
      <StatStrip items={[
        {
          label: 'Actual Balance',
          value: moneyCompact(totals.actual),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9m-19.5 0h19.5" />
        },
        {
          label: 'FD Total',
          value: moneyCompact(totals.fd),
          tone: 'text-emerald-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25zm0 2.25h.008v.008H12V10.5zm0 2.25h.008v.008H12V12.75z" />
        },
        {
          label: 'Cheques Issued',
          value: moneyCompact(totals.issued),
          tone: totals.issued > 0 ? 'text-amber-700' : undefined,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l2 2 4-4m-7-4h6.75A2.25 2.25 0 0116.5 4.5v2.25" />
        },
        {
          label: 'Net Balance',
          value: moneyCompact(netTotal),
          tone: netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700',
          caption: `Group total across ${rows.length} accounts`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        }
      ]} />
      <DataTable
        columns={['Unit', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheques in Hand', 'Net Balance Available']}
        numericFrom={1}
        rows={rows.map((row) => ({
          key: `${row.unit}-${row.account ?? row.unit}`,
          cells: [
            <div>
              <div className="font-semibold text-app-text">{row.unit}</div>
              {row.account ? <div className="text-xs font-medium text-app-muted">{row.account}</div> : null}
            </div>,
            <ReportValue value={row.actualBalance} numeric />,
            <ReportValue value={row.fdTotal ?? ''} numeric />,
            <ReportValue value={row.chequesIssued} numeric />,
            <ReportValue value={row.chequesInHand} numeric />,
            <span className={`num font-bold ${net(row) >= 0 ? 'text-app-text' : 'text-rose-700'}`}>{money(net(row))}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-4 py-3">GROUP TOTAL</td>
            <td className="num px-4 py-3 text-right">{money(totals.actual)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.fd)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.issued)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.hand)}</td>
            <td className="num px-4 py-3 text-right">{money(netTotal)}</td>
          </tr>
        }
      />
    </>
  );
}

function PnlPage({ data, date }) {
  const rows = pnlRows(data);
  const hasPnl = (data.pnl ?? []).some((r) => String(r.revenueToday ?? '').trim() !== '' || String(r.purchasesToday ?? '').trim() !== '');
  const badge = getFreshness(null, hasPnl, date);
  const totals = rows.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday);
    acc.purchases += numberValue(row.purchasesToday);
    acc.gp += row.grossProfit;
    acc.fixed += numberValue(row.fixedCost);
    acc.net += row.estNetProfit;
    acc.mtd += numberValue(row.mtdNetProfit);
    acc.ytd += numberValue(row.ytdNetProfit);
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, fixed: 0, net: 0, mtd: 0, ytd: 0 });

  return (
    <>
      <PageTitle title="Unit-wise Estimated P&L" subtitle="Revenue, purchases, fixed cost, and estimated profitability." badge={badge} activeKey="pnl" />
      <SectionCard title="Config: Daily Fixed Cost per Unit" defaultOpen={false}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.unit} className="flex items-center justify-between gap-3 rounded-xl border border-app-border bg-white/80 px-3.5 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-app-muted">{row.unit}</span>
              <span className="num text-sm font-bold text-app-text">{money(row.fixedCost)}</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <StatStrip items={[
        {
          label: 'Group Revenue',
          value: moneyCompact(totals.revenue),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        },
        {
          label: 'Gross Profit',
          value: moneyCompact(totals.gp),
          tone: totals.gp >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: totals.revenue ? `${percent(totals.gp / totals.revenue * 100)} of revenue` : null,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        },
        {
          label: 'Est. Net Profit',
          value: moneyCompact(totals.net),
          tone: totals.net >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: totals.net >= 0 ? 'After fixed costs' : 'Loss after fixed costs',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4" />
        },
        {
          label: 'Net Margin',
          value: percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0),
          tone: totals.net >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: 'Net profit ÷ revenue',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        }
      ]} />
      <DataTable
        columns={['Unit', 'Revenue Today', 'Purchases Today', 'Gross Profit', 'GP%', 'Fixed Cost (Daily)', 'Est. Net Profit', 'Net Margin%', 'MTD Net Profit', 'YTD Net Profit']}
        numericFrom={1}
        rows={rows.map((row) => ({
          key: row.unit,
          cells: [
            <span className="font-semibold text-app-text">{row.unit}</span>,
            <ReportValue value={row.revenueToday} numeric />,
            <ReportValue value={row.purchasesToday} numeric />,
            <span className="num font-medium text-app-text">{money(row.grossProfit)}</span>,
            <span className={`num font-semibold ${row.gpPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.gpPercent)}</span>,
            <ReportValue value={row.fixedCost} numeric />,
            <span className={`num font-semibold ${row.estNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.estNetProfit)}</span>,
            <span className={`num font-semibold ${row.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.netMargin)}</span>,
            <ReportValue value={row.mtdNetProfit} numeric />,
            <ReportValue value={row.ytdNetProfit} numeric />
          ]
        }))}
        footer={
          <tr>
            <td className="px-4 py-3">GROUP TOTAL</td>
            <td className="num px-4 py-3 text-right">{money(totals.revenue)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.purchases)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.gp)}</td>
            <td className="num px-4 py-3 text-right">{percent(totals.revenue ? (totals.gp / totals.revenue) * 100 : 0)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.fixed)}</td>
            <td className={`num px-4 py-3 text-right ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(totals.net)}</td>
            <td className={`num px-4 py-3 text-right ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.mtd)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.ytd)}</td>
          </tr>
        }
      />
    </>
  );
}

function FlagsPage({ data }) {
  const flags = withFlags(data);
  const counts = {
    on: flags.filter((row) => row.flag === 'ON TRACK' || row.flag === 'OUTPERFORM').length,
    watch: flags.filter((row) => row.flag === 'WATCH').length,
    action: flags.filter((row) => row.flag === 'ACTION NEEDED').length
  };
  const filtered = flags.filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');

  return (
    <>
      <PageTitle title="Watch Out Flag Summary" subtitle="Auto-generated risks from all unit KPIs." activeKey="flags" />
      <StatStrip items={[
        {
          label: 'On Track',
          value: counts.on,
          tone: 'text-emerald-700',
          caption: counts.on === 1 ? 'KPI tracking well' : 'KPIs tracking well',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        },
        {
          label: 'Watch',
          value: counts.watch,
          tone: 'text-amber-700',
          caption: counts.watch === 1 ? 'KPI to monitor' : 'KPIs to monitor',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        },
        {
          label: 'Action Needed',
          value: counts.action,
          tone: 'text-rose-700',
          caption: counts.action === 0 ? 'All clear' : (counts.action === 1 ? 'Needs attention' : 'Need attention'),
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        },
        {
          label: 'Total Risks',
          value: counts.watch + counts.action,
          tone: counts.action > 0 ? 'text-rose-700' : counts.watch > 0 ? 'text-amber-700' : 'text-emerald-700',
          caption: `Out of ${counts.on + counts.watch + counts.action} KPIs`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        }
      ]} />
      <DataTable
        columns={['Unit', 'KPI Name', 'AOP Target', 'Today Actual', '% vs Target', 'Flag']}
        numericFrom={2}
        rows={filtered.map((row) => ({
          key: `${row.unit}-${row.kpiName}`,
          cells: [
            <span className="font-semibold text-app-text">{row.unit}</span>,
            <span className="text-app-text">{row.kpiName}</span>,
            <span className="num">{row.aopTarget}</span>,
            <span className="num">{row.todayActual}</span>,
            <span className={`num font-semibold ${row.percentVsTarget >= 95 ? 'text-emerald-700' : row.percentVsTarget >= 85 ? 'text-amber-700' : 'text-rose-700'}`}>{row.percentVsTarget}%</span>,
            <FlagBadge label={row.flag} />
          ]
        }))}
      />
    </>
  );
}

function SourceReportPreviewScreen({ preview, loading, error, onClose }) {
  const [activeSheet, setActiveSheet] = useState('');
  const sheets = preview?.sheets ?? [];
  const selectedSheet = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];

  useEffect(() => {
    setActiveSheet(sheets[0]?.name ?? '');
  }, [preview?.file, sheets[0]?.name]);

  if (!preview && !loading && !error) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-200 p-0 sm:p-4 lg:p-6">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-glass sm:rounded-2xl sm:border sm:border-white/70">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-app-divider px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-app-subtle">Email report preview</p>
            <h2 className="mt-1 truncate text-base font-bold text-app-text">{preview?.file ?? 'Loading report'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report preview"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-panel hover:text-app-text"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm font-medium text-app-muted">Preparing preview...</div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{error}</div>
          ) : selectedSheet ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              {sheets.length > 1 ? (
                <div className="flex gap-1 overflow-x-auto rounded-xl border border-app-border bg-app-panel p-1">
                  {sheets.map((sheet) => (
                    <button
                      key={sheet.name}
                      type="button"
                      onClick={() => setActiveSheet(sheet.name)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        selectedSheet.name === sheet.name ? 'bg-white text-app-accentDark shadow-sm' : 'text-app-muted hover:bg-white/70 hover:text-app-text'
                      }`}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-xl border border-app-border bg-white">
                <table className="min-w-full border-collapse text-xs">
                  <tbody>
                    {selectedSheet.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? 'bg-app-panel font-bold text-app-text' : 'odd:bg-white even:bg-app-panel/35'}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="max-w-72 whitespace-nowrap border border-app-divider px-2.5 py-2 align-top text-app-text">
                            {cell || <span className="text-slate-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-app-muted">Showing the first 100 rows and 40 columns from the saved email attachment.</p>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-sm font-medium text-app-muted">No previewable rows found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceControlPage({ date, authToken, onOpenReportPreview }) {
  const [sourceStatus, setSourceStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = React.useCallback(async (silent = false) => {
    if (!authToken) return;
    setLoading(true);
    if (!silent) setError('');
    try {
      setSourceStatus(await getSourceStatus(date, authToken));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date, authToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const sources = sourceStatus?.sources ?? [];
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '-';

  return (
    <>
      <PageTitle title="Source Control" subtitle="Daily feed status for mail, sheets, POS, and manual sources." activeKey="sources" />
      <StatStrip items={[
        { label: 'Total Sources', value: sourceStatus?.total ?? '-' },
        { label: 'Imported', value: sourceStatus?.imported ?? '-', tone: 'text-emerald-700' },
        { label: 'Entered', value: sourceStatus?.entered ?? '-', tone: 'text-teal-700' },
        { label: 'Pending', value: sourceStatus?.pending ?? '-', tone: sourceStatus?.pending ? 'text-amber-700' : 'text-emerald-700' }
      ]} />
      <SectionCard title="Daily Sources">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-app-muted">{loading ? 'Checking sources...' : `Status for ${date}`}</div>
          <ActionButton onClick={() => load()} disabled={loading}>Refresh</ActionButton>
        </div>
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        ) : null}
        <DataTable
          columns={['Source', 'Unit', 'Type', 'Status', 'Last Import', 'File / Notes']}
          rows={sources.map((source) => ({
            key: source.id,
            cells: [
              <span className="font-semibold text-app-text">{source.label}</span>,
              source.unit,
              source.type,
              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[source.status]}`}>{source.status}</span>,
              formatTime(source.importedAt),
              <div className="max-w-xl">
                <div className="font-medium text-app-text">{source.file || '-'}</div>
                {source.notes ? <div className="mt-1 text-xs leading-5 text-app-muted">{source.notes}</div> : null}
                {source.sheetUrl ? <div className="mt-2"><SheetLink url={source.sheetUrl} label="Open Sheet" /></div> : null}
                {source.reportFiles?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {source.reportFiles.map((file, index) => (
                      <button
                        key={`${source.id}-${file}-${index}`}
                        type="button"
                        onClick={() => onOpenReportPreview(source, file)}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-app-border bg-white/85 px-3.5 py-2 text-xs font-bold text-app-text shadow-card backdrop-blur-xl transition-all duration-200 hover:-translate-y-px hover:border-app-borderStrong hover:bg-white hover:shadow-cardHover"
                      >
                        <span className="flex size-5 items-center justify-center rounded-md bg-app-accentTint text-app-accentDark">
                          <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 12.75h3m-3 3h3M6.75 3h6.879a3 3 0 012.121.879l2.871 2.871a3 3 0 01.879 2.121v10.379A1.75 1.75 0 0117.75 21H6.75A1.75 1.75 0 015 19.25V4.75C5 3.784 5.784 3 6.75 3z" />
                          </svg>
                        </span>
                        {source.reportFiles.length > 1 ? `Preview ${index + 1}` : 'Preview Report'}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ]
          }))}
        />
      </SectionCard>
    </>
  );
}

function GroupedKpiPage({ title, subtitle, dataKey, data, sections, date, importedAt, sheetUrl }) {
  const rows = data[dataKey] ?? [];
  const badge = getFreshness(importedAt ?? null, hasKpiData(rows), date);
  return (
    <>
      <PageTitle title={title} subtitle={subtitle} badge={badge} activeKey={dataKey} />
      {sheetUrl && <div className="flex justify-end"><SheetLink url={sheetUrl} /></div>}
      {sections.map((section) => <SectionCard key={section} title={section}><KpiTable rows={rows.filter((row) => row.section === section)} /></SectionCard>)}
    </>
  );
}

function HotelsPage({ data, date }) {
  const [hotelUnit, setHotelUnit] = useState('CP Nagpur');
  const rows = (data.hotels ?? []).filter((row) => row.unit === hotelUnit);
  const cpNmExclude = ['F&B Outlets', 'Banquets'];
  const sections = [...new Set(rows.map((row) => row.section))].filter(
    (s) => hotelUnit !== 'CP NM' || !cpNmExclude.includes(s)
  );
  const hotelLabel = hotelUnit === 'CP NM' ? 'CP Navi Mumbai' : hotelUnit;
  return (
    <>
      <PageTitle title="Hotels Data" subtitle="Separate operating dashboards for CP Nagpur and CP Navi Mumbai." activeKey="hotels" />
      <SegmentedControl
        value={hotelUnit}
        onChange={setHotelUnit}
        items={['CP Nagpur', 'CP NM'].map((unit) => ({
          key: unit,
          label: unit === 'CP NM' ? 'CP Navi Mumbai' : unit,
          badge: getFreshness(
            unit === 'CP Nagpur' ? data.importSource?.importedAt : data.importSource?.occupancyImportedAt,
            hasKpiData((data.hotels ?? []).filter((r) => r.unit === unit)),
            date
          )
        }))}
      />
      {sections.map((section) => (
        <SectionCard key={section} title={`${hotelLabel}: ${section}`}>
          <KpiTable rows={rows.filter((row) => row.section === section)} />
        </SectionCard>
      ))}
      {hotelUnit === 'CP Nagpur' && ['banquetToday', 'banquetTomorrow'].map((key) => (
        <SectionCard key={key} title={`${hotelLabel}: ${key === 'banquetToday' ? 'Banquet Function List Today' : 'Banquet Function List Tomorrow'}`}>
          <DataTable
            columns={['Market Segment', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes']}
            rows={(data[key] ?? []).map((row, index) => ({
              key: index,
              cells: ['marketSegment', 'pax', 'venue', 'session', 'revenue', 'notes'].map((field) => <ReportValue key={field} value={row[field]} />)
            }))}
          />
        </SectionCard>
      ))}
    </>
  );
}

function FnbPage({ data, date }) {
  const [tab, setTab] = useState('Pablo');
  const rows = data.fnb?.[tab] ?? [];
  const sections = [...new Set(rows.map((row) => row.section))];
  const fnbSheetUrl = tab === 'Pablo' ? SHEET_URLS.pabloCost : SHEET_URLS.daliCost;
  return (
    <>
      <PageTitle title="F&B Outlet Data" subtitle="Pablo and Dali sales, cost, AOP, and top items." activeKey="fnb" />
      <SegmentedControl
        value={tab}
        onChange={setTab}
        items={['Pablo', 'Dali'].map((item) => ({
          key: item,
          label: item,
          badge: getFreshness(
            item === 'Pablo' ? data.importSource?.pabloCostImportedAt : data.importSource?.daliCostImportedAt,
            hasKpiData(data.fnb?.[item]),
            date
          )
        }))}
      />
      <div className="flex justify-end">
        <SheetLink url={fnbSheetUrl} label={`View ${tab} Cost Sheet`} />
      </div>
      {sections.map((section) => <SectionCard key={section} title={`${tab}: ${section}`}><KpiTable rows={rows.filter((row) => row.section === section)} /></SectionCard>)}
      <SectionCard title={`${tab}: Top 3 Items`}>
        <div className="grid gap-3 md:grid-cols-3">
          {(data.topItems?.[tab] ?? ['', '', '']).map((item, index) => <ReportValue key={index} value={item} />)}
        </div>
      </SectionCard>
    </>
  );
}

function PurosoulPage({ data, date }) {
  const hasSkuData = (data.purosoulSku ?? []).some((r) => String(r.produced ?? '').trim() !== '');
  const hasData = hasKpiData(data.purosoul) || hasSkuData;
  const flashImportedAt = data.importSource?.purosoulFlashImportedAt;
  const salesImportedAt = data.importSource?.purosoulSalesImportedAt;
  const importedAt = flashImportedAt && salesImportedAt
    ? (flashImportedAt > salesImportedAt ? flashImportedAt : salesImportedAt)
    : (flashImportedAt ?? salesImportedAt);
  const badge = getFreshness(importedAt, hasData, date);
  return (
    <>
      <PageTitle title="Purosoul Data" subtitle="Revenue, RM cost, production, dispatch, and stock." badge={badge} activeKey="purosoul" />
      <SectionCard title="Revenue & Cost"><KpiTable rows={(data.purosoul ?? []).filter((row) => row.section === 'Revenue & Cost')} /></SectionCard>
      <SectionCard title="SKU Production & Dispatch">
        <DataTable
          columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched', 'YTD']}
          rows={(data.purosoulSku ?? []).map((row) => ({
            key: row.sku,
            cells: [
              <span className="font-semibold">{row.sku}</span>,
              <ReportValue value={row.produced} />,
              <ReportValue value={row.dispatched} />,
              <ReportValue value={row.clStock} />,
              <ReportValue value={row.mtd} />,
              <ReportValue value={row.ytd} />
            ]
          }))}
        />
      </SectionCard>
    </>
  );
}

function SettlementPage({ data, date }) {
  const hasData = Object.values(data.settlement ?? {}).some((m) => Object.values(m ?? {}).some((v) => String(v ?? '').trim() !== ''));
  const badge = getFreshness(null, hasData, date);
  const totals = settlementTotals(data);
  const revenue = groupRevenue(data);
  const diff = revenue - totals.groupTotal;
  return (
    <>
      <PageTitle title="Settlement" subtitle="Mode-wise settlement matrix and revenue reconciliation." badge={badge} activeKey="settlement" />
      <div className={`relative overflow-hidden rounded-2xl border ${diff === 0 ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'} px-5 py-4 shadow-card backdrop-blur-xl`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl ring-1 ${diff === 0 ? 'bg-white text-emerald-600 ring-emerald-100' : 'bg-white text-rose-600 ring-rose-100'}`}>
              <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                {diff === 0
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />}
              </svg>
            </div>
            <div>
              <div className={`text-sm font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {diff === 0 ? 'Revenue and settlements match' : 'Revenue and settlements mismatch'}
              </div>
              <div className="num mt-0.5 text-xs font-medium text-app-muted">
                Revenue {money(revenue)} · Settled {money(totals.groupTotal)} · Difference{' '}
                <span className={`font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(diff)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <StatStrip items={[
        {
          label: 'Total Revenue',
          value: moneyCompact(revenue),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        },
        {
          label: 'Total Settled',
          value: moneyCompact(totals.groupTotal),
          tone: 'text-emerald-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9" />
        },
        {
          label: 'Difference',
          value: moneyCompact(diff),
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        },
        {
          label: 'Status',
          value: diff === 0 ? 'MATCHED' : 'MISMATCH',
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          caption: diff === 0 ? 'Balanced for the day' : 'Investigate discrepancy',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        }
      ]} />
      <DataTable
        columns={['Settlement Mode', ...UNITS, 'Group Total']}
        numericFrom={1}
        rows={settlementModes.map((mode) => ({
          key: mode,
          cells: [
            <span className="font-semibold text-app-text">{mode}</span>,
            ...UNITS.map((unit) => <ReportValue key={unit} value={data.settlement?.[mode]?.[unit]} numeric />),
            <span className="num font-bold text-app-text">{money(totals.rowTotals[mode])}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-4 py-3">UNIT TOTAL</td>
            {UNITS.map((unit) => <td key={unit} className="num px-4 py-3 text-right">{money(totals.unitTotals[unit])}</td>)}
            <td className="num px-4 py-3 text-right">{money(totals.groupTotal)}</td>
          </tr>
        }
      />
    </>
  );
}

function AiPage({ data, authToken }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildPrompt = () => {
    const risks = withFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');
    const settlement = settlementTotals(data);
    return `Generate a daily management briefing for Centre Point Hospitality Group.

Group P&L summary:
${pnlRows(data).map((row) => `- ${row.unit}: revenue ${money(row.revenueToday)}, purchases ${money(row.purchasesToday)}, estimated net profit ${money(row.estNetProfit)}, net margin ${percent(row.netMargin)}`).join('\n')}

WATCH and ACTION flags:
${risks.map((row) => `- ${row.unit} / ${row.kpiName}: target ${row.aopTarget}, actual ${row.todayActual}, ${row.percentVsTarget}% vs target, ${row.flag}`).join('\n') || '- None'}

Settlement reconciliation:
- Total revenue: ${money(groupRevenue(data))}
- Total settled: ${money(settlement.groupTotal)}
- Difference: ${money(groupRevenue(data) - settlement.groupTotal)}

Please summarize performance, call out concerns, highlight wins, and give 3 actionable recommendations for the day.`;
  };

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setText(await generateAiNotes(buildPrompt(), authToken));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, []);

  return (
    <>
      <PageTitle title="Notes by AI" subtitle="Claude-generated morning management briefing." activeKey="ai" />
      <SectionCard title="Daily Management Briefing">
        <div className="mb-4">
          <ActionButton onClick={run} disabled={loading} variant="primary">{loading ? 'Generating...' : 'Generate Report'}</ActionButton>
        </div>
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        ) : null}
        <div className="min-h-96 whitespace-pre-wrap rounded-xl border border-app-border bg-app-panel p-6 leading-7 text-sm text-app-text">
          {loading ? (
            <div className="flex items-center gap-3 text-app-muted">
              <div className="size-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              Claude is preparing the briefing...
            </div>
          ) : text || <span className="text-app-muted">No report generated yet. Click Generate Report above.</span>}
        </div>
      </SectionCard>
    </>
  );
}

function PdfPreviewPage({ date, authToken, onSave }) {
  const [pdfKey, setPdfKey] = useState(0);
  const [frameState, setFrameState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');

  useEffect(() => {
    setFrameState('loading');
    const timer = setTimeout(() => setFrameState((s) => s === 'loading' ? 'error' : s), 20000);
    return () => clearTimeout(timer);
  }, [pdfKey, date]);

  const previewUrl = reportPdfPreviewUrl(date, authToken);
  const appPreviewUrl = `${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  const downloadUrl = reportPdfUrl(date, authToken);
  const previewStatus = frameState === 'ready' ? 'Ready' : frameState === 'error' ? 'Needs attention' : 'Loading';

  const handleSaveAndRefresh = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setFrameState('loading');
      setPdfKey((k) => k + 1);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="PDF Preview" subtitle={`Daily flash report — ${date}`} badge={null} activeKey="pdf" />

      <div className="overflow-hidden rounded-xl border border-app-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border bg-slate-50 px-4 py-3 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
              <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 12h3m-3 3h1.5m-6.375-15h4.5a9 9 0 019 9v9.375c0 .621-.504 1.125-1.125 1.125H5.625A1.125 1.125 0 014.5 20.625V3.375c0-.621.504-1.125 1.125-1.125z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-bold text-app-text sm:text-base">Report preview</h2>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${frameState === 'ready' ? 'bg-emerald-50 text-emerald-700' : frameState === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                  {previewStatus}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-app-muted">
                Save to refresh the in-app copy{lastRefreshed ? ` - refreshed ${lastRefreshed}` : ''}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saveError ? <span className="max-w-72 truncate text-xs font-medium text-red-600">{saveError}</span> : null}
            <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">
              {saving ? 'Saving...' : 'Save & Refresh'}
            </ActionButton>
            <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-app-border bg-white px-4 py-2.5 text-xs text-app-muted lg:px-5">
          <svg className="size-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.007M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>Preview reflects the last saved state. Unsaved edits will appear after refresh.</span>
        </div>

        <div className="bg-slate-200/70 p-3 sm:p-4">
          <div
            className="relative mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-card"
            style={{ height: 'calc(100vh - 315px)', minHeight: '560px', maxWidth: '1180px' }}
          >
            {frameState === 'loading' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white">
                <div className="size-9 animate-spin rounded-full border-[3px] border-teal-600 border-t-transparent" />
                <p className="text-sm font-medium text-app-muted">Preparing in-app preview...</p>
              </div>
            )}

            {frameState === 'error' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white p-8 text-center">
                <svg className="size-14 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div>
                  <p className="text-base font-bold text-app-text">Preview unavailable in this browser</p>
                  <p className="mt-1 text-sm text-app-muted">The report is still ready to download.</p>
                </div>
                <div className="flex gap-2">
                  <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">Try Again</ActionButton>
                  <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
                </div>
              </div>
            )}

            <iframe
              key={`${date}-${pdfKey}`}
              src={appPreviewUrl}
              title="Daily Flash Report PDF"
              className="h-full w-full bg-slate-100"
              onLoad={() => setFrameState('ready')}
              onError={() => setFrameState('error')}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [active, setActive] = useState('sources');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Loading...');
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('dailyflashToken') || '');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('dailyflashSidebar') === 'collapsed');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sourceReportPreview, setSourceReportPreview] = useState(null);
  const [sourceReportPreviewLoading, setSourceReportPreviewLoading] = useState(false);
  const [sourceReportPreviewError, setSourceReportPreviewError] = useState('');
  const loadRequestRef = React.useRef(0);
  const loadedDateRef = React.useRef('');

  React.useEffect(() => {
    localStorage.setItem('dailyflashSidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  React.useEffect(() => {
    setMobileNavOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [active]);

  const loadData = React.useCallback(async (currentDate, token, silent = false) => {
    if (!token) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setRefreshing(true);
    let snapshot = null;
    if (!silent) {
      setData((prev) => { snapshot = prev; return prev; });
      setStatus('Loading...');
    }
    try {
      const { seed, saved } = await getSeed(currentDate, token);
      if (requestId !== loadRequestRef.current) return;
      const sameDateSnapshot = loadedDateRef.current === currentDate ? snapshot : null;
      setData(mergeWithSeed(seed, saved, sameDateSnapshot));
      loadedDateRef.current = currentDate;
      if (silent) {
        setStatus(`Auto refreshed ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      } else {
        setStatus(saved ? `Loaded saved data for ${currentDate}` : `Loaded seed data for ${currentDate}`);
      }
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      if (!silent && snapshot !== null) setData(snapshot);
      if (/PIN required|Invalid PIN|Unauthorized/i.test(err.message)) {
        localStorage.removeItem('dailyflashToken');
        setAuthToken('');
      }
      setStatus(err.message);
    } finally {
      if (requestId === loadRequestRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(date, authToken);
  }, [date, authToken]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && authToken) {
        loadData(date, authToken, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [date, authToken, loadData]);

  useEffect(() => {
    if (!authToken) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(date, authToken, true);
      }
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [date, authToken, loadData]);

  const openSourceReportPreview = React.useCallback(async (source, file) => {
    setSourceReportPreview({ file, sheets: [] });
    setSourceReportPreviewError('');
    setSourceReportPreviewLoading(true);
    try {
      setSourceReportPreview(await getSourceReportPreview(date, source.id, file, authToken));
    } catch (err) {
      setSourceReportPreviewError(err.message);
    } finally {
      setSourceReportPreviewLoading(false);
    }
  }, [date, authToken]);

  const page = useMemo(() => {
    if (!data) return null;
    const common = { data, setData, date, authToken };
    if (active === 'sources') return <SourceControlPage date={date} authToken={authToken} onOpenReportPreview={openSourceReportPreview} />;
    if (active === 'bank') return <BankPage {...common} />;
    if (active === 'pnl') return <PnlPage {...common} />;
    if (active === 'flags') return <FlagsPage data={data} />;
    if (active === 'hotels') return <HotelsPage {...common} />;
    if (active === 'fnb') return <FnbPage {...common} />;
    if (active === 'rabbits') return <GroupedKpiPage title="Rabbits Data" subtitle="Cloud kitchen sales, platform split, category, and cost KPIs." dataKey="rabbits" data={data} setData={setData} sections={[...new Set((data.rabbits ?? []).map((row) => row.section))]} date={date} />;
    if (active === 'mickys') return <GroupedKpiPage title="Micky's Data" subtitle="B2B HORECA lead, order, revenue, and SKU KPIs." dataKey="mickys" data={data} setData={setData} sections={[...new Set((data.mickys ?? []).map((row) => row.section))]} date={date} importedAt={data.importSource?.mickysLeadsImportedAt} sheetUrl={SHEET_URLS.mickysLeads} />;
    if (active === 'purosoul') return <PurosoulPage {...common} />;
    if (active === 'settlement') return <SettlementPage {...common} />;
    if (active === 'pdf') return <PdfPreviewPage date={date} authToken={authToken} onSave={() => saveData(date, data, authToken)} />;
    return <AiPage data={data} authToken={authToken} />;
  }, [active, data, date, authToken, openSourceReportPreview]);

  const lockApp = () => {
    localStorage.removeItem('dailyflashToken');
    setAuthToken('');
    setData(null);
  };

  const handleRefresh = React.useCallback(() => {
    if (authToken) loadData(date, authToken);
  }, [authToken, date, loadData]);

  React.useEffect(() => {
    if (!authToken) return undefined;
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setDate((cur) => shiftIso(cur, -1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setDate((cur) => (cur >= today ? cur : shiftIso(cur, 1)));
      } else if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        setDate(today);
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        handleRefresh();
      } else if (event.key === '[') {
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authToken, handleRefresh]);

  const riskCount = data ? withFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').length : 0;
  const activePage = pages.find(([key]) => key === active) ?? pages[0];

  if (!authToken) return <PinGate onUnlock={setAuthToken} />;

  if (sourceReportPreview || sourceReportPreviewLoading || sourceReportPreviewError) {
    return (
      <SourceReportPreviewScreen
        preview={sourceReportPreview}
        loading={sourceReportPreviewLoading}
        error={sourceReportPreviewError}
        onClose={() => {
          setSourceReportPreview(null);
          setSourceReportPreviewError('');
          setSourceReportPreviewLoading(false);
        }}
      />
    );
  }

  const renderSidebar = (collapsed, { onItemClick, asDrawer = false } = {}) => (
    <>
      {/* Brand */}
      <div className={`flex shrink-0 items-center border-b border-app-divider ${collapsed ? 'justify-center px-3 py-5' : 'gap-3 px-5 py-5'}`}>
        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/85 p-1.5 ring-1 ring-white/70">
          <img src={cpLogo} alt="Centre Point logo" className="h-full w-full object-contain" />
          <div className="absolute -inset-1 rounded-[18px] bg-[#b70072]/20 blur-lg -z-10" />
        </div>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-app-accentDark">DailyFlash</div>
            <div className="truncate text-sm font-bold leading-tight text-app-text">CP Flash Report</div>
            <div className="truncate text-[11px] text-app-muted">Centre Point Hospitality</div>
          </div>
        ) : null}
        {asDrawer ? (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="ml-auto flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-panel hover:text-app-text"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-6">
            {!collapsed ? (
              <div className="mb-2 px-2 text-[9.5px] font-extrabold uppercase tracking-[0.22em] text-app-subtle">
                {group.label}
              </div>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-app-divider" />
            )}
            <div className="space-y-1">
              {group.items.map(({ key, label, icon }) => {
                const isActive = active === key;
                const hasBadge = key === 'flags' && riskCount > 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setActive(key); onItemClick?.(); }}
                    title={collapsed ? label : undefined}
                    className={`group relative flex w-full items-center rounded-xl text-left text-sm font-semibold transition-all duration-200 ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                    } ${
                      isActive
                        ? 'bg-gradient-to-r from-app-accentTint to-white text-app-accentDark ring-1 ring-teal-100 shadow-sm'
                        : 'text-app-body hover:bg-app-panel/80 hover:text-app-text'
                    }`}
                  >
                    {isActive ? (
                      <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent-stripe" />
                    ) : null}
                    <span className={`relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                      isActive ? 'bg-white/80 text-app-accent shadow-sm ring-1 ring-teal-100' : 'bg-app-panel/70 text-app-muted group-hover:bg-white group-hover:text-app-text'
                    }`}>
                      <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.85} viewBox="0 0 24 24">
                        {icon}
                      </svg>
                      {collapsed && hasBadge ? (
                        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-rose-500 ring-2 ring-white" />
                      ) : null}
                    </span>
                    {!collapsed ? <span className="truncate">{label}</span> : null}
                    {!collapsed && hasBadge ? (
                      <span className="ml-auto rounded-full bg-gradient-to-b from-rose-500 to-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm ring-1 ring-rose-100">
                        {riskCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* Footer */}
      <div className={`shrink-0 border-t border-app-divider ${collapsed ? 'px-2 py-3' : 'px-3 py-3'}`}>
        {!asDrawer ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center rounded-xl text-xs font-bold text-app-muted transition-all duration-150 hover:bg-app-panel hover:text-app-text ${collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'}`}
          >
            <svg className={`size-4 shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {!collapsed ? <span>Collapse</span> : null}
          </button>
        ) : null}
        {!collapsed ? (
          <div className="mt-2 flex items-center gap-2 border-t border-app-divider pt-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-app-accentTint text-app-accentDark">
              <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-app-text">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="truncate text-[10px] text-app-muted">Centre Point Hospitality Group</div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );

  const sidebarWidthClass = sidebarCollapsed ? 'w-16' : 'w-64 xl:w-72';
  const mainPaddingClass = sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64 xl:pl-72';

  return (
    <div className="min-h-screen overflow-x-hidden text-app-text">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-app-border bg-app-sidebar backdrop-blur-2xl transition-all duration-300 ease-out lg:flex ${sidebarWidthClass}`}
      >
        {renderSidebar(sidebarCollapsed)}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${mobileNavOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileNavOpen}
      >
        <div
          onClick={() => setMobileNavOpen(false)}
          className={`absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-200 ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 flex-col border-r border-app-border bg-white shadow-glass transition-transform duration-300 ease-out ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {renderSidebar(false, { onItemClick: () => setMobileNavOpen(false), asDrawer: true })}
        </aside>
      </div>

      {/* Main */}
      <main className={`transition-[padding] duration-300 ease-out ${mainPaddingClass}`}>
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-app-border/80 bg-white/75 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            {/* Left: breadcrumb + date */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-app-muted">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open menu"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-white/85 text-app-text shadow-card backdrop-blur-xl transition-all hover:border-app-borderStrong hover:bg-white lg:hidden"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
                <span className="hidden size-5 items-center justify-center rounded-md bg-app-accentTint text-app-accentDark sm:flex">
                  <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    {NAV_GROUPS.flatMap(g => g.items).find(i => i.key === active)?.icon}
                  </svg>
                </span>
                <span className="text-app-subtle">{activePage[1]}</span>
                <span className="text-app-subtle">·</span>
                <span className="text-app-text">{activePage[2]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DateControl
                  value={date}
                  onChange={setDate}
                  latest={today}
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
                {status ? (
                  <span className="max-w-xs truncate text-xs font-medium text-app-muted">{status}</span>
                ) : null}
                {riskCount > 0 ? (
                  <button
                    onClick={() => setActive('flags')}
                    className="group flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/80 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100 transition-all hover:bg-rose-100 hover:shadow-sm"
                  >
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                    </span>
                    {riskCount} risks
                  </button>
                ) : null}
              </div>
            </div>
            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              <ActionButton onClick={() => setActive('pdf')} disabled={!data} variant="primary">Preview PDF</ActionButton>
              <div className="ml-1 h-5 w-px bg-app-border" />
              <button
                onClick={lockApp}
                title="Lock dashboard"
                className="flex items-center gap-1.5 rounded-xl border border-app-border bg-white/85 px-3 py-2 text-xs font-semibold text-app-muted shadow-card backdrop-blur-xl transition-all hover:border-app-borderStrong hover:bg-white hover:text-app-text hover:shadow-cardHover"
              >
                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="hidden sm:inline">Lock</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="space-y-5 p-4 lg:p-8">
          {data && !Object.values(data.importSource ?? {}).some((v) => v) ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-4 text-sm text-amber-800 ring-1 ring-amber-100 backdrop-blur-xl animate-fade-in-up">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-amber-600 ring-1 ring-amber-100">
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.007M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <span className="leading-relaxed">
                <strong className="font-bold">No data imported for {date}.</strong> The daily import hasn't run yet for this date, or no reports arrived. Data will appear automatically once imported — check back later or run the importer manually.
              </span>
            </div>
          ) : null}
          <div key={active} className="space-y-5 animate-fade-in-up">
            {page ?? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-app-border bg-white/85 py-24 text-center shadow-card backdrop-blur-xl">
                <div className="relative">
                  <div className="size-10 animate-spin rounded-full border-[3px] border-app-accent border-t-transparent" />
                  <div className="absolute inset-0 size-10 animate-ping rounded-full border border-app-accent/40" />
                </div>
                <p className="text-sm font-medium text-app-muted">Loading dashboard data...</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
