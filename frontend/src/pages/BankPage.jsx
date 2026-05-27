import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, googleSheetPreviewUrl, hasKpiData, KpiTable, ReportValue, SegmentedControl, TopItemsList } from '../components/DashboardUi';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, numberValue, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function BankPage({ data, date }) {
  const rows = data.bankPosition ?? [];
  const [expandedUnits, setExpandedUnits] = useState({});
  const units = Array.from(new Set(rows.map((r) => r.unit || 'Unspecified')));
  const totals = rows.reduce((acc, row) => {
    acc.actual += numberValue(row.actualBalance);
    acc.issued += numberValue(row.chequesIssued);
    acc.hand += numberValue(row.chequesInHand);
    acc.fd += numberValue(row.fdTotal);
    return acc;
  }, { actual: 0, issued: 0, hand: 0, fd: 0 });
  const net = (row) =>
    String(row.netBalance ?? '').trim() !== ''
      ? numberValue(row.netBalance)
      : numberValue(row.actualBalance) + numberValue(row.fdTotal)
        - numberValue(row.chequesIssued) + numberValue(row.chequesInHand);
  const netTotal = rows.reduce((sum, row) => sum + net(row), 0);

  return (
    <>
      <StatStrip items={[
        {
          label: 'Actual Balance',
          value: moneyCompact(totals.actual),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9m-19.5 0h19.5" />
        },
        {
          label: 'FD Total',
          value: moneyCompact(totals.fd),
          tone: 'text-emerald-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25zm0 2.25h.008v.008H12V10.5zm0 2.25h.008v.008H12V12.75z" />
        },
        {
          label: 'Cheques Issued',
          value: moneyCompact(totals.issued),
          tone: totals.issued > 0 ? 'text-amber-700' : undefined,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l2 2 4-4m-7-4h6.75A2.25 2.25 0 0116.5 4.5v2.25" />
        },
        {
          label: 'Net Balance',
          value: moneyCompact(netTotal),
          tone: netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700',
          caption: `Group total across ${rows.length} accounts`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        }
      ]} />
      <DataTable
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
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-semibold text-app-text">{unit}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-app-panel px-2 py-0.5 text-[10.5px] font-medium text-app-muted ring-1 ring-app-border/60">
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />
                        </svg>
                        {unitRows.length} accounts
                      </span>
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
                <span className="num text-[15px] font-semibold tabular-nums">{money(unitTotals.actual)}</span>,
                <span className="num text-[15px] font-semibold tabular-nums">{money(unitTotals.fd)}</span>,
                <span className="num text-[15px] font-semibold tabular-nums">{money(unitTotals.issued)}</span>,
                <span className="num text-[15px] font-semibold tabular-nums">{money(unitTotals.hand)}</span>,
                <span className={`num text-[15px] font-bold tabular-nums ${unitTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(unitTotals.net)}</span>
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
                    <span className="num text-[15px] text-app-muted tabular-nums"><ReportValue value={row.actualBalance} numeric /></span>,
                    <span className="num text-[15px] text-app-muted tabular-nums"><ReportValue value={row.fdTotal ?? ''} numeric /></span>,
                    <span className="num text-[15px] text-app-muted tabular-nums"><ReportValue value={row.chequesIssued} numeric /></span>,
                    <span className="num text-[15px] text-app-muted tabular-nums"><ReportValue value={row.chequesInHand} numeric /></span>,
                    <span className={`num text-[15px] font-semibold tabular-nums ${net(row) >= 0 ? 'text-emerald-700/90' : 'text-rose-700/90'}`}>{money(net(row))}</span>
                  ]
                });
              });
            }
          });
          return built;
        })()}
        footer={
          <tr>
            <td className="px-4 py-3.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-app-subtle">Group Total</td>
            <td className="num px-4 py-3.5 text-right text-[15px] tabular-nums">{money(totals.actual)}</td>
            <td className="num px-4 py-3.5 text-right text-[15px] tabular-nums">{money(totals.fd)}</td>
            <td className="num px-4 py-3.5 text-right text-[15px] tabular-nums">{money(totals.issued)}</td>
            <td className="num px-4 py-3.5 text-right text-[15px] tabular-nums">{money(totals.hand)}</td>
            <td className={`num px-4 py-3.5 text-right text-[15px] font-extrabold tabular-nums ${netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(netTotal)}</td>
          </tr>
        }
      />
    </>
  );
}
