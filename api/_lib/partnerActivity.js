// Regional partner auto-inactivation.
//
// An Active regional partner is switched to Inactive when NOTHING has happened
// for them in the last INACTIVITY_DAYS days. "Something happened" is any of:
//   - an interaction or rating logged on them  (users/{id}/interactions.createdAt;
//     notes, BO interactions and ratings all live there)
//   - an application they made in the app      (users/{id}/jobs_applied | projects_applied .applied_at)
//   - an application form matched by phone     (tcsusersmaster / jobsusersmaster .contact_number,
//                                                projectusersmaster .phone_number; .created_time)
//   - profile / tag activity on their record   (updated_time, skillsUpdatedAt, taggedAt)
//   - being marked (or re-marked) a partner    (regional_partner_marked_at)
// The last one doubles as a grace period: a newly marked or manually
// re-activated partner always gets a full INACTIVITY_DAYS before review.

export const INACTIVITY_DAYS = 90;
export const AUTO_INACTIVE_REASON = `No interaction, rating, application or activity for ${INACTIVITY_DAYS} days`;

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === "number") return seconds * 1000;
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

// Last 10 digits, so "+91 98765-43210" and "9876543210" match.
const phoneKey = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

const latest = (...values) => values.reduce((max, v) => (v !== null && v > (max ?? -Infinity) ? v : max), null);

// phone -> latest application-form time, across the three form collections.
async function latestFormApplicationByPhone(db) {
  const sources = [
    { collection: "tcsusersmaster", phoneField: "contact_number", label: "TCS application" },
    { collection: "jobsusersmaster", phoneField: "contact_number", label: "Recruitment application" },
    { collection: "projectusersmaster", phoneField: "phone_number", label: "Projects application" },
  ];
  const byPhone = new Map(); // phone -> { at, label }
  await Promise.all(
    sources.map(async ({ collection, phoneField, label }) => {
      const snap = await db.collection(collection).select(phoneField, "created_time").get();
      snap.docs.forEach((doc) => {
        const data = doc.data();
        const key = phoneKey(data[phoneField]);
        const at = toMs(data.created_time) ?? (doc.createTime ? doc.createTime.toMillis() : null);
        if (!key || at === null) return;
        const prev = byPhone.get(key);
        if (!prev || at > prev.at) byPhone.set(key, { at, label });
      });
    })
  );
  return byPhone;
}

async function latestSubcollectionTime(userRef, name, field) {
  const snap = await userRef.collection(name).get();
  let best = null;
  snap.docs.forEach((doc) => {
    const at = toMs(doc.get(field)) ?? (doc.createTime ? doc.createTime.toMillis() : null);
    best = latest(best, at);
  });
  return best;
}

// Returns every Active partner with their last activity and whether they are due.
export async function reviewActivePartners(db, { now = Date.now(), days = INACTIVITY_DAYS } = {}) {
  const cutoff = now - days * DAY_MS;
  const partnersSnap = await db.collection("users").where("is_regional_partner", "==", true).get();
  const active = partnersSnap.docs.filter((doc) => doc.get("regional_partner_status") !== "Inactive");
  if (!active.length) return { cutoff, reviewed: [] };

  const reviewed = await Promise.all(
    active.map(async (doc) => {
      const data = doc.data();
      const [interactionAt, jobAppliedAt, projectAppliedAt] = await Promise.all([
        latestSubcollectionTime(doc.ref, "interactions", "createdAt"),
        latestSubcollectionTime(doc.ref, "jobs_applied", "applied_at"),
        latestSubcollectionTime(doc.ref, "projects_applied", "applied_at"),
      ]);
      const signals = {
        markedPartner: toMs(data.regional_partner_marked_at),
        interactionOrRating: interactionAt,
        appApplication: latest(jobAppliedAt, projectAppliedAt),
        formApplication: null, // filled in below, only if needed
        profileOrTagUpdate: latest(toMs(data.updated_time), toMs(data.skillsUpdatedAt), toMs(data.taggedAt)),
      };
      return {
        id: doc.id,
        name: data.display_name || [data.first_name, data.last_name].filter(Boolean).join(" ") || doc.id,
        phones: [data.phone_number, data.phoneNumber, data.phone, data.whatsapp].map(phoneKey).filter(Boolean),
        signals,
      };
    })
  );

  const finish = (p) => {
    const lastActivityAt = latest(...Object.values(p.signals));
    // No date at all means we can't prove inactivity — leave them Active.
    return { ...p, lastActivityAt, due: lastActivityAt !== null && lastActivityAt < cutoff };
  };
  let results = reviewed.map(finish);

  // The form collections are thousands of docs; only scan them when someone
  // would otherwise be switched off (most days, nobody is).
  if (results.some((p) => p.due)) {
    const formsByPhone = await latestFormApplicationByPhone(db);
    results = reviewed.map((p) =>
      finish({ ...p, signals: { ...p.signals, formApplication: latest(...p.phones.map((ph) => formsByPhone.get(ph)?.at ?? null)) } })
    );
  }
  return { cutoff, reviewed: results };
}

// Flips the due partners to Inactive, recording when and why.
export async function inactivatePartners(db, partners, { now = new Date() } = {}) {
  if (!partners.length) return 0;
  const batch = db.batch();
  partners.forEach((p) =>
    batch.update(db.collection("users").doc(p.id), {
      regional_partner_status: "Inactive",
      regional_partner_auto_inactivated_at: now,
      regional_partner_inactive_reason: AUTO_INACTIVE_REASON,
    })
  );
  await batch.commit();
  return partners.length;
}
