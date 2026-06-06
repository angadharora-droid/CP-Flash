import React, { useEffect, useMemo, useState } from 'react';
import { getEmailImportStatus, getPnlPeriod, getPnlWeek, getSeed, getSourceReportPreview, runEmailImport, saveData } from './lib/api';
import { numberValue, withFlags } from './lib/calculations';
import AppHeader from './components/AppHeader';
import { BrandLoader, googleSheetPreviewUrl } from './components/DashboardUi';
import { BOTTOM_TABS, NAV_GROUPS, NAV_ITEM_BY_KEY, pages } from './lib/navigation';
import DashboardPage from './pages/DashboardPage';
import PerformanceChartsPage from './pages/PerformanceChartsPage';
import BankPage from './pages/BankPage';
import PnlPage from './pages/PnlPage';
import FlagsPage from './pages/FlagsPage';
import SourceReportPreviewScreen from './pages/SourceReportPreviewScreen';
import SourceControlPage from './pages/SourceControlPage';
import HotelsPage from './pages/HotelsPage';
import FnbPage from './pages/FnbPage';
import RabbitPage from './pages/RabbitPage';
import MickysPage from './pages/MickysPage';
import PurosoulPage from './pages/PurosoulPage';
import SettlementPage from './pages/SettlementPage';
import AiPage from './pages/AiPage';
import PdfPreviewPage from './pages/PdfPreviewPage';
import AopTargetsPage from './pages/AopTargetsPage';
import PinPage from './pages/PinPage';
import cpLogo from './cp-logo.png';

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const MIN_INITIAL_LOADER_MS = 1200;

function localIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const d = new Date(); d.setDate(d.getDate() - 1);
const today = localIso(d);

function shiftIso(iso, delta) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return localIso(d);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEED_FALLBACK_KEYS = ['pnl', 'bankPosition', 'hotels', 'rabbits', 'mickys', 'purosoul', 'purosoulSku', 'fixedCosts'];

const PNL_VALUE_KEYS = ['revenueToday', 'purchasesToday', 'mtdNetProfit', 'ytdNetProfit'];

function hasEnteredPnlValues(row) {
  return PNL_VALUE_KEYS.some((key) => String(row?.[key] ?? '').trim() !== '');
}

function canonicalUnit(unit) {
  return unit === 'Rabbit' + 's' ? 'Rabbit' : unit;
}

function canonicalPageKey(key) {
  return key === 'rabbit' + 's' ? 'rabbit' : key;
}

function firstKpiValue(rows = [], unit, names = []) {
  const match = rows.find((row) => canonicalUnit(row.unit) === unit && names.some((name) => row.name === name));
  return match?.actual;
}

function sumKpiValues(rows = [], unit, names = []) {
  const total = rows
    .filter((row) => canonicalUnit(row.unit) === unit && names.some((name) => row.name === name))
    .reduce((sum, row) => sum + numberValue(row.actual), 0);
  return total ? String(Math.round(total * 100) / 100) : '';
}

