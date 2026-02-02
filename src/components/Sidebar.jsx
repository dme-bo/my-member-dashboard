// src/components/Sidebar.jsx
import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";

// Icons from react-icons (feel free to choose different ones)
import { 
  MdDashboard, 
  MdPeople,           // Members Master List
  MdAssignment,       // Applications
  MdWork,             // Requirements
  MdEmail,            // Newsletter
  MdSettings,         // Configuration
  MdExpandMore,       // Arrow for expandable items
  MdExpandLess 
} from "react-icons/md";

import { 
  FaUserTie,          // TCS / Temp Staffing
  FaBriefcase,        // Recruitment
  FaTasks             // Projects
} from "react-icons/fa";

export default function Sidebar() {
  const location = useLocation();
  const [expandedMenu, setExpandedMenu] = useState(null);

  // Determine if "Member Applications" parent should look active
  const isApplicationsActive =
    expandedMenu === "applications" ||
    ["/tempstaff", "/recruitment", "/projects"].includes(location.pathname);

  const isApplicationsExpanded = expandedMenu === "applications";

  // Determine if "Members Master List" parent should look active
  const isMemberListActive =
    expandedMenu === "memberlist" ||
    location.pathname === "/memberlist";

  const isMemberListExpanded = expandedMenu === "memberlist";

  const handleApplicationsClick = (e) => {
    e.preventDefault();
    setExpandedMenu(expandedMenu === "applications" ? null : "applications");
  };

  const handleMemberListClick = (e) => {
    e.preventDefault();
    setExpandedMenu(expandedMenu === "memberlist" ? null : "memberlist");
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
        <NavLink
          to="/"
          className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
          end
          onClick={() => setExpandedMenu(null)}
        >
          <MdDashboard className="menu-icon" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/memberlist"
          className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
          onClick={() => setExpandedMenu(null)}
        >
          <MdPeople className="menu-icon" />
          <span>Members Master List</span>
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

        <NavLink
          to="/requirements"
          className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
          onClick={() => setExpandedMenu(null)}
        >
          <MdWork className="menu-icon" />
          <span>Requirements</span>
        </NavLink>

        <NavLink
          to="/newsletter"
          className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
          onClick={() => setExpandedMenu(null)}
        >
          <MdEmail className="menu-icon" />
          <span>News Letter</span>
        </NavLink>

        <NavLink
          to="/configuration"
          className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
          onClick={() => setExpandedMenu(null)}
        >
          <MdSettings className="menu-icon" />
          <span>Configuration</span>
        </NavLink>
      </nav>
    </aside>
  );
}