import React, { useEffect, useMemo, useState } from 'react';
import { PageTitle, statusTone } from '../components/DashboardUi';
import { getEmailImportStatus, getSourceStatus, runEmailImport } from '../lib/api';

const AUTO_REFRESH_MS = 2 * 60 * 1000;

const Icon = ({ path, className = 'size-5', strokeWidth = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} viewBox="0 0 24 24" aria-hidden>
    {path}
  </svg>
);

const ICONS = {
  dataset: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75zM3.75 9.75h16.5M3.75 14.25h16.5" />,
  cloudDown: <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 6.75l-3-3m3 3l3-3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />,
  editSquare: <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zM19.5 14.25v4.875A2.625 2.625 0 0116.875 21.75H5.625A2.625 2.625 0 013 19.125V7.875A2.625 2.625 0 015.625 5.25H10.5" />,
  timer: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  bank: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l9 4.5M3 7.5h18M5.25 10.5v7.5M9.75 10.5v7.5M14.25 10.5v7.5M18.75 10.5v7.5M3 21h18" />,
  hotel: <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V8.25c0-.621.504-1.125 1.125-1.125H6.75V4.5c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125v2.625h2.625c.621 0 1.125.504 1.125 1.125V21M3 21h18M9 21V12h6v9M9.75 6.75h.008v.008H9.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.375 0h.008v.008h-.008V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
  restaurant: <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v6.75a3 3 0 003 3v8.25m0-18v6.75a3 3 0 01-3 3m6-9.75v18M17.25 3v18" />,
  factory: <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V11.25l6 3.75v-3.75l6 3.75V8.25l6 3.75V21H3zm3-3h2.25M11.25 18h2.25M16.5 18h2.25" />,
  sheet: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
  hub: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM12 15a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5zM4.5 12a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM15 12a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0zM9 12h6m-3-3v-1.5m0 9V15" />,
  refresh: <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0a8.25 8.25 0 0113.803-3.7l3.181 3.182m-17.034 0a8.25 8.25 0 0013.803 3.7l3.181-3.182" />,
  open: <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />,
  history: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12a9 9 0 11-3-6.708M21 4.5v4.5h-4.5" />,
  mail: <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />,
  warning: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />,
  download: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />,
  chevron: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
};

const UNIT_ICON = {
  'Bank Statement': ICONS.bank,
  'CP Nagpur': ICONS.hotel,
  'CP NM': ICONS.hotel,
  Pablo: ICONS.restaurant,
  Dali: ICONS.restaurant,
  Rabbits: ICONS.restaurant,
  "Micky's": ICONS.restaurant,
  Purosoul: ICONS.factory
};

