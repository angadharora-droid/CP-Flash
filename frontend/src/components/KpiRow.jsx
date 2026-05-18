import React from 'react';
import { calcFlag } from '../lib/calculations';
import FlagBadge from './FlagBadge';

function Cell({ value, highlight }) {
  const empty = value === '' || value == null;
  if (highlight) {
    return (
      <span className={`num block min-w-24 rounded-lg px-2.5 py-1.5 text-sm font-semibold ring-1 transition-colors ${empty ? 'bg-slate-50/60 text-slate-300 ring-slate-100' : 'bg-app-accentTint text-app-accentDark ring-teal-100'}`}>
        {empty ? '—' : value}
      </span>
    );
  }
  return (
    <span className={`num block min-w-24 rounded-lg px-2.5 py-1.5 text-sm ${empty ? 'text-slate-300' : 'bg-app-panel/80 text-app-text'}`}>
      {empty ? '—' : value}
    </span>
  );
}

export default function KpiRow({ kpi }) {
  const flag = calcFlag(kpi.actual, kpi.target, kpi.direction);
  return (
    <tr className="group border-b border-app-divider/60 last:border-0 transition-colors duration-100 odd:bg-white even:bg-app-panel/40 hover:bg-app-accentTint/50">
      <td className="sticky left-0 z-[1] min-w-56 bg-inherit px-4 py-2.5 text-sm font-semibold text-app-text shadow-[1px_0_0_0_rgba(230,235,243,1)]">
        {kpi.name}
      </td>
      <td className="px-3 py-2.5"><Cell value={kpi.target} /></td>
      <td className="bg-app-accentTint/30 px-3 py-2.5"><Cell value={kpi.actual} highlight /></td>
      <td className="px-3 py-2.5"><Cell value={kpi.mtd} /></td>
      <td className="px-3 py-2.5"><Cell value={kpi.ytd} /></td>
      <td className="px-3 py-2.5"><FlagBadge label={flag.label} /></td>
    </tr>
  );
}
