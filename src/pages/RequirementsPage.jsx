// src/pages/RequirementsPage.jsx
import { useState, useEffect, useMemo } from "react";
import {
  FaBriefcase,
  FaCheckCircle,
  FaHourglassHalf,
  FaUsers,
  FaSearch,
  FaEye,
} from "react-icons/fa";
import {
  collection,
  getDocs,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export default function RequirementsPage() {
  const [requirementsData, setRequirementsData] = useState([]);
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null);

  // Global allocations + live counts
  const [allAllocations, setAllAllocations] = useState([]);
  const [allocatedCounts, setAllocatedCounts] = useState({}); // jobId → count

  // Modals
  const [showJobModal, setShowJobModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalType, setStatsModalType] = useState("");
  const [showMemberDetailModal, setShowMemberDetailModal] = useState(false);
  const [showAllocatedMembersModal, setShowAllocatedMembersModal] = useState(false);
  const [showAllAllocationsModal, setShowAllAllocationsModal] = useState(false);

  // Selected members for allocation
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  // Selected member for detail view
  const [selectedMember, setSelectedMember] = useState(null);

  // Allocated members for current job
  const [allocatedMembers, setAllocatedMembers] = useState([]);

  // Search term
  const [memberSearchTerm, setMemberSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* FETCH REQUIREMENTS */
  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "jobsmaster"));
        const snapshot = await getDocs(q);
        const raw = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        const transformed = raw.map((job) => {
          const min = job.job_salaryrange_minimum ?? 0;
          const max = job.job_salaryrange_maximum ?? 0;
          let salary = "Not disclosed";
          if (min > 0 && max > 0) {
            const minLPA = (min * 12) / 100000;
            const maxLPA = (max * 12) / 100000;
            salary = `₹${minLPA.toFixed(1)} - ₹${maxLPA.toFixed(1)} LPA`;
          } else if (min > 0) {
            salary = `₹${min.toLocaleString()}/month`;
          }
          const status = job.job_status === "Open" ? "active" : "completed";
          return {
            id: job.id,
            title: job.job_title ?? "Untitled Job",
            jd: job.job_roleandresponsibilities ?? "No description available.",
            salary,
            location: job.job_city ?? job.job_location ?? "Location not specified",
            postedOn: job.job_postedon ?? "—",
            status,
            company: job.job_company ?? "—",
            logo: job.job_logo ?? null,
            benefits: job.job_otherbenefits ?? null,
          };
        });
        transformed.sort((a, b) => new Date(b.postedOn) - new Date(a.postedOn));
        setRequirementsData(transformed);
      } catch (err) {
        console.error(err);
        setError("Failed to load requirements.");
      } finally {
        setLoading(false);
      }
    };
    fetchRequirements();
  }, []);

  /* FETCH ALL ALLOCATIONS - Global listener for live counts & global view */
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "allocations"), (snapshot) => {
      const allocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setAllAllocations(allocs);

      // Compute live allocated count per job
      const counts = {};
      allocs.forEach((alloc) => {
        counts[alloc.jobId] = (counts[alloc.jobId] || 0) + 1;
      });
      setAllocatedCounts(counts);
    });

    return () => unsubscribe();
  }, []);

  /* FETCH ALLOCATED MEMBERS FOR SELECTED JOB */
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

  /* FETCH MEMBERS - only when needed */
  useEffect(() => {
    const needsMembers =
      showStatsModal ||
      showAllocateModal ||
      showAllocatedMembersModal ||
      showAllAllocationsModal;

    if (!needsMembers) {
      setMembers([]);
      setFilteredMembers([]);
      setMemberSearchTerm("");
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          name:
            doc.data().name ||
            doc.data().displayName ||
            doc.data().first_name ||
            "Unnamed",
          email: doc.data().email || "—",
          phone:
            doc.data().phone ||
            doc.data().mobile ||
            doc.data().phone_number ||
            "—",
          designation: doc.data().designation || doc.data().role || "—",
          ...doc.data(),
        }));
        setMembers(membersList);
        setFilteredMembers(membersList);
      },
      (error) => console.error("Error fetching members:", error)
    );

    return () => unsubscribe();
  }, [
    showStatsModal,
    showAllocateModal,
    showAllocatedMembersModal,
    showAllAllocationsModal,
  ]);

  /* LIVE SEARCH FILTER */
  useEffect(() => {
    if (!memberSearchTerm.trim()) {
      setFilteredMembers(members);
    } else {
      const term = memberSearchTerm.toLowerCase();
      setFilteredMembers(
        members.filter(
          (m) =>
            m.name?.toLowerCase().includes(term) ||
            m.email?.toLowerCase().includes(term) ||
            m.phone?.includes(term) ||
            m.designation?.toLowerCase().includes(term)
        )
      );
    }
  }, [memberSearchTerm, members]);

  /* STATS - Now uses live allocated count */
  const stats = useMemo(() => {
    const active = requirementsData.filter((r) => r.status === "active").length;
    const completed = requirementsData.filter((r) => r.status === "completed")
      .length;
    const totalAllocated = Object.values(allocatedCounts).reduce(
      (sum, count) => sum + count,
      0
    );
    return {
      active,
      completed,
      total: requirementsData.length,
      totalAllocated,
    };
  }, [requirementsData, allocatedCounts]);

  const getFilteredRequirements = (type) => {
    if (type === "total") return requirementsData;
    if (type === "active")
      return requirementsData.filter((r) => r.status === "active");
    if (type === "completed")
      return requirementsData.filter((r) => r.status === "completed");
    return [];
  };

  const handleStatClick = (type) => {
    if (type === "allocated") {
      setShowAllAllocationsModal(true);
    } else {
      setStatsModalType(type);
      setShowStatsModal(true);
    }
    setMemberSearchTerm("");
  };

  if (loading)
    return (
      <div className="dashboard-container">
        <div className="loading">Loading requirements…</div>
      </div>
    );
  if (error)
    return (
      <div className="dashboard-container">
        <div className="error">{error}</div>
      </div>
    );

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">
            Requirements Allocation Dashboard
          </h1>
          <div>
            <button className="filter-btn active">All</button>
            <button className="filter-btn">Open</button>
            <button className="filter-btn">Closed</button>
            <button className="filter-btn">Temp Staffing</button>
            <button className="filter-btn">Recruitment</button>
            <button className="filter-btn">Projects</button>
          </div>
        </div>
      </header>

      {/* STATS GRID */}
      <div className="stats-grid">
        <div
          className="card"
          onClick={() => handleStatClick("total")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-card total-members">
            <div className="icon-wrapper bg-blue">
              <FaBriefcase size={32} />
            </div>
            <div className="stat-info">
              <p className="stat-label">Total Requirements</p>
              <p className="stat-value">{stats.total}</p>
            </div>
          </div>
        </div>
        <div
          className="card"
          onClick={() => handleStatClick("active")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-card active">
            <div className="icon-wrapper bg-green">
              <FaHourglassHalf size={32} />
            </div>
            <div className="stat-info">
              <p className="stat-label">Active Requirements</p>
              <p className="stat-value">{stats.active}</p>
            </div>
          </div>
        </div>
        <div
          className="card"
          onClick={() => handleStatClick("completed")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-card completed">
            <div className="icon-wrapper bg-cyan">
              <FaCheckCircle size={32} />
            </div>
            <div className="stat-info">
              <p className="stat-label">Completed</p>
              <p className="stat-value">{stats.completed}</p>
            </div>
          </div>
        </div>
        <div
          className="card"
          onClick={() => handleStatClick("allocated")}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-card allocated">
            <div className="icon-wrapper bg-purple">
              <FaUsers size={32} />
            </div>
            <div className="stat-info">
              <p className="stat-label">Total Allocated Members</p>
              <p className="stat-value">{stats.totalAllocated}</p>
            </div>
          </div>
        </div>
      </div>

      {/* REQUIREMENTS LIST - Live Allocated Count */}
      <div className="requirements-section">
        <h2 className="section-title">Current Requirements</h2>
        {requirementsData.length === 0 ? (
          <p>No requirements found.</p>
        ) : (
          <div className="requirements-grid">
            {requirementsData.map((req) => {
              const liveCount = allocatedCounts[req.id] || 0;
              return (
                <div
                  key={req.id}
                  className={`requirement-card ${req.status}`}
                  onClick={() => {
                    setSelectedReq(req);
                    setShowJobModal(true);
                  }}
                >
                  {req.logo && (
                    <img
                      src={req.logo}
                      alt={`${req.company} logo`}
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 8,
                        marginBottom: 10,
                        objectFit: "contain",
                      }}
                    />
                  )}
                  <div className="req-header">
                    <h3>{req.title}</h3>
                    <span className={`status-badge ${req.status}`}>
                      {req.status === "active" ? "Open" : "Closed"}
                    </span>
                  </div>
                  <p className="company">
                    <strong>{req.company}</strong>
                  </p>
                  <p className="location">Location: {req.location}</p>
                  <p className="salary">Salary: {req.salary}</p>
                  <p className="deadline">Posted: {req.postedOn}</p>
                  <div className="allocated">
                    <FaUsers size={14} /> Allocated:{" "}
                    <strong>{liveCount}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* JOB DETAILS MODAL */}
      {showJobModal && selectedReq && (
        <div
          className="modal-overlay"
          onClick={() => setShowJobModal(false)}
        >
          <div
            className="modal-contents"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedReq.logo && (
              <img
                src={selectedReq.logo}
                alt={`${selectedReq.company} logo`}
                style={{
                  width: 100,
                  borderRadius: 10,
                  marginBottom: 16,
                  objectFit: "contain",
                }}
              />
            )}
            <h2>{selectedReq.title}</h2>
            <p>
              <strong>Company:</strong> {selectedReq.company}
            </p>
            <p>
              <strong>Location:</strong> {selectedReq.location}
            </p>
            <p>
              <strong>Salary Range:</strong> {selectedReq.salary}
            </p>
            <p>
              <strong>Posted On:</strong> {selectedReq.postedOn}
            </p>
            {selectedReq.benefits && (
              <p>
                <strong>Benefits:</strong> {selectedReq.benefits}
              </p>
            )}
            <p>
              <strong>Status:</strong>{" "}
              <span className={`status-badge inline ${selectedReq.status}`}>
                {selectedReq.status === "active" ? "Open" : "Closed"}
              </span>
            </p>
            <div className="jd-section">
              <strong>Job Description & Responsibilities:</strong>
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
              <button
                className="btn primary"
                onClick={() => {
                  setShowAllocateModal(true);
                  setShowJobModal(false);
                  setMemberSearchTerm("");
                  setSelectedMemberIds([]);
                }}
              >
                Allocate Members
              </button>
              <button
                className="btn outline"
                style={{ marginLeft: "12px", backgroundColor: "#1e40af"
                 }}
                onClick={() => setShowAllocatedMembersModal(true)}
              >
                Allocated Members ({allocatedMembers.length})
              </button>
              <button
                className="btn secondary"
                onClick={() => setShowJobModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATE MEMBERS MODAL */}
      {showAllocateModal && selectedReq && (
        <div
          className="modal-overlay"
          onClick={() => setShowAllocateModal(false)}
        >
          <div
            className="modal-contents allocate-modal"
            style={{ maxWidth: "800px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              Allocate Members to: <strong>{selectedReq.title}</strong>
            </h2>
            <p>
              <strong>Company:</strong> {selectedReq.company} |{" "}
              <strong>Location:</strong> {selectedReq.location}
            </p>

            <div style={{ margin: "24px 0" }}>
              <div style={{ position: "relative", maxWidth: "500px" }}>
                <FaSearch
                  style={{
                    position: "absolute",
                    left: "16px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#999",
                    fontSize: "18px",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, role..."
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "14px 16px 14px 50px",
                    borderRadius: "12px",
                    border: "2px solid #e2e8f0",
                    fontSize: "16px",
                  }}
                />
              </div>
            </div>

            <div
              className="members-list"
              style={{ maxHeight: "500px", overflowY: "auto" }}
            >
              {filteredMembers.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "60px",
                    color: "#888",
                  }}
                >
                  {members.length === 0
                    ? "Loading members..."
                    : "No members found."}
                </p>
              ) : (
                filteredMembers.map((member) => (
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
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#f0f9ff")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", flex: 1 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(member.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMemberIds((prev) => [
                              ...prev,
                              member.id,
                            ]);
                          } else {
                            setSelectedMemberIds((prev) =>
                              prev.filter((id) => id !== member.id)
                            );
                          }
                        }}
                        style={{
                          marginRight: "20px",
                          transform: "scale(1.4)",
                          accentColor: "#1e40af",
                        }}
                      />
                      <div>
                        <strong style={{ fontSize: "16px" }}>
                          {member.name}
                        </strong>
                        <br />
                        <small style={{ color: "#666" }}>
                          Email: {member.email} | Phone: {member.phone} | Role:{" "}
                          {member.designation}
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
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <FaEye /> View Details
                    </button>
                  </label>
                ))
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "32px" }}>
              <button
                className="btn primary"
                disabled={selectedMemberIds.length === 0}
                onClick={async () => {
                  try {
                    const promises = selectedMemberIds.map((userId) => {
                      const member = members.find((m) => m.id === userId);
                      return addDoc(collection(db, "allocations"), {
                        jobId: selectedReq.id,
                        userId,
                        name: member.name, // Save full name
                        phone: member.phone || "—",
                        allocatedAt: serverTimestamp(),
                      });
                    });

                    await Promise.all(promises);
                    alert("Members allocated successfully!");
                    setSelectedMemberIds([]);
                    setShowAllocateModal(false);
                    setShowJobModal(true);
                  } catch (err) {
                    console.error("Allocation error:", err);
                    alert("Failed to allocate members.");
                  }
                }}
              >
                Save Allocation ({selectedMemberIds.length})
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  setShowAllocateModal(false);
                  setShowJobModal(true);
                  setSelectedMemberIds([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATED MEMBERS PER JOB MODAL */}
      {showAllocatedMembersModal && selectedReq && (
        <div
          className="modal-overlay"
          onClick={() => setShowAllocatedMembersModal(false)}
        >
          <div
            className="modal-contents allocate-modal"
            style={{ maxWidth: "800px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              Allocated Members for: <strong>{selectedReq.title}</strong> (
              {allocatedMembers.length})
            </h2>
            <p>
              <strong>Company:</strong> {selectedReq.company} |{" "}
              <strong>Location:</strong> {selectedReq.location}
            </p>

            <div
              className="members-list"
              style={{ maxHeight: "500px", overflowY: "auto", marginTop: "24px" }}
            >
              {allocatedMembers.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "60px",
                    color: "#888",
                  }}
                >
                  No members allocated yet.
                </p>
              ) : (
                allocatedMembers.map((alloc) => {
                  const member =
                    members.find((m) => m.id === alloc.userId) || {
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
                        <strong style={{ fontSize: "16px" }}>
                          {member.name}
                        </strong>
                        <br />
                        <small style={{ color: "#666" }}>
                          Email: {member.email} | Phone: {member.phone} | Role:{" "}
                          {member.designation}
                        </small>
                      </div>
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
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "600",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <FaEye /> View Details
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "32px" }}>
              <button
                className="btn secondary"
                onClick={() => {
                  setShowAllocatedMembersModal(false);
                  setShowJobModal(true);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL ALL ALLOCATIONS MODAL */}
      {showAllAllocationsModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAllAllocationsModal(false)}
        >
          <div
            className="modal-contents stats-modal"
            style={{ maxWidth: "1000px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              All Allocated Members Across Jobs ({stats.totalAllocated})
            </h2>

            <div
              style={{ maxHeight: "600px", overflowY: "auto", marginTop: "24px" }}
            >
              {allAllocations.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    padding: "60px",
                    color: "#888",
                  }}
                >
                  No allocations yet.
                </p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "#f8fafc",
                        textAlign: "left",
                      }}
                    >
                      <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>
                        Member Name
                      </th>
                      <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>
                        Job Title
                      </th>
                      <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>
                        Company
                      </th>
                      <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>
                        Phone
                      </th>
                      <th style={{ padding: "12px", borderBottom: "2px solid #e2e8f0" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAllocations.map((alloc) => {
                      const job = requirementsData.find(
                        (j) => j.id === alloc.jobId
                      );
                      const member =
                        members.find((m) => m.id === alloc.userId) || {
                          name: alloc.name || "Unknown Member",
                          phone: alloc.phone || "—",
                        };
                      return (
                        <tr
                          key={alloc.id}
                          style={{ borderBottom: "1px solid #eee" }}
                        >
                          <td style={{ padding: "12px" }}>
                            <strong>{member.name}</strong>
                          </td>
                          <td style={{ padding: "12px" }}>
                            {job?.title || "Unknown Job"}
                          </td>
                          <td style={{ padding: "12px" }}>
                            {job?.company || "—"}
                          </td>
                          <td style={{ padding: "12px" }}>{member.phone}</td>
                          <td style={{ padding: "12px" }}>
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
                                cursor: "pointer",
                                fontSize: "13px",
                              }}
                            >
                              <FaEye /> View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "32px" }}>
              <button
                className="btn secondary"
                onClick={() => setShowAllAllocationsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS MODAL (for total/active/completed) */}
      {showStatsModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowStatsModal(false)}
        >
          <div
            className="modal-contents stats-modal"
            style={{ maxWidth: "800px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              {statsModalType === "total" && "All Requirements"}
              {statsModalType === "active" && "Active Requirements"}
              {statsModalType === "completed" && "Completed Requirements"}
            </h2>

            <div
              style={{ maxHeight: "500px", overflowY: "auto", marginTop: "16px" }}
            >
              {getFilteredRequirements(statsModalType).length === 0 ? (
                <p>No requirements found.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {getFilteredRequirements(statsModalType).map((req) => (
                    <li
                      key={req.id}
                      style={{
                        padding: "12px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <strong>{req.title}</strong> — {req.company} (
                      {req.status === "active" ? "Open" : "Closed"})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setShowStatsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER DETAIL MODAL */}
      {showMemberDetailModal && selectedMember && (
        <div
          className="modal-overlay"
          onClick={() => setShowMemberDetailModal(false)}
        >
          <div
            className="modal-contents"
            style={{ maxWidth: "900px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              Member Details:{" "}
              <strong>
                {selectedMember.name ||
                  selectedMember.first_name + " " + selectedMember.last_name}
              </strong>
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "16px",
                marginTop: "24px",
                fontSize: "15px",
              }}
            >
              <div>
                <strong>Name:</strong>{" "}
                {selectedMember.name ||
                  `${selectedMember.first_name} ${selectedMember.last_name}`}
              </div>
              <div>
                <strong>Email:</strong> {selectedMember.email || "—"}
              </div>
              <div>
                <strong>Phone:</strong>{" "}
                {selectedMember.phone ||
                  selectedMember.phone_number ||
                  "—"}
              </div>
              <div>
                <strong>Designation:</strong> {selectedMember.designation || "—"}
              </div>
              <div>
                <strong>Gender:</strong> {selectedMember.gender || "—"}
              </div>
              <div>
                <strong>City:</strong> {selectedMember.city || "—"}
              </div>
              <div>
                <strong>State:</strong> {selectedMember.state || "—"}
              </div>
              <div>
                <strong>Country:</strong> {selectedMember.country || "—"}
              </div>
              <div>
                <strong>Location:</strong> {selectedMember.location || "—"}
              </div>
              <div>
                <strong>Organization:</strong>{" "}
                {selectedMember.organization || "—"}
              </div>
              <div>
                <strong>Graduation Course:</strong>{" "}
                {selectedMember.graduation_course || "—"}
              </div>
              <div>
                <strong>Graduation %:</strong>{" "}
                {selectedMember.graduation_percentage || "—"}
              </div>
              <div>
                <strong>Post Graduation Course:</strong>{" "}
                {selectedMember.postgraduation_course || "—"}
              </div>
              <div>
                <strong>Post Graduation %:</strong>{" "}
                {selectedMember.postgraduation_percentage || "—"}
              </div>
              <div>
                <strong>11th %:</strong>{" "}
                {selectedMember.percentage11th || "—"}
              </div>
              <div>
                <strong>12th %:</strong>{" "}
                {selectedMember.percentage12th || "—"}
              </div>
              {selectedMember.resume_fileurl && (
                <div>
                  <strong>Resume:</strong>{" "}
                  <a
                    href={selectedMember.resume_fileurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1e40af", textDecoration: "underline" }}
                  >
                    Open Resume PDF
                  </a>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "40px" }}>
              <button
                className="btn secondary"
                onClick={() => setShowMemberDetailModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}