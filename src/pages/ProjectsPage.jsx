// src/pages/ProjectsPage.jsx
import { useState, useEffect } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";

export default function ProjectsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});

  // Search and Pagination States
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "projectusersmaster"), orderBy("created_time", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setApplications(data);
      } catch (error) {
        console.error("Error fetching applications:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchApplications();
  }, []);

  // Generate filter options with "All" as first option
  const cityOptions = ["All", ...new Set(applications.map(app => app.city).filter(Boolean))].sort((a, b) => {
    if (a === "All") return -1;
    if (b === "All") return 1;
    return a.localeCompare(b);
  });

  const projectOptions = ["All", ...new Set(applications.map(app => app.projects).filter(Boolean))].sort((a, b) => {
    if (a === "All") return -1;
    if (b === "All") return 1;
    return a.localeCompare(b);
  });

  const options = {
    city: cityOptions,
    projects: projectOptions,
  };

  const filterKeys = ["city", "projects"];

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === "All" ? undefined : value
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Filtering & Searching + Alphabetical Sorting
  let filteredAndSortedApplications = applications.filter(app => {
    const matchesFilters = filterKeys.every(key => {
      if (!filters[key]) return true;
      return app[key] === filters[key];
    });

    const searchStr = searchTerm.toLowerCase();
    const matchesSearch =
      (app.full_name || "").toLowerCase().includes(searchStr) ||
      (app.phone_number || "").toLowerCase().includes(searchStr) ||
      (app.city || "").toLowerCase().includes(searchStr);

    return matchesFilters && matchesSearch;
  });

  // Sort filtered results alphabetically by full_name
  filteredAndSortedApplications.sort((a, b) => {
    const nameA = (a.full_name || "").trim().toLowerCase();
    const nameB = (b.full_name || "").trim().toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  // Pagination based on sorted and filtered data
  const totalPages = Math.ceil(filteredAndSortedApplications.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredAndSortedApplications.slice(indexOfFirstRow, indexOfLastRow);

  const filterData = {
    filters,
    handleFilterChange,
    clearFilters,
    options,
  };

  return (
    <div className="member-list-page with-filters">
      <div className="page-headers" style={{ marginBottom: "20px" }}>
  {/* Top Row: Title + Total Counter */}
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "15px",
    marginBottom: "20px"
  }}>
    <h1 style={{ margin: 0 }}>Project Applications</h1>
    
    <div style={{
      backgroundColor: "#eee",
      color: "white",
      padding: "12px 24px",
      borderRadius: "12px",
      fontSize: "20px",
      fontWeight: "700",
      boxShadow: "0 4px 12px rgba(30, 64, 175, 0.3)",
      minWidth: "200px",
      textAlign: "center",
      color: "black"
    }}>
      Total Applications : <strong>{loading ? "—" : filteredAndSortedApplications.length}</strong>
    </div>
  </div>

  {/* Search Bar - Directly Below the Title */}
  <div className="search-box-container" style={{ maxWidth: "600px", width: "100%" }}>
    <input
      type="text"
      className="big-search-input"
      placeholder="Search by name, phone, or city..."
      value={searchTerm}
      onChange={(e) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
      }}
      style={{
        padding: "15px 19px",
        width: "100%",
        borderRadius: "8px",
        border: "1px solid #ccc",
        fontSize: "17px",
        backgroundColor: "white",
      }}
      autoFocus
    />
  </div>
</div>

      <div className="content-with-sidebar">
        <div className="table-container">
          {loading ? (
            <div className="loading-state" style={{ padding: "60px", textAlign: "center", fontSize: "18px" }}>
              Loading applications...
            </div>
          ) : (
            <>
              {/* FIXED HEIGHT TABLE WRAPPER */}
              <div
                className="table-wrapper"
                style={{
                  height: "70vh",
                  minHeight: "400px",
                  overflowY: "auto",
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  position: "relative",
                  background: "#fff",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                  }}
                >
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "25%" }} />
                  </colgroup>

                  <thead
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      background: "#f9f9f9",
                      borderBottom: "2px solid #ddd",
                    }}
                  >
                    <tr>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Full Name</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Phone</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>City</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Project</th>
                    </tr>
                  </thead>

                  <tbody>
                    {currentRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          style={{
                            padding: "80px 20px",
                            textAlign: "center",
                            color: "#666",
                            fontSize: "18px",
                          }}
                        >
                          <div>No applications found.</div>
                          <div style={{ fontSize: "14px", marginTop: "10px", color: "#999" }}>
                            Try adjusting your search or filters.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      currentRows.map((app) => (
                        <tr key={app.id} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={{ padding: "12px" }}>{app.full_name || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.phone_number || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.city || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.projects || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div
                className="pagination-controls"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "20px 10px",
                  flexWrap: "wrap",
                  gap: "15px",
                  marginTop: "10px",
                }}
              >
                <div className="rows-per-page" style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ marginRight: "10px", fontSize: "14px" }}>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>

                <div className="pagination-nav" style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    style={{
                      padding: "8px 14px",
                      fontSize: "16px",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer",
                      opacity: currentPage === 1 ? 0.5 : 1,
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      background: "#1e40af",
                      color: "#fff",
                    }}
                  >
                    ‹ Previous
                  </button>

                  <span style={{ fontSize: "15px", fontWeight: "500" }}>
                    Page {currentPage} of {totalPages || 1}
                  </span>

                  <button
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(p => p + 1)}
                    style={{
                      padding: "8px 14px",
                      fontSize: "16px",
                      cursor: (currentPage === totalPages || totalPages === 0) ? "not-allowed" : "pointer",
                      opacity: (currentPage === totalPages || totalPages === 0) ? 0.5 : 1,
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      background: "#1e40af",
                      color: "#fff",
                    }}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* FILTER SIDEBAR */}
        <FilterSidebar filterData={filterData} filterKeys={filterKeys} />
      </div>
    </div>
  );
}