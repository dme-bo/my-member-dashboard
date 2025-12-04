// src/pages/DashboardPage.jsx
export default function DashboardPage() {
  return (
    <>
      <header className="top-header">
        <h1>Member Dashboard</h1>
        <div className="top-filters">
          <div className="date-group">
            <div><label>From</label><input type="date" defaultValue="2025-04-01" /></div>
            <div><label>To</label><input type="date" defaultValue="2026-03-31" /></div>
          </div>
          <div className="button-group">
            <button className="btn active">All</button>
            <button className="btn">Military</button>
            <button className="btn">Paramilitary</button>
            <button className="btn">Air Force</button>
          </div>
        </div>
      </header>

      <div className="stats-grid">
        <div className="card"><div className="card-icon blue">Total</div><div className="card-label">Total Members</div><div className="card-value">11,162</div></div>
        <div className="card"><div className="card-icon purple">Gender</div><div className="card-label">Genders</div><div className="card-value">2</div></div>
        <div className="card"><div className="card-icon orange">Categories</div><div className="card-label">Categories</div><div className="card-value">9</div></div>
        <div className="card"><div className="card-icon info">Stats</div><div className="card-label">Services</div><div className="card-value">12</div></div>
        <div className="card"><div className="card-icon success">Stats</div><div className="card-label">Ranks</div><div className="card-value">88</div></div>
        <div className="card"><div className="card-icon red">Stats</div><div className="card-label">Avg Experience</div><div className="card-value">10.9</div></div>
        <div className="card"><div className="card-icon new">Today</div><div className="card-label">Registered Today</div><div className="card-value">1</div></div>
        <div className="card"><div className="card-icon week">Week</div><div className="card-label">This Week</div><div className="card-value">14</div></div>
        <div className="card"><div className="card-icon month">Month</div><div className="card-label">This Month</div><div className="card-value">47</div></div>
        <div className="card"><div className="card-icon quarter">3 Months</div><div className="card-label">Last 3 Months</div><div className="card-value">395</div></div>
      </div>
    </>
  );
}