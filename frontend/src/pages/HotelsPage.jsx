import React, { useState } from 'react';
import DataTable from '../components/DataTable';
import SectionCard from '../components/SectionCard';
import OccupancyMixCard from '../components/OccupancyMixCard';
import { getFreshness, hasKpiData, KpiTable, ReportValue, SECTION_ICONS, SegmentedControl } from '../components/DashboardUi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05-30" → "30 May 2026". Returns '' for empty/invalid input. */
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** " — 30 May 2026" for a header suffix, or '' if no valid date. */
function dateSuffix(iso) {
  const f = fmtDate(iso);
  return f ? ` — ${f}` : '';
}

export default function HotelsPage({ data, date }) {
  const [hotelUnit, setHotelUnit] = useState('CP Nagpur');
  const rows = (data.hotels ?? []).filter((row) => row.unit === hotelUnit);
  const cpNmExclude = ['Banquets'];
  // The shared schema seeds every unit with all F&B outlet rows, but CP NM only has
  // Bougainvillea / In-Room Dining data — show just the rows that carry values.
  const sectionRows = (section) => {
    const list = rows.filter((row) => row.section === section);
    if (hotelUnit === 'CP NM' && section === 'F&B Outlets') {
      return list.filter((row) => [row.actual, row.mtd, row.ytd].some((v) => String(v ?? '').trim() !== ''));
    }
    return list;
  };
  const sections = [...new Set(rows.map((row) => row.section))].filter(
    (s) => (hotelUnit !== 'CP NM' || !cpNmExclude.includes(s)) && sectionRows(s).length
  );
  const hotelLabel = hotelUnit === 'CP NM' ? 'CP Navi Mumbai' : hotelUnit;
  return (
    <>
      <SegmentedControl
        value={hotelUnit}
        onChange={setHotelUnit}
        items={['CP Nagpur', 'CP NM'].map((unit) => ({
          key: unit,
          label: unit === 'CP NM' ? 'CP Navi Mumbai' : unit,
          badge: getFreshness(
            unit === 'CP Nagpur' ? data.importSource?.importedAt : data.importSource?.cpNmImportedAt,
            hasKpiData((data.hotels ?? []).filter((r) => r.unit === unit)),
            date
          )
        }))}
      />
      {sections.map((section) => (
        <SectionCard
          key={section}
          title={`${hotelLabel}: ${section}${section === 'Forecast' ? dateSuffix(data.forecastDate) : ''}`}
          subtitle={`${rows.filter((row) => row.section === section).length} KPI${rows.filter((row) => row.section === section).length === 1 ? '' : 's'}`}
          icon={SECTION_ICONS.hotel}
          tone="indigo"
        >
          <KpiTable rows={rows.filter((row) => row.section === section)} />
        </SectionCard>
      ))}
      {hotelUnit === 'CP Nagpur' && <OccupancyMixCard data={data} />}
      {hotelUnit === 'CP Nagpur' && ['banquetToday', 'banquetTomorrow'].map((key) => (
        <SectionCard
          key={key}
          title={`${hotelLabel}: ${key === 'banquetToday' ? 'Banquet Function List Today' : 'Banquet Function List Tomorrow'}${dateSuffix(data[`${key}Date`])}`}
          subtitle={`${(data[key] ?? []).length} function${(data[key] ?? []).length === 1 ? '' : 's'} scheduled`}
          icon={SECTION_ICONS.banquet}
          tone="amber"
        >
          <DataTable
            columns={['Party / Client', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes']}
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
