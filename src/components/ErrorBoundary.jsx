import React from "react";

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
  }

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
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "10px 28px",
              background: "#1976d2",
              color: "#fff",
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
