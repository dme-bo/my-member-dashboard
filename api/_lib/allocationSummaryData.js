// Same reclassification rule used on the Requirements page and in the
// newsletter: projects run by TCS are grouped as "Temp Staffing", not
// "Project".
const TCS_TEMP_STAFFING_COMPANY = "Tata Consultancy Services Pvt Ltd";

const HEADERS = ["Title", "Company", "City", "Count", "Members Allocated"];

// No placeholder "No allocations today" row anymore — each category email
// renders its own empty state when rows.length === 0, and the stat blocks
// need real counts (0 requirements / 0 members), not a fake row.
const buildCategory = (rows) => ({
  headers: HEADERS,
  rows,
  totalRequirements: rows.length,
  totalMembers: rows.reduce((sum, row) => sum + (Number(row[3]) || 0), 0),
});

// Groups every allocation created today by the requirement (jobId) it
// belongs to, resolves that requirement's type/title/company by looking it
// up in jobsmaster/projectsmaster, and returns one grid-table per type —
// the same shape the daily report's sections already use.
export async function buildAllocationSummary(db) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const snapshot = await db
    .collection("allocations")
    .where("allocatedAt", ">=", today)
    .where("allocatedAt", "<", tomorrow)
    .get();

  const allocationsByJobId = new Map();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const jobId = data.jobId;
    if (!jobId) return;
    const list = allocationsByJobId.get(jobId) || [];
    list.push({ name: data.name || "Unknown", city: data.city || "" });
    allocationsByJobId.set(jobId, list);
  });

  const jobIds = [...allocationsByJobId.keys()];
  const requirementDetails = new Map();

  await Promise.all(
    jobIds.map(async (id) => {
      const jobDoc = await db.collection("jobsmaster").doc(id).get();
      if (jobDoc.exists) {
        const d = jobDoc.data();
        requirementDetails.set(id, { type: "Job", title: d.job_title || "Untitled Job", company: d.job_company || "-" });
        return;
      }
      const projectDoc = await db.collection("projectsmaster").doc(id).get();
      if (projectDoc.exists) {
        const d = projectDoc.data();
        const isTcs = String(d.project_company || "").trim() === TCS_TEMP_STAFFING_COMPANY;
        requirementDetails.set(id, {
          type: isTcs ? "Temp Staffing" : "Project",
          title: d.project_title || "Untitled Project",
          company: d.project_company || "-",
        });
      }
    })
  );

  const rowsByType = { Job: [], Project: [], "Temp Staffing": [] };
  for (const [jobId, allocs] of allocationsByJobId.entries()) {
    const detail = requirementDetails.get(jobId) || { type: "Job", title: "Unknown Requirement", company: "-" };
    const cities = [...new Set(allocs.map((a) => a.city).filter(Boolean))];
    rowsByType[detail.type].push([
      detail.title,
      detail.company,
      cities.join(", ") || "-",
      allocs.length,
      allocs.map((a) => a.name).join(", "),
    ]);
  }

  return {
    jobs: buildCategory(rowsByType.Job),
    projects: buildCategory(rowsByType.Project),
    tempStaffing: buildCategory(rowsByType["Temp Staffing"]),
    totalAllocations: snapshot.size,
  };
}
