// src/pages/MemberListPage.jsx
import React, { useState, useMemo, useEffect, useRef, useTransition, useCallback } from "react";
import * as ReactWindow from "react-window";
const List = ReactWindow.FixedSizeList;
const VariableList = ReactWindow.VariableSizeList;
import { collection, collectionGroup, db, doc, getDocs, query, select, serverTimestamp, updateDoc } from "../firestoreClient";
import DualRangeSlider from "../components/DualRangeSlider";
import FilterAccordionList from "../components/FilterAccordionList";
import SkeletonLoader from "../components/SkeletonLoader";
import OdooViewToolbar, { ListIcon, KanbanIcon, ChevronDownIcon } from "../components/OdooViewToolbar";
import { boxedButtonStyle } from "../utils/uiStyles";
import OdooSearchBar from "../components/OdooSearchBar";
import useDebouncedValue from "../hooks/useDebouncedValue";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
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
  parseMemberDate,
} from "../utils/memberFields";
import { EMPTY_REQUIREMENT_DATA, loadRequirementApplicants } from "../utils/requirementApplicants";

const toDatePickerValue = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateBoundary = (value, endOfDay) => {
  if (!value) return null;
  const boundary = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(boundary.getTime()) ? null : boundary;
};

// ─── Module-level cache for this page's supporting fetches ───────────────────
// projectusersmaster, the full "interactions" collectionGroup, and "tags" are
// each a full collection scan. React Router unmounts this page on navigation,
// so without a cache every trip back to /memberlist re-ran all three from
// scratch — the collectionGroup scan alone touches every user's interactions
// subcollection. A short in-memory TTL cache lets same-session revisits reuse
// the last result instead of re-paying that cost.
const SUPPORTING_DATA_TTL_MS = 60_000;
let projectLinksCache = null; // { timestamp, phoneToProjects, projectList }
let ratedMembersCache = null; // { timestamp, ratedIds }

let tagsCache = null; // { timestamp, tags }

// ─── Virtual list constants ───────────────────────────────────────────────────
// checkbox | Name | Mobile | Category | Service | Rank | State | City | Tags | Regional Partner
// Sized so every column fits at ~1000px of table width (Name takes the slack).
const GRID_TEMPLATE = "36px minmax(110px, 1fr) 112px 84px 74px 58px 108px 92px 156px 114px";
const ROW_HEIGHT = 42;
const COL_HEADERS = ["Name", "Mobile", "Category", "Service", "Rank", "State", "City", "Tags", "Regional Partner"];

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

// Group By fields offered in the Odoo-style toolbar — the same full field
// list as the Filters accordion, so Group By has parity with Filters like
// it does in Odoo, not just a curated subset.
const MEMBER_GROUP_BY_OPTIONS = [
  { key: "Gender", label: "Gender" },
  { key: "Category", label: "Category" },
  { key: "Service", label: "Service" },
  { key: "Rank", label: "Rank" },
  { key: "Level", label: "Level" },
  { key: "Trade", label: "Trade" },
  { key: "City", label: "City" },
  { key: "State", label: "State" },
  { key: "Education", label: "Education" },
  { key: "Project", label: "Project" },
  { key: "Tags", label: "Tags" },
  { key: "BO Tags", label: "BO Tags" },
  { key: "Experience", label: "Experience" },
  { key: "Is Rated?", label: "Is Rated?" },
  { key: "Is Tagged?", label: "Is Tagged?" },
  { key: "Regional Partner", label: "Regional Partner" },
  { key: "Retirement Status", label: "Retirement Status" },
];

const SCALAR_GROUP_FIELD_MAP = {
  Gender: "gender",
  Category: "category",
  Service: "service",
  Rank: "rank",
  Level: "level",
  Trade: "trade",
  City: "city",
  State: "state",
  Education: "education",
};

const parseExperienceBucketRange = (label) => {
  if (label.includes("+")) {
    const min = parseFloat(label.replace("+ yrs", "").trim());
    return { min, max: Infinity };
  }
  const [minStr, maxStr] = label.replace(" yrs", "").split("-");
  return { min: parseFloat(minStr), max: parseFloat(maxStr) };
};

// Returns the group label(s) a member belongs under for a Group By field —
// usually one, but a member can land in several groups at once for
// multi-value fields like Tags or Project (same as grouping by a tags field
// in Odoo — a record with 2 tags appears under both groups).
const getGroupLabels = (member, groupByKey, experienceBuckets) => {
  const scalarField = SCALAR_GROUP_FIELD_MAP[groupByKey];
  if (scalarField) {
    const raw = member[scalarField];
    return [raw && String(raw).trim() ? String(raw).trim() : "Unspecified"];
  }
  if (groupByKey === "Tags") {
    return member.__skills && member.__skills.length ? member.__skills : ["Unspecified"];
  }
  if (groupByKey === "BO Tags") {
    const tags = (member.tags || []).map((t) => String(t).trim()).filter(Boolean);
    return tags.length ? tags : ["Unspecified"];
  }
  if (groupByKey === "Project") {
    return member.__projects && member.__projects.length ? member.__projects : ["Unspecified"];
  }
  if (groupByKey === "Experience") {
    const exp = member.__experienceValue;
    if (!Number.isFinite(exp) || exp < 0) return ["Unspecified"];
    for (const bucket of experienceBuckets) {
      const r = parseExperienceBucketRange(bucket);
      if (exp >= r.min && (r.max === Infinity || exp <= r.max)) return [bucket];
    }
    return ["Unspecified"];
  }
  if (groupByKey === "Is Rated?") return [member.__isRated ? "Yes" : "No"];
  if (groupByKey === "Is Tagged?") return [member.__isTagged ? "Yes" : "No"];
  if (groupByKey === "Regional Partner") {
    return [member.is_regional_partner ? (member.regional_partner_status === "Inactive" ? "Inactive" : "Active") : "Not a Partner"];
  }
  if (groupByKey === "Retirement Status") {
    const raw = member.retirement_status;
    return [raw && String(raw).trim() ? String(raw).trim() : "Unspecified"];
  }
  return ["Unspecified"];
};

