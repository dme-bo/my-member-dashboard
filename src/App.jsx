// src/App.jsx
import React, { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import MemberDetailModal from "./components/MemberDetailModal";

import DashboardPage from "./pages/DashboardPage";
import MemberListPage from "./pages/MemberListPage";
import TempStaffPage from "./pages/TempStaffPage";
import RecruitmentPage from "./pages/RecruitmentPage";
import ProjectsPage from "./pages/ProjectsPage";

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

  // Derive current page from pathname for Sidebar highlighting
  const currentPage = location.pathname.slice(1) || "dashboard";

  // Filters (same as before)
  const memberFilterKeys = ["Gender", "Category", "Service", "Rank", "State", "City", "Tags", "Manpower"];
  const memberFilterData = useFilters(membersData, memberFilterKeys);

  const tempStaffFilterData = useFilters([], ['Company', 'Role', 'Duration', 'Status']);
  const recruitmentFilterData = useFilters([], ['Company', 'Position', 'Location', 'Status']);
  const projectsFilterData = useFilters([], ['Client', 'Domain', 'Status']);

  const handleMenuClick = (page) => {
    if (page === "applications") {
      setExpandedMenu(expandedMenu === "applications" ? null : "applications");
    }
  };

  // No need for handleSubMenuClick anymore – navigation is done by <Link> in Sidebar

  return (
    <div className="app-container">
      <Sidebar
        currentPage={currentPage}
        expandedMenu={expandedMenu}
        onMenuClick={handleMenuClick}
      />

      <div className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route
            path="/memberlist"
            element={
              <MemberListPage
                onMemberClick={setSelectedMember}
                filterData={memberFilterData}
                filterKeys={memberFilterKeys}
              />
            }
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
          {/* Optional: 404 page */}
          <Route path="*" element={<div>Page not found</div>} />
        </Routes>
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