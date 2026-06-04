import React, { useEffect, useMemo, useState } from 'react';
import BankPositionTable from '../components/BankPositionTable';
import DataTable from '../components/DataTable';
import FnbOutletSalesChart from '../components/FnbOutletSalesChart';
import FlagBadge from '../components/FlagBadge';
import RevenueShareDonut from '../components/RevenueShareDonut';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';
import { getAopTargets, getPnlPeriod } from '../lib/api';
import { calcFlag, money, numberValue, percent, pnlRows, UNITS } from '../lib/calculations';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function dateSuffix(iso) {
  const formatted = fmtDate(iso);
  return formatted ? ` - ${formatted}` : '';
}

const EMPTY_WEEK_ENTRY = { revenue: 0, purchases: 0, gp: 0, netProfit: 0, days: 0, fixedCost: 0 };

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

function collectDashboardKpis(data) {
  return [
    ...(data?.hotels ?? []),
    ...(data?.fnb?.Pablo ?? []),
    ...(data?.fnb?.Dali ?? []),
    ...(data?.rabbits ?? []),
    ...(data?.mickys ?? []),
    ...(data?.purosoul ?? [])
  ];
}

function buildWeeklyPnlData(data, period) {
  return {
    ...(data ?? {}),
    pnl: (data?.pnl ?? []).map((row) => {
      const entry = period?.week?.[row.unit] ?? EMPTY_WEEK_ENTRY;
      const fixed = numberValue(row.fixedCost || entry.fixedCost) * 7;
      return {
        ...row,
        revenueToday: String(Math.round(numberValue(entry.revenue) * 100) / 100),
        purchasesToday: String(Math.round(numberValue(entry.purchases) * 100) / 100),
        fixedCost: String(Math.round(fixed * 100) / 100)
      };
    })
  };
}

export default function DashboardPage({ data, date, authToken }) {
  const [viewMode, setViewMode] = useState('day');
  const [weekPeriod, setWeekPeriod] = useState(null);
  const [aopTargets, setAopTargets] = useState({ weekly: {} });
  const [weekLoading, setWeekLoading] = useState(false);
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
    Promise.all([
      getPnlPeriod(date, authToken),
      getAopTargets(authToken)
    ])
      .then(([periodPayload, targetsPayload]) => {
        if (cancelled) return;
        setWeekPeriod(periodPayload);
        setAopTargets(targetsPayload ?? { weekly: {} });
      })
      .catch(() => {
        if (cancelled) return;
        setWeekPeriod(null);
      })
      .finally(() => {
        if (!cancelled) setWeekLoading(false);
      });
    return () => { cancelled = true; };
  }, [authToken, date, viewMode]);

  const weeklyPnlData = useMemo(() => buildWeeklyPnlData(data, weekPeriod), [data, weekPeriod]);
  const weeklyPnlRows = useMemo(() => pnlRows(weeklyPnlData), [weeklyPnlData]);
  const weeklyPnlTotals = weeklyPnlRows.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday);
    acc.purchases += row.tracksCogs ? numberValue(row.purchasesToday) : 0;
    acc.gp += row.tracksCogs ? row.grossProfit : 0;
    acc.fixed += row.hasFixedCost ? numberValue(row.fixedCost) : 0;
    acc.net += row.estNetProfit;
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, fixed: 0, net: 0 });

  const weeklyFlags = useMemo(() => {
    const weeklyValues = weekPeriod?.kpis?.week ?? {};
    const weeklyModes = weekPeriod?.kpiModes?.week ?? {};
    const weeklyOverrides = aopTargets?.weekly ?? {};
    return collectDashboardKpis(data)
      .filter((row) => row?.id && !isCumulativeKpiName(row.name) && weeklyValues[row.id] !== undefined)
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
          unit: row.unit,
          kpiName: row.name,
          aopTarget: target,
          weekActual: actual,
          percentVsTarget: Math.round(flag.ratio),
          flag: flag.label
        };
      });
  }, [aopTargets?.weekly, data, weekPeriod?.kpiModes?.week, weekPeriod?.kpis?.week]);
  const weeklyRiskFlags = weeklyFlags.filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');
  const weeklyFlagCounts = {
    on: weeklyFlags.filter((row) => row.flag === 'ON TRACK' || row.flag === 'OUTPERFORM').length,
    watch: weeklyFlags.filter((row) => row.flag === 'WATCH').length,
    action: weeklyFlags.filter((row) => row.flag === 'ACTION NEEDED').length
  };

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
          <SectionCard
            title="Unit-wise Estimated P&L"
            subtitle={weekPeriod ? `Week to date: ${weekPeriod.weekStart} - ${date} (${weekPeriod.weekDates?.length ?? 0} saved day${(weekPeriod.weekDates?.length ?? 0) === 1 ? '' : 's'})` : 'Loading week-to-date P&L...'}
            icon={SECTION_ICONS.kpi}
            tone="teal"
            defaultOpen
          >
            <DataTable
              columns={['Unit', 'Revenue WTD', 'Purchases WTD', 'Gross Profit', 'GP%', 'Fixed Cost (Week)', 'Est. Net Profit', 'Net Margin%', 'Days']}
              numericFrom={1}
              rows={weeklyPnlRows.map((row) => {
                const entry = weekPeriod?.week?.[row.unit] ?? EMPTY_WEEK_ENTRY;
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

          <SectionCard
            title="Watch Out Flag Summary"
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
                label: 'Watch',
                value: weeklyFlagCounts.watch,
                tone: 'text-amber-700',
                caption: 'Weekly KPIs to monitor',
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
              },
              {
                label: 'Action Needed',
                value: weeklyFlagCounts.action,
                tone: 'text-rose-700',
                caption: 'Weekly KPIs needing attention',
                icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              }
            ]} />
            <DataTable
              columns={['Unit', 'KPI Name', 'Weekly AOP Target', 'Week Actual', '% vs Target', 'Flag']}
              numericFrom={2}
              rows={weeklyRiskFlags.map((row) => ({
                key: `${row.unit}-${row.kpiName}`,
                cells: [
                  <span className="font-semibold text-app-text">{row.unit}</span>,
                  <span className="text-app-text">{row.kpiName}</span>,
                  <span className="num">{row.aopTarget}</span>,
                  <span className="num">{row.weekActual}</span>,
                  <span className={`num font-semibold ${row.percentVsTarget >= 95 ? 'text-emerald-700' : row.percentVsTarget >= 85 ? 'text-amber-700' : 'text-rose-700'}`}>{row.percentVsTarget}%</span>,
                  <FlagBadge label={row.flag} />
                ]
              }))}
            />
          </SectionCard>

          <RevenueShareDonut
            data={weeklyPnlData}
            title="Unit-wise Revenue Share"
            subtitle={weekPeriod ? `P&L revenue contribution by unit - week to date (${weekPeriod.weekStart} - ${date})` : 'P&L revenue contribution by unit - week to date'}
          />
        </section>
      )}
    </div>
  );
}
