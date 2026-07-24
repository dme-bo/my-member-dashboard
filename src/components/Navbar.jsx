import React from "react";
import { useLocation } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  const location = useLocation();

  // Get page title from pathname
  const getPageTitle = () => {
    const path = location.pathname.slice(1) || "dashboard";
    const titles = {
      dashboard: "Members Analytics Dashboard",
      memberlist: "Members List",
      "member-location": "Member Location",
      tempstaff: "TCS Applications",
      recruitment: "Recruitment Applications",
      projects: "Projects Applications",
      requirements: "Requirements Allocations Dashboard",
      interactions: "Escalations",
      "regimental-centers": "Regimental Centers",
      training: "Training",
      configuration: "Configuration",
      newsletter: "Newsletter",
      partneragent: "Regional Partner List",
      scoring: "Scoring",
    };
    return titles[path] || "Dashboard";
  };

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <h1 className="navbar-title">{getPageTitle()}</h1>
      </div>
    </nav>
  );
}

export default Navbar;
