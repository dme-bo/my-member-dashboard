import reminders from "./_lib/handlers/send-workshop-reminders.js";
import feedback from "./_lib/handlers/send-workshop-feedback.js";
import message from "./_lib/handlers/send-workshop-message.js";
import driveUpload from "./_lib/handlers/drive-upload.js";

// One serverless function for all workshop endpoints — Vercel Hobby allows at
// most 12 functions per deployment. vercel.json rewrites the public URLs here:
//   /api/send-workshop-reminders  -> ?action=send-workshop-reminders  (cron)
//   /api/send-workshop-feedback   -> ?action=send-workshop-feedback
//   /api/send-workshop-message    -> ?action=send-workshop-message
//   /api/drive-upload             -> ?action=drive-upload
const ACTIONS = {
  "send-workshop-reminders": reminders,
  "send-workshop-feedback": feedback,
  "send-workshop-message": message,
  "drive-upload": driveUpload,
};

export default function handler(req, res) {
  const action = ACTIONS[String(req.query?.action || "")];
  if (!action) return res.status(404).json({ error: "Unknown workshop action." });
  return action(req, res);
}
