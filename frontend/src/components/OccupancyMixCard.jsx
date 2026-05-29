import React, { useState } from 'react';
import SectionCard from './SectionCard';
import { SECTION_ICONS } from './DashboardUi';
import { DonutChart } from './DashboardCharts';
import { money, moneyCompact } from '../lib/calculations';

// ─── View toggle (SBO ⇄ Market Segment) ──────────────────────────────────────
function ViewToggle({ value, onChange }) {
  const options = [
    { key: 'sbo', label: 'Source of Business' },
    { key: 'segment', label: 'Market Segment' }
  ];
  return (
    <div className="inline-flex gap-0.5 rounded-xl border border-outline-variant/60 bg-surface-container p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
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

// ─── Compact stat tile ────────────────────────────────────────────────────────
function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-on-surface-variant/60">{label}</p>
      <p className="num mt-1 truncate text-[18px] font-bold tabular-nums leading-none text-on-surface">{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] text-on-surface-variant/70">{hint}</p>}
    </div>
  );
}

export default function OccupancyMixCard({ data }) {
  const [view, setView] = useState('sbo');
  const mix = data?.occupancyMix;

  const entries = (view === 'sbo' ? mix?.sbo : mix?.segment) ?? [];
  const hasData = entries.length > 0;

  const totalRooms = mix?.totalRooms ?? 0;
  const totalPax = mix?.totalPax ?? 0;
  const totalRevenue = mix?.totalRevenue ?? 0;
  const donutData = entries.map((e) => ({ name: e.name, value: e.revenue }));
  const top = entries[0] ?? null;
  const dimLabel = view === 'sbo' ? 'source' : 'segment';

  return (
    <SectionCard
      title="CP Nagpur: In-House Occupancy Mix"
      subtitle="Where occupied rooms & room revenue come from (Present Occupancy)"
      icon={SECTION_ICONS.hotel}
      tone="amber"
      actions={hasData ? <ViewToggle value={view} onChange={setView} /> : null}
    >
      {!hasData ? (
        <div className="grid place-items-center py-10 text-center text-on-surface-variant/50">
          <span className="material-symbols-outlined mb-2 text-[32px]">donut_small</span>
          <p className="max-w-[260px] text-[12.5px] font-medium leading-relaxed">
            No occupancy mix imported for this date yet (HCP_OCC report).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Rooms Occupied" value={totalRooms} hint={`${totalPax} pax`} />
            <StatTile label="Room Revenue" value={money(totalRevenue)} />
            <StatTile
              label={view === 'sbo' ? 'Top Channel' : 'Top Segment'}
              value={top ? top.name : '—'}
              hint={top ? `${top.rooms} rooms · ${moneyCompact(top.revenue)}` : null}
            />
            <StatTile
              label={`${dimLabel === 'source' ? 'Channels' : 'Segments'}`}
              value={entries.length}
              hint="distinct"
            />
          </div>

          <DonutChart data={donutData} total={totalRevenue} />
        </>
      )}
    </SectionCard>
  );
}
