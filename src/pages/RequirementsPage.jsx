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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeAllocate, setPageSizeAllocate] = useState(100);

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
    return list;
  }, [requirementsData, activeFilter]);

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

  /* PAGINATION */
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSizeAllocate;
    return filteredMembers.slice(start, start + pageSizeAllocate);
  }, [filteredMembers, currentPage, pageSizeAllocate]);

  const totalPages = Math.ceil(filteredMembers.length / pageSizeAllocate);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  if (loading) return <div className="dashboard-container"><div className="loading">Loading Requirements…</div></div>;
  if (error) return <div className="dashboard-container"><div className="error">{error}</div></div>;

  return (
    <div className="dashboard-container">
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
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Requirements Allocation Dashboard</h1>
          <div className="filter-buttons">
            {["All", "Open", "Closed","TCS", "Projects", "Recruitment"].map((filter) => (
              <button
                key={filter}
                className={`filter-btn ${activeFilter === filter ? "active" : ""}`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* STATS GRID */}
      <div className="stats-grid">
        <div className="card" onClick={() => handleStatClick("total")} style={{ cursor: "pointer" }}>
          <div className="stat-card total-members">
            <div className="icon-wrapper bg-blue"><FaBriefcase size={32} /></div>
            <div className="stat-info">
              <p className="stat-label">Total Requirements</p>
              <p className="stat-value">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("active")} style={{ cursor: "pointer" }}>
          <div className="stat-card active">
            <div className="icon-wrapper bg-green"><FaHourglassHalf size={32} /></div>
            <div className="stat-info">
              <p className="stat-label">Open Requirements</p>
              <p className="stat-value">{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("completed")} style={{ cursor: "pointer" }}>
          <div className="stat-card completed">
            <div className="icon-wrapper bg-cyan"><FaCheckCircle size={32} /></div>
            <div className="stat-info">
              <p className="stat-label">Closed Requirements</p>
              <p className="stat-value">{stats.completed}</p>
            </div>
          </div>
        </div>
        <div className="card" onClick={() => handleStatClick("allocated")} style={{ cursor: "pointer" }}>
          <div className="stat-card allocated">
            <div className="icon-wrapper bg-purple"><FaUsers size={32} /></div>
            <div className="stat-info">
              <p className="stat-label">Total Allocated Members</p>
              <p className="stat-value">{stats.totalAllocated}</p>
            </div>
          </div>
        </div>
      </div>

      {/* REQUIREMENTS LIST */}
      <div className="requirements-section">
        <h2 className="section-title">
          {activeFilter === "All" && "All Requirements"}
          {activeFilter === "Open" && "Open Requirements"}
          {activeFilter === "Closed" && "Closed Requirements"}
          {activeFilter === "Projects" && "Projects"}
          {activeFilter === "Recruitment" && "Recruitment"}
        </h2>

        {filteredRequirements.length === 0 ? (
          <p>No Requirements found.</p>
        ) : (
          <div className="requirements-grid">
            {filteredRequirements.map((req) => {
              const liveCount = allocatedCounts[req.id] || 0;
              return (
                <div
                  key={req.id}
                  className={`requirement-card ${req.status}`}
                  onClick={() => {
                    setSelectedReq(req);
                    setShowJobModal(true);
                  }}
                  style={req.status === "completed" ? { opacity: 0.82, cursor: "default" } : {}}
                >
                  {req.logo && (
                    <img
                      src={req.logo}
                      alt="Logo"
                      style={{ width: 50, height: 50, borderRadius: 8, marginBottom: 10, objectFit: "contain" }}
                    />
                  )}
                  <div className="req-header">
                    <h3>{req.title}</h3>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={`status-badge ${req.status}`}>
                        {req.status === "active" ? "Open" : "Closed"}
                      </span>
                      <span
                        style={{
                          background: req.type === "project" ? "#9333ea" : "#2563eb",
                          color: "white",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {req.type === "project" ? <><FaProjectDiagram style={{ marginRight: 4 }} /> Project</> : "Job"}
                      </span>
                    </div>
                  </div>
                  <p className="company"><strong>{req.company}</strong></p>
                  <p className="location">Location: {req.location}</p>
                  <p className="salary">Compensation: {req.salary}</p>
                  <p className="deadline">Posted: {req.postedOn}</p>
                  <div className="allocated">
                    <FaUsers size={14} /> Allocated: <strong>{liveCount}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* JOB/PROJECT DETAILS MODAL */}
      {showJobModal && selectedReq && (
        <div className="modal-overlay" onClick={() => setShowJobModal(false)}>
          <div className="modal-contents" onClick={(e) => e.stopPropagation()}>
            {selectedReq.logo && (
              <img
                src={selectedReq.logo}
                alt="Logo"
                style={{ width: 100, borderRadius: 10, marginBottom: 16, objectFit: "contain" }}
              />
            )}
            <h2>{selectedReq.type === "project" ? "Project" : "Job"}: {selectedReq.title}</h2>
            <p><strong>Company:</strong> {selectedReq.company}</p>
            <p><strong>Location:</strong> {selectedReq.location}</p>
            <p><strong>Compensation:</strong> {selectedReq.salary}</p>
            <p><strong>Posted On:</strong> {selectedReq.postedOn}</p>
            {selectedReq.benefits && <p><strong>Benefits:</strong> {selectedReq.benefits}</p>}
            <p>
              <strong>Status:</strong>{" "}
              <span className={`status-badge inline ${selectedReq.status}`}>
                {selectedReq.status === "active" ? "Open" : "Closed"}
              </span>
            </p>

            <div className="jd-section">
              <strong>{selectedReq.type === "project" ? "Project Description" : "Job Description"}:</strong>
              <div
                style={{ marginTop: 8, lineHeight: "1.6" }}
                dangerouslySetInnerHTML={{
                  __html: (selectedReq.jd ?? "")
                    .replace(/\n/g, "<br>")
                    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                }}
              />
            </div>

            <div className="modal-actions">
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
                >
                  Allocate Members
                </button>
              )}

              <button
                className="btn outline"
                style={{
                  marginLeft: selectedReq.status === "active" ? "12px" : "0",
                  backgroundColor: "#1e40af",
                }}
                onClick={() => setShowAllocatedMembersModal(true)}
              >
                Allocated Members ({allocatedMembers.length})
                {selectedReq.status !== "active" && " (View Only)"}
              </button>

              <button className="btn secondary" onClick={() => setShowJobModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ALLOCATE MODAL */}
{showAllocateModal && selectedReq && (
  <div className="modal-overlay" onClick={() => setShowAllocateModal(false)}>
    <div className="modal-contents allocate-modal" style={{ maxWidth: "1200px" }} onClick={(e) => e.stopPropagation()}>
      <h2>Allocate Members to: <strong>{selectedReq.title}</strong></h2>
      <p>
        <strong>Company:</strong> {selectedReq.company} | <strong>Location:</strong> {selectedReq.location}
      </p>

      {selectedReq.status !== "active" && (
        <div
          style={{
            background: "#fef2f2",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: "8px",
            margin: "16px 0",
            border: "1px solid #fecaca",
            fontWeight: "500",
          }}
        >
          <strong>Warning:</strong> This {selectedReq.type} is <strong>closed</strong>. 
          You cannot allocate new members.
        </div>
      )}

      {/* Main Content Layout */}
      <div style={{ display: "flex", gap: "20px", margin: "24px 0" }}>
        {/* Members List and Pagination - Left Side */}
        <div style={{ flex: 1 }}>
          {/* Members List */}
          <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "12px", backgroundColor: "white" }}>
            {paginatedMembers.length === 0 ? (
              <p style={{ textAlign: "center", padding: "60px", color: "#888" }}>
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
                    padding: "16px",
                    borderBottom: "1px solid #eee",
                    cursor: "pointer",
                    borderRadius: "8px",
                    margin: "4px 0",
                    backgroundColor: selectedMemberIds.includes(member.id) ? "#eff6ff" : "transparent",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!selectedMemberIds.includes(member.id)) e.currentTarget.style.backgroundColor = "#f9fafb"; }}
                  onMouseLeave={(e) => { if (!selectedMemberIds.includes(member.id)) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
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
                      style={{ marginRight: "20px", transform: "scale(1.4)", accentColor: "#1e40af" }}
                    />
                    <div>
                      <strong style={{ fontSize: "16px" }}>{member.name}</strong><br />
                      <small style={{ color: "#666" }}>
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
                      background: "#1e40af",
                      color: "white",
                      border: "none",
                      padding: "10px 18px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    <FaEye /> View Details
                  </button>
                </label>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "14px", color: "#666" }}>Rows per page:</span>
                <select
                  value={pageSizeAllocate}
                  onChange={(e) => {
                    setPageSizeAllocate(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ padding: "8px 12px", borderRadius: "8px", border: "2px solid #e2e8f0" }}
                >
                  {[100, 500, 1000, 5000, "All"].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={{ padding: "8px 16px", borderRadius: "8px", background: currentPage === 1 ? "#e5e7eb" : "#1e40af", color: "white", border: "none" }}>
                  Previous
                </button>
                <span style={{ padding: "8px", fontSize: "14px" }}>Page {currentPage} of {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} style={{ padding: "8px 16px", borderRadius: "8px", background: currentPage === totalPages ? "#e5e7eb" : "#1e40af", color: "white", border: "none" }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Filters Sidebar - Right Side */}
        <div style={{ width: "280px", background: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#1f2937" }}>Filters</h3>
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
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Clear All
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Member Search */}
            <div style={{ position: "relative" }}>
              <FaSearch style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                type="text"
                placeholder="Search by name, email, phone, role..."
                value={memberSearchTerm}
                onChange={(e) => setMemberSearchTerm(e.target.value)}
                style={{ width: "100%", padding: "12px 12px 12px 40px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
              />
            </div>

            {/* Gender */}
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              style={{ padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "white", color: "black", fontSize: "14px" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
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
              style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", backgroundColor: "white", color: "black" }}
            />
            <datalist id="levels-list">
              {uniqueLevels.map((level) => <option key={level} value={level} />)}
            </datalist>
          </div>
        </div>
      </div>

            <div className="modal-actions" style={{ marginTop: "32px" }}>
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
              >
                Save Allocation ({selectedMemberIds.length})
              </button>
              <button className="btn secondary" onClick={() => { setShowAllocateModal(false); setShowJobModal(true); setSelectedMemberIds([]); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATED MEMBERS MODAL */}
      {showAllocatedMembersModal && selectedReq && (
        <div className="modal-overlay" onClick={() => setShowAllocatedMembersModal(false)}>
          <div className="modal-contents allocate-modal" style={{ maxWidth: "800px" }} onClick={(e) => e.stopPropagation()}>
            <h2>Allocated Members for: <strong>{selectedReq.title}</strong> ({allocatedMembers.length})</h2>
            <p><strong>Company:</strong> {selectedReq.company} | <strong>Location:</strong> {selectedReq.location}</p>

            <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", marginTop: "24px" }}>
              {allocatedMembers.length === 0 ? (
                <p style={{ textAlign: "center", padding: "60px", color: "#888" }}>No members allocated yet.</p>
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
                        padding: "16px",
                        borderBottom: "1px solid #eee",
                        borderRadius: "8px",
                        margin: "4px 0",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: "16px" }}>{member.name}</strong><br />
                        <small style={{ color: "#666" }}>
                          Email: {member.email} | Phone: {member.phone} | Role: {member.designation}
                        </small>
                      </div>
                      <div style={{ display: "flex", gap: "12px" }}>
                        <button
                          onClick={() => {
                            setSelectedMember(member);
                            setShowMemberDetailModal(true);
                          }}
                          style={{
                            background: "#1e40af",
                            color: "white",
                            border: "none",
                            padding: "10px 18px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            fontWeight: "600",
                          }}
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
                            border: "1px solid #fecaca",
                            padding: "10px 14px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            fontWeight: "600",
                          }}
                        >
                          <FaTrashAlt /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "32px" }}>
              <button className="btn secondary" onClick={() => setShowAllocatedMembersModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirmModal && allocationToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
          <div
            className="modal-contents"
            style={{ maxWidth: "420px", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#dc2626", marginBottom: "16px" }}>Remove Allocation?</h2>
            <p style={{ marginBottom: "24px", fontSize: "15px", color: "#374151" }}>
              Are you sure you want to remove <strong>{allocationToDelete.memberName}</strong><br />
              from <strong>{allocationToDelete.requirementTitle}</strong>?
            </p>
            <div className="modal-actions" style={{ justifyContent: "center", gap: "16px" }}>
              <button
                className="btn secondary"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setAllocationToDelete(null);
                }}
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
                style={{ backgroundColor: "#dc2626", color: "white", border: "none" }}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL ALL ALLOCATIONS MODAL */}
      {showAllAllocationsModal && (
        <div className="modal-overlay" onClick={() => setShowAllAllocationsModal(false)}>
          <div className="modal-contents stats-modal" style={{ maxWidth: "1100px" }} onClick={(e) => e.stopPropagation()}>
            <h2>All Allocated Members ({stats.totalAllocated})</h2>

            {/* Filters */}
            <div style={{ margin: "20px 0", display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ position: "relative", flex: "1", minWidth: "300px" }}>
                <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#999", fontSize: "18px" }} />
                <input
                  type="text"
                  placeholder="Search by Job/Project Title..."
                  value={allocationTitleFilter}
                  onChange={(e) => setAllocationTitleFilter(e.target.value)}
                  style={{ width: "100%", padding: "14px 16px 14px 50px", borderRadius: "12px", border: "2px solid #e2e8f0" }}
                />
              </div>
              <div style={{ position: "relative", flex: "1", minWidth: "300px" }}>
                <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#999", fontSize: "18px" }} />
                <input
                  type="text"
                  placeholder="Search by Company..."
                  value={allocationCompanyFilter}
                  onChange={(e) => setAllocationCompanyFilter(e.target.value)}
                  style={{ width: "100%", padding: "14px 16px 14px 50px", borderRadius: "12px", border: "2px solid #e2e8f0" }}
                />
              </div>
              {(allocationTitleFilter || allocationCompanyFilter) && (
                <button
                  onClick={() => {
                    setAllocationTitleFilter("");
                    setAllocationCompanyFilter("");
                  }}
                  style={{ padding: "12px 20px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "12px" }}
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
                <div style={{ maxHeight: "600px", overflowY: "auto", marginTop: "16px" }}>
                  {filtered.length === 0 ? (
                    <p style={{ textAlign: "center", padding: "60px", color: "#888" }}>
                      {allAllocations.length === 0 ? "No allocations yet." : "No matching allocations."}
                    </p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc" }}>
                          <th style={{ padding: "12px", textAlign: "left" }}>Member</th>
                          <th style={{ padding: "12px", textAlign: "left" }}>Requirement</th>
                          <th style={{ padding: "12px", textAlign: "left" }}>Company</th>
                          <th style={{ padding: "12px", textAlign: "left" }}>Type</th>
                          <th style={{ padding: "12px", textAlign: "left" }}>Phone</th>
                          <th style={{ padding: "12px", textAlign: "left" }}>Actions</th>
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
                            <tr key={alloc.id} style={{ borderBottom: "1px solid #eee" }}>
                              <td style={{ padding: "12px" }}><strong>{member.name}</strong></td>
                              <td style={{ padding: "12px" }}>{job?.title || "—"}</td>
                              <td style={{ padding: "12px" }}>{job?.company || "—"}</td>
                              <td style={{ padding: "12px" }}>
                                <span style={{
                                  background: job?.type === "project" ? "#9333ea" : "#2563eb",
                                  color: "white",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                }}>
                                  {job?.type === "project" ? "Project" : "Job"}
                                </span>
                              </td>
                              <td style={{ padding: "12px" }}>{member.phone}</td>
                              <td style={{ padding: "12px" }}>
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button
                                    onClick={() => {
                                      setSelectedMember(member);
                                      setShowMemberDetailModal(true);
                                    }}
                                    style={{
                                      background: "#1e40af",
                                      color: "white",
                                      border: "none",
                                      padding: "6px 12px",
                                      borderRadius: "6px",
                                      fontSize: "13px",
                                    }}
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
                                      border: "1px solid #fecaca",
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      fontSize: "13px",
                                    }}
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

            <div className="modal-actions" style={{ marginTop: "32px" }}>
              <button className="btn secondary" onClick={() => setShowAllAllocationsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER DETAIL MODAL */}
      {showMemberDetailModal && selectedMember && (
        <div className="modal-overlay" onClick={() => setShowMemberDetailModal(false)}>
          <div className="modal-contents" style={{ maxWidth: "900px" }} onClick={(e) => e.stopPropagation()}>
            <h2>Member Details: <strong>{selectedMember.name}</strong></h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", marginTop: "24px" }}>
              <div><strong>Name:</strong> {selectedMember.name}</div>
              <div><strong>Email:</strong> {selectedMember.email || "—"}</div>
              <div><strong>Phone:</strong> {selectedMember.phone || "—"}</div>
              <div><strong>Designation:</strong> {selectedMember.designation || "—"}</div>
              <div><strong>Gender:</strong> {selectedMember.gender || "—"}</div>
              <div><strong>City:</strong> {selectedMember.city || "—"}</div>
              <div><strong>State:</strong> {selectedMember.state || "—"}</div>
              <div><strong>Category:</strong> {selectedMember.category || "—"}</div>
              <div><strong>Service:</strong> {selectedMember.service || "—"}</div>
              <div><strong>Rank:</strong> {selectedMember.rank || "—"}</div>
              <div><strong>Level:</strong> {selectedMember.level || "—"}</div>
              {selectedMember.resume_fileurl && (
                <div>
                  <strong>Resume:</strong>{" "}
                  <a href={selectedMember.resume_fileurl} target="_blank" rel="noopener noreferrer" style={{ color: "#1e40af" }}>
                    View Resume
                  </a>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: "40px" }}>
              <button className="btn secondary" onClick={() => setShowMemberDetailModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS DETAIL MODAL */}
      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal-contents" style={{ maxWidth: "800px" }} onClick={(e) => e.stopPropagation()}>
            <h2>
              {statsModalType === "total" && "All Requirements"}
              {statsModalType === "active" && "Open Requirements"}
              {statsModalType === "completed" && "Closed Requirements"}
            </h2>
            <div style={{ maxHeight: "500px", overflowY: "auto", marginTop: "16px" }}>
              {(() => {
                const list =
                  statsModalType === "total" ? requirementsData :
                  statsModalType === "active" ? requirementsData.filter(r => r.status === "active") :
                  requirementsData.filter(r => r.status === "completed");

                return list.length === 0 ? (
                  <p>No requirements found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {list.map((req) => (
                      <li key={req.id} style={{ padding: "12px 0", borderBottom: "1px solid #eee" }}>
                        <strong>{req.title}</strong> — {req.company} ({req.status === "active" ? "Open" : "Closed"})
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowStatsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}