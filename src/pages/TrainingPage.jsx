// src/pages/TrainingPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  FaPlus,
  FaTimes,
  FaFilter,
  FaTrashAlt,
  FaChalkboardTeacher,
  FaCalendarCheck,
  FaCheckCircle,
  FaUsers,
  FaLink,
  FaBell,
  FaRegBell,
  FaUserFriends,
  FaFolderOpen,
  FaExternalLinkAlt,
  FaEnvelope,
  FaStar,
  FaRegStar,
  FaHistory,
  FaSearch,
} from "react-icons/fa";
import { collection, addDoc, deleteDoc, doc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getMemberName, getMemberPhone } from "../utils/memberFields";

const COLLECTION_NAME = "trainingsessions";
const MATERIAL_TYPES = ["PPT", "Recording", "PDF", "Document", "Other"];

const createEmptyForm = () => ({
  topic: "",
  description: "",
  trainer: "",
  date: "",
  time: "",
  meetingLink: "",
  teamEmails: "",
});

const createEmptyMaterialForm = () => ({ title: "", type: MATERIAL_TYPES[0], link: "" });
const createEmptyFeedbackForm = () => ({ rating: 0, comment: "" });

const todayStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Trainees are stored as {id, name, phone}; older sessions may still have plain name strings.
const getTraineeName = (trainee) => (typeof trainee === "string" ? trainee : trainee?.name || "Unknown");

function StarRating({ value, onChange, size = 20 }) {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: star <= value ? "#f59e0b" : "#d1d5db" }}
        >
          {star <= value ? <FaStar size={size} /> : <FaRegStar size={size} />}
        </button>
      ))}
    </div>
  );
}

