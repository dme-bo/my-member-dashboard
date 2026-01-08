// src/pages/MemberListPage.jsx
import { useSearchParams } from "react-router-dom";
import { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";
import * as XLSX from "xlsx"; // ← Required for Excel export

export default function MemberListPage({ onMemberClick }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");
  const [members, setMembers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [sidebarFilters, setSidebarFilters] = useState({
    Gender: "All",
    Category: "All",
    Service: "All",
    Rank: "All",
    Level: "All",
    Trade: "All",
    City: "All",
    State: "All",
    Education: "All",
    Status: "All",
    "Placement Status": "All",
    Experience: "All",
  });

  const [searchParams, setSearchParams] = useSearchParams();

  // Load URL params on mount
  useEffect(() => {
    const page = parseInt(searchParams.get("page") || "1", 10);
    const rows = parseInt(searchParams.get("rows") || "100", 10);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all";

    setCurrentPage(page);
    setRowsPerPage(rows);
    setSearchTerm(search);
    setFilterPlaced(status);
  }, []);

  // Sync state to URL (skip saving "All" rows to URL)
  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPage > 1) params.set("page", currentPage.toString());
    if (rowsPerPage !== 100 && rowsPerPage !== 999999) params.set("rows", rowsPerPage.toString());
    if (searchTerm) params.set("search", searchTerm);
    if (filterPlaced !== "all") params.set("status", filterPlaced);

    setSearchParams(params, { replace: true });
  }, [currentPage, rowsPerPage, searchTerm, filterPlaced, setSearchParams]);

  // Fetch members from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "usersmaster" || "users"),
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setMembers(membersList);
        setCurrentPage(1);
      },
      (error) => {
        console.error("Error fetching users from Firestore:", error);
      }
    );
    return () => unsubscribe();
  }, []);
  

  // Dynamic filter options
  const filterOptions = useMemo(() => {
    const getUniqueValues = (field) => {
      const set = new Set();
      members.forEach((member) => {
        let value = member[field];
        if (value) {
          value = String(value).trim();
          if (field === "gender") {
            if (value.toLowerCase() === "male") value = "Male";
            else if (value.toLowerCase() === "female") value = "Female";
          }
          set.add(value);
        }
      });
      return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    };

    const experiences = members
      .map((m) => parseFloat(m.experience))
      .filter((exp) => !isNaN(exp) && exp >= 0);

    let buckets = ["All"];
    if (experiences.length === 0) {
      buckets = ["All", "0-1 yr", "1-3 yrs", "3-5 yrs", "5-10 yrs", "10+ yrs"];
    } else {
      const maxExp = Math.max(...experiences);
      const ceiling = Math.ceil(maxExp / 5) * 5;
      if (ceiling >= 1) buckets.push("0-1 yr");
      if (ceiling >= 3) buckets.push("1-3 yrs");
      if (ceiling >= 5) buckets.push("3-5 yrs");
      if (ceiling >= 10) buckets.push("5-10 yrs");
      if (ceiling >= 15) buckets.push("10-15 yrs");
      if (ceiling >= 20) buckets.push("15-20 yrs");
      if (ceiling >= 25) buckets.push("20-25 yrs");
      if (ceiling >= 30) buckets.push("25-30 yrs");
      if (ceiling > 30) buckets.push("30+ yrs");
      else if (ceiling >= 10) buckets.push(`${Math.max(10, ceiling - 5)}+ yrs`);
    }

    return {
      Gender: getUniqueValues("gender"),
      Category: getUniqueValues("category"),
      Service: getUniqueValues("service"),
      Rank: getUniqueValues("rank"),
      Level: getUniqueValues("level"),
      Trade: getUniqueValues("trade"),
      City: getUniqueValues("city"),
      State: getUniqueValues("state"),
      Education: getUniqueValues("graduation_course"),
      Status: getUniqueValues("status"),
      "Placement Status": ["All", "Placed", "Active"],
      Experience: buckets,
    };
  }, [members]);

  const handleFilterChange = (key, value) => {
    setSidebarFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSidebarFilters({
      Gender: "All",
      Category: "All",
      Service: "All",
      Rank: "All",
      Level: "All",
      Trade: "All",
      City: "All",
      State: "All",
      Education: "All",
      Status: "All",
      "Placement Status": "All",
      Experience: "All",
    });
    setCurrentPage(1);
  };

  const parseExperienceRange = (range) => {
    if (range === "All") return null;
    if (range.includes("+")) {
      const min = parseFloat(range.replace("+ yrs", "").trim());
      return { min, max: Infinity };
    }
    const [minStr, maxStr] = range.replace(" yrs", "").split("-");
    return { min: parseFloat(minStr), max: parseFloat(maxStr) };
  };

  // Filtered + Sorted Members (Robust Alphabetical A → Z)
  const filteredMembers = useMemo(() => {
    let list = [...members];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter((member) => {
        const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim().toLowerCase();
        const email = member.email?.toLowerCase() || "";
        const phone = member.phone_number || "";
        return fullName.includes(term) || email.includes(term) || phone.includes(term);
      });
    }

    // Placed filter
    if (filterPlaced === "placed") {
      list = list.filter((m) => m.isPlaced === true);
    } else if (filterPlaced === "active") {
      list = list.filter((m) => m.isPlaced !== true);
    }

    // Sidebar filters
    const fieldMap = {
      Gender: "gender",
      Category: "category",
      Service: "service",
      Rank: "rank",
      Level: "level",
      Trade: "trade",
      City: "city",
      State: "state",
      Education: "graduation_course",
    };

    Object.entries(sidebarFilters).forEach(([key, value]) => {
      if (value !== "All") {
        if (key === "Placement Status") {
          const isPlacedVal = value === "Placed";
          list = list.filter((member) => member.isPlaced === isPlacedVal);
        } else if (key === "Experience") {
          const range = parseExperienceRange(value);
          if (range) {
            list = list.filter((member) => {
              const exp = parseFloat(member.experience);
              if (isNaN(exp)) return false;
              return exp >= range.min && (range.max === Infinity || exp <= range.max);
            });
          }
        } else {
          const dbField = fieldMap[key];
          if (dbField) {
            list = list.filter((member) => {
              const memberValue = member[dbField];
              if (!memberValue) return false;
              return String(memberValue).toLowerCase() === value.toLowerCase();
            });
          }
        }
      }
    });

    // Improved Alphabetical Sort (A → Z)
    list.sort((a, b) => {
      const getName = (member) => {
        const full = `${member.first_name || ""} ${member.last_name || ""}`.trim();
        if (full) return full;
        if (member.full_name) return member.full_name.trim();
        return "ZZZ_NO_NAME"; // Push nameless to bottom
      };

      const nameA = getName(a).toLowerCase();
      const nameB = getName(b).toLowerCase();

      return nameA.localeCompare(nameB);
    });

    return list;
  }, [members, searchTerm, filterPlaced, sidebarFilters]);

  // Pagination logic with "All" support
  const totalItems = filteredMembers.length;
  const isAllRows = rowsPerPage === 999999;
  const totalPages = isAllRows ? 1 : Math.ceil(totalItems / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = isAllRows ? totalItems : Math.min(startIndex + rowsPerPage, totalItems);
  const currentPageData = filteredMembers.slice(startIndex, endIndex);

  const handleRowsPerPageChange = (e) => {
    const value = Number(e.target.value);
    setRowsPerPage(value);
    setCurrentPage(1);
  };

  const goToPrevious = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);
  const toggleFilter = () => setIsFilterOpen(!isFilterOpen);

  const filterData = {
    filters: sidebarFilters,
    handleFilterChange,
    clearFilters,
    options: filterOptions,
  };

  const filterKeys = [
    "Gender",
    "Category",
    "Service",
    "Rank",
    "Level",
    "Trade",
    "State",
    "City",
    "Education",
    "Experience",
  ];

  // Export to Excel (XLSX)
  const handleExportXLSX = () => {
    const dataToExport = filteredMembers.map((member) => ({
      Name: `${member.first_name || ""} ${member.last_name || ""}`.trim() || member.full_name || "No Name",
      Mobile: member.phone_number || "",
      Email: member.email || "",
      Category: member.category || "",
      Service: member.service || "",
      Rank: member.rank || "",
      Gender: member.gender || "",
      State: member.state || "",
      City: member.city || "",
      Education: member.graduation_course || "",
      Experience: member.experience || "",
      Status: member.status || "",
      "Placement Status": member.isPlaced ? "Placed" : "Active",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    worksheet["!cols"] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 10;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cell = worksheet[XLSX.utils.encode_cell({ c: C, r: R })];
        if (cell && cell.v) {
          const length = String(cell.v).length;
          maxWidth = Math.max(maxWidth, length);
        }
      }
      worksheet["!cols"][C] = { wch: Math.min(maxWidth + 2, 60) };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Members");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Members_${today}.xlsx`);
  };

  // Loading state
  if (members.length === 0) {
    return (
      <div className="member-list-page with-filters">
        <div className="page-header">
          <div className="header-title">
            <h1>Total Members:- 0</h1>
          </div>
          <div className="header-actions">
            <button className="btn-purple" disabled>Export XLSX</button>
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
                    <th className="sticky-name">Name</th>
                    <th>Mobile</th>
                    <th>Category</th>
                    <th>Service</th>
                    <th>Rank</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="empty-message">
                      Loading members...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <div className="header-title">
          <h1>Total Members:- {totalItems}</h1>
        </div>
        <div className="header-actions">
          <button className="btn-purple" onClick={handleExportXLSX}>
            Export XLSX
          </button>
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
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="big-search-input"
        />
      </div>

      <div className="content-with-sidebar responsive">
        <div className="table-container">
          <div className="table-wrapper responsive-table">
            <table className="members-table">
              <thead>
                <tr>
                  <th className="sticky-name">Name</th>
                  <th>Mobile</th>
                  <th>Category</th>
                  <th>Service</th>
                  <th>Rank</th>
                  <th>State</th>
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
                          {member.first_name || member.full_name
                            ? `${member.first_name || ""} ${member.last_name || ""}`.trim() || member.full_name
                            : "No Name"}
                        </div>
                      </td>
                      <td>{member.phone_number || "-"}</td>
                      <td>{member.category || "-"}</td>
                      <td>{member.service || "-"}</td>
                      <td>{member.rank || "-"}</td>
                      <td>{member.state || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty-message">
                      No members match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="custom-pagination">
            <div className="rows-per-page">
              <span>Rows per page</span>
              <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                <option value={999999}>All</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
                <option value={5000}>5000</option>
                
              </select>
            </div>

            <div className="page-info">
              {startIndex + 1}–{endIndex} of {totalItems}
            </div>

            <div className="page-navigation">
              <button onClick={goToPrevious} disabled={currentPage === 1} className="nav-btn">
                ‹
              </button>
              <button
                onClick={goToNext}
                disabled={currentPage === totalPages || totalItems === 0}
                className="nav-btn"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="filter-sidebar-desktop">
          <FilterSidebar filterData={filterData} filterKeys={filterKeys} />
        </div>

        {/* Mobile Sidebar */}
        <div className={`filter-sidebar-mobile ${isFilterOpen ? "open" : ""}`}>
          <div className="mobile-filter-header">
            <h3>Filters</h3>
            <button onClick={toggleFilter} className="close-filter-btn">✕</button>
          </div>
          <FilterSidebar filterData={filterData} filterKeys={filterKeys} />
        </div>
      </div>

      {isFilterOpen && <div className="mobile-filter-overlay" onClick={toggleFilter}></div>}
    </div>
  );
}