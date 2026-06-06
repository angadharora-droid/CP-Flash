import React, { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { moneyCompact, numberValue, pnlRows } from '../lib/calculations';

const PALETTE = ['#A3006A', '#6f3d74', '#9a5a00', '#C2007F', '#ba1a1a', '#3f6fb5', '#b5447a'];

function ActiveSlice(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent: pct } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={5}
      />
      <text x={cx} y={cy - 9} textAnchor="middle" className="fill-on-surface text-[13px] font-bold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-on-surface-variant text-[12px] font-semibold">
        {moneyCompact(payload.value)} - {Math.round((pct ?? 0) * 100)}%
      </text>
    </g>
  );
}

function RevenueTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const value = numberValue(entry.value);
  const share = total ? (value / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5 shadow-lg">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{entry.name}</div>
      <div className="flex items-center gap-3 text-[12px]">
        <span className="size-2 rounded-sm" style={{ background: entry.color }} />
        <span className="num font-bold tabular-nums text-on-surface">{moneyCompact(value)}</span>
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
          {share.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function RevenueShareDonut({
  data,
  title = 'Unit-wise Revenue Share',
  subtitle = 'P&L revenue contribution by unit - today'
}) {
  const [active, setActive] = useState(-1);
  const rows = pnlRows(data ?? {});
  const revenueShare = rows
    .map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = revenueShare.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest">
      <div className="flex items-start gap-3 border-b border-outline-variant/40 px-4 py-3.5">
        <span className="mt-0.5 min-h-8 w-[3px] shrink-0 self-stretch rounded-full bg-primary" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-on-surface">{title}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">{subtitle}</p>
        </div>
      </div>

      {revenueShare.length ? (
        <div className="p-5">
          <div className="relative mx-auto max-w-[280px]">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={revenueShare}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={70}
                  paddingAngle={2.5}
                  cornerRadius={5}
                  stroke="none"
                  activeIndex={active >= 0 ? active : undefined}
                  activeShape={ActiveSlice}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(-1)}
                  animationBegin={80}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {revenueShare.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={PALETTE[i % PALETTE.length]}
                      opacity={active === -1 || active === i ? 1 : 0.32}
                    />
                  ))}
                </Pie>
                <Tooltip content={<RevenueTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
              style={{ opacity: active === -1 ? 1 : 0, transition: 'opacity 160ms ease' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/55">Total</span>
              <span className="num mt-1 text-[20px] font-semibold tabular-nums text-on-surface">{moneyCompact(total)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {revenueShare.map((entry, i) => {
              const share = total ? (entry.value / total) * 100 : 0;
              const color = PALETTE[i % PALETTE.length];
              return (
                <div
                  key={entry.name}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(-1)}
                  className="flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-container/70"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-on-surface-variant">{entry.name}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{share.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/30" aria-hidden>donut_large</span>
          <div className="text-[14px] font-semibold text-on-surface-variant">No revenue data yet</div>
          <div className="mt-1 max-w-[240px] text-[12px] text-on-surface-variant/70">Revenue share will appear once P&L data is available.</div>
        </div>
      )}
    </section>
  );
}
