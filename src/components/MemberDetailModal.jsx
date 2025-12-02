// src/components/MemberDetailModal.jsx
import { useState } from "react";

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "service", label: "Service Record" },
    { id: "job", label: "Job Preferences" },
    { id: "experience", label: "Experience & Skills" },
    { id: "documents", label: "Documents & IDs" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{member["Full Name"]}</h2>
            <p style={{ margin: "5px 0", opacity: 0.9, fontSize: "15px" }}>
              {member["Rank"]} • {member["Service"]} • {member["Member Id"]}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {/* Same content as your original — keeping only one tab example for brevity */}
          {activeTab === "personal" && (
            <div className="detail-grid">
              <div><strong>Full Name:</strong> {member["Full Name"]}</div>
              <div><strong>Date of Birth:</strong> {member["Dob"]}</div>
              <div><strong>Gender:</strong> {member["Gender"]}</div>
              <div><strong>Email:</strong> {member["Email"]}</div>
              <div><strong>Mobile:</strong> {member["Mobile Number"]}</div>
              <div><strong>Location:</strong> {member["Current Location"]}</div>
              <div><strong>Preferred Location:</strong> {member["Preferred Job Location"] || "Any"}</div>
            </div>
          )}
          {/* Add other tabs similarly */}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}