// src/utils/convaiWidget.js
// Loader for the ElevenLabs Conversational AI widget (<elevenlabs-convai>).
// The script comes from a pinned version so a new upstream release can't
// change or break the app unannounced — bump it deliberately after checking
// the release notes.
export const CONVAI_AGENT_ID = "agent_3001m598z4ntea6b7t5kreyaete8";
const WIDGET_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed@0.19.0";
const SCRIPT_ID = "elevenlabs-convai-widget";

// Loaded once per session; every page that shows the widget reuses it.
let widgetScriptPromise = null;
export const loadConvaiWidget = () => {
  if (window.customElements?.get("elevenlabs-convai")) return Promise.resolve();
  if (!widgetScriptPromise) {
    widgetScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = WIDGET_SRC;
      script.async = true;
      script.type = "text/javascript";
      script.onload = () => resolve();
      script.onerror = () => {
        widgetScriptPromise = null;
        script.remove();
        reject(new Error("Failed to load the voice agent widget"));
      };
      document.body.appendChild(script);
    });
  }
  return widgetScriptPromise;
};
