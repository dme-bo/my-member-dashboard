// src/components/useConfirm.jsx
// In-app replacement for window.confirm: a dialog centred on the screen.
//
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title, message, confirmLabel, danger }))) return;
//   ...
//   return <>{...}{confirmDialog}</>;
import { useCallback, useEffect, useRef, useState } from "react";

export default function useConfirm() {
  const [request, setRequest] = useState(null); // { title, message, confirmLabel, cancelLabel, danger, resolve }
  const confirmButton = useRef(null);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setRequest({ ...(typeof options === "string" ? { message: options } : options), resolve })),
    []
  );

  const close = useCallback(
    (answer) => {
      setRequest((current) => {
        current?.resolve(answer);
        return null;
      });
    },
    []
  );

  useEffect(() => {
    if (!request) return undefined;
    confirmButton.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [request, close]);

  // Never leave a caller waiting if the component unmounts with the dialog open.
  useEffect(() => () => setRequest((current) => (current?.resolve(false), null)), []);

  const dialog = request ? (
    <div
      className="cfm-overlay"
      onClick={(event) => {
        // Don't let the click reach an outer modal's "click outside to close".
        event.stopPropagation();
        close(false);
      }}
    >
      <style>{`
        .cfm-overlay { position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,0.45); }
        .cfm-box { width: min(420px, 100%); background: #fff; border-radius: 12px; box-shadow: 0 24px 60px rgba(15,23,42,0.35); padding: 22px 24px 18px; font-family: inherit; }
        .cfm-box h3 { margin: 0 0 8px; font-size: 17px; color: #0f172a; }
        .cfm-box p { margin: 0; font-size: 14px; line-height: 1.55; color: #475569; white-space: pre-line; }
        .cfm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .cfm-btn { height: 36px; padding: 0 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-weight: 600; font-size: 13px; cursor: pointer; }
        .cfm-btn.primary { background: #c2d45e; border-color: #c2d45e; color: #243014; }
        .cfm-btn.danger { background: #b91c1c; border-color: #b91c1c; color: #fff; }
        .cfm-btn:focus-visible { outline: 2px solid #1976d2; outline-offset: 2px; }
      `}</style>
      <div
        className="cfm-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cfm-title"
        aria-describedby="cfm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="cfm-title">{request.title || "Are you sure?"}</h3>
        {request.message && <p id="cfm-message">{request.message}</p>}
        <div className="cfm-actions">
          <button type="button" className="cfm-btn" onClick={() => close(false)}>
            {request.cancelLabel || "Cancel"}
          </button>
          <button type="button" ref={confirmButton} className={`cfm-btn ${request.danger ? "danger" : "primary"}`} onClick={() => close(true)}>
            {request.confirmLabel || "OK"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, dialog];
}
