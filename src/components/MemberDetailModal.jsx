// src/components/MemberDetailModal.jsx
import { useState } from "react";

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [notes, setNotes] = useState(member["Notes"] || ""); // assuming you might have notes field

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "service", label: "Service Record" },
    { id: "servicebo", label: "Service Record in BO" },
    { id: "job", label: "Job Preferences" },
    { id: "experience", label: "Experience & Skills" },
    { id: "documents", label: "Documents & IDs" },
    { id: "interaction", label: "Interaction & Notes" }, // New Tab
  ];

  // Rating logic
  const rating = parseInt(member["Rating"]) || 0;
  const getRatingLabel = (stars) => {
    const labels = {
      1: "Poor - Unresponsive / Unprofessional",
      2: "Below Average - Slow response / Low interest",
      3: "Average - Decent communication",
      4: "Good - Proactive & Professional",
      5: "Excellent - Highly recommended"
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
              cursor: "default"
            }}
          >
            ★
          </span>
        ))}
        <span style={{ marginLeft: "8px", fontSize: "14px", color: "#6b45309", fontWeight: "500" }}>
          {rating}/5
        </span>
      </div>
    );
  };

  const handleSaveNotes = () => {
    // Here you can integrate with your backend API to save notes
    alert("Notes saved successfully!"); // Replace with actual save logic
    console.log("Saving notes for member:", member["Full Name"], notes);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <h2>{member["Full Name"]}</h2>
            <p style={{ margin: "5px 0", opacity: 0.9, fontSize: "15px" }}>
              {member["Mobile Number"]} • {member["Email"]}
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
          {/* 1. Personal Info */}
          {activeTab === "personal" && (
            <div className="detail-grid">
              <div><strong>Full Name:</strong> {member["Full Name"]}</div>
              <div><strong>Date of Birth:</strong> {member["Dob"]}</div>
              <div><strong>Gender:</strong> {member["Gender"]}</div>
              <div><strong>Email:</strong> {member["Email"]}</div>
              <div><strong>Mobile:</strong> {member["Mobile Number"]}</div>
              <div><strong>Whatsapp:</strong> {member["Whatsapp"]}</div>
              <div><strong>Current Location:</strong> {member["Current Location"]}</div>
              <div><strong>Permanent Address:</strong> {member["Permanent Address"]}</div>
              <div><strong>Preferred Location:</strong> {member["Preferred Job Location"] || "Any"}</div>
            </div>
          )}

          {/* Other tabs remain same */}
          {activeTab === "service" && (
            <div className="detail-grid">
              <div><strong>Service:</strong> {member["Service"]}</div>
              <div><strong>Rank:</strong> {member["Rank"]}</div>
              <div><strong>Level:</strong> {member["Level"]}</div>
              <div><strong>Year of Commission:</strong> {member["Year Of Commission"]}</div>
              <div><strong>Commission Course:</strong> {member["Commission Course"]}</div>
              <div><strong>Planned Retirement:</strong> {member["Actual Plan Date Of Retirement"]}</div>
              <div><strong>Govt Experience:</strong> {member["Govt Experience"]}</div>
              <div><strong>Rating:</strong> {member["Rating"]}/5</div>
              <div><strong>Tags:</strong> {member["Tags"]}</div>
              <div><strong>Blacklisted:</strong> {member["Blacklisted"]}</div>
            </div>
          )}

          {activeTab === "servicebo" && (
            <div className="detail-grid">
              <div><strong>Member ID:</strong> {member["Member Id"]}</div>
              <div><strong>Entry Date:</strong> {member["Entry Date"]}</div>
              <div><strong>Apply Job:</strong> {member["Apply Job"]}</div>
              <div><strong>Placed by BO:</strong> {member["Placed by BO"]}</div>
              <div><strong>Jobs Applied:</strong> {member["No of Jobs Applied"]}</div>
              <div><strong>Shortlistings:</strong> {member["No of Shortlistings"]}</div>
              <div><strong>State/City:</strong> {member["State"]}, {member["City"]}</div>
              <div><strong>Pincode:</strong> {member["Pincode"]}</div>
            </div>
          )}

          {activeTab === "job" && (
            <div className="detail-grid">
              <div><strong>Preferred Job Location:</strong> {member["Preferred Job Location"] || "Anywhere"}</div>
              <div><strong>Expected CTC:</strong> {member["Expected Ctc"]}</div>
              <div><strong>Current CTC:</strong> {member["Current Ctc"] || "N/A"}</div>
              <div><strong>Notice Period:</strong> {member["Notice Period"]}</div>
              <div><strong>Job Applied:</strong> {member["Apply Job"]}</div>
              <div><strong>Placed Status:</strong> {member["Placed by BO"]}</div>
            </div>
          )}

          {activeTab === "experience" && (
            <div className="detail-grid">
              <div><strong>Education:</strong> {member["Education"]}</div>
              <div><strong>MBA:</strong> {member["Mba"]}</div>
              <div><strong>Total Experience:</strong> {member["Total Experience"]}</div>
              <div><strong>Work Experience:</strong> {member["Work Experience"]}</div>
              <div><strong>IT Skills:</strong> {member["It Skills"]}</div>
              <div><strong>English Proficiency:</strong> {member["English"]}</div>
              <div><strong>Corporate Experience:</strong> {member["Corporate Experience"]}</div>
            </div>
          )}

          {activeTab === "documents" && (
            <div className="detail-grid">
              <div><strong>Aadhaar:</strong> {member["Aadhaar Number"] ? "Uploaded" : "Not Uploaded"}</div>
              <div><strong>PAN:</strong> {member["Pan Number"] ? "Uploaded" : "Not Uploaded"}</div>
              <div><strong>CV Attached:</strong> {member["CV Attachment"] === "Yes" ? "Yes" : "No"}</div>
              <div><strong>Profile Photo:</strong> {member["Profile Photo"] === "Yes" ? "Yes" : "No"}</div>
              <div><strong>Bank Details:</strong> {member["Bank Name"]} - {member["Account Number"]}</div>
            </div>
          )}

          {/* New Interaction & Notes Tab */}
          {activeTab === "interaction" && (
            <div style={{ padding: "20px" }}>
              <h3 style={{ marginBottom: "15px", color: "#1f2937" }}>Interaction Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add your notes about communication, interviews, behavior, etc..."
                rows="10"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  fontFamily: "inherit"
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
                    fontWeight: "500"
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

