// src/components/OdooSearchBar.jsx
// A search input that renders active filters/group-by as removable colored
// chips inline, the way Odoo's search bar shows applied facets — reused
// across any page that wires its filters through OdooViewToolbar.
import React from "react";

const CHIP_COLORS = ["#1976d2", "#7c3aed", "#0d9488", "#c2410c", "#be185d", "#4d7c0f", "#0369a1"];

const getChipColor = (index) => CHIP_COLORS[index % CHIP_COLORS.length];

export default function OdooSearchBar({ value, onChange, placeholder = "Search...", chips = [] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "6px",
        flex: 1,
        minWidth: "240px",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        padding: "7px 10px",
        background: "#fff",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      {chips.map((chip, i) => {
        const color = getChipColor(i);
        return (
          <span
            key={chip.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 4px 2px 8px",
              borderRadius: "4px",
              background: `${color}1a`,
              color,
              fontSize: "12.5px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {chip.label}
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
        style={{ flex: 1, minWidth: "80px", border: "none", outline: "none", fontSize: "13.5px", color: "#1a2332", background: "transparent" }}
      />
    </div>
  );
}
