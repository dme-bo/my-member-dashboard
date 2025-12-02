// src/pages/RecruitmentPage.jsx
import FilterSidebar from "../components/FilterSidebar";

export default function RecruitmentPage({ filterData, filterKeys }) {
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
                  <th>Job ID</th>
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
                <tr>
                  <td><strong>JOB101</strong></td>
                  <td>TCS</td>
                  <td>Defence Consultant</td>
                  <td>Hyderabad</td>
                  <td>12</td>
                  <td>4</td>
                  <td><span className="status active">Open</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <FilterSidebar
          filterData={filterData}
          filterKeys={filterKeys}
          pageKey="RecruitmentPage"
        />
      </div>
    </div>
  );
}