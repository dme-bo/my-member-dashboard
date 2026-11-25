// src/components/ManualReminderCard.jsx
// "Send a reminder now" card in the workshop Reminders tab: type a subject and
// message, pick who gets it, and email it right away via /api/send-workshop-message.
import { useState } from "react";
import { FaPaperPlane } from "react-icons/fa";
import { formatDateTimeDDMMMYYYY } from "../utils/dateFormat";

const AUDIENCES = [
  { value: "all", label: "Everyone registered", match: () => true },
  { value: "present", label: "Only trainees marked present", match: (r) => r.mark?.status === "present" },
  { value: "notPresent", label: "Trainees not marked present", match: (r) => r.mark?.status !== "present" },
];
const PLACEHOLDERS = ["{topic}", "{date}", "{time}", "{link}"];
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES.map((a) => [a.value, a.label]));

const emptyForm = () => ({
  subject: "Reminder: {topic}",
  message: "Hello,\n\nThis is a reminder about our workshop on {topic}.\n\nDate: {date}\nTime: {time}\nWorkshop Link: {link}",
  audience: "all",
});

export default function ManualReminderCard({ session, rows, confirm }) {
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { type, text }
  const [focused, setFocused] = useState("message");

  const audience = AUDIENCES.find((a) => a.value === form.audience) || AUDIENCES[0];
  const matching = rows.filter(audience.match);
  const withEmail = matching.filter((r) => r.email).length;
  const history = [...(session.manualReminders || [])].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 5);

  const insert = (placeholder) => setForm((f) => ({ ...f, [focused]: `${f[focused]}${placeholder}` }));

  const send = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      setResult({ type: "error", text: "Enter a subject and a message." });
      return;
    }
    const ok = await confirm({
      title: "Send this reminder?",
      message: `It will be emailed now to ${audience.label.toLowerCase()} (${withEmail} with an email address).`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/send-workshop-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, ...form }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to send the reminder.");
      const parts = [`Sent to ${data.sent || 0}`];
      if (data.noEmail) parts.push(`${data.noEmail} without an email address`);
      if (data.failed) parts.push(`${data.failed} failed`);
      setResult({ type: data.failed ? "error" : "success", text: data.message || parts.join(" · ") });
      if (!data.failed) setForm(emptyForm());
    } catch (error) {
      setResult({ type: "error", text: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="wsd-card">
      <style>{`
        .mrc-grid { display: grid; gap: 10px; }
        .mrc-input { width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 13px; }
        .mrc-tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; color: #64748b; }
        .mrc-tag { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 999px; padding: 2px 10px; font-size: 12px; cursor: pointer; color: #334155; font-family: monospace; }
        .mrc-tag:hover { background: #f1f6d6; }
        .mrc-history { margin-top: 14px; border-top: 1px solid #eef1f5; padding-top: 10px; font-size: 12px; color: #64748b; }
        .mrc-history div { padding: 3px 0; }
      `}</style>
      <h4>Send a reminder now</h4>
      <p>Write your own message and email it straight away. "Best Regards, Brisk Olive Team" is added at the end.</p>

      <div className="mrc-grid">
        <div className="wsd-field">
          <label htmlFor="mrc-subject">Subject</label>
          <input id="mrc-subject" className="mrc-input" value={form.subject} maxLength={200} onFocus={() => setFocused("subject")} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
        </div>
        <div className="wsd-field">
          <label htmlFor="mrc-message">Message</label>
          <textarea id="mrc-message" className="mrc-input" rows={7} maxLength={5000} value={form.message} onFocus={() => setFocused("message")} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
        </div>
        <div className="mrc-tags">
          Insert:
          {PLACEHOLDERS.map((p) => (
            <button key={p} type="button" className="mrc-tag" onClick={() => insert(p)} title={`Adds the workshop's ${p.slice(1, -1)}`}>{p}</button>
          ))}
          <span>— filled in with this workshop's details</span>
        </div>
        <div className="wsd-field">
          <label htmlFor="mrc-audience">Send to</label>
          <select id="mrc-audience" className="mrc-input" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>{a.label} ({rows.filter(a.match).length})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="wsd-actions" style={{ marginTop: 12, alignItems: "center" }}>
        <button type="button" className="wsd-btn primary" onClick={send} disabled={sending || withEmail === 0}>
          <FaPaperPlane size={12} /> {sending ? "Sending…" : "Send reminder"}
        </button>
        <span style={{ fontSize: 12, color: "#64748b" }}>
          {withEmail === 0 ? "No one in this group has an email address." : `${withEmail} of ${matching.length} have an email address.`}
        </span>
      </div>
      {result && <div className={`wsd-result ${result.type}`} role="status">{result.text}</div>}

      {history.length > 0 && (
        <div className="mrc-history">
          <b>Recently sent</b>
          {history.map((h, i) => (
            <div key={`${h.sentAt}-${i}`}>
              {formatDateTimeDDMMMYYYY(h.sentAt)} · "{h.subject}" · {AUDIENCE_LABEL[h.audience] || h.audience} · sent to {h.sent}
              {h.failed ? `, ${h.failed} failed` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
