// src/components/FilterSidebar.jsx
export default function FilterSidebar({ filterData, filterKeys }) {
  const { filters, handleFilterChange, clearFilters, options = {} } = filterData;

  const keys = filterKeys.length > 0 ? filterKeys : Object.keys(options);

  return (
    <div className="filter-sidebar">
      <div className="filter-header">
        <h3>Filters</h3>
        <button className="clear-all" onClick={clearFilters}>
          Clear All
        </button>
      </div>

      {keys.map((key) => (
        <div key={key} className="filter-section">
          <h4>{key.replace(/([A-Z])/g, " $1").trim()}</h4>
          <select
            className="filter-select"
            value={filters[key] || "All"}
            onChange={(e) => handleFilterChange(key, e.target.value)}
          >
            {(options[key] || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}