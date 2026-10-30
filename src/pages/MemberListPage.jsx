// src/pages/MemberListPage.jsx
import React, { useState, useMemo, useEffect, useRef, useTransition, useCallback } from "react";
import * as ReactWindow from "react-window";
const List = ReactWindow.FixedSizeList;
const VariableList = ReactWindow.VariableSizeList;
import { collection, db, doc, getDocs, serverTimestamp, updateDoc } from "../firestoreClient";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import OdooViewToolbar, { ListIcon, KanbanIcon, ChevronDownIcon } from "../components/OdooViewToolbar";
import SelectionActionMenu from "../components/SelectionActionMenu";
import OdooSearchBar from "../components/OdooSearchBar";
import {
  getMemberName,
  getMemberPhone,
  getMemberCategory,
  getMemberEmail,
  getMemberService,
  getMemberRank,
  getMemberState,
  getMemberCity,
  getMemberEducation,
  getMemberExperience,
  parseMemberSkills,
} from "../utils/memberFields";
import useMemberFilters, { MEMBER_GROUP_BY_OPTIONS, getGroupLabels, SUPPORTING_DATA_TTL_MS } from "../hooks/useMemberFilters";
import FavoritesMenu from "../components/FavoritesMenu";
import useTableSort, { sortRows, sortHeaderProps } from "../hooks/useTableSort";
import SortArrow from "../components/SortArrow";


// ─── Module-level cache for this page's supporting fetches ───────────────────
// projectusersmaster, the full "interactions" collectionGroup, and "tags" are
// each a full collection scan. React Router unmounts this page on navigation,
// so without a cache every trip back to /memberlist re-ran all three from
// scratch — the collectionGroup scan alone touches every user's interactions
// subcollection. A short in-memory TTL cache lets same-session revisits reuse
// the last result instead of re-paying that cost.

let tagsCache = null; // { timestamp, tags }

// ─── Virtual list constants ───────────────────────────────────────────────────
// checkbox | Name | Mobile | Category | Service | Rank | State | City
// Tags / Regional Partner actions live in the member detail modal.
const GRID_TEMPLATE = "36px minmax(130px, 1.6fr) minmax(124px, 1fr) minmax(88px, 1fr) minmax(70px, 0.8fr) minmax(62px, 0.7fr) minmax(120px, 1.2fr) minmax(100px, 1.2fr)";
// Sum of the fixed columns + Name's minimum; below this the table scrolls
// horizontally instead of clipping the Tags / Regional Partner columns.
const LIST_MIN_WIDTH = 730;
const ROW_HEIGHT = 49;
const COL_HEADERS = ["Name", "Mobile", "Category", "Service", "Rank", "State", "City"];

// Sort key + value accessor per column heading. Default order (from
// useMemberFilters) is name ascending, so "name"/"asc" is the initial sort.
const COL_SORT_KEYS = {
  Name: "name",
  Mobile: "mobile",
  Category: "category",
  Service: "service",
  Rank: "rank",
  State: "state",
  City: "city",
  Tags: "tags",
  "Regional Partner": "partner",
};
const DEFAULT_MEMBER_SORT = { key: "name", dir: "asc" };
const MEMBER_SORT_ACCESSORS = {
  name: (m) => m.__name,
  mobile: (m) => m.phone_number,
  category: (m) => m.category,
  service: (m) => m.service,
  rank: (m) => m.rank,
  state: (m) => m.state,
  city: (m) => m.city,
  tags: (m) => (m.__skills || []).length,
  // Ascending: active partners, then inactive partners, then non-partners.
  partner: (m) => (m.is_regional_partner ? (m.regional_partner_status === "Inactive" ? 1 : 0) : 2),
};

// The vetting checklist reviewed before designating a member a Regional
// Partner — stored per-item on the user doc alongside the final decision, so
// which criteria were actually met is auditable later, not just the outcome.
const REGIONAL_PARTNER_CRITERIA = [
  { key: "communication", label: "Strong communication and hardworking." },
  { key: "honesty", label: "Honest, dedicated, and networking skills." },
  { key: "management", label: "Manage candidates and local teams." },
  { key: "leadership", label: "Leadership and coordination skills." },
  { key: "interest", label: "Interested in recruitment and field work." },
];

const emptyPartnerCriteria = () =>
  Object.fromEntries(REGIONAL_PARTNER_CRITERIA.map(({ key }) => [key, false]));


const GROUP_HEADER_HEIGHT = 40;
const KANBAN_CARD_ROW_HEIGHT = 212;
const KANBAN_CARD_MIN_WIDTH = 240;

const cellStyle = {
  padding: "0 10px",
  fontSize: "13px",
  color: "#64748b",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "flex",
  alignItems: "center",
};

const GroupHeaderRow = React.memo(({ style, group, collapsed, onToggle }) => (
  <div
    style={{
      ...style,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "0 14px",
      background: "#eef2f7",
      borderBottom: "1px solid #dbe3ee",
      borderTop: "1px solid #dbe3ee",
      cursor: "pointer",
      boxSizing: "border-box",
    }}
    onClick={() => onToggle(group.key)}
  >
    <span
      style={{
        display: "inline-block",
        transition: "transform 0.15s",
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
        fontSize: "11px",
        color: "#475569",
      }}
    >
      ▾
    </span>
    <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{group.label}</span>
    <span style={{ fontWeight: 600, fontSize: "12px", color: "#64748b" }}>({group.count})</span>
  </div>
));

