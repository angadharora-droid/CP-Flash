import React, { useEffect, useState } from 'react';
import { ActionButton, BrandLoader } from '../components/DashboardUi';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

export default function SourceReportPreviewScreen({ preview, loading, error, onClose }) {
  const [activeSheet, setActiveSheet] = useState('');
  const isSheetPreview = preview?.type === 'google-sheet';
  const sheets = preview?.sheets ?? [];
  const selectedSheet = sheets.find((sheet) => sheet.name === activeSheet) ?? sheets[0];
  const selectedRowCount = selectedSheet?.rows?.length ?? 0;
  const selectedColumnCount = selectedSheet?.rows?.reduce((max, row) => Math.max(max, row.length), 0) ?? 0;
  const title = preview?.title ?? preview?.file ?? 'Report preview';
  const status = loading ? 'Loading' : error ? 'Preview issue' : 'Ready';

  useEffect(() => {
    setActiveSheet(sheets[0]?.name ?? '');
  }, [preview?.file, sheets[0]?.name]);

  if (!preview && !loading && !error) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-surface text-on-surface">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/70 bg-surface-container-lowest px-4 py-3 shadow-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
            <MIcon name={isSheetPreview ? 'table_view' : 'description'} filled />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-normal text-on-surface md:text-lg">{title}</h1>
              <span
                className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] ${
                  error
                    ? 'border-error/20 bg-error-container/45 text-error'
                    : loading
                      ? 'border-tertiary/25 bg-tertiary-container/70 text-on-tertiary-container'
                      : 'border-primary/20 bg-primary/10 text-primary'
                }`}
              >
                {status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">
              {isSheetPreview ? 'Live Google Sheet preview' : selectedSheet ? `${selectedRowCount} rows / ${selectedColumnCount} columns` : 'Email report attachment preview'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSheetPreview && preview?.url ? (
            <ActionButton onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}>
              <MIcon name="open_in_new" className="text-[17px]" />
              Open Sheet
            </ActionButton>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close report preview"
          >
            <MIcon name="close" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-2.5 text-xs font-medium text-on-surface-variant md:px-6">
        <MIcon name="info" className="text-[17px] text-primary" />
        <span>{isSheetPreview ? 'Showing the source sheet without leaving DailyFlash.' : 'Showing the saved source-report data used by the dashboard.'}</span>
      </div>

      <main className="min-h-0 flex-1 bg-surface-container p-3 md:p-5">
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-card">
          {loading ? (
            <div className="grid h-full min-h-64 place-items-center">
              <BrandLoader size={72} label="Preparing report preview..." />
            </div>
          ) : error ? (
            <div className="grid h-full min-h-64 place-items-center p-6 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-error-container/45 text-error">
                  <MIcon name="warning" className="text-[30px]" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-on-surface">Preview unavailable</h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">{error}</p>
              </div>
            </div>
          ) : isSheetPreview ? (
            <iframe
              title={title}
              src={preview?.url}
              className="h-full min-h-0 w-full bg-surface-container-lowest"
              loading="lazy"
            />
          ) : selectedSheet ? (
            <>
              {sheets.length > 1 ? (
                <div className="shrink-0 border-b border-outline-variant/60 bg-surface-container-low px-3 py-2">
                  <div className="flex gap-1 overflow-x-auto rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-1">
                    {sheets.map((sheet) => (
                      <button
                        key={sheet.name}
                        type="button"
                        onClick={() => setActiveSheet(sheet.name)}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                          selectedSheet.name === sheet.name
                            ? 'bg-primary text-on-primary shadow-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                        }`}
                      >
                        {sheet.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain bg-surface-container-lowest">
                <table className="min-w-full border-collapse text-xs">
                  <tbody>
                    {selectedSheet.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex === 0 ? 'bg-surface-container font-bold text-on-surface' : 'odd:bg-surface-container-lowest even:bg-surface-container-low/55'}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="max-w-80 whitespace-nowrap border border-outline-variant/55 px-3 py-2 align-top text-on-surface">
                            {cell || <span className="text-on-surface-variant/35">-</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid h-full min-h-64 place-items-center p-6 text-center">
              <div>
                <MIcon name="table" className="text-[40px] text-on-surface-variant/40" />
                <p className="mt-3 text-sm font-semibold text-on-surface-variant">No previewable rows found.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
