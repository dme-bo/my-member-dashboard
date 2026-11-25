// src/components/WorkshopDetailModal.jsx
// Everything for one workshop in a single large modal: overview + manual
// completion, trainees with attendance, reminders (the workshop emails) and
// trainer feedback.
//
// Workshop emails: the day-before and 15-minute reminders and the thank-you are
// sent automatically by the /api/send-workshop-reminders cron (this modal only
// switches them on/off); the feedback email is sent from here via
// /api/send-workshop-feedback. Persistence goes through `onPatch(sessionId, patch)`.
import { useMemo, useState } from "react";
import { FaTimes, FaPlus, FaCheckCircle, FaUserCheck, FaLink, FaCheck } from "react-icons/fa";
import { getMemberName, getMemberPhone, getMemberEmail, getMemberCity } from "../utils/memberFields";
import { formatDateDDMMMYYYY, formatDateTimeDDMMMYYYY } from "../utils/dateFormat";
import WorkshopDocumentsTab from "./WorkshopDocumentsTab";
import useConfirm from "./useConfirm";
import TraineeFeedbackTab from "./TraineeFeedbackTab";
import ManualReminderCard from "./ManualReminderCard";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trainees", label: "Trainees & Attendance" },
  { id: "communication", label: "Reminders" },
  { id: "documents", label: "Documents" },
  { id: "traineeFeedback", label: "Trainee Feedback" },
  { id: "feedback", label: "Trainer Feedback" },
];

