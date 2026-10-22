// src/pages/VoiceAgentPage.jsx
// Dedicated page for the ElevenLabs voice agent. The widget itself (and its
// pinned script) lives in components/VoiceAgentWidget + utils/convaiWidget,
// shared with the Dashboard.
import { useState } from "react";
import TableLoadingSpinner from "../components/TableLoadingSpinner";
import VoiceAgentWidget from "../components/VoiceAgentWidget";

export default function VoiceAgentPage() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="voice-agent-page page-fill">
      <style>{`
        .voice-agent-page { background: #fff; color: #212529; }
        .va-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .va-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
        .va-title h1 { margin: 0; }
        .va-title span { font-size: 14px; color: #64748b; }
        .va-body { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 32px; background: #f5f7fa; border-top: 1px solid #dde1e7; }
        .va-card { max-width: 520px; text-align: center; color: #475569; font-size: 14px; line-height: 1.6; }
        .va-card h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #111827; }
        .va-error { color: #b91c1c; }
        .va-retry { margin-top: 12px; height: 34px; padding: 0 14px; border: 1px solid #dde1e7; border-radius: 6px; background: #fff; color: #334155; font: inherit; font-size: 13px; cursor: pointer; }
      `}</style>

      {/* Header band: same three rows as the other pages (title, info, spacer). */}
      <div className="page-header-band">
        <div className="va-title-row">
          <div className="va-title">
            <h1>Voice Agent</h1>
            <span>Talk to the Brisk Olive assistant</span>
          </div>
        </div>
        <div />
        <div />
      </div>

      <div className="va-body">
        {status === "loading" && <TableLoadingSpinner label="Loading voice agent…" />}
        {status === "error" && (
          <div className="va-card" role="alert">
            <h2 className="va-error">The voice agent couldn't load</h2>
            <p>Check your internet connection, or whether a browser extension is blocking unpkg.com.</p>
            <button type="button" className="va-retry" onClick={() => { setStatus("loading"); setAttempt((n) => n + 1); }}>
              Try again
            </button>
          </div>
        )}
        {status === "ready" && (
          <div className="va-card">
            <h2>Start a conversation</h2>
            <p>Use the voice agent button at the bottom-right of the page. Your browser will ask for microphone access the first time.</p>
          </div>
        )}
      </div>

      {/* key: "Try again" remounts it, which retries the script load. */}
      <VoiceAgentWidget key={attempt} onStatusChange={setStatus} />
    </div>
  );
}
