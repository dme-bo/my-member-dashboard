// src/pages/ProjectsPage.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";
import * as XLSX from "xlsx";

export default function ProjectsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [filterSearchTerms, setFilterSearchTerms] = useState({});
  const filtersRef = useRef(null);

  // Modal states
  const [selectedApp, setSelectedApp] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Format Date Helper
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

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Fetch Applications
  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "projectusersmaster"), orderBy("created_time", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setApplications(data);
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
      cityOptions: ["All", ...Array.from(cities).sort()],
      projectOptions: ["All", ...Array.from(projects).sort()],
    };
  }, [applications]);

  const options = { city: cityOptions, projects: projectOptions };
  const filterKeys = ["city", "projects"];

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value === "All" ? undefined : value
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Filtering Logic - Handle both single values and arrays
  const matchesProjectFilter = (appProjects, filterValue) => {
    if (!filterValue) return true;
    if (!appProjects) return false;
    
    const appProjectsList = appProjects.split(",").map(p => p.trim());
    const filterValues = Array.isArray(filterValue) ? filterValue : [filterValue];
    
    return filterValues.some(fv => appProjectsList.includes(fv));
  };

  let filteredApplications = applications.filter(app => {
    // Handle city filter (can be single value or array)
    if (filters.city) {
      const cityValues = Array.isArray(filters.city) ? filters.city : [filters.city];
      if (!cityValues.includes(app.city)) return false;
    }
    
    // Handle projects filter (can be single value or array)
    if (filters.projects && !matchesProjectFilter(app.projects, filters.projects)) return false;

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

  // Sort by name
  filteredApplications.sort((a, b) =>
    (a.full_name || "").trim().toLowerCase().localeCompare((b.full_name || "").trim().toLowerCase())
  );

  // Pagination
  const totalItems = filteredApplications.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.ceil(totalItems / rowsPerPage);
  const currentRows = rowsPerPage === Infinity
    ? filteredApplications
    : filteredApplications.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Load Interaction Notes
  useEffect(() => {
    if (!selectedApp || activeTab !== "interaction") return;

    const loadNotes = async () => {
      setNotesLoading(true);
      try {
        const interactionsRef = collection(db, "projectusersmaster", selectedApp.id, "interactions");
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const notes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.createdAt
              ? data.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
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
      const ref = collection(db, "projectusersmaster", selectedApp.id, "interactions");
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
            ? d.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
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

  // Close dropdown on click-outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target) && openDropdown) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  // Export function
  const handleExportXLSX = () => {
    try {
      const dataToExport = filteredApplications.map((app) => ({
        Name: app.name || "-",
        Phone: app.phone || "-",
        City: app.city || "-",
        Project: app.projects || "-",
        Status: app.status || "-",
        "Date Applied": formatDateDDMMMYYYY(app.created_time) || "-",
      }));

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

  const filterData = { filters, handleFilterChange, clearFilters, options };

  return (
    <div className="member-list-page">
      {/* Header Card with Search, Total Badge, Filters, Export */}
      <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "20px", marginBottom: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: isFiltersOpen ? "16px" : "0" }}>
          {/* Search Input */}
          <div style={{ position: "relative", flex: 1, maxWidth: "350px" }}>
            <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", width: "16px", height: "16px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
            <input
              type="text"
              placeholder="Search by name, phone, city, project..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: "12px 14px 12px 40px",
                width: "159%",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                backgroundColor: "white",
                color: "black",
              }}
              autoFocus
            />
          </div>

          {/* Total Applications Badge */}
          <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",marginLeft: "400px"}}>
            Total Applications:- <strong>{loading ? "—" : totalItems}</strong>
          </span>

          {/* Filters Button */}
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            style={{
              padding: "10px 20px",
              backgroundColor: "white",
              border: "1px solid #10b981",
              color: "#10b981",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            🔽 Filters
          </button>

          {/* Export Button */}
          <button
            onClick={handleExportXLSX}
            style={{
              padding: "10px 20px",
              backgroundColor: "white",
              border: "1px solid #1f2937",
              color: "#1f2937",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            ⬇️ Export
          </button>
        </div>

        {/* Inline Filters */}
        {isFiltersOpen && (
          <div ref={filtersRef} style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <strong style={{ fontSize: "14px", color: "#1f2937" }}>Filters</strong>
              <button onClick={() => { setFilters({}); setOpenDropdown(null); }} style={{ padding: "6px 12px", backgroundColor: "#ef4444", color: "white", border: "none", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}>Clear All</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              {["city", "projects"].map(filterKey => {
                const selectedValues = Array.isArray(filters[filterKey]) ? filters[filterKey] : (filters[filterKey] && filters[filterKey] !== "All" ? [filters[filterKey]] : []);
                const filterOptions = filterKey === "city" ? cityOptions : projectOptions;
                const searchTerm = filterSearchTerms[filterKey] || "";
                const filteredOptions = filterOptions.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));
                const isDropdownOpen = openDropdown === filterKey;

                return (
                  <div key={filterKey} style={{ marginBottom: "8px" }}>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "12px", textTransform: "capitalize", color: "#374151" }}>{filterKey}</label>
                    <div style={{ position: "relative" }}>
                      <div
                        onClick={() => setOpenDropdown(k => (k === filterKey ? null : filterKey))}
                        style={{
                          padding: "10px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          background: "#fff",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "13px",
                        }}
                      >
                        <span>{selectedValues.length > 0 ? selectedValues.join(", ") : "All"}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
                      </div>
                      {isDropdownOpen && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "6px", marginTop: "4px", zIndex: 200, maxHeight: "240px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          <input autoFocus type="text" value={searchTerm} onChange={(e) => setFilterSearchTerms({ ...filterSearchTerms, [filterKey]: e.target.value })} placeholder="Search..." style={{ padding: "8px 10px", borderBottom: "1px solid #eee", outline: "none", fontSize: "12px" }} />
                          <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                            {filteredOptions.length === 0 ? <div style={{ padding: "8px 10px", color: "#9ca3af", fontSize: "12px" }}>No options</div> : filteredOptions.map(o => (
                              <div key={o} onClick={() => { if (selectedValues.includes(o)) { setFilters(prev => ({ ...prev, [filterKey]: selectedValues.filter(v => v !== o).length === 0 ? undefined : selectedValues.filter(v => v !== o) })); } else { setFilters(prev => ({ ...prev, [filterKey]: [...selectedValues, o] })); } setCurrentPage(1); }} style={{ padding: "8px 10px", cursor: "pointer", background: selectedValues.includes(o) ? "#eff6ff" : "transparent", display: "flex", justifyContent: "space-between", fontSize: "12px" }}><span>{o}</span>{selectedValues.includes(o) && <span style={{ color: "#10b981", fontWeight: "700" }}>✓</span>}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          {loading ? (
            <div style={{ padding: "60px", textAlign: "center", fontSize: "18px" }}>
              Loading applications...
            </div>
          ) : (
            <>
              <div style={{
                height: "70vh",
                minHeight: "400px",
                overflowY: "auto",
                border: "1px solid #eee",
                borderRadius: "8px",
                background: "#fff",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "25%" }} />
                  </colgroup>
                  <thead style={{ position: "sticky", top: 0, background: "#f9f9f9", zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Full Name</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Phone</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>City</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: "center", padding: "80px", color: "#666", fontSize: "18px" }}>
                          {searchTerm || Object.keys(filters).length > 0
                            ? "No applications found matching your criteria"
                            : "No project applications registered yet"}
                        </td>
                      </tr>
                    ) : (
                      currentRows.map((app) => (
                        <tr
                          key={app.id}
                          onClick={() => openModal(app)}
                          style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
                        >
                          <td style={{ padding: "12px" }}>{app.full_name || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.phone_number || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.city || "-"}</td>
                          <td style={{ padding: "12px" }}>{app.projects || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "20px 10px",
                flexWrap: "wrap",
                gap: "15px"
              }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span style={{ marginRight: "10px" }}>Rows per page:</span>
                  <select
                    value={rowsPerPage === Infinity ? "all" : rowsPerPage}
                    onChange={(e) => {
                      const val = e.target.value === "all" ? Infinity : Number(e.target.value);
                      setRowsPerPage(val);
                      setCurrentPage(1);
                    }}
                    style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc" }}
                  >
                    <option value="all">All</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                    <option value={5000}>5000</option>
                    
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    style={{
                      padding: "8px 14px",
                      background: "#1e40af",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      opacity: currentPage === 1 ? 0.5 : 1,
                    }}
                  >
                    ‹ Previous
                  </button>
                  <span>Page {currentPage} of {totalPages || 1}</span>
                  <button
                    disabled={currentPage === totalPages || rowsPerPage === Infinity}
                    onClick={() => setCurrentPage(p => p + 1)}
                    style={{
                      padding: "8px 14px",
                      background: "#1e40af",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      opacity: (currentPage === totalPages || rowsPerPage === Infinity) ? 0.5 : 1,
                    }}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
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