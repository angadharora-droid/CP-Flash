import React from 'react';
import { SECTION_ICONS } from '../components/DashboardUi';
import GroupedKpiPage from './GroupedKpiPage';

export default function CpDeliveryPage({ data, date }) {
  return (
    <GroupedKpiPage
      title="CP Delivery Data"
      subtitle="Ciferon home-delivery sales for Hotel Centre Point."
      dataKey="cpDelivery"
      data={data}
      sections={[...new Set((data.cpDelivery ?? []).map((row) => row.section))]}
      date={date}
      icon={SECTION_ICONS.restaurant}
    />
  );
}
