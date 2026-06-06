import React from 'react';
import { aopTargetValue, calcFlag, formatIndianNumber, numberValue } from '../lib/calculations';
import FlagBadge from './FlagBadge';

export default function KpiRow({ kpi }) {
  const target = aopTargetValue(kpi);
  const flag = calcFlag(kpi.actual, target, kpi.direction);
  const forceNumber = /arrivals?|departures?/i.test(kpi.name ?? '');
  const actual = numberValue(kpi.actual);
  const ratio = target > 0 ? Math.min((actual / target) * 100, 100) : 0;

  const progressColor =
    flag.label === 'ON TRACK' ? 'bg-emerald-500' :
    flag.label === 'ACTION'   ? 'bg-rose-500'    : 'bg-amber-500';

  const fmt = (v) => {
    const empty = v === '' || v == null;
    return empty ? '-' : formatIndianNumber(forceNumber ? numberValue(v) : v);
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-outline-variant/20 px-4 py-2.5 last:border-0 transition-colors hover:bg-surface-container-low/50">
      <div className="min-w-0">
        <span className="text-[12.5px] font-medium text-on-surface">{kpi.name}</span>
        <div className="mt-1 h-1 w-full rounded-full bg-outline-variant/30">
          <div
            className={`h-1 rounded-full ${progressColor} transition-all duration-500`}
            style={{ width: `${ratio}%` }}
          />
        </div>
      </div>
      <span className="num text-[12px] text-on-surface-variant">{fmt(target)}</span>
      <span className="num text-[13px] font-semibold text-on-surface">{fmt(kpi.actual)}</span>
      <FlagBadge label={flag.label} />
    </div>
  );
}
