// src/pages/RegimentalCenterPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { FaPlus, FaTimes, FaDatabase, FaSearch, FaFilter } from "react-icons/fa";
import { collection, addDoc, deleteField, doc, getDocs, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const COLLECTION_NAME = "regimentalcentermaster";

// Location stripped out of "center" and kept only in "city".
const DEFAULT_REGIMENTAL_CENTERS = [
  { branch: "Armd", center: "President's Body Guard", city: "Delhi Cantt" },
  { branch: "Inf", center: "Dogra Regimental Centre", city: "Faizabad" },
  { branch: "Engrs", center: "Bengal Engineering Group Centre", city: "Roorkee" },
  { branch: "EME", center: "1 EME Centre", city: "Secunderabad" },
  { branch: "EME", center: "Military College of Electronic and Mechanical Engineering (MCEME)", city: "Secunderabad" },
  { branch: "AOC", center: "AOC Centre", city: "Secunderabad" },
  { branch: "Arty", center: "Artillery Centre", city: "Hyderabad" },
  { branch: "Engrs", center: "Bombay Engineering Group Centre", city: "Pune" },
  { branch: "Inf", center: "Garhwal Rifles Regimental Centre", city: "Lansdowne" },
  { branch: "Inf", center: "JAT Regimental Centre", city: "Barielly" },
  { branch: "Inf", center: "Kumaon Regimental Centre", city: "Ranikhet" },
  { branch: "Engrs", center: "Madras Engineering Group", city: "Bangalore" },
  { branch: "-", center: "Madras Engineer Group & Centre", city: "Bangalore" },
  { branch: "ASC", center: "ASC (North)", city: "Bangalore" },
  { branch: "-", center: "Army Service Centre(North)", city: "Bangalore" },
  { branch: "ASC", center: "ASC (South)", city: "Bangalore" },
  { branch: "-", center: "CMP Centre & School", city: "Bangalore" },
  { branch: "CMP", center: "Corp of Military Police Centre", city: "Bangalore" },
  { branch: "Para", center: "PARA Regimental Centre", city: "Bangalore" },
  { branch: "-", center: "Parachute Regimental Centre", city: "Bangalore" },
  { branch: "Pnr", center: "Pioneer Corps Centre", city: "Bangalore" },
  { branch: "Inf", center: "11 GRRC", city: "Lucknow" },
  { branch: "AMD", center: "AMC Centre", city: "Lucknow" },
  { branch: "Inf", center: "Dogra Regimental Centre", city: "Faizabad" },
  { branch: "Inf", center: "39 GTC", city: "Varanasi Cantt" },
  { branch: "Inf", center: "14 GTC", city: "Subathu (Shimla Hills)" },
  { branch: "Inf", center: "58 GTC", city: "Happy Valley, Shillong" },
  { branch: "Inf", center: "Assam Regimental Centre", city: "Shillong" },
  { branch: "EME", center: "3 EME", city: "Centre Bhopal" },
  { branch: "Sig", center: "1 STC", city: "Jabalpur" },
  { branch: "Inf", center: "Grenadiers Regimental Centre", city: "Jabalpur" },
  { branch: "Inf", center: "Brigade of the Guards Regimental Centre", city: "Kamptee" },
  { branch: "APS", center: "APS Centre", city: "Kamptee" },
  { branch: "-", center: "Army Postal Service Centre", city: "Kamptee" },
  { branch: "Inf", center: "MAHAR Regimental Centre", city: "Saugor (MP)" },
  { branch: "Armd", center: "Armoured Corps Centre and School", city: "Ahmednagar" },
  { branch: "Mech Inf", center: "Mechanised Infantry Regimental Centre", city: "Ahmednagar" },
  { branch: "Arty", center: "Artillery Centre", city: "Nasik Road Camp" },
  { branch: "Inf", center: "RAJPUT Regt Centre", city: "Fatehgarh" },
  { branch: "Inf", center: "SIKH LI Regimental Centre", city: "Fatehgarh" },
  { branch: "Inf", center: "SIKH Regimental Centre", city: "Ramgarh" },
  { branch: "-", center: "Sikh Regimental Centre", city: "Ramgarh" },
  { branch: "Inf", center: "MADRAS Regimental Centre", city: "Wellington (NILGIRI)" },
  { branch: "Inf", center: "Ladakh Scouts Regimental Centre", city: "Leh" },
  { branch: "Inf", center: "Bihar Regt Centre", city: "Danapur" },
  { branch: "Inf", center: "Maratha Light Infantry Regimental Centre", city: "Belgaum" },
  { branch: "RVC", center: "RVC Centre & School", city: "Meerut Cantt." },
  { branch: "-", center: "Remount Training School and Depot", city: "Saharanpur" },
];

const createEmptyForm = () => ({ branch: "", center: "", city: "" });

// Fixes previously-imported docs whose "center" still has ", <location>" trailing off it.
const stripCenterLocation = (rawCenter, rawCity) => {
  const center = String(rawCenter || "").trim();
  const city = String(rawCity || "").trim();

  if (city && city !== "-" && center.endsWith(`, ${city}`)) {
    return { center: center.slice(0, center.length - city.length - 2).trim(), city };
  }

  if (!city || city === "-") {
    const lastComma = center.lastIndexOf(",");
    if (lastComma !== -1) {
      const extractedCity = center.slice(lastComma + 1).trim();
      const cleanedCenter = center.slice(0, lastComma).trim();
      if (extractedCity) {
        return { center: cleanedCenter, city: extractedCity };
      }
    }
  }

  return { center, city: city || "-" };
};

// Type-to-filter dropdown used for the Branch/City filters below.
function SearchableSelect({ value, options, onChange, allLabel, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.toLowerCase().includes(term));
  }, [query, options]);

  const handleSelect = (option) => {
    onChange(option);
    setQuery("");
    setOpen(false);
  };

  const displayValue = value === "All" ? allLabel : value;

  return (
    <div className="regimental-searchable-select" ref={containerRef}>
      <FaSearch className="regimental-searchable-icon" size={12} />
      <input
        type="text"
        value={open ? query : displayValue}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
      />
      {open && (
        <div className="regimental-searchable-options">
          <button type="button" className="regimental-searchable-option" onClick={() => handleSelect("All")}>
            {allLabel}
          </button>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button type="button" key={option} className="regimental-searchable-option" onClick={() => handleSelect(option)}>
                {option}
              </button>
            ))
          ) : (
            <div className="regimental-searchable-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RegimentalCenterPage() {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(createEmptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [branchFilter, setBranchFilter] = useState("All");
  const [cityFilter, setCityFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const loadCenters = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, COLLECTION_NAME));
      const rows = snapshot.docs.map((docSnap) => {
        const { locSer, ...data } = docSnap.data();
        const updates = {};

        // Strip any leftover locSer field from previously-imported docs.
        if (locSer !== undefined) {
          updates.locSer = deleteField();
        }

        // Strip the location out of "center" for docs imported before that cleanup existed.
        const cleaned = stripCenterLocation(data.center, data.city);
        if (cleaned.center !== data.center) updates.center = cleaned.center;
        if (cleaned.city !== data.city) updates.city = cleaned.city;

        if (Object.keys(updates).length > 0) {
          void updateDoc(doc(db, COLLECTION_NAME, docSnap.id), updates).catch((error) =>
            console.error("Error cleaning up regimental center doc:", error)
          );
        }

        return { id: docSnap.id, ...data, center: cleaned.center, city: cleaned.city };
      });
      setCenters(rows);
    } catch (error) {
      console.error("Error loading regimental centers:", error);
      showToast("Failed to load regimental centers.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCenters();
  }, []);

  const sortedCenters = useMemo(
    () =>
      [...centers].sort((a, b) => {
        const branchDiff = String(a.branch || "").localeCompare(String(b.branch || ""));
        if (branchDiff !== 0) return branchDiff;
        return String(a.center || "").localeCompare(String(b.center || ""));
      }),
    [centers]
  );

  const branchOptions = useMemo(() => {
    const values = new Set();
    centers.forEach((item) => {
      if (item.branch && item.branch !== "-") values.add(item.branch);
    });
    return ["All", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [centers]);

  const cityOptions = useMemo(() => {
    const values = new Set();
    centers.forEach((item) => {
      if (item.city && item.city !== "-") values.add(item.city);
    });
    return ["All", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [centers]);

  const filteredCenters = useMemo(
    () =>
      sortedCenters.filter((item) => {
        if (branchFilter !== "All" && item.branch !== branchFilter) return false;
        if (cityFilter !== "All" && item.city !== cityFilter) return false;
        return true;
      }),
    [sortedCenters, branchFilter, cityFilter]
  );

  const hasActiveFilters = branchFilter !== "All" || cityFilter !== "All";

  const clearFilters = () => {
    setBranchFilter("All");
    setCityFilter("All");
  };

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const openAddModal = () => {
    setForm(createEmptyForm());
    setFormError("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setForm(createEmptyForm());
    setFormError("");
  };

  const handleAddCenter = async (e) => {
    e.preventDefault();

    if (!form.center.trim()) {
      setFormError("Please enter the center name.");
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        branch: form.branch.trim() || "-",
        center: form.center.trim(),
        city: form.city.trim() || "-",
        createdAt: serverTimestamp(),
      });
      setCenters((prev) => [
        ...prev,
        { id: docRef.id, branch: form.branch.trim() || "-", center: form.center.trim(), city: form.city.trim() || "-" },
      ]);
      showToast("Regimental center added successfully!");
      closeAddModal();
    } catch (error) {
      console.error("Error adding regimental center:", error);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      const centersRef = collection(db, COLLECTION_NAME);
      const newRows = [];

      DEFAULT_REGIMENTAL_CENTERS.forEach((row) => {
        const newDocRef = doc(centersRef);
        batch.set(newDocRef, { ...row, createdAt: serverTimestamp() });
        newRows.push({ id: newDocRef.id, ...row });
      });

      await batch.commit();
      setCenters((prev) => [...prev, ...newRows]);
      showToast(`Imported ${DEFAULT_REGIMENTAL_CENTERS.length} regimental centers.`);
    } catch (error) {
      console.error("Error importing default regimental centers:", error);
      showToast("Failed to import default list. Please try again.", "error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="regimental-page">
      <style>{`
        .regimental-page {
          padding: 20px;
          width: 100%;
          box-sizing: border-box;
        }
        .regimental-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .regimental-header h2 {
          margin: 0;
          font-size: 22px;
          color: #0f172a;
        }
        .regimental-header p {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .regimental-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .regimental-filter-row {
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
        .regimental-clear-filters-btn {
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
        .regimental-clear-filters-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .regimental-btn {
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
        .regimental-btn-primary {
          background: #1976d2;
          color: #fff;
        }
        .regimental-btn-secondary {
          background: #f0fdfa;
          color: #0f766e;
          border: 1px solid #99f6e0;
        }
        .regimental-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .regimental-searchable-select {
          position: relative;
          min-width: 190px;
        }
        .regimental-searchable-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }
        .regimental-searchable-select input {
          width: 100%;
          padding: 10px 14px 10px 32px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          background: #fff;
          outline: none;
          box-sizing: border-box;
        }
        .regimental-searchable-select input:focus {
          border-color: #1976d2;
        }
        .regimental-searchable-options {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #dbe3ee;
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
          max-height: 240px;
          overflow-y: auto;
          z-index: 20;
        }
        .regimental-searchable-option {
          width: 100%;
          text-align: left;
          padding: 9px 14px;
          border: none;
          background: #fff;
          cursor: pointer;
          font-size: 13px;
          color: #0f172a;
          border-bottom: 1px solid #f1f5f9;
        }
        .regimental-searchable-option:hover {
          background: #eff6ff;
        }
        .regimental-searchable-empty {
          padding: 10px 14px;
          font-size: 13px;
          color: #94a3b8;
        }
        .regimental-table-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          padding: 20px;
          overflow-x: auto;
        }
        .regimental-table-card h3 {
          margin: 0 0 16px;
          font-size: 15px;
          color: #0f172a;
        }
        .regimental-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 700px;
        }
        .regimental-table th {
          background: #2563eb;
          color: #fff;
          text-align: left;
          padding: 12px 14px;
          font-weight: 600;
          white-space: nowrap;
        }
        .regimental-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #e5e7eb;
          vertical-align: top;
        }
        .regimental-table tr:nth-child(even) td {
          background: #f9fafb;
        }
        .regimental-empty {
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
          width: min(520px, 100%);
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
        .regimental-field {
          margin-bottom: 16px;
        }
        .regimental-field label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          margin-bottom: 6px;
        }
        .regimental-field input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
        }
        .regimental-error {
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
        .regimental-cancel-btn {
          padding: 11px 18px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #374151;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
        }
        .regimental-toast {
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
        <div className="regimental-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="regimental-header">
        <div>
          <h2>Regimental Centers</h2>
          <p>Master list of regimental centers by branch and location.</p>
        </div>
        <div className="regimental-header-actions">
          <button
            type="button"
            className={`regimental-btn ${hasActiveFilters ? "regimental-btn-primary" : "regimental-btn-secondary"}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <FaFilter size={12} />
            Filters{hasActiveFilters ? ` (${[branchFilter !== "All", cityFilter !== "All"].filter(Boolean).length})` : ""}
          </button>
          {!loading && centers.length === 0 && (
            <button type="button" className="regimental-btn regimental-btn-secondary" onClick={handleSeedDefaults} disabled={seeding}>
              <FaDatabase size={12} />
              {seeding ? "Importing..." : `Import Default List (${DEFAULT_REGIMENTAL_CENTERS.length})`}
            </button>
          )}
          <button type="button" className="regimental-btn regimental-btn-primary" onClick={openAddModal}>
            <FaPlus size={12} />
            Add Regimental Center
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="regimental-filter-row">
          <SearchableSelect
            value={branchFilter}
            options={branchOptions.filter((option) => option !== "All")}
            onChange={setBranchFilter}
            allLabel="All Branches"
            placeholder="Search branch..."
          />
          <SearchableSelect
            value={cityFilter}
            options={cityOptions.filter((option) => option !== "All")}
            onChange={setCityFilter}
            allLabel="All Cities"
            placeholder="Search city..."
          />
          <button type="button" className="regimental-clear-filters-btn" onClick={clearFilters} disabled={!hasActiveFilters}>
            <FaTimes size={11} />
            Clear All
          </button>
        </div>
      )}

      <div className="regimental-table-card">
        <h3>Regimental Centers ({filteredCenters.length})</h3>

        {loading ? (
          <div className="regimental-empty">Loading regimental centers...</div>
        ) : centers.length === 0 ? (
          <div className="regimental-empty">No regimental centers added yet.</div>
        ) : filteredCenters.length === 0 ? (
          <div className="regimental-empty">No regimental centers match these filters.</div>
        ) : (
          <table className="regimental-table">
            <thead>
              <tr>
                <th>Branch</th>
                <th>Center</th>
                <th>City</th>
              </tr>
            </thead>
            <tbody>
              {filteredCenters.map((center) => (
                <tr key={center.id}>
                  <td>{center.branch || "-"}</td>
                  <td>{center.center || "-"}</td>
                  <td>{center.city || "-"}</td>
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
              <h3>Add Regimental Center</h3>
              <button type="button" className="modal-close-btn" onClick={closeAddModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleAddCenter}>
              <div className="modal-panel-body">
                <div className="regimental-field">
                  <label htmlFor="branch">Branch</label>
                  <input id="branch" type="text" value={form.branch} onChange={(e) => updateForm("branch", e.target.value)} placeholder="e.g. Inf, Armd, EME" />
                </div>
                <div className="regimental-field">
                  <label htmlFor="center">Center</label>
                  <input id="center" type="text" value={form.center} onChange={(e) => updateForm("center", e.target.value)} placeholder="e.g. Kumaon Regimental Centre, Ranikhet" />
                </div>
                <div className="regimental-field">
                  <label htmlFor="city">City</label>
                  <input id="city" type="text" value={form.city} onChange={(e) => updateForm("city", e.target.value)} placeholder="e.g. Ranikhet" />
                </div>

                {formError && <div className="regimental-error">{formError}</div>}

                <div className="modal-footer-actions">
                  <button type="button" className="regimental-cancel-btn" onClick={closeAddModal}>
                    Cancel
                  </button>
                  <button type="submit" className="regimental-btn regimental-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Center"}
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
