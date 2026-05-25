import React, { useEffect, useMemo, useState } from 'react';
import { statusTone } from '../components/DashboardUi';
import { getEmailImportStatus, getSourceStatus, runEmailImport } from '../lib/api';

const AUTO_REFRESH_MS = 2 * 60 * 1000;

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

// Material Symbol icon per unit grouping.
const UNIT_ICON = {
  'Bank Statement': 'account_balance',
  'CP Nagpur': 'hotel',
  'CP NM': 'apartment',
  Pablo: 'restaurant',
  Dali: 'restaurant',
  Rabbits: 'delivery_dining',
  "Micky's": 'inventory_2',
  Purosoul: 'factory'
};

const UNIT_TINT = {
  'Bank Statement': { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
  'CP Nagpur':      { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
  'CP NM':          { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' },
  Pablo:            { bg: 'bg-tertiary-container/70', text: 'text-on-tertiary-container', border: 'border-tertiary/25' },
  Dali:             { bg: 'bg-tertiary-container/70', text: 'text-on-tertiary-container', border: 'border-tertiary/25' },
  Rabbits:          { bg: 'bg-error-container/45', text: 'text-error', border: 'border-error/20' },
  "Micky's":        { bg: 'bg-secondary-container/45', text: 'text-on-secondary-container', border: 'border-secondary/25' },
  Purosoul:         { bg: 'bg-tertiary-container/70', text: 'text-on-tertiary-container', border: 'border-tertiary/25' }
};
const DEFAULT_TINT = { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' };

function StatusPill({ status, animated }) {
  const map = {
    Imported: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', dot: 'bg-primary', label: 'Stable' },
    Partial:  { bg: 'bg-tertiary-container/70', text: 'text-on-tertiary-container', border: 'border-tertiary/25', dot: 'bg-tertiary', label: 'Syncing' },
    Entered:  { bg: 'bg-secondary-container/45', text: 'text-on-secondary-container', border: 'border-secondary/25', dot: 'bg-secondary', label: 'Manual' },
    Pending:  { bg: 'bg-error-container/45', text: 'text-error', border: 'border-error/20', dot: 'bg-error', label: 'Pending' }
  };
  const cfg = map[status] ?? map.Pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`size-1.5 rounded-full ${cfg.dot} ${animated ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function SourceStat({ label, value, tone = 'text-on-surface' }) {
  return (
    <div className="min-w-0 rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/60">{label}</div>
      <div className={`num mt-1 truncate text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function unitAggregateStatus(sources) {
  if (!sources.length) return 'Pending';
  const imported = sources.filter((s) => s.status === 'Imported').length;
  const entered = sources.filter((s) => s.status === 'Entered').length;
  if (imported === sources.length) return 'Imported';
  if (imported + entered === sources.length) return 'Entered';
  if (imported || entered) return 'Partial';
  return 'Pending';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SourceControlPage({ date, authToken, onOpenReportPreview, onRefreshData }) {
  const [sourceStatus, setSourceStatus] = useState(null);
  const [emailImport, setEmailImport] = useState(null);
  const [runningImport, setRunningImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openUnit, setOpenUnit] = useState(null);

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
    } catch { /* silent */ }
  }, [authToken]);

  const handleRunEmailImport = React.useCallback(async () => {
    setRunningImport(true);
    setError('');
    try {
      const status = await runEmailImport(authToken, { force: true });
      setEmailImport(status);
      window.setTimeout(() => { load(true); onRefreshData?.(); }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningImport(false);
    }
  }, [authToken, load, onRefreshData]);

  useEffect(() => { load(); loadEmailImportStatus(); }, [load, loadEmailImportStatus]);

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
  const importRunning = runningImport || emailImport?.running;
  const reportLabel = (report, index) => report?.label || `Report ${index + 1}`;
  const reportFile = (report) => typeof report === 'string' ? report : report?.file;
  const sourceReports = (source) => {
    if (source.sheetUrl) return [];
    return source.reports?.length
      ? source.reports
      : (source.reportFiles ?? []).map((file, index) => ({ label: `Report ${index + 1}`, file }));
  };

  const groupedSources = useMemo(() => sources.reduce((groups, source) => {
    const key = source.unit || 'Other';
    groups[key] = [...(groups[key] ?? []), source];
    return groups;
  }, {}), [sources]);

  const groupedEntries = Object.entries(groupedSources);

  // Synthetic recent-activity log built from import timestamps (newest first).
  const activity = useMemo(() => {
    const items = [];
    if (emailImport?.finishedAt) {
      items.push({
        time: emailImport.finishedAt,
        text: `Email import ${emailImport.exitCode === 0 ? 'completed' : 'failed'}.`,
        tone: emailImport.exitCode === 0 ? 'secondary' : 'error'
      });
    }
    if (emailImport?.startedAt && emailImport.running) {
      items.push({ time: emailImport.startedAt, text: 'Email import in progress…', tone: 'tertiary' });
    }
    sources.forEach((s) => {
      if (s.importedAt) {
        items.push({
          time: s.importedAt,
          text: `${s.unit}: imported ${s.label}.`,
          tone: 'secondary'
        });
      }
    });
    return items
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 6);
  }, [sources, emailImport]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleRunEmailImport}
          disabled={importRunning}
          className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-4 py-2 text-[12px] font-bold uppercase tracking-[0.05em] text-on-surface-variant shadow-sm transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface active:scale-95 disabled:opacity-50"
        >
          <MIcon name="sync" className={`text-[18px] ${importRunning ? 'animate-spin' : ''}`} />
          {importRunning ? 'Refreshing...' : 'Refresh Sources'}
        </button>
      </div>

      {error ? (
        <div className="glass-card mb-6 flex items-start gap-3 border border-error/20 bg-error/10 px-5 py-4 text-sm text-error">
          <MIcon name="error" className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* ---- Source horizontal tabs ---- */}
      <div className="mb-7 space-y-3">
        {groupedEntries.map(([unit, unitSources]) => {
          const imp = unitSources.filter((s) => s.status === 'Imported').length;
          const reportsCount = unitSources.reduce((sum, s) => sum + sourceReports(s).length, 0);
          const importedPct = unitSources.length ? Math.round((imp / unitSources.length) * 100) : 0;
          const aggStatus = unitAggregateStatus(unitSources);
          const tint = UNIT_TINT[unit] ?? DEFAULT_TINT;
          const icon = UNIT_ICON[unit] ?? 'database';
          const lastImported = unitSources
            .map((s) => s.importedAt)
            .filter(Boolean)
            .sort()
            .at(-1);
          const isOpen = openUnit === unit;

          return (
            <div key={unit} className="glass-card overflow-hidden transition-all duration-200 hover:shadow-cardHover">
              <button
                type="button"
                onClick={() => setOpenUnit(isOpen ? null : unit)}
                className="grid w-full grid-cols-1 items-center gap-3 px-3.5 py-3.5 text-left transition-colors hover:bg-primary/5 sm:px-5 sm:py-4 xl:grid-cols-[minmax(200px,1.2fr)_minmax(260px,1.4fr)_minmax(120px,0.5fr)_36px]"
                aria-expanded={isOpen}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg border ${tint.bg} ${tint.text} ${tint.border}`}>
                    <MIcon name={icon} filled className="text-[24px]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold leading-tight text-on-surface">{unit}</h3>
                    <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/65">
                      {unitSources[0]?.type ?? 'Daily Feed'}
                    </p>
                  </div>
                </div>

                <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
                  <SourceStat
                    label="Last Sync"
                    value={(
                      <>
                        {formatTime(lastImported)}
                        {lastImported ? <span className="ml-1 text-[11px] font-semibold text-on-surface-variant/60">({timeAgo(lastImported)})</span> : null}
                      </>
                    )}
                  />
                  <SourceStat label="Imported" value={`${imp} / ${unitSources.length}`} />
                  <SourceStat label="Reports" value={reportsCount || '-'} tone="text-secondary" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill status={aggStatus} animated={aggStatus === 'Partial' || (aggStatus === 'Imported' && importRunning)} />
                    <span className="num text-xs font-bold text-on-surface-variant">{importedPct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${aggStatus === 'Pending' ? 'bg-error' : aggStatus === 'Partial' ? 'bg-tertiary' : 'bg-primary'}`}
                      style={{ width: `${importedPct}%` }}
                    />
                  </div>
                </div>

                <div className="hidden size-9 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface-container-lowest text-primary xl:flex">
                  <MIcon name={isOpen ? 'expand_less' : 'expand_more'} className="text-[20px]" />
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-outline-variant/60 bg-surface-container-low px-3.5 py-4 animate-fade-in-up sm:px-5">
                  <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {unitSources.map((source) => (
                    <div key={source.id} className="rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-on-surface">{source.label}</div>
                          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/65">{source.type}</div>
                        </div>
                        <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusTone[source.status]}`}>{source.status}</span>
                      </div>
                      {source.notes ? <div className="mt-2 text-xs leading-5 text-on-surface-variant">{source.notes}</div> : null}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {source.sheetUrl ? (
                          <button
                            type="button"
                            onClick={() => onOpenReportPreview(source, source.sheetUrl, { type: 'google-sheet', title: `${source.label}: Source Sheet` })}
                            className="inline-flex items-center gap-1 rounded-md border border-outline-variant/60 bg-surface-container-low px-2.5 py-1 text-[11px] font-bold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            <MIcon name="open_in_new" className="text-[14px]" />
                            Sheet
                          </button>
                        ) : null}
                        {sourceReports(source).map((report, index) => {
                          const file = reportFile(report);
                          return (
                            <button
                              key={`${source.id}-${file ?? report.url}-${index}`}
                              type="button"
                              onClick={() => onOpenReportPreview(source, file)}
                              className="inline-flex items-center gap-1 rounded-md border border-outline-variant/60 bg-surface-container-low px-2.5 py-1 text-[11px] font-bold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
                            >
                              <MIcon name="visibility" className="text-[14px]" />
                              {reportLabel(report, index)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Empty/loading state */}
        {!groupedEntries.length && !loading ? (
          <div className="glass-card col-span-full flex flex-col items-center gap-3 px-6 py-16 text-center text-on-surface-variant">
            <MIcon name="cloud_off" className="text-[40px]" />
            <p className="text-sm font-medium">No sources to report yet.</p>
          </div>
        ) : null}
      </div>

      {false ? (
        <>
      {/* ---- Recent Activity Log ---- */}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <MIcon name="history" className="text-[20px] text-primary" />
            <h4 className="font-bold tracking-tight text-on-surface">Recent Activity Log</h4>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Live Updates</span>
          </div>
        </div>
        <div className="divide-y divide-outline-variant/50">
          {activity.length ? activity.map((item, idx) => {
            const dot = item.tone === 'error' ? 'bg-error' : item.tone === 'tertiary' ? 'bg-tertiary' : 'bg-secondary';
            return (
              <div key={idx} className="group flex items-start gap-3 px-4 py-4 transition-colors hover:bg-surface-container/30 sm:items-center sm:gap-6 sm:px-6">
                <span className="num w-16 shrink-0 text-[11px] font-medium text-on-surface-variant/50 sm:w-20">
                  {new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <div className={`size-2 rounded-full ${dot} transition-transform group-hover:scale-125`} />
                <span className="text-sm text-on-surface">{item.text}</span>
              </div>
            );
          }) : (
            <div className="px-6 py-12 text-center text-sm text-on-surface-variant">
              No activity yet — the daily import will populate this log once feeds arrive.
            </div>
          )}
        </div>
        <div className="bg-surface-container-lowest/50 px-6 py-3 text-center">
          <button className="text-[11px] font-bold uppercase tracking-widest text-primary hover:underline">
            View Historical Logs
          </button>
        </div>
      </div>
        </>
      ) : null}
    </>
  );
}
