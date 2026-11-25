// src/components/WorkshopDocumentsTab.jsx
// Documents tab of the workshop detail modal: upload the training video / PPT
// to Google Drive (via /api/drive-upload), list and remove
// documents, and email the documents to the team.
//
// Upload flow: the server opens a resumable Drive upload, the browser PUTs the
// file straight to Google (large videos never pass through our server), then
// the server saves the Drive link on the session's `documents` array (an
// atomic arrayUnion, so parallel uploads cannot overwrite each other).
import { useEffect, useRef, useState } from "react";
import { FaCloudUploadAlt, FaExternalLinkAlt, FaTimes, FaEnvelope, FaVideo, FaFilePowerpoint } from "react-icons/fa";
import { formatDateTimeDDMMMYYYY } from "../utils/dateFormat";
import useConfirm from "./useConfirm";


const UPLOADS = [
  { kind: "Training Video", label: "Upload training video", accept: "video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v", icon: <FaVideo size={26} /> },
  { kind: "Training PPT", label: "Upload training PPT", accept: ".ppt,.pptx,.pdf,.odp,.key", icon: <FaFilePowerpoint size={26} /> },
];

const MIME_BY_EXT = {
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  odp: "application/vnd.oasis.opendocument.presentation",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  webm: "video/webm",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
};
const mimeOf = (file) => file.type || MIME_BY_EXT[file.name.split(".").pop().toLowerCase()] || "application/octet-stream";

const formatSize = (bytes) => {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
};

async function postDrive(body) {
  const response = await fetch("/api/drive-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Google Drive upload failed.");
  return data;
}

