import React, { useState, useMemo } from "react";
import "./App.css";

const membersData = [
  {
    "Member Id": "BO003",
    "Entry Date": "2025-11-15",
    "Full Name": "Col Rajesh Kumar",
    "Country": "India",
    "Mobile Number": "9876543210",
    "Whatsapp": "9876543210",
    "Email": "rajesh@example.com",
    "Gender": "Male",
    "Dob": "1978-05-12",
    "Category": "Military",
    "Service": "Army",
    "Rank": "Colonel",
    "Level": "Officer",
    "State": "Delhi",
    "City": "New Delhi",
    "Current Location": "Delhi",
    "Permanent Address": "123 Defence Colony, New Delhi",
    "Pincode": "110024",
    "Apply Job": "Yes",
    "Placed by BO": "No",
    "Tags": "Premium, Active, Leadership",
    "No of Jobs Applied": 12,
    "No of Shortlistings": 5,
    "Rating": "Excellent",
    "Year Of Commission": "2000",
    "Commission Course": "IMA 105",
    "Actual Plan Date Of Retirement": "2035-05-31",
    "Education": "B.Tech (Electronics), MBA",
    "Govt Experience": "24 years",
    "Corporate Experience": "0 years",
    "Total Experience": "24 years",
    "Work Experience": "Commanded Infantry Battalion, Staff Officer at Army HQ",
    "It Skills": "MS Office, Basic Python",
    "Mba": "Yes",
    "English": "Fluent",
    "Current Ctc": "N/A",
    "Expected Ctc": "25-30 LPA",
    "Notice Period": "3 months",
    "Preferred Job Location": "Delhi, Bangalore, Mumbai",
    "Aadhaar Number": "123456789012",
    "Pan Number": "ABCDE1234F",
    "Bank Name": "SBI",
    "Account Number": "12345678901",
    "CV Attachment": "Yes",
    "Profile Photo": "Yes",
    "Blacklisted": "No"
  },
  {
    "Member Id": "BO002",
    "Entry Date": "2025-10-20",
    "Full Name": "Lt Col Priya Singh",
    "Country": "India",
    "Mobile Number": "8765432109",
    "Email": "priya@example.com",
    "Gender": "Female",
    "Dob": "1983-01-25",
    "Category": "Military",
    "Service": "Army",
    "Rank": "Lt Colonel",
    "Level": "Officer",
    "State": "Maharashtra",
    "City": "Pune",
    "Current Location": "Pune",
    "Permanent Address": "456 Army Apt, Pune",
    "Pincode": "411001",
    "Apply Job": "Yes",
    "Placed by BO": "Yes",
    "Tags": "Placed, Mentor, Women Leader",
    "No of Jobs Applied": 8,
    "No of Shortlistings": 6,
    "Rating": "Good",
    "Year Of Commission": "2005",
    "Commission Course": "OTA 75",
    "Actual Plan Date Of Retirement": "2030-01-31",
    "Education": "M.Sc Physics, PGDHRM",
    "Govt Experience": "19 years",
    "Corporate Experience": "1 year",
    "Total Experience": "20 years",
    "Work Experience": "Served as Staff Officer, HR role in a Brigade",
    "It Skills": "Excel, Power BI, Project Management",
    "Mba": "No",
    "English": "Fluent",
    "Current Ctc": "28 LPA",
    "Expected Ctc": "32+ LPA",
    "Notice Period": "60 days",
    "Preferred Job Location": "Pune, Chennai",
    "Aadhaar Number": "987654321098",
    "Pan Number": "FGHIJ5678K",
    "Bank Name": "HDFC",
    "Account Number": "09876543210",
    "CV Attachment": "Yes",
    "Profile Photo": "Yes",
    "Blacklisted": "No"
  },
  {
    "Member Id": "BO001",
    "Entry Date": "2025-09-01",
    "Full Name": "Sqn Ldr Anil Verma",
    "Country": "India",
    "Mobile Number": "7654321098",
    "Email": "anil@example.com",
    "Gender": "Male",
    "Dob": "1980-11-20",
    "Category": "Military",
    "Service": "Air Force",
    "Rank": "Squadron Leader",
    "Level": "Officer",
    "State": "Karnataka",
    "City": "Bangalore",
    "Current Location": "Bangalore",
    "Permanent Address": "789 Air Force Area, Bangalore",
    "Pincode": "560017",
    "Apply Job": "Yes",
    "Placed by BO": "No",
    "Tags": "Active, Technical",
    "No of Jobs Applied": 5,
    "No of Shortlistings": 1,
    "Rating": "Average",
    "Year Of Commission": "2002",
    "Commission Course": "AFA 170",
    "Actual Plan Date Of Retirement": "2032-11-30",
    "Education": "M.Tech (Aeronautical), PMP",
    "Govt Experience": "23 years",
    "Corporate Experience": "0 years",
    "Total Experience": "23 years",
    "Work Experience": "Flight Safety Officer, Technical Project Lead",
    "It Skills": "AutoCAD, MATLAB, Project Management",
    "Mba": "No",
    "English": "Fluent",
    "Current Ctc": "N/A",
    "Expected Ctc": "20-25 LPA",
    "Notice Period": "1 month",
    "Preferred Job Location": "Bangalore, Hyderabad",
    "Aadhaar Number": "543210987654",
    "Pan Number": "LMNOP9012Q",
    "Bank Name": "Axis Bank",
    "Account Number": "21098765432",
    "CV Attachment": "Yes",
    "Profile Photo": "Yes",
    "Blacklisted": "No"
  }
  // Add more members...
];

