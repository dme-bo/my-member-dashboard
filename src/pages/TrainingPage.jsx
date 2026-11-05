// src/pages/TrainingPage.jsx
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar from "../components/OdooViewToolbar";
import {
  FaPlus,
  FaTimes,
  FaChalkboardTeacher,
  FaLink,
  FaUserFriends,
  FaFolderOpen,
  FaExternalLinkAlt,
  FaEnvelope,
  FaSearch,
  FaWhatsapp,
} from "react-icons/fa";
import { collection, db, addDoc, doc, getDocs, updateDoc, serverTimestamp } from "../firestoreClient";
import { getMemberName, getMemberPhone, getMemberEmail } from "../utils/memberFields";
import SkeletonLoader from "../components/SkeletonLoader";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import FavoritesMenu from "../components/FavoritesMenu";
import SelectionActionMenu from "../components/SelectionActionMenu";
import WorkshopDetailModal from "../components/WorkshopDetailModal";
import { formatDateDDMMMYYYY, formatDateTimeDDMMMYYYY, formatDateText } from "../utils/dateFormat";

const COLLECTION_NAME = "trainingsessions";
const WORKSHOP_COLLECTION_NAME = "workshopsmaster";
const WORKSHOP_APPLICANTS_SUBCOLLECTION = "workshop_users_applied";
// workshopsmaster/{workshopId}/attendance/{userId}: a document per member marked present.
const WORKSHOP_ATTENDANCE_SUBCOLLECTION = "attendance";
const WORKSHOP_FAVORITES_KEY = "workshopsPageFavorites";
const MATERIAL_TYPES = ["Members Training Update", "Training Video"];

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
  return formatDateDDMMMYYYY(dateStr, dateStr);
};

// Trainees are stored as {id, name, phone}; older sessions may still have plain name strings.
const getTraineeName = (trainee) => (typeof trainee === "string" ? trainee : trainee?.name || "Unknown");