// PUT the file to the resumable session URL, reporting progress (0–100).
function putToDrive(uploadUrl, file, mimeType, onProgress, xhrRef) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText).id);
        } catch {
          reject(new Error("Upload finished but Google Drive returned no file id."));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export default function WorkshopDocumentsTab({ session, onPatch, onDocumentAdded, onEmailTeam, sendingTeamEmail }) {
  const documents = session.documents || [];
  const [uploads, setUploads] = useState([]); // [{ key, kind, name, size, progress, status, error }]
  const [saving, setSaving] = useState(false);
  const inputs = useRef({});
  const xhrs = useRef({});
  const startChain = useRef(Promise.resolve());
  const [confirm, confirmDialog] = useConfirm();

  // Uploads finish asynchronously, so append to the newest list, not the one
  // from when the upload started.
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = session.documents || [];
  }, [session.documents]);

  // Stop uploads if the modal closes mid-way.
  useEffect(() => () => Object.values(xhrs.current).forEach((ref) => ref.current?.abort()), []);

  const updateUpload = (key, fields) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...fields } : u)));

  const saveDocuments = async (next) => {
    documentsRef.current = next;
    await onPatch(session.id, { documents: next });
  };

  const uploadFile = async (kind, file) => {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const mimeType = mimeOf(file);
    xhrs.current[key] = { current: null };
    setUploads((prev) => [...prev, { key, kind, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
    try {
      // One "start" at a time, so two files picked together cannot both create
      // the workshop's sub-folder.
      const started = startChain.current.then(() =>
        postDrive({ action: "start", sessionId: session.id, kind, fileName: file.name, mimeType, size: file.size })
      );
      startChain.current = started.catch(() => {});
      const { uploadUrl, folderId } = await started;
      const fileId = await putToDrive(uploadUrl, file, mimeType, (progress) => updateUpload(key, { progress }), xhrs.current[key]);
      updateUpload(key, { progress: 100, status: "saving" });
      const { document, shareError } = await postDrive({ action: "finish", sessionId: session.id, kind, fileId, folderId });
      // The server already saved it on the workshop; just show it here.
      onDocumentAdded(session.id, document);
      updateUpload(key, { status: "done", error: shareError ? `Uploaded, but sharing could not be set: ${shareError}` : "" });
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.key !== key || u.error)), 4000);
    } catch (error) {
      updateUpload(key, { status: "error", error: error.message });
    } finally {
      delete xhrs.current[key];
    }
  };

  const onPick = (kind) => (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    files.forEach((file) => uploadFile(kind, file));
  };

  const removeDocument = async (document) => {
    const ok = await confirm({
      title: "Remove document?",
      message: `"${document.title || document.type}" will be removed from this workshop.${document.driveFileId ? "\nThe file stays in Google Drive." : ""}`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await saveDocuments(documentsRef.current.filter((d) => d.id !== document.id));
    } finally {
      setSaving(false);
    }
  };

  const busyUploading = uploads.some((u) => u.status === "uploading" || u.status === "saving");

  return (
    <>
      <style>{`
        .wdt-uploads { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
        .wdt-drop { display: flex; align-items: center; gap: 12px; border: 1.5px dashed #c2d45e; border-radius: 10px; padding: 16px; background: #fafcef; cursor: pointer; text-align: left; font: inherit; color: #243014; }
        .wdt-drop:hover { background: #f1f6d6; }
        .wdt-drop b { display: block; font-size: 14px; }
        .wdt-drop span { font-size: 12px; color: #64748b; }
        .wdt-progress { margin-top: 12px; }
        .wdt-progress-row { font-size: 13px; color: #334155; margin-top: 8px; }
        .wdt-bar { height: 6px; background: #e5eaf1; border-radius: 999px; overflow: hidden; margin-top: 4px; }
        .wdt-bar div { height: 100%; background: #5f6f14; transition: width .2s; }
        .wdt-err { color: #b91c1c; font-size: 12px; margin-top: 4px; }
        .wdt-list-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #eef1f5; }
        .wdt-list-row:first-child { border-top: none; }
        .wdt-badge { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #f1f6d6; color: #5f6f14; }
        .wdt-title { flex: 1; min-width: 0; font-size: 14px; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wdt-meta { font-size: 12px; color: #64748b; white-space: nowrap; }
        .wdt-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
        .wdt-card-head h4 { margin: 0; }
        .wdt-folder-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #1976d2; text-decoration: none; }
        .wdt-folder-link:hover { text-decoration: underline; }
        .wdt-icon { border: none; background: none; color: #475569; cursor: pointer; padding: 4px; display: inline-flex; }
      `}</style>

      <div className="wsd-card">
        <h4>Upload to Google Drive</h4>
        <p>Files are saved to the shared Google Drive, in a sub-folder for this workshop, and listed below.</p>
        <div className="wdt-uploads">
          {UPLOADS.map(({ kind, label, accept, icon }) => (
            <button key={kind} type="button" className="wdt-drop" onClick={() => inputs.current[kind]?.click()}>
              {icon}
              <div>
                <b>{label}</b>
                <span>{kind === "Training Video" ? "MP4, MOV, MKV, WEBM…" : "PPT, PPTX or PDF"} · up to 5 GB</span>
              </div>
              <input ref={(el) => (inputs.current[kind] = el)} type="file" accept={accept} multiple hidden onChange={onPick(kind)} />
            </button>
          ))}
        </div>
        {uploads.length > 0 && (
          <div className="wdt-progress" aria-live="polite">
            {uploads.map((u) => (
              <div key={u.key} className="wdt-progress-row">
                <FaCloudUploadAlt size={12} style={{ marginRight: 6 }} />
                {u.name} <span className="wdt-meta">({formatSize(u.size)})</span> —{" "}
                {u.status === "uploading" ? `${u.progress}%` : u.status === "saving" ? "saving…" : u.status === "done" ? "uploaded" : "failed"}
                {u.status === "uploading" && (
                  <button type="button" className="wdt-icon" title="Cancel upload" onClick={() => xhrs.current[u.key]?.current?.abort()}>
                    <FaTimes size={11} />
                  </button>
                )}
                {(u.status === "error" || u.error) && (
                  <button type="button" className="wdt-icon" title="Dismiss" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}>
                    <FaTimes size={11} />
                  </button>
                )}
                {(u.status === "uploading" || u.status === "saving") && (
                  <div className="wdt-bar"><div style={{ width: `${u.progress}%` }} /></div>
                )}
                {u.error && <div className="wdt-err">{u.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wsd-card">
        <div className="wdt-card-head">
          <h4>Uploaded documents ({documents.length})</h4>
          {session.driveFolderId && (
            <a className="wdt-folder-link" href={`https://drive.google.com/drive/folders/${session.driveFolderId}`} target="_blank" rel="noopener noreferrer">
              <FaExternalLinkAlt size={11} /> Open folder in Google Drive
            </a>
          )}
        </div>
        {documents.length === 0 ? (
          <p style={{ marginBottom: 0 }}>Nothing uploaded yet. Files you upload above appear here.</p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {documents.map((document) => (
              <div key={document.id || document.link} className="wdt-list-row">
                <span className="wdt-badge">{document.type}</span>
                <span className="wdt-title" title={document.title}>{document.title || document.type}</span>
                <span className="wdt-meta">
                  {[formatSize(document.size), document.addedAt ? formatDateTimeDDMMMYYYY(document.addedAt) : ""].filter(Boolean).join(" · ")}
                </span>
                {document.link && (
                  <a className="wdt-icon" href={document.link} target="_blank" rel="noopener noreferrer" title="Open">
                    <FaExternalLinkAlt size={13} />
                  </a>
                )}
                <button type="button" className="wdt-icon" onClick={() => removeDocument(document)} disabled={saving || busyUploading} title={busyUploading ? "Wait for uploads to finish" : "Remove"}>
                  <FaTimes size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wsd-card">
        <h4>Email documents to the team</h4>
        <p>Sends the Training Video and Training PPT links to the team emails in the workshop's details.</p>
        <div className="wsd-actions" style={{ marginTop: 0, alignItems: "center" }}>
          <button type="button" className="wsd-btn primary" onClick={() => onEmailTeam(session)} disabled={sendingTeamEmail || busyUploading}>
            <FaEnvelope size={12} /> {sendingTeamEmail ? "Sending…" : "Email documents to team"}
          </button>
          {session.emailSentAt && <span style={{ fontSize: 12, color: "#64748b" }}>Last sent {formatDateTimeDDMMMYYYY(session.emailSentAt)}</span>}
        </div>
      </div>
      {confirmDialog}
    </>
  );
}
