import React, { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, PageTitle, ReportValue, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

export default function HotelsPage({ data, date }) {
  const [hotelUnit, setHotelUnit] = useState('CP Nagpur');
  const rows = (data.hotels ?? []).filter((row) => row.unit === hotelUnit);
  const cpNmExclude = ['F&B Outlets', 'Banquets'];
  const sections = [...new Set(rows.map((row) => row.section))].filter(
    (s) => hotelUnit !== 'CP NM' || !cpNmExclude.includes(s)
  );
  const hotelLabel = hotelUnit === 'CP NM' ? 'CP Navi Mumbai' : hotelUnit;
  return (
    <>
      <PageTitle title="Hotels Data" subtitle="Separate operating dashboards for CP Nagpur and CP Navi Mumbai." activeKey="hotels" />
      <SegmentedControl
        value={hotelUnit}
        onChange={setHotelUnit}
        items={['CP Nagpur', 'CP NM'].map((unit) => ({
          key: unit,
          label: unit === 'CP NM' ? 'CP Navi Mumbai' : unit,
          badge: getFreshness(
            unit === 'CP Nagpur' ? data.importSource?.importedAt : data.importSource?.occupancyImportedAt,
            hasKpiData((data.hotels ?? []).filter((r) => r.unit === unit)),
            date
          )
        }))}
      />
      {sections.map((section) => (
        <SectionCard key={section} title={`${hotelLabel}: ${section}`}>
          <KpiTable rows={rows.filter((row) => row.section === section)} />
        </SectionCard>
      ))}
      {hotelUnit === 'CP Nagpur' && ['banquetToday', 'banquetTomorrow'].map((key) => (
        <SectionCard key={key} title={`${hotelLabel}: ${key === 'banquetToday' ? 'Banquet Function List Today' : 'Banquet Function List Tomorrow'}`}>
          <DataTable
            columns={['Market Segment', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes']}
            rows={(data[key] ?? []).map((row, index) => ({
              key: index,
              cells: ['marketSegment', 'pax', 'venue', 'session', 'revenue', 'notes'].map((field) => <ReportValue key={field} value={row[field]} />)
            }))}
          />
        </SectionCard>
      ))}
    </>
  );
}
