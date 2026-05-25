import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SECTION_ICONS, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function PurosoulPage({ data, date }) {
  const hasSkuData = (data.purosoulSku ?? []).some((r) => String(r.produced ?? '').trim() !== '');
  const hasData = hasKpiData(data.purosoul) || hasSkuData;
  const flashImportedAt = data.importSource?.purosoulFlashImportedAt;
  const salesImportedAt = data.importSource?.purosoulSalesImportedAt;
  const importedAt = flashImportedAt && salesImportedAt
    ? (flashImportedAt > salesImportedAt ? flashImportedAt : salesImportedAt)
    : (flashImportedAt ?? salesImportedAt);
  const badge = getFreshness(importedAt, hasData, date);
  return (
    <>
      <PageTitle title="Purosoul Data" subtitle="Revenue, RM cost, production, dispatch, and stock." badge={badge} activeKey="purosoul" />
      <SectionCard
        title="Revenue & Cost"
        subtitle="Daily revenue, raw material cost, and margin"
        icon={SECTION_ICONS.kpi}
        tone="teal"
      >
        <KpiTable rows={(data.purosoul ?? []).filter((row) => row.section === 'Revenue & Cost')} />
      </SectionCard>
      <SectionCard
        title="SKU Production & Dispatch"
        subtitle={`${(data.purosoulSku ?? []).length} SKU${(data.purosoulSku ?? []).length === 1 ? '' : 's'} tracked`}
        icon={SECTION_ICONS.sku}
        tone="indigo"
      >
        <DataTable
          columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched', 'YTD']}
          rows={(data.purosoulSku ?? []).map((row) => ({
            key: row.sku,
            cells: [
              <span className="font-semibold">{row.sku}</span>,
              <ReportValue value={row.produced} />,
              <ReportValue value={row.dispatched} />,
              <ReportValue value={row.clStock} />,
              <ReportValue value={row.mtd} />,
              <ReportValue value={row.ytd} />
            ]
          }))}
        />
      </SectionCard>
    </>
  );
}
