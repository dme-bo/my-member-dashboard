// src/pages/CommunityJobsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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
  FaSearch,
} from "react-icons/fa";
import { collection, db, addDoc, doc, getDocs, updateDoc } from "../firestoreClient";
import SkeletonLoader from "../components/SkeletonLoader";
import LocationAutocompleteInput from "../components/LocationAutocompleteInput";

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

const emptyForm = () => ({
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

    return list;
  }, [jobs, searchTerm, postedOnFilter]);

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
      showToast("Company Name and Role/Designation are required.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
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

  if (loading) {
    return <SkeletonLoader rows={6} fullPage label="Loading Community Jobs…" />;
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f4f6f9", padding: "20px" }}>
        <div style={{ background: "white", padding: "40px 60px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: "500px" }}>
          <h2 style={{ color: "#1f2937", marginBottom: "16px" }}>Something went wrong</h2>
          <p style={{ color: "#4b5563", marginBottom: "24px" }}>{error}</p>
          <button
            onClick={fetchJobs}
            style={{ padding: "12px 32px", backgroundColor: "#1976d2", color: "white", border: "none", borderRadius: "12px", fontWeight: "600", cursor: "pointer", fontSize: "1rem" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#f4f6f9", minHeight: "100vh", padding: "20px" }}>
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
          border-color: #1976d2;
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
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div style={{ position: "relative", minWidth: "260px", flex: "1", maxWidth: "420px" }}>
          <FaSearch style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            type="text"
            placeholder="Search by role, company, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", padding: "12px 16px 12px 40px", borderRadius: "30px", border: "2px solid #e2e8f0", fontSize: "14px", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={openUploadModal}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "#ffffff", color: "#1976d2", border: "2px solid #1976d2", borderRadius: "30px", cursor: "pointer", fontWeight: "700" }}
          >
            <FaCamera /> Upload Photos
          </button>
          <button
            onClick={() => openCreateForm()}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", backgroundColor: "#1976d2", color: "white", border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "700" }}
          >
            <FaPlus /> Create New Post
          </button>
        </div>
      </header>

      {postedOnFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#eff6ff", color: "#1e40af", padding: "10px 18px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", fontWeight: "600" }}>
          Showing jobs posted on {postedOnFilter}
          <button
            onClick={() => setPostedOnFilter("")}
            style={{ background: "none", border: "none", color: "#1e40af", textDecoration: "underline", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* TABLE LIST */}
      {filteredJobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "#666", background: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
          <FaBriefcase size={40} style={{ color: "#cbd5e1", marginBottom: "16px" }} />
          <p style={{ fontSize: "16px" }}>No community jobs found.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", minWidth: "100%" }}>
          <table
            style={{
              width: "100%",
              minWidth: "900px",
              tableLayout: "fixed",
              borderCollapse: "separate",
              borderSpacing: "0 10px",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#1976d2", color: "white" }}>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", borderTopLeftRadius: "12px", borderBottomLeftRadius: "12px", width: "56px" }}></th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Role</th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Company</th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "700" }}>Location</th>
                <th style={{ padding: "16px", textAlign: "left", fontWeight: "700", width: "130px" }}>Posted On</th>
                <th style={{ padding: "16px", textAlign: "center", fontWeight: "700", width: "130px" }}>Status</th>
                <th style={{ padding: "16px", textAlign: "center", fontWeight: "700", borderTopRightRadius: "12px", borderBottomRightRadius: "12px", width: "220px" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const isArchived = !job.job_status;
                return (
                  <tr
                    key={job.id}
                    data-testid={`community-job-card-${job.id}`}
                    style={{ backgroundColor: "white", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", opacity: isArchived ? 0.6 : 1 }}
                  >
                    <td style={{ padding: "12px 16px", borderTopLeftRadius: "12px", borderBottomLeftRadius: "12px" }}>
                      <img
                        src={job.job_logo || DEFAULT_LOGO}
                        alt=""
                        style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "contain", background: "#f1f5f9" }}
                      />
                    </td>
                    <td style={{ padding: "16px", fontWeight: "700", color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.job_designation}>
                      {job.job_designation || "Untitled Role"}
                    </td>
                    <td style={{ padding: "16px", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.job_company}>
                      {job.job_company || "—"}
                    </td>
                    <td style={{ padding: "16px", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={job.job_location}>
                      {job.job_location || "Location not specified"}
                    </td>
                    <td style={{ padding: "16px", color: "#6b7280", fontSize: "13px" }}>{job.job_postedon || "—"}</td>
                    <td style={{ padding: "16px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          backgroundColor: job.job_isdraft ? "#fef3c7" : "#dcfce7",
                          color: job.job_isdraft ? "#92400e" : "#166534",
                        }}
                      >
                        {job.job_isdraft ? "Draft" : "Published"}
                      </span>
                      {isArchived && (
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#991b1b", marginTop: "4px" }}>Archived</div>
                      )}
                    </td>
                    <td style={{ padding: "16px", borderTopRightRadius: "12px", borderBottomRightRadius: "12px" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                        <button
                          onClick={() => openViewForm(job)}
                          title="View"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 12px", borderRadius: "10px", border: "1.5px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#4b5563" }}
                        >
                          <FaEye /> View
                        </button>
                        <button
                          onClick={() => openEditForm(job)}
                          title="Edit"
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 12px", borderRadius: "10px", border: "1.5px solid #1976d2", background: "#eff6ff", cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#1976d2" }}
                        >
                          <FaEdit /> Edit
                        </button>
                        <button
                          onClick={() => setArchiveTarget(job)}
                          title="Archive"
                          disabled={isArchived}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 12px", borderRadius: "10px", border: "1.5px solid #fecaca", background: isArchived ? "#f3f4f6" : "#fef2f2", cursor: isArchived ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: "600", color: isArchived ? "#9ca3af" : "#dc2626" }}
                        >
                          <FaArchive />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                    style={{ padding: "12px 24px", backgroundColor: "#1976d2", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: "pointer" }}
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
                    style={{ padding: "12px 24px", backgroundColor: "#fff", color: "#1976d2", border: "2px solid #1976d2", borderRadius: "30px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}
                  >
                    Save as Draft
                  </button>
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    style={{ padding: "12px 24px", backgroundColor: "#1976d2", color: "white", border: "none", borderRadius: "30px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}
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
                style={{ padding: "12px 24px", backgroundColor: "#1976d2", color: "white", borderRadius: "30px", border: "none", fontWeight: "600", cursor: uploadFiles.length === 0 || parsing ? "not-allowed" : "pointer", opacity: uploadFiles.length === 0 || parsing ? 0.6 : 1 }}
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
  if (readOnly) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px" }}>
        <ReadOnlyRow label="Company Name" value={form.job_company} />
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
        <ReadOnlyRow label="Posted On" value={form.job_postedon} />
        <ReadOnlyRow label="Status" value={form.job_status || "Closed"} />
      </div>
    );
  }

  return (
    <>
      <div style={fieldWrapStyle}>
        <label style={fieldLabelStyle}>Company Name</label>
        <input style={inputStyle} value={form.job_company} onChange={(e) => updateField("job_company", e.target.value)} placeholder="e.g. Tata Consultancy Services Pvt Ltd" />
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

function ReadOnlyRow({ label, value, multiline }) {
  return (
    <div>
      <div style={{ fontSize: "12px", fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", color: "#1f2937", whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value || "—"}</div>
    </div>
  );
}
