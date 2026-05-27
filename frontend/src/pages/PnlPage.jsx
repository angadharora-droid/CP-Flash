import React from 'react';
import DataTable from '../components/DataTable';
import DashboardCharts from '../components/DashboardCharts';
import FlagBadge from '../components/FlagBadge';
import SectionCard from '../components/SectionCard';
import StatStrip from '../components/StatStrip';
import { ActionButton, getFreshness, googleSheetPreviewUrl, hasKpiData, KpiTable, ReportValue, SECTION_ICONS, SegmentedControl, SheetLink, TopItemsList } from '../components/DashboardUi';
import { SHEET_URLS } from '../lib/navigation';
import { generateAiNotes, getEmailImportStatus, getSourceStatus, reportPdfPreviewUrl, reportPdfUrl, runEmailImport } from '../lib/api';
import { groupRevenue, money, moneyCompact, numberValue, percent, pnlRows, settlementModes, settlementTotals, UNITS, withFlags } from '../lib/calculations';

const EMPTY_PERIOD_ENTRY = { revenue: 0, purchases: 0, gp: 0, netProfit: 0, days: 0 };

function sumPeriod(period) {
  return UNITS.reduce((acc, unit) => {
    const entry = period?.[unit] ?? EMPTY_PERIOD_ENTRY;
    acc.revenue += entry.revenue || 0;
    acc.purchases += entry.purchases || 0;
    acc.gp += entry.gp || 0;
    acc.netProfit += entry.netProfit || 0;
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, netProfit: 0 });
}

