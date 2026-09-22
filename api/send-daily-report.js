import nodemailer from "nodemailer";
import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { renderDailyReportEmail } from "./_lib/emailTemplate.js";
import { buildDailyReport } from "./_lib/reportData.js";

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

const DEFAULT_RECIPIENT = "management@briskolive.com,operations.head@briskolive.com,staffing.manager@briskolive.com,members@briskolive.com,dme@briskolive.com";

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

    const to = (req.method === "POST" && req.body?.to) || req.query?.to || DEFAULT_RECIPIENT;

    const db = getAdminDb();
    const report = await buildDailyReport(db);
    const todayStr = formatDate(new Date());

    const dashboardUrl = "https://my-member-dashboard.vercel.app/";

    const sections = [
      { title: "Members & Regional Partner Overview", table: report.overview },
      { title: "Today's Report", table: report.todaysReport },
      { title: "Status of Jobs / Projects / TCS on Mobile App", table: report.status },
      { title: "Regional Partner Report", table: report.regionalPartnerReport },
    ];

    const cellText = (cell) => (cell && typeof cell === "object" && cell.linkPath ? `${dashboardUrl.replace(/\/$/, "")}${cell.linkPath}` : cell ?? "");
    const textFallback = sections
      .map(
        ({ title, table }) =>
          `${title}\n${table.headers.join(" | ")}\n${table.rows.map((r) => r.map(cellText).join(" | ")).join("\n")}`
      )
      .join("\n\n");

    await getTransporter().sendMail({
      from: `Brisk Olive <${gmailUser}>`,
      to,
      subject: `Daily Report (${todayStr}): Members`,
      text: textFallback,
      html: renderDailyReportEmail({
        managerName: "Jainendra Kumar Sachan",
        dashboardUrl,
        sections,
        queryTeamLabel: "Members",
        signOffName: "Jainendra Kumar Sachan",
        signOffTitle: "Members Manager",
      }),
    });

    return res.status(200).json({ ok: true, to });
  } catch (error) {
    console.error("send-daily-report error:", error);
    return res.status(500).json({ error: "Failed to send daily report.", details: String(error?.message || error) });
  }
}
