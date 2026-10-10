// src/utils/applicationSources.js
//
// Resolves "live" applications submitted through the member-facing app —
// jobsmaster/projectsmaster postings plus their jobs_applied/projects_applied
// subcollections under users/{uid} — into the row shapes the legacy
// Recruitment/Projects/TCS pages already render (full_name, contact_number,
// city, ...), so they can be merged into those pages' existing tables
// alongside jobsusersmaster/projectusersmaster/tcsusersmaster without any
// table/modal rendering changes.
//
// Projects run by TCS (project_company === TCS_COMPANY_NAME) are split out
// of fetchProjectApplicationRows' result and returned as tcsRows instead of
// projectRows, matching how RequirementsPage already treats TCS-run projects
// as Temp Staffing rather than a generic Project.
import { collectionGroup, db, doc, getDoc, getDocs } from "../firestoreClient";
import { getMemberName, getMemberPhone, getMemberEmail, getMemberCategory } from "./memberFields";

export const TCS_COMPANY_NAME = "Tata Consultancy Services Pvt Ltd";

async function resolveApplicantProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : {};
  } catch (error) {
    console.error(`Error resolving applicant profile for ${uid}:`, error);
    return {};
  }
}

// Shaped for RecruitmentPage's candidate rows.
export async function fetchJobApplicationRows() {
  const appliedSnap = await getDocs(collectionGroup(db, "jobs_applied"));
  const rows = await Promise.all(
    appliedSnap.docs.map(async (appliedDoc) => {
      const uid = appliedDoc.ref.parent?.parent?.id;
      const jobId = appliedDoc.id;
      if (!uid) return null;

      const [jobSnap, profile] = await Promise.all([
        getDoc(doc(db, "jobsmaster", jobId)),
        resolveApplicantProfile(uid),
      ]);
      const jobData = jobSnap.exists() ? jobSnap.data() : {};

      return {
        id: `jobapp:${uid}:${jobId}`,
        full_name: getMemberName(profile) || "Unnamed",
        contact_number: getMemberPhone(profile) || "-",
        email_id: getMemberEmail(profile) || "-",
        city: profile.city || "-",
        current_location: profile.city || "-",
        profile: jobData.job_title || "Untitled Job",
        client: jobData.job_company || "-",
        source: "App - Job Posting",
        status: jobData.job_status === "Open" && jobData.job_isdraft === false ? "Active" : "Inactive",
        created_time: appliedDoc.data().applied_at || null,
        category: getMemberCategory(profile) || profile.category || "-",
        service: profile.service || "-",
        rank: profile.rank || "-",
        education: profile.graduation_course || profile.education || "-",
        job_location: jobData.job_city || jobData.job_location || "-",
        _newFlow: true,
        _uid: uid,
        _jobId: jobId,
      };
    })
  );
  return rows.filter(Boolean);
}

// Shaped for ProjectsPage's application rows (projectRows) and TempStaffPage's
// TCS application rows (tcsRows) — split by project_company.
export async function fetchProjectApplicationRows() {
  const appliedSnap = await getDocs(collectionGroup(db, "projects_applied"));
  const resolved = await Promise.all(
    appliedSnap.docs.map(async (appliedDoc) => {
      const uid = appliedDoc.ref.parent?.parent?.id;
      const projectId = appliedDoc.id;
      if (!uid) return null;

      const [projectSnap, profile] = await Promise.all([
        getDoc(doc(db, "projectsmaster", projectId)),
        resolveApplicantProfile(uid),
      ]);
      const projectData = projectSnap.exists() ? projectSnap.data() : {};
      const appliedData = appliedDoc.data();
      const isTcs = String(projectData.project_company || "").trim() === TCS_COMPANY_NAME;

      const fullName = getMemberName(profile) || "Unnamed";
      const phone = getMemberPhone(profile) || "-";
      const email = getMemberEmail(profile) || "-";
      const city = profile.city || appliedData.applied_city || "-";
      const projectTitle = projectData.project_title || "Untitled Project";
      const status = projectData.project_status === "Active" ? "Active" : "Inactive";

      if (isTcs) {
        return {
          isTcs: true,
          row: {
            id: `projectapp:${uid}:${projectId}`,
            type: "application",
            full_name: fullName,
            contact_number: phone,
            email_id: email,
            state: profile.state || "-",
            city,
            role: projectTitle,
            status,
            _newFlow: true,
            _uid: uid,
          },
        };
      }

      return {
        isTcs: false,
        row: {
          id: `projectapp:${uid}:${projectId}`,
          full_name: fullName,
          phone_number: phone,
          email,
          city,
          projects: projectTitle,
          created_time: appliedData.applied_at || null,
          _newFlow: true,
          _uid: uid,
        },
      };
    })
  );

  const valid = resolved.filter(Boolean);
  return {
    tcsRows: valid.filter((r) => r.isTcs).map((r) => r.row),
    projectRows: valid.filter((r) => !r.isTcs).map((r) => r.row),
  };
}
