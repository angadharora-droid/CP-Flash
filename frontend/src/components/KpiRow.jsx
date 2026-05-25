import React from 'react';
import { calcFlag } from '../lib/calculations';
import FlagBadge from './FlagBadge';

function Cell({ value, highlight }) {
  const empty = value === '' || value == null;
  if (highlight) {
    return (
      <span className={`num block min-w-16 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors sm:min-w-20 sm:px-2.5 md:min-w-24 ${empty ? 'bg-surface-container-low/40 text-on-surface-variant/35' : 'bg-primary/10 text-primary ring-1 ring-primary/15'}`}>
        {empty ? '—' : value}
      </span>
    );
  }
  return (
    <span className={`num block min-w-16 rounded-md px-2 py-1.5 text-sm sm:min-w-20 sm:px-2.5 md:min-w-24 ${empty ? 'text-on-surface-variant/35' : 'bg-surface-container-low text-on-surface ring-1 ring-outline-variant/35'}`}>
      {empty ? '—' : value}
    </span>
  );
}

export default function KpiRow({ kpi }) {
  const flag = calcFlag(kpi.actual, kpi.target, kpi.direction);
  return (
    <tr className="group border-b border-outline-variant/50 last:border-0 transition-colors duration-100 odd:bg-surface-container-lowest even:bg-surface-container-low/45 hover:bg-primary/5">
      <td className="sticky left-0 z-[1] min-w-36 bg-inherit px-2.5 py-2.5 text-sm font-semibold text-on-surface shadow-[1px_0_0_0_rgba(202,211,218,0.9)] sm:min-w-48 sm:px-4 md:min-w-56">
        {kpi.name}
      </td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.target} /></td>
      <td className="bg-primary/5 px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.actual} highlight /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.mtd} /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.ytd} /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><FlagBadge label={flag.label} /></td>
    </tr>
  );
}
