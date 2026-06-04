import React, { useMemo, useState } from 'react';
import { DonutChart } from '../components/DashboardCharts';
import { ActionButton, BrandLoader } from '../components/DashboardUi';
import FnbOutletSalesChart from '../components/FnbOutletSalesChart';
import RevenueShareDonut from '../components/RevenueShareDonut';
import SectionCard from '../components/SectionCard';
import { reportPdfUrl } from '../lib/api';
import { numberValue } from '../lib/calculations';
import {
  buildMonthOptions,
  buildWeekOptions,
  formatShortDate,
  monthKeyFromDate,
  weekEndFromStart,
  weekStartContaining
} from '../lib/weeks';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

const REPORT_TYPES = [
  { key: 'daily', label: 'Daily', icon: 'today' },
  { key: 'weekly', label: 'Weekly', icon: 'date_range' }
];

const EMPTY_WEEK = { revenue: 0, purchases: 0, gp: 0, netProfit: 0, days: 0, fixedCost: 0 };

function buildWeeklyPnlData(data, period) {
  return {
    ...(data ?? {}),
    pnl: (data?.pnl ?? []).map((row) => {
      const entry = period?.week?.[row.unit] ?? EMPTY_WEEK;
      return {
        ...row,
        revenueToday: String(Math.round((entry.revenue ?? 0) * 100) / 100),
        purchasesToday: String(Math.round((entry.purchases ?? 0) * 100) / 100),
        fixedCost: String(Math.round(((numberValue(row.fixedCost) || (entry.fixedCost ?? 0)) * 7) * 100) / 100),
      };
    }),
  };
}

