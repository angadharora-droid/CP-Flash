import React, { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
  Tooltip,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList
} from 'recharts';
import SectionCard from './SectionCard';
import { SECTION_ICONS } from './DashboardUi';
import { money, moneyCompact, numberValue, percent, pnlRows, UNITS } from '../lib/calculations';

// Theme-aligned categorical palette (M3 tokens from tailwind.config.js, plus two fillers).
const PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a', '#3f6fb5', '#b5447a'];
const REVENUE_COLOR = '#08786c';
const NET_COLOR = '#9a5a00';
const NEG_COLOR = '#ba1a1a';
const MARGIN_COLOR = '#6f3d74';
const axisTick = { fontSize: 11, fill: '#5b6b73' };
const gridStroke = '#e2e8ec';

// Outlet -> KPI lookup used for both today and weekly. `source` selects the data bucket.
const FNB_OUTLETS = [
  { name: 'Freakk', source: 'hotels', kpi: 'Freakk Revenue' },
  { name: 'Pablo', source: 'fnbPablo', kpi: 'Gross Sales' },
  { name: 'Dali', source: 'fnbDali', kpi: 'Gross Sales' },
  { name: 'Meeting Point', source: 'hotels', kpi: 'Meeting Point Revenue' },
  { name: 'High Steaks', source: 'hotels', kpi: 'High Steaks Revenue' }
];

function outletRows(data, source) {
  if (source === 'hotels') return data?.hotels ?? [];
  if (source === 'fnbPablo') return data?.fnb?.Pablo ?? [];
  if (source === 'fnbDali') return data?.fnb?.Dali ?? [];
  return [];
}

// Today's F&B outlet sales from the live KPI rows' `actual` values.
export function fnbOutletSales(data) {
  return FNB_OUTLETS.map((outlet) => ({
    name: outlet.name,
    value: outletRows(data, outlet.source)
      .filter((row) => row.name === outlet.kpi)
      .reduce((sum, row) => sum + numberValue(row.actual), 0)
  }));
}

// Weekly F&B outlet sales: sum each matching KPI row's weekly aggregate (keyed by row id).
export function fnbOutletSalesWeekly(data, period) {
  const weekKpis = period?.kpis?.week ?? {};
  return FNB_OUTLETS.map((outlet) => ({
    name: outlet.name,
    value: outletRows(data, outlet.source)
      .filter((row) => row.name === outlet.kpi)
      .reduce((sum, row) => sum + numberValue(weekKpis[row.id] ?? 0), 0)
  }));
}

const sumBy = (rows, key) => rows.reduce((total, row) => total + numberValue(row[key]), 0);