const GROUP_HEADER_HEIGHT = 40;
const KANBAN_CARD_ROW_HEIGHT = 212;
const KANBAN_CARD_MIN_WIDTH = 240;

const cellStyle = {
  padding: "0 10px",
  fontSize: "12px",
  color: "#5b6572",
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
  const { items, onMemberClick, openTagModal, openRemoveTagConfirm, openTagsPopover, openPartnerModal, collapsedGroups, onToggleGroup, selectedIds, onToggleSelect } = data;
  const member = items[index];

  if (member.__type === "group") {
    return <GroupHeaderRow style={style} group={member} collapsed={collapsedGroups?.has(member.key)} onToggle={onToggleGroup} />;
  }

  const memberSkills = member.__skills || [];
  const visibleTags = memberSkills.slice(0, 1);

  return (
    <div
      style={{
        ...style,
        display: "grid",
        gridTemplateColumns: GRID_TEMPLATE,
        borderBottom: "1px solid #eceff3",
        cursor: "pointer",
        backgroundColor: selectedIds?.has(member.id) ? "#f0f7ff" : "#fff",
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
          style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#1976d2" }}
        />
      </div>
      <div style={{ ...cellStyle, fontWeight: 500, color: "#111827" }}>
        {member.__name || "—"}
      </div>
      <div style={cellStyle}>{member.phone_number || "—"}</div>
      <div style={cellStyle}>{member.category || "—"}</div>
      <div style={cellStyle}>{member.service || "—"}</div>
      <div style={cellStyle}>{member.rank || "—"}</div>
      <div style={cellStyle}>{member.state || "—"}</div>
      <div style={cellStyle}>{member.city || "—"}</div>
      <div style={{ padding: "0 10px", display: "flex", flexWrap: "nowrap", gap: "4px", alignItems: "center", overflow: "hidden", height: "100%" }}>
        {visibleTags.map((tag) => (
          <span
            key={tag}
            title={tag}
            style={{ display: "inline-flex", alignItems: "center", gap: "3px", maxWidth: "80px", padding: "2px 6px", borderRadius: "3px", background: "#eef2f7", color: "#475569", fontSize: "10.5px", fontWeight: 500, flexShrink: 1, minWidth: 0 }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tag}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openRemoveTagConfirm(member, tag); }}
              style={{ width: "12px", height: "12px", border: "none", background: "transparent", color: "#64748b", fontSize: "12px", cursor: "pointer", padding: 0, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              ×
            </button>
          </span>
        ))}
        {memberSkills.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTagsPopover(member, e.currentTarget.getBoundingClientRect());
            }}
            style={{ border: "none", background: "none", padding: 0, fontSize: "11px", color: "#1976d2", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            +{memberSkills.length - 1}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openTagModal(member); }}
          style={{ padding: "2px 7px", borderRadius: "3px", border: "1px solid #cfd6df", background: "#fff", color: "#334155", fontWeight: 500, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          + Tag
        </button>
      </div>
      <div style={{ padding: "0 10px", display: "flex", alignItems: "center", height: "100%" }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openPartnerModal(member); }}
          style={
            member.is_regional_partner
              ? member.regional_partner_status === "Inactive"
                ? { padding: "3px 9px", borderRadius: "3px", border: "1px solid #a16207", background: "#fef9c3", color: "#a16207", fontWeight: 600, cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }
                : { padding: "3px 9px", borderRadius: "3px", border: "1px solid #15803d", background: "#dcfce7", color: "#15803d", fontWeight: 600, cursor: "pointer", fontSize: "11px", whiteSpace: "nowrap" }
              : { padding: "3px 9px", borderRadius: "3px", border: "1px solid #bcd6f2", background: "#eef5fd", color: "#1565c0", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" }
          }
        >
          {member.is_regional_partner ? "★ Regional Partner" : "Mark Partner"}
        </button>
      </div>
    </div>
  );
});

const kanbanChipStyle = { padding: "2px 8px", borderRadius: "999px", background: "#f1f5f9", color: "#475569", fontSize: "10.5px", fontWeight: 600 };
const kanbanSmallBtnStyle = { padding: "3px 8px", borderRadius: "999px", border: "1px solid #1976d2", background: "#e3f2fd", color: "#1565c0", fontWeight: 700, cursor: "pointer", fontSize: "10.5px", whiteSpace: "nowrap" };

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
        <div style={{ fontSize: "11px", color: "#1976d2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

const FAVORITES_STORAGE_KEY = "memberListFavorites";

// Matches OdooViewToolbar's own view-toggle button look (not exported from
// there — exporting a non-component breaks that file's Fast Refresh).
const viewButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "27px",
  background: active ? "#e3f2fd" : "#fff",
  border: "none",
  color: active ? "#1976d2" : "#64748b",
  cursor: "pointer",
});

// Reset Filters / Export.
const headerButtonStyle = {
  height: "29px",
  padding: "0 12px",
  background: "#fff",
  border: "1px solid #dde1e7",
  color: "#334155",
  borderRadius: "5px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: "12px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const pagerButtonStyle = (disabled) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "26px",
  height: "26px",
  padding: 0,
  borderRadius: "5px",
  border: "1px solid #dde1e7",
  background: disabled ? "#f8fafc" : "#fff",
  color: disabled ? "#cbd5e1" : "#475569",
  cursor: disabled ? "not-allowed" : "pointer",
});

const StarIcon = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// Same bordered look as the Filters / Group By buttons beside it.
const favoritesButtonStyle = (active) => boxedButtonStyle(active);

// Odoo-style "Favorites" menu — saves the current search/filter/group-by
// state under a name in localStorage, so staff can jump back to a search
// they use often (e.g. "Unplaced ex-Army, Delhi NCR") without rebuilding it.
function FavoritesMenu({ favorites, onApply, onDelete, onSave }) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const submitSave = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setDraftName("");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={favoritesButtonStyle(favorites.length > 0)}>
        <StarIcon filled={favorites.length > 0} /> Favorites <ChevronDownIcon />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
            width: "260px",
            maxHeight: "min(70vh, 420px)",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {favorites.length === 0 ? (
            <div style={{ padding: "14px", fontSize: "12.5px", color: "#94a3b8", fontStyle: "italic" }}>
              No favorites saved yet.
            </div>
          ) : (
            <div style={{ padding: "4px 0" }}>
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", fontSize: "13px" }}
                >
                  <span
                    onClick={() => { onApply(fav); setOpen(false); }}
                    style={{ flex: 1, color: "#334155", fontWeight: 500, cursor: "pointer" }}
                  >
                    {fav.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(fav.id)}
                    title="Remove favorite"
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "15px", padding: "2px 6px", lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 14px", display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSave()}
              placeholder="Save current search as..."
              style={{ flex: 1, minWidth: 0, padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12.5px" }}
            />
            <button
              type="button"
              onClick={submitSave}
              style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "#1976d2", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemberListPage({ onMemberClick, memberRecords = [], membersLoading = false }) {
  const pageShellStyle = {
    padding: 0,
    maxWidth: "100%",
    width: "100%",
    margin: "0 auto",
    minHeight: "calc(100vh - 64px)",
    boxSizing: "border-box",
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");
  const [members, setMembers] = useState(memberRecords);
  const [isMembersLoaded, setIsMembersLoaded] = useState(!membersLoading);
  const [listHeight, setListHeight] = useState(() => Math.max(460, Math.floor(window.innerHeight * 0.65)));
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(500);
  const [viewMode, setViewMode] = useState("list");
  const [groupBy, setGroupBy] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [kanbanCardsPerRow, setKanbanCardsPerRow] = useState(4);
  const kanbanContainerRef = useRef(null);
  const tagsPopoverRef = useRef(null);
  const [, startTransition] = useTransition();
  const [retirementStatus, setRetirementStatus] = useState("All");
  // Deep-link support (e.g. from the daily report email): ?from=YYYY-MM-DD&to=YYYY-MM-DD
  // pre-fills the registration date range, ?tagged=yes pre-selects "Is Tagged? = Yes" below.
  const [registrationDateFrom, setRegistrationDateFrom] = useState(
    () => new URLSearchParams(window.location.search).get("from") || ""
  );
  const [registrationDateTo, setRegistrationDateTo] = useState(
    () => new URLSearchParams(window.location.search).get("to") || ""
  );
  const [ageRange, setAgeRange] = useState([0, 100]);
  const [tagModalMember, setTagModalMember] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [memberProjectsByPhone, setMemberProjectsByPhone] = useState({});
  const [ratedMemberIds, setRatedMemberIds] = useState(() => new Set());
  const [requirementData, setRequirementData] = useState(EMPTY_REQUIREMENT_DATA);
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

  const [sidebarFilters, setSidebarFilters] = useState(() => ({
    Gender: [],
    Category: [],
    Service: [],
    Rank: [],
    Level: [],
    Trade: [],
    City: [],
    State: [],
    Education: [],
    Project: [],
    Requirement: [],
    Status: "All",
    "Placement Status": "All",
    Experience: [],
    Tags: [],
    "BO Tags": [],
    "Is Rated?": [],
    "Is Tagged?": new URLSearchParams(window.location.search).get("tagged") === "yes" ? ["Yes"] : [],
    "Regional Partner": [],
  }));

  // Saved search/filter presets — see FavoritesMenu above.
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error("Error loading favorites:", error);
      return [];
    }
  });

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  };

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 180);

  useEffect(() => {
    const onResize = () => setListHeight(Math.max(460, Math.floor(window.innerHeight * 0.65)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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

  const normalizeProjectPhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const splitProjects = (value) =>
    String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  useEffect(() => {
    if (!membersLoading && Array.isArray(memberRecords)) {
      setMembers(memberRecords);
      setIsMembersLoaded(true);
      setLoadProgress(100);
    } else {
      setIsMembersLoaded(!membersLoading);
    }
  }, [memberRecords, membersLoading]);

  useEffect(() => {
    const loadProjectLinks = async () => {
      try {
        if (projectLinksCache && Date.now() - projectLinksCache.timestamp < SUPPORTING_DATA_TTL_MS) {
          setMemberProjectsByPhone(projectLinksCache.phoneToProjects);
          setAvailableProjects(projectLinksCache.projectList);
          return;
        }

        const snapshot = await getDocs(
          query(
            collection(db, "projectusersmaster"),
            select(
              "phone_number", "phone", "mobile", "contact_number", "mobile_number",
              "projects", "Projects", "project", "Project"
            )
          )
        );
        const phoneToProjects = {};
        const projectSet = new Set();

        snapshot.docs.forEach((snapDoc) => {
          const row = snapDoc.data() || {};
          const phone = normalizeProjectPhone(
            row.phone_number ||
              row.phone ||
              row.mobile ||
              row.contact_number ||
              row.mobile_number ||
              ""
          );
          if (!phone) return;

          const projects = splitProjects(row.projects || row.Projects || row.project || row.Project);
          if (!projects.length) return;

          if (!phoneToProjects[phone]) phoneToProjects[phone] = [];
          projects.forEach((project) => {
            phoneToProjects[phone].push(project);
            projectSet.add(project);
          });
        });

        Object.keys(phoneToProjects).forEach((phone) => {
          phoneToProjects[phone] = Array.from(new Set(phoneToProjects[phone]));
        });

        const projectList = ["All", ...Array.from(projectSet).sort((a, b) => a.localeCompare(b))];
        projectLinksCache = { timestamp: Date.now(), phoneToProjects, projectList };

        setMemberProjectsByPhone(phoneToProjects);
        setAvailableProjects(projectList);
      } catch (error) {
        console.error("Error loading project links:", error);
      }
    };

    void loadProjectLinks();
  }, []);

  useEffect(() => {
    const loadRatedMembers = async () => {
      try {
        if (ratedMembersCache && Date.now() - ratedMembersCache.timestamp < SUPPORTING_DATA_TTL_MS) {
          setRatedMemberIds(ratedMembersCache.ratedIds);
          return;
        }

        const snapshot = await getDocs(
          query(
            collectionGroup(db, "interactions"),
            select("ratingType", "workRating", "boRating", "referrerRating")
          )
        );
        const ratedIds = new Set();

        snapshot.docs.forEach((interactionDoc) => {
          const data = interactionDoc.data() || {};
          const isRated =
            data.ratingType &&
            data.ratingType !== "not_rated" &&
            (Number(data.workRating) > 0 || Number(data.boRating) > 0 || Number(data.referrerRating) > 0);
          if (!isRated) return;

          const userId = interactionDoc.ref.parent.parent?.id;
          if (userId) ratedIds.add(userId);
        });

        ratedMembersCache = { timestamp: Date.now(), ratedIds };
        setRatedMemberIds(ratedIds);
      } catch (error) {
        console.error("Error loading rated members:", error);
      }
    };

    void loadRatedMembers();
  }, []);

  // "Requirement" filter: every job, project and TCS-run project (Temp Staff)
  // that has at least one applicant, mapped to the members who applied to it.
  // Shared loader (utils/requirementApplicants.js) — also used by the Dashboard.
  useEffect(() => {
    let cancelled = false;
    loadRequirementApplicants()
      .then((data) => {
        if (!cancelled) setRequirementData(data);
      })
      .catch((error) => console.error("Error loading requirement filter data:", error));
    return () => { cancelled = true; };
  }, []);

  const memberIndex = useMemo(() => {
    // `member` is already normalized once in App.jsx's Layout (normalizeMemberRecord),
    // so full_name/phone_number/category/etc. are already direct properties here.
    // Re-running the getMemberX() fuzzy key-matching helpers on every one of 15k+ rows
    // was the dominant cost of this list (each helper rescans every raw key on the record
    // for every candidate name) — read the precomputed fields directly instead.
    return members.map((member) => {
      const name = member.full_name || getMemberName(member);
      const email = member.email || getMemberEmail(member);
      const phone = member.phone_number || getMemberPhone(member) || "";
      const category = member.category || getMemberCategory(member);
      const service = member.service || getMemberService(member);
      const rank = member.rank || getMemberRank(member);
      const state = member.state || getMemberState(member);
      const city = member.city || getMemberCity(member);
      const education = member.education || getMemberEducation(member);
      const skills = Array.isArray(member.skills) ? member.skills : parseMemberSkills(member);
      const experienceText = member.experience || member.total_experience || getMemberExperience(member);
      const experienceValue = parseFloat(experienceText);
      const memberPhoneDigits = normalizeProjectPhone(phone);
      const projectLabels = memberProjectsByPhone[memberPhoneDigits] || [];
      const projectLabelsLower = projectLabels.map((project) => String(project).toLowerCase());
      const registrationDate = parseMemberDate(member.registration_date);

      return {
        ...member,
        __name: name,
        __emailLower: String(email || "").toLowerCase(),
        __phoneLower: String(phone || "").toLowerCase(),
        __categoryLower: String(category || "").toLowerCase(),
        __serviceLower: String(service || "").toLowerCase(),
        __rankLower: String(rank || "").toLowerCase(),
        __stateLower: String(state || "").toLowerCase(),
        __cityLower: String(city || "").toLowerCase(),
        __educationLower: String(education || "").toLowerCase(),
        __skills: skills,
        __skillsLower: skills.map((skill) => String(skill).toLowerCase()),
        __projects: projectLabels,
        __projectsLower: projectLabelsLower,
        __searchBlob: [
          name,
          email,
          phone,
          category,
          service,
          rank,
          state,
          city,
          education,
          ...projectLabels,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        __experienceValue: Number.isFinite(experienceValue) ? experienceValue : NaN,
        __dataTagsLower: (Array.isArray(member.tags) ? member.tags : []).map((tag) => String(tag).toLowerCase()),
        __registrationDateMs: registrationDate ? registrationDate.getTime() : null,
        __isRated: ratedMemberIds.has(member.id),
        __isTagged: skills.some((skill) => String(skill).trim()),
      };
    });
  }, [members, memberProjectsByPhone, ratedMemberIds]);
  // Dynamic filter options — single pass over memberIndex (was 12 passes before)
  const filterOptions = useMemo(() => {
    const genderSet = new Set();
    const categorySet = new Set();
    const serviceSet = new Set();
    const rankSet = new Set();
    const levelSet = new Set();
    const tradeSet = new Set();
    const citySet = new Set();
    const stateSet = new Set();
    const educationSet = new Set();
    const statusSet = new Set();
    const skillsSet = new Set();
    const dataTagsSet = new Set();
    const experiences = [];

    for (const member of memberIndex) {
      if (member.gender) {
        const g = String(member.gender).trim();
        genderSet.add(g.toLowerCase() === "male" ? "Male" : g.toLowerCase() === "female" ? "Female" : g);
      }
      if (member.category) categorySet.add(String(member.category).trim());
      if (member.service)      serviceSet.add(String(member.service).trim());
      if (member.rank)         rankSet.add(String(member.rank).trim());
      if (member.level)        levelSet.add(String(member.level).trim());
      if (member.trade)        tradeSet.add(String(member.trade).trim());
      if (member.city)         citySet.add(String(member.city).trim());
      if (member.state)        stateSet.add(String(member.state).trim());
      if (member.education)    educationSet.add(String(member.education).trim());
      if (member.status)       statusSet.add(String(member.status).trim());
      for (const s of member.__skills) skillsSet.add(s);
      if (Array.isArray(member.tags)) {
        for (const t of member.tags) {
          const trimmed = String(t).trim();
          if (trimmed) dataTagsSet.add(trimmed);
        }
      }
      if (!isNaN(member.__experienceValue) && member.__experienceValue >= 0) {
        experiences.push(member.__experienceValue);
      }
    }

    const toSorted = (set) => Array.from(set).sort((a, b) => a.localeCompare(b));

    let buckets = [];
    if (experiences.length === 0) {
      buckets = ["0-1 yr", "1-3 yrs", "3-5 yrs", "5-10 yrs", "10+ yrs"];
    } else {
      const maxExp = Math.max(...experiences);
      const ceiling = Math.ceil(maxExp / 5) * 5;
      if (ceiling >= 1)  buckets.push("0-1 yr");
      if (ceiling >= 3)  buckets.push("1-3 yrs");
      if (ceiling >= 5)  buckets.push("3-5 yrs");
      if (ceiling >= 10) buckets.push("5-10 yrs");
      if (ceiling >= 15) buckets.push("10-15 yrs");
      if (ceiling >= 20) buckets.push("15-20 yrs");
      if (ceiling >= 25) buckets.push("20-25 yrs");
      if (ceiling >= 30) buckets.push("25-30 yrs");
      if (ceiling > 30)  buckets.push("30+ yrs");
      else if (ceiling >= 10) buckets.push(`${Math.max(10, ceiling - 5)}+ yrs`);
    }

    return {
      Gender:           toSorted(genderSet),
      Category:         toSorted(categorySet),
      Service:          toSorted(serviceSet),
      Rank:             toSorted(rankSet),
      Level:            toSorted(levelSet),
      Trade:            toSorted(tradeSet),
      City:             toSorted(citySet),
      State:            toSorted(stateSet),
      Education:        toSorted(educationSet),
      Project:          availableProjects.filter((p) => p !== "All"),
      Requirement:      requirementData.labels,
      Status:           toSorted(statusSet),
      Tags:             Array.from(skillsSet).sort((a, b) => a.localeCompare(b)),
      "BO Tags":      Array.from(dataTagsSet).sort((a, b) => a.localeCompare(b)),
      "Placement Status": ["Placed", "Active"],
      Experience:       buckets,
      "Is Rated?":      ["Yes", "No"],
      "Is Tagged?":     ["Yes", "No"],
      "Regional Partner": ["Active", "Inactive"],
    };
  }, [memberIndex, availableProjects, requirementData]);

  const ageBounds = useMemo(() => {
    const ages = memberIndex.map((member) => member.age_years).filter((age) => Number.isFinite(age));
    if (ages.length === 0) return { min: 0, max: 100 };
    const min = Math.max(0, Math.floor(Math.min(...ages)));
    const max = Math.max(min, Math.ceil(Math.max(...ages)));
    return { min, max };
  }, [memberIndex]);

  useEffect(() => {
    setAgeRange([ageBounds.min, ageBounds.max]);
  }, [ageBounds.min, ageBounds.max]);

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

  const handleFilterChange = (key, value) => {
    startTransition(() => {
      setSidebarFilters((prev) => ({ ...prev, [key]: value }));
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      setSidebarFilters({
        Gender: [],
        Category: [],
        Service: [],
        Rank: [],
        Level: [],
        Trade: [],
        City: [],
        State: [],
        Education: [],
        Project: [],
        Requirement: [],
        Status: "All",
        "Placement Status": "All",
        Experience: [],
        Tags: [],
        "BO Tags": [],
        "Is Rated?": [],
        "Is Tagged?": [],
        "Regional Partner": [],
      });
      setRetirementStatus("All");
      setRegistrationDateFrom("");
      setRegistrationDateTo("");
      setAgeRange([ageBounds.min, ageBounds.max]);
    });
  };

  const saveCurrentAsFavorite = (name) => {
    const snapshot = {
      id: Date.now().toString(36),
      name,
      searchTerm,
      sidebarFilters,
      retirementStatus,
      registrationDateFrom,
      registrationDateTo,
      ageRange,
      groupBy,
    };
    persistFavorites([...favorites, snapshot]);
  };

  const applyFavorite = (fav) => {
    startTransition(() => {
      setSearchTerm(fav.searchTerm || "");
      setSidebarFilters(fav.sidebarFilters || {});
      setRetirementStatus(fav.retirementStatus || "All");
      setRegistrationDateFrom(fav.registrationDateFrom || "");
      setRegistrationDateTo(fav.registrationDateTo || "");
      setAgeRange(fav.ageRange || [ageBounds.min, ageBounds.max]);
      setGroupBy(fav.groupBy || null);
    });
    setCurrentPage(1);
  };

  const deleteFavorite = (id) => {
    persistFavorites(favorites.filter((f) => f.id !== id));
  };

  const parseExperienceRange = (range) => {
    if (range === "All") return null;
    if (range.includes("+")) {
      const min = parseFloat(range.replace("+ yrs", "").trim());
      return { min, max: Infinity };
    }
    const [minStr, maxStr] = range.replace(" yrs", "").split("-");
    return { min: parseFloat(minStr), max: parseFloat(maxStr) };
  };

  // Filtered + Sorted Members (Robust Alphabetical A → Z)
  const filteredMembers = useMemo(() => {
    const list = [];
    const searchTerm = debouncedSearchTerm.trim().toLowerCase();
    const selectedSidebarFilters = Object.entries(sidebarFilters).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== "All"
    );
    const activeAgeFilter = ageRange[0] > ageBounds.min || ageRange[1] < ageBounds.max;
    const fromBoundaryMs = parseDateBoundary(registrationDateFrom, false)?.getTime() ?? null;
    const toBoundaryMs = parseDateBoundary(registrationDateTo, true)?.getTime() ?? null;

    const fieldMap = {
      Gender: "gender",
      Category: "category",
      Service: "service",
      Rank: "rank",
      Level: "level",
      Trade: "trade",
      City: "city",
      State: "state",
      Education: "education",
      Project: "project",
    };

    const lowercasedSidebarFilters = selectedSidebarFilters.map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : String(value).toLowerCase(),
    ]);

    for (const member of memberIndex) {
      if (searchTerm) {
        if (
          !member.__searchBlob.includes(searchTerm) &&
          !member.__phoneLower.includes(searchTerm) &&
          !member.__emailLower.includes(searchTerm)
        ) {
          continue;
        }
      }

      if (filterPlaced === "placed" && member.isPlaced !== true) continue;
      if (filterPlaced === "active" && member.isPlaced === true) continue;
      if (retirementStatus !== "All" && member.retirement_status !== retirementStatus) continue;

      if (fromBoundaryMs !== null || toBoundaryMs !== null) {
        if (member.__registrationDateMs === null) continue;
        if (fromBoundaryMs !== null && member.__registrationDateMs < fromBoundaryMs) continue;
        if (toBoundaryMs !== null && member.__registrationDateMs > toBoundaryMs) continue;
      }

      if (activeAgeFilter) {
        const age = member.age_years;
        if (!Number.isFinite(age) || age < ageRange[0] || age > ageRange[1]) continue;
      }

      let matchesSidebar = true;
      for (const [key, values] of lowercasedSidebarFilters) {
        if (key === "Tags") {
          if (!values.some((v) => member.__skillsLower.includes(v))) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "BO Tags") {
          if (!values.some((v) => member.__dataTagsLower.includes(v))) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "Placement Status") {
          const wantsPlaced = values.includes("placed");
          const wantsActive = values.includes("active");
          if (wantsPlaced && !wantsActive && member.isPlaced !== true) { matchesSidebar = false; break; }
          if (wantsActive && !wantsPlaced && member.isPlaced === true) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Is Rated?") {
          const wantsYes = values.includes("yes");
          const wantsNo = values.includes("no");
          if (wantsYes && !wantsNo && !member.__isRated) { matchesSidebar = false; break; }
          if (wantsNo && !wantsYes && member.__isRated) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Is Tagged?") {
          const wantsYes = values.includes("yes");
          const wantsNo = values.includes("no");
          if (wantsYes && !wantsNo && !member.__isTagged) { matchesSidebar = false; break; }
          if (wantsNo && !wantsYes && member.__isTagged) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Regional Partner") {
          const wantsActive = values.includes("active");
          const wantsInactive = values.includes("inactive");
          const isActivePartner = !!member.is_regional_partner && member.regional_partner_status !== "Inactive";
          const isInactivePartner = !!member.is_regional_partner && member.regional_partner_status === "Inactive";
          if (wantsActive && !wantsInactive && !isActivePartner) { matchesSidebar = false; break; }
          if (wantsInactive && !wantsActive && !isInactivePartner) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Experience") {
          const ranges = values.map((v) => parseExperienceRange(v)).filter(Boolean);
          if (!ranges.length) continue;
          const exp = member.__experienceValue;
          const matchesAny = Number.isFinite(exp) && ranges.some(
            (r) => exp >= r.min && (r.max === Infinity || exp <= r.max)
          );
          if (!matchesAny) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "Project") {
          if (!values.some((v) => member.__projectsLower.includes(v))) {
            matchesSidebar = false;
          }
          if (!matchesSidebar) break;
          continue;
        }

        if (key === "Requirement") {
          if (!values.some((v) => requirementData.membersByLabel.get(v)?.has(member.id))) {
            matchesSidebar = false;
          }
          if (!matchesSidebar) break;
          continue;
        }

        const dbField = fieldMap[key];
        if (!dbField) continue;
        let memberValue;
        if (dbField === "category") memberValue = member.__categoryLower;
        else if (dbField === "service") memberValue = member.__serviceLower;
        else if (dbField === "rank") memberValue = member.__rankLower;
        else if (dbField === "state") memberValue = member.__stateLower;
        else if (dbField === "city") memberValue = member.__cityLower;
        else if (dbField === "education") memberValue = member.__educationLower;
        else memberValue = String(member[dbField] || "").toLowerCase();

        if (!values.includes(memberValue)) matchesSidebar = false;

        if (!matchesSidebar) break;
      }

      if (matchesSidebar) list.push(member);
    }

    // Fast sort — localeCompare is ~10x slower than direct comparison at 15k rows
    list.sort((a, b) => {
      const nameA = (a.__name || "ZZZ_NO_NAME").toLowerCase();
      const nameB = (b.__name || "ZZZ_NO_NAME").toLowerCase();
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });

    return list;
  }, [memberIndex, debouncedSearchTerm, filterPlaced, sidebarFilters, requirementData, retirementStatus, registrationDateFrom, registrationDateTo, ageRange, ageBounds.min, ageBounds.max]);

  const totalItems = filteredMembers.length;
  const totalPages = rowsPerPage === Infinity ? 1 : Math.max(1, Math.ceil(totalItems / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = rowsPerPage === Infinity ? 0 : (safeCurrentPage - 1) * rowsPerPage;
  const pageMembers = rowsPerPage === Infinity ? filteredMembers : filteredMembers.slice(pageStart, pageStart + rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [filteredMembers]);

  // Grouping shows every matching member via the virtualized list rather
  // than the page-by-page slice above — a "page 2 of N" doesn't make sense
  // once rows are reorganized into named groups.
  const groupedMembers = useMemo(() => {
    if (!groupBy) return null;
    const experienceBuckets = filterOptions.Experience || [];
    const groups = new Map();
    for (const member of filteredMembers) {
      const labels = getGroupLabels(member, groupBy, experienceBuckets);
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(member);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupBy, filteredMembers, filterOptions]);

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

  const kanbanSourceItems = groupBy ? groupedFlatItems : filteredMembers;

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

  const virtualRowItemData = useMemo(
    () => ({
      items: listSourceItems,
      onMemberClick,
      openTagModal,
      openRemoveTagConfirm,
      openTagsPopover,
      openPartnerModal,
      collapsedGroups,
      onToggleGroup: toggleGroupCollapsed,
      selectedIds: selectedMemberIds,
      onToggleSelect: toggleSelectMember,
    }),
    [listSourceItems, onMemberClick, openTagModal, openRemoveTagConfirm, openTagsPopover, openPartnerModal, collapsedGroups, toggleGroupCollapsed, selectedMemberIds, toggleSelectMember]
  );

  const kanbanRowItemData = useMemo(
    () => ({ rows: kanbanRows, onMemberClick, openTagModal, openPartnerModal, collapsedGroups, onToggleGroup: toggleGroupCollapsed }),
    [kanbanRows, onMemberClick, openTagModal, openPartnerModal, collapsedGroups, toggleGroupCollapsed]
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

  const filterKeys = [
    "Gender",
    "Category",
    "Service",
    "Rank",
    "Level",
    "Trade",
    "State",
    "City",
    "Education",
    "Project",
    "Requirement",
    "Tags",
    "BO Tags",
    "Experience",
    "Is Rated?",
    "Is Tagged?",
    "Regional Partner",
  ];

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

  // One-click toggles shown in the Filters dropdown — each just flips a
  // value already tracked in sidebarFilters/retirementStatus, so the search
  // bar's chip row (below) reflects them automatically, same as any other
  // filter.
  const quickFilters = [
    {
      key: "tagged",
      label: "Tagged",
      active: (sidebarFilters["Is Tagged?"] || []).includes("Yes"),
      onToggle: () =>
        handleFilterChange("Is Tagged?", (sidebarFilters["Is Tagged?"] || []).includes("Yes") ? [] : ["Yes"]),
    },
    {
      key: "rated",
      label: "Rated",
      active: (sidebarFilters["Is Rated?"] || []).includes("Yes"),
      onToggle: () =>
        handleFilterChange("Is Rated?", (sidebarFilters["Is Rated?"] || []).includes("Yes") ? [] : ["Yes"]),
    },
    {
      key: "partner-active",
      label: "Regional Partner (Active)",
      active: (sidebarFilters["Regional Partner"] || []).includes("Active"),
      startGroup: true,
      onToggle: () => {
        const current = sidebarFilters["Regional Partner"] || [];
        const has = current.includes("Active");
        handleFilterChange("Regional Partner", has ? current.filter((v) => v !== "Active") : [...current, "Active"]);
      },
    },
    {
      key: "partner-inactive",
      label: "Regional Partner (Inactive)",
      active: (sidebarFilters["Regional Partner"] || []).includes("Inactive"),
      onToggle: () => {
        const current = sidebarFilters["Regional Partner"] || [];
        const has = current.includes("Inactive");
        handleFilterChange("Regional Partner", has ? current.filter((v) => v !== "Inactive") : [...current, "Inactive"]);
      },
    },
    {
      key: "retired",
      label: "Retired",
      active: retirementStatus === "Retired",
      startGroup: true,
      onToggle: () => setRetirementStatus(retirementStatus === "Retired" ? "All" : "Retired"),
    },
  ];

  // Every active filter/group renders as a removable chip in the search bar
  // — a generic projection of sidebarFilters/retirementStatus/groupBy rather
  // than a separately-tracked list, so it can never drift out of sync.
  const filterChips = [];
  Object.entries(sidebarFilters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        filterChips.push({
          key: `${key}:${v}`,
          label: v,
          onRemove: () => handleFilterChange(key, value.filter((x) => x !== v)),
        });
      });
    } else if (value && value !== "All") {
      filterChips.push({ key: `${key}:${value}`, label: value, onRemove: () => handleFilterChange(key, "All") });
    }
  });
  if (retirementStatus !== "All") {
    filterChips.push({ key: "retirement", label: retirementStatus, onRemove: () => setRetirementStatus("All") });
  }
  if (groupBy) {
    const activeGroupOption = MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy);
    filterChips.push({
      key: "groupby",
      label: `Group: ${activeGroupOption?.label || groupBy}`,
      onRemove: () => setGroupBy(null),
    });
  }

  // The full field-by-field filter panel, embedded as the Filters dropdown's
  // collapsible "Advanced Filters" section instead of living in its own
  // block below the header.
  const advancedFiltersPanel = (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
        <button
          onClick={clearFilters}
          style={{
            padding: "6px 14px",
            background: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "12px",
            cursor: "pointer",
            fontWeight: "700",
            whiteSpace: "nowrap",
          }}
        >
          Clear All
        </button>
      </div>

      <div style={{ marginBottom: "14px" }}>
        <FilterAccordionList
          sections={[
            ...filterKeys.map((filterKey) => ({
              key: filterKey,
              label: filterKey,
              options: filterOptions[filterKey] || [],
              selected: sidebarFilters[filterKey] || [],
              onChange: (next) => handleFilterChange(filterKey, next),
            })),
            {
              key: "Retirement Status",
              label: "Retirement Status",
              options: ["Retired", "Not Retired"],
              selected: retirementStatus === "All" ? [] : [retirementStatus],
              onChange: (next) => setRetirementStatus(next.length ? next[next.length - 1] : "All"),
            },
          ]}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "stretch" }}>
        <div
          style={{
            flex: "1 1 320px",
            background: "#f8fafc",
            border: "1px solid #dbe3ee",
            borderRadius: "10px",
            padding: "10px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "11px", color: "#334155" }}>Date Range</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <DatePicker
              selected={toDatePickerValue(registrationDateFrom)}
              onChange={(date) =>
                startTransition(() => {
                  setRegistrationDateFrom(toDateInputValue(date));
                })
              }
              dateFormat="dd MMM yyyy"
              placeholderText="From date"
              showPopperArrow={false}
              className="member-date-range-input"
              wrapperClassName="member-date-range-wrapper"
              portalId="member-date-range-portal"
              popperClassName="member-date-range-popper"
            />
            <DatePicker
              selected={toDatePickerValue(registrationDateTo)}
              onChange={(date) =>
                startTransition(() => {
                  setRegistrationDateTo(toDateInputValue(date));
                })
              }
              dateFormat="dd MMM yyyy"
              placeholderText="To date"
              showPopperArrow={false}
              className="member-date-range-input"
              wrapperClassName="member-date-range-wrapper"
              portalId="member-date-range-portal"
              popperClassName="member-date-range-popper"
            />
          </div>
        </div>
        <div style={{ flex: "1 1 280px", border: "1px solid #dbe3ee", borderRadius: "12px", background: "#f8fafc", overflow: "hidden" }}>
          <DualRangeSlider
            label="Age Range"
            helperText="Drag both handles to narrow the visible age range."
            min={ageBounds.min}
            max={ageBounds.max}
            value={ageRange}
            onChange={(nextValue) => {
              startTransition(() => {
                setAgeRange(nextValue);
              });
            }}
            suffix=" yrs"
            className="member-age-range"
          />
        </div>
      </div>
    </>
  );

  // Loading state
  if (!isMembersLoaded) {
    return (
      <SkeletonLoader
        rows={10}
        fullPage
        label={loadProgress > 0 ? `Loading members — ${loadProgress}%` : "Loading members…"}
      />
    );
  }

  return (
    <div className="member-list-page" style={pageShellStyle}><style>{`
      @media (min-width: 768px) {
        .member-list-page {
          padding: 36px;
        }
      }
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
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
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
      <div style={{ background: "#fff", borderBottom: "1px solid #e1e5ea", padding: "21px 22px 13px" }}>
        {/* Row 1: title, Reset Filters + Export */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <h1 style={{ margin: 0, fontSize: "21px", fontWeight: 600, color: "#111827", letterSpacing: "-0.01em" }}>Members List</h1>
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 400 }}>{totalItems.toLocaleString()} Members</span>
          </div>
          <div style={{ display: "flex", gap: "7px" }}>
            <button onClick={clearFilters} style={headerButtonStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Reset Filters
            </button>
            <button onClick={handleExportXLSX} style={headerButtonStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          </div>
        </div>

        {/* Row 2: search, Filters / Group By / Favorites */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px", marginBottom: "14px" }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginLeft: "auto" }}>
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
          <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 400 }}>
            {groupBy
              ? `Grouped by ${MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}`
              : "All members"}
          </span>

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
                  style={{ height: "26px", padding: "0 4px", borderRadius: "5px", border: "1px solid #dde1e7", fontSize: "11.5px", color: "#334155", background: "#fff", cursor: "pointer" }}
                >
                  <option value="all">All</option>
                  {[100, 500, 1000, 5000].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span style={{ fontSize: "12px", color: "#111827", fontWeight: 500, whiteSpace: "nowrap", margin: "0 2px" }}>
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
              <span style={{ fontSize: "12px", color: "#111827", fontWeight: 500 }}>
                {totalItems.toLocaleString()} member{totalItems !== 1 ? "s" : ""}
              </span>
            )}

            <div style={{ display: "flex", gap: "1px", background: "#dde1e7", border: "1px solid #dde1e7", borderRadius: "5px", overflow: "hidden", marginLeft: "2px" }}>
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

      <div style={{ padding: "21px 22px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 12px" }}>
          <h2 style={{ margin: 0, fontSize: "12.5px", fontWeight: 600, color: "#111827" }}>Members Master List</h2>
          {!groupBy && viewMode === "list" && (
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 400 }}>
              {pageMembers.length.toLocaleString()} member{pageMembers.length !== 1 ? "s" : ""} on this page · Page {safeCurrentPage} of {totalPages}
              {selectedVisibleCount > 0 ? ` · ${selectedVisibleCount.toLocaleString()} selected` : ""}
            </span>
          )}
        </div>

        <div style={{ width: "100%", margin: "0", padding: "0" }} ref={kanbanContainerRef}>
          <div style={{ border: "1px solid #dde3ea", borderRadius: "5px", background: "#fff", overflow: "hidden" }}>
            {viewMode === "list" && (
              <div style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE, background: "#1976d2", position: "sticky", top: 0, zIndex: 1, alignItems: "center", height: "34px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <input
                    type="checkbox"
                    aria-label="Select all listed members"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleSelectAllVisible}
                    style={{ width: "13px", height: "13px", cursor: "pointer", accentColor: "#ffffff" }}
                  />
                </div>
                {COL_HEADERS.map((col) => (
                  <div key={col} style={{ padding: "0 10px", color: "#fff", fontWeight: 600, fontSize: "11px", letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {col}{col === "Name" ? " ↑" : ""}
                  </div>
                ))}
              </div>
            )}

            {filteredMembers.length === 0 ? (
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

            {!groupBy && viewMode === "list" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "35px", padding: "0 12px", background: "#f5f7fa", borderTop: "1px solid #e1e5ea", fontSize: "11px", color: "#6b7280" }}>
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
                                  background: checked ? "#eff6ff" : "#fff",
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
                    background: tagModalSaving ? "#90caf9" : "#1976d2",
                    color: "#fff",
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
                    background: partnerModalSaving ? "#90caf9" : "#1976d2",
                    color: "#fff",
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
            style={{ marginTop: "10px", width: "100%", padding: "6px 8px", borderRadius: "8px", border: "1px solid #1976d2", background: "#e3f2fd", color: "#1565c0", fontWeight: 700, cursor: "pointer", fontSize: "12px" }}
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
