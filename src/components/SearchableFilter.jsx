// src/components/SearchableFilter.jsx
import { useState, useMemo } from "react";

export default function SearchableFilter({ label, value, options, onChange }) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(lower));
  }, [options, search]);

  const displayValue = value === "All" ? `All ${label}` : value;

  return (
    <div className="filter-group searchable">
      <label>{label}</label>
      <div className="searchable-select" onClick={() => setIsOpen(!isOpen)}>
        <div className="selected-value">{displayValue}</div>
        <span className="arrow">▼</span>
      </div>

      {isOpen && (
        <>
          <div className="searchable-dropdown">
            <input
              type="text"
              placeholder={`Search ${label}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <div className="options-list">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <div
                    key={opt}
                    className={`option ${value === opt ? "selected" : ""}`}
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch("");
                    }}
                  >
                    {opt}
                  </div>
                ))
              ) : (
                <div className="no-options">No options found</div>
              )}
            </div>
          </div>
          <div
            className="dropdown-overlay"
            onClick={() => setIsOpen(false)}
          />
        </>
      )}
    </div>
  );
}