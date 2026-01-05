// src/components/MemberDetailModal.jsx
import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // State for BO Journey employment status
  const [currentEmployment, setCurrentEmployment] = useState(null); // null | "TCS" | { name: string }
  const [employmentLoading, setEmploymentLoading] = useState(false);

  const fullName = member.full_name?.trim() || "N/A";
  const userId = member.id || member.uid || member.member_id;
  const phoneNumber = member.phone_number?.trim();

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "education", label: "Education" },
    { id: "service", label: "Service Record" },
    { id: "experience", label: "Experience" },
    { id: "bojourney", label: "BO Journey" },
    { id: "job", label: "Job Preferences" },
    { id: "documents", label: "Documents" },
    { id: "interaction", label: "Interaction & Notes" },
  ];

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

  // Helper: Format date to "27 Dec 2025"
  const formatDateDDMMMYYYY = (dateInput) => {
    if (!dateInput) return "-";

    let date;
    if (typeof dateInput === "string" && dateInput.includes("-")) {
      date = new Date(dateInput + "T00:00:00");
    } else if (dateInput.toDate) {
      date = dateInput.toDate();
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else {
      return "-";
    }

    if (isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Toast function
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  // Load saved interactions (Interaction tab)
  useEffect(() => {
    if (activeTab !== "interaction" || !userId) return;

    const fetchSavedNotes = async () => {
      setLoading(true);
      try {
        const interactionsRef = collection(db, "usersmaster", userId, "interactions");
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const loaded = snapshot.docs.map((doc) => {
          const data = doc.data();

          const followUpDateStr = data.followUpDate
            ? formatDateDDMMMYYYY(data.followUpDate)
            : "-";

          const interactionDate = data.createdAt
            ? data.createdAt.toDate().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "Unknown";

          return {
            id: doc.id,
            date: interactionDate,
            contactPerson: data.contactPerson || fullName,
            notes: data.notes || "-",
            nextAction: data.nextAction || "-",
            followUpDate: followUpDateStr,
          };
        });

        setSavedNotes(loaded);
      } catch (error) {
        console.error("Error loading interaction history:", error);
        showToast("Failed to load interaction history.", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchSavedNotes();
  }, [activeTab, userId, fullName]);

  // Check employment status when BO Journey tab is active
  useEffect(() => {
    if (activeTab !== "bojourney" || !phoneNumber) {
      setCurrentEmployment(null);
      return;
    }

    const checkEmploymentStatus = async () => {
      setEmploymentLoading(true);
      try {
        // 1. Check tcsusersmaster first
        const tcsRef = collection(db, "tcsusersmaster");
        const tcsQuery = query(tcsRef, where("contact_number", "==", phoneNumber));
        const tcsSnapshot = await getDocs(tcsQuery);

        if (!tcsSnapshot.empty) {
          setCurrentEmployment("TCS");
          setEmploymentLoading(false);
          return;
        }

        // 2. Check projectsusermaster
        const projectsRef = collection(db, "projectsusersmaster");
        const projectsQuery = query(projectsRef, where("phone_number", "==", phoneNumber));
        const projectsSnapshot = await getDocs(projectsQuery);

        if (!projectsSnapshot.empty) {
          const docData = projectsSnapshot.docs[0].data();
          const projectName = docData.projects || "Unknown Project";
          setCurrentEmployment({ name: projectName });
        } else {
          setCurrentEmployment(null);
        }
      } catch (error) {
        console.error("Error checking employment status:", error);
        showToast("Failed to check current placement.", "error");
        setCurrentEmployment(null);
      } finally {
        setEmploymentLoading(false);
      }
    };

    checkEmploymentStatus();
  }, [activeTab, phoneNumber]);

  const addNewNote = () => {
    setNewNotesList([
      ...newNotesList,
      {
        id: Date.now() + Math.random(),
        contactPerson: fullName,
        notes: "",
        nextAction: "",
        followUpDate: "",
      },
    ]);
  };

  const updateNewNote = (id, field, value) => {
    setNewNotesList(
      newNotesList.map((note) =>
        note.id === id ? { ...note, [field]: value } : note
      )
    );
  };

  const deleteNewNote = (id) => {
    setNewNotesList(newNotesList.filter((note) => note.id !== id));
  };

  const handleSaveAllNotes = async () => {
    const validNotes = newNotesList.filter(
      (note) => note.notes.trim() || note.nextAction.trim() || note.followUpDate
    );

    if (validNotes.length === 0) {
      showToast("No notes to save.", "error");
      return;
    }

    setLoading(true);
    try {
      const interactionsRef = collection(db, "usersmaster", userId, "interactions");

      const savePromises = validNotes.map((note) =>
        addDoc(interactionsRef, {
          contactPerson: note.contactPerson,
          notes: note.notes.trim(),
          nextAction: note.nextAction.trim(),
          followUpDate: note.followUpDate
            ? Timestamp.fromDate(new Date(note.followUpDate + "T00:00:00"))
            : null,
          createdAt: serverTimestamp(),
          createdBy: "admin",
        })
      );

      await Promise.all(savePromises);

      showToast("All notes saved successfully!", "success");
      setNewNotesList([]);

      // Refresh history
      const snapshot = await getDocs(query(interactionsRef, orderBy("createdAt", "desc")));
      const updated = snapshot.docs.map((doc) => {
        const data = doc.data();
        const followUpDateStr = data.followUpDate
          ? formatDateDDMMMYYYY(data.followUpDate)
          : "-";

        const interactionDate = data.createdAt
          ? data.createdAt.toDate().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "Unknown";

        return {
          id: doc.id,
          date: interactionDate,
          contactPerson: data.contactPerson || fullName,
          notes: data.notes || "-",
          nextAction: data.nextAction || "-",
          followUpDate: followUpDateStr,
        };
      });
      setSavedNotes(updated);
    } catch (error) {
      console.error("Error saving notes:", error);
      showToast("Failed to save notes.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast.show && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            backgroundColor: toast.type === "success" ? "#16a34a" : "#dc2626",
            color: "white",
            padding: "14px 24px",
            borderRadius: "8px",
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: "300px",
            animation: "slideIn 0.4s ease-out",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {toast.type === "success" ? (
              <path d="M20 6L9 17l-5-5" />
            ) : (
              <path d="M18 6L6 18M6 6l12 12" />
            )}
          </svg>
          <span style={{ fontWeight: "500" }}>{toast.message}</span>
        </div>
      )}

      {/* Modal */}
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content wide" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <div style={{ flex: 1 }}>
              <h2>{fullName}</h2>
              <p style={{ margin: "5px 0", opacity: 0.9, fontSize: "15px" }}>
                {member.phone_number || "N/A"} • {member.email || "N/A"}
              </p>
            </div>

            <div style={{ marginRight: "60px", marginTop: "8px" }}>
              {renderStars()}
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px", textAlign: "right" }}>
                {getRatingLabel(rating)}
              </div>
            </div>

            <button className="close-btn" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Tabs */}
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

          {/* Body */}
          <div className="modal-body" style={{ minHeight: "400px", padding: "20px" }}>
            {/* PERSONAL TAB */}
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
                <div><strong>Preferred Job Location:</strong> {member.preferred_job_location || "-"}</div>
                <div><strong>Permanent Address:</strong> {member.permanent_address || "-"}</div>
                <div><strong>PIN Code:</strong> {member.pincode || "-"}</div>
                <div><strong>Father's Name:</strong> {member.father_name || "-"}</div>
                <div><strong>Mother's Name:</strong> {member.mother_name || "-"}</div>
              </div>
            )}

            {/* EDUCATION TAB */}
            {activeTab === "education" && (
              <div className="detail-grid">
                <div><strong>Education:</strong> {member.graduation_course || "-"}</div>
                <div><strong>Graduation %:</strong> {member.graduation_percentage || "-"}</div>
                <div><strong>11th %:</strong> {member.percentage11th || "-"}</div>
                <div><strong>12th %:</strong> {member.percentage12th || "-"}</div>
                <div><strong>MBA:</strong> {member.mba || "-"}</div>
                <div><strong>English Proficiency:</strong> {member.english_proficiency || "-"}</div>
                <div><strong>IT Skills:</strong> {member.it_skills || "-"}</div>
                <div><strong>Other Skills:</strong> {member.skills || "-"}</div>
              </div>
            )}

            {/* SERVICE TAB */}
            {activeTab === "service" && (
              <div className="detail-grid">
                <div><strong>Service/Organization:</strong> {member.service || "-"}</div>
                <div><strong>Rank:</strong> {member.rank || "-"}</div>
                <div><strong>Level:</strong> {member.level || "-"}</div>
                <div><strong>Trade:</strong> {member.trade || "-"}</div>
                <div><strong>Year of Commission:</strong> {member.year_of_commission || "-"}</div>
                <div><strong>Actual Retirement Date:</strong> {member.actual_retirement_date || "-"}</div>
                <div><strong>Planned Retirement Date:</strong> {member.planned_retirement_date || "-"}</div>
              </div>
            )}

            {/* EXPERIENCE TAB */}
            {activeTab === "experience" && (
              <div className="detail-grid">
                <div><strong>Govt Experience:</strong> {member.govt_experience || "-"}</div>
                <div><strong>Corporate Experience:</strong> {member.corporate_experience || "-"}</div>
                <div><strong>Total Experience:</strong> {member.total_experience || "-"}</div>
                <div><strong>Work Experience:</strong> {member.work_experience || "-"}</div>
              </div>
            )}

            {/* BO JOURNEY TAB - UPDATED */}
            {activeTab === "bojourney" && (
              <div className="detail-grid">
                <div
                  style={{
                    padding: "24px",
                    backgroundColor: "#f0fdfa",
                    borderRadius: "12px",
                    border: "1px solid #99f6e0",
                    textAlign: "center",
                  }}
                >
                  <strong style={{ fontSize: "18px", display: "block", marginBottom: "16px" }}>
                    Current Status
                  </strong>

                  {employmentLoading ? (
                    <p style={{ color: "#0d9488", fontStyle: "italic" }}>
                      Checking placement status...
                    </p>
                  ) : !phoneNumber ? (
                    <p style={{ color: "#dc2626" }}>
                      Phone number not available – cannot verify placement.
                    </p>
                  ) : currentEmployment === "TCS" ? (
                    <div style={{ fontSize: "22px", fontWeight: "700", color: "#0d9488" }}>
                      Currently working in TCS
                    </div>
                  ) : currentEmployment && typeof currentEmployment === "object" ? (
                    <div style={{ fontSize: "22px", fontWeight: "700", color: "#0d9488" }}>
                      Currently working in {currentEmployment.name}
                    </div>
                  ) : (
                    <p style={{ color: "#6b7280", fontStyle: "italic", fontSize: "18px" }}>
                      Not currently associated with any TCS/Jobs/Projects.
                    </p>
                  )}
                </div>

                <div style={{ marginTop: "40px", color: "#6b7280", fontStyle: "italic", textAlign: "center" }}>
                  More BO journey details will be added soon...
                </div>
              </div>
            )}

            {/* JOB PREFERENCES TAB */}
            {activeTab === "job" && (
              <div className="detail-grid">
                <div><strong>Applied Jobs:</strong> {member.open_jobs || "-"}</div>
                <div><strong>Preferred Job Location:</strong> {member.preferred_job_location || "Anywhere"}</div>
                <div><strong>Current City:</strong> {member.city || "-"}</div>
                <div><strong>Current CTC:</strong> {member.current_ctc || "0"}</div>
                <div><strong>Expected CTC:</strong> {member.expected_ctc || "0"}</div>
                <div><strong>Notice Period:</strong> {member.notice_period || "-"}</div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <div className="detail-grid">
                <div>
                  <strong>Resume:</strong>{" "}
                  {member.resume_fileurl ? (
                    <a href={member.resume_fileurl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                      View Resume
                    </a>
                  ) : "Not Uploaded"}
                </div>
                <div>
                  <strong>Photo:</strong>{" "}
                  {member.photo_url ? (
                    <a href={member.photo_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                      View Photo
                    </a>
                  ) : "Not Uploaded"}
                </div>
                <div><strong>Member ID:</strong> {member.member_id || "-"}</div>
                <div><strong>Registration Date:</strong> {member.registration_date || "-"}</div>
              </div>
            )}

            {/* INTERACTION TAB */}
            {activeTab === "interaction" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                {/* Add New Notes */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, color: "#1f2937", fontSize: "18px" }}>
                      Add New Interaction Notes
                    </h3>
                    <button
                      onClick={addNewNote}
                      disabled={loading}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: "#2563eb",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: "500",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "18px" }}>+</span> ADD NOTE
                    </button>
                  </div>

                  {newNotesList.length === 0 ? (
                    <p style={{ textAlign: "center", color: "#9ca3af", fontStyle: "italic", padding: "30px 0" }}>
                      Click "ADD NOTE" to start adding new interactions.
                    </p>
                  ) : (
                    <>
                      {newNotesList.map((note) => (
                        <div
                          key={note.id}
                          style={{
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            padding: "16px",
                            marginBottom: "16px",
                            backgroundColor: "#f9fafb",
                          }}
                        >
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "13px", color: "#6b7280" }}>Member Name</label>
                              <input
                                type="text"
                                value={note.contactPerson}
                                readOnly
                                style={{
                                  width: "100%",
                                  padding: "10px",
                                  borderRadius: "6px",
                                  border: "1px solid #3b82f6",
                                  backgroundColor: "#eff6ff",
                                  fontWeight: "500",
                                  color: "#1e40af",
                                }}
                              />
                            </div>

                            <div style={{ flex: 2 }}>
                              <label style={{ fontSize: "13px", color: "#6b7280" }}>Notes</label>
                              <textarea
                                value={note.notes}
                                onChange={(e) => updateNewNote(note.id, "notes", e.target.value)}
                                placeholder="Add notes about interaction..."
                                rows="3"
                                style={{
                                  width: "100%",
                                  padding: "10px",
                                  borderRadius: "6px",
                                  border: "1px solid #d1d5db",
                                  resize: "vertical",
                                }}
                              />
                            </div>

                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "13px", color: "#6b7280" }}>Next Action</label>
                              <input
                                type="text"
                                value={note.nextAction}
                                onChange={(e) => updateNewNote(note.id, "nextAction", e.target.value)}
                                placeholder="e.g., Follow up call"
                                style={{
                                  width: "100%",
                                  padding: "10px",
                                  borderRadius: "6px",
                                  border: "1px solid #d1d5db",
                                }}
                              />
                            </div>

                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "13px", color: "#6b7280" }}>Follow-up Date</label>
                              <input
                                type="date"
                                value={note.followUpDate}
                                onChange={(e) => updateNewNote(note.id, "followUpDate", e.target.value)}
                                style={{
                                  width: "100%",
                                  padding: "10px",
                                  borderRadius: "6px",
                                  border: "1px solid #d1d5db",
                                }}
                              />
                              {note.followUpDate && (
                                <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>
                                  {formatDateDDMMMYYYY(note.followUpDate)}
                                </div>
                              )}
                            </div>

                            <div style={{ alignSelf: "flex-end" }}>
                              <button
                                onClick={() => deleteNewNote(note.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "8px",
                                  color: "#ef4444",
                                }}
                                title="Delete"
                              >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M6 4V2a2 2 0 012-2h4a2 2 0 012 2v2h5a1 1 0 110 2h-1v11a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h5zm2 0h4V2H8v2zm1 4a1 1 0 012 0v7a1 1 0 01-2 0V8zm4 0a1 1 0 012 0v7a1 1 0 01-2 0V8z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div style={{ textAlign: "right", marginTop: "10px" }}>
                        <button
                          onClick={handleSaveAllNotes}
                          disabled={loading}
                          style={{
                            padding: "12px 32px",
                            backgroundColor: "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontWeight: "600",
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.7 : 1,
                          }}
                        >
                          {loading ? "Saving..." : "SAVE ALL NOTES"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* History Table */}
                <div>
                  <h3 style={{ margin: "0 0 16px", color: "#1f2937", fontSize: "18px" }}>
                    Interaction History ({savedNotes.length})
                  </h3>

                  {loading && <p style={{ textAlign: "center", color: "#6b7280" }}>Loading history...</p>}

                  {!loading && savedNotes.length === 0 && (
                    <p style={{ textAlign: "center", color: "#9ca3af", fontStyle: "italic", padding: "50px 0" }}>
                      No past interactions recorded yet.
                    </p>
                  )}

                  {!loading && savedNotes.length > 0 && (
                    <div style={{ overflowX: "auto", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#2563eb", color: "white" }}>
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Date</th>
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Member Name</th>
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Notes</th>
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Next Action</th>
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Follow-up Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savedNotes.map((note, index) => (
                            <tr
                              key={note.id}
                              style={{
                                backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff",
                              }}
                            >
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>
                                {note.date}
                              </td>
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>
                                {note.contactPerson}
                              </td>
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb", whiteSpace: "pre-wrap", maxWidth: "350px" }}>
                                {note.notes}
                              </td>
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>
                                {note.nextAction}
                              </td>
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>
                                {note.followUpDate}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button className="btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}