const MONTH_LOOKUP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Legacy `users` records were imported from several CSV batches over time,
// so the "when was this member added" value can live under any of these
// keys and can be a plain string, an ISO date, or a real Firestore Timestamp.
const ENTRY_DATE_FIELDS = [
  "entry_date", "registration_date", "Entry Date", "Registration Date",
  "created_time", "createdAt", "created_at", "Created Time", "CreatedAt", "Created At",
];

function firstPresentValue(data, keys) {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function parseLooseDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === "function") {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dMonY = text.match(/^(\d{1,2})[- ]([A-Za-z]{3,})[- ](\d{4})/);
  if (dMonY) {
    const month = MONTH_LOOKUP[dMonY[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const parsed = new Date(Number(dMonY[3]), month, Number(dMonY[1]));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function countNewMembersToday(db, today) {
  const snapshot = await db.collection("users").select(...ENTRY_DATE_FIELDS).get();
  let count = 0;
  snapshot.forEach((doc) => {
    const date = parseLooseDate(firstPresentValue(doc.data(), ENTRY_DATE_FIELDS));
    if (date && isSameLocalDay(date, today)) count += 1;
  });
  return count;
}

// `communityjobs` is a small, separately-managed collection distinct from
// `jobsmaster` (the structured client requirements pipeline) — it's the
// literal match for the "Community job posted?" checklist item.
async function countCommunityJobsPostedToday(db, today) {
  const snapshot = await db.collection("communityjobs").select("job_postedon", "job_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.job_isdraft) return;
    const posted = parseLooseDate(data.job_postedon);
    if (posted && isSameLocalDay(posted, today)) count += 1;
  });
  return count;
}

// `workshop_postedon` is stored in mixed formats (ISO datetime, "DD-MMM-YYYY")
// depending on when the workshop was created — same loose-parse as jobs.
async function countWorkshopsPostedToday(db, today) {
  const snapshot = await db.collection("workshopsmaster").select("workshop_postedon", "workshop_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.workshop_isdraft) return;
    const posted = parseLooseDate(data.workshop_postedon);
    if (posted && isSameLocalDay(posted, today)) count += 1;
  });
  return count;
}

const countOf = (query) => query.count().get().then((snap) => snap.data().count);

const BLANK = "";

// A metric failing (e.g. a Firestore composite index that hasn't been
// created yet for a new query shape) should blank that one row, not take
// down the whole report.
async function safe(promise, label, fallback = BLANK) {
  try {
    return await promise;
  } catch (error) {
    console.error(`daily report: "${label}" metric failed:`, error?.message || error);
    return fallback;
  }
}

// Distinct members with at least one interaction logged today. A `where` on
// createdAt here would need a COLLECTION_GROUP index this project doesn't
// have — the collection is small (low hundreds of docs), so an unfiltered
// scan + client-side date filter avoids needing that index at all.
async function countMembersInteractedToday(db, today, tomorrow) {
  const snapshot = await db.collectionGroup("interactions").select("createdAt").get();
  const memberIds = new Set();
  snapshot.forEach((doc) => {
    const createdAt = parseLooseDate(doc.data().createdAt);
    if (!createdAt || createdAt < today || createdAt >= tomorrow) return;
    const userId = doc.ref.parent.parent?.id;
    if (userId) memberIds.add(userId);
  });
  return memberIds.size;
}

// Mirrors MemberListPage's "Is Tagged?" filter exactly: a member counts as
// tagged if `skills`/`Skills` has any non-empty entry. There's no timestamp
// on tagging anywhere in this data, so this is a running total, not a
// same-day count — labeled accordingly wherever it's shown.
async function countMembersTagged(db) {
  const snapshot = await db.collection("users").select("skills", "Skills").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    const raw = data.skills !== undefined && data.skills !== null && String(data.skills).trim() !== "" ? data.skills : data.Skills;
    const parsed = Array.isArray(raw) ? raw.map((s) => String(s).trim()).filter(Boolean) : String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parsed.length > 0) count += 1;
  });
  return count;
}

