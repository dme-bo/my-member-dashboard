// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  FaUsers,
  FaClock,
  FaUserPlus,
  FaCalendarAlt,
  FaClipboardCheck,
} from 'react-icons/fa';
import { Pie, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Chart } from 'react-google-charts';
import TableLoadingSpinner from '../components/TableLoadingSpinner';
import OdooSearchBar from '../components/OdooSearchBar';
import OdooViewToolbar from '../components/OdooViewToolbar';
import FavoritesMenu from '../components/FavoritesMenu';
import useMemberFilters, { MEMBER_GROUP_BY_OPTIONS, getGroupLabels } from '../hooks/useMemberFilters';
import RegistrationTrend from '../components/RegistrationTrend';
import * as ReactWindow from 'react-window';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { parseMemberDate } from '../utils/memberFields';
import { formatDateDDMMMYYYY } from '../utils/dateFormat';
import { collection, db, getDocs } from '../firestoreClient';

// Finance analytics are only needed once the Finance tab is opened.
const FinanceAnalytics = lazy(() => import('../components/FinanceAnalytics'));

const REQUIREMENT_TYPE_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'Job', label: 'Jobs' },
  { key: 'Project', label: 'Projects' },
  { key: 'TCS', label: 'TCS (Temp Staff)' },
];

const REQUIREMENT_TYPE_LABELS = { Job: 'Job', Project: 'Project', TCS: 'TCS' };

// The raw-data view can hold every member (~14k rows), so it is virtualized:
// only the rows on screen are in the DOM.
const RawDataList = ReactWindow.FixedSizeList;
const RAW_DATA_ROW_HEIGHT = 46;

function RawDataRow({ index, style, data }) {
  const { rows, labelsByMember, onRowClick } = data;
  const member = rows[index];
  const appliedFor = (labelsByMember.get(member.id) || []).join('; ') || '-';
  return (
    <div
      className={`raw-data-row${onRowClick ? ' clickable' : ''}`}
      style={style}
      onClick={onRowClick ? () => onRowClick(member) : undefined}
    >
      <div title={member.full_name || ''}>{member.full_name || '-'}</div>
      <div>{member.phone_number || member.phone || '-'}</div>
      <div title={member.email || ''}>{member.email || '-'}</div>
      <div title={member.category || ''}>{member.category || '-'}</div>
      <div title={member.service || ''}>{member.service || '-'}</div>
      <div title={member.rank || ''}>{member.rank || '-'}</div>
      <div title={member.city || ''}>{member.city || '-'}</div>
      <div title={member.state || ''}>{member.state || '-'}</div>
      <div title={appliedFor}>{appliedFor}</div>
    </div>
  );
}

// Matches a member's phone against a tcscoordinatorusersmaster doc id (that
// collection keys documents by a plain 10-digit number) regardless of
// +91/91/0 prefixing on the member's own stored value.
const last10Digits = (value) => String(value || '').replace(/\D/g, '').slice(-10);

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

const SINGLE_BAR_COLORS = Array(15).fill('#1976d2');
const makePct =(total) => (value) => (total ? ((value / total) * 100).toFixed(1) : '0.0');

// Horizontal bars: service / rank names are long, and a ranked list reads
// best top-to-bottom with the count and share at the end of each bar.
const createDistributionBarOptions = (total) => {
  const pct = makePct(total);
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (context) => `${context.label}: ${context.raw} members (${pct(context.raw)}%)` },
      },
      datalabels: {
        color: '#000',
        anchor: 'end',
        align: 'end',
        clip: false,
        font: { weight: 'bold', size: 11 },
        formatter: (value) => (value > 0 ? `${value} (${pct(value)}%)` : ''),
      },
    },
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 }, grace: '40%' },
      y: { ticks: { autoSkip: false }, grid: { display: false } },
    },
    layout: { padding: { right: 12 } },
  };
};

const CHART_DATALABELS_PLUGINS = [ChartDataLabels];

