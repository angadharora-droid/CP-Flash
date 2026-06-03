import React, { useState } from 'react';
import SectionCard from '../components/SectionCard';
import { getFreshness, hasKpiData, KpiTable, SECTION_ICONS, SegmentedControl, TopItemsList } from '../components/DashboardUi';

export default function FnbPage({ data, date }) {
  const [tab, setTab] = useState('Pablo');
  const rows = data.fnb?.[tab] ?? [];
  const sections = [...new Set(rows.map((row) => row.section))];
  return (
    <>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        items={['Pablo', 'Dali'].map((item) => ({
          key: item,
          label: item,
          badge: getFreshness(
            item === 'Pablo' ? data.importSource?.pabloCostImportedAt : data.importSource?.daliCostImportedAt,
            hasKpiData(data.fnb?.[item]),
            date
          )
        }))}
      />
      {sections.map((section) => (
        <SectionCard
          key={section}
          title={`${tab}: ${section}`}
          subtitle={`${rows.filter((row) => row.section === section).length} KPI${rows.filter((row) => row.section === section).length === 1 ? '' : 's'}`}
          icon={SECTION_ICONS.restaurant}
          tone="teal"
        >
          <KpiTable rows={rows.filter((row) => row.section === section)} />
        </SectionCard>
      ))}
      <SectionCard
        title={`${tab}: Top 3 Items`}
        subtitle="Highest-grossing items by revenue"
        icon={SECTION_ICONS.topItems}
        tone="amber"
      >
        <TopItemsList items={data.topItems?.[tab] ?? []} />
      </SectionCard>
    </>
  );
}
