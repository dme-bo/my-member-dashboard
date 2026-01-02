// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  FaUsers, FaClock, FaUserPlus, FaCalendarWeek, FaCalendarAlt
} from 'react-icons/fa';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Pie, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'react-google-charts';

export default function DashboardPage() {
  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const db = getFirestore();
        const snapshot = await getDocs(collection(db, 'usersmaster'));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMembers(data);
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const filteredMembers = useMemo(() => {
    if (filter === 'All') return members;
    return members.filter(m => m.category === filter);
  }, [members, filter]);

  const analytics = useMemo(() => {
    if (loading || !members.length) return null;

    const total = filteredMembers.length;

    // Normalize gender
    const genderCounts = filteredMembers.reduce((acc, m) => {
      const raw = m.gender?.trim()?.toLowerCase();
      if (raw === 'male' || raw === 'm') acc['Male'] = (acc['Male'] || 0) + 1;
      else if (raw === 'female' || raw === 'f') acc['Female'] = (acc['Female'] || 0) + 1;
      return acc;
    }, {});

    // Category - sorted descending
    const categoryCountsRaw = filteredMembers.reduce((acc, m) => {
      const c = m.category?.trim();
      if (c && c !== 'Unknown') acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    const categoryCounts = Object.fromEntries(
      Object.entries(categoryCountsRaw).sort(([,a], [,b]) => b - a)
    );

    // Service - sorted descending
    const serviceCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.service?.trim();
      if (s && s !== 'Unknown') acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const serviceCounts = Object.fromEntries(
      Object.entries(serviceCountsRaw).sort(([,a], [,b]) => b - a)
    );

    // Top 10 Ranks - already sorted descending
    const rankCountsRaw = filteredMembers.reduce((acc, m) => {
      const r = m.rank?.trim();
      if (r && r !== 'Unknown') acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const top10Ranks = Object.fromEntries(
      Object.entries(rankCountsRaw)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 15)
    );

    // State - sorted descending for consistency (though GeoChart doesn't use order)
    const stateCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.state?.trim();
      if (s && s !== 'Unknown') acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const stateCounts = Object.fromEntries(
      Object.entries(stateCountsRaw).sort(([,a], [,b]) => b - a)
    );

    // Average Experience
    const expSum = filteredMembers.reduce((sum, m) => sum + (parseFloat(m.total_experience) || 0), 0);
    const avgExp = total > 0 ? (expSum / total).toFixed(1) + 'Y' : '0Y';

    // Registration dates
    const parseRegDate = (dateStr) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const trimmed = dateStr.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length !== 3) return null;
      const [dayStr, monthStr, yearStr] = parts;
      const day = parseInt(dayStr, 10);
      const year = parseInt(yearStr, 10);
      if (isNaN(day) || isNaN(year)) return null;

      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const monthIndex = monthNames.findIndex(name => name.toLowerCase().startsWith(monthStr.toLowerCase().replace('.', '')));
      if (monthIndex === -1) return null;

      return new Date(year, monthIndex, day);
    };

    const parsedDates = filteredMembers
      .map(m => parseRegDate(m.registration_date))
      .filter(d => d !== null);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const registeredToday = parsedDates.filter(d => d >= todayStart).length;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const registeredWeek = parsedDates.filter(d => d >= weekStart).length;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const registeredMonth = parsedDates.filter(d => d >= monthStart).length;

    const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const registered3Months = parsedDates.filter(d => d >= threeMonthsStart).length;

    return {
      total,
      genderCounts,
      categoryCounts,
      serviceCounts,
      rankCounts: top10Ranks,
      stateCounts,
      avgExp,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registered3Months
    };
  }, [filteredMembers, loading, members.length]);

  const handleFilter = (selectedFilter) => setFilter(selectedFilter);

  const createChartData = (counts, colors = [
    '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#66BB6A', '#FFA726', '#AB47BC', '#26A69A'
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
    }]
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
          }
        }
      },
      datalabels: {
        color: '#fff',
        font: { weight: 'bold', size: 16 },
        formatter: (value, context) => {
          const total = context.dataset.data.reduce((a, b) => a + b, 0);
          const percentage = Math.round((value / total) * 100);
          return percentage >= 8 ? `${percentage}%` : '';
        }
      }
    }
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'x', // Vertical bars
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw} members`
        }
      },
      datalabels: {
        color: '#000',
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 13 },
        formatter: (value) => value > 0 ? value : ''
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 12 } },
        grid: { color: '#e0e0e0' }
      },
      x: {
        ticks: {
          font: { size: 12 },
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false
        },
        grid: { display: false }
      }
    },
    layout: {
      padding: {
        top: 30 // Extra space for data labels on top
      }
    }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!analytics) return <div className="loading">No data available</div>;

  return (
    <>
      <header className="top-header">
        <h1>Member Analytics Dashboard</h1>
        <div className="top-filters">
          <div className="button-group">
            <button className={`btn ${filter === 'All' ? 'active' : ''}`} onClick={() => handleFilter('All')}>All</button>
            <button className={`btn ${filter === 'Military' ? 'active' : ''}`} onClick={() => handleFilter('Military')}>Military</button>
            <button className={`btn ${filter === 'Paramilitary' ? 'active' : ''}`} onClick={() => handleFilter('Paramilitary')}>Paramilitary</button>
            <button className={`btn ${filter === 'BRO' ? 'active' : ''}`} onClick={() => handleFilter('BRO')}>BRO</button>
            <button className={`btn ${filter === 'Police' ? 'active' : ''}`} onClick={() => handleFilter('Police')}>Police</button>
            <button className={`btn ${filter === 'MES' ? 'active' : ''}`} onClick={() => handleFilter('MES')}>MES</button>
            <button className={`btn ${filter === 'Civilian' ? 'active' : ''}`} onClick={() => handleFilter('Civilian')}>Civilian</button>
            
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="card"><div className="card-icon blue"><FaUsers size={28}/></div><div className="card-label">Total Members</div><div className="card-value">{analytics.total.toLocaleString()}</div></div>
        <div className="card"><div className="card-icon red"><FaClock size={28}/></div><div className="card-label">Avg Experience</div><div className="card-value">{analytics.avgExp}</div></div>
        <div className="card"><div className="card-icon new"><FaUserPlus size={28}/></div><div className="card-label">Registered Today</div><div className="card-value">{analytics.registeredToday}</div></div>
        <div className="card"><div className="card-icon week"><FaCalendarWeek size={28}/></div><div className="card-label">This Week</div><div className="card-value">{analytics.registeredWeek}</div></div>
        <div className="card"><div className="card-icon month"><FaCalendarAlt size={28}/></div><div className="card-label">This Month</div><div className="card-value">{analytics.registeredMonth}</div></div>
        <div className="card"><div className="card-icon quarter"><FaCalendarAlt size={28}/></div><div className="card-label">Last 3 Months</div><div className="card-value">{analytics.registered3Months}</div></div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid" style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '30px', padding: '20px' }}>

        <div className="chart-card">
          <h3>Gender Wise Distribution</h3>
          <div style={{ height: '300px' }}>
            <Pie data={createChartData(analytics.genderCounts)} options={pieOptions} plugins={[ChartDataLabels]} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Category Wise Distribution</h3>
          <div style={{ height: '300px' }}>
            <Bar data={createChartData(analytics.categoryCounts)} options={barOptions} plugins={[ChartDataLabels]} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Service Wise Distribution</h3>
          <div style={{ height: '350px' }}>
            <Bar data={createChartData(analytics.serviceCounts)} options={barOptions} plugins={[ChartDataLabels]} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Ranks Wise Distribution</h3>
          <div style={{ height: '350px' }}>
            <Bar data={createChartData(analytics.rankCounts)} options={barOptions} plugins={[ChartDataLabels]} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Registration Trends</h3>
          <div style={{ height: '350px' }}>
            <Bar
              data={createChartData({
                'Today': analytics.registeredToday,
                'This Week': analytics.registeredWeek,
                'This Month': analytics.registeredMonth,
                'Last 3 Months': analytics.registered3Months
              })}
              options={barOptions}
              plugins={[ChartDataLabels]}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3>State Wise Distribution</h3>
          <div style={{ height: '450px' }}>
            <Chart
              chartType="GeoChart"
              data={[
                ['State', 'Members'],
                ...Object.entries(analytics.stateCounts).map(([state, count]) => [state, count])
              ]}
              options={{
                region: 'IN',
                resolution: 'provinces',
                colorAxis: { colors: ['#e3f2fd', '#1976d2'] },
                backgroundColor: '#ffffff',
                datalessRegionColor: '#f5f5f5',
                tooltip: { textStyle: { fontSize: 14 } }
              }}
              width="100%"
              height="100%"
            />
          </div>
        </div>

      </div>
    </>
  );
}