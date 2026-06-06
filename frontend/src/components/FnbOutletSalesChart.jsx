import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fnbOutletSales, fnbOutletSalesWeekly } from './DashboardCharts';
import { moneyCompact } from '../lib/calculations';

const PALETTE = ['#A3006A', '#6f3d74', '#9a5a00', '#C2007F', '#ba1a1a'];
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

export default function FnbOutletSalesChart({ data, period = null, mode = 'today' }) {
  const [activeChip, setActiveChip] = useState(null);
  const isWeek = mode === 'week';
  const allRows = (isWeek ? fnbOutletSalesWeekly(data ?? {}, period) : fnbOutletSales(data ?? {}))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((entry, index) => ({ ...entry, fill: PALETTE[index % PALETTE.length] }));
  const rows = activeChip ? allRows.filter((r) => r.name === activeChip) : allRows;
  const total = allRows.reduce((sum, entry) => sum + entry.value, 0);
  const displayTotal = rows.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest">
      <div className="flex items-start gap-3 border-b border-outline-variant/40 px-4 py-3.5">
        <span className="mt-0.5 min-h-8 w-[3px] shrink-0 self-stretch rounded-full bg-primary" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-on-surface">F&amp;B Outlet Sales</h3>
          <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">
            Freakk · Pablo · Dali · Meeting Point · High Steaks · {isWeek ? 'week to date' : 'today'}
          </p>
        </div>
      </div>

      {allRows.length ? (
        <div className="p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveChip(null)}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                activeChip === null
                  ? 'border-primary/50 bg-primary/8 text-primary'
                  : 'border-outline-variant/50 bg-surface-container text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
              }`}
            >
              All
            </button>
            {allRows.map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => setActiveChip(activeChip === entry.name ? null : entry.name)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all active:scale-95 ${
                  activeChip === entry.name
                    ? 'border-primary/50 bg-primary/8 text-primary'
                    : 'border-outline-variant/50 bg-surface-container text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows} margin={{ top: 28, right: 8, left: 4, bottom: 8 }} barCategoryGap="14%">
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={axisTick} interval={0} tickLine={false} axisLine={{ stroke: gridStroke }} />
              <YAxis tick={axisTick} tickFormatter={moneyCompact} width={62} tickLine={false} axisLine={false} />
              <Tooltip content={<OutletTooltip total={displayTotal} />} cursor={{ fill: 'rgba(163,0,106,0.05)', rx: 4 }} />
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
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/30" aria-hidden>bar_chart</span>
          <div className="text-[14px] font-semibold text-on-surface-variant">No outlet sales yet</div>
          <div className="mt-1 max-w-[240px] text-[12px] text-on-surface-variant/70">Outlet sales will appear once the report is imported.</div>
        </div>
      )}
    </section>
  );
}
