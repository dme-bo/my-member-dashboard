// src/components/WorkshopDetailModal.jsx
// Everything for one workshop in a single large modal: overview + manual
// completion, trainees with attendance, the communication plan (registration
// confirmation, assignment / previous material, reminders) and trainer feedback.
//
// This modal only records settings and state on the session — it never sends
// email. Persistence goes through `onPatch(sessionId, patch)`.
import { useMemo, useState } from "react";
import { FaTimes, FaPlus, FaCheckCircle, FaUserCheck } from "react-icons/fa";
import { getMemberName, getMemberPhone, getMemberEmail, getMemberCity } from "../utils/memberFields";
import { formatDateDDMMMYYYY, formatDateTimeDDMMMYYYY } from "../utils/dateFormat";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trainees", label: "Trainees & Attendance" },
  { id: "communication", label: "Communication" },
  { id: "feedback", label: "Trainer Feedback" },
];

const REMINDERS = [
  { key: "dayBefore", label: "1 day before the workshop", describe: (d, t) => (d ? `${shiftDays(d, -1)}${t ? ` at ${t}` : ""}` : "") },
  { key: "onDay", label: "On the day of the workshop", describe: (d, t) => (d ? `${d}${t ? ` (session at ${t})` : ""}` : "") },
  { key: "fifteenMin", label: "15 minutes before the session", describe: (d, t) => (d && t ? `${d} at ${shiftMinutes(t, -15)}` : d || "") },
];

function shiftDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftMinutes(timeStr, minutes) {
  const match = /^(\d{1,2}):(\d{2})/.exec(timeStr || "");
  if (!match) return timeStr;
  const total = (((Number(match[1]) * 60 + Number(match[2]) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const cleanTime = (time) => (time && time !== "-" ? time : "");

export default function WorkshopDetailModal({ session, completed, members, registered = [], presentIds = [], onClose, onPatch, onEditDetails, onManageDocuments }) {
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [assignmentNote, setAssignmentNote] = useState(session.assignment?.note || "");
  const [feedback, setFeedback] = useState({
    rating: session.trainerFeedback?.rating || 0,
    summary: session.trainerFeedback?.summary || "",
    wentWell: session.trainerFeedback?.wentWell || "",
    improvements: session.trainerFeedback?.improvements || "",
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

  const toggleCompleted = () => {
    if (!completed && !window.confirm("Mark this workshop as completed? It will move to Completed Workshops.")) return;
    return patch(
      completed ? { completed: false, completedAt: null } : { completed: true, completedAt: new Date().toISOString() }
    );
  };

  const toggleReminder = (key) =>
    patch({ reminders: { ...reminders, [key]: { ...(reminders[key] || {}), enabled: !reminders[key]?.enabled } } });

  const toggleConfirmation = () => patch({ registrationConfirmation: { enabled: !session.registrationConfirmation?.enabled } });

  const toggleMaterial = (docId) => {
    const ids = new Set(session.assignment?.documentIds || []);
    if (ids.has(docId)) ids.delete(docId);
    else ids.add(docId);
    return patch({ assignment: { ...(session.assignment || {}), documentIds: [...ids] } });
  };

  const saveAssignment = () => patch({ assignment: { ...(session.assignment || {}), note: assignmentNote.trim() } });

  const saveFeedback = () =>
    patch({ trainerFeedback: { ...feedback, summary: feedback.summary.trim(), wentWell: feedback.wentWell.trim(), improvements: feedback.improvements.trim(), savedAt: new Date().toISOString() } });

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
        .wsd-close { margin-left: auto; border: none; background: none; cursor: pointer; color: #64748b; font-size: 18px; padding: 4px; }
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
          <button type="button" className="wsd-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
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
                <button type="button" className="wsd-btn" onClick={() => onManageDocuments(session)}>Manage documents</button>
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
              <div className="wsd-note">These settings are saved on the workshop only. This screen does not send any email.</div>

              <div className="wsd-card">
                <h4>Registration confirmation</h4>
                <p>Confirm to a trainee as soon as they register for this workshop.</p>
                <label className="wsd-toggle">
                  <input type="checkbox" checked={!!session.registrationConfirmation?.enabled} onChange={toggleConfirmation} disabled={busy} />
                  Send a confirmation when a trainee registers
                </label>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {rows.filter((r) => r.confirmed).length} of {rows.length} trainees already confirmed (WhatsApp).
                </div>
              </div>

              <div className="wsd-card">
                <h4>Assignment / previous material</h4>
                <p>Choose what trainees should receive: pick documents from this workshop's library and add a note.</p>
                {documents.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                    No documents uploaded yet.{" "}
                    <button type="button" className="wsd-btn" onClick={() => onManageDocuments(session)}>Upload documents</button>
                  </div>
                ) : (
                  documents.map((document, index) => {
                    const docId = document.id || document.url || String(index);
                    return (
                      <label className="wsd-toggle" key={docId}>
                        <input
                          type="checkbox"
                          checked={(session.assignment?.documentIds || []).includes(docId)}
                          onChange={() => toggleMaterial(docId)}
                          disabled={busy}
                        />
                        {document.name || document.title || document.fileName || `Document ${index + 1}`}
                      </label>
                    );
                  })
                )}
                <textarea
                  className="wsd-textarea"
                  rows={3}
                  placeholder="Assignment instructions or a note for trainees…"
                  value={assignmentNote}
                  onChange={(e) => setAssignmentNote(e.target.value)}
                  style={{ marginTop: 10 }}
                />
                <div className="wsd-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="wsd-btn primary" onClick={saveAssignment} disabled={busy}>Save</button>
                </div>
              </div>

              <div className="wsd-card">
                <h4>Reminders</h4>
                <p>Which reminders this workshop should have.</p>
                {REMINDERS.map((reminder) => (
                  <label className="wsd-toggle" key={reminder.key}>
                    <input type="checkbox" checked={!!reminders[reminder.key]?.enabled} onChange={() => toggleReminder(reminder.key)} disabled={busy} />
                    {reminder.label}
                    <span className="when">{reminder.describe(session.date, time)}</span>
                  </label>
                ))}
              </div>
            </>
          )}

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
      </div>
    </div>
  );
}
