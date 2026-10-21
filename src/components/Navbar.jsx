import React from "react";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-content">
        <h1 className="navbar-title">Members Dashboard</h1>
      </div>
    </nav>
  );
}

export default React.memo(Navbar);
