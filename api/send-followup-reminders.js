import nodemailer from "nodemailer";
import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { renderCardEmail } from "./_lib/emailTemplate.js";

let cachedTransporter = null;
const getTransporter = () => {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return cachedTransporter;
};

const formatDate = (date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function handler(req, res) {
  // Vercel Cron sends GET; allow POST too for manual/local testing.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailAppPassword) {
      return res.status(500).json({ error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable." });
    }

    const db = getAdminDb();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    // Deliberately no lower bound: a follow-up date is "due" once it reaches
    // today, and stays due (an overdue reminder is still worth sending) until
    // it's actually delivered. A lower bound of "today" would permanently skip
    // anything set after that day's single daily cron run, since a past date
    // never again matches a future "today".
    const snapshot = await db
      .collectionGroup("interactions")
      .where("followUpDate", "<", startOfTomorrow)
      .get();

    const dueDocs = snapshot.docs.filter((doc) => {
      const data = doc.data();
      return data.loggedByEmail && !data.reminderSent;
    });

    let sent = 0;
    const errors = [];

    for (const doc of dueDocs) {
      const data = doc.data();
      const followUpDateStr = formatDate(data.followUpDate.toDate());
      const fields = [
        { label: "Member", value: data.contactPerson || "-" },
        { label: "Mobile", value: data.contactPhone || "-" },
        { label: "Email", value: data.contactEmail || "-" },
        { label: "Notes", value: data.notes || "-" },
        { label: "Next Action", value: data.nextAction || "-" },
        { label: "Follow-up Date", value: followUpDateStr },
      ];
      const textFallback = fields.map(({ label, value }) => `${label}: ${value}`).join("\n");

      try {
        await getTransporter().sendMail({
          from: `Brisk Olive <${gmailUser}>`,
          to: data.loggedByEmail,
          subject: `Follow-up reminder: ${data.contactPerson || "-"} (${followUpDateStr})`,
          text: textFallback,
          html: renderCardEmail({
            heading: "Follow-up Reminder",
            subheading: data.contactPerson || "-",
            fields,
            accentColor: "#f59e0b",
            footerNote: "Brisk Olive Dashboard",
          }),
        });
        await doc.ref.update({ reminderSent: true });
        sent += 1;
      } catch (error) {
        console.error(`Failed to send reminder for ${doc.ref.path}:`, error);
        errors.push(doc.ref.path);
      }
    }

    return res.status(200).json({ ok: true, checked: snapshot.size, sent, errors });
  } catch (error) {
    console.error("send-followup-reminders error:", error);
    return res.status(500).json({ error: "Failed to send follow-up reminders." });
  }
}
