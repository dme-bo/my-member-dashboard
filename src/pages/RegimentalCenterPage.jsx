// src/pages/RegimentalCenterPage.jsx
import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaTimes, FaDatabase, FaSearch, FaTag } from "react-icons/fa";
import { collection, addDoc, doc, getDocs, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getMemberName, getMemberPhone, parseMemberSkills } from "../utils/memberFields";

const REGIMENTAL_CENTRES_SEED = [
  { center: "Grenadiers Regimental Centre", city: "Jabalpur, Madhya Pradesh", regiment: "The Grenadiers" },
  { center: "Rajput Regimental Centre", city: "Fatehgarh, Uttar Pradesh", regiment: "Rajput Regiment" },
  { center: "Rajputana Rifles Regimental Centre", city: "Delhi Cantonment", regiment: "Rajputana Rifles" },
  { center: "Jat Regimental Centre", city: "Bareilly, Uttar Pradesh", regiment: "Jat Regiment" },
  { center: "Sikh Regimental Centre", city: "Ramgarh, Jharkhand", regiment: "Sikh Regiment" },
  { center: "Sikh Light Infantry Regimental Centre", city: "Fatehgarh, Uttar Pradesh", regiment: "Sikh Light Infantry" },
  { center: "Punjab Regimental Centre", city: "Ramgarh, Jharkhand", regiment: "Punjab Regiment" },
  { center: "Bihar Regimental Centre", city: "Danapur, Bihar", regiment: "Bihar Regiment" },
  { center: "Madras Regimental Centre", city: "Wellington, Tamil Nadu", regiment: "Madras Regiment" },
  { center: "Maratha LI Regimental Centre", city: "Belagavi, Karnataka", regiment: "Maratha Light Infantry" },
  { center: "Kumaon Regimental Centre", city: "Ranikhet, Uttarakhand", regiment: "Kumaon Regiment" },
  { center: "Garhwal Rifles Regimental Centre", city: "Lansdowne, Uttarakhand", regiment: "Garhwal Rifles" },
  { center: "Dogra Regimental Centre", city: "Ayodhya (Faizabad), Uttar Pradesh", regiment: "Dogra Regiment" },
  { center: "Assam Regimental Centre", city: "Shillong, Meghalaya", regiment: "Assam Regiment" },
  { center: "Mahar Regimental Centre", city: "Sagar, Madhya Pradesh", regiment: "Mahar Regiment" },
  { center: "Mechanised Infantry Regimental Centre", city: "Ahmednagar, Maharashtra", regiment: "Mechanised Infantry" },
  { center: "JAK Rifles Regimental Centre", city: "Jabalpur, Madhya Pradesh", regiment: "Jammu & Kashmir Rifles" },
  { center: "JAK LI Regimental Centre", city: "Srinagar", regiment: "Jammu & Kashmir Light Infantry" },
  { center: "Parachute Regimental Centre", city: "Bengaluru", regiment: "Parachute Regiment" },
  { center: "Guards Regimental Centre", city: "Kamptee, Maharashtra", regiment: "Brigade of the Guards" },
  { center: "Headquarters & Regimental Centre", city: "Leh, Ladakh", regiment: "Ladakh Scouts" },
  { center: "11 Gorkha Training Centre", city: "Lucknow", regiment: "-" },
  { center: "14 Gorkha Training Centre", city: "Subathu", regiment: "-" },
  { center: "39 Gorkha Training Centre", city: "Varanasi", regiment: "-" },
  { center: "58 Gorkha Training Centre", city: "Shillong", regiment: "-" },
];

