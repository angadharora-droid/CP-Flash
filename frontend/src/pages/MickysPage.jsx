import React from 'react';
import { SECTION_ICONS } from '../components/DashboardUi';
import GroupedKpiPage from './GroupedKpiPage';

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
      icon={SECTION_ICONS.restaurant}
    />
  );
}
