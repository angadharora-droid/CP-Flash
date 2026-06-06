import React from 'react';
import { aopTargetValue, calcFlag, formatIndianNumber, numberValue } from '../lib/calculations';
import FlagBadge from './FlagBadge';

const FLAG_STYLE = {
  'ON TRACK': { strip: 'bg-emerald-500', actual: 'text-emerald-700' },
  'ACTION':   { strip: 'bg-rose-500',    actual: 'text-rose-700'    },
};
const DEFAULT_STYLE = { strip: 'bg-outline-variant/40', actual: 'text-on-surface' };

function NumCell({ value, forceNumber = false, className = '' }) {
  const empty = value === '' || value == null;
  const display = empty ? '—' : formatIndianNumber(forceNumber ? numberValue(value) : value);
  return (
    <span className={`num tabular-nums ${empty ? 'text-on-surface-variant/30' : ''} ${className}`}>
      {display}
    </span>
  );
}

export default function KpiRow({ kpi }) {
  const target = aopTargetValue(kpi);
  const { label: flagLabel } = calcFlag(kpi.actual, target, kpi.direction);
  const forceNumber = /arrivals?|departures?/i.test(kpi.name ?? '');
  const style = FLAG_STYLE[flagLabel] ?? DEFAULT_STYLE;

  return (
    <tr className="group border-b border-outline-variant/25 last:border-0 transition-colors hover:bg-surface-container-low/60 odd:bg-surface-container-lowest even:bg-surface-container/30">

      {/* KPI name — sticky with left accent strip */}
      <td className="sticky left-0 z-[1] min-w-36 bg-inherit p-0 shadow-[1px_0_0_0_rgba(202,211,218,0.7)] sm:min-w-48 md:min-w-56">
        <div className="flex h-full items-stretch">
          <span className={`w-[3px] shrink-0 self-stretch ${style.strip}`} aria-hidden />
          <span className="px-3 py-3 text-[13px] font-semibold text-on-surface sm:px-4">{kpi.name}</span>
        </div>
      </td>

      <td className="px-3 py-3 text-right align-middle sm:px-4">
        <NumCell value={target} forceNumber={forceNumber} className="text-[13px] text-on-surface-variant/70" />
      </td>

      <td className="px-3 py-3 text-right align-middle sm:px-4">
        <NumCell value={kpi.actual} forceNumber={forceNumber} className={`text-[13px] font-bold ${style.actual}`} />
      </td>

      <td className="px-3 py-3 text-right align-middle sm:px-4">
        <NumCell value={kpi.mtd} forceNumber={forceNumber} className="text-[13px] text-on-surface-variant/80" />
      </td>

      <td className="px-3 py-3 align-middle sm:px-4">
        <FlagBadge label={flagLabel} />
      </td>
    </tr>
  );
}
