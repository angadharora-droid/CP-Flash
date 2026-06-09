import React, { useState } from 'react';
import DataTable from './DataTable';
import { ReportValue } from './DashboardUi';
import { money, numberValue } from '../lib/calculations';

export function getBankPositionTotals(rows = []) {
  const net = (row) =>
    String(row.netBalance ?? '').trim() !== ''
      ? numberValue(row.netBalance)
      : numberValue(row.actualBalance) + numberValue(row.fdTotal)
        - numberValue(row.chequesIssued) + numberValue(row.chequesInHand);

  const totals = rows.reduce((acc, row) => {
    acc.actual += numberValue(row.actualBalance);
    acc.issued += numberValue(row.chequesIssued);
    acc.hand += numberValue(row.chequesInHand);
    acc.fd += numberValue(row.fdTotal);
    acc.net += net(row);
    return acc;
  }, { actual: 0, issued: 0, hand: 0, fd: 0, net: 0 });

  return { totals, net };
}

export default function BankPositionTable({ rows = [] }) {
  const [expandedUnits, setExpandedUnits] = useState({});
  const units = Array.from(new Set(rows.map((r) => r.unit || 'Unspecified')));
  const { totals, net } = getBankPositionTotals(rows);

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest">
      <div className="flex items-center justify-between gap-4 border-b border-outline-variant/30 bg-surface-container-low px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>account_balance</span>
          </div>
          <span className="text-[13px] font-semibold text-on-surface">Bank Position</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-on-surface-variant">Net Balance</span>
          <span className={`num text-[13px] font-bold tabular-nums ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {money(totals.net)}
          </span>
        </div>
      </div>

      <DataTable
        className="!rounded-none !border-0"
        columns={['Unit', 'Actual Balance', 'FD Total', 'Cheques Issued', 'Cheques in Hand', 'Net Balance Available']}
        numericFrom={1}
        rows={(() => {
        const built = [];
        units.forEach((unit) => {
          const unitRows = rows.filter((r) => r.unit === unit);
          const unitTotals = unitRows.reduce((acc, row) => {
            acc.actual += numberValue(row.actualBalance);
            acc.fd += numberValue(row.fdTotal);
            acc.issued += numberValue(row.chequesIssued);
            acc.hand += numberValue(row.chequesInHand);
            acc.net += net(row);
            return acc;
          }, { actual: 0, fd: 0, issued: 0, hand: 0, net: 0 });
          const hasMulti = unitRows.length > 1;
          const expanded = !!expandedUnits[unit];
          const initials = unit.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
          built.push({
            key: `unit-${unit}`,
            cells: [
              hasMulti ? (
                <button
                  type="button"
                  onClick={() => setExpandedUnits((s) => ({ ...s, [unit]: !s[unit] }))}
                  className="group/unit -mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-app-accentTint/40"
                  aria-expanded={expanded}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-[11px] font-bold text-app-subtle ring-1 ring-app-border">
                    {initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-app-text">{unit}</span>
                  </span>
                  <svg
                    className={`size-4 shrink-0 text-app-subtle transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-[11px] font-bold text-app-subtle ring-1 ring-app-border">
                    {initials}
                  </span>
                  <span className="font-semibold text-app-text">{unit}</span>
                </div>
              ),
              <span className="num text-[16px] font-semibold tabular-nums">{money(unitTotals.actual)}</span>,
              <span className="num text-[16px] font-semibold tabular-nums">{money(unitTotals.fd)}</span>,
              <span className="num text-[16px] font-semibold tabular-nums">{money(unitTotals.issued)}</span>,
              <span className="num text-[16px] font-semibold tabular-nums">{money(unitTotals.hand)}</span>,
              <span className={`num text-[16px] font-bold tabular-nums ${unitTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(unitTotals.net)}</span>
            ]
          });
          if (hasMulti && expanded) {
            unitRows.forEach((row, idx) => {
              const isLast = idx === unitRows.length - 1;
              built.push({
                key: `unit-${unit}-row-${idx}`,
                cells: [
                  <div className="relative flex items-center gap-2 pl-5 text-[13px]">
                    <span className={`absolute left-2 top-0 w-px bg-app-border ${isLast ? 'h-1/2' : 'h-full'}`} aria-hidden />
                    <span className="absolute left-2 top-1/2 h-px w-2.5 bg-app-border" aria-hidden />
                    <span className="text-app-muted">{row.account || unit}</span>
                  </div>,
                  <span className="num text-[16px] text-app-muted tabular-nums"><ReportValue value={row.actualBalance} numeric /></span>,
                  <span className="num text-[16px] text-app-muted tabular-nums"><ReportValue value={row.fdTotal ?? ''} numeric /></span>,
                  <span className="num text-[16px] text-app-muted tabular-nums"><ReportValue value={row.chequesIssued} numeric /></span>,
                  <span className="num text-[16px] text-app-muted tabular-nums"><ReportValue value={row.chequesInHand} numeric /></span>,
                  <span className={`num text-[16px] font-semibold tabular-nums ${net(row) >= 0 ? 'text-emerald-700/90' : 'text-rose-700/90'}`}>{money(net(row))}</span>
                ]
              });
            });
          }
        });
        return built;
      })()}
      footer={
        <tr>
          <td className="px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-on-surface-variant">Group Total</td>
          <td className="num px-4 py-3.5 text-right text-[16px] tabular-nums">{money(totals.actual)}</td>
          <td className="num px-4 py-3.5 text-right text-[16px] tabular-nums">{money(totals.fd)}</td>
          <td className="num px-4 py-3.5 text-right text-[16px] tabular-nums">{money(totals.issued)}</td>
          <td className="num px-4 py-3.5 text-right text-[16px] tabular-nums">{money(totals.hand)}</td>
          <td className={`num px-4 py-3.5 text-right text-[16px] font-extrabold tabular-nums ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(totals.net)}</td>
        </tr>
      }
    />
    </div>
  );
}
