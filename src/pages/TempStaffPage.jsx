// src/pages/TempStaffPage.jsx
import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import {
  collection,
  db,
  query,
  onSnapshot,
  addDoc,
  getDocs,
  orderBy,
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

// Default order (and the "third click" state): Full Name A→Z.
const DEFAULT_SORT = { key: "full_name", dir: "asc" };

const kanbanChipStyle = { padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#475569", fontSize: "10.5px", fontWeight: 600 };

function TempStaffCard({ item, viewMode, onClick }) {
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
        {item.full_name || "-"}
      </div>
      <div style={{ fontSize: "12px", color: "#64748b" }}>{item.contact_number || "-"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {viewMode === "applications" ? (
          <>
            {item.city && <span style={kanbanChipStyle}>{item.city}</span>}
            {item.role && <span style={kanbanChipStyle}>{item.role}</span>}
            {item.coordinator_name && <span style={kanbanChipStyle}>{item.coordinator_name}</span>}
          </>
        ) : (
          <>
            {item.coordinator_type && <span style={kanbanChipStyle}>{item.coordinator_type}</span>}
            {Array.isArray(item.locations) && item.locations.slice(0, 2).map((l, i) => l.city && <span key={i} style={kanbanChipStyle}>{l.city}</span>)}
          </>
        )}
      </div>
      {viewMode === "applications" && item.status && (
        <span
          style={{
            alignSelf: "flex-start",
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "10.5px",
            fontWeight: 700,
            background: item.status === "Active" ? "#d4edda" : item.status === "Inactive" ? "#f8d7da" : "#fff3cd",
            color: item.status === "Active" ? "#155724" : item.status === "Inactive" ? "#721c24" : "#856404",
          }}
        >
          {item.status}
        </span>
      )}
    </div>
  );
}

export default function TempStaffPage() {
  const [selectedMember, setSelectedMember] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ city: [], coordinator_type: [], status: [], role: [], coordinator_name: [] });
  const [membersData, setMembersData] = useState([]); // TCS Applications (legacy tcsusersmaster)
  const [newFlowTcsApplications, setNewFlowTcsApplications] = useState([]); // TCS-run projects from projectsmaster
  const [coordinatorsData, setCoordinatorsData] = useState([]); // Coordinators
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("applications"); // "applications" or "coordinators"
  const [groupBy, setGroupBy] = useState(null);
  const [kanbanView, setKanbanView] = useState("list");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem("tcsPageFavorites");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Modal states
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // Column sorting. The 4th column's key differs per viewMode, so reset the
  // sort to the default whenever viewMode changes.
  const { sort, setSort, toggleSort } = useTableSort(DEFAULT_SORT);
  const [sortViewMode, setSortViewMode] = useState(viewMode);
  if (sortViewMode !== viewMode) {
    setSortViewMode(viewMode);
    setSort(DEFAULT_SORT);
  }
  const handleSort = (key) => {
    toggleSort(key);
    setCurrentPage(1);
  };
  const sortTh = (key, label, className = "tcs-th") => (
    <th className={className} {...sortHeaderProps(key, sort, handleSort)}>
      {label}
      <SortArrow active={sort.key === key} dir={sort.dir} />
    </th>
  );


  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Both listeners below poll a full collection every 10s (see firestoreClient.js's
  // onSnapshot). Their queries don't depend on viewMode, so a ref (rather than a
  // [viewMode] dependency) lets the "which tab is loading" check stay current
  // without tearing down and resubscribing (== an extra full refetch of both
  // collections) on every tab toggle.
  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  // Fetch TCS Applications
  useEffect(() => {
    const q = query(collection(db, "tcsusersmaster"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), type: "application" }));
        setMembersData(data);
        if (viewModeRef.current === "applications") setLoading(false);
      },
      (err) => {
        console.error("Firestore Error (applications):", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Applicants who applied through the member app to a projectsmaster posting
  // run by TCS — fetched once (not polled like the legacy collection above)
  // and merged into the Applications view below.
  useEffect(() => {
    let cancelled = false;
    fetchProjectApplicationRows()
      .then(({ tcsRows }) => {
        if (!cancelled) setNewFlowTcsApplications(tcsRows);
      })
      .catch((error) => console.error("Error fetching TCS project applications:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch Coordinators
  useEffect(() => {
    const q = query(collection(db, "tcscoordinatorusersmaster"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), type: "coordinator" }));
        setCoordinatorsData(data);
        if (viewModeRef.current === "coordinators") setLoading(false);
      },
      (err) => {
        console.error("Firestore Error (coordinators):", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Current data
  const currentData = useMemo(
    () => (viewMode === "applications" ? [...membersData, ...newFlowTcsApplications] : coordinatorsData),
    [viewMode, membersData, newFlowTcsApplications, coordinatorsData]
  );

  // Dynamic filter options
  const dynamicFilterOptions = useMemo(() => {
    const uniqueCities = new Set();
    const uniqueCoordinatorTypes = new Set();
    const uniqueStatuses = new Set();
    const uniqueRoles = new Set();
    const uniqueCoordinatorNames = new Set();

    currentData.forEach((item) => {
      if (viewMode === "applications") {
        if (item.city) uniqueCities.add(item.city.trim());
        if (item.status) uniqueStatuses.add(item.status.trim());
        if (item.role) uniqueRoles.add(item.role.trim());
        if (item.coordinator_name) uniqueCoordinatorNames.add(item.coordinator_name.trim());
      } else {
        if (Array.isArray(item.locations)) {
          item.locations.forEach((loc) => {
            if (loc.city) uniqueCities.add(loc.city.trim());
          });
        }
        if (item.coordinator_type) uniqueCoordinatorTypes.add(item.coordinator_type.trim());
      }
    });

    return {
      city: Array.from(uniqueCities).sort(),
      coordinator_type: Array.from(uniqueCoordinatorTypes).sort(),
      status: Array.from(uniqueStatuses).sort(),
      role: Array.from(uniqueRoles).sort(),
      coordinator_name: Array.from(uniqueCoordinatorNames).sort(),
    };
  }, [currentData, viewMode]);

  // Load interaction notes
  useEffect(() => {
    if (!selectedMember || activeTab !== "interaction") return;

    const fetchNotes = async () => {
      setNotesLoading(true);
      try {
        // Applicants pulled in from a TCS-run projectsmaster posting are real
        // members, so their notes live under users/{uid}/interactions — the
        // same place MemberDetailModal reads/writes — instead of tcsusersmaster.
        let interactionsRef;
        if (selectedMember._newFlow) {
          interactionsRef = collection(db, "users", selectedMember._uid, "interactions");
        } else {
          const collectionName =
            selectedMember.type === "coordinator" ? "tcscoordinatorusersmaster" : "tcsusersmaster";
          interactionsRef = collection(db, collectionName, selectedMember.id, "interactions");
        }
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const notes = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.createdAt
              ? formatDateDDMMMYYYY(data.createdAt)
              : "Unknown",
            contactPerson: data.contactPerson || selectedMember.full_name,
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

    fetchNotes();
  }, [selectedMember, activeTab]);

  // Filtered and sorted data
  const filteredAndSortedMembers = useMemo(() => {
    let list = currentData;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((m) =>
        [
          m.full_name,
          m.contact_number,
          m.email_id,
          m.resources_id,
          m.aadhar_number,
          m.pan_number,
          m.coordinator_name,
          m.role,
          m.state,
          m.city,
          ...(Array.isArray(m.locations) ? m.locations.map((l) => l.city) : []),
        ].some((field) => String(field || "").toLowerCase().includes(term))
      );
    }

    if (filters.city?.length) {
      if (viewMode === "applications") {
        list = list.filter((m) => filters.city.includes(String(m.city || "").trim()));
      } else {
        list = list.filter((m) =>
          Array.isArray(m.locations) && m.locations.some((loc) => filters.city.includes(String(loc.city || "").trim()))
        );
      }
    }
    if (filters.coordinator_type?.length) {
      list = list.filter((m) => filters.coordinator_type.includes(String(m.coordinator_type || "").trim()));
    }
    if (filters.status?.length) {
      list = list.filter((m) => filters.status.includes(String(m.status || "").trim()));
    }
    if (filters.role?.length) {
      list = list.filter((m) => filters.role.includes(String(m.role || "").trim()));
    }
    if (filters.coordinator_name?.length) {
      list = list.filter((m) => filters.coordinator_name.includes(String(m.coordinator_name || "").trim()));
    }

    // Accessors mirror what each cell displays.
    const accessors = {
      full_name: (m) => String(m.full_name || "").trim(),
      contact_number: (m) => String(m.contact_number || "").trim(),
      city: (m) =>
        viewMode === "applications"
          ? String(m.city || "").trim()
          : Array.isArray(m.locations)
          ? m.locations.map((l) => l.city).join(", ").trim()
          : "",
      coordinator_name: (m) => String(m.coordinator_name || "").trim(),
      coordinator_type: (m) => String(m.coordinator_type || "").trim(),
    };

    return sortRows(list, sort, accessors);
  }, [searchTerm, filters, currentData, viewMode, sort]);

  const totalPages = Math.ceil(filteredAndSortedMembers.length / (rowsPerPage === Infinity ? 1 : rowsPerPage));
  const currentRows = rowsPerPage === Infinity
    ? filteredAndSortedMembers
    : filteredAndSortedMembers.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
      );

  // Grouping is applied within the current page's rows (not virtualized).
  const groupedRows = useMemo(() => {
    if (!groupBy) return null;

    const getGroupLabels = (item, key) => {
      if (key === "city") {
        if (viewMode === "applications") {
          const v = item.city;
          return [v && String(v).trim() ? String(v).trim() : "Unspecified"];
        }
        const cities = (Array.isArray(item.locations) ? item.locations : []).map((l) => String(l.city || "").trim()).filter(Boolean);
        return cities.length ? cities : ["Unspecified"];
      }
      const raw = item[key];
      return [raw && String(raw).trim() ? String(raw).trim() : "Unspecified"];
    };

    const groups = new Map();
    for (const item of currentRows) {
      for (const label of getGroupLabels(item, groupBy)) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, currentRows, viewMode]);

  const toggleGroupCollapsed = (key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({ city: [], coordinator_type: [], status: [], role: [], coordinator_name: [] });
    setSearchTerm("");
    setCurrentPage(1);
  };

  const openModal = (member) => {
    setSelectedMember(member);
    setActiveTab("personal");
    setNewNotesList([]);
    setSavedNotes([]);
  };

  const closeModal = () => setSelectedMember(null);

  const addNewNote = () => {
    setNewNotesList([
      ...newNotesList,
      {
        id: Date.now() + Math.random(),
        contactPerson: selectedMember.full_name,
        notes: "",
        nextAction: "",
        followUpDate: "",
      },
    ]);
  };

  const updateNewNote = (id, field, value) => {
    setNewNotesList(newNotesList.map((n) => (n.id === id ? { ...n, [field]: value } : n)));
  };

  const deleteNewNote = (id) => {
    setNewNotesList(newNotesList.filter((n) => n.id !== id));
  };

  const handleSaveAllNotes = async () => {
    const valid = newNotesList.filter((n) => n.notes.trim() || n.nextAction.trim() || n.followUpDate);
    if (valid.length === 0) {
      showToast("No notes to save.", "error");
      return;
    }

    setNotesLoading(true);
    try {
      let ref;
      if (selectedMember._newFlow) {
        ref = collection(db, "users", selectedMember._uid, "interactions");
      } else {
        const collectionName =
          selectedMember.type === "coordinator" ? "tcscoordinatorusersmaster" : "tcsusersmaster";
        ref = collection(db, collectionName, selectedMember.id, "interactions");
      }
      await Promise.all(
        valid.map((note) =>
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

      const snapshot = await getDocs(query(ref, orderBy("createdAt", "desc")));
      const updated = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.createdAt
            ? formatDateDDMMMYYYY(d.createdAt)
            : "Unknown",
          contactPerson: d.contactPerson || selectedMember.full_name,
          notes: d.notes || "-",
          nextAction: d.nextAction || "-",
          followUpDate: d.followUpDate ? formatDateDDMMMYYYY(d.followUpDate) : "-",
        };
      });
      setSavedNotes(updated);
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
      const source = viewMode === "applications" ? membersData : coordinatorsData;
      const dataToExport = source.filter((item) => selectedIds.has(item.id)).map((item) => {
        if (viewMode === "applications") {
          return {
            Name: item.name || "-",
            Phone: item.phone || "-",
            City: item.city || "-",
            Role: item.role || "-",
            Status: item.status || "-",
            "Coordinator Name": item.coordinator_name || "-",
          };
        } else {
          const locations = Array.isArray(item.locations) ? item.locations.map(l => l.city || "-").join(", ") : "-";
          return {
            "Coordinator Name": item.coordinatorName || "-",
            "Coordinator Type": item.coordinator_type || "-",
            Locations: locations,
            Email: item.email || "-",
            Phone: item.phone || "-",
          };
        }
      });

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data");
      XLSX.writeFile(wb, viewMode === "applications" ? "temp-staff-applications.xlsx" : "coordinators.xlsx");
      showToast("Export successful!", "success");
    } catch (err) {
      console.error("Export error:", err);
      showToast("Failed to export data.", "error");
    }
  };

  const filterKeys = viewMode === "applications"
    ? ["coordinator_name", "city", "status", "role"]
    : ["city", "coordinator_type"];
  const filterLabels = { coordinator_name: "Coordinator", city: "City", status: "Status", role: "Role", coordinator_type: "Coordinator Type" };
  const groupByOptions = filterKeys.map((key) => ({ key, label: filterLabels[key] }));

  const filterChips = [];
  Object.entries(filters).forEach(([key, values]) => {
    if (!filterKeys.includes(key)) return;
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
          options: dynamicFilterOptions[key] || [],
          selected: filters[key] || [],
          onChange: (next) => {
            setFilters((prev) => ({ ...prev, [key]: next }));
            setCurrentPage(1);
          },
        }))}
      />
    </>
  );

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem("tcsPageFavorites", JSON.stringify(next));
    } catch {
      /* ignore storage errors */
    }
  };
  const saveCurrentAsFavorite = (name) => {
    persistFavorites([...favorites, { id: String(Date.now()), name, searchTerm, filters, groupBy }]);
  };
  const applyFavorite = (fav) => {
    setSearchTerm(fav.searchTerm || "");
    setFilters({ city: [], coordinator_type: [], status: [], role: [], coordinator_name: [], ...(fav.filters || {}) });
    setGroupBy(fav.groupBy || null);
    setCurrentPage(1);
  };
  const deleteFavorite = (id) => persistFavorites(favorites.filter((f) => f.id !== id));

  const allPageSelected = currentRows.length > 0 && currentRows.every((r) => selectedIds.has(r.id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (currentRows.every((r) => next.has(r.id))) currentRows.forEach((r) => next.delete(r.id));
      else currentRows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rangeStart = rowsPerPage === Infinity ? 1 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = rowsPerPage === Infinity
    ? filteredAndSortedMembers.length
    : Math.min(currentPage * rowsPerPage, filteredAndSortedMembers.length);

  const renderRow = (item) => (
    <tr key={item.id} className="tcs-row" onClick={() => openModal(item)}>
      <td className="tcs-td" onClick={(e) => e.stopPropagation()}>
        <input
          className="tcs-cb"
          type="checkbox"
          aria-label={`Select ${item.full_name || "row"}`}
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelected(item.id)}
        />
      </td>
      <td className="tcs-td">{item.full_name || "-"}</td>
      <td className="tcs-td tcs-num">{item.contact_number || "-"}</td>
      <td className="tcs-td">
        {viewMode === "applications"
          ? item.city || "-"
          : Array.isArray(item.locations)
          ? item.locations.map((l) => l.city).join(", ") || "-"
          : "-"}
      </td>
      <td className="tcs-td">
        {viewMode === "applications" ? item.coordinator_name || "-" : item.coordinator_type || "-"}
      </td>
    </tr>
  );


  return (
    <div className="member-list-page tcs-page page-fill">
      <style>{`
        /* Header band + table mirror the Members Master List (MemberListPage). */
        .tcs-page { padding: 0 !important; max-width: none; background: #fff; min-height: calc(100vh - 64px); width: 100%; box-sizing: border-box; }
        .tcs-header { background: #fff; padding: 32px 32px 16px; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box; }
        .tcs-title-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
        .tcs-title { display: flex; align-items: baseline; gap: 12px; }
        .tcs-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .tcs-title span { font-size: 14px; color: #64748b; font-weight: 400; }
        .tcs-outline-btn { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; border-radius: 6px; font: inherit; font-size: 13px; font-weight: 400; color: #334155; cursor: pointer; white-space: nowrap; }
        .tcs-primary-btn { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 11px; border: 1px solid #dde1e7; background: #fff; color: #334155; border-radius: 6px; font: inherit; font-size: 13px; font-weight: 400; cursor: pointer; white-space: nowrap; }
        .tcs-controls-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .tcs-meta-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; }
        .tcs-meta-left { display: flex; align-items: center; gap: 16px; }
        .tcs-meta-right { display: flex; align-items: center; gap: 6px; }
        .tcs-select { height: 30px; padding: 0 6px; border: 1px solid #dde1e7; border-radius: 6px; font: inherit; font-size: 12px; background: #fff; color: #334155; cursor: pointer; }
        .tcs-range { font-size: 13px; color: #111827; font-weight: 600; white-space: nowrap; margin: 0 2px; }
        .tcs-joined { display: flex; gap: 6px; }
        .tcs-icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #dde1e7; border-radius: 6px; background: #fff; color: #475569; cursor: pointer; padding: 0; }
        .tcs-icon-btn:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }
        .tcs-joined.tcs-view-toggle { gap: 0; background: #dde1e7; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; margin-left: 2px; }
        .tcs-view-toggle .tcs-icon-btn { width: 36px; height: 34px; border: none; border-radius: 0; color: #64748b; }
        .tcs-view-toggle .tcs-icon-btn[aria-pressed="true"] { background: #e3f2fd; color: #1976d2; }
        .tcs-table-wrap { background: #fff; border-top: 1px solid #dde1e7; overflow-x: auto; }
        .tcs-table { width: 100%; min-width: 820px; border-collapse: collapse; }
        .tcs-th { height: 45px; padding: 0 10px; text-align: left; font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap; background: #1976d2; position: sticky; top: 0; z-index: 2; }
        .tcs-td { height: 49px; padding: 0 10px; border-bottom: 1px solid #dde1e7; font-size: 13px; color: #64748b; white-space: nowrap; vertical-align: middle; }
        .tcs-td:nth-child(2) { font-weight: 500; color: #111827; }
        .tcs-num { text-align: right; }
        .tcs-row { cursor: pointer; background: #fff; }
        .tcs-row:nth-child(odd) { background: #f8fafc; }
        .tcs-cb { width: 13px; height: 13px; margin: 0; accent-color: #1976d2; cursor: pointer; vertical-align: middle; }
        .tcs-th .tcs-cb { width: 14px; height: 14px; accent-color: #ffffff; }
        .tcs-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #e3f2fd; color: #1565c0; font-size: 12px; font-weight: 600; margin-left: 6px; }
        .tcs-group-row td { height: 40px; padding: 0 12px; font-size: 13px; font-weight: 600; cursor: pointer; background: #f1f5f9; color: #334155; border-bottom: 1px solid #dde1e7; }
        .tcs-page .content-with-sidebar { margin-top: 0; gap: 0; }
        .tcs-page .table-container { border: none; border-radius: 0; box-shadow: none; }
        .tcs-empty { padding: 48px 20px; text-align: center; color: #94a3b8; font-size: 14px; }
        @media (max-width: 640px) { .tcs-header { padding: 20px 16px 12px; } }
      `}</style>

      {/* Header block */}
      <div className="tcs-header page-header-band">
        <div className="tcs-title-row">
          <div className="tcs-title">
            <h1>{viewMode === "applications" ? "TCS Applications" : "TCS Coordinators"}</h1>
            <span>{filteredAndSortedMembers.length.toLocaleString()} {viewMode === "applications" ? "Applications" : "Coordinators"}</span>
          </div>
          <button type="button" className="tcs-outline-btn" onClick={clearFilters}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
            Reset Filters
          </button>
        </div>

        <div className="tcs-controls-row">
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={`Search by Name, Mobile${viewMode === "applications" ? ", Aadhaar, PAN" : ", Email"}...`}
            chips={filterChips}
          />

          <div className="member-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              quickFilters={[]}
              advancedContent={advancedFiltersPanel}
              groupByOptions={groupByOptions}
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

        <div className="tcs-meta-row">
          <SelectionActionMenu count={selectedIds.size} onExport={handleExportSelected} onClear={() => setSelectedIds(new Set())} />
          <div className="tcs-meta-left">
          </div>
          <div className="tcs-meta-right">
            <select
              className="tcs-select"
              aria-label="Records per page"
              value={rowsPerPage === Infinity ? "all" : rowsPerPage}
              onChange={(e) => {
                const value = e.target.value === "all" ? Infinity : Number(e.target.value);
                setRowsPerPage(value);
                setCurrentPage(1);
              }}
            >
              <option value="all">All</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
            <span className="tcs-range">
              {filteredAndSortedMembers.length === 0
                ? "0 / 0"
                : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} / ${filteredAndSortedMembers.length.toLocaleString()}`}
            </span>
            <div className="tcs-joined">
              <button
                type="button"
                className="tcs-icon-btn"
                aria-label="Previous page"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button
                type="button"
                className="tcs-icon-btn"
                aria-label="Next page"
                disabled={currentPage === totalPages || rowsPerPage === Infinity || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
            <div className="tcs-joined tcs-view-toggle">
              <button type="button" className="tcs-icon-btn" aria-label="List view" aria-pressed={kanbanView === "list"} onClick={() => setKanbanView("list")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button type="button" className="tcs-icon-btn" aria-label="Kanban view" aria-pressed={kanbanView === "kanban"} onClick={() => setKanbanView("kanban")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="4" height="16" /><rect x="10" y="4" width="4" height="10" /><rect x="16" y="4" width="4" height="13" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="content-with-sidebar page-fill-mid">
        <div className="table-container page-fill-mid" style={{ width: "100%" }}>
          {loading ? (
            <TableLoadingSpinner label={`Loading ${viewMode === "applications" ? "TCS Applications" : "Coordinators"}…`} />
          ) : kanbanView === "kanban" ? (
            <div className="page-fill-scroll" style={{ background: "#fff", padding: "16px 32px" }}>
              {currentRows.length === 0 ? (
                <div className="tcs-empty">
                  {searchTerm || Object.values(filters).some((v) => v.length)
                    ? "No records found matching your criteria"
                    : `No ${viewMode === "applications" ? "applications" : "coordinators"} registered yet`}
                </div>
              ) : groupedRows ? (
                groupedRows.map(([label, rows]) => (
                  <div key={label} style={{ marginBottom: "12px" }}>
                    <div
                      onClick={() => toggleGroupCollapsed(label)}
                      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#eef2e6", color: "#2f4a22", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
                    >
                      <span style={{ display: "inline-block", transform: collapsedGroups.has(label) ? "rotate(-90deg)" : "none" }}>▾</span>
                      {label} <span className="tcs-pill">{rows.length}</span>
                    </div>
                    {!collapsedGroups.has(label) && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px", marginTop: "10px" }}>
                        {rows.map((item) => (
                          <TempStaffCard key={item.id} item={item} viewMode={viewMode} onClick={() => openModal(item)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                  {currentRows.map((item) => (
                    <TempStaffCard key={item.id} item={item} viewMode={viewMode} onClick={() => openModal(item)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="tcs-table-wrap page-fill-scroll">
            <table className="tcs-table">
              <thead>
                <tr>
                  <th className="tcs-th" style={{ width: "36px" }}>
                    <input
                      className="tcs-cb"
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allPageSelected}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                  {sortTh("full_name", "Full Name")}
                  {sortTh("contact_number", "Mobile", "tcs-th tcs-num")}
                  {sortTh("city", "City / Locations")}
                  {viewMode === "applications"
                    ? sortTh("coordinator_name", "Coordinator")
                    : sortTh("coordinator_type", "Type")}
                </tr>
              </thead>
              <tbody>
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="tcs-empty">
                      {searchTerm || Object.values(filters).some((v) => v.length)
                        ? "No records found matching your criteria"
                        : `No ${viewMode === "applications" ? "applications" : "coordinators"} registered yet`}
                    </td>
                  </tr>
                ) : groupedRows ? (
                  groupedRows.map(([label, rows]) => (
                    <Fragment key={label}>
                      <tr className="tcs-group-row">
                        <td colSpan={5} onClick={() => toggleGroupCollapsed(label)}>
                          <span style={{ display: "inline-block", marginRight: "8px", transform: collapsedGroups.has(label) ? "rotate(-90deg)" : "none" }}>▾</span>
                          {label} <span className="tcs-pill">{rows.length}</span>
                        </td>
                      </tr>
                      {!collapsedGroups.has(label) && rows.map((item) => renderRow(item))}
                    </Fragment>
                  ))
                ) : (
                  currentRows.map((item) => renderRow(item))
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* MODAL - Fixed Size & Stable */}
      {selectedMember && (
        <>
          {/* Toast */}
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
                boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                zIndex: 10000,
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
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
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: "24px" }}>
                    {selectedMember.full_name || "N/A"}
                  </h2>
                  <p style={{ margin: "8px 0 0" }}>
                    {selectedMember.type === "application"
                      ? `Resources ID: ${selectedMember.resources_id || "-"} | Role: ${selectedMember.role || "-"}`
                      : `Type: ${selectedMember.coordinator_type || "-"}`}
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
              <div style={{ display: "flex", borderBottom: "1px solid #eee", background: "#f8fafc", flexShrink: 0, overflowX: "auto" }}>
                {(selectedMember.type === "application"
                  ? ["personal", "bank", "documents", "interaction"]
                  : ["personal", "locations", "bank", "interaction"]
                ).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: "14px 24px",
                      border: "none",
                      background: "none",
                      fontWeight: activeTab === tab ? "600" : "400",
                      color: activeTab === tab ? "#1976d2" : "#666",
                      borderBottom: activeTab === tab ? "3px solid #1976d2" : "none",
                      cursor: "pointer",
                    }}
                  >
                    {tab === "personal" && "Personal Info"}
                    {tab === "bank" && "Bank Details"}
                    {tab === "documents" && "Documents & ID"}
                    {tab === "locations" && "Service Locations"}
                    {tab === "interaction" && "Interaction & Notes"}
                  </button>
                ))}
              </div>

              {/* Body - Scrollable */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
                {/* APPLICATION TABS */}
                {selectedMember.type === "application" && (
                  <>
                    {activeTab === "personal" && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                        <tbody>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Full Name</td><td>{selectedMember.full_name || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Mobile</td><td>{selectedMember.contact_number || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedMember.email_id || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>State</td><td>{selectedMember.state || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>City</td><td>{selectedMember.city || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Coordinator</td><td>{selectedMember.coordinator_name || "-"}</td></tr>
                          <tr>
                            <td style={{ padding: "10px 0", fontWeight: "600" }}>Status</td>
                            <td>
                              <span style={{
                                padding: "6px 12px",
                                borderRadius: "20px",
                                background: selectedMember.status === "Active" ? "#d4edda" : selectedMember.status === "Inactive" ? "#f8d7da" : "#fff3cd",
                                color: selectedMember.status === "Active" ? "#155724" : selectedMember.status === "Inactive" ? "#721c24" : "#856404",
                                fontSize: "14px",
                                fontWeight: "500",
                              }}>
                                {selectedMember.status || "-"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}

                    {activeTab === "bank" && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                        <tbody>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Bank A/c No.</td><td>{selectedMember.bank_account || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>IFSC Code</td><td>{selectedMember.ifsc_code || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Background Status</td><td>{selectedMember.background_status || "-"}</td></tr>
                        </tbody>
                      </table>
                    )}

                    {activeTab === "documents" && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                        <tbody>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Aadhaar</td><td>{selectedMember.aadhar_number || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>PAN</td><td>{selectedMember.pan_number || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Resources ID</td><td>{selectedMember.resources_id || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Role</td><td>{selectedMember.role || "-"}</td></tr>
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {/* COORDINATOR TABS */}
                {selectedMember.type === "coordinator" && (
                  <>
                    {activeTab === "personal" && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                        <tbody>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Full Name</td><td>{selectedMember.full_name || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Mobile</td><td>{selectedMember.contact_number || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedMember.email_id || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Coordinator Type</td><td>{selectedMember.coordinator_type || "-"}</td></tr>
                        </tbody>
                      </table>
                    )}

                    {activeTab === "locations" && (
                      <div>
                        <h3 style={{ marginBottom: "16px" }}>Service Locations</h3>
                        {Array.isArray(selectedMember.locations) && selectedMember.locations.length > 0 ? (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                            <thead style={{ background: "#f3f4f6" }}>
                              <tr>
                                <th style={{ padding: "12px", textAlign: "left" }}>City</th>
                                <th style={{ padding: "12px", textAlign: "left" }}>Manpower Available</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedMember.locations.map((loc, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                  <td style={{ padding: "12px" }}>{loc.city || "-"}</td>
                                  <td style={{ padding: "12px" }}>{loc.manpower_available || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No locations assigned.</p>
                        )}
                      </div>
                    )}

                    {activeTab === "bank" && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                        <tbody>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Bank A/c No.</td><td>{selectedMember.bank_account || "-"}</td></tr>
                          <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>IFSC Code</td><td>{selectedMember.ifsc_code || "-"}</td></tr>
                        </tbody>
                      </table>
                    )}
                  </>
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
                                      color: "#1976d2",
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
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Follow-up Date</label>
                                  <input
                                    type="date"
                                    value={note.followUpDate}
                                    onChange={(e) => updateNewNote(note.id, "followUpDate", e.target.value)}
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
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
                    background: "#1976d2",
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