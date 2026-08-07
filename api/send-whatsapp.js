const DEFAULT_API_URL = "https://wa.viralmarketingtools.in/api/send";

const toWhatsAppNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, message } = req.body || {};

    if (!to || !message) {
      return res.status(400).json({ error: "Missing to or message." });
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const instanceId = process.env.WHATSAPP_INSTANCE_ID;
    const apiUrl = process.env.WHATSAPP_API_URL || DEFAULT_API_URL;

    if (!accessToken || !instanceId) {
      return res.status(500).json({
        error: "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_INSTANCE_ID environment variable.",
      });
    }

    const number = toWhatsAppNumber(to);
    if (!number) {
      return res.status(400).json({ error: "Invalid phone number." });
    }

    // --- Provider-specific request shape ---
    // This is the standard query-param format used by this class of bulk-WhatsApp
    // gateway (instance_id/access_token/number/message). If wa.viralmarketingtools.in
    // expects a different shape (e.g. JSON body, different param names), this is the
    // only block that needs to change.
    const params = new URLSearchParams({
      number,
      type: "text",
      message,
      instance_id: instanceId,
      access_token: accessToken,
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`, { method: "GET" });
    const responseText = await response.text();

    if (!response.ok) {
      console.error("WhatsApp API error:", response.status, responseText);
      return res.status(502).json({ error: "WhatsApp API request failed." });
    }

    return res.status(200).json({ ok: true, providerResponse: responseText });
  } catch (error) {
    console.error("send-whatsapp error:", error);
    return res.status(500).json({ error: "Failed to send WhatsApp message." });
  }
}
