// src/App.jsx
import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import {
  collection,
  db,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  select,
  startAfter,
} from "./firestoreClient";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import SkeletonLoader from "./components/SkeletonLoader";
import { normalizeMemberRecord } from "./utils/memberFields";
import { readMemberCache, writeMemberCache } from "./utils/memberCache";
import { membersData } from "./data/membersData";
import { useFilters } from "./hooks/useFilters";
import "./App.css";
import DashboardPage from "./pages/DashboardPage";

// Each lazy chunk is fetched by a content-hashed filename (e.g.
// "MemberLocationPage-Bz9_153Z.js"). A tab left open across a new Vercel
// deploy still has the OLD index.html cached, pointing at hashes the new
// deployment no longer serves; vercel.json's catch-all rewrite then hands
// back index.html itself for that missing asset, which fails to parse as a
// JS module ("Failed to fetch dynamically imported module"). Retrying can't
// fix that — the file is really gone — so the only way out is to reload and
// pick up the current index.html/hashes. Guard with sessionStorage so a
// genuinely broken module (not a stale deploy) doesn't reload-loop forever.
function lazyWithReloadOnStaleChunk(importer) {
  return lazy(() =>
    importer().catch((error) => {
      const key = "chunk-reload-attempted";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        // Never resolves — the reload is already navigating away.
        return new Promise(() => {});
      }
      throw error;
    })
  );
}

const MemberDetailModal   = lazyWithReloadOnStaleChunk(() => import("./components/MemberDetailModal"));
const MemberListPage      = lazyWithReloadOnStaleChunk(() => import("./pages/MemberListPage"));
const MemberLocationPage  = lazyWithReloadOnStaleChunk(() => import("./pages/MemberLocationPage"));
const TempStaffPage       = lazyWithReloadOnStaleChunk(() => import("./pages/TempStaffPage"));
const RecruitmentPage     = lazyWithReloadOnStaleChunk(() => import("./pages/RecruitmentPage"));
const ProjectsPage        = lazyWithReloadOnStaleChunk(() => import("./pages/ProjectsPage"));
const RequirementsPage    = lazyWithReloadOnStaleChunk(() => import("./pages/RequirementsPage"));
const CommunityJobsPage   = lazyWithReloadOnStaleChunk(() => import("./pages/CommunityJobsPage"));
const InteractionPage     = lazyWithReloadOnStaleChunk(() => import("./pages/InteractionPage"));
const RegimentalCenterPage = lazyWithReloadOnStaleChunk(() => import("./pages/RegimentalCenterPage"));
const TrainingPage        = lazyWithReloadOnStaleChunk(() => import("./pages/TrainingPage"));
const ConfigurationPage   = lazyWithReloadOnStaleChunk(() => import("./pages/ConfigurationPage"));
const NewsLetterPage      = lazyWithReloadOnStaleChunk(() => import("./pages/NewsLetterPage"));
const PartnerAgentList    = lazyWithReloadOnStaleChunk(() => import("./pages/PartnerAgentList"));
const ScoringPage         = lazyWithReloadOnStaleChunk(() => import("./pages/ScoringPage"));
const TagUploadPage       = lazyWithReloadOnStaleChunk(() => import("./pages/TagUploadPage"));

// Best-effort prefetch — if it fails (e.g. a stale chunk hash after a new
// deploy), the actual route render below will catch it and reload, so this
// just needs to not leave an unhandled rejection in the console.
const preloadMemberListPage = () => import("./pages/MemberListPage").catch(() => {});

// Shown while a page chunk is downloading
function PageLoadingSpinner() {
  return <SkeletonLoader rows={6} fullPage label="Loading…" />;
}

// ------------------------------------------------------------------
// Chunk size for progressive Firebase loading.
// Measured directly against the live "users" collection (~12k docs):
// 500/page beat 1000/page on both first-chunk latency (1.2s vs 1.7s) and
// total load time (~12s vs ~13s) — bigger pages did not help here, so this
// stays at the empirically better value rather than a theoretical one.
// ------------------------------------------------------------------
const MEMBER_CHUNK = 500;

