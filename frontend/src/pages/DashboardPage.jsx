import React, { useState } from 'react';
import BankPositionTable from '../components/BankPositionTable';
import DataTable from '../components/DataTable';
import RevenueShareDonut from '../components/RevenueShareDonut';
import SectionCard from '../components/SectionCard';
import { KpiTable, ReportValue, SECTION_ICONS } from '../components/DashboardUi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function dateSuffix(iso) {
  const formatted = fmtDate(iso);
  return formatted ? ` - ${formatted}` : '';
}

export default function DashboardPage({ data }) {
  const [viewMode, setViewMode] = useState('day');
  const roomRevenueRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Room Revenue & Occupancy'
  );
  const forecastRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Forecast'
  );
  const banquetRows = (data?.hotels ?? []).filter(
    (row) => row.unit === 'CP Nagpur' && row.section === 'Banquets'
  );
  const banquetLists = [
    {
      key: 'banquetToday',
      title: `CP Nagpur: Banquet Function List Today${dateSuffix(data?.banquetTodayDate)}`,
      rows: data?.banquetToday ?? []
    },
    {
      key: 'banquetTomorrow',
      title: `CP Nagpur: Banquet Function List Tomorrow${dateSuffix(data?.banquetTomorrowDate)}`,
      rows: data?.banquetTomorrow ?? []
    }
  ];
  const options = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="inline-flex gap-0.5 rounded-xl border border-outline-variant/60 bg-surface-container p-1">
          {options.map((option) => {
            const isActive = viewMode === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setViewMode(option.key)}
                aria-pressed={isActive}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === 'day' ? (
        <section>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary shadow-sm">
              <span className="material-symbols-outlined text-[22px]" aria-hidden>account_balance_wallet</span>
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold text-on-surface md:text-lg">Bank Position</h2>
              <p className="text-[11.5px] font-medium text-on-surface-variant">Daily balance position by unit</p>
            </div>
          </div>
          <BankPositionTable rows={data?.bankPosition ?? []} />
          <RevenueShareDonut data={data} />
          <SectionCard
            title="CP Nagpur: Room Revenue & Occupancy"
            subtitle={`${roomRevenueRows.length} KPI${roomRevenueRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={roomRevenueRows} />
          </SectionCard>
          <SectionCard
            title={`CP Nagpur: Forecast${dateSuffix(data?.forecastDate)}`}
            subtitle={`${forecastRows.length} KPI${forecastRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.hotel}
            tone="teal"
            defaultOpen
          >
            <KpiTable rows={forecastRows} />
          </SectionCard>
          <SectionCard
            title="CP Nagpur: Banquets"
            subtitle={`${banquetRows.length} KPI${banquetRows.length === 1 ? '' : 's'}`}
            icon={SECTION_ICONS.banquet}
            tone="amber"
            defaultOpen
          >
            <KpiTable rows={banquetRows} />
          </SectionCard>
          {banquetLists.map((list) => (
            <SectionCard
              key={list.key}
              title={list.title}
              subtitle={`${list.rows.length} function${list.rows.length === 1 ? '' : 's'} scheduled`}
              icon={SECTION_ICONS.banquet}
              tone="amber"
              defaultOpen
            >
              <DataTable
                columns={['Party / Client', 'Pax', 'Hall/Venue', 'Session', 'Revenue', 'Notes']}
                rows={list.rows.map((row, index) => ({
                  key: index,
                  cells: ['marketSegment', 'pax', 'venue', 'session', 'revenue', 'notes'].map((field) => (
                    <ReportValue key={field} value={row[field]} />
                  ))
                }))}
              />
            </SectionCard>
          ))}
        </section>
      ) : null}
    </div>
  );
}