export default function DashboardPage({ memberRecords = [], membersLoading = false, onMemberClick }) {
  const [dashboardView, setDashboardView] = useState('members'); // 'members' | 'finance'
  const [members, setMembers] = useState(memberRecords);
  const [loading, setLoading] = useState(membersLoading);

  const [tcsCoordinatorOnly, setTcsCoordinatorOnly] = useState(false);
  const [tcsCoordinatorPhones, setTcsCoordinatorPhones] = useState(() => new Set());
  const [requirementTypeFilter, setRequirementTypeFilter] = useState('All');
  const [rawDataView, setRawDataView] = useState(null); // { title, subtitle, rows }
  const [rawDataSearch, setRawDataSearch] = useState('');

  // Escape closes the raw-data view.
  useEffect(() => {
    if (!rawDataView) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setRawDataView(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rawDataView]);

  // Fetched once — tcscoordinatorusersmaster is a small, separate roster (not
  // part of the users/memberRecords collection), keyed by phone number, so
  // matching a member to it is a phone lookup rather than a field on the member.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'tcscoordinatorusersmaster'));
        const phones = new Set();
        snapshot.docs.forEach((docSnap) => {
          if (docSnap.data()?.coordinator_type === 'TCS Coordinator') phones.add(docSnap.id);
        });
        if (!cancelled) setTcsCoordinatorPhones(phones);
      } catch (error) {
        console.error('Error loading TCS coordinators:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ────────────────────────────────────────────────
  useEffect(() => {
    if (Array.isArray(memberRecords)) {
      setMembers(memberRecords);
    }
  }, [memberRecords]);

  useEffect(() => {
    setLoading(membersLoading);
  }, [membersLoading]);

  // Search / Filters / Group By / Favorites come from the same hook the
  // Members list uses, so the dashboard filters members identically.
  const {
    searchTerm,
    setSearchTerm,
    groupBy,
    setGroupBy,
    filterOptions,
    filteredMembers: hookFilteredMembers,
    filteredMembersNoDateRange: hookFilteredNoDateRange,
    registrationDateFrom,
    registrationDateTo,
    quickFilters: hookQuickFilters,
    filterChips: hookFilterChips,
    advancedFiltersPanel,
    favorites,
    applyFavorite,
    deleteFavorite,
    saveCurrentAsFavorite,
    clearFilters,
    requirementData,
  } = useMemberFilters(members);

  const parseDateBoundary = (value, endOfDay = false) => {
    if (!value) return null;
    const boundary = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
    return Number.isNaN(boundary.getTime()) ? null : boundary;
  };

  // TCS Coordinator is dashboard-only (a phone lookup against a separate roster),
  // so it is applied on top of the shared filter result.
  const filteredMembersNoDateRange = useMemo(
    () => (tcsCoordinatorOnly ? hookFilteredNoDateRange.filter((member) => tcsCoordinatorPhones.has(last10Digits(member.phone))) : hookFilteredNoDateRange),
    [hookFilteredNoDateRange, tcsCoordinatorOnly, tcsCoordinatorPhones]
  );
  const filteredMembers = useMemo(
    () => (tcsCoordinatorOnly ? hookFilteredMembers.filter((member) => tcsCoordinatorPhones.has(last10Digits(member.phone))) : hookFilteredMembers),
    [hookFilteredMembers, tcsCoordinatorOnly, tcsCoordinatorPhones]
  );

  const quickFilters = useMemo(
    () => [
      ...hookQuickFilters,
      {
        key: 'tcs-coordinator',
        label: 'TCS Coordinator',
        active: tcsCoordinatorOnly,
        startGroup: true,
        onToggle: () => setTcsCoordinatorOnly((prev) => !prev),
      },
    ],
    [hookQuickFilters, tcsCoordinatorOnly]
  );

  const filterChips = useMemo(
    () =>
      tcsCoordinatorOnly
        ? [...hookFilterChips, { key: 'tcs-coordinator', label: 'TCS Coordinator', onRemove: () => setTcsCoordinatorOnly(false) }]
        : hookFilterChips,
    [hookFilterChips, tcsCoordinatorOnly]
  );

  // Applicants — everything below respects the dashboard filters above, so a
  // block's count is "applicants among the members currently in view".
  const memberById = useMemo(() => {
    const map = new Map();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  const filteredIdSet = useMemo(() => new Set(filteredMembers.map((member) => member.id)), [filteredMembers]);

  // The Date Range filters members by REGISTRATION date everywhere else, but for
  // applicants the question is "who applied in this window" - someone who
  // registered months ago and applied yesterday must still show up. So when a
  // date range is set, applicants are matched on their application date
  // (applied_at) among members passing the other dashboard filters, and the
  // registration-date cut is not applied to them.
  const applicationRange = useMemo(
    () => ({
      from: parseDateBoundary(registrationDateFrom, false)?.getTime() ?? null,
      to: parseDateBoundary(registrationDateTo, true)?.getTime() ?? null,
    }),
    [registrationDateFrom, registrationDateTo]
  );
  const applicationRangeActive = applicationRange.from !== null || applicationRange.to !== null;

  const applicantMemberSet = useMemo(
    () => (applicationRangeActive ? new Set(filteredMembersNoDateRange.map((member) => member.id)) : filteredIdSet),
    [applicationRangeActive, filteredMembersNoDateRange, filteredIdSet]
  );

  // Per requirement: applicant ids that are in view (and, with a date range
  // set, applied inside it).
  const requirementApplicantsInView = useMemo(
    () =>
      requirementData.requirements.map((requirement) => {
        const ids = new Set();
        requirement.memberIds.forEach((id) => {
          if (!applicantMemberSet.has(id)) return;
          if (applicationRangeActive) {
            const appliedMs = requirement.appliedAt?.get(id);
            if (appliedMs == null) return;
            if (applicationRange.from !== null && appliedMs < applicationRange.from) return;
            if (applicationRange.to !== null && appliedMs > applicationRange.to) return;
          }
          ids.add(id);
        });
        return { requirement, ids };
      }),
    [requirementData, applicantMemberSet, applicationRangeActive, applicationRange]
  );

  const appliedInViewIds = useMemo(() => {
    const all = new Set();
    requirementApplicantsInView.forEach(({ ids }) => ids.forEach((id) => all.add(id)));
    return all;
  }, [requirementApplicantsInView]);

  const appliedMemberCount = appliedInViewIds.size;

  const requirementBlocks = useMemo(() => {
    return requirementApplicantsInView
      .map(({ requirement, ids }) => ({ ...requirement, count: ids.size, activeMemberIds: ids }))
      .filter((block) => block.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [requirementApplicantsInView]);

  const visibleRequirementBlocks = useMemo(
    () =>
      requirementTypeFilter === 'All'
        ? requirementBlocks
        : requirementBlocks.filter((block) => block.type === requirementTypeFilter),
    [requirementBlocks, requirementTypeFilter]
  );

  // Opens the raw member rows behind a block. Rows are the applicants that are
  // also inside the current dashboard filters, so the table always adds up to
  // the number shown on the block.
  const openRawDataRows = (title, subtitle, memberRows) => {
    // A-Z by name, with members that have no name at the end.
    const rows = [...memberRows].sort((a, b) => {
      const nameA = String(a.full_name || '').trim();
      const nameB = String(b.full_name || '').trim();
      if (!nameA !== !nameB) return nameA ? -1 : 1;
      return nameA.localeCompare(nameB);
    });
    setRawDataSearch('');
    setRawDataView({ title, subtitle, rows });
  };

  const openRawData = (title, subtitle, memberIds) => {
    const rows = [];
    memberIds.forEach((id) => {
      if (!applicantMemberSet.has(id)) return;
      const member = memberById.get(id);
      if (member) rows.push(member);
    });
    openRawDataRows(title, subtitle, rows);
  };

  // Same rule (and same member set) as the Registered Today / Last 3 Months
  // numbers in registrationAnalytics: dashboard filters except the date range.
  const openRegisteredSince = (title, subtitle, boundary) => {
    openRawDataRows(
      title,
      subtitle,
      filteredMembersNoDateRange.filter((member) => {
        const parsedDate = member.__registrationDate || parseMemberDate(member.registration_date);
        return parsedDate && parsedDate >= boundary;
      })
    );
  };

  const openTotalMembers = () => openRawDataRows('Total Members', 'All members in the current view', filteredMembers);

  const openRegisteredToday = () => {
    const now = new Date();
    openRegisteredSince(
      'Registered Today',
      'Members who registered today',
      new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );
  };

  const openLast3Months = () => {
    const now = new Date();
    const boundary = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    openRegisteredSince('Last 3 Months', `Members who registered since ${formatDateDDMMMYYYY(boundary)}`, boundary);
  };

  // Search inside the open raw-data view (all blocks share it). The haystack
  // per row is built once per opened view, so typing only does substring checks.
  const debouncedRawDataSearch = useDebouncedValue(rawDataSearch, 150);

  const rawDataHaystacks = useMemo(() => {
    if (!rawDataView) return [];
    return rawDataView.rows.map((member) =>
      [
        member.full_name,
        member.phone_number || member.phone,
        member.email,
        member.category,
        member.service,
        member.rank,
        member.city,
        member.state,
        (requirementData.labelsByMember.get(member.id) || []).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    );
  }, [rawDataView, requirementData]);

  const searchedRawRows = useMemo(() => {
    if (!rawDataView) return [];
    const term = debouncedRawDataSearch.trim().toLowerCase();
    if (!term) return rawDataView.rows;
    const matches = [];
    for (let i = 0; i < rawDataView.rows.length; i += 1) {
      if (rawDataHaystacks[i].includes(term)) matches.push(rawDataView.rows[i]);
    }
    return matches;
  }, [rawDataView, rawDataHaystacks, debouncedRawDataSearch]);

  const onBlockKeyDown = (event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  // Analytics (unchanged logic) ────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (loading || !filteredMembers.length) return null;

    const total = filteredMembers.length;
    const genderCounts = {};
    const categoryCounts = {};
    const serviceCounts = {};
    const rankCounts = {};
    const stateCounts = {};
    let expSum = 0;
    let categoryTotal = 0;
    let serviceTotal = 0;
    let rankTotal = 0;

    for (const member of filteredMembers) {
      if (member.category) categoryTotal += 1;
      if (member.service) serviceTotal += 1;
      if (member.rank) rankTotal += 1;
      const rawGender = member.gender?.trim()?.toLowerCase();
      if (rawGender === 'male' || rawGender === 'm') genderCounts.Male = (genderCounts.Male || 0) + 1;
      else if (rawGender === 'female' || rawGender === 'f') genderCounts.Female = (genderCounts.Female || 0) + 1;

      if (member.category) categoryCounts[member.category] = (categoryCounts[member.category] || 0) + 1;
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
      categoryTotal,
      serviceTotal,
      rankTotal,
      genderCounts,
      categoryCounts: sortCountsDesc(categoryCounts),
      serviceCounts: sortCountsDesc(serviceCounts, 10),
      rankCounts: sortCountsDesc(rankCounts, 15),
      stateCounts: sortCountsDesc(stateCounts),
      avgExp,
    };
  }, [filteredMembers, loading]);

  // react-google-charts treats any new `data` array reference as new data and
  // does a full SVG re-render of the India map, so this needs to be memoized
  // rather than built inline in JSX on every render.
  const stateRows = useMemo(() => (analytics ? Object.entries(analytics.stateCounts) : []), [analytics]);
  const stateTotal = useMemo(() => stateRows.reduce((sum, [, count]) => sum + count, 0), [stateRows]);

  const geoChartData = useMemo(() => {
    if (!stateRows.length) return [['State', 'Members']];
    return [
      ['State', 'Members', { type: 'string', role: 'tooltip' }],
      ...stateRows.map(([state, count]) => [
        state,
        count,
        `${state}\n${count.toLocaleString()} members (${((count / stateTotal) * 100).toFixed(1)}%)`,
      ]),
    ];
  }, [stateRows, stateTotal]);

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
    clearFilters();
    setTcsCoordinatorOnly(false);
    setRequirementTypeFilter('All');
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
      borderWidth: 2,
      borderColor: '#fff',
      borderRadius: 4,
      maxBarThickness: 60,
    }],
  });

  const genderChartData = useMemo(() => (analytics ? createChartData(analytics.genderCounts) : null), [analytics]);
  // One colour per category so the bars double as a legend.
  const categoryChartData = useMemo(() => (analytics ? createChartData(analytics.categoryCounts) : null), [analytics]);
  // Ranked single-metric bars use one colour; varied colours only add noise.
  const serviceChartData = useMemo(() => (analytics ? createChartData(analytics.serviceCounts, SINGLE_BAR_COLORS) : null), [analytics]);
  const rankChartData = useMemo(() => (analytics ? createChartData(analytics.rankCounts, SINGLE_BAR_COLORS) : null), [analytics]);

  // Distribution bars show "count (x%)" where x is the share of members that
  // have that field filled in (rank is capped to the top 15 bars, so the % is
  // still against the full total, not just the bars shown).
  const categoryBarOptions = useMemo(() => createDistributionBarOptions(analytics?.categoryTotal), [analytics]);
  const serviceBarOptions = useMemo(() => createDistributionBarOptions(analytics?.serviceTotal), [analytics]);
  const rankBarOptions = useMemo(() => createDistributionBarOptions(analytics?.rankTotal), [analytics]);

  // Group By (toolbar) → one extra chart: members per group, with count and % of
  // the members in view. Multi-value fields (Tags, Project) can place a member in
  // several groups, so those shares can add up past 100%.
  const groupByChart = useMemo(() => {
    if (!groupBy || !filteredMembers.length) return null;
    const counts = {};
    for (const member of filteredMembers) {
      for (const label of getGroupLabels(member, groupBy, filterOptions.Experience)) {
        counts[label] = (counts[label] || 0) + 1;
      }
    }
    const entries = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const shown = Object.fromEntries(entries.slice(0, 20));
    return {
      title: MEMBER_GROUP_BY_OPTIONS.find((option) => option.key === groupBy)?.label || groupBy,
      data: createChartData(shown, SINGLE_BAR_COLORS.concat(SINGLE_BAR_COLORS)),
      options: createDistributionBarOptions(filteredMembers.length),
      rows: Math.min(entries.length, 20),
      hidden: Math.max(0, entries.length - 20),
    };
  }, [groupBy, filteredMembers, filterOptions]);

  const pieOptions = PIE_CHART_OPTIONS;

  useEffect(() => {
    import('../components/FinanceAnalytics').catch(() => {});
  }, []);

  const viewToggle = (
    <div className="dashboard-view-toggle" role="tablist" aria-label="Dashboard view">
      {[
        { key: 'members', label: 'Members' },
        { key: 'finance', label: 'Finance' },
      ].map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={dashboardView === tab.key}
          className={dashboardView === tab.key ? 'active' : ''}
          onClick={() => setDashboardView(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        .dashboard-container {
          width: 100%;
          min-height: 100vh;
          padding: 20px;
          box-sizing: border-box;
        }

        .dashboard-container.finance-mode {
          padding: 0;
        }

        .dashboard-view-toggle {
          display: inline-flex;
          margin-bottom: 18px;
          border: 1px solid #1976d2;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
        }

        .dashboard-view-toggle button {
          padding: 9px 26px;
          border: none;
          background: #fff;
          color: #1976d2;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .dashboard-view-toggle button + button {
          border-left: 1px solid #1976d2;
        }

        .dashboard-view-toggle button.active {
          background: #1976d2;
          color: #fff;
        }

        /* Members view header matches the Finance view's flat band (.fin-header). */
        .dashboard-container.members-mode { padding: 0 !important; background: #f5f7fa; }
        .dash-header {
          margin: 0;
          background: #fff;
          padding: 32px 32px 16px;
        }
        .dash-header .dash-controls-row { margin-bottom: 16px; }
        .dash-body { padding: 24px 32px; }
        @media (max-width: 767px) {
          .dash-header { padding: 20px 16px 12px; }
          .dash-body { padding: 16px; }
        }
        .dash-title-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .dash-title-actions .dashboard-view-toggle { margin-bottom: 0; }
        .dash-title-actions .dashboard-view-toggle button { height: 32px; padding: 0 18px; font-size: 13px; }
        .dash-title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .dash-title { display: flex; align-items: baseline; gap: 12px; }
        .dash-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .dash-title span { font-size: 14px; color: #64748b; }
        .dash-outline-btn { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; background: #fff; border: 1px solid #dde1e7; border-radius: 6px; color: #334155; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .dash-controls-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .member-date-range-wrapper { width: 100%; }
        .member-date-range-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font-size: 12px; color: #111827; outline: none; font-family: inherit; }
        .member-date-range-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
        #member-date-range-portal { position: relative; z-index: 10200; }
        .member-date-range-popper { z-index: 10200; }

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
        .card-icon.applied { background: #00897b; }

        .stat-card.clickable,
        .requirement-block {
          cursor: pointer;
        }

        .stat-card.clickable:focus-visible,
        .requirement-block:focus-visible {
          outline: 2px solid #1976d2;
          outline-offset: 2px;
        }

        .requirement-section {
          background: #ffffff;
          border-radius: 10px;
          padding: 20px;
          margin-bottom: 40px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid #f1f5f9;
        }

        .requirement-section-header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .requirement-section-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #1a2332;
        }

        .requirement-type-filter {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .requirement-type-filter button {
          padding: 7px 14px;
          border-radius: 20px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #334155;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
        }

        .requirement-type-filter button.active {
          background: #1976d2;
          border-color: #1976d2;
          color: #fff;
        }

        .requirement-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 14px;
          max-height: 420px;
          overflow-y: auto;
          padding: 2px;
        }

        .requirement-block {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
        }

        .requirement-block:hover {
          transform: translateY(-2px);
          border-color: #1976d2;
          box-shadow: 0 4px 12px rgba(25, 118, 210, 0.15);
        }

        .requirement-type {
          align-self: flex-start;
          padding: 2px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          background: #1976d2;
        }

        .requirement-type.project { background: #43a047; }
        .requirement-type.tcs { background: #fb8c00; }

        .requirement-title {
          font-weight: 700;
          font-size: 14px;
          color: #0f172a;
          line-height: 1.3;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .requirement-company {
          font-size: 12.5px;
          color: #64748b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .requirement-count {
          margin-top: 6px;
          font-size: 1.5rem;
          font-weight: 700;
          color: #1976d2;
        }

        .requirement-count span {
          font-size: 0.8rem;
          font-weight: 600;
          color: #64748b;
        }

        .requirement-empty {
          padding: 18px;
          text-align: center;
          color: #64748b;
          font-size: 14px;
        }

        .raw-data-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .raw-data-modal {
          background: #fff;
          border-radius: 12px;
          width: min(1100px, 100%);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.3);
        }

        .raw-data-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 22px;
          border-bottom: 1px solid #e2e8f0;
        }

        .raw-data-header h2 {
          margin: 0;
          font-size: 1.2rem;
          color: #0f172a;
        }

        .raw-data-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }

        .raw-data-close {
          border: none;
          background: transparent;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
          color: #475569;
        }

        .raw-data-body {
          overflow: auto;
          padding: 0 6px 6px;
        }

        .raw-data-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .raw-data-search {
          width: 280px;
          max-width: 40vw;
          padding: 9px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
          font-size: 13px;
          color: #0f172a;
          outline: none;
        }

        .raw-data-search:focus {
          border-color: #1976d2;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.15);
        }

        .raw-data-grid {
          min-width: 1000px;
        }

        .raw-data-row {
          display: grid;
          grid-template-columns: 1.5fr 1.1fr 1.9fr 1fr 1fr 0.8fr 1fr 1.1fr 2.2fr;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          font-size: 13px;
          color: #0f172a;
          border-bottom: 1px solid #eef2f6;
          box-sizing: border-box;
        }

        .raw-data-row > div {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .raw-data-row.raw-data-head {
          height: 40px;
          background: #f1f5f9;
          font-weight: 700;
          color: #334155;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .raw-data-row.clickable {
          cursor: pointer;
        }

        .raw-data-row.clickable:hover {
          background: #f0f7ff;
        }

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
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          align-items: stretch;
        }

        .state-split { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: 20px; align-items: start; }
        .state-table-wrap { max-height: 480px; overflow-y: auto; border: 1px solid #e5eaf1; border-radius: 8px; }
        .state-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .state-table th { position: sticky; top: 0; z-index: 3; background: #1976d2; color: #fff; text-align: left; font-weight: 600; padding: 9px 12px; }
        .state-table th:nth-child(n+2), .state-table td.num { text-align: right; }
        .state-table td { padding: 7px 12px; border-bottom: 1px solid #eef1f5; color: #334155; }
        .state-table td.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #0f172a; }
        .state-table td.pct { position: relative; z-index: 0; min-width: 110px; }
        .state-table .pct-bar { position: absolute; left: 12px; top: 50%; height: 16px; transform: translateY(-50%); background: #dbeafe; border-radius: 3px; max-width: calc(100% - 24px); }
        .state-table .pct-text { position: relative; display: block; text-align: right; font-variant-numeric: tabular-nums; }
        .state-table tfoot td { position: sticky; bottom: 0; z-index: 3; background: #f1f5f9; font-weight: 700; border-top: 1px solid #cbd5e1; }
        @media (max-width: 900px) { .state-split { grid-template-columns: 1fr; } }
        .charts-grid > .chart-card { min-width: 0; display: flex; flex-direction: column; }
        .charts-grid > .chart-card .chart-container { flex: 1 1 auto; }

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
            grid-template-columns: 1fr;
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

      <div className={`dashboard-container ${dashboardView === 'finance' ? 'finance-mode' : 'members-mode'}`}>
        {dashboardView === 'finance' && (
          <Suspense fallback={<TableLoadingSpinner label="Loading finance…" />}>
            <FinanceAnalytics memberRecords={members} onMemberClick={onMemberClick} viewToggle={viewToggle} />
          </Suspense>
        )}

        {dashboardView === 'members' && (
        <>
        <header className="dash-header">
          <div className="dash-title-row">
            <div className="dash-title">
              <h1>Dashboard</h1>
              <span>{filteredMembers.length.toLocaleString()} Members</span>
            </div>
            <div className="dash-title-actions">
              {viewToggle}
              <button type="button" className="dash-outline-btn" onClick={clearAllFilters}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Reset Filters
              </button>
            </div>
          </div>

          <div className="dash-controls-row">
            <OdooSearchBar
              variant="boxed"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, mobile, email..."
              chips={filterChips}
            />
            <div className="member-toolbar-group">
              <OdooViewToolbar
                variant="boxed"
                quickFilters={quickFilters}
                advancedContent={advancedFiltersPanel}
                groupByOptions={MEMBER_GROUP_BY_OPTIONS}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                showViewToggle={false}
              />
              <FavoritesMenu
                favorites={favorites}
                onApply={applyFavorite}
                onDelete={deleteFavorite}
                onSave={saveCurrentAsFavorite}
              />
            </div>
          </div>
        </header>

        <div className="dash-body">
        {loading ? (
          <div style={{ height: "220px", display: "flex" }}>
            <TableLoadingSpinner label="Loading dashboard…" />
          </div>
        ) : hasData ? (
          <>
            <div className="stats-grid">
              <div
                className="stat-card clickable"
                role="button"
                tabIndex={0}
                title="Show the raw data"
                onClick={openTotalMembers}
                onKeyDown={(event) => onBlockKeyDown(event, openTotalMembers)}
              >
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

              <div
                className="stat-card clickable"
                role="button"
                tabIndex={0}
                title="Show the raw data"
                onClick={openRegisteredToday}
                onKeyDown={(event) => onBlockKeyDown(event, openRegisteredToday)}
              >
                <div className="card-icon new">
                  <FaUserPlus size={28} />
                </div>
                <div className="card-label">Registered Today</div>
                <div className="card-value">{registrationAnalytics?.registeredToday ?? 0}</div>
              </div>

              <div
                className="stat-card clickable"
                role="button"
                tabIndex={0}
                title="Show the raw data"
                onClick={openLast3Months}
                onKeyDown={(event) => onBlockKeyDown(event, openLast3Months)}
              >
                <div className="card-icon quarter">
                  <FaCalendarAlt size={28} />
                </div>
                <div className="card-label">Last 3 Months</div>
                <div className="card-value">{registrationAnalytics?.registered3Months ?? 0}</div>
              </div>

              <div
                className="stat-card clickable"
                role="button"
                tabIndex={0}
                title="Show the raw data"
                onClick={() =>
                  openRawData('Applied Members', 'Members who applied to any job or project', appliedInViewIds)
                }
                onKeyDown={(event) =>
                  onBlockKeyDown(event, () =>
                    openRawData('Applied Members', 'Members who applied to any job or project', appliedInViewIds)
                  )
                }
              >
                <div className="card-icon applied">
                  <FaClipboardCheck size={28} />
                </div>
                <div className="card-label">Applied Members</div>
                <div className="card-value">{appliedMemberCount.toLocaleString()}</div>
              </div>
            </div>

            <div className="requirement-section">
              <div className="requirement-section-header">
                <h3>Requirement Wise Applicants</h3>
                <div className="requirement-type-filter">
                  {REQUIREMENT_TYPE_FILTERS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={requirementTypeFilter === option.key ? 'active' : ''}
                      onClick={() => setRequirementTypeFilter(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {visibleRequirementBlocks.length === 0 ? (
                <div className="requirement-empty">No applicants for the current filters.</div>
              ) : (
                <div className="requirement-grid">
                  {visibleRequirementBlocks.map((block) => {
                    const subtitle = `${REQUIREMENT_TYPE_LABELS[block.type]}${block.company ? ` • ${block.company}` : ''}`;
                    const open = () => openRawData(block.title, subtitle, block.activeMemberIds);
                    return (
                      <div
                        key={block.id}
                        className="requirement-block"
                        role="button"
                        tabIndex={0}
                        title="Show the raw data"
                        onClick={open}
                        onKeyDown={(event) => onBlockKeyDown(event, open)}
                      >
                        <span className={`requirement-type ${block.type.toLowerCase()}`}>
                          {REQUIREMENT_TYPE_LABELS[block.type]}
                        </span>
                        <div className="requirement-title">{block.title}</div>
                        <div className="requirement-company">{block.company || ' '}</div>
                        <div className="requirement-count">
                          {block.count.toLocaleString()} <span>applicant{block.count === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="charts-grid">
              {groupByChart && (
                <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                  <h3>
                    Members by {groupByChart.title}
                    {groupByChart.hidden > 0 ? ` (top 20, ${groupByChart.hidden} more not shown)` : ''}
                  </h3>
                  <div className="chart-container" style={{ height: Math.max(300, groupByChart.rows * 30 + 60) }}>
                    <Bar data={groupByChart.data} options={groupByChart.options} plugins={CHART_DATALABELS_PLUGINS} />
                  </div>
                </div>
              )}

              <div className="chart-card">
                <h3>Gender Wise Distribution</h3>
                <div className="chart-container">
                  <Pie data={genderChartData} options={pieOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Category Wise Distribution</h3>
                <div className="chart-container">
                  <Bar data={categoryChartData} options={categoryBarOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Service Wise Distribution</h3>
                <div className="chart-container" style={{ minHeight: Math.max(360, Object.keys(analytics.serviceCounts).length * 32 + 60) }}>
                  <Bar data={serviceChartData} options={serviceBarOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <div className="chart-card">
                <h3>Ranks Wise Distribution</h3>
                <div className="chart-container" style={{ minHeight: Math.max(360, Object.keys(analytics.rankCounts).length * 28 + 60) }}>
                  <Bar data={rankChartData} options={rankBarOptions} plugins={CHART_DATALABELS_PLUGINS} />
                </div>
              </div>

              <RegistrationTrend members={filteredMembersNoDateRange} />

              <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                <h3>State Wise Distribution (India)</h3>
                <div className="state-split">
                <div className="chart-container geo">
                  <Chart
                    chartType="GeoChart"
                    data={geoChartData}
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
                <div className="state-table-wrap">
                  <table className="state-table">
                    <thead>
                      <tr><th>State</th><th>Members</th><th>% of total</th></tr>
                    </thead>
                    <tbody>
                      {stateRows.map(([state, count]) => (
                        <tr key={state}>
                          <td>{state}</td>
                          <td className="num">{count.toLocaleString()}</td>
                          <td className="pct">
                            <span className="pct-bar" style={{ width: `${(count / stateRows[0][1]) * 100}%` }} />
                            <span className="pct-text">{((count / stateTotal) * 100).toFixed(1)}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><td>Total</td><td className="num">{stateTotal.toLocaleString()}</td><td className="pct"><span className="pct-text">100%</span></td></tr>
                    </tfoot>
                  </table>
                </div>
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
        )}
      </div>

      {rawDataView && (
        <div className="raw-data-overlay" onClick={() => setRawDataView(null)}>
          <div
            className="raw-data-modal"
            role="dialog"
            aria-modal="true"
            aria-label={rawDataView.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="raw-data-header">
              <div>
                <h2>{rawDataView.title}</h2>
                <p>
                  {rawDataView.subtitle} · {searchedRawRows.length.toLocaleString()}
                  {searchedRawRows.length !== rawDataView.rows.length
                    ? ` of ${rawDataView.rows.length.toLocaleString()}`
                    : ''}{' '}
                  member{rawDataView.rows.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="raw-data-header-actions">
                <input
                  type="search"
                  className="raw-data-search"
                  placeholder="Search name, mobile, email, city..."
                  aria-label="Search members"
                  value={rawDataSearch}
                  onChange={(event) => setRawDataSearch(event.target.value)}
                  autoFocus
                />
                <button type="button" className="raw-data-close" aria-label="Close" onClick={() => setRawDataView(null)}>
                  ×
                </button>
              </div>
            </div>
            <div className="raw-data-body">
              <div className="raw-data-grid">
                <div className="raw-data-row raw-data-head">
                  <div>Name</div>
                  <div>Mobile</div>
                  <div>Email</div>
                  <div>Category</div>
                  <div>Service</div>
                  <div>Rank</div>
                  <div>City</div>
                  <div>State</div>
                  <div>Applied For</div>
                </div>
                {searchedRawRows.length === 0 ? (
                  <div className="requirement-empty">No matching members.</div>
                ) : (
                  <RawDataList
                    height={Math.min(
                      searchedRawRows.length * RAW_DATA_ROW_HEIGHT,
                      Math.max(240, Math.floor(window.innerHeight * 0.85) - 150)
                    )}
                    itemCount={searchedRawRows.length}
                    itemSize={RAW_DATA_ROW_HEIGHT}
                    width="100%"
                    itemKey={(index, data) => data.rows[index].id}
                    itemData={{
                      rows: searchedRawRows,
                      labelsByMember: requirementData.labelsByMember,
                      onRowClick: onMemberClick
                        ? (member) => {
                            setRawDataView(null);
                            onMemberClick(member);
                          }
                        : null,
                    }}
                  >
                    {RawDataRow}
                  </RawDataList>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

