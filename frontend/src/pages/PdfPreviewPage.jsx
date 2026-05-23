import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function PdfPreviewPage({ date, authToken, onSave, onClose }) {
  const [pdfKey, setPdfKey] = useState(0);
  const [frameState, setFrameState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');

  useEffect(() => {
    setFrameState('loading');
    const timer = setTimeout(() => setFrameState((s) => s === 'loading' ? 'error' : s), 20000);
    return () => clearTimeout(timer);
  }, [pdfKey, date]);

  const previewUrl = reportPdfPreviewUrl(date, authToken);
  const appPreviewUrl = `${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`;
  const downloadUrl = reportPdfUrl(date, authToken);
  const previewStatus = frameState === 'ready' ? 'Ready' : frameState === 'error' ? 'Needs attention' : 'Loading';

  const handleSaveAndRefresh = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setFrameState('loading');
      setPdfKey((k) => k + 1);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="PDF Preview" subtitle={`Daily flash report — ${date}`} badge={null} activeKey="pdf" />
      <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-200 p-0 sm:p-4 lg:p-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white shadow-glass sm:rounded-2xl sm:border sm:border-white/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border bg-slate-50 px-4 py-3 lg:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm">
                <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 12h3m-3 3h1.5m-6.375-15h4.5a9 9 0 019 9v9.375c0 .621-.504 1.125-1.125 1.125H5.625A1.125 1.125 0 014.5 20.625V3.375c0-.621.504-1.125 1.125-1.125z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-bold text-app-text sm:text-base">Report preview</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      frameState === 'ready' ? 'bg-emerald-50 text-emerald-700' : frameState === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {previewStatus}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-app-muted">
                  Save to refresh the in-app copy{lastRefreshed ? ` - refreshed ${lastRefreshed}` : ''}.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {saveError ? <span className="max-w-72 truncate text-xs font-medium text-red-600">{saveError}</span> : null}
              <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">
                {saving ? 'Saving...' : 'Save & Refresh'}
              </ActionButton>
              <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
              <ActionButton onClick={onClose}>Close</ActionButton>
            </div>
          </div>

          <div className="flex items-center gap-2 border-b border-app-border bg-white px-4 py-2.5 text-xs text-app-muted lg:px-5">
            <svg className="size-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.007M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>Preview reflects the last saved state. Unsaved edits will appear after refresh.</span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden bg-slate-200/70 p-3 sm:p-4">
            <div className="relative flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-slate-300 bg-white shadow-card">
              {frameState === 'loading' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white">
                  <div className="size-9 animate-spin rounded-full border-[3px] border-teal-600 border-t-transparent" />
                  <p className="text-sm font-medium text-app-muted">Preparing in-app preview...</p>
                </div>
              )}

              {frameState === 'error' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-white p-8 text-center">
                  <svg className="size-14 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.25} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <p className="text-base font-bold text-app-text">Preview unavailable in this browser</p>
                    <p className="mt-1 text-sm text-app-muted">The report is still ready to download.</p>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">Try Again</ActionButton>
                    <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
                  </div>
                </div>
              )}

              <iframe
                key={`${date}-${pdfKey}`}
                src={appPreviewUrl}
                title="Daily Flash Report PDF"
                className="h-full w-full bg-slate-100"
                onLoad={() => setFrameState('ready')}
                onError={() => setFrameState('error')}
              ></iframe>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
