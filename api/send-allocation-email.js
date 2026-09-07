import nodemailer from "nodemailer";
import { renderCardEmail, renderPlainEmail } from "./_lib/emailTemplate.js";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, body, fields, heading, subheading, accentColor, footerNote } = req.body || {};

    if (!to || !subject || (!body && !fields)) {
      return res.status(400).json({ error: "Missing to, subject, or body/fields." });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      return res.status(500).json({
        error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable.",
      });
    }

    const textFallback = body || fields.map(({ label, value }) => `${label}: ${value}`).join("\n");
    const html = Array.isArray(fields)
      ? renderCardEmail({ heading: heading || subject, subheading, fields, accentColor, footerNote })
      : renderPlainEmail(body);

    await getTransporter().sendMail({
      from: `Brisk Olive <${gmailUser}>`,
      to,
      subject,
      text: textFallback,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("send-allocation-email error:", error);
    return res.status(500).json({ error: "Failed to send allocation email." });
  }
}