function mixChartRows(mix, kind) {
  const entries = kind === 'source' ? (mix?.sbo ?? []) : (mix?.segment ?? []);
  return entries
    .map((row) => ({ name: row.name, value: numberValue(row.revenue) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

function MixDonutCard({ title, subtitle, mix, kind }) {
  const rows = mixChartRows(mix, kind);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <SectionCard title={title} subtitle={subtitle} icon="hotel" tone="amber" defaultOpen>
      <DonutChart data={rows} total={total} />
    </SectionCard>
  );
}

export default function PdfPreviewPage({ date, authToken, onSave, onClose, data = null, period = null }) {
  const initialWeekStart = weekStartContaining(date);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [reportType, setReportType] = useState('daily');
  const [draftReportType, setDraftReportType] = useState('daily');
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [draftWeekMonth, setDraftWeekMonth] = useState(monthKeyFromDate(initialWeekStart));
  const [draftWeekStart, setDraftWeekStart] = useState(initialWeekStart);
  const [showSetup, setShowSetup] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);

  const monthOptions = buildMonthOptions(date, 12);
  const draftWeekOptions = buildWeekOptions(draftWeekMonth);
  const activeDraftWeekStart = draftWeekOptions.find((week) => week.key === draftWeekStart)?.key
    ?? draftWeekOptions[0]?.key
    ?? initialWeekStart;
  const activeWeekEnd = weekEndFromStart(weekStart);
  const downloadUrl = reportPdfUrl(date, authToken, [], reportType, reportType === 'weekly' ? weekStart : '');
  const headerDateLabel = reportType === 'weekly'
    ? `${formatShortDate(weekStart)} - ${formatShortDate(activeWeekEnd)}`
    : date;

  const isWeekly = reportType === 'weekly';
  const weeklyPnlData = useMemo(() => buildWeeklyPnlData(data, period), [data, period]);
  const cpnMix = period?.occupancyMix?.['CP Nagpur'];
  const cpNmMix = period?.occupancyMix?.['CP NM'];

  const changeDraftWeekMonth = (monthKey) => {
    setDraftWeekMonth(monthKey);
    const weeks = buildWeekOptions(monthKey);
    if (weeks.length) setDraftWeekStart(weeks[0].key);
  };

  const openSetup = () => {
    setDraftReportType(reportType);
    setDraftWeekMonth(monthKeyFromDate(weekStart));
    setDraftWeekStart(weekStart);
    setShowSetup(true);
  };

  const cancelSetup = () => {
    if (!hasGenerated) { onClose(); return; }
    setShowSetup(false);
  };

  const generatePreview = () => {
    setReportType(draftReportType);
    if (draftReportType === 'weekly') setWeekStart(activeDraftWeekStart);
    setShowSetup(false);
    setHasGenerated(true);
  };

  const handleSaveAndRefresh = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-surface text-on-surface">
      <header className="print:hidden flex shrink-0 flex-col gap-3 border-b border-outline-variant/70 bg-surface-container-lowest px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
            <MIcon name="picture_as_pdf" filled />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-normal text-on-surface md:text-lg">Dashboard PDF Preview</h1>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">
              {isWeekly ? 'Weekly dashboard report' : 'Daily dashboard report'} / {headerDateLabel}
              {lastRefreshed ? ` / refreshed ${lastRefreshed}` : ''}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {saveError ? <span className="max-w-72 truncate text-xs font-semibold text-error">{saveError}</span> : null}
          {hasGenerated ? (
            <>
              <ActionButton onClick={openSetup}>
                <MIcon name="tune" className="text-[17px]" />
                Type
              </ActionButton>
              <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">
                {saving ? <BrandLoader size={18} /> : <MIcon name="sync" className="text-[17px]" />}
                {saving ? 'Saving...' : 'Save & Refresh'}
              </ActionButton>
              <ActionButton onClick={() => window.print()}>
                <MIcon name="print" className="text-[17px]" />
                Print
              </ActionButton>
              <ActionButton onClick={() => { window.location.href = downloadUrl; }}>
                <MIcon name="download" className="text-[17px]" />
                Download PDF
              </ActionButton>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close PDF preview"
          >
            <MIcon name="close" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto bg-surface-container p-3 md:p-5">
        {hasGenerated ? (
          <div className="mx-auto max-w-4xl space-y-5">
            <RevenueShareDonut
              data={isWeekly ? weeklyPnlData : data}
              title="Unit-wise Revenue Share"
              subtitle={isWeekly
                ? `P&L revenue contribution by unit - week to date (${formatShortDate(weekStart)} - ${formatShortDate(activeWeekEnd)})`
                : `P&L revenue contribution by unit - ${date}`
              }
            />
            <FnbOutletSalesChart
              data={data}
              period={isWeekly ? period : null}
              mode={isWeekly ? 'week' : 'today'}
            />
            {isWeekly && (cpnMix || cpNmMix) ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {cpnMix ? (
                  <>
                    <MixDonutCard
                      title="CP Nagpur: Source of Business"
                      subtitle="Week-to-date room source mix"
                      mix={cpnMix}
                      kind="source"
                    />
                    <MixDonutCard
                      title="CP Nagpur: Market Segment"
                      subtitle="Week-to-date room segment mix"
                      mix={cpnMix}
                      kind="segment"
                    />
                  </>
                ) : null}
                {cpNmMix ? (
                  <>
                    <MixDonutCard
                      title="CP NM: Source of Business"
                      subtitle="Week-to-date room source mix"
                      mix={cpNmMix}
                      kind="source"
                    />
                    <MixDonutCard
                      title="CP NM: Market Segment"
                      subtitle="Week-to-date room segment mix"
                      mix={cpNmMix}
                      kind="segment"
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid h-full min-h-0 place-items-center">
            <div className="max-w-md text-center text-on-surface-variant">
              <MIcon name="picture_as_pdf" className="text-[42px] text-primary" filled />
              <p className="mt-2 text-sm">Choose Daily or Weekly. The preview will include charts for that view.</p>
            </div>
          </div>
        )}
      </main>

      {showSetup ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-inverse-surface/50 p-4 animate-fade-in" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
                  <MIcon name="picture_as_pdf" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-on-surface">Generate Dashboard Preview</h2>
                  <p className="text-xs text-on-surface-variant">Daily and Weekly match the dashboard tabs.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelSetup}
                className="flex size-9 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                aria-label="Cancel setup"
              >
                <MIcon name="close" />
              </button>
            </div>

            <div className="px-5 py-4">
              <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.08em] text-on-surface-variant">Report Type</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-outline-variant/70 bg-surface-container-low p-1">
                {REPORT_TYPES.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraftReportType(key)}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold transition-colors ${
                      draftReportType === key
                        ? 'bg-primary text-on-primary shadow-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <MIcon name={icon} className="text-[17px]" />
                    {label}
                  </button>
                ))}
              </div>

              {draftReportType === 'weekly' ? (
                <div className="mt-5 rounded-lg border border-outline-variant/60 bg-surface-container-low px-3 py-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.08em] text-on-surface-variant">Month</span>
                      <select
                        value={draftWeekMonth}
                        onChange={(event) => changeDraftWeekMonth(event.target.value)}
                        className="h-10 w-full rounded-md border border-outline-variant/70 bg-surface-container-lowest px-3 text-sm font-bold text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      >
                        {monthOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-extrabold uppercase tracking-[0.08em] text-on-surface-variant">Week</span>
                      <select
                        value={activeDraftWeekStart}
                        onChange={(event) => setDraftWeekStart(event.target.value)}
                        className="h-10 w-full rounded-md border border-outline-variant/70 bg-surface-container-lowest px-3 text-sm font-bold text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      >
                        {draftWeekOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-outline-variant/60 bg-surface-container-low px-5 py-3">
              <ActionButton onClick={cancelSetup}>{hasGenerated ? 'Cancel' : 'Close'}</ActionButton>
              <ActionButton onClick={generatePreview} variant="primary">
                <MIcon name="bar_chart" className="text-[17px]" />
                {hasGenerated ? 'Update Preview' : 'Generate Preview'}
              </ActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
