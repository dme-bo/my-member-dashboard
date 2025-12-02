// src/pages/MemberListPage.jsx
import { useState, useMemo } from "react";
import membersData from "../data/membersData";
import FilterSidebar from "../components/FilterSidebar";


export default function MemberListPage({ onMemberClick, filterData, filterKeys }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");
  const { applyFilters } = filterData;

  const filteredMembers = useMemo(() => {
    let list = membersData.filter((member) => {
      const term = searchTerm.toLowerCase();
      return (
        member["Full Name"]?.toLowerCase().includes(term) ||
        member["Mobile Number"]?.includes(searchTerm) ||
        member["Member Id"]?.toLowerCase().includes(term) ||
        member["Email"]?.toLowerCase().includes(term)
      );
    });

    if (filterPlaced !== "all") {
      list = list.filter((m) =>
        filterPlaced === "placed" ? m["Placed by BO"] === "Yes" : m["Placed by BO"] === "No"
      );
    }

    return applyFilters(list);
  }, [searchTerm, filterPlaced, applyFilters]);

  return (
    <div className="member-list-page">
      {/* Header */}
      <div className="page-header">
        <h1>Member Details</h1>

        <div className="header-actions">
          <select
            className="styled-select"
            value={filterPlaced}
            onChange={(e) => setFilterPlaced(e.target.value)}
          >
            <option value="all">All Members</option>
            <option value="active">Active Seekers</option>
            <option value="placed">Placed</option>
          </select>

          <button className="btn-purple">Export CSV</button>
        </div>
      </div>

      {/* Search */}
      <div className="search-section">
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email, ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Table + Sidebar */}
      <div className="content-with-sidebar">
        <div className="table-container">
          <div className="table-wrapper">
            <table className="members-table">
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Name</th>
                  <th>Rank</th>
                  <th>Service</th>
                  <th>Mobile</th>
                  <th>Location</th>
                  <th>Applied</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    key={member["Member Id"]}
                    onClick={() => onMemberClick(member)}
                    className="table-row-hover"
                  >
                    <td>
                      <strong>{member["Member Id"]}</strong>
                    </td>
                    <td>
                      <div className="member-name">{member["Full Name"]}</div>
                      <small className="member-email">{member["Email"]}</small>
                    </td>
                    <td>{member["Rank"]}</td>
                    <td>{member["Service"]}</td>
                    <td>{member["Mobile Number"]}</td>
                    <td>{member["City"]}</td>
                    <td>
                      <strong>{member["No of Jobs Applied"] || 0}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          member["Placed by BO"] === "Yes" ? "placed" : "active"
                        }`}
                      >
                        {member["Placed by BO"] === "Yes" ? "Placed" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <FilterSidebar
          filterData={filterData}
          filterKeys={filterKeys}
          pageKey="memberlist"
        />
      </div>
    </div>
  );
}