import daily from "./_lib/handlers/send-daily-report.js";
import weekly from "./_lib/handlers/send-weekly-report.js";

// Daily and weekly report crons share one serverless function (Vercel Hobby
// allows at most 12). vercel.json rewrites /api/send-weekly-report to
// /api/send-daily-report?period=weekly.
export default function handler(req, res) {
  return String(req.query?.period || "") === "weekly" ? weekly(req, res) : daily(req, res);
}
