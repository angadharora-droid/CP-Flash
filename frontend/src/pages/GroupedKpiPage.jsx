import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, ReportValue, SECTION_ICONS, SegmentedControl, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

const SECTION_TONE = ['teal', 'indigo', 'amber', 'emerald', 'rose'];

export default function GroupedKpiPage({ title, subtitle, dataKey, data, sections, date, importedAt, icon }) {
  const rows = data[dataKey] ?? [];
  return (
    <>
      {sections.map((section, idx) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <SectionCard
            key={section}
            title={section}
            subtitle={`${sectionRows.length} KPI${sectionRows.length === 1 ? '' : 's'}`}
            icon={icon ?? SECTION_ICONS.kpi}
            tone={SECTION_TONE[idx % SECTION_TONE.length]}
          >
            <KpiTable rows={sectionRows} />
          </SectionCard>
        );
      })}
    </>
  );
}
