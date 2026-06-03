import React from 'react';
import SectionCard from '../components/SectionCard';
import { KpiTable, SECTION_ICONS } from '../components/DashboardUi';

const SECTION_TONE = ['teal', 'indigo', 'amber', 'emerald', 'rose'];

export default function GroupedKpiPage({ title, subtitle, dataKey, data, sections, date, importedAt, icon }) {
  const rows = data[dataKey] ?? [];
  return (
    <>
      {sections.map((section, idx) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <SectionCard
            key={section}
            title={section}
            subtitle={`${sectionRows.length} KPI${sectionRows.length === 1 ? '' : 's'}`}
            icon={icon ?? SECTION_ICONS.kpi}
            tone={SECTION_TONE[idx % SECTION_TONE.length]}
          >
            <KpiTable rows={sectionRows} />
          </SectionCard>
        );
      })}
    </>
  );
}
