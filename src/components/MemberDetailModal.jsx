// src/components/MemberDetailModal.jsx
import { useState } from "react";

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");
  
  // Notes: You can add a "notes" field later in Firestore. For now, using local state.
  const [notes, setNotes] = useState(member.notes || "");

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "education", label: "Education" },
    { id: "service", label: "Service Record" },
    { id: "job", label: "Job Preferences" },
    { id: "documents", label: "Documents" },
    { id: "interaction", label: "Interaction & Notes" },
  ];

  // Rating logic (assuming you might add a "rating" field later)
  const rating = parseInt(member.rating) || 0;
  const getRatingLabel = (stars) => {
    const labels = {
      1: "Poor - Unresponsive / Unprofessional",
      2: "Below Average - Slow response / Low interest",
      3: "Average - Decent communication",
      4: "Good - Proactive & Professional",
      5: "Excellent - Highly recommended",
    };
    return labels[stars] || "Not Rated";
  };

  const renderStars = () => {
    return (
      <div className="star-rating" title={getRatingLabel(rating)}>
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className="star"
            style={{
              color: i < rating ? "#f59e0b" : "#e5e7eb",
              fontSize: "20px",
            }}
          >
            ★
          </span>
        ))}
        <span style={{ marginLeft: "8px", fontSize: "14px", fontWeight: "500" }}>
          {rating}/5
        </span>
      </div>
    );
  };

  const handleSaveNotes = () => {
    // TODO: Integrate with Firestore update later
    alert("Notes saved locally! (Implement Firestore save in production)");
    console.log("Notes for", member.first_name, member.last_name, ":", notes);
  };

  const fullName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "N/A";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <h2>{fullName}</h2>
            <p style={{ margin: "5px 0", opacity: 0.9, fontSize: "15px" }}>
              {member.phone_number || "N/A"} • {member.email || "N/A"}
            </p>
          </div>

          {/* Star Rating - Top Right */}
          <div style={{ marginRight: "60px", marginTop: "8px" }}>
            {renderStars()}
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", textAlign: "right" }}>
              {getRatingLabel(rating)}
            </div>
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

        <div className="modal-body" style={{ minHeight: "400px" }}>
          {/* Personal Info */}
          {activeTab === "personal" && (
            <div className="detail-grid">
              <div><strong>Full Name:</strong> {fullName}</div>
              <div><strong>Email:</strong> {member.email || "-"}</div>
              <div><strong>Mobile:</strong> {member.phone_number || "-"}</div>
              <div><strong>Gender:</strong> {member.gender || "-"}</div>
              <div><strong>Date of Birth:</strong> {member.dateofbirth || "-"}</div>
              <div><strong>Current City:</strong> {member.city || "-"}</div>
              <div><strong>State:</strong> {member.state || "-"}</div>
              <div><strong>Country:</strong> {member.country || "India"}</div>
              <div><strong>Location Preference:</strong> {member.location || "Any"}</div>
            </div>
          )}

          {/* Education */}
          {activeTab === "education" && (
            <div className="detail-grid">
              <div><strong>Graduation Course:</strong> {member.graduation_course || "-"}</div>
              <div><strong>Graduation %:</strong> {member.graduation_percentage || "-"}</div>
              <div><strong>11th %:</strong> {member.percentage11th || "-"}</div>
              <div><strong>12th %:</strong> {member.percentage12th || "-"}</div>
              <div><strong>Post Graduation:</strong> {member.postgraduation_course || "-"}</div>
              <div><strong>PG Percentage:</strong> {member.postgraduation_percentage || "-"}</div>
              <div><strong>PhD:</strong> {member.phd_course || "None"}</div>
              <div><strong>Languages Known:</strong> 
                {[member.language_known1, member.language_known2, member.language_known3]
                  .filter(Boolean)
                  .join(", ") || "-"}
              </div>
            </div>
          )}

          {/* Service Record */}
          {activeTab === "service" && (
            <div className="detail-grid">
              <div><strong>Service/Organization:</strong> {member.service || member.organization || "Civilian"}</div>
              <div><strong>Rank:</strong> {member.rank || "-"}</div>
              <div><strong>Level:</strong> {member.level || "-"}</div>
              <div><strong>Profile Complete (Essential):</strong> {member.isEssentialProfileComplete ? "Yes" : "No"}</div>
              <div><strong>Profile Complete (Education):</strong> {member.isEducationalProfileComplete ? "Yes" : "No"}</div>
            </div>
          )}

          {/* Job Preferences */}
          {activeTab === "job" && (
            <div className="detail-grid">
              <div><strong>Preferred Location:</strong> {member.location || "Anywhere"}</div>
              <div><strong>Current City:</strong> {member.city || "-"}</div>
              <div><strong>Resume Uploaded:</strong> {member.resume_fileurl ? "Yes" : "No"}</div>
              <div><strong>Actively Seeking Job:</strong> {member.isEssentialProfileComplete ? "Yes" : "Pending Profile"}</div>
            </div>
          )}

          {/* Documents */}
          {activeTab === "documents" && (
            <div className="detail-grid">
              <div><strong>Resume:</strong> 
                {member.resume_fileurl ? (
                  <a href={member.resume_fileurl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                    View Resume
                  </a>
                ) : "Not Uploaded"}
              </div>
              <div><strong>Profile Completion:</strong> 
                {member.isEssentialProfileComplete && member.isEducationalProfileComplete ? "Complete" : "Incomplete"}
              </div>
              <div><strong>User Since:</strong> {member.created_time?.toDate?.().toLocaleDateString() || "Unknown"}</div>
            </div>
          )}

          {/* Interaction & Notes */}
          {activeTab === "interaction" && (
            <div style={{ padding: "20px" }}>
              <h3 style={{ marginBottom: "15px", color: "#1f2937" }}>Interaction Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about calls, responsiveness, interviews, behavior, etc..."
                rows="12"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
              <div style={{ marginTop: "15px", textAlign: "right" }}>
                <button
                  onClick={handleSaveNotes}
                  style={{
                    padding: "10px 24px",
                    backgroundColor: "#2563eb",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "500",
                  }}
                >
                  Save Notes
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}