// The only "users" fields the dashboard reads (every field name in the
// collection was checked against the source; unreferenced ones — ID-document
// photos/numbers, bank details, agreements, etc. — are left out), plus the ones
// the app writes back (tags/skills/regional-partner) so they survive a reload.
// Applied as a Firestore field mask, so the unused fields are never read over
// the wire at all: measured ~38% faster page reads and ~31% smaller payload.
// If a new users-doc field is ever read in the UI, add it here.
const MEMBER_LIST_FIELDS = [
  "uid", "email", "phone_number", "display_name", "dateofbirth", "photo_url", "first_name", "last_name",
  "member_id", "entry_date", "country", "whatsapp", "state", "district", "city", "permanent_address",
  "gender", "pincode", "service", "rank", "level", "trade", "year_of_commission",
  "actual_plan_date_of_retirement", "actual_retirement", "apply_job", "open_jobs", "education",
  "govt_experience", "corporate_experience", "total_experience", "work_experience", "it_skills", "mba",
  "english", "current_ctc", "expected_ctc", "notice_period", "current_location", "preferred_job_location",
  "temp_staff", "father_name", "mother_name", "ifsc_code", "aadhaar_number", "pan_number",
  "current_projects", "open_projects", "volunteer", "areas", "tags", "latlong", "resume_fileurl",
  "BOCategory", "lng", "lat", "created_time", "category", "skills", "Skills", "organization",
  "tcs_coordinator", "Tags", "graduation_course", "location", "retirement_date", "skillsUpdatedAt",
  "regional_partner_criteria", "is_regional_partner", "regional_partner_status",
  "regional_partner_marked_at", "phoneNumber", "phone", "createdAt", "taggedAt",
];

