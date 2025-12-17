// src/components/FilterSidebar.jsx
export default function FilterSidebar({ filterData, filterKeys, pageKey }) {
  const { filters, handleFilterChange, clearFilters } = filterData;

  // Updated placeholder options with memberlist support
  const placeholderOptions = {
    TempStaffPage: {
      Service: ["Indian Army", "Indian Navy", "Indian Air Force", "BSF/CRPF", "Others"],
      "Rank Level": ["Senior Officers", "Mid-Level Officers", "Junior Officers", "JCOs & Below"],
      State: ["Delhi/NCR", "Maharashtra", "Karnataka", "Gujarat", "Rajasthan", "Punjab", "Tamil Nadu", "Others"],
      "Preferred Role": [
        "Security Consultant", "Admin Support", "Technical Advisor", "Project Coordinator",
        "Risk Assessment Lead", "Training Instructor", "Facility Manager", "Protocol Officer"
      ],
      Status: ["New", "Contacted", "Interviewed", "Shortlisted", "Placed", "On Hold", "Not Interested"],
      Rating: ["5 Stars", "4 Stars", "3 Stars", "2 Stars", "1 Star", "Not Rated"],
    },
    memberlist: {
      Service: ["Indian Army", "Indian Navy", "Indian Air Force", "BSF/CRPF", "Military"],
      Rank: ["Colonel", "Major", "Captain", "Lieutenant", "JCO", "Other"],
      Location: ["Delhi/NCR", "Mumbai", "Bangalore", "Chennai", "Pune", "Others"],
      Status: ["Active", "Placed", "Inactive"],
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
    // ... other pages
  };

  const options = placeholderOptions[pageKey] || {};

  // Use filterKeys if provided, else auto from options
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