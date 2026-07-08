// src/pages/InteractionPage.jsx
import { useEffect, useMemo, useState } from "react";
import { FaTimes, FaPlus, FaExclamationTriangle, FaRegThumbsUp, FaCommentDots, FaMinusCircle } from "react-icons/fa";
import { collection, collectionGroup, addDoc, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getMemberName, getMemberPhone, getMemberEmail, getMemberOrganization } from "../utils/memberFields";

const INTERACTION_TYPES = ["Lead or Project Related", "General"];
const INTERACTION_RATINGS = ["Good", "Bad", "Neutral"];
const INTERACTION_CATEGORIES = [
  "Reminder",
  "POSH",
  "Misbehaviour",
  "Absent from Work",
  "Refused Offer",
  "Refused to Join",
  "Blacklisted",
  "Good Work",
  "Provided a Reference",
  "Other",
];
const INTERACTION_MODES = ["Call", "Video Call", "Email", "Face to Face", "WhatsApp", "Physical Letter", "Other"];
const DETAILS_MAX_LENGTH = 256;
const BO_ORG_NAME = "Brisk Olive (BO)";

const RATING_BADGE_STYLE = {
  Good: { background: "#dcfce7", color: "#16a34a" },
  Bad: { background: "#fee2e2", color: "#dc2626" },
  Neutral: { background: "#f1f5f9", color: "#475569" },
};

const createEmptyForm = () => ({
  direction: "",
  spocName: "",
  interactionType: "",
  leadOrProjectName: "",
  rating: "",
  category: "",
  mode: "",
  details: "",
});

