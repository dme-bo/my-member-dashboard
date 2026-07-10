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
  FaHistory,
  FaSearch,
} from "react-icons/fa";
import { collection, addDoc, deleteDoc, doc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getMemberName, getMemberPhone, getMemberEmail } from "../utils/memberFields";

const COLLECTION_NAME = "trainingsessions";
const WORKSHOP_COLLECTION_NAME = "workshopsmaster";
const WORKSHOP_APPLICANTS_SUBCOLLECTION = "workshop_users_applied";
const MATERIAL_TYPES = ["Feedback Form", "Members Training Update", "Training Video"];

const WORKSHOP_MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

// Workshop dates look like "06-Aug-2025 09:30" -> { date: "2025-08-06", time: "09:30" }
const parseWorkshopDateTime = (value) => {
  if (!value) return { date: "", time: "" };
  const [datePart, timePart = ""] = String(value).trim().split(" ");
  const [day, monName, year] = datePart.split("-");
  const month = WORKSHOP_MONTHS[monName];
  if (!day || !month || !year) return { date: "", time: timePart };
  return { date: `${year}-${month}-${day.padStart(2, "0")}`, time: timePart };
};

const createEmptyForm = () => ({
  topic: "",
  description: "",
  trainer: "",
  date: "",
  time: "",
  meetingLink: "",
  teamEmails: "",
});

