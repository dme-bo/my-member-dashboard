import nodemailer from "nodemailer";
import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { renderAllocationSummaryEmail } from "./_lib/emailTemplate.js";
import { buildAllocationSummary } from "./_lib/allocationSummaryData.js";

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

const DEFAULT_RECIPIENTS = [
  "recruitment.manager@briskolive.com",
  "recruitment.executive@briskolive.com",
  "recruitment.associate@briskolive.com",
  "members@briskolive.com",
  "projects@briskolive.com",
  "tcs@briskolive.com",
  "operations.head@briskolive.com",
  "staffing.manager@briskolive.com",
].join(", ");

const formatDate = (date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const DASHBOARD_URL = "https://my-member-dashboard.vercel.app/requirements";

// One digest, three sections — Job / Project / Temp Staffing allocations for
// today, stacked in a single email instead of three separate ones.
const CATEGORIES = [
  { key: "jobs", icon: "💼", categoryLabel: "Job Allocations", accentColor: "#1976d2" },
  { key: "projects", icon: "📁", categoryLabel: "Project Allocations", accentColor: "#7c3aed" },
  { key: "tempStaffing", icon: "🧑‍🤝‍🧑", categoryLabel: "Temp Staffing Allocations (TCS)", accentColor: "#0d9488" },
];

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

    const to = (req.method === "POST" && req.body?.to) || req.query?.to || DEFAULT_RECIPIENTS;

    const db = getAdminDb();
    const summary = await buildAllocationSummary(db);
    const todayStr = formatDate(new Date());

    const categories = CATEGORIES.map(({ key, icon, categoryLabel, accentColor }) => {
      const category = summary[key];
      return {
        icon,
        categoryLabel,
        accentColor,
        headers: category.headers,
        rows: category.rows,
        totalMembers: category.totalMembers,
        totalRequirements: category.totalRequirements,
      };
    });

    const textFallback = categories
      .map(
        ({ categoryLabel, headers, rows }) =>
          `${categoryLabel}\n${headers.join(" | ")}\n${rows.map((r) => r.join(" | ")).join("\n")}`
      )
      .join("\n\n");

    await getTransporter().sendMail({
      from: `Brisk Olive <${gmailUser}>`,
      to,
      subject: `Daily Allocation Summary (${todayStr}) — ${summary.totalAllocations} allocation${summary.totalAllocations === 1 ? "" : "s"}`,
      text: textFallback,
      html: renderAllocationSummaryEmail({
        dateStr: todayStr,
        categories,
        dashboardUrl: DASHBOARD_URL,
        signOffName: "Members Team",
      }),
    });

    return res.status(200).json({ ok: true, to, totalAllocations: summary.totalAllocations });
  } catch (error) {
    console.error("send-allocation-summary error:", error);
    return res.status(500).json({ error: "Failed to send allocation summary.", details: String(error?.message || error) });
  }
}
