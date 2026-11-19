// src/components/OdooSearchBar.jsx
// A search input that renders active filters/group-by as removable colored
// chips inline, the way Odoo's search bar shows applied facets — reused
// across any page that wires its filters through OdooViewToolbar.
import React from "react";

// Filter facets are blue with a funnel; group-by facets are purple with a lines icon.
const CHIP_STYLES = {
  filter: { color: "#1565c0", background: "#e3f0fc" },
  group: { color: "#5b34b0", background: "#ece6fa" },
};

const isGroupChip = (chip) => /^group/i.test(String(chip.key));

const FunnelIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const GroupLinesIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M4 6h16M4 12h12M4 18h8" />
  </svg>
);

export default function OdooSearchBar({ value, onChange, placeholder = "Search...", chips = [], variant = "default" }) {
  // "boxed": the compact fixed-height field used on the Members list.
  const boxed = variant === "boxed";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px",
        flex: 1,
        minWidth: "240px",
        border: boxed ? "1px solid #dde1e7" : "1px solid #e2e8f0",
        borderRadius: boxed ? "6px" : "8px",
        padding: boxed ? "0 11px" : "7px 10px",
        minHeight: boxed ? "34px" : undefined,
        boxSizing: "border-box",
        background: "#fff",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      {chips.map((chip) => {
        const group = isGroupChip(chip);
        const { color, background } = CHIP_STYLES[group ? "group" : "filter"];
        const label = group ? String(chip.label).replace(/^Group:\s*/i, "") : chip.label;
        return (
          <span
            key={chip.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 6px 3px 9px",
              borderRadius: "999px",
              background,
              color,
              fontSize: "12.5px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {group ? <GroupLinesIcon /> : <FunnelIcon />}
            {label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Remove ${chip.label}`}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontSize: "13px", lineHeight: 1, padding: "0 2px" }}
            >
              ×
            </button>
          </span>
        );
      })}
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={chips.length ? "" : placeholder}
        style={{ flex: 1, minWidth: "80px", border: "none", outline: "none", fontSize: boxed ? "13px" : "13.5px", color: "#1a2332", background: "transparent" }}
      />
    </div>
  );
}
