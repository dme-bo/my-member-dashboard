// Workshop emails: the two automatic reminders (day before, 15 minutes before),
// the automatic thank-you after completion, and the manual feedback request.
//
// Data lives in Firestore:
//   trainingsessions/{id}                              the scheduled workshop (date, time, meetingLink,
//                                                      attendees, attendance, removedTraineeIds, completed…)
//   workshopsmaster/{workshopId}/workshop_users_applied  who registered
//   workshopsmaster/{workshopId}/attendance              who was marked present (by the app)
//   users/{id}                                         member record, source of the email address
//
// What has been sent is recorded on the session under `emailLog.<kind>`
// ({ sentIds, lastSentAt, ... }) so nobody gets the same email twice.
import nodemailer from "nodemailer";
import { FieldValue } from "firebase-admin/firestore";
import { escapeHtml } from "./emailTemplate.js";

export const SESSIONS = "trainingsessions";
const WORKSHOPS = "workshopsmaster";
const APPLICANTS = "workshop_users_applied";
const ATTENDANCE = "attendance";
const USERS = "users";

const IST_OFFSET_MS = 330 * 60 * 1000; // India is UTC+5:30, no DST
const BCC_BATCH = 50;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let transporter = null;
export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

export const gmailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

// ---------- dates (everything is India time) ----------

// "09:30", "9:30 AM", "14:00" -> minutes after midnight, or null.
export function parseTimeMinutes(value) {
  const match = /(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/.exec(String(value || ""));
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// UTC epoch ms for a YYYY-MM-DD date at `minutes` past midnight, India time.
export function istEpoch(dateStr, minutes = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, minutes) - IST_OFFSET_MS;
}

export function istDateKey(epochMs = Date.now()) {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function shiftDateKey(dateStr, days) {
  const epoch = istEpoch(dateStr);
  return epoch === null ? "" : istDateKey(epoch + days * 86400000);
}

export function displayDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(dateStr || "");
}

export function displayTime(timeStr) {
  const minutes = parseTimeMinutes(timeStr);
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---------- recipients ----------

const idOf = (data, fallback) => data.user_id || data.uid || data.userId || fallback;
const emailOf = (data = {}) => {
  for (const key of ["email", "email_id", "emailId", "Email", "E-mail"]) {
    const value = String(data[key] ?? "").trim();
    if (EMAIL_RE.test(value)) return value.toLowerCase();
  }
  return "";
};

// Everyone registered for the session (the same list the Trainees tab shows):
// workshop applicants + manually added trainees + walk-ins marked present,
// minus anyone removed. Returns [{ id, email, present }].
export async function loadTrainees(db, session) {
  const people = new Map(); // id -> { id, email }
  const add = (id, email = "") => {
    if (!id) return;
    const existing = people.get(id);
    if (!existing) people.set(id, { id, email });
    else if (!existing.email && email) existing.email = email;
  };

  for (const trainee of session.attendees || []) {
    if (typeof trainee === "string") add(trainee);
    else if (trainee) add(trainee.id, emailOf(trainee));
  }

  const autoPresent = new Set();
  if (session.workshopId) {
    const [applicants, attendance] = await Promise.all([
      db.collection(WORKSHOPS).doc(session.workshopId).collection(APPLICANTS).get(),
      db.collection(WORKSHOPS).doc(session.workshopId).collection(ATTENDANCE).get(),
    ]);
    applicants.docs.forEach((d) => add(idOf(d.data() || {}, d.id), emailOf(d.data())));
    attendance.docs.forEach((d) => {
      const id = idOf(d.data() || {}, d.id);
      autoPresent.add(id);
      add(id);
    });
  }

  for (const id of session.removedTraineeIds || []) people.delete(id);

  // Fill in missing emails from the member records.
  const missing = [...people.values()].filter((p) => !p.email);
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((p) => db.collection(USERS).doc(p.id)));
    snaps.forEach((snap, index) => {
      if (snap.exists) chunk[index].email = emailOf(snap.data());
    });
  }

  // Present = marked present by hand, or in the attendance collection and not
  // overridden to Absent by hand (same rule as the Trainees tab).
  const manual = session.attendance || {};
  return [...people.values()].map((p) => ({
    ...p,
    present: manual[p.id] ? manual[p.id].status === "present" : autoPresent.has(p.id),
  }));
}

// ---------- email content ----------

const SIGN_OFF = ["Best Regards,", "Brisk Olive Team"];

