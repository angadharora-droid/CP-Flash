import React from 'react';
import DataTable from '../components/DataTable';
import SectionCard from '../components/SectionCard';
import SourceNotice from '../components/SourceNotice';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';
import { manualSalesNote } from '../lib/sourceNotes';

const HIDDEN_REVENUE_COST_ROWS = new Set(['RM Cost Today', 'RM Cost %', 'Revenue MTD', 'Purchase MTD']);

export default function PurosoulPage({ data, date }) {
  const salesNote = manualSalesNote(data.importSource, 'purosoul');
  const revenueCostRows = (data.purosoul ?? []).filter((row) => (
    row.section === 'Revenue & Cost' && !HIDDEN_REVENUE_COST_ROWS.has(row.name)
  ));
  return (
    <>
      <SectionCard
        title="Revenue & Cost"
        subtitle="Daily revenue, raw material cost, and margin"
        icon={SECTION_ICONS.kpi}
        tone="teal"
      >
        <SourceNotice text={salesNote} />
        <KpiTable rows={revenueCostRows} />
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
