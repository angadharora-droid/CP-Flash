function toNumber(value) {
  const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function calculateFlag(actual, target, direction = 'min') {
  if (String(actual ?? '').trim() === '') return { label: 'ON TRACK', ratio: 100 };
  const actualValue = toNumber(actual);
  const targetValue = toNumber(target);
  if (!targetValue && !actualValue) return { label: 'ON TRACK', ratio: 100 };
  if (!targetValue) return { label: 'ON TRACK', ratio: 100 };

  const ratio = direction === 'max' ? (targetValue / Math.max(actualValue, 0.0001)) * 100 : (actualValue / targetValue) * 100;
  return { label: ratio >= 90 ? 'ON TRACK' : 'ACTION', ratio };
}

export function collectFlags(data) {
  const kpis = ['hotels', 'rabbits', 'cpDelivery', 'mickys', 'purosoul'].flatMap((key) => data[key] ?? []);
  const fnb = Object.values(data.fnb ?? {}).flat();
  return [...kpis, ...fnb].map((kpi) => {
    const flag = calculateFlag(kpi.actual, kpi.target, kpi.direction);
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
