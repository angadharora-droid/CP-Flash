import React, { useEffect, useMemo, useState } from 'react';
import { getPnlPeriod, getSeed, getSourceReportPreview, saveData } from './lib/api';
import { numberValue, withFlags } from './lib/calculations';
import { ActionButton, BrandLoader, DateControl, googleSheetPreviewUrl, PinGate } from './components/DashboardUi';
import { BOTTOM_TABS, NAV_GROUPS, NAV_ITEM_BY_KEY, pages } from './lib/navigation';
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
import cpLogo from './cp-logo.png';

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const MIN_INITIAL_LOADER_MS = 5000;
const d = new Date(); d.setDate(d.getDate() - 1);
const today = d.toISOString().slice(0, 10);

function shiftIso(iso, delta) {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
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
  const [active, setActive] = useState('bank');
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('Loading...');
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('dailyflashToken') || '');
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [period, setPeriod] = useState(null);
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

  const loadData = React.useCallback(async (currentDate, token, silent = false) => {
    if (!token) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    const startedAt = Date.now();
    setRefreshing(true);
    let snapshot = null;
    if (!silent) {
      setData((prev) => { snapshot = prev; return prev; });
      setStatus('Loading...');
    }
    try {
      const { seed, saved } = await getSeed(currentDate, token);
      if (requestId !== loadRequestRef.current) return;
      if (!silent && snapshot == null) {
        const remaining = MIN_INITIAL_LOADER_MS - (Date.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        if (requestId !== loadRequestRef.current) return;
      }
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
    if (!authToken || !date) return undefined;
    let cancelled = false;
    setPeriod(null);
    getPnlPeriod(date, authToken)
      .then((payload) => { if (!cancelled) setPeriod(payload); })
      .catch(() => { if (!cancelled) setPeriod(null); });
    return () => { cancelled = true; };
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
    if (authToken) loadData(date, authToken, true);
  }, [authToken, date, loadData]);

  const enrichedData = useMemo(() => applyPeriodToData(data, period), [data, period]);

  const page = useMemo(() => {
    if (!enrichedData) return null;
    const common = { data: enrichedData, setData, date, authToken };
    const activeKey = canonicalPageKey(active);
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
  }, [active, enrichedData, date, authToken, period, openSourceReportPreview, handleRefresh]);

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

  const riskCount = data ? withFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED').length : 0;
  const activePage = pages.find(([key]) => key === canonicalPageKey(active)) ?? pages[0];

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

  if (canonicalPageKey(active) === 'pdf') {
    return (
      <PdfPreviewPage
        date={date}
        authToken={authToken}
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
        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold transition-all duration-200 active:scale-[0.98] ${
          isActive
            ? 'sidebar-item-active'
            : 'text-on-surface-variant/70 hover:bg-primary/10 hover:text-primary'
        }`}
      >
        <MIcon name={icon} filled={isActive} className={`shrink-0 text-[22px] ${isActive ? 'text-primary' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hasBadge ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-error text-[10px] font-bold text-on-error ring-2 ring-surface-container-lowest">
            {riskCount > 9 ? '9+' : riskCount}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface text-on-surface">
      {/* ---- Expanded desktop sidebar ---- */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-72 flex-col border-r border-outline-variant/70 bg-surface-container-lowest shadow-[6px_0_24px_-28px_rgba(23,32,38,0.9)] transition-all duration-300 md:flex">
        {/* Brand logo */}
        <div className="flex h-20 items-center gap-3 border-b border-outline-variant/70 px-4">
          <button
            type="button"
            onClick={() => setActive('bank')}
            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-surface-container-lowest p-1.5 text-on-primary ring-1 ring-outline-variant/70 transition-all hover:ring-primary/40"
            title="DailyFlash"
            aria-label="Home"
          >
            <img src={cpLogo} alt="" className="h-full w-full object-contain" />
          </button>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-lg font-extrabold tracking-normal text-on-surface">DailyFlash</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-on-surface-variant/75">Centre Point</div>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex flex-grow flex-col overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/60">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map(renderSidebarButton)}
              </div>
            </div>
          ))}
        </nav>
        {/* Footer */}
        <div className="space-y-2 border-t border-outline-variant/70 p-3">
          <button
            type="button"
            onClick={() => setActive('ai')}
            title="AI Notes"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
          >
            <MIcon name="help_outline" className="text-[20px]" />
            Help & AI Notes
          </button>
          <button
            type="button"
            onClick={lockApp}
            title="Lock"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-error-container/30 hover:text-error"
          >
            <MIcon name="logout" className="text-[20px]" />
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
          className={`absolute inset-y-0 left-0 flex w-72 flex-col border-r border-outline-variant/70 bg-surface-container-lowest shadow-2xl transition-transform duration-300 ease-out ${navDrawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex h-16 items-center justify-between border-b border-outline-variant/70 px-5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white p-1.5 ring-1 ring-outline-variant/70">
                <img src={cpLogo} alt="" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">DailyFlash</div>
                <div className="text-[11px] text-on-surface-variant">Centre Point</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNavDrawerOpen(false)}
              className="flex size-9 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-high"
              aria-label="Close menu"
            >
              <MIcon name="close" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-5">
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">{group.label}</div>
                <div className="space-y-1">
                  {group.items.map(({ key, label, icon }) => {
                    const isActive = active === key;
                    const hasBadge = key === 'flags' && riskCount > 0;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActive(key)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition-all ${
                          isActive
                            ? 'sidebar-item-active'
                            : 'text-on-surface-variant/80 hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        <MIcon name={icon} filled={isActive} className={isActive ? 'text-primary' : ''} />
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
          <div className="border-t border-outline-variant/70 p-3">
            <button
              type="button"
              onClick={lockApp}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-error-container/20 hover:text-error"
            >
              <MIcon name="logout" />
              Lock dashboard
            </button>
          </div>
        </aside>
      </div>

      {/* ---- Top App Bar ---- */}
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between gap-2 border-b border-outline-variant/70 bg-surface-container-lowest/88 px-3 shadow-sm backdrop-blur-xl sm:gap-3 sm:px-4 md:left-72 md:h-20 md:w-[calc(100%-18rem)] md:px-5 lg:px-6 xl:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 md:gap-4">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setNavDrawerOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high sm:size-10 md:hidden"
            aria-label="Open menu"
          >
            <MIcon name="menu" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold tracking-normal text-on-surface sm:text-lg md:text-xl lg:text-2xl">{activePage[2]}</h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3 lg:gap-4">
          <DateControl value={date} onChange={setDate} latest={today} />
          <div className="hidden items-center gap-2 md:flex">
            
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
              className="rounded-lg p-2.5 text-on-surface-variant transition-all hover:bg-surface-container-high active:scale-90 disabled:opacity-40"
            >
              {refreshing ? <MIcon name="sync" rotating /> : <MIcon name="sync" />}
            </button>
            <div className="mx-1 h-6 w-px bg-outline-variant/30" />
          </div>
          <button
            type="button"
            onClick={() => { setPdfReturnTo(active); setActive('pdf'); }}
            disabled={!data}
            className="hidden items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.05em] text-on-primary shadow-primary transition-all hover:bg-primary-container hover:shadow-lg active:scale-95 disabled:opacity-50 lg:flex"
          >
            <MIcon name="picture_as_pdf" className="text-[18px]" />
            Preview PDF
          </button>
          <button
            type="button"
            onClick={() => { setPdfReturnTo(active); setActive('pdf'); }}
            disabled={!data}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary active:scale-95 disabled:opacity-50 sm:size-10 lg:hidden"
            aria-label="Preview PDF"
          >
            <MIcon name="picture_as_pdf" />
          </button>
        </div>
      </header>

      {/* ---- Main content ---- */}
      <main className="min-h-screen px-3 pb-28 pt-20 transition-all duration-300 sm:px-4 md:ml-72 md:pb-12 md:pt-24 md:px-6 lg:px-8 xl:px-10 2xl:px-12">
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
          <div key={active} className="space-y-5 animate-fade-in-up">
            {page ?? (
              <div className="flex min-h-[38vh] flex-col items-center justify-center gap-4 py-16 text-center sm:py-20">
                <BrandLoader size={72} label="Loading dashboard data..." />
              </div>
            )}
          </div>
        </div>
      </main>

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
