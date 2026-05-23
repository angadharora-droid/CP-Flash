import React, { useEffect, useMemo, useState } from 'react';
import { getSeed, getSourceReportPreview, saveData } from './lib/api';
import { numberValue, withFlags } from './lib/calculations';
import { ActionButton, DateControl, googleSheetPreviewUrl, PinGate } from './components/DashboardUi';
import { BOTTOM_TABS, NAV_GROUPS, NAV_ITEM_BY_KEY, pages } from './lib/navigation';
import BankPage from './pages/BankPage';
import PnlPage from './pages/PnlPage';
import FlagsPage from './pages/FlagsPage';
import SourceReportPreviewScreen from './pages/SourceReportPreviewScreen';
import SourceControlPage from './pages/SourceControlPage';
import HotelsPage from './pages/HotelsPage';
import FnbPage from './pages/FnbPage';
import RabbitsPage from './pages/RabbitsPage';
import MickysPage from './pages/MickysPage';
import PurosoulPage from './pages/PurosoulPage';
import SettlementPage from './pages/SettlementPage';
import AiPage from './pages/AiPage';
import PdfPreviewPage from './pages/PdfPreviewPage';
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

function normalizeRabbitsCategoryBreakdown(seedRows = [], savedRows = []) {
  const fixedCategoryRows = seedRows.filter((row) => row.section === 'Category Breakdown');
  if (!fixedCategoryRows.length) return savedRows;

  const savedByName = new Map(savedRows.map((row) => [row.name, row]));
  const normalizedCategoryRows = fixedCategoryRows.map((seedRow) => {
    const savedRow = savedByName.get(seedRow.name);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id } : seedRow;
  });
  const nextRows = [];
  let inserted = false;

  for (const row of savedRows) {
    if (row.section === 'Category Breakdown') {
      if (!inserted) {
        nextRows.push(...normalizedCategoryRows);
        inserted = true;
      }
      continue;
    }
    nextRows.push(row);
  }

  return inserted ? nextRows : [...savedRows, ...normalizedCategoryRows];
}

function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const savedRow = savedById.get(seedRow.id);
    seen.add(seedRow.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id } : seedRow;
  });
  const extraRows = savedRows.filter((row) => !seen.has(row.id));
  return [...mergedSeedRows, ...extraRows];
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
  merged.fnb = {
    ...(merged.fnb ?? {}),
    Pablo: mergeSeedKpiRows(seed.fnb?.Pablo, merged.fnb?.Pablo),
    Dali: mergeSeedKpiRows(seed.fnb?.Dali, merged.fnb?.Dali)
  };
  merged.rabbits = normalizeRabbitsCategoryBreakdown(seed.rabbits, merged.rabbits);
  merged.pnl = mergePnlRows(seed.pnl, saved.pnl, previous?.pnl);
  merged.pnl = derivePnlRows(merged);
  return merged;
}

