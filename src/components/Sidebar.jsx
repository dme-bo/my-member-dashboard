// src/components/Sidebar.jsx
import { NavLink, useLocation } from "react-router-dom";

// Icons from react-icons (feel free to choose different ones)
import { 
  MdDashboard, 
  MdPeople,           // Members Master List
  MdLocationOn,       // Member Location
  MdAssignment,       // Applications
  MdWork,             // Requirements
  MdEmail,            // Newsletter
  MdSettings          // Configuration
} from "react-icons/md";

import { 
  FaUserTie,          // TCS / Temp Staffing
  FaBriefcase,        // Recruitment
  FaTasks             // Projects
} from "react-icons/fa";

export default function Sidebar({ expandedMenu, onMenuClick, onMemberListHover }) {
  const location = useLocation();
  const isDashboardActive = location.pathname === "/";
  const isMemberListActive = location.pathname === "/memberlist";
  const isMemberLocationActive = location.pathname === "/member-location";
  const isRequirementsActive = location.pathname === "/requirements";
  const isNewsletterActive = location.pathname === "/newsletter";
  const isConfigurationActive = location.pathname === "/configuration";

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
        <div className="logo-circle">BO</div>
        <div>
          <h3>Brisk Olive</h3>
          <p>Members Dashboard</p>
        </div>
      </div>

      <nav className="sidebar-menu">
        <NavLink to="/" className={`menu-item ${isDashboardActive ? "active" : ""}`} end onClick={() => onMenuClick?.(null)}>
          <MdDashboard className="menu-icon" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/memberlist"
          className={`menu-item ${isMemberListActive ? "active" : ""}`}
          onClick={() => onMenuClick?.(null)}
          onMouseEnter={() => onMemberListHover?.()}
          onFocus={() => onMemberListHover?.()}
        >
          <MdPeople className="menu-icon" />
          <span>Members Master List</span>
        </NavLink>

        <NavLink to="/member-location" className={`menu-item ${isMemberLocationActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <MdLocationOn className="menu-icon" />
          <span>Members Location</span>
        </NavLink>

        {/* Expandable Members Applications */}
        <a
          href="#"
          className={`menu-item ${isApplicationsActive ? "active" : ""}`}
          onClick={handleApplicationsClick}
        >
          <MdAssignment className="menu-icon" />
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
          <MdWork className="menu-icon" />
          <span>Requirements</span>
        </NavLink>

        <NavLink to="/newsletter" className={`menu-item ${isNewsletterActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <MdEmail className="menu-icon" />
          <span>News Letter</span>
        </NavLink>

        <NavLink to="/configuration" className={`menu-item ${isConfigurationActive ? "active" : ""}`} onClick={() => onMenuClick?.(null)}>
          <MdSettings className="menu-icon" />
          <span>Configuration</span>
        </NavLink>
      </nav>
    </aside>
  );
}
