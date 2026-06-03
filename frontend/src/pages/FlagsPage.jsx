import React from 'react';
import DataTable from '../components/DataTable';
import FlagBadge from '../components/FlagBadge';
import StatStrip from '../components/StatStrip';
import { withFlags } from '../lib/calculations';

export default function FlagsPage({ data }) {
  const flags = withFlags(data);
  const counts = {
    on: flags.filter((row) => row.flag === 'ON TRACK' || row.flag === 'OUTPERFORM').length,
    watch: flags.filter((row) => row.flag === 'WATCH').length,
    action: flags.filter((row) => row.flag === 'ACTION NEEDED').length
  };
  const filtered = flags.filter((row) => row.flag === 'WATCH' || row.flag === 'ACTION NEEDED');

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
          label: 'Watch',
          value: counts.watch,
          tone: 'text-amber-700',
          caption: counts.watch === 1 ? 'KPI to monitor' : 'KPIs to monitor',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        },
        {
          label: 'Action Needed',
          value: counts.action,
          tone: 'text-rose-700',
          caption: counts.action === 0 ? 'All clear' : (counts.action === 1 ? 'Needs attention' : 'Need attention'),
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        },
        {
          label: 'Total Risks',
          value: counts.watch + counts.action,
          tone: counts.action > 0 ? 'text-rose-700' : counts.watch > 0 ? 'text-amber-700' : 'text-emerald-700',
          caption: `Out of ${counts.on + counts.watch + counts.action} KPIs`,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
        }
      ]} />
      <DataTable
        columns={['Unit', 'KPI Name', 'AOP Target', 'Today Actual', '% vs Target', 'Flag']}
        numericFrom={2}
        rows={filtered.map((row) => ({
          key: `${row.unit}-${row.kpiName}`,
          cells: [
            <span className="font-semibold text-app-text">{row.unit}</span>,
            <span className="text-app-text">{row.kpiName}</span>,
            <span className="num">{row.aopTarget}</span>,
            <span className="num">{row.todayActual}</span>,
            <span className={`num font-semibold ${row.percentVsTarget >= 95 ? 'text-emerald-700' : row.percentVsTarget >= 85 ? 'text-amber-700' : 'text-rose-700'}`}>{row.percentVsTarget}%</span>,
            <FlagBadge label={row.flag} />
          ]
        }))}
      />
    </>
  );
}
