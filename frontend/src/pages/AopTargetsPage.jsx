import React, { useEffect, useMemo, useState } from 'react';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, BrandLoader } from '../components/DashboardUi';
import { getAopTargets, saveAopTargets } from '../lib/api';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

const PAGE_META = {
  hotels:      { label: 'Hotels',   icon: 'hotel',           tone: 'indigo' },
  'fnb.Pablo': { label: 'Pablo',    icon: 'restaurant',      tone: 'teal'   },
  'fnb.Dali':  { label: 'Dali',     icon: 'restaurant',      tone: 'teal'   },
  rabbits:     { label: 'Rabbits',  icon: 'delivery_dining', tone: 'amber'  },
  mickys:      { label: "Micky's",  icon: 'inventory_2',     tone: 'rose'   },
  purosoul:    { label: 'Purosoul', icon: 'factory',         tone: 'slate'  }
};

const PAGE_ORDER = ['hotels', 'fnb.Pablo', 'fnb.Dali', 'rabbits', 'mickys', 'purosoul'];

function groupKpisByPageUnit(kpis) {
  const map = new Map();
  for (const kpi of kpis) {
    const key = `${kpi.page}__${kpi.unit}`;
    if (!map.has(key)) {
      map.set(key, { key, page: kpi.page, unit: kpi.unit, rows: [] });
    }
    map.get(key).rows.push(kpi);
  }
  const ordered = [...map.values()].sort((a, b) => {
    const ai = PAGE_ORDER.indexOf(a.page); const bi = PAGE_ORDER.indexOf(b.page);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const group of ordered) {
    const sections = new Map();
    for (const row of group.rows) {
      const s = row.section || 'General';
      if (!sections.has(s)) sections.set(s, []);
      sections.get(s).push(row);
    }
    group.sections = [...sections.entries()].map(([title, rows]) => ({ title, rows }));
  }
  return ordered;
}

function diffMaps(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (String(a[key] ?? '') !== String(b[key] ?? '')) return true;
  }
  return false;
}