const VirtualRow = React.memo(({ index, style, data }) => {
  const { items, onMemberClick, collapsedGroups, onToggleGroup, selectedIds, onToggleSelect } = data;
  const member = items[index];

  if (member.__type === "group") {
    return <GroupHeaderRow style={style} group={member} collapsed={collapsedGroups?.has(member.key)} onToggle={onToggleGroup} />;
  }

  return (
    <div
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: GRID_TEMPLATE,
        borderBottom: "1px solid #dde1e7",
        cursor: "pointer",
        backgroundColor: selectedIds?.has(member.id) ? "#f1f6d6" : index % 2 === 0 ? "#f8fafc" : "#fff",
        alignItems: "center",
        boxSizing: "border-box",
      }}
      onClick={() => onMemberClick(member)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select ${member.__name || "member"}`}
          checked={!!selectedIds?.has(member.id)}
          onChange={() => onToggleSelect(member.id)}
          style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#c2d45e" }}
        />
      </div>
      <div style={{ ...cellStyle, fontWeight: 500, color: "#111827" }}>
        {member.__name || "—"}
      </div>
      <div style={{ ...cellStyle, justifyContent: "flex-end" }}>{member.phone_number || "—"}</div>
      <div style={cellStyle}>{member.category || "—"}</div>
      <div style={cellStyle}>{member.service || "—"}</div>
      <div style={cellStyle}>{member.rank || "—"}</div>
      <div style={cellStyle}>{member.state || "—"}</div>
      <div style={cellStyle}>{member.city || "—"}</div>
    </div>
  );
});

const kanbanChipStyle = { padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#475569", fontSize: "10.5px", fontWeight: 600 };
const kanbanSmallBtnStyle = { padding: "3px 8px", borderRadius: "999px", border: "1px solid #c2d45e", background: "#f1f6d6", color: "#4a5a12", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" };

const partnerKanbanStyle = (member) =>
  member.is_regional_partner
    ? member.regional_partner_status === "Inactive"
      ? { padding: "3px 8px", borderRadius: "999px", border: "1px solid #a16207", background: "#fef9c3", color: "#a16207", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" }
      : { padding: "3px 8px", borderRadius: "999px", border: "1px solid #15803d", background: "#dcfce7", color: "#15803d", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" }
    : { padding: "3px 8px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" };

const MemberCard = React.memo(({ member, onMemberClick, openTagModal, openPartnerModal }) => {
  const memberSkills = member.__skills || [];
  return (
    <div
      onClick={() => onMemberClick(member)}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {member.__name || "—"}
      </div>
      <div style={{ fontSize: "12px", color: "#64748b" }}>{member.phone_number || "—"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {member.category && <span style={kanbanChipStyle}>{member.category}</span>}
        {member.service && <span style={kanbanChipStyle}>{member.service}</span>}
        {member.rank && <span style={kanbanChipStyle}>{member.rank}</span>}
      </div>
      <div style={{ fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {[member.city, member.state].filter(Boolean).join(", ") || "—"}
      </div>
      {memberSkills.length > 0 && (
        <div style={{ fontSize: "11px", color: "#5f6f14", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          🏷 {memberSkills.join(", ")}
        </div>
      )}
      <div style={{ display: "flex", gap: "6px", marginTop: "auto", paddingTop: "4px" }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); openTagModal(member); }} style={kanbanSmallBtnStyle}>
          + Tag
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); openPartnerModal(member); }} style={partnerKanbanStyle(member)}>
          {member.is_regional_partner ? "★ Partner" : "Mark Partner"}
        </button>
      </div>
    </div>
  );
});

const KanbanRow = React.memo(({ index, style, data }) => {
  const { rows, onMemberClick, openTagModal, openPartnerModal, collapsedGroups, onToggleGroup } = data;
  const row = rows[index];

  if (row.__type === "group") {
    return <GroupHeaderRow style={style} group={row} collapsed={collapsedGroups?.has(row.key)} onToggle={onToggleGroup} />;
  }

  return (
    <div style={{ ...style, display: "flex", gap: "12px", padding: "8px 14px", boxSizing: "border-box" }}>
      {row.items.map((member) => (
        <MemberCard key={member.id} member={member} onMemberClick={onMemberClick} openTagModal={openTagModal} openPartnerModal={openPartnerModal} />
      ))}
    </div>
  );
});


// Matches OdooViewToolbar's own view-toggle button look (not exported from
// there — exporting a non-component breaks that file's Fast Refresh).
const viewButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "34px",
  background: active ? "#f1f6d6" : "#fff",
  border: "none",
  color: active ? "#c2d45e" : "#64748b",
  cursor: "pointer",
});

// Reset Filters / Export.
const headerButtonStyle = {
  height: "34px",
  padding: "0 11px",
  background: "#fff",
  border: "1px solid #dde1e7",
  color: "#334155",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 400,
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  gap: "7px",
};

const pagerButtonStyle = (disabled) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  padding: 0,
  borderRadius: "6px",
  border: "1px solid #dde1e7",
  background: disabled ? "#f8fafc" : "#fff",
  color: disabled ? "#cbd5e1" : "#475569",
  cursor: disabled ? "not-allowed" : "pointer",
});


export default function MemberListPage({ onMemberClick, memberRecords = [], membersLoading = false }) {
  const pageShellStyle = {
    padding: 0,
    maxWidth: "100%",
    width: "100%",
    margin: "0 auto",
    minHeight: "calc(100vh - 64px)",
    boxSizing: "border-box",
  };

  const [members, setMembers] = useState(memberRecords);
  const [isMembersLoaded, setIsMembersLoaded] = useState(!membersLoading);
  const [listHeight, setListHeight] = useState(() => Math.max(460, Math.floor(window.innerHeight * 0.65)));
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(500);
  const [viewMode, setViewMode] = useState("list");
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [kanbanCardsPerRow, setKanbanCardsPerRow] = useState(4);
  const kanbanContainerRef = useRef(null);
  const tagsPopoverRef = useRef(null);
  const [, startTransition] = useTransition();
  const [tagModalMember, setTagModalMember] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  // Row checkboxes. Export downloads the ticked members when any are ticked.
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => new Set());
  const toggleSelectMember = useCallback((id) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagModalSaving, setTagModalSaving] = useState(false);
  const [tagModalError, setTagModalError] = useState("");
  const [tagSuccessPopup, setTagSuccessPopup] = useState({ show: false, message: "", type: "success" });
  const [removeTagTarget, setRemoveTagTarget] = useState(null);
  const [tagsPopover, setTagsPopover] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [partnerModalMember, setPartnerModalMember] = useState(null);
  const [partnerCriteria, setPartnerCriteria] = useState(emptyPartnerCriteria);
  const [partnerStatusChoice, setPartnerStatusChoice] = useState("Active");
  const [partnerModalSaving, setPartnerModalSaving] = useState(false);

  const {
    searchTerm,
    setSearchTerm,
    groupBy,
    setGroupBy,
    filterOptions,
    filteredMembers,
    quickFilters,
    filterChips,
    advancedFiltersPanel,
    favorites,
    applyFavorite,
    deleteFavorite,
    saveCurrentAsFavorite,
    clearFilters,
  } = useMemberFilters(members);


  // The virtual list needs a pixel height: track the box it sits in, which
  // flexes to fill the window below the header band (page-fill layout).
  const listBoxRef = useRef(null);
  useEffect(() => {
    const box = listBoxRef.current;
    if (!box) return undefined;
    const observer = new ResizeObserver(() => setListHeight(Math.max(120, Math.floor(box.clientHeight))));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Recompute how many Kanban cards fit per row from the actual container
  // width, so the grid stays responsive without a CSS grid (react-window
  // needs a fixed item count per virtualized row).
  useEffect(() => {
    if (viewMode !== "kanban") return;
    const calc = () => {
      const width = kanbanContainerRef.current?.clientWidth || window.innerWidth - 260;
      setKanbanCardsPerRow(Math.max(1, Math.floor(width / KANBAN_CARD_MIN_WIDTH)));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [viewMode]);

  const toggleGroupCollapsed = useCallback((key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!membersLoading && Array.isArray(memberRecords)) {
      setMembers(memberRecords);
      setIsMembersLoaded(true);
      setLoadProgress(100);
    } else {
      setIsMembersLoaded(!membersLoading);
    }
  }, [memberRecords, membersLoading]);



  const normalizeTagLabel = (tagDoc) => {
    if (!tagDoc) return "";
    if (typeof tagDoc === "string") return tagDoc.trim();
    if (typeof tagDoc !== "object") return "";
    return String(
      tagDoc.name ||
        tagDoc.tag ||
        tagDoc.label ||
        tagDoc.title ||
        tagDoc.skill ||
        tagDoc.value ||
        tagDoc.id ||
        ""
    ).trim();
  };

  useEffect(() => {
    const loadTags = async () => {
      if (tagsCache && Date.now() - tagsCache.timestamp < SUPPORTING_DATA_TTL_MS) {
        setAvailableTags(tagsCache.tags);
        return;
      }

      const snapshot = await getDocs(collection(db, "tags"));
      const tags = snapshot.docs
        .map((tagDoc) => normalizeTagLabel({ id: tagDoc.id, ...tagDoc.data() }))
        .filter(Boolean);
      const uniqueTags = Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b));
      tagsCache = { timestamp: Date.now(), tags: uniqueTags };
      setAvailableTags(uniqueTags);
    };

    void loadTags();
  }, []);



  // Column sorting is applied before pagination and grouping. The default
  // (name ascending) is already how filteredMembers comes back, so skip the
  // re-sort in that case to keep today's order exactly.
  const { sort, toggleSort } = useTableSort(DEFAULT_MEMBER_SORT);
  const sortedMembers = useMemo(
    () =>
      sort.key === DEFAULT_MEMBER_SORT.key && sort.dir === DEFAULT_MEMBER_SORT.dir
        ? filteredMembers
        : sortRows(filteredMembers, sort, MEMBER_SORT_ACCESSORS),
    [filteredMembers, sort]
  );

  const totalItems = sortedMembers.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = rowsPerPage === Infinity ? 0 : (safeCurrentPage - 1) * rowsPerPage;
  const pageMembers = rowsPerPage === Infinity ? sortedMembers : sortedMembers.slice(pageStart, pageStart + rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [sortedMembers]);

  // Grouping shows every matching member via the virtualized list rather
  // than the page-by-page slice above — a "page 2 of N" doesn't make sense
  // once rows are reorganized into named groups.
  const groupedMembers = useMemo(() => {
    if (!groupBy) return null;
    const experienceBuckets = filterOptions.Experience || [];
    const groups = new Map();
    for (const member of sortedMembers) {
      const labels = getGroupLabels(member, groupBy, experienceBuckets);
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(member);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, sortedMembers, filterOptions]);

  const groupedFlatItems = useMemo(() => {
    if (!groupedMembers) return null;
    const flat = [];
    for (const [label, groupMembers] of groupedMembers) {
      flat.push({ __type: "group", key: label, label, count: groupMembers.length });
      if (!collapsedGroups.has(label)) flat.push(...groupMembers);
    }
    return flat;
  }, [groupedMembers, collapsedGroups]);

  const listSourceItems = groupBy ? groupedFlatItems : pageMembers;

  // Header checkbox: ticks / unticks every member row currently listed.
  const visibleMemberRows = useMemo(() => listSourceItems.filter((item) => item.__type !== "group"), [listSourceItems]);
  const allVisibleSelected = visibleMemberRows.length > 0 && visibleMemberRows.every((member) => selectedMemberIds.has(member.id));
  const someVisibleSelected = !allVisibleSelected && visibleMemberRows.some((member) => selectedMemberIds.has(member.id));
  const toggleSelectAllVisible = () => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleMemberRows.forEach((member) => next.delete(member.id));
      else visibleMemberRows.forEach((member) => next.add(member.id));
      return next;
    });
  };
  const selectedVisibleCount = useMemo(
    () => filteredMembers.reduce((count, member) => (selectedMemberIds.has(member.id) ? count + 1 : count), 0),
    [filteredMembers, selectedMemberIds]
  );

  const kanbanSourceItems = groupBy ? groupedFlatItems : sortedMembers;

  const kanbanRows = useMemo(() => {
    const rows = [];
    let buffer = [];
    for (const item of kanbanSourceItems) {
      if (item.__type === "group") {
        if (buffer.length) { rows.push({ __type: "cards", items: buffer }); buffer = []; }
        rows.push(item);
        continue;
      }
      buffer.push(item);
      if (buffer.length === kanbanCardsPerRow) { rows.push({ __type: "cards", items: buffer }); buffer = []; }
    }
    if (buffer.length) rows.push({ __type: "cards", items: buffer });
    return rows;
  }, [kanbanSourceItems, kanbanCardsPerRow]);

  const kanbanRowHeight = useCallback((index) => (kanbanRows[index]?.__type === "group" ? GROUP_HEADER_HEIGHT : KANBAN_CARD_ROW_HEIGHT), [kanbanRows]);

  const openTagModal = useCallback((member) => {
    setTagModalMember(member);
    setSelectedTags(parseMemberSkills(member));
    setTagSearchTerm("");
    setTagPickerOpen(false);
    setTagModalError("");
  }, []);

  const closeTagModal = () => {
    setTagModalMember(null);
    setSelectedTags([]);
    setTagSearchTerm("");
    setTagPickerOpen(false);
    setTagModalError("");
    setTagModalSaving(false);
  };

  const updateMemberSkillsLocally = (memberId, nextSkills) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, skills: nextSkills, skillsUpdatedAt: new Date() }
          : member
      )
    );
  };

  const persistMemberSkills = async (memberId, nextSkills) => {
    await updateDoc(doc(db, "users", memberId), {
      skills: nextSkills,
      skillsUpdatedAt: serverTimestamp(),
    });
  };


  const handleSaveTags = async () => {
    if (!tagModalMember?.id) return;

    const mergedSkills = Array.from(
      new Map(selectedTags.map((skill) => [String(skill).trim().toLowerCase(), String(skill).trim()])).values()
    ).filter(Boolean);

    if (mergedSkills.length === 0) {
      setTagModalError("Please select at least one tag.");
      return;
    }

    const memberId = tagModalMember.id;
    const memberName = getMemberName(tagModalMember);
    const previousMembers = members;

    setTagModalError("");
    updateMemberSkillsLocally(memberId, mergedSkills);
    closeTagModal();

    setTagSuccessPopup({
      show: true,
      message: `${memberName} tagged successfully.`,
      type: "success",
    });
    setTimeout(() => {
      setTagSuccessPopup({ show: false, message: "", type: "success" });
    }, 2200);

    void persistMemberSkills(memberId, mergedSkills).catch((error) => {
      console.error("Error saving tags:", error);
      setMembers(previousMembers);
      setTagSuccessPopup({
        show: true,
        message: "Could not save tags. Please try again.",
        type: "error",
      });
      setTimeout(() => {
        setTagSuccessPopup({ show: false, message: "", type: "success" });
      }, 3000);
    });
  };

  const openRemoveTagConfirm = useCallback((member, tag) => {
    setRemoveTagTarget({ member, tag });
  }, []);

  const openTagsPopover = useCallback((member, anchorRect) => {
    setTagsPopover({ member, anchorRect });
  }, []);

  const openPartnerModal = useCallback((member) => {
    setPartnerModalMember(member);
    setPartnerCriteria({ ...emptyPartnerCriteria(), ...(member.regional_partner_criteria || {}) });
    setPartnerStatusChoice(member.regional_partner_status === "Inactive" ? "Inactive" : "Active");
  }, []);

  const closePartnerModal = () => {
    setPartnerModalMember(null);
    setPartnerCriteria(emptyPartnerCriteria());
    setPartnerStatusChoice("Active");
    setPartnerModalSaving(false);
  };

  const handleSavePartnerStatus = async (nextIsPartner) => {
    if (!partnerModalMember?.id) return;
    const memberId = partnerModalMember.id;
    const memberName = getMemberName(partnerModalMember);
    const previousMembers = members;
    const criteriaSnapshot = { ...partnerCriteria };
    const statusSnapshot = partnerStatusChoice;

    setPartnerModalSaving(true);
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? {
              ...member,
              is_regional_partner: nextIsPartner,
              regional_partner_criteria: criteriaSnapshot,
              regional_partner_status: statusSnapshot,
            }
          : member
      )
    );
    closePartnerModal();

    setTagSuccessPopup({
      show: true,
      message: nextIsPartner
        ? `${memberName} marked as a ${statusSnapshot} Regional Partner.`
        : `${memberName} unmarked as a Regional Partner.`,
      type: "success",
    });
    setTimeout(() => setTagSuccessPopup({ show: false, message: "", type: "success" }), 2200);

    try {
      await updateDoc(doc(db, "users", memberId), {
        is_regional_partner: nextIsPartner,
        regional_partner_criteria: criteriaSnapshot,
        regional_partner_status: statusSnapshot,
        regional_partner_marked_at: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error saving Regional Partner status:", error);
      setMembers(previousMembers);
      setTagSuccessPopup({
        show: true,
        message: "Could not save Regional Partner status. Please try again.",
        type: "error",
      });
      setTimeout(() => setTagSuccessPopup({ show: false, message: "", type: "success" }), 3000);
    }
  };

  // Hand the detail modal (rendered in App) the Tag / Regional Partner actions,
  // which need this page's state and modals.
  const openMemberDetail = useCallback(
    (member) => onMemberClick(member, { openTagModal, openPartnerModal }),
    [onMemberClick, openTagModal, openPartnerModal]
  );

  const virtualRowItemData = useMemo(
    () => ({
      items: listSourceItems,
      onMemberClick: openMemberDetail,
      collapsedGroups,
      onToggleGroup: toggleGroupCollapsed,
      selectedIds: selectedMemberIds,
      onToggleSelect: toggleSelectMember,
    }),
    [listSourceItems, openMemberDetail, collapsedGroups, toggleGroupCollapsed, selectedMemberIds, toggleSelectMember]
  );

  const kanbanRowItemData = useMemo(
    () => ({ rows: kanbanRows, onMemberClick: openMemberDetail, openTagModal, openPartnerModal, collapsedGroups, onToggleGroup: toggleGroupCollapsed }),
    [kanbanRows, openMemberDetail, openTagModal, openPartnerModal, collapsedGroups, toggleGroupCollapsed]
  );

  const closeRemoveTagConfirm = () => {
    setRemoveTagTarget(null);
  };

  const confirmRemoveTag = () => {
    if (!removeTagTarget?.member?.id || !removeTagTarget?.tag) return;

    const memberId = removeTagTarget.member.id;
    const memberName = getMemberName(removeTagTarget.member);
    const tagToRemove = removeTagTarget.tag;
    const previousMembers = members;
    const nextSkills = parseMemberSkills(removeTagTarget.member).filter(
      (skill) => String(skill).trim().toLowerCase() !== String(tagToRemove).trim().toLowerCase()
    );

    updateMemberSkillsLocally(memberId, nextSkills);
    closeRemoveTagConfirm();

    setTagSuccessPopup({
      show: true,
      message: `${tagToRemove} removed from ${memberName}.`,
      type: "success",
    });
    setTimeout(() => {
      setTagSuccessPopup({ show: false, message: "", type: "success" });
    }, 2200);

    void persistMemberSkills(memberId, nextSkills).catch((error) => {
      console.error("Error removing tag:", error);
      setMembers(previousMembers);
      setTagSuccessPopup({
        show: true,
        message: "Could not remove tag. Please try again.",
        type: "error",
      });
      setTimeout(() => {
        setTagSuccessPopup({ show: false, message: "", type: "success" });
      }, 3000);
    });
  };


  // Close tags popover on click-outside or Escape
  useEffect(() => {
    if (!tagsPopover) return;
    const handleClickOutside = (event) => {
      if (tagsPopoverRef.current && !tagsPopoverRef.current.contains(event.target)) {
        setTagsPopover(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setTagsPopover(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tagsPopover]);

  // Export to Excel (XLSX)
  const handleExportXLSX = async () => {
    // Ticked rows (that are still in the filtered list) if any, otherwise everything filtered.
    const selectedForExport = filteredMembers.filter((member) => selectedMemberIds.has(member.id));
    const exportMembers = selectedForExport.length ? selectedForExport : filteredMembers;
    const dataToExport = exportMembers.map((member) => ({
      Name: getMemberName(member),
      Mobile: getMemberPhone(member) || "",
      Email: getMemberEmail(member) || "",
      Category: getMemberCategory(member) || "",
      Service: getMemberService(member) || "",
      Rank: getMemberRank(member) || "",
      Gender: member.gender || "",
      State: getMemberState(member) || "",
      City: getMemberCity(member) || "",
      Education: getMemberEducation(member) || "",
      Experience: getMemberExperience(member) || "",
      Status: member.status || "",
      "Placement Status": member.isPlaced ? "Placed" : "Active",
    }));

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    worksheet["!cols"] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 10;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cell = worksheet[XLSX.utils.encode_cell({ c: C, r: R })];
        if (cell && cell.v) {
          const length = String(cell.v).length;
          maxWidth = Math.max(maxWidth, length);
        }
      }
      worksheet["!cols"][C] = { wch: Math.min(maxWidth + 2, 60) };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Members");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Members_${today}.xlsx`);
  };


  // Loading state

  return (
    <div className="member-list-page page-fill" style={pageShellStyle}><style>{`
      @media (min-width: 768px) {
        .member-list-page {
          padding: 36px;
        }
      }
      .member-toolbar-group {
        border: 1px solid #dde1e7;
        border-left: none;
        border-radius: 6px;
        background: #fff;
      }
      .member-toolbar-group > div:first-child { gap: 0 !important; }
      .member-toolbar-group button {
        border: none !important;
        border-left: 1px solid #dde1e7 !important;
        border-radius: 0 !important;
        height: 32px !important;
      }
      .member-toolbar-group > div:first-child > div:first-child button { border-radius: 6px 0 0 6px !important; }
      .member-toolbar-group > div:last-child button { border-radius: 0 6px 6px 0 !important; }
      .member-date-range-wrapper {
        width: 100%;
      }
      .member-date-range-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #fff;
        font-size: 12px;
        color: #111827;
        outline: none;
        font-family: inherit;
      }
      .member-date-range-input:focus {
        border-color: #c2d45e;
        box-shadow: 0 0 0 3px rgba(194, 212, 94, 0.12);
      }
      #member-date-range-portal {
        position: relative;
        z-index: 10200;
      }
      .member-date-range-popper {
        z-index: 10200;
      }
    `}</style>
      {/* Header band: title/Reset+Export, then search+Filters/Group By/Favorites, then total count+pagination+view toggle */}
      <div className="page-header-band" style={{ background: "#fff" }}>
        {/* Row 1: title, Reset Filters (Export lives in the Action menu once rows are ticked) */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 600, color: "#111827", letterSpacing: "-0.01em" }}>Members Master List</h1>
            <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 400 }}>{totalItems.toLocaleString()} Members</span>
          </div>
          <button onClick={clearFilters} style={headerButtonStyle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Reset Filters
          </button>
        </div>

        {/* Row 2: search, Filters / Group By / Favorites */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <OdooSearchBar
            variant="boxed"
            value={searchTerm}
            onChange={(e) => {
              const nextValue = e.target.value;
              startTransition(() => {
                setSearchTerm(nextValue);
              });
            }}
            placeholder="Search name, mobile, email..."
            chips={filterChips}
          />

          <div className="member-toolbar-group" style={{ display: "flex", alignItems: "stretch", marginLeft: "auto" }}>
            <OdooViewToolbar
              variant="boxed"
              quickFilters={quickFilters}
              advancedContent={advancedFiltersPanel}
              groupByOptions={MEMBER_GROUP_BY_OPTIONS}
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

        {/* Row 3: breadcrumb, pagination range + view toggle */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", minHeight: "34px" }}>
            <SelectionActionMenu count={selectedVisibleCount} onExport={handleExportXLSX} onClear={() => setSelectedMemberIds(new Set())} />
            {groupBy && selectedVisibleCount === 0 && (
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 400 }}>
                Grouped by {MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {!groupBy && viewMode === "list" ? (
              <>
                <select
                  value={rowsPerPage === Infinity ? "all" : rowsPerPage}
                  onChange={(e) => {
                    const value = e.target.value === "all" ? Infinity : Number(e.target.value);
                    setRowsPerPage(value);
                    setCurrentPage(1);
                  }}
                  style={{ height: "30px", padding: "0 6px", borderRadius: "6px", border: "1px solid #dde1e7", fontSize: "12px", color: "#334155", background: "#fff", cursor: "pointer" }}
                >
                  <option value="all">All</option>
                  {[100, 500, 1000, 5000].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span style={{ fontSize: "13px", color: "#111827", fontWeight: 600, whiteSpace: "nowrap", margin: "0 2px" }}>
                  {rowsPerPage === Infinity
                    ? `${totalItems.toLocaleString()} / ${totalItems.toLocaleString()}`
                    : `${totalItems === 0 ? 0 : pageStart + 1}–${(pageStart + pageMembers.length).toLocaleString()} / ${totalItems.toLocaleString()}`}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  title="Previous page"
                  style={pagerButtonStyle(safeCurrentPage <= 1)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  title="Next page"
                  style={pagerButtonStyle(safeCurrentPage >= totalPages)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </>
            ) : (
              <span style={{ fontSize: "13px", color: "#111827", fontWeight: 600 }}>
                {totalItems.toLocaleString()} member{totalItems !== 1 ? "s" : ""}
              </span>
            )}

            <div style={{ display: "flex", background: "#dde1e7", border: "1px solid #dde1e7", borderRadius: "6px", overflow: "hidden", marginLeft: "2px" }}>
              <button type="button" onClick={() => setViewMode("list")} title="List view" style={viewButtonStyle(viewMode === "list")}>
                <ListIcon />
              </button>
              <button type="button" onClick={() => setViewMode("kanban")} title="Kanban view" style={viewButtonStyle(viewMode === "kanban")}>
                <KanbanIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="page-fill-mid" style={{ padding: 0 }}>
        <div className="page-fill-mid" style={{ width: "100%", margin: "0", padding: "0" }} ref={kanbanContainerRef}>
          <div className="page-fill-mid" style={{ borderTop: "1px solid #dde1e7", background: "#fff", overflowX: viewMode === "list" ? "auto" : "hidden", overflowY: "hidden" }}>
            {isMembersLoaded && viewMode === "list" && (
              <div style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE, minWidth: LIST_MIN_WIDTH, flex: "0 0 auto", background: "#c2d45e", position: "sticky", top: 0, zIndex: 1, alignItems: "center", height: "45px", boxSizing: "border-box" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <input
                    type="checkbox"
                    aria-label="Select all listed members"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAllVisible}
                    style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#ffffff" }}
                  />
                </div>
                {COL_HEADERS.map((col) => {
                  const sortKey = COL_SORT_KEYS[col];
                  const headerProps = sortHeaderProps(sortKey, sort, toggleSort);
                  return (
                    <div key={col} {...headerProps} style={{ padding: "0 10px", color: "#fff", fontWeight: 600, fontSize: "13px", textAlign: col === "Mobile" ? "right" : "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...headerProps.style }}>
                      {col}
                      <SortArrow active={sort.key === sortKey} dir={sort.dir} />
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={listBoxRef} style={{ flex: "1 1 auto", minHeight: 0, minWidth: viewMode === "list" ? LIST_MIN_WIDTH : undefined }}>
            {!isMembersLoaded ? (
              <TableLoadingSpinner label={loadProgress > 0 ? `Loading members — ${loadProgress}%` : "Loading members…"} />
            ) : filteredMembers.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                No members match your filters
              </div>
            ) : viewMode === "kanban" ? (
              <VariableList
                height={listHeight}
                width="100%"
                itemCount={kanbanRows.length}
                itemSize={kanbanRowHeight}
                itemData={kanbanRowItemData}
                overscanCount={4}
              >
                {KanbanRow}
              </VariableList>
            ) : (
              <List
                height={listHeight}
                width="100%"
                itemCount={listSourceItems.length}
                itemSize={ROW_HEIGHT}
                itemData={virtualRowItemData}
                overscanCount={6}
              >
                {VirtualRow}
              </List>
            )}
            </div>

            {isMembersLoaded && !groupBy && viewMode === "list" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "42px", padding: "0 16px", background: "#f8fafc", borderTop: "1px solid #dde1e7", fontSize: "11px", color: "#64748b" }}>
                <span>
                  {totalItems.toLocaleString()} member{totalItems !== 1 ? "s" : ""}
                </span>
                <span>
                  Page {safeCurrentPage} / {totalPages}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {tagModalMember && (
        <div
          onClick={closeTagModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "16px",
          }}
        >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "720px",
                background: "#fff",
                borderRadius: "16px",
                boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
                overflow: "hidden",
              }}
            >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>{tagModalMember.__name || getMemberName(tagModalMember)}</h3>
              </div>
              <button
                type="button"
                onClick={closeTagModal}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: "#334155",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "18px 20px 20px" }}>
              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                  Existing Tags
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {parseMemberSkills(tagModalMember).length > 0 ? (
                    parseMemberSkills(tagModalMember).map((skill) => (
                      <span
                        key={skill}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#f1f5f9",
                          color: "#334155",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: "13px", color: "#94a3b8" }}>No tags saved yet.</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  background: "#fafafa",
                  padding: "14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                  Add Tags
                </div>
                <input
                  type="text"
                  placeholder="Search and select tags..."
                  value={tagSearchTerm}
                  onFocus={() => setTagPickerOpen(true)}
                  onChange={(e) => {
                    setTagSearchTerm(e.target.value);
                    setTagPickerOpen(true);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "13px",
                    marginBottom: "10px",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <div
                  style={{
                    width: "100%",
                    marginTop: "10px",
                    borderRadius: "10px",
                    border: "1px solid #dbe3ee",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {tagPickerOpen && (
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {availableTags.filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase())).length > 0 ? (
                        availableTags
                          .filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                          .map((tag) => {
                            const checked = selectedTags.includes(tag);
                            return (
                              <label
                                key={tag}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "10px 12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f1f5f9",
                                  background: checked ? "#f1f6d6" : "#fff",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedTags((prev) =>
                                      prev.includes(tag)
                                        ? prev.filter((item) => item !== tag)
                                        : [...prev, tag]
                                    )
                                  }
                                  style={{ width: "16px", height: "16px" }}
                                />
                                <span style={{ fontSize: "13px", color: "#0f172a", fontWeight: checked ? "700" : "500" }}>
                                  {tag}
                                </span>
                              </label>
                            );
                          })
                      ) : (
                        <div style={{ padding: "12px", color: "#94a3b8", fontSize: "13px" }}>No tags found.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {tagModalError ? (
                <div style={{ marginBottom: "14px", color: "#dc2626", fontSize: "13px", fontWeight: "600" }}>
                  {tagModalError}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeTagModal}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTags}
                  disabled={tagModalSaving}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: tagModalSaving ? "#d9e49a" : "#c2d45e",
                    color: "#243014",
                    cursor: tagModalSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                    transition: "background 0.15s",
                  }}
                >
                  {tagModalSaving ? "Saving..." : "Save Tags"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {partnerModalMember && (
        <div
          onClick={closePartnerModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "560px",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>
                  {partnerModalMember.__name || getMemberName(partnerModalMember)}
                </h3>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>Regional Partner Checklist</div>
              </div>
              <button
                type="button"
                onClick={closePartnerModal}
                aria-label="Close"
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: "#334155",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "18px 20px 20px" }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                Criteria
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                {REGIONAL_PARTNER_CRITERIA.map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      background: partnerCriteria[key] ? "#f0fdfa" : "#fafafa",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!partnerCriteria[key]}
                      onChange={() =>
                        setPartnerCriteria((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      style={{ width: "16px", height: "16px", marginTop: "1px" }}
                    />
                    <span style={{ fontSize: "13px", color: "#0f172a" }}>{label}</span>
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                  Partner Status
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setPartnerStatusChoice("Active")}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: partnerStatusChoice === "Active" ? "2px solid #15803d" : "1px solid #e2e8f0",
                      background: partnerStatusChoice === "Active" ? "#dcfce7" : "#fafafa",
                      color: "#15803d",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartnerStatusChoice("Inactive")}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: partnerStatusChoice === "Inactive" ? "2px solid #a16207" : "1px solid #e2e8f0",
                      background: partnerStatusChoice === "Inactive" ? "#fef9c3" : "#fafafa",
                      color: "#a16207",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              {partnerModalMember.is_regional_partner && (
                <div
                  style={{
                    marginBottom: "14px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: partnerModalMember.regional_partner_status === "Inactive" ? "#a16207" : "#15803d",
                  }}
                >
                  ★ Currently marked as a{" "}
                  {partnerModalMember.regional_partner_status === "Inactive" ? "Inactive" : "Active"} Regional Partner
                </div>
              )}

              {/* Set by the daily api/deactivate-inactive-partners job. Saving as
                  Active again restarts the partner's 90-day window. */}
              {partnerModalMember.is_regional_partner &&
                partnerModalMember.regional_partner_status === "Inactive" &&
                partnerModalMember.regional_partner_auto_inactivated_at && (
                  <div style={{ marginTop: "-6px", marginBottom: "14px", fontSize: "12px", color: "#64748b" }}>
                    Set inactive automatically on{" "}
                    {(() => {
                      const v = partnerModalMember.regional_partner_auto_inactivated_at;
                      const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v?.seconds ? v.seconds * 1000 : v);
                      return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                    })()}
                    {" — "}
                    {partnerModalMember.regional_partner_inactive_reason || "no activity for 90 days"}.
                    {" "}Mark as Active to restart their 90 days.
                  </div>
                )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closePartnerModal}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                {partnerModalMember.is_regional_partner && (
                  <button
                    type="button"
                    onClick={() => handleSavePartnerStatus(false)}
                    disabled={partnerModalSaving}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid #dc2626",
                      background: "#fff",
                      color: "#dc2626",
                      cursor: partnerModalSaving ? "not-allowed" : "pointer",
                      fontWeight: "700",
                      fontSize: "13px",
                    }}
                  >
                    Remove Partner Status
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSavePartnerStatus(true)}
                  disabled={partnerModalSaving}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: partnerModalSaving ? "#d9e49a" : "#c2d45e",
                    color: "#243014",
                    cursor: partnerModalSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                    transition: "background 0.15s",
                  }}
                >
                  {partnerModalSaving ? "Saving..." : `Mark as ${partnerStatusChoice} Regional Partner`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tagsPopover && (
        <div
          ref={tagsPopoverRef}
          style={{
            position: "fixed",
            top: Math.min(tagsPopover.anchorRect.bottom + 6, window.innerHeight - 260),
            left: Math.min(tagsPopover.anchorRect.left, window.innerWidth - 240),
            width: "220px",
            maxHeight: "260px",
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
            zIndex: 3500,
            padding: "10px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
            All Tags
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(tagsPopover.member.__skills || []).map((tag) => (
              <span
                key={tag}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#334155", fontSize: "12px", fontWeight: 600 }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => {
                    openRemoveTagConfirm(tagsPopover.member, tag);
                    setTagsPopover(null);
                  }}
                  style={{ width: "14px", height: "14px", borderRadius: "50%", border: "none", background: "#cbd5e1", color: "#0f172a", fontSize: "10px", cursor: "pointer", padding: 0, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              openTagModal(tagsPopover.member);
              setTagsPopover(null);
            }}
            style={{ marginTop: "10px", width: "100%", padding: "6px 8px", borderRadius: "8px", border: "1px solid #c2d45e", background: "#f1f6d6", color: "#4a5a12", fontWeight: 700, cursor: "pointer", fontSize: "12px" }}
          >
            + Manage Tags
          </button>
        </div>
      )}

      {removeTagTarget && (
        <div
          onClick={closeRemoveTagConfirm}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3100,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ padding: "18px 20px 10px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>Remove tag?</h3>
                <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#475569", lineHeight: 1.5 }}>
                Do you want to remove <strong>{removeTagTarget.tag}</strong> from{" "}
                <strong>{removeTagTarget.member.__name || getMemberName(removeTagTarget.member)}</strong>?
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "0 20px 20px" }}>
              <button
                type="button"
                onClick={closeRemoveTagConfirm}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveTag}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {tagSuccessPopup.show && (
        <div
          style={{
            position: "fixed",
            right: "20px",
            top: "20px",
            background: tagSuccessPopup.type === "error" ? "#dc2626" : "#0f766e",
            color: "#fff",
            padding: "14px 18px",
            borderRadius: "12px",
            boxShadow:
              tagSuccessPopup.type === "error"
                ? "0 18px 40px rgba(220, 38, 38, 0.25)"
                : "0 18px 40px rgba(15, 118, 110, 0.25)",
            zIndex: 4000,
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          {tagSuccessPopup.message}
        </div>
      )}
    </div>
  );
}
