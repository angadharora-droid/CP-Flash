import React, { useEffect, useMemo, useState } from 'react';
import { generateAiNotes, getSeed, getSourceStatus, loginWithPin, reportPdfPreviewUrl, reportPdfUrl, saveData } from './lib/api';
import { groupRevenue, money, numberValue, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from './lib/calculations';
import DataTable from './components/DataTable';
import FlagBadge from './components/FlagBadge';
import KpiRow from './components/KpiRow';
import SectionCard from './components/SectionCard';
import StatStrip from './components/StatStrip';

const NOW = new Date().toISOString().slice(0, 10);
const d = new Date(); d.setDate(d.getDate() - 1);
const today = d.toISOString().slice(0, 10);
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
  Imported: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Entered: 'border-teal-200 bg-teal-50 text-teal-700',
  Pending: 'border-amber-200 bg-amber-50 text-amber-700'
};

function fmtDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getFreshness(importedAt, hasData, fileDate) {
  if (!importedAt && !hasData) return { label: 'Pending', cls: 'border-stone-200 bg-stone-50 text-stone-600' };
  const label = fmtDate(fileDate);
  const diff = Math.round((new Date(NOW) - new Date(fileDate)) / 86400000);
  if (importedAt) {
    if (diff === 0) return { label, cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    if (diff === 1) return { label, cls: 'border-amber-200 bg-amber-50 text-amber-700' };
    return { label, cls: 'border-red-200 bg-red-50 text-red-700' };
  }
  if (diff === 0) return { label, cls: 'border-teal-200 bg-teal-50 text-teal-700' };
  if (diff === 1) return { label, cls: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label, cls: 'border-stone-200 bg-stone-50 text-stone-600' };
}

function hasKpiData(rows) {
  return (rows ?? []).some((r) => String(r.actual ?? '').trim() !== '');
}

function FreshnessBadge({ label, cls }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function ReportValue({ value, className = '' }) {
  const empty = value === '' || value == null;
  return (
    <span className={`block min-w-24 rounded-md px-2.5 py-1.5 text-sm ${empty ? 'text-slate-300' : 'bg-app-panel text-app-text'} ${className}`}>
      {empty ? '—' : value}
    </span>
  );
}

function PageTitle({ title, subtitle, badge }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-app-border bg-white shadow-sm">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-teal-400 to-teal-700" />
      <div className="px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-app-text">{title}</h1>
          {badge ? <FreshnessBadge {...badge} /> : null}
        </div>
        {subtitle ? <p className="mt-1 text-sm leading-relaxed text-app-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function KpiTable({ rows }) {
  const headers = ['KPI Name', 'AOP Target', 'Today Actual', 'MTD', 'YTD', 'Status'];
  return (
    <div className="overflow-auto rounded-xl border border-app-border bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            {headers.map((h, i) => (
              <th key={h} className={`whitespace-nowrap border-b border-app-border px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-400 ${i === 2 ? 'bg-teal-50/50' : ''}`}>
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 py-2 text-xs font-bold text-app-text shadow-sm transition hover:border-app-borderStrong hover:bg-slate-50 whitespace-nowrap"
    >
      <svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
      </svg>
      {label}
    </a>
  );
}

function ActionButton({ children, onClick, type = 'button', variant = 'secondary', disabled = false, className = '' }) {
  const cls = variant === 'primary'
    ? 'border-teal-700 bg-teal-600 text-white shadow-sm hover:bg-teal-500 hover:border-teal-600 active:bg-teal-700'
    : 'border-app-border bg-white text-app-text shadow-sm hover:border-app-borderStrong hover:bg-slate-50 active:bg-slate-100';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function SegmentedControl({ items, value, onChange }) {
  return (
    <div className="flex max-w-full w-fit gap-1 overflow-x-auto rounded-xl border border-app-border bg-slate-100/80 p-1">
      {items.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex shrink-0 items-center gap-2.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${value === key ? 'bg-white text-teal-700 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}
        >
          <span>{label}</span>
          {badge ? <FreshnessBadge {...badge} /> : null}
        </button>
      ))}
    </div>
  );
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #0d2420 55%, #0f172a 100%)' }}
    >
      {/* Background glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-teal-500/10 blur-[80px]" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-teal-700/10 blur-[80px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-[600px] w-[600px] rounded-full bg-teal-500/4 blur-[120px]" />
        </div>
      </div>
      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
      />

      <form onSubmit={submit} className="relative z-10 w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="relative">
            <div
              className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-xl font-extrabold text-white ring-1 ring-white/15"
              style={{ width: '4.5rem', height: '4.5rem', boxShadow: '0 20px 60px rgba(13, 148, 136, 0.4)' }}
            >
              CP
            </div>
            <div className="absolute -inset-2 rounded-[22px] bg-teal-500/20 blur-xl -z-10" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-teal-400">DailyFlash</div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white">CP Flash Report</h1>
            <p className="mt-1 text-sm text-slate-400">Centre Point Hospitality Group</p>
          </div>
        </div>

        {/* Glass auth card */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-2xl">
          <div className="border-b border-white/8 px-6 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Secure Access</p>
          </div>
          <div className="px-6 py-6">
            {/* PIN dot indicator */}
            <div className="mb-5 flex justify-center gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={`h-3 w-3 rounded-full transition-all duration-300 ${
                    i < pin.length
                      ? 'scale-125 bg-teal-400'
                      : 'scale-100 bg-white/15'
                  }`}
                  style={i < pin.length ? { boxShadow: '0 0 8px rgba(45, 212, 191, 0.7)' } : {}}
                />
              ))}
            </div>

            <input
              autoFocus
              inputMode="numeric"
              type="password"
              autoComplete="new-password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-full rounded-xl border px-4 py-3.5 text-center text-2xl font-bold tracking-[0.4em] text-white outline-none placeholder-white/20 transition-all duration-200"
              style={{
                colorScheme: 'dark',
                backgroundColor: focused ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.07)',
                borderColor: focused ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.1)',
                boxShadow: focused ? '0 0 0 2px rgba(20,184,166,0.2)' : 'none',
              }}
              placeholder="••••••"
            />

            {status ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium text-red-300">
                <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {status}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ boxShadow: '0 8px 24px rgba(13, 148, 136, 0.35)' }}
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

        <p className="mt-5 text-center text-xs text-slate-500">Contact your administrator if you need access.</p>
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
    acc.totalAmount += numberValue(row.chequeTotalAmount);
    acc.hand += numberValue(row.chequesInHand);
    acc.fd += numberValue(row.fdTotal);
    return acc;
  }, { actual: 0, issued: 0, totalAmount: 0, hand: 0, fd: 0 });
  const net = (row) =>
    String(row.netBalance ?? '').trim() !== ''
      ? numberValue(row.netBalance)
      : numberValue(row.actualBalance) + numberValue(row.fdTotal)
        - numberValue(row.chequesIssued) + numberValue(row.chequesInHand);
  const netTotal = rows.reduce((sum, row) => sum + net(row), 0);

  return (
    <>
      <PageTitle title="Bank Position" subtitle="Daily account-wise cash visibility." badge={badge} />
      <div className="flex justify-end">
        <SheetLink url={SHEET_URLS.bankPosition} />
      </div>
      <DataTable
        columns={['Unit / Account', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheque Total Amount', 'Cheques in Hand', 'Net Balance Available']}
        rows={rows.map((row) => ({
          key: `${row.unit}-${row.account ?? row.unit}`,
          cells: [
            <div>
              <div className="font-semibold text-app-text">{row.unit}</div>
              {row.account ? <div className="text-xs font-medium text-app-muted">{row.account}</div> : null}
            </div>,
            <ReportValue value={row.actualBalance} />,
            <ReportValue value={row.fdTotal ?? ''} />,
            <ReportValue value={row.chequesIssued} />,
            <ReportValue value={row.chequeTotalAmount ?? ''} />,
            <ReportValue value={row.chequesInHand} />,
            <span className="font-bold text-app-text">{money(net(row))}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-3 py-3">GROUP TOTAL</td>
            <td className="px-3 py-3">{money(totals.actual)}</td>
            <td className="px-3 py-3">{money(totals.fd)}</td>
            <td className="px-3 py-3">{money(totals.issued)}</td>
            <td className="px-3 py-3">{money(totals.totalAmount)}</td>
            <td className="px-3 py-3">{money(totals.hand)}</td>
            <td className="px-3 py-3">{money(netTotal)}</td>
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
      <PageTitle title="Unit-wise Estimated P&L" subtitle="Revenue, purchases, fixed cost, and estimated profitability." badge={badge} />
      <SectionCard title="Config: Daily Fixed Cost per Unit">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rows.map((row) => (
            <label key={row.unit} className="text-sm font-medium text-app-muted">
              {row.unit}
              <ReportValue value={row.fixedCost} className="mt-1" />
            </label>
          ))}
        </div>
      </SectionCard>
      <StatStrip items={[{ label: 'Group Revenue', value: money(totals.revenue) }, { label: 'Gross Profit', value: money(totals.gp), tone: totals.gp >= 0 ? 'text-emerald-700' : 'text-red-700' }, { label: 'Estimated Net Profit', value: money(totals.net), tone: totals.net >= 0 ? 'text-emerald-700' : 'text-red-700' }, { label: 'Net Margin', value: percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0) }]} />
      <DataTable
        columns={['Unit', 'Revenue Today', 'Purchases Today', 'Gross Profit', 'GP%', 'Fixed Cost (Daily)', 'Est. Net Profit', 'Net Margin%', 'MTD Net Profit', 'YTD Net Profit']}
        rows={rows.map((row) => ({
          key: row.unit,
          cells: [
            <span className="font-semibold text-app-text">{row.unit}</span>,
            <ReportValue value={row.revenueToday} />,
            <ReportValue value={row.purchasesToday} />,
            <span className="text-app-text">{money(row.grossProfit)}</span>,
            <span className={row.gpPercent >= 0 ? 'text-emerald-700' : 'text-red-700'}>{percent(row.gpPercent)}</span>,
            <ReportValue value={row.fixedCost} />,
            <span className={row.estNetProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>{money(row.estNetProfit)}</span>,
            <span className={row.netMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}>{percent(row.netMargin)}</span>,
            <ReportValue value={row.mtdNetProfit} />,
            <ReportValue value={row.ytdNetProfit} />
          ]
        }))}
        footer={
          <tr>
            <td className="px-3 py-3">GROUP TOTAL</td>
            <td className="px-3 py-3">{money(totals.revenue)}</td>
            <td className="px-3 py-3">{money(totals.purchases)}</td>
            <td className="px-3 py-3">{money(totals.gp)}</td>
            <td className="px-3 py-3">{percent(totals.revenue ? (totals.gp / totals.revenue) * 100 : 0)}</td>
            <td className="px-3 py-3">{money(totals.fixed)}</td>
            <td className="px-3 py-3">{money(totals.net)}</td>
            <td className="px-3 py-3">{percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0)}</td>
            <td className="px-3 py-3">{money(totals.mtd)}</td>
            <td className="px-3 py-3">{money(totals.ytd)}</td>
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
      <PageTitle title="Watch Out Flag Summary" subtitle="Auto-generated risks from all unit KPIs." />
      <StatStrip items={[{ label: 'On Track', value: counts.on, tone: 'text-emerald-700' }, { label: 'Watch', value: counts.watch, tone: 'text-amber-700' }, { label: 'Action Needed', value: counts.action, tone: 'text-red-700' }]} />
      <DataTable
        columns={['Unit', 'KPI Name', 'AOP Target', 'Today Actual', '% vs Target', 'Flag']}
        rows={filtered.map((row) => ({
          key: `${row.unit}-${row.kpiName}`,
          cells: [row.unit, row.kpiName, row.aopTarget, row.todayActual, `${row.percentVsTarget}%`, <FlagBadge label={row.flag} />]
        }))}
      />
    </>
  );
}

function SourceControlPage({ date, authToken }) {
  const [sourceStatus, setSourceStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSourceStatus(await getSourceStatus(date, authToken));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date, authToken]);

  const sources = sourceStatus?.sources ?? [];
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '-';

  return (
    <>
      <PageTitle title="Source Control" subtitle="Daily feed status for mail, sheets, POS, and manual sources." />
      <StatStrip items={[
        { label: 'Total Sources', value: sourceStatus?.total ?? '-' },
        { label: 'Imported', value: sourceStatus?.imported ?? '-', tone: 'text-emerald-700' },
        { label: 'Entered', value: sourceStatus?.entered ?? '-', tone: 'text-teal-700' },
        { label: 'Pending', value: sourceStatus?.pending ?? '-', tone: sourceStatus?.pending ? 'text-amber-700' : 'text-emerald-700' }
      ]} />
      <SectionCard title="Daily Sources">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-app-muted">{loading ? 'Checking sources...' : `Status for ${date}`}</div>
          <ActionButton onClick={load} disabled={loading}>Refresh</ActionButton>
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
      <PageTitle title={title} subtitle={subtitle} badge={badge} />
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
      <PageTitle title="Hotels Data" subtitle="Separate operating dashboards for CP Nagpur and CP Navi Mumbai." />
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
      <PageTitle title="F&B Outlet Data" subtitle="Pablo and Dali sales, cost, AOP, and top items." />
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
      <PageTitle title="Purosoul Data" subtitle="Revenue, RM cost, production, dispatch, and stock." badge={badge} />
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
      <PageTitle title="Settlement" subtitle="Mode-wise settlement matrix and revenue reconciliation." badge={badge} />
      <DataTable
        columns={['Settlement Mode', ...UNITS, 'Group Total']}
        rows={settlementModes.map((mode) => ({
          key: mode,
          cells: [
            <span className="font-semibold">{mode}</span>,
            ...UNITS.map((unit) => <ReportValue key={unit} value={data.settlement?.[mode]?.[unit]} />),
            <span className="font-bold">{money(totals.rowTotals[mode])}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-3 py-3">UNIT TOTAL</td>
            {UNITS.map((unit) => <td key={unit} className="px-3 py-3">{money(totals.unitTotals[unit])}</td>)}
            <td className="px-3 py-3">{money(totals.groupTotal)}</td>
          </tr>
        }
      />
      <SectionCard title="Reconciliation">
        <StatStrip items={[
          { label: 'Total Revenue Today', value: money(revenue) },
          { label: 'Total Settled', value: money(totals.groupTotal) },
          { label: 'Difference', value: money(diff), tone: diff === 0 ? 'text-emerald-700' : 'text-red-700' },
          { label: 'Status', value: diff === 0 ? 'MATCHED' : 'MISMATCH', tone: diff === 0 ? 'text-emerald-700' : 'text-red-700' }
        ]} />
      </SectionCard>
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
      <PageTitle title="Notes by AI" subtitle="Claude-generated morning management briefing." />
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
      <PageTitle title="PDF Preview" subtitle={`Daily flash report - ${date}`} badge={null} />

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
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('dailyflashToken') || '');

  useEffect(() => {
    if (!authToken) return;
    setData(null);
    setStatus('Loading...');
    getSeed(date, authToken)
      .then(({ seed, saved }) => {
        setData({ ...seed, ...(saved ?? {}) });
        setStatus(saved ? `Loaded saved data for ${date}` : `Loaded seed data for ${date}`);
      })
      .catch((err) => {
        if (/PIN|Unauthorized|Unable to load seed data/i.test(err.message)) {
          localStorage.removeItem('dailyflashToken');
          setAuthToken('');
        }
        setStatus(err.message);
      });
  }, [date, authToken]);

  const page = useMemo(() => {
    if (!data) return null;
    const common = { data, setData, date, authToken };
    if (active === 'sources') return <SourceControlPage date={date} authToken={authToken} />;
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
  }, [active, data, date, authToken]);

  const exportPdf = async () => {
    setStatus('Preparing PDF...');
    try {
      await saveData(date, data, authToken);
      window.location.href = reportPdfUrl(date, authToken);
      setStatus(`PDF generated for ${date}`);
    } catch (err) {
      setStatus(err.message);
    }
  };

  const lockApp = () => {
    localStorage.removeItem('dailyflashToken');
    setAuthToken('');
    setData(null);
  };

  const riskCount = data ? withFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').length : 0;
  const activePage = pages.find(([key]) => key === active) ?? pages[0];

  if (!authToken) return <PinGate onUnlock={setAuthToken} />;

  return (
    <div className="min-h-screen overflow-x-hidden bg-app-bg text-app-text">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-white/6 bg-app-sidebar lg:flex xl:w-72">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/6 px-5 py-5">
          <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-extrabold text-white">
            CP
            <div className="absolute -inset-0.5 rounded-[13px] bg-teal-500/25 blur-md -z-10" />
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-teal-400/90">DailyFlash</div>
            <div className="text-sm font-bold leading-tight text-white">CP Flash Report</div>
            <div className="text-[11px] text-slate-500">Centre Point Hospitality</div>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-6">
              <div className="mb-2 px-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-600">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActive(key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all duration-150 ${
                      active === key
                        ? 'bg-teal-600/95 text-white shadow-lg shadow-teal-900/40 ring-1 ring-teal-500/30'
                        : 'text-slate-400 hover:bg-white/6 hover:text-slate-200'
                    }`}
                  >
                    <svg className={`size-4 shrink-0 transition-colors ${active === key ? 'text-teal-100' : 'text-slate-500'}`} fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      {icon}
                    </svg>
                    <span className="truncate">{label}</span>
                    {key === 'flags' && riskCount > 0 ? (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                        {riskCount}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        {/* Footer */}
        <div className="shrink-0 border-t border-white/6 px-5 py-3.5">
          <div className="text-[11px] font-medium text-slate-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-600">Centre Point Hospitality Group</div>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:pl-64 xl:pl-72">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/96 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            {/* Left: breadcrumb + date */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                <svg className="size-3.5 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {NAV_GROUPS.flatMap(g => g.items).find(i => i.key === active)?.icon}
                </svg>
                <span className="text-slate-300">{activePage[1]}</span>
                <span className="text-slate-300">·</span>
                <span>{activePage[2]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-sm font-semibold text-app-text outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
                />
                {status ? (
                  <span className="hidden max-w-xs truncate text-xs text-slate-400 sm:block">{status}</span>
                ) : null}
                {riskCount > 0 ? (
                  <button
                    onClick={() => setActive('flags')}
                    className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 transition-all hover:bg-red-100"
                  >
                    <span className="size-1.5 rounded-full bg-red-500" />
                    {riskCount} risks
                  </button>
                ) : null}
              </div>
            </div>
            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              <ActionButton onClick={() => setActive('ai')} disabled={!data}>AI Report</ActionButton>
              <ActionButton onClick={exportPdf} disabled={!data}>Export PDF</ActionButton>
              <ActionButton onClick={() => setActive('pdf')} disabled={!data} variant="primary">Preview PDF</ActionButton>
              <div className="ml-1 h-5 w-px bg-slate-200" />
              <button
                onClick={lockApp}
                className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm transition-all hover:border-app-borderStrong hover:bg-slate-50 hover:text-slate-700"
              >
                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Lock
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="space-y-5 p-4 lg:p-8">
          {/* Mobile nav */}
          <div className="lg:hidden">
            <select
              value={active}
              onChange={(e) => setActive(e.target.value)}
              className="w-full rounded-xl border border-app-border bg-white px-4 py-3 text-sm font-semibold text-app-text shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
            >
              {NAV_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map(({ key, label }) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {page ?? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-app-border bg-white py-20 text-center shadow-sm">
              <div className="size-8 animate-spin rounded-full border-[2.5px] border-teal-600 border-t-transparent" />
              <p className="text-sm font-medium text-app-muted">Loading dashboard data...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
