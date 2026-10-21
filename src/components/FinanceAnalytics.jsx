// src/components/FinanceAnalytics.jsx
//
// Finance view of the Dashboard, laid out like the Members List page: white
// header band (title + count, Reset Filters, search with Filters / Group By /
// Favorites), then a full-width table. Analytics over the `financemaster`
// collection (one document per resource with a monthly payments map). Rows are
// matched to members by the last 10 digits of the mobile number, which unlocks
// the state / category filters and lets a row open the member's profile.
import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { FaRupeeSign, FaChartLine, FaTrophy, FaArrowDown } from 'react-icons/fa';
import * as ReactWindow from 'react-window';
import OdooSearchBar from './OdooSearchBar';
import OdooViewToolbar from './OdooViewToolbar';
import FavoritesMenu from './FavoritesMenu';
import FilterAccordionList from './FilterAccordionList';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { collection, db, getDocs } from '../firestoreClient';
import TableLoadingSpinner from './TableLoadingSpinner';

const TableList = ReactWindow.FixedSizeList;
const ROW_HEIGHT = 49;
const FAVORITES_KEY = 'financeFavorites';
const LAST_10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key) => {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1] || month} ${String(year).slice(2)}`;
};

const GROUP_BY_OPTIONS = [
  { key: 'Category', label: 'Category' },
  { key: 'State', label: 'State' },
  { key: 'City', label: 'City' },
  { key: 'Service', label: 'Service' },
  { key: 'Rank', label: 'Rank' },
];
const GROUP_FIELD = { Category: 'category', State: 'state', City: 'city', Service: 'service', Rank: 'rank' };

const median = (sorted) => {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const loadFavorites = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const MONTH_BAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (ctx) => ` ${inr(ctx.raw)}` } },
  },
  scales: {
    y: { beginAtZero: true, ticks: { callback: (v) => `₹${Number(v).toLocaleString('en-IN')}` } },
    x: { ticks: { autoSkip: false } },
  },
};

function TableRow({ index, style, data }) {
  const { items, months, selectedSet, onRowClick, gridTemplate } = data;
  const item = items[index];

  if (item.__group) {
    return (
      <div className="fin-row fin-group-row" style={{ ...style, gridTemplateColumns: '1fr auto' }}>
        <div className="fin-group-label">
          {item.label} <span className="fin-group-count">({item.count.toLocaleString('en-IN')})</span>
        </div>
        <div className="fin-group-total">{inr(item.total)}</div>
      </div>
    );
  }

  const row = item;
  const place = row.member ? [row.member.city, row.member.state].filter(Boolean).join(', ') : '';
  return (
    <div
      className={`fin-row${row.member ? ' clickable' : ''}${row.stripe ? ' alt' : ''}`}
      style={{ ...style, gridTemplateColumns: gridTemplate }}
      onClick={row.member ? () => onRowClick(row.member) : undefined}
      title={row.member ? 'Open member profile' : 'Not matched to a member'}
    >
      <div className="fin-name" title={row.name}>{row.name}</div>
      <div>{row.mobile || '—'}</div>
      <div title={place}>{row.member ? place || '—' : <span className="fin-muted">Not a member</span>}</div>
      {months.map((m) => (
        <div key={m} className={`fin-num${selectedSet.has(m) ? '' : ' dim'}`}>
          {row.payments[m] ? Number(row.payments[m]).toLocaleString('en-IN') : '—'}
        </div>
      ))}
      <div className="fin-num fin-total">{row.amount.toLocaleString('en-IN')}</div>
    </div>
  );
}

export default function FinanceAnalytics({ memberRecords = [], onMemberClick, viewToggle }) {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [monthSel, setMonthSel] = useState([]); // empty = every month
  const [stateFilter, setStateFilter] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [groupBy, setGroupBy] = useState(null);
  const [sort, setSort] = useState({ key: 'amount', dir: 'desc' });
  const [favorites, setFavorites] = useState(loadFavorites);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'financemaster'))
      .then((snapshot) => {
        if (cancelled) return;
        setRaw(
          snapshot.docs.map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              name: String(data.resource_name || 'Unnamed'),
              mobile: String(data.mobile || ''),
              payments: data.payments || {},
            };
          })
        );
      })
      .catch((err) => {
        console.error('Error loading financemaster:', err);
        if (!cancelled) setError('Could not load finance data.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const memberByPhone = useMemo(() => {
    const map = new Map();
    for (const member of memberRecords) {
      const key = LAST_10(member.phone_number || member.phone);
      if (key.length === 10 && !map.has(key)) map.set(key, member);
    }
    return map;
  }, [memberRecords]);

  const months = useMemo(() => {
    const set = new Set();
    (raw || []).forEach((row) => Object.keys(row.payments).forEach((m) => set.add(m)));
    return Array.from(set).sort();
  }, [raw]);

  const selectedMonths = monthSel.length ? months.filter((m) => monthSel.includes(m)) : months;
  const selectedSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);

  // Rows with the matched member and the amount for the selected months.
  const rows = useMemo(
    () =>
      (raw || []).map((row) => {
        const key = LAST_10(row.mobile);
        const member = key.length === 10 ? memberByPhone.get(key) || null : null;
        let amount = 0;
        for (const m of selectedMonths) amount += Number(row.payments[m]) || 0;
        return { ...row, member, amount };
      }),
    [raw, memberByPhone, selectedMonths]
  );

  const stateOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.member?.state).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.member?.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (term && !row.name.toLowerCase().includes(term) && !row.mobile.includes(term)) return false;
      if (stateFilter.length && !stateFilter.includes(row.member?.state)) return false;
      if (categoryFilter.length && !categoryFilter.includes(row.member?.category)) return false;
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let diff;
      if (sort.key === 'name') diff = a.name.localeCompare(b.name);
      else if (sort.key === 'mobile') diff = a.mobile.localeCompare(b.mobile);
      else if (sort.key === 'amount') diff = a.amount - b.amount;
      else diff = (Number(a.payments[sort.key]) || 0) - (Number(b.payments[sort.key]) || 0);
      return diff * dir || a.name.localeCompare(b.name);
    });
    return list;
  }, [rows, debouncedSearch, stateFilter, categoryFilter, sort]);

  const stats = useMemo(() => {
    const paid = filtered.filter((r) => r.amount > 0);
    const total = paid.reduce((a, r) => a + r.amount, 0);
    const sortedAmounts = paid.map((r) => r.amount).sort((a, b) => a - b);
    const top = paid.reduce((best, r) => (!best || r.amount > best.amount ? r : best), null);
    const low = paid.reduce((best, r) => (!best || r.amount < best.amount ? r : best), null);
    return {
      total,
      resources: filtered.length,
      average: paid.length ? total / paid.length : 0,
      median: median(sortedAmounts),
      top,
      low,
    };
  }, [filtered]);

  // Month-wise payout across the filtered resources (all months, selected ones highlighted).
  const monthly = useMemo(
    () =>
      months.map((m) => ({
        month: m,
        total: filtered.reduce((a, row) => a + (Number(row.payments[m]) || 0), 0),
      })),
    [months, filtered]
  );

  // Table items: plain rows, or group header + rows when grouped.
  const items = useMemo(() => {
    if (!groupBy) return filtered.map((row, i) => ({ ...row, stripe: i % 2 === 0 }));
    const field = GROUP_FIELD[groupBy];
    const groups = new Map();
    for (const row of filtered) {
      const label = String(row.member?.[field] || '').trim() || 'Not a member';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }
    const flat = [];
    Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([label, groupRows]) => {
        flat.push({ __group: true, label, count: groupRows.length, total: groupRows.reduce((a, r) => a + r.amount, 0), id: `g:${label}` });
        groupRows.forEach((row, i) => flat.push({ ...row, stripe: i % 2 === 0 }));
      });
    return flat;
  }, [filtered, groupBy]);

  const resetFilters = () => {
    setSearch('');
    setMonthSel([]);
    setStateFilter([]);
    setCategoryFilter([]);
    setGroupBy(null);
  };

  const setSortKey = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'mobile' ? 'asc' : 'desc' }
    );

  // Filters dropdown: the same accordion the Members List uses.
  const advancedFiltersPanel = (
    <FilterAccordionList
      sections={[
        {
          key: 'Months',
          label: 'Months',
          options: months.map(monthLabel),
          selected: monthSel.map(monthLabel),
          onChange: (labels) => {
            const keys = months.filter((m) => labels.includes(monthLabel(m)));
            setMonthSel(keys.length === months.length ? [] : keys);
          },
        },
        { key: 'State', label: 'State', options: stateOptions, selected: stateFilter, onChange: setStateFilter },
        { key: 'Category', label: 'Category', options: categoryOptions, selected: categoryFilter, onChange: setCategoryFilter },
      ]}
    />
  );

  // Every active filter / group shows as a removable chip in the search bar.
  const filterChips = [
    ...monthSel.map((m) => ({ key: `m:${m}`, label: monthLabel(m), onRemove: () => setMonthSel((prev) => prev.filter((x) => x !== m)) })),
    ...stateFilter.map((v) => ({ key: `s:${v}`, label: v, onRemove: () => setStateFilter((prev) => prev.filter((x) => x !== v)) })),
    ...categoryFilter.map((v) => ({ key: `c:${v}`, label: v, onRemove: () => setCategoryFilter((prev) => prev.filter((x) => x !== v)) })),
  ];
  if (groupBy) {
    filterChips.push({ key: 'groupby', label: `Group: ${groupBy}`, onRemove: () => setGroupBy(null) });
  }

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch (err) {
      console.error('Error saving favorites:', err);
    }
  };
  const saveFavorite = (name) =>
    persistFavorites([...favorites, { id: Date.now().toString(36), name, search, monthSel, stateFilter, categoryFilter, groupBy }]);
  const applyFavorite = (fav) => {
    setSearch(fav.search || '');
    setMonthSel(fav.monthSel || []);
    setStateFilter(fav.stateFilter || []);
    setCategoryFilter(fav.categoryFilter || []);
    setGroupBy(fav.groupBy || null);
  };
  const deleteFavorite = (id) => persistFavorites(favorites.filter((f) => f.id !== id));

  const exportCsv = () => {
    const head = ['Resource Name', 'Mobile', 'City', 'State', 'Category', ...months.map(monthLabel), 'Total (selected months)'];
    const lines = [head.map(csvCell).join(',')];
    filtered.forEach((row) => {
      lines.push(
        [row.name, row.mobile, row.member?.city || '', row.member?.state || '', row.member?.category || '',
          ...months.map((m) => Number(row.payments[m]) || 0), row.amount].map(csvCell).join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const gridTemplate = `minmax(180px,1.6fr) 124px minmax(150px,1.2fr) ${months.map(() => '88px').join(' ')} 108px`;
  const sortHead = (k, label, align) => (
    <button type="button" className={`fin-head-btn${align === 'right' ? ' right' : ''}`} onClick={() => setSortKey(k)}>
      {label}{sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );


  return (
    <div className="fin-page">
      <style>{`
        .fin-page { display: flex; flex-direction: column; min-height: calc(100vh - 56px); background: #f5f7fa; }
        .fin-header { background: #fff; padding: 32px 32px 16px; }
        .fin-title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .fin-title { display: flex; align-items: baseline; gap: 12px; }
        .fin-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .fin-title span { font-size: 14px; color: #64748b; }
        .fin-title-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .fin-title-actions .dashboard-view-toggle { margin-bottom: 0; }
        .fin-title-actions .dashboard-view-toggle button { height: 32px; padding: 0 18px; font-size: 13px; }
        .fin-outline-btn:disabled { color: #94a3b8; cursor: not-allowed; }
        .fin-outline-btn { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; background: #fff; border: 1px solid #dde1e7; border-radius: 6px; color: #334155; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .fin-controls-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .fin-insights { padding: 24px 32px; }
        .fin-insights .stats-grid { margin-bottom: 24px; }
        .fin-card-name { margin: 6px 0 0; font-size: 0.85rem; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fin-chart-card { background: #fff; border-radius: 10px; border: 1px solid #f1f5f9; box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05); padding: 18px 20px; display: flex; flex-direction: column; }
        .fin-chart-card h3 { margin: 0 0 14px; font-size: 1rem; font-weight: 700; text-align: center; color: #1a2332; padding-bottom: 12px; border-bottom: 2px solid #e3f2fd; }
        .fin-chart-box { position: relative; height: 300px; }

        .fin-table-wrap { overflow-x: auto; background: #fff; border-top: 1px solid #dde1e7; }
        .fin-table { min-width: 1000px; }
        .fin-head, .fin-row { display: grid; align-items: center; padding: 0 12px; box-sizing: border-box; }
        .fin-head { height: 45px; background: #1976d2; color: #fff; font-size: 13px; font-weight: 600; }
        .fin-head > div { padding: 0 10px; }
        .fin-head-btn { background: none; border: none; color: inherit; font: inherit; cursor: pointer; text-align: left; padding: 0; }
        .fin-head-btn.right { text-align: right; width: 100%; }
        .fin-row { font-size: 13px; color: #64748b; border-bottom: 1px solid #dde1e7; background: #fff; }
        .fin-row.alt { background: #f8fafc; }
        .fin-row.clickable { cursor: pointer; }
        .fin-row.clickable:hover { background: #e3f2fd; }
        .fin-row > div { padding: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fin-name { font-weight: 500; color: #111827; }
        .fin-num { text-align: right; font-variant-numeric: tabular-nums; }
        .fin-num.dim { color: #cbd5e1; }
        .fin-total { font-weight: 700; color: #111827; }
        .fin-muted { color: #94a3b8; }
        .fin-group-row { background: #e3f2fd; color: #0f172a; font-weight: 700; border-bottom: 1px solid #bcd6f2; }
        .fin-group-count { font-weight: 500; color: #64748b; }
        .fin-group-total { color: #1565c0; }
        .fin-footer { display: flex; align-items: center; justify-content: space-between; height: 42px; padding: 0 16px; background: #f8fafc; border-top: 1px solid #dde1e7; font-size: 11px; color: #64748b; }
        .fin-empty { padding: 48px 20px; text-align: center; color: #94a3b8; font-size: 14px; background: #fff; }

      `}</style>

      <div className="fin-header">
        <div className="fin-title-row">
          <div className="fin-title">
            <h1>Finance</h1>
          </div>
          <div className="fin-title-actions">
            {viewToggle}
            <button type="button" className="fin-outline-btn" onClick={exportCsv} disabled={!raw}>Export CSV</button>
            <button type="button" className="fin-outline-btn" onClick={resetFilters}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
              Reset Filters
            </button>
          </div>
        </div>

        <div className="fin-controls-row">
          <OdooSearchBar
            variant="boxed"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resource name or mobile..."
            chips={filterChips}
          />
          <div className="member-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              advancedContent={advancedFiltersPanel}
              groupByOptions={GROUP_BY_OPTIONS}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              showViewToggle={false}
            />
            <FavoritesMenu favorites={favorites} onApply={applyFavorite} onDelete={deleteFavorite} onSave={saveFavorite} />
          </div>
        </div>

      </div>

      {error ? (
        <div style={{ padding: 32, color: '#b91c1c', background: '#fff', flex: 1 }}>{error}</div>
      ) : !raw ? (
        <div style={{ height: "220px", display: "flex" }}>
          <TableLoadingSpinner label="Loading finance data…" />
        </div>
      ) : (
      <>
      <div className="fin-insights">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="card-icon blue"><FaRupeeSign size={28} /></div>
            <div className="card-label">Total Paid</div>
            <div className="card-value">{inr(stats.total)}</div>
          </div>
          <div className="stat-card">
            <div className="card-icon applied"><FaChartLine size={28} /></div>
            <div className="card-label">Avg Earning</div>
            <div className="card-value">{inr(stats.average)}</div>
          </div>
          <div className="stat-card">
            <div className="card-icon new"><FaTrophy size={28} /></div>
            <div className="card-label">Highest Earner</div>
            <div className="card-value">{stats.top ? inr(stats.top.amount) : '–'}</div>
            {stats.top && <div className="card-label fin-card-name" title={stats.top.name}>{stats.top.name}</div>}
          </div>
          <div className="stat-card">
            <div className="card-icon quarter"><FaArrowDown size={28} /></div>
            <div className="card-label">Lowest Earner (Paid)</div>
            <div className="card-value">{stats.low ? inr(stats.low.amount) : '–'}</div>
            {stats.low && <div className="card-label fin-card-name" title={stats.low.name}>{stats.low.name}</div>}
          </div>
        </div>

        <div className="fin-chart-card">
          <h3>Month-wise Payout</h3>
          <div className="fin-chart-box">
            <Bar
              data={{
                labels: monthly.map((m) => monthLabel(m.month)),
                datasets: [{ data: monthly.map((m) => m.total), backgroundColor: monthly.map((m) => (selectedSet.has(m.month) ? '#1976d2' : '#bbdefb')), borderRadius: 4 }],
              }}
              options={MONTH_BAR_OPTIONS}
            />
          </div>
        </div>
      </div>

      <div className="fin-table-wrap">
        <div className="fin-table">
          <div className="fin-head" style={{ gridTemplateColumns: gridTemplate }}>
            <div>{sortHead('name', 'Resource')}</div>
            <div>{sortHead('mobile', 'Mobile')}</div>
            <div>Location</div>
            {months.map((m) => (<div key={m}>{sortHead(m, monthLabel(m), 'right')}</div>))}
            <div>{sortHead('amount', 'Total', 'right')}</div>
          </div>
          {items.length === 0 ? (
            <div className="fin-empty">No resources match your filters</div>
          ) : (
            <TableList
              height={Math.min(items.length * ROW_HEIGHT, 560)}
              width="100%"
              itemCount={items.length}
              itemSize={ROW_HEIGHT}
              itemKey={(index, data) => data.items[index].id}
              itemData={{ items, months, selectedSet, onRowClick: (member) => onMemberClick?.(member), gridTemplate }}
            >
              {TableRow}
            </TableList>
          )}
          <div className="fin-footer">
            <span>{stats.resources.toLocaleString('en-IN')} resources · click a row to open the member</span>
            <span>Total {inr(stats.total)}</span>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
