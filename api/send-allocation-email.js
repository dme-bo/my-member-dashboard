import nodemailer from "nodemailer";
import { renderCardEmail, renderPlainEmail, renderAllocationEmail } from "./_lib/emailTemplate.js";

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
    const { to, subject, body, fields, table, tableTitle, heading, subheading, accentColor, footerNote } = req.body || {};

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

    const textFallback = [
      body || (Array.isArray(fields) ? fields.map(({ label, value }) => `${label}: ${value}`).join("\n") : ""),
      table ? `\n${tableTitle || "Allocated Members"}\n${table.headers.join(" | ")}\n${table.rows.map((r) => r.join(" | ")).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let html;
    if (Array.isArray(fields) && table) {
      html = renderAllocationEmail({ heading: heading || subject, subheading, fields, tableTitle, table, accentColor, footerNote });
    } else if (Array.isArray(fields)) {
      html = renderCardEmail({ heading: heading || subject, subheading, fields, accentColor, footerNote });
    } else {
      html = renderPlainEmail(body);
    }

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
