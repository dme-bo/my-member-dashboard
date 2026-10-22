import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { INACTIVITY_DAYS, inactivatePartners, reviewActivePartners } from "./_lib/partnerActivity.js";

// Daily cron (vercel.json): switch Active regional partners with no
// interaction, rating, application or activity for 90 days to Inactive.
// Add ?dryRun=1 to see who would change without writing anything.
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

  const dryRun = ["1", "true"].includes(String(req.query?.dryRun ?? ""));

  try {
    const db = getAdminDb();
    const { cutoff, reviewed } = await reviewActivePartners(db);
    const due = reviewed.filter((p) => p.due);
    const changed = dryRun ? 0 : await inactivatePartners(db, due);

    const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
    return res.status(200).json({
      ok: true,
      dryRun,
      inactivityDays: INACTIVITY_DAYS,
      cutoff: iso(cutoff),
      activeReviewed: reviewed.length,
      markedInactive: changed,
      due: due.map((p) => ({ id: p.id, name: p.name, lastActivityAt: iso(p.lastActivityAt) })),
    });
  } catch (error) {
    console.error("deactivate-inactive-partners failed:", error);
    return res.status(500).json({ error: error.message || "Failed to review regional partners." });
  }
}