// Builds the daily report as a set of grid-table sections: an overview
// table, a "today" table of daily activity, and a status table for open
// jobs/projects/TCS requirements.
export async function buildDailyReport(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    totalMembers,
    newMembersToday,
    totalPartners,
    newPartnersToday,
    membersTagged,
    membersInteractedToday,
    workshopsPostedToday,
    communityJobsPostedToday,
    cvRecommendedToday,
    jobsOpen,
    projectsOpen,
  ] = await Promise.all([
    safe(countOf(db.collection("users")), "Total Members"),
    safe(countNewMembersToday(db, today), "New Members Added Today"),
    safe(countOf(db.collection("partneragentusersmaster")), "Total Regional Partners"),
    safe(
      countOf(
        db.collection("partneragentusersmaster").where("created_time", ">=", today).where("created_time", "<", tomorrow)
      ),
      "New Regional Partners Today"
    ),
    safe(countMembersTagged(db), "Members Tagged"),
    safe(countMembersInteractedToday(db, today, tomorrow), "Members Interacted Today"),
    safe(countWorkshopsPostedToday(db, today), "Workshops Posted Today"),
    safe(countCommunityJobsPostedToday(db, today), "Community Jobs Posted Today"),
    safe(
      countOf(db.collection("allocations").where("allocatedAt", ">=", today).where("allocatedAt", "<", tomorrow)),
      "CV Recommended Today"
    ),
    safe(countOf(db.collection("jobsmaster").where("job_status", "==", "Open")), "Jobs Open"),
    safe(countOf(db.collection("projectsmaster").where("project_status", "==", "Open")), "Projects Open"),
  ]);

  const overview = {
    headers: ["Total Existing Members", "Total Regional Partners"],
    rows: [[totalMembers, totalPartners]],
  };

  const link = (linkPath) => ({ linkPath, label: "View" });

  // Deep links: only wired to an actual filter where the target page already
  // has one (MemberListPage's date range / "Is Tagged?" filter, and our own
  // Community Jobs page's postedOn filter). The other pages this report
  // links to (Escalations, Training, Requirements, TCS/Projects/Recruitment)
  // have no date-based filtering to link into yet, so those still land on
  // the general page rather than a pre-filtered view.
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayIso = `${y}-${m}-${d}`;

  const todaysReport = {
    headers: ["Metric", "Count", "Link"],
    rows: [
      ["New Members Added", newMembersToday, link(`/memberlist?from=${todayIso}&to=${todayIso}`)],
      ["New Regional Partners Added", newPartnersToday, link("/partneragent")],
      ["Members Tagged (Total) ★", membersTagged, link("/memberlist?tagged=yes")],
      ["Members Interacted", membersInteractedToday, link("/interactions")],
      ["Workshop Posted", workshopsPostedToday, link("/training")],
      ["Community Job Posted", communityJobsPostedToday, link(`/community-jobs?postedOn=${todayIso}`)],
      ["CV Recommended", cvRecommendedToday, link("/requirements")],
    ],
  };

  const status = {
    headers: ["Item", "Value", "Link"],
    rows: [
      ["TCS City Requirement", "To be added soon", link(`/requirements?filter=${encodeURIComponent("Temp Staffing")}`)],
      ["Project Requirement (Open)", projectsOpen, link(`/requirements?filter=${encodeURIComponent("Projects")}`)],
      ["No. of Recruitment Profile Working (Open Jobs)", jobsOpen, link(`/requirements?filter=${encodeURIComponent("Recruitment")}`)],
    ],
  };

  const regionalPartnerReport = {
    headers: ["Status", "Link"],
    rows: [["To be added soon", link("/partneragent")]],
  };

  return { overview, todaysReport, status, regionalPartnerReport };
}
