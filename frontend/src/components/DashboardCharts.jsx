import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import SectionCard from './SectionCard';
import { SECTION_ICONS } from './DashboardUi';
import { money, moneyCompact, numberValue, pnlRows } from '../lib/calculations';

// Theme-aligned categorical palette (M3 tokens from tailwind.config.js, plus two fillers).
const PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a', '#3f6fb5', '#b5447a'];
const REVENUE_COLOR = '#08786c';
const NET_COLOR = '#9a5a00';
const axisTick = { fontSize: 11, fill: '#5b6b73' };
const gridStroke = '#e2e8ec';

// F&B outlet sales pulled from the hotel KPI rows (Freakk / Meeting Point / High Steaks)
// and the standalone F&B tabs (Pablo / Dali "Gross Sales").
export function fnbOutletSales(data) {
  const hotels = data?.hotels ?? [];
  const sumHotelKpi = (kpiName) =>
    hotels.filter((row) => row.name === kpiName).reduce((sum, row) => sum + numberValue(row.actual), 0);
  const fnbGross = (tab) =>
    numberValue((data?.fnb?.[tab] ?? []).find((row) => row.name === 'Gross Sales')?.actual);
  return [
    { name: 'Freakk', value: sumHotelKpi('Freakk Revenue') },
    { name: 'Pablo', value: fnbGross('Pablo') },
    { name: 'Dali', value: fnbGross('Dali') },
    { name: 'Meeting Point', value: sumHotelKpi('Meeting Point Revenue') },
    { name: 'High Steaks', value: sumHotelKpi('High Steaks Revenue') }
  ];
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-3 py-2 shadow-card">
      {label != null && label !== '' ? (
        <div className="mb-1 text-[11px] font-bold text-on-surface">{label}</div>
      ) : null}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-[12px]">
          <span className="size-2.5 rounded-full" style={{ background: entry.color || entry.payload?.fill }} />
          <span className="text-on-surface-variant">{entry.name}</span>
          <span className="num ml-auto pl-3 font-bold text-on-surface">{money(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartBlock({ title, subtitle, className = '', children, empty }) {
  return (
    <div className={`rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11.5px] font-medium text-on-surface-variant">{subtitle}</p> : null}
      </div>
      {empty ? (
        <div className="grid h-[260px] place-items-center text-sm font-medium text-on-surface-variant/60">
          No data to chart yet.
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function DashboardCharts({ data }) {
  const rows = pnlRows(data);

  const outletSales = fnbOutletSales(data).filter((entry) => entry.value > 0);

  const revenueShare = rows
    .map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
    .filter((entry) => entry.value > 0);

  const revenueVsNet = rows
    .map((row) => ({
      unit: row.unit,
      Revenue: numberValue(row.revenueToday),
      'Est. Net Profit': row.estNetProfit
    }))
    .filter((entry) => entry.Revenue || entry['Est. Net Profit']);

  return (
    <SectionCard
      title="Performance Charts"
      subtitle="Visual snapshot of today's revenue, profitability, and outlet sales"
      icon={SECTION_ICONS.kpi}
      tone="indigo"
      defaultOpen
    >
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartBlock
          title="Unit-wise Revenue Share"
          subtitle="P&L revenue contribution by unit (today)"
          empty={!revenueShare.length}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={revenueShare}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={48}
                paddingAngle={2}
                label={({ percent }) => (percent >= 0.04 ? `${Math.round(percent * 100)}%` : '')}
                labelLine={false}
              >
                {revenueShare.map((entry, index) => (
                  <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBlock>

        <ChartBlock
          title="Revenue vs Est. Net Profit"
          subtitle="Per unit (today)"
          empty={!revenueVsNet.length}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueVsNet} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="unit" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={64} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,120,108,0.06)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Est. Net Profit" fill={NET_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>

        <ChartBlock
          title="F&B Outlet Sales"
          subtitle="Freakk, Pablo, Dali, Meeting Point, High Steaks (today)"
          className="xl:col-span-2"
          empty={!outletSales.length}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={outletSales} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} interval={0} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={64} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,120,108,0.06)' }} />
              <Bar dataKey="value" name="Sales" radius={[4, 4, 0, 0]}>
                {outletSales.map((entry, index) => (
                  <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>
    </SectionCard>
  );
}
