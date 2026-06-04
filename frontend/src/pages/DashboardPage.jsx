import React, { useEffect, useMemo, useState } from 'react';
import BankPositionTable from '../components/BankPositionTable';
import DataTable from '../components/DataTable';
import FnbOutletSalesChart from '../components/FnbOutletSalesChart';
import FlagBadge from '../components/FlagBadge';
import { DonutChart } from '../components/DashboardCharts';
import RevenueShareDonut from '../components/RevenueShareDonut';
import SectionCard from '../components/SectionCard';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';
import { getAopTargets, getPnlPeriod } from '../lib/api';
import { calcFlag, numberValue } from '../lib/calculations';

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

function inferKpiMode(name) {
  const label = String(name ?? '').toLowerCase();
  if (isCumulativeKpiName(label)) return 'latest';
  if (
    label.includes('%')
    || label.includes('avg')
    || label.includes('occupancy')
    || label.includes('arr')
    || label.includes('revpar')
    || label.includes('aov')
    || label.includes('apc')
    || label.includes('rate')
    || label.includes('turnover')
    || label.includes('margin')
    || label.includes('covers/day')
  ) {
    return 'avg';
  }
  return 'sum';
}

function fmtAggregate(value) {
  const rounded = Math.round(numberValue(value) * 100) / 100;
  return String(rounded);
}

function sourceBusinessNames() {
  return ['OTA (MMT/Booking.com)', 'Walk-ins', 'Group Bookings', 'Cancellations/No-shows'];
}

