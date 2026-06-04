import React from 'react';
import DataTable from '../components/DataTable';
import SectionCard from '../components/SectionCard';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';

export default function PurosoulPage({ data, date }) {
  return (
    <>
      <SectionCard
        title="Revenue & Cost"
        subtitle="Daily revenue, raw material cost, and margin"
        icon={SECTION_ICONS.kpi}
        tone="teal"
      >
        <KpiTable rows={(data.purosoul ?? []).filter((row) => row.section === 'Revenue & Cost')} />
      </SectionCard>
      <SectionCard
        title="SKU Production & Dispatch"
        subtitle={`${(data.purosoulSku ?? []).length} SKU${(data.purosoulSku ?? []).length === 1 ? '' : 's'} tracked`}
        icon={SECTION_ICONS.sku}
        tone="indigo"
      >
        <DataTable
          columns={['SKU', 'Produced', 'Bill + Scheme Dispatched', 'Closing Stock', 'MTD Dispatched']}
          rows={(data.purosoulSku ?? []).map((row) => ({
            key: row.sku,
            cells: [
              <span className="font-semibold">{row.sku}</span>,
              <ReportValue value={row.produced} />,
              <ReportValue value={row.dispatched} />,
              <ReportValue value={row.clStock} />,
              <ReportValue value={row.mtd} />
            ]
          }))}
        />
      </SectionCard>
    </>
  );
}
