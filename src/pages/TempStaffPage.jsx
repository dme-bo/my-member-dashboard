// src/pages/TempStaffPage.jsx
import FilterSidebar from "../components/FilterSidebar";

export default function TempStaffPage({ filterData, filterKeys }) {
  return (
    <div className="member-list-page with-filters">
      {/* Page Header */}
      <div className="page-header">
        <h1>Temporary Staff Applications</h1>
      </div>

      {/* Main Content + Sidebar */}
      <div className="content-with-sidebar">
        {/* Table Section */}
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
                  <td>L&amp;T</td>
                  <td>Technical Expert</td>
                  <td>1 year</td>
                  <td>2</td>
                  <td><span className="status active">New</span></td>
                </tr>
                <tr>
                  <td><strong>TS004</strong></td>
                  <td>Mahindra Defence</td>
                  <td>Project Coordinator</td>
                  <td>9 months</td>
                  <td>4</td>
                  <td><span className="status active">In Progress</span></td>
                </tr>
                <tr>
                  <td><strong>TS005</strong></td>
                  <td>Godrej Security</td>
                  <td>Risk Assessment Lead</td>
                  <td>4 months</td>
                  <td>2</td>
                  <td><span className="status active">Open</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Filter Sidebar */}
        <FilterSidebar
          filterData={filterData}
          filterKeys={filterKeys}
          pageKey="TempStaffPage"
        />
      </div>
    </div>
  );
}