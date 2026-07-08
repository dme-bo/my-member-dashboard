const ONBOARDING_API_URL = "http://hr.briskolive.com:5000/api/onboarding";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const email = normalizeEmail(req.query.email);
  if (!email) {
    return res.status(400).json({ ok: false, error: "Missing email." });
  }

  try {
    const response = await fetch(ONBOARDING_API_URL);
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: "Onboarding API unavailable." });
    }

    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.data || [];

    const match = records.find(
      (record) =>
        normalizeEmail(record.officialEmail) === email ||
        normalizeEmail(record.persEmail) === email
    );

    if (!match) {
      return res.status(200).json({ ok: false });
    }

    return res.status(200).json({ ok: true, email, name: match.name || "" });
  } catch (error) {
    console.error("verify-login error:", error);
    return res.status(500).json({ ok: false, error: "Failed to verify login." });
  }
}
