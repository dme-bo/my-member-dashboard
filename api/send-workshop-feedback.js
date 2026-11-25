import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { SESSIONS, gmailConfigured, loadTrainees, sendToTrainees } from "./_lib/workshopEmails.js";

// Manual "Share your feedback" email for a completed workshop, sent from its
// Reminders tab. Goes to trainees marked Present only.
//
// POST { sessionId, link, resendAll? }
//   link       the feedback form URL (http/https), saved on the session
//   resendAll  also email people who already received it (default: only new ones)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { sessionId, link, resendAll } = req.body || {};
  const feedbackLink = String(link || "").trim();
  if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "Missing sessionId." });
  if (!/^https?:\/\/\S+$/i.test(feedbackLink)) return res.status(400).json({ error: "Enter a valid feedback form link (starting with http:// or https://)." });
  if (!gmailConfigured()) return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable." });

  try {
    const db = getAdminDb();
    const snap = await db.collection(SESSIONS).doc(sessionId).get();
    if (!snap.exists) return res.status(404).json({ error: "Workshop not found." });
    const session = { id: snap.id, ...snap.data() };
    if (session.completed !== true) return res.status(400).json({ error: "Mark the workshop as completed before sending the feedback email." });

    await snap.ref.update({ feedbackLink });

    const already = new Set(resendAll ? [] : session.emailLog?.feedback?.sentIds || []);
    const recipients = (await loadTrainees(db, session)).filter((t) => t.present && !already.has(t.id));
    if (!recipients.length) {
      return res.status(200).json({ ok: true, sent: 0, noEmail: 0, failed: 0, message: "Everyone marked present has already received it." });
    }

    const result = await sendToTrainees(db, session, "feedback", recipients, { link: feedbackLink }, { link: feedbackLink });
    return res.status(result.failed && !result.sent ? 502 : 200).json({ ok: result.failed === 0, ...result });
  } catch (error) {
    console.error("send-workshop-feedback error:", error);
    return res.status(500).json({ error: "Failed to send the feedback email." });
  }
}