export default function App() {
  const [active, setActive] = useState('sources');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Loading...');
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('dailyflashToken') || '');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('dailyflashSidebar') === 'collapsed');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sourceReportPreview, setSourceReportPreview] = useState(null);
  const [sourceReportPreviewLoading, setSourceReportPreviewLoading] = useState(false);
  const [sourceReportPreviewError, setSourceReportPreviewError] = useState('');
  const [pdfReturnTo, setPdfReturnTo] = useState('sources');
  const loadRequestRef = React.useRef(0);
  const loadedDateRef = React.useRef('');

  React.useEffect(() => {
    localStorage.removeItem('dailyflashToken');
  }, []);

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
        sessionStorage.removeItem('dailyflashToken');
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

  const openSourceReportPreview = React.useCallback(async (source, file, options = {}) => {
    if (options.type === 'google-sheet') {
      setSourceReportPreview({
        type: 'google-sheet',
        title: options.title ?? source.label,
        file: source.label,
        url: googleSheetPreviewUrl(file),
        sheets: []
      });
      setSourceReportPreviewError('');
      setSourceReportPreviewLoading(false);
      return;
    }

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

  const handleRefresh = React.useCallback(() => {
    if (authToken) loadData(date, authToken);
  }, [authToken, date, loadData]);

  const page = useMemo(() => {
    if (!data) return null;
    const common = { data, setData, date, authToken };
    if (active === 'sources') return <SourceControlPage date={date} authToken={authToken} onOpenReportPreview={openSourceReportPreview} onRefreshData={handleRefresh} />;
    if (active === 'bank') return <BankPage {...common} />;
    if (active === 'pnl') return <PnlPage {...common} />;
    if (active === 'flags') return <FlagsPage data={data} />;
    if (active === 'hotels') return <HotelsPage {...common} />;
    if (active === 'fnb') return <FnbPage {...common} />;
    if (active === 'rabbits') return <RabbitsPage data={data} date={date} />;
    if (active === 'mickys') return <MickysPage data={data} date={date} />;
    if (active === 'purosoul') return <PurosoulPage {...common} />;
    if (active === 'settlement') return <SettlementPage {...common} />;
    return <AiPage data={data} authToken={authToken} />;
  }, [active, data, date, authToken, openSourceReportPreview, handleRefresh]);

  const lockApp = React.useCallback(() => {
    localStorage.removeItem('dailyflashToken');
    sessionStorage.removeItem('dailyflashToken');
    setAuthToken('');
    setData(null);
  }, []);

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

  if (active === 'pdf') {
    return (
      <PdfPreviewPage
        date={date}
        authToken={authToken}
        onSave={() => saveData(date, data, authToken)}
        onClose={() => setActive(pdfReturnTo)}
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
        <header className="sticky top-0 z-20 border-b border-app-border/80 bg-white/95 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            {/* Left: breadcrumb + date */}
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-app-accentTint text-app-accentDark">
                  <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                    {NAV_ITEM_BY_KEY[active]?.icon}
                  </svg>
                </span>
                <span className="hidden text-[10.5px] font-bold uppercase tracking-[0.18em] text-app-subtle sm:inline">{activePage[1]}</span>
                <span className="hidden text-app-subtle sm:inline">·</span>
                <span className="truncate text-[15px] font-bold tracking-tight text-app-text sm:text-[10.5px] sm:font-bold sm:uppercase sm:tracking-[0.18em]">{activePage[2]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DateControl
                  value={date}
                  onChange={setDate}
                  latest={today}
                />
                {status ? (
                  <span className="hidden max-w-xs truncate text-xs font-medium text-app-muted sm:inline">{status}</span>
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
              <ActionButton onClick={() => { setPdfReturnTo(active); setActive('pdf'); }} disabled={!data} variant="primary">
                <span className="sm:hidden">PDF</span>
                <span className="hidden sm:inline">Preview PDF</span>
              </ActionButton>
              <div className="ml-1 hidden h-5 w-px bg-app-border sm:block" />
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
        <div className="space-y-5 p-4 pb-28 lg:p-8 lg:pb-8">
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

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-app-border bg-white/95 backdrop-blur-xl shadow-[0_-6px_24px_-12px_rgba(15,23,42,0.25)] lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {BOTTOM_TABS.map(({ key, label }) => {
          const isActive = active === key;
          const hasBadge = key === 'flags' && riskCount > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition-colors duration-150 ${
                isActive ? 'text-app-accentDark' : 'text-app-muted active:text-app-text'
              }`}
            >
              {isActive ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent-stripe" /> : null}
              <span className={`relative flex size-7 items-center justify-center rounded-lg transition-colors duration-150 ${isActive ? 'bg-app-accentTint' : ''}`}>
                <svg className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.2 : 1.85} viewBox="0 0 24 24">
                  {NAV_ITEM_BY_KEY[key]?.icon}
                </svg>
                {hasBadge ? (
                  <span className="absolute -right-1.5 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white">
                    {riskCount}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate leading-none">{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="More sections"
          className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold text-app-muted transition-colors duration-150 active:text-app-text"
        >
          <span className="flex size-7 items-center justify-center">
            <svg className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.85} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </span>
          <span className="leading-none">More</span>
        </button>
      </nav>
    </div>
  );
}
