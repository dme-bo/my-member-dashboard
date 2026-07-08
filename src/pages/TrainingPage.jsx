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
} from "react-icons/fa";
import { collection, addDoc, deleteDoc, doc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION_NAME = "trainingsessions";
const MATERIAL_TYPES = ["PPT", "Recording", "PDF", "Document", "Other"];

const createEmptyForm = () => ({
  topic: "",
  description: "",
  trainer: "",
  date: "",
  time: "",
  meetingLink: "",
});

const createEmptyMaterialForm = () => ({ title: "", type: MATERIAL_TYPES[0], link: "" });

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

export default function TrainingPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [topicSearch, setTopicSearch] = useState("");

  const [attendeesSession, setAttendeesSession] = useState(null);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [savingAttendee, setSavingAttendee] = useState(false);

  const [activeView, setActiveView] = useState("sessions");
  const [materialsSession, setMaterialsSession] = useState(null);
  const [materialForm, setMaterialForm] = useState(createEmptyMaterialForm());
  const [materialFormError, setMaterialFormError] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState("All");
  const [libraryTrainingFilter, setLibraryTrainingFilter] = useState("All");
  const [librarySearch, setLibrarySearch] = useState("");

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

  const openAddModal = () => {
    setForm(createEmptyForm());
    setFormError("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setForm(createEmptyForm());
    setFormError("");
  };

  const handleAddSession = async (e) => {
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
      const newSession = {
        topic: form.topic.trim(),
        description: form.description.trim() || "-",
        trainer: form.trainer.trim() || "-",
        date: form.date,
        time: form.time || "-",
        meetingLink: form.meetingLink.trim() || "",
        reminderSent: false,
        attendees: [],
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, COLLECTION_NAME), newSession);
      setSessions((prev) => [...prev, { id: docRef.id, ...newSession }]);
      showToast("Training session added successfully!");
      closeAddModal();
    } catch (error) {
      console.error("Error adding training session:", error);
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

  const handleToggleReminder = async (session) => {
    setTogglingId(session.id);
    const nextValue = !session.reminderSent;
    try {
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { reminderSent: nextValue });
      setSessions((prev) => prev.map((item) => (item.id === session.id ? { ...item, reminderSent: nextValue } : item)));
    } catch (error) {
      console.error("Error updating reminder status:", error);
      showToast("Failed to update reminder status.", "error");
    } finally {
      setTogglingId("");
    }
  };

  const openAttendeesModal = (session) => {
    setAttendeesSession(session);
    setAttendeeInput("");
  };

  const closeAttendeesModal = () => {
    setAttendeesSession(null);
    setAttendeeInput("");
  };

  const handleAddAttendee = async (e) => {
    e.preventDefault();
    const name = attendeeInput.trim();
    if (!name || !attendeesSession) return;

    const currentAttendees = attendeesSession.attendees || [];
    if (currentAttendees.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setAttendeeInput("");
      return;
    }

    const updatedAttendees = [...currentAttendees, name];
    setSavingAttendee(true);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, attendeesSession.id), { attendees: updatedAttendees });
      setSessions((prev) =>
        prev.map((item) => (item.id === attendeesSession.id ? { ...item, attendees: updatedAttendees } : item))
      );
      setAttendeesSession((prev) => ({ ...prev, attendees: updatedAttendees }));
      setAttendeeInput("");
    } catch (error) {
      console.error("Error adding attendee:", error);
      showToast("Failed to add attendee.", "error");
    } finally {
      setSavingAttendee(false);
    }
  };

  const handleRemoveAttendee = async (name) => {
    if (!attendeesSession) return;
    const updatedAttendees = (attendeesSession.attendees || []).filter((existing) => existing !== name);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, attendeesSession.id), { attendees: updatedAttendees });
      setSessions((prev) =>
        prev.map((item) => (item.id === attendeesSession.id ? { ...item, attendees: updatedAttendees } : item))
      );
      setAttendeesSession((prev) => ({ ...prev, attendees: updatedAttendees }));
    } catch (error) {
      console.error("Error removing attendee:", error);
      showToast("Failed to remove attendee.", "error");
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
          min-width: 1000px;
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
        .training-attendees-btn {
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
        .training-attendee-add-row {
          display: flex;
          gap: 10px;
        }
        .training-attendee-add-row input {
          flex: 1;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          outline: none;
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
        }
        .training-view-tab.active {
          color: #1976d2;
          border-bottom-color: #1976d2;
        }
        .training-materials-btn {
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
      `}</style>

      {toast.show && (
        <div className="training-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="training-header">
        <div>
          <h2>Training</h2>
          <p>Track weekly training sessions, reminders, and attendance.</p>
        </div>
        <div className="training-header-actions">
          {activeView === "sessions" && (
            <>
              <button
                type="button"
                className={`training-btn ${hasActiveFilters ? "training-btn-primary" : "training-btn-secondary"}`}
                onClick={() => setShowFilters((prev) => !prev)}
              >
                <FaFilter size={12} />
                Filters
              </button>
              <button type="button" className="training-btn training-btn-primary" onClick={openAddModal}>
                <FaPlus size={12} />
                Add Training
              </button>
            </>
          )}
        </div>
      </div>

      <div className="training-view-tabs">
        <button
          type="button"
          className={`training-view-tab ${activeView === "sessions" ? "active" : ""}`}
          onClick={() => setActiveView("sessions")}
        >
          Training Sessions
        </button>
        <button
          type="button"
          className={`training-view-tab ${activeView === "library" ? "active" : ""}`}
          onClick={() => setActiveView("library")}
        >
          Materials Library
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
          <div className="card-label">Total Attendance</div>
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
                <th>Trainer</th>
                <th>Meeting Link</th>
                <th>Attendees</th>
                <th>Materials</th>
                <th>Reminder</th>
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
                    <td>{session.topic}</td>
                    <td>{session.trainer || "-"}</td>
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
                      <button type="button" className="training-attendees-btn" onClick={() => openAttendeesModal(session)}>
                        <FaUserFriends size={11} />
                        {(session.attendees || []).length}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="training-materials-btn" onClick={() => openMaterialsModal(session)}>
                        <FaFolderOpen size={11} />
                        {(session.materials || []).length}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`training-reminder-btn ${session.reminderSent ? "sent" : "pending"}`}
                        onClick={() => handleToggleReminder(session)}
                        disabled={togglingId === session.id}
                      >
                        {session.reminderSent ? <FaBell size={11} /> : <FaRegBell size={11} />}
                        {session.reminderSent ? "Sent" : "Pending"}
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

      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <h3>Add Training Session</h3>
              <button type="button" className="modal-close-btn" onClick={closeAddModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleAddSession}>
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
                  <button type="button" className="training-cancel-btn" onClick={closeAddModal}>
                    Cancel
                  </button>
                  <button type="submit" className="training-btn training-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Training"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {attendeesSession && (
        <div className="modal-overlay" onClick={closeAttendeesModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Attendees - {attendeesSession.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closeAttendeesModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-attendees-list">
                {(attendeesSession.attendees || []).length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>No attendees recorded yet.</div>
                ) : (
                  attendeesSession.attendees.map((name) => (
                    <div key={name} className="training-attendee-row">
                      <span>{name}</span>
                      <button type="button" className="training-attendee-remove" onClick={() => handleRemoveAttendee(name)} title="Remove">
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <form className="training-attendee-add-row" onSubmit={handleAddAttendee}>
                <input
                  type="text"
                  value={attendeeInput}
                  onChange={(e) => setAttendeeInput(e.target.value)}
                  placeholder="Add attendee name..."
                />
                <button type="submit" className="training-btn training-btn-primary" disabled={savingAttendee || !attendeeInput.trim()}>
                  <FaPlus size={11} />
                  Add
                </button>
              </form>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
