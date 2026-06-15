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
import { normalizeMemberRecord, getMemberName, getMemberPhone, getMemberOrganization, parseMemberDate } from "../utils/memberFields";

const RATING_TYPES = {
  workRelated: "work_related",
  boEmployee: "bo_employee",
  referrer: "referrer",
  notRated: "not_rated",
};

const BO_CHECKLIST_ITEMS = [
  "Clear communication",
  "On-time follow-up",
  "Requirement understanding",
  "Professional behaviour",
  "Ownership and support",
];

const createEmptyBoChecklist = () =>
  BO_CHECKLIST_ITEMS.reduce((acc, item) => {
    acc[item] = false;
    return acc;
  }, {});

const getRatingTypeLabel = (ratingType) => {
  switch (ratingType) {
    case RATING_TYPES.workRelated:
      return "Work Related";
    case RATING_TYPES.boEmployee:
      return "BO Employee";
    case RATING_TYPES.referrer:
      return "Referrer";
    default:
      return "Not Rated Yet";
  }
};

export default function MemberDetailModal({ member, onClose }) {
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(null);
  const [savedNotes, setSavedNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // State for BO Journey employment status
  const [currentEmployment, setCurrentEmployment] = useState(null); // null | "TCS" | { name: string }
  const [employmentLoading, setEmploymentLoading] = useState(false);

  const normalizedMember = normalizeMemberRecord(member);
  const fullName = getMemberName(normalizedMember) || "N/A";
  const userId = normalizedMember.id || normalizedMember.uid || normalizedMember.member_id;
  const phoneNumber = getMemberPhone(normalizedMember);

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

  const rating = parseInt(normalizedMember.rating) || 0;

  const getRatingLabel = (stars) => {
    const labels = {
      1: "Poor - Unresponsive / Unprofessional",
      2: "Below Average - Slow response / Low interest",
      3: "Average - Decent communication",
      4: "Good - Proactive & Professional",
      5: "Excellent - Highly recommended",
    };
    return labels[stars] || "Not rated yet";
  };

  const renderStars = () => {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "10px",
          padding: "8px 12px",
          borderRadius: "14px",
          backgroundColor: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
          flexWrap: "wrap",
        }}
        title={getRatingLabel(rating)}
      >
        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(255,255,255,0.95)" }}>
          Rating
        </span>
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            style={{
              color: i < rating ? "#fbbf24" : "rgba(255,255,255,0.35)",
              fontSize: "20px",
              lineHeight: 1,
            }}
          >
            ★
          </span>
        ))}
        <span style={{ fontSize: "12px", fontWeight: "600", opacity: 0.95, color: "rgba(255,255,255,0.95)" }}>
          {rating ? `${rating}/5` : "No rating yet"}
        </span>
      </div>
    );
  };

  const renderRatingStars = (stars, size = 18) => (
    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
      {[...Array(5)].map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          style={{
            color: index < stars ? "#f59e0b" : "#d1d5db",
            fontSize: `${size}px`,
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  );

  const createNewNote = () => ({
    id: Date.now() + Math.random(),
    contactPerson: fullName,
    notes: "",
    nextAction: "",
    followUpDate: "",
  });

  const createNewRating = () => ({
    id: Date.now() + Math.random(),
    contactPerson: fullName,
    ratingType: RATING_TYPES.workRelated,
    workRating: 0,
    boChecklist: createEmptyBoChecklist(),
    boRemarks: "",
    referrerRating: 0,
    referrerRemarks: "",
  });

  const hasBoChecklistSelection = (boChecklist = {}) =>
    BO_CHECKLIST_ITEMS.some((item) => Boolean(boChecklist?.[item]));

  const getNoteRatingSummary = (note) => {
    const ratingType = note.ratingType || RATING_TYPES.notRated;

    if (ratingType === RATING_TYPES.workRelated) {
      return note.workRating ? `${note.workRating}/5` : "Work related";
    }

    if (ratingType === RATING_TYPES.boEmployee) {
      const selectedCount = BO_CHECKLIST_ITEMS.filter((item) => note.boChecklist?.[item]).length;
      return selectedCount ? `${selectedCount}/5 checklist` : "BO employee";
    }

    if (ratingType === RATING_TYPES.referrer) {
      return note.referrerRating ? `${note.referrerRating}/5` : "Referrer";
    }

    return "Not rated yet";
  };

  // Helper: Format date to "27 Dec 2025"
  const formatDateDDMMMYYYY = (dateInput) => {
    if (!dateInput) return "-";

    const date = parseMemberDate(dateInput);
    if (!date) return "-";

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCommaSeparatedValue = (value) => {
    if (Array.isArray(value)) {
      const items = value.map((item) => String(item).trim()).filter(Boolean);
      return items.length > 0 ? items.join(", ") : "-";
    }

    if (typeof value === "string") {
      const items = value.split(",").map((item) => item.trim()).filter(Boolean);
      return items.length > 0 ? items.join(", ") : "-";
    }

    return value ? String(value) : "-";
  };

  const normalizeJourneyPhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  };

  const splitProjects = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const uniquePhoneCandidates = (value) => {
    const normalized = normalizeJourneyPhone(value);
    if (!normalized) return [];

    const candidates = new Set();
    candidates.add(normalized);
    candidates.add(`+91${normalized}`);
    candidates.add(`91${normalized}`);
    candidates.add(`0${normalized}`);

    const rawDigits = String(value || "").replace(/\D/g, "");
    if (rawDigits) {
      candidates.add(rawDigits);
      if (rawDigits.startsWith("91") && rawDigits.length > 10) {
        candidates.add(rawDigits.slice(2));
      }
    }

    return Array.from(candidates).filter(Boolean);
  };

  const matchesJourneyPhone = (recordValue, targetDigits) =>
    normalizeJourneyPhone(recordValue) === targetDigits;

  const findMatchingDocByPhone = async (collectionNames, fieldNames) => {
    const targetDigits = normalizeJourneyPhone(phoneNumber);
    if (!targetDigits) return null;

    const names = Array.isArray(collectionNames) ? collectionNames : [collectionNames];
    const fields = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const phoneCandidates = uniquePhoneCandidates(phoneNumber);

    for (const collectionName of names) {
      for (const fieldName of fields) {
        for (const candidate of phoneCandidates) {
          const ref = collection(db, collectionName);
          const snapshot = await getDocs(query(ref, where(fieldName, "==", candidate)));
          if (!snapshot.empty) return snapshot.docs[0].data();
        }
      }
    }

    for (const collectionName of names) {
      const fallbackSnapshot = await getDocs(collection(db, collectionName));
      const matchedDoc = fallbackSnapshot.docs.find((snapDoc) => {
        const data = snapDoc.data() || {};
        return fields.some((fieldName) => {
          const fieldVariants = [
            fieldName,
            fieldName.toLowerCase(),
            fieldName.toUpperCase(),
            fieldName.replace(/_/g, ""),
          ];

          return fieldVariants.some((fieldKey) => {
            const recordValue = data[fieldKey];
            return recordValue !== undefined && matchesJourneyPhone(recordValue, targetDigits);
          });
        });
      });

      if (matchedDoc) return matchedDoc.data();
    }

    return null;
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
        const interactionsRef = collection(db, "users", userId, "interactions");
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
            ratingType: data.ratingType || RATING_TYPES.notRated,
            workRating: Number(data.workRating) || 0,
            boChecklist: data.boChecklist || createEmptyBoChecklist(),
            boRemarks: data.boRemarks || "-",
            referrerRating: Number(data.referrerRating) || 0,
            referrerRemarks: data.referrerRemarks || "-",
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
        const tcsData = await findMatchingDocByPhone("tcsusersmaster", [
          "contact_number",
          "phone_number",
          "phone",
          "mobile",
          "mobile_number",
        ]);
        if (tcsData) {
          setCurrentEmployment("TCS");
          return;
        }

        const projectData = await findMatchingDocByPhone(
          ["projectusersmaster", "projectsusersmaster"],
          [
            "phone_number",
            "phone",
            "mobile",
            "contact_number",
            "mobile_number",
            "Phone Number",
            "Mobile Number",
          ]
        );
        if (projectData) {
          const docData = projectData;
          const projectNames = splitProjects(
            docData.projects ||
              docData.Projects ||
              docData.project ||
              docData.Project ||
              docData.current_project ||
              docData.Current_Project ||
              docData.currentProject ||
              docData.CurrentProject
          );
          setCurrentEmployment({
            name: projectNames[0] || "Unknown Project",
            projects: projectNames,
          });
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
    setNewNotesList([...newNotesList, createNewNote()]);
  };

  const openRatingModal = () => {
    setRatingDraft(createNewRating());
    setShowRatingModal(true);
  };

  const closeRatingModal = () => {
    setShowRatingModal(false);
    setRatingDraft(null);
  };

  const updateRatingDraft = (field, value) => {
    setRatingDraft((current) => ({ ...current, [field]: value }));
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

  const refreshInteractionHistory = async (interactionsRef) => {
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
        entryType: data.entryType || "note",
        ratingType: data.ratingType || RATING_TYPES.notRated,
        workRating: Number(data.workRating) || 0,
        boChecklist: data.boChecklist || createEmptyBoChecklist(),
        boRemarks: data.boRemarks || "-",
        referrerRating: Number(data.referrerRating) || 0,
        referrerRemarks: data.referrerRemarks || "-",
      };
    });
    setSavedNotes(updated);
  };

  const handleSaveAllNotes = async () => {
    const validNotes = newNotesList.filter((note) => note.notes.trim() || note.nextAction.trim() || note.followUpDate);

    if (validNotes.length === 0) {
      showToast("No notes to save.", "error");
      return;
    }

    setLoading(true);
    try {
      const interactionsRef = collection(db, "users", userId, "interactions");

      const savePromises = validNotes.map((note) =>
        addDoc(interactionsRef, {
          entryType: "note",
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

      await refreshInteractionHistory(interactionsRef);
    } catch (error) {
      console.error("Error saving notes:", error);
      showToast("Failed to save notes.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRating = async () => {
    if (!ratingDraft) return;

    const ratingType = ratingDraft.ratingType || RATING_TYPES.notRated;
    const hasWorkRating = ratingType === RATING_TYPES.workRelated && Number(ratingDraft.workRating) > 0;
    const hasBoRating = ratingType === RATING_TYPES.boEmployee && hasBoChecklistSelection(ratingDraft.boChecklist);
    const hasReferrerRating = ratingType === RATING_TYPES.referrer && Number(ratingDraft.referrerRating) > 0;
    const hasRemarks = String(ratingDraft.boRemarks || "").trim() || String(ratingDraft.referrerRemarks || "").trim();

    if (!hasWorkRating && !hasBoRating && !hasReferrerRating && !hasRemarks) {
      showToast("Please add a rating or remarks before saving.", "error");
      return;
    }

    setLoading(true);
    try {
      const interactionsRef = collection(db, "users", userId, "interactions");

      await addDoc(interactionsRef, {
        entryType: "rating",
        contactPerson: ratingDraft.contactPerson,
        notes: "-",
        nextAction: "-",
        followUpDate: null,
        ratingType,
        workRating: Number(ratingDraft.workRating) || 0,
        boChecklist: ratingDraft.boChecklist || createEmptyBoChecklist(),
        boRemarks: String(ratingDraft.boRemarks || "").trim() || "-",
        referrerRating: Number(ratingDraft.referrerRating) || 0,
        referrerRemarks: String(ratingDraft.referrerRemarks || "").trim() || "-",
        createdAt: serverTimestamp(),
        createdBy: "admin",
      });

      showToast("Rating saved successfully!", "success");
      closeRatingModal();
      await refreshInteractionHistory(interactionsRef);
    } catch (error) {
      console.error("Error saving rating:", error);
      showToast("Failed to save rating.", "error");
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
                {phoneNumber || "N/A"}{normalizedMember.email || "N/A"}
              </p>
            </div>

            <div style={{ marginRight: "16px", marginTop: "2px" }}>
              {renderStars()}
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.92)", marginTop: "4px", textAlign: "right" }}>
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
                <div><strong>Email:</strong> {normalizedMember.email || "-"}</div>
                <div><strong>Mobile:</strong> {phoneNumber || "-"}</div>
                <div><strong>Gender:</strong> {normalizedMember.gender || "-"}</div>
                <div><strong>Date of Birth:</strong> {normalizedMember.dateofbirth || "-"}</div>
                <div><strong>Current City:</strong> {normalizedMember.city || "-"}</div>
                <div><strong>State:</strong> {normalizedMember.state || "-"}</div>
                <div><strong>Country:</strong> {normalizedMember.country || "India"}</div>
                <div><strong>Preferred Job Location:</strong> {normalizedMember.preferred_job_location || "-"}</div>
                <div><strong>Permanent Address:</strong> {normalizedMember.permanent_address || "-"}</div>
                <div><strong>PIN Code:</strong> {normalizedMember.pincode || "-"}</div>
                <div><strong>Father's Name:</strong> {normalizedMember.father_name || "-"}</div>
                <div><strong>Mother's Name:</strong> {normalizedMember.mother_name || "-"}</div>
              </div>
            )}

            {/* EDUCATION TAB */}
            {activeTab === "education" && (
              <div className="detail-grid">
                <div><strong>Education:</strong> {normalizedMember.graduation_course || normalizedMember.education || "-"}</div>
                <div><strong>Graduation %:</strong> {normalizedMember.graduation_percentage || "-"}</div>
                <div><strong>11th %:</strong> {normalizedMember.percentage11th || "-"}</div>
                <div><strong>12th %:</strong> {normalizedMember.percentage12th || "-"}</div>
                <div><strong>MBA:</strong> {normalizedMember.mba || "-"}</div>
                <div><strong>English Proficiency:</strong> {normalizedMember.english_proficiency || normalizedMember.english || "-"}</div>
                <div><strong>IT Skills:</strong> {normalizedMember.it_skills || "-"}</div>
                <div><strong>Other Skills:</strong> {formatCommaSeparatedValue(normalizedMember.skills || normalizedMember.Skills)}</div>
              </div>
            )}

            {/* SERVICE TAB */}
            {activeTab === "service" && (
              <div className="detail-grid">
                <div><strong>Service/Category:</strong> {normalizedMember.service || "-"}</div>
                <div><strong>Category:</strong> {getMemberOrganization(normalizedMember) || "-"}</div>
                <div><strong>Rank:</strong> {normalizedMember.rank || "-"}</div>
                <div><strong>Level:</strong> {normalizedMember.level || "-"}</div>
                <div><strong>Trade:</strong> {normalizedMember.trade || "-"}</div>
                <div><strong>Year of Commission:</strong> {normalizedMember.year_of_commission || "-"}</div>
                <div><strong>Actual Retirement Date:</strong> {normalizedMember.actual_retirement_date || "-"}</div>
                <div><strong>Planned Retirement Date:</strong> {normalizedMember.planned_retirement_date || "-"}</div>
              </div>
            )}

            {/* EXPERIENCE TAB */}
            {activeTab === "experience" && (
              <div className="detail-grid">
                <div><strong>Govt Experience:</strong> {normalizedMember.govt_experience || "-"}</div>
                <div><strong>Corporate Experience:</strong> {normalizedMember.corporate_experience || "-"}</div>
                <div><strong>Total Experience:</strong> {normalizedMember.total_experience || "-"}</div>
                <div><strong>Work Experience:</strong> {normalizedMember.work_experience || "-"}</div>
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
                      Phone number not available â€“ cannot verify placement.
                    </p>
                  ) : currentEmployment === "TCS" ? (
                    <div style={{ fontSize: "22px", fontWeight: "700", color: "#0d9488" }}>
                      Currently working in TCS
                    </div>
                  ) : currentEmployment && typeof currentEmployment === "object" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                      <div style={{ fontSize: "22px", fontWeight: "700", color: "#0d9488" }}>
                        Currently working in {currentEmployment.name}
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f766e" }}>
                        Works in {currentEmployment.projects?.length || 0} project{(currentEmployment.projects?.length || 0) === 1 ? "" : "s"}
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: "600", color: "#0f766e" }}>
                        Projects: {formatCommaSeparatedValue(currentEmployment.projects)}
                      </div>
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
                <div><strong>Applied Jobs:</strong> {normalizedMember.open_jobs || "-"}</div>
                <div><strong>Preferred Job Location:</strong> {normalizedMember.preferred_job_location || "Anywhere"}</div>
                <div><strong>Current City:</strong> {normalizedMember.city || "-"}</div>
                <div><strong>Current CTC:</strong> {normalizedMember.current_ctc || "0"}</div>
                <div><strong>Expected CTC:</strong> {normalizedMember.expected_ctc || "0"}</div>
                <div><strong>Notice Period:</strong> {normalizedMember.notice_period || "-"}</div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {activeTab === "documents" && (
              <div className="detail-grid">
                <div>
                  <strong>Resume:</strong>{" "}
                  {normalizedMember.resume_fileurl ? (
                    <a href={normalizedMember.resume_fileurl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                      View Resume
                    </a>
                  ) : "Not Uploaded"}
                </div>
                <div>
                  <strong>Photo:</strong>{" "}
                  {normalizedMember.photo_url ? (
                    <a href={normalizedMember.photo_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                      View Photo
                    </a>
                  ) : "Not Uploaded"}
                </div>
                <div><strong>Member ID:</strong> {normalizedMember.member_id || "-"}</div>
                <div><strong>Registration Date:</strong> {normalizedMember.registration_date || normalizedMember.entry_date || "-"}</div>
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
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
                      <button
                        onClick={openRatingModal}
                        disabled={loading}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: "#0f766e",
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
                        <span style={{ fontSize: "18px" }}>?</span> ADD RATING
                      </button>
                    </div>
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
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)", gap: "12px", alignItems: "start", marginBottom: "14px" }}>
                            <div>
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
                                  color: "#1976d2",
                                }}
                              />
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr)", gap: "12px", alignItems: "start" }}>
                            <div>
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

                            <div>
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

                            <div>
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
                          </div>

                          {false && (
                            <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                                <div>
                                  <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>Work Related Rating</div>
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() => updateNewNote(note.id, "workRating", star)}
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                          padding: 0,
                                          lineHeight: 1,
                                        }}
                                        title={`${star} star${star > 1 ? "s" : ""}`}
                                      >
                                        <span
                                          aria-hidden="true"
                                          style={{
                                            color: star <= Number(note.workRating) ? "#f59e0b" : "#d1d5db",
                                            fontSize: "22px",
                                          }}
                                        >
                                          ★
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ minWidth: "140px", textAlign: "right", color: "#6b7280", fontSize: "13px" }}>
                                  Selected: {note.workRating ? `${note.workRating}/5` : "Not selected"}
                                </div>
                              </div>
                            </div>
                          )}

                          {false && (
                            <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "10px", fontWeight: "600" }}>
                                BO Employee Checklist
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                                {BO_CHECKLIST_ITEMS.map((item) => (
                                  <label
                                    key={item}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "10px",
                                      padding: "10px 12px",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: "8px",
                                      backgroundColor: note.boChecklist?.[item] ? "#ecfeff" : "#f9fafb",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(note.boChecklist?.[item])}
                                      onChange={(e) =>
                                        updateNewNote(note.id, "boChecklist", {
                                          ...note.boChecklist,
                                          [item]: e.target.checked,
                                        })
                                      }
                                    />
                                    <span style={{ fontSize: "14px", color: "#374151" }}>{item}</span>
                                  </label>
                                ))}
                              </div>
                              <div style={{ marginTop: "14px" }}>
                                <label style={{ fontSize: "13px", color: "#6b7280" }}>BO Remarks</label>
                                <textarea
                                  value={note.boRemarks}
                                  onChange={(e) => updateNewNote(note.id, "boRemarks", e.target.value)}
                                  placeholder="Add remarks for BO employee rating..."
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
                            </div>
                          )}

                          {false && (
                            <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                              <div style={{ marginBottom: "10px" }}>
                                <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>Referrer Rating</div>
                                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                      key={star}
                                      type="button"
                                      onClick={() => updateNewNote(note.id, "referrerRating", star)}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        cursor: "pointer",
                                        padding: 0,
                                        lineHeight: 1,
                                      }}
                                      title={`${star} star${star > 1 ? "s" : ""}`}
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{
                                          color: star <= Number(note.referrerRating) ? "#f59e0b" : "#d1d5db",
                                          fontSize: "22px",
                                        }}
                                      >
                                        ★
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <label style={{ fontSize: "13px", color: "#6b7280" }}>Referrer Remarks</label>
                                <textarea
                                  value={note.referrerRemarks}
                                  onChange={(e) => updateNewNote(note.id, "referrerRemarks", e.target.value)}
                                  placeholder="Add remarks for the referrer..."
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
                            </div>
                          )}

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
                            <div style={{ fontSize: "12px", color: "#6b7280" }}>
                              {getRatingTypeLabel(note.ratingType)}{getNoteRatingSummary(note)}
                            </div>
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

                {showRatingModal && ratingDraft && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      backgroundColor: "rgba(15, 23, 42, 0.72)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 10050,
                      padding: "20px",
                    }}
                    onClick={closeRatingModal}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "min(920px, 100%)",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        backgroundColor: "#ffffff",
                        borderRadius: "18px",
                        boxShadow: "0 30px 80px rgba(0, 0, 0, 0.28)",
                      }}
                    >
                      <div
                        style={{
                          padding: "18px 22px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: "linear-gradient(135deg, #0f766e, #1d4ed8)",
                          color: "white",
                          borderTopLeftRadius: "18px",
                          borderTopRightRadius: "18px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.9 }}>
                            Add Rating
                          </div>
                          <h3 style={{ margin: "4px 0 0", fontSize: "22px" }}>{ratingDraft.contactPerson}</h3>
                        </div>
                        <button
                          onClick={closeRatingModal}
                          style={{
                            background: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(255,255,255,0.25)",
                            color: "white",
                            width: "38px",
                            height: "38px",
                            borderRadius: "999px",
                            fontSize: "24px",
                            cursor: "pointer",
                          }}
                          title="Close"
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ padding: "22px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "16px" }}>
                          <div>
                            <label style={{ fontSize: "13px", color: "#6b7280" }}>Member Name</label>
                            <input
                              type="text"
                              value={ratingDraft.contactPerson}
                              readOnly
                              style={{
                                width: "100%",
                                padding: "11px 12px",
                                borderRadius: "8px",
                                border: "1px solid #bfdbfe",
                                backgroundColor: "#eff6ff",
                                color: "#1d4ed8",
                                fontWeight: "600",
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: "13px", color: "#6b7280" }}>Rating Type</label>
                            <select
                              value={ratingDraft.ratingType}
                              onChange={(e) => updateRatingDraft("ratingType", e.target.value)}
                              style={{
                                width: "100%",
                                padding: "11px 12px",
                                borderRadius: "8px",
                                border: "1px solid #cbd5e1",
                                backgroundColor: "#ffffff",
                                color: "black",
                              }}
                            >
                              <option value={RATING_TYPES.workRelated}>Work Related</option>
                              <option value={RATING_TYPES.boEmployee}>BO Employee</option>
                              <option value={RATING_TYPES.referrer}>Referrer</option>
                              {/* <option value={RATING_TYPES.notRated}>Not Rated Yet</option> */}
                            </select>
                          </div>
                        </div>

                        <div style={{ marginTop: "18px", padding: "18px", borderRadius: "14px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          {ratingDraft.ratingType === RATING_TYPES.workRelated && (
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "#0f172a" }}>
                                Work Related Rating
                              </div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => updateRatingDraft("workRating", star)}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      background: star <= Number(ratingDraft.workRating) ? "#fff7ed" : "#f8fafc",
                                      borderRadius: "10px",
                                      padding: "10px 14px",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      boxShadow: star <= Number(ratingDraft.workRating) ? "0 8px 18px rgba(245,158,11,0.12)" : "none",
                                    }}
                                  >
                                     <span style={{ color: star <= Number(ratingDraft.workRating) ? "#f59e0b" : "#cbd5e1", fontSize: "22px" }}>{"★"}</span>
                                    <span style={{ fontWeight: "700", color: "#0f172a" }}>{star}</span>
                                  </button>
                                ))}
                              </div>
                              <div style={{ marginTop: "10px", fontSize: "13px", color: "#475569" }}>
                                Selected: {ratingDraft.workRating ? `${ratingDraft.workRating}/5` : "Not selected"}
                              </div>
                            </div>
                          )}

                          {ratingDraft.ratingType === RATING_TYPES.boEmployee && (
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "#0f172a" }}>
                                BO Employee Checklist
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                                {BO_CHECKLIST_ITEMS.map((item) => (
                                  <label
                                    key={item}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "10px",
                                      padding: "12px",
                                      borderRadius: "10px",
                                      border: "1px solid #e2e8f0",
                                      backgroundColor: ratingDraft.boChecklist?.[item] ? "#ecfeff" : "white",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(ratingDraft.boChecklist?.[item])}
                                      onChange={(e) =>
                                        updateRatingDraft("boChecklist", {
                                          ...ratingDraft.boChecklist,
                                          [item]: e.target.checked,
                                        })
                                      }
                                    />
                                    <span style={{ color: "#0f172a", fontSize: "14px" }}>{item}</span>
                                  </label>
                                ))}
                              </div>
                              <div style={{ marginTop: "14px" }}>
                                <label style={{ fontSize: "13px", color: "#6b7280" }}>BO Remarks</label>
                                <textarea
                                  value={ratingDraft.boRemarks}
                                  onChange={(e) => updateRatingDraft("boRemarks", e.target.value)}
                                  placeholder="Add remarks for BO employee rating..."
                                  rows="3"
                                  style={{
                                    width: "100%",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #cbd5e1",
                                    resize: "vertical",
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {ratingDraft.ratingType === RATING_TYPES.referrer && (
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "#0f172a" }}>
                                Referrer Rating
                              </div>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => updateRatingDraft("referrerRating", star)}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      background: star <= Number(ratingDraft.referrerRating) ? "#fff7ed" : "#f8fafc",
                                      borderRadius: "10px",
                                      padding: "10px 14px",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                     <span style={{ color: star <= Number(ratingDraft.referrerRating) ? "#f59e0b" : "#cbd5e1", fontSize: "22px" }}>{"★"}</span>
                                    <span style={{ fontWeight: "700", color: "#0f172a" }}>{star}</span>
                                  </button>
                                ))}
                              </div>
                              <div style={{ marginTop: "10px", fontSize: "13px", color: "#475569" }}>
                                Selected: {ratingDraft.referrerRating ? `${ratingDraft.referrerRating}/5` : "Not selected"}
                              </div>
                              <div style={{ marginTop: "14px" }}>
                                <label style={{ fontSize: "13px", color: "#6b7280" }}>Referrer Remarks</label>
                                <textarea
                                  value={ratingDraft.referrerRemarks}
                                  onChange={(e) => updateRatingDraft("referrerRemarks", e.target.value)}
                                  placeholder="Add remarks for the referrer..."
                                  rows="3"
                                  style={{
                                    width: "100%",
                                    padding: "12px",
                                    borderRadius: "8px",
                                    border: "1px solid #cbd5e1",
                                    resize: "vertical",
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {ratingDraft.ratingType === RATING_TYPES.notRated && (
                            <div>
                              <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "10px", color: "#0f172a" }}>
                                Not Rated Yet
                              </div>
                              <p style={{ color: "#475569", margin: 0 }}>
                                Use this when you want to log that the member is not rated yet. Add a remark below if needed.
                              </p>
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
                          <button
                            onClick={closeRatingModal}
                            style={{
                              padding: "11px 18px",
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              backgroundColor: "#ffffff",
                              color: "#374151",
                              cursor: "pointer",
                              fontWeight: "600",
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveRating}
                            disabled={loading}
                            style={{
                              padding: "11px 18px",
                              borderRadius: "8px",
                              border: "none",
                              backgroundColor: "#0f766e",
                              color: "white",
                              cursor: loading ? "not-allowed" : "pointer",
                              fontWeight: "700",
                              opacity: loading ? 0.75 : 1,
                            }}
                          >
                            {loading ? "Saving..." : "SAVE RATING"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                            <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Rating</th>
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
                              <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb", minWidth: "190px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#374151" }}>
                                    {getRatingTypeLabel(note.ratingType)}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                    {note.ratingType === RATING_TYPES.workRelated && renderRatingStars(Number(note.workRating), 16)}
                                    {note.ratingType === RATING_TYPES.referrer && renderRatingStars(Number(note.referrerRating), 16)}
                                    {note.ratingType === RATING_TYPES.boEmployee && (
                                      <span style={{ fontSize: "13px", color: "#1f2937", fontWeight: "600" }}>
                                        {BO_CHECKLIST_ITEMS.filter((item) => note.boChecklist?.[item]).length}/5 checklist
                                      </span>
                                    )}
                                    {note.ratingType === RATING_TYPES.notRated && (
                                      <span style={{ fontSize: "13px", color: "#6b7280" }}>Not rated yet</span>
                                    )}
                                  </div>
                                  {note.ratingType === RATING_TYPES.boEmployee && (
                                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "pre-wrap" }}>{note.boRemarks}</div>
                                  )}
                                  {note.ratingType === RATING_TYPES.referrer && (
                                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "pre-wrap" }}>{note.referrerRemarks}</div>
                                  )}
                                </div>
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


