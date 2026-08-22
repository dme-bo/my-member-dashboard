// Shared pulsing-bars loading indicator — the one loading UI used across
// every page and every modal in the app, instead of each page inventing its
// own spinner/text/skeleton treatment.
export default function SkeletonLoader({ rows = 4, compact = false, label, fullPage = false }) {
  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? "10px" : "14px", padding: compact ? "8px 0" : "16px 0", width: "100%", boxSizing: "border-box" }}>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
      {label && (
        <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "4px" }}>{label}</div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{
            height: compact ? "12px" : "14px",
            width: `${60 + (i % 3) * 15}%`,
            borderRadius: "6px",
            background: "#e2e8f0",
            animation: "skeletonPulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }} />
          {!compact && (
            <div style={{
              height: "10px",
              width: `${40 + (i % 4) * 10}%`,
              borderRadius: "6px",
              background: "#eef2f7",
              animation: "skeletonPulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.1 + 0.07}s`,
            }} />
          )}
        </div>
      ))}
    </div>
  );

  if (!fullPage) return content;

  return (
    <div style={{
      minHeight: "calc(100vh - 56px)",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f5f7fa",
      boxSizing: "border-box",
      padding: "24px",
    }}>
      <div style={{ width: "min(640px, 100%)" }}>{content}</div>
    </div>
  );
}
