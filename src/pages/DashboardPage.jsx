// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  FaUsers, FaVenusMars, FaLayerGroup, FaConciergeBell,
  FaTrophy, FaClock, FaUserPlus, FaCalendarWeek,
  FaCalendarAlt
} from 'react-icons/fa';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Pie, Doughnut, Bar, PolarArea } from 'react-chartjs-2';
import 'chart.js/auto'; // Registers all Chart.js components
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

    // Gender
    const genderCounts = filteredMembers.reduce((acc, m) => {
      const g = m.gender?.trim() || 'Unknown';
      acc[g] = (acc[g] || 0) + 1;
      return acc;
    }, {});

    // Category
    const categoryCounts = filteredMembers.reduce((acc, m) => {
      const c = m.category?.trim() || 'Unknown';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});

    // Service
    const serviceCounts = filteredMembers.reduce((acc, m) => {
      const s = m.service?.trim() || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // Rank
    const rankCounts = filteredMembers.reduce((acc, m) => {
      const r = m.rank?.trim() || 'Unknown';
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});

    // State
    const stateCounts = filteredMembers.reduce((acc, m) => {
      const s = m.state?.trim() || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // Experience average
    const expSum = filteredMembers.reduce((sum, m) => sum + (parseFloat(m.total_experience) || 0), 0);
    const avgExp = total > 0 ? (expSum / total).toFixed(1) + 'Y' : '0Y';

    // Parse registration_date (string like "17 Nov 2022" or "26 December 2025")
    const parseRegDate = (dateStr) => {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const trimmed = dateStr.trim();
      // Split into day, month, year
      const parts = trimmed.split(/\s+/);
      if (parts.length !== 3) return null;
      const [dayStr, monthStr, yearStr] = parts;
      const day = parseInt(dayStr, 10);
      const year = parseInt(yearStr, 10);
      if (isNaN(day) || isNaN(year)) return null;

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIndex = monthNames.findIndex(name => name.toLowerCase().startsWith(monthStr.toLowerCase().replace('.', '')));
      if (monthIndex === -1) return null;

      return new Date(year, monthIndex, day);
    };

    // Filter valid dates
    const parsedDates = filteredMembers
      .map(m => parseRegDate(m.registration_date))
      .filter(d => d !== null);

    const now = new Date(); // Current date: December 29, 2025
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
      rankCounts,
      stateCounts,
      avgExp,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registered3Months
    };
  }, [filteredMembers, loading, members.length]);

  const handleFilter = (selectedFilter) => setFilter(selectedFilter);

  const createChartData = (counts, title, colors = [
    '#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0',
    '#9966FF', '#FF9F40', '#C9CBCF', '#E7E9ED'
  ]) => ({
    labels: Object.keys(counts),
    datasets: [{
      label: title,
      data: Object.values(counts),
      backgroundColor: colors,
      borderWidth: 1,
      hoverOffset: 8
    }]
  });

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total ? ((value / total) * 100).toFixed(1) + '%' : '0%';
            return `${context.label}: ${value} (${percentage})`;
          }
        }
      }
    }
  };

  const barOptions = {
    ...pieOptions,
    scales: {
      y: { beginAtZero: true }
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (!analytics) {
    return <div className="loading">No data available</div>;
  }

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
            <button className={`btn ${filter === 'Civilian' ? 'active' : ''}`} onClick={() => handleFilter('Civilian')}>Civilian</button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="card">
          <div className="card-icon blue"><FaUsers size={28} /></div>
          <div className="card-label">Total Members</div>
          <div className="card-value">{analytics.total.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="card-icon red"><FaClock size={28} /></div>
          <div className="card-label">Avg Experience</div>
          <div className="card-value">{analytics.avgExp}</div>
        </div>
        <div className="card">
          <div className="card-icon new"><FaUserPlus size={28} /></div>
          <div className="card-label">Registered Today</div>
          <div className="card-value">{analytics.registeredToday}</div>
        </div>
        <div className="card">
          <div className="card-icon week"><FaCalendarWeek size={28} /></div>
          <div className="card-label">This Week</div>
          <div className="card-value">{analytics.registeredWeek}</div>
        </div>
        <div className="card">
          <div className="card-icon month"><FaCalendarAlt size={28} /></div>
          <div className="card-label">This Month</div>
          <div className="card-value">{analytics.registeredMonth}</div>
        </div>
        <div className="card">
          <div className="card-icon quarter"><FaCalendarAlt size={28} /></div>
          <div className="card-label">Last 3 Months</div>
          <div className="card-value">{analytics.registered3Months}</div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid" style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', padding: '20px' }}>
        
        <div className="chart-card">
          <h3>Gender Distribution</h3>
          <div style={{ height: '300px' }}>
            <Pie data={createChartData(analytics.genderCounts, 'Gender')} options={pieOptions} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Category Distribution</h3>
          <div style={{ height: '300px' }}>
            <Doughnut data={createChartData(analytics.categoryCounts, 'Category')} options={pieOptions} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Service Distribution</h3>
          <div style={{ height: '300px' }}>
            <Bar data={createChartData(analytics.serviceCounts, 'Service')} options={barOptions} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Rank Distribution</h3>
          <div style={{ height: '300px' }}>
            <PolarArea data={createChartData(analytics.rankCounts, 'Rank')} options={pieOptions} />
          </div>
        </div>

        <div className="chart-card">
          <h3>Registration Trends</h3>
          <div style={{ height: '300px' }}>
            <Bar
              data={createChartData(
                {
                  'Today': analytics.registeredToday,
                  'This Week': analytics.registeredWeek,
                  'This Month': analytics.registeredMonth,
                  'Last 3 Months': analytics.registered3Months
                },
                'Registrations'
              )}
              options={barOptions}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3>State Distribution (India)</h3>
          <div style={{ height: '400px' }}>
            <Chart
              chartType="GeoChart"
              data={[
                ['State', 'Members'],
                ...Object.entries(analytics.stateCounts).map(([state, count]) => [
                  state === 'Unknown' ? 'Unknown' : state,
                  count
                ])
              ]}
              options={{
                region: 'IN',
                resolution: 'provinces',
                colorAxis: { colors: ['#e0f7fa', '#006064'] },
                backgroundColor: '#ffffff',
                datalessRegionColor: '#f0f0f0',
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