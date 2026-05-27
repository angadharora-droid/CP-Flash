import React, { useEffect, useMemo, useState } from 'react';
import DashboardCharts from '../components/DashboardCharts';
import { PageTitle } from '../components/DashboardUi';
import { getPnlPeriod } from '../lib/api';
import { buildMonthOptions, buildWeekOptions, monthKeyFromDate, weekStartContaining } from '../lib/weeks';

const selectClass =
  'h-9 rounded-md border border-outline-variant/70 bg-surface-container-lowest px-2.5 text-xs font-bold text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export default function DashboardPage({ data, date, authToken }) {
  const initialWeekStart = useMemo(() => weekStartContaining(date), [date]);
  const [weekMonth, setWeekMonth] = useState(() => monthKeyFromDate(initialWeekStart));
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weekPeriod, setWeekPeriod] = useState(null);
  const [loading, setLoading] = useState(false);

  const monthOptions = useMemo(() => buildMonthOptions(date, 12), [date]);
  const weekOptions = useMemo(() => buildWeekOptions(weekMonth), [weekMonth]);
  const activeWeekStart =
    weekOptions.find((week) => week.key === weekStart)?.key ?? weekOptions[0]?.key ?? initialWeekStart;

  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    setLoading(true);
    getPnlPeriod(activeWeekStart, authToken)
      .then((payload) => { if (!cancelled) setWeekPeriod(payload); })
      .catch(() => { if (!cancelled) setWeekPeriod(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeWeekStart, authToken]);

  const changeMonth = (monthKey) => {
    setWeekMonth(monthKey);
    const weeks = buildWeekOptions(monthKey);
    if (weeks.length) setWeekStart(weeks[0].key);
  };

  const weekControls = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant/70">Week</span>
      <select value={weekMonth} onChange={(event) => changeMonth(event.target.value)} className={selectClass} aria-label="Month">
        {monthOptions.map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
      <select value={activeWeekStart} onChange={(event) => setWeekStart(event.target.value)} className={selectClass} aria-label="Week">
        {weekOptions.map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      <DashboardCharts
        data={data}
        period={weekPeriod}
        weekControls={weekControls}
        weekLoading={loading}
        defaultMode="week"
      />
    </>
  );
}
