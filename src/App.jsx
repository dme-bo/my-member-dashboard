// src/App.jsx
import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import {
  collection,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MemberDetailModal from "./components/MemberDetailModal";
import ErrorBoundary from "./components/ErrorBoundary";
import { normalizeMemberRecord } from "./utils/memberFields";
import { membersData } from "./data/membersData";
import { useFilters } from "./hooks/useFilters";
import { getSession, setSession, clearSession, SESSION_RECHECK_MS } from "./utils/session";
import { AUTH_EMAIL_PARAM, goToLogin } from "./utils/auth";
import "./App.css";

const DashboardPage       = lazy(() => import("./pages/DashboardPage"));
const MemberListPage      = lazy(() => import("./pages/MemberListPage"));
const MemberLocationPage  = lazy(() => import("./pages/MemberLocationPage"));
const TempStaffPage       = lazy(() => import("./pages/TempStaffPage"));
const RecruitmentPage     = lazy(() => import("./pages/RecruitmentPage"));
const ProjectsPage        = lazy(() => import("./pages/ProjectsPage"));
const RequirementsPage    = lazy(() => import("./pages/RequirementsPage"));
const InteractionPage     = lazy(() => import("./pages/InteractionPage"));
const RegimentalCenterPage = lazy(() => import("./pages/RegimentalCenterPage"));
const TrainingPage        = lazy(() => import("./pages/TrainingPage"));
const ConfigurationPage   = lazy(() => import("./pages/ConfigurationPage"));
const NewsLetterPage      = lazy(() => import("./pages/NewsLetterPage"));
const PartnerAgentList    = lazy(() => import("./pages/PartnerAgentList"));

const preloadMemberListPage = () => import("./pages/MemberListPage");

// Lightweight spinner shown while a page chunk is downloading
function PageLoadingSpinner() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "calc(100vh - 56px)",
      flexDirection: "column",
      gap: "14px",
      background: "#f5f7fa",
    }}>
      <div style={{
        width: "38px",
        height: "38px",
        border: "3px solid #e3f2fd",
        borderTopColor: "#1976d2",
        borderRadius: "50%",
        animation: "navSpin 0.7s linear infinite",
      }} />
      <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 500 }}>Loading…</span>
      <style>{`@keyframes navSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ------------------------------------------------------------------
// Auth gate — redirects to the operations login page when there is
// no active session, or completes login via ?authEmail= handoff
// ------------------------------------------------------------------
function AuthGate({ children }) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // The authEmail handback always takes priority over a stored session —
    // it's the authoritative signal that a login on operations.briskolive.com
    // just completed, and must be processed even if a prior visit already
    // redirected once.
    const params = new URLSearchParams(window.location.search);
    const authEmail = params.get(AUTH_EMAIL_PARAM);

    if (!authEmail) {
      if (getSession()?.email) {
        setAuthenticated(true);
        return;
      }
      goToLogin();
      return;
    }

    let cancelled = false;

    fetch(`/api/verify-login?email=${encodeURIComponent(authEmail)}`)
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;

        if (!result.ok) {
          goToLogin();
          return;
        }

        setSession({ email: result.email, name: result.name, ts: Date.now() });

        params.delete(AUTH_EMAIL_PARAM);
        const cleanSearch = params.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}`
        );

        setAuthenticated(true);
      })
      .catch(() => {
        if (!cancelled) goToLogin();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Once authenticated, periodically re-check the email against the HR
  // onboarding API (the same check used at login) so a deactivated or
  // removed account gets sent back to operations.briskolive.com within
  // SESSION_RECHECK_MS instead of staying "logged in" until the 24h TTL.
  useEffect(() => {
    if (!authenticated) return;

    let cancelled = false;
    let lastCheck = Date.now();

    const revalidate = async () => {
      const session = getSession();
      if (!session?.email) {
        clearSession();
        goToLogin();
        return;
      }

      try {
        const res = await fetch(`/api/verify-login?email=${encodeURIComponent(session.email)}`);
        const result = await res.json();
        if (cancelled) return;

        if (!result.ok) {
          clearSession();
          goToLogin();
        }
      } catch {
        // Transient network/API failure — don't log the user out for that.
      } finally {
        lastCheck = Date.now();
      }
    };

    const interval = setInterval(revalidate, SESSION_RECHECK_MS);

    // Also re-check on tab focus/visibility, but only if a check hasn't
    // run recently (covers laptop sleep/wake without hammering the API).
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck >= SESSION_RECHECK_MS) {
        revalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authenticated]);

  if (!authenticated) return <PageLoadingSpinner />;

  return children;
}

// ------------------------------------------------------------------
// Chunk size for progressive Firebase loading
// ------------------------------------------------------------------
const MEMBER_CHUNK = 500;

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
      try {
        const db   = getFirestore();
        let lastDoc = null;
        const accumulated = [];

        while (!cancelled) {
          // Build cursor-paginated query
          const q = lastDoc
            ? query(collection(db, "users"), orderBy(documentId()), startAfter(lastDoc), limit(MEMBER_CHUNK))
            : query(collection(db, "users"), orderBy(documentId()), limit(MEMBER_CHUNK));

          const snapshot = await getDocs(q);
          if (cancelled) return;
          if (snapshot.empty) break;

          for (const docSnap of snapshot.docs) {
            accumulated.push({ id: docSnap.id, ...normalizeMemberRecord(docSnap.data()) });
          }

          // After first chunk: immediately show data and clear loading state
          if (lastDoc === null) {
            setMemberRecords(accumulated.slice());
            setMembersLoading(false);
          }

          if (snapshot.docs.length < MEMBER_CHUNK) {
            // Last page — final update (only needed if more than one chunk)
            if (accumulated.length > MEMBER_CHUNK) {
              setMemberRecords(accumulated.slice());
            }
            break;
          }

          lastDoc = snapshot.docs[snapshot.docs.length - 1];
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
            <Route path="/regimental-centers" element={<ErrorBoundary><RegimentalCenterPage /></ErrorBoundary>} />
            <Route path="/training" element={<ErrorBoundary><TrainingPage /></ErrorBoundary>} />
            <Route path="/configuration" element={<ErrorBoundary><ConfigurationPage /></ErrorBoundary>} />
            <Route path="/newsletter"    element={<ErrorBoundary><NewsLetterPage /></ErrorBoundary>} />
            <Route path="/partneragent"  element={<ErrorBoundary><PartnerAgentList /></ErrorBoundary>} />
            <Route path="*" element={<div style={{ padding: 32, color: "#475569" }}>Page not found</div>} />
          </Routes>
        </Suspense>
      </div>

      {selectedMember && (
        <ErrorBoundary>
          <MemberDetailModal
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
          />
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
    <AuthGate>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthGate>
  );
}

export default App;
