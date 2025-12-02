// src/components/Sidebar.jsx
export default function Sidebar({ currentPage, expandedMenu, onMenuClick, onSubMenuClick }) {
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
        <a
          href="#"
          className={currentPage === "dashboard" ? "active" : ""}
          onClick={(e) => { e.preventDefault(); onMenuClick("dashboard"); }}
        >
          Dashboard
        </a>

        <a
          href="#"
          className={currentPage === "memberlist" ? "active" : ""}
          onClick={(e) => { e.preventDefault(); onMenuClick("memberlist"); }}
        >
          Member List
        </a>

        <a
          href="#"
          className={expandedMenu === "applications" || ["tempstaff", "recruitment", "projects"].includes(currentPage) ? "active" : ""}
          onClick={(e) => { e.preventDefault(); onMenuClick("applications"); }}
        >
          Member Applications
        </a>

        {expandedMenu === "applications" && (
          <div className="submenu">
            <a
              href="#"
              className={currentPage === "tempstaff" ? "active" : ""}
              onClick={(e) => { e.preventDefault(); onSubMenuClick("tempstaff"); }}
            >
              Temp Staff
            </a>
            <a
              href="#"
              className={currentPage === "recruitment" ? "active" : ""}
              onClick={(e) => { e.preventDefault(); onSubMenuClick("recruitment"); }}
            >
              Recruitment
            </a>
            <a
              href="#"
              className={currentPage === "projects" ? "active" : ""}
              onClick={(e) => { e.preventDefault(); onSubMenuClick("projects"); }}
            >
              Projects
            </a>
          </div>
        )}

        <a href="#">Configuration</a>
      </nav>
    </aside>
  );
}