const formatDateShort = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function InteractionPage({ memberRecords = [], membersLoading = false }) {
  const [allInteractions, setAllInteractions] = useState([]);
  const [loadingInteractions, setLoadingInteractions] = useState(true);
  const [projectFilter, setProjectFilter] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);

  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  useEffect(() => {
    let cancelled = false;

    const loadInteractions = async () => {
      setLoadingInteractions(true);
      try {
        const snapshot = await getDocs(collectionGroup(db, "interactions"));
        if (cancelled) return;

        const rows = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            if (data.entryType !== "bo_interaction") return null;

            const leadOrProjectName =
              data.leadOrProjectName && data.leadOrProjectName !== "-" ? data.leadOrProjectName : "";

            return {
              id: docSnap.id,
              memberId: docSnap.ref.parent.parent?.id || "",
              memberName: data.contactPerson || "-",
              direction: data.direction || "-",
              spocName: data.spocName || "-",
              interactionType: data.interactionType || "-",
              leadOrProjectName,
              rating: data.rating || "Neutral",
              category: data.category || "-",
              mode: data.mode || "-",
              notes: data.notes || "-",
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

        setAllInteractions(rows);
      } catch (error) {
        console.error("Error loading escalations:", error);
      } finally {
        if (!cancelled) setLoadingInteractions(false);
      }
    };

    loadInteractions();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectOptions = useMemo(() => {
    const names = new Set();
    allInteractions.forEach((item) => {
      if (item.leadOrProjectName) names.add(item.leadOrProjectName);
    });
    return ["All", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [allInteractions]);

  const filteredInteractions = useMemo(() => {
    if (projectFilter === "All") return allInteractions;
    return allInteractions.filter((item) => item.leadOrProjectName === projectFilter);
  }, [allInteractions, projectFilter]);

  const counts = useMemo(
    () => ({
      total: filteredInteractions.length,
      escalations: filteredInteractions.filter((item) => item.rating === "Bad").length,
      appreciations: filteredInteractions.filter((item) => item.rating === "Good").length,
      neutral: filteredInteractions.filter((item) => item.rating === "Neutral").length,
    }),
    [filteredInteractions]
  );

  const matchedMembers = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();
    if (!term) return [];

    return memberRecords
      .filter((member) => {
        const name = getMemberName(member).toLowerCase();
        const phone = getMemberPhone(member).toLowerCase();
        return name.includes(term) || phone.includes(term);
      })
      .slice(0, 8);
  }, [memberSearchTerm, memberRecords]);

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    setMemberSearchTerm("");
    setIsSearchOpen(false);
  };

  const handleClearMember = () => setSelectedMember(null);

  const resetForm = () => {
    setForm(createEmptyForm());
    setSelectedMember(null);
    setMemberSearchTerm("");
    setFormError("");
  };

  const openAddModal = () => setShowAddModal(true);
  const closeAddModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const fromOrg = form.direction === "Member to BO" ? (selectedMember ? getMemberName(selectedMember) : "") : BO_ORG_NAME;
  const toOrg = form.direction === "Member to BO" ? BO_ORG_NAME : selectedMember ? getMemberName(selectedMember) : "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!selectedMember) {
      setFormError("Please select a member first.");
      return;
    }
    if (!form.direction) {
      setFormError("Please select the interaction direction.");
      return;
    }
    if (!form.spocName.trim()) {
      setFormError("Please enter the Brisk Olive point of contact's name.");
      return;
    }
    if (!form.interactionType) {
      setFormError("Please select whether this is Lead/Project related or General.");
      return;
    }
    if (form.interactionType === "Lead or Project Related" && !form.leadOrProjectName.trim()) {
      setFormError("Please enter the Lead / Project name.");
      return;
    }
    if (!form.rating) {
      setFormError("Please select whether this is Good, Bad, or Neutral.");
      return;
    }
    if (!form.category) {
      setFormError("Please select an interaction category.");
      return;
    }
    if (!form.mode) {
      setFormError("Please select the interaction mode.");
      return;
    }
    if (!form.details.trim()) {
      setFormError("Please enter the interaction details.");
      return;
    }

    setSubmitting(true);
    try {
      const interactionsRef = collection(db, "users", selectedMember.id, "interactions");
      const leadOrProjectName = form.leadOrProjectName.trim();
      const docRef = await addDoc(interactionsRef, {
        entryType: "bo_interaction",
        contactPerson: getMemberName(selectedMember),
        direction: form.direction,
        fromOrg,
        toOrg,
        spocName: form.spocName.trim(),
        interactionType: form.interactionType,
        leadOrProjectName: leadOrProjectName || "-",
        rating: form.rating,
        category: form.category,
        mode: form.mode,
        notes: form.details.trim(),
        nextAction: "-",
        followUpDate: null,
        createdAt: serverTimestamp(),
        createdBy: "admin",
      });

      setAllInteractions((prev) => [
        {
          id: docRef.id,
          memberId: selectedMember.id,
          memberName: getMemberName(selectedMember),
          direction: form.direction,
          spocName: form.spocName.trim(),
          interactionType: form.interactionType,
          leadOrProjectName,
          rating: form.rating,
          category: form.category,
          mode: form.mode,
          notes: form.details.trim(),
          createdAt: new Date(),
        },
        ...prev,
      ]);

      showToast(`Interaction with ${getMemberName(selectedMember)} saved successfully!`, "success");
      closeAddModal();
    } catch (error) {
      console.error("Error saving interaction:", error);
      showToast("Failed to save interaction. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="escalation-page">
      <style>{`
        .escalation-page {
          padding: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        .escalation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .escalation-header h2 {
          margin: 0;
          font-size: 22px;
          color: #0f172a;
        }
        .escalation-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .escalation-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .escalation-project-select {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          background: #fff;
          min-width: 180px;
        }
        .escalation-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          border-radius: 10px;
          border: none;
          background: #1976d2;
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
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
        .card-icon.red { background: #dc2626; }
        .card-icon.new { background: #43a047; }
        .card-icon.neutral { background: #64748b; }
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
        .escalation-table-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          padding: 20px;
          overflow-x: auto;
        }
        .escalation-table-card h3 {
          margin: 0 0 16px;
          font-size: 15px;
          color: #0f172a;
        }
        .escalation-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 900px;
        }
        .escalation-table th {
          background: #2563eb;
          color: #fff;
          text-align: left;
          padding: 12px 14px;
          font-weight: 600;
          white-space: nowrap;
        }
        .escalation-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }
        .escalation-table tr:nth-child(even) td {
          background: #f9fafb;
        }
        .escalation-rating-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }
        .escalation-empty {
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
          width: min(760px, 100%);
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
        .interaction-section-title {
          margin: 0 0 14px;
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .interaction-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 16px;
        }
        .interaction-field label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
        }
        .interaction-field input,
        .interaction-field select,
        .interaction-field textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
          background: #fff;
          font-family: inherit;
        }
        .interaction-field input:disabled {
          background: #f1f5f9;
          color: #64748b;
        }
        .interaction-field textarea {
          resize: vertical;
          min-height: 90px;
        }
        .interaction-member-search {
          position: relative;
        }
        .interaction-member-results {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #dbe3ee;
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          max-height: 220px;
          overflow-y: auto;
          z-index: 20;
        }
        .interaction-member-result-item {
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          border: none;
          background: #fff;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
        }
        .interaction-member-result-item:hover {
          background: #eff6ff;
        }
        .interaction-member-result-item strong {
          display: block;
          font-size: 13px;
          color: #0f172a;
        }
        .interaction-member-result-item span {
          font-size: 12px;
          color: #64748b;
        }
        .interaction-selected-member {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          padding: 14px 16px;
        }
        .interaction-selected-member h4 {
          margin: 0 0 4px;
          font-size: 15px;
          color: #0f172a;
        }
        .interaction-selected-member p {
          margin: 0;
          font-size: 13px;
          color: #475569;
        }
        .interaction-clear-btn {
          border: none;
          background: #fff;
          color: #1976d2;
          width: 32px;
          height: 32px;
          border-radius: 999px;
          cursor: pointer;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .interaction-error {
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
        .interaction-cancel-btn {
          padding: 11px 18px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #374151;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
        }
        .interaction-submit-btn {
          padding: 11px 20px;
          border-radius: 10px;
          border: none;
          background: #1976d2;
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
        .interaction-submit-btn:disabled {
          background: #90caf9;
          cursor: not-allowed;
        }
        .interaction-toast {
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
      `}</style>

      {toast.show && (
        <div className="interaction-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="escalation-header">
        <div>
          <h2>Escalations</h2>
          <p>Track member escalations and appreciations, filterable by project.</p>
        </div>
        <div className="escalation-header-actions">
          <select className="escalation-project-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            {projectOptions.map((option) => (
              <option key={option} value={option}>
                {option === "All" ? "All Projects" : option}
              </option>
            ))}
          </select>
          <button type="button" className="escalation-add-btn" onClick={openAddModal}>
            <FaPlus size={12} />
            Add Escalation
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="card-icon blue">
            <FaCommentDots size={26} />
          </div>
          <div className="card-label">Total Interactions</div>
          <div className="card-value">{counts.total.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon red">
            <FaExclamationTriangle size={24} />
          </div>
          <div className="card-label">Total Escalations</div>
          <div className="card-value">{counts.escalations.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon new">
            <FaRegThumbsUp size={24} />
          </div>
          <div className="card-label">Total Appreciations</div>
          <div className="card-value">{counts.appreciations.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="card-icon neutral">
            <FaMinusCircle size={24} />
          </div>
          <div className="card-label">Neutral</div>
          <div className="card-value">{counts.neutral.toLocaleString()}</div>
        </div>
      </div>

      <div className="escalation-table-card">
        <h3>Interactions ({filteredInteractions.length})</h3>

        {loadingInteractions ? (
          <div className="escalation-empty">Loading interactions...</div>
        ) : filteredInteractions.length === 0 ? (
          <div className="escalation-empty">No escalations logged yet.</div>
        ) : (
          <table className="escalation-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Project</th>
                <th>Direction</th>
                <th>Rating</th>
                <th>Category</th>
                <th>Mode</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredInteractions.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateShort(item.createdAt)}</td>
                  <td>{item.memberName}</td>
                  <td>{item.leadOrProjectName || "-"}</td>
                  <td>{item.direction}</td>
                  <td>
                    <span className="escalation-rating-badge" style={RATING_BADGE_STYLE[item.rating] || RATING_BADGE_STYLE.Neutral}>
                      {item.rating}
                    </span>
                  </td>
                  <td>{item.category}</td>
                  <td>{item.mode}</td>
                  <td style={{ maxWidth: "260px", whiteSpace: "pre-wrap" }}>{item.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <h3>Add Escalation</h3>
              <button type="button" className="modal-close-btn" onClick={closeAddModal} title="Close">
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-panel-body">
                <h3 className="interaction-section-title">Select Member</h3>

                {selectedMember ? (
                  <div className="interaction-selected-member" style={{ marginBottom: "16px" }}>
                    <div>
                      <h4>{getMemberName(selectedMember)}</h4>
                      <p>
                        {getMemberPhone(selectedMember) || "-"}
                        {getMemberEmail(selectedMember) ? ` • ${getMemberEmail(selectedMember)}` : ""}
                        {getMemberOrganization(selectedMember) ? ` • ${getMemberOrganization(selectedMember)}` : ""}
                      </p>
                    </div>
                    <button type="button" className="interaction-clear-btn" onClick={handleClearMember} title="Change member">
                      <FaTimes size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="interaction-field interaction-member-search" style={{ marginBottom: "16px" }}>
                    <label htmlFor="member-search">Search by Name or Mobile Number</label>
                    <input
                      id="member-search"
                      type="text"
                      value={memberSearchTerm}
                      onChange={(e) => {
                        setMemberSearchTerm(e.target.value);
                        setIsSearchOpen(true);
                      }}
                      onFocus={() => setIsSearchOpen(true)}
                      placeholder={membersLoading ? "Loading members..." : "Type a name or mobile number..."}
                      disabled={membersLoading}
                      autoComplete="off"
                    />
                    {isSearchOpen && memberSearchTerm.trim() && (
                      <div className="interaction-member-results">
                        {matchedMembers.length > 0 ? (
                          matchedMembers.map((member) => (
                            <button
                              type="button"
                              key={member.id}
                              className="interaction-member-result-item"
                              onClick={() => handleSelectMember(member)}
                            >
                              <strong>{getMemberName(member)}</strong>
                              <span>{getMemberPhone(member) || "No phone on file"}</span>
                            </button>
                          ))
                        ) : (
                          <div style={{ padding: "12px 14px", fontSize: "13px", color: "#94a3b8" }}>No matching members found.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <h3 className="interaction-section-title">Interaction: BO to Member or Vice Versa?</h3>
                <div className="interaction-grid">
                  <div className="interaction-field">
                    <label htmlFor="direction">Direction</label>
                    <select id="direction" value={form.direction} onChange={(e) => updateForm("direction", e.target.value)}>
                      <option value="" disabled>
                        Select direction
                      </option>
                      <option value="BO to Member">From BO to Member</option>
                      <option value="Member to BO">From Member to BO</option>
                    </select>
                  </div>
                  <div className="interaction-field">
                    <label htmlFor="spoc-name">Brisk Olive Point of Contact</label>
                    <input
                      id="spoc-name"
                      type="text"
                      value={form.spocName}
                      onChange={(e) => updateForm("spocName", e.target.value)}
                      placeholder="Name of the BO team member involved"
                    />
                  </div>
                </div>

                {form.direction && (
                  <div className="interaction-grid">
                    <div className="interaction-field">
                      <label>From</label>
                      <input type="text" value={fromOrg} disabled readOnly />
                    </div>
                    <div className="interaction-field">
                      <label>To</label>
                      <input type="text" value={toOrg} disabled readOnly />
                    </div>
                  </div>
                )}

                <h3 className="interaction-section-title">Interaction Type</h3>
                <div className="interaction-grid">
                  <div className="interaction-field">
                    <label htmlFor="interaction-type">Lead/Project Related or General?</label>
                    <select
                      id="interaction-type"
                      value={form.interactionType}
                      onChange={(e) => updateForm("interactionType", e.target.value)}
                    >
                      <option value="" disabled>
                        Select interaction type
                      </option>
                      {INTERACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  {form.interactionType === "Lead or Project Related" && (
                    <div className="interaction-field">
                      <label htmlFor="lead-name">Lead / Project Name</label>
                      <input
                        id="lead-name"
                        type="text"
                        value={form.leadOrProjectName}
                        onChange={(e) => updateForm("leadOrProjectName", e.target.value)}
                        placeholder="Enter the lead or project name"
                      />
                    </div>
                  )}
                </div>

                <h3 className="interaction-section-title">Interaction Details</h3>
                <div className="interaction-grid">
                  <div className="interaction-field">
                    <label htmlFor="rating">Good, Bad, or Neutral?</label>
                    <select id="rating" value={form.rating} onChange={(e) => updateForm("rating", e.target.value)}>
                      <option value="" disabled>
                        Select rating
                      </option>
                      {INTERACTION_RATINGS.map((rating) => (
                        <option key={rating} value={rating}>
                          {rating}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="interaction-field">
                    <label htmlFor="category">Interaction Category</label>
                    <select id="category" value={form.category} onChange={(e) => updateForm("category", e.target.value)}>
                      <option value="" disabled>
                        Select category
                      </option>
                      {INTERACTION_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="interaction-field">
                    <label htmlFor="mode">Interaction Mode</label>
                    <select id="mode" value={form.mode} onChange={(e) => updateForm("mode", e.target.value)}>
                      <option value="" disabled>
                        Select mode
                      </option>
                      {INTERACTION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="interaction-field" style={{ marginBottom: "20px" }}>
                  <label htmlFor="details">Interaction Details</label>
                  <textarea
                    id="details"
                    value={form.details}
                    maxLength={DETAILS_MAX_LENGTH}
                    onChange={(e) => updateForm("details", e.target.value)}
                    placeholder="Describe what happened during this interaction..."
                  />
                  <div style={{ textAlign: "right", fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                    {form.details.length}/{DETAILS_MAX_LENGTH}
                  </div>
                </div>

                {formError && <div className="interaction-error">{formError}</div>}

                <div className="modal-footer-actions">
                  <button type="button" className="interaction-cancel-btn" onClick={closeAddModal}>
                    Cancel
                  </button>
                  <button type="submit" className="interaction-submit-btn" disabled={submitting}>
                    {submitting ? "Saving..." : "Submit Interaction"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
