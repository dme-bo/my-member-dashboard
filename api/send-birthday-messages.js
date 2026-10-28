import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_lib/firebaseAdmin.js";
import {
  LOG_COLLECTION,
  RUNS_COLLECTION,
  birthMonthDay,
  isBirthdayToday,
  istDateKey,
  istParts,
  msg91RequestId,
  smsLogEntries,
  toMsg91Mobile,
} from "./_lib/birthday.js";

// Daily cron (vercel.json, 08:00 IST = 02:30 UTC): SMS a birthday wish through
// MSG91 to every member in `users` whose `dateofbirth` is today.
//
// Safe by default:
//   * Nothing is sent unless BIRTHDAY_SMS_LIVE=true. Without it this only lists
//     who WOULD be messaged (same as ?dryRun=1).
//   * Nothing is ever written to `users`. Before sending, today's
//     `birthday_sms_log` is read and anyone already accepted today is skipped, so a
//     re-run or a double cron fire never texts anyone twice.
//   * ?testTo=<10-digit mobile> sends ONE message to that number only and
//     touches no member records.
//   * Every send attempt is logged: one document per recipient in
//     `birthday_sms_log` (who, when, MSG91 request id, accepted/failed) and a
//     per-day summary in `birthday_sms_runs`. A logging failure never stops or
//     repeats a send.
//
// Environment (MSG91_AUTH_KEY plus ONE of the two ways to name the template):
//   A) MSG91_TEMPLATE_ID: the MSG91 template id (sender + wording live in the
//      template; uses MSG91's template/"flow" API).
//   B) MSG91_DLT_TEMPLATE_ID + MSG91_SENDER_ID + MSG91_SMS_TEMPLATE: the DLT
//      template id, sender and the exact approved text (uses MSG91's text SMS
//      API; optional MSG91_ROUTE, default 4).
// Optional MSG91_COUNTRY (91) and CRON_SECRET (same check as the other crons).

const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow/";
const CHUNK_SIZE = 100;
const USER_FIELDS = [
  "dateofbirth", "date_of_birth", "dob", "DOB", "Dob",
  "phone_number", "phone", "mobile", "contact_number", "mobile_number",
  "full_name", "name",
];

const firstValue = (data, keys) => {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const MSG91_TEXT_URL = "https://api.msg91.com/api/sendhttp.php";

// Which MSG91 API to use, from the environment. Returns { mode, ... } or { error }.
function msg91Config(env = process.env) {
  const authKey = env.MSG91_AUTH_KEY;
  if (!authKey) return { error: "Missing MSG91_AUTH_KEY environment variable." };
  if (env.MSG91_TEMPLATE_ID) return { mode: "flow", authKey, templateId: env.MSG91_TEMPLATE_ID };
  if (env.MSG91_DLT_TEMPLATE_ID && env.MSG91_SENDER_ID && env.MSG91_SMS_TEMPLATE) {
    return {
      mode: "text",
      authKey,
      dltTemplateId: env.MSG91_DLT_TEMPLATE_ID,
      sender: env.MSG91_SENDER_ID,
      route: env.MSG91_ROUTE || "4",
      country: env.MSG91_COUNTRY || "91",
      // The text must match the approved DLT template exactly. A literal backslash-n
      // typed into the env var becomes a real line break.
      message: String(env.MSG91_SMS_TEMPLATE).replace(/\\n/g, "\n"),
    };
  }
  return {
    error:
      "Set MSG91_TEMPLATE_ID, or MSG91_DLT_TEMPLATE_ID + MSG91_SENDER_ID + MSG91_SMS_TEMPLATE (plus MSG91_AUTH_KEY).",
  };
}

async function sendSms(config, mobiles) {
  return config.mode === "flow" ? sendViaMsg91Flow({ authKey: config.authKey, templateId: config.templateId, mobiles }) : sendViaMsg91Text({ config, mobiles });
}

async function sendViaMsg91Text({ config, mobiles }) {
  const params = new URLSearchParams({
    authkey: config.authKey,
    mobiles: mobiles.join(","),
    message: config.message,
    sender: config.sender,
    route: config.route,
    country: config.country,
    DLT_TE_ID: config.dltTemplateId,
  });
  const response = await fetch(`${MSG91_TEXT_URL}?${params.toString()}`);
  const text = (await response.text()).trim();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  // Success is a bare request id (e.g. "3566...e2a1"); failures are JSON with type "error" or plain text.
  const looksLikeId = /^[A-Za-z0-9]{16,}$/.test(text);
  const ok = response.ok && (looksLikeId || body?.type === "success");
  return { ok, status: response.status, body };
}

async function sendViaMsg91Flow({ authKey, templateId, mobiles }) {
  const response = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      template_id: templateId,
      short_url: "0",
      recipients: mobiles.map((mobile) => ({ mobiles: mobile })),
    }),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  // MSG91 answers { type: "success", message: "<request id>" } or { type: "error", ... }
  const ok = response.ok && body?.type !== "error";
  return { ok, status: response.status, body };
}