const CORPS_CENTRE_SEED = [
  { name: "Armoured Corps Centre & School", location: "Ahmednagar", state: "Maharashtra" },
  { name: "Army Air Defence Centre & College", location: "Gopalpur", state: "Odisha" },
  { name: "Army Service Corps Centre (North)", location: "Bengaluru", state: "Karnataka" },
  { name: "Army Service Corps Centre (South)", location: "Bengaluru", state: "Karnataka" },
  { name: "Corps of Military Police Centre & School", location: "Bengaluru", state: "Karnataka" },
  { name: "Army Medical Corps Centre & College", location: "Lucknow", state: "Uttar Pradesh" },
  { name: "Army Ordnance Corps Centre", location: "Secunderabad", state: "Telangana" },
  { name: "Army Education Corps Training College & Centre", location: "Pachmarhi", state: "Madhya Pradesh" },
  { name: "Corps of Electronics & Mechanical Engineers (1 EME Centre)", location: "Secunderabad", state: "Telangana" },
  { name: "3 EME Centre", location: "Bhopal", state: "Madhya Pradesh" },
  { name: "Army Postal Service Centre", location: "Kamptee", state: "Maharashtra" },
  { name: "Pioneer Corps Centre", location: "Bengaluru", state: "Karnataka" },
  { name: "Remount Veterinary Corps Centre & School", location: "Meerut", state: "Uttar Pradesh" },
  { name: "Intelligence Corps Training Centre & School", location: "Pune", state: "Maharashtra" },
  { name: "Bengal Engineer Group & Centre", location: "Roorkee", state: "Uttarakhand" },
  { name: "Bombay Engineer Group & Centre (Kirkee)", location: "Pune", state: "Maharashtra" },
  { name: "Madras Engineer Group & Centre", location: "Bengaluru", state: "Karnataka" },
  { name: "Defence Security Corps Centre", location: "Kannur", state: "Kerala" },
];

const SCHOOL_INSTRUCTION_SEED = [
  { name: "Infantry School", location: "Mhow" },
  { name: "Army War College", location: "Mhow" },
  { name: "College of Military Engineering (CME)", location: "Pune" },
  { name: "Military College of Telecommunication Engineering (MCTE)", location: "Mhow" },
  { name: "Military College of Electronics & Mechanical Engineering (MCEME)", location: "Secunderabad" },
  { name: "College of Materials Management (CMM)", location: "Jabalpur" },
  { name: "School of Artillery", location: "Deolali" },
  { name: "High Altitude Warfare School (HAWS)", location: "Gulmarg" },
  { name: "Counter Insurgency & Jungle Warfare School (CIJWS)", location: "Vairengte" },
  { name: "Army School of Physical Training", location: "Pune" },
  { name: "Army Airborne Training School", location: "Agra" },
  { name: "Combat Army Aviation Training School", location: "Nashik" },
  { name: "Junior Leaders Wing", location: "Belagavi" },
  { name: "Junior Leaders Academy", location: "Bareilly" },
  { name: "Institute of Military Law", location: "Kamptee" },
  { name: "Army Sports Institute", location: "Pune" },
];

const ACADEMY_SEED = [
  { name: "National Defence Academy", city: "Pune", state: "Maharashtra" },
  { name: "Indian Military Academy", city: "Dehradun", state: "Uttarakhand" },
  { name: "Officers Training Academy", city: "Chennai", state: "Tamil Nadu" },
  { name: "Officers Training Academy", city: "Gaya", state: "Bihar" },
  { name: "Rashtriya Indian Military College", city: "Dehradun", state: "Uttarakhand" },
  { name: "Army Cadet College", city: "Dehradun", state: "Uttarakhand" },
];

