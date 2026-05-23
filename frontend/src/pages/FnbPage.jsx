import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function FnbPage({ data, date }) {
  const [tab, setTab] = useState('Pablo');
  const rows = data.fnb?.[tab] ?? [];
  const sections = [...new Set(rows.map((row) => row.section))];
  const fnbSheetUrl = tab === 'Pablo' ? SHEET_URLS.pabloCost : SHEET_URLS.daliCost;
  return (
    <>
      <PageTitle title="F&B Outlet Data" subtitle="Pablo and Dali sales, cost, AOP, and top items." activeKey="fnb" />
      <SegmentedControl
        value={tab}
        onChange={setTab}
        items={['Pablo', 'Dali'].map((item) => ({
          key: item,
          label: item,
          badge: getFreshness(
            item === 'Pablo' ? data.importSource?.pabloCostImportedAt : data.importSource?.daliCostImportedAt,
            hasKpiData(data.fnb?.[item]),
            date
          )
        }))}
      />
      <div className="flex justify-end">
        <SheetLink url={fnbSheetUrl} label={`View ${tab} Cost Sheet`} />
      </div>
      {sections.map((section) => <SectionCard key={section} title={`${tab}: ${section}`}><KpiTable rows={rows.filter((row) => row.section === section)} /></SectionCard>)}
      <SectionCard title={`${tab}: Top 3 Items`}>
        <TopItemsList items={data.topItems?.[tab] ?? []} />
      </SectionCard>
    </>
  );
}
