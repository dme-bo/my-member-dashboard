// Shared inline-style helpers.

// Bordered, fixed-height trigger button (Filters / Group By / Favorites on the
// Members list). Active = the app's blue.
export const boxedButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: "7px",
  height: "29px",
  padding: "0 11px",
  background: active ? "#e3f2fd" : "#fff",
  border: `1px solid ${active ? "#1976d2" : "#dde1e7"}`,
  borderRadius: "5px",
  color: active ? "#1565c0" : "#334155",
  fontWeight: 500,
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
});
