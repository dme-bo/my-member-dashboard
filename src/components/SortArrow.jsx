// src/components/SortArrow.jsx
// Up/down arrow pair for sortable table headings (see hooks/useTableSort):
// the active direction is solid, the other faint. Drawn in currentColor.
export default function SortArrow({ active, dir }) {
  const up = active && dir === "asc" ? 1 : 0.3;
  const down = active && dir === "desc" ? 1 : 0.3;
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" style={{ marginLeft: "6px", flexShrink: 0, verticalAlign: "-1px" }}>
      <path d="M4 0L8 5H0z" fill="currentColor" opacity={up} />
      <path d="M4 12L0 7h8z" fill="currentColor" opacity={down} />
    </svg>
  );
}
