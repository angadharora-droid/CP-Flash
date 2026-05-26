import React, { useEffect, useMemo, useState } from 'react';
import { ActionButton, BrandLoader } from '../components/DashboardUi';
import { getAopTargets, saveAopTargets } from '../lib/api';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

const PAGE_LABELS = {
  hotels: 'Hotels',
  'fnb.Pablo': 'Pablo',
  'fnb.Dali': 'Dali',
  rabbits: 'Rabbits',
  mickys: "Micky's",
  purosoul: 'Purosoul'
};

function groupKpis(kpis) {
  const map = new Map();
  for (const kpi of kpis) {
    const groupKey = `${kpi.page}__${kpi.unit}__${kpi.section}`;
    if (!map.has(groupKey)) {
      map.set(groupKey, {
        groupKey,
        page: kpi.page,
        unit: kpi.unit,
        section: kpi.section,
        rows: []
      });
    }
    map.get(groupKey).rows.push(kpi);
  }
  return [...map.values()];
}

export default function AopTargetsPage({ authToken }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState([]);
  const [dailyOverrides, setDailyOverrides] = useState({});
  const [weeklyOverrides, setWeeklyOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getAopTargets(authToken)
      .then((response) => {
        if (cancelled) return;
        setKpis(response.kpis ?? []);
        setDailyOverrides(response.daily ?? {});
        setWeeklyOverrides(response.weekly ?? {});
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authToken]);

  const groups = useMemo(() => {
    if (!filter.trim()) return groupKpis(kpis);
    const needle = filter.trim().toLowerCase();
    const filtered = kpis.filter((kpi) =>
      kpi.name.toLowerCase().includes(needle)
      || kpi.unit.toLowerCase().includes(needle)
      || kpi.section.toLowerCase().includes(needle)
    );
    return groupKpis(filtered);
  }, [kpis, filter]);

  const updateOverride = (scope, id, value) => {
    const setter = scope === 'daily' ? setDailyOverrides : setWeeklyOverrides;
    setter((current) => {
      const next = { ...current };
      const trimmed = String(value).trim();
      if (trimmed === '') delete next[id];
      else next[id] = trimmed;
      return next;
    });
  };

  const resetRow = (id) => {
    setDailyOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setWeeklyOverrides((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await saveAopTargets({ daily: dailyOverrides, weekly: weeklyOverrides }, authToken);
      setDailyOverrides(response.daily ?? {});
      setWeeklyOverrides(response.weekly ?? {});
      setSavedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <BrandLoader size={72} label="Loading AOP targets..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest px-4 py-3 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
            <MIcon name="flag" filled />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-on-surface md:text-lg">AOP Targets</h1>
            <p className="text-xs text-on-surface-variant">Set the daily and weekly target for each KPI. Leave blank to use the default.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {savedAt ? <span className="text-xs font-semibold text-primary">Saved {savedAt}</span> : null}
          {error ? <span className="max-w-72 truncate text-xs font-semibold text-error">{error}</span> : null}
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by KPI, unit, section"
            className="h-9 w-64 rounded-md border border-outline-variant/70 bg-surface-container-lowest px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
          />
          <ActionButton onClick={handleSave} disabled={saving} variant="primary">
            {saving ? <BrandLoader size={18} /> : <MIcon name="save" className="text-[17px]" />}
            {saving ? 'Saving...' : 'Save Targets'}
          </ActionButton>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/70 bg-surface-container-low px-4 py-8 text-center text-sm text-on-surface-variant">
          No KPIs match your filter.
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.groupKey} className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-card">
          <div className="flex items-center justify-between border-b border-outline-variant/60 bg-surface-container-low px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary-container/30 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary">
                {PAGE_LABELS[group.page] ?? group.page}
              </span>
              <span className="text-sm font-bold text-on-surface">{group.unit}</span>
              <span className="text-xs text-on-surface-variant">/ {group.section}</span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{group.rows.length} KPIs</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_120px_140px_140px_60px] items-center gap-2 border-b border-outline-variant/60 bg-surface-container px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            <span>KPI</span>
            <span className="text-right">Default</span>
            <span className="text-right">Daily Target</span>
            <span className="text-right">Weekly Target</span>
            <span className="text-right"></span>
          </div>
          {group.rows.map((row) => {
            const dailyValue = dailyOverrides[row.id] ?? '';
            const weeklyValue = weeklyOverrides[row.id] ?? '';
            const isCustom = dailyValue !== '' || weeklyValue !== '';
            return (
              <div
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_120px_140px_140px_60px] items-center gap-2 border-b border-outline-variant/15 px-4 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-on-surface">{row.name}</div>
                  {isCustom ? (
                    <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Custom</div>
                  ) : null}
                </div>
                <div className="text-right text-sm font-bold tabular-nums text-on-surface-variant">{row.defaultTarget || '-'}</div>
                <input
                  type="number"
                  step="any"
                  value={dailyValue}
                  onChange={(event) => updateOverride('daily', row.id, event.target.value)}
                  placeholder={String(row.defaultTarget ?? '')}
                  className="h-9 w-full rounded-md border border-outline-variant/70 bg-surface-container-lowest px-2 text-right text-sm tabular-nums text-on-surface focus:border-primary focus:outline-none"
                />
                <input
                  type="number"
                  step="any"
                  value={weeklyValue}
                  onChange={(event) => updateOverride('weekly', row.id, event.target.value)}
                  placeholder="auto"
                  className="h-9 w-full rounded-md border border-outline-variant/70 bg-surface-container-lowest px-2 text-right text-sm tabular-nums text-on-surface focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => resetRow(row.id)}
                  disabled={!isCustom}
                  className="flex size-8 items-center justify-center rounded-md border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:cursor-default disabled:opacity-30"
                  aria-label={`Reset target for ${row.name}`}
                  title="Reset to default"
                >
                  <MIcon name="restart_alt" className="text-[18px]" />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
