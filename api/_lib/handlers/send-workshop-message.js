import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../firebaseAdmin.js";
import { SESSIONS, fillPlaceholders, gmailConfigured, loadTrainees, sendToTrainees } from "../workshopEmails.js";

// Manual reminder typed in a workshop's Reminders tab, emailed right away.
//
// POST { sessionId, subject, message, audience }
//   audience: "all" (everyone registered, default) | "present" | "notPresent"
//   {topic} {date} {time} {link} in the subject/message are filled in.
// Each send is recorded in the session's `manualReminders` list.

const AUDIENCES = {
  all: () => true,
  present: (t) => t.present,
  notPresent: (t) => !t.present,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId } = req.body || {};
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();
  const audience = AUDIENCES[req.body?.audience] ? req.body.audience : "all";
  if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "Missing sessionId." });
  if (!subject || subject.length > 200) return res.status(400).json({ error: "Enter a subject (up to 200 characters)." });
  if (!message || message.length > 5000) return res.status(400).json({ error: "Enter a message (up to 5000 characters)." });
  if (!gmailConfigured()) return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable." });

  try {
    const db = getAdminDb();
    const snap = await db.collection(SESSIONS).doc(sessionId).get();
    if (!snap.exists) return res.status(404).json({ error: "Workshop not found." });
    const session = { id: snap.id, ...snap.data() };

    const recipients = (await loadTrainees(db, session)).filter(AUDIENCES[audience]);
    if (!recipients.length) return res.status(200).json({ ok: true, sent: 0, noEmail: 0, failed: 0, message: "No trainees match that choice." });

    const result = await sendToTrainees(db, session, "custom", recipients, { subject, message });
    await snap.ref.update({
      manualReminders: FieldValue.arrayUnion({
        subject: fillPlaceholders(subject, session),
        audience,
        sent: result.sent,
        failed: result.failed,
        sentAt: new Date().toISOString(),
      }),
    });
    return res.status(result.failed && !result.sent ? 502 : 200).json({ ok: result.failed === 0, ...result });
  } catch (error) {
    console.error("send-workshop-message error:", error);
    return res.status(500).json({ error: "Failed to send the reminder." });
  }
}
