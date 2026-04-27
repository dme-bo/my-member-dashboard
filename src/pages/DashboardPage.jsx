// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  FaUsers,
  FaClock,
  FaUserPlus,
  FaCalendarAlt,
} from 'react-icons/fa';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Pie, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'react-google-charts';
import {
  normalizeMemberRecord,
  getMemberOrganization,
  getMemberService,
  getMemberRank,
  getMemberState,
  getMemberCity,
  parseMemberDate,
} from '../utils/memberFields';

export default function DashboardPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [organizationFilter, setOrganizationFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [rankFilter, setRankFilter] = useState('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');

  // ────────────────────────────────────────────────
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const db = getFirestore();
        const snapshot = await getDocs(collection(db, 'users'));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...normalizeMemberRecord(doc.data()) }));
        setMembers(data);
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  // Filter options logic (unchanged) ────────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const organizations = ['All', ...new Set(members.map((m) => getMemberOrganization(m)).filter(Boolean))].sort();
    const states = ['All', ...new Set(members.map((m) => getMemberState(m)).filter(Boolean))].sort();

    return { organizations, states };
  }, [members]);

  const availableServices = useMemo(() => {
    let filtered = members;
    if (organizationFilter !== 'All') {
      filtered = filtered.filter((m) => getMemberOrganization(m) === organizationFilter);
    }
    const serviceCounts = filtered.reduce((acc, m) => {
      const s = getMemberService(m);
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const topServices = Object.keys(serviceCounts)
      .sort((a, b) => serviceCounts[b] - serviceCounts[a])
      .slice(0, 30);
    return ['All', ...topServices];
  }, [members, organizationFilter]);

  const availableRanks = useMemo(() => {
    let filtered = members;
    if (organizationFilter !== 'All') filtered = filtered.filter((m) => getMemberOrganization(m) === organizationFilter);
    if (serviceFilter !== 'All') filtered = filtered.filter((m) => getMemberService(m) === serviceFilter);

    const rankCounts = filtered.reduce((acc, m) => {
      const r = getMemberRank(m);
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const topRanks = Object.keys(rankCounts)
      .sort((a, b) => rankCounts[b] - rankCounts[a])
      .slice(0, 25);
    return ['All', ...topRanks];
  }, [members, organizationFilter, serviceFilter]);

  const availableCities = useMemo(() => {
    let filtered = members;
    if (stateFilter !== 'All') {
      filtered = filtered.filter((m) => getMemberState(m) === stateFilter);
    }
    const cityCounts = filtered.reduce((acc, m) => {
      const c = getMemberCity(m);
      if (c) acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    const topCities = Object.keys(cityCounts)
      .sort((a, b) => cityCounts[b] - cityCounts[a])
      .slice(0, 30);
    return ['All', ...topCities];
  }, [members, stateFilter]);

  useEffect(() => { setServiceFilter('All'); }, [organizationFilter]);
  useEffect(() => { setRankFilter('All'); }, [serviceFilter, organizationFilter]);
  useEffect(() => { setCityFilter('All'); }, [stateFilter]);

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      if (organizationFilter !== 'All' && getMemberOrganization(member) !== organizationFilter) return false;
      if (serviceFilter !== 'All' && getMemberService(member) !== serviceFilter) return false;
      if (rankFilter !== 'All' && getMemberRank(member) !== rankFilter) return false;
      if (stateFilter !== 'All' && getMemberState(member) !== stateFilter) return false;
      if (cityFilter !== 'All' && getMemberCity(member) !== cityFilter) return false;
      return true;
    });
  }, [members, organizationFilter, serviceFilter, rankFilter, stateFilter, cityFilter]);

  // Analytics (unchanged logic) ────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (loading || !filteredMembers.length) return null;

    const total = filteredMembers.length;

    const genderCounts = filteredMembers.reduce((acc, m) => {
      const raw = m.gender?.trim()?.toLowerCase();
      if (raw === 'male' || raw === 'm') acc['Male'] = (acc['Male'] || 0) + 1;
      else if (raw === 'female' || raw === 'f') acc['Female'] = (acc['Female'] || 0) + 1;
      return acc;
    }, {});

    const organizationCountsRaw = filteredMembers.reduce((acc, m) => {
      const c = getMemberOrganization(m);
      if (c) acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    const organizationCounts = Object.fromEntries(Object.entries(organizationCountsRaw).sort(([, a], [, b]) => b - a));

    const serviceCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.service?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const serviceCounts = Object.fromEntries(Object.entries(serviceCountsRaw).sort(([, a], [, b]) => b - a));

    const rankCountsRaw = filteredMembers.reduce((acc, m) => {
      const r = getMemberRank(m);
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const topRanks = Object.fromEntries(
      Object.entries(rankCountsRaw).sort(([, a], [, b]) => b - a).slice(0, 15)
    );

    const stateCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.state?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const stateCounts = Object.fromEntries(Object.entries(stateCountsRaw).sort(([, a], [, b]) => b - a));

    const expSum = filteredMembers.reduce((sum, m) => sum + (parseFloat(m.total_experience) || 0), 0);
    const avgExp = total > 0 ? (expSum / total).toFixed(1) + 'Y' : '0Y';

    const parsedDates = filteredMembers
      .map((m) => parseMemberDate(m.registration_date))
      .filter((d) => d !== null);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const registeredToday = parsedDates.filter((d) => d >= todayStart).length;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const registeredWeek = parsedDates.filter((d) => d >= weekStart).length;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const registeredMonth = parsedDates.filter((d) => d >= monthStart).length;

    const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const registered3Months = parsedDates.filter((d) => d >= threeMonthsStart).length;

    return {
      total,
      genderCounts,
      organizationCounts,
      serviceCounts,
      rankCounts: topRanks,
      stateCounts,
      avgExp,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registered3Months,
    };
  }, [filteredMembers, loading]);

  const clearAllFilters = () => {
    setOrganizationFilter('All');
    setServiceFilter('All');
    setRankFilter('All');
    setStateFilter('All');
    setCityFilter('All');
  };

  const createChartData = (counts, colors = [
    '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#66BB6A', '#FFA726', '#AB47BC', '#26A69A',
  ]) => ({
    labels: Object.keys(counts),
    datasets: [{
      label: 'Members',
      data: Object.values(counts),
      backgroundColor: colors.slice(0, Object.keys(counts).length),
      borderWidth: 1,
      borderColor: '#333',
      borderRadius: 4,
      maxBarThickness: 60,
    }],
  });

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { font: { size: 14 } } },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total ? ((value / total) * 100).toFixed(1) + '%' : '0%';
            return `${context.label}: ${value} (${percentage})`;
          },
        },
      },
      datalabels: {
        color: '#fff',
        font: { weight: 'bold', size: 16 },
        formatter: (value, context) => {
          const total = context.dataset.data.reduce((a, b) => a + b, 0);
          const percentage = Math.round((value / total) * 100);
          return percentage >= 8 ? `${percentage}%` : '';
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw} members`,
        },
      },
      datalabels: {
        color: '#000',
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 13 },
        formatter: (value) => (value > 0 ? value : ''),
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
      x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: false } },
    },
    layout: { padding: { top: 30 } },
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", width: "86vw",padding: "60px", textAlign: "center", fontSize: "18px", }}>
        Loading Dashboard ...
      </div>
    );
  }
  if (!analytics) return <div className="loading">No data available</div>;
  

  return (
    <>
      <style jsx>{`

      html, body, #root, .app-wrapper, main {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
        .dashboard-container {
          width: 100%;
          min-height: 100vh;
          padding: 16px 20px;
          box-sizing: border-box;
        }

        .top-header {
          margin-bottom: 24px;
        }

        .filter-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          min-width: 160px;
          flex: 1 1 160px;
        }

        .filter-group label {
          font-weight: 600;
          margin-bottom: 6px;
          font-size: 0.95rem;
          color: var(--text-color);
        }

        .filter-group select {
          padding: 10px 12px;
          border-radius: 6px;
          border: 1px solid #ccc;
          font-size: 1rem;
          background: var(--input-bg);
          color: var(--text-color);
        }

        .clear-btn {
          padding: 10px 24px;
          background-color: #dc3545;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          height: 38px;
          transition: background-color 0.2s;
        }

        .clear-btn:hover {
          background-color: #c82333;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .stat-card {
          background: var(--card-bg);
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transition: transform 0.15s;
        }

        .stat-card:hover {
          transform: translateY(-3px);
        }

        .card-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          color: white;
          font-size: 1.4rem;
        }

        .card-icon.blue { background: #0d6efd; }
        .card-icon.red { background: #dc3545; }
        .card-icon.new { background: #198754; }
        .card-icon.quarter { background: #fd7e14; }

        .card-label {
          font-size: 1rem;
          color: #777;
          margin-bottom: 8px;
        }

        .card-value {
          font-size: 1.9rem;
          font-weight: 700;
          color: var(--text-color);
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 28px;
        }

        .chart-card {
          background: var(--card-bg);
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
        }

        .chart-card h3 {
          margin: 0 0 20px 0;
          font-size: 1.3rem;
          text-align: center;
          color: var(--text-color);
        }

        .chart-container {
          position: relative;
          width: 100%;
          height: 360px;
        }

        .chart-container.geo {
          height: 480px;
        }

        .loading {
        height: 100vh;
        width: 100vw;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f9fafb;
        }

        /* ────────────────────────────────────────────────
           Responsive
        ──────────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .charts-grid {
            grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
          }
        }

        @media (max-width: 768px) {
          .filter-controls {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-group {
            min-width: unset;
            width: 100%;
          }

          .clear-btn {
            width: 100%;
            height: auto;
            padding: 12px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .charts-grid {
            grid-template-columns: 1fr;
          }

          .chart-container {
            height: 340px;
          }

          .chart-container.geo {
            height: 420px;
          }
        }

        @media (max-width: 480px) {
          .dashboard-container {
            padding: 12px 16px;
          }

          .chart-container {
            height: 300px;
          }

          .chart-container.geo {
            height: 360px;
          }
        }

        
      `}</style>

      <div className="dashboard-container">
        <header className="top-header">
          <div className="filter-controls">
            <div className="filter-group">
              <label>Category</label>
              <select value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)}>
                {filterOptions.organizations.map((organization) => (
                  <option key={organization} value={organization}>
                    {organization}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Service</label>
              <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                {availableServices.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Rank</label>
              <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}>
                {availableRanks.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>State</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                {filterOptions.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>City</label>
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                {availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <button className="clear-btn" onClick={clearAllFilters}>
              Clear All
            </button>
          </div>
        </header>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="card-icon blue">
              <FaUsers size={28} />
            </div>
            <div className="card-label">Total Members</div>
            <div className="card-value">{analytics.total.toLocaleString()}</div>
          </div>

          <div className="stat-card">
            <div className="card-icon red">
              <FaClock size={28} />
            </div>
            <div className="card-label">Avg Experience</div>
            <div className="card-value">{analytics.avgExp}</div>
          </div>

          <div className="stat-card">
            <div className="card-icon new">
              <FaUserPlus size={28} />
            </div>
            <div className="card-label">Registered Today</div>
            <div className="card-value">{analytics.registeredToday}</div>
          </div>

          <div className="stat-card">
            <div className="card-icon quarter">
              <FaCalendarAlt size={28} />
            </div>
            <div className="card-label">Last 3 Months</div>
            <div className="card-value">{analytics.registered3Months}</div>
          </div>
        </div>

        <div className="charts-grid">
          <div className="chart-card">
            <h3>Gender Wise Distribution</h3>
            <div className="chart-container">
              <Pie data={createChartData(analytics.genderCounts)} options={pieOptions} plugins={[ChartDataLabels]} />
            </div>
          </div>

            <div className="chart-card">
              <h3>Category Wise Distribution</h3>
              <div className="chart-container">
                <Bar data={createChartData(analytics.organizationCounts)} options={barOptions} plugins={[ChartDataLabels]} />
              </div>
            </div>

          <div className="chart-card">
            <h3>Service Wise Distribution</h3>
            <div className="chart-container">
              <Bar data={createChartData(analytics.serviceCounts)} options={barOptions} plugins={[ChartDataLabels]} />
            </div>
          </div>

          <div className="chart-card">
            <h3>Ranks Wise Distribution</h3>
            <div className="chart-container">
              <Bar data={createChartData(analytics.rankCounts)} options={barOptions} plugins={[ChartDataLabels]} />
            </div>
          </div>

          <div className="chart-card">
            <h3>Registration Trends</h3>
            <div className="chart-container">
              <Bar
                data={createChartData({
                  Today: analytics.registeredToday,
                  'Last 7 Days': analytics.registeredWeek,
                  'This Month': analytics.registeredMonth,
                  'Last 3 Months': analytics.registered3Months,
                })}
                options={barOptions}
                plugins={[ChartDataLabels]}
              />
            </div>
          </div>

          <div className="chart-card">
            <h3>State Wise Distribution (India)</h3>
            <div className="chart-container geo">
              <Chart
                chartType="GeoChart"
                data={[['State', 'Members'], ...Object.entries(analytics.stateCounts).map(([state, count]) => [state, count])]}
                options={{
                  region: 'IN',
                  resolution: 'provinces',
                  colorAxis: { colors: ['#e3f2fd', '#1976d2'] },
                  backgroundColor: 'transparent',
                  datalessRegionColor: '#f0f4f8',
                  keepAspectRatio: false,
                }}
                width="100%"
                height="100%"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

