import { getAdminDb } from "./_lib/firebaseAdmin.js";
import {
  SESSIONS,
  gmailConfigured,
  istDateKey,
  istEpoch,
  loadTrainees,
  parseTimeMinutes,
  sendToTrainees,
  shiftDateKey,
} from "./_lib/workshopEmails.js";

// Cron (vercel.json, every 5 minutes): sends the automatic workshop emails for
// scheduled workshops (`trainingsessions`).
//
//   dayBefore   — the day before the workshop, 24h before its start time
//                 (10:00 AM if it has no time), to everyone registered.
//   fifteenMin  — 15 minutes before the start time, to everyone registered.
//                 Needs a session time.
//   thankYou    — after the workshop is marked completed (within 7 days of
//                 that), to trainees marked Present only. Anyone marked present
//                 later in that window gets it on a later run.
//
// Each can be switched off per workshop in its Reminders tab
// (`reminders.<kind>.enabled === false`). Who has been sent what is kept in
// `emailLog.<kind>.sentIds`, so a re-run never emails anyone twice.
// ?dryRun=1 lists what would be sent without sending.

const MINUTE = 60 * 1000;
const FIFTEEN_MIN_WINDOW_START = 17 * MINUTE; // cron runs every 5 min; allow a little slack
const THANK_YOU_WINDOW = 7 * 24 * 60 * MINUTE;
const DEFAULT_DAY_BEFORE_MINUTES = 10 * 60;

const enabled = (session, kind) => session.reminders?.[kind]?.enabled !== false;

// Which emails are due for a session right now, ignoring who already has them.
export function dueKinds(session, now = Date.now()) {
  const due = [];
  const date = session.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return due;
  const startMinutes = parseTimeMinutes(session.time);

  if (session.completed !== true) {
    const start = istEpoch(date, startMinutes ?? DEFAULT_DAY_BEFORE_MINUTES);
    if (enabled(session, "dayBefore") && istDateKey(now) === shiftDateKey(date, -1) && now >= start - 24 * 60 * MINUTE) {
      due.push("dayBefore");
    }
    if (enabled(session, "fifteenMin") && startMinutes !== null) {
      const exactStart = istEpoch(date, startMinutes);
      if (now >= exactStart - FIFTEEN_MIN_WINDOW_START && now < exactStart) due.push("fifteenMin");
    }
  } else if (enabled(session, "thankYou")) {
    const completedAt = Date.parse(session.completedAt || "");
    if (Number.isFinite(completedAt) && now - completedAt <= THANK_YOU_WINDOW) due.push("thankYou");
  }
  return due;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (req.headers.authorization || "") !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = ["1", "true"].includes(String(req.query?.dryRun ?? ""));
  if (!dryRun && !gmailConfigured()) {
    return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable." });
  }

  try {
    const db = getAdminDb();
    const now = Date.now();
    const snapshot = await db.collection(SESSIONS).get();
    const results = [];

    for (const doc of snapshot.docs) {
      const session = { id: doc.id, ...doc.data() };
      const kinds = dueKinds(session, now);
      if (!kinds.length) continue;

      const trainees = await loadTrainees(db, session);
      for (const kind of kinds) {
        const already = new Set(session.emailLog?.[kind]?.sentIds || []);
        const recipients = trainees.filter((t) => !already.has(t.id) && (kind !== "thankYou" || t.present));
        if (!recipients.length) continue;
        if (dryRun) {
          results.push({ kind, sessionId: session.id, topic: session.topic, wouldSend: recipients.filter((t) => t.email).length, noEmail: recipients.filter((t) => !t.email).length });
          continue;
        }
        results.push({ ...(await sendToTrainees(db, session, kind, recipients)), topic: session.topic });
      }
    }

    return res.status(200).json({ ok: true, dryRun, checked: snapshot.size, results });
  } catch (error) {
    console.error("send-workshop-reminders error:", error);
    return res.status(500).json({ error: "Failed to send workshop reminders." });
  }
}
