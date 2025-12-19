// src/pages/RequirementsPage.jsx
import { useState, useEffect, useMemo } from "react";
import {
  FaBriefcase,
  FaCheckCircle,
  FaHourglassHalf,
  FaUsers,
} from "react-icons/fa";
import {
  collection,
  getDocs,
  query,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

export default function RequirementsPage() {
  const [requirementsData, setRequirementsData] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedReq, setSelectedReq] = useState(null);

  // Modals
  const [showJobModal, setShowJobModal] = useState(false);              // Job details
  const [showAllocateModal, setShowAllocateModal] = useState(false);    // Allocate members from job
  const [showStatsModal, setShowStatsModal] = useState(false);          // Stats card click
  const [statsModalType, setStatsModalType] = useState("");              // "total" | "active" | "completed" | "allocated"

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* --------------------------------------------------------------- */
  /* FETCH REQUIREMENTS                                              */
  /* --------------------------------------------------------------- */
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
            allocated: job.allocated ?? 0,
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

  /* --------------------------------------------------------------- */
  /* FETCH MEMBERS - Only when needed (stats or allocate modal)      */
  /* --------------------------------------------------------------- */
  useEffect(() => {
    if (!showStatsModal && !showAllocateModal) {
      setMembers([]);
      return;
    }

    if (statsModalType !== "allocated" && !showAllocateModal) {
      setMembers([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || doc.data().displayName || doc.data().first_name || "Unnamed",
          email: doc.data().email || "—",
          phone: doc.data().phone || doc.data().mobile || doc.data().phone_number || "—",
          designation: doc.data().designation || doc.data().role || "—",
          ...doc.data(),
        }));
        setMembers(membersList);
        console.log("Fetched members:", membersList);
      },
      (error) => {
        console.error("Error fetching members:", error);
      }
    );

    return () => unsubscribe();
  }, [showStatsModal, statsModalType, showAllocateModal]);

  /* --------------------------------------------------------------- */
  /* STATS                                                           */
  /* --------------------------------------------------------------- */
  const stats = useMemo(() => {
    const active = requirementsData.filter((r) => r.status === "active").length;
    const completed = requirementsData.filter((r) => r.status === "completed").length;
    const totalAllocated = requirementsData.reduce((sum, r) => sum + r.allocated, 0);
    return { active, completed, total: requirementsData.length, totalAllocated };
  }, [requirementsData]);

  const getFilteredRequirements = (type) => {
    if (type === "total") return requirementsData;
    if (type === "active") return requirementsData.filter((r) => r.status === "active");
    if (type === "completed") return requirementsData.filter((r) => r.status === "completed");
    return [];
  };

  const handleStatClick = (type) => {
    setStatsModalType(type);
    setShowStatsModal(true);
  };

  /* --------------------------------------------------------------- */
  /* RENDER                                                          */
  /* --------------------------------------------------------------- */
  if (loading) return <div className="dashboard-container"><div className="loading">Loading requirements…</div></div>;
  if (error) return <div className="dashboard-container"><div className="error">{error}</div></div>;

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Requirements Allocation Dashboard</h1>
          <div>
            <button className="filter-btn active">All</button>
            <button className="filter-btn">Open</button>
            <button className="filter-btn">Closed</button>
          </div>
        </div>
      </header>

      {/* STATS GRID - Clickable */}
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
              <p className="stat-label">Active Requirements</p>
              <p className="stat-value">{stats.active}</p>
            </div>
          </div>
        </div>

        <div className="card" onClick={() => handleStatClick("completed")} style={{ cursor: "pointer" }}>
          <div className="stat-card completed">
            <div className="icon-wrapper bg-cyan"><FaCheckCircle size={32} /></div>
            <div className="stat-info">
              <p className="stat-label">Completed</p>
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
        <h2 className="section-title">Current Requirements</h2>
        {requirementsData.length === 0 ? (
          <p>No requirements found.</p>
        ) : (
          <div className="requirements-grid">
            {requirementsData.map((req) => (
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
                    className="company-logo"
                    style={{ width: 50, height: 50, borderRadius: 8, marginBottom: 10, objectFit: "contain" }}
                  />
                )}
                <div className="req-header">
                  <h3>{req.title}</h3>
                  <span className={`status-badge ${req.status}`}>
                    {req.status === "active" ? "Open" : "Closed"}
                  </span>
                </div>
                <p className="company"><strong>{req.company}</strong></p>
                <p className="location">Location: {req.location}</p>
                <p className="salary">Salary: {req.salary}</p>
                <p className="deadline">Posted: {req.postedOn}</p>
                <div className="allocated">
                  <FaUsers size={14} /> Allocated: <strong>{req.allocated}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* JOB DETAILS MODAL */}
      {showJobModal && selectedReq && (
        <div className="modal-overlay" onClick={() => setShowJobModal(false)}>
          <div className="modal-contents" onClick={(e) => e.stopPropagation()}>
            {selectedReq.logo && (
              <img
                src={selectedReq.logo}
                alt={`${selectedReq.company} logo`}
                style={{ width: 100, borderRadius: 10, marginBottom: 16, objectFit: "contain" }}
              />
            )}
            <h2>{selectedReq.title}</h2>
            <p><strong>Company:</strong> {selectedReq.company}</p>
            <p><strong>Location:</strong> {selectedReq.location}</p>
            <p><strong>Salary Range:</strong> {selectedReq.salary}</p>
            <p><strong>Posted On:</strong> {selectedReq.postedOn}</p>
            {selectedReq.benefits && <p><strong>Benefits:</strong> {selectedReq.benefits}</p>}
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
                }}
              >
                Allocate Members
              </button>
              <button className="btn secondary" onClick={() => setShowJobModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATE MEMBERS MODAL (from job details) */}
      {showAllocateModal && selectedReq && (
        <div className="modal-overlay" onClick={() => setShowAllocateModal(false)}>
          <div className="modal-contents allocate-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Allocate Members to: <strong>{selectedReq.title}</strong></h2>
            <p><strong>Company:</strong> {selectedReq.company} | <strong>Location:</strong> {selectedReq.location}</p>

            <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", marginTop: "16px" }}>
              {members.length === 0 ? (
                <p>Loading members...</p>
              ) : (
                members.map((member) => (
                  <label
                    key={member.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "12px",
                      borderBottom: "1px solid #eee",
                      cursor: "pointer",
                    }}
                  >
                    <input type="checkbox" style={{ marginRight: "16px", transform: "scale(1.3)" }} />
                    <div>
                      <strong>{member.name}</strong><br />
                      <small>Email: {member.email} | Phone: {member.phone} | Role: {member.designation}</small>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "24px" }}>
              <button className="btn primary">Save Allocation</button>
              <button
                className="btn secondary"
                onClick={() => {
                  setShowAllocateModal(false);
                  setShowJobModal(true);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATS MODAL (when clicking stat cards) */}
      {showStatsModal && (
        <div className="modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="modal-contents stats-modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {statsModalType === "total" && "All Requirements"}
              {statsModalType === "active" && "Active Requirements"}
              {statsModalType === "completed" && "Completed Requirements"}
              {statsModalType === "allocated" && "All Members (Total Allocated)"}
            </h2>

            {statsModalType !== "allocated" ? (
              <div style={{ maxHeight: "500px", overflowY: "auto", marginTop: "16px" }}>
                {getFilteredRequirements(statsModalType).length === 0 ? (
                  <p>No requirements found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {getFilteredRequirements(statsModalType).map((req) => (
                      <li key={req.id} style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>
                        <strong>{req.title}</strong> — {req.company} ({req.status === "active" ? "Open" : "Closed"})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="members-list" style={{ maxHeight: "500px", overflowY: "auto", marginTop: "16px" }}>
                {members.length === 0 ? (
                  <p>Loading members...</p>
                ) : (
                  members.map((member) => (
                    <label
                      key={member.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        cursor: "pointer",
                      }}
                    >
                      <input type="checkbox" style={{ marginRight: "16px", transform: "scale(1.3)" }} />
                      <div>
                        <strong>{member.name}</strong><br />
                        <small>Email: {member.email} | Phone: {member.phone} | Role: {member.designation}</small>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}

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