// src/components/MemberDetailModal.jsx
import { useState } from "react";

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "service", label: "Service Record" },
    { id: "servicebo", label: "Service Record in BO" },
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
              {member["Mobile Number"]} • {member["Email"]}
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

          {/* 2. Service Record */}
          {activeTab === "service" && (
            <div className="detail-grid">
              <div><strong>Service:</strong> {member["Service"]}</div>
              <div><strong>Rank:</strong> {member["Rank"]}</div>
              <div><strong>Level:</strong> {member["Level"]}</div>
              <div><strong>Year of Commission:</strong> {member["Year Of Commission"]}</div>
              <div><strong>Commission Course:</strong> {member["Commission Course"]}</div>
              <div><strong>Planned Retirement:</strong> {member["Actual Plan Date Of Retirement"]}</div>
              <div><strong>Govt Experience:</strong> {member["Govt Experience"]}</div>
              <div><strong>Rating:</strong> {member["Rating"]}</div>
              <div><strong>Tags:</strong> {member["Tags"]}</div>
              <div><strong>Blacklisted:</strong> {member["Blacklisted"]}</div>
            </div>
          )}

          {/* 3. Service Record in BO */}
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

          {/* 4. Job Preferences */}
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

          {/* 5. Experience & Skills */}
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

          {/* 6. Documents & IDs */}
          {activeTab === "documents" && (
            <div className="detail-grid">
              <div><strong>Aadhaar:</strong> {member["Aadhaar Number"] ? "Uploaded" : "Not Uploaded"}</div>
              <div><strong>PAN:</strong> {member["Pan Number"] ? "Uploaded" : "Not Uploaded"}</div>
              <div><strong>CV Attached:</strong> {member["CV Attachment"] === "Yes" ? "Yes" : "No"}</div>
              <div><strong>Profile Photo:</strong> {member["Profile Photo"] === "Yes" ? "Yes" : "No"}</div>
              <div><strong>Bank Details:</strong> {member["Bank Name"]} - {member["Account Number"]}</div>
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