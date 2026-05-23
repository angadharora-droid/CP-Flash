import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

const AUTO_REFRESH_MS = 2 * 60 * 1000;

export default function SourceControlPage({ date, authToken, onOpenReportPreview, onRefreshData }) {
  const [sourceStatus, setSourceStatus] = useState(null);
  const [emailImport, setEmailImport] = useState(null);
  const [runningImport, setRunningImport] = useState(false);
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

  const loadEmailImportStatus = React.useCallback(async () => {
    if (!authToken) return;
    try {
      setEmailImport(await getEmailImportStatus(authToken));
    } catch {
      // Source status is the primary signal on this page; keep this quiet if the status check races server startup.
    }
  }, [authToken]);

  const handleRunEmailImport = React.useCallback(async () => {
    setRunningImport(true);
    setError('');
    try {
      const status = await runEmailImport(authToken, { force: true });
      setEmailImport(status);
      window.setTimeout(() => {
        load(true);
        onRefreshData?.();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningImport(false);
    }
  }, [authToken, load, onRefreshData]);

  useEffect(() => {
    load();
    loadEmailImportStatus();
  }, [load, loadEmailImportStatus]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!emailImport?.running) return undefined;
    const timer = setInterval(() => {
      loadEmailImportStatus();
      load(true);
      onRefreshData?.();
    }, 5000);
    return () => clearInterval(timer);
  }, [emailImport?.running, load, loadEmailImportStatus, onRefreshData]);

  const sources = sourceStatus?.sources ?? [];
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '-';
  const importRunning = runningImport || emailImport?.running;
  const importMeta = emailImport?.running
    ? `Email import running since ${formatTime(emailImport.startedAt)}`
    : emailImport?.finishedAt
      ? `Last email import ${emailImport.exitCode === 0 ? 'finished' : 'failed'} at ${formatTime(emailImport.finishedAt)}`
      : 'Ready to run email import';
  const reportLabel = (report, index) => report?.label || `Report ${index + 1}`;
  const reportFile = (report) => typeof report === 'string' ? report : report?.file;
  const sourceReports = (source) => {
    if (source.sheetUrl) return [];
    return source.reports?.length
      ? source.reports
      : (source.reportFiles ?? []).map((file, index) => ({ label: `Report ${index + 1}`, file }));
  };
  const groupedSources = sources.reduce((groups, source) => {
    const key = source.unit || 'Other';
    groups[key] = [...(groups[key] ?? []), source];
    return groups;
  }, {});

  return (
    <>
      <PageTitle title="Source Control" subtitle="Daily feed status for mail, sheets, POS, and manual sources." activeKey="sources" />
      <StatStrip items={[
        { label: 'Total Sources', value: sourceStatus?.total ?? '-' },
        { label: 'Imported', value: sourceStatus?.imported ?? '-', tone: 'text-emerald-700' },
        { label: 'Entered', value: sourceStatus?.entered ?? '-', tone: 'text-teal-700' },
        { label: 'Pending', value: sourceStatus?.pending ?? '-', tone: sourceStatus?.pending ? 'text-amber-700' : 'text-emerald-700' }
      ]} />
      <SectionCard
        title="Daily Sources"
        meta={loading ? 'Checking sources...' : `Status for ${date}`}
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={handleRunEmailImport} disabled={importRunning} variant="primary">
              {importRunning ? 'Refreshing...' : 'Refresh'}
            </ActionButton>
          </div>
        )}
      >
        <div className={`mb-4 rounded-xl border px-3.5 py-2.5 text-sm font-medium ${emailImport?.exitCode && !emailImport?.running ? 'border-red-200 bg-red-50 text-red-700' : 'border-app-border bg-app-panel/70 text-app-muted'}`}>
          {importMeta}
        </div>
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        ) : null}
        <div className="space-y-3">
          {Object.entries(groupedSources).map(([unit, unitSources]) => {
            const imported = unitSources.filter((source) => source.status === 'Imported').length;
            const reportsCount = unitSources.reduce((sum, source) => sum + sourceReports(source).length, 0);
            return (
              <details key={unit} className="rounded-xl border border-app-border bg-white/80 px-4 py-3 shadow-sm" open={unit === 'Pablo' || unit === 'Dali' || unit === 'Rabbits'}>
                <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3">
                  <span className="font-extrabold text-app-text">{unit}</span>
                  <span className="text-xs font-bold text-app-muted">{imported}/{unitSources.length} imported · {reportsCount} report{reportsCount === 1 ? '' : 's'}</span>
                </summary>
                <div className="mt-3 divide-y divide-app-divider">
                  {unitSources.map((source) => (
                    <div key={source.id} className="grid gap-3 py-3 lg:grid-cols-[1.1fr_0.8fr_0.8fr_1.8fr]">
                      <div>
                        <div className="font-bold text-app-text">{source.label}</div>
                        <div className="mt-1 text-xs font-medium text-app-muted">{source.type}</div>
                      </div>
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusTone[source.status]}`}>{source.status}</span>
                      </div>
                      <div className="text-xs font-semibold text-app-muted">{formatTime(source.importedAt)}</div>
                      <div className="min-w-0">
                        {source.notes ? <div className="mb-2 text-xs leading-5 text-app-muted">{source.notes}</div> : null}
                        {source.sheetUrl ? (
                          <button
                            type="button"
                            onClick={() => onOpenReportPreview(source, source.sheetUrl, { type: 'google-sheet', title: `${source.label}: Source Sheet` })}
                            className="mb-2 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-app-border bg-white px-3 py-1.5 text-xs font-bold text-app-text shadow-sm transition-colors hover:border-app-borderStrong hover:bg-app-accentTint"
                          >
                            Preview Sheet
                          </button>
                        ) : null}
                        {sourceReports(source).length ? (
                          <details className="rounded-lg border border-app-border bg-app-panel/60 px-3 py-2">
                            <summary className="cursor-pointer select-none text-xs font-extrabold text-app-accentDark">
                              Reports ({sourceReports(source).length})
                            </summary>
                            <div className="mt-2 space-y-2">
                              {sourceReports(source).map((report, index) => {
                                const file = reportFile(report);
                                const title = reportLabel(report, index);
                                return (
                                  <div key={`${source.id}-${file ?? report.url}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
                                    <div className="min-w-0">
                                      <div className="text-xs font-bold text-app-text">{title}</div>
                                      <div className="break-all text-[11px] font-medium text-app-muted">{file ?? report.url}</div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => onOpenReportPreview(source, file)}
                                      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-app-border bg-white px-3 py-1.5 text-xs font-bold text-app-text shadow-sm transition-colors hover:border-app-borderStrong hover:bg-app-accentTint"
                                    >
                                      Preview
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : source.file ? <div className="break-all text-xs font-medium text-app-muted">{source.file}</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}
