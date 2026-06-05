import React, { useEffect, useMemo, useState } from 'react';
import BankPositionTable from '../components/BankPositionTable';
import DataTable from '../components/DataTable';
import FnbOutletSalesChart from '../components/FnbOutletSalesChart';
import FlagBadge from '../components/FlagBadge';
import { DonutChart } from '../components/DashboardCharts';
import RevenueShareDonut from '../components/RevenueShareDonut';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';
import { getPnlPeriod } from '../lib/api';
import {
  calcFlag,
  aopTargetValue,
  money,
  moneyCompact,
  numberValue,
  percent,
  pnlRows,
  settlementModes,
  settlementTotals,
  UNITS
} from '../lib/calculations';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function dateSuffix(iso) {
  const formatted = fmtDate(iso);
  return formatted ? ` - ${formatted}` : '';
}

function isCumulativeKpiName(name) {
  return /(mtd|ytd|month\s*to\s*date|year\s*to\s*date)/i.test(String(name ?? ''));
}

function fmtAggregate(value) {
  const rounded = Math.round(numberValue(value) * 100) / 100;
  return String(rounded);
}

function summarizePnl(rows) {
  return rows.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday);
    acc.purchases += row.tracksCogs ? numberValue(row.purchasesToday) : 0;
    acc.gp += row.tracksCogs ? row.grossProfit : 0;
    acc.fixed += row.hasFixedCost ? numberValue(row.fixedCost) : 0;
    acc.net += row.estNetProfit;
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, fixed: 0, net: 0 });
}