const createEmptyMaterialForm = () => ({ type: MATERIAL_TYPES[0], link: "" });

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

  // Members list (used to resolve workshop applicant ids to names/phones/emails)
  const [allMembers, setAllMembers] = useState([]);
  const [selectedTrainees, setSelectedTrainees] = useState([]); // [{id, name, phone}] — sourced from workshop applicants

  // Workshops (trainings are now created by picking an already-applied-to workshop)
  const [workshops, setWorkshops] = useState([]);
  const [workshopsLoading, setWorkshopsLoading] = useState(false);
  const [workshopsLoaded, setWorkshopsLoaded] = useState(false);
  const [showWorkshopPicker, setShowWorkshopPicker] = useState(false);
  const [workshopPickerSearch, setWorkshopPickerSearch] = useState("");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [loadingApplicants, setLoadingApplicants] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [topicSearch, setTopicSearch] = useState("");

  const [activeView, setActiveView] = useState("sessions");
  const [documentsSession, setdocumentsSession] = useState(null);
  const [materialForm, setMaterialForm] = useState(createEmptyMaterialForm());
  const [materialFormError, setMaterialFormError] = useState("");
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadPickerSearch, setUploadPickerSearch] = useState("");
  const [libraryTypeFilter, setLibraryTypeFilter] = useState("All");
  const [libraryTrainingFilter, setLibraryTrainingFilter] = useState("All");
  const [librarySearch, setLibrarySearch] = useState("");

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
    if (allMembers.length > 0) return allMembers;
    try {
      const snapshot = await getDocs(collection(db, "users"));
      const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setAllMembers(rows);
      return rows;
    } catch (error) {
      console.error("Error loading members:", error);
      showToast("Failed to load members list.", "error");
      return [];
    }
  };

  const ensureWorkshopsLoaded = async () => {
    if (workshopsLoaded) return;
    setWorkshopsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, WORKSHOP_COLLECTION_NAME));
      const results = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          if (docSnap.data()?.workshop_isdraft) return null;
          const applicantsSnap = await getDocs(
            collection(db, WORKSHOP_COLLECTION_NAME, docSnap.id, WORKSHOP_APPLICANTS_SUBCOLLECTION)
          );
          if (applicantsSnap.size === 0) return null;
          return { id: docSnap.id, ...docSnap.data(), applicantCount: applicantsSnap.size };
        })
      );
      setWorkshops(results.filter(Boolean));
      setWorkshopsLoaded(true);
    } catch (error) {
      console.error("Error loading workshops:", error);
      showToast("Failed to load workshops.", "error");
    } finally {
      setWorkshopsLoading(false);
    }
  };

  const loadApplicantsForWorkshop = async (workshopId) => {
    const members = await ensureMembersLoaded();
    const snapshot = await getDocs(
      collection(db, WORKSHOP_COLLECTION_NAME, workshopId, WORKSHOP_APPLICANTS_SUBCOLLECTION)
    );
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const uid = data.user_id || data.uid || data.userId || docSnap.id;
      const member = members.find((m) => m.id === uid);
      if (member) {
        return { id: uid, name: getMemberName(member), phone: getMemberPhone(member), email: getMemberEmail(member) };
      }
      return { id: uid, name: data.name || uid, phone: data.phone || "", email: data.email || "" };
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

  const workshopFromSession = (session) =>
    session.workshopId
      ? {
          id: session.workshopId,
          workshop_title: session.topic,
          workshop_description: session.description,
          workshop_benefit: session.workshopBenefit,
          workshop_eligibility: session.workshopEligibility,
          workshop_fee: session.workshopFee,
          workshop_location: session.workshopLocation,
          workshop_organizer: session.workshopOrganizer,
          workshop_organizer_logo: session.workshopOrganizerLogo,
          workshop_speakers: session.workshopSpeakers,
          workshop_start_date: session.workshopStartDate,
          workshop_end_date: session.workshopEndDate,
          workshop_website: session.workshopWebsite,
          workshop_status: session.workshopStatus,
        }
      : null;

  const openScheduleModal = (session) => {
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
      (session.attendees || []).map((t) => (typeof t === "string" ? { id: t, name: t, phone: "" } : t))
    );
    setSelectedWorkshop(workshopFromSession(session));
    setFormError("");
    setShowScheduleModal(true);
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setEditingSessionId(null);
    setForm(createEmptyForm());
    setSelectedTrainees([]);
    setSelectedWorkshop(null);
    setFormError("");
  };

  const openWorkshopPicker = () => {
    setWorkshopPickerSearch("");
    setShowWorkshopPicker(true);
    void ensureWorkshopsLoaded();
  };

  const closeWorkshopPicker = () => {
    setShowWorkshopPicker(false);
    setWorkshopPickerSearch("");
  };

  const filteredWorkshopsForPicker = useMemo(() => {
    const term = workshopPickerSearch.trim().toLowerCase();
    if (!term) return workshops;
    return workshops.filter((w) => String(w.workshop_title || "").toLowerCase().includes(term));
  }, [workshops, workshopPickerSearch]);

  const handlePickWorkshop = async (workshop) => {
    closeWorkshopPicker();
    setEditingSessionId(null);
    setSelectedWorkshop(workshop);
    setLoadingApplicants(true);
    setFormError("");
    try {
      const applicants = await loadApplicantsForWorkshop(workshop.id);
      const { date, time } = parseWorkshopDateTime(workshop.workshop_start_date);
      setForm({
        topic: workshop.workshop_title || "",
        description: workshop.workshop_description || "",
        trainer: workshop.workshop_speakers || "",
        date,
        time,
        meetingLink: "",
        teamEmails: "",
      });
      setSelectedTrainees(applicants);
      setShowScheduleModal(true);
    } catch (error) {
      console.error("Error loading workshop applicants:", error);
      showToast("Failed to load workshop applicants.", "error");
    } finally {
      setLoadingApplicants(false);
    }
  };

  const handleRefreshApplicants = async () => {
    if (!selectedWorkshop) return;
    setLoadingApplicants(true);
    try {
      const applicants = await loadApplicantsForWorkshop(selectedWorkshop.id);
      setSelectedTrainees(applicants);
      showToast(`Refreshed — ${applicants.length} applicant(s) found.`);
    } catch (error) {
      console.error("Error refreshing applicants:", error);
      showToast("Failed to refresh applicants.", "error");
    } finally {
      setLoadingApplicants(false);
    }
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();

    if (!selectedWorkshop) {
      setFormError("Please pick a workshop first.");
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
        workshopId: selectedWorkshop.id,
        workshopBenefit: selectedWorkshop.workshop_benefit || "",
        workshopEligibility: selectedWorkshop.workshop_eligibility || "",
        workshopFee: selectedWorkshop.workshop_fee ?? "",
        workshopLocation: selectedWorkshop.workshop_location || "",
        workshopOrganizer: selectedWorkshop.workshop_organizer || "",
        workshopOrganizerLogo: selectedWorkshop.workshop_organizer_logo || "",
        workshopSpeakers: selectedWorkshop.workshop_speakers || "",
        workshopStartDate: selectedWorkshop.workshop_start_date || "",
        workshopEndDate: selectedWorkshop.workshop_end_date || "",
        workshopWebsite: selectedWorkshop.workshop_website || "",
        workshopStatus: selectedWorkshop.workshop_status || "",
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
          documents: [],
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

  const buildReminderMessage = (session, trainee) => {
    const dateLabel = formatDateDisplay(session.date);
    const timeLabel = session.time && session.time !== "-" ? session.time : "-";
    return `Dear ${trainee.name},

This is a gentle reminder regarding the upcoming training session scheduled for ${dateLabel}.

We request all registered participants to join the session on time and ensure active participation throughout the training.

Training Topic: ${session.topic}
Date: ${dateLabel}
Time: ${timeLabel} Hrs.
Meeting Link:
${session.meetingLink || "-"}

Your presence and participation will be highly appreciated.

Thank you,
Brisk Olive Team
7060162717`;
  };

  const handleSendReminder = async (session, field) => {
    const trainees = (session.attendees || []).filter((t) => typeof t === "object" && t?.email);

    if (trainees.length === 0) {
      showToast("None of the selected trainees have an email on file. Re-open Schedule and re-select trainees to capture their email.", "error");
      return;
    }

    const isLastReminder = field === "lastReminderSent";

    setTogglingId(`${session.id}-${field}`);
    try {
      await Promise.all(
        trainees.map((trainee) =>
          sendTrainingEmail({
            recipients: [trainee.email],
            subject: `Training Reminder — ${session.topic} (${formatDateDisplay(session.date)})`,
            body: buildReminderMessage(session, trainee),
          })
        )
      );

      const sentAtField = `${field}At`;
      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { [field]: true, [sentAtField]: sentAt });
      setSessions((prev) =>
        prev.map((item) => (item.id === session.id ? { ...item, [field]: true, [sentAtField]: sentAt } : item))
      );
      showToast(`${isLastReminder ? "Final reminder" : "Reminder"} emailed to ${trainees.length} trainee(s).`);
    } catch (error) {
      console.error("Error sending reminder email:", error);
      showToast("Failed to send reminder email.", "error");
    } finally {
      setTogglingId("");
    }
  };

  const opendocumentsModal = (session) => {
    setdocumentsSession(session);
    setMaterialForm(createEmptyMaterialForm());
    setMaterialFormError("");
  };

  const closedocumentsModal = () => {
    setdocumentsSession(null);
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
    opendocumentsModal(session);
  };

  const updateMaterialForm = (field, value) => setMaterialForm((prev) => ({ ...prev, [field]: value }));

  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!documentsSession) return;

    if (!materialForm.link.trim()) {
      setMaterialFormError("Please paste the Drive/share link.");
      return;
    }

    setMaterialFormError("");
    setSavingMaterial(true);
    try {
      const newMaterial = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: materialForm.type,
        type: materialForm.type,
        link: materialForm.link.trim(),
        addedAt: new Date().toISOString(),
      };
      const updateddocuments = [
        ...(documentsSession.documents || []).filter((item) => item.type !== materialForm.type),
        newMaterial,
      ];
      await updateDoc(doc(db, COLLECTION_NAME, documentsSession.id), { documents: updateddocuments });
      setSessions((prev) =>
        prev.map((item) => (item.id === documentsSession.id ? { ...item, documents: updateddocuments } : item))
      );
      setdocumentsSession((prev) => ({ ...prev, documents: updateddocuments }));
      setMaterialForm(createEmptyMaterialForm());
    } catch (error) {
      console.error("Error adding material:", error);
      setMaterialFormError("Failed to save. Please try again.");
    } finally {
      setSavingMaterial(false);
    }
  };

  const handleRemoveMaterial = async (materialId) => {
    if (!documentsSession) return;
    const updateddocuments = (documentsSession.documents || []).filter((item) => item.id !== materialId);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, documentsSession.id), { documents: updateddocuments });
      setSessions((prev) =>
        prev.map((item) => (item.id === documentsSession.id ? { ...item, documents: updateddocuments } : item))
      );
      setdocumentsSession((prev) => ({ ...prev, documents: updateddocuments }));
    } catch (error) {
      console.error("Error removing material:", error);
      showToast("Failed to remove material.", "error");
    }
  };

  const handleSendTeamEmail = async () => {
    if (!documentsSession) return;

    const recipients = getTeamEmailRecipients(documentsSession);
    if (recipients.length === 0) {
      showToast("Add at least one team email in the training's schedule details first.", "error");
      return;
    }

    const documents = documentsSession.documents || [];
    const findLink = (type) => documents.find((m) => m.type === type)?.link;
    const feedbackLink = findLink("Feedback Form");
    const updateLink = findLink("Members Training Update");
    const videoLink = findLink("Training Video");

    const missing = [
      !feedbackLink && "Feedback Form",
      !updateLink && "Members Training Update",
      !videoLink && "Training Video",
    ].filter(Boolean);
    if (missing.length > 0) {
      showToast(`Add the ${missing.join(", ")} link before emailing the team.`, "error");
      return;
    }

    const dateTime = `${formatDateDisplay(documentsSession.date)}${
      documentsSession.time && documentsSession.time !== "-" ? ` at ${documentsSession.time}` : ""
    }`;
    const bodyLines = [
      "Dear All,",
      `I am pleased to inform you that the training session on "${documentsSession.topic}" was successfully conducted on ${dateTime}. The session went well, and participants were actively engaged throughout.`,
      "",
      "A feedback form has been shared with all attendees to gather their insights and suggestions:",
      `Feedback Form Link: ${feedbackLink}`,
      "",
      "Additionally, you can track the training progress and updates here:",
      `Members Training Update Link: ${updateLink}`,
      "",
      `Training Video Link: ${videoLink}`,
      "",
      "We will review the feedback received and incorporate improvements in upcoming sessions.",
      "",
      "Regards,",
      "Training Team",
    ];

    setSendingEmail(true);
    try {
      await sendTrainingEmail({
        recipients,
        subject: `Training Update — ${documentsSession.topic} (${formatDateDisplay(documentsSession.date)})`,
        body: bodyLines.join("\n"),
      });

      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, COLLECTION_NAME, documentsSession.id), { emailSentAt: sentAt });
      setSessions((prev) =>
        prev.map((item) => (item.id === documentsSession.id ? { ...item, emailSentAt: sentAt } : item))
      );
      setdocumentsSession((prev) => ({ ...prev, emailSentAt: sentAt }));
      showToast(`Email sent to ${recipients.length} recipient(s).`);
    } catch (error) {
      console.error("Error sending team email:", error);
      showToast("Failed to send email. Please try again.", "error");
    } finally {
      setSendingEmail(false);
    }
  };


  const alldocuments = useMemo(
    () =>
      sortedSessions.flatMap((session) =>
        (session.documents || []).map((material) => ({
          ...material,
          sessionId: session.id,
          sessionTopic: session.topic,
          sessionDate: session.date,
        }))
      ),
    [sortedSessions]
  );

  const libraryTrainingOptions = useMemo(
    () => ["All", ...Array.from(new Set(alldocuments.map((item) => item.sessionTopic))).sort((a, b) => a.localeCompare(b))],
    [alldocuments]
  );

  const filtereddocuments = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    return alldocuments.filter((item) => {
      if (libraryTypeFilter !== "All" && item.type !== libraryTypeFilter) return false;
      if (libraryTrainingFilter !== "All" && item.sessionTopic !== libraryTrainingFilter) return false;
      if (term && !item.title.toLowerCase().includes(term) && !item.sessionTopic.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [alldocuments, libraryTypeFilter, libraryTrainingFilter, librarySearch]);

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
        .training-documents-btn {
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
        .training-workshop-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 18px;
        }
        .training-workshop-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .training-workshop-logo {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          object-fit: cover;
          flex: 0 0 auto;
        }
        .training-workshop-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        .training-workshop-organizer {
          font-size: 12px;
          color: #64748b;
        }
        .training-workshop-desc {
          font-size: 13px;
          color: #334155;
          margin: 0 0 10px;
        }
        .training-workshop-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px 16px;
          font-size: 12.5px;
          color: #334155;
        }
        .training-workshop-meta strong {
          color: #64748b;
          font-weight: 700;
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
          <p>Schedule weekly training sessions and upload documents.</p>
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
            <button type="button" className="training-btn training-btn-primary" onClick={openWorkshopPicker}>
              <FaPlus size={12} />
              Schedule Workshop
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
          Documents Library
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
                <th>Workshop</th>
                <th>Fee</th>
                <th>Trainees</th>
                <th>Meeting Link</th>
                <th>Documents</th>
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
                    <td style={{ cursor: "pointer" }} onClick={() => openScheduleModal(session)} title="Click to edit">
                      <div style={{ color: "#1976d2", fontWeight: 700 }}>{session.topic}</div>
                      {(session.workshopOrganizer || session.workshopLocation) && (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                          {[session.workshopOrganizer, session.workshopLocation].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td>{session.workshopFee || session.workshopFee === 0 ? `₹${session.workshopFee}` : "-"}</td>
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
                      <button type="button" className="training-documents-btn" onClick={() => opendocumentsModal(session)}>
                        <FaFolderOpen size={11} />
                        {(session.documents || []).length}
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
          placeholder="Search documents or training..."
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
          <div className="card-label">Total documents</div>
          <div className="card-value">{alldocuments.length.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon orange">
            <FaChalkboardTeacher size={24} />
          </div>
          <div className="card-label">Trainings With documents</div>
          <div className="card-value">{(libraryTrainingOptions.length - 1).toLocaleString()}</div>
        </div>
      </div>

      <div className="training-table-card">
        <h3>Documents Library ({filtereddocuments.length})</h3>

        {loading ? (
          <div className="training-empty">Loading documents...</div>
        ) : alldocuments.length === 0 ? (
          <div className="training-empty">No documents added to any training yet.</div>
        ) : filtereddocuments.length === 0 ? (
          <div className="training-empty">No documents match these filters.</div>
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
              {filtereddocuments.map((material) => (
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
                      {(session.documents || []).length === 0 ? (
                        "-"
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {session.documents.map((m) => (
                            <a key={m.id} href={m.link} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>
                              [{m.type}] {m.title}
                            </a>
                          ))}
                        </div>
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
              <h3>{editingSessionId ? "Edit Training Session" : "Schedule Training From Workshop"}</h3>
              <button type="button" className="modal-close-btn" onClick={closeScheduleModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSaveSession}>
              <div className="modal-panel-body">
                {selectedWorkshop && (
                  <div className="training-workshop-card">
                    <div className="training-workshop-card-header">
                      {selectedWorkshop.workshop_organizer_logo && (
                        <img src={selectedWorkshop.workshop_organizer_logo} alt="" className="training-workshop-logo" />
                      )}
                      <div>
                        <div className="training-workshop-title">{selectedWorkshop.workshop_title || "-"}</div>
                        <div className="training-workshop-organizer">{selectedWorkshop.workshop_organizer || "-"}</div>
                      </div>
                      {selectedWorkshop.workshop_status && (
                        <span className="training-status-badge upcoming" style={{ marginLeft: "auto" }}>
                          {selectedWorkshop.workshop_status}
                        </span>
                      )}
                    </div>
                    {selectedWorkshop.workshop_description && (
                      <p className="training-workshop-desc">{selectedWorkshop.workshop_description}</p>
                    )}
                    <div className="training-workshop-meta">
                      <div><strong>Benefit:</strong> {selectedWorkshop.workshop_benefit || "-"}</div>
                      <div><strong>Eligibility:</strong> {selectedWorkshop.workshop_eligibility || "-"}</div>
                      <div><strong>Fee:</strong> {selectedWorkshop.workshop_fee || selectedWorkshop.workshop_fee === 0 ? `₹${selectedWorkshop.workshop_fee}` : "-"}</div>
                      <div><strong>Location:</strong> {selectedWorkshop.workshop_location || "-"}</div>
                      <div><strong>Speakers:</strong> {selectedWorkshop.workshop_speakers || "-"}</div>
                      <div>
                        <strong>Workshop Dates:</strong> {selectedWorkshop.workshop_start_date || "-"}
                        {selectedWorkshop.workshop_end_date ? ` to ${selectedWorkshop.workshop_end_date}` : ""}
                      </div>
                      {selectedWorkshop.workshop_website && (
                        <div>
                          <strong>Website:</strong>{" "}
                          <a href={`https://${String(selectedWorkshop.workshop_website).replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer">
                            {selectedWorkshop.workshop_website}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="training-member-picker">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", margin: 0 }}>
                      Applicants ({selectedTrainees.length})
                    </label>
                    {selectedWorkshop && (
                      <button type="button" className="training-clear-filters-btn" onClick={handleRefreshApplicants} disabled={loadingApplicants} style={{ padding: "6px 10px", fontSize: "12px" }}>
                        {loadingApplicants ? "Refreshing..." : "Refresh Applicants"}
                      </button>
                    )}
                  </div>
                  <div className="training-attendees-list" style={{ marginBottom: 0 }}>
                    {loadingApplicants ? (
                      <div className="training-empty">Loading applicants...</div>
                    ) : selectedTrainees.length === 0 ? (
                      <div className="training-empty">No applicants found for this workshop.</div>
                    ) : (
                      selectedTrainees.map((trainee) => (
                        <div key={trainee.id} className="training-attendee-row">
                          <span>
                            {trainee.name}
                            {trainee.phone ? ` · ${trainee.phone}` : ""}
                          </span>
                          <button
                            type="button"
                            className="training-attendee-remove"
                            onClick={() => setSelectedTrainees((prev) => prev.filter((t) => t.id !== trainee.id))}
                            title="Remove"
                          >
                            <FaTimes size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
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

      {showWorkshopPicker && (
        <div className="modal-overlay" onClick={closeWorkshopPicker}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Select Workshop</h3>
              <button type="button" className="modal-close-btn" onClick={closeWorkshopPicker} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-member-search" style={{ marginBottom: "12px" }}>
                <FaSearch size={13} />
                <input
                  type="text"
                  autoFocus
                  value={workshopPickerSearch}
                  onChange={(e) => setWorkshopPickerSearch(e.target.value)}
                  placeholder="Search workshops by title..."
                />
              </div>
              <div className="training-member-list" style={{ maxHeight: "360px" }}>
                {workshopsLoading ? (
                  <div className="training-empty">Loading workshops...</div>
                ) : filteredWorkshopsForPicker.length === 0 ? (
                  <div className="training-empty">No workshops with applicants found.</div>
                ) : (
                  filteredWorkshopsForPicker.map((workshop) => (
                    <div key={workshop.id} className="training-member-row" onClick={() => handlePickWorkshop(workshop)}>
                      <div>
                        <div className="training-member-name">{workshop.workshop_title}</div>
                        <div className="training-member-phone">
                          {[workshop.workshop_organizer, workshop.workshop_location].filter(Boolean).join(" · ")}
                          {" · "}
                          {workshop.applicantCount} applicant(s)
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
                          {formatDateDisplay(session.date)} · {(session.documents || []).length} doc(s) uploaded
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

      {documentsSession && (
        <div className="modal-overlay" onClick={closedocumentsModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Documents - {documentsSession.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closedocumentsModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-attendees-list">
                {(documentsSession.documents || []).length === 0 ? (
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>No documents added yet.</div>
                ) : (
                  documentsSession.documents.map((material) => (
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
                  {sendingEmail ? "Sending..." : "Email Documents To Team"}
                </button>
                {documentsSession.emailSentAt && (
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", textAlign: "center" }}>
                    Last sent {new Date(documentsSession.emailSentAt).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