const CATEGORIES = [
  {
    key: "regimental",
    label: "Regimental Centres",
    collectionName: "regimentalcentermaster",
    nameField: "center",
    columns: [
      { key: "center", label: "Centre" },
      { key: "city", label: "Location" },
      // { key: "regiment", label: "Regiment" },
    ],
    seed: REGIMENTAL_CENTRES_SEED,
  },
  {
    key: "corps",
    label: "Corps Centre / Institution",
    collectionName: "corpscentermaster",
    nameField: "name",
    columns: [
      { key: "name", label: "Corps Centre / Institution" },
      { key: "location", label: "Location" },
      { key: "state", label: "State" },
    ],
    seed: CORPS_CENTRE_SEED,
  },
  {
    key: "school",
    label: "School of Instruction",
    collectionName: "schoolinstructionmaster",
    nameField: "name",
    columns: [
      { key: "name", label: "School of Instruction" },
      { key: "location", label: "Location" },
    ],
    seed: SCHOOL_INSTRUCTION_SEED,
  },
  {
    key: "academy",
    label: "Academy",
    collectionName: "academymaster",
    nameField: "name",
    columns: [
      { key: "name", label: "Academy" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
    ],
    seed: ACADEMY_SEED,
  },
];

const createEmptyForm = (category) =>
  category.columns.reduce((acc, col) => ({ ...acc, [col.key]: "" }), {});

export default function RegimentalCenterPage() {
  const [activeCategoryKey, setActiveCategoryKey] = useState(CATEGORIES[0].key);
  const activeCategory = CATEGORIES.find((c) => c.key === activeCategoryKey);

  const [itemsByCategory, setItemsByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(createEmptyForm(CATEGORIES[0]));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Tag-members modal
  const [tagModalItem, setTagModalItem] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [tagSaving, setTagSaving] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const loadCategoryItems = async (category) => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, category.collectionName));
      const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setItemsByCategory((prev) => ({ ...prev, [category.key]: rows }));
    } catch (error) {
      console.error(`Error loading ${category.label}:`, error);
      showToast(`Failed to load ${category.label}.`, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (itemsByCategory[activeCategoryKey]) return;
    loadCategoryItems(activeCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryKey]);

  useEffect(() => {
    setSearchTerm("");
  }, [activeCategoryKey]);

  const items = itemsByCategory[activeCategoryKey] || [];

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => String(a[activeCategory.nameField] || "").localeCompare(String(b[activeCategory.nameField] || ""))),
    [items, activeCategory]
  );

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return sortedItems;
    return sortedItems.filter((row) =>
      activeCategory.columns.some((col) => String(row[col.key] || "").toLowerCase().includes(term))
    );
  }, [sortedItems, searchTerm, activeCategory]);

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const openAddModal = () => {
    setForm(createEmptyForm(activeCategory));
    setFormError("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setForm(createEmptyForm(activeCategory));
    setFormError("");
  };

  const handleAddItem = async (e) => {
    e.preventDefault();

    if (!String(form[activeCategory.nameField] || "").trim()) {
      setFormError(`Please enter the ${activeCategory.columns[0].label.toLowerCase()}.`);
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      const payload = {};
      activeCategory.columns.forEach((col) => {
        payload[col.key] = String(form[col.key] || "").trim() || "-";
      });

      const docRef = await addDoc(collection(db, activeCategory.collectionName), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      setItemsByCategory((prev) => ({
        ...prev,
        [activeCategoryKey]: [...(prev[activeCategoryKey] || []), { id: docRef.id, ...payload }],
      }));
      showToast(`${activeCategory.label} entry added successfully!`);
      closeAddModal();
    } catch (error) {
      console.error(`Error adding ${activeCategory.label}:`, error);
      setFormError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      const ref = collection(db, activeCategory.collectionName);
      const newRows = [];

      activeCategory.seed.forEach((row) => {
        const newDocRef = doc(ref);
        batch.set(newDocRef, { ...row, createdAt: serverTimestamp() });
        newRows.push({ id: newDocRef.id, ...row });
      });

      await batch.commit();
      setItemsByCategory((prev) => ({
        ...prev,
        [activeCategoryKey]: [...(prev[activeCategoryKey] || []), ...newRows],
      }));
      showToast(`Imported ${activeCategory.seed.length} ${activeCategory.label} entries.`);
    } catch (error) {
      console.error(`Error importing ${activeCategory.label} defaults:`, error);
      showToast("Failed to import default list. Please try again.", "error");
    } finally {
      setSeeding(false);
    }
  };

  // ------------------- Tag members to a centre/institution -------------------
  const openTagModal = async (item) => {
    setTagModalItem(item);
    setSelectedMemberIds(item.taggedMemberIds || []);
    setMemberSearchTerm("");

    if (allMembers.length === 0) {
      setMembersLoading(true);
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setAllMembers(rows);
      } catch (error) {
        console.error("Error loading members:", error);
        showToast("Failed to load members list.", "error");
      } finally {
        setMembersLoading(false);
      }
    }
  };

  const closeTagModal = () => {
    setTagModalItem(null);
    setSelectedMemberIds([]);
    setMemberSearchTerm("");
  };

  const filteredMembersForTagging = useMemo(() => {
    const term = memberSearchTerm.trim().toLowerCase();
    if (!term) return allMembers;
    return allMembers.filter((m) => {
      const name = getMemberName(m).toLowerCase();
      const phone = getMemberPhone(m).toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
  }, [allMembers, memberSearchTerm]);

  const toggleMemberSelection = (id) => {
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSaveTaggedMembers = async () => {
    if (!tagModalItem) return;
    const label = tagModalItem[activeCategory.nameField];

    setTagSaving(true);
    try {
      await updateDoc(doc(db, activeCategory.collectionName, tagModalItem.id), {
        taggedMemberIds: selectedMemberIds,
      });

      await Promise.all(
        selectedMemberIds.map(async (memberId) => {
          const member = allMembers.find((m) => m.id === memberId);
          if (!member) return;
          const existingSkills = parseMemberSkills(member);
          if (existingSkills.includes(label)) return;
          const nextSkills = [...existingSkills, label];
          await updateDoc(doc(db, "users", memberId), { skills: nextSkills, Skills: nextSkills.join(", ") });
        })
      );

      setItemsByCategory((prev) => ({
        ...prev,
        [activeCategoryKey]: (prev[activeCategoryKey] || []).map((row) =>
          row.id === tagModalItem.id ? { ...row, taggedMemberIds: selectedMemberIds } : row
        ),
      }));

      showToast(`Tagged ${selectedMemberIds.length} member(s) to ${label}.`);
      closeTagModal();
    } catch (error) {
      console.error("Error tagging members:", error);
      showToast("Failed to save tags.", "error");
    } finally {
      setTagSaving(false);
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
        .regimental-category-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .regimental-category-btn {
          padding: 8px 16px;
          border-radius: 30px;
          border: none;
          background: #e5e7eb;
          color: #1f2937;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          box-shadow: 0 2px 1px -1px rgba(0,0,0,0.2), 0 1px 1px 0 rgba(0,0,0,0.14), 0 1px 3px 0 rgba(0,0,0,0.12);
          transition: box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .regimental-category-btn.active {
          background: #1976d2;
          color: #fff;
        }
        .regimental-content {
          min-width: 0;
        }
        .regimental-search-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .regimental-search-box {
          position: relative;
          flex: 1;
          max-width: 350px;
        }
        .regimental-search-box input {
          width: 100%;
          padding: 12px 14px 12px 40px;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          font-size: 14px;
          box-sizing: border-box;
        }
        .regimental-search-box svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
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
          min-width: 500px;
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
        .regimental-table tbody tr {
          cursor: pointer;
        }
        .regimental-table tbody tr:hover td {
          background: #eff6ff;
        }
        .regimental-tag-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 999px;
          background: #ecfdf5;
          color: #047857;
          font-weight: 700;
          font-size: 11px;
          white-space: nowrap;
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
        .modal-panel.wide {
          width: min(600px, 100%);
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
        .regimental-member-list {
          max-height: 320px;
          overflow-y: auto;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }
        .regimental-member-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          font-size: 13px;
        }
        .regimental-member-row:hover {
          background: #f8fafc;
        }
        .regimental-member-row.selected {
          background: #eff6ff;
        }
        .regimental-member-name {
          font-weight: 600;
          color: #0f172a;
        }
        .regimental-member-phone {
          color: #64748b;
          font-size: 12px;
        }
      `}</style>

      {toast.show && (
        <div className="regimental-toast" style={{ background: toast.type === "success" ? "#16a34a" : "#dc2626" }}>
          {toast.message}
        </div>
      )}

      <div className="regimental-header">
        <div>
          <h2>Regimental & Training Centres</h2>
          {/* <p>Browse by category, and click any entry to tag members to it.</p> */}
        </div>
        <div className="regimental-header-actions">
          {!loading && items.length === 0 && (
            <button type="button" className="regimental-btn regimental-btn-secondary" onClick={handleSeedDefaults} disabled={seeding}>
              <FaDatabase size={12} />
              {seeding ? "Importing..." : `Import Default List (${activeCategory.seed.length})`}
            </button>
          )}
          <button type="button" className="regimental-btn regimental-btn-primary" onClick={openAddModal}>
            <FaPlus size={12} />
            Add {activeCategory.label} Entry
          </button>
        </div>
      </div>

      <div className="regimental-category-row">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`regimental-category-btn ${cat.key === activeCategoryKey ? "active" : ""}`}
            onClick={() => setActiveCategoryKey(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="regimental-content">
          <div className="regimental-search-row">
            <div className="regimental-search-box">
              <FaSearch size={14} />
              <input
                type="text"
                placeholder={`Search ${activeCategory.label.toLowerCase()}...`}
                aria-label={`Search ${activeCategory.label.toLowerCase()}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="regimental-table-card">
            <h3>{activeCategory.label} ({filteredItems.length})</h3>

            {loading ? (
              <div className="regimental-empty">Loading {activeCategory.label.toLowerCase()}...</div>
            ) : items.length === 0 ? (
              <div className="regimental-empty">No {activeCategory.label.toLowerCase()} added yet.</div>
            ) : filteredItems.length === 0 ? (
              <div className="regimental-empty">No entries match your search.</div>
            ) : (
              <table className="regimental-table">
                <thead>
                  <tr>
                    {activeCategory.columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th>Tagged Members</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((row) => (
                    <tr key={row.id} onClick={() => openTagModal(row)} title="Click to tag members">
                      {activeCategory.columns.map((col) => (
                        <td key={col.key}>{row[col.key] || "-"}</td>
                      ))}
                      <td>
                        <span className="regimental-tag-badge">
                          <FaTag size={10} />
                          {(row.taggedMemberIds || []).length}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <h3>Add {activeCategory.label} Entry</h3>
              <button type="button" className="modal-close-btn" onClick={closeAddModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleAddItem}>
              <div className="modal-panel-body">
                {activeCategory.columns.map((col) => (
                  <div className="regimental-field" key={col.key}>
                    <label htmlFor={col.key}>{col.label}</label>
                    <input
                      id={col.key}
                      type="text"
                      value={form[col.key] || ""}
                      onChange={(e) => updateForm(col.key, e.target.value)}
                      placeholder={`e.g. ${col.label}`}
                    />
                  </div>
                ))}

                {formError && <div className="regimental-error">{formError}</div>}

                <div className="modal-footer-actions">
                  <button type="button" className="regimental-cancel-btn" onClick={closeAddModal}>
                    Cancel
                  </button>
                  <button type="submit" className="regimental-btn regimental-btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save Entry"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {tagModalItem && (
        <div className="modal-overlay" onClick={closeTagModal}>
          <div className="modal-panel wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <h3>Tag Members — {tagModalItem[activeCategory.nameField]}</h3>
              <button type="button" className="modal-close-btn" onClick={closeTagModal} title="Close">
                <FaTimes />
              </button>
            </div>
            <div className="modal-panel-body">
              <div className="regimental-field">
                <label htmlFor="member-search">Search Members</label>
                <input
                  id="member-search"
                  type="text"
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  placeholder="Search by name or mobile..."
                />
              </div>

              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                {selectedMemberIds.length} member(s) selected
              </div>

              <div className="regimental-member-list">
                {membersLoading ? (
                  <div className="regimental-empty">Loading members...</div>
                ) : filteredMembersForTagging.length === 0 ? (
                  <div className="regimental-empty">No members match your search.</div>
                ) : (
                  filteredMembersForTagging.map((member) => {
                    const selected = selectedMemberIds.includes(member.id);
                    return (
                      <div
                        key={member.id}
                        className={`regimental-member-row ${selected ? "selected" : ""}`}
                        onClick={() => toggleMemberSelection(member.id)}
                      >
                        <input type="checkbox" checked={selected} onChange={() => toggleMemberSelection(member.id)} onClick={(e) => e.stopPropagation()} />
                        <div>
                          <div className="regimental-member-name">{getMemberName(member)}</div>
                          <div className="regimental-member-phone">{getMemberPhone(member) || "-"}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="modal-footer-actions" style={{ marginTop: "18px" }}>
                <button type="button" className="regimental-cancel-btn" onClick={closeTagModal}>
                  Cancel
                </button>
                <button type="button" className="regimental-btn regimental-btn-primary" onClick={handleSaveTaggedMembers} disabled={tagSaving}>
                  {tagSaving ? "Saving..." : "Save Tags"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
