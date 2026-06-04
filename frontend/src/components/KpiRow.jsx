import React from 'react';
import { calcFlag, formatIndianNumber, numberValue } from '../lib/calculations';
import FlagBadge from './FlagBadge';

function Cell({ value, highlight, forceNumber = false }) {
  const empty = value === '' || value == null;
  const display = empty ? '-' : formatIndianNumber(forceNumber ? numberValue(value) : value);
  const tone = empty
    ? 'text-on-surface-variant/35'
    : highlight ? 'text-primary font-semibold' : 'text-on-surface';
  return (
    <span className={`num block min-w-16 px-2 py-1.5 text-[16px] sm:min-w-20 sm:px-2.5 md:min-w-24 ${tone}`}>
      {display}
    </span>
  );
}

export default function KpiRow({ kpi }) {
  const flag = calcFlag(kpi.actual, kpi.target, kpi.direction);
  const forceNumber = /arrivals?|departures?/i.test(kpi.name ?? '');
  return (
    <tr className="group border-b border-outline-variant/50 last:border-0 transition-colors duration-100 odd:bg-surface-container-lowest even:bg-surface-container-low/45 hover:bg-primary/5">
      <td className="sticky left-0 z-[1] min-w-36 bg-inherit px-2.5 py-2.5 text-[16px] font-semibold text-on-surface shadow-[1px_0_0_0_rgba(202,211,218,0.9)] sm:min-w-48 sm:px-4 md:min-w-56">
        {kpi.name}
      </td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.target} forceNumber={forceNumber} /></td>
      <td className="bg-primary/5 px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.actual} highlight forceNumber={forceNumber} /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.mtd} forceNumber={forceNumber} /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><Cell value={kpi.ytd} forceNumber={forceNumber} /></td>
      <td className="px-1.5 py-2.5 sm:px-2 md:px-3"><FlagBadge label={flag.label} /></td>
    </tr>
  );
}
