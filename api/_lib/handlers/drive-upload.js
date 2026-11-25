import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../firebaseAdmin.js";
import { applySharing, driveConfig, ensureWorkshopFolder, getFile, isWorkshopFolder, namesInFolder, renameFile, startResumableUpload } from "../googleDrive.js";

// Workshop document uploads to Google Drive (Documents tab of a workshop).
//
// POST { action: "start", sessionId, kind, fileName, mimeType, size }
//   -> { uploadUrl, folderId }   the browser then PUTs the file to uploadUrl
// POST { action: "finish", sessionId, kind, fileId, folderId }
//   -> { document }              { id, type, title, link, driveFileId, ... } for the session
//
// Files go to <root folder>/<Title - DD MMM YYYY>/ and are named
// "Workshop Video - Title - DD MMM YYYY.ext" or "Workshop Document - Title - DD MMM YYYY.ext". See
// api/_lib/googleDrive.js for the environment variables.

const SESSIONS = "trainingsessions";
const MAX_SIZE = 5 * 1024 ** 3; // 5 GB
const KINDS = {
  "Training Video": (mime, name) => mime.startsWith("video/") || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(name),
  "Training PPT": (mime, name) => /\.(ppt|pptx|pdf|key|odp)$/i.test(name) || /presentation|powerpoint|pdf/i.test(mime),
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PREFIX = { "Training Video": "Workshop Video", "Training PPT": "Workshop Document" };

// "2026-11-27" -> "27 Nov 2026"
const formatDate = (dateStr) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  return match ? `${match[3]} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
};
const cleanName = (text) => String(text || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
const titleOf = (session) => cleanName(session.topic) || "Workshop";

// Sub-folder: "Title - 27 Nov 2026"
const folderNameFor = (session) => [titleOf(session), formatDate(session.date)].filter(Boolean).join(" - ").slice(0, 150);

// File: "Workshop Video - Title - 27 Nov 2026.mp4" / "Workshop Document - Title - 27 Nov 2026.pptx",
// with " (2)", " (3)"… when that name is already in the folder.
const fileNameFor = (session, kind, originalName, taken) => {
  const ext = (/\.([A-Za-z0-9]{1,5})$/.exec(originalName)?.[1] || "").toLowerCase();
  const base = [PREFIX[kind], titleOf(session).slice(0, 120), formatDate(session.date)].filter(Boolean).join(" - ");
  const withExt = (name) => (ext ? `${name}.${ext}` : name);
  let name = withExt(base);
  for (let n = 2; taken.has(name); n += 1) name = withExt(`${base} (${n})`);
  return name;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const config = driveConfig();
  if (config.error) return res.status(500).json({ error: config.error });

  const { action, sessionId, kind } = req.body || {};
  if (!sessionId || typeof sessionId !== "string") return res.status(400).json({ error: "Missing sessionId." });
  if (!KINDS[kind]) return res.status(400).json({ error: "Unknown document type." });

  try {
    const snap = await getAdminDb().collection(SESSIONS).doc(sessionId).get();
    if (!snap.exists) return res.status(404).json({ error: "Workshop not found." });
    const session = snap.data();

    if (action === "start") {
      const fileName = String(req.body.fileName || "").trim().slice(0, 200);
      const mimeType = String(req.body.mimeType || "application/octet-stream");
      const size = Number(req.body.size);
      if (!fileName) return res.status(400).json({ error: "Missing file name." });
      if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: "The file is empty." });
      if (size > MAX_SIZE) return res.status(400).json({ error: "The file is larger than 5 GB." });
      if (!KINDS[kind](mimeType, fileName)) {
        return res.status(400).json({ error: kind === "Training Video" ? "Choose a video file." : "Choose a PowerPoint or PDF file." });
      }

      const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : "");
      // Reuse the workshop's sub-folder (saved on the session), renaming it if
      // the workshop's title or date changed; otherwise find or create it.
      const folderName = folderNameFor(session);
      let folderId = session.driveFolderId;
      const existing = folderId ? await getFile(config, folderId).catch(() => null) : null;
      if (existing && (existing.parents || []).includes(config.folderId)) {
        if (existing.name !== folderName) await renameFile(config, folderId, folderName);
      } else {
        folderId = await ensureWorkshopFolder(config, folderName);
        await snap.ref.update({ driveFolderId: folderId });
      }
      const name = fileNameFor(session, kind, fileName, await namesInFolder(config, folderId));
      const uploadUrl = await startResumableUpload(config, { folderId, name, mimeType, size, origin });
      return res.status(200).json({ uploadUrl, folderId });
    }

    if (action === "finish") {
      const { fileId, folderId } = req.body;
      if (!fileId || !folderId) return res.status(400).json({ error: "Missing fileId or folderId." });
      const file = await getFile(config, fileId);
      // Only act on files that were just uploaded into a workshop folder.
      if (!(file.parents || []).includes(folderId) || !(await isWorkshopFolder(config, folderId))) {
        return res.status(400).json({ error: "That file is not in the workshop uploads folder." });
      }
      const shareError = await applySharing(config, file.id);
      // Saved here, atomically, rather than by the browser rewriting the whole
      // list — two uploads finishing together used to overwrite each other.
      const already = (session.documents || []).find((d) => d.driveFileId === file.id);
      const document = already || {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: kind,
        title: file.name,
        link: file.webViewLink,
        driveFileId: file.id,
        mimeType: file.mimeType,
        size: Number(file.size) || null,
        addedAt: new Date().toISOString(),
      };
      if (!already) await snap.ref.update({ documents: FieldValue.arrayUnion(document) });
      return res.status(200).json({ document, shareError });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (error) {
    console.error("drive-upload error:", error);
    return res.status(500).json({ error: error.message || "Google Drive upload failed." });
  }
}
