import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, BrandLoader, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, ReportValue, SECTION_ICONS, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function AiPage({ data, authToken }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buildPrompt = () => {
    const risks = withFlags(data).filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');
    const settlement = settlementTotals(data);
    return `Generate a daily management briefing for Centre Point Hospitality Group.

Group P&L summary:
${pnlRows(data).map((row) => `- ${row.unit}: revenue ${money(row.revenueToday)}, purchases ${money(row.purchasesToday)}, estimated net profit ${money(row.estNetProfit)}, net margin ${percent(row.netMargin)}`).join('\n')}

WATCH and ACTION flags:
${risks.map((row) => `- ${row.unit} / ${row.kpiName}: target ${row.aopTarget}, actual ${row.todayActual}, ${row.percentVsTarget}% vs target, ${row.flag}`).join('\n') || '- None'}

Settlement reconciliation:
- Total revenue: ${money(groupRevenue(data))}
- Total settled: ${money(settlement.groupTotal)}
- Difference: ${money(groupRevenue(data) - settlement.groupTotal)}

Please summarize performance, call out concerns, highlight wins, and give 3 actionable recommendations for the day.`;
  };

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setText(await generateAiNotes(buildPrompt(), authToken));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, []);

  return (
    <>
      <SectionCard
        title="Daily Management Briefing"
        subtitle="Claude-generated narrative summary for today"
        icon={SECTION_ICONS.spark}
        tone="teal"
      >
        <div className="mb-4">
          <ActionButton onClick={run} disabled={loading} variant="primary">{loading ? 'Generating...' : 'Generate Report'}</ActionButton>
        </div>
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            <svg className="mt-0.5 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </div>
        ) : null}
        <div className="min-h-96 whitespace-pre-wrap rounded-xl border border-app-border bg-app-panel p-4 leading-7 text-sm text-app-text sm:p-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-app-muted">
              <BrandLoader size={64} label="Claude is preparing the briefing..." />
            </div>
          ) : text || <span className="text-app-muted">No report generated yet. Click Generate Report above.</span>}
        </div>
      </SectionCard>
    </>
  );
}
