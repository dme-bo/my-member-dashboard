// Projects run by TCS are shown/filtered elsewhere (RequirementsPage) as
// "Temp Staffing" rather than "Project" — same company match used here.
const TCS_TEMP_STAFFING_COMPANY = "Tata Consultancy Services Pvt Ltd";

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

function isWithinRange(date, start, end) {
  return date >= start && date < end;
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

async function countNewMembersInRange(db, start, end) {
  const snapshot = await db.collection("users").select(...ENTRY_DATE_FIELDS).get();
  let count = 0;
  snapshot.forEach((doc) => {
    const date = parseLooseDate(firstPresentValue(doc.data(), ENTRY_DATE_FIELDS));
    if (date && isWithinRange(date, start, end)) count += 1;
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

async function countCommunityJobsPostedInRange(db, start, end) {
  const snapshot = await db.collection("communityjobs").select("job_postedon", "job_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.job_isdraft) return;
    const posted = parseLooseDate(data.job_postedon);
    if (posted && isWithinRange(posted, start, end)) count += 1;
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

async function countWorkshopsPostedInRange(db, start, end) {
  const snapshot = await db.collection("workshopsmaster").select("workshop_postedon", "workshop_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.workshop_isdraft) return;
    const posted = parseLooseDate(data.workshop_postedon);
    if (posted && isWithinRange(posted, start, end)) count += 1;
  });
  return count;
}

// Real status values: communityjobs uses job_status "Open" (no "Closed"/"Active"
// convention like jobsmaster), workshopsmaster uses workshop_status "Active"
// for a currently-running workshop (also "Completed"/"Archived"). Both
// excluded-draft, select()-then-filter client-side to avoid a composite index.
async function countOpenCommunityJobs(db) {
  const snapshot = await db.collection("communityjobs").select("job_status", "job_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.job_isdraft && data.job_status === "Open") count += 1;
  });
  return count;
}

async function countActiveWorkshops(db) {
  const snapshot = await db.collection("workshopsmaster").select("workshop_status", "workshop_isdraft").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (!data.workshop_isdraft && data.workshop_status === "Active") count += 1;
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

// `skillsUpdatedAt` is a real Firestore Timestamp set whenever a member's
// skills/tags are written — a single-field range query on one collection,
// so unlike the interactions collection group this needs no extra index.
async function countMembersTaggedToday(db, today, tomorrow) {
  return countOf(db.collection("users").where("skillsUpdatedAt", ">=", today).where("skillsUpdatedAt", "<", tomorrow));
}

// Regional Partner isn't its own collection — it's a flag on the member's own
// `users` doc (`is_regional_partner` + `regional_partner_status` +
// `regional_partner_criteria` + `regional_partner_marked_at`), set via
// MemberListPage's "Mark Partner" action. A single equality filter needs no
// composite index; status/date filtering happens client-side below.
async function fetchRegionalPartners(db) {
  const snapshot = await db
    .collection("users")
    .where("is_regional_partner", "==", true)
    .select("regional_partner_status", "regional_partner_marked_at")
    .get();
  return snapshot.docs.map((doc) => doc.data());
}

function countActivePartners(partners) {
  return partners.filter((p) => p.regional_partner_status !== "Inactive").length;
}

function countNewActivePartnersInRange(partners, start, end) {
  return partners.filter((p) => {
    if (p.regional_partner_status === "Inactive") return false;
    const markedAt = parseLooseDate(p.regional_partner_marked_at);
    return markedAt && isWithinRange(markedAt, start, end);
  }).length;
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
    regionalPartners,
    membersTaggedToday,
    membersInteractedToday,
    workshopsPostedToday,
    communityJobsPostedToday,
    cvRecommendedToday,
    jobsOpen,
    projectsOpen,
    communityJobsOpen,
    activeWorkshops,
    tcsRequirements,
  ] = await Promise.all([
    safe(countOf(db.collection("users")), "Total Members"),
    safe(countNewMembersToday(db, today), "New Members Added Today"),
    safe(fetchRegionalPartners(db), "Regional Partners", []),
    safe(countMembersTaggedToday(db, today, tomorrow), "Members Tagged Today"),
    safe(countMembersInteractedToday(db, today, tomorrow), "Members Interacted Today"),
    safe(countWorkshopsPostedToday(db, today), "Workshops Posted Today"),
    safe(countCommunityJobsPostedToday(db, today), "Community Jobs Posted Today"),
    safe(
      countOf(db.collection("allocations").where("allocatedAt", ">=", today).where("allocatedAt", "<", tomorrow)),
      "CV Recommended Today"
    ),
    safe(countOf(db.collection("jobsmaster").where("job_status", "==", "Open").where("job_isdraft", "==", false)), "Jobs Open"),
    safe(countOf(db.collection("projectsmaster").where("project_status", "==", "Open")), "Projects Open"),
    safe(countOpenCommunityJobs(db), "Community Jobs Open"),
    safe(countActiveWorkshops(db), "Active Workshops"),
    safe(countOf(db.collection("projectsmaster").where("project_company", "==", TCS_TEMP_STAFFING_COMPANY)), "TCS City Requirement"),
  ]);

  const totalPartners = countActivePartners(regionalPartners);
  const newPartnersToday = countNewActivePartnersInRange(regionalPartners, today, tomorrow);

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
      ["Members Tagged", membersTaggedToday, link("/memberlist?tagged=yes")],
      ["Members Interacted", membersInteractedToday, link("/interactions")],
      ["Workshop Posted", workshopsPostedToday, link("/training")],
      ["Community Job Posted", communityJobsPostedToday, link(`/community-jobs?postedOn=${todayIso}`)],
      ["CV Recommended", cvRecommendedToday, link("/requirements")],
    ],
  };

  const status = {
    headers: ["Item", "Value", "Link"],
    rows: [
      ["TCS City Requirement", tcsRequirements, link(`/requirements?filter=${encodeURIComponent("Temp Staffing")}`)],
      ["Project Requirement (Open)", projectsOpen, link(`/requirements?filter=${encodeURIComponent("Projects")}`)],
      ["No. of Recruitment Profile Working (Open Jobs)", jobsOpen, link(`/requirements?filter=${encodeURIComponent("Recruitment")}`)],
      ["No. of Community Jobs (Open)", communityJobsOpen, link("/community-jobs")],
      ["No. of Workshops (Active)", activeWorkshops, link("/training")],
    ],
  };

  const regionalPartnerReport = {
    headers: ["Metric", "Count", "Link"],
    rows: [
      ["Total Regional Partners", totalPartners, link("/memberlist")],
      ["New Regional Partners Added", newPartnersToday, link("/memberlist")],
    ],
  };

  return { overview, todaysReport, status, regionalPartnerReport };
}

// Same shape as buildDailyReport, but the activity table covers the trailing
// 7 days (Sun–Sat of the week ending "today") instead of a single day — the
// two date-range metrics (`countMembersTaggedToday`/`countMembersInteractedToday`)
// already take a start/end pair, so only the single-day counters needed a
// range-based counterpart (added above as `*InRange`).
export async function buildWeeklyReport(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const [
    totalMembers,
    newMembersThisWeek,
    regionalPartners,
    membersTaggedThisWeek,
    membersInteractedThisWeek,
    workshopsPostedThisWeek,
    communityJobsPostedThisWeek,
    cvRecommendedThisWeek,
    jobsOpen,
    projectsOpen,
    communityJobsOpen,
    activeWorkshops,
    tcsRequirements,
  ] = await Promise.all([
    safe(countOf(db.collection("users")), "Total Members"),
    safe(countNewMembersInRange(db, weekStart, tomorrow), "New Members Added This Week"),
    safe(fetchRegionalPartners(db), "Regional Partners", []),
    safe(countMembersTaggedToday(db, weekStart, tomorrow), "Members Tagged This Week"),
    safe(countMembersInteractedToday(db, weekStart, tomorrow), "Members Interacted This Week"),
    safe(countWorkshopsPostedInRange(db, weekStart, tomorrow), "Workshops Posted This Week"),
    safe(countCommunityJobsPostedInRange(db, weekStart, tomorrow), "Community Jobs Posted This Week"),
    safe(
      countOf(db.collection("allocations").where("allocatedAt", ">=", weekStart).where("allocatedAt", "<", tomorrow)),
      "CV Recommended This Week"
    ),
    safe(countOf(db.collection("jobsmaster").where("job_status", "==", "Open").where("job_isdraft", "==", false)), "Jobs Open"),
    safe(countOf(db.collection("projectsmaster").where("project_status", "==", "Open")), "Projects Open"),
    safe(countOpenCommunityJobs(db), "Community Jobs Open"),
    safe(countActiveWorkshops(db), "Active Workshops"),
    safe(countOf(db.collection("projectsmaster").where("project_company", "==", TCS_TEMP_STAFFING_COMPANY)), "TCS City Requirement"),
  ]);

  const totalPartners = countActivePartners(regionalPartners);
  const newPartnersThisWeek = countNewActivePartnersInRange(regionalPartners, weekStart, tomorrow);

  const overview = {
    headers: ["Total Existing Members", "Total Regional Partners"],
    rows: [[totalMembers, totalPartners]],
  };

  const link = (linkPath) => ({ linkPath, label: "View" });

  const isoOf = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const weekStartIso = isoOf(weekStart);
  const todayIso = isoOf(today);

  const weeksReport = {
    headers: ["Metric", "Count", "Link"],
    rows: [
      ["New Members Added", newMembersThisWeek, link(`/memberlist?from=${weekStartIso}&to=${todayIso}`)],
      ["Members Tagged", membersTaggedThisWeek, link("/memberlist?tagged=yes")],
      ["Members Interacted", membersInteractedThisWeek, link("/interactions")],
      ["Workshops Posted", workshopsPostedThisWeek, link("/training")],
      ["Community Jobs Posted", communityJobsPostedThisWeek, link(`/community-jobs?postedOn=${todayIso}`)],
      ["CV Recommended", cvRecommendedThisWeek, link("/requirements")],
    ],
  };

  const status = {
    headers: ["Item", "Value", "Link"],
    rows: [
      ["TCS City Requirement", tcsRequirements, link(`/requirements?filter=${encodeURIComponent("Temp Staffing")}`)],
      ["Project Requirement (Open)", projectsOpen, link(`/requirements?filter=${encodeURIComponent("Projects")}`)],
      ["No. of Recruitment Profile Working (Open Jobs)", jobsOpen, link(`/requirements?filter=${encodeURIComponent("Recruitment")}`)],
      ["No. of Community Jobs (Open)", communityJobsOpen, link("/community-jobs")],
      ["No. of Workshops (Active)", activeWorkshops, link("/training")],
    ],
  };

  const regionalPartnerReport = {
    headers: ["Metric", "Count", "Link"],
    rows: [
      ["Total Regional Partners", totalPartners, link("/memberlist")],
      ["New Regional Partners Added", newPartnersThisWeek, link("/memberlist")],
    ],
  };

  return { overview, weeksReport, status, regionalPartnerReport, weekStart, weekEnd: today };
}
