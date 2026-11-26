import React from "react";

// Errors that come from the page's code being loaded badly (two copies of
// React after a dev-server re-optimize, or a chunk from an older deploy) rather
// than from a bug. Re-rendering can't fix these; a full page reload does.
const LOAD_ERROR = /reading 'use[A-Z]\w*'|Invalid hook call|dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i;
const RELOAD_KEY = "errorBoundaryReloadedAt";

const isLoadError = (error) => LOAD_ERROR.test(String(error?.message || error || ""));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    if (!isLoadError(error)) return;
    // Reload once on its own; if it happens again within 30s, show the message
    // instead of looping.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // storage unavailable: leave it to the Try Again button
    }
  }

  handleRetry = () => {
    if (isLoadError(this.state.error)) window.location.reload();
    else this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 56px)",
          background: "#f5f7fa",
          gap: "16px",
          padding: "24px",
        }}>
          <div style={{ fontSize: "48px", lineHeight: 1 }}>⚠️</div>
          <h2 style={{ margin: 0, color: "#1a2332", fontSize: "20px", fontWeight: 700 }}>
            Something went wrong
          </h2>
          <p style={{
            color: "#64748b",
            margin: 0,
            fontSize: "13.5px",
            maxWidth: "420px",
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            {this.state.error?.message || "An unexpected error occurred. Please try again."}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "10px 28px",
              background: "#c2d45e",
              color: "#243014",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "14px",
              marginTop: "4px",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
