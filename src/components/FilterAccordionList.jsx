// src/components/FilterAccordionList.jsx
// A single vertical accordion of filter categories — each category is a
// clickable row with a chevron that expands to show its options as plain
// clickable rows, replacing a grid of separate dropdown boxes. Same data
// contract as MultiSelectDropdown (options/selected/onChange) so it drops
// in wherever that did.
import React, { useState } from "react";

function ChevronIcon({ open }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function AccordionSection({ label, options, selected, onChange, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);

  const toggleOption = (option) => {
    if (selected.includes(option)) onChange(selected.filter((o) => o !== option));
    else onChange([...selected, option]);
  };

  return (
    <div style={{ borderBottom: "1px solid #eef2f6" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 4px",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "13.5px",
          color: "#0f172a",
        }}
      >
        <span>
          {label}
          {selected.length > 0 && (
            <span style={{ marginLeft: "6px", fontWeight: 600, fontSize: "12px", color: "#1976d2" }}>({selected.length})</span>
          )}
        </span>
        <ChevronIcon open={open} />
      </div>
      {open && (
        <div style={{ paddingBottom: "6px" }}>
          {options.length === 0 ? (
            <div style={{ padding: "6px 12px", fontSize: "12.5px", color: "#94a3b8", fontStyle: "italic" }}>No options</div>
          ) : (
            options.map((option) => {
              const active = selected.includes(option);
              return (
                <div
                  key={option}
                  onClick={() => toggleOption(option)}
                  style={{
                    padding: "7px 12px 7px 22px",
                    fontSize: "13px",
                    color: active ? "#1976d2" : "#0f766e",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ width: "12px", display: "inline-block", fontSize: "11px" }}>{active ? "✓" : ""}</span>
                  {option}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterAccordionList({ sections }) {
  return (
    <div style={{ border: "1px solid #eef2f6", borderRadius: "8px" }}>
      {sections.map((section) => (
        <AccordionSection key={section.key} {...section} />
      ))}
    </div>
  );
}