function derivePnlRows(data) {
  const revenueByUnit = {
    'CP Nagpur': () => sumKpiValues(data.hotels, 'CP Nagpur', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    'CP NM': () => sumKpiValues(data.hotels, 'CP NM', ['Room Revenue', 'Meeting Point Revenue', 'Freakk Revenue', 'Bougainvillea Revenue', 'High Steaks Revenue', 'In-Room Dining Revenue', 'Revenue Today']),
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Gross Sales']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Gross Sales']),
    Rabbit: () => firstKpiValue(data.rabbits, 'Rabbit', ['Total Revenue']),
    "Micky's": () => firstKpiValue(data.mickys, "Micky's", ['Order Revenue Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['Total Revenue Today'])
  };
  const purchasesByUnit = {
    Pablo: () => firstKpiValue(data.fnb?.Pablo, 'Pablo', ['Total Purchase']),
    Dali: () => firstKpiValue(data.fnb?.Dali, 'Dali', ['Total Purchase']),
    Rabbit: () => firstKpiValue(data.rabbits, 'Rabbit', ['Purchase/RM Cost Today']),
    Purosoul: () => firstKpiValue(data.purosoul, 'Purosoul', ['RM Cost Today'])
  };
  return (data.pnl ?? []).map((row) => {
    const unit = canonicalUnit(row.unit);
    const revenueToday = String(row.revenueToday ?? '').trim() || revenueByUnit[unit]?.() || '';
    const purchasesToday = String(row.purchasesToday ?? '').trim() || purchasesByUnit[unit]?.() || '';
    return { ...row, unit, revenueToday, purchasesToday };
  });
}

function mergePnlRows(seedRows = [], savedRows = [], previousRows = []) {
  const savedByUnit = new Map(savedRows.map((row) => [canonicalUnit(row.unit), row]));
  const previousByUnit = new Map(previousRows.map((row) => [canonicalUnit(row.unit), row]));
  return seedRows.map((seedRow) => {
    const savedRow = savedByUnit.get(seedRow.unit);
    const previousRow = previousByUnit.get(seedRow.unit);
    if (hasEnteredPnlValues(savedRow)) return { ...seedRow, ...savedRow, unit: seedRow.unit };
    if (hasEnteredPnlValues(previousRow)) return { ...seedRow, ...previousRow, unit: seedRow.unit };
    return savedRow ? { ...seedRow, ...savedRow, unit: seedRow.unit } : seedRow;
  });
}

function normalizeRabbitCategoryBreakdown(seedRows = [], savedRows = []) {
  const fixedCategoryRows = seedRows.filter((row) => row.section === 'Category Breakdown');
  if (!fixedCategoryRows.length) return savedRows;

  const savedByName = new Map(savedRows.map((row) => [row.name, row]));
  const normalizedCategoryRows = fixedCategoryRows.map((seedRow) => {
    const savedRow = savedByName.get(seedRow.name);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id, unit: seedRow.unit } : seedRow;
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
    nextRows.push({ ...row, unit: canonicalUnit(row.unit) });
  }

  return inserted ? nextRows : [...savedRows, ...normalizedCategoryRows];
}

function mergeSeedKpiRows(seedRows = [], savedRows = []) {
  if (!Array.isArray(savedRows) || !savedRows.length) return seedRows;
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const savedByUnitAndName = new Map(savedRows.map((row) => [`${canonicalUnit(row.unit) ?? ''}::${row.name ?? ''}`, row]));
  const seen = new Set();
  const mergedSeedRows = seedRows.map((seedRow) => {
    const savedRow = savedById.get(seedRow.id) ?? savedByUnitAndName.get(`${canonicalUnit(seedRow.unit) ?? ''}::${seedRow.name ?? ''}`);
    if (savedRow?.id) seen.add(savedRow.id);
    return savedRow ? { ...seedRow, ...savedRow, id: seedRow.id, unit: seedRow.unit, section: seedRow.section } : seedRow;
  });
  const extraRows = savedRows.filter((row) => !seen.has(row.id));
  return [...mergedSeedRows, ...extraRows];
}

function normalizeRabbitData(data) {
  if (!data) return data;
  const next = { ...data };
  const rabbitRowsByKpi = new Map();
  for (const rawRow of next.rabbits ?? []) {
    const row = { ...rawRow, unit: canonicalUnit(rawRow.unit) };
    const key = `${row.section ?? ''}::${row.name ?? ''}`;
    const existing = rabbitRowsByKpi.get(key);
    if (!existing) {
      rabbitRowsByKpi.set(key, row);
      continue;
    }
    rabbitRowsByKpi.set(key, {
      ...existing,
      ...row,
      id: existing.id,
      actual: String(row.actual ?? '').trim() ? row.actual : existing.actual,
      mtd: String(row.mtd ?? '').trim() ? row.mtd : existing.mtd,
      ytd: String(row.ytd ?? '').trim() ? row.ytd : existing.ytd
    });
  }
  next.rabbits = [...rabbitRowsByKpi.values()];
  next.pnl = (next.pnl ?? []).map((row) => ({ ...row, unit: canonicalUnit(row.unit) }));
  next.settlement = Object.fromEntries(
    Object.entries(next.settlement ?? {}).map(([mode, values]) => {
      if (!values || typeof values !== 'object') return [mode, values];
      const row = { ...values };
      if (row.Rabbit == null && row['Rabbit' + 's'] != null) row.Rabbit = row['Rabbit' + 's'];
      delete row['Rabbit' + 's'];
      return [mode, row];
    })
  );
  return next;
}

function formatKpiAggregate(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function applyPeriodToData(data, period) {
  if (!data || !period?.kpis) return data;
  const mtdSums = period.kpis.mtd ?? {};
  const ytdSums = period.kpis.ytd ?? {};
  const mergeRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row) => {
      if (!row?.id) return row;
      const manualMtd = String(row.mtd ?? '').trim();
      const manualYtd = String(row.ytd ?? '').trim();
      if (manualMtd !== '' && manualYtd !== '' && ytdSums[row.id] === undefined) return row;
      const next = { ...row };
      if (manualMtd === '' && mtdSums[row.id] !== undefined) next.mtd = formatKpiAggregate(mtdSums[row.id]);
      if (ytdSums[row.id] !== undefined) next.ytd = formatKpiAggregate(ytdSums[row.id]);
      return next;
    });
  };
  return {
    ...data,
    hotels: mergeRows(data.hotels),
    rabbits: mergeRows(data.rabbits),
    mickys: mergeRows(data.mickys),
    purosoul: mergeRows(data.purosoul),
    purosoulSku: mergeRows(data.purosoulSku),
    fnb: {
      ...(data.fnb ?? {}),
      Pablo: mergeRows(data.fnb?.Pablo),
      Dali: mergeRows(data.fnb?.Dali)
    }
  };
}

