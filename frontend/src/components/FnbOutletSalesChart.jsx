import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fnbOutletSales } from './DashboardCharts';
import { moneyCompact } from '../lib/calculations';

const PALETTE = ['#08786c', '#6f3d74', '#9a5a00', '#0f9487', '#ba1a1a'];
const axisTick = { fontSize: 11, fill: '#7a8f97', fontFamily: 'inherit' };
const gridStroke = '#e8edf0';

function OutletTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const share = total ? (entry.value / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5 shadow-lg">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{entry.payload.name}</div>
      <div className="flex items-center gap-3 text-[12px]">
        <span className="size-2 rounded-sm" style={{ background: entry.payload.fill }} />
        <span className="num font-bold tabular-nums text-on-surface">{moneyCompact(entry.value)}</span>
        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
          {share.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function FnbOutletSalesChart({ data }) {
  const rows = fnbOutletSales(data ?? {})
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((entry, index) => ({ ...entry, fill: PALETTE[index % PALETTE.length] }));
  const total = rows.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
      <div className="flex items-start gap-3 border-b border-outline-variant/40 px-4 py-3.5">
        <span className="mt-0.5 min-h-8 w-[3px] shrink-0 self-stretch rounded-full bg-[#08786c]" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-on-surface">F&B Outlet Sales</h3>
          <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">
            Freakk - Pablo - Dali - Meeting Point - High Steaks - today
          </p>
        </div>
      </div>

      {rows.length ? (
        <div className="p-4 md:p-6">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={rows} margin={{ top: 28, right: 8, left: 4, bottom: 8 }} barCategoryGap="14%">
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} interval={0} tickLine={false} axisLine={{ stroke: gridStroke }} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={62} tickLine={false} axisLine={false} />
              <Tooltip content={<OutletTooltip total={total} />} cursor={{ fill: 'rgba(8,120,108,0.05)', rx: 4 }} />
              <Bar dataKey="value" name="Sales" radius={[6, 6, 0, 0]} maxBarSize={180}>
                {rows.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
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

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {rows.map((entry) => {
              const share = total ? ((entry.value / total) * 100).toFixed(0) : 0;
              return (
                <span
                  key={entry.name}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: `${entry.fill}18`,
                    color: entry.fill,
                    border: `1px solid ${entry.fill}30`
                  }}
                >
                  {entry.name}
                  <span className="opacity-70">{share}%</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid min-h-[260px] place-items-center p-6 text-center">
          <div>
            <div className="text-sm font-semibold text-on-surface">No outlet sales yet</div>
            <div className="mt-1 text-xs text-on-surface-variant">Outlet sales will appear once imported.</div>
          </div>
        </div>
      )}
    </section>
  );
}
