// src/App.jsx
import React, { useState } from "react";
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

function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedMenu, setExpandedMenu] = useState(null);

  // Filters
  const memberFilterKeys = ["Gender", "Category", "Service", "Rank", "State", "City", "Tags"];
  const memberFilterData = useFilters(membersData, memberFilterKeys);

  const tempStaffFilterData = useFilters([], ['Company', 'Role', 'Duration', 'Status']);
  const recruitmentFilterData = useFilters([], ['Company', 'Position', 'Location', 'Status']);
  const projectsFilterData = useFilters([], ['Client', 'Domain', 'Status']);

  const handleMenuClick = (page) => {
    if (page === "applications") {
      setExpandedMenu(expandedMenu === "applications" ? null : "applications");
    } else {
      setCurrentPage(page);
      setExpandedMenu(null);
    }
  };

  const handleSubMenuClick = (page) => {
    setCurrentPage(page);
    setExpandedMenu("applications");
  };

  return (
    <div className="app-container">
      <Sidebar
        currentPage={currentPage}
        expandedMenu={expandedMenu}
        onMenuClick={handleMenuClick}
        onSubMenuClick={handleSubMenuClick}
      />

      <div className="main-content">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "memberlist" && (
          <MemberListPage
            onMemberClick={setSelectedMember}
            filterData={memberFilterData}
            filterKeys={memberFilterKeys}
          />
        )}
        {currentPage === "tempstaff" && <TempStaffPage filterData={tempStaffFilterData} filterKeys={['Company', 'Role', 'Duration', 'Status']} />}
        {currentPage === "recruitment" && <RecruitmentPage filterData={recruitmentFilterData} filterKeys={['Company', 'Position', 'Location', 'Status']} />}
        {currentPage === "projects" && <ProjectsPage filterData={projectsFilterData} filterKeys={['Client', 'Domain', 'Status']} />}
      </div>

      {selectedMember && (
        <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  );
}

export default App;