// kind -> builder(session, extra) -> { subject, lines }
// A line is a string (a paragraph) or { label, value, href } for a detail row.
export const TEMPLATES = {
  dayBefore: (s) => ({
    subject: "Reminder: Workshop Tomorrow!",
    lines: [
      "Hello,",
      `This is a gentle reminder that you have registered for our upcoming workshop on ${s.topic}, scheduled for tomorrow.`,
      { label: "Date", value: displayDate(s.date) },
      { label: "Time", value: displayTime(s.time) || "-" },
      { label: "Workshop Link", value: s.meetingLink || "-", href: s.meetingLink },
      "Kindly make a note of the schedule and join the workshop on time using the link provided above.",
      "We look forward to your active participation!",
    ],
  }),
  fifteenMin: (s) => ({
    subject: "📢 Reminder: Workshop Starts in 15 Minutes!",
    lines: [
      "Hello,",
      `This is a gentle reminder that our workshop on ${s.topic} will begin in 15 minutes.`,
      { label: "📅 Date", value: displayDate(s.date) },
      { label: "⏰ Time", value: displayTime(s.time) || "-" },
      { label: "🔗 Workshop Link", value: s.meetingLink || "-", href: s.meetingLink },
      "Kindly join the workshop on time using the link provided above.",
      "We look forward to your active participation!",
    ],
  }),
  thankYou: (s) => ({
    subject: "🎉 Thank You for Attending the Workshop!",
    lines: [
      "Hello,",
      `Thank you for attending our workshop on ${s.topic}! We appreciate your time, participation, and interest.`,
      "We hope the session was informative and helpful for you. We look forward to your continued participation in our future workshops and training sessions.",
      "Thank you for being a part of Brisk Olive!",
    ],
  }),
  feedback: (s, { link }) => ({
    subject: `📝 Share Your Feedback – ${s.topic}`,
    lines: [
      "Hello,",
      `Thank you for attending our workshop on ${s.topic}!`,
      "We hope you found the session informative and helpful. We would appreciate it if you could take a few minutes to share your feedback. Your valuable input will help us improve our future workshops and training sessions.",
      { label: "🔗 Feedback Form", value: link, href: link },
      "Kindly fill out the feedback form and share your experience with us.",
      "Thank you for your time and participation!",
    ],
  }),
};

// Manual message typed in the Reminders tab. {topic}, {date}, {time} and
// {link} are replaced with the workshop's details; blank lines split paragraphs.
export function fillPlaceholders(text, s) {
  const values = { topic: s.topic || "", date: displayDate(s.date), time: displayTime(s.time) || "", link: s.meetingLink || "" };
  return String(text || "").replace(/\{(topic|date|time|link)\}/gi, (_, key) => values[key.toLowerCase()]);
}
TEMPLATES.custom = (s, { subject, message }) => ({
  subject: fillPlaceholders(subject, s),
  lines: fillPlaceholders(message, s)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean),
});

const safeHref =(href) => (/^https?:\/\//i.test(String(href || "")) ? href : "");

export function renderWorkshopEmail({ subject, lines }) {
  const all = [...lines, SIGN_OFF.join("\n")];
  const text = all
    .map((line) => (typeof line === "string" ? line : `${line.label}: ${line.value}`))
    .join("\n\n");
  const html = `
<div style="background:#f3f4f6;padding:28px 16px;font-family:'Segoe UI',Arial,sans-serif;">
  <table style="max-width:560px;width:100%;margin:0 auto;background:#ffffff;border-radius:12px;border-collapse:collapse;">
    <tr><td style="background:#5f6f14;padding:20px 26px;border-radius:12px 12px 0 0;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(subject)}</td></tr>
    <tr><td style="padding:22px 26px;color:#111827;font-size:14px;line-height:1.6;">
      ${all
        .map((line) => {
          if (typeof line === "string") {
            // Escaped first, then web addresses become links (escaping never adds spaces or quotes to a URL).
            const html = escapeHtml(line)
              .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#1976d2;word-break:break-all;">${url}</a>`)
              .replace(/\n/g, "<br/>");
            return `<p style="margin:0 0 14px;">${html}</p>`;
          }
          const href = safeHref(line.href);
          const value = href
            ? `<a href="${escapeHtml(href)}" style="color:#1976d2;word-break:break-all;">${escapeHtml(line.value)}</a>`
            : escapeHtml(line.value);
          return `<p style="margin:0 0 6px;"><b>${escapeHtml(line.label)}:</b> ${value}</p>`;
        })
        .join("")}
    </td></tr>
  </table>
</div>`;
  return { subject, text, html };
}

// ---------- sending ----------

// Sends `kind` to the given trainees in BCC batches (addresses are never shown
// to each other), recording each delivered batch on the session right away so
// a failure part-way through is retried next time without repeating anyone.
export async function sendToTrainees(db, session, kind, trainees, extra = {}, logExtra = {}) {
  const logRef = db.collection(SESSIONS).doc(session.id);
  const message = renderWorkshopEmail(TEMPLATES[kind](session, extra));
  const from = process.env.GMAIL_USER;
  const withEmail = trainees.filter((t) => t.email);
  const result = { kind, sessionId: session.id, sent: 0, noEmail: trainees.length - withEmail.length, failed: 0 };

  for (let i = 0; i < withEmail.length; i += BCC_BATCH) {
    const batch = withEmail.slice(i, i + BCC_BATCH);
    try {
      await getTransporter().sendMail({
        from: `Brisk Olive <${from}>`,
        to: from,
        bcc: batch.map((t) => t.email),
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await logRef.update({
        [`emailLog.${kind}.sentIds`]: FieldValue.arrayUnion(...batch.map((t) => t.id)),
        [`emailLog.${kind}.lastSentAt`]: new Date().toISOString(),
        ...Object.fromEntries(Object.entries(logExtra).map(([k, v]) => [`emailLog.${kind}.${k}`, v])),
      });
      result.sent += batch.length;
    } catch (error) {
      console.error(`workshop email ${kind} failed for session ${session.id}:`, error);
      result.failed += batch.length;
    }
  }
  return result;
}
