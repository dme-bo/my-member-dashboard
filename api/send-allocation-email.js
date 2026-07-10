import nodemailer from "nodemailer";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
    const { to, subject, body } = req.body || {};

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Missing to, subject, or body." });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      return res.status(500).json({
        error: "Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variable.",
      });
    }

    await getTransporter().sendMail({
      from: `Brisk Olive <${gmailUser}>`,
      to,
      subject,
      text: body,
      html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${escapeHtml(body)}</pre>`,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("send-allocation-email error:", error);
    return res.status(500).json({ error: error?.message || "Failed to send allocation email." });
  }
}
