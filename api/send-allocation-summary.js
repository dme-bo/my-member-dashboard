import nodemailer from "nodemailer";
import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { renderAllocationCategoryEmail } from "./_lib/emailTemplate.js";
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

const DEFAULT_RECIPIENT = "dme@briskolive.com";

const formatDate = (date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// One category, one email, one distinct look — easier to scan at a glance
// than a single combined report.
const CATEGORIES = [
  { key: "jobs", icon: "💼", categoryLabel: "Job Allocations", accentColor: "#1976d2", accentColorDark: "#0d47a1" },
  { key: "projects", icon: "📁", categoryLabel: "Project Allocations", accentColor: "#7c3aed", accentColorDark: "#5b21b6" },
  { key: "tempStaffing", icon: "🧑‍🤝‍🧑", categoryLabel: "Temp Staffing Allocations (TCS)", accentColor: "#0d9488", accentColorDark: "#0f766e" },
];

// Three separate, attractively-themed digests replace the old per-allocation
// emails for Jobs, Projects and Temp Staffing — everything allocated today
// in each category, as its own email, instead of one email per allocation.
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
    const summary = await buildAllocationSummary(db);
    const todayStr = formatDate(new Date());
    const transporter = getTransporter();

    const results = await Promise.all(
      CATEGORIES.map(async ({ key, icon, categoryLabel, accentColor, accentColorDark }) => {
        const category = summary[key];
        await transporter.sendMail({
          from: `Brisk Olive <${gmailUser}>`,
          to,
          subject: `${categoryLabel} — ${todayStr} (${category.totalMembers} member${category.totalMembers === 1 ? "" : "s"})`,
          text: `${categoryLabel}\n${category.headers.join(" | ")}\n${category.rows.map((r) => r.join(" | ")).join("\n")}`,
          html: renderAllocationCategoryEmail({
            icon,
            categoryLabel,
            dateStr: todayStr,
            accentColor,
            accentColorDark,
            headers: category.headers,
            rows: category.rows,
            totalMembers: category.totalMembers,
            totalRequirements: category.totalRequirements,
            signOffName: "Brisk Olive Dashboard",
          }),
        });
        return { category: key, totalRequirements: category.totalRequirements, totalMembers: category.totalMembers };
      })
    );

    return res.status(200).json({ ok: true, to, totalAllocations: summary.totalAllocations, results });
  } catch (error) {
    console.error("send-allocation-summary error:", error);
    return res.status(500).json({ error: "Failed to send allocation summary.", details: String(error?.message || error) });
  }
}
