export const UNITS = ['CP Nagpur', 'CP NM', 'Pablo', 'Dali', 'Rabbits', "Micky's", 'Purosoul'];

export const settlementModes = [
  'Cash',
  'Credit Card',
  'UPI',
  'City Ledger/Credit',
  'Zomato/Swiggy',
  'NEFT/Bank Transfer',
  'OTA Credit (MMT/Booking.com)',
  'Complementary',
  'Discounts/Staff'
];

export function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(numberValue(value));
}

export function percent(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

export function calcFlag(actual, target, direction = 'min') {
  if (String(actual ?? '').trim() === '') return { label: 'ON TRACK', ratio: 100 };
  const actualValue = numberValue(actual);
  const targetValue = numberValue(target);
  if (!targetValue && !actualValue) return { label: 'ON TRACK', ratio: 100 };
  if (!targetValue) return { label: actualValue > 0 ? 'OUTPERFORM' : 'ON TRACK', ratio: 100 };
  const ratio = direction === 'max' ? (targetValue / Math.max(actualValue, 0.0001)) * 100 : (actualValue / targetValue) * 100;
  if (ratio >= 110) return { label: 'OUTPERFORM', ratio };
  if (ratio >= 95) return { label: 'ON TRACK', ratio };
  if (ratio >= 85) return { label: 'WATCH', ratio };
  return { label: 'ACTION NEEDED', ratio };
}

export function flattenKpis(data) {
  return [
    ...(data.hotels ?? []),
    ...Object.values(data.fnb ?? {}).flat(),
    ...(data.rabbits ?? []),
    ...(data.mickys ?? []),
    ...(data.purosoul ?? [])
  ];
}

export function withFlags(data) {
  return flattenKpis(data).map((kpi) => {
    const flag = calcFlag(kpi.actual, kpi.target, kpi.direction);
    return {
      unit: kpi.unit,
      kpiName: kpi.name,
      aopTarget: kpi.target,
      todayActual: kpi.actual,
      percentVsTarget: Math.round(flag.ratio),
      flag: flag.label
    };
  });
}

export function pnlRows(data) {
  return (data.pnl ?? []).map((row) => {
    const revenue = numberValue(row.revenueToday);
    const purchases = numberValue(row.purchasesToday);
    const fixed = numberValue(row.fixedCost);
    const gp = revenue - purchases;
    const net = gp - fixed;
    return {
      ...row,
      grossProfit: gp,
      gpPercent: revenue ? (gp / revenue) * 100 : 0,
      estNetProfit: net,
      netMargin: revenue ? (net / revenue) * 100 : 0
    };
  });
}

export function groupRevenue(data) {
  return pnlRows(data).reduce((sum, row) => sum + numberValue(row.revenueToday), 0);
}

export function settlementTotals(data) {
  const matrix = data.settlement ?? {};
  const rowTotals = Object.fromEntries(
    settlementModes.map((mode) => [mode, UNITS.reduce((sum, unit) => sum + numberValue(matrix[mode]?.[unit]), 0)])
  );
  const unitTotals = Object.fromEntries(
    UNITS.map((unit) => [unit, settlementModes.reduce((sum, mode) => sum + numberValue(matrix[mode]?.[unit]), 0)])
  );
  const groupTotal = Object.values(rowTotals).reduce((sum, value) => sum + value, 0);
  return { rowTotals, unitTotals, groupTotal };
}
