import { handleFirestoreRequest } from "./_lib/firestoreHandler.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await handleFirestoreRequest(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    console.error("firestore proxy error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message || "Firestore request failed." });
  }
}
