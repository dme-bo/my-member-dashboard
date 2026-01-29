// src/pages/RecruitmentPage.jsx
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
import * as XLSX from "xlsx";
import { FaSearch } from "react-icons/fa";

export default function RecruitmentPage() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    city: "All",
    client: "All",
    profile: "All",
    source: "All",
    status: "All",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSearchTerms, setFilterSearchTerms] = useState({
    city: "",
    client: "",
    profile: "",
    source: "",
    status: "",
  });
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // Track which dropdown is open
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);

  // Modal states
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");

  // Interaction & Notes states
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Refs for click-outside detection
  const filtersRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openDropdown]);

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

  // Fetch Candidates
  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "jobsusersmaster"), orderBy("created_time", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCandidates(data);
      } catch (error) {
        console.error("Error fetching candidates:", error);
        alert("Failed to load candidates.");
      } finally {
        setLoading(false);
      }
    };
    fetchCandidates();
  }, []);

  // Load interaction notes when "interaction" tab is selected
  useEffect(() => {
    if (!selectedCandidate || activeTab !== "interaction") return;

    const fetchNotes = async () => {
      setNotesLoading(true);
      try {
        const interactionsRef = collection(db, "jobsusersmaster", selectedCandidate.id, "interactions");
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const notes = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.createdAt
              ? data.createdAt.toDate().toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Unknown",
            contactPerson: data.contactPerson || selectedCandidate.full_name || "Candidate",
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
  }, [selectedCandidate, activeTab]);

  // Dynamic Filter Options - Handle comma-separated values
  const { cityOptions, clientOptions, profileOptions, sourceOptions, statusOptions } = useMemo(() => {
    const extractValues = (field) => {
      const values = new Set();
      candidates.forEach((c) => {
        const value = c[field];
        if (value && typeof value === "string") {
          value.split(",").forEach((v) => {
            const trimmed = v.trim();
            if (trimmed) values.add(trimmed);
          });
        } else if (value) {
          values.add(String(value).trim());
        }
      });
      return ["All", ...Array.from(values).sort()];
    };

    return {
      cityOptions: extractValues("city"),
      clientOptions: extractValues("client"),
      profileOptions: extractValues("profile"),
      sourceOptions: extractValues("source"),
      statusOptions: ["All", ...new Set(candidates.map((c) => c.status).filter(Boolean))].sort(),
    };
  }, [candidates]);

  const options = {
    city: cityOptions,
    client: clientOptions,
    profile: profileOptions,
    source: sourceOptions,
    status: statusOptions,
  };
  const filterKeys = ["city", "client", "profile", "source", "status"];

  // Export to Excel function
  const handleExportXLSX = () => {
    if (filteredCandidates.length === 0) {
      showToast("No data to export", "error");
      return;
    }

    const dataToExport = filteredCandidates.map((candidate) => ({
      "Full Name": candidate.full_name || "-",
      "Phone": candidate.phone || "-",
      "Email": candidate.email || "-",
      "Profile": candidate.profile || "-",
      "City": candidate.city || "-",
      "Source": candidate.source || "-",
      "Client": candidate.client || "-",
      "Status": candidate.status || "-",
      "Applied Date": formatDateDDMMMYYYY(candidate.created_time),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto-size columns
    const colWidths = [
      { wch: 20 },
      { wch: 15 },
      { wch: 25 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 12 },
      { wch: 13 },
    ];
    worksheet["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Recruitment");
    XLSX.writeFile(workbook, "recruitment-applications.xlsx");
    showToast("Exported successfully", "success");
  };

  // Filtering logic with comma-separated support
  const matchesFilter = (fieldValue, filterValue) => {
    if (!filterValue || filterValue === "All") return true;
    if (!fieldValue) return false;
    const values = String(fieldValue)
      .split(",")
      .map((v) => v.trim());
    return values.includes(filterValue);
  };

  let filteredCandidates = candidates.filter((c) => {
    // Handle multi-select arrays
    if (filters.city && filters.city !== "All") {
      const cityValues = Array.isArray(filters.city) ? filters.city : [filters.city];
      if (!cityValues.some(val => matchesFilter(c.city, val))) return false;
    }
    
    if (filters.client && filters.client !== "All") {
      const clientValues = Array.isArray(filters.client) ? filters.client : [filters.client];
      if (!clientValues.some(val => matchesFilter(c.client, val))) return false;
    }
    
    if (filters.profile && filters.profile !== "All") {
      const profileValues = Array.isArray(filters.profile) ? filters.profile : [filters.profile];
      if (!profileValues.some(val => matchesFilter(c.profile, val))) return false;
    }
    
    if (filters.source && filters.source !== "All") {
      const sourceValues = Array.isArray(filters.source) ? filters.source : [filters.source];
      if (!sourceValues.some(val => matchesFilter(c.source, val))) return false;
    }
    
    if (filters.status && filters.status !== "All") {
      const statusValues = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (!statusValues.includes(c.status)) return false;
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      return [
        c.full_name,
        c.contact_number,
        c.email_id,
        c.profile,
        c.city,
        c.client,
      ].some((field) => String(field || "").toLowerCase().includes(term));
    }
    return true;
  });

  // Sort alphabetically, empty names at bottom
  filteredCandidates.sort((a, b) => {
    const nameA = (a.full_name || "").trim();
    const nameB = (b.full_name || "").trim();
    if (nameA === "" && nameB === "") return 0;
    if (nameA === "") return 1;
    if (nameB === "") return -1;
    return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
  });

  // Pagination
  const totalItems = filteredCandidates.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.ceil(totalItems / rowsPerPage);
  const currentRows = rowsPerPage === Infinity
    ? filteredCandidates
    : filteredCandidates.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Modal Handlers
  const openModal = (candidate) => {
    setSelectedCandidate(candidate);
    setActiveTab("personal");
    setNewNotesList([]);
    setSavedNotes([]);
  };

  const closeModal = () => setSelectedCandidate(null);

  // Notes Handlers
  const addNewNote = () => {
    setNewNotesList([
      ...newNotesList,
      {
        id: Date.now() + Math.random(),
        contactPerson: selectedCandidate.full_name || "Candidate",
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
      const ref = collection(db, "jobsusersmaster", selectedCandidate.id, "interactions");
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

      // Refresh saved notes
      const snapshot = await getDocs(query(ref, orderBy("createdAt", "desc")));
      const updated = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.createdAt
            ? d.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : "Unknown",
          contactPerson: d.contactPerson || selectedCandidate.full_name || "Candidate",
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

  return (
    <div className="member-list-page">
      {/* Header with Title, Search, and Right Actions */}
      <div className="recruitment-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
          <div style={{ position: "relative", width: "300px" }}>
            <FaSearch
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: "16px",
              }}
            />
            <input
              type="text"
              placeholder="Search by name, phone, email..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: "12px 14px 12px 40px",
                width: "203%",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                backgroundColor: "white",
                color: "black",
              }}
            />
          </div>
          <span
            style={{
              backgroundColor: "#dcfce7",
              color: "#166534",
              padding: "4px 12px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: "600",
              marginLeft: "auto",
            }}
          >
           Total Applications:- {loading ? "—" : totalItems} 
          </span>
        </div>

        {/* Right side: Search, Filters, Export */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          

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
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            🔽 Filters 
          </button>

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
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            ⬇️ Export
          </button>
        </div>
      </div>

      {/* Expandable Filters Section */}
      {isFiltersOpen && (
        <div className="recruitment-filters" ref={filtersRef}>
          <div className="filters-grid-recruitment">
            {["City", "Client", "Profile", "Source", "Status"].map((filterType) => {
              const filterKey = filterType.toLowerCase();
              const filterOptions = options[filterKey] || [];
              const searchTerm = filterSearchTerms[filterKey] || "";
              const filteredOptions = filterOptions.filter((opt) =>
                opt.toLowerCase().includes(searchTerm.toLowerCase())
              );
              const isDropdownOpen = openDropdown === filterKey;
              // Handle multi-select: filters[filterKey] can be an array
              const selectedValues = Array.isArray(filters[filterKey]) ? filters[filterKey] : (filters[filterKey] && filters[filterKey] !== "All" ? [filters[filterKey]] : []);

              return (
                <div key={filterKey} className="filter-dropdown-recruitment">
                  <label className="filter-label-recruitment">{filterType}</label>
                  <div className="dropdown-wrapper-recruitment">
                    <input
                      type="text"
                      placeholder={`Select ${filterType.toLowerCase()}...`}
                      value={isDropdownOpen ? searchTerm : selectedValues.join(", ")}
                      onChange={(e) => {
                        if (isDropdownOpen) {
                          setFilterSearchTerms({ ...filterSearchTerms, [filterKey]: e.target.value });
                        }
                      }}
                      onFocus={() => {
                        setOpenDropdown(filterKey);
                        setFilterSearchTerms({ ...filterSearchTerms, [filterKey]: "" });
                      }}
                      readOnly={!isDropdownOpen}
                      className="searchable-dropdown-input"
                    />
                    {isDropdownOpen && (
                      <div className="dropdown-options-recruitment">
                        {filteredOptions.length > 0 ? (
                          filteredOptions.map((option) => (
                            <div
                              key={option}
                              className={`dropdown-option-recruitment ${
                                selectedValues.includes(option) ? "selected" : ""
                              }`}
                              onClick={() => {
                                // Multi-select: toggle the option
                                if (selectedValues.includes(option)) {
                                  const newValues = selectedValues.filter(v => v !== option);
                                  setFilters({ 
                                    ...filters, 
                                    [filterKey]: newValues.length === 0 ? "All" : newValues 
                                  });
                                } else {
                                  setFilters({ 
                                    ...filters, 
                                    [filterKey]: [...selectedValues, option] 
                                  });
                                }
                              }}
                            >
                              <span>{option}</span>
                              {selectedValues.includes(option) && <span className="check-mark">✓</span>}
                            </div>
                          ))
                        ) : (
                          <div className="dropdown-option-recruitment no-results">
                            No results found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setFilters({ city: "All", client: "All", profile: "All", source: "All", status: "All" })}
            style={{
              padding: "10px 20px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "13px",
              marginTop: "12px",
            }}
          >
            Clear All Filters
          </button>
        </div>
      )}

      <div className="content-with-sidebar">
        <div className="table-container">
          {loading ? (
            <div style={{ padding: "60px", textAlign: "center", fontSize: "18px" }}>
              Loading candidates...
            </div>
          ) : (
            <>
              <div
                style={{
                  height: "70vh",
                  minHeight: "400px",
                  overflowY: "auto",
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  background: "#fff",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                  <thead style={{ position: "sticky", top: 0, background: "#f9f9f9", zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Full Name</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Phone</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Profile</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>City</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan="5"
                          style={{ textAlign: "center", padding: "80px", color: "#666", fontSize: "18px" }}
                        >
                          {searchTerm || Object.keys(filters).length > 0
                            ? "No candidates found matching your criteria"
                            : "No recruitment candidates registered yet"}
                        </td>
                      </tr>
                    ) : (
                      currentRows.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => openModal(c)}
                          style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
                        >
                          <td style={{ padding: "12px" }}>
                            {c.full_name ? c.full_name : <em style={{ color: "#999" }}>No Name</em>}
                          </td>
                          <td style={{ padding: "12px" }}>{c.contact_number || "-"}</td>
                          <td style={{ padding: "12px" }}>{c.profile || "-"}</td>
                          <td style={{ padding: "12px" }}>{c.city || "-"}</td>
                          <td style={{ padding: "12px" }}>{c.source || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "20px 10px",
                  flexWrap: "wrap",
                  gap: "15px",
                }}
              >
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
                    onClick={() => setCurrentPage((p) => p - 1)}
                    style={{
                      padding: "8px 14px",
                      background: "#1976d2",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      opacity: currentPage === 1 ? 0.5 : 1,
                    }}
                  >
                    ‹ Previous
                  </button>
                  <span>
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    disabled={currentPage === totalPages || rowsPerPage === Infinity}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    style={{
                      padding: "8px 14px",
                      background: "#1976d2",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      opacity: currentPage === totalPages || rowsPerPage === Infinity ? 0.5 : 1,
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

      {/* MODAL - Fixed Size */}
      {selectedCandidate && (
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
                maxWidth: "1100px",
                height: "90vh",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
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
                    {selectedCandidate.full_name || "No Name Provided"}
                  </h2>
                  <p style={{ margin: "8px 0 0" }}>
                    Phone: {selectedCandidate.contact_number || "-"} | Profile: {selectedCandidate.profile || "-"}
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
                {["personal", "service", "professional", "interviews", "interaction"].map((tab) => (
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
                    {tab === "service" && "Service Record"}
                    {tab === "professional" && "Professional Details"}
                    {tab === "interviews" && "Interviews & Status"}
                    {tab === "interaction" && "Interaction & Notes"}
                  </button>
                ))}
              </div>

              {/* Modal Body - Scrollable */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
                {/* Personal Info */}
                {activeTab === "personal" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600", width: "200px" }}>Full Name</td><td>{selectedCandidate.full_name || <em>No Name</em>}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedCandidate.email_id || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Phone</td><td>{selectedCandidate.contact_number || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>City</td><td>{selectedCandidate.city || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Current Location</td><td>{selectedCandidate.current_location || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Source</td><td>{selectedCandidate.source || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Availability Date</td><td>{selectedCandidate.availability_date ? formatDateDDMMMYYYY(selectedCandidate.availability_date) : "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Availability Time</td><td>{selectedCandidate.availability_time || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Service Record */}
                {activeTab === "service" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Category</td><td>{selectedCandidate.category || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Service</td><td>{selectedCandidate.service || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Rank</td><td>{selectedCandidate.rank || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Professional Details */}
                {activeTab === "professional" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600", width: "200px" }}>Profile</td><td>{selectedCandidate.profile || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Total Experience</td><td>{selectedCandidate.total_experience_years || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Service Experience</td><td>{selectedCandidate.service_experience_years || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Corporate Experience</td><td>{selectedCandidate.corporate_experience_years || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Education</td><td>{selectedCandidate.education || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Current CTC (Lacs)</td><td>{selectedCandidate.total_ctc_lacs || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Expected CTC</td><td>{selectedCandidate.ectc || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Fixed / Variable</td><td>{selectedCandidate.fixed || selectedCandidate.variable || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Notice Period (Days)</td><td>{selectedCandidate.notice_period_days || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Reason for Change</td><td>{selectedCandidate.reason_of_change || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Client</td><td>{selectedCandidate.client || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Job Location</td><td>{selectedCandidate.job_location || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Details / Remarks</td><td>{selectedCandidate.details || selectedCandidate.remarks || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>CV Link</td><td>{selectedCandidate.cv_link ? <a href={selectedCandidate.cv_link} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>Open CV</a> : "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>ERP Link</td><td>{selectedCandidate.erp_link ? <a href={selectedCandidate.erp_link} target="_blank" rel="noopener noreferrer" style={{ color: "#1976d2" }}>Open ERP</a> : "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Interviews & Status */}
                {activeTab === "interviews" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: "10px 0", fontWeight: "600", width: "200px" }}>Status</td>
                        <td>
                          <span style={{
                            padding: "6px 12px",
                            borderRadius: "12px",
                            backgroundColor: selectedCandidate.status === "Active" ? "#d1fae5" : "#fee2e2",
                            color: selectedCandidate.status === "Active" ? "#065f46" : "#991b1b",
                            fontWeight: "600",
                          }}>
                            {selectedCandidate.status || "-"}
                          </span>
                        </td>
                      </tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Final Status</td><td>{selectedCandidate.final_status || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Internal Interview</td><td>{selectedCandidate.internal_interview || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Internal Interview Status</td><td>{selectedCandidate.internal_interview_status || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>External Interview</td><td>{selectedCandidate.external_interview || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>External Interview Status</td><td>{selectedCandidate.external_interview_status || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Interaction & Notes */}
                {activeTab === "interaction" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                    {/* Add New Notes */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0, color: "#1f2937", fontSize: "18px" }}>Add New Interaction Notes</h3>
                        <button onClick={addNewNote} disabled={notesLoading} style={{
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
                        }}>
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
                            <div key={note.id} style={{
                              border: "1px solid #d1d5db",
                              borderRadius: "8px",
                              padding: "16px",
                              marginBottom: "16px",
                              backgroundColor: "#f9fafb",
                            }}>
                              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Candidate Name</label>
                                  <input type="text" value={note.contactPerson} readOnly style={{
                                    width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #3b82f6",
                                    backgroundColor: "#eff6ff", fontWeight: "500", color: "#1976d2",
                                  }} />
                                </div>
                                <div style={{ flex: 2 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Notes</label>
                                  <textarea value={note.notes} onChange={(e) => updateNewNote(note.id, "notes", e.target.value)}
                                    placeholder="Add notes about interaction..." rows="3" style={{
                                      width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical",
                                    }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Next Action</label>
                                  <input type="text" value={note.nextAction} onChange={(e) => updateNewNote(note.id, "nextAction", e.target.value)}
                                    placeholder="e.g., Follow up call" style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Follow-up Date</label>
                                  <input type="date" value={note.followUpDate} onChange={(e) => updateNewNote(note.id, "followUpDate", e.target.value)}
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }} />
                                  {note.followUpDate && (
                                    <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>
                                      {formatDateDDMMMYYYY(note.followUpDate)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ alignSelf: "flex-end" }}>
                                  <button onClick={() => deleteNewNote(note.id)} style={{
                                    background: "none", border: "none", cursor: "pointer", padding: "8px", color: "#ef4444",
                                  }} title="Delete">
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6 4V2a2 2 0 012-2h4a2 2 0 012 2v2h5a1 1 0 110 2h-1v11a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h5zm2 0h4V2H8v2zm1 4a1 1 0 012 0v7a1 1 0 01-2 0V8zm4 0a1 1 0 012 0v7a1 1 0 01-2 0V8z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <div style={{ textAlign: "right", marginTop: "10px" }}>
                            <button onClick={handleSaveAllNotes} disabled={notesLoading} style={{
                              padding: "12px 32px",
                              backgroundColor: "#16a34a",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              fontWeight: "600",
                              cursor: notesLoading ? "not-allowed" : "pointer",
                              opacity: notesLoading ? 0.7 : 1,
                            }}>
                              {notesLoading ? "Saving..." : "SAVE ALL NOTES"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Interaction History */}
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
                                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Candidate Name</th>
                                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Notes</th>
                                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Next Action</th>
                                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Follow-up Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {savedNotes.map((note, index) => (
                                <tr key={note.id} style={{ backgroundColor: index % 2 === 0 ? "#f9fafb" : "#ffffff" }}>
                                  <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>{note.date}</td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>{note.contactPerson}</td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb", whiteSpace: "pre-wrap", maxWidth: "350px" }}>{note.notes}</td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>{note.nextAction}</td>
                                  <td style={{ padding: "12px 16px", verticalAlign: "top", borderBottom: "1px solid #e5e7eb" }}>{note.followUpDate}</td>
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

              {/* Modal Footer */}
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