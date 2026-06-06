import React from 'react';
import { aopTargetValue, calcFlag, formatIndianNumber, numberValue } from '../lib/calculations';
import FlagBadge from './FlagBadge';

const FLAG_STYLE = {
  'ON TRACK': { strip: 'bg-emerald-500', actual: 'text-emerald-700', bar: 'bg-emerald-500' },
  'ACTION':   { strip: 'bg-rose-500',    actual: 'text-rose-700',    bar: 'bg-rose-500'    },
};
const DEFAULT_STYLE = { strip: 'bg-outline-variant/40', actual: 'text-on-surface', bar: 'bg-primary' };

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
  const { label: flagLabel, ratio: rawRatio } = calcFlag(kpi.actual, target, kpi.direction);
  const ratio = Math.min(rawRatio, 100);
  const forceNumber = /arrivals?|departures?/i.test(kpi.name ?? '');
  const style = FLAG_STYLE[flagLabel] ?? DEFAULT_STYLE;
  const hasTarget = target > 0;

  return (
    <tr className="group border-b border-outline-variant/25 last:border-0 transition-colors hover:bg-surface-container-low/60 odd:bg-surface-container-lowest even:bg-surface-container/30">

      {/* KPI name — sticky, with left accent strip and mini progress bar */}
      <td className="sticky left-0 z-[1] min-w-36 bg-inherit p-0 shadow-[1px_0_0_0_rgba(202,211,218,0.7)] sm:min-w-48 md:min-w-56">
        <div className="flex h-full items-stretch">
          <span className={`w-[3px] shrink-0 self-stretch ${style.strip}`} aria-hidden />
          <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4">
            <div className="text-[13px] font-semibold leading-snug text-on-surface">{kpi.name}</div>
            <div className="mt-1.5 h-[3px] w-full max-w-[112px] overflow-hidden rounded-full bg-outline-variant/20">
              <div
                className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        </div>
      </td>

      {/* AOP Target */}
      <td className="px-3 py-2.5 text-right align-middle sm:px-4">
        <NumCell value={target} forceNumber={forceNumber} className="text-[12px] text-on-surface-variant/70" />
      </td>

      {/* Today Actual — color-coded + % vs AOP */}
      <td className="px-3 py-2.5 text-right align-middle sm:px-4">
        <div className="flex flex-col items-end gap-0.5">
          <NumCell
            value={kpi.actual}
            forceNumber={forceNumber}
            className={`text-[13px] font-bold ${style.actual}`}
          />
          {hasTarget && (
            <span className="text-[10px] font-medium text-on-surface-variant/45">
              {Math.round(ratio)}% vs AOP
            </span>
          )}
        </div>
      </td>

      {/* MTD */}
      <td className="px-3 py-2.5 text-right align-middle sm:px-4">
        <NumCell value={kpi.mtd} forceNumber={forceNumber} className="text-[12px] text-on-surface-variant/80" />
      </td>

      {/* Status badge */}
      <td className="px-3 py-2.5 align-middle sm:px-4">
        <FlagBadge label={flagLabel} />
      </td>
    </tr>
  );
}
