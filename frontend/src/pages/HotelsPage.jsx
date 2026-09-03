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

const HOTEL_UNITS = ['CP Nagpur', 'CP NM', 'CP Amravati'];
const HOTEL_LABELS = { 'CP NM': 'CP Navi Mumbai' };
const IMPORTED_AT_KEY = { 'CP Nagpur': 'importedAt', 'CP NM': 'cpNmImportedAt', 'CP Amravati': 'cpAmravatiImportedAt' };
// The shared schema seeds every unit with every section; hide the ones a unit's
// feed never fills (CP NM has no banquets; StayLink at CP Amravati reports no
// forecast, banquets or market segments).
const HIDDEN_SECTIONS = { 'CP NM': ['Banquets'], 'CP Amravati': ['Forecast', 'Banquets', 'Market Segments'] };
// Units whose F&B rows come from a feed with its own outlet names (CP NM's
// Bougainvillea / In-Room Dining / Laundry, CP Amravati's POS / Services) — show
// just the rows that carry values, not CP Nagpur's outlet list.
const VALUE_ONLY_FNB_UNITS = ['CP NM', 'CP Amravati'];

export default function HotelsPage({ data, date }) {
  const [hotelUnit, setHotelUnit] = useState('CP Nagpur');
  const rows = (data.hotels ?? []).filter((row) => row.unit === hotelUnit);
  const hidden = HIDDEN_SECTIONS[hotelUnit] ?? [];
  const sectionRows = (section) => {
    const list = rows.filter((row) => row.section === section);
    if (VALUE_ONLY_FNB_UNITS.includes(hotelUnit) && section === 'F&B Outlets') {
      return list.filter((row) => [row.actual, row.mtd, row.ytd].some((v) => String(v ?? '').trim() !== ''));
    }
    return list;
  };
  const sections = [...new Set(rows.map((row) => row.section))].filter(
    (s) => !hidden.includes(s) && sectionRows(s).length
  );
  const hotelLabel = HOTEL_LABELS[hotelUnit] ?? hotelUnit;
  return (
    <>
      <SegmentedControl
        value={hotelUnit}
        onChange={setHotelUnit}
        items={HOTEL_UNITS.map((unit) => ({
          key: unit,
          label: HOTEL_LABELS[unit] ?? unit,
          badge: getFreshness(
            data.importSource?.[IMPORTED_AT_KEY[unit]],
            hasKpiData((data.hotels ?? []).filter((r) => r.unit === unit)),
            date
          )
        }))}
      />
      {sections.map((section) => (
        <SectionCard
          key={section}
          title={`${hotelLabel}: ${section}${section === 'Forecast' ? dateSuffix(data.forecastDate) : ''}`}
          subtitle={`${sectionRows(section).length} KPI${sectionRows(section).length === 1 ? '' : 's'}`}
          icon={SECTION_ICONS.hotel}
          tone="indigo"
        >
          <KpiTable rows={sectionRows(section)} />
        </SectionCard>
      ))}
      {(hotelUnit === 'CP Nagpur' || hotelUnit === 'CP NM') && <OccupancyMixCard data={data} unit={hotelUnit} />}
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