// ------------------------------------------------------------------
// Main layout
// ------------------------------------------------------------------
function Layout() {
  const location = useLocation();
  const [selectedMember, setSelectedMember]   = useState(null);
  const [expandedMenu,   setExpandedMenu]     = useState(null);
  const [memberRecords,  setMemberRecords]    = useState([]);
  const [membersLoading, setMembersLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadMembers = async () => {
      // Instant paint from whatever was cached last session, while the fetch
      // below still runs underneath to bring it current — see memberCache.js.
      // When this hits, the fetch below intentionally stops updating the UI
      // chunk-by-chunk (that would dip the visible count from ~14k back to
      // 500 and climb again) and instead swaps in the complete fresh set once,
      // at the end.
      let usedCache = false;
      const cached = await readMemberCache();
      if (!cancelled && cached?.records?.length) {
        setMemberRecords(cached.records);
        setMembersLoading(false);
        usedCache = true;
      }

      try {
        let lastDoc = null;
        const accumulated = [];

        while (!cancelled) {
          // Build cursor-paginated query
          const q = lastDoc
            ? query(collection(db, "users"), orderBy(documentId()), startAfter(lastDoc), select(...MEMBER_LIST_FIELDS), limit(MEMBER_CHUNK))
            : query(collection(db, "users"), orderBy(documentId()), select(...MEMBER_LIST_FIELDS), limit(MEMBER_CHUNK));

          const snapshot = await getDocs(q);
          if (cancelled) return;
          if (snapshot.empty) break;

          for (const docSnap of snapshot.docs) {
            accumulated.push({ id: docSnap.id, ...normalizeMemberRecord(docSnap.data()) });
          }

          if (!usedCache) {
            // No cached snapshot was shown, so this is a cold load — keep
            // showing data after every chunk (not just the first) so the
            // count climbs progressively instead of jumping once at the end,
            // and clear the loading state as soon as the first chunk lands.
            setMemberRecords(accumulated.slice());
            if (lastDoc === null) setMembersLoading(false);
          }

          if (snapshot.docs.length < MEMBER_CHUNK) break;

          lastDoc = snapshot.docs[snapshot.docs.length - 1];
        }

        if (!cancelled) {
          if (usedCache) setMemberRecords(accumulated.slice());
          if (accumulated.length) void writeMemberCache(accumulated);
        }
      } catch (error) {
        console.error("Error loading members:", error);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };

    void loadMembers();
    void preloadMemberListPage();

    return () => { cancelled = true; };
  }, []);

  const currentPage = location.pathname.slice(1) || "dashboard";

  const memberFilterKeys = ["Gender", "Category", "Service", "Rank", "State", "City", "Tags", "Manpower"];
  const memberFilterData = useFilters(membersData, memberFilterKeys);

  const tempStaffFilterData   = useFilters([], ["Company", "Role", "Duration", "Status"]);
  const recruitmentFilterData = useFilters([], ["Company", "Position", "Location", "Status"]);
  const projectsFilterData    = useFilters([], ["Client", "Domain", "Status"]);

  return (
    <div className="app-container">
      <Sidebar
        currentPage={currentPage}
        expandedMenu={expandedMenu}
        onMenuClick={setExpandedMenu}
        onMemberListHover={preloadMemberListPage}
      />

      <div className="main-content">
        <Navbar />
        <Suspense fallback={<PageLoadingSpinner />}>
          <Routes>
            <Route
              path="/"
              element={
                <ErrorBoundary>
                  <DashboardPage
                    onMemberClick={setSelectedMember}
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                    filterData={memberFilterData}
                    filterKeys={memberFilterKeys}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/memberlist"
              element={
                <ErrorBoundary>
                  <MemberListPage
                    onMemberClick={setSelectedMember}
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                    filterData={memberFilterData}
                    filterKeys={memberFilterKeys}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/member-location"
              element={
                <ErrorBoundary>
                  <MemberLocationPage
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/tempstaff"
              element={
                <ErrorBoundary>
                  <TempStaffPage
                    filterData={tempStaffFilterData}
                    filterKeys={["Company", "Role", "Duration", "Status"]}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/recruitment"
              element={
                <ErrorBoundary>
                  <RecruitmentPage
                    filterData={recruitmentFilterData}
                    filterKeys={["Company", "Position", "Location", "Status"]}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/projects"
              element={
                <ErrorBoundary>
                  <ProjectsPage
                    filterData={projectsFilterData}
                    filterKeys={["Client", "Domain", "Status"]}
                  />
                </ErrorBoundary>
              }
            />
            {/* Pass pre-loaded members so RequirementsPage skips its own Firebase fetch */}
            <Route
              path="/requirements"
              element={
                <ErrorBoundary>
                  <RequirementsPage
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/community-jobs"
              element={
                <ErrorBoundary>
                  <CommunityJobsPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/interactions"
              element={
                <ErrorBoundary>
                  <InteractionPage
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/regimental-centers"
              element={
                <ErrorBoundary>
                  <RegimentalCenterPage memberRecords={memberRecords} membersLoading={membersLoading} />
                </ErrorBoundary>
              }
            />
            <Route
              path="/training"
              element={
                <ErrorBoundary>
                  <TrainingPage memberRecords={memberRecords} membersLoading={membersLoading} />
                </ErrorBoundary>
              }
            />
            <Route path="/configuration" element={<ErrorBoundary><ConfigurationPage /></ErrorBoundary>} />
            <Route path="/newsletter"    element={<ErrorBoundary><NewsLetterPage /></ErrorBoundary>} />
            <Route path="/partneragent"  element={<ErrorBoundary><PartnerAgentList /></ErrorBoundary>} />
            <Route
              path="/scoring"
              element={
                <ErrorBoundary>
                  <ScoringPage
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                  />
                </ErrorBoundary>
              }
            />
            <Route
              path="/tag-upload"
              element={
                <ErrorBoundary>
                  <TagUploadPage
                    memberRecords={memberRecords}
                    membersLoading={membersLoading}
                  />
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<div style={{ padding: 32, color: "#475569" }}>Page not found</div>} />
          </Routes>
        </Suspense>
      </div>

      {selectedMember && (
        <ErrorBoundary>
          <Suspense fallback={null}>
          <MemberDetailModal
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
          />
        </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Root
// ------------------------------------------------------------------
function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