// Build a CSV string from a header row + matrix and trigger a client-side download.
function downloadCsv(filename, rows) {
  const escape = (cell) => {
    const text = String(cell ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ChartTooltip({ active, payload, label, total }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-3 py-2 shadow-card">
      {label != null && label !== '' ? (
        <div className="mb-1 text-[11px] font-bold text-on-surface">{label}</div>
      ) : null}
      {payload.map((entry) => {
        const value = numberValue(entry.value);
        const isPercent = /margin|%/i.test(entry.name);
        const share = !isPercent && total ? (value / total) * 100 : null;
        return (
          <div key={entry.name} className="flex items-center gap-2 text-[12px]">
            <span className="size-2.5 rounded-full" style={{ background: entry.color || entry.payload?.fill }} />
            <span className="text-on-surface-variant">{entry.name}</span>
            <span className={`num ml-auto pl-3 font-bold ${value < 0 ? 'text-error' : 'text-on-surface'}`}>
              {isPercent ? percent(value) : money(value)}
              {share != null ? <span className="ml-1.5 font-medium text-on-surface-variant">{share.toFixed(1)}%</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Expanded slice + connector callout shown for the hovered/active donut segment.
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent: pct } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={3}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={outerRadius + 9}
        outerRadius={outerRadius + 11}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.45}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" className="fill-on-surface" style={{ fontSize: 13, fontWeight: 700 }}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" className="fill-on-surface-variant" style={{ fontSize: 12, fontWeight: 600 }}>
        {moneyCompact(payload.value)} · {Math.round((pct ?? 0) * 100)}%
      </text>
    </g>
  );
}

// Interactive donut with a center total and an external value/percentage legend.
function DonutChart({ data, total }) {
  const [active, setActive] = useState(-1);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="relative">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={94}
              innerRadius={62}
              paddingAngle={2}
              cornerRadius={3}
              stroke="none"
              activeIndex={active >= 0 ? active : undefined}
              activeShape={ActiveSlice}
              onMouseEnter={(_, index) => setActive(index)}
              onMouseLeave={() => setActive(-1)}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.name}
                  fill={PALETTE[index % PALETTE.length]}
                  opacity={active === -1 || active === index ? 1 : 0.4}
                  style={{ transition: 'opacity 150ms ease' }}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        {active === -1 ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">Total</span>
            <span className="num text-base font-bold text-on-surface">{moneyCompact(total)}</span>
          </div>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5 sm:min-w-[150px]">
        {data.map((entry, index) => {
          const share = total ? (entry.value / total) * 100 : 0;
          return (
            <li
              key={entry.name}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(-1)}
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-[12px] transition-colors ${
                active === index ? 'bg-surface-container-high' : ''
              }`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
              <span className="min-w-0 flex-1 truncate font-medium text-on-surface-variant">{entry.name}</span>
              <span className="num font-bold text-on-surface">{moneyCompact(entry.value)}</span>
              <span className="num w-9 text-right text-[11px] font-medium text-on-surface-variant/80">{share.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatStrip({ items }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-on-surface-variant/70">{item.label}</div>
          <div className={`num mt-0.5 truncate text-[17px] font-bold ${item.tone ?? 'text-on-surface'}`}>{item.value}</div>
          {item.hint ? <div className="mt-0.5 truncate text-[11px] font-medium text-on-surface-variant">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function ChartBlock({ title, subtitle, className = '', children, empty, loading, emptyLabel = 'No data to chart yet.' }) {
  return (
    <div className={`rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11.5px] font-medium text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {loading ? (
        <div className="grid h-[260px] place-items-center">
          <div className="flex flex-col items-center gap-2 text-on-surface-variant/60">
            <span className="material-symbols-outlined animate-spin text-[26px]">progress_activity</span>
            <span className="text-xs font-semibold">Loading…</span>
          </div>
        </div>
      ) : empty ? (
        <div className="grid h-[260px] place-items-center">
          <div className="flex flex-col items-center gap-2 text-center text-on-surface-variant/55">
            <span className="material-symbols-outlined text-[30px]">bar_chart_4_bars</span>
            <span className="max-w-[220px] text-sm font-medium">{emptyLabel}</span>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function PeriodToggle({ value, onChange, weeklyReady }) {
  const options = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }];
  return (
    <div className="inline-flex gap-1 rounded-lg border border-outline-variant/70 bg-surface-container-low p-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          disabled={option.key === 'week' && !weeklyReady}
          onClick={() => onChange(option.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === option.key
              ? 'bg-primary text-on-primary shadow-primary'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardCharts({ data, period, weekControls = null, weekLoading = false, defaultMode = 'today' }) {
  const weeklyReady = !!period?.week || weekLoading || !!weekControls;
  const [mode, setMode] = useState(defaultMode);
  const isWeek = mode === 'week';
  const scopeLabel = isWeek ? 'this week' : 'today';
  const weekByUnit = period?.week ?? {};
  const loading = isWeek && weekLoading;

  const rows = pnlRows(data);

  const revenueShare = (isWeek
    ? UNITS.map((unit) => ({ name: unit, value: numberValue(weekByUnit[unit]?.revenue) }))
    : rows.map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
  )
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  const revenueVsNet = (isWeek
    ? UNITS.map((unit) => {
        const revenue = numberValue(weekByUnit[unit]?.revenue);
        const net = numberValue(weekByUnit[unit]?.netProfit);
        return { unit, Revenue: revenue, 'Est. Net Profit': net, Margin: revenue ? (net / revenue) * 100 : 0 };
      })
    : rows.map((row) => ({
        unit: row.unit,
        Revenue: numberValue(row.revenueToday),
        'Est. Net Profit': row.estNetProfit,
        Margin: numberValue(row.netMargin)
      }))
  )
    .filter((entry) => entry.Revenue || entry['Est. Net Profit'])
    .sort((a, b) => b.Revenue - a.Revenue);

  const outletSales = (isWeek ? fnbOutletSalesWeekly(data, period) : fnbOutletSales(data))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  const revenueShareTotal = revenueShare.reduce((total, entry) => total + entry.value, 0);
  const outletTotal = outletSales.reduce((total, entry) => total + entry.value, 0);

  // Headline figures for the summary strip.
  const totalRevenue = sumBy(revenueVsNet, 'Revenue');
  const totalNet = sumBy(revenueVsNet, 'Est. Net Profit');
  const margin = totalRevenue ? (totalNet / totalRevenue) * 100 : 0;
  const topUnit = revenueShare[0] ?? null;
  const hasData = revenueShare.length || revenueVsNet.length || outletSales.length;

  const statItems = [
    { label: 'Total Revenue', value: moneyCompact(totalRevenue), hint: `${revenueVsNet.length} units` },
    {
      label: 'Est. Net Profit',
      value: moneyCompact(totalNet),
      tone: totalNet < 0 ? 'text-error' : 'text-secondary',
      hint: 'after est. costs'
    },
    {
      label: 'Profit Margin',
      value: totalRevenue ? percent(margin) : '—',
      tone: margin < 0 ? 'text-error' : 'text-on-surface'
    },
    {
      label: 'Top Unit',
      value: topUnit ? topUnit.name : '—',
      hint: topUnit ? moneyCompact(topUnit.value) : null
    }
  ];

  const handleExport = () => {
    const rows = [
      ['Performance Charts', isWeek ? `Week ${period?.weekStart ?? ''} → ${period?.weekEnd ?? ''}` : 'Today'],
      [],
      ['Unit', 'Revenue', 'Est. Net Profit', 'Net Margin %'],
      ...revenueVsNet.map((entry) => [entry.unit, entry.Revenue, entry['Est. Net Profit'], entry.Margin.toFixed(1)]),
      ['Total', totalRevenue, totalNet, totalRevenue ? margin.toFixed(1) : '0'],
      [],
      ['F&B Outlet', 'Sales'],
      ...outletSales.map((entry) => [entry.name, entry.value])
    ];
    const stamp = isWeek ? `week-${period?.weekStart ?? 'current'}` : 'today';
    downloadCsv(`performance-${stamp}.csv`, rows);
  };

  const periodEmptyLabel = isWeek
    ? (weekLoading ? 'Loading week…' : 'No saved data for this week yet.')
    : 'No data to chart yet.';
  const weekRangeNote = isWeek && period?.weekStart && period?.weekEnd
    ? ` (${period.weekStart} → ${period.weekEnd})`
    : '';

  return (
    <SectionCard
      title="Performance Charts"
      subtitle={`Visual snapshot of ${scopeLabel}'s revenue, profitability, and outlet sales${weekRangeNote}`}
      icon={SECTION_ICONS.kpi}
      tone="indigo"
      defaultOpen
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {isWeek && weekControls ? weekControls : null}
          <PeriodToggle value={mode} onChange={setMode} weeklyReady={weeklyReady} />
          <button
            type="button"
            onClick={handleExport}
            disabled={!hasData || loading}
            title="Export current view to CSV"
            className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/70 bg-surface-container-low px-2.5 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      }
    >
      {hasData && !loading ? <StatStrip items={statItems} /> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartBlock
          title="Unit-wise Revenue Share"
          subtitle={`P&L revenue contribution by unit (${scopeLabel})`}
          empty={!revenueShare.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <DonutChart data={revenueShare} total={revenueShareTotal} />
        </ChartBlock>

        <ChartBlock
          title="Revenue vs Est. Net Profit"
          subtitle={`Bars in ₹, line shows net margin % (${scopeLabel})`}
          empty={!revenueVsNet.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={revenueVsNet} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="unit" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={56} tickLine={false} axisLine={{ stroke: gridStroke }} />
              <YAxis yAxisId="money" tick={axisTick} tickFormatter={moneyCompact} width={64} tickLine={false} axisLine={false} />
              <YAxis yAxisId="pct" orientation="right" tick={axisTick} tickFormatter={(v) => `${Math.round(v)}%`} width={42} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,120,108,0.06)' }} />
              <Bar yAxisId="money" dataKey="Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={38} />
              <Bar yAxisId="money" dataKey="Est. Net Profit" radius={[4, 4, 0, 0]} maxBarSize={38}>
                {revenueVsNet.map((entry) => (
                  <Cell key={entry.unit} fill={entry['Est. Net Profit'] < 0 ? NEG_COLOR : NET_COLOR} />
                ))}
              </Bar>
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Margin"
                name="Net Margin"
                stroke={MARGIN_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: MARGIN_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-medium text-on-surface-variant">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: REVENUE_COLOR }} />Revenue</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: NET_COLOR }} />Est. Net Profit</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: NEG_COLOR }} />Net Loss</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full" style={{ background: MARGIN_COLOR }} />Net Margin %</span>
          </div>
        </ChartBlock>

        <ChartBlock
          title="F&B Outlet Sales"
          subtitle={`Freakk, Pablo, Dali, Meeting Point, High Steaks (${scopeLabel})`}
          className="xl:col-span-2"
          empty={!outletSales.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={outletSales} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} interval={0} tickLine={false} axisLine={{ stroke: gridStroke }} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={64} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip total={outletTotal} />} cursor={{ fill: 'rgba(8,120,108,0.06)' }} />
              <Bar dataKey="value" name="Sales" radius={[4, 4, 0, 0]} maxBarSize={64}>
                {outletSales.map((entry, index) => (
                  <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                ))}
                <LabelList dataKey="value" position="top" formatter={moneyCompact} style={{ fontSize: 11, fontWeight: 700, fill: '#172026' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>
    </SectionCard>
  );
}
