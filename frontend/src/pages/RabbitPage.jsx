import React from 'react';
import { SECTION_ICONS } from '../components/DashboardUi';
import GroupedKpiPage from './GroupedKpiPage';

export default function RabbitPage({ data, date }) {
  return (
    <GroupedKpiPage
      title="Rabbit Data"
      subtitle="Cloud kitchen sales, platform split, category, and cost KPIs."
      dataKey="rabbits"
      data={data}
      sections={[...new Set((data.rabbits ?? []).map((row) => row.section))]}
      date={date}
      icon={SECTION_ICONS.restaurant}
    />
  );
}
