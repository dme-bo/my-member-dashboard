// Minimal Google Drive client for workshop uploads (no extra dependency).
// Two ways to sign in:
//   1. A real Google user (preferred when set) — files are uploaded as that user,
//      into any folder they can upload to:
//        GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET (an OAuth
//        "Desktop app" client) and GOOGLE_DRIVE_REFRESH_TOKEN (from running
//        `node scripts/google-drive-auth.mjs <client.json>` once).
//   2. A service account (JWT signed with node:crypto), configured below.
//
// Environment:
//   GOOGLE_DRIVE_FOLDER_ID     optional (defaults to DEFAULT_FOLDER_ID below) folder the
//                              workshop sub-folders go into. Service
//                              accounts have no storage of their own, so this must be
//                              in a Shared Drive the service account is a member of
//                              (Content manager), unless GOOGLE_DRIVE_IMPERSONATE is set.
//   GOOGLE_DRIVE_CLIENT_EMAIL  service account email   } default to the Firebase
//   GOOGLE_DRIVE_PRIVATE_KEY   service account key     } FIREBASE_CLIENT_EMAIL / _PRIVATE_KEY
//   GOOGLE_DRIVE_IMPERSONATE   optional: a Workspace user to act as (needs domain-wide
//                              delegation for the drive scope); files then use their storage.
//   GOOGLE_DRIVE_SHARE         optional: "anyone" (anyone with the link can view) or
//                              "domain:example.com" (anyone in that domain can view).
//                              Unset = only people with access to the folder can open files.
import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
// The Brisk Olive workshops Shared Drive folder; GOOGLE_DRIVE_FOLDER_ID overrides it.
const DEFAULT_FOLDER_ID = "12_BzrcGkllBwFYNwguKSIzKaNaPvcLXj";

let cachedToken = null; // { token, expiresAt }

export function driveConfig(env = process.env) {
  const folderId = env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID;
  const share = env.GOOGLE_DRIVE_SHARE || "";
  if (!folderId) return { error: "Google Drive is not set up: missing GOOGLE_DRIVE_FOLDER_ID." };

  // Preferred when set: act as a real Google user (signed in once with
  // scripts/google-drive-auth.mjs), so no Shared Drive membership is needed.
  if (env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    if (!env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || !env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET) {
      return { error: "Google Drive is not set up: missing GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET." };
    }
    return {
      folderId,
      share,
      oauth: { clientId: env.GOOGLE_DRIVE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN },
    };
  }

  const clientEmail = env.GOOGLE_DRIVE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = String(env.GOOGLE_DRIVE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) return { error: "Google Drive is not set up: missing service account credentials." };
  return { folderId, clientEmail, privateKey, impersonate: env.GOOGLE_DRIVE_IMPERSONATE || "", share };
}

async function accessToken(config) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (config.oauth) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: config.oauth.refreshToken,
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      throw new Error(`Google sign-in expired or was revoked (${body.error_description || body.error || response.status}). Run scripts/google-drive-auth.mjs again.`);
    }
    cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: config.clientEmail, scope: "https://www.googleapis.com/auth/drive", aud: TOKEN_URL, iat: now, exp: now + 3600 };
  if (config.impersonate) claims.sub = config.impersonate;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(config.privateKey, "base64url");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Google auth failed: ${body.error_description || body.error || response.status}`);
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function driveFetch(config, url, options = {}) {
  const token = await accessToken(config);
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Google Drive error ${response.status}: ${body.error?.message || response.statusText}`);
  }
  return response;
}

const ALL_DRIVES = "supportsAllDrives=true";
const quote = (text) => String(text).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// The sub-folder for one workshop inside the root folder, created if missing.
export async function ensureWorkshopFolder(config, name) {
  const q = `'${quote(config.folderId)}' in parents and name = '${quote(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const search = await driveFetch(
    config,
    // corpora=allDrives: without it, files.list does not look inside Shared Drives.
    `${API}/files?${ALL_DRIVES}&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&pageSize=1&q=${encodeURIComponent(q)}`
  );
  const found = (await search.json()).files?.[0];
  if (found) return found.id;
  const created = await driveFetch(config, `${API}/files?${ALL_DRIVES}&fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [config.folderId] }),
  });
  return (await created.json()).id;
}

// Starts a resumable upload and returns the session URL the browser PUTs the
// file to directly (Vercel functions cannot take large request bodies).
// `origin` must be the site's origin so Google allows the browser upload (CORS).
export async function startResumableUpload(config, { folderId, name, mimeType, size, origin }) {
  const response = await driveFetch(config, `${UPLOAD_API}/files?uploadType=resumable&${ALL_DRIVES}&fields=id,name`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
      "x-upload-content-length": String(size),
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("Google Drive did not return an upload URL.");
  return uploadUrl;
}

export async function getFile(config, fileId) {
  const response = await driveFetch(
    config,
    `${API}/files/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id,name,mimeType,size,webViewLink,parents`
  );
  return response.json();
}

export async function renameFile(config, fileId, name) {
  await driveFetch(config, `${API}/files/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

// Names already used by files (not in the bin) in a folder.
export async function namesInFolder(config, folderId) {
  const q = `'${quote(folderId)}' in parents and trashed = false`;
  const response = await driveFetch(
    config,
    `${API}/files?${ALL_DRIVES}&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(name)&pageSize=1000&q=${encodeURIComponent(q)}`
  );
  return new Set(((await response.json()).files || []).map((f) => f.name));
}

// Is `folderId` a direct child of the configured root folder?
export async function isWorkshopFolder(config, folderId) {
  const folder = await getFile(config, folderId);
  return (folder.parents || []).includes(config.folderId);
}

// Applies GOOGLE_DRIVE_SHARE to a file. A refused share (e.g. a Shared Drive
// that blocks link sharing) is reported but does not fail the upload.
export async function applySharing(config, fileId) {
  if (!config.share) return null;
  const permission =
    config.share === "anyone"
      ? { type: "anyone", role: "reader" }
      : config.share.startsWith("domain:")
        ? { type: "domain", role: "reader", domain: config.share.slice(7) }
        : null;
  if (!permission) return "Unknown GOOGLE_DRIVE_SHARE value.";
  try {
    await driveFetch(config, `${API}/files/${encodeURIComponent(fileId)}/permissions?${ALL_DRIVES}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(permission),
    });
    return null;
  } catch (error) {
    console.error("Drive sharing failed:", error);
    return error.message;
  }
}
