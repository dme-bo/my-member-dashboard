// src/pages/RequirementsPage.jsx
import { useState, useMemo } from "react";
import { FaBriefcase, FaCheckCircle, FaHourglassHalf, FaUsers } from "react-icons/fa";

// Sample data - replace with your actual API/data later
const requirementsData = [
  { id: 1, title: "Senior Security Officer", jd: "Responsible for site security...", salary: "₹18-22 LPA", location: "Mumbai", deadline: "20 Dec 2025", status: "active", allocated: 2 },
  { id: 2, title: "Facility Manager", jd: "Oversee operations of corporate facilities...", salary: "₹15-18 LPA", location: "Delhi", deadline: "20 Dec 2025", status: "active", allocated: 0 },
  { id: 3, title: "Admin Executive (Ex-Serviceman)", jd: "Handle admin & coordination...", salary: "₹8-10 LPA", location: "Pune", deadline: "20 Dec 2025", status: "completed", allocated: 5 },
  { id: 4, title: "Driver Cum Guard", jd: "Safe driving + basic security...", salary: "₹4-6 LPA", location: "Bangalore", deadline: "20 Dec 2025", status: "active", allocated: 1 },
  { id: 5, title: "Fire & Safety Officer", jd: "Ensure compliance with fire safety norms...", salary: "₹12-15 LPA", location: "Chennai", deadline: "20 Dec 2025", status: "active", allocated: 0 },
];

export default function RequirementsPage() {
  const [selectedReq, setSelectedReq] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const stats = useMemo(() => {
    const active = requirementsData.filter(r => r.status === "active").length;
    const completed = requirementsData.filter(r => r.status === "completed").length;
    const totalAllocated = requirementsData.reduce((sum, r) => sum + r.allocated, 0);
    return { active, completed, total: requirementsData.length, totalAllocated };
  }, []);

  return (
    <div className="dashboard-container">
        
      {/* Header */}
<header className="dashboard-header">
  <div className="header-content">
    <h1 className="dashboard-title">Requirements Allocation Dashboard</h1>

      <button className="filter-btn active">All</button>
      <button className="filter-btn">Open</button>
      <button className="filter-btn">In Progress</button>
      <button className="filter-btn">Closed</button>
      <button className="filter-btn">TempStaff</button>
      <button className="filter-btn">Recruitment</button>
      <button className="filter-btn">Projects</button>
    </div>
</header>

      {/* Stats Cards - Same Style */}
      <div className="stats-grid">
        <div className="card">
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
        <div className="card">
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
        <div className="card">
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
        <div className="card">
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

      {/* Requirements List */}
      <div className="requirements-section">
        <h2 className="section-title">Current Active Requirements</h2>
        <div className="requirements-grid">
          {requirementsData.map((req) => (
            <div
              key={req.id}
              className={`requirement-card ${req.status}`}
              onClick={() => {
                setSelectedReq(req);
                setShowModal(true);
              }}
            >
              <div className="req-header">
                <h3>{req.title}</h3>
                <span className={`status-badge ${req.status}`}>
                  {req.status === "active" ? "Open" : "Closed"}
                </span>
              </div>
              <p className="location">Location: {req.location}</p>
              <p className="salary">Salary: {req.salary}</p>
              <p className="deadline">Deadline: {req.deadline}</p>
              <div className="allocated">
                <FaUsers size={14} /> Allocated: <strong>{req.allocated}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && selectedReq && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-contents" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedReq.title}</h2>
            <p><strong>Location:</strong> {selectedReq.location}</p>
            <p><strong>Salary Range:</strong> {selectedReq.salary}</p>
            <p><strong>Application Deadline:</strong> {selectedReq.deadline}</p>
            <p><strong>Status:</strong> <span className={`status-badge inline ${selectedReq.status}`}>
              {selectedReq.status === "active" ? "Open" : "Closed"}
            </span></p>
            <div className="jd-section">
              <strong>Job Description:</strong>
              <p>{selectedReq.jd}</p>
            </div>
            <div className="modal-actions">
              <button className="btn primary">Allocate Members</button>
              <button className="btn secondary" onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}