import { getAdminDb } from "../firebaseAdmin.js";
import {
  SESSIONS,
  feedbackLinkFor,
  gmailConfigured,
  istDateKey,
  istEpoch,
  loadTrainees,
  parseTimeMinutes,
  sendToTrainees,
  shiftDateKey,
} from "../workshopEmails.js";

// Sends the automatic workshop emails for scheduled workshops (`trainingsessions`).
//
// Runs once a day from vercel.json (10:00–10:59 AM IST — Vercel Hobby only allows
// daily crons). The 15-minute reminder needs it called every 5 minutes, e.g. by a
// free external scheduler (cron-job.org) with header `Authorization: Bearer <CRON_SECRET>`.
// Calling it more often is always safe.
//
//   dayBefore   — the day before the workshop, from 10:00 AM IST, to everyone registered.
//   fifteenMin  — 15 minutes before the start time, to everyone registered.
//                 Needs a session time and the 5-minute external scheduler.
//   thankYou    — after the workshop is marked completed (within 7 days of
//   feedback      that), to trainees marked Present only. Anyone marked present
//                 later in that window gets them on a later run. The feedback
//                 email uses the session's feedback link (see feedbackLinkFor).
//
// POST { sessionId } checks just that one workshop. The dashboard calls this the
// moment a workshop is marked completed, so the thank-you and feedback emails go
// out straight away instead of at the next daily run. It needs no CRON_SECRET:
// it only sends what is already due, and never to anyone twice.
//
// Each can be switched off per workshop in its Reminders tab
// (`reminders.<kind>.enabled === false`). Who has been sent what is kept in
// `emailLog.<kind>.sentIds`, so a re-run never emails anyone twice.
// ?dryRun=1 lists what would be sent without sending.

const MINUTE = 60 * 1000;
const FIFTEEN_MIN_WINDOW_START = 17 * MINUTE; // cron runs every 5 min; allow a little slack
const AFTER_COMPLETION_WINDOW = 7 * 24 * 60 * MINUTE;
const DAY_BEFORE_SEND_MINUTES = 10 * 60; // 10:00 AM IST on the day before
const PRESENT_ONLY = new Set(["thankYou", "feedback"]);

const enabled = (session, kind) => session.reminders?.[kind]?.enabled !== false;

// Which emails are due for a session right now, ignoring who already has them.
export function dueKinds(session, now = Date.now()) {
  const due = [];
  const date = session.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return due;
  const startMinutes = parseTimeMinutes(session.time);

  if (session.completed !== true) {
    const dayBefore = shiftDateKey(date, -1);
    if (enabled(session, "dayBefore") && istDateKey(now) === dayBefore && now >= istEpoch(dayBefore, DAY_BEFORE_SEND_MINUTES)) {
      due.push("dayBefore");
    }
    if (enabled(session, "fifteenMin") && startMinutes !== null) {
      const exactStart = istEpoch(date, startMinutes);
      if (now >= exactStart - FIFTEEN_MIN_WINDOW_START && now < exactStart) due.push("fifteenMin");
    }
  } else {
    const completedAt = Date.parse(session.completedAt || "");
    if (Number.isFinite(completedAt) && now - completedAt <= AFTER_COMPLETION_WINDOW) {
      if (enabled(session, "thankYou")) due.push("thankYou");
      if (enabled(session, "feedback") && feedbackLinkFor(session)) due.push("feedback");
    }
  }
  return due;
}

// The template values (and log fields) a kind needs.
function extrasFor(session, kind) {
  if (kind !== "feedback") return [{}, {}];
  const link = feedbackLinkFor(session);
  return [{ link }, { link }];
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = req.method === "POST" && typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
  const cronSecret = process.env.CRON_SECRET;
  if (!sessionId && cronSecret && (req.headers.authorization || "") !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dryRun = ["1", "true"].includes(String(req.query?.dryRun ?? ""));
  if (!dryRun && !gmailConfigured()) {
    return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable." });
  }

  try {
    const db = getAdminDb();
    const now = Date.now();
    let docs;
    if (sessionId) {
      const snap = await db.collection(SESSIONS).doc(sessionId).get();
      if (!snap.exists) return res.status(404).json({ error: "Workshop not found." });
      docs = [snap];
    } else {
      docs = (await db.collection(SESSIONS).get()).docs;
    }
    const results = [];

    for (const doc of docs) {
      const session = { id: doc.id, ...doc.data() };
      const kinds = dueKinds(session, now);
      if (!kinds.length) continue;

      const trainees = await loadTrainees(db, session);
      for (const kind of kinds) {
        const already = new Set(session.emailLog?.[kind]?.sentIds || []);
        const recipients = trainees.filter((t) => !already.has(t.id) && (!PRESENT_ONLY.has(kind) || t.present));
        if (!recipients.length) continue;
        if (dryRun) {
          results.push({ kind, sessionId: session.id, topic: session.topic, wouldSend: recipients.filter((t) => t.email).length, noEmail: recipients.filter((t) => !t.email).length });
          continue;
        }
        const [extra, logExtra] = extrasFor(session, kind);
        results.push({ ...(await sendToTrainees(db, session, kind, recipients, extra, logExtra)), topic: session.topic });
      }
    }

    return res.status(200).json({ ok: true, dryRun, checked: docs.length, results });
  } catch (error) {
    console.error("send-workshop-reminders error:", error);
    return res.status(500).json({ error: "Failed to send workshop reminders." });
  }
}
