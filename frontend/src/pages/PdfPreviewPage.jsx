import React, { useEffect, useState } from 'react';
import { ActionButton, BrandLoader } from '../components/DashboardUi';
import { reportPdfPreviewUrl, reportPdfUrl } from '../lib/api';

const MIcon = ({ name, className = '', filled = false }) => (
  <span className={`material-symbols-outlined ${filled ? 'fill-1' : ''} ${className}`} aria-hidden>{name}</span>
);

const PDF_SECTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'bank', label: 'Bank' },
  { key: 'pnl', label: 'P&L' },
  { key: 'flags', label: 'Flags' },
  { key: 'hotels', label: 'Hotels' },
  { key: 'fnb', label: 'Standalone F&B' },
  { key: 'rabbits', label: 'Rabbits' },
  { key: 'mickys', label: "Micky's" },
  { key: 'purosoul', label: 'Purosoul' },
  { key: 'settlement', label: 'Settlement' }
];

export default function PdfPreviewPage({ date, authToken, onSave, onClose }) {
  const [pdfKey, setPdfKey] = useState(0);
  const [frameState, setFrameState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [selectedSections, setSelectedSections] = useState(() => PDF_SECTIONS.map((section) => section.key));

  const previewUrl = reportPdfPreviewUrl(date, authToken, selectedSections);
  const appPreviewUrl = objectUrl ? `${objectUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH` : '';
  const downloadUrl = reportPdfUrl(date, authToken, selectedSections);
  const previewStatus = frameState === 'ready' ? 'Ready' : frameState === 'error' ? 'Preview issue' : 'Loading';
  const allSelected = selectedSections.length === PDF_SECTIONS.length;

  const toggleSection = (key) => {
    setSelectedSections((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return [...current, key];
    });
    setPdfKey((keyValue) => keyValue + 1);
  };

  const setAllSections = () => {
    setSelectedSections(PDF_SECTIONS.map((section) => section.key));
    setPdfKey((keyValue) => keyValue + 1);
  };

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl = '';
    const controller = new AbortController();

    setFrameState('loading');
    setPreviewError('');
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });

    const timer = setTimeout(() => {
      controller.abort();
      setFrameState((state) => state === 'loading' ? 'error' : state);
      setPreviewError('The PDF request timed out.');
    }, 20000);

    fetch(previewUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/pdf')) throw new Error('The server did not return a PDF.');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setPreviewError(err.message);
        setFrameState('error');
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [pdfKey, previewUrl]);

  const handleSaveAndRefresh = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSave();
      setFrameState('loading');
      setPdfKey((key) => key + 1);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-surface text-on-surface">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-outline-variant/70 bg-surface-container-lowest px-4 py-3 shadow-sm md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary shadow-primary">
            <MIcon name="picture_as_pdf" filled />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-extrabold tracking-normal text-on-surface md:text-lg">PDF Preview</h1>
              <span
                className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.05em] ${
                  frameState === 'ready'
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : frameState === 'error'
                      ? 'border-error/20 bg-error-container/45 text-error'
                      : 'border-tertiary/25 bg-tertiary-container/70 text-on-tertiary-container'
                }`}
              >
                {previewStatus}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">
              Daily flash report for {date}{lastRefreshed ? ` / refreshed ${lastRefreshed}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saveError ? <span className="max-w-72 truncate text-xs font-semibold text-error">{saveError}</span> : null}
          <ActionButton onClick={handleSaveAndRefresh} disabled={saving} variant="primary">
            {saving ? <BrandLoader size={18} /> : <MIcon name="sync" className="text-[17px]" />}
            {saving ? 'Saving...' : 'Save & Refresh'}
          </ActionButton>
          <ActionButton onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>
            <MIcon name="open_in_new" className="text-[17px]" />
            Open
          </ActionButton>
          <ActionButton onClick={() => { window.location.href = downloadUrl; }}>
            <MIcon name="download" className="text-[17px]" />
            Download
          </ActionButton>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-lg border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close PDF preview"
          >
            <MIcon name="close" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-outline-variant/60 bg-surface-container-low px-4 py-2.5 text-xs font-medium text-on-surface-variant md:px-6">
        <MIcon name="info" className="text-[17px] text-primary" />
        <span>Preview uses the last saved dashboard data. Use Save & Refresh after edits.</span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5 md:px-6">
        <span className="mr-1 text-xs font-extrabold uppercase tracking-[0.08em] text-on-surface-variant">PDF Sections</span>
        <button
          type="button"
          onClick={setAllSections}
          disabled={allSelected}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-outline-variant/70 bg-surface-container-lowest px-2.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:cursor-default disabled:opacity-45"
        >
          <MIcon name="select_all" className="text-[16px]" />
          All
        </button>
        {PDF_SECTIONS.map((section) => {
          const checked = selectedSections.includes(section.key);
          return (
            <label
              key={section.key}
              className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-bold transition-colors ${
                checked
                  ? 'border-primary/30 bg-primary-container/25 text-primary'
                  : 'border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSection(section.key)}
                className="size-3.5 accent-primary"
              />
              {section.label}
            </label>
          );
        })}
      </div>

      <main className="min-h-0 flex-1 bg-surface-container p-3 md:p-5">
        <div className="relative h-full min-h-0 overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-card">
          {frameState === 'loading' ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-surface-container-lowest">
              <BrandLoader size={72} label="Preparing PDF preview..." />
            </div>
          ) : null}

          {frameState === 'error' ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-surface-container-lowest p-6 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-error-container/45 text-error">
                  <MIcon name="picture_as_pdf" className="text-[30px]" />
                </div>
                <h2 className="mt-4 text-lg font-extrabold text-on-surface">In-app preview did not load</h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">
                  {previewError || 'The report can still be opened or downloaded.'}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <ActionButton onClick={() => { setFrameState('loading'); setPdfKey((key) => key + 1); }} variant="primary">
                    Try Again
                  </ActionButton>
                  <ActionButton onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>Open in Tab</ActionButton>
                  <ActionButton onClick={() => { window.location.href = downloadUrl; }}>Download PDF</ActionButton>
                </div>
              </div>
            </div>
          ) : null}

          <iframe
            key={`${date}-${pdfKey}`}
            src={appPreviewUrl}
            title="Daily Flash Report PDF"
            className="h-full w-full bg-surface-container-lowest"
            onLoad={() => setFrameState('ready')}
            onError={() => setFrameState('error')}
            hidden={!appPreviewUrl}
          />
        </div>
      </main>
    </div>
  );
}
