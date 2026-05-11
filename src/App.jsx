// src/App.jsx
import React, { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { collection, documentId, getDocs, getFirestore, orderBy, query } from "firebase/firestore";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import MemberDetailModal from "./components/MemberDetailModal";
import { normalizeMemberRecord } from "./utils/memberFields";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MemberListPage = lazy(() => import("./pages/MemberListPage"));
const MemberLocationPage = lazy(() => import("./pages/MemberLocationPage"));
const TempStaffPage = lazy(() => import("./pages/TempStaffPage"));
const RecruitmentPage = lazy(() => import("./pages/RecruitmentPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const RequirementsPage = lazy(() => import("./pages/RequirementsPage"));
const ConfigurationPage = lazy(() => import("./pages/ConfigurationPage"));
const NewsLetterPage = lazy(() => import("./pages/NewsLetterPage"));
const PartnerAgentList = lazy(() => import("./pages/PartnerAgentList"));
const preloadMemberListPage = () => import("./pages/MemberListPage");


import { membersData } from "./data/membersData";
import { useFilters } from "./hooks/useFilters";
import "./App.css";

// ------------------------------------------------------------------
// Main layout component (contains Sidebar + outlet for pages)
// ------------------------------------------------------------------
function Layout() {
  const location = useLocation();
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [memberRecords, setMemberRecords] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadMembers = async () => {
      try {
        const db = getFirestore();
        const snapshot = await getDocs(query(collection(db, "users"), orderBy(documentId())));
        if (cancelled) return;
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...normalizeMemberRecord(doc.data()),
        }));
        setMemberRecords(data);
      } catch (error) {
        console.error("Error loading shared members:", error);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    };

    void loadMembers();
    void preloadMemberListPage();

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive current page from pathname for Sidebar highlighting
  const currentPage = location.pathname.slice(1) || "dashboard";

  // Filters (same as before)
  const memberFilterKeys = ["Gender", "Category", "Service", "Rank", "State", "City", "Tags", "Manpower"];
  const memberFilterData = useFilters(membersData, memberFilterKeys);

  const tempStaffFilterData = useFilters([], ['Company', 'Role', 'Duration', 'Status']);
  const recruitmentFilterData = useFilters([], ['Company', 'Position', 'Location', 'Status']);
  const projectsFilterData = useFilters([], ['Client', 'Domain', 'Status']);

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
        <Suspense
          fallback={
            <div style={{ padding: "24px", color: "#475569", fontWeight: 600 }}>
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<DashboardPage
                  onMemberClick={setSelectedMember}
                  memberRecords={memberRecords}
                  membersLoading={membersLoading}
                  filterData={memberFilterData}
                  filterKeys={memberFilterKeys}
                />} />
            <Route
              path="/memberlist"
              element={
                <MemberListPage
                  onMemberClick={setSelectedMember}
                  memberRecords={memberRecords}
                  membersLoading={membersLoading}
                  filterData={memberFilterData}
                  filterKeys={memberFilterKeys}
                />
              }
            />
            <Route
              path="/member-location"
              element={<MemberLocationPage memberRecords={memberRecords} membersLoading={membersLoading} />}
            />
            <Route
              path="/tempstaff"
              element={<TempStaffPage filterData={tempStaffFilterData} filterKeys={['Company', 'Role', 'Duration', 'Status']} />}
            />
            <Route
              path="/recruitment"
              element={<RecruitmentPage filterData={recruitmentFilterData} filterKeys={['Company', 'Position', 'Location', 'Status']} />}
            />
            <Route
              path="/projects"
              element={<ProjectsPage filterData={projectsFilterData} filterKeys={['Client', 'Domain', 'Status']} />}
            />
            <Route
              path="/requirements"
              element={<RequirementsPage/>}
            />
            <Route
              path="/configuration"
              element={<ConfigurationPage/>}
            />
            <Route
              path="/newsletter"
              element={<NewsLetterPage/>}
            />
            <Route
              path="/partneragent"
              element={<PartnerAgentList/>}
            />
            {/* Optional: 404 page */}
            <Route path="*" element={<div>Page not found</div>} />
          </Routes>
        </Suspense>
      </div>

      {/* Member detail modal – shown on top of any route */}
      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Root App component (only wraps with BrowserRouter)
// ------------------------------------------------------------------
function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

export default App;