export default function TrainingPage({ memberRecords = [], membersLoading = false }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [reminderModal, setReminderModal] = useState(null); // { session, field }
  const [sendingTraineeKey, setSendingTraineeKey] = useState("");
  const [individualSentIds, setIndividualSentIds] = useState([]);
  const [messageDrafts, setMessageDrafts] = useState({ first: "", final: "" });
  const [savingMessage, setSavingMessage] = useState(""); // "first" | "final" | ""
  const [memberSearch, setMemberSearch] = useState("");
  const [detailSessionId, setDetailSessionId] = useState(null); // workshop detail modal
  const [detailApplicants, setDetailApplicants] = useState([]); // registered for the open workshop
  const [detailPresentIds, setDetailPresentIds] = useState([]); // marked present in the attendance collection
  const [addTraineesModal, setAddTraineesModal] = useState(null); // { session, trainees }
  const [addTraineesSearch, setAddTraineesSearch] = useState("");
  const [savingTrainees, setSavingTrainees] = useState(false);

  // Members list (used to resolve workshop applicant ids to names/phones/emails).
  // Sourced from the ~12k-doc "users" collection App.jsx already loads once at
  // the app shell level — refs keep ensureMembersLoaded's poll below reading
  // the latest prop values without re-creating that closure on every render.
  const allMembers = memberRecords;
  const memberRecordsRef = useRef(memberRecords);
  const membersLoadingRef = useRef(membersLoading);
  useEffect(() => {
    memberRecordsRef.current = memberRecords;
    membersLoadingRef.current = membersLoading;
  }, [memberRecords, membersLoading]);
  const [selectedTrainees, setSelectedTrainees] = useState([]); // [{id, name, phone}] — sourced from workshop applicants
  const [priorConfirmedIds, setPriorConfirmedIds] = useState([]); // trainee ids already sent a WhatsApp confirmation for this session

  // Workshops (trainings are now created by picking an already-applied-to workshop)
  const [workshops, setWorkshops] = useState([]);
  const [workshopsLoading, setWorkshopsLoading] = useState(false);
  const [workshopsLoaded, setWorkshopsLoaded] = useState(false);
  const [showWorkshopPicker, setShowWorkshopPicker] = useState(false);
  const [workshopPickerSearch, setWorkshopPickerSearch] = useState("");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [loadingApplicants, setLoadingApplicants] = useState(false);

  const [statusFilters, setStatusFilters] = useState([]);
  const [topicSearch, setTopicSearch] = useState("");
  const [sessionsGroupBy, setSessionsGroupBy] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [favorites, setFavorites] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKSHOP_FAVORITES_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

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

  const ensureMembersLoaded = () => {
    if (!membersLoadingRef.current) return Promise.resolve(memberRecordsRef.current);
    return new Promise((resolve) => {
      const check = () => {
        if (!membersLoadingRef.current) resolve(memberRecordsRef.current);
        else setTimeout(check, 200);
      };
      check();
    });
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
          const applicantIds = applicantsSnap.docs.map((applicantDoc) => {
            const data = applicantDoc.data() || {};
            return data.user_id || data.uid || data.userId || applicantDoc.id;
          });
          return { id: docSnap.id, ...docSnap.data(), applicantCount: applicantsSnap.size, applicantIds };
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

  useEffect(() => {
    void ensureWorkshopsLoaded();
  }, []);

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

  // One list of workshops: every scheduled session, plus workshops with applicants
  // that have not been scheduled yet (shown as a row with a Schedule button).
  const entries = useMemo(() => {
    const scheduledIds = new Set(sessions.map((session) => session.workshopId).filter(Boolean));
    const pending = workshops
      .filter((workshop) => !scheduledIds.has(workshop.id))
      .map((workshop) => {
        const { date, time } = parseWorkshopDateTime(workshop.workshop_start_date);
        return {
          id: `workshop-${workshop.id}`,
          __workshop: workshop,
          date,
          time,
          topic: workshop.workshop_title || '',
          trainer: '',
          workshopOrganizer: workshop.workshop_organizer || '',
          workshopLocation: workshop.workshop_location || '',
          workshopFee: workshop.workshop_fee,
        };
      });
    return [...sortedSessions, ...pending].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }, [sessions, sortedSessions, workshops]);

  // A workshop scheduled from now on is Completed only when someone marks it so (in
  // its detail modal) — passing its date does not move it. Sessions saved before that
  // existed have no `completed` field at all, so they follow their date until someone
  // marks or reopens them. Applicant-only workshops (never scheduled) follow their date.
  // A session's attendee list is a snapshot from when it was scheduled, so it
  // misses people who registered afterwards. The exact count is everyone who has
  // registered for the workshop plus anyone added manually.
  const getTraineeCount = (session) => {
    const ids = new Set(
      (session.attendees || []).map((t) => (typeof t === "string" ? t : t?.id)).filter(Boolean)
    );
    const workshop = workshops.find((item) => item.id === session.workshopId);
    const removed = new Set(session.removedTraineeIds || []);
    (workshop?.applicantIds || []).forEach((id) => { if (!removed.has(id)) ids.add(id); });
    return ids.size;
  };

  const getSessionStatus = (session) => {
    if (typeof session.completed === "boolean") return session.completed ? "Completed" : "Upcoming";
    // Only a workshop with a date today or later is Upcoming; no date (or a past
    // date) means Completed.
    return session.date && session.date >= todayStr() ? "Upcoming" : "Completed";
  };

  const filteredSessions = useMemo(() => {
    const term = topicSearch.trim().toLowerCase();
    return entries.filter((session) => {
      if (statusFilters.length && !statusFilters.includes(getSessionStatus(session))) return false;
      if (term && !String(session.topic || "").toLowerCase().includes(term)) return false;
      return true;
    });
  }, [entries, statusFilters, topicSearch]);

  const hasActiveFilters = statusFilters.length > 0 || topicSearch.trim() !== "";
  const clearFilters = () => {
    setStatusFilters([]);
    setTopicSearch("");
    setSessionsGroupBy(null);
    setCurrentPage(1);
  };
  const toggleStatusFilter = (value) => {
    setStatusFilters((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const SESSIONS_GROUP_BY_OPTIONS = [
    { key: "status", label: "Status" },
    { key: "trainer", label: "Trainer" },
    { key: "organizer", label: "Organizer" },
  ];

  const groupSessions = (list) => {
    if (!sessionsGroupBy) return null;
    const getLabel = (session) => {
      if (sessionsGroupBy === "status") return getSessionStatus(session);
      if (sessionsGroupBy === "trainer") return session.trainer && session.trainer.trim() ? session.trainer.trim() : "Unspecified";
      if (sessionsGroupBy === "organizer") return session.workshopOrganizer && session.workshopOrganizer.trim() ? session.workshopOrganizer.trim() : "Unspecified";
      return "Unspecified";
    };
    const groups = new Map();
    for (const session of list) {
      const label = getLabel(session);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(session);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Upcoming first (soonest at the top), then completed (most recent at the top).
  const upcomingSessions = useMemo(
    () => filteredSessions.filter((session) => getSessionStatus(session) === "Upcoming"),
    [filteredSessions]
  );
  const completedSessions = useMemo(
    () => filteredSessions.filter((session) => getSessionStatus(session) === "Completed").reverse(),
    [filteredSessions]
  );

  const orderedSessions = sessionsGroupBy
    ? groupSessions(filteredSessions).flatMap(([, items]) => items)
    : [...upcomingSessions, ...completedSessions];
  const totalItems = orderedSessions.length;
  const pageSize = rowsPerPage === Infinity ? Math.max(totalItems, 1) : rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageRows = orderedSessions.slice((activePage - 1) * pageSize, activePage * pageSize);
  const rangeStart = totalItems ? (activePage - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(activePage * pageSize, totalItems);

  const sections = sessionsGroupBy
    ? groupSessions(pageRows).map(([label, items]) => ({ key: label, label, items, total: items.length, empty: "" }))
    : [
        { key: "Upcoming Workshops", label: "Upcoming Workshops", items: pageRows.filter((s) => getSessionStatus(s) === "Upcoming"), total: upcomingSessions.length, empty: "No upcoming workshops." },
        { key: "Completed Workshops", label: "Completed Workshops", items: pageRows.filter((s) => getSessionStatus(s) === "Completed"), total: completedSessions.length, empty: "No completed workshops yet." },
      ].filter((section) => !statusFilters.length || section.total > 0);

  const allRowsSelected = pageRows.length > 0 && pageRows.every((s) => selectedIds.has(s.id));
  const someRowsSelected = !allRowsSelected && pageRows.some((s) => selectedIds.has(s.id));
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageRows.forEach((s) => (allRowsSelected ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroupCollapsed = (key) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleExportSelected = () => {
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = orderedSessions
      .filter((s) => selectedIds.has(s.id))
      .map((s) => [
        s.date || "", s.time || "", s.topic || "", s.workshopOrganizer || "", s.workshopLocation || "",
        s.workshopFee ?? "", s.__workshop ? s.__workshop.applicantCount : getTraineeCount(s), s.meetingLink || "", getSessionStatus(s),
      ]);
    const header = ["Date", "Time", "Workshop", "Organizer", "Location", "Fee", "Trainees", "Meeting Link", "Status"];
    const csv = [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "workshops.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(WORKSHOP_FAVORITES_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  };
  const saveCurrentAsFavorite = (name) =>
    persistFavorites([...favorites, { id: Date.now().toString(36), name, topicSearch, statusFilters, groupBy: sessionsGroupBy }]);
  const applyFavorite = (fav) => {
    setTopicSearch(fav.topicSearch || "");
    setStatusFilters(fav.statusFilters || []);
    setSessionsGroupBy(fav.groupBy || null);
    setCurrentPage(1);
  };
  const deleteFavorite = (id) => persistFavorites(favorites.filter((f) => f.id !== id));

  const uploadPickerSessions = useMemo(() => {
    const term = uploadPickerSearch.trim().toLowerCase();
    const desc = [...sortedSessions].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    if (!term) return desc;
    return desc.filter((session) => String(session.topic || "").toLowerCase().includes(term));
  }, [sortedSessions, uploadPickerSearch]);

  const counts = useMemo(() => {
    const upcoming = entries.filter((session) => getSessionStatus(session) === "Upcoming").length;
    const totalAttendance = sessions.reduce((sum, session) => sum + (session.attendees?.length || 0), 0);
    return {
      total: entries.length,
      upcoming,
      completed: entries.length - upcoming,
      totalAttendance,
    };
  }, [sessions, entries]);

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

  // Saves fields on a session doc and mirrors them into local state.
  const patchSession = async (sessionId, fields) => {
    try {
      await updateDoc(doc(db, COLLECTION_NAME, sessionId), fields);
      setSessions((prev) => prev.map((item) => (item.id === sessionId ? { ...item, ...fields } : item)));
    } catch (error) {
      console.error("Error saving workshop changes:", error);
      showToast("Failed to save. Please try again.", "error");
    }
  };

  useEffect(() => {
    const session = sessions.find((item) => item.id === detailSessionId);
    if (!session?.workshopId) {
      setDetailApplicants([]);
      setDetailPresentIds([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const applicants = await loadApplicantsForWorkshop(session.workshopId);
        const attendanceSnap = await getDocs(
          collection(db, WORKSHOP_COLLECTION_NAME, session.workshopId, WORKSHOP_ATTENDANCE_SUBCOLLECTION)
        );
        const presentIds = attendanceSnap.docs.map((attendanceDoc) => {
          const data = attendanceDoc.data() || {};
          return data.user_id || data.uid || data.userId || attendanceDoc.id;
        });
        // Someone marked present who never registered still belongs in the list.
        const known = new Set(applicants.map((person) => person.id));
        const members = await ensureMembersLoaded();
        const walkIns = presentIds
          .filter((id) => !known.has(id))
          .map((id) => {
            const member = members.find((m) => m.id === id);
            return member
              ? { id, name: getMemberName(member), phone: getMemberPhone(member), email: getMemberEmail(member) }
              : { id, name: id, phone: "", email: "" };
          });
        if (cancelled) return;
        setDetailApplicants([...applicants, ...walkIns]);
        setDetailPresentIds(presentIds);
      } catch (error) {
        console.error("Error loading registered trainees / attendance:", error);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailSessionId]);

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
    setPriorConfirmedIds(session.whatsappConfirmedIds || []);
    setSelectedWorkshop(workshopFromSession(session));
    setFormError("");
    setMemberSearch("");
    setShowScheduleModal(true);
    void ensureMembersLoaded();
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setEditingSessionId(null);
    setForm(createEmptyForm());
    setSelectedTrainees([]);
    setPriorConfirmedIds([]);
    setSelectedWorkshop(null);
    setFormError("");
    setMemberSearch("");
  };

  const memberSearchResults = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return [];
    const selectedIds = new Set(selectedTrainees.map((t) => t.id));
    return allMembers
      .filter((m) => !selectedIds.has(m.id))
      .filter((m) => {
        const name = getMemberName(m).toLowerCase();
        const phone = getMemberPhone(m).toLowerCase();
        return name.includes(term) || phone.includes(term);
      })
      .slice(0, 8);
  }, [memberSearch, allMembers, selectedTrainees]);

  const handleAddMemberToTraining = (member) => {
    setSelectedTrainees((prev) => [
      ...prev,
      { id: member.id, name: getMemberName(member), phone: getMemberPhone(member), email: getMemberEmail(member) },
    ]);
    setMemberSearch("");
  };

  const openAddTraineesModal = (session) => {
    setAddTraineesModal({
      session,
      trainees: (session.attendees || []).map((t) => (typeof t === "string" ? { id: t, name: t, phone: "" } : t)),
    });
    setAddTraineesSearch("");
    void ensureMembersLoaded();
  };

  const closeAddTraineesModal = () => {
    setAddTraineesModal(null);
    setAddTraineesSearch("");
  };

  const addTraineesSearchResults = useMemo(() => {
    if (!addTraineesModal) return [];
    const term = addTraineesSearch.trim().toLowerCase();
    if (!term) return [];
    const selectedIds = new Set(addTraineesModal.trainees.map((t) => t.id));
    return allMembers
      .filter((m) => !selectedIds.has(m.id))
      .filter((m) => {
        const name = getMemberName(m).toLowerCase();
        const phone = getMemberPhone(m).toLowerCase();
        return name.includes(term) || phone.includes(term);
      })
      .slice(0, 8);
  }, [addTraineesModal, addTraineesSearch, allMembers]);

  const handleAddTraineeToModal = (member) => {
    setAddTraineesModal((prev) =>
      prev
        ? {
            ...prev,
            trainees: [
              ...prev.trainees,
              { id: member.id, name: getMemberName(member), phone: getMemberPhone(member), email: getMemberEmail(member) },
            ],
          }
        : prev
    );
    setAddTraineesSearch("");
  };

  const handleRemoveTraineeFromModal = (traineeId) => {
    setAddTraineesModal((prev) => (prev ? { ...prev, trainees: prev.trainees.filter((t) => t.id !== traineeId) } : prev));
  };

  const handleSaveAddedTrainees = async () => {
    if (!addTraineesModal) return;
    const { session, trainees } = addTraineesModal;

    setSavingTrainees(true);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { attendees: trainees });
      setSessions((prev) => prev.map((item) => (item.id === session.id ? { ...item, attendees: trainees } : item)));
      showToast("Trainees saved.");
      closeAddTraineesModal();
    } catch (error) {
      console.error("Error saving trainees:", error);
      showToast("Failed to save trainees.", "error");
    } finally {
      setSavingTrainees(false);
    }
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
      setPriorConfirmedIds([]);
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

      let sessionId;
      let baseToastMessage;
      if (editingSessionId) {
        await updateDoc(doc(db, COLLECTION_NAME, editingSessionId), payload);
        setSessions((prev) => prev.map((item) => (item.id === editingSessionId ? { ...item, ...payload } : item)));
        sessionId = editingSessionId;
        baseToastMessage = "Training session updated successfully!";
      } else {
        const newSession = {
          ...payload,
          whatsappReminderSent: false,
          whatsappLastReminderSent: false,
          whatsappConfirmedIds: [],
          completed: false,
          documents: [],
          emailSentAt: null,
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, COLLECTION_NAME), newSession);
        setSessions((prev) => [...prev, { id: docRef.id, ...newSession }]);
        sessionId = docRef.id;
        baseToastMessage = "Training session scheduled successfully!";
      }

      // Auto-send the WhatsApp registration confirmation to anyone in the attendee
      // list who hasn't received one yet (everyone, on first save; only the newly
      // added registrants on later re-saves after refreshing applicants).
      const priorSet = new Set(priorConfirmedIds);
      const newlyAdded = selectedTrainees.filter((t) => t?.phone && !priorSet.has(t.id));

      if (newlyAdded.length > 0) {
        const message = buildWhatsAppConfirmationMessage(payload);
        const results = await Promise.allSettled(
          newlyAdded.map((trainee) => sendWhatsAppMessage({ to: trainee.phone, message }))
        );
        const succeededIds = newlyAdded.filter((_, i) => results[i].status === "fulfilled").map((t) => t.id);
        const failedCount = newlyAdded.length - succeededIds.length;

        if (succeededIds.length > 0) {
          const nextConfirmedIds = Array.from(new Set([...priorConfirmedIds, ...succeededIds]));
          await updateDoc(doc(db, COLLECTION_NAME, sessionId), { whatsappConfirmedIds: nextConfirmedIds });
          setSessions((prev) =>
            prev.map((item) => (item.id === sessionId ? { ...item, whatsappConfirmedIds: nextConfirmedIds } : item))
          );
        }

        showToast(
          failedCount > 0
            ? `${baseToastMessage} WhatsApp confirmation sent to ${succeededIds.length} trainee(s); ${failedCount} failed.`
            : `${baseToastMessage} WhatsApp confirmation sent to ${succeededIds.length} trainee(s).`,
          failedCount > 0 ? "error" : "success"
        );
      } else {
        showToast(baseToastMessage);
      }

      closeScheduleModal();
    } catch (error) {
      console.error("Error saving training session:", error);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
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

  const formatTimeDisplay = (timeStr) => {
    const match = String(timeStr || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return timeStr;
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${suffix}`;
  };

  const sendWhatsAppMessage = async ({ to, message }) => {
    const response = await fetch("/api/send-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Failed to send WhatsApp message.");
    }
  };

  const buildWhatsAppConfirmationMessage = (session) => {
    const dateObj = session.date ? new Date(`${session.date}T00:00:00`) : null;
    const dateLabel =
      dateObj && !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
        : formatDateDisplay(session.date);
    const timeLabel = session.time && session.time !== "-" ? formatTimeDisplay(session.time) : "-";

    return `Thank you for registering!
Your registration for the training session "${session.topic}" has been successfully received.

Session Details:
📅 Date: ${dateLabel}
🕓 Time: ${timeLabel} (Asia/Kolkata)

Join the session using Google Meet:
🔗 ${session.meetingLink || "-"}

We look forward to your participation. See you at the session!`;
  };

  const buildWhatsAppReminderMessage = (session) => {
    const dateObj = session.date ? new Date(`${session.date}T00:00:00`) : null;
    const dateLabel =
      dateObj && !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
        : formatDateDisplay(session.date);
    const timeLabel = session.time && session.time !== "-" ? formatTimeDisplay(session.time) : "-";

    return `Reminder: your registered training session "${session.topic}" is coming up.

Session Details:
📅 Date: ${dateLabel}
🕓 Time: ${timeLabel} (Asia/Kolkata)

Join the session using Google Meet:
🔗 ${session.meetingLink || "-"}

We look forward to your participation. See you at the session!`;
  };

  const buildWhatsAppFinalReminderMessage = (session) => {
    const dateObj = session.date ? new Date(`${session.date}T00:00:00`) : null;
    const dateLabel =
      dateObj && !Number.isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
        : formatDateDisplay(session.date);
    const timeLabel = session.time && session.time !== "-" ? formatTimeDisplay(session.time) : "-";

    return `Final Reminder: your registered training session "${session.topic}" is starting very soon.

Session Details:
📅 Date: ${dateLabel}
🕓 Time: ${timeLabel} (Asia/Kolkata)

Join the session using Google Meet:
🔗 ${session.meetingLink || "-"}

Please don't miss it — we look forward to your participation!`;
  };

  const handleSendWhatsAppReminder = async (session, field, message) => {
    const trainees = (session.attendees || []).filter((t) => typeof t === "object" && t?.phone);

    if (trainees.length === 0) {
      showToast("None of the registered trainees have a phone number on file.", "error");
      return;
    }

    const isLastReminder = field === "whatsappLastReminderSent";

    setTogglingId(`${session.id}-${field}`);
    try {
      const results = await Promise.allSettled(
        trainees.map((trainee) => sendWhatsAppMessage({ to: trainee.phone, message }))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = trainees.length - succeeded;

      const sentAtField = `${field}At`;
      const sentAt = new Date().toISOString();
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { [field]: true, [sentAtField]: sentAt });
      setSessions((prev) =>
        prev.map((item) => (item.id === session.id ? { ...item, [field]: true, [sentAtField]: sentAt } : item))
      );

      showToast(
        failed > 0
          ? `${isLastReminder ? "Final reminder" : "Reminder"} sent to ${succeeded} trainee(s) on WhatsApp; ${failed} failed.`
          : `${isLastReminder ? "Final WhatsApp reminder" : "WhatsApp reminder"} sent to ${succeeded} trainee(s).`,
        failed > 0 ? "error" : "success"
      );
    } catch (error) {
      console.error("Error sending WhatsApp reminder:", error);
      showToast("Failed to send WhatsApp reminder.", "error");
    } finally {
      setTogglingId("");
    }
  };

  const openReminderModal = (session, field) => {
    setReminderModal({ session, field });
    setIndividualSentIds([]);
    setMessageDrafts({
      first: (session.customReminderMessage || "").trim() || buildWhatsAppReminderMessage(session),
      final: (session.customFinalReminderMessage || "").trim() || buildWhatsAppFinalReminderMessage(session),
    });
  };

  const closeReminderModal = () => {
    setReminderModal(null);
    setIndividualSentIds([]);
    setMessageDrafts({ first: "", final: "" });
  };

  const handleSaveMessageDraft = async (type) => {
    if (!reminderModal) return;
    const session = reminderModal.session;
    const field = type === "final" ? "customFinalReminderMessage" : "customReminderMessage";
    const value = messageDrafts[type];

    setSavingMessage(type);
    try {
      await updateDoc(doc(db, COLLECTION_NAME, session.id), { [field]: value });
      setSessions((prev) => prev.map((item) => (item.id === session.id ? { ...item, [field]: value } : item)));
      setReminderModal((prev) => (prev ? { ...prev, session: { ...prev.session, [field]: value } } : prev));
      showToast(`${type === "final" ? "Final" : "First"} reminder message saved.`);
    } catch (error) {
      console.error("Error saving reminder message:", error);
      showToast("Failed to save message.", "error");
    } finally {
      setSavingMessage("");
    }
  };

  const handleSendSingleReminder = async (session, field, trainee, message) => {
    if (!trainee?.phone) {
      showToast(`${getTraineeName(trainee)} does not have a phone number on file.`, "error");
      return;
    }

    const isLastReminder = field === "whatsappLastReminderSent";
    const key = `${session.id}-${field}-${trainee.id}`;

    setSendingTraineeKey(key);
    try {
      await sendWhatsAppMessage({ to: trainee.phone, message });
      setIndividualSentIds((prev) => [...prev, trainee.id]);
      showToast(`${isLastReminder ? "Final reminder" : "Reminder"} sent to ${getTraineeName(trainee)}.`, "success");
    } catch (error) {
      console.error("Error sending individual WhatsApp reminder:", error);
      showToast(`Failed to send reminder to ${getTraineeName(trainee)}.`, "error");
    } finally {
      setSendingTraineeKey("");
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
    const updateLink = findLink("Members Training Update");
    const videoLink = findLink("Training Video");

    const missing = [
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
      "Additionally, you can track the training progress and updates here:",
      `Members Training Update Link: ${updateLink}`,
      "",
      `Training Video Link: ${videoLink}`,
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

  const selectCell = (session) => (
    <td style={{ width: 36 }}>
      <input
        type="checkbox"
        className="ws-cb"
        aria-label={`Select ${session.topic || "workshop"}`}
        checked={selectedIds.has(session.id)}
        onChange={() => toggleSelect(session.id)}
      />
    </td>
  );

  const renderSessionCard = (session) => {
    const status = getSessionStatus(session);
    const trainees = session.__workshop ? session.__workshop.applicantCount : getTraineeCount(session);
    const open = () => (session.__workshop ? handlePickWorkshop(session.__workshop) : setDetailSessionId(session.id));
    return (
      <div key={session.id} className="ws-card" onClick={open}>
        <div className="ws-card-top">
          <span className="ws-card-title">{session.topic || "-"}</span>
          <span className={`training-status-badge ${status.toLowerCase()}`}>{status}</span>
        </div>
        <div className="ws-card-meta">{session.date ? formatDateDisplay(session.date) : "No date"}{session.time ? ` · ${session.time}` : ""}</div>
        {(session.workshopOrganizer || session.workshopLocation) && (
          <div className="ws-card-meta">{[session.workshopOrganizer, session.workshopLocation].filter(Boolean).join(" · ")}</div>
        )}
        <div className="ws-card-foot">
          <span><FaUserFriends size={11} /> {trainees} trainees</span>
          <span>{session.workshopFee || session.workshopFee === 0 ? `₹${session.workshopFee}` : "Free / -"}</span>
        </div>
      </div>
    );
  };

  const renderSessionRow = (session) => {
    const status = getSessionStatus(session);
    if (session.__workshop) {
      const workshop = session.__workshop;
      return (
        <tr key={session.id}>
          {selectCell(session)}
          <td>{session.date ? formatDateDisplay(session.date) : "-"}</td>
          <td>{session.time || "-"}</td>
          <td style={{ cursor: "pointer" }} onClick={() => handlePickWorkshop(workshop)} title="Open to schedule this workshop">
            <div style={{ color: "#5f6f14", fontWeight: 700 }}>{session.topic || "-"}</div>
            {(session.workshopOrganizer || session.workshopLocation) && (
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                {[session.workshopOrganizer, session.workshopLocation].filter(Boolean).join(" · ")}
              </div>
            )}
          </td>
          <td>{session.workshopFee || session.workshopFee === 0 ? `₹${session.workshopFee}` : "-"}</td>
          <td>
            <span className="training-attendees-btn" title="Applicants">
              <FaUserFriends size={11} />
              {workshop.applicantCount}
            </span>
          </td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td>
            <span className={`training-status-badge ${status.toLowerCase()}`}>{status}</span>
          </td>
        </tr>
      );
    }
    return (
      <tr key={session.id}>
        {selectCell(session)}
        <td>{formatDateDisplay(session.date)}</td>
        <td>{session.time || "-"}</td>
        <td style={{ cursor: "pointer" }} onClick={() => setDetailSessionId(session.id)} title="Open workshop">
          <div style={{ color: "#5f6f14", fontWeight: 700 }}>{session.topic}</div>
          {(session.workshopOrganizer || session.workshopLocation) && (
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {[session.workshopOrganizer, session.workshopLocation].filter(Boolean).join(" · ")}
            </div>
          )}
        </td>
        <td>{session.workshopFee || session.workshopFee === 0 ? `₹${session.workshopFee}` : "-"}</td>
        <td>
          <button type="button" className="training-attendees-btn" onClick={() => setDetailSessionId(session.id)}>
            <FaUserFriends size={11} />
            {getTraineeCount(session)}
          </button>
          <button
            type="button"
            className="training-add-trainees-btn"
            onClick={() => openAddTraineesModal(session)}
            title="Search and add members from Users to this training"
          >
            <FaPlus size={9} />
            Add
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
            className={`training-reminder-btn ${session.whatsappReminderSent ? "sent" : "pending"}`}
            onClick={() => openReminderModal(session, "whatsappReminderSent")}
            title={session.whatsappReminderSentAt ? `Last sent ${formatDateTimeDDMMMYYYY(session.whatsappReminderSentAt)} — click to review recipients` : "Click to review registered trainees and send a reminder"}
          >
            <FaWhatsapp size={11} />
            WhatsApp Reminder
          </button>
          <button
            type="button"
            className={`training-reminder-btn ${session.whatsappLastReminderSent ? "sent" : "pending"}`}
            onClick={() => openReminderModal(session, "whatsappLastReminderSent")}
            title={session.whatsappLastReminderSentAt ? `Last sent ${formatDateTimeDDMMMYYYY(session.whatsappLastReminderSentAt)} — click to review recipients` : "Click to review registered trainees and send a final reminder"}
          >
            <FaWhatsapp size={11} />
            WhatsApp Last Reminder
          </button>
        </td>
        <td>
          <span className={`training-status-badge ${status.toLowerCase()}`}>{status}</span>
        </td>
      </tr>
    );
  };

  return (
    <div className="member-list-page ws-page page-fill">
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
          background: #c2d45e;
          color: #243014;
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
        .card-icon.blue { background: #c2d45e; color: #243014; }
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
          background: #c2d45e;
          color: #243014;
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
          background: #e6eeb0;
          color: #4a5a12;
        }
        .training-status-badge.completed {
          background: #dcfce7;
          color: #16a34a;
        }
        .training-meeting-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #5f6f14;
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
        .training-reminder-btn-sm {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          border-radius: 999px;
          border: none;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .training-reminder-btn-sm:disabled {
          cursor: not-allowed;
          opacity: 0.6;
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
          background: linear-gradient(135deg, #0f766e, #c2d45e);
          color: #243014;
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
        .training-add-member {
          position: relative;
          margin-top: 10px;
        }
        .training-add-member-input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        .training-add-member-input:focus {
          border-color: #c2d45e;
        }
        .training-add-member-results {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.14);
          z-index: 20;
          max-height: 200px;
          overflow-y: auto;
        }
        .training-add-member-result {
          display: block;
          width: 100%;
          text-align: left;
          padding: 9px 12px;
          border: none;
          background: transparent;
          font-size: 13px;
          color: #0f172a;
          cursor: pointer;
        }
        .training-add-member-result:hover {
          background: #f1f5f9;
        }
        .training-add-member-empty {
          padding: 10px 12px;
          color: #94a3b8;
          font-style: italic;
          font-size: 12.5px;
        }
        .training-message-preview-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 16px;
        }
        .training-message-preview {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          padding: 10px 12px;
        }
        .training-message-preview.active {
          border-color: #c2d45e;
          background: #f1f6d6;
        }
        .training-message-preview-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 6px;
        }
        .training-message-preview.active .training-message-preview-label {
          color: #5f6f14;
        }
        .training-message-preview pre {
          margin: 0;
          font-family: inherit;
          font-size: 12.5px;
          color: #0f172a;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .training-message-preview-textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 12.5px;
          color: #0f172a;
          resize: vertical;
          outline: none;
        }
        .training-message-preview-textarea:focus {
          border-color: #c2d45e;
        }
        .training-message-save-btn {
          margin-top: 8px;
          padding: 6px 14px;
          border-radius: 8px;
          border: none;
          background: #c2d45e;
          color: #243014;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .training-message-save-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .training-add-trainees-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: 6px;
          padding: 5px 9px;
          border-radius: 999px;
          border: none;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
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
          color: #5f6f14;
          border-bottom-color: #c2d45e;
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
          color: #5f6f14;
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
          background: #f1f6d6;
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
          background: #f1f6d6;
          color: #4a5a12;
          font-size: 12px;
          font-weight: 600;
        }
        .training-chip button {
          border: none;
          background: none;
          color: #4a5a12;
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
        .ws-page { padding: 0 !important; background: #fff; color: #212529; min-height: calc(100vh - 64px); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        .ws-header { background: #fff; padding: 20px 32px 16px; display: flex; flex-direction: column; gap: 12px; }
        .ws-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
        .ws-title-row { justify-content: space-between; }
        .ws-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .ws-kpis { display: flex; flex-wrap: wrap; gap: 6px; }
        .ws-kpi { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 12px 0 10px; border-radius: 14px; border: 1px solid transparent; font: inherit; font-size: 13px; font-weight: 500; white-space: nowrap; }
        .ws-kpi::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
        .ws-kpi b { font-weight: 700; font-size: 15px; font-variant-numeric: tabular-nums; }
        button.ws-kpi { cursor: pointer; transition: box-shadow .15s; }
        button.ws-kpi:hover { box-shadow: 0 1px 4px rgba(0,0,0,.14); }
        button.ws-kpi[aria-pressed="true"] { box-shadow: inset 0 0 0 2px currentColor; font-weight: 600; }
        .ws-kpi.green { background: #e8f1d4; border-color: #d3e2a8; color: #3f5a14; }
        .ws-kpi.amber { background: #fdf3e1; border-color: #f3dcae; color: #8a5300; }
        .ws-kpi.blue { background: #e8f1fb; border-color: #c9dcf3; color: #0d5aa7; }
        .ws-outline-btn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; border-radius: 6px; font: inherit; font-size: 13px; color: #334155; cursor: pointer; white-space: nowrap; }
        .ws-outline-btn:hover { background: #f6f8fa; }
        .ws-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .ws-toolbar-group > div:first-child { gap: 0 !important; }
        .ws-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .ws-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .ws-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .ws-meta-row { justify-content: space-between; gap: 10px; }
        .ws-meta-left, .ws-meta-right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .ws-meta-right { flex-wrap: nowrap; gap: 6px; }
        .ws-select { height: 30px; padding: 0 6px; border: 1px solid #dde1e7; border-radius: 6px; font: inherit; font-size: 12px; background: #fff; color: #334155; cursor: pointer; }
        .ws-range { margin: 0 2px; font-size: 13px; color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .ws-joined { display: flex; gap: 6px; }
        .ws-joined:has(.is-active) { gap: 0; background: #dde1e7; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; margin-left: 2px; }
        .ws-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #dde1e7; background: #fff; color: #475569; cursor: pointer; padding: 0; border-radius: 6px; }
        .ws-icon-btn:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }
        .ws-joined:has(.is-active) .ws-icon-btn { width: 36px; height: 34px; border: none; border-radius: 0; color: #64748b; }
        .ws-icon-btn.is-active { background: #f1f6d6; color: #5f6f14; }
        .ws-table-wrap { background: #fff; }
        .ws-table-scroll { overflow: auto; max-height: 70vh; min-height: 200px; border-top: 1px solid #dde1e7; }
        .ws-table { width: 100%; min-width: 980px; border-collapse: collapse; margin: 0; }
        .ws-table th { height: 45px; padding: 0 10px; text-align: left; font-size: 13px; font-weight: 600; color: #243014; background: #c2d45e; border-bottom: none; white-space: nowrap; position: sticky; top: 0; z-index: 2; }
        .ws-table td { min-height: 49px; padding: 8px 10px; border-top: none; border-bottom: 1px solid #dde1e7; font-size: 13px; color: #64748b; vertical-align: middle; }
        .ws-table tbody tr:nth-child(even) td { background: #fff; }
        .ws-table tbody tr:nth-child(odd) td { background: #f8fafc; }
        .ws-table tbody tr.ws-group-row td { height: 40px; padding: 0 12px; background: #f1f5f9; color: #334155; font-size: 13px; font-weight: 600; cursor: pointer; }
        .ws-table td.ws-empty { text-align: center; padding: 14px; color: #94a3b8; font-style: italic; font-size: 12px; background: #fff; }
        .ws-count { color: #64748b; font-weight: 500; }
        .ws-cb { width: 13px; height: 13px; margin: 0; accent-color: #c2d45e; cursor: pointer; vertical-align: middle; }
        .ws-table th .ws-cb { width: 14px; height: 14px; accent-color: #000000; }
        .ws-kanban-group { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f1f5f9; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; color: #334155; }
        .ws-empty { text-align: center; padding: 14px; color: #94a3b8; font-style: italic; font-size: 12px; }
        .ws-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-top: 10px; }
        .ws-card { background: #fff; border: 1px solid #dde1e7; border-radius: 8px; padding: 12px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
        .ws-card:hover { border-color: #c2d45e; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .ws-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .ws-card-title { font-weight: 700; color: #5f6f14; font-size: 13.5px; }
        .ws-card-meta { font-size: 12px; color: #64748b; }
        .ws-card-foot { display: flex; justify-content: space-between; font-size: 12px; color: #334155; margin-top: 4px; }
        @media (max-width: 767px) { .ws-header { padding: 12px 16px 10px; } }
      `}</style>

      {toast.show && (
        <div className="training-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="ws-header page-header-band">
        <div className="ws-row ws-title-row">
          <div className="ws-title">
            <h1>{activeView === "library" ? "Documents Library" : "Workshops"}</h1>
            {activeView === "sessions" && (
              <div className="ws-kpis" role="group" aria-label="Quick filters">
                <button type="button" className="ws-kpi green" aria-pressed="false" onClick={() => { setStatusFilters([]); setCurrentPage(1); }}><b>{counts.total.toLocaleString()}</b>Total workshops</button>
                <button type="button" className="ws-kpi amber" aria-pressed={statusFilters.includes("Upcoming")} onClick={() => { toggleStatusFilter("Upcoming"); setCurrentPage(1); }}><b>{counts.upcoming.toLocaleString()}</b>Upcoming</button>
                <button type="button" className="ws-kpi green" aria-pressed={statusFilters.includes("Completed")} onClick={() => { toggleStatusFilter("Completed"); setCurrentPage(1); }}><b>{counts.completed.toLocaleString()}</b>Completed</button>
                <span className="ws-kpi blue"><b>{counts.totalAttendance.toLocaleString()}</b>Trainee slots</span>
              </div>
            )}
          </div>
          {activeView === "sessions" ? (
            <button type="button" className="ws-outline-btn" onClick={clearFilters}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
              Reset Filters
            </button>
          ) : (
            <div className="ws-row" style={{ gap: 8 }}>
              <button type="button" className="ws-outline-btn" onClick={openUploadPicker}>
                <FaFolderOpen size={12} />
                Upload Documents
              </button>
              <button type="button" className="ws-outline-btn" onClick={() => setActiveView("sessions")}>
                <FaChalkboardTeacher size={12} />
                Back to Workshops
              </button>
            </div>
          )}
        </div>

        {activeView === "sessions" && (
          <>
            <div className="ws-row" style={{ gap: 8 }}>
              <OdooSearchBar
                variant="boxed"
                value={topicSearch}
                onChange={(e) => {
                  setTopicSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by topic..."
                chips={[
                  ...statusFilters.map((v) => ({ key: `status-${v}`, label: v, onRemove: () => toggleStatusFilter(v) })),
                  ...(sessionsGroupBy ? [{ key: "groupBy", label: `Group: ${SESSIONS_GROUP_BY_OPTIONS.find((o) => o.key === sessionsGroupBy)?.label || sessionsGroupBy}`, onRemove: () => setSessionsGroupBy(null) }] : []),
                ]}
              />
              <div className="ws-toolbar-group">
                <OdooViewToolbar
                  variant="boxed"
                  quickFilters={[
                    { key: "status-Upcoming", label: "Upcoming", active: statusFilters.includes("Upcoming"), onToggle: () => toggleStatusFilter("Upcoming") },
                    { key: "status-Completed", label: "Completed", active: statusFilters.includes("Completed"), onToggle: () => toggleStatusFilter("Completed") },
                  ]}
                  groupByOptions={SESSIONS_GROUP_BY_OPTIONS}
                  groupBy={sessionsGroupBy}
                  onGroupByChange={(value) => {
                    setSessionsGroupBy(value);
                    setCurrentPage(1);
                  }}
                  showViewToggle={false}
                />
                <FavoritesMenu
                  favorites={favorites}
                  onApply={applyFavorite}
                  onDelete={deleteFavorite}
                  onSave={saveCurrentAsFavorite}
                />
              </div>
            </div>

            <div className="ws-row ws-meta-row">
              <div className="ws-meta-left">
                <SelectionActionMenu count={selectedIds.size} onExport={handleExportSelected} onClear={() => setSelectedIds(new Set())} />
                <button type="button" className="ws-outline-btn" onClick={openUploadPicker}>
                  <FaFolderOpen size={12} />
                  Upload Documents
                </button>
                <button type="button" className="ws-outline-btn" onClick={() => setActiveView("library")}>
                  <FaLink size={12} />
                  Documents Library
                </button>
              </div>
              <div className="ws-meta-right">
                <select
                  className="ws-select"
                  aria-label="Records per page"
                  value={rowsPerPage === Infinity ? "all" : rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(e.target.value === "all" ? Infinity : Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
                <span className="ws-range">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {totalItems.toLocaleString()}</span>
                <div className="ws-joined">
                  <button type="button" className="ws-icon-btn" aria-label="Previous page" disabled={activePage <= 1} onClick={() => setCurrentPage(activePage - 1)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
                  </button>
                  <button type="button" className="ws-icon-btn" aria-label="Next page" disabled={activePage >= totalPages} onClick={() => setCurrentPage(activePage + 1)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                  </button>
                </div>
                <div className="ws-joined">
                  <button type="button" className={`ws-icon-btn${viewMode === "list" ? " is-active" : ""}`} aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                  </button>
                  <button type="button" className={`ws-icon-btn${viewMode === "kanban" ? " is-active" : ""}`} aria-label="Kanban view" aria-pressed={viewMode === "kanban"} onClick={() => setViewMode("kanban")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="4" height="16"/><rect x="10" y="4" width="4" height="10"/><rect x="16" y="4" width="4" height="13"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {activeView === "sessions" && (
        <div className="ws-table-wrap">
          {loading || workshopsLoading ? (
            <TableLoadingSpinner label="Loading workshops…" />
          ) : viewMode === "kanban" ? (
            <div style={{ padding: "12px 32px" }}>
              {sections.map((section) => (
                <div key={section.key} style={{ marginBottom: 12 }}>
                  <div className="ws-kanban-group" onClick={() => toggleGroupCollapsed(section.key)}>
                    <span style={{ display: "inline-block", transform: collapsedGroups.has(section.key) ? "rotate(-90deg)" : "none" }}>▾</span>
                    {section.label} <span className="ws-count">({section.total})</span>
                  </div>
                  {!collapsedGroups.has(section.key) && (
                    section.items.length === 0 ? (
                      <div className="ws-empty">{hasActiveFilters ? "No workshops match these filters." : section.empty}</div>
                    ) : (
                      <div className="ws-card-grid">{section.items.map(renderSessionCard)}</div>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="ws-table-scroll">
              <table className="training-table ws-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        className="ws-cb"
                        aria-label="Select all workshops"
                        checked={allRowsSelected}
                        ref={(el) => { if (el) el.indeterminate = someRowsSelected; }}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Workshop</th>
                    <th>Fee</th>
                    <th>Trainees</th>
                    <th>Meeting Link</th>
                    <th>Documents</th>
                    <th>Reminders</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => (
                    <Fragment key={section.key}>
                      <tr className="ws-group-row">
                        <td colSpan={10} onClick={() => toggleGroupCollapsed(section.key)}>
                          <span style={{ display: "inline-block", marginRight: 8, transform: collapsedGroups.has(section.key) ? "rotate(-90deg)" : "none" }}>▾</span>
                          {section.label} <span className="ws-count">({section.total})</span>
                        </td>
                      </tr>
                      {!collapsedGroups.has(section.key) && (
                        section.items.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="ws-empty">{hasActiveFilters ? "No workshops match these filters." : section.empty}</td>
                          </tr>
                        ) : (
                          section.items.map(renderSessionRow)
                        )
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === "library" && (
      <div style={{ padding: "12px 32px 24px" }}>
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
          <TableLoadingSpinner label="Loading documents…" />
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
                        <strong>Workshop Dates:</strong> {formatDateText(selectedWorkshop.workshop_start_date)}
                        {selectedWorkshop.workshop_end_date ? ` to ${formatDateText(selectedWorkshop.workshop_end_date)}` : ""}
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
                      <SkeletonLoader rows={3} compact label="Loading applicants…" />
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

                  <div className="training-add-member">
                    <input
                      type="text"
                      className="training-add-member-input"
                      placeholder="Search members by name or phone to allocate..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                    />
                    {memberSearch.trim() && (
                      <div className="training-add-member-results">
                        {memberSearchResults.length === 0 ? (
                          <div className="training-add-member-empty">No matching members found.</div>
                        ) : (
                          memberSearchResults.map((member) => (
                            <button
                              type="button"
                              key={member.id}
                              className="training-add-member-result"
                              onClick={() => handleAddMemberToTraining(member)}
                            >
                              {getMemberName(member)}
                              {getMemberPhone(member) ? ` · ${getMemberPhone(member)}` : ""}
                            </button>
                          ))
                        )}
                      </div>
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
                  <SkeletonLoader rows={3} compact label="Loading workshops…" />
                ) : filteredWorkshopsForPicker.length === 0 ? (
                  <div className="training-empty">No workshops found.</div>
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
                    Last sent {formatDateTimeDDMMMYYYY(documentsSession.emailSentAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {reminderModal && (
        <div className="modal-overlay" onClick={closeReminderModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>{reminderModal.field === "whatsappLastReminderSent" ? "Final Reminder" : "Reminder"} - {reminderModal.session.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closeReminderModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-message-preview-group">
                <div className={`training-message-preview ${reminderModal.field === "whatsappReminderSent" ? "active" : ""}`}>
                  <div className="training-message-preview-label">First Reminder Message</div>
                  <textarea
                    className="training-message-preview-textarea"
                    rows={6}
                    value={messageDrafts.first}
                    onChange={(e) => setMessageDrafts((prev) => ({ ...prev, first: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="training-message-save-btn"
                    onClick={() => handleSaveMessageDraft("first")}
                    disabled={savingMessage === "first"}
                  >
                    {savingMessage === "first" ? "Saving..." : "Save"}
                  </button>
                </div>
                <div className={`training-message-preview ${reminderModal.field === "whatsappLastReminderSent" ? "active" : ""}`}>
                  <div className="training-message-preview-label">Final Reminder Message</div>
                  <textarea
                    className="training-message-preview-textarea"
                    rows={6}
                    value={messageDrafts.final}
                    onChange={(e) => setMessageDrafts((prev) => ({ ...prev, final: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="training-message-save-btn"
                    onClick={() => handleSaveMessageDraft("final")}
                    disabled={savingMessage === "final"}
                  >
                    {savingMessage === "final" ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="training-btn training-btn-primary"
                style={{ width: "100%", justifyContent: "center", marginBottom: "16px" }}
                onClick={() =>
                  handleSendWhatsAppReminder(
                    reminderModal.session,
                    reminderModal.field,
                    reminderModal.field === "whatsappLastReminderSent" ? messageDrafts.final : messageDrafts.first
                  )
                }
                disabled={togglingId === `${reminderModal.session.id}-${reminderModal.field}`}
              >
                <FaWhatsapp size={12} />
                {togglingId === `${reminderModal.session.id}-${reminderModal.field}`
                  ? "Sending to all..."
                  : `Send ${reminderModal.field === "whatsappLastReminderSent" ? "Final Reminder" : "Reminder"} to All`}
              </button>

              <div className="training-attendees-list" style={{ marginBottom: 0, maxHeight: "360px" }}>
                {(reminderModal.session.attendees || []).length === 0 ? (
                  <div className="training-empty">No registered trainees for this session.</div>
                ) : (
                  reminderModal.session.attendees.map((trainee, idx) => {
                    const traineeObj = typeof trainee === "object" ? trainee : { id: `legacy-${idx}`, name: trainee };
                    const key = `${reminderModal.session.id}-${reminderModal.field}-${traineeObj.id}`;
                    const sentIndividually = individualSentIds.includes(traineeObj.id);
                    return (
                      <div key={traineeObj.id || idx} className="training-attendee-row">
                        <span>
                          {getTraineeName(traineeObj)}
                          {traineeObj.phone ? ` · ${traineeObj.phone}` : " · No phone on file"}
                        </span>
                        <button
                          type="button"
                          className="training-reminder-btn-sm"
                          onClick={() =>
                            handleSendSingleReminder(
                              reminderModal.session,
                              reminderModal.field,
                              traineeObj,
                              reminderModal.field === "whatsappLastReminderSent" ? messageDrafts.final : messageDrafts.first
                            )
                          }
                          disabled={!traineeObj.phone || sendingTraineeKey === key}
                          title={!traineeObj.phone ? "No phone number on file" : "Send reminder to this trainee only"}
                        >
                          <FaWhatsapp size={10} />
                          {sendingTraineeKey === key ? "Sending..." : sentIndividually ? "Sent" : "Send Notification"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {detailSessionId && sessions.find((item) => item.id === detailSessionId) && (
        <WorkshopDetailModal
          session={sessions.find((item) => item.id === detailSessionId)}
          completed={getSessionStatus(sessions.find((item) => item.id === detailSessionId)) === "Completed"}
          members={allMembers}
          registered={detailApplicants}
          presentIds={detailPresentIds}
          onClose={() => setDetailSessionId(null)}
          onPatch={patchSession}
          onEditDetails={openScheduleModal}
          onManageDocuments={opendocumentsModal}
        />
      )}

      {addTraineesModal && (
        <div className="modal-overlay" onClick={closeAddTraineesModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: "min(480px, 100%)" }}>
            <div className="modal-panel-header">
              <h3>Add Trainees - {addTraineesModal.session.topic}</h3>
              <button type="button" className="modal-close-btn" onClick={closeAddTraineesModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="training-add-member" style={{ marginBottom: "16px" }}>
                <input
                  type="text"
                  className="training-add-member-input"
                  placeholder="Search members by name or phone to add..."
                  value={addTraineesSearch}
                  onChange={(e) => setAddTraineesSearch(e.target.value)}
                />
                {addTraineesSearch.trim() && (
                  <div className="training-add-member-results">
                    {addTraineesSearchResults.length === 0 ? (
                      <div className="training-add-member-empty">No matching members found.</div>
                    ) : (
                      addTraineesSearchResults.map((member) => (
                        <button
                          type="button"
                          key={member.id}
                          className="training-add-member-result"
                          onClick={() => handleAddTraineeToModal(member)}
                        >
                          {getMemberName(member)}
                          {getMemberPhone(member) ? ` · ${getMemberPhone(member)}` : ""}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="training-attendees-list" style={{ maxHeight: "260px" }}>
                {addTraineesModal.trainees.length === 0 ? (
                  <div className="training-empty">No trainees yet. Search above to add.</div>
                ) : (
                  addTraineesModal.trainees.map((trainee, idx) => (
                    <div key={trainee.id || idx} className="training-attendee-row">
                      <span>
                        {getTraineeName(trainee)}
                        {trainee.phone ? ` · ${trainee.phone}` : ""}
                      </span>
                      <button
                        type="button"
                        className="training-attendee-remove"
                        onClick={() => handleRemoveTraineeFromModal(trainee.id)}
                        title="Remove"
                      >
                        <FaTimes size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="modal-footer-actions" style={{ marginTop: "16px" }}>
                <button type="button" className="training-cancel-btn" onClick={closeAddTraineesModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="training-btn training-btn-primary"
                  onClick={handleSaveAddedTrainees}
                  disabled={savingTrainees}
                >
                  {savingTrainees ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