function marketSegmentNames() {
  return ['Corporate', 'FIT/Leisure'];
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

function WeeklyMixPie({ title, subtitle, rows }) {
  const chartRows = rows
    .map((row) => ({ name: row.name, value: numberValue(row.actual) }))
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

export default function DashboardPage({ data, date, authToken }) {
  const [viewMode, setViewMode] = useState('day');
  const [weekPeriod, setWeekPeriod] = useState(null);
  const [aopTargets, setAopTargets] = useState({ weekly: {} });
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
  const purosoulRevenueRows = (data?.purosoul ?? []).filter((row) => row.section === 'Revenue & Cost');
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
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' }
  ];

  useEffect(() => {
    if (!authToken || viewMode !== 'week') return undefined;
    let cancelled = false;
    setWeekLoading(true);
    setWeekError('');
    Promise.allSettled([
      getPnlPeriod(date, authToken),
      getAopTargets(authToken)
    ])
      .then(([periodResult, targetsResult]) => {
        if (cancelled) return;
        if (periodResult.status === 'fulfilled') {
          setWeekPeriod(periodResult.value);
        } else {
          setWeekPeriod(null);
          setWeekError(periodResult.reason?.message ?? 'Unable to load week-to-date data');
        }
        if (targetsResult.status === 'fulfilled') {
          setAopTargets(targetsResult.value ?? { weekly: {} });
        } else {
          setAopTargets({ weekly: {} });
        }
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => { cancelled = true; };
  }, [authToken, date, viewMode]);

  const buildWeeklyRows = useMemo(() => {
    const weeklyValues = weekPeriod?.kpis?.week ?? {};
    const weeklyModes = weekPeriod?.kpiModes?.week ?? {};
    const weeklyOverrides = aopTargets?.weekly ?? {};
    return (unit, section, names = null) => (data?.hotels ?? [])
      .filter((row) => row.unit === unit && row.section === section && (!names || names.includes(row.name)))
      .filter((row) => row?.id && !isCumulativeKpiName(row.name))
      .map((row) => {
        const actual = numberValue(weeklyValues[row.id]);
        const mode = weeklyModes[row.id] ?? inferKpiMode(row.name);
        const defaultTarget = numberValue(row.target);
        const target = weeklyOverrides[row.id] !== undefined
          ? numberValue(weeklyOverrides[row.id])
          : mode === 'sum'
            ? defaultTarget * 7
            : defaultTarget;
        const flag = calcFlag(actual, target, row.direction);
        return {
          ...row,
          target: fmtAggregate(target),
          actual: fmtAggregate(actual),
          percentVsTarget: Math.round(flag.ratio),
          flag: flag.label
        };
      });
  }, [aopTargets?.weekly, data?.hotels, weekPeriod?.kpiModes?.week, weekPeriod?.kpis?.week]);

  const weekCpnRoomRows = buildWeeklyRows('CP Nagpur', 'Room Revenue & Occupancy');
  const weekCpnFnbRows = buildWeeklyRows('CP Nagpur', 'F&B Outlets');
  const weekCpnBanquetRows = buildWeeklyRows('CP Nagpur', 'Banquets');
  const weekCpnSourceRows = buildWeeklyRows('CP Nagpur', 'Market Segments', sourceBusinessNames());
  const weekCpnMarketRows = buildWeeklyRows('CP Nagpur', 'Market Segments', marketSegmentNames());
  const weekCpNmRoomRows = buildWeeklyRows('CP NM', 'Room Revenue & Occupancy');
  const weekCpNmSourceRows = buildWeeklyRows('CP NM', 'Market Segments', sourceBusinessNames());
  const weekCpNmMarketRows = buildWeeklyRows('CP NM', 'Market Segments', marketSegmentNames());

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
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
        <section>
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
          <RevenueShareDonut data={data} />
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
          <FnbOutletSalesChart data={data} />
          <SectionCard
            title="Micky's: Leads Pipeline"
            subtitle={`${mickysLeadRows.length} KPI${mickysLeadRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.restaurant}
            tone="rose"
            defaultOpen
          >
            <KpiTable rows={mickysLeadRows} />
          </SectionCard>
          <SectionCard
            title="Micky's: Orders & Revenue"
            subtitle={`${mickysOrderRevenueRows.length} KPI${mickysOrderRevenueRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.restaurant}
            tone="rose"
            defaultOpen
          >
            <KpiTable rows={mickysOrderRevenueRows} />
          </SectionCard>
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
              columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched', 'YTD']}
              rows={purosoulSkuRows.map((row) => ({
                key: row.sku,
                cells: [
                  <span className="font-semibold">{row.sku}</span>,
                  <ReportValue value={row.produced} />,
                  <ReportValue value={row.dispatched} />,
                  <ReportValue value={row.clStock} />,
                  <ReportValue value={row.mtd} />,
                  <ReportValue value={row.ytd} />
                ]
              }))}
            />
          </SectionCard>
        </section>
      ) : (
        <section className="space-y-5">
          {weekError ? (
            <div className="glass-card border border-error/20 bg-error/10 px-5 py-4 text-sm font-semibold text-error">
              {weekError}
            </div>
          ) : null}
          {weekLoading && !weekPeriod ? (
            <div className="glass-card px-5 py-4 text-sm font-semibold text-on-surface-variant">
              Loading week-to-date data...
            </div>
          ) : null}
          {!weekLoading && weekPeriod && !(weekPeriod.weekDates?.length) ? (
            <div className="glass-card border border-tertiary/25 bg-tertiary-container/45 px-5 py-4 text-sm font-semibold text-on-tertiary-container">
              No saved reports found for this week up to {date}.
            </div>
          ) : null}
          <SectionCard title="CP Nagpur: Room Revenue & Occupancy" subtitle="Week-to-date hotel KPIs" icon={SECTION_ICONS.hotel} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpnRoomRows} />
          </SectionCard>
          <SectionCard title="CP Nagpur: F&B Outlets" subtitle="Week-to-date outlet KPIs" icon={SECTION_ICONS.restaurant} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpnFnbRows} />
          </SectionCard>
          <SectionCard title="CP Nagpur: Banquets" subtitle="Week-to-date banquet KPIs" icon={SECTION_ICONS.banquet} tone="amber" defaultOpen>
            <WeeklyKpiTable rows={weekCpnBanquetRows} />
          </SectionCard>
          <WeeklyMixPie title="CP Nagpur: Source of Business" subtitle="Week-to-date room source mix" rows={weekCpnSourceRows} />
          <WeeklyMixPie title="CP Nagpur: Market Segment" subtitle="Week-to-date room segment mix" rows={weekCpnMarketRows} />
          <SectionCard title="CP NM: Room Revenue & Occupancy" subtitle="Week-to-date hotel KPIs" icon={SECTION_ICONS.hotel} tone="teal" defaultOpen>
            <WeeklyKpiTable rows={weekCpNmRoomRows} />
          </SectionCard>
          <WeeklyMixPie title="CP NM: Source of Business" subtitle="Week-to-date room source mix" rows={weekCpNmSourceRows} />
          <WeeklyMixPie title="CP NM: Market Segment" subtitle="Week-to-date room segment mix" rows={weekCpNmMarketRows} />
        </section>
      )}
    </div>
  );
}
