// src/components/TableLoadingSpinner.jsx
// Spinner shown where a list page's table will appear, while its data loads.
// The page's header band (title, search, Filters / Group By / Favorites, pager)
// renders straight away; only the table area waits.
export default function TableLoadingSpinner({ label = "Loading…" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: "1 1 auto",
        minHeight: "240px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        background: "#fff",
        color: "#64748b",
        fontSize: "13px",
      }}
    >
      <style>{`@keyframes table-loading-spin { to { transform: rotate(360deg); } }`}</style>
      <span
        aria-hidden="true"
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: "3px solid #dbe7f5",
          borderTopColor: "#1976d2",
          animation: "table-loading-spin 0.8s linear infinite",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
