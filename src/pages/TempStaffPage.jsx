// src/pages/TempStaffPage.jsx
import { useState, useMemo, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  getDocs,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";

export default function TempStaffPage() {
  const [selectedMember, setSelectedMember] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({});
  const [membersData, setMembersData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [activeTab, setActiveTab] = useState("personal");
  const [newNotesList, setNewNotesList] = useState([]);
  const [savedNotes, setSavedNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Helper: Format Firestore Timestamp
  const formatTimestamp = (ts) => {
    if (!ts) return "-";
    if (ts.toDate && typeof ts.toDate === "function") {
      return ts.toDate().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    }
    return String(ts);
  };

  // Format date input to DD MMM YYYY
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

  // Toast
  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  // Fetch TCS members
  useEffect(() => {
    const q = query(collection(db, "tcsusersmaster"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setMembersData(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Dynamically generate filter options from membersData
  const dynamicFilterOptions = useMemo(() => {
    const uniqueValues = {
      coordinator_name: new Set(),
      city: new Set(),
      status: new Set(),
      role: new Set(),
    };

    membersData.forEach((member) => {
      if (member.coordinator_name) uniqueValues.coordinator_name.add(member.coordinator_name.trim());
      if (member.city) uniqueValues.city.add(member.city.trim());
      if (member.status) uniqueValues.status.add(member.status.trim());
      if (member.role) uniqueValues.role.add(member.role.trim());
    });

    return {
      coordinator_name: ["All", ...Array.from(uniqueValues.coordinator_name).sort()],
      city: ["All", ...Array.from(uniqueValues.city).sort()],
      status: ["All", ...Array.from(uniqueValues.status).sort()],
      role: ["All", ...Array.from(uniqueValues.role).sort()],
    };
  }, [membersData]);

  // Load interaction notes when modal opens and tab is "interaction"
  useEffect(() => {
    if (!selectedMember || activeTab !== "interaction") return;

    const fetchNotes = async () => {
      setNotesLoading(true);
      try {
        const interactionsRef = collection(db, "tcsusersmaster", selectedMember.id, "interactions");
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

  // Filtered members
  const filteredAndSortedMembers = useMemo(() => {
    let list = membersData;

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
        ].some((field) => String(field || "").toLowerCase().includes(term))
      );
    }

    list = list.filter((m) =>
      Object.entries(filters).every(([key, value]) => {
        if (!value || value === "All" || value === "") return true;
        if (["city", "status", "role", "coordinator_name"].includes(key)) {
          return String(m[key] || "").trim() === value;
        }
        return String(m[key] || "").toLowerCase().includes(value.toLowerCase());
      })
    );

    list.sort((a, b) =>
      (a.full_name || "").trim().toLowerCase().localeCompare((b.full_name || "").trim().toLowerCase())
    );

    return list;
  }, [searchTerm, filters, membersData]);

  const totalPages = Math.ceil(filteredAndSortedMembers.length / rowsPerPage);
  const currentRows = filteredAndSortedMembers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value === "All" ? "" : value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({});
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
      const ref = collection(db, "tcsusersmaster", selectedMember.id, "interactions");
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

  // Pass dynamic options to FilterSidebar
  const filterData = {
    filters,
    handleFilterChange,
    clearFilters,
    options: dynamicFilterOptions,
  };

  if (loading) {
    return (
      <div style={{ padding: "60px", textAlign: "center", fontSize: "18px" }}>
        Loading TCS Application...
      </div>
    );
  }

  return (
    <div className="member-list-page with-filters">
      {/* <div className="page-header">
        <h1>TCS Applications</h1>
      </div> */}

      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
  <h1 style={{ margin: 0 }}>TCS Applications</h1>
  <div style={{
    backgroundColor: "#eee",
    color: "white",
    padding: "12px 24px",
    borderRadius: "12px",
    fontSize: "20px",
    fontWeight: "700",
    boxShadow: "0 4px 12px rgba(2, 58, 241, 0.3)",
    minWidth: "200px",
    textAlign: "center",
    color: "black"
  }}>
    Total Application: <strong>{filteredAndSortedMembers.length}</strong>
  </div>
</div>

      <div className="search-section" style={{ margin: "20px 0" }}>
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email, Aadhaar, PAN, Coordinator, State, City..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          style={{
            width: "100%",
            maxWidth: "700px",
            padding: "14px 20px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            backgroundColor: "white",
            color:"black"
          }}
          autoFocus
        />
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          {/* Table */}
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
                <col style={{ width: "35%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, background: "#f9f9f9", zIndex: 10 }}>
                <tr>
                  <th style={{ padding: "14px 12px", textAlign: "left" }}>Full Name</th>
                  <th style={{ padding: "14px 12px", textAlign: "left" }}>Mobile</th>
                  {/* <th style={{ padding: "14px 12px", textAlign: "left" }}>State</th> */}
                  <th style={{ padding: "14px 12px", textAlign: "left" }}>City</th>
                  <th style={{ padding: "14px 12px", textAlign: "left" }}>Coordinator Name</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", padding: "80px", color: "#666", fontSize: "18px" }}>
                      {searchTerm || Object.keys(filters).length > 0
                        ? "No TCS members found matching your criteria"
                        : "No Temporary Civilian Staff registered yet"}
                    </td>
                  </tr>
                ) : (
                  currentRows.map((member) => (
                    <tr
                      key={member.resources_id || member.id}
                      onClick={() => openModal(member)}
                      style={{ cursor: "pointer", borderBottom: "1px solid #eee" }}
                    >
                      <td style={{ padding: "12px" }}>
                        {member.full_name || "-"}
                      </td>
                      <td style={{ padding: "12px" }}>{member.contact_number || "-"}</td>
                      {/* <td style={{ padding: "12px" }}>{member.state || "-"}</td> */}
                      <td style={{ padding: "12px" }}>{member.city || "-"}</td>
                      <td style={{ padding: "12px" }}>{member.coordinator_name || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 10px", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ marginRight: "10px" }}>Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ padding: "6px 10px", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
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
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                style={{
                  padding: "8px 14px",
                  background: "#1e40af",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                Next ›
              </button>
            </div>
          </div>
        </div>

        <FilterSidebar
          filterData={filterData}
          filterKeys={Object.keys(dynamicFilterOptions)}
          pageKey="TempStaffPage"
        />
      </div>

      {/* MODAL */}
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
                {toast.type === "success" ? <path d="M20 6L9 17l-5-5" /> : <path d="M18 6L6 18M6 6l12 12" />}
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
                maxWidth: "900px",
                maxHeight: "90vh",
                overflow: "hidden",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: "24px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center",backgroundColor: "#1e40af" }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: "24px", color: "#eee" }}>
                    {selectedMember.full_name || "N/A"}
                  </h2>
                  <p style={{ margin: "8px 0 0", color: "#eee" }}>
                    Resources ID: <strong>{selectedMember.resources_id || "-"}</strong> | Role: <strong>{selectedMember.role || "-"}</strong>
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  style={{ background: "none", border: "none", fontSize: "28px", cursor: "pointer", color: "#eee" }}
                >
                  ×
                </button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #eee", background: "#f8fafc" }}>
                {["personal", "bank", "documents", "interaction"].map((tab) => (
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
                    {tab === "bank" && "Bank Details"}
                    {tab === "documents" && "Documents & ID"}
                    {tab === "interaction" && "Interaction & Notes"}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div style={{ padding: "24px", overflowY: "auto", maxHeight: "calc(90vh - 180px)" }}>
                {/* Personal Info */}
                {activeTab === "personal" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Full Name</td><td>{selectedMember.full_name || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Mobile</td><td>{selectedMember.contact_number || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Email</td><td>{selectedMember.email_id || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>State</td><td>{selectedMember.state || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>City</td><td>{selectedMember.city || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Coordinator Name</td><td>{selectedMember.coordinator_name || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Status</td>
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

                {/* Bank Details */}
                {activeTab === "bank" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
                    <tbody>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Bank Account No.</td><td>{selectedMember.bank_account || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>IFSC Code</td><td>{selectedMember.ifsc_code || "-"}</td></tr>
                      <tr><td style={{ padding: "10px 0", fontWeight: "600" }}>Background Status</td><td>{selectedMember.background_status || "-"}</td></tr>
                    </tbody>
                  </table>
                )}

                {/* Documents & ID */}
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

                {/* Interaction & Notes */}
                {activeTab === "interaction" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ margin: 0 }}>Add New Interaction Notes</h3>
                        <button
                          onClick={addNewNote}
                          disabled={notesLoading}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: "#2563eb",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          + ADD NOTE
                        </button>
                      </div>

                      {newNotesList.length === 0 ? (
                        <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px 0", fontStyle: "italic" }}>
                          Click "ADD NOTE" to record interaction.
                        </p>
                      ) : (
                        <>
                          {newNotesList.map((note) => (
                            <div key={note.id} style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "16px", marginBottom: "16px", background: "#f9fafb" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
                                <div>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Name</label>
                                  <input type="text" value={note.contactPerson} readOnly style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "#eff6ff", border: "1px solid #3b82f6" }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Notes</label>
                                  <textarea
                                    value={note.notes}
                                    onChange={(e) => updateNewNote(note.id, "notes", e.target.value)}
                                    rows="3"
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Next Action</label>
                                  <input
                                    type="text"
                                    value={note.nextAction}
                                    onChange={(e) => updateNewNote(note.id, "nextAction", e.target.value)}
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "13px", color: "#6b7280" }}>Follow-up Date</label>
                                  <input
                                    type="date"
                                    value={note.followUpDate}
                                    onChange={(e) => updateNewNote(note.id, "followUpDate", e.target.value)}
                                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div>
                                  <button onClick={() => deleteNewNote(note.id)} style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                                      <path d="M6 4V2a2 2 0 012-2h4a2 2 0 012 2v2h5a1 1 0 110 2h-1v11a2 2 0 01-2 2H6a2 2 0 01-2-2V6H3a1 1 0 110-2h5zm2 0h4V2H8v2zm1 4a1 1 0 012 0v7a1 1 0 01-2 0V8zm4 0a1 1 0 012 0v7a1 1 0 01-2 0V8z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <div style={{ textAlign: "right" }}>
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
                              }}
                            >
                              {notesLoading ? "Saving..." : "SAVE ALL NOTES"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div>
                      <h3>Interaction History ({savedNotes.length})</h3>
                      {notesLoading && <p>Loading...</p>}
                      {!notesLoading && savedNotes.length === 0 && (
                        <p style={{ textAlign: "center", padding: "50px 0", color: "#9ca3af", fontStyle: "italic" }}>
                          No interaction history yet.
                        </p>
                      )}
                      {!notesLoading && savedNotes.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                            <thead style={{ background: "#2563eb", color: "white" }}>
                              <tr>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>Date</th>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>Name</th>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>Notes</th>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>Next Action</th>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>Follow-up</th>
                              </tr>
                            </thead>
                            <tbody>
                              {savedNotes.map((note, i) => (
                                <tr key={note.id} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>{note.date}</td>
                                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>{note.contactPerson}</td>
                                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #eee", whiteSpace: "pre-wrap" }}>{note.notes}</td>
                                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>{note.nextAction}</td>
                                  <td style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>{note.followUpDate}</td>
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
              <div style={{ padding: "20px 24px", borderTop: "1px solid #eee", textAlign: "right" }}>
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