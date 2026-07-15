// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FaUsers,
  FaClock,
  FaUserPlus,
  FaCalendarAlt,
} from 'react-icons/fa';
import { Pie, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'react-google-charts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import DualRangeSlider from '../components/DualRangeSlider';
import { parseMemberDate } from '../utils/memberFields';

const PIE_CHART_OPTIONS = {
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

const BAR_CHART_OPTIONS = {
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

const CHART_DATALABELS_PLUGINS = [ChartDataLabels];

export default function DashboardPage({ memberRecords = [], membersLoading = false }) {
  const [members, setMembers] = useState(memberRecords);
  const [loading, setLoading] = useState(membersLoading);

  const [organizationFilter, setOrganizationFilter] = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [rankFilter, setRankFilter] = useState('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [retirementFilter, setRetirementFilter] = useState('All');
  const [ageRange, setAgeRange] = useState([0, 100]);
  const [registrationDateFrom, setRegistrationDateFrom] = useState('');
  const [registrationDateTo, setRegistrationDateTo] = useState('');

  const toDatePickerValue = (value) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const toDateInputValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ────────────────────────────────────────────────
  useEffect(() => {
    if (Array.isArray(memberRecords)) {
      setMembers(memberRecords);
    }
  }, [memberRecords]);

  useEffect(() => {
    setLoading(membersLoading);
  }, [membersLoading]);

  // Filter options logic (unchanged) ────────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const organizations = ['All', ...new Set(members.map((m) => m.organization).filter(Boolean))].sort();
    const states = ['All', ...new Set(members.map((m) => m.state).filter(Boolean))].sort();

    return { organizations, states };
  }, [members]);

  const availableServices = useMemo(() => {
    let filtered = members;
    if (organizationFilter !== 'All') {
      filtered = filtered.filter((m) => m.organization === organizationFilter);
    }
    const serviceCounts = filtered.reduce((acc, m) => {
      const s = m.service;
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
    if (organizationFilter !== 'All') filtered = filtered.filter((m) => m.organization === organizationFilter);
    if (serviceFilter !== 'All') filtered = filtered.filter((m) => m.service === serviceFilter);

    const rankCounts = filtered.reduce((acc, m) => {
      const r = m.rank;
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
      filtered = filtered.filter((m) => m.state === stateFilter);
    }
    const cities = [...new Set(filtered.map((m) => m.city).filter(Boolean))].sort();
    return ['All', ...cities];
  }, [members, stateFilter]);

  const ageBounds = useMemo(() => {
    const ages = members.map((member) => member.age_years).filter((age) => Number.isFinite(age));
    if (ages.length === 0) return { min: 0, max: 100 };
    const min = Math.max(0, Math.floor(Math.min(...ages)));
    const max = Math.max(min, Math.ceil(Math.max(...ages)));
    return { min, max };
  }, [members]);

  useEffect(() => { setServiceFilter('All'); }, [organizationFilter]);
  useEffect(() => { setRankFilter('All'); }, [serviceFilter, organizationFilter]);
  useEffect(() => { setCityFilter('All'); }, [stateFilter]);
  useEffect(() => { setAgeRange([ageBounds.min, ageBounds.max]); }, [ageBounds.min, ageBounds.max]);

  const parseDateBoundary = (value, endOfDay = false) => {
    if (!value) return null;
    const boundary = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
    return Number.isNaN(boundary.getTime()) ? null : boundary;
  };

  // Pass 1: filter by everything EXCEPT date range (used by registration analytics)
  const filteredMembersNoDateRange = useMemo(() => {
    return members.filter((member) => {
      if (organizationFilter !== 'All' && member.organization !== organizationFilter) return false;
      if (serviceFilter !== 'All' && member.service !== serviceFilter) return false;
      if (rankFilter !== 'All' && member.rank !== rankFilter) return false;
      if (stateFilter !== 'All' && member.state !== stateFilter) return false;
      if (cityFilter !== 'All' && member.city !== cityFilter) return false;
      if (retirementFilter !== 'All' && member.retirement_status !== retirementFilter) return false;
      const age = member.age_years;
      const ageFilterActive = ageRange[0] > ageBounds.min || ageRange[1] < ageBounds.max;
      if (ageFilterActive) {
        if (!Number.isFinite(age)) return false;
        if (age < ageRange[0] || age > ageRange[1]) return false;
      }
      return true;
    });
  }, [
    members, organizationFilter, serviceFilter, rankFilter,
    stateFilter, cityFilter, retirementFilter, ageRange, ageBounds.min, ageBounds.max,
  ]);

  // Pass 2: apply date range on top of already-filtered set — avoids rescanning all 15k on date change
  const filteredMembers = useMemo(() => {
    const fromBoundary = parseDateBoundary(registrationDateFrom, false);
    const toBoundary = parseDateBoundary(registrationDateTo, true);
    if (!fromBoundary && !toBoundary) return filteredMembersNoDateRange;
    return filteredMembersNoDateRange.filter((member) => {
      const registrationDate = member.__registrationDate || parseMemberDate(member.registration_date);
      if (!registrationDate) return false;
      if (fromBoundary && registrationDate < fromBoundary) return false;
      if (toBoundary && registrationDate > toBoundary) return false;
      return true;
    });
  }, [filteredMembersNoDateRange, registrationDateFrom, registrationDateTo]);


  // Analytics (unchanged logic) ────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (loading || !filteredMembers.length) return null;

    const total = filteredMembers.length;
    const genderCounts = {};
    const organizationCounts = {};
    const serviceCounts = {};
    const rankCounts = {};
    const stateCounts = {};
    let expSum = 0;

    for (const member of filteredMembers) {
      const rawGender = member.gender?.trim()?.toLowerCase();
      if (rawGender === 'male' || rawGender === 'm') genderCounts.Male = (genderCounts.Male || 0) + 1;
      else if (rawGender === 'female' || rawGender === 'f') genderCounts.Female = (genderCounts.Female || 0) + 1;

      if (member.organization) organizationCounts[member.organization] = (organizationCounts[member.organization] || 0) + 1;
      if (member.service) serviceCounts[member.service.trim()] = (serviceCounts[member.service.trim()] || 0) + 1;
      if (member.rank) rankCounts[member.rank] = (rankCounts[member.rank] || 0) + 1;
      if (member.state) stateCounts[member.state.trim()] = (stateCounts[member.state.trim()] || 0) + 1;

      expSum += member.experience_years || parseFloat(member.total_experience) || 0;

    }

    const sortCountsDesc = (counts, limit = null) => {
      const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
      return Object.fromEntries(limit ? entries.slice(0, limit) : entries);
    };

    const avgExp = total > 0 ? (expSum / total).toFixed(1) + 'Y' : '0Y';
    return {
      total,
      genderCounts,
      organizationCounts: sortCountsDesc(organizationCounts),
      serviceCounts: sortCountsDesc(serviceCounts),
      rankCounts: sortCountsDesc(rankCounts, 15),
      stateCounts: sortCountsDesc(stateCounts),
      avgExp,
    };
  }, [filteredMembers, loading]);

  const registrationAnalytics = useMemo(() => {
    if (loading || !filteredMembersNoDateRange.length) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    let registeredToday = 0;
    let registeredWeek = 0;
    let registeredMonth = 0;
    let registered3Months = 0;

    for (const member of filteredMembersNoDateRange) {
      const parsedDate = member.__registrationDate || parseMemberDate(member.registration_date);
      if (!parsedDate) continue;
      if (parsedDate >= todayStart) registeredToday += 1;
      if (parsedDate >= weekStart) registeredWeek += 1;
      if (parsedDate >= monthStart) registeredMonth += 1;
      if (parsedDate >= threeMonthsStart) registered3Months += 1;
    }

    return {
      registeredToday,
      registeredWeek,
      registeredMonth,
      registered3Months,
    };
  }, [filteredMembersNoDateRange, loading]);

  const hasData = Boolean(analytics);

  const clearAllFilters = () => {
    setOrganizationFilter('All');
    setServiceFilter('All');
    setRankFilter('All');
    setStateFilter('All');
    setCityFilter('All');
    setRetirementFilter('All');
    setAgeRange([ageBounds.min, ageBounds.max]);
    setRegistrationDateFrom('');
    setRegistrationDateTo('');
  };

  const createChartData = (counts, colors = [
    '#1976d2', '#43a047', '#e53935', '#fb8c00', '#7e57c2',
    '#00897b', '#0288d1', '#f4511e', '#3949ab', '#546e7a',
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

  const genderChartData = useMemo(() => (analytics ? createChartData(analytics.genderCounts) : null), [analytics]);
  const organizationChartData = useMemo(() => (analytics ? createChartData(analytics.organizationCounts) : null), [analytics]);
  const serviceChartData = useMemo(() => (analytics ? createChartData(analytics.serviceCounts) : null), [analytics]);
  const rankChartData = useMemo(() => (analytics ? createChartData(analytics.rankCounts) : null), [analytics]);
  const registrationChartData = useMemo(
    () =>
      createChartData({
        Today: registrationAnalytics?.registeredToday ?? 0,
        'Last 7 Days': registrationAnalytics?.registeredWeek ?? 0,
        'This Month': registrationAnalytics?.registeredMonth ?? 0,
        'Last 3 Months': registrationAnalytics?.registered3Months ?? 0,
      }),
    [registrationAnalytics]
  );

  const pieOptions = PIE_CHART_OPTIONS;
  const barOptions = BAR_CHART_OPTIONS;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", padding: "20px", boxSizing: "border-box" }}>
        <div style={{
          width: "100%",
          flex: "1 1 auto",
          minHeight: "calc(100vh - 124px)",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
          borderRadius: "24px",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
          border: "1px solid rgba(148, 163, 184, 0.18)",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "stretch",
          gap: "16px",
          boxSizing: "border-box",
        }}>
          <div style={{
            height: "70px",
            borderRadius: "18px",
            background: "linear-gradient(90deg, #e2e8f0 0%, #f8fafc 50%, #e2e8f0 100%)",
          }} />
          <div style={{ color: "#475569", fontWeight: 600, fontSize: "18px", textAlign: "center" }}>Loading Dashboard ...</div>
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} style={{ height: "128px", borderRadius: "18px", background: "#eef2f7" }} />
            ))}
          </div>
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} style={{ minHeight: "260px", borderRadius: "18px", background: "#eef2f7" }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .dashboard-container {
          width: 100%;
          min-height: 100vh;
          padding: 20px;
          box-sizing: border-box;
        }

        .top-header {
          margin-bottom: 22px;
          background: #ffffff;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid #f1f5f9;
        }

        .top-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: nowrap;
          width: 100%;
        }

        .filter-heading {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1 1 auto;
          min-width: 0;
        }

        .filter-controls {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 16px;
          align-items: end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 6px;
          padding: 0;
        }

        .filter-span-2 {
          grid-column: span 2;
        }

        .filter-span-6 {
          grid-column: span 6;
        }

        .filter-group label {
          font-weight: 700;
          font-size: 0.82rem;
          color: #334155;
          letter-spacing: 0.02em;
        }

        .filter-group select {
          width: 100%;
          min-height: 46px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid #cbd5e1;
          font-size: 0.95rem;
          background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          color: #0f172a;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .filter-group select:hover {
          border-color: #94a3b8;
        }

        .filter-group select:focus {
          border-color: #1976d2;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.12);
        }

        .filter-group select option {
          color: #0f172a;
        }

        .date-range-row input[type="date"],
        .date-range-row select,
        .date-picker-input {
          width: 100%;
          min-height: 46px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid #cbd5e1;
          font-size: 0.95rem;
          background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          color: #0f172a;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .date-range-row input[type="date"]:hover,
        .date-range-row select:hover,
        .date-picker-input:hover {
          border-color: #94a3b8;
        }

        .date-range-row input[type="date"]:focus,
        .date-range-row select:focus,
        .date-picker-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
        }

        .date-picker-wrapper {
          width: 100%;
        }

        .date-picker-input {
          font-family: inherit;
          font-size: 0.95rem;
          color: #0f172a;
        }

        .date-picker-calendar {
          border-radius: 16px;
          border: 1px solid #dbe7f3;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }

        .date-range-group {
          grid-column: span 6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .date-range-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .date-range-row .filter-group {
          gap: 6px;
        }

        .date-range-note {
          font-size: 12px;
          color: #64748b;
          line-height: 1.45;
        }

        .filter-actions {
          display: flex;
          align-items: end;
          justify-content: flex-end;
          grid-column: 1 / -1;
          padding-top: 4px;
        }

        .range-filter-card {
          grid-column: span 6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 22px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
        }

        .clear-btn {
          min-height: 40px;
          padding: 0 18px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease;
          margin-left: auto;
        }

        .clear-btn:hover {
          background: #1565c0;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }

        .stat-card {
          background: #ffffff;
          border-radius: 10px;
          padding: 22px 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.09), 0 8px 20px rgba(0,0,0,0.07);
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

        .card-icon.blue { background: #1976d2; }
        .card-icon.red { background: #475569; }
        .card-icon.new { background: #43a047; }
        .card-icon.quarter { background: #fb8c00; }

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
          background: #ffffff;
          border-radius: 10px;
          padding: 20px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid #f1f5f9;
        }

        .chart-card h3 {
          margin: 0 0 18px 0;
          font-size: 1rem;
          font-weight: 700;
          text-align: center;
          color: #1a2332;
          padding-bottom: 12px;
          border-bottom: 2px solid #e3f2fd;
        }

        .chart-container {
          position: relative;
          width: 100%;
          height: 360px;
        }

        .chart-container.geo {
          height: 480px;
        }

        .empty-dashboard-state {
          min-height: 420px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 0 8px;
        }

        .empty-dashboard-card {
          width: min(100%, 720px);
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 24px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
          padding: 32px 28px;
          text-align: center;
        }

        .empty-dashboard-card h2 {
          margin: 0 0 10px 0;
          font-size: 1.5rem;
          color: #0f172a;
        }

        .empty-dashboard-card p {
          margin: 0;
          color: #64748b;
          font-size: 0.98rem;
          line-height: 1.6;
        }

        .loading {
        height: 100vh;
        width: 100%;
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

          .filter-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .filter-span-2,
          .date-range-group,
          .range-filter-card {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 768px) {
          .dashboard-container {
            padding: 16px;
          }

          .top-header {
            padding: 16px;
            border-radius: 20px;
          }

          .filter-controls {
            grid-template-columns: 1fr;
          }

          .top-header-inner {
            flex-wrap: wrap;
          }

          .clear-btn {
            width: 100%;
            margin-left: 0;
          }

          .date-range-row {
            grid-template-columns: 1fr;
          }

          .range-filter-card {
            min-width: 0;
          }

          .clear-btn {
            width: 100%;
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

          .top-header {
            padding: 16px;
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
          <div className="top-header-inner">
            <div className="filter-heading">
              <h1 style={{ margin: 0, fontSize: "30px", color: "#0f172a", fontWeight: 800 }}>Filters</h1>
            </div>
            <button className="clear-btn" onClick={clearAllFilters}>
              Clear All
            </button>
          </div>
          <div className="filter-controls">
            <div className="filter-group filter-span-2">
              <label>Category</label>
              <select value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)}>
                {filterOptions.organizations.map((organization) => (
                  <option key={organization} value={organization}>
                    {organization}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-span-2">
              <label>Service</label>
              <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                {availableServices.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-span-2">
              <label>Rank</label>
              <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}>
                {availableRanks.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-span-2">
              <label>State</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                {filterOptions.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-span-2">
              <label>City</label>
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                {availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group filter-span-2">
              <label>Retirement Status</label>
              <select value={retirementFilter} onChange={(e) => setRetirementFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="Retired">Retired</option>
                <option value="Not Retired">Not Retired</option>
              </select>
            </div>

            <div className="date-range-group">
              <div className="date-range-title">
                <strong>Date Range</strong>
              </div>
              <div className="date-range-row">
                <div className="filter-group">
                  <label>From Date</label>
                  <DatePicker
                    selected={toDatePickerValue(registrationDateFrom)}
                    onChange={(date) => setRegistrationDateFrom(toDateInputValue(date))}
                    dateFormat="dd MMM yyyy"
                    placeholderText="Select date"
                    className="date-picker-input"
                    wrapperClassName="date-picker-wrapper"
                    calendarClassName="date-picker-calendar"
                    showPopperArrow={false}
                  />
                </div>

                <div className="filter-group">
                  <label>To Date</label>
                  <DatePicker
                    selected={toDatePickerValue(registrationDateTo)}
                    onChange={(date) => setRegistrationDateTo(toDateInputValue(date))}
                    dateFormat="dd MMM yyyy"
                    placeholderText="Select date"
                    className="date-picker-input"
                    wrapperClassName="date-picker-wrapper"
                    calendarClassName="date-picker-calendar"
                    showPopperArrow={false}
                  />
                </div>
              </div>
              <div className="date-range-note">
              </div>
            </div>

            <DualRangeSlider
              className="range-filter-card"
              label="Age Range"
              helperText="Drag both handles to narrow the visible age range."
              min={ageBounds.min}
              max={ageBounds.max}
              value={ageRange}
              onChange={setAgeRange}
              suffix=" yrs"
            />
          </div>
        </header>

        {hasData ? (
          <>
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
                <div className="card-value">{registrationAnalytics?.registeredToday ?? 0}</div>
              </div>

              <div className="stat-card">
                <div className="card-icon quarter">
                  <FaCalendarAlt size={28} />
                </div>
                <div className="card-label">Last 3 Months</div>
                <div className="card-value">{registrationAnalytics?.registered3Months ?? 0}</div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Gender Wise Distribution</h3>
                <div className="chart-container">
                  <Pie data={genderChartData} options={pieOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Category Wise Distribution</h3>
                <div className="chart-container">
                  <Bar data={organizationChartData} options={barOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Service Wise Distribution</h3>
                <div className="chart-container">
                  <Bar data={serviceChartData} options={barOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Ranks Wise Distribution</h3>
                <div className="chart-container">
                  <Bar data={rankChartData} options={barOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Registration Trends</h3>
                <div className="chart-container">
                  <Bar
                    data={registrationChartData}
                    options={barOptions}
                    plugins={CHART_DATALABELS_PLUGINS}
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
          </>
        ) : (
          <div className="empty-dashboard-state">
            <div className="empty-dashboard-card">
              <h2>No results for the current filters</h2>
              <p>
                Try clearing one or more filters to bring the dashboard charts back.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