export default function AopTargetsPage({ authToken }) {
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [kpis, setKpis]                     = useState([]);
  const [dailyOverrides, setDailyOverrides] = useState({});
  const [weeklyOverrides, setWeeklyOverrides] = useState({});
  const [baseline, setBaseline]             = useState({ daily: {}, weekly: {} });
  const [saving, setSaving]                 = useState(false);
  const [savedAt, setSavedAt]               = useState('');
  const [filter, setFilter]                 = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    getAopTargets(authToken)
      .then((response) => {
        if (cancelled) return;
        const daily = response.daily ?? {};
        const weekly = response.weekly ?? {};
        setKpis(response.kpis ?? []);
        setDailyOverrides(daily);
        setWeeklyOverrides(weekly);
        setBaseline({ daily: { ...daily }, weekly: { ...weekly } });
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authToken]);

  const isDirty = useMemo(
    () => diffMaps(dailyOverrides, baseline.daily) || diffMaps(weeklyOverrides, baseline.weekly),
    [dailyOverrides, weeklyOverrides, baseline]
  );

  const customCount = useMemo(() => {
    const ids = new Set([...Object.keys(dailyOverrides), ...Object.keys(weeklyOverrides)]);
    return ids.size;
  }, [dailyOverrides, weeklyOverrides]);

  const filteredKpis = useMemo(() => {
    if (!filter.trim()) return kpis;
    const needle = filter.trim().toLowerCase();
    return kpis.filter((kpi) =>
      kpi.name.toLowerCase().includes(needle)
      || kpi.unit.toLowerCase().includes(needle)
      || kpi.section.toLowerCase().includes(needle)
    );
  }, [kpis, filter]);

  const groups = useMemo(() => groupKpisByPageUnit(filteredKpis), [filteredKpis]);

  const updateOverride = (scope, id, value) => {
    const setter = scope === 'daily' ? setDailyOverrides : setWeeklyOverrides;
    setter((current) => {
      const next = { ...current };
      const trimmed = String(value).trim();
      if (trimmed === '') delete next[id]; else next[id] = trimmed;
      return next;
    });
  };

  const resetRow = (id) => {
    setDailyOverrides((current) => { const next = { ...current }; delete next[id]; return next; });
    setWeeklyOverrides((current) => { const next = { ...current }; delete next[id]; return next; });
  };

  const resetAll = () => {
    if (!customCount) return;
    if (!window.confirm(`Clear all ${customCount} custom targets and revert to defaults?`)) return;
    setDailyOverrides({});
    setWeeklyOverrides({});
  };

  const revertChanges = () => {
    setDailyOverrides({ ...baseline.daily });
    setWeeklyOverrides({ ...baseline.weekly });
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const response = await saveAopTargets({ daily: dailyOverrides, weekly: weeklyOverrides }, authToken);
      const nextDaily = response.daily ?? {};
      const nextWeekly = response.weekly ?? {};
      setDailyOverrides(nextDaily);
      setWeeklyOverrides(nextWeekly);
      setBaseline({ daily: { ...nextDaily }, weekly: { ...nextWeekly } });
      setSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <BrandLoader size={72} label="Loading AOP targets..." />
      </div>
    );
  }

  const dailyOverrideCount = Object.keys(dailyOverrides).length;
  const weeklyOverrideCount = Object.keys(weeklyOverrides).length;
  const totalCount = kpis.length;
  const visibleCount = filteredKpis.length;

  return (
    <div className="space-y-5">
      <StatStrip items={[
        { label: 'Total KPIs',     value: totalCount,            icon: 'view_list',          tone: 'text-teal-700' },
        { label: 'Customized',     value: customCount,           icon: 'tune',               tone: customCount ? 'text-emerald-700' : undefined },
        { label: 'Daily Overrides',  value: dailyOverrideCount,  icon: 'today',              tone: dailyOverrideCount ? 'text-emerald-700' : undefined },
        { label: 'Weekly Overrides', value: weeklyOverrideCount, icon: 'calendar_view_week', tone: weeklyOverrideCount ? 'text-emerald-700' : undefined }
      ]} />

      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest/95 px-4 py-3 shadow-card backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
            <MIcon name="flag" filled />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-normal text-on-surface md:text-lg">AOP Targets</h1>
              {isDirty ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-tertiary">
                  <MIcon name="circle" className="text-[8px]" filled />
                  Unsaved changes
                </span>
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-primary">
                  <MIcon name="check_circle" className="text-[12px]" filled />
                  Saved {savedAt}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11.5px] font-medium text-on-surface-variant">
              Set the daily and weekly target for each KPI. Blank fields use the default. Weekly auto-scales from daily × 7 for sum-based KPIs.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error ? <span className="max-w-72 truncate text-xs font-semibold text-error">{error}</span> : null}
          <div className="relative">
            <MIcon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter KPI, unit, section"
              className="h-9 w-64 rounded-md border border-outline-variant/70 bg-surface-container-lowest pl-8 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <ActionButton onClick={resetAll} disabled={!customCount}>
            <MIcon name="restart_alt" className="text-[17px]" />
            Reset All
          </ActionButton>
          <ActionButton onClick={revertChanges} disabled={!isDirty}>
            <MIcon name="undo" className="text-[17px]" />
            Revert
          </ActionButton>
          <ActionButton onClick={handleSave} disabled={saving || !isDirty} variant="primary">
            {saving ? <BrandLoader size={18} /> : <MIcon name="save" className="text-[17px]" />}
            {saving ? 'Saving...' : 'Save Targets'}
          </ActionButton>
        </div>
      </div>

      {filter.trim() ? (
        <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low px-4 py-2 text-xs text-on-surface-variant">
          Showing <span className="font-bold text-on-surface">{visibleCount}</span> of <span className="font-bold text-on-surface">{totalCount}</span> KPIs matching <span className="font-bold text-on-surface">"{filter.trim()}"</span>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/70 bg-surface-container-low px-4 py-12 text-center">
          <MIcon name="search_off" className="text-[36px] text-on-surface-variant/40" />
          <p className="mt-2 text-sm font-bold text-on-surface">No KPIs match this filter</p>
          <p className="mt-1 text-xs text-on-surface-variant">Try a different keyword, or clear the search to see all KPIs.</p>
        </div>
      ) : null}

      {groups.map((group) => {
        const meta = PAGE_META[group.page] ?? { label: group.page, icon: 'dataset', tone: 'indigo' };
        const groupCustom = group.rows.filter((row) => dailyOverrides[row.id] !== undefined || weeklyOverrides[row.id] !== undefined).length;
        return (
          <SectionCard
            key={group.key}
            title={group.unit}
            subtitle={`${meta.label} · ${group.rows.length} KPIs${groupCustom ? ` · ${groupCustom} customized` : ''}`}
            icon={meta.icon}
            tone={meta.tone}
            defaultOpen
          >
            <div className="space-y-5">
              {group.sections.map((section) => (
                <div key={section.title}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-on-surface-variant">{section.title}</span>
                    <span className="h-px flex-1 bg-outline-variant/50" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">{section.rows.length}</span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-outline-variant/60">
                    <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px_150px_56px] items-center gap-2 border-b border-outline-variant/60 bg-surface-container px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-surface-variant sm:grid">
                      <span>KPI</span>
                      <span className="text-right">Default</span>
                      <span className="text-right">Daily Target</span>
                      <span className="text-right">Weekly Target</span>
                      <span className="text-right">Reset</span>
                    </div>
                    {section.rows.map((row) => {
                      const dailyValue = dailyOverrides[row.id] ?? '';
                      const weeklyValue = weeklyOverrides[row.id] ?? '';
                      const isCustom = dailyValue !== '' || weeklyValue !== '';
                      return (
                        <div
                          key={row.id}
                          className={`grid grid-cols-2 items-center gap-2 border-b border-outline-variant/15 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_110px_150px_150px_56px] sm:py-2 ${isCustom ? 'bg-primary/[0.025]' : 'bg-surface-container-lowest'}`}
                        >
                          <div className="col-span-2 min-w-0 sm:col-span-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-bold text-on-surface">{row.name}</span>
                              {isCustom ? (
                                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-primary">Custom</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right text-[13px] font-semibold tabular-nums text-on-surface-variant">
                            <span className="sm:hidden text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mr-2">Default</span>
                            {row.defaultTarget || '—'}
                          </div>
                          <label className="block">
                            <span className="sm:hidden mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Daily</span>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={dailyValue}
                              onChange={(event) => updateOverride('daily', row.id, event.target.value)}
                              placeholder={String(row.defaultTarget ?? '')}
                              className={`h-9 w-full rounded-md border bg-surface-container-lowest px-2 text-right text-sm tabular-nums text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 ${dailyValue ? 'border-primary/40 bg-primary/[0.04] font-bold' : 'border-outline-variant/70 hover:border-outline-variant'}`}
                            />
                          </label>
                          <label className="block">
                            <span className="sm:hidden mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Weekly</span>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={weeklyValue}
                              onChange={(event) => updateOverride('weekly', row.id, event.target.value)}
                              placeholder="auto"
                              className={`h-9 w-full rounded-md border bg-surface-container-lowest px-2 text-right text-sm tabular-nums text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 ${weeklyValue ? 'border-primary/40 bg-primary/[0.04] font-bold' : 'border-outline-variant/70 hover:border-outline-variant'}`}
                            />
                          </label>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => resetRow(row.id)}
                              disabled={!isCustom}
                              className="flex size-8 items-center justify-center rounded-md border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-error/5 hover:border-error/30 hover:text-error disabled:cursor-default disabled:opacity-25 disabled:hover:bg-surface-container-lowest disabled:hover:border-outline-variant/70 disabled:hover:text-on-surface-variant"
                              aria-label={`Reset ${row.name} to default`}
                              title="Reset to default"
                            >
                              <MIcon name="restart_alt" className="text-[17px]" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
