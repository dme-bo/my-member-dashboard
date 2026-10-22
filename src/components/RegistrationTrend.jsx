import { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { parseMemberDate } from '../utils/memberFields';

const PERIODS = {
  Daily: { count: 14, defaultTarget: 5 },
  Weekly: { count: 12, defaultTarget: 25 },
  Monthly: { count: 12, defaultTarget: 100 },
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
      // Two stacked series (one value each) so the legend explains the colours.
      {
        type: 'bar',
        label: 'Met target',
        data: rows.map((r) => (r.actual >= target ? r.actual : null)),
        backgroundColor: '#1976d2',
        borderRadius: 4,
        maxBarThickness: 44,
        order: 2,
      },
      {
        type: 'bar',
        label: 'Below target',
        data: rows.map((r) => (r.actual < target ? r.actual : null)),
        backgroundColor: '#90caf9',
        borderRadius: 4,
        maxBarThickness: 44,
        order: 2,
      },
      {
        type: 'line',
        label: 'Target',
        data: rows.map(() => target),
        backgroundColor: '#e53935',
        borderColor: '#e53935',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        order: 1,
        datalabels: { display: false },
      },
    ],
  }), [rows, target]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
      datalabels: {
        color: '#000',
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 12 },
        formatter: (v) => (v > 0 ? v : ''),
      },
    },
    scales: {
      y: { beginAtZero: true, stacked: true, ticks: { precision: 0 }, grace: '8%' },
      x: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } },
    },
    layout: { padding: { top: 24 } },
  }), []);

  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const fmtPct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
  const tone = (v) => (v === null || v === 0 ? '#64748b' : v > 0 ? '#15803d' : '#b91c1c');

  return (
    <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
      <h3>Registration Trends — Target vs Actual</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0, border: '1px solid #bcd6f2', borderRadius: 6, overflow: 'hidden' }}>
          {Object.keys(PERIODS).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{ padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: p === period ? '#1976d2' : '#fff', color: p === period ? '#fff' : '#1976d2' }}
            >
              {p}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
          Target per {period === 'Daily' ? 'day' : period === 'Weekly' ? 'week' : 'month'}
          <input
            type="number"
            min="0"
            value={targets[period] ?? PERIODS[period].defaultTarget}
            onChange={(e) => updateTarget(e.target.value)}
            style={{ width: 80, height: 30, padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#475569' }}>
          <span>This {period === 'Daily' ? 'day' : period === 'Weekly' ? 'week' : 'month'}: <strong style={{ color: '#0f172a' }}>{current.actual}</strong> of {target} ({current.achievement === null ? '—' : `${current.achievement.toFixed(0)}%`})</span>
          <span>vs previous: <strong style={{ color: tone(current.change) }}>{fmtPct(current.change)}</strong> ({previous.actual})</span>
        </div>
      </div>

      <div className="chart-container">
        <Bar data={chartData} options={options} plugins={PLUGINS} />
      </div>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1976d2', color: '#fff' }}>
              {['Period', 'Actual', 'Target', 'Variance', 'Achievement', 'vs Previous'].map((h, i) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.label} style={{ borderBottom: '1px solid #edf0f3', background: r.current ? '#e3f2fd' : undefined }}>
                <td style={{ padding: '7px 10px' }}>{r.label}{r.current ? ' (current)' : ''}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{r.actual}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{target}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: tone(r.variance) }}>{r.variance > 0 ? '+' : ''}{r.variance}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.achievement === null ? '—' : `${r.achievement.toFixed(0)}%`}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', color: tone(r.change) }}>{fmtPct(r.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
