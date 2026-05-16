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
const APP_BASE_PATH = '/flashreport';

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
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

function ReportValue({ value, className = '' }) {
  return (
    <span className={`block min-w-24 rounded-md bg-app-panel px-2.5 py-1.5 text-app-text ${className}`}>
      {value === '' || value == null ? '-' : value}
    </span>
  );
}

function PageTitle({ title, subtitle, badge }) {
  return (
    <div className="overflow-hidden rounded-xl border border-app-border bg-white shadow-sm">
      <div className="border-l-4 border-teal-600 px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-app-text">{title}</h1>
          {badge ? <FreshnessBadge {...badge} /> : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-sm text-app-muted">{subtitle}</p> : null}
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
              <th key={h} className={`whitespace-nowrap border-b border-app-border px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 ${i === 2 ? 'bg-teal-50/60' : ''}`}>
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
    ? 'border-teal-700 bg-teal-600 text-white shadow-sm hover:bg-teal-700'
    : 'border-app-border bg-white text-app-text shadow-sm hover:border-app-borderStrong hover:bg-slate-50';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 sm:px-4 sm:text-sm ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function SegmentedControl({ items, value, onChange }) {
  return (
    <div className="flex max-w-full w-fit gap-1 overflow-x-auto rounded-xl border border-app-border bg-slate-100/70 p-1">
      {items.map(({ key, label, badge }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex shrink-0 items-center gap-2.5 rounded-lg px-4 py-2 text-sm font-bold transition-all ${value === key ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
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
    <main className="grid min-h-screen place-items-center bg-app-bg px-4 text-app-text">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-app-border bg-app-surface p-6 shadow-card">
        <div className="text-xs font-bold uppercase text-app-muted">DailyFlash</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Enter PIN</h1>
        <input
          autoFocus
          inputMode="numeric"
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
          className="mt-5 w-full rounded-md border border-app-border bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] outline-none transition focus:border-app-accent focus:ring-2 focus:ring-app-accent/15"
          placeholder="------"
        />
        {status ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">{status}</div> : null}
        <ActionButton type="submit" variant="primary" disabled={loading || pin.length < 4} className="mt-5 w-full">
          {loading ? 'Checking...' : 'Unlock'}
        </ActionButton>
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
        {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div> : null}
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
        {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</div> : null}
        <div className="min-h-96 whitespace-pre-wrap rounded-lg border border-app-border bg-app-panel p-5 leading-7 text-app-text">
          {loading ? 'Claude is preparing the briefing...' : text || 'No report generated yet.'}
        </div>
      </SectionCard>
    </>
  );
}

function PdfPreviewPage({ date, authToken, data, onSave }) {
  const [pdfKey, setPdfKey] = useState(0);
  const [frameState, setFrameState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setFrameState('loading');
    const timer = setTimeout(() => setFrameState((s) => s === 'loading' ? 'error' : s), 20000);
    return () => clearTimeout(timer);
  }, [pdfKey, date]);

  const previewUrl = reportPdfPreviewUrl(date, authToken);
  const downloadUrl = reportPdfUrl(date, authToken);

  const handleSaveAndRefresh = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setFrameState('loading');
      setPdfKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="PDF Preview" subtitle={`Daily flash report · ${date}`} badge={null} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-app-muted">
          <svg className="size-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          Preview reflects the last <strong className="font-bold text-app-text">saved</strong> state — save first to see latest changes.
        </div>
        <div className="flex flex-wrap gap-2">
          {saveError ? <span className="self-center text-xs font-medium text-red-600">{saveError}</span> : null}
          <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">
            {saving ? 'Saving…' : 'Save & Refresh'}
          </ActionButton>
          <ActionButton onClick={() => window.open(previewUrl, '_blank')}>Open in New Tab</ActionButton>
          <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
        </div>
      </div>

      {/* Frame container */}
      <div
        className="relative overflow-hidden rounded-xl border border-app-border shadow-sm"
        style={{ height: 'calc(100vh - 320px)', minHeight: '480px' }}
      >
        {/* Loading overlay */}
        {frameState === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white">
            <div className="size-9 animate-spin rounded-full border-[3px] border-teal-600 border-t-transparent" />
            <p className="text-sm font-medium text-app-muted">Generating PDF preview…</p>
          </div>
        )}

        {/* Error state */}
        {frameState === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white p-8 text-center">
            <svg className="size-14 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div>
              <p className="text-base font-bold text-app-text">Preview unavailable</p>
              <p className="mt-1 text-sm text-app-muted">Your browser may not support inline PDF display. Use one of the options below.</p>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => window.open(previewUrl, '_blank')} variant="primary">Open in New Tab</ActionButton>
              <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
            </div>
          </div>
        )}

        <iframe
          key={`${date}-${pdfKey}`}
          src={previewUrl}
          title="Daily Flash Report PDF"
          className="h-full w-full bg-slate-100"
          onLoad={() => setFrameState('ready')}
          onError={() => setFrameState('error')}
        />
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
    const { pathname, search, hash } = window.location;
    if (pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`)) return;
    window.history.replaceState(null, '', `${APP_BASE_PATH}${pathname === '/' ? '/' : pathname}${search}${hash}`);
  }, []);

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
    if (active === 'pdf') return <PdfPreviewPage date={date} authToken={authToken} data={data} onSave={() => saveData(date, data, authToken)} />;
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
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-white/8 bg-app-sidebar lg:flex xl:w-72">
        {/* Brand */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-5 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-sm font-extrabold text-white shadow-lg shadow-teal-900/40">
            CP
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-teal-400/80">DailyFlash</div>
            <div className="text-sm font-bold leading-tight text-white">CP Flash Report</div>
            <div className="text-[11px] text-slate-400">Centre Point Hospitality</div>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="mb-1.5 px-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActive(key)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all ${active === key ? 'bg-teal-600 text-white shadow-md shadow-teal-900/30' : 'text-slate-400 hover:bg-white/8 hover:text-white'}`}
                  >
                    <svg className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                      {icon}
                    </svg>
                    <span className="truncate">{label}</span>
                    {key === 'flags' && riskCount > 0 ? (
                      <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
        <div className="shrink-0 border-t border-white/8 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:pl-64 xl:pl-72">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <svg className="size-3.5 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  {NAV_GROUPS.flatMap(g => g.items).find(i => i.key === active)?.icon}
                </svg>
                {activePage[1]} · {activePage[2]}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-sm font-bold text-app-text outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
                />
                {status ? <span className="max-w-xs truncate text-xs text-slate-400">{status}</span> : null}
                {riskCount > 0 ? (
                  <button onClick={() => setActive('flags')} className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 transition hover:bg-red-100">
                    {riskCount} risks
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ActionButton onClick={() => setActive('ai')} disabled={!data}>AI Report</ActionButton>
              <ActionButton onClick={() => setActive('pdf')} disabled={!data} variant="primary">Preview PDF</ActionButton>
              <ActionButton onClick={exportPdf} disabled={!data}>Download PDF</ActionButton>
              <ActionButton onClick={lockApp}>Lock</ActionButton>
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
              className="w-full rounded-xl border border-app-border bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
            >
              {NAV_GROUPS.flatMap(g => g.items).map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          {page ?? (
            <div className="rounded-xl border border-app-border bg-white p-8 text-center text-sm text-app-muted shadow-sm">
              Loading dashboard...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
