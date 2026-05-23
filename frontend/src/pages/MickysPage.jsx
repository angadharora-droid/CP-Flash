import React from 'react';
import GroupedKpiPage from './GroupedKpiPage';
import { SHEET_URLS } from '../lib/navigation';

export default function MickysPage({ data, date }) {
  return (
    <GroupedKpiPage
      title="Micky's Data"
      subtitle="B2B HORECA lead, order, revenue, and SKU KPIs."
      dataKey="mickys"
      data={data}
      sections={[...new Set((data.mickys ?? []).map((row) => row.section))]}
      date={date}
      importedAt={data.importSource?.mickysLeadsImportedAt}
      sheetUrl={SHEET_URLS.mickysLeads}
    />
  );
}
