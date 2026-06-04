import React, { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { moneyCompact, numberValue, pnlRows } from '../lib/calculations';

const PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a', '#3f6fb5', '#b5447a'];

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

export default function RevenueShareDonut({ data }) {
  const [active, setActive] = useState(-1);
  const rows = pnlRows(data ?? {});
  const revenueShare = rows
    .map((row) => ({ name: row.unit, value: numberValue(row.revenueToday) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = revenueShare.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
      <div className="flex items-start gap-3 border-b border-outline-variant/40 px-4 py-3.5">
        <span className="mt-0.5 min-h-8 w-[3px] shrink-0 self-stretch rounded-full bg-[#08786c]" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-on-surface">Unit-wise Revenue Share</h3>
          <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">
            P&L revenue contribution by unit - today
          </p>
        </div>
      </div>

      {revenueShare.length ? (
        <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(210px,0.65fr)] sm:items-center md:p-6">
          <div className="relative min-h-[280px]">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={revenueShare}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={118}
                  innerRadius={76}
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
              <span className="num mt-1 text-[22px] font-extrabold tabular-nums text-on-surface">{moneyCompact(total)}</span>
            </div>
          </div>

          <ul className="space-y-2.5">
            {revenueShare.map((entry, i) => {
              const share = total ? (entry.value / total) * 100 : 0;
              const color = PALETTE[i % PALETTE.length];
              return (
                <li
                  key={entry.name}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(-1)}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-surface-container/70"
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-on-surface-variant">{entry.name}</span>
                  <span className="num text-[13px] font-extrabold tabular-nums text-on-surface">{moneyCompact(entry.value)}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
                    style={{ background: `${color}18`, color }}
                  >
                    {share.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="grid min-h-[260px] place-items-center p-6 text-center">
          <div>
            <div className="text-sm font-semibold text-on-surface">No revenue data yet</div>
            <div className="mt-1 text-xs text-on-surface-variant">Revenue share will appear once P&L data is available.</div>
          </div>
        </div>
      )}
    </section>
  );
}
