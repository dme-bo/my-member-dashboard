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

  // Auto-expand "applications" menu when on any of its subpages
  const isApplicationsExpanded =
    expandedMenu === "applications" ||
    ["/tempstaff", "/recruitment", "/projects"].includes(location.pathname);

  const handleParentClick = (e) => {
    e.preventDefault();
    setExpandedMenu(expandedMenu === "applications" ? null : "applications");
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

        <NavLink
          to="/memberlist"
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          Member List
        </NavLink>

        {/* Parent Menu Item - Clickable to expand/collapse */}
        <a
          href="#"
          className={isApplicationsActive ? "active" : ""}
          onClick={handleParentClick}
          style={{ cursor: "pointer" }}
        >
          Member Applications
          <span className="arrow">{isApplicationsExpanded}</span>
        </a>

        {/* Submenu - shown when expanded or when on a subpage */}
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
        <NavLink to="/requirements" className={({ isActive }) => (isActive ? "active" : "")}>
          Requirements
        </NavLink>
        <NavLink to="/configuration" className={({ isActive }) => (isActive ? "active" : "")}>
          Configuration
        </NavLink>
        
      </nav>
    </aside>
  );
}