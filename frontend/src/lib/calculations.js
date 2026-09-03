export const UNITS = ['CP Nagpur', 'CP NM', 'CP Amravati', 'Pablo', 'Dali', 'Rabbit', 'CP Delivery', "Micky's", 'Purosoul'];

// Defaults may be zero, but every unit can carry an editable daily fixed cost.
export const UNITS_WITHOUT_FIXED_COST = [];

function canonicalUnit(unit) {
  return unit === 'Rabbit' + 's' ? 'Rabbit' : unit;
}

export function hasFixedCost(unit) {
  return !UNITS_WITHOUT_FIXED_COST.includes(canonicalUnit(unit));
}

export const settlementModes = [
  'Cash',
  'Credit Card',
  'UPI',
  'City Ledger/Credit',
  'Due Payment',
  'Zomato/Swiggy',
  'NEFT/Bank Transfer',
  'OTA Credit (MMT/Booking.com)',
  'Complementary',
  'Discounts/Staff'
];

export function stripToday(name) {
  return String(name ?? '').replace(/\s*\btoday\b\s*$/i, '').trim();
}

export function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function aopTargetValue() {
  return 0;
}

// Indian-style grouped number (e.g. 100700 → 1,00,700; 12345.6 → 12,345.60).
// Returns the original value unchanged if it isn't a finite number.
export function formatIndianNumber(value) {
  const text = String(value ?? '').trim();
  if (text === '') return value;
  const num = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(num)) return value;
  const hasFraction = num % 1 !== 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2
  });
}

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(numberValue(value));
}

export function moneyCompact(value) {
  const v = numberValue(value);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 1 : 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)} L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(abs >= 1e4 ? 1 : 2)} K`;
  return money(v);
}

export function percent(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 min ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function calcFlag(actual, target, direction = 'min') {
  if (String(actual ?? '').trim() === '') return { label: 'ON TRACK', ratio: 100 };
  const actualValue = numberValue(actual);
  const targetValue = numberValue(target);
  if (!targetValue && !actualValue) return { label: 'ON TRACK', ratio: 100 };
  if (!targetValue) return { label: 'ON TRACK', ratio: 100 };
  const ratio = direction === 'max' ? (targetValue / Math.max(actualValue, 0.0001)) * 100 : (actualValue / targetValue) * 100;
  return { label: ratio >= 90 ? 'ON TRACK' : 'ACTION', ratio };
}

export function flattenKpis(data) {
  return [
    ...(data.hotels ?? []),
    ...Object.values(data.fnb ?? {}).flat(),
    ...(data.rabbits ?? []),
    ...(data.cpDelivery ?? []),
    ...(data.mickys ?? []),
    ...(data.purosoul ?? [])
  ];
}

export function withFlags(data) {
  return flattenKpis(data).map((kpi) => {
    const target = aopTargetValue(kpi);
    const flag = calcFlag(kpi.actual, target, kpi.direction);
    return {
      unit: canonicalUnit(kpi.unit),
      kpiName: kpi.name,
      aopTarget: String(target),
      todayActual: kpi.actual,
      percentVsTarget: Math.round(flag.ratio),
      flag: flag.label
    };
  });
}

export function pnlRows(data) {
  return (data.pnl ?? []).map((row) => {
    const unit = canonicalUnit(row.unit);
    const revenue = numberValue(row.revenueToday);
    const purchases = numberValue(row.purchasesToday);
    const unitHasFixedCost = hasFixedCost(unit);
    const fixed = numberValue(row.fixedCost);
    // Units without a purchases/COGS figure (e.g. hotels, Micky's) don't have a
    // meaningful gross profit — their only modeled cost is the daily fixed cost.
    const tracksCogs = String(row.purchasesToday ?? '').trim() !== '';
    const gp = revenue - purchases;
    const net = gp - fixed;
    return {
      ...row,
      unit,
      tracksCogs,
      hasFixedCost: unitHasFixedCost,
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

// Units whose settlement matrix is a complete record of the day's collections, so
// settled and revenue can legitimately be expected to agree. The others still show
// their columns for reference but sit outside the balance check:
//   CP Nagpur / CP NM  — hotels accrue room revenue nightly but collect at checkout,
//                        so open folios keep a day's collections below its revenue.
//   Micky's / Purosoul — invoiced (Tally / B2B dispatch), never settled over a till.
export const SETTLEMENT_TRACKED_UNITS = ['Pablo', 'Dali', 'Rabbit', 'CP Delivery'];

export function isSettlementTracked(unit) {
  return SETTLEMENT_TRACKED_UNITS.includes(canonicalUnit(unit));
}

// The settlement matrix records collections, tax and service charge included, while
// pnl revenueToday for Pablo/Dali is Net Sales (Core Amount − Discount, pre-tax).
// Comparing those directly always shows a gap the size of the day's tax. The
// Petpooja mail's own tax-inclusive total is already saved alongside it, so the
// balance check uses that and falls back to the P&L figure when the mail is missing.
const PETPOOJA_GROSS_KEYS = ['total sales', 'grand total'];

export function settlementBasisRevenue(data, unit) {
  const booked = numberValue(pnlRows(data).find((row) => row.unit === unit)?.revenueToday);
  if (unit !== 'Pablo' && unit !== 'Dali') return booked;
  const values = data?.importSource?.[`${unit.toLowerCase()}PetpoojaValues`];
  for (const key of PETPOOJA_GROSS_KEYS) {
    const collected = numberValue(values?.[key]);
    // Tax can only add to net sales, so a figure below the booked revenue isn't the
    // same period — importSource holds one day's mail even when the P&L row has been
    // aggregated over a week. Fall back rather than report a day against a week.
    if (collected && collected >= booked) return collected;
  }
  return booked;
}

export function settlementTotals(data) {
  const matrix = data.settlement ?? {};
  const valueForUnit = (mode, unit) => {
    const row = matrix[mode] ?? {};
    if (unit !== 'Rabbit') return numberValue(row[unit]);
    return numberValue(row.Rabbit ?? row['Rabbit' + 's']);
  };
  const rowTotals = Object.fromEntries(
    settlementModes.map((mode) => [mode, UNITS.reduce((sum, unit) => sum + valueForUnit(mode, unit), 0)])
  );
  const unitTotals = Object.fromEntries(
    UNITS.map((unit) => [unit, settlementModes.reduce((sum, mode) => sum + valueForUnit(mode, unit), 0)])
  );
  const groupTotal = Object.values(rowTotals).reduce((sum, value) => sum + value, 0);

  const trackedUnits = UNITS.filter(isSettlementTracked);
  const trackedSettled = trackedUnits.reduce((sum, unit) => sum + unitTotals[unit], 0);
  const trackedRevenue = trackedUnits.reduce((sum, unit) => sum + settlementBasisRevenue(data, unit), 0);
  return { rowTotals, unitTotals, groupTotal, trackedUnits, trackedSettled, trackedRevenue };
}
