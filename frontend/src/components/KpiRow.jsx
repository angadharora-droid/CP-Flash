import React from 'react';
import { aopTargetValue, calcFlag, formatIndianNumber, numberValue } from '../lib/calculations';
import FlagBadge from './FlagBadge';

const FLAG_STYLE = {
  'ON TRACK': { row: 'hover:bg-emerald-50/35', actual: 'text-emerald-700', sticky: 'bg-white group-hover:bg-emerald-50/60' },
  ACTION:     { row: 'bg-rose-50/35 hover:bg-rose-50/70', actual: 'text-rose-700', sticky: 'bg-rose-50 group-hover:bg-rose-100/70' }
};

const DEFAULT_STYLE = { row: 'hover:bg-surface-container-low/70', actual: 'text-slate-800', sticky: 'bg-white group-hover:bg-slate-50' };

function NumCell({ value, forceNumber = false, className = '' }) {
  const empty = value === '' || value == null;
  const display = empty ? '-' : formatIndianNumber(forceNumber ? numberValue(value) : value);

  return (
    <span className={`num tabular-nums ${empty ? 'text-slate-300' : ''} ${className}`}>
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
    <tr className={`group border-b border-slate-200/70 bg-white transition-colors last:border-0 ${style.row}`}>
      <td className={`sticky left-0 z-[1] w-[1%] min-w-0 p-0 shadow-[1px_0_0_0_rgba(226,232,240,0.9)] transition-colors sm:w-[240px] ${style.sticky}`}>
        <div className="flex min-h-[44px] items-center px-2 py-2 sm:min-h-[56px] sm:px-4 sm:py-3">
          <span className="text-[14px] font-bold text-slate-800 sm:text-[13.5px]">{kpi.name}</span>
        </div>
      </td>

      <td className="px-3 py-2 text-right align-middle sm:px-4 sm:py-3">
        <NumCell value={kpi.actual} forceNumber={forceNumber} className={`text-[11.5px] font-extrabold sm:text-[13.5px] ${style.actual}`} />
      </td>

      <td className="px-3 py-2 text-right align-middle sm:px-4 sm:py-3">
        <NumCell value={target} forceNumber={forceNumber} className="text-[11.5px] font-semibold text-slate-400 sm:text-[13.5px]" />
      </td>

      <td className="px-3 py-2 text-right align-middle sm:px-4 sm:py-3">
        <NumCell value={kpi.mtd} forceNumber={forceNumber} className="text-[11.5px] font-semibold text-slate-500 sm:text-[13.5px]" />
      </td>

      <td className="px-3 py-2 align-middle sm:px-4 sm:py-3">
        <FlagBadge label={flagLabel} />
      </td>
    </tr>
  );
}