export default function TrainingPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  // Trainee multiselect (shared members list, loaded once)
  const [allMembers, setAllMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [selectedTrainees, setSelectedTrainees] = useState([]); // [{id, name, phone}]

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [topicSearch, setTopicSearch] = useState("");

  const [activeView, setActiveView] = useState("sessions");
  const [materialsSession, setMaterialsSession] = useState(null);
  const [materialForm, setMaterialForm] = useState(createEmptyMaterialForm());
  const [materialFormError, setMaterialFormError] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadPickerSearch, setUploadPickerSearch] = useState("");
  const [libraryTypeFilter, setLibraryTypeFilter] = useState("All");
  const [libraryTrainingFilter, setLibraryTrainingFilter] = useState("All");
  const [librarySearch, setLibrarySearch] = useState("");

  const [feedbackSession, setFeedbackSession] = useState(null);
  const [feedbackForm, setFeedbackForm] = useState(createEmptyFeedbackForm());
  const [savingFeedback, setSavingFeedback] = useState(false);

  const [historySearch, setHistorySearch] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const loadSessions = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setSessions(rows);
    } catch (error) {
      console.error("Error loading training sessions:", error);
      showToast("Failed to load training sessions.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const ensureMembersLoaded = async () => {
    if (allMembers.length > 0) return;
    setMembersLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "users"));
      const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setAllMembers(rows);
    } catch (error) {
      console.error("Error loading members:", error);
      showToast("Failed to load members list.", "error");
    } finally {
      setMembersLoading(false);
    }
  };

  const filteredMembersForPicker = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();
    if (!term) return allMembers;
    return allMembers.filter((m) => {
      const name = getMemberName(m).toLowerCase();
      const phone = getMemberPhone(m).toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [allMembers, memberSearchTerm]);

  const toggleTrainee = (member) => {
    setSelectedTrainees((prev) => {
      const exists = prev.some((t) => t.id === member.id);
      if (exists) return prev.filter((t) => t.id !== member.id);
      return [...prev, { id: member.id, name: getMemberName(member), phone: getMemberPhone(member) }];
    });
  };

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))),
    [sessions]
  );

  const getSessionStatus = (session) => (String(session.date || "") >= todayStr() ? "Upcoming" : "Completed");

  const filteredSessions = useMemo(() => {
    const term = topicSearch.trim().toLowerCase();
    return sortedSessions.filter((session) => {
      if (statusFilter !== "All" && getSessionStatus(session) !== statusFilter) return false;
      if (term && !String(session.topic || "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [sortedSessions, statusFilter, topicSearch]);

  const hasActiveFilters = statusFilter !== "All" || topicSearch.trim() !== "";
  const clearFilters = () => {
    setStatusFilter("All");
    setTopicSearch("");
  };

  const uploadPickerSessions = useMemo(() => {
    const term = uploadPickerSearch.trim().toLowerCase();
    const desc = [...sortedSessions].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (!term) return desc;
    return desc.filter((session) => String(session.topic || "").toLowerCase().includes(term));
  }, [sortedSessions, uploadPickerSearch]);

  const counts = useMemo(() => {
    const upcoming = sessions.filter((session) => getSessionStatus(session) === "Upcoming").length;
    const totalAttendance = sessions.reduce((sum, session) => sum + (session.attendees?.length || 0), 0);
    return {
      total: sessions.length,
      upcoming,
      completed: sessions.length - upcoming,
      totalAttendance,
    };
  }, [sessions]);

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const openScheduleModal = (session = null) => {
    if (session) {
      setEditingSessionId(session.id);
      setForm({
        topic: session.topic || "",
        description: session.description || "",
        trainer: session.trainer || "",
        date: session.date || "",
        time: session.time || "",
        meetingLink: session.meetingLink || "",
        teamEmails: session.teamEmails || "",
      });
      setSelectedTrainees(
        (session.attendees || []).map((t) =>
          typeof t === "string" ? { id: t, name: t, phone: "" } : t
        )
      );
    } else {
      setEditingSessionId(null);
      setForm(createEmptyForm());
      setSelectedTrainees([]);
    }
    setMemberSearchTerm("");
    setFormError("");
    setShowScheduleModal(true);
    void ensureMembersLoaded();
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setEditingSessionId(null);
    setForm(createEmptyForm());
    setSelectedTrainees([]);
    setMemberSearchTerm("");
    setFormError("");
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();

    if (!form.topic.trim()) {
      setFormError("Please enter the training topic.");
      return;
    }
    if (!form.date) {
      setFormError("Please select the training date.");
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      const payload = {
        topic: form.topic.trim(),
        description: form.description.trim() || "-",
        trainer: form.trainer.trim() || "-",
        date: form.date,
        time: form.time || "-",
        meetingLink: form.meetingLink.trim() || "",
        teamEmails: form.teamEmails.trim(),
        attendees: selectedTrainees,
      };

      if (editingSessionId) {
        await updateDoc(doc(db, COLLECTION_NAME, editingSessionId), payload);
        setSessions((prev) => prev.map((item) => (item.id === editingSessionId ? { ...item, ...payload } : item)));
        showToast("Training session updated successfully!");
      } else {
        const newSession = {
          ...payload,
          reminderSent: false,
          lastReminderSent: false,
          materials: [],
          feedback: null,
          emailSentAt: null,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, COLLECTION_NAME), newSession);
        setSessions((prev) => [...prev, { id: docRef.id, ...newSession }]);
        showToast("Training session scheduled successfully!");
      }
      closeScheduleModal();
    } catch (error) {
      console.error("Error saving training session:", error);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (session) => {
    setDeletingId(session.id);
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, session.id));
      setSessions((prev) => prev.filter((item) => item.id !== session.id));
    } catch (error) {
      console.error("Error deleting training session:", error);
      showToast("Failed to delete. Please try again.", "error");
    } finally {
      setDeletingId("");
    }
  };

  const getTeamEmailRecipients = (session) =>
    String(session.teamEmails || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);

  const sendTrainingEmail = async ({ recipients, subject, body }) => {
    const response = await fetch("/api/send-allocation-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: recipients, subject, body }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to send email.");
    }
  };

  const handleSendReminder = async (session, field) => {
    const recipients = getTeamEmailRecipients(session);
    if (recipients.length === 0) {
      showToast("Add at least one team email in this training's schedule details first.", "error");
      return;
    }

    const isLastReminder = field === "lastReminderSent";
    const traineeNames = (session.attendees || []).map(getTraineeName);
    const bodyLines = [
      `${isLastReminder ? "Final Reminder" : "Reminder"}: ${session.topic}`,
      `Date: ${formatDateDisplay(session.date)}${session.time && session.time !== "-" ? ` at ${session.time}` : ""}`,
      `Trainer: ${session.trainer || "-"}`,
      `Meeting Link: ${session.meetingLink || "-"}`,
      `Trainees: ${traineeNames.length ? traineeNames.join(", ") : "-"}`,
      "",
      "Regards,",
      "Training Team",
    ];

    setTogglingId(`${session.id}-${field}`);
    try {
      await sendTrainingEmail({
        recipients,
        subject: `${isLastReminder ? "Final Reminder" : "Reminder"} — ${session.topic} (${formatDateDisplay(session.date)})`,
        body: bodyLines.join("\n"),
      });

      const sentAtField = `${field}At`;
      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { [field]: true, [sentAtField]: sentAt });
      setSessions((prev) =>
        prev.map((item) => (item.id === session.id ? { ...item, [field]: true, [sentAtField]: sentAt } : item))
      );
      showToast(`${isLastReminder ? "Final reminder" : "Reminder"} emailed to ${recipients.length} recipient(s).`);
    } catch (error) {
      console.error("Error sending reminder email:", error);
      showToast("Failed to send reminder email.", "error");
    } finally {
      setTogglingId("");
    }
  };

  const openMaterialsModal = (session) => {
    setMaterialsSession(session);
    setMaterialForm(createEmptyMaterialForm());
    setMaterialFormError("");
  };

  const closeMaterialsModal = () => {
    setMaterialsSession(null);
    setMaterialForm(createEmptyMaterialForm());
    setMaterialFormError("");
  };

  const openUploadPicker = () => {
    setUploadPickerSearch("");
    setShowUploadPicker(true);
  };

  const closeUploadPicker = () => {
    setShowUploadPicker(false);
    setUploadPickerSearch("");
  };

  const handlePickTrainingForUpload = (session) => {
    closeUploadPicker();
    openMaterialsModal(session);
  };

  const updateMaterialForm = (field, value) => setMaterialForm((prev) => ({ ...prev, [field]: value }));

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!materialsSession) return;

    if (!materialForm.title.trim()) {
      setMaterialFormError("Please enter a title for the material.");
      return;
    }
    if (!materialForm.link.trim()) {
      setMaterialFormError("Please paste the Drive/share link for the material.");
      return;
    }

    setMaterialFormError("");
    setSavingMaterial(true);
    try {
      const newMaterial = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: materialForm.title.trim(),
        type: materialForm.type,
        link: materialForm.link.trim(),
        addedAt: new Date().toISOString(),
      };
      const updatedMaterials = [...(materialsSession.materials || []), newMaterial];
      await updateDoc(doc(db, COLLECTION_NAME, materialsSession.id), { materials: updatedMaterials });
      setSessions((prev) =>
        prev.map((item) => (item.id === materialsSession.id ? { ...item, materials: updatedMaterials } : item))
      );
      setMaterialsSession((prev) => ({ ...prev, materials: updatedMaterials }));
      setMaterialForm(createEmptyMaterialForm());
    } catch (error) {
      console.error("Error adding material:", error);
      setMaterialFormError("Failed to save. Please try again.");
    } finally {
      setSavingMaterial(false);
    }
  };

  const handleRemoveMaterial = async (materialId) => {
    if (!materialsSession) return;
    const updatedMaterials = (materialsSession.materials || []).filter((item) => item.id !== materialId);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, materialsSession.id), { materials: updatedMaterials });
      setSessions((prev) =>
        prev.map((item) => (item.id === materialsSession.id ? { ...item, materials: updatedMaterials } : item))
      );
      setMaterialsSession((prev) => ({ ...prev, materials: updatedMaterials }));
    } catch (error) {
      console.error("Error removing material:", error);
      showToast("Failed to remove material.", "error");
    }
  };

  const handleSendTeamEmail = async () => {
    if (!materialsSession) return;

    const recipients = getTeamEmailRecipients(materialsSession);
    if (recipients.length === 0) {
      showToast("Add at least one team email in the training's schedule details first.", "error");
      return;
    }

    const materials = materialsSession.materials || [];
    if (materials.length === 0) {
      showToast("Add at least one material before emailing the team.", "error");
      return;
    }

    const traineeNames = (materialsSession.attendees || []).map(getTraineeName);
    const bodyLines = [
      `Training: ${materialsSession.topic}`,
      `Date: ${formatDateDisplay(materialsSession.date)}${materialsSession.time && materialsSession.time !== "-" ? ` at ${materialsSession.time}` : ""}`,
      `Trainer: ${materialsSession.trainer || "-"}`,
      `Trainees: ${traineeNames.length ? traineeNames.join(", ") : "-"}`,
      "",
      "Materials:",
      ...materials.map((m) => `- [${m.type}] ${m.title}: ${m.link}`),
      "",
      "Regards,",
      "Training Team",
    ];

    setSendingEmail(true);
    try {
      await sendTrainingEmail({
        recipients,
        subject: `Training Materials — ${materialsSession.topic} (${formatDateDisplay(materialsSession.date)})`,
        body: bodyLines.join("\n"),
      });

      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, COLLECTION_NAME, materialsSession.id), { emailSentAt: sentAt });
      setSessions((prev) =>
        prev.map((item) => (item.id === materialsSession.id ? { ...item, emailSentAt: sentAt } : item))
      );
      setMaterialsSession((prev) => ({ ...prev, emailSentAt: sentAt }));
      showToast(`Email sent to ${recipients.length} recipient(s).`);
    } catch (error) {
      console.error("Error sending team email:", error);
      showToast("Failed to send email. Please try again.", "error");
    } finally {
      setSendingEmail(false);
    }
  };

  const openFeedbackModal = (session) => {
    setFeedbackSession(session);
    setFeedbackForm(session.feedback ? { rating: session.feedback.rating || 0, comment: session.feedback.comment || "" } : createEmptyFeedbackForm());
  };

  const closeFeedbackModal = () => {
    setFeedbackSession(null);
    setFeedbackForm(createEmptyFeedbackForm());
  };

  const handleSaveFeedback = async () => {
    if (!feedbackSession) return;
    if (feedbackForm.rating === 0) {
      showToast("Please select a star rating.", "error");
      return;
    }

    setSavingFeedback(true);
    try {
      const feedback = {
        rating: feedbackForm.rating,
        comment: feedbackForm.comment.trim(),
        submittedAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, COLLECTION_NAME, feedbackSession.id), { feedback });
      setSessions((prev) => prev.map((item) => (item.id === feedbackSession.id ? { ...item, feedback } : item)));
      showToast("Feedback saved successfully!");
      closeFeedbackModal();
    } catch (error) {
      console.error("Error saving feedback:", error);
      showToast("Failed to save feedback.", "error");
    } finally {
      setSavingFeedback(false);
    }
  };

  const allMaterials = useMemo(
    () =>
      sortedSessions.flatMap((session) =>
        (session.materials || []).map((material) => ({
          ...material,
          sessionId: session.id,
          sessionTopic: session.topic,
          sessionDate: session.date,
        }))
      ),
    [sortedSessions]
  );

  const libraryTrainingOptions = useMemo(
    () => ["All", ...Array.from(new Set(allMaterials.map((item) => item.sessionTopic))).sort((a, b) => a.localeCompare(b))],
    [allMaterials]
  );

  const filteredMaterials = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return allMaterials.filter((item) => {
      if (libraryTypeFilter !== "All" && item.type !== libraryTypeFilter) return false;
      if (libraryTrainingFilter !== "All" && item.sessionTopic !== libraryTrainingFilter) return false;
      if (term && !item.title.toLowerCase().includes(term) && !item.sessionTopic.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [allMaterials, libraryTypeFilter, libraryTrainingFilter, librarySearch]);

  const historyRows = useMemo(
    () => [...sessions].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [sessions]
  );

  const filteredHistoryRows = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    if (!term) return historyRows;
    return historyRows.filter((session) => {
      const traineeNames = (session.attendees || []).map(getTraineeName).join(" ").toLowerCase();
      return (
        String(session.topic || "").toLowerCase().includes(term) ||
        traineeNames.includes(term)
      );
    });
  }, [historyRows, historySearch]);

  return (
    <div className="training-page">
      <style>{`
        .training-page {
          padding: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        .training-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .training-header h2 {
          margin: 0;
          font-size: 22px;
          color: #0f172a;
        }
        .training-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .training-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .training-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          border-radius: 10px;
          border: none;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
        .training-btn-primary {
          background: #1976d2;
          color: #fff;
        }
        .training-btn-secondary {
          background: #f0fdfa;
          color: #0f766e;
          border: 1px solid #99f6e0;
        }
        .training-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .training-filter-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 20px;
          padding: 14px 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }
        .training-filter-row select,
        .training-filter-row input {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          background: #fff;
          min-width: 190px;
          outline: none;
        }
        .training-clear-filters-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #374151;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }
        .training-clear-filters-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: #ffffff;
          border-radius: 10px;
          padding: 22px 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
          border: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .card-icon {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          color: white;
          font-size: 1.4rem;
        }
        .card-icon.blue { background: #1976d2; }
        .card-icon.orange { background: #fb8c00; }
        .card-icon.new { background: #43a047; }
        .card-icon.purple { background: #7c3aed; }
        .card-label {
          font-size: 1rem;
          color: #777;
          margin-bottom: 8px;
        }
        .card-value {
          font-size: 1.9rem;
          font-weight: 700;
          color: #0f172a;
        }
        .training-table-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          padding: 20px;
          overflow-x: auto;
        }
        .training-table-card h3 {
          margin: 0 0 16px;
          font-size: 15px;
          color: #0f172a;
        }
        .training-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 1100px;
        }
        .training-table th {
          background: #2563eb;
          color: #fff;
          text-align: left;
          padding: 12px 14px;
          font-weight: 600;
          white-space: nowrap;
        }
        .training-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }
        .training-table tr:nth-child(even) td {
          background: #f9fafb;
        }
        .training-status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .training-status-badge.upcoming {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .training-status-badge.completed {
          background: #dcfce7;
          color: #16a34a;
        }
        .training-meeting-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #1976d2;
          font-weight: 600;
          text-decoration: none;
        }
        .training-attendees-btn,
        .training-materials-btn,
        .training-feedback-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid #dbe3ee;
          background: #fff;
          color: #0f172a;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .training-reminder-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: none;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          margin-right: 6px;
          margin-bottom: 4px;
        }
        .training-reminder-btn.sent {
          background: #dcfce7;
          color: #16a34a;
        }
        .training-reminder-btn.pending {
          background: #fef3c7;
          color: #b45309;
        }
        .training-delete-btn {
          border: none;
          background: #f1f5f9;
          color: #ef4444;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .training-delete-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .training-empty {
          text-align: center;
          color: #9ca3af;
          font-style: italic;
          padding: 40px 0;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3000;
          padding: 16px;
        }
        .modal-panel {
          width: min(560px, 100%);
          max-height: 90vh;
          overflow-y: auto;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.28);
        }
        .modal-panel-header {
          padding: 18px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: linear-gradient(135deg, #0f766e, #1976d2);
          color: #fff;
          border-top-left-radius: 16px;
          border-top-right-radius: 16px;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .modal-panel-header h3 {
          margin: 0;
          font-size: 18px;
        }
        .modal-close-btn {
          background: rgba(255,255,255,0.18);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 18px;
        }
        .modal-panel-body {
          padding: 22px;
        }
        .training-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }
        .training-field label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
        }
        .training-field input,
        .training-field textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        .training-field textarea {
          resize: vertical;
          min-height: 70px;
        }
        .training-error {
          color: #dc2626;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 14px;
        }
        .modal-footer-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .training-cancel-btn {
          padding: 11px 18px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #374151;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
        }
        .training-attendees-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 18px;
          max-height: 220px;
          overflow-y: auto;
        }
        .training-attendee-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .training-attendee-row span {
          font-size: 13px;
          color: #0f172a;
          font-weight: 600;
        }
        .training-attendee-remove {
          border: none;
          background: transparent;
          color: #ef4444;
          cursor: pointer;
          display: inline-flex;
        }
        .training-view-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          border-bottom: 1px solid #e2e8f0;
        }
        .training-view-tab {
          padding: 10px 18px;
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 700;
          color: #64748b;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          margin-bottom: -1px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .training-view-tab.active {
          color: #1976d2;
          border-bottom-color: #1976d2;
        }
        .training-material-type-select {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          color: #0f172a;
          background: #fff;
          outline: none;
          box-sizing: border-box;
        }
        .training-material-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .training-material-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .training-material-type-badge {
          flex: 0 0 auto;
          padding: 3px 9px;
          border-radius: 999px;
          background: #eef2ff;
          color: #4338ca;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .training-material-title {
          font-size: 13px;
          color: #0f172a;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .training-material-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 0 0 auto;
        }
        .training-material-open-link {
          color: #1976d2;
          display: inline-flex;
        }
        .training-material-add-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .training-material-add-form input {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
        }
        .training-material-add-grid {
          display: grid;
          grid-template-columns: 1fr 140px;
          gap: 10px;
        }
        .training-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 14px 22px;
          border-radius: 8px;
          color: #fff;
          font-weight: 600;
          z-index: 5000;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
        }
        .training-member-picker {
          margin-bottom: 18px;
        }
        .training-member-search {
          position: relative;
          margin-bottom: 8px;
        }
        .training-member-search svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
        }
        .training-member-search input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          box-sizing: border-box;
        }
        .training-member-list {
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }
        .training-member-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          font-size: 13px;
        }
        .training-member-row:hover {
          background: #f8fafc;
        }
        .training-member-row.selected {
          background: #eff6ff;
        }
        .training-member-name {
          font-weight: 600;
          color: #0f172a;
        }
        .training-member-phone {
          color: #64748b;
          font-size: 12px;
        }
        .training-selected-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .training-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 600;
        }
        .training-chip button {
          border: none;
          background: none;
          color: #1d4ed8;
          cursor: pointer;
          display: inline-flex;
        }
        .training-feedback-summary {
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `}</style>

      {toast.show && (
        <div className="training-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="training-header">
        <div>
          <h2>Training</h2>
          <p>Schedule weekly training sessions, upload materials, and track feedback.</p>
        </div>
        <div className="training-header-actions">
          {activeView === "sessions" && (
            <button
              type="button"
              className={`training-btn ${hasActiveFilters ? "training-btn-primary" : "training-btn-secondary"}`}
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <FaFilter size={12} />
              Filters
            </button>
          )}
          <button type="button" className="training-btn training-btn-secondary" onClick={openUploadPicker}>
            <FaFolderOpen size={12} />
            Upload Documents
          </button>
          {activeView === "sessions" && (
            <button type="button" className="training-btn training-btn-primary" onClick={() => openScheduleModal()}>
              <FaPlus size={12} />
              Schedule Training
            </button>
          )}
        </div>
      </div>

      <div className="training-view-tabs">
        <button
          type="button"
          className={`training-view-tab ${activeView === "sessions" ? "active" : ""}`}
          onClick={() => setActiveView("sessions")}
        >
          <FaChalkboardTeacher size={13} />
          Training Sessions
        </button>
        <button
          type="button"
          className={`training-view-tab ${activeView === "library" ? "active" : ""}`}
          onClick={() => setActiveView("library")}
        >
          <FaFolderOpen size={13} />
          Materials Library
        </button>
        <button
          type="button"
          className={`training-view-tab ${activeView === "history" ? "active" : ""}`}
          onClick={() => setActiveView("history")}
        >
          <FaHistory size={13} />
          History
        </button>
      </div>

      {activeView === "sessions" && showFilters && (
        <div className="training-filter-row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Upcoming">Upcoming</option>
            <option value="Completed">Completed</option>
          </select>
          <input
            type="text"
            value={topicSearch}
            onChange={(e) => setTopicSearch(e.target.value)}
            placeholder="Search by topic..."
          />
          <button type="button" className="training-clear-filters-btn" onClick={clearFilters} disabled={!hasActiveFilters}>
            <FaTimes size={11} />
            Clear All
          </button>
        </div>
      )}

      {activeView === "sessions" && (
      <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="card-icon blue">
            <FaChalkboardTeacher size={24} />
          </div>
          <div className="card-label">Total Sessions</div>
          <div className="card-value">{counts.total.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon orange">
            <FaCalendarCheck size={24} />
          </div>
          <div className="card-label">Upcoming</div>
          <div className="card-value">{counts.upcoming.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon new">
            <FaCheckCircle size={24} />
          </div>
          <div className="card-label">Completed</div>
          <div className="card-value">{counts.completed.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon purple">
            <FaUsers size={24} />
          </div>
          <div className="card-label">Total Trainee Slots</div>
          <div className="card-value">{counts.totalAttendance.toLocaleString()}</div>
        </div>
      </div>

      <div className="training-table-card">
        <h3>Training Sessions ({filteredSessions.length})</h3>

        {loading ? (
          <div className="training-empty">Loading training sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="training-empty">No training sessions added yet.</div>
        ) : filteredSessions.length === 0 ? (
          <div className="training-empty">No training sessions match these filters.</div>
        ) : (
          <table className="training-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Topic</th>
                <th>Trainees</th>
                <th>Meeting Link</th>
                <th>Materials</th>
                <th>Feedback</th>
                <th>Reminders</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => {
                const status = getSessionStatus(session);
                return (
                  <tr key={session.id}>
                    <td>{formatDateDisplay(session.date)}</td>
                    <td>{session.time || "-"}</td>
                    <td style={{ cursor: "pointer", color: "#1976d2", fontWeight: 700 }} onClick={() => openScheduleModal(session)} title="Click to edit">
                      {session.topic}
                    </td>
                    <td>
                      <button type="button" className="training-attendees-btn" onClick={() => openScheduleModal(session)}>
                        <FaUserFriends size={11} />
                        {(session.attendees || []).length}
                      </button>
                    </td>
                    <td>
                      {session.meetingLink ? (
                        <a className="training-meeting-link" href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                          <FaLink size={11} />
                          Join
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <button type="button" className="training-materials-btn" onClick={() => openMaterialsModal(session)}>
                        <FaFolderOpen size={11} />
                        {(session.materials || []).length}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="training-feedback-btn" onClick={() => openFeedbackModal(session)}>
                        {session.feedback ? (
                          <span className="training-feedback-summary">
                            <FaStar size={11} color="#f59e0b" />
                            {session.feedback.rating}/5
                          </span>
                        ) : (
                          <>
                            <FaRegStar size={11} />
                            Add
                          </>
                        )}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`training-reminder-btn ${session.reminderSent ? "sent" : "pending"}`}
                        onClick={() => handleSendReminder(session, "reminderSent")}
                        disabled={togglingId === `${session.id}-reminderSent`}
                        title={session.reminderSentAt ? `Last sent ${new Date(session.reminderSentAt).toLocaleString("en-IN")} — click to resend` : "Click to email the team a reminder"}
                      >
                        {session.reminderSent ? <FaBell size={11} /> : <FaRegBell size={11} />}
                        {togglingId === `${session.id}-reminderSent` ? "Sending..." : "Reminder"}
                      </button>
                      <button
                        type="button"
                        className={`training-reminder-btn ${session.lastReminderSent ? "sent" : "pending"}`}
                        onClick={() => handleSendReminder(session, "lastReminderSent")}
                        disabled={togglingId === `${session.id}-lastReminderSent`}
                        title={session.lastReminderSentAt ? `Last sent ${new Date(session.lastReminderSentAt).toLocaleString("en-IN")} — click to resend` : "Click to email the team a final reminder"}
                      >
                        {session.lastReminderSent ? <FaBell size={11} /> : <FaRegBell size={11} />}
                        {togglingId === `${session.id}-lastReminderSent` ? "Sending..." : "Last Reminder"}
                      </button>
                    </td>
                    <td>
                      <span className={`training-status-badge ${status.toLowerCase()}`}>{status}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="training-delete-btn"
                        onClick={() => handleDeleteSession(session)}
                        disabled={deletingId === session.id}
                        title="Remove"
                      >
                        <FaTrashAlt size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {activeView === "library" && (
      <>
      <div className="training-filter-row">
        <input
          type="text"
          value={librarySearch}
          onChange={(e) => setLibrarySearch(e.target.value)}
          placeholder="Search materials or training..."
        />
        <select value={libraryTypeFilter} onChange={(e) => setLibraryTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          {MATERIAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select value={libraryTrainingFilter} onChange={(e) => setLibraryTrainingFilter(e.target.value)}>
          {libraryTrainingOptions.map((topic) => (
            <option key={topic} value={topic}>
              {topic === "All" ? "All Trainings" : topic}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="training-clear-filters-btn"
          onClick={() => {
            setLibrarySearch("");
            setLibraryTypeFilter("All");
            setLibraryTrainingFilter("All");
          }}
          disabled={!librarySearch && libraryTypeFilter === "All" && libraryTrainingFilter === "All"}
        >
          <FaTimes size={11} />
          Clear All
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="card-icon blue">
            <FaFolderOpen size={24} />
          </div>
          <div className="card-label">Total Materials</div>
          <div className="card-value">{allMaterials.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon orange">
            <FaChalkboardTeacher size={24} />
          </div>
          <div className="card-label">Trainings With Materials</div>
          <div className="card-value">{(libraryTrainingOptions.length - 1).toLocaleString()}</div>
        </div>
      </div>

      <div className="training-table-card">
        <h3>Materials Library ({filteredMaterials.length})</h3>

        {loading ? (
          <div className="training-empty">Loading materials...</div>
        ) : allMaterials.length === 0 ? (
          <div className="training-empty">No materials added to any training yet.</div>
        ) : filteredMaterials.length === 0 ? (
          <div className="training-empty">No materials match these filters.</div>
        ) : (
          <table className="training-table">
            <thead>
              <tr>
                <th>Training</th>
                <th>Training Date</th>
                <th>Material</th>
                <th>Type</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((material) => (
                <tr key={`${material.sessionId}-${material.id}`}>
                  <td>{material.sessionTopic}</td>
                  <td>{formatDateDisplay(material.sessionDate)}</td>
                  <td>{material.title}</td>
                  <td>
                    <span className="training-material-type-badge">{material.type}</span>
                  </td>
                  <td>{material.addedAt ? formatDateDisplay(material.addedAt.slice(0, 10)) : "-"}</td>
                  <td>
                    <a className="training-meeting-link" href={material.link} target="_blank" rel="noopener noreferrer">
                      <FaExternalLinkAlt size={11} />
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}

      {activeView === "history" && (
        <div className="training-table-card">
          <div className="training-filter-row" style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search by training topic or trainee name..."
              style={{ minWidth: "280px" }}
            />
          </div>
          <h3>Training History ({filteredHistoryRows.length})</h3>

          {loading ? (
            <div className="training-empty">Loading history...</div>
          ) : filteredHistoryRows.length === 0 ? (
            <div className="training-empty">No training history yet.</div>
          ) : (
            <table className="training-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Training</th>
                  <th>Trainer</th>
                  <th>Trainees</th>
                  <th>Documents Uploaded</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistoryRows.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDateDisplay(session.date)}</td>
                    <td>{session.topic}</td>
                    <td>{session.trainer || "-"}</td>
                    <td>
                      {(session.attendees || []).length === 0
                        ? "-"
                        : (session.attendees || []).map(getTraineeName).join(", ")}
                    </td>
                    <td>
                      {(session.materials || []).length === 0 ? (
                        "-"
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {session.materials.map((m) => (
                            <a key={m.id} href={m.link} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
                              [{m.type}] {m.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {session.feedback ? (
                        <div>
                          <div className="training-feedback-summary">
                            <FaStar size={11} color="#f59e0b" />
                            {session.feedback.rating}/5
                          </div>
                          {session.feedback.comment && (
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{session.feedback.comment}</div>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showScheduleModal && (
        <div className="modal-overlay" onClick={closeScheduleModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <h3>{editingSessionId ? "Edit Training Session" : "Schedule Training"}</h3>
              <button type="button" className="modal-close-btn" onClick={closeScheduleModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSaveSession}>
              <div className="modal-panel-body">
                <div className="training-field" style={{ marginBottom: "16px" }}>
                  <label htmlFor="topic">Training Topic</label>
                  <input
                    id="topic"
                    type="text"
                    value={form.topic}
                    onChange={(e) => updateForm("topic", e.target.value)}
                    placeholder="e.g. Objection Handling Workshop"
                  />
                </div>

                <div className="training-member-picker">
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#64748b", marginBottom: "6px" }}>
                    Add Trainees
                  </label>
                  <div className="training-member-search">
                    <FaSearch size={13} />
                    <input
                      type="text"
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      placeholder="Search members by name or mobile..."
                    />
                  </div>
                  <div className="training-member-list">
                    {membersLoading ? (
                      <div className="training-empty">Loading members...</div>
                    ) : filteredMembersForPicker.length === 0 ? (
                      <div className="training-empty">No members match your search.</div>
                    ) : (
                      filteredMembersForPicker.slice(0, 200).map((member) => {
                        const selected = selectedTrainees.some((t) => t.id === member.id);
                        return (
                          <div
                            key={member.id}
                            className={`training-member-row ${selected ? "selected" : ""}`}
                            onClick={() => toggleTrainee(member)}
                          >
                            <input type="checkbox" checked={selected} onChange={() => toggleTrainee(member)} onClick={(e) => e.stopPropagation()} />
                            <div>
                              <div className="training-member-name">{getMemberName(member)}</div>
                              <div className="training-member-phone">{getMemberPhone(member) || "-"}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedTrainees.length > 0 && (
                    <div className="training-selected-chips">
                      {selectedTrainees.map((trainee) => (
                        <span key={trainee.id} className="training-chip">
                          {trainee.name}
                          <button type="button" onClick={() => setSelectedTrainees((prev) => prev.filter((t) => t.id !== trainee.id))}>
                            <FaTimes size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="training-grid">
                  <div className="training-field">
                    <label htmlFor="date">Training Date</label>
                    <input id="date" type="date" value={form.date} onChange={(e) => updateForm("date", e.target.value)} />
                  </div>
                  <div className="training-field">
                    <label htmlFor="time">Time</label>
                    <input id="time" type="time" value={form.time} onChange={(e) => updateForm("time", e.target.value)} />
                  </div>
                </div>

                <div className="training-grid">
                  <div className="training-field">
                    <label htmlFor="trainer">Trainer / Conducted By</label>
                    <input
                      id="trainer"
                      type="text"
                      value={form.trainer}
                      onChange={(e) => updateForm("trainer", e.target.value)}
                      placeholder="Name of the trainer"
                    />
                  </div>
                  <div className="training-field">
                    <label htmlFor="meeting-link">Meeting Link</label>
                    <input
                      id="meeting-link"
                      type="text"
                      value={form.meetingLink}
                      onChange={(e) => updateForm("meetingLink", e.target.value)}
                      placeholder="https://meet.google.com/..."
                    />
                  </div>
                </div>

                <div className="training-field" style={{ marginBottom: "16px" }}>
                  <label htmlFor="team-emails">Team Emails (for post-training update, comma-separated)</label>
                  <input
                    id="team-emails"
                    type="text"
                    value={form.teamEmails}
                    onChange={(e) => updateForm("teamEmails", e.target.value)}
                    placeholder="lead@brisk...,manager@brisk..."
                  />
                </div>

                <div className="training-field" style={{ marginBottom: "20px" }}>
                  <label htmlFor="description">Description / Agenda</label>
                  <textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                    placeholder="What will this session cover..."
                  />
                </div>

                {formError && <div className="training-error">{formError}</div>}

                <div className="modal-footer-actions">
                  <button type="button" className="training-cancel-btn" onClick={closeScheduleModal}>
                    Cancel
                  </button>
                  <button type="submit" className="training-btn training-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : editingSessionId ? "Save Changes" : "Schedule Training"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUploadPicker && (
        <div className="modal-overlay" onClick={closeUploadPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(480px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Select Training To Upload Documents</h3>
              <button type="button" className="modal-close-btn" onClick={closeUploadPicker} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-member-search" style={{ marginBottom: "12px" }}>
                <FaSearch size={13} />
                <input
                  type="text"
                  autoFocus
                  value={uploadPickerSearch}
                  onChange={(e) => setUploadPickerSearch(e.target.value)}
                  placeholder="Search training by topic..."
                />
              </div>
              <div className="training-member-list" style={{ maxHeight: "320px" }}>
                {uploadPickerSessions.length === 0 ? (
                  <div className="training-empty">No trainings match your search.</div>
                ) : (
                  uploadPickerSessions.map((session) => (
                    <div key={session.id} className="training-member-row" onClick={() => handlePickTrainingForUpload(session)}>
                      <div>
                        <div className="training-member-name">{session.topic}</div>
                        <div className="training-member-phone">
                          {formatDateDisplay(session.date)} · {(session.materials || []).length} doc(s) uploaded
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {materialsSession && (
        <div className="modal-overlay" onClick={closeMaterialsModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Materials - {materialsSession.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closeMaterialsModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-attendees-list">
                {(materialsSession.materials || []).length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>No materials added yet.</div>
                ) : (
                  materialsSession.materials.map((material) => (
                    <div key={material.id} className="training-material-row">
                      <div className="training-material-info">
                        <span className="training-material-type-badge">{material.type}</span>
                        <span className="training-material-title" title={material.title}>
                          {material.title}
                        </span>
                      </div>
                      <div className="training-material-actions">
                        <a
                          className="training-material-open-link"
                          href={material.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open"
                        >
                          <FaExternalLinkAlt size={13} />
                        </a>
                        <button
                          type="button"
                          className="training-attendee-remove"
                          onClick={() => handleRemoveMaterial(material.id)}
                          title="Remove"
                        >
                          <FaTimes size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form className="training-material-add-form" onSubmit={handleAddMaterial}>
                <div className="training-material-add-grid">
                  <input
                    type="text"
                    value={materialForm.title}
                    onChange={(e) => updateMaterialForm("title", e.target.value)}
                    placeholder="Material title, e.g. Week 3 Slides"
                  />
                  <select
                    className="training-material-type-select"
                    value={materialForm.type}
                    onChange={(e) => updateMaterialForm("type", e.target.value)}
                  >
                    {MATERIAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={materialForm.link}
                  onChange={(e) => updateMaterialForm("link", e.target.value)}
                  placeholder="Paste the Google Drive / share link..."
                />
                {materialFormError && <div className="training-error">{materialFormError}</div>}
                <button type="submit" className="training-btn training-btn-primary" disabled={savingMaterial}>
                  <FaPlus size={11} />
                  {savingMaterial ? "Saving..." : "Add Material"}
                </button>
              </form>

              <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  className="training-btn training-btn-secondary"
                  onClick={handleSendTeamEmail}
                  disabled={sendingEmail}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <FaEnvelope size={12} />
                  {sendingEmail ? "Sending..." : "Email Materials To Team"}
                </button>
                {materialsSession.emailSentAt && (
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", textAlign: "center" }}>
                    Last sent {new Date(materialsSession.emailSentAt).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {feedbackSession && (
        <div className="modal-overlay" onClick={closeFeedbackModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Feedback - {feedbackSession.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closeFeedbackModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-field" style={{ marginBottom: "16px" }}>
                <label>Overall Rating</label>
                <StarRating value={feedbackForm.rating} onChange={(rating) => setFeedbackForm((prev) => ({ ...prev, rating }))} />
              </div>
              <div className="training-field" style={{ marginBottom: "16px" }}>
                <label htmlFor="feedback-comment">Comments</label>
                <textarea
                  id="feedback-comment"
                  value={feedbackForm.comment}
                  onChange={(e) => setFeedbackForm((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="How did the session go? What can be improved next time..."
                />
              </div>
              <div className="modal-footer-actions">
                <button type="button" className="training-cancel-btn" onClick={closeFeedbackModal}>
                  Cancel
                </button>
                <button type="button" className="training-btn training-btn-primary" onClick={handleSaveFeedback} disabled={savingFeedback}>
                  {savingFeedback ? "Saving..." : "Save Feedback"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
