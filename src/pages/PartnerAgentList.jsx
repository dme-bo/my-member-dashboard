// src/pages/PartnerAgentListPage.jsx
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
import SkeletonLoader from "../components/SkeletonLoader";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar from "../components/OdooViewToolbar";
import FilterAccordionList from "../components/FilterAccordionList";

const AGENT_FILTER_LABELS = { city: "City", district: "District", state: "State", rating: "Rating" };
const AGENT_GROUP_BY_OPTIONS = [
  { key: "city", label: "City" },
  { key: "district", label: "District" },
  { key: "state", label: "State" },
  { key: "rating", label: "Rating" },
];

export default function PartnerAgentListPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ city: [], district: [], state: [], rating: [] });
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [groupBy, setGroupBy] = useState(null);
  const [kanbanView, setKanbanView] = useState("list");

  // Modal states
  const [selectedAgent, setSelectedAgent] = useState(null);
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

  // Fetch Agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        const q = query(collection(db, "partneragentusersmaster"), orderBy("created_time", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAgents(data);
      } catch (error) {
        console.error("Error fetching agents:", error);
        showToast("Failed to load partner agents.", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  // Rebuild filter option lists from the latest agent dataset.
  const { cityOptions, districtOptions, stateOptions, ratingOptions } = useMemo(() => {
    const cities = new Set();
    const districts = new Set();
    const states = new Set();
    const ratings = new Set();

    agents.forEach(agent => {
      if (agent.city) cities.add(agent.city.trim());
      if (agent.district) districts.add(agent.district.trim());
      if (agent.state) states.add(agent.state.trim());
      if (agent.rating) ratings.add(agent.rating.trim());
    });

    return {
      cityOptions: Array.from(cities).sort(),
      districtOptions: Array.from(districts).sort(),
      stateOptions: Array.from(states).sort(),
      ratingOptions: Array.from(ratings).sort(),
    };
  }, [agents]);

  const filterOptions = { city: cityOptions, district: districtOptions, state: stateOptions, rating: ratingOptions };
  const filterKeys = ["city", "district", "state", "rating"];

  const toggleFilter = (key, value) => {
    setFilters(prev => {
      const current = prev[key] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
    setCurrentPage(1);
  };

  const setFilterValues = (key, values) => {
    setFilters(prev => ({ ...prev, [key]: values }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({ city: [], district: [], state: [], rating: [] });
    setSearchTerm("");
    setCurrentPage(1);
  };

  // Filtering Logic — wrapped in useMemo: without it, this re-filtered+re-sorted
  // the full agents list on every render, including every keystroke typed into
  // the detail modal's notes field, causing visible input lag.
  const filteredAgents = useMemo(() => {
  let filteredAgents = agents.filter(agent => {
    if (filters.city?.length && !filters.city.includes(agent.city)) return false;
    if (filters.district?.length && !filters.district.includes(agent.district)) return false;
    if (filters.state?.length && !filters.state.includes(agent.state)) return false;
    if (filters.rating?.length && !filters.rating.includes(agent.rating)) return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      return [
        agent.full_name,
        agent.phone_number,
        agent.email,
        agent.city,
        agent.district,
        agent.state,
        agent.rating,
      ].some(field => String(field || "").toLowerCase().includes(term));
    }

    return true;
  });

  // Sort by name
  filteredAgents.sort((a, b) =>
    (a.full_name || "").trim().toLowerCase().localeCompare((b.full_name || "").trim().toLowerCase())
  );

  return filteredAgents;
  }, [agents, filters, searchTerm]);

  // Pagination
  const totalItems = filteredAgents.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.ceil(totalItems / rowsPerPage);
  const currentRows = rowsPerPage === Infinity
    ? filteredAgents
    : filteredAgents.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Grouping is applied within the current page's rows (not virtualized),
  // matching the same pattern used on Recruitment/Projects/TempStaff pages.
  const groupedRows = useMemo(() => {
    if (!groupBy) return null;
    const getLabel = (agent) => {
      const raw = agent[groupBy];
      return raw && String(raw).trim() ? String(raw).trim() : "Unspecified";
    };
    const groups = new Map();
    for (const agent of currentRows) {
      const label = getLabel(agent);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(agent);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, currentRows]);

  const filterChips = [
    ...filterKeys.flatMap((key) =>
      (filters[key] || []).map((value) => ({
        key: `${key}-${value}`,
        label: value,
        onRemove: () => toggleFilter(key, value),
      }))
    ),
    ...(groupBy ? [{ key: "groupBy", label: `Group: ${AGENT_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}`, onRemove: () => setGroupBy(null) }] : []),
  ];

  const advancedFiltersPanel = (
    <div>
      <FilterAccordionList
        sections={filterKeys.map((key) => ({
          key,
          label: AGENT_FILTER_LABELS[key],
          options: filterOptions[key],
          selected: filters[key] || [],
          onChange: (values) => setFilterValues(key, values),
        }))}
      />
      <button
        type="button"
        onClick={clearFilters}
        style={{ marginTop: "12px", width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}
      >
        Clear All
      </button>
    </div>
  );

  // Load the selected agent's interaction history when the interaction tab is open.
  useEffect(() => {
    if (!selectedAgent || activeTab !== "interaction") return;

    const loadNotes = async () => {
      setNotesLoading(true);
      try {
        const interactionsRef = collection(db, "partneragentusersmaster", selectedAgent.id, "interactions");
        const q = query(interactionsRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const notes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            date: data.createdAt
              ? data.createdAt.toDate().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "Unknown",
            contactPerson: data.contactPerson || selectedAgent.full_name,
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
  }, [selectedAgent, activeTab]);

  // Modal Handlers
  const openModal = (agent) => {
    setSelectedAgent(agent);
    setActiveTab("personal");
    setNewNotesList([]);
    setSavedNotes([]);
  };

  const closeModal = () => setSelectedAgent(null);

  const addNewNote = () => {
    setNewNotesList(prev => [...prev, {
      id: Date.now() + Math.random(),
      contactPerson: selectedAgent.full_name,
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

  // Save only non-empty interaction rows to Firestore, then refresh the table.
  const handleSaveAllNotes = async () => {
    const validNotes = newNotesList.filter(n => n.notes.trim() || n.nextAction.trim() || n.followUpDate);
    if (validNotes.length === 0) {
      showToast("No notes to save.", "error");
      return;
    }

    setNotesLoading(true);
    try {
      const ref = collection(db, "partneragentusersmaster", selectedAgent.id, "interactions");
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
          contactPerson: d.contactPerson || selectedAgent.full_name,
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

  const renderAgentRow = (agent) => (
    <tr
      key={agent.id}
      onClick={() => openModal(agent)}
      style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
    >
      <td style={{ padding: "12px" }}>{agent.full_name || "-"}</td>
      <td style={{ padding: "12px" }}>{agent.phone_number || "-"}</td>
      <td style={{ padding: "12px" }}>{agent.email || "-"}</td>
      <td style={{ padding: "12px" }}>{agent.state || "-"}</td>
    </tr>
  );

  return (
    <div className="member-list-page with-filters">
      {/* Header */}
      <div className="page-headers" style={{ marginBottom: "20px" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
          marginBottom: "20px"
        }}>
          <div style={{
            backgroundColor: "#dbeafe",
            color: "#1976d2",
            padding: "12px 24px",
            borderRadius: "12px",
            fontSize: "20px",
            fontWeight: "700",
            minWidth: "220px",
            textAlign: "center",
            border: "3px solid #1976d2",
          }}>
            Total Agents: <strong>{loading ? "—" : totalItems}</strong>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "1", maxWidth: "760px" }}>
          <OdooSearchBar
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="Search by name, phone, email, city, district..."
            chips={filterChips}
          />
          <OdooViewToolbar
            quickFilters={[]}
            advancedContent={advancedFiltersPanel}
            groupByOptions={AGENT_GROUP_BY_OPTIONS}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            view={kanbanView}
            onViewChange={setKanbanView}
          />
        </div>
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          {loading ? (
            <div style={{ padding: "24px" }}>
              <SkeletonLoader rows={8} label="Loading agents…" />
            </div>
          ) : (
            <>
              {currentRows.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px", color: "#666", fontSize: "18px" }}>
                  {searchTerm || filterKeys.some((k) => filters[k]?.length)
                    ? "No agents found matching your criteria"
                    : "No partner agents registered yet"}
                </div>
              ) : kanbanView === "kanban" ? (
                <div>
                  {groupedRows
                    ? groupedRows.map(([label, items]) => (
                        <div key={label} style={{ marginBottom: "20px" }}>
                          <div style={{ fontWeight: 700, fontSize: "14px", color: "#334155", marginBottom: "10px" }}>
                            {label} <span style={{ fontWeight: 500, color: "#94a3b8" }}>({items.length})</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                            {items.map((agent) => (
                              <AgentCard key={agent.id} agent={agent} onClick={() => openModal(agent)} />
                            ))}
                          </div>
                        </div>
                      ))
                    : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                        {currentRows.map((agent) => (
                          <AgentCard key={agent.id} agent={agent} onClick={() => openModal(agent)} />
                        ))}
                      </div>
                    )}
                </div>
              ) : (
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
                    <col style={{ width: "25%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead style={{ position: "sticky", top: 0, background: "#f9f9f9", zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Full Name</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Phone</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>Email</th>
                      <th style={{ padding: "14px 12px", textAlign: "left" }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows
                      ? groupedRows.map(([label, items]) => (
                          <Fragment key={label}>
                            <tr>
                              <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 700, fontSize: "13px", color: "#334155", background: "#f1f5f9" }}>
                                {label} <span style={{ fontWeight: 500, color: "#64748b" }}>({items.length})</span>
                              </td>
                            </tr>
                            {items.map(renderAgentRow)}
                          </Fragment>
                        ))
                      : currentRows.map(renderAgentRow)}
                  </tbody>
                </table>
              </div>
              )}

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
                      background: "#1976d2",
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
                      background: "#1976d2",
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

      {/* MODAL */}
      {selectedAgent && (
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
                  backgroundColor: "#1976d2",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: "24px" }}>
                    {selectedAgent.full_name || "N/A"}
                  </h2>
                  <p style={{ margin: "8px 0 0" }}>
                    Phone: {selectedAgent.phone_number || "-"} | Email: {selectedAgent.email || "-"}
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
                {["personal", "interaction"].map(tab => (
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
                    {tab === "interaction" && "Interaction & Notes"}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div style={{ padding: "24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
                {activeTab === "personal" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Full Name</td><td>{selectedAgent.full_name || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Phone</td><td>{selectedAgent.phone_number || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedAgent.email || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>City</td><td>{selectedAgent.city || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>District</td><td>{selectedAgent.district || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>State</td><td>{selectedAgent.state || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Rating</td><td>{selectedAgent.rating || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Registration Date</td><td>{selectedAgent.registration_date || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* INTERACTION TAB - Same as before */}
                {activeTab === "interaction" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                    {/* Add New Notes Section - unchanged */}
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
                            <div key={note.id} style={{
                              border: "1px solid #d1d5db",
                              borderRadius: "8px",
                              padding: "16px",
                              marginBottom: "16px",
                              backgroundColor: "#f9fafb",
                            }}>
                              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Agent Name</label>
                                  <input type="text" value={note.contactPerson} readOnly style={{
                                    width: "100%", padding: "10px", borderRadius: "6px",
                                    border: "1px solid #3b82f6", backgroundColor: "#eff6ff",
                                    fontWeight: "500", color: "#1976d2",
                                  }} />
                                </div>
                                <div style={{ flex: 2 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Notes</label>
                                  <textarea value={note.notes} onChange={(e) => updateNewNote(note.id, "notes", e.target.value)}
                                    placeholder="Add notes about interaction..." rows="3"
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical" }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Next Action</label>
                                  <input type="text" value={note.nextAction} onChange={(e) => updateNewNote(note.id, "nextAction", e.target.value)}
                                    placeholder="e.g., Follow up call"
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Follow-up Date</label>
                                  <input type="date" value={note.followUpDate} onChange={(e) => updateNewNote(note.id, "followUpDate", e.target.value)}
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                  {note.followUpDate && (
                                    <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "4px" }}>
                                      {formatDateDDMMMYYYY(note.followUpDate)}
                                    </div>
                                  )}
                                </div>
                                <div style={{ alignSelf: "flex-end" }}>
                                  <button onClick={() => deleteNewNote(note.id)}
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", color: "#ef4444" }}
                                    title="Delete">
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6 4V2a2 2 0 012-2h4a2 2 0 012 2v2h5a1 1 0 110 2h-1v11a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h5zm2 0h4V2H8v2zm1 4a1 1 0 012 0v7a1 1 0 01-2 0V8zm4 0a1 1 0 012 0v7a1 1 0 01-2 0V8z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <div style={{ textAlign: "right", marginTop: "10px" }}>
                            <button onClick={handleSaveAllNotes} disabled={notesLoading}
                              style={{
                                padding: "12px 32px", backgroundColor: "#16a34a", color: "white",
                                border: "none", borderRadius: "6px", fontWeight: "600",
                                cursor: notesLoading ? "not-allowed" : "pointer", opacity: notesLoading ? 0.7 : 1,
                              }}>
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
                                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: "600" }}>Agent Name</th>
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

function AgentCard({ agent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "15px", color: "#1f2937" }}>{agent.full_name || "-"}</div>
      <div style={{ fontSize: "13px", color: "#4b5563" }}>{agent.phone_number || "-"}</div>
      <div style={{ fontSize: "13px", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={agent.email}>
        {agent.email || "-"}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
        {agent.city && (
          <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#eff6ff", color: "#1976d2", fontSize: "11.5px", fontWeight: 600 }}>
            {agent.city}
          </span>
        )}
        {agent.state && (
          <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#f1f5f9", color: "#334155", fontSize: "11.5px", fontWeight: 600 }}>
            {agent.state}
          </span>
        )}
        {agent.rating && (
          <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#fef3c7", color: "#92400e", fontSize: "11.5px", fontWeight: 600 }}>
            {agent.rating}
          </span>
        )}
      </div>
    </div>
  );
}
