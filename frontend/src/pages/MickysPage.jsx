import React from 'react';
import { SECTION_ICONS } from '../components/DashboardUi';
import MickysDayEnd from '../components/MickysDayEnd';
import SourceNotice from '../components/SourceNotice';
import { manualSalesNote } from '../lib/sourceNotes';
import GroupedKpiPage from './GroupedKpiPage';

export default function MickysPage({ data, date }) {
  const salesNote = manualSalesNote(data.importSource, 'mickys');
  return (
    <>
      <SourceNotice text={salesNote} />
      {data.mickysDayEnd ? (
        <MickysDayEnd report={data.mickysDayEnd} />
      ) : (
        <SourceNotice text="Day End Report mail not received for this date." />
      )}
      <div className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
        KPIs vs target
      </div>
      <GroupedKpiPage
        title="Micky's Data"
        subtitle="B2B HORECA sales, receivables, executive and stock KPIs."
        dataKey="mickys"
        data={data}
        sections={[...new Set((data.mickys ?? []).map((row) => row.section))]}
        date={date}
        importedAt={data.importSource?.mickysDayEndImportedAt}
        icon={SECTION_ICONS.restaurant}
      />
    </>
  );
}
