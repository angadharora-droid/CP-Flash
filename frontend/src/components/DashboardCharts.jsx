import React, { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList
} from 'recharts';
import SectionCard from './SectionCard';
import { SECTION_ICONS } from './DashboardUi';
import { money, moneyCompact, numberValue, percent, pnlRows, UNITS } from '../lib/calculations';

// ─── Palette ────────────────────────────────────────────────────────────────
const PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a', '#3f6fb5', '#b5447a'];
const REVENUE_COLOR = '#08786c';
const NET_COLOR = '#9a5a00';
const NEG_COLOR = '#ba1a1a';
const axisTick = { fontSize: 11, fill: '#7a8f97', fontFamily: 'inherit' };
const gridStroke = '#e8edf0';

// Gradient IDs referenced by Bar fills
const GRAD_REVENUE = 'grad-revenue';
const GRAD_NET = 'grad-net';
const GRAD_LOSS = 'grad-loss';

// ─── Outlet config ───────────────────────────────────────────────────────────
const FNB_OUTLETS = [
  { name: 'Freakk',        source: 'hotels',   kpi: 'Freakk Revenue' },
  { name: 'Pablo',         source: 'fnbPablo', kpi: 'Gross Sales' },
  { name: 'Dali',          source: 'fnbDali',  kpi: 'Gross Sales' },
  { name: 'Meeting Point', source: 'hotels',   kpi: 'Meeting Point Revenue' },
  { name: 'High Steaks',   source: 'hotels',   kpi: 'High Steaks Revenue' }
];

function outletRows(data, source) {
  if (source === 'hotels')   return data?.hotels ?? [];
  if (source === 'fnbPablo') return data?.fnb?.Pablo ?? [];
  if (source === 'fnbDali')  return data?.fnb?.Dali ?? [];
  return [];
}

export function fnbOutletSales(data) {
  return FNB_OUTLETS.map((outlet) => ({
    name: outlet.name,
    value: outletRows(data, outlet.source)
      .filter((row) => row.name === outlet.kpi)
      .reduce((sum, row) => sum + numberValue(row.actual), 0)
  }));
}

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

