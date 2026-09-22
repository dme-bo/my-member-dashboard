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

// Distinct members with at least one interaction logged today. Needs a
// COLLECTION_GROUP index on interactions.createdAt that doesn't exist in
// this project yet — falls back to blank via `safe` until one is created.
async function countMembersInteractedToday(db, today, tomorrow) {
  const snapshot = await db
    .collectionGroup("interactions")
    .where("createdAt", ">=", today)
    .where("createdAt", "<", tomorrow)
    .select()
    .get();
  const memberIds = new Set();
  snapshot.forEach((doc) => {
    const userId = doc.ref.parent.parent?.id;
    if (userId) memberIds.add(userId);
  });
  return memberIds.size;
}

// `taggedAt` is only written going forward (added to the tagging code paths
// in RegimentalCenterPage/TagUploadPage alongside this report) — historical
// tagging events have no timestamp, so this starts at 0 and grows from here.
async function countMembersTaggedToday(db, today, tomorrow) {
  return countOf(db.collection("users").where("taggedAt", ">=", today).where("taggedAt", "<", tomorrow));
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
    membersTaggedToday,
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
    safe(countMembersTaggedToday(db, today, tomorrow), "Members Tagged Today"),
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

  const todaysReport = {
    headers: ["Metric", "Count"],
    rows: [
      ["New Members Added", newMembersToday],
      ["New Regional Partners Added", newPartnersToday],
      ["Members Tagged", membersTaggedToday],
      ["Members Interacted", membersInteractedToday],
      ["Workshop Posted", workshopsPostedToday],
      ["Community Job Posted", communityJobsPostedToday],
      ["CV Recommended", cvRecommendedToday],
    ],
  };

  const status = {
    headers: ["Item", "Value"],
    rows: [
      ["TCS City Requirement", "To be added soon"],
      ["Project Requirement (Open)", projectsOpen],
      ["No. of Recruitment Profile Working (Open Jobs)", jobsOpen],
    ],
  };

  return { overview, todaysReport, status };
}
