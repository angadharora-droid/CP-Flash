import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function GroupedKpiPage({ title, subtitle, dataKey, data, sections, date, importedAt, sheetUrl }) {
  const rows = data[dataKey] ?? [];
  const badge = getFreshness(importedAt ?? null, hasKpiData(rows), date);
  return (
    <>
      <PageTitle title={title} subtitle={subtitle} badge={badge} activeKey={dataKey} />
      {sheetUrl && <div className="flex justify-end"><SheetLink url={sheetUrl} /></div>}
      {sections.map((section) => <SectionCard key={section} title={section}><KpiTable rows={rows.filter((row) => row.section === section)} /></SectionCard>)}
    </>
  );
}
