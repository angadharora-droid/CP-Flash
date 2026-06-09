import React from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import StatStrip from '../components/StatStrip';
import { withFlags } from '../lib/calculations';

export default function FlagsPage({ data }) {
  const flags = withFlags(data);
  const counts = {
    on: flags.filter((row) => row.flag === 'ON TRACK').length,
    action: flags.filter((row) => row.flag === 'ACTION').length
  };
  const filtered = flags.filter((row) => row.flag === 'ACTION');

  return (
    <>
      <StatStrip items={[
        {
          label: 'On Track',
          value: counts.on,
          tone: 'text-emerald-700',
          caption: counts.on === 1 ? 'KPI tracking well' : 'KPIs tracking well',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        },
        {
          label: 'Action',
          value: counts.action,
          tone: 'text-rose-700',
          caption: counts.action === 0 ? 'All clear' : (counts.action === 1 ? 'Needs attention' : 'Need attention'),
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        }
      ]} />
      <DataTable
        columns={['Unit', 'KPI Name', 'AOP Target', 'Actual', '% vs Target', 'Flag']}
        numericFrom={2}
        rows={filtered.map((row) => ({
          key: `${row.unit}-${row.kpiName}`,
          cells: [
            <span className="font-semibold text-app-text">{row.unit}</span>,
            <span className="text-app-text">{row.kpiName}</span>,
            <span className="num">{row.aopTarget}</span>,
            <span className="num">{row.todayActual}</span>,
            <span className={`num font-semibold ${row.percentVsTarget >= 90 ? 'text-emerald-700' : 'text-rose-700'}`}>{row.percentVsTarget}%</span>,
            <FlagBadge label={row.flag} />
          ]
        }))}
      />
    </>
  );
}