function mergeWithSeed(seed, saved, previous = null) {
  if (!saved) return normalizeRabbitData(seed);
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
  merged.hotels = mergeSeedKpiRows(seed.hotels, merged.hotels);
  merged.rabbits = normalizeRabbitCategoryBreakdown(seed.rabbits, merged.rabbits);
  merged.rabbits = (merged.rabbits ?? []).map((row) => ({ ...row, unit: canonicalUnit(row.unit) }));
  merged.pnl = mergePnlRows(seed.pnl, saved.pnl, previous?.pnl);
  merged.pnl = derivePnlRows(merged);
  return normalizeRabbitData(merged);
}

// Material Symbol shortcut.
const MIcon = ({ name, className = '', filled = false, rotating = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${rotating ? 'animate-spin' : ''} ${className}`} aria-hidden>
    {name}
  </span>
);

export default function App() {
  const [active, setActive] = useState('dashboard');
  // Deferred copy of `active` — the sidebar reads `active` (urgent, paints
  // instantly on click), the heavy page render reads `renderedActive`
  // (low-priority, runs after the urgent paint commits). This is what
  // makes the active-icon recolor feel immediate even when the new page
  // is slow to mount (Recharts pages, large tables).
  const renderedActive = React.useDeferredValue(active);
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Loading...');
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaderVisible, setInitialLoaderVisible] = useState(false);
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('dailyflashToken') || '');
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [sourceRefreshRunning, setSourceRefreshRunning] = useState(false);
  const [sourceRefreshError, setSourceRefreshError] = useState('');
  const [period, setPeriod] = useState(null);
  const [periodRefreshKey, setPeriodRefreshKey] = useState(0);
  const [sourceReportPreview, setSourceReportPreview] = useState(null);
  const [sourceReportPreviewLoading, setSourceReportPreviewLoading] = useState(false);
  const [sourceReportPreviewError, setSourceReportPreviewError] = useState('');
  const [pdfReturnTo, setPdfReturnTo] = useState('bank');
  const loadRequestRef = React.useRef(0);
  const loadedDateRef = React.useRef('');

  React.useEffect(() => {
    localStorage.removeItem('dailyflashToken');
  }, []);

  React.useEffect(() => {
    setNavDrawerOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [active]);

  const loadData = React.useCallback(async (currentDate, token, silent = false, options = {}) => {
    if (!token) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const startedAt = Date.now();
    setRefreshing(true);
    let snapshot = null;
    let showInitialLoader = false;
    if (!silent) {
      setData((prev) => {
        snapshot = prev;
        showInitialLoader = prev == null;
        return prev;
      });
      setInitialLoaderVisible(showInitialLoader);
      setStatus('Loading...');
    }
    try {
      const { seed, saved } = await getSeed(currentDate, token, { signal: options.signal });
      if (requestId !== loadRequestRef.current) return;
      const sameDateSnapshot = loadedDateRef.current === currentDate ? snapshot : null;
      setData(mergeWithSeed(seed, saved, sameDateSnapshot));
      loadedDateRef.current = currentDate;
      if (silent) {
        setStatus(`Auto refreshed ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`);
      } else {
        setStatus(saved ? `Loaded saved data for ${currentDate}` : `Loaded seed data for ${currentDate}`);
      }
      if (!silent && showInitialLoader) {
        const remaining = MIN_INITIAL_LOADER_MS - (Date.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        if (requestId !== loadRequestRef.current) return;
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
      if (requestId === loadRequestRef.current) {
        setRefreshing(false);
        setInitialLoaderVisible(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(date, authToken, false, { signal: controller.signal });
    return () => controller.abort();
  }, [date, authToken]);

  useEffect(() => {
    if (!authToken || !date) return undefined;
    const activeKey = canonicalPageKey(renderedActive);
    if (activeKey !== 'dashboard' && activeKey !== 'pnl') {
      setPeriod(null);
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    setPeriod((current) => {
      if (current?.date !== date) return null;
      if (activeKey === 'pnl' && !current?.mtdDates) return null;
      if (activeKey === 'dashboard' && !current?.weekDates) return null;
      return current;
    });
    const loader = activeKey === 'pnl' ? getPnlPeriod : getPnlWeek;
    loader(date, authToken, { signal: controller.signal })
      .then((payload) => { if (!cancelled) setPeriod(payload); })
      .catch(() => { if (!cancelled) setPeriod(null); });
    return () => { cancelled = true; controller.abort(); };
  }, [date, authToken, renderedActive, periodRefreshKey]);

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

  const handleRefresh = React.useCallback(async () => {
    if (authToken) {
      await loadData(date, authToken, true);
      setPeriodRefreshKey((key) => key + 1);
      return;
    }
    return Promise.resolve();
  }, [authToken, date, loadData]);

  const handleRefreshSources = React.useCallback(async () => {
    if (!authToken || sourceRefreshRunning) return;
    setSourceRefreshRunning(true);
    setSourceRefreshError('');
    try {
      let status = await runEmailImport(authToken, { force: true });
      for (let attempt = 0; status?.running && attempt < 60; attempt += 1) {
        await wait(5000);
        status = await getEmailImportStatus(authToken);
      }
      await handleRefresh();
    } catch (err) {
      setSourceRefreshError(err.message);
    } finally {
      setSourceRefreshRunning(false);
    }
  }, [authToken, handleRefresh, sourceRefreshRunning]);

  const enrichedData = useMemo(() => applyPeriodToData(data, period), [data, period]);

  const page = useMemo(() => {
    if (!enrichedData) return null;
    const common = { data: enrichedData, setData, date, authToken, onSave: () => saveData(date, data, authToken) };
    const activeKey = canonicalPageKey(renderedActive);
    if (activeKey === 'dashboard') {
      return (
        <DashboardPage
          {...common}
          period={period}
          onRefreshSources={handleRefreshSources}
          sourceRefreshRunning={sourceRefreshRunning}
          sourceRefreshError={sourceRefreshError}
        />
      );
    }
    if (activeKey === 'performance') return <PerformanceChartsPage {...common} />;
    if (activeKey === 'sources') return <SourceControlPage date={date} authToken={authToken} onOpenReportPreview={openSourceReportPreview} onRefreshData={handleRefresh} />;
    if (activeKey === 'bank') return <BankPage {...common} />;
    if (activeKey === 'pnl') return <PnlPage {...common} period={period} />;
    if (activeKey === 'flags') return <FlagsPage data={enrichedData} />;
    if (activeKey === 'hotels') return <HotelsPage {...common} />;
    if (activeKey === 'fnb') return <FnbPage {...common} />;
    if (activeKey === 'rabbit') return <RabbitPage data={enrichedData} date={date} />;
    if (activeKey === 'mickys') return <MickysPage data={enrichedData} date={date} />;
    if (activeKey === 'purosoul') return <PurosoulPage {...common} />;
    if (activeKey === 'settlement') return <SettlementPage {...common} />;
    if (activeKey === 'aop') return <AopTargetsPage authToken={authToken} />;
    return <AiPage data={enrichedData} authToken={authToken} />;
  }, [renderedActive, enrichedData, data, date, authToken, period, openSourceReportPreview, handleRefresh, handleRefreshSources, sourceRefreshRunning, sourceRefreshError]);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authToken, handleRefresh]);

  const riskCount = data ? withFlags(data).filter((row) => row.flag === 'ACTION').length : 0;
  const activePage = pages.find(([key]) => key === canonicalPageKey(active)) ?? pages[0];
  const activeNavItem = NAV_ITEM_BY_KEY[canonicalPageKey(active)];

  if (!authToken) return <PinPage onUnlock={setAuthToken} />;

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

  if (canonicalPageKey(renderedActive) === 'pdf') {
    return (
      <PdfPreviewPage
        date={date}
        authToken={authToken}
        data={data}
        period={period}
        onSave={() => saveData(date, data, authToken)}
        onClose={() => setActive(pdfReturnTo)}
      />
    );
  }

  // ---- Desktop sidebar ----
  const renderSidebarButton = ({ key, label, icon }) => {
    const isActive = active === key;
    const hasBadge = key === 'flags' && riskCount > 0;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setActive(key)}
        title={label}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[16px] font-semibold transition-colors duration-100 active:scale-[0.98] ${
          isActive
            ? 'sidebar-item-active'
            : 'text-on-surface-variant hover:bg-white hover:text-on-surface hover:shadow-sm hover:ring-1 hover:ring-outline-variant/55'
        }`}
      >
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-100 ${
          isActive
            ? 'bg-gradient-to-br from-primary to-primary/85 text-on-primary shadow-primary'
            : 'bg-transparent text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary'
        }`}>
          <MIcon name={icon} filled={isActive} className="text-[20px]" />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hasBadge ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-error text-[10px] font-bold text-on-error ring-2 ring-surface-container-lowest">
            {riskCount > 9 ? '9+' : riskCount}
          </span>
        ) : null}
      </button>
    );
  };

  const renderGroupLabel = (label) => (
    <div className="mb-1.5 flex items-center gap-2 px-2.5">
      <span className="size-1.5 rounded-full bg-primary/55" aria-hidden />
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-on-surface-variant/65">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-outline-variant/45 to-transparent" aria-hidden />
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface text-on-surface">
      {/* ---- Expanded desktop sidebar ---- */}
      <aside className={`fixed left-0 top-16 z-40 hidden h-[calc(100vh-4rem)] w-72 flex-col border-r border-outline-variant/55 bg-gradient-to-b from-surface-container-lowest via-surface-container-low to-surface-container-low transition-all duration-300 md:flex ${
        desktopSidebarOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-full opacity-0'
      }`}>
        {/* Nav */}
        <nav className="flex flex-grow flex-col overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {renderGroupLabel(group.label)}
              <div className="space-y-0.5">
                {group.items.map(renderSidebarButton)}
              </div>
            </div>
          ))}
        </nav>
        {/* Footer */}
        <div className="space-y-1.5 border-t border-outline-variant/55 bg-white/70 p-3">
          <div className="flex items-center justify-between px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/55">
            <span className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${refreshing ? 'bg-primary animate-pulse' : 'bg-primary'}`} aria-hidden />
              {refreshing ? 'Syncing' : 'Live'}
            </span>
            <span>v1.0</span>
          </div>
          <button
            type="button"
            onClick={() => setActive('ai')}
            title="AI Notes"
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-[16px] font-semibold text-on-surface-variant transition-all hover:bg-white hover:text-on-surface hover:shadow-sm hover:ring-1 hover:ring-outline-variant/55"
          >
            <span className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors group-hover:bg-primary/8 group-hover:text-primary">
              <MIcon name="help_outline" className="text-[20px]" />
            </span>
            Help & AI Notes
          </button>
          <button
            type="button"
            onClick={lockApp}
            title="Lock"
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-[16px] font-semibold text-on-surface-variant transition-colors hover:bg-error-container/35 hover:text-error"
          >
            <span className="flex size-8 items-center justify-center rounded-lg transition-colors group-hover:bg-error/10 group-hover:text-error">
              <MIcon name="logout" className="text-[20px]" />
            </span>
            Lock dashboard
          </button>
        </div>
      </aside>

      {/* ---- Mobile drawer (expanded nav with labels) ---- */}
      <div
        className={`fixed inset-0 z-[60] md:hidden ${navDrawerOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!navDrawerOpen}
      >
        <div
          onClick={() => setNavDrawerOpen(false)}
          className={`absolute inset-0 bg-on-surface/30 backdrop-blur-sm transition-opacity duration-200 ${navDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 flex-col border-r border-outline-variant/55 bg-gradient-to-b from-surface-container-lowest to-surface-container-low shadow-2xl transition-transform duration-300 ease-out ${navDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex h-16 items-center justify-between border-b border-outline-variant/55 bg-gradient-to-br from-white to-surface-container-lowest px-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-outline-variant/55 shadow-sm">
                <img src={cpLogo} alt="" className="h-full w-full object-contain" />
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-extrabold tracking-tight text-on-surface">DailyFlash</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary/85">
                  <span className="size-1 rounded-full bg-primary/70" aria-hidden />
                  Centre Point
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNavDrawerOpen(false)}
              className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Close menu"
            >
              <MIcon name="close" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                {renderGroupLabel(group.label)}
                <div className="space-y-0.5">
                  {group.items.map(({ key, label, icon }) => {
                    const isActive = active === key;
                    const hasBadge = key === 'flags' && riskCount > 0;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActive(key)}
                        className={`group flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[16px] font-semibold transition-colors duration-100 ${
                          isActive
                            ? 'sidebar-item-active'
                            : 'text-on-surface-variant hover:bg-white hover:text-on-surface hover:shadow-sm hover:ring-1 hover:ring-outline-variant/55'
                        }`}
                      >
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-100 ${
                          isActive
                            ? 'bg-gradient-to-br from-primary to-primary/85 text-on-primary shadow-primary'
                            : 'bg-transparent text-on-surface-variant group-hover:bg-primary/10 group-hover:text-primary'
                        }`}>
                          <MIcon name={icon} filled={isActive} className="text-[20px]" />
                        </span>
                        <span className="flex-1 truncate">{label}</span>
                        {hasBadge ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-error text-[10px] font-bold text-on-error">{riskCount}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-outline-variant/55 bg-white/70 p-3">
            <div className="flex items-center justify-between px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant/55">
              <span className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${refreshing ? 'bg-primary animate-pulse' : 'bg-primary'}`} aria-hidden />
                {refreshing ? 'Syncing' : 'Live'}
              </span>
              <span>v1.0</span>
            </div>
            <button
              type="button"
              onClick={lockApp}
              className="group flex h-10 w-full items-center gap-3 rounded-xl px-2.5 text-[16px] font-semibold text-on-surface-variant transition-colors hover:bg-error-container/35 hover:text-error"
            >
              <span className="flex size-8 items-center justify-center rounded-lg transition-colors group-hover:bg-error/10 group-hover:text-error">
                <MIcon name="logout" />
              </span>
              Lock dashboard
            </button>
          </div>
        </aside>
      </div>

      <AppHeader
        title={activePage[2]}
        icon={activeNavItem?.icon}
        date={date}
        latestDate={today}
        onDateChange={setDate}
        onOpenMenu={() => setNavDrawerOpen(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        onPreviewPdf={() => { setPdfReturnTo(active); setActive('pdf'); }}
        canPreviewPdf={!!data}
        onHome={() => setActive('dashboard')}
        onToggleDesktopSidebar={() => setDesktopSidebarOpen((open) => !open)}
        desktopSidebarOpen={desktopSidebarOpen}
      />

      {/* ---- Main content ---- */}
      <main className={`min-h-screen px-3 pb-28 pt-16 transition-all duration-300 sm:px-4 md:pb-12 md:pt-20 md:px-6 lg:px-8 xl:px-10 2xl:px-12 ${
        desktopSidebarOpen ? 'md:ml-72' : 'md:ml-0'
      }`}>
        <div className="mx-auto max-w-[110rem] 2xl:max-w-[120rem]">
          {data && !Object.values(data.importSource ?? {}).some((v) => v) ? (
            <div className="glass-card mb-6 flex items-start gap-3 border border-tertiary/30 bg-tertiary-container/60 px-5 py-4 text-sm text-on-tertiary-container animate-fade-in-up">
              <MIcon name="warning" filled className="shrink-0 text-tertiary" />
              <span className="leading-relaxed">
                <strong className="font-bold">No data imported for {date}.</strong>{' '}
                The daily import hasn't run yet for this date, or no reports arrived. Data appears automatically once imported.
              </span>
            </div>
          ) : null}
          <div key={renderedActive} className="space-y-5 animate-fade-in-up">
            {page ?? (
              <div className="flex min-h-[38vh] flex-col items-center justify-center gap-4 py-16 text-center sm:py-20">
                <BrandLoader size={72} label="Loading dashboard data..." />
              </div>
            )}
          </div>
        </div>
      </main>

      {initialLoaderVisible ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-surface-container-lowest/92 px-6 text-center backdrop-blur-sm">
          <BrandLoader size={72} label="Loading dashboard data..." />
        </div>
      ) : null}

      {/* ---- Floating bottom nav (mobile only) with center FAB ---- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-center justify-around border-t border-outline-variant/70 bg-surface-container-lowest/92 px-4 pb-safe shadow-2xl backdrop-blur-2xl sm:h-20 sm:px-6 md:hidden">
        {BOTTOM_TABS.slice(0, 2).map(({ key, label }) => {
          const isActive = active === key;
          const item = NAV_ITEM_BY_KEY[key];
          const hasBadge = key === 'flags' && riskCount > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 p-2 transition-all active:scale-90 ${
                isActive ? 'text-primary' : 'text-on-surface-variant/60'
              }`}
            >
              <MIcon name={item.icon} filled={isActive} />
              <span className="text-[10px] font-medium uppercase tracking-tight">{label}</span>
              {hasBadge ? (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-error" />
              ) : null}
            </button>
          );
        })}
        {/* Center FAB → PDF Preview */}
        <button
          type="button"
          onClick={() => { setPdfReturnTo(active); setActive('pdf'); }}
          disabled={!data}
          className="-mt-10 flex size-14 items-center justify-center rounded-2xl border-4 border-surface bg-primary text-on-primary shadow-primary transition-all active:scale-90 disabled:opacity-50"
          aria-label="Preview PDF"
        >
          <MIcon name="picture_as_pdf" filled />
        </button>
        {BOTTOM_TABS.slice(2).map(({ key, label }) => {
          const isActive = active === key;
          const item = NAV_ITEM_BY_KEY[key];
          const hasBadge = key === 'flags' && riskCount > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 p-2 transition-all active:scale-90 ${
                isActive ? 'text-primary' : 'text-on-surface-variant/60'
              }`}
            >
              <MIcon name={item.icon} filled={isActive} />
              <span className="text-[10px] font-medium uppercase tracking-tight">{label}</span>
              {hasBadge ? (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-error" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
