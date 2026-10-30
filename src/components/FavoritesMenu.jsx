// src/components/FavoritesMenu.jsx
import React, { useState, useEffect, useRef } from "react";
import { ChevronDownIcon } from "./OdooViewToolbar";
import { boxedButtonStyle } from "../utils/uiStyles";

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
export default function FavoritesMenu({ favorites, onApply, onDelete, onSave }) {
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
              style={{ padding: "6px 12px", borderRadius: "6px", border: "none", background: "var(--accent, #c2d45e)", color: "var(--on-accent, #243014)", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
