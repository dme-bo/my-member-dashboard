// src/components/FilterSidebar.jsx
import { useState } from "react";

export default function FilterSidebar({ filterData, filterKeys, pageKey }) {
  const { filters, handleFilterChange, clearFilters, options } = filterData;

  return (
    <div className="filter-sidebar" style={{ width: "300px", padding: "20px", background: "#f8fafc", borderLeft: "1px solid #eee", height: "fit-content" }}>
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "18px", color: "#1e40af" }}>Filters</h3>
        <button
          onClick={clearFilters}
          style={{
            padding: "8px 16px",
            background: "#dc2626",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Clear All Filters
        </button>
      </div>

      {filterKeys.map((key) => (
        <SearchableSelect
          key={key}
          label={
            key === "coordinator_name"
              ? "Coordinator"
              : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")
          }
          value={filters[key] || "All"}
          options={options[key] || ["All"]}
          onChange={(value) => handleFilterChange(key, value)}
        />
      ))}
    </div>
  );
}

// Reusable Searchable Select Component
function SearchableSelect({ label, value, options, onChange }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayValue = value === "" || value === "All" ? "All" : value;

  return (
    <div style={{ marginBottom: "24px" }}>
      <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "14px", color: "#374151" }}>
        {label}
      </label>

      <div style={{ position: "relative" }}>
        {/* Selected Value / Trigger */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: "12px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "15px",
          }}
        >
          <span>{displayValue}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {/* Dropdown */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 10 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown Panel */}
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                background: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                marginTop: "6px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                zIndex: 20,
                maxHeight: "300px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Search Input */}
              <input
                type="text"
                placeholder="Type to search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #eee",
                  fontSize: "14px",
                  outline: "none",
                }}
                onClick={(e) => e.stopPropagation()}
              />

              {/* Options List */}
              <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                {filteredOptions.length === 0 ? (
                  <div style={{ padding: "12px 16px", color: "#9ca3af", fontStyle: "italic" }}>
                    No options found
                  </div>
                ) : (
                  filteredOptions.map((option) => (
                    <div
                      key={option}
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                        setSearchTerm("");
                      }}
                      style={{
                        padding: "12px 16px",
                        cursor: "pointer",
                        background: option === value ? "#eff6ff" : "transparent",
                        fontWeight: option === value ? "600" : "normal",
                        color: option === value ? "#2563eb" : "#374151",
                      }}
                      onMouseOver={(e) => (e.target.style.background = "#f3f4f6")}
                      onMouseOut={(e) => (e.target.style.background = option === value ? "#eff6ff" : "transparent")}
                    >
                      {option}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}