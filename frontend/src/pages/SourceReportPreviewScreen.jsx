import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function SourceReportPreviewScreen({ preview, loading, error, onClose }) {
  const [activeSheet, setActiveSheet] = useState('');
  const isSheetPreview = preview?.type === 'google-sheet';
  const sheets = preview?.sheets ?? [];
  const selectedSheet = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];
  const selectedRowCount = selectedSheet?.rows?.length ?? 0;
  const selectedColumnCount = selectedSheet?.rows?.reduce((max, row) => Math.max(max, row.length), 0) ?? 0;

  useEffect(() => {
    setActiveSheet(sheets[0]?.name ?? '');
  }, [preview?.file, sheets[0]?.name]);

  if (!preview && !loading && !error) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-200 p-0 sm:p-4 lg:p-6">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-glass sm:rounded-2xl sm:border sm:border-white/70">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-app-divider px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-app-subtle">{isSheetPreview ? 'Google Sheet preview' : 'Email report preview'}</p>
            <h2 className="mt-1 truncate text-base font-bold text-app-text">{preview?.title ?? preview?.file ?? 'Loading report'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report preview"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-panel hover:text-app-text"
          >
            <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="grid min-h-64 place-items-center text-sm font-medium text-app-muted">Preparing preview...</div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{error}</div>
          ) : isSheetPreview ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-app-border bg-white">
                <iframe
                  title={preview?.title ?? 'Google Sheet preview'}
                  src={preview?.url}
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
              <p className="text-xs text-app-muted">Showing the live Google Sheet inside DailyFlash.</p>
            </div>
          ) : selectedSheet ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              {sheets.length > 1 ? (
                <div className="flex gap-1 overflow-x-auto rounded-xl border border-app-border bg-app-panel p-1">
                  {sheets.map((sheet) => (
                    <button
                      key={sheet.name}
                      type="button"
                      onClick={() => setActiveSheet(sheet.name)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        selectedSheet.name === sheet.name ? 'bg-white text-app-accentDark shadow-sm' : 'text-app-muted hover:bg-white/70 hover:text-app-text'
                      }`}
                    >
                      {sheet.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain rounded-xl border border-app-border bg-white">
                <table className="min-w-full border-collapse text-xs">
                  <tbody>
                    {selectedSheet.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? 'bg-app-panel font-bold text-app-text' : 'odd:bg-white even:bg-app-panel/35'}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="max-w-72 whitespace-nowrap border border-app-divider px-2.5 py-2 align-top text-app-text">
                            {cell || <span className="text-slate-300">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-app-muted">Showing {selectedRowCount} rows and {selectedColumnCount} columns from the saved email attachment.</p>
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center text-sm font-medium text-app-muted">No previewable rows found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