// --- Custom Hook for Filters ---
const useFilters = (data, filterKeys) => {
  const initialFilters = filterKeys.reduce((acc, key) => ({ ...acc, [key]: "All" }), {});
  const [filters, setFilters] = useState(initialFilters);

  const availableOptions = useMemo(() => {
    return filterKeys.reduce((acc, key) => {
      let options = data.map(item => {
        if (key === 'Tags' && item[key]) {
          return item[key].split(',').map(tag => tag.trim());
        }
        return item[key];
      }).flat().filter(Boolean); // Flatten for tags and remove null/undefined

      // Deduplicate and sort, exclude 'All'
      acc[key] = [...new Set(options)].sort();
      return acc;
    }, {});
  }, [data, filterKeys]);

  const applyFilters = (list) => {
    return list.filter(item => {
      return filterKeys.every(key => {
        const filterValue = filters[key];

        if (filterValue === "All") {
          return true;
        }

        // Special handling for Tags as it's a comma-separated string
        if (key === 'Tags') {
          return item[key] && item[key].split(',').map(tag => tag.trim()).includes(filterValue);
        }
        
        // Default check
        return item[key] === filterValue;
      });
    });
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(initialFilters);
  };

  return { filters, availableOptions, handleFilterChange, clearFilters, applyFilters };
};

