// src/pages/CommunityJobsPage.jsx
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FaPlus,
  FaCamera,
  FaEye,
  FaEdit,
  FaArchive,
  FaTimes,
  FaBriefcase,
} from "react-icons/fa";
import { collection, db, addDoc, doc, getDocs, updateDoc } from "../firestoreClient";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import LocationAutocompleteInput from "../components/LocationAutocompleteInput";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar from "../components/OdooViewToolbar";
import FavoritesMenu from "../components/FavoritesMenu";
import { formatDateText } from "../utils/dateFormat";
import SelectionActionMenu from "../components/SelectionActionMenu";
import useTableSort, { sortRows, sortHeaderProps } from "../hooks/useTableSort";
import SortArrow from "../components/SortArrow";

const COLLECTION_NAME = "communityjobs";
const MAX_UPLOAD_PHOTOS = 6;
const DEFAULT_LOGO =
  "https://firebasestorage.googleapis.com/v0/b/briskoliveresourcemangement.appspot.com/o/defaults%2FDefaultCompanyLogo_grey_150px_150px.jpg?alt=media&token=1636441e-b610-43d9-b7eb-9d694f56e1d4";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// job_postedon is stored as "dd-MMM-yyyy" (e.g. "21-Sep-2026").
const formatPostedOn = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}-${MONTH_NAMES[date.getMonth()]}-${date.getFullYear()}`;
};

const parsePostedOn = (value) => {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(value || "").trim());
  if (!match) return null;
  const month = MONTH_NAMES.findIndex((m) => m.toLowerCase() === match[2].toLowerCase());
  if (month === -1) return null;
  const parsed = new Date(Number(match[3]), month, Number(match[1]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Draft/Archived take priority over the raw Open/Closed job_status value for
// filtering & grouping purposes, since both are set independently of it.
const getDisplayStatus = (job) => {
  if (!job.job_status) return "Archived";
  if (job.job_isdraft) return "Draft";
  return job.job_status;
};

// Status label exactly as the table shows it (Archived wins over Draft/Published).
const getStatusLabel = (job) => (!job.job_status ? "Archived" : job.job_isdraft ? "Draft" : "Published");

// Posted On sorts chronologically; "dd-MMM-yyyy" strings become a time value,
// Date/Firestore Timestamp values are handled by sortRows itself.
const postedOnSortValue = (value) => {
  if (typeof value === "string") {
    const date = parsePostedOn(value) || new Date(value);
    const time = date.getTime();
    return Number.isNaN(time) ? null : time;
  }
  return value ?? null;
};

const JOB_SORT_ACCESSORS = {
  role: (job) => job.job_designation,
  organization: (job) => job.job_company,
  location: (job) => job.job_location,
  postedOn: (job) => postedOnSortValue(job.job_postedon),
  status: getStatusLabel,
};

const FAVORITES_STORAGE_KEY = "communityJobsFavorites";

const COMMUNITY_GROUP_BY_OPTIONS = [
  { key: "orgType", label: "Organization Type" },
  { key: "status", label: "Status" },
  { key: "company", label: "Organization" },
];

const emptyForm = () => ({
  job_org_type: "Company",
  job_company: "",
  job_designation: "",
  job_location: "",
  job_experience_required: "",
  job_education_qualification: "",
  job_salary_minimum: "",
  job_salary_maximum: "",
  job_working_days: "",
  job_shift_time: "",
  job_description: "",
  job_howtoapply: "",
  job_apply_link: "",
  job_postedon: formatPostedOn(new Date()),
  job_status: "Open",
});

const fieldLabelStyle = { display: "block", fontSize: "13px", fontWeight: "600", color: "#4b5563", marginBottom: "6px" };
const inputStyle = { width: "100%", padding: "10px 14px", borderRadius: "10px", border: "2px solid #e2e8f0", fontSize: "14px", boxSizing: "border-box" };
const fieldWrapStyle = { marginBottom: "18px" };

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CommunityJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Deep-link support (e.g. from the daily report email): ?postedOn=YYYY-MM-DD
  // filters the list down to jobs posted on that exact date.
  const [postedOnFilter, setPostedOnFilter] = useState(
    () => new URLSearchParams(window.location.search).get("postedOn") || ""
  );
  const [filters, setFilters] = useState({ orgType: [], status: [] });
  const [groupBy, setGroupBy] = useState(null);
  const [kanbanView, setKanbanView] = useState("list");

  const [pageSize, setPageSize] = useState(500);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Column sorting; with no column picked, jobs keep the newest-first order from fetchJobs.
  const { sort, toggleSort: toggleSortKey } = useTableSort({ key: null, dir: "asc" });
  const toggleSort = (key) => {
    toggleSortKey(key);
    setPageIndex(0);
  };

  // Saved search/filter presets (same Favorites menu as the Members pages).
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      console.error("Error saving favorites:", err);
    }
  };
  const saveCurrentAsFavorite = (name) => {
    persistFavorites([...favorites, { id: Date.now().toString(36), name, searchTerm, filters, groupBy }]);
  };
  const applyFavorite = (fav) => {
    setSearchTerm(fav.searchTerm || "");
    setFilters({ orgType: fav.filters?.orgType || [], status: fav.filters?.status || [] });
    setGroupBy(fav.groupBy || null);
  };
  const deleteFavorite = (id) => persistFavorites(favorites.filter((f) => f.id !== id));

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({ orgType: [], status: [] });
    setGroupBy(null);
    setPostedOnFilter("");
  };

  const toggleFilter = (key, value) => {
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState("create"); // "create" | "edit" | "view"
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]); // { file, previewUrl }
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef(null);

  const [archiveTarget, setArchiveTarget] = useState(null);

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (parsePostedOn(b.job_postedon) || 0) - (parsePostedOn(a.job_postedon) || 0));
      setJobs(list);
    } catch (err) {
      console.error("Error fetching community jobs:", err);
      setError("Failed to load community jobs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    let list = jobs;

    if (postedOnFilter) {
      const target = parsePostedOn(postedOnFilter.length === 10 ? formatPostedOn(new Date(`${postedOnFilter}T00:00:00`)) : postedOnFilter);
      if (target) {
        list = list.filter((job) => {
          const posted = parsePostedOn(job.job_postedon);
          return posted && posted.getTime() === target.getTime();
        });
      }
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((job) =>
        [job.job_designation, job.job_company, job.job_location]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term))
      );
    }

    if (filters.orgType.length) {
      list = list.filter((job) => filters.orgType.includes(job.job_org_type === "Government" ? "Government" : "Company"));
    }
    if (filters.status.length) {
      list = list.filter((job) => filters.status.includes(getDisplayStatus(job)));
    }

    return sortRows(list, sort, JOB_SORT_ACCESSORS);
  }, [jobs, searchTerm, postedOnFilter, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  // Action → Export: ticked job posts as an .xlsx.
  const exportSelectedJobs = async () => {
    const rows = filteredJobs.filter((job) => selectedIds.has(job.id));
    if (!rows.length) return;
    const data = rows.map((job) => ({
      Role: job.job_designation || "-",
      Organization: job.job_company || "-",
      Location: job.job_location || "-",
      "Posted On": formatDateText(job.job_postedon, "-"),
      Status: job.job_isdraft ? "Draft" : "Published",
    }));
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Community Jobs");
    XLSX.writeFile(wb, "community-jobs.xlsx");
  };

  const pagedJobs = useMemo(
    () => filteredJobs.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize),
    [filteredJobs, safePageIndex, pageSize]
  );
  const rangeStart = filteredJobs.length === 0 ? 0 : safePageIndex * pageSize + 1;
  const rangeEnd = safePageIndex * pageSize + pagedJobs.length;
  const allPageSelected = pagedJobs.length > 0 && pagedJobs.every((j) => selectedIds.has(j.id));

  const toggleSelected = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (pagedJobs.every((j) => next.has(j.id))) pagedJobs.forEach((j) => next.delete(j.id));
      else pagedJobs.forEach((j) => next.add(j.id));
      return next;
    });

  // Grouping is applied within the current page of the filtered list.
  const groupedJobs = useMemo(() => {
    if (!groupBy) return null;
    const getLabel = (job) => {
      if (groupBy === "orgType") return job.job_org_type === "Government" ? "Government" : "Company";
      if (groupBy === "status") return getDisplayStatus(job);
      if (groupBy === "company") return job.job_company && job.job_company.trim() ? job.job_company.trim() : "Unspecified";
      return "Unspecified";
    };
    const groups = new Map();
    for (const job of pagedJobs) {
      const label = getLabel(job);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(job);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, pagedJobs]);

  const openCreateForm = (prefill) => {
    setForm(prefill ? { ...emptyForm(), ...prefill } : emptyForm());
    setEditingId(null);
    setFormMode("create");
    setShowFormModal(true);
  };

  const openEditForm = (job) => {
    setForm({ ...emptyForm(), ...job });
    setEditingId(job.id);
    setFormMode("edit");
    setShowFormModal(true);
  };

  const openViewForm = (job) => {
    setForm({ ...emptyForm(), ...job });
    setEditingId(job.id);
    setFormMode("view");
    setShowFormModal(true);
  };

  const closeFormModal = () => {
    setShowFormModal(false);
    setForm(emptyForm());
    setEditingId(null);
  };

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (isDraft) => {
    if (!form.job_designation.trim() || !form.job_company.trim()) {
      showToast("Organization Name and Role/Designation are required.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        job_org_type: form.job_org_type === "Government" ? "Government" : "Company",
        job_company: form.job_company.trim(),
        job_designation: form.job_designation.trim(),
        job_location: form.job_location.trim(),
        job_experience_required: form.job_experience_required.trim(),
        job_education_qualification: form.job_education_qualification.trim(),
        job_salary_minimum: Number(form.job_salary_minimum) || 0,
        job_salary_maximum: Number(form.job_salary_maximum) || 0,
        job_working_days: form.job_working_days.trim(),
        job_shift_time: form.job_shift_time.trim(),
        job_description: form.job_description.trim(),
        job_howtoapply: form.job_howtoapply.trim(),
        job_apply_link: form.job_apply_link.trim(),
        job_postedon: form.job_postedon || formatPostedOn(new Date()),
        job_status: form.job_status,
        job_isdraft: isDraft,
        job_logo: form.job_logo || DEFAULT_LOGO,
      };

      if (editingId) {
        await updateDoc(doc(db, COLLECTION_NAME, editingId), payload);
        showToast("Community job updated.");
      } else {
        await addDoc(collection(db, COLLECTION_NAME), payload);
        showToast(isDraft ? "Saved as draft." : "Community job published.");
      }

      closeFormModal();
      fetchJobs();
    } catch (err) {
      console.error("Error saving community job:", err);
      showToast("Failed to save community job.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      // Soft-delete: clear job_status rather than removing the document.
      await updateDoc(doc(db, COLLECTION_NAME, archiveTarget.id), { job_status: "" });
      showToast("Job archived.");
      setArchiveTarget(null);
      fetchJobs();
    } catch (err) {
      console.error("Error archiving community job:", err);
      showToast("Failed to archive job.", "error");
    }
  };

  const openUploadModal = () => {
    setUploadFiles([]);
    setParseError("");
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    uploadFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setUploadFiles([]);
    setParseError("");
    setShowUploadModal(false);
  };

  const handleFilesSelected = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    setUploadFiles((prev) => {
      const combined = [...prev, ...incoming.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
      if (combined.length > MAX_UPLOAD_PHOTOS) {
        showToast(`Only the first ${MAX_UPLOAD_PHOTOS} photos are used.`, "error");
      }
      return combined.slice(0, MAX_UPLOAD_PHOTOS);
    });
  };

  const removeUploadFile = (index) => {
    setUploadFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAnalyzePhotos = async () => {
    if (uploadFiles.length === 0) return;
    setParsing(true);
    setParseError("");
    try {
      const images = await Promise.all(uploadFiles.map(({ file }) => fileToBase64(file)));
      const response = await fetch("/api/parse-community-job-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to analyze photos.");
      }
      closeUploadModal();
      openCreateForm(payload.fields);
      showToast("Photos analyzed — review and save the post below.");
    } catch (err) {
      console.error("Error analyzing job photos:", err);
      setParseError(err.message || "Failed to analyze photos.");
    } finally {
      setParsing(false);
    }
  };

  const renderJobRow = (job) => {
    const isArchived = !job.job_status;
    return (
      <tr
        key={job.id}
        className="cj-row"
        data-testid={`community-job-card-${job.id}`}
        style={{ opacity: isArchived ? 0.6 : 1 }}
      >
        <td className="cj-td" style={{ width: "36px" }}>
          <input
            className="cj-cb"
            type="checkbox"
            aria-label={`Select ${job.job_designation || "post"}`}
            checked={selectedIds.has(job.id)}
            onChange={() => toggleSelected(job.id)}
          />
        </td>
        <td className="cj-td">
          <img
            src={job.job_logo || DEFAULT_LOGO}
            alt=""
            style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "contain", background: "#f1f5f9", display: "block" }}
          />
        </td>
        <td className="cj-td" style={{ fontWeight: 500, color: "#111827" }} title={job.job_designation}>
          <span className="cj-trunc">{job.job_designation || "Untitled Role"}</span>
        </td>
        <td className="cj-td" title={job.job_company}>
          <span className="cj-trunc">{job.job_company || "—"}</span>
        </td>
        <td className="cj-td" title={job.job_location}>
          <span className="cj-trunc">{job.job_location || "Location not specified"}</span>
        </td>
        <td className="cj-td">{formatDateText(job.job_postedon, "—")}</td>
        <td className="cj-td">
          <span className={`cj-status${job.job_isdraft ? " cj-status-draft" : ""}`}>
            {job.job_isdraft ? "Draft" : "Published"}
          </span>
          {isArchived && <span className="cj-status cj-status-archived" style={{ marginLeft: "6px" }}>Archived</span>}
        </td>
        <td className="cj-td">
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" className="cj-act" onClick={() => openViewForm(job)} title="View">
              <FaEye /> View
            </button>
            <button type="button" className="cj-act cj-act-edit" onClick={() => openEditForm(job)} title="Edit">
              <FaEdit /> Edit
            </button>
            <button
              type="button"
              className="cj-act-del"
              onClick={() => setArchiveTarget(job)}
              title="Archive"
              aria-label="Archive post"
              disabled={isArchived}
            >
              <FaArchive />
            </button>
          </div>
        </td>
      </tr>
    );
  };


  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4f6f9", padding: "20px" }}>
        <div style={{ background: "white", padding: "40px 60px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: "500px" }}>
          <h2 style={{ color: "#1f2937", marginBottom: "16px" }}>Something went wrong</h2>
          <p style={{ color: "#4b5563", marginBottom: "24px" }}>{error}</p>
          <button
            onClick={fetchJobs}
            style={{ padding: "12px 32px", backgroundColor: "#c2d45e", color: "#243014", border: "none", borderRadius: "12px", fontWeight: "600", cursor: "pointer", fontSize: "1rem" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-fill" style={{ backgroundColor: "#fff", color: "#212529" }}>
      <style>{`
        .date-picker-wrapper { width: 100%; }
        .date-picker-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 2px solid #e2e8f0;
          font-size: 14px;
          font-family: inherit;
          color: #0f172a;
          box-sizing: border-box;
        }
        .date-picker-input:focus {
          outline: none;
          border-color: #c2d45e;
        }
        /* Header band + table mirror the Members Master List (MemberListPage). */
        .cj-header { background: #fff; padding: 32px 32px 16px; width: 100%; box-sizing: border-box; }
        .cj-title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
        .cj-title { display: flex; align-items: baseline; gap: 12px; }
        .cj-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .cj-title span { font-size: 14px; color: #64748b; font-weight: 400; }
        .cj-outline-btn { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; background: #fff; border: 1px solid #dde1e7; border-radius: 6px; color: #334155; font-size: 13px; font-weight: 400; cursor: pointer; white-space: nowrap; }
        .cj-controls-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .cj-meta-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; min-height: 34px; }
        .cj-meta-actions { margin-right: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .cj-primary { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #c2d45e; background: #c2d45e; border-radius: 6px; font: inherit; font-size: 13px; font-weight: 500; color: #243014; cursor: pointer; white-space: nowrap; }
        .cj-primary:hover { background: #aabd3f; }
        .cj-secondary { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; border-radius: 6px; font: inherit; font-size: 13px; font-weight: 400; color: #334155; cursor: pointer; white-space: nowrap; }
        .cj-select { height: 30px; padding: 0 6px; border: 1px solid #dde1e7; border-radius: 6px; font: inherit; font-size: 12px; background: #fff; color: #334155; cursor: pointer; }
        .cj-range { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; margin: 0 2px; }
        .cj-icon-group { display: flex; gap: 6px; }
        .cj-icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #dde1e7; border-radius: 6px; background: #fff; color: #475569; cursor: pointer; padding: 0; }
        .cj-icon-btn:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }
        .cj-icon-group:has(.cj-active), .cj-icon-group.cj-view-toggle { gap: 0; background: #dde1e7; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; margin-left: 2px; }
        .cj-icon-group:has(.cj-active) .cj-icon-btn { width: 36px; height: 34px; border: none; border-radius: 0; color: #64748b; }
        .cj-icon-btn.cj-active { background: #f1f6d6; color: #5f6f14; }
        .cj-body { flex: 1; background: #fff; }
        .cj-table-wrap { overflow-x: auto; border-top: 1px solid #dde1e7; }
        .cj-table { width: 100%; min-width: 1040px; border-collapse: collapse; }
        .cj-th { height: 45px; padding: 0 10px; text-align: left; font-weight: 600; font-size: 13px; color: #243014; white-space: nowrap; background: #c2d45e; position: sticky; top: 0; z-index: 2; }
        .cj-td { height: 49px; padding: 0 10px; border-bottom: 1px solid #dde1e7; font-size: 13px; color: #64748b; white-space: nowrap; vertical-align: middle; }
        .cj-row { background: #fff; }
        .cj-row:nth-child(odd) { background: #f8fafc; }
        .cj-group-row td { height: 40px; padding: 0 12px; font-weight: 600; font-size: 13px; color: #334155; background: #f1f5f9; border-bottom: 1px solid #dde1e7; }
        .cj-cb { width: 13px; height: 13px; margin: 0; accent-color: #c2d45e; cursor: pointer; vertical-align: middle; }
        .cj-th .cj-cb { width: 14px; height: 14px; accent-color: #ffffff; }
        .cj-trunc { display: block; max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
        .cj-status { display: inline-flex; align-items: center; height: 22px; padding: 0 10px; border-radius: 11px; background: #e3f1e3; color: #1f5c26; font-size: 12px; font-weight: 600; }
        .cj-status-draft { background: #fef3c7; color: #92400e; }
        .cj-status-archived { background: #fde8e8; color: #991b1b; }
        .cj-act { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid #d0d5dd; background: #fff; border-radius: 4px; font: inherit; font-size: 13px; color: #3c4047; cursor: pointer; }
        .cj-act:hover { background: #f2f3f5; }
        .cj-act-edit { color: #5f6f14; }
        .cj-act-del { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 28px; border: 1px solid #efc9c9; background: #fff; border-radius: 4px; color: #b42318; cursor: pointer; padding: 0; }
        .cj-act-del:hover:not(:disabled) { background: #fdf0f0; }
        .cj-act-del:disabled { color: #9ca3af; border-color: #e5e7eb; background: #f3f4f6; cursor: not-allowed; }
        .cj-notice { display: flex; align-items: center; gap: 10px; background: #f1f6d6; color: #4a5a12; padding: 10px 32px; font-size: 13px; font-weight: 600; }
        .cj-empty { text-align: center; padding: 80px 20px; color: #666; background: #fff; }
        .cj-kanban { padding: 20px 32px; }
        @media (max-width: 720px) {
          .cj-header { padding: 16px; }
          .cj-kanban { padding: 16px; }
        }
      `}</style>
      {toast.show && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: toast.type === "success" ? "#10b981" : "#ef4444",
            color: "white",
            padding: "16px 28px",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            zIndex: 10000,
            fontWeight: "600",
            fontSize: "16px",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="cj-header page-header-band">
        <div className="cj-title-row">
          <div className="cj-title">
            <h1>Community Jobs</h1>
            <span>{filteredJobs.length.toLocaleString()} Posts</span>
          </div>
          <button type="button" className="cj-outline-btn" onClick={clearFilters}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            Reset Filters
          </button>
        </div>

        <div className="cj-controls-row">
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by role, company, location..."
            chips={[
              ...filters.orgType.map((v) => ({ key: `orgType-${v}`, label: v, onRemove: () => toggleFilter("orgType", v) })),
              ...filters.status.map((v) => ({ key: `status-${v}`, label: v, onRemove: () => toggleFilter("status", v) })),
              ...(groupBy ? [{ key: "groupBy", label: `Group: ${COMMUNITY_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}`, onRemove: () => setGroupBy(null) }] : []),
            ]}
          />
          <div className="member-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              showViewToggle={false}
              quickFilters={[
                { key: "orgType-Company", label: "Company", active: filters.orgType.includes("Company"), onToggle: () => toggleFilter("orgType", "Company") },
                { key: "orgType-Government", label: "Government", active: filters.orgType.includes("Government"), onToggle: () => toggleFilter("orgType", "Government") },
                { key: "status-Open", label: "Open", active: filters.status.includes("Open"), onToggle: () => toggleFilter("status", "Open"), startGroup: true },
                { key: "status-Closed", label: "Closed", active: filters.status.includes("Closed"), onToggle: () => toggleFilter("status", "Closed") },
                { key: "status-Draft", label: "Draft", active: filters.status.includes("Draft"), onToggle: () => toggleFilter("status", "Draft") },
                { key: "status-Archived", label: "Archived", active: filters.status.includes("Archived"), onToggle: () => toggleFilter("status", "Archived") },
              ]}
              groupByOptions={COMMUNITY_GROUP_BY_OPTIONS}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
            <FavoritesMenu
              favorites={favorites}
              onApply={applyFavorite}
              onDelete={deleteFavorite}
              onSave={saveCurrentAsFavorite}
            />
          </div>
        </div>

        <div className="cj-meta-row">
          <SelectionActionMenu count={selectedIds.size} onExport={exportSelectedJobs} onClear={() => setSelectedIds(new Set())} />
          <div className="cj-meta-actions">
            <button type="button" className="cj-primary" onClick={() => openCreateForm()}>
              <FaPlus /> Create New Post
            </button>
            <button type="button" className="cj-secondary" onClick={openUploadModal}>
              <FaCamera /> Upload Photos
            </button>
          </div>
          <select
            className="cj-select"
            aria-label="Records per page"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPageIndex(0); }}
          >
            <option value={500}>500</option>
            <option value={200}>200</option>
            <option value={80}>80</option>
          </select>
          <span className="cj-range">
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {filteredJobs.length.toLocaleString()}
          </span>
          <div className="cj-icon-group">
            <button type="button" className="cj-icon-btn" aria-label="Previous page" disabled={safePageIndex === 0} onClick={() => setPageIndex(safePageIndex - 1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <button type="button" className="cj-icon-btn" aria-label="Next page" disabled={safePageIndex >= totalPages - 1} onClick={() => setPageIndex(safePageIndex + 1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="cj-icon-group">
            <button type="button" className={`cj-icon-btn${kanbanView === "list" ? " cj-active" : ""}`} aria-label="List view" aria-pressed={kanbanView === "list"} onClick={() => setKanbanView("list")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button type="button" className={`cj-icon-btn${kanbanView === "kanban" ? " cj-active" : ""}`} aria-label="Kanban view" aria-pressed={kanbanView === "kanban"} onClick={() => setKanbanView("kanban")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="4" height="16" /><rect x="10" y="4" width="4" height="10" /><rect x="16" y="4" width="4" height="13" /></svg>
            </button>
          </div>
        </div>
      </div>

      {postedOnFilter && (
        <div className="cj-notice">
          Showing jobs posted on {formatDateText(postedOnFilter)}
          <button
            type="button"
            onClick={() => setPostedOnFilter("")}
            style={{ background: "none", border: "none", color: "#4a5a12", textDecoration: "underline", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* JOB LIST */}
      <div className="cj-body page-fill-mid">
        {loading ? (
          <TableLoadingSpinner label="Loading community jobs…" />
        ) : filteredJobs.length === 0 ? (
          <div className="cj-empty">
            <FaBriefcase size={40} style={{ color: "#cbd5e1", marginBottom: "16px" }} />
            <p style={{ fontSize: "16px" }}>No community jobs found.</p>
          </div>
        ) : kanbanView === "kanban" ? (
          <div className="cj-kanban page-fill-scroll">
            {groupedJobs
              ? groupedJobs.map(([label, items]) => (
                  <div key={label} style={{ marginBottom: "20px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#334155", marginBottom: "10px" }}>
                      {label} <span style={{ fontWeight: 500, color: "#94a3b8" }}>({items.length})</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                      {items.map((job) => (
                        <JobCard key={job.id} job={job} onView={() => openViewForm(job)} onEdit={() => openEditForm(job)} onArchive={() => setArchiveTarget(job)} />
                      ))}
                    </div>
                  </div>
                ))
              : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                  {pagedJobs.map((job) => (
                    <JobCard key={job.id} job={job} onView={() => openViewForm(job)} onEdit={() => openEditForm(job)} onArchive={() => setArchiveTarget(job)} />
                  ))}
                </div>
              )}
          </div>
        ) : (
          <div className="cj-table-wrap page-fill-scroll">
            <table className="cj-table">
              <thead>
                <tr>
                  <th className="cj-th" style={{ width: "36px" }}>
                    <input className="cj-cb" type="checkbox" aria-label="Select all posts" checked={allPageSelected} onChange={toggleSelectAll} />
                  </th>
                  <th className="cj-th" style={{ width: "52px" }}></th>
                  {[
                    ["role", "Role"],
                    ["organization", "Organization"],
                    ["location", "Location"],
                    ["postedOn", "Posted On"],
                    ["status", "Status"],
                  ].map(([key, label]) => (
                    <th key={key} className="cj-th" {...sortHeaderProps(key, sort, toggleSort)}>
                      {label}
                      <SortArrow active={sort.key === key} dir={sort.dir} />
                    </th>
                  ))}
                  <th className="cj-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedJobs
                  ? groupedJobs.map(([label, items]) => (
                      <Fragment key={label}>
                        <tr className="cj-group-row">
                          <td colSpan={8}>
                            {label} <span style={{ fontWeight: 500, color: "#64748b" }}>({items.length})</span>
                          </td>
                        </tr>
                        {items.map(renderJobRow)}
                      </Fragment>
                    ))
                  : pagedJobs.map(renderJobRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT / VIEW FORM MODAL */}
      {showFormModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
          onClick={closeFormModal}
        >
          <div
            style={{ background: "white", borderRadius: "20px", padding: "36px", width: "90vw", maxWidth: "720px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, fontSize: "24px", color: "#1f2937" }}>
                {formMode === "create" && "Create Community Job Post"}
                {formMode === "edit" && "Edit Community Job Post"}
                {formMode === "view" && "Community Job Post"}
              </h2>
              <button onClick={closeFormModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "20px" }}>
                <FaTimes />
              </button>
            </div>

            <CommunityJobFields form={form} updateField={updateField} readOnly={formMode === "view"} />

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              {formMode === "view" ? (
                <>
                  <button
                    onClick={() => setFormMode("edit")}
                    style={{ padding: "12px 24px", backgroundColor: "#c2d45e", color: "#243014", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={closeFormModal}
                    style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={closeFormModal}
                    disabled={saving}
                    style={{ padding: "12px 24px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    style={{ padding: "12px 24px", backgroundColor: "#fff", color: "#5f6f14", border: "2px solid #c2d45e", borderRadius: "30px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}
                  >
                    Save as Draft
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    style={{ padding: "12px 24px", backgroundColor: "#c2d45e", color: "#243014", border: "none", borderRadius: "30px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}
                  >
                    {saving ? "Saving…" : "Publish"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD PHOTOS MODAL */}
      {showUploadModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
          onClick={closeUploadModal}
        >
          <div
            style={{ background: "white", borderRadius: "20px", padding: "36px", width: "90vw", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "22px", color: "#1f2937" }}>Upload Job Photos</h2>
              <button onClick={closeUploadModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "20px" }}>
                <FaTimes />
              </button>
            </div>
            <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "20px" }}>
              Upload up to {MAX_UPLOAD_PHOTOS} photos of a job ad (screenshots, flyers). AI will read them and pre-fill the create-post form — you'll still review and save it yourself.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ border: "2px dashed #cbd5e1", borderRadius: "14px", padding: "28px", textAlign: "center", cursor: "pointer", marginBottom: "16px", color: "#6b7280" }}
            >
              <FaCamera size={28} style={{ marginBottom: "8px", color: "#94a3b8" }} />
              <div>Click to choose photos ({uploadFiles.length}/{MAX_UPLOAD_PHOTOS})</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {uploadFiles.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
                {uploadFiles.map((f, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={f.previewUrl} alt="" style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "10px" }} />
                    <button
                      onClick={() => removeUploadFile(i)}
                      style={{ position: "absolute", top: "4px", right: "4px", background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: "22px", height: "22px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <FaTimes size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {parseError && (
              <div style={{ background: "#fef2f2", color: "#991b1b", padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", border: "1px solid #fecaca" }}>
                {parseError}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  closeUploadModal();
                  openCreateForm();
                }}
                style={{ padding: "12px 20px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
              >
                Fill Manually Instead
              </button>
              <button
                onClick={handleAnalyzePhotos}
                disabled={uploadFiles.length === 0 || parsing}
                style={{ padding: "12px 24px", backgroundColor: "#c2d45e", color: "#243014", borderRadius: "30px", border: "none", fontWeight: "600", cursor: uploadFiles.length === 0 || parsing ? "not-allowed" : "pointer", opacity: uploadFiles.length === 0 || parsing ? 0.6 : 1 }}
              >
                {parsing ? "Analyzing…" : "Analyze Photos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRM MODAL */}
      {archiveTarget && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px" }}
          onClick={() => setArchiveTarget(null)}
        >
          <div
            style={{ background: "white", borderRadius: "20px", padding: "32px", width: "90vw", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: "#1f2937" }}>Archive this post?</h3>
            <p style={{ color: "#4b5563", fontSize: "14px" }}>
              "{archiveTarget.job_designation}" at {archiveTarget.job_company} will be marked closed and hidden from active listings. This can be undone by editing the post later.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                onClick={() => setArchiveTarget(null)}
                style={{ padding: "10px 20px", backgroundColor: "#e5e7eb", color: "#1f2937", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                style={{ padding: "10px 20px", backgroundColor: "#dc2626", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityJobFields({ form, updateField, readOnly }) {
  const isGovt = form.job_org_type === "Government";

  if (readOnly) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px" }}>
        <ReadOnlyRow label="Organization Type" value={isGovt ? "Government" : "Company"} />
        <ReadOnlyRow label={isGovt ? "Department / Ministry Name" : "Company Name"} value={form.job_company} />
        <ReadOnlyRow label="Role / Designation" value={form.job_designation} />
        <ReadOnlyRow label="Job Location" value={form.job_location} />
        <ReadOnlyRow label="Experience Required" value={form.job_experience_required} />
        <ReadOnlyRow label="Education Qualification" value={form.job_education_qualification} />
        <ReadOnlyRow
          label="Salary Range"
          value={form.job_salary_minimum || form.job_salary_maximum ? `₹${form.job_salary_minimum || 0} - ₹${form.job_salary_maximum || 0}` : "—"}
        />
        <ReadOnlyRow label="Working Days" value={form.job_working_days} />
        <ReadOnlyRow label="Shift Time" value={form.job_shift_time} />
        <ReadOnlyRow label="Job Description" value={form.job_description} multiline />
        <ReadOnlyRow label="How to Apply" value={form.job_howtoapply} multiline />
        {form.job_apply_link ? (
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
              Link to Apply
            </div>
            <a href={form.job_apply_link} target="_blank" rel="noreferrer" style={{ fontSize: "14px", color: "#5f6f14", wordBreak: "break-all" }}>
              {form.job_apply_link}
            </a>
          </div>
        ) : (
          <ReadOnlyRow label="Link to Apply" value="" />
        )}
        <ReadOnlyRow label="Posted On" value={formatDateText(form.job_postedon, "")} />
        <ReadOnlyRow label="Status" value={form.job_status || "Closed"} />
      </div>
    );
  }

  return (
    <>
      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Organization Type</label>
        <div style={{ display: "flex", gap: "24px", padding: "2px 0" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#1f2937", cursor: "pointer" }}>
            <input
              type="radio"
              name="job_org_type"
              checked={!isGovt}
              onChange={() => updateField("job_org_type", "Company")}
            />
            Company
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#1f2937", cursor: "pointer" }}>
            <input
              type="radio"
              name="job_org_type"
              checked={isGovt}
              onChange={() => updateField("job_org_type", "Government")}
            />
            Government
          </label>
        </div>
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>{isGovt ? "Department / Ministry Name" : "Company Name"}</label>
        <input
          style={inputStyle}
          value={form.job_company}
          onChange={(e) => updateField("job_company", e.target.value)}
          placeholder={isGovt ? "e.g. Ministry of Railways" : "e.g. Tata Consultancy Services Pvt Ltd"}
        />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Role / Designation</label>
        <input style={inputStyle} value={form.job_designation} onChange={(e) => updateField("job_designation", e.target.value)} placeholder="e.g. Industrial Security Guard" />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Job Location</label>
        <LocationAutocompleteInput
          value={form.job_location}
          onChange={(value) => updateField("job_location", value)}
          placeholder="Search for a location..."
          style={inputStyle}
        />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Experience Required</label>
        <input style={inputStyle} value={form.job_experience_required} onChange={(e) => updateField("job_experience_required", e.target.value)} placeholder="e.g. 5+ Years in Industrial Security" />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Education Qualification</label>
        <input style={inputStyle} value={form.job_education_qualification} onChange={(e) => updateField("job_education_qualification", e.target.value)} placeholder="e.g. Any Graduate" />
      </div>

      <div style={{ ...fieldWrapStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={fieldLabelStyle}>Salary Minimum</label>
          <input type="number" style={inputStyle} value={form.job_salary_minimum} onChange={(e) => updateField("job_salary_minimum", e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={fieldLabelStyle}>Salary Maximum</label>
          <input type="number" style={inputStyle} value={form.job_salary_maximum} onChange={(e) => updateField("job_salary_maximum", e.target.value)} placeholder="0" />
        </div>
      </div>

      <div style={{ ...fieldWrapStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={fieldLabelStyle}>Working Days</label>
          <input style={inputStyle} value={form.job_working_days} onChange={(e) => updateField("job_working_days", e.target.value)} placeholder="e.g. 4 Weekly Offs" />
        </div>
        <div>
          <label style={fieldLabelStyle}>Shift Time</label>
          <input style={inputStyle} value={form.job_shift_time} onChange={(e) => updateField("job_shift_time", e.target.value)} placeholder="e.g. General Shift" />
        </div>
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Job Description</label>
        <textarea style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} value={form.job_description} onChange={(e) => updateField("job_description", e.target.value)} placeholder="Responsibilities, eligibility, skills..." />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>How to Apply</label>
        <textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={form.job_howtoapply} onChange={(e) => updateField("job_howtoapply", e.target.value)} placeholder="Phone, email, subject line, etc." />
      </div>

      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Link to Apply</label>
        <input
          type="url"
          style={inputStyle}
          value={form.job_apply_link}
          onChange={(e) => updateField("job_apply_link", e.target.value)}
          placeholder="e.g. https://company.com/careers/apply"
        />
      </div>

      <div style={{ ...fieldWrapStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={fieldLabelStyle}>Posted On</label>
          <DatePicker
            selected={parsePostedOn(form.job_postedon)}
            onChange={(date) => updateField("job_postedon", formatPostedOn(date))}
            dateFormat="dd MMM yyyy"
            placeholderText="Select date"
            className="date-picker-input"
            wrapperClassName="date-picker-wrapper"
          />
        </div>
        <div>
          <label style={fieldLabelStyle}>Status</label>
          <select style={inputStyle} value={form.job_status} onChange={(e) => updateField("job_status", e.target.value)}>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>
    </>
  );
}

function JobCard({ job, onView, onEdit, onArchive }) {
  const isArchived = !job.job_status;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        opacity: isArchived ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <img
          src={job.job_logo || DEFAULT_LOGO}
          alt=""
          style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain", background: "#f1f5f9", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.job_designation}>
            {job.job_designation || "Untitled Role"}
          </div>
          <div style={{ fontSize: "12.5px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.job_company}>
            {job.job_company || "—"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: "12.5px", color: "#6b7280" }}>{job.job_location || "Location not specified"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            borderRadius: "20px",
            fontSize: "11.5px",
            fontWeight: "700",
            backgroundColor: job.job_isdraft ? "#fef3c7" : "#dcfce7",
            color: job.job_isdraft ? "#92400e" : "#166534",
          }}
        >
          {job.job_isdraft ? "Draft" : "Published"}
        </span>
        {isArchived && <span style={{ fontSize: "11.5px", fontWeight: "700", color: "#991b1b" }}>Archived</span>}
        <span style={{ fontSize: "11.5px", color: "#9ca3af", marginLeft: "auto" }}>{formatDateText(job.job_postedon, "—")}</span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button
          onClick={onView}
          title="View"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: "12.5px", fontWeight: "600", color: "#4b5563" }}
        >
          <FaEye /> View
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #c2d45e", background: "#f1f6d6", cursor: "pointer", fontSize: "12.5px", fontWeight: "600", color: "#5f6f14" }}
        >
          <FaEdit /> Edit
        </button>
        <button
          onClick={onArchive}
          title="Archive"
          disabled={isArchived}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "7px 10px", borderRadius: "8px", border: "1.5px solid #fecaca", background: isArchived ? "#f3f4f6" : "#fef2f2", cursor: isArchived ? "not-allowed" : "pointer", color: isArchived ? "#9ca3af" : "#dc2626" }}
        >
          <FaArchive />
        </button>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value, multiline }) {
  return (
    <div>
      <div style={{ fontSize: "12px", fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", color: "#1f2937", whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value || "—"}</div>
    </div>
  );
}
