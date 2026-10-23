// src/components/Sidebar.jsx
import { memo } from "react";
import { NavLink, useLocation } from "react-router-dom";

import {
  LuLayoutDashboard,
  LuUsers,
  LuMapPin,
  LuClipboardList,
  LuBriefcase,
  LuBriefcaseBusiness,
  LuMessagesSquare,
  LuLandmark,
  LuPresentation,
  LuMail,
  LuChartNoAxesColumn,
  LuSettings,
  LuCircleHelp,
  LuLeaf,
} from "react-icons/lu";

import {
  FaUserTie,          // TCS / Temp Staffing
  FaBriefcase,        // Recruitment
  FaTasks,            // Projects
} from "react-icons/fa";

// Escalations is hidden from the menu for now; the /interactions route still works.
const SHOW_ESCALATIONS = false;

function Sidebar({ expandedMenu, onMenuClick, onMemberListHover }) {
  const location = useLocation();
  const isDashboardActive = location.pathname === "/";
  const isMemberListActive = location.pathname === "/memberlist";
  const isMemberLocationActive = location.pathname === "/member-location";
  const isRequirementsActive = location.pathname === "/requirements";
  const isCommunityJobsActive = location.pathname === "/community-jobs";
  const isInteractionsActive = location.pathname === "/interactions";
  const isRegimentalCentersActive = location.pathname === "/regimental-centers";
  const isTrainingActive = location.pathname === "/training";
  const isNewsletterActive = location.pathname === "/newsletter";
  const isConfigurationActive = location.pathname === "/configuration";
  const isScoringActive = location.pathname === "/scoring";
  const isTagUploadActive = location.pathname === "/tag-upload";

  // Determine if "Member Applications" parent should look active
  const isApplicationsActive =
    expandedMenu === "applications" ||
    ["/tempstaff", "/recruitment", "/projects"].includes(location.pathname);

  const isApplicationsExpanded = expandedMenu === "applications";

  const handleApplicationsClick = (e) => {
    e.preventDefault();
    onMenuClick?.(expandedMenu === "applications" ? null : "applications");
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-mark"><LuLeaf /></div>
        <h3>Brisk Olive</h3>
      </div>

      <nav className="sidebar-menu">
        <div className="sidebar-section-label">Members</div>
        <NavLink to="/" className={`menu-item ${isDashboardActive ? "active" : ""}`} end onClick={() => onMenuClick?.(null)}>
          <LuLayoutDashboard className="menu-icon" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/memberlist"
          className={`menu-item ${isMemberListActive ? "active" : ""}`}
          onClick={() => onMenuClick?.(null)}
          onMouseEnter={() => onMemberListHover?.()}
          onFocus={() => onMemberListHover?.()}
        >
          <LuUsers className="menu-icon" />
          <span>Members List</span>
        </NavLink>

        <NavLink to="/member-location" className={`menu-item ${isMemberLocationActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuMapPin className="menu-icon" />
          <span>Members Location</span>
        </NavLink>

        {/* Expandable Members Applications */}
        <a
          href="#"
          className={`menu-item ${isApplicationsActive ? "active" : ""}`}
          onClick={handleApplicationsClick}
        >
          <LuClipboardList className="menu-icon" />
          <span>Members Applications</span>
          {/* <span className="arrow">
            {isApplicationsExpanded ? <MdExpandLess /> : <MdExpandMore />}
          </span> */}
        </a>

        {isApplicationsExpanded && (
          <div className="submenu">
            <NavLink
              to="/tempstaff"
              className={({ isActive }) => `submenu-item ${isActive ? "active" : ""}`}
            >
              <FaUserTie className="submenu-icon" />
               TCS
            </NavLink>
            <NavLink
              to="/recruitment"
              className={({ isActive }) => `submenu-item ${isActive ? "active" : ""}`}
            >
              <FaBriefcase className="submenu-icon" />
               Recruitment
            </NavLink>
            <NavLink
              to="/projects"
              className={({ isActive }) => `submenu-item ${isActive ? "active" : ""}`}
            >
              <FaTasks className="submenu-icon" />
               Projects
            </NavLink>
          </div>
        )}

        <NavLink to="/requirements" className={`menu-item ${isRequirementsActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuBriefcase className="menu-icon" />
          <span>Requirements</span>
        </NavLink>

        <NavLink to="/community-jobs" className={`menu-item ${isCommunityJobsActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuBriefcaseBusiness className="menu-icon" />
          <span>Community Jobs</span>
        </NavLink>

        {SHOW_ESCALATIONS && (
          <NavLink to="/interactions" className={`menu-item ${isInteractionsActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
            <LuMessagesSquare className="menu-icon" />
            <span>Escalations</span>
          </NavLink>
        )}

        <NavLink to="/regimental-centers" className={`menu-item ${isRegimentalCentersActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuLandmark className="menu-icon" />
          <span>Regimental Centers</span>
        </NavLink>

        <NavLink to="/training" className={`menu-item ${isTrainingActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuPresentation className="menu-icon" />
          <span>Workshop</span>
        </NavLink>

        <NavLink to="/newsletter" className={`menu-item ${isNewsletterActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuMail className="menu-icon" />
          <span>News Letter</span>
        </NavLink>

        <NavLink to="/scoring" className={`menu-item ${isScoringActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuChartNoAxesColumn className="menu-icon" />
          <span>Scoring</span>
        </NavLink>

        <NavLink to="/configuration" className={`menu-item ${isConfigurationActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <LuSettings className="menu-icon" />
          <span>Configuration</span>
        </NavLink>

        {/* <NavLink to="/tag-upload" className={`menu-item ${isTagUploadActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <FaTags className="menu-icon" />
          <span>Bulk Tag Upload</span>
        </NavLink> */}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-help">
          <LuCircleHelp className="menu-icon" />
          <span>Help &amp; support</span>
        </div>
        <div className="sidebar-footer-note">Brisk Olive · Members</div>
      </div>
    </aside>
  );
}

export default memo(Sidebar);
