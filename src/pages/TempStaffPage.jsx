// src/pages/TempStaffPage.jsx
import { useState, useMemo, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import FilterSidebar from "../components/FilterSidebar";
import MemberDetailModal from "../components/MemberDetailModal";

export default function TempStaffPage() {
  const [selectedMember, setSelectedMember] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({});
  const [membersData, setMembersData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch only TCS (Temporary Civilian Staff) members who agreed to terms
  useEffect(() => {
    const q = query(
      collection(db, "usersmaster"),
      where("BOCategory", "==", "TCS"),
      // Optional: where("tcs_terms_agreement", "==", "TRUE")
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const data = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setMembersData(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered members with search + filters
  const filteredMembers = useMemo(() => {
    let list = membersData;

    // Search by Name, Mobile, Email, Member ID
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((member) => {
        return (
          member.full_name?.toLowerCase().includes(term) ||
          member.phone_number?.includes(searchTerm) ||
          member.member_id?.toLowerCase().includes(term) ||
          member.email?.toLowerCase().includes(term)
        );
      });
    }

    // Apply sidebar filters
    return list.filter((member) => {
      return Object.entries(filters).every(([key, value]) => {
        if (!value || value === "All") return true;

        const memberValue = member[key];

        if (key === "Service" && member.service) return member.service === value;
        if (key === "State" && member.state) return member.state === value;
        if (key === "Rank" && member.rank) return member.rank === value;

        // Rating not present in TCS, so skip or handle differently
        if (key === "Rating") return true;

        // Default string match
        return String(memberValue || "").toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [searchTerm, filters, membersData]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value === "All" ? "" : value,
    }));
  };

  const clearFilters = () => setFilters({});

  const openModal = (member) => setSelectedMember(member);
  const closeModal = () => setSelectedMember(null);

  // Updated filter options based on real TCS data
  const filterConfig = {
    state: ["Bihar", "Delhi", "Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh", "West Bengal"],
    // Add more dynamic options later if needed
    // "Manpower Type": ["Vendor Manpower", "Brisk Olive Manpower"],
  };

  const filterData = { filters, handleFilterChange, clearFilters };

  if (loading) {
    return <div className="loading">Loading Temporary Staff Applications...</div>;
  }

  return (
    <div className="member-list-page with-filters">
      <div className="page-header">
        <h1>Temporary Staff Applications (TCS)</h1>
      </div>

      {/* Search Bar */}
      <div className="search-section" style={{ margin: "16px 0" }}>
        <input
          type="text"
          placeholder="Search by Name, Mobile, Email, or Member ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="big-search-input"
          autoFocus
        />
      </div>

      <div className="content-with-sidebar">
        {/* Table */}
        <div className="table-container">
          <div className="table-wrapper">
            <table className="temp-staff-table clean">
              <thead>
                <tr>
                  
                  <th>Full Name</th>
                  <th>Mobile</th>
                  <th>Category</th>
                  <th>State</th>
                  <th>City</th>
                  
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                      {searchTerm || Object.keys(filters).length > 0
                        ? "No TCS members found matching your criteria"
                        : "No Temporary Civilian Staff applications yet"}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr
                      key={member.member_id || member.id}
                      className="clickable-row"
                      onClick={() => openModal(member)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong>{member.full_name}</strong>
                      </td>
                      <td>{member.phone_number}</td>
                      <td>{member.category}</td>
                      <td>{member.state}</td>
                      <td>{member.city}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Filter Sidebar */}
        <FilterSidebar
          filterData={filterData}
          filterKeys={Object.keys(filterConfig)}
          pageKey="TempStaffPage"
          customOptions={filterConfig}
        />
      </div>

      {/* Detail Modal */}
      {selectedMember && <MemberDetailModal member={selectedMember} onClose={closeModal} />}
    </div>
  );
}