// ─── Gradient defs injected once into every BarChart ────────────────────────
function BarGradients() {
  return (
    <defs>
      <linearGradient id={GRAD_REVENUE} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#0f9487" stopOpacity={1} />
        <stop offset="100%" stopColor="#08786c" stopOpacity={0.82} />
      </linearGradient>
      <linearGradient id={GRAD_NET} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#c97d00" stopOpacity={1} />
        <stop offset="100%" stopColor="#9a5a00" stopOpacity={0.82} />
      </linearGradient>
      <linearGradient id={GRAD_LOSS} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#e53935" stopOpacity={1} />
        <stop offset="100%" stopColor="#ba1a1a" stopOpacity={0.82} />
      </linearGradient>
    </defs>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
export function ChartTooltip({ active, payload, label, total }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5 shadow-lg"
      style={{ backdropFilter: 'blur(8px)', minWidth: 160 }}
    >
      {label != null && label !== '' && (
        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{label}</div>
      )}
      {payload.map((entry) => {
        const value    = numberValue(entry.value);
        const isPercent = /margin|%/i.test(entry.name);
        const share    = !isPercent && total ? (value / total) * 100 : null;
        return (
          <div key={entry.name} className="flex items-center gap-2 py-0.5 text-[12px]">
            <span className="size-2 rounded-sm" style={{ background: entry.color || entry.payload?.fill }} />
            <span className="flex-1 text-on-surface-variant">{entry.name}</span>
            <span className={`num ml-3 font-bold tabular-nums ${value < 0 ? 'text-error' : 'text-on-surface'}`}>
              {isPercent ? percent(value) : money(value)}
              {share != null && (
                <span className="ml-1.5 text-[10px] font-semibold text-on-surface-variant/70">
                  ({share.toFixed(1)}%)
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Active donut slice ───────────────────────────────────────────────────────
function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent: pct } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 7}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={4} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.35} />
      <text x={cx} y={cy - 9} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--color-on-surface)' }}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--color-on-surface-variant)' }}>
        {moneyCompact(payload.value)} · {Math.round((pct ?? 0) * 100)}%
      </text>
    </g>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────────
export function DonutChart({ data, total }) {
  const [active, setActive] = useState(-1);

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
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
              innerRadius={60}
              paddingAngle={2.5}
              cornerRadius={4}
              stroke="none"
              activeIndex={active >= 0 ? active : undefined}
              activeShape={ActiveSlice}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              animationBegin={80}
              animationDuration={1200}
              animationEasing="ease-out"
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={PALETTE[i % PALETTE.length]}
                  opacity={active === -1 || active === i ? 1 : 0.3}
                  style={{ transition: 'opacity 180ms ease, filter 180ms ease',
                           filter: active === i ? 'drop-shadow(0 2px 6px rgba(0,0,0,.18))' : 'none' }}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre total — hidden while a slice is active */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ opacity: active === -1 ? 1 : 0, transition: 'opacity 160ms ease' }}
        >
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/55">Total</span>
          <span className="num mt-0.5 text-[18px] font-bold tabular-nums text-on-surface">{moneyCompact(total)}</span>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex flex-col gap-1 sm:min-w-[164px]">
        {data.map((entry, i) => {
          const share = total ? (entry.value / total) * 100 : 0;
          return (
            <li
              key={entry.name}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              className={`group flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all duration-150 ${
                active === i
                  ? 'bg-surface-container-high shadow-sm'
                  : 'hover:bg-surface-container/60'
              }`}
            >
              <span
                className="size-2.5 shrink-0 rounded-full transition-transform duration-150"
                style={{
                  background: PALETTE[i % PALETTE.length],
                  transform: active === i ? 'scale(1.25)' : 'scale(1)'
                }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-on-surface-variant">{entry.name}</span>
              <span className="num font-bold tabular-nums text-on-surface">{moneyCompact(entry.value)}</span>
              {/* Inline share pill */}
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={{
                  background: `${PALETTE[i % PALETTE.length]}22`,
                  color: PALETTE[i % PALETTE.length]
                }}
              >
                {share.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Stat strip ──────────────────────────────────────────────────────────────
// tone → { bg, border, label, value, icon }
const STAT_TONES = {
  neutral:  { bg: 'bg-surface-container-lowest', border: 'border-outline-variant/50', accent: '#5b6b73' },
  positive: { bg: 'bg-[#08786c]/5',              border: 'border-[#08786c]/20',       accent: '#08786c' },
  negative: { bg: 'bg-error/5',                  border: 'border-error/20',            accent: '#ba1a1a' },
  highlight:{ bg: 'bg-primary/5',                border: 'border-primary/20',          accent: 'var(--color-primary)' }
};

function StatCard({ label, value, hint, tone = 'neutral', icon, delta }) {
  const t = STAT_TONES[tone] ?? STAT_TONES.neutral;
  return (
    <div className={`relative overflow-hidden rounded-xl border px-4 py-3 ${t.bg} ${t.border}`}>
      {/* Decorative corner arc */}
      <svg
        className="pointer-events-none absolute -right-4 -top-4 opacity-[0.07]"
        width="72" height="72" viewBox="0 0 72 72"
      >
        <circle cx="72" cy="0" r="52" fill={t.accent} />
      </svg>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-on-surface-variant/60">{label}</p>
          <p className={`num mt-1 truncate text-[18px] font-bold tabular-nums leading-none ${
            tone === 'negative' ? 'text-error' : tone === 'positive' ? 'text-[#08786c]' : 'text-on-surface'
          }`}>
            {value}
          </p>
          {hint && <p className="mt-1 truncate text-[11px] text-on-surface-variant/70">{hint}</p>}
        </div>
        {icon && (
          <span
            className="material-symbols-outlined shrink-0 rounded-lg p-1.5 text-[18px]"
            style={{ background: `${t.accent}18`, color: t.accent }}
          >
            {icon}
          </span>
        )}
      </div>

      {delta != null && (
        <div className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${delta >= 0 ? 'text-[#08786c]' : 'text-error'}`}>
          <span className="material-symbols-outlined text-[13px]">{delta >= 0 ? 'trending_up' : 'trending_down'}</span>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs target
        </div>
      )}
    </div>
  );
}

function StatStrip({ items }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => <StatCard key={item.label} {...item} />)}
    </div>
  );
}

// ─── Chart block wrapper ──────────────────────────────────────────────────────
function ChartBlock({ title, subtitle, accentColor, className = '', children, empty, loading, emptyLabel = 'No data to chart yet.' }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest ${className}`}>
      {/* Title row with left accent bar */}
      <div className="flex items-start gap-3 border-b border-outline-variant/40 px-4 py-3.5">
        {accentColor && (
          <span className="mt-0.5 h-full w-[3px] shrink-0 self-stretch rounded-full" style={{ background: accentColor, minHeight: 32 }} />
        )}
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-on-surface">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">{subtitle}</p>}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="grid h-[260px] place-items-center">
            <div className="flex flex-col items-center gap-3 text-on-surface-variant/50">
              <div className="relative size-8">
                <span className="material-symbols-outlined absolute inset-0 animate-spin text-[32px]">progress_activity</span>
              </div>
              <span className="text-xs font-semibold tracking-wide">Loading data…</span>
            </div>
          </div>
        ) : empty ? (
          <div className="grid h-[260px] place-items-center">
            <div className="flex flex-col items-center gap-3 text-center text-on-surface-variant/40">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <rect x="6"  y="28" width="8"  height="14" rx="2" fill="currentColor" opacity=".3"/>
                <rect x="20" y="18" width="8"  height="24" rx="2" fill="currentColor" opacity=".2"/>
                <rect x="34" y="10" width="8"  height="32" rx="2" fill="currentColor" opacity=".15"/>
                <path d="M6 26 L16 16 L26 22 L42 8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" strokeLinecap="round" opacity=".4"/>
              </svg>
              <span className="max-w-[200px] text-[12.5px] font-medium leading-relaxed">{emptyLabel}</span>
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ─── Legend chip ─────────────────────────────────────────────────────────────
function LegendChip({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

// ─── Period toggle ────────────────────────────────────────────────────────────
function PeriodToggle({ value, onChange, weeklyReady }) {
  const options = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }];
  return (
    <div className="inline-flex gap-0.5 rounded-xl border border-outline-variant/60 bg-surface-container p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          disabled={opt.key === 'week' && !weeklyReady}
          onClick={() => onChange(opt.key)}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
            value === opt.key
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function DashboardCharts({ data, period, weekControls = null, weekLoading = false, defaultMode = 'today' }) {
  const weeklyReady = !!period?.week || weekLoading || !!weekControls;
  const [mode, setMode]           = useState(defaultMode);
  const isWeek    = mode === 'week';
  const scopeLabel = isWeek ? 'this week' : 'today';
  const weekByUnit = period?.week ?? {};
  const loading    = isWeek && weekLoading;

  const rows = pnlRows(data);

  const revenueShare = (isWeek
    ? UNITS.map((unit) => ({ name: unit, value: numberValue(weekByUnit[unit]?.revenue) }))
    : rows.map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
  ).filter((e) => e.value > 0).sort((a, b) => b.value - a.value);

  const revenueVsNet = (isWeek
    ? UNITS.map((unit) => {
        const revenue = numberValue(weekByUnit[unit]?.revenue);
        const net     = numberValue(weekByUnit[unit]?.netProfit);
        return { unit, Revenue: revenue, 'Est. Net Profit': net, Margin: revenue ? (net / revenue) * 100 : 0 };
      })
    : rows.map((row) => ({
        unit:             row.unit,
        Revenue:          numberValue(row.revenueToday),
        'Est. Net Profit': row.estNetProfit,
        Margin:           numberValue(row.netMargin)
      }))
  ).filter((e) => e.Revenue || e['Est. Net Profit']).sort((a, b) => b.Revenue - a.Revenue);

  const outletSales = (isWeek ? fnbOutletSalesWeekly(data, period) : fnbOutletSales(data))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);

  const revenueShareTotal = revenueShare.reduce((t, e) => t + e.value, 0);
  const outletTotal       = outletSales.reduce((t, e) => t + e.value, 0);

  const totalRevenue = sumBy(revenueVsNet, 'Revenue');
  const totalNet     = sumBy(revenueVsNet, 'Est. Net Profit');
  const margin       = totalRevenue ? (totalNet / totalRevenue) * 100 : 0;
  const topUnit      = revenueShare[0] ?? null;
  const hasData      = revenueShare.length || revenueVsNet.length || outletSales.length;

  const statItems = [
    {
      label: 'Total Revenue',
      value: moneyCompact(totalRevenue),
      hint: `${revenueVsNet.length} active units`,
      tone: 'neutral',
      icon: 'payments'
    },
    {
      label: 'Est. Net Profit',
      value: moneyCompact(totalNet),
      tone: totalNet < 0 ? 'negative' : 'positive',
      hint: 'after est. costs',
      icon: totalNet < 0 ? 'trending_down' : 'trending_up'
    },
    {
      label: 'Profit Margin',
      value: totalRevenue ? percent(margin) : '—',
      tone: margin < 0 ? 'negative' : margin > 15 ? 'positive' : 'neutral',
      hint: margin >= 0 ? 'of total revenue' : 'below breakeven',
      icon: 'donut_small'
    },
    {
      label: 'Top Unit',
      value: topUnit ? topUnit.name : '—',
      hint: topUnit ? `${moneyCompact(topUnit.value)} revenue` : null,
      tone: 'highlight',
      icon: 'emoji_events'
    }
  ];

  const periodEmptyLabel = isWeek
    ? (weekLoading ? 'Loading week data…' : 'No saved data for this week yet.')
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
        </div>
      }
    >
      {hasData && !loading && <StatStrip items={statItems} />}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── Revenue Share Donut ── */}
        <ChartBlock
          title="Unit-wise Revenue Share"
          subtitle={`P&L revenue contribution by unit · ${scopeLabel}`}
          accentColor={PALETTE[0]}
          empty={!revenueShare.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <DonutChart data={revenueShare} total={revenueShareTotal} />
        </ChartBlock>

        {/* ── Revenue vs Net Profit ── */}
        <ChartBlock
          title="Revenue vs Est. Net Profit"
          subtitle={`Per unit · ${scopeLabel}`}
          accentColor={NET_COLOR}
          empty={!revenueVsNet.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenueVsNet} margin={{ top: 8, right: 4, left: 4, bottom: 8 }} barGap={3}>
              <BarGradients />
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="unit"
                tick={axisTick}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={52}
                tickLine={false}
                axisLine={{ stroke: gridStroke }}
              />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={62} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,120,108,0.05)', rx: 4 }} />
              <Bar
                dataKey="Revenue"
                fill={`url(#${GRAD_REVENUE})`}
                radius={[5, 5, 0, 0]}
                maxBarSize={36}
                animationBegin={0}
                animationDuration={1200}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="Est. Net Profit"
                radius={[5, 5, 0, 0]}
                maxBarSize={36}
                animationBegin={200}
                animationDuration={1200}
                animationEasing="ease-out"
              >
                {revenueVsNet.map((entry) => (
                  <Cell
                    key={entry.unit}
                    fill={`url(#${entry['Est. Net Profit'] < 0 ? GRAD_LOSS : GRAD_NET})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <LegendChip color={REVENUE_COLOR} label="Revenue" />
            <LegendChip color={NET_COLOR}     label="Est. Net Profit" />
            <LegendChip color={NEG_COLOR}     label="Net Loss" />
          </div>
        </ChartBlock>

        {/* ── F&B Outlet Sales ── */}
        <ChartBlock
          title="F&B Outlet Sales"
          subtitle={`Freakk · Pablo · Dali · Meeting Point · High Steaks · ${scopeLabel}`}
          accentColor={PALETTE[3]}
          className="xl:col-span-2"
          empty={!outletSales.length}
          loading={loading}
          emptyLabel={periodEmptyLabel}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={outletSales} margin={{ top: 28, right: 8, left: 4, bottom: 8 }} barCategoryGap="8%">
              <BarGradients />
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} interval={0} tickLine={false} axisLine={{ stroke: gridStroke }} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={62} tickLine={false} axisLine={false} />
              <Tooltip
                content={<ChartTooltip total={outletTotal} />}
                cursor={{ fill: 'rgba(8,120,108,0.05)', rx: 4 }}
              />
              <Bar
                dataKey="value"
                name="Sales"
                radius={[6, 6, 0, 0]}
                maxBarSize={180}
                animationBegin={120}
                animationDuration={1400}
                animationEasing="ease-out"
              >
                {outletSales.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={PALETTE[i % PALETTE.length]}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={moneyCompact}
                  style={{ fontSize: 11, fontWeight: 700, fill: 'var(--color-on-surface)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Outlet share mini-pills below the chart */}
          {outletSales.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {outletSales.map((entry, i) => {
                const share = outletTotal ? ((entry.value / outletTotal) * 100).toFixed(0) : 0;
                return (
                  <span
                    key={entry.name}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: `${PALETTE[i % PALETTE.length]}18`,
                      color: PALETTE[i % PALETTE.length],
                      border: `1px solid ${PALETTE[i % PALETTE.length]}30`
                    }}
                  >
                    {entry.name}
                    <span className="opacity-70">{share}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </ChartBlock>
      </div>
    </SectionCard>
  );
}
