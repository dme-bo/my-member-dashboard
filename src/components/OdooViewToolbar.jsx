// src/components/OdooViewToolbar.jsx
// Odoo-style Filters / Group By dropdowns + a List/Kanban view switcher.
// Filters: a curated list of one-click quick toggles, plus a collapsible
// "Advanced Filters" section that embeds a page-supplied panel (so each page
// keeps its own real filter fields instead of a generic query builder).
// Group By: a curated list of one-click fields with a checkmark on the
// active one, plus a small "Add custom group" picker for parity with Odoo.
import React, { useEffect, useRef, useState } from "react";

const iconStyle = { width: "14px", height: "14px", flexShrink: 0 };

const FilterIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const GroupIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="14" y2="12" />
    <line x1="4" y1="18" x2="10" y2="18" />
  </svg>
);

const ListIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const KanbanIcon = () => (
  <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="10" y="4" width="5" height="10" rx="1" />
    <rect x="17" y="4" width="5" height="13" rx="1" />
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    style={{ transition: "transform 0.15s", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const linkButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  background: active ? "#eef2ff" : "transparent",
  border: "none",
  borderRadius: "6px",
  color: "#3b5f8a",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const viewButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  background: active ? "#ffffff" : "#eef1f4",
  border: active ? "1px solid #cbd5e1" : "1px solid transparent",
  color: active ? "#1e293b" : "#94a3b8",
  borderRadius: "6px",
  cursor: "pointer",
});

const dropdownPanelStyle = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
  minWidth: "220px",
  maxHeight: "min(70vh, 500px)",
  overflowY: "auto",
  zIndex: 50,
};

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      // A date picker (or similar widget) inside advancedContent can render
      // its popup via a portal outside this dropdown's own DOM subtree —
      // without this check, clicking a date would look like an "outside"
      // click and close the whole dropdown before the pick can register.
      if (e.target.closest && e.target.closest(".react-datepicker")) return;
      onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

function FiltersMenu({ quickFilters, advancedContent }) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const hasActiveQuick = quickFilters.some((f) => f.active);

  // Quick filters render as groups separated by dividers, mirroring Odoo's
  // layout — each `group` in the list starts a new visual section.
  const groups = [];
  let current = [];
  quickFilters.forEach((f, i) => {
    if (f.startGroup && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(f);
    if (i === quickFilters.length - 1) groups.push(current);
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={linkButtonStyle(hasActiveQuick)}>
        <FilterIcon /> Filters
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
            width: "300px",
            maxWidth: "90vw",
            maxHeight: "min(75vh, 600px)",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {groups.map((group, gi) => (
            <div key={gi} style={{ borderBottom: gi < groups.length - 1 ? "1px solid #f1f5f9" : "none", padding: "4px 0" }}>
              {group.map((f) => (
                <div
                  key={f.key}
                  onClick={() => f.onToggle()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: f.active ? 700 : 500,
                    color: f.active ? "#1976d2" : "#334155",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: "12px", display: "inline-block" }}>{f.active ? "✓" : ""}</span>
                  {f.label}
                </div>
              ))}
            </div>
          ))}

          {advancedContent && (
            <div style={{ borderTop: "1px solid #e5e7eb" }}>
              <div
                onClick={() => setAdvancedOpen((v) => !v)}
                style={{
                  position: "sticky",
                  top: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 14px",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "#475569",
                  cursor: "pointer",
                  background: "#f8fafc",
                  zIndex: 1,
                }}
              >
                <ChevronIcon open={advancedOpen} /> Advanced Filters
              </div>
              {advancedOpen && <div style={{ padding: "12px 14px" }}>{advancedContent}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupByMenu({ groupByOptions, groupBy, onGroupByChange }) {
  const [open, setOpen] = useState(false);
  const [customField, setCustomField] = useState(groupByOptions[0]?.key || "");
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={linkButtonStyle(!!groupBy)}>
        <GroupIcon /> Group By
      </button>
      {open && (
        <div style={dropdownPanelStyle}>
          <div style={{ padding: "4px 0" }}>
            {groupByOptions.map((opt) => {
              const active = groupBy === opt.key;
              return (
                <div
                  key={opt.key}
                  onClick={() => {
                    onGroupByChange(active ? null : opt.key);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    fontWeight: active ? 700 : 500,
                    color: active ? "#1976d2" : "#334155",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: "12px", display: "inline-block" }}>{active ? "✓" : ""}</span>
                  {opt.label}
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #e5e7eb", padding: "10px 14px" }}>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>Add custom group</div>
            <select
              value={customField}
              onChange={(e) => setCustomField(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", marginBottom: "8px" }}
            >
              {groupByOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { onGroupByChange(customField); setOpen(false); }}
              style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#1976d2", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OdooViewToolbar({
  quickFilters = [],
  advancedContent,
  groupByOptions = [],
  groupBy,
  onGroupByChange,
  view,
  onViewChange,
  showViewToggle = true,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
      <FiltersMenu quickFilters={quickFilters} advancedContent={advancedContent} />

      {groupByOptions.length > 0 && (
        <GroupByMenu groupByOptions={groupByOptions} groupBy={groupBy} onGroupByChange={onGroupByChange} />
      )}

      {showViewToggle && (
        <>
          <div style={{ width: "1px", height: "20px", background: "#e2e8f0", margin: "0 8px" }} />

          <button type="button" onClick={() => onViewChange("list")} title="List view" style={viewButtonStyle(view === "list")}>
            <ListIcon />
          </button>
          <button type="button" onClick={() => onViewChange("kanban")} title="Kanban view" style={viewButtonStyle(view === "kanban")}>
            <KanbanIcon />
          </button>
        </>
      )}
    </div>
  );
}
