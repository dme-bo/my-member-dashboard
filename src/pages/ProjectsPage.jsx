// src/pages/ProjectsPage.jsx
import FilterSidebar from "../components/FilterSidebar";

export default function ProjectsPage({ filterData, filterKeys }) {
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
                  <th>Project ID</th>
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
                  <td>4 months</td>
                  <td>4</td>
                  <td><span className="status active">Active</span></td>
                </tr>
                <tr>
                  <td><strong>PRJ061</strong></td>
                  <td>Leadership Workshop</td>
                  <td>Indian Army Welfare</td>
                  <td>Training</td>
                  <td>3 months</td>
                  <td>10</td>
                  <td><span className="status active">Planning</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <FilterSidebar
          filterData={filterData}
          filterKeys={filterKeys}
          pageKey="ProjectsPage"
        />
      </div>
    </div>
  );
}