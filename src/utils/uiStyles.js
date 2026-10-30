// Shared inline-style helpers.

// Bordered, fixed-height trigger button (Filters / Group By / Favorites on the
// Members list). Active = the app's blue.
export const boxedButtonStyle = (active) => ({
  display: "flex",
  alignItems: "center",
  gap: "7px",
  height: "34px",
  padding: "0 11px",
  background: active ? "#f1f6d6" : "#fff",
  border: `1px solid ${active ? "#c2d45e" : "#dde1e7"}`,
  borderRadius: "6px",
  color: active ? "#aabd3f" : "#334155",
  fontWeight: 400,
  fontSize: "13px",
  cursor: "pointer",
  whiteSpace: "nowrap",
});
