// src/components/SelectionActionMenu.jsx
// "N selected" + Action dropdown shown once list rows are ticked. Rendered
// inside a .page-header-band's pager row, where App.css centres it.
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "./OdooViewToolbar";
import { boxedButtonStyle } from "../utils/uiStyles";

export default function SelectionActionMenu({ count, onExport, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!count) return null;

  const itemStyle = { display: "block", width: "100%", textAlign: "left", padding: "10px 20px", background: "none", border: "none", fontSize: "14px", color: "#334155", cursor: "pointer" };

  return (
    <div className="selection-action-center">
      <span style={{ fontSize: "14px", color: "#1976d2", fontWeight: 500, whiteSpace: "nowrap" }}>
        {count.toLocaleString()} selected
      </span>
      <div ref={ref} style={{ position: "relative" }}>
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={boxedButtonStyle(open)}>
          Action <ChevronDownIcon />
        </button>
        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#fff",
              border: "1px solid #dde1e7",
              borderRadius: "6px",
              boxShadow: "0 8px 24px rgba(15,23,42,0.14)",
              minWidth: "180px",
              padding: "4px 0",
              zIndex: 50,
            }}
          >
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onExport(); }} style={itemStyle}>
              Export
            </button>
            {onClear && (
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onClear(); }} style={itemStyle}>
                Clear selection
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
