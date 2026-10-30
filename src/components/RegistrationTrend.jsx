import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { parseMemberDate } from '../utils/memberFields';

const PERIODS = {
  Daily: { count: 14, defaultTarget: 25 },
  Weekly: { count: 12, defaultTarget: 175 },
  Monthly: { count: 12, defaultTarget: 750 },
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STORAGE_KEY = 'registrationTargets';
const PLUGINS = [ChartDataLabels];

const loadTargets = () => {
  try {
    return { ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return {};
  }
};

const periodStart = (date, period) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === 'Weekly') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  if (period === 'Monthly') d.setDate(1);
  return d;
};

const shiftPeriod = (start, period, steps) => {
  const d = new Date(start);
  if (period === 'Daily') d.setDate(d.getDate() + steps);
  else if (period === 'Weekly') d.setDate(d.getDate() + steps * 7);
  else d.setMonth(d.getMonth() + steps);
  return d;
};

const labelFor = (start, period) =>
  period === 'Monthly'
    ? `${MONTHS[start.getMonth()]} ${String(start.getFullYear()).slice(2)}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]}`;

export default function RegistrationTrend({ members }) {
  const [period, setPeriod] = useState('Monthly');
  const [targets, setTargets] = useState(loadTargets);
  const target = Number(targets[period] ?? PERIODS[period].defaultTarget) || 0;

  const updateTarget = (value) => {
    const next = { ...targets, [period]: value === '' ? '' : Math.max(0, Number(value)) };
    setTargets(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const rows = useMemo(() => {
    const { count } = PERIODS[period];
    const currentStart = periodStart(new Date(), period);
    const starts = Array.from({ length: count }, (_, i) => shiftPeriod(currentStart, period, i - (count - 1)));
    const index = new Map(starts.map((s, i) => [s.getTime(), i]));
    const actuals = new Array(count).fill(0);

    for (const member of members) {
      const date = member.__registrationDate || parseMemberDate(member.registration_date);
      if (!date) continue;
      const i = index.get(periodStart(date, period).getTime());
      if (i !== undefined) actuals[i] += 1;
    }

    return starts.map((start, i) => {
      const actual = actuals[i];
      const prev = i > 0 ? actuals[i - 1] : null;
      return {
        label: labelFor(start, period),
        actual,
        variance: actual - target,
        achievement: target ? (actual / target) * 100 : null,
        change: prev === null ? null : prev === 0 ? (actual === 0 ? 0 : null) : ((actual - prev) / prev) * 100,
        current: i === count - 1,
      };
    });
  }, [members, period, target]);

  const chartData = useMemo(() => ({
    labels: rows.map((r) => r.label),
    datasets: [
      {
        label: 'Actual',
        data: rows.map((r) => r.actual),
        borderColor: '#c2d45e',
        backgroundColor: 'rgba(194, 212, 94, 0.12)',
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        // a point is solid blue when that period met the target, hollow when it fell short
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBorderColor: '#c2d45e',
        pointBorderWidth: 2,
        pointBackgroundColor: rows.map((r) => (r.actual >= target ? '#c2d45e' : '#fff')),
        order: 2,
      },
      {
        label: 'Target',
        data: rows.map(() => target),
        borderColor: '#e53935',
        backgroundColor: '#e53935',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        order: 1,
        datalabels: { display: false },
      },
    ],
  }), [rows, target]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) =>
            context.dataset.label === 'Target'
              ? `Target: ${context.raw}`
              : `Actual: ${context.raw}${target ? ` (${Math.round((context.raw / target) * 100)}% of target)` : ''}`,
        },
      },
      datalabels: {
        color: '#0f172a',
        anchor: 'end',
        align: 'top',
        offset: 4,
        font: { weight: 'bold', size: 12 },
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 }, grace: '12%' },
      x: { grid: { display: false }, ticks: { autoSkip: false } },
    },
    layout: { padding: { top: 24, right: 12 } },
  }), [target]);

  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const fmtPct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);

  const unit = period === 'Daily' ? 'day' : period === 'Weekly' ? 'week' : 'month';
  const achievedTone = current.achievement !== null && current.achievement >= 100 ? 'bo-kpi-success' : 'bo-kpi-warning';
  const changeTone = current.change === null || current.change === 0 ? 'bo-kpi-info' : current.change > 0 ? 'bo-kpi-success' : 'bo-kpi-danger';

  return (
    <section className="bo-card" aria-labelledby="h-trend">
      <div className="bo-card-head">
        <h2 id="h-trend">Registration trends — Target vs actual</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div role="group" aria-label="Period" style={{ display: 'inline-flex' }}>
            {Object.keys(PERIODS).map((p) => (
              <button key={p} type="button" className="bo-tog" aria-pressed={p === period} onClick={() => setPeriod(p)}>
                {p}
              </button>
            ))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3c4047' }}>
            Target per {unit}
            <input
              type="number"
              min="0"
              value={targets[period] ?? PERIODS[period].defaultTarget}
              onChange={(e) => updateTarget(e.target.value)}
              aria-label={`Target per ${unit}`}
              style={{ width: 72, height: 28, boxSizing: 'border-box', padding: '0 8px', border: '1px solid #d0d5dd', borderRadius: 4, font: 'inherit', fontSize: 14, textAlign: 'right' }}
            />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span className="bo-kpi"><b>{current.actual.toLocaleString()}</b>This {unit}</span>
        <span className="bo-kpi bo-kpi-info"><b>{target.toLocaleString()}</b>Target</span>
        <span className={`bo-kpi ${achievedTone}`}><b>{current.achievement === null ? '—' : `${current.achievement.toFixed(0)}%`}</b>Achieved</span>
        <span className={`bo-kpi ${changeTone}`}><b>{fmtPct(current.change)}</b>vs previous ({previous.actual.toLocaleString()})</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: '#5f6670' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: '#c2d45e', border: '2px solid #c2d45e', boxSizing: 'border-box' }} />Met target
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2px solid #c2d45e', boxSizing: 'border-box' }} />Below target
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 14, borderTop: '2px dashed #e53935' }} />Target
          </span>
        </span>
      </div>

      <div className="chart-container">
        <Line data={chartData} options={options} plugins={PLUGINS} />
      </div>
    </section>
  );
}