export default function PnlPage({ data, period }) {
  const rows = pnlRows(data);
  const mtdByUnit = period?.mtd ?? {};
  const ytdByUnit = period?.ytd ?? {};
  const mtdTotals = sumPeriod(mtdByUnit);
  const ytdTotals = sumPeriod(ytdByUnit);

  const totals = rows.reduce((acc, row) => {
    acc.revenue += numberValue(row.revenueToday);
    acc.purchases += numberValue(row.purchasesToday);
    acc.gp += row.grossProfit;
    acc.fixed += numberValue(row.fixedCost);
    acc.net += row.estNetProfit;
    return acc;
  }, { revenue: 0, purchases: 0, gp: 0, fixed: 0, net: 0 });
  totals.mtd = mtdTotals.netProfit;
  totals.ytd = ytdTotals.netProfit;

  return (
    <>
      <SectionCard
        title="Config: Daily Fixed Cost per Unit"
        subtitle="Override the daily fixed cost driving net-profit math"
        icon={SECTION_ICONS.config}
        tone="slate"
        defaultOpen={false}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <div key={row.unit} className="flex items-center justify-between gap-3 rounded-xl border border-app-border bg-white/80 px-3.5 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-app-muted">{row.unit}</span>
              <span className="num text-sm font-bold text-app-text">{money(row.fixedCost)}</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <StatStrip items={[
        {
          label: 'Group Revenue',
          value: moneyCompact(totals.revenue),
          tone: 'text-teal-700',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        },
        {
          label: 'Gross Profit',
          value: moneyCompact(totals.gp),
          tone: totals.gp >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: totals.revenue ? `${percent(totals.gp / totals.revenue * 100)} of revenue` : null,
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        },
        {
          label: 'Est. Net Profit',
          value: moneyCompact(totals.net),
          tone: totals.net >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: totals.net >= 0 ? 'After fixed costs' : 'Loss after fixed costs',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4" />
        },
        {
          label: 'Net Margin',
          value: percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0),
          tone: totals.net >= 0 ? 'text-emerald-700' : 'text-red-700',
          caption: 'Net profit ÷ revenue',
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
        }
      ]} />
      <DashboardCharts data={data} period={period} />
      <DataTable
        columns={['Unit', 'Revenue Today', 'Purchases Today', 'Gross Profit', 'GP%', 'Fixed Cost (Daily)', 'Est. Net Profit', 'Net Margin%', 'MTD Net Profit', 'YTD Net Profit']}
        numericFrom={1}
        rows={rows.map((row) => {
          const mtdNet = mtdByUnit[row.unit]?.netProfit;
          const ytdNet = ytdByUnit[row.unit]?.netProfit;
          return {
            key: row.unit,
            cells: [
              <span className="font-semibold text-app-text">{row.unit}</span>,
              <ReportValue value={row.revenueToday} numeric />,
              <ReportValue value={row.purchasesToday} numeric />,
              <span className="num font-medium text-app-text">{money(row.grossProfit)}</span>,
              <span className={`num font-semibold ${row.gpPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.gpPercent)}</span>,
              <ReportValue value={row.fixedCost} numeric />,
              <span className={`num font-semibold ${row.estNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(row.estNetProfit)}</span>,
              <span className={`num font-semibold ${row.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(row.netMargin)}</span>,
              <span className={`num font-semibold ${(mtdNet ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{period ? money(mtdNet ?? 0) : '—'}</span>,
              <span className={`num font-semibold ${(ytdNet ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{period ? money(ytdNet ?? 0) : '—'}</span>
            ]
          };
        })}
        footer={
          <tr>
            <td className="px-4 py-3">GROUP TOTAL</td>
            <td className="num px-4 py-3 text-right">{money(totals.revenue)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.purchases)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.gp)}</td>
            <td className="num px-4 py-3 text-right">{percent(totals.revenue ? (totals.gp / totals.revenue) * 100 : 0)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.fixed)}</td>
            <td className={`num px-4 py-3 text-right ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(totals.net)}</td>
            <td className={`num px-4 py-3 text-right ${totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{percent(totals.revenue ? (totals.net / totals.revenue) * 100 : 0)}</td>
            <td className={`num px-4 py-3 text-right ${totals.mtd >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{period ? money(totals.mtd) : '—'}</td>
            <td className={`num px-4 py-3 text-right ${totals.ytd >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{period ? money(totals.ytd) : '—'}</td>
          </tr>
        }
      />
      <PeriodTotalsCard
        title={`Month-to-Date Totals${period?.monthPrefix ? ` · ${period.monthPrefix}` : ''}`}
        subtitle={period ? `Summed from ${period.mtdDates?.length ?? 0} day${(period.mtdDates?.length ?? 0) === 1 ? '' : 's'} of saved data this month` : 'Loading aggregate from daily reports…'}
        period={mtdByUnit}
        totals={mtdTotals}
      />
      <PeriodTotalsCard
        title={`Year-to-Date Totals${period?.yearPrefix ? ` · ${period.yearPrefix}` : ''}`}
        subtitle={period ? `Summed from ${period.ytdDates?.length ?? 0} day${(period.ytdDates?.length ?? 0) === 1 ? '' : 's'} of saved data this year` : 'Loading aggregate from daily reports…'}
        period={ytdByUnit}
        totals={ytdTotals}
      />
    </>
  );
}

function PeriodTotalsCard({ title, subtitle, period, totals }) {
  return (
    <SectionCard title={title} subtitle={subtitle} icon={SECTION_ICONS.config} tone="slate" defaultOpen>
      <DataTable
        columns={['Unit', 'Revenue', 'Purchases', 'Gross Profit', 'Net Profit', 'Days']}
        numericFrom={1}
        rows={UNITS.map((unit) => {
          const entry = period?.[unit] ?? EMPTY_PERIOD_ENTRY;
          return {
            key: unit,
            cells: [
              <span className="font-semibold text-app-text">{unit}</span>,
              <span className="num font-medium text-app-text">{money(entry.revenue)}</span>,
              <span className="num font-medium text-app-text">{money(entry.purchases)}</span>,
              <span className={`num font-semibold ${entry.gp >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(entry.gp)}</span>,
              <span className={`num font-semibold ${entry.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(entry.netProfit)}</span>,
              <span className="num text-app-text">{entry.days || 0}</span>
            ]
          };
        })}
        footer={
          <tr>
            <td className="px-4 py-3">GROUP TOTAL</td>
            <td className="num px-4 py-3 text-right">{money(totals.revenue)}</td>
            <td className="num px-4 py-3 text-right">{money(totals.purchases)}</td>
            <td className={`num px-4 py-3 text-right ${totals.gp >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(totals.gp)}</td>
            <td className={`num px-4 py-3 text-right ${totals.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(totals.netProfit)}</td>
            <td className="num px-4 py-3 text-right">—</td>
          </tr>
        }
      />
    </SectionCard>
  );
}
