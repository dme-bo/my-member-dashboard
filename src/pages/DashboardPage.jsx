// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  FaUsers, FaClock, FaUserPlus, FaCalendarAlt
} from 'react-icons/fa';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Pie, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'react-google-charts';

export default function DashboardPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters - Cascading: Category → Service → Rank → State → City
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [rankFilter, setRankFilter] = useState('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');

  // Parse registration date - placed early to avoid hoisting issues
  const parseRegDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
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
    const monthIndex = monthNames.findIndex(name =>
      name.toLowerCase().startsWith(monthStr.toLowerCase().replace('.', ''))
    );
    if (monthIndex === -1) return null;

    return new Date(year, monthIndex, day);
  };

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

  // Static: Categories & States (top 25)
  const filterOptions = useMemo(() => {
    const categories = ['All', ...new Set(members.map(m => m.category?.trim()).filter(Boolean))].sort();

    const stateCounts = members.reduce((acc, m) => {
      const s = m.state?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const topStates = Object.keys(stateCounts)
      .sort((a, b) => stateCounts[b] - stateCounts[a])
      .slice(0, 25);
    const states = ['All', ...topStates];

    return { categories, states };
  }, [members]);

  // Dynamic: Services based on selected Category
  const availableServices = useMemo(() => {
    let filtered = members;
    if (categoryFilter !== 'All') {
      filtered = members.filter(m => m.category?.trim() === categoryFilter);
    }

    const serviceCounts = filtered.reduce((acc, m) => {
      const s = m.service?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const topServices = Object.keys(serviceCounts)
      .sort((a, b) => serviceCounts[b] - serviceCounts[a])
      .slice(0, 30);

    return ['All', ...topServices];
  }, [members, categoryFilter]);

  // Dynamic: Ranks based on selected Service (and Category)
  const availableRanks = useMemo(() => {
    let filtered = members;

    if (categoryFilter !== 'All') {
      filtered = filtered.filter(m => m.category?.trim() === categoryFilter);
    }
    if (serviceFilter !== 'All') {
      filtered = filtered.filter(m => m.service?.trim() === serviceFilter);
    }

    const rankCounts = filtered.reduce((acc, m) => {
      const r = m.rank?.trim();
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});

    const topRanks = Object.keys(rankCounts)
      .sort((a, b) => rankCounts[b] - rankCounts[a])
      .slice(0, 25);

    return ['All', ...topRanks];
  }, [members, categoryFilter, serviceFilter]);

  // Dynamic: Cities based on selected State
  const availableCities = useMemo(() => {
    let filtered = members;
    if (stateFilter !== 'All') {
      filtered = members.filter(m => m.state?.trim() === stateFilter);
    }

    const cityCounts = filtered.reduce((acc, m) => {
      const c = m.city?.trim();
      if (c) acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});

    const topCities = Object.keys(cityCounts)
      .sort((a, b) => cityCounts[b] - cityCounts[a])
      .slice(0, 30);

    return ['All', ...topCities];
  }, [members, stateFilter]);

  // Reset dependent filters when parent changes
  useEffect(() => {
    setServiceFilter('All');
  }, [categoryFilter]);

  useEffect(() => {
    setRankFilter('All');
  }, [serviceFilter, categoryFilter]);

  useEffect(() => {
    setCityFilter('All');
  }, [stateFilter]);

  // Apply all filters
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      if (categoryFilter !== 'All' && member.category?.trim() !== categoryFilter) return false;
      if (serviceFilter !== 'All' && member.service?.trim() !== serviceFilter) return false;
      if (rankFilter !== 'All' && member.rank?.trim() !== rankFilter) return false;
      if (stateFilter !== 'All' && member.state?.trim() !== stateFilter) return false;
      if (cityFilter !== 'All' && member.city?.trim() !== cityFilter) return false;
      return true;
    });
  }, [members, categoryFilter, serviceFilter, rankFilter, stateFilter, cityFilter]);

  // Analytics
  const analytics = useMemo(() => {
    if (loading || !filteredMembers.length) return null;

    const total = filteredMembers.length;

    const genderCounts = filteredMembers.reduce((acc, m) => {
      const raw = m.gender?.trim()?.toLowerCase();
      if (raw === 'male' || raw === 'm') acc['Male'] = (acc['Male'] || 0) + 1;
      else if (raw === 'female' || raw === 'f') acc['Female'] = (acc['Female'] || 0) + 1;
      return acc;
    }, {});

    const categoryCountsRaw = filteredMembers.reduce((acc, m) => {
      const c = m.category?.trim();
      if (c) acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    const categoryCounts = Object.fromEntries(Object.entries(categoryCountsRaw).sort(([,a], [,b]) => b - a));

    const serviceCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.service?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const serviceCounts = Object.fromEntries(Object.entries(serviceCountsRaw).sort(([,a], [,b]) => b - a));

    const rankCountsRaw = filteredMembers.reduce((acc, m) => {
      const r = m.rank?.trim();
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    const topRanks = Object.fromEntries(
      Object.entries(rankCountsRaw).sort(([,a], [,b]) => b - a).slice(0, 15)
    );

    const stateCountsRaw = filteredMembers.reduce((acc, m) => {
      const s = m.state?.trim();
      if (s) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const stateCounts = Object.fromEntries(Object.entries(stateCountsRaw).sort(([,a], [,b]) => b - a));

    const expSum = filteredMembers.reduce((sum, m) => sum + (parseFloat(m.total_experience) || 0), 0);
    const avgExp = total > 0 ? (expSum / total).toFixed(1) + 'Y' : '0Y';

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
      rankCounts: topRanks,
      stateCounts,
      avgExp,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registered3Months
    };
  }, [filteredMembers, loading]);

  const clearAllFilters = () => {
    setCategoryFilter('All');
    setServiceFilter('All');
    setRankFilter('All');
    setStateFilter('All');
    setCityFilter('All');
  };

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
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
      x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: false } }
    },
    layout: { padding: { top: 30 } }
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!analytics) return <div className="loading">No data available</div>;

  return (
    <>
      <header className="top-header">
        <h1>Member Analytics Dashboard</h1>

        <div className="top-filters" style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
          <div>
            <label><strong>Category:</strong></label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ marginLeft: '8px', padding: '8px', backgroundColor: 'white', color: 'black' }}>
              {filterOptions.categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label><strong>Service:</strong></label>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} style={{ marginLeft: '8px', padding: '8px', backgroundColor: 'white', color: 'black' }}>
              {availableServices.map(srv => (
                <option key={srv} value={srv}>{srv}</option>
              ))}
            </select>
          </div>

          <div>
            <label><strong>Rank:</strong></label>
            <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)} style={{ marginLeft: '8px', padding: '8px', backgroundColor: 'white', color: 'black' }}>
              {availableRanks.map(rank => (
                <option key={rank} value={rank}>{rank}</option>
              ))}
            </select>
          </div>

          <div>
            <label><strong>State:</strong></label>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={{ marginLeft: '8px', padding: '8px', backgroundColor: 'white', color: 'black' }}>
              {filterOptions.states.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>

          <div>
            <label><strong>City:</strong></label>
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={{ marginLeft: '8px', padding: '8px', backgroundColor: 'white', color: 'black' }}>
              {availableCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <button
            onClick={clearAllFilters}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              alignSelf: 'center'
            }}
          >
            Clear All Filters
          </button>
        </div>
      </header>

      {/* Summary Cards & Charts remain the same */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginTop: '30px' }}>
        <div className="card"><div className="card-icon blue"><FaUsers size={28}/></div><div className="card-label">Total Members</div><div className="card-value">{analytics.total.toLocaleString()}</div></div>
        <div className="card"><div className="card-icon red"><FaClock size={28}/></div><div className="card-label">Avg Experience</div><div className="card-value">{analytics.avgExp}</div></div>
        <div className="card"><div className="card-icon new"><FaUserPlus size={28}/></div><div className="card-label">Registered Today</div><div className="card-value">{analytics.registeredToday}</div></div>
        <div className="card"><div className="card-icon quarter"><FaCalendarAlt size={28}/></div><div className="card-label">Last 3 Months</div><div className="card-value">{analytics.registered3Months}</div></div>
      </div>

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
                'Last 7 Days': analytics.registeredWeek,
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