function DashboardHero({ title, subtitle, meta, children, navItems }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-outline-variant/60 bg-[linear-gradient(135deg,rgba(8,120,108,0.10),rgba(111,61,116,0.08)_48%,rgba(154,90,0,0.08))] px-4 py-4 sm:px-5 md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Summary Dashboard</p>
            <h2 className="mt-1 text-[24px] font-extrabold leading-tight tracking-normal text-on-surface md:text-[30px]">{title}</h2>
            <p className="mt-1.5 max-w-3xl text-sm font-medium text-on-surface-variant md:text-[15px]">{subtitle}</p>
          </div>
          {meta ? (
            <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
              {meta.map((item) => (
                <span key={item.label} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/60 bg-white/80 px-3 py-2 text-xs font-bold text-on-surface shadow-sm">
                  <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="px-3.5 py-4 sm:px-5 md:px-6">
        {children}
        {navItems?.length ? <SummaryNav items={navItems} /> : null}
      </div>
    </div>
  );
}

function SummaryNav({ items }) {
  return (
    <nav className="scroll-touch -mx-1 mt-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Summary sections">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-3.5 py-2 text-xs font-bold text-on-surface-variant shadow-sm transition-all hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function UnitHealthGrid({ rows, title = 'Unit Pulse', scope = 'today' }) {
  const ranked = [...rows]
    .sort((a, b) => numberValue(b.revenueToday) - numberValue(a.revenueToday))
    .slice(0, 7);

  return (
    <div className="mb-5 rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-3.5 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-on-surface">{title}</h3>
          <p className="text-[11.5px] font-medium text-on-surface-variant">Revenue and estimated net margin by unit, {scope}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {ranked.map((row) => {
          const positive = row.estNetProfit >= 0;
          return (
            <div key={row.unit} className="rounded-lg border border-outline-variant/55 bg-white px-3 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-extrabold text-on-surface">{row.unit}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${positive ? 'bg-secondary/10 text-secondary' : 'bg-error/10 text-error'}`}>
                  {percent(row.netMargin)}
                </span>
              </div>
              <div className="num mt-2 text-[19px] font-extrabold leading-none text-primary">{moneyCompact(row.revenueToday)}</div>
              <div className={`num mt-1 text-xs font-bold ${positive ? 'text-secondary' : 'text-error'}`}>
                Net {moneyCompact(row.estNetProfit)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_WEEK_ENTRY = { revenue: 0, purchases: 0, gp: 0, netProfit: 0, days: 0, fixedCost: 0 };

const UNIT_REVENUE_META = {
  'CP Nagpur': { title: 'Centre Point Nagpur', source: 'IDS (CP Nagpur)' },
  'CP NM': { title: 'Centre Point Navi Mumbai', source: 'Hotelogix (CP Navi Mumbai)' },
  Pablo: { title: 'Pablo', source: 'Petpooja (Pablo)' },
  Dali: { title: 'Dali', source: 'Petpooja (Dali)' },
  Rabbit: { title: 'Rabbit', source: 'Petpooja (Rabbit)' },
  "Micky's": { title: "Micky's", source: "Micky's Sales Report" },
  Purosoul: { title: 'Purosoul', source: 'Purosoul Sales Report' }
};

const HIDDEN_PUROSOUL_REVENUE_COST_ROWS = new Set(['RM Cost Today', 'RM Cost %', 'Revenue MTD', 'Purchase MTD']);

function UnitRevenueHeader({ unit, rows, scope = 'today' }) {
  const row = rows.find((item) => item.unit === unit);
  const meta = UNIT_REVENUE_META[unit] ?? { title: unit, source: unit };
  return (
    <div className="relative mb-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d1724] to-[#101827] px-4 py-3.5 text-white shadow-card">
      <div className="absolute inset-y-0 left-0 w-1.5 rounded-r-full bg-primary" />
      <div className="absolute right-0 top-0 h-full w-36 bg-gradient-to-l from-primary/10 to-transparent" />
      <div className="relative flex items-center justify-between gap-4 pl-2.5">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold leading-tight">{meta.title}</div>
          <div className="mt-1 truncate text-[11.5px] font-medium text-white/55">{meta.source}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[9px] font-extrabold uppercase tracking-[0.28em] text-white/50">Revenue</div>
          <div className="num mt-1 text-[20px] font-extrabold leading-none">{money(numberValue(row?.revenueToday))}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/35">{scope}</div>
        </div>
      </div>
    </div>
  );
}

function GroupDivider({ label }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator" aria-hidden>
      <div className="h-px flex-1 bg-outline-variant/35" />
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/40">{label}</span>
      <div className="h-px flex-1 bg-outline-variant/35" />
    </div>
  );
}

function MailStatusCard({ title, icon, importedAt, rows }) {
  const hasRevenue = (rows ?? []).some(
    (row) => /total revenue|order revenue|revenue today/i.test(row.name) && numberValue(row.actual) > 0
  );
  const status = !importedAt ? 'not-uploaded' : !hasRevenue ? 'no-sales' : 'ok';
  if (status === 'ok') return null;
  const isNotUploaded = status === 'not-uploaded';
  return (
    <SectionCard title={title} subtitle={isNotUploaded ? 'Report not uploaded' : 'No sales recorded'} icon={icon} tone={isNotUploaded ? 'rose' : 'amber'} defaultOpen>
      <div className={`flex items-start gap-3 rounded-xl border px-4 py-4 ${isNotUploaded ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
        <span className={`material-symbols-outlined shrink-0 text-[22px] ${isNotUploaded ? 'text-rose-500' : 'text-amber-500'}`}>
          {isNotUploaded ? 'mail_off' : 'mark_email_read'}
        </span>
        <div>
          <p className={`text-sm font-bold ${isNotUploaded ? 'text-rose-700' : 'text-amber-700'}`}>
            {isNotUploaded ? 'Report not uploaded' : 'Mail received — no sales recorded'}
          </p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {isNotUploaded
              ? 'Daily sales email not received. Data will appear once the report is sent.'
              : 'The daily sales email was received but no sales were recorded for this date.'}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function WeeklyKpiTable({ rows }) {
  return (
    <DataTable
      columns={['KPI Name', 'Weekly AOP Target', 'Week Actual', '% vs Target', 'Status']}
      numericFrom={1}
      rows={rows.map((row) => ({
        key: row.id,
        cells: [
          <span className="font-semibold text-app-text">{row.name}</span>,
          <span className="num">{row.target}</span>,
          <span className="num font-bold text-primary">{row.actual}</span>,
          <span className={`num font-semibold ${row.percentVsTarget >= 95 ? 'text-emerald-700' : row.percentVsTarget >= 85 ? 'text-amber-700' : 'text-rose-700'}`}>
            {row.percentVsTarget}%
          </span>,
          <FlagBadge label={row.flag} />
        ]
      }))}
    />
  );
}

function WeeklyMixCard({ title, subtitle, mix, kind }) {
  const entries = kind === 'source' ? (mix?.sbo ?? []) : (mix?.segment ?? []);
  const chartRows = entries
    .map((row) => ({ name: row.name, value: numberValue(row.revenue), rooms: numberValue(row.rooms), pax: numberValue(row.pax) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = chartRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <SectionCard title={title} subtitle={subtitle} icon={SECTION_ICONS.hotel} tone="amber" defaultOpen>
      {chartRows.length ? (
        <DonutChart data={chartRows} total={total} />
      ) : (
        <div className="grid place-items-center py-10 text-center text-on-surface-variant/50">
          <span className="material-symbols-outlined mb-2 text-[32px]">donut_small</span>
          <p className="max-w-[260px] text-[12.5px] font-medium leading-relaxed">No weekly mix data available yet.</p>
        </div>
      )}
    </SectionCard>
  );
}

function WeeklySettlementSummary({ data, revenue, weekLabel }) {
  const totals = settlementTotals(data);
  const diff = numberValue(revenue) - totals.groupTotal;

  return (
    <SectionCard
      title="Settlement Summary"
      subtitle={`Week-to-date settlement reconciliation${weekLabel ? ` - ${weekLabel}` : ''}`}
      icon="point_of_sale"
      tone={diff === 0 ? 'teal' : 'rose'}
      defaultOpen
    >
      <div className={`mb-5 rounded-2xl border px-4 py-3.5 ${diff === 0 ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {diff === 0 ? 'Revenue and settlements match' : 'Revenue and settlements mismatch'}
            </div>
            <div className="num mt-0.5 text-xs font-medium text-app-muted">
              Revenue {money(revenue)} - Settled {money(totals.groupTotal)} - Difference{' '}
              <span className={`font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(diff)}</span>
            </div>
          </div>
        </div>
      </div>
      <StatStrip items={[
        {
          label: 'Total Revenue',
          value: moneyCompact(revenue),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        },
        {
          label: 'Total Settled',
          value: moneyCompact(totals.groupTotal),
          tone: 'text-emerald-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9" />
        },
        {
          label: 'Difference',
          value: moneyCompact(diff),
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        },
        {
          label: 'Status',
          value: diff === 0 ? 'MATCHED' : 'MISMATCH',
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          caption: diff === 0 ? 'Balanced for the week' : 'Investigate discrepancy',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        }
      ]} />
      <DataTable
        columns={['Settlement Mode', ...UNITS, 'Group Total']}
        numericFrom={1}
        rows={settlementModes.map((mode) => ({
          key: mode,
          cells: [
            <span className="font-semibold text-app-text">{mode}</span>,
            ...UNITS.map((unit) => <ReportValue key={unit} value={data.settlement?.[mode]?.[unit]} numeric />),
            <span className="num font-bold text-app-text">{money(totals.rowTotals[mode])}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-4 py-3">UNIT TOTAL</td>
            {UNITS.map((unit) => <td key={unit} className="num px-4 py-3 text-right">{money(totals.unitTotals[unit])}</td>)}
            <td className="num px-4 py-3 text-right">{money(totals.groupTotal)}</td>
          </tr>
        }
      />
    </SectionCard>
  );
}

function buildWeeklyPnlData(data, period) {
  return {
    ...(data ?? {}),
    pnl: (data?.pnl ?? []).map((row) => {
      const entry = period?.week?.[row.unit] ?? EMPTY_WEEK_ENTRY;
      const fixed = numberValue(row.fixedCost || entry.fixedCost) * 7;
      return {
        ...row,
        revenueToday: fmtAggregate(entry.revenue),
        purchasesToday: fmtAggregate(entry.purchases),
        fixedCost: fmtAggregate(fixed)
      };
    })
  };
}

function collectWeeklyFlagKpis(data) {
  return [
    ...(data?.hotels ?? []),
    ...(data?.fnb?.Pablo ?? []),
    ...(data?.fnb?.Dali ?? []),
    ...(data?.rabbits ?? []).filter((row) => row.section !== 'Cost'),
    ...(data?.mickys ?? []),
    ...(data?.purosoul ?? [])
  ];
}

export default function DashboardPage({ data, date, authToken, period, onRefreshSources, sourceRefreshRunning = false, sourceRefreshError = '' }) {
  const [viewMode, setViewMode] = useState('day');
  const [weekPeriod, setWeekPeriod] = useState(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState('');
  const roomRevenueRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Room Revenue & Occupancy'
  );
  const forecastRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Forecast'
  );
  const banquetRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Banquets'
  );
  const cpNmRoomRevenueRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP NM' && row.section === 'Room Revenue & Occupancy'
  );
  const cpNmForecastRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP NM' && row.section === 'Forecast'
  );
  const mickysLeadRows = (data?.mickys ?? []).filter((row) => row.section === 'Leads Pipeline');
  const mickysOrderRevenueRows = (data?.mickys ?? []).filter((row) => row.section === 'Orders & Revenue');
  const purosoulRevenueRows = (data?.purosoul ?? []).filter((row) => (
    row.section === 'Revenue & Cost' && !HIDDEN_PUROSOUL_REVENUE_COST_ROWS.has(row.name)
  ));
  const purosoulSkuRows = data?.purosoulSku ?? [];
  const banquetLists = [
    {
      key: 'banquetToday',
      title: `CP Nagpur: Banquet Function List Today${dateSuffix(data?.banquetTodayDate)}`,
      rows: data?.banquetToday ?? []
    },
    {
      key: 'banquetTomorrow',
      title: `CP Nagpur: Banquet Function List Tomorrow${dateSuffix(data?.banquetTomorrowDate)}`,
      rows: data?.banquetTomorrow ?? []
    }
  ];
  const options = [
    { key: 'day', label: 'Daily' },
    { key: 'week', label: 'Weekly' }
  ];

  useEffect(() => {
    if (!authToken || viewMode !== 'week') return undefined;
    let cancelled = false;
    setWeekLoading(true);
    setWeekError('');
    Promise.allSettled([
      getPnlPeriod(date, authToken)
    ])
      .then(([periodResult]) => {
        if (cancelled) return;
        if (periodResult.status === 'fulfilled') {
          setWeekPeriod(periodResult.value);
        } else {
          setWeekPeriod(null);
          setWeekError(periodResult.reason?.message ?? 'Unable to load week-to-date data');
        }
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => { cancelled = true; };
  }, [authToken, date, viewMode]);

  const activeWeekPeriod = weekPeriod ?? period;

  const buildWeeklyRows = useMemo(() => {
    const weeklyValues = activeWeekPeriod?.kpis?.week ?? {};
    return (unit, section, names = null) => (data?.hotels ?? [])
      .filter((row) => row.unit === unit && row.section === section && (!names || names.includes(row.name)))
      .filter((row) => row?.id && !isCumulativeKpiName(row.name))
      .map((row) => {
        const actual = numberValue(weeklyValues[row.id]);
        const target = aopTargetValue(row);
        const flag = calcFlag(actual, target, row.direction);
        return {
          ...row,
          target: fmtAggregate(target),
          actual: fmtAggregate(actual),
          percentVsTarget: Math.round(flag.ratio),
          flag: flag.label
        };
      });
  }, [activeWeekPeriod?.kpis?.week, data?.hotels]);

  const buildWeeklyRowsFrom = useMemo(() => {
    const weeklyValues = activeWeekPeriod?.kpis?.week ?? {};
    return (rows = [], section = null) => rows
      .filter((row) => (!section || row.section === section))
      .filter((row) => row?.id && !isCumulativeKpiName(row.name))
      .map((row) => {
        const actual = numberValue(weeklyValues[row.id]);
        const target = aopTargetValue(row);
        const flag = calcFlag(actual, target, row.direction);
        return {
          ...row,
          target: fmtAggregate(target),
          actual: fmtAggregate(actual),
          percentVsTarget: Math.round(flag.ratio),
          flag: flag.label
        };
      });
  }, [activeWeekPeriod?.kpis?.week]);

  const weekCpnRoomRows = buildWeeklyRows('CP Nagpur', 'Room Revenue & Occupancy');
  const weekCpnFnbRows = buildWeeklyRows('CP Nagpur', 'F&B Outlets');
  const weekCpnBanquetRows = buildWeeklyRows('CP Nagpur', 'Banquets');
  const weekCpNmRoomRows = buildWeeklyRows('CP NM', 'Room Revenue & Occupancy');
  const weekCpnMix = activeWeekPeriod?.occupancyMix?.['CP Nagpur'];
  const weekCpNmMix = activeWeekPeriod?.occupancyMix?.['CP NM'];
  const weeklyPnlData = useMemo(() => buildWeeklyPnlData(data, activeWeekPeriod), [activeWeekPeriod, data]);
  const weeklyPnlRows = useMemo(() => pnlRows(weeklyPnlData), [weeklyPnlData]);
  const dailyPnlRows = useMemo(() => pnlRows(data), [data]);
  const dailyPnlTotals = useMemo(() => summarizePnl(dailyPnlRows), [dailyPnlRows]);
  const weeklyPnlTotals = useMemo(() => summarizePnl(weeklyPnlRows), [weeklyPnlRows]);
  const weeklyFlags = useMemo(() => {
    const weeklyValues = activeWeekPeriod?.kpis?.week ?? {};
    return collectWeeklyFlagKpis(data)
      .filter((row) => row?.id && !isCumulativeKpiName(row.name) && weeklyValues[row.id] !== undefined)
      .map((row) => {
        const actual = numberValue(weeklyValues[row.id]);
        const target = aopTargetValue(row);
        const flag = calcFlag(actual, target, row.direction);
        return {
          unit: row.unit,
          kpiName: row.name,
          aopTarget: fmtAggregate(target),
          weekActual: fmtAggregate(actual),
          percentVsTarget: Math.round(flag.ratio),
          flag: flag.label
        };
      });
  }, [activeWeekPeriod?.kpis?.week, data]);
  const weeklyRiskFlags = weeklyFlags.filter((row) => row.flag === 'ACTION');
  const weeklyFlagCounts = {
    on: weeklyFlags.filter((row) => row.flag === 'ON TRACK').length,
    action: weeklyFlags.filter((row) => row.flag === 'ACTION').length
  };
  const pabloRows = data?.fnb?.Pablo ?? [];
  const daliRows = data?.fnb?.Dali ?? [];
  const rabbitRows = (data?.rabbits ?? []).filter((row) => row.section !== 'Cost');
  const mickysRows = data?.mickys ?? [];
  const purosoulRows = data?.purosoul ?? [];
  const pabloSections = [...new Set(pabloRows.map((row) => row.section))];
  const daliSections = [...new Set(daliRows.map((row) => row.section))];
  const rabbitSections = [...new Set(rabbitRows.map((row) => row.section))];
  const mickysSections = [...new Set(mickysRows.map((row) => row.section))];
  const purosoulSections = [...new Set(purosoulRows.map((row) => row.section))];
  const weekPurosoulSkuRows = activeWeekPeriod?.purosoulSku ?? purosoulSkuRows;
  const weeklySettlementData = useMemo(
    () => ({ ...(data ?? {}), settlement: activeWeekPeriod?.settlement ?? {} }),
    [activeWeekPeriod?.settlement, data]
  );
  const weekLabel = activeWeekPeriod ? `${activeWeekPeriod.weekStart} - ${date}` : '';
  const dailySourceStatus = [
    data?.importSource?.mickysSalesImportedAt,
    data?.importSource?.purosoulSalesImportedAt,
    data?.bankPosition?.length,
    data?.hotels?.length,
    data?.pnl?.length
  ];
  const dailyReadySources = dailySourceStatus.filter(Boolean).length;
  const dailyNavItems = [
    { href: '#daily-bank', label: 'Bank', icon: 'account_balance_wallet' },
    { href: '#daily-revenue', label: 'Revenue', icon: 'donut_large' },
    { href: '#daily-hotels', label: 'Hotels', icon: 'hotel' },
    { href: '#daily-fnb', label: 'F&B', icon: 'restaurant' },
    { href: '#daily-specialty', label: 'Specialty', icon: 'hub' },
    { href: '#daily-manufacturing', label: 'Purosoul', icon: 'factory' }
  ];
  const weeklyNavItems = [
    { href: '#weekly-pnl', label: 'P&L', icon: 'monitoring' },
    { href: '#weekly-flags', label: 'Flags', icon: 'flag' },
    { href: '#weekly-revenue', label: 'Revenue Mix', icon: 'donut_large' },
    { href: '#weekly-hotels', label: 'Hotels', icon: 'hotel' },
    { href: '#weekly-fnb', label: 'F&B', icon: 'restaurant' },
    { href: '#weekly-settlement', label: 'Settlement', icon: 'point_of_sale' }
  ];

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-2 flex flex-wrap items-center justify-end gap-2 border-b border-outline-variant/60 bg-surface/95 px-2 py-2 backdrop-blur md:static md:mx-0 md:border-b-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
          {sourceRefreshError ? (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs font-bold text-error">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>error</span>
              <span className="max-w-[260px] truncate">{sourceRefreshError}</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onRefreshSources}
            disabled={!onRefreshSources || sourceRefreshRunning}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-4 text-[12px] font-bold uppercase tracking-[0.05em] text-on-surface-variant shadow-sm transition-all hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface active:scale-95 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${sourceRefreshRunning ? 'animate-spin text-primary' : ''}`} aria-hidden>
              sync
            </span>
            {sourceRefreshRunning ? 'Refreshing...' : 'Refresh Sources'}
          </button>
          <div className="inline-flex gap-0.5 rounded-xl border border-outline-variant/60 bg-surface-container p-1">
            {options.map((option) => {
              const isActive = viewMode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setViewMode(option.key)}
                  aria-pressed={isActive}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
      </div>

      {viewMode === 'day' ? (
        <section className="space-y-5">
          <DashboardHero
            title="Daily Summary"
            subtitle={`Operating view for ${fmtDate(date)} across bank position, revenue, outlets, hotels, and production.`}
            meta={[
              { label: `${dailyReadySources}/${dailySourceStatus.length} source groups ready`, icon: 'cloud_done' },
              { label: `${dailyPnlRows.length} units`, icon: 'domain' }
            ]}
            navItems={dailyNavItems}
          >
            <StatStrip items={[
              {
                label: 'Revenue Today',
                value: moneyCompact(dailyPnlTotals.revenue),
                tone: 'text-teal-700',
                caption: 'Group operating revenue',
                icon: 'payments'
              },
              {
                label: 'Est. Net Profit',
                value: moneyCompact(dailyPnlTotals.net),
                tone: dailyPnlTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700',
                caption: `${percent(dailyPnlTotals.revenue ? (dailyPnlTotals.net / dailyPnlTotals.revenue) * 100 : 0)} net margin`,
                icon: 'trending_up'
              },
              {
                label: 'Tracked Purchases',
                value: moneyCompact(dailyPnlTotals.purchases),
                tone: 'text-amber-700',
                caption: 'COGS-enabled units',
                icon: 'shopping_cart'
              },
              {
                label: 'Fixed Cost',
                value: moneyCompact(dailyPnlTotals.fixed),
                tone: 'text-rose-700',
                caption: 'Modeled daily cost',
                icon: 'receipt_long'
              }
            ]} />
            <UnitHealthGrid rows={dailyPnlRows} />
          </DashboardHero>

          <div id="daily-bank" className="scroll-mt-24">
            <div className="mb-3 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary shadow-sm">
              <span className="material-symbols-outlined text-[22px]" aria-hidden>account_balance_wallet</span>
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-on-surface md:text-lg">Bank Position</h2>
              <p className="text-[11.5px] font-medium text-on-surface-variant">Daily balance position by unit</p>
            </div>
            </div>
            <BankPositionTable rows={data?.bankPosition ?? []} />
          </div>
          <div id="daily-revenue" className="scroll-mt-24">
            <RevenueShareDonut data={data} />
          </div>
          <GroupDivider label="Hotels" />
          <div id="daily-hotels" className="scroll-mt-24" />
          <UnitRevenueHeader unit="CP Nagpur" rows={dailyPnlRows} />
          <SectionCard
            title="CP Nagpur: Room Revenue & Occupancy"
            subtitle={`${roomRevenueRows.length} KPI${roomRevenueRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={roomRevenueRows} />
          </SectionCard>
          <SectionCard
            title={`CP Nagpur: Forecast${dateSuffix(data?.forecastDate)}`}
            subtitle={`${forecastRows.length} KPI${forecastRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={forecastRows} />
          </SectionCard>
          <SectionCard
            title="CP Nagpur: Banquets"
            subtitle={`${banquetRows.length} KPI${banquetRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.banquet}
            tone="amber"
            defaultOpen
          >
            <KpiTable rows={banquetRows} />
          </SectionCard>
          {banquetLists.map((list) => (
            <SectionCard
              key={list.key}
              title={list.title}
              subtitle={`${list.rows.length} function${list.rows.length === 1 ? '' : 's'} scheduled`}
              icon={SECTION_ICONS.banquet}
              tone="amber"
              defaultOpen
            >
              <DataTable
                columns={['Party / Client', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes']}
                rows={list.rows.map((row, index) => ({
                  key: index,
                  cells: ['marketSegment', 'pax', 'venue', 'session', 'revenue', 'notes'].map((field) => (
                    <ReportValue key={field} value={row[field]} />
                  ))
                }))}
              />
            </SectionCard>
          ))}
          <GroupDivider label="CP Navi Mumbai" />
          <UnitRevenueHeader unit="CP NM" rows={dailyPnlRows} />
          <SectionCard
            title="CP NM: Room Revenue & Occupancy"
            subtitle={`${cpNmRoomRevenueRows.length} KPI${cpNmRoomRevenueRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={cpNmRoomRevenueRows} />
          </SectionCard>
          <SectionCard
            title={`CP NM: Forecast${dateSuffix(data?.forecastDate)}`}
            subtitle={`${cpNmForecastRows.length} KPI${cpNmForecastRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={cpNmForecastRows} />
          </SectionCard>
          <div id="daily-fnb" className="scroll-mt-24">
            <FnbOutletSalesChart data={data} />
          </div>
          <GroupDivider label="Cloud Kitchen & Specialty" />
          <div id="daily-specialty" className="scroll-mt-24" />
          <UnitRevenueHeader unit="Micky's" rows={dailyPnlRows} />
          {data?.importSource?.mickysSalesImportedAt ? (
            <>
              <SectionCard
                title="Micky's: Leads Pipeline"
                subtitle={`${mickysLeadRows.length} KPI${mickysLeadRows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.restaurant}
                tone="rose"
                defaultOpen
              >
                <KpiTable rows={mickysLeadRows} />
              </SectionCard>
              {numberValue(mickysOrderRevenueRows.find(r => /order revenue/i.test(r.name))?.actual) > 0 ? (
                <SectionCard
                  title="Micky's: Orders & Revenue"
                  subtitle={`${mickysOrderRevenueRows.length} KPI${mickysOrderRevenueRows.length === 1 ? '' : 's'}`}
                  icon={SECTION_ICONS.restaurant}
                  tone="rose"
                  defaultOpen
                >
                  <KpiTable rows={mickysOrderRevenueRows} />
                </SectionCard>
              ) : (
                <SectionCard title="Micky's: Orders & Revenue" subtitle="No sales recorded today" icon={SECTION_ICONS.restaurant} tone="amber" defaultOpen>
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-4">
                    <span className="material-symbols-outlined shrink-0 text-[22px] text-amber-500">mark_email_read</span>
                    <div>
                      <p className="text-sm font-bold text-amber-700">Mail received — no sales recorded</p>
                      <p className="mt-0.5 text-xs text-on-surface-variant">The daily sales email was received but no orders were recorded for this date.</p>
                    </div>
                  </div>
                </SectionCard>
              )}
            </>
          ) : (
            <MailStatusCard
              title="Micky's by CP Foods"
              icon={SECTION_ICONS.restaurant}
              importedAt={null}
              rows={[]}
            />
          )}
          <GroupDivider label="Manufacturing" />
          <div id="daily-manufacturing" className="scroll-mt-24" />
          <UnitRevenueHeader unit="Purosoul" rows={dailyPnlRows} />
          {data?.importSource?.purosoulSalesImportedAt && numberValue(purosoulRevenueRows.find(r => /total revenue/i.test(r.name))?.actual) > 0 ? (
            <>
              <SectionCard
                title="Purosoul: Revenue & Cost"
                subtitle="Daily revenue, raw material cost, and margin"
                icon={SECTION_ICONS.kpi}
                tone="teal"
                defaultOpen
              >
                <KpiTable rows={purosoulRevenueRows} />
              </SectionCard>
              <SectionCard
                title="Purosoul: Daily Production & Dispatch"
                subtitle={`${purosoulSkuRows.length} SKU${purosoulSkuRows.length === 1 ? '' : 's'} tracked`}
                icon={SECTION_ICONS.sku}
                tone="indigo"
                defaultOpen
              >
                <DataTable
                  columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched']}
                  rows={purosoulSkuRows.map((row) => ({
                    key: row.sku,
                    cells: [
                      <span className="font-semibold">{row.sku}</span>,
                      <ReportValue value={row.produced} />,
                      <ReportValue value={row.dispatched} />,
                      <ReportValue value={row.clStock} />,
                      <ReportValue value={row.mtd} />
                    ]
                  }))}
                />
              </SectionCard>
            </>
          ) : (
            <MailStatusCard
              title="Purosoul"
              icon={SECTION_ICONS.kpi}
              importedAt={null}
              rows={[]}
            />
          )}
        </section>
      ) : (
        <section className="space-y-5">
          <DashboardHero
            title="Weekly Summary"
            subtitle={activeWeekPeriod ? `Week-to-date operating view from ${activeWeekPeriod.weekStart} to ${date}.` : 'Week-to-date operating view is loading from saved reports.'}
            meta={[
              { label: activeWeekPeriod ? `${activeWeekPeriod.weekDates?.length ?? 0} saved days` : 'Loading coverage', icon: weekLoading ? 'progress_activity' : 'event_available' },
              { label: weeklyFlagCounts.action ? `${weeklyFlagCounts.action} action flags` : 'No action flags', icon: 'flag' }
            ]}
            navItems={weeklyNavItems}
          >
            <StatStrip items={[
              {
                label: 'Revenue WTD',
                value: moneyCompact(weeklyPnlTotals.revenue),
                tone: 'text-teal-700',
                caption: 'Group week-to-date revenue',
                icon: 'payments'
              },
              {
                label: 'Est. Net Profit',
                value: moneyCompact(weeklyPnlTotals.net),
                tone: weeklyPnlTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700',
                caption: `${percent(weeklyPnlTotals.revenue ? (weeklyPnlTotals.net / weeklyPnlTotals.revenue) * 100 : 0)} net margin`,
                icon: 'trending_up'
              },
              {
                label: 'Action Flags',
                value: weeklyFlagCounts.action,
                tone: weeklyFlagCounts.action ? 'text-rose-700' : 'text-emerald-700',
                caption: `${weeklyFlagCounts.on} KPIs on track`,
                icon: 'flag'
              },
              {
                label: 'Tracked Days',
                value: activeWeekPeriod?.weekDates?.length ?? 0,
                tone: 'text-amber-700',
                caption: activeWeekPeriod ? `${activeWeekPeriod.weekStart} to ${date}` : 'Waiting for saved reports',
                icon: 'date_range'
              }
            ]} />
            <UnitHealthGrid rows={weeklyPnlRows} title="Weekly Unit Pulse" scope="week to date" />
          </DashboardHero>
          {weekError ? (
            <div className="glass-card border border-error/20 bg-error/10 px-5 py-4 text-sm font-semibold text-error">
              {weekError}
            </div>
          ) : null}
          {weekLoading && !activeWeekPeriod ? (
            <div className="glass-card flex items-center gap-3 px-5 py-4 text-sm font-semibold text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin text-[20px] text-primary" aria-hidden>progress_activity</span>
              Loading week-to-date data...
            </div>
          ) : null}
          {!weekLoading && activeWeekPeriod && !(activeWeekPeriod.weekDates?.length) ? (
            <div className="glass-card border border-tertiary/25 bg-tertiary-container/45 px-5 py-4 text-sm font-semibold text-on-tertiary-container">
              No saved reports found for this week up to {date}.
            </div>
          ) : null}
          <div id="weekly-pnl" className="scroll-mt-24">
          <SectionCard
            title="Unit-wise Estimated P&L"
            subtitle={activeWeekPeriod ? `Week to date: ${activeWeekPeriod.weekStart} - ${date} (${activeWeekPeriod.weekDates?.length ?? 0} saved day${(activeWeekPeriod.weekDates?.length ?? 0) === 1 ? '' : 's'})` : 'Loading week-to-date P&L...'}
            icon={SECTION_ICONS.kpi}
            tone="teal"
            defaultOpen
          >
            <DataTable
              columns={['Unit', 'Revenue WTD', 'Purchases WTD', 'Gross Profit', 'GP%', 'Fixed Cost (Week)', 'Est. Net Profit', 'Net Margin%', 'Days']}
              numericFrom={1}
              rows={weeklyPnlRows.map((row) => {
                const entry = activeWeekPeriod?.week?.[row.unit] ?? EMPTY_WEEK_ENTRY;
                return {
                  key: row.unit,
                  cells: [
                    <span className="font-semibold text-app-text">{row.unit}</span>,
                    <ReportValue value={row.revenueToday} numeric />,
                    row.tracksCogs ? <ReportValue value={row.purchasesToday} numeric /> : <span className="num text-on-surface-variant/35">-</span>,
                    row.tracksCogs
                      ? <span className="num font-medium text-app-text">{money(row.grossProfit)}</span>
                      : <span className="num text-on-surface-variant/35">-</span>,
                    row.tracksCogs
                      ? <span className={`num font-semibold ${row.gpPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.gpPercent)}</span>
                      : <span className="num text-on-surface-variant/35">-</span>,
                    row.hasFixedCost ? <ReportValue value={row.fixedCost} numeric /> : <span className="num text-on-surface-variant/35">-</span>,
                    <span className={`num font-semibold ${row.estNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.estNetProfit)}</span>,
                    <span className={`num font-semibold ${row.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.netMargin)}</span>,
                    <span className="num text-app-text">{entry.days || 0}</span>
                  ]
                };
              })}
              footer={
                <tr>
                  <td className="px-4 py-3">GROUP TOTAL</td>
                  <td className="num px-4 py-3 text-right">{money(weeklyPnlTotals.revenue)}</td>
                  <td className="num px-4 py-3 text-right">{money(weeklyPnlTotals.purchases)}</td>
                  <td className={`num px-4 py-3 text-right ${weeklyPnlTotals.gp >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(weeklyPnlTotals.gp)}</td>
                  <td className="num px-4 py-3 text-right">{percent(weeklyPnlTotals.revenue ? (weeklyPnlTotals.gp / weeklyPnlTotals.revenue) * 100 : 0)}</td>
                  <td className="num px-4 py-3 text-right">{money(weeklyPnlTotals.fixed)}</td>
                  <td className={`num px-4 py-3 text-right ${weeklyPnlTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(weeklyPnlTotals.net)}</td>
                  <td className={`num px-4 py-3 text-right ${weeklyPnlTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(weeklyPnlTotals.revenue ? (weeklyPnlTotals.net / weeklyPnlTotals.revenue) * 100 : 0)}</td>
                  <td className="num px-4 py-3 text-right">-</td>
                </tr>
              }
            />
          </SectionCard>
          </div>

          <div id="weekly-flags" className="scroll-mt-24">
          <SectionCard
            title="Action Flag Summary"
            subtitle={weekLoading ? 'Loading weekly target comparison...' : 'Weekly actuals compared with weekly AOP targets'}
            icon={SECTION_ICONS.kpi}
            tone="amber"
            defaultOpen
          >
            <StatStrip items={[
              {
                label: 'On Track',
                value: weeklyFlagCounts.on,
                tone: 'text-emerald-700',
                caption: 'Weekly KPIs tracking well',
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              },
              {
                label: 'Action',
                value: weeklyFlagCounts.action,
                tone: 'text-rose-700',
                caption: 'Weekly KPIs needing attention',
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              }
            ]} />
            <DataTable
              columns={['Unit', 'KPI Name', 'Weekly AOP Target', 'Week Actual', '% vs Target', 'Flag', 'Action Required']}
              numericFrom={2}
              rows={weeklyRiskFlags.map((row) => ({
                key: `${row.unit}-${row.kpiName}`,
                cells: [
                  <span className="font-semibold text-app-text">{row.unit}</span>,
                  <span className="text-app-text">{row.kpiName}</span>,
                  <span className="num">{row.aopTarget}</span>,
                  <span className="num">{row.weekActual}</span>,
                  <span className={`num font-semibold ${row.percentVsTarget >= 90 ? 'text-emerald-700' : 'text-rose-700'}`}>{row.percentVsTarget}%</span>,
                  <FlagBadge label={row.flag} />,
                  <span className="block h-10 min-w-[220px] rounded-md border border-dashed border-outline-variant/80 bg-surface-container-lowest" aria-label="Blank action required field" />
                ]
              }))}
            />
          </SectionCard>
          </div>

          <div id="weekly-revenue" className="scroll-mt-24">
          <RevenueShareDonut
            data={weeklyPnlData}
            title="Unit-wise Revenue Share"
            subtitle={activeWeekPeriod ? `P&L revenue contribution by unit - week to date (${activeWeekPeriod.weekStart} - ${date})` : 'P&L revenue contribution by unit - week to date'}
          />
          </div>

          <div id="weekly-hotels" className="scroll-mt-24" />
          <UnitRevenueHeader unit="CP Nagpur" rows={weeklyPnlRows} scope="week to date" />
          <SectionCard title="CP Nagpur: Room Revenue & Occupancy" subtitle="Week-to-date hotel KPIs" icon={SECTION_ICONS.hotel} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpnRoomRows} />
          </SectionCard>
          <SectionCard title="CP Nagpur: F&B Outlets" subtitle="Week-to-date outlet KPIs" icon={SECTION_ICONS.restaurant} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpnFnbRows} />
          </SectionCard>
          <SectionCard title="CP Nagpur: Banquets" subtitle="Week-to-date banquet KPIs" icon={SECTION_ICONS.banquet} tone="amber" defaultOpen>
            <WeeklyKpiTable rows={weekCpnBanquetRows} />
          </SectionCard>
          <div className="grid gap-5 xl:grid-cols-2">
            <WeeklyMixCard
              title="CP Nagpur: Source of Business"
              subtitle="Week-to-date room source mix"
              mix={weekCpnMix}
              kind="source"
            />
            <WeeklyMixCard
              title="CP Nagpur: Market Segment"
              subtitle="Week-to-date room segment mix"
              mix={weekCpnMix}
              kind="segment"
            />
          </div>
          <UnitRevenueHeader unit="CP NM" rows={weeklyPnlRows} scope="week to date" />
          <SectionCard title="CP NM: Room Revenue & Occupancy" subtitle="Week-to-date hotel KPIs" icon={SECTION_ICONS.hotel} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpNmRoomRows} />
          </SectionCard>
          <div className="grid gap-5 xl:grid-cols-2">
            <WeeklyMixCard
              title="CP NM: Source of Business"
              subtitle="Week-to-date room source mix"
              mix={weekCpNmMix}
              kind="source"
            />
            <WeeklyMixCard
              title="CP NM: Market Segment"
              subtitle="Week-to-date room segment mix"
              mix={weekCpNmMix}
              kind="segment"
            />
          </div>
          <div id="weekly-fnb" className="scroll-mt-24">
            <FnbOutletSalesChart data={data} period={activeWeekPeriod} mode="week" />
          </div>
          <UnitRevenueHeader unit="Pablo" rows={weeklyPnlRows} scope="week to date" />
          {pabloSections.map((section) => {
            const rows = buildWeeklyRowsFrom(pabloRows, section);
            return (
              <SectionCard
                key={`week-pablo-${section}`}
                title={`Pablo: ${section}`}
                subtitle={`${rows.length} weekly KPI${rows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.restaurant}
                tone="teal"
                defaultOpen
              >
                <WeeklyKpiTable rows={rows} />
              </SectionCard>
            );
          })}
          <UnitRevenueHeader unit="Dali" rows={weeklyPnlRows} scope="week to date" />
          {daliSections.map((section) => {
            const rows = buildWeeklyRowsFrom(daliRows, section);
            return (
              <SectionCard
                key={`week-dali-${section}`}
                title={`Dali: ${section}`}
                subtitle={`${rows.length} weekly KPI${rows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.restaurant}
                tone="teal"
                defaultOpen
              >
                <WeeklyKpiTable rows={rows} />
              </SectionCard>
            );
          })}
          <UnitRevenueHeader unit="Rabbit" rows={weeklyPnlRows} scope="week to date" />
          {rabbitSections.map((section, index) => {
            const rows = buildWeeklyRowsFrom(rabbitRows, section);
            return (
              <SectionCard
                key={`week-rabbit-${section}`}
                title={`Rabbit: ${section}`}
                subtitle={`${rows.length} weekly KPI${rows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.restaurant}
                tone={index % 2 === 0 ? 'indigo' : 'amber'}
                defaultOpen
              >
                <WeeklyKpiTable rows={rows} />
              </SectionCard>
            );
          })}
          <UnitRevenueHeader unit="Micky's" rows={weeklyPnlRows} scope="week to date" />
          {mickysSections.map((section) => {
            const rows = buildWeeklyRowsFrom(mickysRows, section);
            return (
              <SectionCard
                key={`week-mickys-${section}`}
                title={`Micky's by CP Foods: ${section}`}
                subtitle={`${rows.length} weekly KPI${rows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.restaurant}
                tone="rose"
                defaultOpen
              >
                <WeeklyKpiTable rows={rows} />
              </SectionCard>
            );
          })}
          <UnitRevenueHeader unit="Purosoul" rows={weeklyPnlRows} scope="week to date" />
          {purosoulSections.map((section) => {
            const rows = buildWeeklyRowsFrom(purosoulRows, section);
            return (
              <SectionCard
                key={`week-purosoul-${section}`}
                title={`Purosoul: ${section}`}
                subtitle={`${rows.length} weekly KPI${rows.length === 1 ? '' : 's'}`}
                icon={SECTION_ICONS.kpi}
                tone="teal"
                defaultOpen
              >
                <WeeklyKpiTable rows={rows} />
              </SectionCard>
            );
          })}
          <SectionCard
            title="Purosoul: SKU Production & Dispatch"
            subtitle={`${weekPurosoulSkuRows.length} SKU${weekPurosoulSkuRows.length === 1 ? '' : 's'} tracked`}
            icon={SECTION_ICONS.sku}
            tone="indigo"
            defaultOpen
          >
            <DataTable
              columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched']}
              rows={weekPurosoulSkuRows.map((row) => ({
                key: row.sku,
                cells: [
                  <span className="font-semibold">{row.sku}</span>,
                  <ReportValue value={row.produced} />,
                  <ReportValue value={row.dispatched} />,
                  <ReportValue value={row.clStock} />,
                  <ReportValue value={row.mtd} />
                ]
              }))}
            />
          </SectionCard>
          <div id="weekly-settlement" className="scroll-mt-24">
            <WeeklySettlementSummary
              data={weeklySettlementData}
              revenue={weeklyPnlTotals.revenue}
              weekLabel={weekLabel}
            />
          </div>
        </section>
      )}
    </div>
  );
}
