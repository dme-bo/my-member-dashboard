// Who applied to which requirement.
//
// A "requirement" is a job (jobsmaster), a project (projectsmaster) or a
// TCS-run project (projectsmaster with project_company = TCS, i.e. Temp
// Staff). Applications live under each member:
// users/{uid}/jobs_applied/{jobId} and users/{uid}/projects_applied/{projectId}.
//
// Shared by the Members Master List "Requirement" filter and the Dashboard's
// applied-members blocks, so both read the same data and fetch it once.
import { collection, collectionGroup, db, getDocs, query, select } from "../firestoreClient";
import { TCS_COMPANY_NAME } from "./applicationSources";

const CACHE_TTL_MS = 60_000;
let cache = null; // { timestamp, data }
let inFlight = null;

export const EMPTY_REQUIREMENT_DATA = {
  requirements: [],
  labels: [],
  membersByLabel: new Map(),
  appliedIds: new Set(),
  labelsByMember: new Map(),
};

// Firestore Timestamp / {seconds} / ISO string / Date -> epoch ms (null if unknown)
const toMs = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === "number") return seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

// requirement id -> Map(applicant member id -> applied_at ms | null)
const applicantsById = (snapshot) => {
  const map = new Map();
  snapshot.docs.forEach((appliedDoc) => {
    const memberId = appliedDoc.ref.parent?.parent?.id;
    if (!memberId) return;
    if (!map.has(appliedDoc.id)) map.set(appliedDoc.id, new Map());
    map.get(appliedDoc.id).set(memberId, toMs(appliedDoc.data()?.applied_at));
  });
  return map;
};

async function fetchRequirementApplicants() {
  const [jobApplied, projectApplied, jobsSnap, projectsSnap] = await Promise.all([
    getDocs(query(collectionGroup(db, "jobs_applied"), select("applied_at"))),
    getDocs(query(collectionGroup(db, "projects_applied"), select("applied_at"))),
    getDocs(query(collection(db, "jobsmaster"), select("job_title", "job_company"))),
    getDocs(query(collection(db, "projectsmaster"), select("project_title", "project_company"))),
  ]);

  const jobApplicants = applicantsById(jobApplied);
  const projectApplicants = applicantsById(projectApplied);

  const requirements = [];
  const usedLabels = new Set();
  const addRequirement = (id, type, title, company, appliedAt) => {
    const prefix = type === "TCS" ? "TCS" : type;
    let label =
      type === "TCS"
        ? `${prefix}: ${title}`
        : `${prefix}: ${title}${company ? ` • ${company}` : ""}`;
    if (usedLabels.has(label.toLowerCase())) label = `${label} (#${id.slice(0, 5)})`;
    usedLabels.add(label.toLowerCase());
    requirements.push({ id, type, title, company, label, memberIds: new Set(appliedAt.keys()), appliedAt });
  };

  // Only requirements somebody actually applied to are useful here.
  jobsSnap.docs.forEach((jobDoc) => {
    const appliedAt = jobApplicants.get(jobDoc.id);
    if (!appliedAt) return;
    const data = jobDoc.data() || {};
    addRequirement(jobDoc.id, "Job", data.job_title || "Untitled Job", String(data.job_company || "").trim(), appliedAt);
  });

  projectsSnap.docs.forEach((projectDoc) => {
    const appliedAt = projectApplicants.get(projectDoc.id);
    if (!appliedAt) return;
    const data = projectDoc.data() || {};
    const company = String(data.project_company || "").trim();
    addRequirement(
      projectDoc.id,
      company === TCS_COMPANY_NAME ? "TCS" : "Project",
      data.project_title || "Untitled Project",
      company,
      appliedAt
    );
  });

  requirements.sort((a, b) => a.label.localeCompare(b.label));

  const membersByLabel = new Map(); // lowercased label -> Set of member ids
  const appliedIds = new Set();
  const labelsByMember = new Map(); // member id -> [labels]
  requirements.forEach((requirement) => {
    membersByLabel.set(requirement.label.toLowerCase(), requirement.memberIds);
    requirement.memberIds.forEach((memberId) => {
      appliedIds.add(memberId);
      if (!labelsByMember.has(memberId)) labelsByMember.set(memberId, []);
      labelsByMember.get(memberId).push(requirement.label);
    });
  });

  return {
    requirements,
    labels: requirements.map((requirement) => requirement.label),
    membersByLabel,
    appliedIds,
    labelsByMember,
  };
}

// Cached for a minute, and concurrent callers share one in-flight request.
export async function loadRequirementApplicants() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) return cache.data;
  if (!inFlight) {
    inFlight = fetchRequirementApplicants()
      .then((data) => {
        cache = { timestamp: Date.now(), data };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
