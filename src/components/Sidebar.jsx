// src/components/Sidebar.jsx
import { NavLink, useLocation } from "react-router-dom";
import { useState } from "react";

export default function Sidebar() {
  const location = useLocation();
  const [expandedMenu, setExpandedMenu] = useState(null);

  // Determine if "Member Applications" parent should look active
  const isApplicationsActive =
    expandedMenu === "applications" ||
    ["/tempstaff", "/recruitment", "/projects"].includes(location.pathname);

  const isApplicationsExpanded =
    expandedMenu === "applications" ||
    ["/tempstaff", "/recruitment", "/projects"].includes(location.pathname);

  // NEW: Determine if "Member Master List" parent should look active
  const isMemberListActive =
    expandedMenu === "memberlist" ||
    ["/memberlist", "/memberlist"].includes(location.pathname);

  const isMemberListExpanded =
    expandedMenu === "memberlist" ||
    ["/memberlist", "/memberlist"].includes(location.pathname);

  const handleApplicationsClick = (e) => {
    e.preventDefault();
    setExpandedMenu(expandedMenu === "applications" ? null : "applications");
  };

  // NEW: Handler for Member Master List parent
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
          <p>Member Dashboard</p>
        </div>
      </div>

      <nav className="sidebar-menu">
        <NavLink
          to="/"
          className={({ isActive }) => (isActive ? "active" : "")}
          end
        >
          Dashboard
        </NavLink>

        {/* NEW: Expandable Member Master List */}
        <a
          href="#"
          className={isMemberListActive ? "active" : ""}
          onClick={handleMemberListClick}
          style={{ cursor: "pointer" }}
        >
          Member Master List
          <span className="arrow">
            {isMemberListExpanded ? "" : ""}
          </span>
        </a>

        {/* Submenu for Member Master List */}
        {isMemberListExpanded && (
          <div className="submenu">
            <NavLink
              to="/memberlist"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Member List
            </NavLink>
            <NavLink
              to="/partneragent"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Partner Agent List
            </NavLink>
          </div>
        )}

        {/* Existing Member Applications section */}
        <a
          href="#"
          className={isApplicationsActive ? "active" : ""}
          onClick={handleApplicationsClick}
          style={{ cursor: "pointer" }}
        >
          Member Applications
          <span className="arrow">
            {isApplicationsExpanded ? "" : ""}
          </span>
        </a>

        {isApplicationsExpanded && (
          <div className="submenu">
            <NavLink
              to="/tempstaff"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              TCS
            </NavLink>
            <NavLink
              to="/recruitment"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Recruitment
            </NavLink>
            <NavLink
              to="/projects"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Projects
            </NavLink>
          </div>
        )}

        <NavLink
          to="/requirements"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Requirements
        </NavLink>

        <NavLink
          to="/newsletter"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          News Letter
        </NavLink>

        <NavLink
          to="/configuration"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Configuration
        </NavLink>

        
      </nav>
    </aside>
  );
}