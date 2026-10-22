// src/components/VoiceAgentWidget.jsx
// Drops the ElevenLabs voice agent's floating "Start a call" button onto
// the current page. It renders nothing until the widget script has loaded,
// and disappears again when the page unmounts.
import { useEffect, useState } from "react";
import { CONVAI_AGENT_ID, loadConvaiWidget } from "../utils/convaiWidget";

export default function VoiceAgentWidget({ onStatusChange }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadConvaiWidget()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        onStatusChange?.("ready");
      })
      .catch(() => {
        if (!cancelled) onStatusChange?.("error");
      });
    return () => { cancelled = true; };
    // onStatusChange is a caller callback; reloading on its identity isn't wanted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready ? <elevenlabs-convai agent-id={CONVAI_AGENT_ID}></elevenlabs-convai> : null;
}
