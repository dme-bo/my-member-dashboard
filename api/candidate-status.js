// Proxies the external recruitment-tracking system's candidate status feed.
// Called server-side (not directly from the browser) for two reasons: the
// upstream endpoint is plain http:// and would be blocked as mixed content
// from this site's https:// pages, and the x-api-key must stay out of the
// client bundle — same pattern as api/hr-employees.js.
const CANDIDATE_STATUS_API_URL = "http://3.110.162.1:3001/api/external/candidate-status";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.CANDIDATE_STATUS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing CANDIDATE_STATUS_API_KEY environment variable." });
    }

    const response = await fetch(CANDIDATE_STATUS_API_URL, {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Candidate status API error:", response.status, errorText);
      return res.status(502).json({ error: "Failed to fetch candidate status." });
    }

    const data = await response.json();
    const candidates = Array.isArray(data) ? data : data?.candidates || data?.data || [];

    return res.status(200).json({ candidates });
  } catch (error) {
    console.error("candidate-status error:", error);
    return res.status(500).json({ error: "Failed to fetch candidate status." });
  }
}
