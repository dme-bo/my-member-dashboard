// src/pages/MemberListPage.jsx
import { useSearchParams } from "react-router-dom"; // Add this import at the top
import { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";

export default function MemberListPage({ onMemberClick, filterData, filterKeys }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");
  const [members, setMembers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isFilterOpen, setIsFilterOpen] = useState(false); // Mobile filter toggle

  const [searchParams, setSearchParams] = useSearchParams();

// Load state from URL on first render
useEffect(() => {
  const page = parseInt(searchParams.get("page") || "1", 10);
  const rows = parseInt(searchParams.get("rows") || "10", 10);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";

  setCurrentPage(page);
  setRowsPerPage(rows);
  setSearchTerm(search);
  setFilterPlaced(status);
}, []); // Empty dependency → runs only once on mount

// Update URL whenever any state changes
useEffect(() => {
  const params = new URLSearchParams();
  if (currentPage > 1) params.set("page", currentPage.toString());
  if (rowsPerPage !== 10) params.set("rows", rowsPerPage.toString());
  if (searchTerm) params.set("search", searchTerm);
  if (filterPlaced !== "all") params.set("status", filterPlaced);

  setSearchParams(params, { replace: true });
}, [currentPage, rowsPerPage, searchTerm, filterPlaced, setSearchParams]);

  const { applyFilters } = filterData;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMembers(membersList);
        // Added: Log all members to console
        console.log("All members from Firestore:", membersList);
        setCurrentPage(1);
      },
      (error) => {
        console.error("Error fetching users from Firestore:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  const filteredMembers = useMemo(() => {
    let list = members.filter((member) => {
      const term = searchTerm.toLowerCase();
      const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim().toLowerCase();
      const email = member.email?.toLowerCase() || "";
      const phone = member.phone_number || "";

      return (
        fullName.includes(term) ||
        email.includes(term) ||
        phone.includes(searchTerm)
      );
    });

    if (filterPlaced === "placed") {
      // list = list.filter(m => m.isPlaced === true);
    } else if (filterPlaced === "active") {
      // list = list.filter(m => m.isPlaced !== true);
    }

    return applyFilters(list);
  }, [members, searchTerm, filterPlaced, applyFilters]);

  const totalItems = filteredMembers.length;
  const totalPages = Math.ceil(totalItems / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalItems);
  const currentPageData = filteredMembers.slice(startIndex, endIndex);

  const handleRowsPerPageChange = (e) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const goToPrevious = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  const toggleFilter = () => setIsFilterOpen(!isFilterOpen);

  // Empty state
  if (members.length === 0) {
    return (
      <div className="member-list-page with-filters">
        <div className="page-header">
          <div className="header-title">
            <h1>Member Details :- 0</h1>
          </div>
          <div className="header-actions">
            <select className="status-dropdown" value={filterPlaced} onChange={(e) => setFilterPlaced(e.target.value)}>
              <option value="all">All Members</option>
              <option value="active">Active Seekers</option>
              <option value="placed">Placed</option>
            </select>
            <button className="btn-purple">Export CSV</button>
          </div>
          <button className="filter-toggle-btn" onClick={toggleFilter}>
            Filters {isFilterOpen ? "▲" : "▼"}
          </button>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Search by Name, Mobile, Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="big-search-input"
          />
        </div>

        <div className="content-with-sidebar responsive">
          <div className="table-container">
            <div className="table-wrapper responsive-table">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile</th>
                    <th>Rank</th>
                    <th>Service</th>
                    <th>Location</th>
                    <th>Applied</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} className="empty-message">
                      No members found
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="custom-pagination">
              <div className="rows-per-page">
                <span>Rows per page</span>
                <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="page-info">0–0 of 0</div>
              <div className="page-navigation">
                <button className="nav-btn" disabled>‹</button>
                <button className="nav-btn" disabled>›</button>
              </div>
            </div>
          </div>

          <div className={`filter-sidebar-mobile ${isFilterOpen ? "open" : ""}`}>
            <FilterSidebar filterData={filterData} filterKeys={filterKeys} pageKey="memberlist" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <div className="header-title">
          <h1>Member Details :- {totalItems}</h1>
        </div>
        <div className="header-actions">
          <select
            value={filterPlaced}
            onChange={(e) => {
              setFilterPlaced(e.target.value);
              setCurrentPage(1);
            }}
            className="status-dropdown"
          >
            <option value="all">All Members</option>
            <option value="active">Active Seekers</option>
            <option value="placed">Placed</option>
          </select>
          <button className="btn-purple">Export CSV</button>
        </div>

        {/* Mobile Filter Toggle */}
        <button className="filter-toggle-btn" onClick={toggleFilter}>
          Filters {isFilterOpen ? "▲" : "▼"}
        </button>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="big-search-input"
        />
      </div>

      <div className="content-with-sidebar responsive">
        {/* Main Table */}
        <div className="table-container">
          <div className="table-wrapper responsive-table">
            <table className="members-table">
              <thead>
                <tr>
                  <th className="sticky-name">Name</th>
                  <th>Mobile</th>
                  <th>Rank</th>
                  <th>Service</th>
                  <th>Location</th>
                  <th>Applied</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentPageData.length > 0 ? (
                  currentPageData.map((member) => (
                    <tr
                      key={member.id}
                      onClick={() => onMemberClick(member)}
                      className="member-row clickable"
                    >
                      <td className="sticky-name">
                        <div className="member-name">
                          {member.first_name || ""} {member.last_name || ""}
                        </div>
                        <small className="member-email">{member.email || "-"}</small>
                      </td>
                      <td>{member.phone_number || "-"}</td>
                      <td>{member.rank || "-"}</td>
                      <td>{member.service || member.organization || "-"}</td>
                      <td>{member.city || "-"}</td>
                      <td><strong>0</strong></td>
                      <td><span className="status active">Active</span></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-message">
                      No members match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="custom-pagination">
            <div className="rows-per-page">
              <span>Rows per page</span>
              <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="page-info">
              {startIndex + 1}–{endIndex} of {totalItems}
            </div>

            <div className="page-navigation">
              <button onClick={goToPrevious} disabled={currentPage === 1} className="nav-btn">
                ‹
              </button>
              <button onClick={goToNext} disabled={currentPage === totalPages || totalItems === 0} className="nav-btn">
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar + Mobile Drawer */}
        <div className="filter-sidebar-desktop">
          <FilterSidebar filterData={filterData} filterKeys={filterKeys} pageKey="memberlist" />
        </div>

        <div className={`filter-sidebar-mobile ${isFilterOpen ? "open" : ""}`}>
          <div className="mobile-filter-header">
            <h3>Filters</h3>
            <button onClick={toggleFilter} className="close-filter-btn">✕</button>
          </div>
          <FilterSidebar filterData={filterData} filterKeys={filterKeys} pageKey="memberlist" />
        </div>
      </div>

      {/* Mobile Overlay when filters open */}
      {isFilterOpen && <div className="mobile-filter-overlay" onClick={toggleFilter}></div>}
    </div>
  );
}