const REMINDERS = [
  {
    key: "dayBefore",
    label: "1 day before the workshop",
    subject: "Reminder: Workshop Tomorrow!",
    describe: (d, t) => (d ? `${formatDateDDMMMYYYY(shiftDays(d, -1))} at ${t || "10:00"}` : "Needs a workshop date"),
  },
  {
    key: "fifteenMin",
    label: "15 minutes before the session",
    subject: "📢 Reminder: Workshop Starts in 15 Minutes!",
    describe: (d, t) => (d && t ? `${formatDateDDMMMYYYY(d)} at ${shiftMinutes(t, -15)}` : "Needs a workshop date and time"),
  },
];

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMinutes(timeStr, minutes) {
  const match = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/.exec(timeStr || "");
  if (!match) return timeStr;
  let hours = Number(match[1]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const total = (((hours * 60 + Number(match[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Public pages in the member app where trainees mark attendance / give feedback.
const MEMBER_APP_BASE = "https://briskoliveresourcemangement.web.app";
const attendanceLink = (workshopId) => `${MEMBER_APP_BASE}/attend/${workshopId}`;
const workshopFeedbackLink = (workshopId) => `${MEMBER_APP_BASE}/feedback/${workshopId}`;

const cleanTime =(time) => (time && time !== "-" ? time : "");

export default function WorkshopDetailModal({ session, completed, members, registered = [], presentIds = [], initialTab = "overview", onClose, onPatch, onEditDetails, onEmailTeam, onDocumentAdded, sendingTeamEmail = false }) {
  const [tab, setTab] = useState(initialTab);
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [feedbackLink, setFeedbackLink] = useState(
    session.feedbackLink || session.emailLog?.feedback?.link || (session.workshopId ? workshopFeedbackLink(session.workshopId) : "")
  );
  const [copied, setCopied] = useState(""); // "attendance" | "feedback" | ""

  const copyLink = async (which, link) => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API unavailable (e.g. not https): fall back to a hidden textarea.
      const area = document.createElement("textarea");
      area.value = link;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(which);
    setTimeout(() => setCopied((current) => (current === which ? "" : current)), 2000);
  };
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState(null); // { type, text }
  const [feedback, setFeedback] = useState({
    rating: session.trainerFeedback?.rating || 0,
    summary: session.trainerFeedback?.summary || "",
    wentWell: session.trainerFeedback?.wentWell || "",
    improvements: session.trainerFeedback?.improvements || "",
    futureNotes: session.trainerFeedback?.futureNotes || "",
  });

  const trainees = useMemo(() => {
    const saved = (session.attendees || []).map((t) => (typeof t === "string" ? { id: t, name: t } : t));
    const have = new Set(saved.map((t) => t.id));
    const removed = new Set(session.removedTraineeIds || []);
    return [...saved, ...registered.filter((person) => !have.has(person.id) && !removed.has(person.id))];
  }, [session.attendees, session.removedTraineeIds, registered]);
  const attendance = session.attendance || {};
  const presentSet = useMemo(() => new Set(presentIds), [presentIds]);
  const markFor = (traineeId) =>
    attendance[traineeId] || (presentSet.has(traineeId) ? { status: "present", source: "auto" } : null);
  const reminders = session.reminders || {};
  const documents = session.documents || [];

  const memberById = useMemo(() => {
    const map = new Map();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  // Name / email / phone / city per trainee — the stored trainee record first,
  // then the live member record for anything it is missing (email and city are
  // not saved on older sessions).
  const rows = useMemo(
    () =>
      trainees.map((trainee) => {
        const member = memberById.get(trainee.id);
        return {
          id: trainee.id,
          name: trainee.name || (member ? getMemberName(member) : "Unknown"),
          email: trainee.email || (member ? getMemberEmail(member) : "") || "",
          phone: trainee.phone || (member ? getMemberPhone(member) : "") || "",
          city: trainee.city || (member ? getMemberCity(member) : "") || "",
          mark: markFor(trainee.id),
          confirmed: (session.whatsappConfirmedIds || []).includes(trainee.id),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trainees, memberById, attendance, presentSet, session.whatsappConfirmedIds]
  );

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    rows.forEach((row) => {
      if (row.mark?.status === "present") present += 1;
      else if (row.mark?.status === "absent") absent += 1;
    });
    return { present, absent, unmarked: rows.length - present - absent };
  }, [rows]);

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const taken = new Set(trainees.map((t) => t.id));
    return members
      .filter((m) => !taken.has(m.id))
      .filter((m) => getMemberName(m).toLowerCase().includes(term) || getMemberPhone(m).toLowerCase().includes(term))
      .slice(0, 8);
  }, [search, members, trainees]);

  const patch = async (fields) => {
    setBusy(true);
    try {
      await onPatch(session.id, fields);
    } finally {
      setBusy(false);
    }
  };

  const markAttendance = (traineeId, status) => {
    const existing = markFor(traineeId);
    // Marked present by the attendance collection: Present is already true, and
    // only an explicit Absent can override it.
    if (existing?.source === "auto" && status === "present") return undefined;
    const current = existing?.status;
    const next = { ...attendance };
    if (current === status) delete next[traineeId];
    else next[traineeId] = { status, source: "manual", markedAt: new Date().toISOString() };
    return patch({ attendance: next });
  };

  const markAllPresent = () => {
    const next = { ...attendance };
    rows.forEach((row) => {
      if (!row.mark) next[row.id] = { status: "present", source: "manual", markedAt: new Date().toISOString() };
    });
    return patch({ attendance: next });
  };

  const addTrainee = (member) => {
    setSearch("");
    return patch({
      attendees: [
        ...trainees,
        { id: member.id, name: getMemberName(member), phone: getMemberPhone(member), email: getMemberEmail(member), city: getMemberCity(member) },
      ],
    });
  };

  const removeTrainee = (traineeId) => {
    const next = { ...attendance };
    delete next[traineeId];
    return patch({
      attendees: trainees.filter((t) => t.id !== traineeId),
      attendance: next,
      // so a registered person who was removed does not reappear from the registrations
      removedTraineeIds: [...new Set([...(session.removedTraineeIds || []), traineeId])],
    });
  };

  const toggleCompleted = async () => {
    if (
      !completed &&
      !(await confirm({
        title: "Mark as completed?",
        message: "This workshop will move to Completed Workshops, and the thank-you email will go to trainees marked present.",
        confirmLabel: "Mark as completed",
      }))
    ) return;
    return patch(
      completed ? { completed: false, completedAt: null } : { completed: true, completedAt: new Date().toISOString() }
    );
  };

  // Workshop emails are on unless switched off.
  const reminderOn = (key) => reminders[key]?.enabled !== false;
  const toggleReminder = (key) =>
    patch({ reminders: { ...reminders, [key]: { ...(reminders[key] || {}), enabled: !reminderOn(key) } } });

  const emailLog = session.emailLog || {};
  const sentNote = (kind) => {
    const entry = emailLog[kind];
    const count = entry?.sentIds?.length || 0;
    return count ? `Sent to ${count}${entry.lastSentAt ? ` · last ${formatDateTimeDDMMMYYYY(entry.lastSentAt)}` : ""}` : "";
  };

  const sendFeedback = async (resendAll = false) => {
    const link = feedbackLink.trim();
    if (!/^https?:\/\/\S+$/i.test(link)) {
      setFeedbackResult({ type: "error", text: "Enter the feedback form link, starting with http:// or https://" });
      return;
    }
    const presentWithEmail = rows.filter((r) => r.mark?.status === "present" && r.email).length;
    const ok = await confirm({
      title: resendAll ? "Send feedback email again?" : "Send feedback email?",
      message: resendAll
        ? `It will go to all ${presentWithEmail} trainees marked present, including those who already got it.`
        : `It will go to the trainees marked present (${presentWithEmail} with an email address).`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    setFeedbackSending(true);
    setFeedbackResult(null);
    try {
      const response = await fetch("/api/send-workshop-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, link, resendAll }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to send the feedback email.");
      const parts = [`Sent to ${data.sent || 0}`];
      if (data.noEmail) parts.push(`${data.noEmail} without an email address`);
      if (data.failed) parts.push(`${data.failed} failed`);
      setFeedbackResult({ type: data.failed ? "error" : "success", text: data.message || parts.join(" · ") });
    } catch (error) {
      setFeedbackResult({ type: "error", text: error.message });
    } finally {
      setFeedbackSending(false);
    }
  };

  const saveFeedback = () =>
    patch({ trainerFeedback: { ...feedback, summary: feedback.summary.trim(), wentWell: feedback.wentWell.trim(), improvements: feedback.improvements.trim(), futureNotes: feedback.futureNotes.trim(), savedAt: new Date().toISOString() } });

  const time = cleanTime(session.time);

  return (
    <div className="wsd-overlay" onClick={onClose}>
      <style>{`
        .wsd-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: flex; align-items: center; justify-content: center; z-index: 2500; padding: 20px; }
        .wsd-panel { width: min(1180px, 100%); height: min(88vh, 900px); background: #fff; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(15,23,42,0.35); }
        .wsd-head { display: flex; align-items: flex-start; gap: 16px; padding: 18px 24px; border-bottom: 1px solid #e5eaf1; }
        .wsd-head h2 { margin: 0; font-size: 20px; color: #0f172a; }
        .wsd-sub { margin-top: 4px; font-size: 13px; color: #64748b; }
        .wsd-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-left: 10px; vertical-align: middle; }
        .wsd-badge.upcoming { background: #fff4e5; color: #b45309; }
        .wsd-badge.completed { background: #dcfce7; color: #15803d; }
        .wsd-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .wsd-btn.copied { border-color: #15803d; color: #15803d; }
        .wsd-close { border: none; background: none; cursor: pointer; color: #64748b; font-size: 18px; padding: 4px; }
        .wsd-tabs { display: flex; gap: 4px; padding: 0 24px; border-bottom: 1px solid #e5eaf1; background: #f8fafc; }
        .wsd-tab { border: none; background: none; padding: 12px 16px; font-size: 14px; font-weight: 600; color: #475569; cursor: pointer; border-bottom: 3px solid transparent; }
        .wsd-tab.active { color: #5f6f14; border-bottom-color: #c2d45e; }
        .wsd-body { flex: 1; overflow-y: auto; padding: 22px 24px; }
        .wsd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px 24px; }
        .wsd-field label { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.03em; }
        .wsd-field div { font-size: 14px; color: #0f172a; word-break: break-word; }
        .wsd-card { border: 1px solid #e5eaf1; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
        .wsd-card h4 { margin: 0 0 4px; font-size: 15px; color: #0f172a; }
        .wsd-card p { margin: 0 0 12px; font-size: 13px; color: #64748b; }
        .wsd-btn { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; font-weight: 600; font-size: 13px; cursor: pointer; }
        .wsd-btn.primary { background: #c2d45e; border-color: #c2d45e; color: #243014; }
        .wsd-btn.success { background: #15803d; border-color: #15803d; color: #fff; }
        .wsd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .wsd-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
        .wsd-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
        .wsd-stat { padding: 8px 14px; border-radius: 8px; background: #f1f5f9; font-size: 13px; color: #334155; }
        .wsd-stat b { font-size: 16px; margin-right: 5px; color: #0f172a; }
        .wsd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .wsd-table th { background: #c2d45e; color: #243014; text-align: left; padding: 9px 12px; font-weight: 600; white-space: nowrap; }
        .wsd-table td { padding: 9px 12px; border-bottom: 1px solid #eef1f5; color: #334155; vertical-align: middle; }
        .wsd-seg { display: inline-flex; border: 1px solid #cbd5e1; border-radius: 7px; overflow: hidden; }
        .wsd-seg button { border: none; background: #fff; padding: 5px 12px; font-size: 12px; font-weight: 700; color: #475569; cursor: pointer; }
        .wsd-seg button + button { border-left: 1px solid #cbd5e1; }
        .wsd-seg button.present.on { background: #15803d; color: #fff; }
        .wsd-seg button.absent.on { background: #b91c1c; color: #fff; }
        .wsd-src { margin-left: 8px; font-size: 11px; color: #64748b; }
        .wsd-search { position: relative; max-width: 420px; margin-bottom: 14px; }
        .wsd-search input, .wsd-textarea { width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 13px; }
        .wsd-results { position: absolute; left: 0; right: 0; top: 100%; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 20px rgba(15,23,42,0.12); z-index: 5; max-height: 260px; overflow-y: auto; }
        .wsd-results button { display: block; width: 100%; text-align: left; border: none; background: #fff; padding: 9px 12px; font-size: 13px; cursor: pointer; }
        .wsd-results button:hover { background: #f1f6d6; }
        .wsd-toggle { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #eef1f5; }
        .wsd-toggle:first-of-type { border-top: none; }
        .wsd-toggle input { width: 16px; height: 16px; accent-color: #c2d45e; }
        .wsd-toggle .when { margin-left: auto; font-size: 12px; color: #64748b; }
        .wsd-info { font-size: 12px; color: #1e3a8a; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
        .wsd-subject { display: block; font-size: 12px; color: #64748b; margin-top: 2px; }
        .wsd-sent { display: block; color: #15803d; font-weight: 600; margin-top: 2px; }
        .wsd-toggle .when { text-align: right; }
        .wsd-result { margin-top: 10px; font-size: 13px; padding: 8px 12px; border-radius: 8px; }
        .wsd-result.success { background: #dcfce7; color: #15803d; }
        .wsd-result.error { background: #fee2e2; color: #b91c1c; }
        .wsd-note { font-size: 12px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
        .wsd-stars button { border: none; background: none; font-size: 24px; cursor: pointer; color: #cbd5e1; padding: 0 2px; }
        .wsd-stars button.on { color: #f59e0b; }
        .wsd-empty { padding: 24px; text-align: center; color: #94a3b8; font-size: 14px; }
      `}</style>

      <div className="wsd-panel" role="dialog" aria-modal="true" aria-label={session.topic} onClick={(e) => e.stopPropagation()}>
        <div className="wsd-head">
          <div>
            <h2>
              {session.topic || "Workshop"}
              <span className={`wsd-badge ${completed ? "completed" : "upcoming"}`}>{completed ? "Completed" : "Upcoming"}</span>
            </h2>
            <div className="wsd-sub">
              {[session.date ? formatDateDDMMMYYYY(session.date) : "", time, session.workshopOrganizer, session.workshopLocation].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="wsd-head-actions">
            {session.workshopId && (
              <>
                <button type="button" className={`wsd-btn ${copied === "attendance" ? "copied" : ""}`} onClick={() => copyLink("attendance", attendanceLink(session.workshopId))} title={attendanceLink(session.workshopId)}>
                  {copied === "attendance" ? <FaCheck size={12} /> : <FaLink size={12} />}
                  {copied === "attendance" ? "Copied!" : "Copy attendance link"}
                </button>
                <button type="button" className={`wsd-btn ${copied === "feedback" ? "copied" : ""}`} onClick={() => copyLink("feedback", workshopFeedbackLink(session.workshopId))} title={workshopFeedbackLink(session.workshopId)}>
                  {copied === "feedback" ? <FaCheck size={12} /> : <FaLink size={12} />}
                  {copied === "feedback" ? "Copied!" : "Copy feedback link"}
                </button>
              </>
            )}
            <button type="button" className="wsd-close" onClick={onClose} aria-label="Close">
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="wsd-tabs">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`wsd-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="wsd-body">
          {tab === "overview" && (
            <>
              <div className="wsd-grid">
                <div className="wsd-field"><label>Date</label><div>{session.date ? formatDateDDMMMYYYY(session.date) : "-"}</div></div>
                <div className="wsd-field"><label>Time</label><div>{time || "-"}</div></div>
                <div className="wsd-field"><label>Trainer</label><div>{session.trainer && session.trainer !== "-" ? session.trainer : "-"}</div></div>
                <div className="wsd-field"><label>Organizer</label><div>{session.workshopOrganizer || "-"}</div></div>
                <div className="wsd-field"><label>Location</label><div>{session.workshopLocation || "-"}</div></div>
                <div className="wsd-field"><label>Fee</label><div>{session.workshopFee || session.workshopFee === 0 ? `₹${session.workshopFee}` : "-"}</div></div>
                <div className="wsd-field">
                  <label>Meeting link</label>
                  <div>{session.meetingLink ? <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">{session.meetingLink}</a> : "-"}</div>
                </div>
                <div className="wsd-field"><label>Trainees</label><div>{rows.length}</div></div>
                <div className="wsd-field"><label>Documents</label><div>{documents.length}</div></div>
                {completed && session.completedAt && (
                  <div className="wsd-field"><label>Completed on</label><div>{formatDateTimeDDMMMYYYY(session.completedAt)}</div></div>
                )}
              </div>
              {session.description && session.description !== "-" && (
                <div className="wsd-field" style={{ marginTop: 16 }}><label>Description</label><div>{session.description}</div></div>
              )}
              <div className="wsd-actions">
                <button type="button" className="wsd-btn" onClick={() => onEditDetails(session)}>Edit details</button>
                <button type="button" className="wsd-btn" onClick={() => setTab("documents")}>Manage documents</button>
                <button type="button" className={`wsd-btn ${completed ? "" : "success"}`} onClick={toggleCompleted} disabled={busy}>
                  <FaCheckCircle size={13} />
                  {completed ? "Reopen (move back to Upcoming)" : "Mark as completed"}
                </button>
              </div>
              {!completed && (
                <div className="wsd-note" style={{ marginTop: 14 }}>
                  A workshop stays in Upcoming until you mark it completed here — it does not move on its own when the date passes.
                </div>
              )}
            </>
          )}

          {tab === "trainees" && (
            <>
              <div className="wsd-stats">
                <div className="wsd-stat"><b>{rows.length}</b>Registered</div>
                <div className="wsd-stat"><b>{counts.present}</b>Present</div>
                <div className="wsd-stat"><b>{counts.absent}</b>Absent</div>
                <div className="wsd-stat"><b>{counts.unmarked}</b>Not marked</div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                <div className="wsd-search" style={{ flex: "1 1 320px" }}>
                  <input
                    type="text"
                    placeholder="Search members by name or phone to add a trainee…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search.trim() && (
                    <div className="wsd-results">
                      {searchResults.length === 0 ? (
                        <div className="wsd-empty" style={{ padding: 12 }}>No matching members.</div>
                      ) : (
                        searchResults.map((member) => (
                          <button key={member.id} type="button" onClick={() => addTrainee(member)}>
                            <FaPlus size={10} style={{ marginRight: 8 }} />
                            {getMemberName(member)}
                            {getMemberPhone(member) ? ` · ${getMemberPhone(member)}` : ""}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button type="button" className="wsd-btn" onClick={markAllPresent} disabled={busy || rows.length === 0}>
                  <FaUserCheck size={13} /> Mark all present
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="wsd-empty">No trainees yet. Search above to add one.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="wsd-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Attendance</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={row.id || index}>
                          <td>{index + 1}</td>
                          <td style={{ fontWeight: 600, color: "#0f172a" }}>{row.name}</td>
                          <td>{row.email || "-"}</td>
                          <td>{row.phone || "-"}</td>
                          <td>{row.city || "-"}</td>
                          <td>
                            <span className="wsd-seg">
                              <button type="button" className={`present ${row.mark?.status === "present" ? "on" : ""}`} onClick={() => markAttendance(row.id, "present")} disabled={busy}>Present</button>
                              <button type="button" className={`absent ${row.mark?.status === "absent" ? "on" : ""}`} onClick={() => markAttendance(row.id, "absent")} disabled={busy}>Absent</button>
                            </span>
                            {row.mark && <span className="wsd-src">{row.mark.source === "auto" ? "Auto" : "Manual"}</span>}
                          </td>
                          <td>
                            <button type="button" className="wsd-close" onClick={() => removeTrainee(row.id)} title="Remove trainee" disabled={busy}>
                              <FaTimes size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === "communication" && (
            <>
              <ManualReminderCard session={session} rows={rows} confirm={confirm} />

              <div className="wsd-card">
                <h4>Reminders</h4>
                <p>
                  Emailed automatically to everyone registered for this workshop. Untick one to stop it.
                  {rows.some((r) => !r.email) && ` ${rows.filter((r) => !r.email).length} of ${rows.length} trainees have no email address and will not receive emails.`}
                </p>
                {REMINDERS.map((reminder) => (
                  <label className="wsd-toggle" key={reminder.key}>
                    <input type="checkbox" checked={reminderOn(reminder.key)} onChange={() => toggleReminder(reminder.key)} disabled={busy} />
                    <span>
                      {reminder.label}
                      <span className="wsd-subject">{reminder.subject}</span>
                    </span>
                    <span className="when">
                      {reminder.describe(session.date, time)}
                      {sentNote(reminder.key) && <span className="wsd-sent">{sentNote(reminder.key)}</span>}
                    </span>
                  </label>
                ))}
              </div>

              <div className="wsd-card">
                <h4>Thank-you email</h4>
                <p>Emailed automatically once the workshop is marked completed, only to trainees marked Present. Anyone marked present later (within 7 days) gets it too.</p>
                <label className="wsd-toggle">
                  <input type="checkbox" checked={reminderOn("thankYou")} onChange={() => toggleReminder("thankYou")} disabled={busy} />
                  <span>
                    Send after completion
                    <span className="wsd-subject">🎉 Thank You for Attending the Workshop!</span>
                  </span>
                  <span className="when">
                    {completed ? `${counts.present} marked present` : "Waiting for the workshop to be marked completed"}
                    {sentNote("thankYou") && <span className="wsd-sent">{sentNote("thankYou")}</span>}
                  </span>
                </label>
              </div>

              <div className="wsd-card" style={{ opacity: completed ? 1 : 0.6 }}>
                <h4>Feedback request</h4>
                <p>Sent manually to trainees marked Present. Paste the feedback form link, then send.</p>
                <div className="wsd-field" style={{ marginBottom: 10 }}>
                  <label htmlFor="wsd-feedback-link">Feedback form link</label>
                  <input
                    id="wsd-feedback-link"
                    type="url"
                    className="wsd-textarea"
                    placeholder="https://forms.gle/…"
                    value={feedbackLink}
                    onChange={(e) => setFeedbackLink(e.target.value)}
                    disabled={!completed || feedbackSending}
                  />
                </div>
                <div className="wsd-actions" style={{ marginTop: 0, alignItems: "center" }}>
                  <button type="button" className="wsd-btn primary" onClick={() => sendFeedback(false)} disabled={!completed || feedbackSending || counts.present === 0}>
                    {feedbackSending ? "Sending…" : "Send feedback email"}
                  </button>
                  {emailLog.feedback?.sentIds?.length > 0 && (
                    <button type="button" className="wsd-btn" onClick={() => sendFeedback(true)} disabled={!completed || feedbackSending}>
                      Send again to everyone
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {!completed ? "Available after the workshop is marked completed." : counts.present === 0 ? "No trainees marked present yet." : sentNote("feedback")}
                  </span>
                </div>
                {feedbackResult && (
                  <div className={`wsd-result ${feedbackResult.type}`} role="status">{feedbackResult.text}</div>
                )}
              </div>
            </>
          )}

          {tab === "documents" && (
            <WorkshopDocumentsTab session={session} onPatch={onPatch} onDocumentAdded={onDocumentAdded} onEmailTeam={onEmailTeam} sendingTeamEmail={sendingTeamEmail} />
          )}

          {tab === "traineeFeedback" && <TraineeFeedbackTab session={session} memberById={memberById} />}

          {tab === "feedback" && (
            <>
              {!completed && (
                <div className="wsd-note">
                  Trainer feedback is filled in after the workshop. Mark the workshop as completed (Overview tab) to enable it.
                </div>
              )}
              <div className="wsd-card" style={{ opacity: completed ? 1 : 0.55 }}>
                <h4>Trainer feedback{session.trainer && session.trainer !== "-" ? ` — ${session.trainer}` : ""}</h4>
                <p>How the session went, from the trainer.</p>
                <div className="wsd-stars" style={{ marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" className={feedback.rating >= n ? "on" : ""} onClick={() => setFeedback((f) => ({ ...f, rating: f.rating === n ? 0 : n }))} disabled={!completed} aria-label={`${n} star`}>★</button>
                  ))}
                </div>
                {[
                  ["summary", "Session summary"],
                  ["wentWell", "What went well"],
                  ["improvements", "What to improve"],
                  ["futureNotes", "Future notes (plans, ideas or reminders for the next workshop)"],
                ].map(([field, label]) => (
                  <div className="wsd-field" key={field} style={{ marginBottom: 10 }}>
                    <label>{label}</label>
                    <textarea
                      className="wsd-textarea"
                      rows={3}
                      value={feedback[field]}
                      onChange={(e) => setFeedback((f) => ({ ...f, [field]: e.target.value }))}
                      disabled={!completed}
                    />
                  </div>
                ))}
                <div className="wsd-actions" style={{ marginTop: 6 }}>
                  <button type="button" className="wsd-btn primary" onClick={saveFeedback} disabled={!completed || busy}>Save feedback</button>
                </div>
              </div>
            </>
          )}
        </div>
        {confirmDialog}
      </div>
    </div>
  );
}
