import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function SettlementPage({ data, date }) {
  const totals = settlementTotals(data);
  const revenue = groupRevenue(data);
  const diff = revenue - totals.groupTotal;
  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl border ${diff === 0 ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'} px-5 py-4 shadow-card backdrop-blur-xl`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl ring-1 ${diff === 0 ? 'bg-white text-emerald-600 ring-emerald-100' : 'bg-white text-rose-600 ring-rose-100'}`}>
              <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                {diff === 0
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />}
              </svg>
            </div>
            <div>
              <div className={`text-sm font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {diff === 0 ? 'Revenue and settlements match' : 'Revenue and settlements mismatch'}
              </div>
              <div className="num mt-0.5 text-xs font-medium text-app-muted">
                Revenue {money(revenue)} · Settled {money(totals.groupTotal)} · Difference{' '}
                <span className={`font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(diff)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <StatStrip items={[
        {
          label: 'Total Revenue',
          value: moneyCompact(revenue),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        },
        {
          label: 'Total Settled',
          value: moneyCompact(totals.groupTotal),
          tone: 'text-emerald-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25V9m-19.5 0v8.25A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V9" />
        },
        {
          label: 'Difference',
          value: moneyCompact(diff),
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        },
        {
          label: 'Status',
          value: diff === 0 ? 'MATCHED' : 'MISMATCH',
          tone: diff === 0 ? 'text-emerald-700' : 'text-rose-700',
          caption: diff === 0 ? 'Balanced for the day' : 'Investigate discrepancy',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        }
      ]} />
      <DataTable
        columns={['Settlement Mode', ...UNITS, 'Group Total']}
        numericFrom={1}
        rows={settlementModes.map((mode) => ({
          key: mode,
          cells: [
            <span className="font-semibold text-app-text">{mode}</span>,
            ...UNITS.map((unit) => <ReportValue key={unit} value={data.settlement?.[mode]?.[unit]} numeric />),
            <span className="num font-bold text-app-text">{money(totals.rowTotals[mode])}</span>
          ]
        }))}
        footer={
          <tr>
            <td className="px-4 py-3">UNIT TOTAL</td>
            {UNITS.map((unit) => <td key={unit} className="num px-4 py-3 text-right">{money(totals.unitTotals[unit])}</td>)}
            <td className="num px-4 py-3 text-right">{money(totals.groupTotal)}</td>
          </tr>
        }
      />
    </>
  );
}
