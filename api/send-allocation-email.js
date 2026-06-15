const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.ALLOCATION_EMAIL_FROM || "Brisk Olive <onboarding@resend.dev>";

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing RESEND_API_KEY environment variable.",
      });
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text: body,
        html: `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${escapeHtml(body)}</pre>`,
      }),
    });

    const responseText = await emailResponse.text();
    if (!emailResponse.ok) {
      return res.status(emailResponse.status).send(responseText || "Failed to send email.");
    }

    return res.status(200).json({
      ok: true,
      result: responseText ? JSON.parse(responseText) : null,
    });
  } catch (error) {
    console.error("send-allocation-email error:", error);
    return res.status(500).json({ error: "Failed to send allocation email." });
  }
}