function MetricCard({ label, value, tone = 'text-app-text', icon, accentBg, accentText, badge, progress, caption, pulse }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-app-border bg-white/90 shadow-card backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-app-borderStrong hover:shadow-cardHover">
      <div className="px-5 py-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className={`flex size-11 items-center justify-center rounded-xl ${accentBg} ${accentText} transition-transform duration-200 group-hover:scale-110`}>
            <Icon path={icon} className="size-5" />
          </div>
          {badge ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
              {badge}
            </span>
          ) : null}
          {pulse ? <span className="size-2 animate-pulse rounded-full bg-rose-500" /> : null}
        </div>
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-app-muted">{label}</h3>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className={`num text-[28px] font-extrabold leading-none tracking-tight tabular-nums ${tone}`}>
            {value}
          </span>
          {progress != null ? (
            <div className="ml-1 h-1.5 w-14 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          ) : caption ? (
            <span className="text-[11px] font-medium text-app-subtle">{caption}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UnitStatusBadge({ status, animated }) {
  const map = {
    Imported: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'COMPLETE' },
    Partial:  { tone: 'border-amber-200 bg-amber-50 text-amber-700',     dot: 'bg-amber-500',   label: 'PARTIAL' },
    Entered:  { tone: 'border-teal-200 bg-teal-50 text-teal-700',        dot: 'bg-teal-500',    label: 'ENTERED' },
    Pending:  { tone: 'border-rose-200 bg-rose-50 text-rose-700',        dot: 'bg-rose-500',    label: 'PENDING' }
  };
  const cfg = map[status] ?? map.Pending;
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-extrabold tracking-wider ${cfg.tone}`}>
      <span className={`size-1.5 rounded-full ${cfg.dot} ${animated ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
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

export default function SourceControlPage({ date, authToken, onOpenReportPreview, onRefreshData }) {
  const [sourceStatus, setSourceStatus] = useState(null);
  const [emailImport, setEmailImport] = useState(null);
  const [runningImport, setRunningImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

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
  const lastSyncLabel = emailImport?.finishedAt
    ? new Date(emailImport.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
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

  const total = sourceStatus?.total ?? '—';
  const imported = sourceStatus?.imported ?? 0;
  const entered = sourceStatus?.entered ?? 0;
  const pending = sourceStatus?.pending ?? 0;
  const importedProgress = sourceStatus?.total ? Math.round((imported / sourceStatus.total) * 100) : 0;

  return (
    <>
      <PageTitle title="Source Control" subtitle="Real-time status for mail, sheets, POS, and manual feeds." activeKey="sources" />

      {/* Bento metric grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Total Sources"
          value={total}
          icon={ICONS.dataset}
          accentBg="bg-app-accentTint"
          accentText="text-app-accentDark"
          caption="Active today"
        />
        <MetricCard
          label="Imported"
          value={imported}
          tone="text-emerald-700"
          icon={ICONS.cloudDown}
          accentBg="bg-emerald-50"
          accentText="text-emerald-700"
          progress={importedProgress}
        />
        <MetricCard
          label="Entered"
          value={entered}
          tone="text-teal-700"
          icon={ICONS.editSquare}
          accentBg="bg-teal-50"
          accentText="text-teal-700"
          caption="Manual input"
        />
        <MetricCard
          label="Pending"
          value={pending}
          tone={pending ? 'text-rose-700' : 'text-emerald-700'}
          icon={ICONS.timer}
          accentBg={pending ? 'bg-rose-50' : 'bg-emerald-50'}
          accentText={pending ? 'text-rose-600' : 'text-emerald-700'}
          caption={pending ? 'Awaiting feed' : 'Clear for now'}
          pulse={!!pending}
        />
      </div>

      {/* Main Daily Sources panel */}
      <section className="mt-5 overflow-hidden rounded-2xl border border-app-border bg-white/90 shadow-card backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-app-divider bg-app-panel/60 px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-b from-app-accentSoft to-app-accent text-white shadow-pop">
              <Icon path={ICONS.hub} className="size-5" />
            </div>
            <div>
              <h4 className="text-base font-bold tracking-tight text-app-text sm:text-lg">Daily Sources</h4>
              <p className="text-xs font-medium text-app-muted">
                {loading ? 'Checking sources…' : `Detailed connectivity status for ${date}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRunEmailImport}
            disabled={importRunning}
            className="inline-flex items-center gap-2 rounded-xl border border-app-accentDark bg-gradient-to-b from-app-accentSoft to-app-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-pop transition-all duration-150 hover:from-teal-400 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon path={ICONS.refresh} className={`size-4 ${importRunning ? 'animate-spin' : ''}`} />
            {importRunning ? 'Refreshing…' : 'Refresh All'}
          </button>
        </header>

        <div className="px-3 py-4 sm:px-5">
          <div className={`mb-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium ${emailImport?.exitCode && !emailImport?.running ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-app-border bg-app-panel/70 text-app-muted'}`}>
            {importMeta}
          </div>

          {error ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
              <Icon path={ICONS.warning} className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          ) : null}

          {/* Column header */}
          <div className="hidden grid-cols-12 gap-4 px-4 py-2 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-app-subtle sm:grid">
            <div className="col-span-4">Property / Connection</div>
            <div className="col-span-3 text-center">Status</div>
            <div className="col-span-3 text-center">Imported Reports</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="space-y-2">
            {Object.entries(groupedSources).map(([unit, unitSources]) => {
              const imp = unitSources.filter((s) => s.status === 'Imported').length;
              const reportsCount = unitSources.reduce((sum, s) => sum + sourceReports(s).length, 0);
              const aggStatus = unitAggregateStatus(unitSources);
              const isOpen = !!expanded[unit];
              const unitIcon = UNIT_ICON[unit] ?? ICONS.sheet;

              return (
                <div key={unit} className="rounded-xl border border-transparent transition-all duration-150 hover:border-app-border hover:bg-app-panel/40">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [unit]: !prev[unit] }))}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-12 items-center gap-4 px-4 py-4 text-left"
                  >
                    <div className="col-span-12 flex items-center gap-3.5 sm:col-span-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-app-border bg-white text-app-accentDark shadow-sm">
                        <Icon path={unitIcon} className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-app-text">{unit}</p>
                        <p className="text-[11px] font-medium text-app-muted">
                          {unitSources.length} feed{unitSources.length === 1 ? '' : 's'} · {unitSources[0]?.type ?? '—'}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-4 flex justify-start sm:col-span-3 sm:justify-center">
                      <UnitStatusBadge status={aggStatus} animated={aggStatus === 'Imported'} />
                    </div>
                    <div className="col-span-4 text-left sm:col-span-3 sm:text-center">
                      <span className="num inline-flex items-baseline gap-1.5 tabular-nums">
                        <span className="text-lg font-extrabold text-app-text">{imp}</span>
                        <span className="text-xs text-app-subtle">/</span>
                        <span className="text-sm font-semibold text-app-muted">{unitSources.length} imported</span>
                      </span>
                      {reportsCount ? (
                        <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wider text-app-subtle">· {reportsCount} report{reportsCount === 1 ? '' : 's'}</span>
                      ) : null}
                    </div>
                    <div className="col-span-4 flex items-center justify-end gap-1 sm:col-span-2">
                      <span className="hidden text-[11px] font-bold uppercase tracking-wider text-app-subtle sm:inline">
                        {isOpen ? 'Hide' : 'Details'}
                      </span>
                      <span className={`flex size-7 items-center justify-center rounded-lg text-app-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        <Icon path={ICONS.chevron} className="size-4" />
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-app-divider px-3 pb-4 pt-3 sm:px-4 animate-fade-in-up">
                      <div className="divide-y divide-app-divider">
                        {unitSources.map((source) => (
                          <div key={source.id} className="grid gap-3 py-3 lg:grid-cols-[1.4fr_0.8fr_0.9fr_1.6fr]">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-app-text">{source.label}</div>
                              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-app-subtle">{source.type}</div>
                            </div>
                            <div className="flex items-start">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[source.status]}`}>
                                {source.status}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-app-muted">
                              {formatTime(source.importedAt)}
                            </div>
                            <div className="min-w-0 space-y-2">
                              {source.notes ? <div className="text-xs leading-5 text-app-muted">{source.notes}</div> : null}
                              {source.sheetUrl ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenReportPreview(source, source.sheetUrl, { type: 'google-sheet', title: `${source.label}: Source Sheet` })}
                                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-app-border bg-white px-3 py-1.5 text-xs font-bold text-app-text shadow-sm transition-colors hover:border-app-borderStrong hover:bg-app-accentTint"
                                >
                                  <Icon path={ICONS.open} className="size-3.5" />
                                  Preview Sheet
                                </button>
                              ) : null}
                              {sourceReports(source).length ? (
                                <div className="space-y-1.5">
                                  {sourceReports(source).map((report, index) => {
                                    const file = reportFile(report);
                                    const title = reportLabel(report, index);
                                    return (
                                      <div
                                        key={`${source.id}-${file ?? report.url}-${index}`}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-app-borderSoft bg-white px-2.5 py-2"
                                      >
                                        <div className="min-w-0">
                                          <div className="text-xs font-bold text-app-text">{title}</div>
                                          <div className="break-all text-[11px] font-medium text-app-muted">{file ?? report.url}</div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => onOpenReportPreview(source, file)}
                                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-app-border bg-white px-2.5 py-1.5 text-[11px] font-bold text-app-text shadow-sm transition-colors hover:border-app-borderStrong hover:bg-app-accentTint"
                                        >
                                          <Icon path={ICONS.open} className="size-3" />
                                          Preview
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : source.file ? <div className="break-all text-xs font-medium text-app-muted">{source.file}</div> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-divider bg-app-panel/50 px-5 py-3 sm:px-7">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-app-subtle">Cloud Health</span>
              <div className="flex items-end gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const filled = sourceStatus?.total ? i < Math.round((imported / sourceStatus.total) * 5) : 0;
                  return (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full ${filled ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      style={{ height: `${8 + i * 2}px` }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="text-[11.5px] text-app-muted">
              Last automated sync: <span className="font-extrabold text-app-text">{lastSyncLabel}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom row: Email Import Ready + System Status */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-wrap items-center gap-4 rounded-2xl border border-app-accentRing bg-app-accentTint/50 px-5 py-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white text-app-accentDark shadow-sm">
            <Icon path={ICONS.mail} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h5 className="text-sm font-extrabold text-app-text">Email Import {importRunning ? 'In Progress' : 'Ready'}</h5>
            <p className="text-xs font-medium text-app-muted">
              {importRunning
                ? `Processing ${date}. This page will refresh as feeds land.`
                : `Nightly batch for ${date} is ready for secondary validation.`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunEmailImport}
            disabled={importRunning}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-app-accentSoft to-app-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-pop transition-all duration-150 hover:from-teal-400 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importRunning ? 'Running…' : 'Run Now'}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-app-border bg-white/90 px-5 py-4 shadow-card">
          <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-app-accentTint/60" />
          <h5 className="relative z-10 text-sm font-extrabold text-app-text">System Status</h5>
          <div className="relative z-10 mt-3 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-app-body">All APIs Operational</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`size-2 rounded-full ${importRunning ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'}`} />
              <span className="text-xs font-semibold text-app-body">
                Mail Importer {importRunning ? 'Running' : 'Idle'}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`size-2 rounded-full ${pending ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              <span className="text-xs font-semibold text-app-body">
                {pending ? `${pending} feed${pending === 1 ? '' : 's'} pending` : 'All feeds caught up'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
