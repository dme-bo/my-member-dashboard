import Slider from "@mui/material/Slider";

export default function DualRangeSlider({
  label,
  helperText,
  min,
  max,
  value,
  onChange,
  step = 1,
  suffix = "",
  className = "",
}) {
  const [lowerValue, upperValue] = value;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin + 1;

  return (
    <div
      className={`dual-range-slider ${className}`.trim()}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
        minWidth: 0,
        padding: "14px 18px 16px",
        background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        borderRadius: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
       <label style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{label}</label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: "#eef2ff",
              color: "#4338ca",
              fontSize: "12px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Min {lowerValue}{suffix}
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: "999px",
              background: "#ecfeff",
              color: "#0f766e",
              fontSize: "12px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            Max {upperValue}{suffix}
          </span>
        </div>
      </div>
      {helperText ? (
        <div style={{ fontSize: "12px", color: "#64748b" }}>{helperText}</div>
      ) : null}

      <div style={{ padding: "0 2px" }}>
        <Slider
          value={[lowerValue, upperValue]}
          min={safeMin}
          max={safeMax}
          step={step}
          onChange={(_, nextValue) => onChange(nextValue)}
          valueLabelDisplay="auto"
          disableSwap
          marks={[
            { value: safeMin, label: `${safeMin}${suffix}` },
            { value: safeMax, label: `${safeMax}${suffix}` },
          ]}
          sx={{
            color: "#2563eb",
            height: 8,
            "& .MuiSlider-rail": {
              opacity: 1,
              backgroundColor: "#e5e7eb",
            },
            "& .MuiSlider-track": {
              border: "none",
              background: "linear-gradient(90deg, #10b981 0%, #2563eb 100%)",
            },
            "& .MuiSlider-thumb": {
              height: 20,
              width: 20,
              backgroundColor: "#fff",
              border: "2px solid #2563eb",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.18)",
              "&:focus, &:hover, &.Mui-active": {
                boxShadow: "0 0 0 8px rgba(37, 99, 235, 0.15)",
              },
            },
            "& .MuiSlider-mark": {
              display: "none",
            },
            "& .MuiSlider-markLabel": {
              color: "#64748b",
              fontSize: "11px",
              top: 24,
            },
            "& .MuiSlider-valueLabel": {
              backgroundColor: "#111827",
              borderRadius: "8px",
              fontSize: "11px",
            },
          }}
        />
      </div>
    </div>
  );
}
