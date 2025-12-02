// src/components/FilterSidebar.jsx
export default function FilterSidebar({ filterData, filterKeys, pageKey }) {
  const { filters, availableOptions, handleFilterChange, clearFilters } = filterData;

  const placeholderOptions = {
    TempStaffPage: {
      Company: ["Tata Power", "Adani Group", "L&T"],
      Role: ["Consultant", "Admin", "Technical"],
      Duration: ["3 months", "6 months", "1 year"],
      Status: ["In Progress", "Completed", "New"]
    },
    RecruitmentPage: {
      Company: ["Reliance", "Infosys", "Wipro"],
      Position: ["Head", "Manager", "Analyst"],
      Location: ["Mumbai", "Bangalore", "Delhi"],
      Status: ["Open", "Filled", "Hold"]
    },
    ProjectsPage: {
      Client: ["DRDO", "DICCI", "Govt of India"],
      Domain: ["Training", "Mentorship", "IT"],
      Status: ["Active", "Completed", "Planning"]
    }
  };

  const isMemberPage = pageKey === "memberlist";
  const options = isMemberPage ? availableOptions : placeholderOptions[pageKey] || {};
  const keys = isMemberPage ? filterKeys : Object.keys(options);

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
            <option value="All">All {key}</option>
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