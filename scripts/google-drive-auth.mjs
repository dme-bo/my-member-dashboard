// One-time Google sign-in so the dashboard can upload workshop files to Google
// Drive as a real user (e.g. dme@briskolive.com) instead of a service account.
//
//   node scripts/google-drive-auth.mjs <path to OAuth client JSON>
//
// The JSON is an OAuth client of type "Desktop app" (Google Cloud Console ->
// APIs & Services -> Credentials -> Create credentials -> OAuth client ID).
// The script opens the Google sign-in page, catches the answer on a local
// port, and writes GOOGLE_DRIVE_OAUTH_CLIENT_ID / _SECRET / GOOGLE_DRIVE_REFRESH_TOKEN
// into .env.local (it never prints the secret or the token). Copy the same
// three values into Vercel -> Settings -> Environment Variables.
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env.local");
const clientFile = process.argv[2];
if (!clientFile) {
  console.error("Usage: node scripts/google-drive-auth.mjs <path to OAuth client JSON>");
  process.exit(1);
}

const json = JSON.parse(fs.readFileSync(clientFile, "utf8"));
const client = json.installed || json.web;
if (!client?.client_id || !client?.client_secret) {
  console.error('That file is not an OAuth client. Create one of type "Desktop app" and download its JSON.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const verifier = crypto.randomBytes(32).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

function saveEnv(values) {
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  fs.writeFileSync(envFile, text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname !== "/") return res.writeHead(404).end();
  const finish = (message, ok) => {
    res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
    res.end(`<p style="font-family:sans-serif;font-size:16px">${message}</p>`);
    console.log(message);
    server.close();
    if (!ok) process.exitCode = 1;
  };
  if (url.searchParams.get("state") !== state) return finish("Sign-in failed: state mismatch. Run the script again.", false);
  if (url.searchParams.get("error")) return finish(`Sign-in cancelled: ${url.searchParams.get("error")}`, false);

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: url.searchParams.get("code") || "",
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    const body = await response.json();
    if (!body.refresh_token) throw new Error(body.error_description || body.error || "Google returned no refresh token.");

    saveEnv({
      GOOGLE_DRIVE_OAUTH_CLIENT_ID: client.client_id,
      GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: client.client_secret,
      GOOGLE_DRIVE_REFRESH_TOKEN: body.refresh_token,
    });

    // Check the upload folder is reachable with the new sign-in.
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID = client.client_id;
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = client.client_secret;
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = body.refresh_token;
    const { driveConfig, getFile } = await import(pathToFileURL(path.join(here, "..", "api", "_lib", "googleDrive.js")).href);
    const config = driveConfig();
    let check;
    try {
      const folder = await getFile(config, config.folderId);
      check = `Upload folder found: "${folder.name}".`;
    } catch (error) {
      check = `Saved, but the upload folder could not be opened: ${error.message}`;
    }
    finish(`Done — Google Drive sign-in saved to .env.local. ${check} You can close this tab.`, true);
  } catch (error) {
    finish(`Sign-in failed: ${error.message}`, false);
  }
});

let redirectUri = "";
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive",
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
  console.log("\nOpen this link, sign in with the Google account that can upload to the Drive folder, and allow access:\n");
  console.log(authUrl + "\n");
  if (process.platform === "win32") execFile("rundll32", ["url.dll,FileProtocolHandler", authUrl], () => {});
  else execFile(process.platform === "darwin" ? "open" : "xdg-open", [authUrl], () => {});
});
