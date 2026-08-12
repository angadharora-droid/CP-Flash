import React from 'react';
import { SECTION_ICONS } from '../components/DashboardUi';
import SourceNotice from '../components/SourceNotice';
import { manualSalesNote } from '../lib/sourceNotes';
import GroupedKpiPage from './GroupedKpiPage';

export default function MickysPage({ data, date }) {
  const salesNote = manualSalesNote(data.importSource, 'mickys');
  return (
    <>
      <SourceNotice text={salesNote} />
      <GroupedKpiPage
        title="Micky's Data"
        subtitle="B2B HORECA lead, order, revenue, and SKU KPIs."
        dataKey="mickys"
        data={data}
        sections={[...new Set((data.mickys ?? []).map((row) => row.section))]}
        date={date}
        importedAt={data.importSource?.mickysCrmImportedAt}
        icon={SECTION_ICONS.restaurant}
      />
    </>
  );
}