export default async function handler(req, res) {
  // Vercel Cron sends GET; allow POST too for manual/local testing.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization || "";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const country = process.env.MSG91_COUNTRY || "91";
  const live = process.env.BIRTHDAY_SMS_LIVE === "true";
  const dryRun = ["1", "true"].includes(String(req.query?.dryRun ?? "")) || !live;
  const testTo = String(req.query?.testTo ?? "").trim();

  try {
    const config = msg91Config();

    // One-off test message to a single number; no member data is read or changed.
    if (testTo) {
      if (config.error) return res.status(500).json({ error: config.error });
      const mobile = toMsg91Mobile(testTo, country);
      if (!mobile) return res.status(400).json({ error: "testTo is not a valid mobile number." });
      const result = await sendSms(config, [mobile]);
      let logError = "";
      try {
        const entry = {
          date: istDateKey(),
          memberId: null,
          name: "(test message)",
          mobile,
          status: result.ok ? "accepted" : "failed",
          msg91RequestId: result.ok ? msg91RequestId(result.body) : "",
          error: result.ok ? "" : JSON.stringify(result.body ?? {}).slice(0, 500),
          httpStatus: result.status ?? null,
          mode: config.mode,
          trigger: "test",
          sentAt: FieldValue.serverTimestamp(),
        };
        await getAdminDb().collection(LOG_COLLECTION).add(entry);
      } catch (error) {
        logError = error.message;
      }
      return res.status(result.ok ? 200 : 502).json({ ok: result.ok, test: true, mode: config.mode, to: mobile, msg91: result.body, ...(logError ? { logError } : {}) });
    }

    const todayKey = istDateKey();
    const today = istParts(new Date());
    const db = getAdminDb();
    const snapshot = await db.collection("users").select(...USER_FIELDS).get();

    // Who was already messaged today (accepted by MSG91), from the log — the only
    // record of sends, so the users collection stays untouched.
    const loggedToday = await db.collection(LOG_COLLECTION).where("date", "==", todayKey).where("status", "==", "accepted").get();
    const messagedIds = new Set(loggedToday.docs.map((doc) => doc.data()?.memberId).filter(Boolean));

    const due = [];
    let alreadySent = 0;
    let noValidPhone = 0;
    snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const dob = birthMonthDay(firstValue(data, ["dateofbirth", "date_of_birth", "dob", "DOB", "Dob"]));
      if (!isBirthdayToday(dob, today)) return;
      if (messagedIds.has(doc.id)) {
        alreadySent += 1;
        return;
      }
      const mobile = toMsg91Mobile(firstValue(data, ["phone_number", "phone", "mobile", "contact_number", "mobile_number"]), country);
      if (!mobile) {
        noValidPhone += 1;
        return;
      }
      due.push({ id: doc.id, mobile, name: firstValue(data, ["full_name", "name"]) || "" });
    });

    // The same phone can be on more than one member record: text it once, but
    // stamp every record that shares it so a re-run does not text it again.
    const byMobile = new Map();
    due.forEach((member) => {
      const entry = byMobile.get(member.mobile);
      if (entry) entry.ids.push(member.id);
      else byMobile.set(member.mobile, { mobile: member.mobile, name: member.name, id: member.id, ids: [member.id] });
    });
    const recipients = [...byMobile.values()];

    const summary = {
      ok: true,
      dryRun,
      live,
      date: todayKey,
      usersScanned: snapshot.size,
      birthdaysToday: due.length + alreadySent + noValidPhone,
      alreadySent,
      noValidPhone,
      toSend: recipients.length,
    };

    if (dryRun) {
      return res.status(200).json({
        ...summary,
        note: live ? "dryRun requested — nothing was sent." : "BIRTHDAY_SMS_LIVE is not 'true' — nothing was sent.",
        // Mask the numbers: this response can end up in logs.
        recipients: recipients.map((member) => ({ id: member.id, name: member.name, mobile: `${member.mobile.slice(0, 4)}XXXX${member.mobile.slice(-2)}` })),
      });
    }

    if (config.error) return res.status(500).json({ error: config.error });

    const trigger = req.headers?.["user-agent"]?.startsWith("vercel-cron") ? "cron" : "manual";
    const logErrors = [];
    // The log is also the "already messaged today" record, so a failed write is retried once.
    const writeLog = async (chunk, result) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const batch = db.batch();
          smsLogEntries({ chunk, result, todayKey, trigger, mode: config.mode, sentAt: FieldValue.serverTimestamp() }).forEach(({ id, data }) =>
            batch.set(db.collection(LOG_COLLECTION).doc(id), data)
          );
          await batch.commit();
          return;
        } catch (error) {
          if (attempt === 2) logErrors.push(error.message);
        }
      }
    };

    let sent = 0;
    const failures = [];
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      const result = await sendSms(config, chunk.map((member) => member.mobile));
      await writeLog(chunk, result);
      if (!result.ok) {
        failures.push({ from: i, count: chunk.length, status: result.status, msg91: result.body });
        continue;
      }
      // A failed chunk is logged as "failed" and is retried by the next run; an
      // accepted one is recorded in the log above, which is what stops a repeat.
      sent += chunk.length;
    }

    try {
      await db.collection(RUNS_COLLECTION).doc(todayKey).set(
        { date: todayKey, trigger, mode: config.mode, usersScanned: snapshot.size, toSend: recipients.length, sent, failed: recipients.length - sent, ranAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      logErrors.push(error.message);
    }

    return res
      .status(failures.length ? 207 : 200)
      .json({ ...summary, sent, failed: recipients.length - sent, failures, ...(logErrors.length ? { logErrors } : {}) });
  } catch (error) {
    console.error("send-birthday-messages failed:", error);
    return res.status(500).json({ error: error.message || "Failed to send birthday messages." });
  }
}
