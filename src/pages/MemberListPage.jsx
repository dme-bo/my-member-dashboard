// src/pages/MemberListPage.jsx
import { useState, useMemo, useEffect, useRef, useTransition } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import DualRangeSlider from "../components/DualRangeSlider";
import FilterSidebar from "../components/FilterSidebar";
import * as XLSX from "xlsx"; // ← Required for Excel export
import useDebouncedValue from "../hooks/useDebouncedValue";
import {
  normalizeMemberRecord,
  getMemberName,
  getMemberPhone,
  getMemberOrganization,
  getMemberEmail,
  getMemberService,
  getMemberRank,
  getMemberState,
  getMemberCity,
  getMemberEducation,
  getMemberExperience,
  parseMemberSkills,
} from "../utils/memberFields";

export default function MemberListPage({ onMemberClick }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced, setFilterPlaced] = useState("all");
  const [members, setMembers] = useState([]);
  const [isMembersLoaded, setIsMembersLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [filterSearchTerms, setFilterSearchTerms] = useState({});
  const filtersRef = useRef(null);
  const loadSequenceRef = useRef(0);
  const [, startTransition] = useTransition();
  const [retirementStatus, setRetirementStatus] = useState("All");
  const [ageRange, setAgeRange] = useState([0, 100]);
  const [tagModalMember, setTagModalMember] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [expandedTagsMemberId, setExpandedTagsMemberId] = useState(null);
  const [tagModalSaving, setTagModalSaving] = useState(false);
  const [tagModalError, setTagModalError] = useState("");
  const [tagSuccessPopup, setTagSuccessPopup] = useState({ show: false, message: "", type: "success" });
  const [removeTagTarget, setRemoveTagTarget] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);

  const [sidebarFilters, setSidebarFilters] = useState({
    Gender: "All",
    Category: "All",
    Service: "All",
    Rank: "All",
    Level: "All",
    Trade: "All",
    City: "All",
    State: "All",
    Education: "All",
    Status: "All",
    "Placement Status": "All",
    Experience: "All",
    Tags: "All",
  });

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 180);

  // Fetch members from Firestore
  useEffect(() => {
    const loadSequence = ++loadSequenceRef.current;
    let cancelled = false;

    const sleepFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

    const loadMembers = async () => {
      setIsMembersLoaded(false);
      setLoadProgress(0);

      try {
        const snapshot = await getDocs(collection(db, "users"));
        if (cancelled || loadSequenceRef.current !== loadSequence) return;

        const docs = snapshot.docs;
        const nextMembers = [];
        const chunkSize = 1000;

        if (docs.length === 0) {
          setMembers([]);
          setCurrentPage(1);
          setIsMembersLoaded(true);
          setLoadProgress(100);
          return;
        }

        for (let index = 0; index < docs.length; index += chunkSize) {
          if (cancelled || loadSequenceRef.current !== loadSequence) return;

          const chunk = docs.slice(index, index + chunkSize).map((snapDoc) => ({
            id: snapDoc.id,
            ...normalizeMemberRecord(snapDoc.data()),
          }));

          nextMembers.push(...chunk);
          const loadedCount = Math.min(index + chunk.length, docs.length);
          setLoadProgress(Math.round((loadedCount / docs.length) * 100));

          if (index + chunkSize < docs.length) {
            await sleepFrame();
          }
        }

        if (!cancelled && loadSequenceRef.current === loadSequence) {
          setMembers(nextMembers);
          setCurrentPage(1);
          setIsMembersLoaded(true);
          setLoadProgress(100);
        }
      } catch (error) {
        console.error("Error fetching users from Firestore:", error);
        if (!cancelled && loadSequenceRef.current === loadSequence) {
          setIsMembersLoaded(true);
          setLoadProgress(100);
        }
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
      loadSequenceRef.current += 1;
    };
  }, []);

  const memberIndex = useMemo(() => {
    return members.map((member) => {
      const name = getMemberName(member);
      const email = getMemberEmail(member);
      const phone = getMemberPhone(member) || "";
      const organization = getMemberOrganization(member);
      const service = getMemberService(member);
      const rank = getMemberRank(member);
      const state = getMemberState(member);
      const city = getMemberCity(member);
      const education = getMemberEducation(member);
      const skills = parseMemberSkills(member);
      const experienceText = getMemberExperience(member);
      const experienceValue = parseFloat(experienceText);

      return {
        ...member,
        __name: name,
        __emailLower: String(email || "").toLowerCase(),
        __phoneLower: String(phone || "").toLowerCase(),
        __organizationLower: String(organization || "").toLowerCase(),
        __serviceLower: String(service || "").toLowerCase(),
        __rankLower: String(rank || "").toLowerCase(),
        __stateLower: String(state || "").toLowerCase(),
        __cityLower: String(city || "").toLowerCase(),
        __educationLower: String(education || "").toLowerCase(),
        __skills: skills,
        __skillsLower: skills.map((skill) => String(skill).toLowerCase()),
        __searchBlob: [
          name,
          email,
          phone,
          organization,
          service,
          rank,
          state,
          city,
          education,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        __experienceValue: Number.isFinite(experienceValue) ? experienceValue : NaN,
        __tagsLower: String(member.tags || member.Tags || "").toLowerCase(),
      };
    });
  }, [members]);
  // Dynamic filter options
  const filterOptions = useMemo(() => {
    const getUniqueValues = (field) => {
      const set = new Set();
      memberIndex.forEach((member) => {
        let value = member[field];
        if (value) {
          value = String(value).trim();
          if (field === "gender") {
            if (value.toLowerCase() === "male") value = "Male";
            else if (value.toLowerCase() === "female") value = "Female";
          }
          set.add(value);
        }
      });
      return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    };

    const experiences = memberIndex
      .map((m) => m.__experienceValue)
      .filter((exp) => !isNaN(exp) && exp >= 0);

    let buckets = ["All"];
    if (experiences.length === 0) {
      buckets = ["All", "0-1 yr", "1-3 yrs", "3-5 yrs", "5-10 yrs", "10+ yrs"];
    } else {
      const maxExp = Math.max(...experiences);
      const ceiling = Math.ceil(maxExp / 5) * 5;
      if (ceiling >= 1) buckets.push("0-1 yr");
      if (ceiling >= 3) buckets.push("1-3 yrs");
      if (ceiling >= 5) buckets.push("3-5 yrs");
      if (ceiling >= 10) buckets.push("5-10 yrs");
      if (ceiling >= 15) buckets.push("10-15 yrs");
      if (ceiling >= 20) buckets.push("15-20 yrs");
      if (ceiling >= 25) buckets.push("20-25 yrs");
      if (ceiling >= 30) buckets.push("25-30 yrs");
      if (ceiling > 30) buckets.push("30+ yrs");
      else if (ceiling >= 10) buckets.push(`${Math.max(10, ceiling - 5)}+ yrs`);
    }

    return {
      Gender: getUniqueValues("gender"),
      Category: getUniqueValues("organization"),
      Service: getUniqueValues("service"),
      Rank: getUniqueValues("rank"),
      Level: getUniqueValues("level"),
      Trade: getUniqueValues("trade"),
      City: getUniqueValues("city"),
      State: getUniqueValues("state"),
      Education: getUniqueValues("education"),
      Status: getUniqueValues("status"),
      Tags: ["All", ...Array.from(new Set(memberIndex.flatMap((member) => member.__skills))).sort((a, b) => a.localeCompare(b))],
      "Placement Status": ["All", "Placed", "Active"],
      Experience: buckets,
    };
  }, [memberIndex]);

  const ageBounds = useMemo(() => {
    const ages = memberIndex.map((member) => member.age_years).filter((age) => Number.isFinite(age));
    if (ages.length === 0) return { min: 0, max: 100 };
    const min = Math.max(0, Math.floor(Math.min(...ages)));
    const max = Math.max(min, Math.ceil(Math.max(...ages)));
    return { min, max };
  }, [memberIndex]);

  useEffect(() => {
    setAgeRange([ageBounds.min, ageBounds.max]);
  }, [ageBounds.min, ageBounds.max]);

  const normalizeTagLabel = (tagDoc) => {
    if (!tagDoc) return "";
    if (typeof tagDoc === "string") return tagDoc.trim();
    if (typeof tagDoc !== "object") return "";
    return String(
      tagDoc.name ||
        tagDoc.tag ||
        tagDoc.label ||
        tagDoc.title ||
        tagDoc.skill ||
        tagDoc.value ||
        tagDoc.id ||
        ""
    ).trim();
  };

  useEffect(() => {
    const loadTags = async () => {
      try {
        const snapshot = await getDocs(collection(db, "tags"));
        const tags = snapshot.docs
          .map((tagDoc) => normalizeTagLabel({ id: tagDoc.id, ...tagDoc.data() }))
          .filter(Boolean);
        setAvailableTags(Array.from(new Set(tags)).sort((a, b) => a.localeCompare(b)));
      } catch (error) {
        console.error("Error loading tags:", error);
      }
    };

    loadTags();
  }, []);

  const handleFilterChange = (key, value) => {
    startTransition(() => {
      setSidebarFilters((prev) => ({ ...prev, [key]: value }));
      setCurrentPage(1);
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      setSidebarFilters({
        Gender: "All",
        Category: "All",
        Service: "All",
        Rank: "All",
        Level: "All",
        Trade: "All",
        City: "All",
        State: "All",
        Education: "All",
        Status: "All",
        "Placement Status": "All",
        Experience: "All",
        Tags: "All",
      });
      setRetirementStatus("All");
      setAgeRange([ageBounds.min, ageBounds.max]);
      setCurrentPage(1);
    });
  };

  const parseExperienceRange = (range) => {
    if (range === "All") return null;
    if (range.includes("+")) {
      const min = parseFloat(range.replace("+ yrs", "").trim());
      return { min, max: Infinity };
    }
    const [minStr, maxStr] = range.replace(" yrs", "").split("-");
    return { min: parseFloat(minStr), max: parseFloat(maxStr) };
  };

  // Filtered + Sorted Members (Robust Alphabetical A → Z)
  const filteredMembers = useMemo(() => {
    let list = [...memberIndex];

    // Search filter
    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      list = list.filter((member) => {
        return member.__searchBlob.includes(term) ||
          member.__phoneLower.includes(term) ||
          member.__emailLower.includes(term);
      });
    }

    // Placed filter
    if (filterPlaced === "placed") {
      list = list.filter((m) => m.isPlaced === true);
    } else if (filterPlaced === "active") {
      list = list.filter((m) => m.isPlaced !== true);
    }

    if (retirementStatus !== "All") {
      list = list.filter((member) => member.retirement_status === retirementStatus);
    }

    const ageFilterActive = ageRange[0] > ageBounds.min || ageRange[1] < ageBounds.max;
    if (ageFilterActive) {
      list = list.filter((member) => {
        const age = member.age_years;
        if (!Number.isFinite(age)) return false;
        return age >= ageRange[0] && age <= ageRange[1];
      });
    }

    // Sidebar filters
    const fieldMap = {
      Gender: "gender",
      Category: "organization",
      Service: "service",
      Rank: "rank",
      Level: "level",
      Trade: "trade",
      City: "city",
      State: "state",
      Education: "education",
    };

    Object.entries(sidebarFilters).forEach(([key, value]) => {
      if (value !== "All") {
        if (key === "Tags") {
          list = list.filter((member) =>
            member.__skillsLower.some((tag) => tag === String(value).toLowerCase())
          );
          return;
        }
        if (key === "Placement Status") {
          const isPlacedVal = value === "Placed";
          list = list.filter((member) => member.isPlaced === isPlacedVal);
        } else if (key === "Experience") {
          const range = parseExperienceRange(value);
          if (range) {
            list = list.filter((member) => {
              const exp = member.__experienceValue;
              if (!Number.isFinite(exp)) return false;
              return exp >= range.min && (range.max === Infinity || exp <= range.max);
            });
          }
        } else {
          const dbField = fieldMap[key];
          if (dbField) {
            list = list.filter((member) => {
              const target = String(value).toLowerCase();
              if (dbField === "organization") return member.__organizationLower === target;
              if (dbField === "service") return member.__serviceLower === target;
              if (dbField === "rank") return member.__rankLower === target;
              if (dbField === "state") return member.__stateLower === target;
              if (dbField === "city") return member.__cityLower === target;
              if (dbField === "education") return member.__educationLower === target;
              return String(member[dbField] || "").toLowerCase() === target;
            });
          }
        }
      }
    });

    // Improved Alphabetical Sort (A → Z)
    list.sort((a, b) => {
      const getName = (member) => {
        const full = getMemberName(member);
        if (full) return full;
        return "ZZZ_NO_NAME"; // Push nameless to bottom
      };

      const nameA = getName(a).toLowerCase();
      const nameB = getName(b).toLowerCase();

      return nameA.localeCompare(nameB);
    });

    return list;
  }, [memberIndex, debouncedSearchTerm, filterPlaced, sidebarFilters, retirementStatus, ageRange, ageBounds.min, ageBounds.max]);

  // Pagination logic with "All" support
  const totalItems = filteredMembers.length;
  const isAllRows = rowsPerPage === 999999;
  const totalPages = isAllRows ? 1 : Math.ceil(totalItems / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = isAllRows ? totalItems : Math.min(startIndex + rowsPerPage, totalItems);
  const currentPageData = filteredMembers.slice(startIndex, endIndex);

  const handleRowsPerPageChange = (e) => {
    const value = Number(e.target.value);
    startTransition(() => {
      setRowsPerPage(value);
      setCurrentPage(1);
    });
  };

  const goToPrevious = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const goToNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);
  const toggleFilter = () => setIsFilterOpen(!isFilterOpen);

  const openTagModal = (member) => {
    setTagModalMember(member);
    setSelectedTags(parseMemberSkills(member));
    setTagSearchTerm("");
    setTagPickerOpen(false);
    setTagModalError("");
  };

  const closeTagModal = () => {
    setTagModalMember(null);
    setSelectedTags([]);
    setTagSearchTerm("");
    setTagPickerOpen(false);
    setTagModalError("");
    setTagModalSaving(false);
  };

  const updateMemberSkillsLocally = (memberId, nextSkills) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? { ...member, skills: nextSkills, Skills: nextSkills.join(", ") }
          : member
      )
    );
  };

  const persistMemberSkills = async (memberId, nextSkills) => {
    await updateDoc(doc(db, "users", memberId), {
      skills: nextSkills,
      Skills: nextSkills.join(", "),
    });
  };

  const toggleExpandedTags = (memberId) => {
    setExpandedTagsMemberId((prev) => (prev === memberId ? null : memberId));
  };

  const handleSaveTags = async () => {
    if (!tagModalMember?.id) return;

    const mergedSkills = Array.from(
      new Map(selectedTags.map((skill) => [String(skill).trim().toLowerCase(), String(skill).trim()])).values()
    ).filter(Boolean);

    if (mergedSkills.length === 0) {
      setTagModalError("Please select at least one tag.");
      return;
    }

    const memberId = tagModalMember.id;
    const memberName = getMemberName(tagModalMember);
    const previousMembers = members;

    setTagModalError("");
    updateMemberSkillsLocally(memberId, mergedSkills);
    closeTagModal();

    setTagSuccessPopup({
      show: true,
      message: `${memberName} tagged successfully.`,
      type: "success",
    });
    setTimeout(() => {
      setTagSuccessPopup({ show: false, message: "", type: "success" });
    }, 2200);

    void persistMemberSkills(memberId, mergedSkills).catch((error) => {
      console.error("Error saving tags:", error);
      setMembers(previousMembers);
      setTagSuccessPopup({
        show: true,
        message: "Could not save tags. Please try again.",
        type: "error",
      });
      setTimeout(() => {
        setTagSuccessPopup({ show: false, message: "", type: "success" });
      }, 3000);
    });
  };

  const openRemoveTagConfirm = (member, tag) => {
    setRemoveTagTarget({ member, tag });
  };

  const closeRemoveTagConfirm = () => {
    setRemoveTagTarget(null);
  };

  const confirmRemoveTag = () => {
    if (!removeTagTarget?.member?.id || !removeTagTarget?.tag) return;

    const memberId = removeTagTarget.member.id;
    const memberName = getMemberName(removeTagTarget.member);
    const tagToRemove = removeTagTarget.tag;
    const previousMembers = members;
    const nextSkills = parseMemberSkills(removeTagTarget.member).filter(
      (skill) => String(skill).trim().toLowerCase() !== String(tagToRemove).trim().toLowerCase()
    );

    updateMemberSkillsLocally(memberId, nextSkills);
    closeRemoveTagConfirm();

    setTagSuccessPopup({
      show: true,
      message: `${tagToRemove} removed from ${memberName}.`,
      type: "success",
    });
    setTimeout(() => {
      setTagSuccessPopup({ show: false, message: "", type: "success" });
    }, 2200);

    void persistMemberSkills(memberId, nextSkills).catch((error) => {
      console.error("Error removing tag:", error);
      setMembers(previousMembers);
      setTagSuccessPopup({
        show: true,
        message: "Could not remove tag. Please try again.",
        type: "error",
      });
      setTimeout(() => {
        setTagSuccessPopup({ show: false, message: "", type: "success" });
      }, 3000);
    });
  };

  const filterData = {
    filters: sidebarFilters,
    handleFilterChange,
    clearFilters,
    options: filterOptions,
  };

  const filterKeys = [
    "Gender",
    "Category",
    "Service",
    "Rank",
    "Level",
    "Trade",
    "State",
    "City",
    "Education",
    "Tags",
    "Experience",
  ];

  // Close dropdown on click-outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target) && openDropdown) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  // Export to Excel (XLSX)
  const handleExportXLSX = () => {
    const dataToExport = filteredMembers.map((member) => ({
      Name: getMemberName(member),
      Mobile: getMemberPhone(member) || "",
      Email: getMemberEmail(member) || "",
      Category: getMemberOrganization(member) || "",
      Service: getMemberService(member) || "",
      Rank: getMemberRank(member) || "",
      Gender: member.gender || "",
      State: getMemberState(member) || "",
      City: getMemberCity(member) || "",
      Education: getMemberEducation(member) || "",
      Experience: getMemberExperience(member) || "",
      Status: member.status || "",
      "Placement Status": member.isPlaced ? "Placed" : "Active",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Auto-size columns
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    worksheet["!cols"] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxWidth = 10;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cell = worksheet[XLSX.utils.encode_cell({ c: C, r: R })];
        if (cell && cell.v) {
          const length = String(cell.v).length;
          maxWidth = Math.max(maxWidth, length);
        }
      }
      worksheet["!cols"][C] = { wch: Math.min(maxWidth + 2, 60) };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Members");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Members_${today}.xlsx`);
  };

  // Loading state
  if (!isMembersLoaded) {
    return (
      <div className="member-list-page" style={{ padding: "20px", maxWidth: "100%", margin: "0 auto" }}>
        <style>{`
          @media (min-width: 768px) {
            .member-list-page {
              padding: 36px;
            }
          }
        `}</style>
        {/* Header Card */}
        <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative", flex: 1, maxWidth: "350px", minWidth: "200px" }}>
              <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", width: "16px", height: "16px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
              <input
                type="text"
                placeholder="Search by Name, Mobile, Email..."
                disabled
                style={{
                  padding: "12px 14px 12px 40px",
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  fontSize: "14px",
                  backgroundColor: "#f3f4f6",
                  color: "#999",
                }}
              />
            </div>
            <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",marginLeft: "auto",}}>
              Total Members: <strong>0</strong>
            </span>
            <button disabled style={{ padding: "10px 20px", backgroundColor: "white", border: "1px solid #10b981", color: "#10b981", borderRadius: "8px", cursor: "not-allowed", fontWeight: "600", fontSize: "14px", opacity: 0.5 }}>
              🔽 Filters
            </button>
            <button disabled style={{ padding: "10px 20px", backgroundColor: "white", border: "1px solid #1f2937", color: "#1f2937", borderRadius: "8px", cursor: "not-allowed", fontWeight: "600", fontSize: "14px", opacity: 0.5 }}>
              ⬇️ Export
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.06)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px", animation: "spin 1s linear infinite" }}>
              ⏳
            </div>
            <p style={{ fontSize: "16px", color: "#666", margin: "0 0 8px" }}>Loading members...</p>
            <div style={{ fontSize: "14px", color: "#94a3b8", fontWeight: 600 }}>
              {loadProgress > 0 ? `Loading data ${loadProgress}%` : "Connecting..."}
            </div>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="member-list-page" style={{ padding: "20px", maxWidth: "100%", margin: "0 auto" }}><style>{`
      @media (min-width: 768px) {
        .member-list-page {
          padding: 36px;
        }
      }
    `}</style>
      {/* Header Card with Search, Total Badge, Filters, Export */}
      <div style={{ backgroundColor: "#fff", borderRadius: "12px", padding: "16px", marginBottom: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: isFilterOpen ? "16px" : "0" }}>
          {/* Search Input */}
          <div style={{ position: "relative", flex: 1, maxWidth: "350px", minWidth: "200px" }}>
            <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", width: "16px", height: "16px" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
              <input
              type="text"
              placeholder="Search by Name, Mobile, Email..."
              value={searchTerm}
              onChange={(e) => {
                const nextValue = e.target.value;
                startTransition(() => {
                  setSearchTerm(nextValue);
                  setCurrentPage(1);
                });
              }}
              style={{
                padding: "12px 14px 12px 40px",
                width: "160%",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
                backgroundColor: "white",
                color: "black",
              }}
              autoFocus
            />
          </div>

          {/* Total Members Badge */}
          <span style={{ backgroundColor: "#dcfce7", color: "#166534", padding: "6px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", marginLeft: "auto" }}>
            Total Members: <strong>{totalItems}</strong>
          </span>

          {/* Filters Button */}
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            style={{
              padding: "10px 20px",
              backgroundColor: "white",
              border: "1px solid #10b981",
              color: "#10b981",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            🔽 Filters
          </button>

          {/* Export Button */}
          <button
            onClick={handleExportXLSX}
            style={{
              padding: "10px 20px",
              backgroundColor: "white",
              border: "1px solid #1f2937",
              color: "#1f2937",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            ⬇️ Export
          </button>
        </div>

        {/* Inline Filters */}
        {isFilterOpen && (
          <div
            ref={filtersRef}
            style={{
              borderTop: "1px solid #e5e7eb",
              marginTop: "14px",
              paddingTop: "16px",
              background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                marginBottom: "14px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: "220px" }}>
                <strong style={{ fontSize: "15px", color: "#0f172a", display: "block", marginBottom: "4px" }}>Filters</strong>
              </div>
              <button
                onClick={() => {
                  clearFilters();
                  setOpenDropdown(null);
                }}
                style={{
                  padding: "9px 15px",
                  background: "linear-gradient(180deg, #f97316 0%, #ef4444 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: "700",
                  boxShadow: "0 8px 18px rgba(239, 68, 68, 0.18)",
                  whiteSpace: "nowrap",
                }}
              >
                Clear All
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
                gap: "12px",
                marginBottom: "14px",
                alignItems: "start",
              }}
            >
              {filterKeys.map(filterKey => {
                const selectedValue = sidebarFilters[filterKey];
                const filterOpts = filterOptions[filterKey] || [];
                const searchTerm = filterSearchTerms[filterKey] || "";
                const filteredOpts = filterOpts.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));
                const isDropdownOpen = openDropdown === filterKey;

                return (
                  <div
                    key={filterKey}
                    style={{
                      padding: "4px 0",
                      minWidth: 0,
                    }}
                  >
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "12px", textTransform: "capitalize", color: "#334155" }}>{filterKey}</label>
                    <div style={{ position: "relative" }}>
                      <div
                        onClick={() => setOpenDropdown(k => (k === filterKey ? null : filterKey))}
                        style={{
                          padding: "11px 12px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "10px",
                          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "13px",
                          color: "#0f172a",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
                        }}
                      >
                        <span>{selectedValue || "All"}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
                      </div>
                      {isDropdownOpen && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #dbe3ee", borderRadius: "10px", marginTop: "6px", zIndex: 200, maxHeight: "240px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 14px 30px rgba(15, 23, 42, 0.12)" }}>
                          <input autoFocus type="text" value={searchTerm} onChange={(e) => setFilterSearchTerms({ ...filterSearchTerms, [filterKey]: e.target.value })} placeholder="Search..." style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", outline: "none", fontSize: "12px", color: "#0f172a", background: "#f8fafc" }} />
                          <div style={{ maxHeight: "180px", overflowY: "auto" }}>
                            {filteredOpts.length === 0 ? <div style={{ padding: "10px 12px", color: "#94a3b8", fontSize: "12px" }}>No options</div> : filteredOpts.map(o => (
                              <div key={o} onClick={() => { handleFilterChange(filterKey, o); setOpenDropdown(null); }} style={{ padding: "9px 12px", cursor: "pointer", background: selectedValue === o ? "#eff6ff" : "transparent", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#0f172a" }}><span>{o}</span>{selectedValue === o && <span style={{ color: "#10b981", fontWeight: "700" }}>✓</span>}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "12px",
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #dbe3ee",
                  borderRadius: "12px",
                  padding: "14px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
                }}
              >
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "700", fontSize: "12px", color: "#334155" }}>Retirement Status</label>
                <select
                  value={retirementStatus}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    startTransition(() => {
                      setRetirementStatus(nextValue);
                      setCurrentPage(1);
                    });
                  }}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "10px",
                    background: "#fff",
                    fontSize: "13px",
                    color: "#111827",
                    outline: "none",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  <option value="All">All</option>
                  <option value="Retired">Retired</option>
                  <option value="Not Retired">Not Retired</option>
                </select>
              </div>
              <div style={{ border: "1px solid #dbe3ee", borderRadius: "12px", background: "#f8fafc", overflow: "hidden" }}>
                <DualRangeSlider
                  label="Age Range"
                  helperText="Drag both handles to narrow the visible age range."
                  min={ageBounds.min}
                  max={ageBounds.max}
                  value={ageRange}
                  onChange={(nextValue) => {
                    startTransition(() => {
                      setAgeRange(nextValue);
                      setCurrentPage(1);
                    });
                  }}
                  suffix=" yrs"
                  className="member-age-range"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ width: "100%", margin: "0", padding: "0" }}>
        <div className="table-container" style={{ margin: "0", padding: "0", height: "70vh", minHeight: "460px", overflowY: "auto", border: "1px solid rgb(238, 238, 238)", borderRadius: "8px", background: "rgb(255, 255, 255)" }}>
          <div className="table-wrapper responsive-table" style={{ margin: "0", padding: "0" }}>
            <table className="members-table" style={{ width: "100%",tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th className="sticky-name">Name</th>
                  <th>Mobile</th>
                  <th>Category</th>
                  <th>Service</th>
                  <th>Rank</th>
                  <th>State</th>
                  <th>City</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {currentPageData.length > 0 ? (
                  currentPageData.map((member) => {
                    const memberSkills = member.__skills || parseMemberSkills(member);
                    const visibleSkills =
                      expandedTagsMemberId === member.id ? memberSkills : memberSkills.slice(0, 2);
                    const memberName = member.__name || getMemberName(member);

                    return (
                      <tr
                        key={member.id}
                        onClick={() => onMemberClick(member)}
                        className="member-row clickable"
                      >
                        <td className="sticky-name">
                          <div className="member-name">
                            {memberName}
                          </div>
                        </td>
                        <td>{getMemberPhone(member) || "-"}</td>
                        <td>{getMemberOrganization(member) || "-"}</td>
                        <td>{getMemberService(member) || "-"}</td>
                        <td>{getMemberRank(member) || "-"}</td>
                        <td>{getMemberState(member) || "-"}</td>
                        <td>{getMemberCity(member) || "-"}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflow: "hidden" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", overflow: "hidden", maxWidth: "100%" }}>
                              {memberSkills.length > 0 ? (
                                <>
                                  {visibleSkills.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        padding: "4px 8px 4px 10px",
                                        borderRadius: "999px",
                                        background: "#f1f5f9",
                                        color: "#475569",
                                        fontSize: "11px",
                                        fontWeight: "600",
                                      }}
                                    >
                                      <span>{tag}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openRemoveTagConfirm(member, tag);
                                        }}
                                        aria-label={`Remove tag ${tag}`}
                                        style={{
                                          width: "16px",
                                          height: "16px",
                                          borderRadius: "999px",
                                          border: "none",
                                          background: "#cbd5e1",
                                          color: "#0f172a",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: "pointer",
                                          fontSize: "11px",
                                          lineHeight: 1,
                                          padding: 0,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  {memberSkills.length > 2 && expandedTagsMemberId !== member.id ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpandedTags(member.id);
                                      }}
                                      style={{
                                        border: "none",
                                        background: "#e2e8f0",
                                        color: "#334155",
                                        borderRadius: "999px",
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                      }}
                                    >
                                      +{memberSkills.length - 2}
                                    </button>
                                  ) : null}
                                  {expandedTagsMemberId === member.id && memberSkills.length > 2 ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpandedTags(member.id);
                                      }}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: "#2563eb",
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        cursor: "pointer",
                                        padding: 0,
                                      }}
                                    >
                                      Show less
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <span style={{ fontSize: "12px", color: "#94a3b8" }}>-</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTagModal(member);
                              }}
                              style={{
                                alignSelf: "flex-start",
                                padding: "6px 10px",
                                borderRadius: "999px",
                                border: "1px solid #2563eb",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                fontWeight: "700",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              Add Tag
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="empty-message">
                      No members match your filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="custom-pagination">
            <div className="rows-per-page">
              <span>Rows per page</span>
              <select value={rowsPerPage} onChange={handleRowsPerPageChange}>
                <option value={999999}>All</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
                <option value={5000}>5000</option>
                
              </select>
            </div>

            <div className="page-info">
              {startIndex + 1}–{endIndex} of {totalItems}
            </div>

            <div className="page-navigation">
              <button onClick={goToPrevious} disabled={currentPage === 1} className="nav-btn">
                ‹
              </button>
              <button
                onClick={goToNext}
                disabled={currentPage === totalPages || totalItems === 0}
                className="nav-btn"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {tagModalMember && (
        <div
          onClick={closeTagModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000,
            padding: "16px",
          }}
        >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "720px",
                background: "#fff",
                borderRadius: "16px",
                boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
                overflow: "hidden",
              }}
            >
            <div
              style={{
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div>
              <h3 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>{tagModalMember.__name || getMemberName(tagModalMember)}</h3>
              </div>
              <button
                type="button"
                onClick={closeTagModal}
                style={{
                  border: "none",
                  background: "#f1f5f9",
                  width: "36px",
                  height: "36px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: "#334155",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: "18px 20px 20px" }}>
              <div style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                  Existing Tags
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {parseMemberSkills(tagModalMember).length > 0 ? (
                    parseMemberSkills(tagModalMember).map((skill) => (
                      <span
                        key={skill}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "999px",
                          background: "#f1f5f9",
                          color: "#334155",
                          fontSize: "12px",
                          fontWeight: "600",
                        }}
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: "13px", color: "#94a3b8" }}>No tags saved yet.</span>
                  )}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  background: "#fafafa",
                  padding: "14px",
                  marginBottom: "16px",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#334155", marginBottom: "10px" }}>
                  Add Tags
                </div>
                <input
                  type="text"
                  placeholder="Search and select tags..."
                  value={tagSearchTerm}
                  onFocus={() => setTagPickerOpen(true)}
                  onChange={(e) => {
                    setTagSearchTerm(e.target.value);
                    setTagPickerOpen(true);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                    fontSize: "13px",
                    marginBottom: "10px",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                />
                <div
                  style={{
                    width: "100%",
                    marginTop: "10px",
                    borderRadius: "10px",
                    border: "1px solid #dbe3ee",
                    background: "#fff",
                    overflow: "hidden",
                  }}
                >
                  {tagPickerOpen && (
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {availableTags.filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase())).length > 0 ? (
                        availableTags
                          .filter((tag) => tag.toLowerCase().includes(tagSearchTerm.toLowerCase()))
                          .map((tag) => {
                            const checked = selectedTags.includes(tag);
                            return (
                              <label
                                key={tag}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "10px 12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f1f5f9",
                                  background: checked ? "#eff6ff" : "#fff",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedTags((prev) =>
                                      prev.includes(tag)
                                        ? prev.filter((item) => item !== tag)
                                        : [...prev, tag]
                                    )
                                  }
                                  style={{ width: "16px", height: "16px" }}
                                />
                                <span style={{ fontSize: "13px", color: "#0f172a", fontWeight: checked ? "700" : "500" }}>
                                  {tag}
                                </span>
                              </label>
                            );
                          })
                      ) : (
                        <div style={{ padding: "12px", color: "#94a3b8", fontSize: "13px" }}>No tags found.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {tagModalError ? (
                <div style={{ marginBottom: "14px", color: "#dc2626", fontSize: "13px", fontWeight: "600" }}>
                  {tagModalError}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeTagModal}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTags}
                  disabled={tagModalSaving}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: tagModalSaving ? "#93c5fd" : "#2563eb",
                    color: "#fff",
                    cursor: tagModalSaving ? "not-allowed" : "pointer",
                    fontWeight: "700",
                    fontSize: "13px",
                  }}
                >
                  {tagModalSaving ? "Saving..." : "Save Tags"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {removeTagTarget && (
        <div
          onClick={closeRemoveTagConfirm}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3100,
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#fff",
              borderRadius: "16px",
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ padding: "18px 20px 10px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a" }}>Remove tag?</h3>
                <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#475569", lineHeight: 1.5 }}>
                Do you want to remove <strong>{removeTagTarget.tag}</strong> from{" "}
                <strong>{removeTagTarget.member.__name || getMemberName(removeTagTarget.member)}</strong>?
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "0 20px 20px" }}>
              <button
                type="button"
                onClick={closeRemoveTagConfirm}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveTag}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "700",
                  fontSize: "13px",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {tagSuccessPopup.show && (
        <div
          style={{
            position: "fixed",
            right: "20px",
            top: "20px",
            background: tagSuccessPopup.type === "error" ? "#dc2626" : "#0f766e",
            color: "#fff",
            padding: "14px 18px",
            borderRadius: "12px",
            boxShadow:
              tagSuccessPopup.type === "error"
                ? "0 18px 40px rgba(220, 38, 38, 0.25)"
                : "0 18px 40px rgba(15, 118, 110, 0.25)",
            zIndex: 4000,
            fontWeight: "700",
            fontSize: "13px",
          }}
        >
          {tagSuccessPopup.message}
        </div>
      )}
    </div>
  );
}