// --- Filter Sidebar Component ---
function FilterSidebar({ title, filterData, filterKeys, onClear, pageKey }) {
  const { filters, availableOptions, handleFilterChange, clearFilters } = filterData;
  const isMemberPage = pageKey === 'memberlist';

  // Placeholder filter options for non-member pages
  const placeholderOptions = {
    'TempStaffPage': {
      'Company': ['Tata Power', 'Adani Group', 'L&T'],
      'Role': ['Consultant', 'Admin', 'Technical'],
      'Duration': ['3 months', '6 months', '1 year'],
      'Status': ['In Progress', 'Completed', 'New'],
    },
    'RecruitmentPage': {
      'Company': ['Reliance', 'Infosys', 'Wipro'],
      'Position': ['Head', 'Manager', 'Analyst'],
      'Location': ['Mumbai', 'Bangalore', 'Delhi'],
      'Status': ['Open', 'Filled', 'Hold'],
    },
    'ProjectsPage': {
      'Client': ['DRDO', 'DICCI', 'Govt of India'],
      'Domain': ['Training', 'Mentorship', 'IT'],
      'Status': ['Active', 'Completed', 'Planning'],
    },
  };

  const currentOptions = isMemberPage ? availableOptions : placeholderOptions[pageKey];
  const currentFilterKeys = isMemberPage ? filterKeys : Object.keys(currentOptions);


  return (
    <div className="filter-sidebar">
      <div className="filter-header">
        <h3><span style={{marginRight: '8px'}}></span> Filters</h3>
        <button className="clear-all" onClick={clearFilters}>
          Clear All
        </button>
      </div>
      
      {currentFilterKeys.map(key => (
        <div key={key} className="filter-section">
          <h4>{key.replace(/([A-Z])/g, ' $1').trim()}</h4> {/* Add space before capital letters */}
          <select
            className="filter-select"
            value={filters[key] || "All"}
            onChange={(e) => handleFilterChange(key, e.target.value)}
          >
            <option value="All">All {key}</option>
            {currentOptions[key]?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// === NEW PAGES ===
function TempStaffPage({ filterData, filterKeys }) {
  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <h1>Temporary Staff Applications</h1>
      </div>
      
      <div className="content-with-sidebar">
        <div className="table-container">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Duration</th>
                  <th>Members Assigned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>TS001</strong></td>
                  <td>Tata Power</td>
                  <td>Security Consultant</td>
                  <td>6 months</td>
                  <td>3</td>
                  <td><span className="status active">In Progress</span></td>
                </tr>
                <tr>
                  <td><strong>TS002</strong></td>
                  <td>Adani Group</td>
                  <td>Admin Support</td>
                  <td>3 months</td>
                  <td>1</td>
                  <td><span className="status placed">Completed</span></td>
                </tr>
                <tr>
                  <td><strong>TS003</strong></td>
                  <td>L&T</td>
                  <td>Technical Expert</td>
                  <td>1 year</td>
                  <td>2</td>
                  <td><span className="status active">New</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <FilterSidebar title="Temp Staff" filterData={filterData} filterKeys={filterKeys} pageKey="TempStaffPage" />
      </div>
    </div>
  );
}

function RecruitmentPage({ filterData, filterKeys }) {
  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <h1>Recruitment Applications</h1>
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Company</th>
                  <th>Position</th>
                  <th>Location</th>
                  <th>Applications</th>
                  <th>Shortlisted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>JOB089</strong></td>
                  <td>Reliance Industries</td>
                  <td>Head - Security</td>
                  <td>Mumbai</td>
                  <td>18</td>
                  <td>6</td>
                  <td><span className="status active">Open</span></td>
                </tr>
                <tr>
                  <td><strong>JOB074</strong></td>
                  <td>Infosys</td>
                  <td>Project Manager (Ex-Army)</td>
                  <td>Bangalore</td>
                  <td>24</td>
                  <td>9</td>
                  <td><span className="status placed">Filled</span></td>
                </tr>
                <tr>
                  <td><strong>JOB090</strong></td>
                  <td>Wipro</td>
                  <td>Cyber Security Analyst</td>
                  <td>Delhi</td>
                  <td>5</td>
                  <td>2</td>
                  <td><span className="status active">Open</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <FilterSidebar title="Recruitment" filterData={filterData} filterKeys={filterKeys} pageKey="RecruitmentPage" />
      </div>
    </div>
  );
}

function ProjectsPage({ filterData, filterKeys }) {
  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <h1>Project Applications</h1>
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Domain</th>
                  <th>Duration</th>
                  <th>Volunteers</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>PRJ056</strong></td>
                  <td>Skill Development Program</td>
                  <td>DRDO</td>
                  <td>Training</td>
                  <td>12 months</td>
                  <td>8</td>
                  <td><span className="status active">Active</span></td>
                </tr>
                <tr>
                  <td><strong>PRJ042</strong></td>
                  <td>Veterans Entrepreneurship</td>
                  <td>DICCI</td>
                  <td>Mentorship</td>
                  <td>6 months</td>
                  <td>15</td>
                  <td><span className="status placed">Completed</span></td>
                </tr>
                <tr>
                  <td><strong>PRJ057</strong></td>
                  <td>IT Infrastructure Audit</td>
                  <td>Govt of India</td>
                  <td>IT</td>
                  <td>3 months</td>
                  <td>4</td>
                  <td><span className="status active">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <FilterSidebar title="Projects" filterData={filterData} filterKeys={filterKeys} pageKey="ProjectsPage" />
      </div>
    </div>
  );
}

// === MAIN APP WITH EXPANDABLE MENU ===
function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedMenu, setExpandedMenu] = useState(null); // null or "applications"

  // Define the keys for member list filters
  const memberFilterKeys = ["Gender", "Category", "Service", "Rank", "State", "City", "Tags"];
  const memberFilterData = useFilters(membersData, memberFilterKeys);

  // Define keys for placeholder pages (using the actual field names from the placeholderOptions in FilterSidebar)
  const tempStaffFilterKeys = ['Company', 'Role', 'Duration', 'Status'];
  const tempStaffFilterData = useFilters([], tempStaffFilterKeys); // Use empty data for placeholder options

  const recruitmentFilterKeys = ['Company', 'Position', 'Location', 'Status'];
  const recruitmentFilterData = useFilters([], recruitmentFilterKeys);

  const projectsFilterKeys = ['Client', 'Domain', 'Status'];
  const projectsFilterData = useFilters([], projectsFilterKeys);


  const handleMenuClick = (page) => {
    if (page === "applications") {
      setExpandedMenu(expandedMenu === "applications" ? null : "applications");
    } else {
      setCurrentPage(page);
      setExpandedMenu(null);
    }
  };

  const handleSubMenuClick = (subPage) => {
    setCurrentPage(subPage);
    setExpandedMenu("applications"); // keep parent open
  };

  return (
    <div className="app-container">
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
            onClick={() => handleMenuClick("dashboard")}
          >
            Dashboard
          </a>
          <a
            href="#"
            className={currentPage === "memberlist" ? "active" : ""}
            onClick={() => handleMenuClick("memberlist")}
          >
            Member List
          </a>

          {/* EXPANDABLE MENU */}
          <a
            href="#"
            className={(expandedMenu === "applications" || currentPage.includes("tempstaff|recruitment|projects")) ? "active" : ""}
            onClick={() => handleMenuClick("applications")}
            style={{ position: "relative" }}
          >
            Member Applications
            <span style={{ float: "right", fontSize: "12px" }}>
              {/* Added a placeholder icon for expansion if needed */}
            </span>
          </a>

          {expandedMenu === "applications" && (
            <div className="submenu">
              <a
                href="#"
                className={currentPage === "tempstaff" ? "active" : ""}
                onClick={() => handleSubMenuClick("tempstaff")}
              >
                Temp Staff
              </a>
              <a
                href="#"
                className={currentPage === "recruitment" ? "active" : ""}
                onClick={() => handleSubMenuClick("recruitment")}
              >
                Recruitment
              </a>
              <a
                href="#"
                className={currentPage === "projects" ? "active" : ""}
                onClick={() => handleSubMenuClick("projects")}
              >
                Projects
              </a>
            </div>
          )}

          <a href="#">Configuration</a>
        </nav>
      </aside>

      <div className="main-content">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "memberlist" && (
          <MemberListPage
            onMemberClick={setSelectedMember}
            filterData={memberFilterData}
            filterKeys={memberFilterKeys}
          />
        )}
        {currentPage === "tempstaff" && (
          <TempStaffPage
            filterData={tempStaffFilterData}
            filterKeys={tempStaffFilterKeys}
          />
        )}
        {currentPage === "recruitment" && (
          <RecruitmentPage
            filterData={recruitmentFilterData}
            filterKeys={recruitmentFilterKeys}
          />
        )}
        {currentPage === "projects" && (
          <ProjectsPage
            filterData={projectsFilterData}
            filterKeys={projectsFilterKeys}
          />
        )}
      </div>

      {selectedMember && <MemberDetailModal member={selectedMember} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

// ... (DashboardPage, MemberDetailModal, etc. remain the same)

function DashboardPage() {
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
            <button className="btn">Army</button>
            <button className="btn">Navy</button>
            <button className="btn">Air Force</button>
          </div>
        </div>
      </header>

      <div className="stats-grid">
        <div className="card"><div className="card-icon blue">Total</div><div className="card-label">Total Members</div><div className="card-value">11,162</div></div>
        <div className="card"><div className="card-icon purple">Stats</div><div className="card-label">Genders</div><div className="card-value">2</div></div>
        <div className="card"><div className="card-icon orange">Stats</div><div className="card-label">Categories</div><div className="card-value">9</div></div>
        <div className="card"><div className="card-icon info">Stats</div><div className="card-label">Services</div><div className="card-value">12</div></div>
        <div className="card"><div className="card-icon success">Stats</div><div className="card-label">Ranks</div><div className="card-value">88</div></div>
        <div className="card"><div className="card-icon red">Stats</div><div className="card-label">Avg Experience</div><div className="card-value">10.9</div></div>
        <div className="card"><div className="card-icon new">Today</div><div className="card-label">Registered Today</div><div className="card-value">1</div></div>
        <div className="card"><div className="card-icon week">Week</div><div className="card-label">Registered This Week</div><div className="card-value">14</div></div>
        <div className="card"><div className="card-icon month">Month</div><div className="card-label">Registered This Month</div><div className="card-value">47</div></div>
        <div className="card"><div className="card-icon quarter">3 Months</div><div className="card-label">Registered Last 3 Months</div><div className="card-value">395</div></div>
      </div>
    </>
  );
}

function MemberDetailModal({ member, onClose }) {
  if (!member) return null;
  const [activeTab, setActiveTab] = useState("personal");

  const tabs = [
    { id: "personal", label: "Personal Info" },
    { id: "service", label: "Service Record" },
    { id: "job", label: "Job Preferences" },
    { id: "experience", label: "Experience & Skills" },
    { id: "documents", label: "Documents & IDs" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{member["Full Name"]}</h2>
            <p style={{ margin: "5px 0", opacity: 0.9, fontSize: "15px" }}>
              {member["Rank"]} • {member["Service"]} • {member["Member Id"]}
            </p>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {activeTab === "personal" && (
            <div className="detail-grid">
              <div><strong>Full Name:</strong> {member["Full Name"]}</div>
              <div><strong>Date of Birth:</strong> {member["Dob"] || "Not Provided"}</div>
              <div><strong>Gender:</strong> {member["Gender"]}</div>
              <div><strong>Email:</strong> {member["Email"]}</div>
              <div><strong>Mobile:</strong> {member["Mobile Number"]}</div>
              <div><strong>WhatsApp:</strong> {member["Whatsapp"] || "Same"}</div>
              <div><strong>Current Location:</strong> {member["Current Location"]}</div>
              <div><strong>Preferred Location:</strong> {member["Preferred Job Location"] || "Any"}</div>
              <div><strong>Permanent Address:</strong> {member["Permanent Address"] || "-"}</div>
              <div><strong>Pincode:</strong> {member["Pincode"] || "-"}</div>
            </div>
          )}

          {activeTab === "service" && (
            <div className="detail-grid">
              <div><strong>Service:</strong> {member["Service"]}</div>
              <div><strong>Rank:</strong> {member["Rank"]}</div>
              <div><strong>Category:</strong> {member["Category"]}</div>
              <div><strong>Level:</strong> {member["Level"]}</div>
              <div><strong>Year of Commission:</strong> {member["Year Of Commission"] || "-"}</div>
              <div><strong>Commission Course:</strong> {member["Commission Course"] || "-"}</div>
              <div><strong>Planned Retirement:</strong> {member["Actual Plan Date Of Retirement"] || "-"}</div>
              <div><strong>Status:</strong>
                <span className={`status ${member["Placed by BO"] === "Yes" ? "placed" : "active"}`}>
                  {member["Placed by BO"] === "Yes" ? "Placed" : "Active Job Seeker"}
                </span>
              </div>
            </div>
          )}

          {activeTab === "job" && (
            <div className="detail-grid">
              <div><strong>Apply Job:</strong> {member["Apply Job"]}</div>
              <div><strong>Jobs Applied:</strong> {member["No of Jobs Applied"] || 0}</div>
              <div><strong>Shortlisted:</strong> {member["No of Shortlistings"] || 0}</div>
              <div><strong>Current CTC:</strong> {member["Current Ctc"] || "N/A"}</div>
              <div><strong>Expected CTC:</strong> {member["Expected Ctc"] || "N/A"}</div>
              <div><strong>Notice Period:</strong> {member["Notice Period"] || "N/A"}</div>
              <div><strong>Education:</strong> {member["Education"] || "-"}</div>
              <div><strong>MBA:</strong> {member["Mba"] ? "Yes" : "No"}</div>
              <div><strong>English Proficiency:</strong> {member["English"] || "-"}</div>
            </div>
          )}

          {activeTab === "experience" && (
            <div className="detail-grid">
              <div><strong>Govt Experience:</strong> {member["Govt Experience"] || "-"}</div>
              <div><strong>Corporate Experience:</strong> {member["Corporate Experience"] || "None"}</div>
              <div><strong>Total Experience:</strong> {member["Total Experience"] || "-"}</div>
              <div><strong>Key Skills:</strong> {member["It Skills"] || "Not specified"}</div>
              <div><strong>Work Summary:</strong><br /><small>{member["Work Experience"] || "Not updated"}</small></div>
            </div>
          )}

          {activeTab === "documents" && (
            <div className="detail-grid">
              <div><strong>Aadhaar:</strong> {member["Aadhaar Number"] ? "••••••••" + member["Aadhaar Number"].slice(-4) : "Not uploaded"}</div>
              <div><strong>PAN:</strong> {member["Pan Number"] || "Not uploaded"}</div>
              <div><strong>Bank:</strong> {member["Bank Name"] || "-"} ({member["Account Number"] ? "•••" + member["Account Number"].slice(-4) : ""})</div>
              <div><strong>CV Attached:</strong> {member["CV Attachment"] ? "Yes" : "No"}</div>
              <div><strong>Profile Photo:</strong> {member["Profile Photo"] ? "Yes" : "No"}</div>
              <div><strong>Tags:</strong> <span style={{color:"#1e40af", fontWeight:"bold"}}>{member["Tags"] || "None"}</span></div>
              <div><strong>Blacklisted:</strong> <span style={{color: member["Blacklisted"] === "Yes" ? "#ef4444" : "#10b981", fontWeight:"bold"}}>{member["Blacklisted"] || "No"}</span></div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}


function MemberListPage({ onMemberClick, filterData, filterKeys }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");

  const { applyFilters } = filterData;

  const filteredMembers = useMemo(() => {
    const list = membersData.filter(member => {
      const matchesSearch = 
        member["Full Name"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member["Mobile Number"]?.includes(searchTerm) ||
        member["Member Id"]?.toLowerCase().includes(searchTerm) ||
        member["Email"]?.toLowerCase().includes(searchTerm);
      
      return matchesSearch;
    });

    const filteredByStatus = list.filter(member => {
      return filterPlaced === "all" ||
        (filterPlaced === "placed" && member["Placed by BO"] === "Yes") ||
        (filterPlaced === "active" && member["Placed by BO"] === "No");
    });

    // Apply the sidebar filters
    return applyFilters(filteredByStatus);
  }, [searchTerm, filterPlaced, applyFilters]);

  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <h1>Member Details</h1>
        <div className="header-actions">
          <select className="filter-select" value={filterPlaced} onChange={e => setFilterPlaced(e.target.value)}>
            <option value="all">All Members</option>
            <option value="active">Active Seekers</option>
            <option value="placed">Placed</option>
          </select>
          <button className="btn-purple">Export CSV</button>
        </div>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email, ID..."
          className="search-input"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="content-with-sidebar">
        <div className="table-container">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Name</th>
                  <th>Rank</th>
                  <th>Service</th>
                  <th>Mobile</th>
                  <th>Location</th>
                  <th>Applied</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member, i) => (
                  <tr key={i} onClick={() => onMemberClick(member)} style={{ cursor: "pointer" }}>
                    <td><strong>{member["Member Id"]}</strong></td>
                    <td>
                      <div style={{fontWeight:500}}>{member["Full Name"]}</div>
                      <small style={{color:"#666"}}>{member["Email"]}</small>
                    </td>
                    <td>{member["Rank"]}</td>
                    <td>{member["Service"]}</td>
                    <td>{member["Mobile Number"]}</td>
                    <td>{member["City"]}</td>
                    <td><strong>{member["No of Jobs Applied"] || 0}</strong></td>
                    <td>
                      <span className={`status ${member["Placed by BO"] === "Yes" ? "placed" : "active"}`}>
                        {member["Placed by BO"] === "Yes" ? "Placed" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "20px" }}>
                      No members found matching the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        <FilterSidebar title="Member List" filterData={filterData} filterKeys={filterKeys} pageKey="memberlist" />
      </div>
    </div>
  );
}
export default App;