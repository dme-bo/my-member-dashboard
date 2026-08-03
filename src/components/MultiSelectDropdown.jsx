// src/components/MultiSelectDropdown.jsx
import { useEffect, useMemo, useRef, useState } from 'react';

// Searchable, checkbox-based multi-select. `selected = []` means "All" (no filter applied).
export default function MultiSelectDropdown({
  label,
  options = [],
  selected = [],
  onChange,
  placeholder = 'All',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const q = searchTerm.toLowerCase();
    return options.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [options, searchTerm]);

  const toggleOption = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter((o) => o !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const selectAll = () => onChange([]);

  const displayText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className={`msd-root ${className}`} ref={rootRef}>
      <label>{label}</label>
      <div className="msd-control">
        <button
          type="button"
          className="msd-trigger"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className={`msd-trigger-text${selected.length ? ' has-value' : ''}`}>
            {displayText}
          </span>
          <svg
            className="msd-chevron"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {isOpen && (
          <div className="msd-panel">
            <input
              type="text"
              className="msd-search"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            <div className="msd-options">
              <label className="msd-option msd-option-all">
                <input
                  type="checkbox"
                  checked={selected.length === 0}
                  onChange={selectAll}
                />
                <span>All</span>
              </label>

              {filteredOptions.length === 0 ? (
                <div className="msd-empty">No options found</div>
              ) : (
                filteredOptions.map((option) => (
                  <label key={option} className="msd-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(option)}
                      onChange={() => toggleOption(option)}
                    />
                    <span>{option}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .msd-root {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          position: relative;
        }

        .msd-root > label {
          font-weight: 700;
          font-size: 0.82rem;
          color: #334155;
          letter-spacing: 0.02em;
        }

        .msd-control {
          position: relative;
        }

        .msd-trigger {
          width: 100%;
          min-height: 46px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid #cbd5e1;
          font-size: 0.95rem;
          background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          color: #0f172a;
          outline: none;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }

        .msd-trigger:hover {
          border-color: #94a3b8;
        }

        .msd-trigger:focus {
          border-color: #1976d2;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.12);
        }

        .msd-trigger-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #64748b;
        }

        .msd-trigger-text.has-value {
          color: #0f172a;
          font-weight: 600;
        }

        .msd-chevron {
          flex-shrink: 0;
          color: #64748b;
          transition: transform 0.18s ease;
        }

        .msd-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.14);
          z-index: 30;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          max-height: 320px;
        }

        .msd-search {
          padding: 10px 14px;
          border: none;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.9rem;
          outline: none;
          font-family: inherit;
        }

        .msd-options {
          overflow-y: auto;
          max-height: 260px;
          padding: 4px 0;
        }

        .msd-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 14px;
          font-size: 0.9rem;
          color: #334155;
          cursor: pointer;
        }

        .msd-option:hover {
          background: #f1f5f9;
        }

        .msd-option input[type="checkbox"] {
          accent-color: #1976d2;
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          cursor: pointer;
        }

        .msd-option span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .msd-option-all {
          border-bottom: 1px solid #eef2f6;
          font-weight: 600;
        }

        .msd-empty {
          padding: 10px 14px;
          color: #94a3b8;
          font-style: italic;
          font-size: 0.88rem;
        }
      `}</style>
    </div>
  );
}
