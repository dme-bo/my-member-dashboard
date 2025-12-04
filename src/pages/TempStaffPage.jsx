// src/pages/TempStaffPage.jsx
import { useState, useMemo } from "react";
import FilterSidebar from "../components/FilterSidebar";
import MemberDetailModal from "../components/MemberDetailModal";
import { membersData } from "../data/membersData";

export default function TempStaffPage() {
  const [selectedMember, setSelectedMember] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");        // ← NEW: Search state
  const [filters, setFilters] = useState({});

  // Combined search + filter logic
  const filteredMembers = useMemo(() => {
    let list = membersData;

    // 1. Apply Search First
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((member) => {
        return (
          member["Full Name"]?.toLowerCase().includes(term) ||
          member["Mobile Number"]?.includes(searchTerm) ||
          member["Member Id"]?.toLowerCase().includes(term) ||
          member["Email"]?.toLowerCase().includes(term)
        );
      });
    }

    // 2. Then Apply Sidebar Filters
    return list.filter((member) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value || value === "All") return true;

        if (key === "Service") return member["Service"] === value;
        if (key === "State") return member["State"] === value;
        if (key === "Rank") return member["Rank"] === value;
        if (key === "Rating") {
          const ratingMap = { "5": "Excellent", "4": "Good", "3": "Average", "2": "Below Average", "1": "Poor" };
          return member["Rating"] === (ratingMap[value] || value);
        }
        if (key === "Temp Staff Role") return true; // keep as-is

        return String(member[key] || "").toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [searchTerm, filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === "All" ? "" : value,
    }));
  };

  const clearFilters = () => setFilters({});

  const openModal = (member) => setSelectedMember(member);
  const closeModal = () => setSelectedMember(null);

  const filterConfig = {
    Service: ["Army", "Air Force", "Navy"],
    Rank: ["Colonel", "Lt Colonel", "Squadron Leader", "Captain", "Major", "Wing Commander"],
    State: ["Delhi", "Maharashtra", "Karnataka", "Gujarat", "Tamil Nadu", "Punjab", "Rajasthan"],
    Rating: ["Excellent", "Good", "Average", "Below Average", "Poor"],
    "Manpower Type": ["Vendor Manpower", "Brisk Olive Manpower"],
  };

  const filterData = { filters, handleFilterChange, clearFilters };

  return (
    <div className="member-list-page with-filters">
      {/* Header */}
      <div className="page-header">
        <h1>Temporary Staff Applications</h1>
      </div>

      {/* SEARCH BAR - Added Here */}
      <div className="search-section" style={{ margin: "16px 0" }}>
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email, or Member ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="big-search-input"
          autoFocus
        />
      </div>

      <div className="content-with-sidebar">
        {/* Table */}
        <div className="table-container">
          <div className="table-wrapper">
            <table className="temp-staff-table clean">
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Full Name</th>
                  <th>Mobile</th>
                  <th>Service</th>
                  <th>Rank</th>
                  <th>State</th>
                  <th>Temp Staff Role</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                      {searchTerm || Object.keys(filters).length > 0
                        ? "No members found matching your search and filters"
                        : "No temporary staff applications yet"}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      key={member["Member Id"]}
                      className="clickable-row"
                      onClick={() => openModal(member)}
                      style={{ cursor: "pointer" }}
                    >
                      <td><strong>{member["Member Id"]}</strong></td>
                      <td>
                        <strong>{member["Full Name"]}</strong><br />
                        <small style={{ color: "#666" }}>{member["Email"]}</small>
                      </td>
                      <td>{member["Mobile Number"]}</td>
                      <td>{member["Service"]}</td>
                      <td><strong>{member["Rank"]}</strong></td>
                      <td>{member["State"]}</td>
                      <td>
                        <span className="temp-role-badge">
                          {member["Tags"]?.includes("Leadership") ? "Leadership / Consultant" :
                           member["Tags"]?.includes("Technical") ? "Technical Advisor" :
                           member["Work Experience"]?.includes("HR") ? "HR/Admin" :
                           "General Support"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Filter Sidebar */}
        <FilterSidebar
          filterData={filterData}
          filterKeys={Object.keys(filterConfig)}
          pageKey="TempStaffPage"
          customOptions={filterConfig}
        />
      </div>

      {/* Modal */}
      {selectedMember && <MemberDetailModal member={selectedMember} onClose={closeModal} />}
    </div>
  );
}