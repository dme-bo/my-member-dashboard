// src/pages/RequirementsPage.jsx
import { useState, useEffect, useMemo } from "react";
import {
  FaBriefcase,
  FaCheckCircle,
  FaHourglassHalf,
  FaUsers,
  FaSearch,
  FaEye,
  FaProjectDiagram,
  FaTrashAlt,
  FaSortUp,
  FaSortDown,
  FaSort,
  FaFileExport,
} from "react-icons/fa";
import {
  collection,
  getDocs,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import Papa from "papaparse"; // For CSV export

export default function RequirementsPage() {
  const [requirementsData, setRequirementsData] = useState([]);
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null);
  const [allocationTitleFilter, setAllocationTitleFilter] = useState("");
  const [allocationCompanyFilter, setAllocationCompanyFilter] = useState("");
  const [allAllocations, setAllAllocations] = useState([]);
  const [allocatedCounts, setAllocatedCounts] = useState({});
  const [activeFilter, setActiveFilter] = useState("All");
  const [requirementsSearchTerm, setRequirementsSearchTerm] = useState(""); // New: Search for requirements
  const [sortConfig, setSortConfig] = useState({ key: "postedOn", direction: "desc" }); // New: Sorting

  // Modals
  const [showJobModal, setShowJobModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalType, setStatsModalType] = useState("");
  const [showMemberDetailModal, setShowMemberDetailModal] = useState(false);
  const [showAllocatedMembersModal, setShowAllocatedMembersModal] = useState(false);
  const [showAllAllocationsModal, setShowAllAllocationsModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [allocationToDelete, setAllocationToDelete] = useState(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [allocatedMembers, setAllocatedMembers] = useState([]);

  // Member filters
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  // Pagination for members
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeAllocate, setPageSizeAllocate] = useState(100);

  // Pagination for requirements (New feature)
  const [requirementsCurrentPage, setRequirementsCurrentPage] = useState(1);
  const [requirementsPageSize, setRequirementsPageSize] = useState(50);

  // Toast
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* FETCH REQUIREMENTS (Jobs + Projects) */
  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        setLoading(true);
        const jobsQuery = query(collection(db, "jobsmaster"));
        const jobsSnapshot = await getDocs(jobsQuery);
        const jobs = jobsSnapshot.docs.map((doc) => ({
          id: doc.id,
          collection: "jobsmaster",
          type: "job",
          ...doc.data(),
        }));

        const projectsQuery = query(collection(db, "projectsmaster"));
        const projectsSnapshot = await getDocs(projectsQuery);
        const projects = projectsSnapshot.docs.map((doc) => ({
          id: doc.id,
          collection: "projectsmaster",
          type: "project",
          ...doc.data(),
        }));

        const combined = [...jobs, ...projects];
        const transformed = combined.map((item) => {
          let title, jd, salary, location, company, logo, postedOn, status, benefits;
          if (item.type === "job") {
            const min = item.job_salaryrange_minimum ?? 0;
            const max = item.job_salaryrange_maximum ?? 0;
            salary = "Not disclosed";
            if (min > 0 && max > 0) {
              const minLPA = (min * 12) / 100000;
              const maxLPA = (max * 12) / 100000;
              salary = `₹${minLPA.toFixed(1)} - ₹${maxLPA.toFixed(1)} LPA`;
            } else if (min > 0) {
              salary = `₹${min.toLocaleString()}/month`;
            }
            title = item.job_title ?? "Untitled Job";
            jd = item.job_roleandresponsibilities ?? "No description available.";
            location = item.job_city ?? item.job_location ?? "Location not specified";
            company = item.job_company ?? "—";
            logo = item.job_logo ?? null;
            postedOn = item.job_postedon ?? "—";
            benefits = item.job_otherbenefits ?? null;
            status = item.job_status === "Open" ? "active" : "completed";
          } else {
            title = item.project_title ?? "Untitled Project";
            jd = item.project_description ?? "No description available.";
            salary = "Volunteer / Stipend-based";
            location = item.project_location ?? item.project_city ?? "Location not specified";
            company = item.project_company ?? "—";
            logo = item.project_company_logo ?? null;
            postedOn = item.project_postedon ?? "—";
            benefits = item.project_benefit ?? null;
            status = item.project_status === "Active" ? "active" : "completed";
          }
          return {
            id: item.id,
            collection: item.collection,
            type: item.type,
            title,
            jd,
            salary,
            location,
            company,
            logo,
            benefits,
            postedOn,
            status,
          };
        });

        transformed.sort((a, b) => {
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr === "—") return new Date(0);
            const [d, m, y] = dateStr.split("-");
            return new Date(`${y}-${m}-${d}`);
          };
          return parseDate(b.postedOn) - parseDate(a.postedOn);
        });

        setRequirementsData(transformed);
      } catch (err) {
        console.error("Error fetching requirements:", err);
        setError("Failed to load jobs and projects.");
      } finally {
        setLoading(false);
      }
    };
    fetchRequirements();
  }, []);

  /* FETCH ALL ALLOCATIONS */
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "allocations"), (snapshot) => {
      const allocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllAllocations(allocs);
      const counts = {};
      allocs.forEach((alloc) => {
        counts[alloc.jobId] = (counts[alloc.jobId] || 0) + 1;
      });
      setAllocatedCounts(counts);
    });
    return () => unsubscribe();
  }, []);

  /* FETCH ALLOCATED MEMBERS FOR SELECTED REQ */
  useEffect(() => {
    if (!selectedReq) {
      setAllocatedMembers([]);
      return;
    }
    const allocQuery = query(
      collection(db, "allocations"),
      where("jobId", "==", selectedReq.id)
    );
    const unsubscribe = onSnapshot(allocQuery, (snapshot) => {
      const alloc = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAllocatedMembers(alloc);
    });
    return () => unsubscribe();
  }, [selectedReq]);

  /* FETCH MEMBERS */
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const q = query(collection(db, "usersmaster"));
        const snapshot = await getDocs(q);
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          name:
            doc.data().name ||
            doc.data().displayName ||
            `${doc.data().full_name || ""}`.trim() ||
            "Unnamed",
          email: doc.data().email || "—",
          phone:
            doc.data().phone ||
            doc.data().mobile ||
            doc.data().phone_number ||
            "—",
          designation: doc.data().designation || doc.data().role || "—",
          gender: doc.data().gender || "",
          state: doc.data().state || "",
          city: doc.data().city || "",
          category: doc.data().category || "",
          service: doc.data().service || "",
          rank: doc.data().rank || "",
          level: doc.data().level || "",
          ...doc.data(),
        }));
        setMembers(membersList);
        setFilteredMembers(membersList);
      } catch (err) {
        console.error("Error fetching members:", err);
      }
    };
    fetchMembers();
  }, []);

  /* UNIQUE FILTER VALUES */
  const uniqueStates = useMemo(
    () => [...new Set(members.map((m) => m.state).filter(Boolean))].sort(),
    [members]
  );
  const uniqueCities = useMemo(
    () => [...new Set(members.map((m) => m.city).filter(Boolean))].sort(),
    [members]
  );
  const uniqueOrganizations = useMemo(
    () => [...new Set(members.map((m) => m.category).filter(Boolean))].sort(),
    [members]
  );
  const uniqueServices = useMemo(
    () => [...new Set(members.map((m) => m.service).filter(Boolean))].sort(),
    [members]
  );
  const uniqueRanks = useMemo(
    () => [...new Set(members.map((m) => m.rank).filter(Boolean))].sort(),
    [members]
  );
  const uniqueLevels = useMemo(
    () => [...new Set(members.map((m) => m.level).filter(Boolean))].sort(),
    [members]
  );

  /* MEMBER FILTERING */
  useEffect(() => {
    let filtered = members;
    if (memberSearchTerm.trim()) {
      const term = memberSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name?.toLowerCase().includes(term) ||
          m.email?.toLowerCase().includes(term) ||
          m.phone?.includes(term) ||
          m.designation?.toLowerCase().includes(term)
      );
    }
    if (genderFilter) filtered = filtered.filter((m) => m.gender?.toLowerCase() === genderFilter.toLowerCase());
    if (stateFilter) filtered = filtered.filter((m) => m.state === stateFilter);
    if (cityFilter) filtered = filtered.filter((m) => m.city === cityFilter);
    if (organizationFilter) filtered = filtered.filter((m) => m.category === organizationFilter);
    if (serviceFilter) filtered = filtered.filter((m) => m.service === serviceFilter);
    if (rankFilter) filtered = filtered.filter((m) => m.rank === rankFilter);
    if (levelFilter) filtered = filtered.filter((m) => m.level === levelFilter);

    setFilteredMembers(filtered);
    setCurrentPage(1);
  }, [memberSearchTerm, genderFilter, stateFilter, cityFilter, organizationFilter, serviceFilter, rankFilter, levelFilter, members]);

  /* FILTERED REQUIREMENTS */
  const filteredRequirements = useMemo(() => {
    let list = requirementsData;
    if (activeFilter === "All") list = list;
    else if (activeFilter === "Open") list = list.filter((r) => r.status === "active");
    else if (activeFilter === "Closed") list = list.filter((r) => r.status === "completed");
    else if (activeFilter === "Projects") list = list.filter((r) => r.type === "project");
    else if (activeFilter === "Recruitment") list = list.filter((r) => r.type === "job");
    // Assuming "TCS" is for company filter, add if needed
    // else if (activeFilter === "TCS") list = list.filter((r) => r.company.toLowerCase().includes("tcs"));
    return list;
  }, [requirementsData, activeFilter]);

  /* SEARCH AND SORT REQUIREMENTS */
  const displayedRequirements = useMemo(() => {
    let list = filteredRequirements.filter((r) => {
      const term = requirementsSearchTerm.toLowerCase();
      return (
        r.title.toLowerCase().includes(term) ||
        r.company.toLowerCase().includes(term) ||
        r.location.toLowerCase().includes(term) ||
        r.salary.toLowerCase().includes(term) ||
        r.postedOn.toLowerCase().includes(term)
      );
    });

    // Sorting
    list.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (sortConfig.key === "postedOn") {
        const parseDate = (dateStr) => {
          if (!dateStr || dateStr === "—") return new Date(0);
          const [d, m, y] = dateStr.split("-");
          return new Date(`${y}-${m}-${d}`);
        };
        aVal = parseDate(aVal);
        bVal = parseDate(bVal);
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    // Pagination
    const start = (requirementsCurrentPage - 1) * requirementsPageSize;
    return list.slice(start, start + requirementsPageSize);
  }, [filteredRequirements, requirementsSearchTerm, sortConfig, requirementsCurrentPage, requirementsPageSize]);

  const requirementsTotalPages = Math.ceil(filteredRequirements.length / requirementsPageSize);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  /* STATS */
  const stats = useMemo(() => {
    const active = requirementsData.filter((r) => r.status === "active").length;
    const completed = requirementsData.filter((r) => r.status === "completed").length;
    const totalAllocated = Object.values(allocatedCounts).reduce((sum, c) => sum + c, 0);
    return { total: requirementsData.length, active, completed, totalAllocated };
  }, [requirementsData, allocatedCounts]);

  const handleStatClick = (type) => {
    if (type === "allocated") setShowAllAllocationsModal(true);
    else {
      setStatsModalType(type);
      setShowStatsModal(true);
    }
  };

  /* PAGINATION FOR MEMBERS */
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSizeAllocate;
    return filteredMembers.slice(start, start + pageSizeAllocate);
  }, [filteredMembers, currentPage, pageSizeAllocate]);

  const totalPages = Math.ceil(filteredMembers.length / pageSizeAllocate);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // New: Export to CSV
  const exportToCSV = () => {
    const csvData = filteredRequirements.map((req) => ({
      Type: req.type === "project" ? "Project" : "Job",
      Title: req.title,
      Company: req.company,
      Location: req.location,
      Compensation: req.salary,
      Allocated: allocatedCounts[req.id] || 0,
      Status: req.status === "active" ? "Open" : "Closed",
      PostedOn: req.postedOn,
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "requirements.csv";
    link.click();
  };

  if (loading) return <div className="dashboard-container"><div className="loading">Loading Requirements…</div></div>;
  if (error) return <div className="dashboard-container"><div className="error">{error}</div></div>;

  return (
    <div className="dashboard-container" style={{ backgroundColor: "#f4f6f9", minHeight: "100vh", padding: "20px" }}>
      {/* TOAST */}
      {toast.show && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "white",
            padding: "16px 28px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            zIndex: 10000,
            fontWeight: "600",
            fontSize: "16px",
            animation: "slideIn 0.4s ease-out",
          }}
        >
          {toast.message}
        </div>
      )}
      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* HEADER */}
      <header className="dashboard-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px",paddingBottom: "10px" }}>
        <div className="header-content">
          <div className="filter-buttons" style={{ display: "flex", gap: "10px" }}>
            {["All", "Open", "Closed", "Projects", "Recruitment"].map((filter) => ( // Removed "TCS" as not implemented
              <button
                key={filter}
                className={`filter-btn ${activeFilter === filter ? "active" : ""}`}
                onClick={() => setActiveFilter(filter)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "30px",
                  backgroundColor: activeFilter === filter ? "#1976d2" : "#e5e7eb",
                  color: activeFilter === filter ? "white" : "#1f2937",
                  fontWeight: "600",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.3s",
                }}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
        <button onClick={exportToCSV} style={{ padding: "10px 20px", backgroundColor: "#10b981", color: "white", borderRadius: "30px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
          <FaFileExport /> Export CSV
        </button>
      </header>

      {/* STATS GRID */}
      <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        <div className="card" onClick={() => handleStatClick("total")} style={{ cursor: "pointer", backgroundColor: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", padding: "20px", transition: "transform 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
          <div className="stat-card total-members" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="icon-wrapper" style={{ backgroundColor: "#3b82f6", color: "white", padding: "16px", borderRadius: "50%" }}><FaBriefcase size={32} /></div>
            <div className="stat-info">
              <p className="stat-label" style={{ fontSize: "16px", color: "#6b7280" }}>Total Requirements</p>
              <p className="stat-value" style={{ fontSize: "32px", fontWeight: "bold", color: "#1f2937" }}>{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("active")} style={{ cursor: "pointer", backgroundColor: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", padding: "20px", transition: "transform 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
          <div className="stat-card active" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="icon-wrapper" style={{ backgroundColor: "#22c55e", color: "white", padding: "16px", borderRadius: "50%" }}><FaHourglassHalf size={32} /></div>
            <div className="stat-info">
              <p className="stat-label" style={{ fontSize: "16px", color: "#6b7280" }}>Open Requirements</p>
              <p className="stat-value" style={{ fontSize: "32px", fontWeight: "bold", color: "#1f2937" }}>{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("completed")} style={{ cursor: "pointer", backgroundColor: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", padding: "20px", transition: "transform 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
          <div className="stat-card completed" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="icon-wrapper" style={{ backgroundColor: "#06b6d4", color: "white", padding: "16px", borderRadius: "50%" }}><FaCheckCircle size={32} /></div>
            <div className="stat-info">
              <p className="stat-label" style={{ fontSize: "16px", color: "#6b7280" }}>Closed Requirements</p>
              <p className="stat-value" style={{ fontSize: "32px", fontWeight: "bold", color: "#1f2937" }}>{stats.completed}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("allocated")} style={{ cursor: "pointer", backgroundColor: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", padding: "20px", transition: "transform 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.05)"} onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
          <div className="stat-card allocated" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="icon-wrapper" style={{ backgroundColor: "#a855f7", color: "white", padding: "16px", borderRadius: "50%" }}><FaUsers size={32} /></div>
            <div className="stat-info">
              <p className="stat-label" style={{ fontSize: "16px", color: "#6b7280" }}>Total Allocated Members</p>
              <p className="stat-value" style={{ fontSize: "32px", fontWeight: "bold", color: "#1f2937" }}>{stats.totalAllocated}</p>
            </div>
          </div>
        </div>
      </div>

      {/* REQUIREMENTS SECTION */}
      <div className="requirements-section" style={{ backgroundColor: "white", 
  borderRadius: "16px", 
  padding: "30px", 
  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  minHeight: "600px", // <--- ADD THIS: Keeps the card height stable
  display: "flex",    // <--- ADD THIS
  flexDirection: "column"  }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 className="section-title" style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#1f2937" }}>
            {activeFilter === "All" && "All Requirements"}
            {activeFilter === "Open" && "Open Requirements"}
            {activeFilter === "Closed" && "Closed Requirements"}
            {activeFilter === "Projects" && "Projects"}
            {activeFilter === "Recruitment" && "Recruitment"}
            <span style={{ marginLeft: "10px", color: "#10b981", fontSize: "20px" }}>({filteredRequirements.length})</span>
          </h2>
          <div style={{ position: "relative", width: "300px" }}>
            <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              type="text"
              placeholder="Search by title, company, location..."
              value={requirementsSearchTerm}
              onChange={(e) => setRequirementsSearchTerm(e.target.value)}
              style={{ width: "100%", padding: "12px 16px 12px 40px", borderRadius: "30px", border: "2px solid #e2e8f0", fontSize: "14px" }}
            />
          </div>
        </div>

        {displayedRequirements.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#666" }}>
            <p style={{ fontSize: "16px" }}>No Requirements found.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              tableLayout: "fixed",
              borderCollapse: "separate",
              borderSpacing: "0 10px",
              fontSize: "14px"
            }}>
              <thead>
                <tr style={{ backgroundColor: "#1976d2", color: "white", borderRadius: "12px" }}>
                  <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", borderTopLeftRadius: "12px", borderBottomLeftRadius: "12px" }}>Type</th>
                  <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", cursor: "pointer" }} onClick={() => handleSort("title")}>
                    Title {sortConfig.key === "title" ? (sortConfig.direction === "asc" ? <FaSortUp /> : <FaSortDown />) : <FaSort />}
                  </th>
                  <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", cursor: "pointer" }} onClick={() => handleSort("company")}>
                    Company {sortConfig.key === "company" ? (sortConfig.direction === "asc" ? <FaSortUp /> : <FaSortDown />) : <FaSort />}
                  </th>
                  <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", cursor: "pointer" }} onClick={() => handleSort("location")}>
                    Location {sortConfig.key === "location" ? (sortConfig.direction === "asc" ? <FaSortUp /> : <FaSortDown />) : <FaSort />}
                  </th>
                  <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", cursor: "pointer" }} onClick={() => handleSort("salary")}>
                    Compensation {sortConfig.key === "salary" ? (sortConfig.direction === "asc" ? <FaSortUp /> : <FaSortDown />) : <FaSort />}
                  </th>
                  <th style={{ padding: "16px", textAlign: "center", fontWeight: "700" }}>Allocated</th>
                  <th style={{ padding: "16px", textAlign: "center", fontWeight: "700" }}>Status</th>
                  <th style={{ padding: "16px", textAlign: "center", fontWeight: "700", borderTopRightRadius: "12px", borderBottomRightRadius: "12px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedRequirements.map((req, idx) => {
                  const liveCount = allocatedCounts[req.id] || 0;
                  return (
                    <tr 
                      key={req.id}
                      style={{ 
                        backgroundColor: "white",
                        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                        borderRadius: "12px",
                        transition: "all 0.3s",
                        opacity: req.status === "completed" ? 0.7 : 1
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.05)"}
                    >
                      <td style={{ padding: "16px", fontWeight: "600", borderTopLeftRadius: "12px", borderBottomLeftRadius: "12px" }}>
                        <span style={{ 
                          backgroundColor: req.type === "project" ? "#e9d5ff" : "#dbeafe",
                          color: req.type === "project" ? "#6b21a8" : "#0c4a6e",
                          padding: "6px 14px",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "600"
                        }}>
                          {req.type === "project" ? "Project" : "Job"}
                        </span>
                      </td>
                      <td style={{ padding: "16px" }}>
                        <div style={{ maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: "600", color: "#1f2937" }} title={req.title}>
                          {req.title}
                        </div>
                      </td>
                      <td style={{ padding: "16px", color: "#4b5563" }}>
                        {req.company}
                      </td>
                      <td style={{ padding: "16px", color: "#4b5563" }}>
                        {req.location}
                      </td>
                      <td style={{ padding: "16px", color: "#4b5563", fontSize: "13px" }}>
                        {req.salary}
                      </td>
                      <td style={{ padding: "16px", textAlign: "center", fontWeight: "600", color: "#10b981" }}>
                        {liveCount}
                      </td>
                      <td style={{ padding: "16px", textAlign: "center" }}>
                        <span style={{ 
                          backgroundColor: req.status === "active" ? "#dcfce7" : "#fee2e2",
                          color: req.status === "active" ? "#166534" : "#991b1b",
                          padding: "8px 16px",
                          borderRadius: "20px",
                          fontSize: "13px",
                          fontWeight: "600"
                        }}>
                          {req.status === "active" ? "Open" : "Closed"}
                        </span>
                      </td>
                      <td style={{ padding: "16px", textAlign: "center", borderTopRightRadius: "12px", borderBottomRightRadius: "12px" }}>
                        <button
                          onClick={() => {
                            setSelectedReq(req);
                            setShowJobModal(true);
                          }}
                          style={{
                            padding: "8px 18px",
                            backgroundColor: "#1976d2",
                            color: "white",
                            border: "none",
                            borderRadius: "20px",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: "600",
                            transition: "background-color 0.3s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination for Requirements */}
        {requirementsTotalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "30px", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "14px", color: "#6b7280" }}>Rows per page:</span>
              <select
                value={requirementsPageSize}
                onChange={(e) => {
                  setRequirementsPageSize(Number(e.target.value));
                  setRequirementsCurrentPage(1);
                }}
                style={{ padding: "10px 14px", borderRadius: "12px", border: "2px solid #e2e8f0", backgroundColor: "white" }}
              >
                {[10, 25, 50, 100, "All"].map((size) => (
                  <option key={size} value={size === "All" ? filteredRequirements.length : size}>{size}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button disabled={requirementsCurrentPage === 1} onClick={() => setRequirementsCurrentPage(p => p - 1)} style={{ padding: "10px 20px", borderRadius: "12px", background: requirementsCurrentPage === 1 ? "#e5e7eb" : "#1976d2", color: "white", border: "none", fontWeight: "600" }}>
                Previous
              </button>
              <span style={{ padding: "10px", fontSize: "14px", color: "#1f2937" }}>Page {requirementsCurrentPage} of {requirementsTotalPages}</span>
              <button disabled={requirementsCurrentPage === requirementsTotalPages} onClick={() => setRequirementsCurrentPage(p => p + 1)} style={{ padding: "10px 20px", borderRadius: "12px", background: requirementsCurrentPage === requirementsTotalPages ? "#e5e7eb" : "#1976d2", color: "white", border: "none", fontWeight: "600" }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* JOB/PROJECT DETAILS MODAL */}
      {showJobModal && selectedReq && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowJobModal(false)}>
          <div className="modal-contents" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "800px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            {selectedReq.logo && (
              <img
                src={selectedReq.logo}
                alt="Logo"
                style={{ width: 120, borderRadius: 16, marginBottom: 24, objectFit: "contain", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}
              />
            )}
            <h2 style={{ fontSize: "28px", marginBottom: "16px", color: "#1f2937" }}>{selectedReq.type === "project" ? "Project" : "Job"}: {selectedReq.title}</h2>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "8px" }}><strong>Company:</strong> {selectedReq.company}</p>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "8px" }}><strong>Location:</strong> {selectedReq.location}</p>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "8px" }}><strong>Compensation:</strong> {selectedReq.salary}</p>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "8px" }}><strong>Posted On:</strong> {selectedReq.postedOn}</p>
            {selectedReq.benefits && <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "8px" }}><strong>Benefits:</strong> {selectedReq.benefits}</p>}
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "24px" }}>
              <strong>Status:</strong>{" "}
              <span style={{
                backgroundColor: selectedReq.status === "active" ? "#dcfce7" : "#fee2e2",
                color: selectedReq.status === "active" ? "#166534" : "#991b1b",
                padding: "6px 12px",
                borderRadius: "20px",
                fontWeight: "600"
              }}>
                {selectedReq.status === "active" ? "Open" : "Closed"}
              </span>
            </p>

            <div className="jd-section" style={{ backgroundColor: "#f9fafb", padding: "20px", borderRadius: "12px", marginBottom: "32px" }}>
              <strong style={{ fontSize: "18px", display: "block", marginBottom: "12px" }}>{selectedReq.type === "project" ? "Project Description" : "Job Description"}:</strong>
              <div
                style={{ lineHeight: "1.7", color: "#374151" }}
                dangerouslySetInnerHTML={{
                  __html: (selectedReq.jd ?? "")
                    .replace(/\n/g, "<br>")
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            </div>

            <div className="modal-actions" style={{ display: "flex", gap: "16px", justifyContent: "flex-end" }}>
              {selectedReq.status === "active" && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setShowAllocateModal(true);
                    setShowJobModal(false);
                    setMemberSearchTerm("");
                    setGenderFilter("");
                    setStateFilter("");
                    setCityFilter("");
                    setOrganizationFilter("");
                    setServiceFilter("");
                    setRankFilter("");
                    setLevelFilter("");
                    setSelectedMemberIds([]);
                    setCurrentPage(1);
                  }}
                  style={{ padding: "12px 24px", backgroundColor: "#1976d2", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
                >
                  Allocate Members
                </button>
              )}

              <button
                className="btn outline"
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#1976d2",
                  color: "white",
                  borderRadius: "30px",
                  border: "none",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background-color 0.3s"
                }}
                onClick={() => setShowAllocatedMembersModal(true)}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
              >
                Allocated Members ({allocatedMembers.length})
                {selectedReq.status !== "active" && " (View Only)"}
              </button>

              <button className="btn secondary" onClick={() => setShowJobModal(false)} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATE MODAL */}
      {showAllocateModal && selectedReq && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAllocateModal(false)}>
          <div className="modal-contents allocate-modal" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "1200px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "28px", marginBottom: "16px", color: "#1f2937" }}>Allocate Members to: <strong>{selectedReq.title}</strong></h2>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "24px" }}>
              <strong>Company:</strong> {selectedReq.company} | <strong>Location:</strong> {selectedReq.location}
            </p>

            {selectedReq.status !== "active" && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  marginBottom: "24px",
                  border: "1px solid #fecaca",
                  fontWeight: "500",
                  fontSize: "15px",
                }}
              >
                <strong>Warning:</strong> This {selectedReq.type} is <strong>closed</strong>. 
                You cannot allocate new members.
              </div>
            )}

            {/* Main Content Layout */}
            <div style={{ 
  display: "grid", 
  gridTemplateColumns: "3fr 1fr", 
  gap: "30px", 
  marginBottom: "40px", 
  width: "100%",      // <--- ADD THIS
  minWidth: "1000px"  // <--- CHANGE THIS: Force a minimum width so it doesn't collapse
}}>
              {/* Members List and Pagination - Left Side */}
              <div style={{ flex: 1, minWidth: "min(100%, 580px)" }}>
                {/* Members List */}
                <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", border: "2px solid #e2e8f0", borderRadius: "16px", backgroundColor: "white", padding: "10px" }}>
                  {paginatedMembers.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "16px" }}>
                      {members.length === 0 ? "Loading members..." : "No members found matching filters."}
                    </p>
                  ) : (
                    paginatedMembers.map((member) => (
                      <label
                        key={member.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "20px",
                          borderBottom: "1px solid #eee",
                          cursor: "pointer",
                          borderRadius: "12px",
                          margin: "8px 0",
                          backgroundColor: selectedMemberIds.includes(member.id) ? "#eff6ff" : "transparent",
                          transition: "background-color 0.3s",
                        }}
                        onMouseEnter={(e) => { if (!selectedMemberIds.includes(member.id)) e.currentTarget.style.backgroundColor = "#f9fafb"; }}
                        onMouseLeave={(e) => { if (!selectedMemberIds.includes(member.id)) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <div style={{ display: "flex", alignItems: "center", flex: 1, gap: "16px" }}>
                          <input
                            type="checkbox"
                            checked={selectedMemberIds.includes(member.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMemberIds((prev) => [...prev, member.id]);
                              } else {
                                setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                              }
                            }}
                            disabled={selectedReq.status !== "active"}
                            style={{ transform: "scale(1.5)", accentColor: "#1976d2" }}
                          />
                          <div>
                            <strong style={{ fontSize: "18px", color: "#1f2937" }}>{member.name}</strong><br />
                            <small style={{ color: "#6b7280", fontSize: "14px" }}>
                              Email: {member.email} | Phone: {member.phone} | Role: {member.designation}
                            </small>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMember(member);
                            setShowMemberDetailModal(true);
                          }}
                          style={{
                            background: "#1976d2",
                            color: "white",
                            border: "none",
                            padding: "12px 24px",
                            borderRadius: "20px",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            transition: "background-color 0.3s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
                        >
                          <FaEye /> View Details
                        </button>
                      </label>
                    ))
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "30px", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "14px", color: "#6b7280" }}>Rows per page:</span>
                      <select
                        value={pageSizeAllocate}
                        onChange={(e) => {
                          setPageSizeAllocate(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        style={{ padding: "10px 14px", borderRadius: "12px", border: "2px solid #e2e8f0", backgroundColor: "white" }}
                      >
                        {[100, 500, 1000, 5000, "All"].map((size) => (
                          <option key={size} value={size === "All" ? filteredMembers.length : size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={{ padding: "10px 20px", borderRadius: "12px", background: currentPage === 1 ? "#e5e7eb" : "#1976d2", color: "white", border: "none", fontWeight: "600" }}>
                        Previous
                      </button>
                      <span style={{ padding: "10px", fontSize: "14px", color: "#1f2937" }}>Page {currentPage} of {totalPages}</span>
                      <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} style={{ padding: "10px 20px", borderRadius: "12px", background: currentPage === totalPages ? "#e5e7eb" : "#1976d2", color: "white", border: "none", fontWeight: "600" }}>
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Filters Sidebar - Right Side */}
              <div style={{ width: "320px", background: "#f8fafc", padding: "30px", borderRadius: "16px", border: "2px solid #e2e8f0", boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                  <h3 style={{ margin: 0, fontSize: "20px", color: "#1f2937", fontWeight: "700" }}>Filters</h3>
                  <button
                    onClick={() => {
                      setMemberSearchTerm("");
                      setGenderFilter("");
                      setStateFilter("");
                      setCityFilter("");
                      setOrganizationFilter("");
                      setServiceFilter("");
                      setRankFilter("");
                      setLevelFilter("");
                      setCurrentPage(1);
                    }}
                    style={{
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "20px",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      transition: "background-color 0.3s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
                  >
                    Clear All
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Member Search */}
                  <div style={{ position: "relative" }}>
                    <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "18px" }} />
                    <input
                      type="text"
                      placeholder="Search by name, email, phone, role..."
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      style={{ width: "100%", padding: "14px 16px 14px 48px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                    />
                  </div>

                  {/* Gender */}
                  <select
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    style={{ padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", backgroundColor: "white", color: "#1f2937", fontSize: "15px" }}
                  >
                    <option value="">All Genders</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>

                  {/* State */}
                  <input
                    list="states-list"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                    placeholder="Select State"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="states-list">
                    {uniqueStates.map((state) => <option key={state} value={state} />)}
                  </datalist>

                  {/* City */}
                  <input
                    list="cities-list"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    placeholder="Select City"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="cities-list">
                    {uniqueCities.map((city) => <option key={city} value={city} />)}
                  </datalist>

                  {/* Category/Organization */}
                  <input
                    list="organizations-list"
                    value={organizationFilter}
                    onChange={(e) => setOrganizationFilter(e.target.value)}
                    placeholder="Select Category"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="organizations-list">
                    {uniqueOrganizations.map((org) => <option key={org} value={org} />)}
                  </datalist>

                  {/* Service */}
                  <input
                    list="services-list"
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    placeholder="Select Service"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="services-list">
                    {uniqueServices.map((service) => <option key={service} value={service} />)}
                  </datalist>

                  {/* Rank */}
                  <input
                    list="ranks-list"
                    value={rankFilter}
                    onChange={(e) => setRankFilter(e.target.value)}
                    placeholder="Select Rank"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="ranks-list">
                    {uniqueRanks.map((rank) => <option key={rank} value={rank} />)}
                  </datalist>

                  {/* Level */}
                  <input
                    list="levels-list"
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    placeholder="Select Level"
                    style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "2px solid #d1d5db", fontSize: "15px", backgroundColor: "white", color: "#1f2937" }}
                  />
                  <datalist id="levels-list">
                    {uniqueLevels.map((level) => <option key={level} value={level} />)}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ display: "flex", gap: "16px", justifyContent: "flex-end" }}>
              <button
                className="btn primary"
                disabled={selectedReq.status !== "active" || selectedMemberIds.length === 0}
                onClick={async () => {
                  if (selectedReq.status !== "active") {
                    showToast("Cannot allocate to a closed requirement", "error");
                    return;
                  }

                  try {
                    const alreadyAllocatedUserIds = new Set(allocatedMembers.map(a => a.userId));
                    const newMembers = selectedMemberIds.filter(id => !alreadyAllocatedUserIds.has(id));
                    const already = selectedMemberIds.filter(id => alreadyAllocatedUserIds.has(id));

                    if (already.length > 0) {
                      const names = already.map(id => members.find(m => m.id === id)?.name || "Unknown").join(", ");
                      showToast(`${already.length} member(s) already allocated: ${names}`, "error");
                    }

                    if (newMembers.length === 0) {
                      setSelectedMemberIds([]);
                      return;
                    }

                    const promises = newMembers.map(userId => {
                      const member = members.find(m => m.id === userId);
                      return addDoc(collection(db, "allocations"), {
                        jobId: selectedReq.id,
                        userId,
                        name: member.name,
                        phone: member.phone || "—",
                        allocatedAt: serverTimestamp(),
                      });
                    });

                    await Promise.all(promises);
                    showToast(`Successfully allocated ${newMembers.length} new member(s)!`, "success");
                    setSelectedMemberIds([]);
                    setShowAllocateModal(false);
                    setShowJobModal(true);
                  } catch (err) {
                    console.error("Allocation error:", err);
                    showToast("Failed to allocate members.", "error");
                  }
                }}
                style={{ padding: "12px 24px", backgroundColor: selectedReq.status !== "active" || selectedMemberIds.length === 0 ? "#d1d5db" : "#1976d2", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }}
              >
                Save Allocation ({selectedMemberIds.length})
              </button>
              <button className="btn secondary" onClick={() => { setShowAllocateModal(false); setShowJobModal(true); setSelectedMemberIds([]); }} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATED MEMBERS MODAL */}
      {showAllocatedMembersModal && selectedReq && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAllocatedMembersModal(false)}>
          <div className="modal-contents allocate-modal" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "900px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "28px", marginBottom: "16px", color: "#1f2937" }}>Allocated Members for: <strong>{selectedReq.title}</strong> ({allocatedMembers.length})</h2>
            <p style={{ fontSize: "16px", color: "#4b5563", marginBottom: "24px" }}><strong>Company:</strong> {selectedReq.company} | <strong>Location:</strong> {selectedReq.location}</p>

            <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", border: "2px solid #e2e8f0", borderRadius: "16px", padding: "10px", backgroundColor: "white" }}>
              {allocatedMembers.length === 0 ? (
                <p style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "16px" }}>No members allocated yet.</p>
              ) : (
                allocatedMembers.map((alloc) => {
                  const member = members.find(m => m.id === alloc.userId) || {
                    name: alloc.name || "Unknown Member",
                    email: "—",
                    phone: alloc.phone,
                    designation: "—",
                  };
                  return (
                    <div
                      key={alloc.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "20px",
                        borderBottom: "1px solid #eee",
                        borderRadius: "12px",
                        margin: "8px 0",
                        backgroundColor: "#f8fafc",
                        transition: "background-color 0.3s"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f3f4f6"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                    >
                      <div>
                        <strong style={{ fontSize: "18px", color: "#1f2937" }}>{member.name}</strong><br />
                        <small style={{ color: "#6b7280", fontSize: "14px" }}>
                          Email: {member.email} | Phone: {member.phone} | Role: {member.designation}
                        </small>
                      </div>
                      <div style={{ display: "flex", gap: "16px" }}>
                        <button
                          onClick={() => {
                            setSelectedMember(member);
                            setShowMemberDetailModal(true);
                          }}
                          style={{
                            background: "#1976d2",
                            color: "white",
                            border: "none",
                            padding: "12px 24px",
                            borderRadius: "20px",
                            fontSize: "14px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            transition: "background-color 0.3s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
                        >
                          <FaEye /> View
                        </button>
                        <button
                          onClick={() => {
                            setAllocationToDelete({
                              allocationId: alloc.id,
                              memberName: member.name,
                              requirementTitle: selectedReq.title,
                            });
                            setShowDeleteConfirmModal(true);
                          }}
                          style={{
                            background: "#fee2e2",
                            color: "#dc2626",
                            border: "2px solid #fecaca",
                            padding: "12px 24px",
                            borderRadius: "20px",
                            fontSize: "14px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            transition: "background-color 0.3s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#fecaca"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fee2e2"}
                        >
                          <FaTrashAlt /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
              <button className="btn secondary" onClick={() => setShowAllocatedMembersModal(false)} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirmModal && allocationToDelete && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowDeleteConfirmModal(false)}>
          <div
            className="modal-contents"
            style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "500px", textAlign: "center", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#dc2626", marginBottom: "20px", fontSize: "24px" }}>Remove Allocation?</h2>
            <p style={{ marginBottom: "32px", fontSize: "16px", color: "#374151" }}>
              Are you sure you want to remove <strong>{allocationToDelete.memberName}</strong><br />
              from <strong>{allocationToDelete.requirementTitle}</strong>?
            </p>
            <div className="modal-actions" style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
              <button
                className="btn secondary"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setAllocationToDelete(null);
                }}
                style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, "allocations", allocationToDelete.allocationId));
                    showToast(
                      `${allocationToDelete.memberName} removed from ${allocationToDelete.requirementTitle}`,
                      "success"
                    );
                  } catch (err) {
                    console.error("Delete allocation error:", err);
                    showToast("Failed to remove allocation", "error");
                  } finally {
                    setShowDeleteConfirmModal(false);
                    setAllocationToDelete(null);
                  }
                }}
                style={{ padding: "12px 24px", backgroundColor: "#dc2626", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#b91c1c"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL ALL ALLOCATIONS MODAL */}
      {showAllAllocationsModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAllAllocationsModal(false)}>
          <div className="modal-contents stats-modal" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "1200px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "28px", marginBottom: "24px", color: "#1f2937" }}>All Allocated Members ({stats.totalAllocated})</h2>

            {/* Filters */}
            <div style={{ marginBottom: "32px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1", minWidth: "350px" }}>
                <FaSearch style={{ position: "absolute", left: "20px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "20px" }} />
                <input
                  type="text"
                  placeholder="Search by Job/Project Title..."
                  value={allocationTitleFilter}
                  onChange={(e) => setAllocationTitleFilter(e.target.value)}
                  style={{ width: "100%", padding: "16px 20px 16px 60px", borderRadius: "16px", border: "2px solid #e2e8f0", fontSize: "15px" }}
                />
              </div>
              <div style={{ position: "relative", flex: "1", minWidth: "350px" }}>
                <FaSearch style={{ position: "absolute", left: "20px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "20px" }} />
                <input
                  type="text"
                  placeholder="Search by Company..."
                  value={allocationCompanyFilter}
                  onChange={(e) => setAllocationCompanyFilter(e.target.value)}
                  style={{ width: "100%", padding: "16px 20px 16px 60px", borderRadius: "16px", border: "2px solid #e2e8f0", fontSize: "15px" }}
                />
              </div>
              {(allocationTitleFilter || allocationCompanyFilter) && (
                <button
                  onClick={() => {
                    setAllocationTitleFilter("");
                    setAllocationCompanyFilter("");
                  }}
                  style={{ padding: "16px 32px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "16px", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Table */}
            {(() => {
              let filtered = allAllocations;
              if (allocationTitleFilter) {
                const term = allocationTitleFilter.toLowerCase();
                filtered = filtered.filter(a => {
                  const job = requirementsData.find(j => j.id === a.jobId);
                  return job?.title?.toLowerCase().includes(term);
                });
              }
              if (allocationCompanyFilter) {
                const term = allocationCompanyFilter.toLowerCase();
                filtered = filtered.filter(a => {
                  const job = requirementsData.find(j => j.id === a.jobId);
                  return job?.company?.toLowerCase().includes(term);
                });
              }

              return (
                <div style={{ maxHeight: "500px", overflowY: "auto", border: "2px solid #e2e8f0", borderRadius: "16px", padding: "10px", backgroundColor: "white" }}>
                  {filtered.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "16px" }}>
                      {allAllocations.length === 0 ? "No allocations yet." : "No matching allocations."}
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Member</th>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Requirement</th>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Company</th>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Type</th>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Phone</th>
                          <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((alloc) => {
                          const job = requirementsData.find(j => j.id === alloc.jobId);
                          const member = members.find(m => m.id === alloc.userId) || {
                            name: alloc.name || "Unknown",
                            phone: alloc.phone || "—",
                          };
                          return (
                            <tr key={alloc.id} style={{ backgroundColor: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", borderRadius: "12px" }}>
                              <td style={{ padding: "16px", borderTopLeftRadius: "12px", borderBottomLeftRadius: "12px" }}><strong style={{ color: "#1f2937" }}>{member.name}</strong></td>
                              <td style={{ padding: "16px" }}>{job?.title || "—"}</td>
                              <td style={{ padding: "16px" }}>{job?.company || "—"}</td>
                              <td style={{ padding: "16px" }}>
                                <span style={{
                                  background: job?.type === "project" ? "#9333ea" : "#2563eb",
                                  color: "white",
                                  padding: "6px 12px",
                                  borderRadius: "20px",
                                  fontSize: "13px",
                                  fontWeight: "600"
                                }}>
                                  {job?.type === "project" ? "Project" : "Job"}
                                </span>
                              </td>
                              <td style={{ padding: "16px" }}>{member.phone}</td>
                              <td style={{ padding: "16px", borderTopRightRadius: "12px", borderBottomRightRadius: "12px" }}>
                                <div style={{ display: "flex", gap: "12px" }}>
                                  <button
                                    onClick={() => {
                                      setSelectedMember(member);
                                      setShowMemberDetailModal(true);
                                    }}
                                    style={{
                                      background: "#1976d2",
                                      color: "white",
                                      border: "none",
                                      padding: "8px 16px",
                                      borderRadius: "20px",
                                      fontSize: "13px",
                                      fontWeight: "600",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      transition: "background-color 0.3s"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#1565c0"}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#1976d2"}
                                  >
                                    <FaEye /> View
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAllocationToDelete({
                                        allocationId: alloc.id,
                                        memberName: member.name,
                                        requirementTitle: job?.title || "Unknown Requirement",
                                      });
                                      setShowDeleteConfirmModal(true);
                                    }}
                                    style={{
                                      background: "#fee2e2",
                                      color: "#dc2626",
                                      border: "2px solid #fecaca",
                                      padding: "8px 16px",
                                      borderRadius: "20px",
                                      fontSize: "13px",
                                      fontWeight: "600",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      transition: "background-color 0.3s"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#fecaca"}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#fee2e2"}
                                  >
                                    <FaTrashAlt /> Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}

            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
              <button className="btn secondary" onClick={() => setShowAllAllocationsModal(false)} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER DETAIL MODAL */}
      {showMemberDetailModal && selectedMember && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowMemberDetailModal(false)}>
          <div className="modal-contents" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "1000px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "28px", marginBottom: "24px", color: "#1f2937" }}>Member Details: <strong>{selectedMember.name}</strong></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Name:</strong> {selectedMember.name}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Email:</strong> {selectedMember.email || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Phone:</strong> {selectedMember.phone || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Designation:</strong> {selectedMember.designation || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Gender:</strong> {selectedMember.gender || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>City:</strong> {selectedMember.city || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>State:</strong> {selectedMember.state || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Category:</strong> {selectedMember.category || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Service:</strong> {selectedMember.service || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Rank:</strong> {selectedMember.rank || "—"}</div>
              <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}><strong style={{ color: "#1976d2" }}>Level:</strong> {selectedMember.level || "—"}</div>
              {selectedMember.resume_fileurl && (
                <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "12px" }}>
                  <strong style={{ color: "#1976d2" }}>Resume:</strong>{" "}
                  <a href={selectedMember.resume_fileurl} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2", textDecoration: "underline" }}>
                    View Resume
                  </a>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
              <button className="btn secondary" onClick={() => setShowMemberDetailModal(false)} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS DETAIL MODAL */}
      {showStatsModal && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowStatsModal(false)}>
          <div className="modal-contents" style={{ background: "white", borderRadius: "20px", padding: "40px", maxWidth: "900px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", animation: "fadeIn 0.3s" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "28px", marginBottom: "24px", color: "#1f2937" }}>
              {statsModalType === "total" && "All Requirements"}
              {statsModalType === "active" && "Open Requirements"}
              {statsModalType === "completed" && "Closed Requirements"}
            </h2>
            <div style={{ maxHeight: "500px", overflowY: "auto", border: "2px solid #e2e8f0", borderRadius: "16px", padding: "20px", backgroundColor: "white" }}>
              {(() => {
                const list =
                  statsModalType === "total" ? requirementsData :
                  statsModalType === "active" ? requirementsData.filter(r => r.status === "active") :
                  requirementsData.filter(r => r.status === "completed");

                return list.length === 0 ? (
                  <p style={{ textAlign: "center", color: "#888", fontSize: "16px" }}>No requirements found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {list.map((req) => (
                      <li key={req.id} style={{ padding: "16px 0", borderBottom: "1px solid #eee", fontSize: "16px", color: "#374151" }}>
                        <strong>{req.title}</strong> — {req.company} (
                        <span style={{ color: req.status === "active" ? "#22c55e" : "#ef4444" }}>
                          {req.status === "active" ? "Open" : "Closed"}
                        </span>
                        )
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
            <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "40px" }}>
              <button className="btn secondary" onClick={() => setShowStatsModal(false)} style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer", transition: "background-color 0.3s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#d1d5db"} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#e5e7eb"}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style> */}
    </div>
  );
}