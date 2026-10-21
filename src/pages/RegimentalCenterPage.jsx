// src/pages/RegimentalCenterPage.jsx
import { Fragment, useEffect, useMemo, useState } from "react";
import { FaPlus, FaTimes, FaDatabase, FaTag } from "react-icons/fa";
import { collection, db, addDoc, doc, getDocs, updateDoc, writeBatch, serverTimestamp } from "../firestoreClient";
import { getMemberName, getMemberPhone, parseMemberSkills } from "../utils/memberFields";
import SkeletonLoader from "../components/SkeletonLoader";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import OdooSearchBar from "../components/OdooSearchBar";
import OdooViewToolbar, { ListIcon, KanbanIcon } from "../components/OdooViewToolbar";
import FavoritesMenu from "../components/FavoritesMenu";
import SelectionActionMenu from "../components/SelectionActionMenu";
import useTableSort, { sortRows, sortHeaderProps } from "../hooks/useTableSort";
import SortArrow from "../components/SortArrow";

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

const FAVORITES_KEY = "regimentalCentersFavorites";

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

export default function RegimentalCenterPage({ memberRecords = [], membersLoading: membersLoadingProp = false }) {
  const [activeCategoryKey, setActiveCategoryKey] = useState(CATEGORIES[0].key);
  const activeCategory = CATEGORIES.find((c) => c.key === activeCategoryKey);

  const [itemsByCategory, setItemsByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [pageSize, setPageSize] = useState(100);
  const [pageIndex, setPageIndex] = useState(0);
  // Column sorting; the default is the active category's name column ascending.
  const { sort, setSort } = useTableSort({ key: CATEGORIES[0].nameField, dir: "asc" });
  // Same asc → desc → default cycle as the shared hook, but the default
  // depends on the active category's name column.
  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: activeCategory.nameField, dir: "asc" };
    });
    setPageIndex(0);
  };
  // Filters menu: tagged / untagged; Group By; saved Favorites (per browser).
  const [tagFilter, setTagFilter] = useState(null); // null | "tagged" | "untagged"
  const [groupBy, setGroupBy] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" | "kanban"
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch { /* storage unavailable */ }
  }, [favorites]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(createEmptyForm(CATEGORIES[0]));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // Tag-members modal — reuses the ~12k-doc "users" list App.jsx already
  // loads once at the app shell level instead of re-fetching it here.
  const [tagModalItem, setTagModalItem] = useState(null);
  const allMembers = memberRecords;
  const membersLoading = membersLoadingProp;
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
    setSelectedRowIds([]);
    setPageIndex(0);
    setSort({ key: CATEGORIES.find((c) => c.key === activeCategoryKey).nameField, dir: "asc" });
  }, [activeCategoryKey, setSort]);

  const selectCategory = (key) => {
    if (key === activeCategoryKey) return;
    setActiveCategoryKey(key);
    setSearchTerm("");
    setGroupBy(null);
  };

  const resetFilters = () => {
    selectCategory(CATEGORIES[0].key);
    setSearchTerm("");
    setTagFilter(null);
    setGroupBy(null);
    setPageIndex(0);
  };

  const items = itemsByCategory[activeCategoryKey] || [];

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => String(a[activeCategory.nameField] || "").localeCompare(String(b[activeCategory.nameField] || ""))),
    [items, activeCategory]
  );

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matched = sortedItems.filter((row) => {
      const tagged = (row.taggedMemberIds || []).length > 0;
      if (tagFilter === "tagged" && !tagged) return false;
      if (tagFilter === "untagged" && tagged) return false;
      return !term || activeCategory.columns.some((col) => String(row[col.key] || "").toLowerCase().includes(term));
    });
    const accessors = { __tagged: (row) => (row.taggedMemberIds || []).length };
    activeCategory.columns.forEach((col) => { accessors[col.key] = (row) => row[col.key]; });
    return sortRows(matched, sort, accessors);
  }, [sortedItems, searchTerm, activeCategory, tagFilter, sort]);

  // Group By options depend on which columns the active category has.
  const locationKey = activeCategory.columns.find((c) => c.label === "Location")?.key;
  const groupByOptions = [
    ...(locationKey ? [{ key: locationKey, label: "Location" }] : []),
    ...(activeCategory.columns.some((c) => c.key === "state") ? [{ key: "state", label: "State" }] : []),
    { key: "__tagged", label: "Tagged Status" },
  ];
  const activeGroupBy = groupByOptions.some((o) => o.key === groupBy) ? groupBy : null;

  const quickFilters = [
    ...CATEGORIES.map((cat, i) => ({ key: cat.key, label: cat.label, active: cat.key === activeCategoryKey, isDefault: i === 0, onToggle: () => selectCategory(cat.key) })),
    { key: "tagged", label: "Has tagged members", active: tagFilter === "tagged", onToggle: () => { setTagFilter(tagFilter === "tagged" ? null : "tagged"); setPageIndex(0); }, startGroup: true },
    { key: "untagged", label: "No tagged members", active: tagFilter === "untagged", onToggle: () => { setTagFilter(tagFilter === "untagged" ? null : "untagged"); setPageIndex(0); } },
  ];

  const filterChips = [
    ...(activeCategoryKey !== CATEGORIES[0].key ? [{ key: "cat", label: activeCategory.label, onRemove: () => selectCategory(CATEGORIES[0].key) }] : []),
    ...(tagFilter ? [{ key: "tag", label: tagFilter === "tagged" ? "Has tagged members" : "No tagged members", onRemove: () => setTagFilter(null) }] : []),
    ...(activeGroupBy ? [{ key: "group", label: `Group: ${groupByOptions.find((o) => o.key === activeGroupBy).label}`, onRemove: () => setGroupBy(null) }] : []),
  ];

  const applyFavorite = (fav) => {
    if (CATEGORIES.some((c) => c.key === fav.category)) setActiveCategoryKey(fav.category);
    setSearchTerm(fav.search || "");
    setTagFilter(fav.tagFilter || null);
    setGroupBy(fav.groupBy || null);
    setPageIndex(0);
  };
  const saveCurrentAsFavorite = (name) =>
    setFavorites((prev) => [...prev, { id: `${Date.now()}`, name, category: activeCategoryKey, search: searchTerm, tagFilter, groupBy: activeGroupBy }]);
  const deleteFavorite = (id) => setFavorites((prev) => prev.filter((fav) => fav.id !== id));

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * pageSize;
  const pagedItems = useMemo(() => filteredItems.slice(pageStart, pageStart + pageSize), [filteredItems, pageStart, pageSize]);
  const groupedPagedItems = useMemo(() => {
    if (!activeGroupBy) return null;
    const groups = new Map();
    pagedItems.forEach((row) => {
      const label = activeGroupBy === "__tagged"
        ? ((row.taggedMemberIds || []).length ? "Tagged" : "Not tagged")
        : String(row[activeGroupBy] || "").trim() || "Not specified";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pagedItems, activeGroupBy]);

  // Action → Export: ticked rows of the current category as an .xlsx.
  const exportSelectedRows = async () => {
    const rows = filteredItems.filter((row) => selectedRowIds.includes(row.id));
    if (!rows.length) return;
    try {
      const data = rows.map((row) => {
        const record = {};
        activeCategory.columns.forEach((col) => { record[col.label] = row[col.key] || "-"; });
        record["Tagged Members"] = (row.taggedMemberIds || []).length;
        return record;
      });
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, activeCategory.label.slice(0, 31));
      XLSX.writeFile(wb, `${activeCategory.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`);
      showToast(`Exported ${rows.length} ${activeCategory.label} entries.`);
    } catch (err) {
      console.error("Export error:", err);
      showToast("Failed to export data.", "error");
    }
  };

  const toggleRowSelection = (id) =>
    setSelectedRowIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAllRows = () =>
    setSelectedRowIds((prev) =>
      pagedItems.length > 0 && pagedItems.every((r) => prev.includes(r.id)) ? [] : pagedItems.map((r) => r.id)
    );

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
  const openTagModal = (item) => {
    setTagModalItem(item);
    setSelectedMemberIds(item.taggedMemberIds || []);
    setMemberSearchTerm("");
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
          await updateDoc(doc(db, "users", memberId), {
            skills: nextSkills,
            Skills: nextSkills.join(", "),
            taggedAt: serverTimestamp(),
          });
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
    <div className="regimental-page page-fill">
      <style>{`
        .regimental-page {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100%;
          box-sizing: border-box;
          background: #f4f6f9;
          color: #212529;
          font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }
        /* Header band + table mirror the Members Master List (MemberListPage). */
        .regimental-header {
          background: #fff;
          padding: 32px 32px 16px;
          box-sizing: border-box;
          width: 100%;
        }
        .regimental-title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .regimental-title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .regimental-title h1 { margin: 0; font-size: 28px; font-weight: 600; color: #111827; letter-spacing: -0.01em; }
        .regimental-title span { font-size: 14px; color: #64748b; font-weight: 400; }
        .regimental-outline-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 11px;
          background: #fff;
          border: 1px solid #dde1e7;
          border-radius: 6px;
          font: inherit;
          font-size: 13px;
          font-weight: 400;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
        }
        .regimental-controls-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .member-toolbar-group { border: 1px solid #dde1e7; border-left: none; border-radius: 6px; background: #fff; display: flex; align-items: stretch; margin-left: auto; }
        .member-toolbar-group > div:first-child { gap: 0 !important; }
        .member-toolbar-group button { border: none !important; border-left: 1px solid #dde1e7 !important; border-radius: 0 !important; height: 32px !important; }
        .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
        .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
        .regimental-table tbody tr.regimental-group-row { background: #f1f5f9; cursor: default; }
        .regimental-table tr.regimental-group-row td { height: 40px; padding: 0 12px; font-weight: 600; color: #334155; }
        .regimental-view-toggle { display: flex; background: #dde1e7; border: 1px solid #dde1e7; border-radius: 6px; overflow: hidden; margin-left: 2px; }
        .regimental-view-toggle button { display: flex; align-items: center; justify-content: center; width: 36px; height: 30px; padding: 0; border: none; background: #fff; color: #64748b; cursor: pointer; }
        .regimental-view-toggle button + button { border-left: 1px solid #dde1e7; }
        .regimental-view-toggle button[aria-pressed="true"] { background: #e3f2fd; color: #1976d2; }
        .regimental-kanban { padding: 16px 32px 24px; background: #f8fafc; min-height: 100%; box-sizing: border-box; }
        .regimental-kanban-section + .regimental-kanban-section { margin-top: 20px; }
        .regimental-kanban-heading { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: #334155; }
        .regimental-kanban-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
        .regimental-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; background: #fff; border: 1px solid #dde1e7; border-radius: 8px; cursor: pointer; text-align: left; }
        .regimental-card:hover { border-color: #90caf9; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08); }
        .regimental-card:focus-visible { outline: 2px solid #1976d2; outline-offset: 2px; }
        .regimental-card.is-selected { border-color: #1976d2; background: #f5faff; }
        .regimental-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .regimental-card-name { font-size: 14px; font-weight: 600; color: #111827; line-height: 1.3; }
        .regimental-card-line { font-size: 13px; color: #64748b; }
        .regimental-card-line span { color: #94a3b8; margin-right: 6px; }
        .regimental-card-foot { margin-top: 4px; }
        .regimental-group-count { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; background: #e3f2fd; color: #1565c0; font-size: 12px; font-weight: 600; }
        .regimental-meta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 36px;
        }
        .regimental-meta-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .regimental-meta-right { display: flex; align-items: center; gap: 6px; }
        .regimental-select { height: 30px; padding: 0 6px; border: 1px solid #dde1e7; border-radius: 6px; font: inherit; font-size: 12px; color: #334155; background: #fff; cursor: pointer; }
        .regimental-pager-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 1px solid #dde1e7; border-radius: 6px; background: #fff; color: #475569; cursor: pointer; }
        .regimental-pager-btn:disabled { background: #f8fafc; color: #cbd5e1; cursor: not-allowed; }
        .regimental-range { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; margin: 0 2px; }
        .regimental-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 11px;
          border-radius: 6px;
          border: 1px solid #dde1e7;
          background: #fff;
          font: inherit;
          font-size: 13px;
          font-weight: 400;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
        }
        .regimental-btn-primary { background: #1976d2; border-color: #1976d2; color: #fff; }
        .regimental-btn-primary:hover { background: #1565c0; }
        .regimental-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .regimental-content {
          min-width: 0;
          flex: 1;
          background: #fff;
        }
        .regimental-table-card {
          background: #fff;
          border-top: 1px solid #dde1e7;
          overflow-x: auto;
        }
        .regimental-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
        }
        .regimental-table th {
          background: #1976d2;
          color: #fff;
          text-align: left;
          height: 45px;
          padding: 0 10px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .regimental-table td {
          height: 49px;
          padding: 0 10px;
          border-bottom: 1px solid #dde1e7;
          font-size: 13px;
          color: #64748b;
          white-space: nowrap;
          vertical-align: middle;
        }
        .regimental-table td:nth-child(2) { font-weight: 500; color: #111827; }
        .regimental-table .regimental-num { text-align: right; }
        .regimental-table .regimental-cb-col { width: 36px; padding: 0; text-align: center; }
        .regimental-table tbody tr { cursor: pointer; background: #fff; }
        .regimental-table tbody tr:nth-child(odd) { background: #f8fafc; }
        .regimental-table tbody tr.is-selected { background: #e3f2fd; }
        .regimental-cb { width: 13px; height: 13px; margin: 0; accent-color: #1976d2; cursor: pointer; vertical-align: middle; }
        .regimental-table th .regimental-cb { width: 14px; height: 14px; accent-color: #ffffff; }
        .regimental-tag-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 23px;
          padding: 0 8px;
          border-radius: 4px;
          background: #f1f4f8;
          color: #64748b;
          font-weight: 600;
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

      <div className="regimental-header page-header-band">
        <div className="regimental-title-row">
          <div className="regimental-title">
            <h1>Regimental & Training Centres</h1>
            <span>{filteredItems.length.toLocaleString()} {activeCategory.label}</span>
          </div>
          <button type="button" className="regimental-outline-btn" onClick={resetFilters}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
            Reset Filters
          </button>
        </div>

        <div className="regimental-controls-row">
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPageIndex(0); }}
            placeholder={`Search ${activeCategory.label.toLowerCase()}...`}
            chips={filterChips}
          />
          <div className="member-toolbar-group">
            <OdooViewToolbar
              variant="boxed"
              quickFilters={quickFilters}
              groupByOptions={groupByOptions}
              groupBy={activeGroupBy}
              onGroupByChange={(key) => { setGroupBy(key); setPageIndex(0); }}
              showViewToggle={false}
            />
            <FavoritesMenu favorites={favorites} onApply={applyFavorite} onDelete={deleteFavorite} onSave={saveCurrentAsFavorite} />
          </div>
        </div>

        <div className="regimental-meta-row">
          <SelectionActionMenu count={selectedRowIds.length} onExport={exportSelectedRows} onClear={() => setSelectedRowIds([])} />
          <div className="regimental-meta-actions">
            <button type="button" className="regimental-btn regimental-btn-primary" onClick={openAddModal}>
              <FaPlus size={12} />
              Add {activeCategory.label} Entry
            </button>
            {!loading && items.length === 0 && (
              <button type="button" className="regimental-btn regimental-btn-secondary" onClick={handleSeedDefaults} disabled={seeding}>
                <FaDatabase size={12} />
                {seeding ? "Importing..." : `Import Default List (${activeCategory.seed.length})`}
              </button>
            )}
          </div>
          <div className="regimental-meta-right">
            <select
              className="regimental-select"
              aria-label="Records per page"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPageIndex(0); }}
            >
              {[50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="regimental-range">
              {filteredItems.length === 0 ? "0 / 0" : `${pageStart + 1}–${pageStart + pagedItems.length} / ${filteredItems.length}`}
            </span>
            <button type="button" className="regimental-pager-btn" aria-label="Previous page" disabled={safePageIndex === 0} onClick={() => setPageIndex(safePageIndex - 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" className="regimental-pager-btn" aria-label="Next page" disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex(safePageIndex + 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <div className="regimental-view-toggle" role="group" aria-label="View">
              <button type="button" aria-label="List view" title="List view" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
                <ListIcon />
              </button>
              <button type="button" aria-label="Kanban view" title="Kanban view" aria-pressed={viewMode === "kanban"} onClick={() => setViewMode("kanban")}>
                <KanbanIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="regimental-content page-fill-mid">
          <div className="regimental-table-card page-fill-scroll">
            {loading ? (
              <TableLoadingSpinner label={`Loading ${activeCategory.label.toLowerCase()}…`} />
            ) : items.length === 0 ? (
              <div className="regimental-empty">No {activeCategory.label.toLowerCase()} added yet.</div>
            ) : filteredItems.length === 0 ? (
              <div className="regimental-empty">No entries match your search.</div>
            ) : viewMode === "kanban" ? (
              <div className="regimental-kanban">
                {(groupedPagedItems || [[null, pagedItems]]).map(([label, rows]) => (
                  <section key={label ?? "all"} className="regimental-kanban-section">
                    {label !== null && (
                      <h3 className="regimental-kanban-heading">
                        {label} <span className="regimental-group-count">{rows.length}</span>
                      </h3>
                    )}
                    <div className="regimental-kanban-grid">
                      {rows.map((row) => {
                        const selected = selectedRowIds.includes(row.id);
                        const [nameCol, ...detailCols] = activeCategory.columns;
                        return (
                          <div
                            key={row.id}
                            className={`regimental-card${selected ? " is-selected" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openTagModal(row)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTagModal(row); } }}
                            title="Click to tag members"
                          >
                            <div className="regimental-card-top">
                              <span className="regimental-card-name">{row[nameCol.key] || "-"}</span>
                              <input
                                type="checkbox"
                                className="regimental-cb"
                                aria-label={`Select ${row[activeCategory.nameField] || "entry"}`}
                                checked={selected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleRowSelection(row.id)}
                              />
                            </div>
                            {detailCols.map((col) => (
                              <div key={col.key} className="regimental-card-line">
                                <span>{col.label}</span>{row[col.key] || "-"}
                              </div>
                            ))}
                            <div className="regimental-card-foot">
                              <span className="regimental-tag-badge"><FaTag size={10} /> {(row.taggedMemberIds || []).length} tagged</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <table className="regimental-table">
                <thead>
                  <tr>
                    <th className="regimental-cb-col">
                      <input
                        type="checkbox"
                        className="regimental-cb"
                        aria-label="Select all entries"
                        checked={pagedItems.length > 0 && pagedItems.every((r) => selectedRowIds.includes(r.id))}
                        onChange={toggleSelectAllRows}
                      />
                    </th>
                    {activeCategory.columns.map((col) => (
                      <th key={col.key} {...sortHeaderProps(col.key, sort, toggleSort)}>
                        {col.label}
                        <SortArrow active={sort.key === col.key} dir={sort.dir} />
                      </th>
                    ))}
                    <th className="regimental-num" {...sortHeaderProps("__tagged", sort, toggleSort)}>
                      Tagged Members
                      <SortArrow active={sort.key === "__tagged"} dir={sort.dir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(groupedPagedItems || [[null, pagedItems]]).map(([label, rows]) => (
                    <Fragment key={label ?? "all"}>
                  {label !== null && (
                    <tr className="regimental-group-row">
                      <td colSpan={activeCategory.columns.length + 2}>
                        {label} <span className="regimental-group-count">{rows.length}</span>
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id} className={selectedRowIds.includes(row.id) ? "is-selected" : undefined} onClick={() => openTagModal(row)} title="Click to tag members">
                      <td className="regimental-cb-col" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="regimental-cb"
                          aria-label={`Select ${row[activeCategory.nameField] || "entry"}`}
                          checked={selectedRowIds.includes(row.id)}
                          onChange={() => toggleRowSelection(row.id)}
                        />
                      </td>
                      {activeCategory.columns.map((col) => (
                        <td key={col.key}>{row[col.key] || "-"}</td>
                      ))}
                      <td className="regimental-num">
                        <span className="regimental-tag-badge">
                          <FaTag size={10} />
                          {(row.taggedMemberIds || []).length}
                        </span>
                      </td>
                    </tr>
                  ))}
                    </Fragment>
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
                  <SkeletonLoader rows={3} compact label="Loading members…" />
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
