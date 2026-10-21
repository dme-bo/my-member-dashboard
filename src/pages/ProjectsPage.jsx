// src/pages/ProjectsPage.jsx
import { useState, useEffect, useMemo, Fragment } from "react";
import {
  collection,
  db,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "../firestoreClient";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar from "../components/OdooViewToolbar";
import FilterAccordionList from "../components/FilterAccordionList";
import FavoritesMenu from "../components/FavoritesMenu";
import { fetchProjectApplicationRows } from "../utils/applicationSources";
import { formatDateDDMMMYYYY } from "../utils/dateFormat";
import SelectionActionMenu from "../components/SelectionActionMenu";
import useTableSort, { sortRows, sortHeaderProps } from "../hooks/useTableSort";
import SortArrow from "../components/SortArrow";

const PROJECTS_GROUP_BY_OPTIONS = [
  { key: "city", label: "City" },
  { key: "projects", label: "Project" },
];

const PROJECTS_FAVORITES_KEY = "projectsPageFavorites";

// Column sort accessors — each returns what the matching table cell shows.
const PROJECTS_SORT_ACCESSORS = {
  full_name: (a) => (a.full_name || "").trim(),
  phone_number: (a) => String(a.phone_number ?? "").trim(),
  city: (a) => (a.city || "").trim(),
  projects: (a) => (a.projects || "").trim(),
};

const kanbanChipStyle ={ padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#475569", fontSize: "10.5px", fontWeight: 600 };

function ApplicationCard({ app, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {app.full_name || "-"}
      </div>
      <div style={{ fontSize: "12px", color: "#64748b" }}>{app.phone_number || "-"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {app.city && <span style={kanbanChipStyle}>{app.city}</span>}
        {app.projects && <span style={kanbanChipStyle}>{app.projects}</span>}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ city: [], projects: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [groupBy, setGroupBy] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Default order: Full Name A→Z (same as before column sorting existed).
  const { sort, toggleSort: toggleSortRaw } = useTableSort({ key: "full_name", dir: "asc" });
  const toggleSort = (key) => {
    toggleSortRaw(key);
    setCurrentPage(1);
  };
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(PROJECTS_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Modal states
  const [selectedApp, setSelectedApp] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });


  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Fetch Applications — legacy projectusersmaster entries plus applicants who
  // applied through the member app to a projectsmaster posting (projects run by
  // TCS are excluded here; they're surfaced under the TCS/Temp Staffing page instead).
  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "projectusersmaster"), orderBy("created_time", "desc"));
        const [querySnapshot, newFlow] = await Promise.all([
          getDocs(q),
          fetchProjectApplicationRows().catch((error) => {
            console.error("Error fetching projectsmaster applications:", error);
            return { projectRows: [] };
          }),
        ]);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setApplications([...data, ...newFlow.projectRows]);
      } catch (error) {
        console.error("Error fetching applications:", error);
        showToast("Failed to load applications.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchApplications();
  }, []);

  // Dynamic Filter Options - Handle comma-separated projects
  const { cityOptions, projectOptions } = useMemo(() => {
    const cities = new Set();
    const projects = new Set();

    applications.forEach(app => {
      if (app.city) cities.add(app.city.trim());

      if (app.projects && typeof app.projects === "string") {
        app.projects.split(",").forEach(p => {
          const trimmed = p.trim();
          if (trimmed) projects.add(trimmed);
        });
      }
    });

    return {
      cityOptions: Array.from(cities).sort(),
      projectOptions: Array.from(projects).sort(),
    };
  }, [applications]);

  const options = { city: cityOptions, projects: projectOptions };
  const filterKeys = ["city", "projects"];
  const filterLabels = { city: "City", projects: "Project" };

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(PROJECTS_FAVORITES_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  };
  const saveCurrentAsFavorite = (name) => {
    persistFavorites([...favorites, { id: Date.now().toString(36), name, searchTerm, filters, groupBy }]);
  };
  const applyFavorite = (fav) => {
    setSearchTerm(fav.searchTerm || "");
    setFilters({ city: [], projects: [], ...(fav.filters || {}) });
    setGroupBy(fav.groupBy || null);
    setCurrentPage(1);
  };
  const deleteFavorite = (id) => persistFavorites(favorites.filter((f) => f.id !== id));

  const clearFilters = () => {
    setFilters({ city: [], projects: [] });
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Filtering Logic - a project application can list several projects
  // (comma-separated), so match if it has ANY of the selected values.
  const matchesProjectFilter = (appProjects, filterValues) => {
    if (!filterValues || filterValues.length === 0) return true;
    if (!appProjects) return false;
    const appProjectsList = appProjects.split(",").map(p => p.trim());
    return filterValues.some(fv => appProjectsList.includes(fv));
  };

  // Wrapped in useMemo: this re-filters+re-sorts the full applications list, and
  // without memoization it re-ran on every render — including every keystroke
  // typed into the detail modal's notes field — causing visible input lag.
  const filteredApplications = useMemo(() => {
  let filteredApplications = applications.filter(app => {
    if (filters.city?.length && !filters.city.includes(app.city)) return false;
    if (filters.projects?.length && !matchesProjectFilter(app.projects, filters.projects)) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      return [
        app.full_name,
        app.phone_number,
        app.city,
        app.email,
        app.projects,
      ].some(field => String(field || "").toLowerCase().includes(term));
    }

    return true;
  });

  // Sort by the selected column (default: Full Name ascending)
  return sortRows(filteredApplications, sort, PROJECTS_SORT_ACCESSORS);
  }, [applications, filters, searchTerm, sort]);

  // Pagination
  const totalItems = filteredApplications.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.ceil(totalItems / rowsPerPage);
  const currentRows = rowsPerPage === Infinity
    ? filteredApplications
    : filteredApplications.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Grouping is applied within the current page's rows (not virtualized).
  const getGroupLabels = (app, key) => {
    if (key === "city") {
      const v = app.city;
      return [v && String(v).trim() ? String(v).trim() : "Unspecified"];
    }
    const raw = app.projects;
    if (!raw) return ["Unspecified"];
    const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : ["Unspecified"];
  };

  const groupedRows = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map();
    for (const app of currentRows) {
      for (const label of getGroupLabels(app, groupBy)) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(app);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, currentRows]);

  const toggleGroupCollapsed = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filterChips = [];
  Object.entries(filters).forEach(([key, values]) => {
    (values || []).forEach((v) => {
      filterChips.push({
        key: `${key}:${v}`,
        label: v,
        onRemove: () => setFilters((prev) => ({ ...prev, [key]: prev[key].filter((x) => x !== v) })),
      });
    });
  });
  if (groupBy) {
    filterChips.push({ key: "groupby", label: `Group: ${filterLabels[groupBy]}`, onRemove: () => setGroupBy(null) });
  }

  const advancedFiltersPanel = (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
        <button
          onClick={clearFilters}
          style={{ padding: "6px 14px", background: "#1976d2", color: "white", border: "none", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontWeight: "700" }}
        >
          Clear All
        </button>
      </div>
      <FilterAccordionList
        sections={filterKeys.map((key) => ({
          key,
          label: filterLabels[key],
          options: options[key] || [],
          selected: filters[key] || [],
          onChange: (next) => {
            setFilters((prev) => ({ ...prev, [key]: next }));
            setCurrentPage(1);
          },
        }))}
      />
    </>
  );

  // Load Interaction Notes
  useEffect(() => {
    if (!selectedApp || activeTab !== "interaction") return;

    const loadNotes = async () => {
      setNotesLoading(true);
      try {
        // Applicants pulled in from projectsmaster are real members, so their
        // notes live under users/{uid}/interactions — the same place
        // MemberDetailModal reads/writes — instead of projectusersmaster.
        const interactionsRef = selectedApp._newFlow
          ? collection(db, "users", selectedApp._uid, "interactions")
          : collection(db, "projectusersmaster", selectedApp.id, "interactions");
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const notes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.createdAt
              ? formatDateDDMMMYYYY(data.createdAt)
              : "Unknown",
            contactPerson: data.contactPerson || selectedApp.full_name,
            notes: data.notes || "-",
            nextAction: data.nextAction || "-",
            followUpDate: data.followUpDate ? formatDateDDMMMYYYY(data.followUpDate) : "-",
          };
        });
        setSavedNotes(notes);
      } catch (err) {
        console.error("Error loading notes:", err);
        showToast("Failed to load notes.", "error");
      } finally {
        setNotesLoading(false);
      }
    };

    loadNotes();
  }, [selectedApp, activeTab]);

  // Modal Handlers
  const openModal = (app) => {
    setSelectedApp(app);
    setActiveTab("personal");
    setNewNotesList([]);
    setSavedNotes([]);
  };

  const closeModal = () => setSelectedApp(null);

  const addNewNote = () => {
    setNewNotesList(prev => [...prev, {
      id: Date.now() + Math.random(),
      contactPerson: selectedApp.full_name,
      notes: "",
      nextAction: "",
      followUpDate: "",
    }]);
  };

  const updateNewNote = (id, field, value) => {
    setNewNotesList(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  const deleteNewNote = (id) => {
    setNewNotesList(prev => prev.filter(n => n.id !== id));
  };

  const handleSaveAllNotes = async () => {
    const validNotes = newNotesList.filter(n => n.notes.trim() || n.nextAction.trim() || n.followUpDate);
    if (validNotes.length === 0) {
      showToast("No notes to save.", "error");
      return;
    }

    setNotesLoading(true);
    try {
      const ref = selectedApp._newFlow
        ? collection(db, "users", selectedApp._uid, "interactions")
        : collection(db, "projectusersmaster", selectedApp.id, "interactions");
      await Promise.all(
        validNotes.map(note =>
          addDoc(ref, {
            contactPerson: note.contactPerson,
            notes: note.notes.trim(),
            nextAction: note.nextAction.trim(),
            followUpDate: note.followUpDate
              ? Timestamp.fromDate(new Date(note.followUpDate + "T00:00:00"))
              : null,
            createdAt: serverTimestamp(),
            createdBy: "admin",
          })
        )
      );

      showToast("Notes saved successfully!", "success");
      setNewNotesList([]);

      // Reload saved notes
      const snapshot = await getDocs(query(ref, orderBy("createdAt", "desc")));
      const updatedNotes = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.createdAt
            ? formatDateDDMMMYYYY(d.createdAt)
            : "Unknown",
          contactPerson: d.contactPerson || selectedApp.full_name,
          notes: d.notes || "-",
          nextAction: d.nextAction || "-",
          followUpDate: d.followUpDate ? formatDateDDMMMYYYY(d.followUpDate) : "-",
        };
      });
      setSavedNotes(updatedNotes);
    } catch (err) {
      console.error(err);
      showToast("Failed to save notes.", "error");
    } finally {
      setNotesLoading(false);
    }
  };

  // Export function
  // Action → Export: only the ticked rows.
  const handleExportSelected = async () => {
    try {
      const rows = filteredApplications.filter((a) => selectedIds.has(a.id));
      const dataToExport = rows.map((app) => ({
        Name: app.name || "-",
        Phone: app.phone || "-",
        City: app.city || "-",
        Project: app.projects || "-",
        Status: app.status || "-",
        "Date Applied": formatDateDDMMMYYYY(app.created_time) || "-",
      }));

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Projects");
      XLSX.writeFile(wb, "projects.xlsx");
      showToast("Export successful!", "success");
    } catch (err) {
      console.error("Export error:", err);
      showToast("Failed to export data.", "error");
    }
  };

  const rangeStart = totalItems === 0 ? 0 : (rowsPerPage === Infinity ? 1 : (currentPage - 1) * rowsPerPage + 1);
  const rangeEnd = rowsPerPage === Infinity ? totalItems : Math.min(currentPage * rowsPerPage, totalItems);
  const prevDisabled = currentPage === 1;
  const nextDisabled = currentPage === totalPages || rowsPerPage === Infinity || totalItems === 0;
  const allRowsSelected = currentRows.length > 0 && currentRows.every((a) => selectedIds.has(a.id));
  const someRowsSelected = !allRowsSelected && currentRows.some((a) => selectedIds.has(a.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allRowsSelected) currentRows.forEach((a) => next.delete(a.id));
      else currentRows.forEach((a) => next.add(a.id));
      return next;
    });
  };
  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const emptyMessage = searchTerm || Object.values(filters).some((v) => v.length)
    ? "No applications found matching your criteria"
    : "No project applications registered yet";

  const renderRow = (app) => (
    <tr key={app.id} className="pj-row" onClick={() => openModal(app)}>
      <td className="pj-td" style={{ width: 36 }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="pj-cb"
          aria-label={`Select ${app.full_name || "application"}`}
          checked={selectedIds.has(app.id)}
          onChange={() => toggleSelectOne(app.id)}
        />
      </td>
      <td className="pj-td">{app.full_name || "-"}</td>
      <td className="pj-td pj-num">{app.phone_number || "-"}</td>
      <td className="pj-td">{app.city || "-"}</td>
      <td className="pj-td">{app.projects || "-"}</td>
    </tr>
  );


  return (
    <div className="member-list-page pj-page page-fill">
      <style>{`
        .pj-page { padding: 0 !important; background: #f4f6f9; color: #212529; min-height: calc(100vh - 64px); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        .pj-header { background: #fff; padding: 32px 32px 16px; border-bottom: 1px solid #dde1e7; display: flex; flex-direction: column; gap: 16px; }
        .pj-header > * { min-height: 34px; }
        .pj-row-flex { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
        .pj-title-row { justify-content: space-between; }
        .pj-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .pj-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .pj-title span { font-size: 14px; color: #64748b; font-weight: 400; }
        .pj-outline-btn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; border-radius: 6px; font: inherit; font-size: 13px; color: #334155; cursor: pointer; white-space: nowrap; }
        .pj-outline-btn:hover { background: #f6f8fa; }
        .pj-primary-btn { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border: 1px solid #2f4a22; background: #2f4a22; color: #fff; border-radius: 6px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .pj-primary-btn:hover { background: #3d5e2d; }
        .pj-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .pj-toolbar-group > div:first-child { gap: 0 !important; }
        .pj-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .pj-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .pj-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .pj-meta-row { justify-content: space-between; gap: 10px; }
        .pj-meta-left, .pj-meta-right { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .pj-select { height: 30px; padding: 0 6px; border: 1px solid #dde1e7; border-radius: 6px; font: inherit; font-size: 12px; background: #fff; color: #334155; cursor: pointer; }
        .pj-range { font-size: 13px; color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .pj-joined { display: flex; }
        .pj-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #dde1e7; background: #fff; color: #475569; cursor: pointer; padding: 0; }
        .pj-icon-btn + .pj-icon-btn { margin-left: -1px; }
        .pj-icon-btn:first-child { border-radius: 6px 0 0 6px; }
        .pj-icon-btn:last-child { border-radius: 0 6px 6px 0; }
        .pj-icon-btn:disabled { color: #b8bec7; cursor: not-allowed; }
        .pj-icon-btn.is-active { background: #e8f1fb; color: #1976D2; }
        .pj-table-wrap { background: #fff; }
        .pj-table-scroll { overflow: auto; max-height: 70vh; min-height: 300px; }
        .pj-table { width: 100%; min-width: 820px; border-collapse: collapse; }
        .pj-th { padding: 11px 12px; text-align: left; font-weight: 600; font-size: 14px; color: #212529; border-bottom: 2px solid #dee2e6; white-space: nowrap; background: #f4f5f0; position: sticky; top: 0; z-index: 2; }
        .pj-td { padding: 9px 12px; border-top: 1px solid #e9ecef; font-size: 14px; color: #3c4047; vertical-align: middle; }
        .pj-num { text-align: right; font-variant-numeric: tabular-nums; }
        .pj-row { cursor: pointer; }
        .pj-row:nth-child(odd) { background: #f7f8fb; }
        .pj-row:hover { background: #eef4fb; }
        .pj-cb { width: 16px; height: 16px; margin: 0; accent-color: #1976D2; cursor: pointer; vertical-align: middle; }
        .pj-group-row td { padding: 8px 12px; font-weight: 600; font-size: 14px; cursor: pointer; background: #f4f5f0; border-top: 1px solid #dee2e6; }
        .pj-pill { display: inline-block; margin-left: 8px; padding: 1px 9px; border-radius: 999px; background: #e3f1e3; color: #1f5c26; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .pj-empty { text-align: center; padding: 60px 20px; color: #6b7280; font-size: 15px; }
        @media (max-width: 767px) { .pj-header { padding: 20px 16px 12px; } }
        /* Match the Members Master List: outline buttons, blue table header, 49px rows. */
        .pj-page { background: #fff; }
        .pj-header { min-height: 0; border-bottom: none; }
        .pj-header > * { min-height: 0; }
        .pj-primary-btn { gap: 7px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; color: #334155; font-size: 13px; font-weight: 400; }
        .pj-primary-btn:hover { background: #fff; }
        .pj-meta-right { gap: 6px; flex-wrap: nowrap; }
        .pj-range { margin: 0 2px; white-space: nowrap; }
        .pj-icon-btn { border-radius: 6px !important; margin-left: 0 !important; }
        .pj-icon-btn:disabled { background: #f8fafc; color: #cbd5e1; }
        .pj-meta-right > div { gap: 6px; }
        .pj-meta-right > div:has(.is-active) { gap: 0; background: #dde1e7; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; margin-left: 2px; }
        .pj-meta-right > div:has(.is-active) .pj-icon-btn { width: 36px; height: 34px; border: none; border-radius: 0 !important; color: #64748b; }
        .pj-icon-btn.is-active { background: #e3f2fd; color: #1976d2; }
        .pj-table-scroll { border-top: 1px solid #dde1e7; }
        .pj-th { height: 45px; padding: 0 10px; font-size: 13px; color: #fff; background: #1976d2; border-bottom: none; }
        .pj-td { height: 49px; padding: 0 10px; border-top: none; border-bottom: 1px solid #dde1e7; font-size: 13px; color: #64748b; }
        .pj-td:nth-child(2) { font-weight: 500; color: #111827; }
        .pj-row { background: #fff; }
        .pj-row:nth-child(odd) { background: #f8fafc; }
        .pj-row:hover { background: inherit; }
        .pj-cb { width: 13px; height: 13px; }
        .pj-th .pj-cb { width: 14px; height: 14px; accent-color: #ffffff; }
        .pj-group-row td { height: 40px; padding: 0 12px; font-size: 13px; color: #334155; background: #f1f5f9; border-top: none; border-bottom: 1px solid #dde1e7; }
        .pj-pill { background: #e3f2fd; color: #1565c0; }
      `}</style>

      <div className="pj-header page-header-band">
        {/* Row 1: title + count, Reset Filters */}
        <div className="pj-row-flex pj-title-row">
          <div className="pj-title">
            <h1>Projects Applications</h1>
            <span>{totalItems.toLocaleString()} Applications</span>
          </div>
          <button type="button" className="pj-outline-btn" onClick={clearFilters}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
            Reset Filters
          </button>
        </div>

        {/* Row 2: search, Filters / Group By / Favorites */}
        <div className="pj-row-flex" style={{ gap: 8 }}>
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by name, phone, city, project..."
            chips={filterChips}
          />
          <div className="pj-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              quickFilters={[]}
              advancedContent={advancedFiltersPanel}
              groupByOptions={PROJECTS_GROUP_BY_OPTIONS}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
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

        {/* Row 3: primary action left; page size, range, pager, view toggle right */}
        <div className="pj-row-flex pj-meta-row">
          <SelectionActionMenu count={selectedIds.size} onExport={handleExportSelected} onClear={() => setSelectedIds(new Set())} />
          <div className="pj-meta-left">
            {groupBy && (
              <span style={{ fontSize: 13, color: "#5f6670" }}>Grouped by {filterLabels[groupBy]}</span>
            )}
          </div>
          <div className="pj-meta-right">
            <select
              className="pj-select"
              aria-label="Records per page"
              value={rowsPerPage === Infinity ? "all" : rowsPerPage}
              onChange={(e) => {
                const val = e.target.value === "all" ? Infinity : Number(e.target.value);
                setRowsPerPage(val);
                setCurrentPage(1);
              }}
            >
              <option value="all">All</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
            <span className="pj-range">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {totalItems.toLocaleString()}</span>
            <div className="pj-joined">
              <button type="button" className="pj-icon-btn" aria-label="Previous page" disabled={prevDisabled} onClick={() => setCurrentPage((p) => p - 1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
              </button>
              <button type="button" className="pj-icon-btn" aria-label="Next page" disabled={nextDisabled} onClick={() => setCurrentPage((p) => p + 1)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
              </button>
            </div>
            <div className="pj-joined">
              <button type="button" className={`pj-icon-btn${viewMode === "list" ? " is-active" : ""}`} aria-label="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
              <button type="button" className={`pj-icon-btn${viewMode === "kanban" ? " is-active" : ""}`} aria-label="Kanban view" aria-pressed={viewMode === "kanban"} onClick={() => setViewMode("kanban")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="4" height="16"/><rect x="10" y="4" width="4" height="10"/><rect x="16" y="4" width="4" height="13"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pj-table-wrap page-fill-mid">
        {loading ? (
          <TableLoadingSpinner label="Loading applications…" />
        ) : viewMode === "kanban" ? (
          <div className="page-fill-scroll" style={{ background: "#fff", padding: "12px 32px" }}>
            {currentRows.length === 0 ? (
              <div className="pj-empty">{emptyMessage}</div>
            ) : groupedRows ? (
              groupedRows.map(([label, rows]) => (
                <div key={label} style={{ marginBottom: "12px" }}>
                  <div
                    onClick={() => toggleGroupCollapsed(label)}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#f4f5f0", borderRadius: "6px", cursor: "pointer", fontWeight: 600 }}
                  >
                    <span style={{ display: "inline-block", transform: collapsedGroups.has(label) ? "rotate(-90deg)" : "none" }}>▾</span>
                    {label} <span className="pj-pill" style={{ marginLeft: 0 }}>{rows.length}</span>
                  </div>
                  {!collapsedGroups.has(label) && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", marginTop: "10px" }}>
                      {rows.map((app) => (
                        <ApplicationCard key={app.id} app={app} onClick={() => openModal(app)} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                {currentRows.map((app) => (
                  <ApplicationCard key={app.id} app={app} onClick={() => openModal(app)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="pj-table-scroll page-fill-scroll">
            <table className="pj-table">
              <thead>
                <tr>
                  <th className="pj-th" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      className="pj-cb"
                      aria-label="Select all applications"
                      checked={allRowsSelected}
                      ref={(el) => { if (el) el.indeterminate = someRowsSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="pj-th" {...sortHeaderProps("full_name", sort, toggleSort)}>Full Name<SortArrow active={sort.key === "full_name"} dir={sort.dir} /></th>
                  <th className="pj-th pj-num" {...sortHeaderProps("phone_number", sort, toggleSort)}>Phone<SortArrow active={sort.key === "phone_number"} dir={sort.dir} /></th>
                  <th className="pj-th" {...sortHeaderProps("city", sort, toggleSort)}>City<SortArrow active={sort.key === "city"} dir={sort.dir} /></th>
                  <th className="pj-th" {...sortHeaderProps("projects", sort, toggleSort)}>Project<SortArrow active={sort.key === "projects"} dir={sort.dir} /></th>
                </tr>
              </thead>
              <tbody>
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="pj-empty">{emptyMessage}</td>
                  </tr>
                ) : groupedRows ? (
                  groupedRows.map(([label, rows]) => (
                    <Fragment key={label}>
                      <tr className="pj-group-row">
                        <td colSpan={5} onClick={() => toggleGroupCollapsed(label)}>
                          <span style={{ display: "inline-block", marginRight: "8px", transform: collapsedGroups.has(label) ? "rotate(-90deg)" : "none" }}>▾</span>
                          {label}<span className="pj-pill">{rows.length}</span>
                        </td>
                      </tr>
                      {!collapsedGroups.has(label) && rows.map(renderRow)}
                    </Fragment>
                  ))
                ) : (
                  currentRows.map(renderRow)
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL - Fixed Size & Stable */}
      {selectedApp && (
        <>
          {/* Toast */}
          {toast.show && (
            <div style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              backgroundColor: toast.type === "success" ? "#16a34a" : "#dc2626",
              color: "white",
              padding: "14px 24px",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {toast.type === "success" ? (
                  <path d="M20 6L9 17l-5-5" />
                ) : (
                  <path d="M18 6L6 18M6 6l12 12" />
                )}
              </svg>
              <span style={{ fontWeight: "500" }}>{toast.message}</span>
            </div>
          )}

          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: "20px",
            }}
            onClick={closeModal}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: "12px",
                width: "100%",
                maxWidth: "1000px",
                height: "90vh",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: "24px",
                  borderBottom: "1px solid #eee",
                  backgroundColor: "#1e40af",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: "24px" }}>
                    {selectedApp.full_name || "N/A"}
                  </h2>
                  <p style={{ margin: "8px 0 0" }}>
                    Phone: {selectedApp.phone_number || "-"} | City: {selectedApp.city || "-"}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  style={{ background: "none", border: "none", fontSize: "28px", cursor: "pointer", color: "#fff" }}
                >
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #eee", background: "#f8fafc", flexShrink: 0 }}>
                {["personal", "documents", "interaction"].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "14px 24px",
                      border: "none",
                      background: "none",
                      fontWeight: activeTab === tab ? "600" : "400",
                      color: activeTab === tab ? "#1e40af" : "#666",
                      borderBottom: activeTab === tab ? "3px solid #1e40af" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {tab === "personal" && "Personal Info"}
                    {tab === "documents" && "Documents & ID"}
                    {tab === "interaction" && "Interaction & Notes"}
                  </button>
                ))}
              </div>

              {/* Body - Scrollable */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
                {activeTab === "personal" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Full Name</td><td>{selectedApp.full_name || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Phone</td><td>{selectedApp.phone_number || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedApp.email || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>City</td><td>{selectedApp.city || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Projects</td><td>{selectedApp.projects || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {activeTab === "documents" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Aadhaar Number</td><td>{selectedApp.aadhar_number || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>PAN Number</td><td>{selectedApp.pan_number || "-"}</td></tr>
                    </tbody>
                  </table>
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
                          disabled={notesLoading}
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
                              disabled={notesLoading}
                              style={{
                                padding: "12px 32px",
                                backgroundColor: "#16a34a",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                fontWeight: "600",
                                cursor: notesLoading ? "not-allowed" : "pointer",
                                opacity: notesLoading ? 0.7 : 1,
                              }}
                            >
                              {notesLoading ? "Saving..." : "SAVE ALL NOTES"}
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

                      {notesLoading && <p style={{ textAlign: "center", color: "#6b7280" }}>Loading history...</p>}

                      {!notesLoading && savedNotes.length === 0 && (
                        <p style={{ textAlign: "center", color: "#9ca3af", fontStyle: "italic", padding: "50px 0" }}>
                          No past interactions recorded yet.
                        </p>
                      )}

                      {!notesLoading && savedNotes.length > 0 && (
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
              <div style={{ padding: "20px 24px", borderTop: "1px solid #eee", textAlign: "right", flexShrink: 0 }}>
                <button
                  onClick={closeModal}
                  style={{
                    padding: "10px 24px",
                    background: "#1e40af",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "16px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}