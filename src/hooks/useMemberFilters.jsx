// src/hooks/useMemberFilters.jsx
// Shared search / Filters / Group By / Favorites state for the Members list and
// Members location pages, so both screens filter members identically.
import React, { useState, useMemo, useEffect, useTransition } from "react";
import { collection, collectionGroup, db, getDocs, query, select } from "../firestoreClient";
import DualRangeSlider from "../components/DualRangeSlider";
import FilterAccordionList from "../components/FilterAccordionList";
import useDebouncedValue from "./useDebouncedValue";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  getMemberName,
  getMemberEmail,
  getMemberPhone,
  getMemberCategory,
  getMemberService,
  getMemberRank,
  getMemberState,
  getMemberCity,
  getMemberEducation,
  getMemberExperience,
  parseMemberSkills,
  parseMemberDate,
} from "../utils/memberFields";
import { EMPTY_REQUIREMENT_DATA, loadRequirementApplicants } from "../utils/requirementApplicants";

const toDatePickerValue = (value) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateBoundary = (value, endOfDay) => {
  if (!value) return null;
  const boundary = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(boundary.getTime()) ? null : boundary;
};

// Module-level cache for the supporting fetches (see MemberListPage history):
// same-session revisits reuse the last result instead of re-scanning.
export const SUPPORTING_DATA_TTL_MS = 60_000;
let projectLinksCache = null; // { timestamp, phoneToProjects, projectList }
let ratedMembersCache = null; // { timestamp, ratedIds }

// Group By fields offered in the Odoo-style toolbar — the same full field
// list as the Filters accordion, so Group By has parity with Filters like
// it does in Odoo, not just a curated subset.
export const MEMBER_GROUP_BY_OPTIONS = [
  { key: "Gender", label: "Gender" },
  { key: "Category", label: "Category" },
  { key: "Service", label: "Service" },
  { key: "Rank", label: "Rank" },
  { key: "Level", label: "Level" },
  { key: "Trade", label: "Trade" },
  { key: "City", label: "City" },
  { key: "State", label: "State" },
  { key: "Education", label: "Education" },
  { key: "Project", label: "Project" },
  { key: "Tags", label: "Tags" },
  { key: "BO Tags", label: "BO Tags" },
  { key: "Experience", label: "Experience" },
  { key: "Is Rated?", label: "Is Rated?" },
  { key: "Is Tagged?", label: "Is Tagged?" },
  { key: "Regional Partner", label: "Regional Partner" },
  { key: "Retirement Status", label: "Retirement Status" },
];

const SCALAR_GROUP_FIELD_MAP = {
  Gender: "gender",
  Category: "category",
  Service: "service",
  Rank: "rank",
  Level: "level",
  Trade: "trade",
  City: "city",
  State: "state",
  Education: "education",
};

const parseExperienceBucketRange = (label) => {
  if (label.includes("+")) {
    const min = parseFloat(label.replace("+ yrs", "").trim());
    return { min, max: Infinity };
  }
  const [minStr, maxStr] = label.replace(" yrs", "").split("-");
  return { min: parseFloat(minStr), max: parseFloat(maxStr) };
};

// Returns the group label(s) a member belongs under for a Group By field —
// usually one, but a member can land in several groups at once for
// multi-value fields like Tags or Project (same as grouping by a tags field
// in Odoo — a record with 2 tags appears under both groups).
export const getGroupLabels = (member, groupByKey, experienceBuckets) => {
  const scalarField = SCALAR_GROUP_FIELD_MAP[groupByKey];
  if (scalarField) {
    const raw = member[scalarField];
    return [raw && String(raw).trim() ? String(raw).trim() : "Unspecified"];
  }
  if (groupByKey === "Tags") {
    return member.__skills && member.__skills.length ? member.__skills : ["Unspecified"];
  }
  if (groupByKey === "BO Tags") {
    const tags = (member.tags || []).map((t) => String(t).trim()).filter(Boolean);
    return tags.length ? tags : ["Unspecified"];
  }
  if (groupByKey === "Project") {
    return member.__projects && member.__projects.length ? member.__projects : ["Unspecified"];
  }
  if (groupByKey === "Experience") {
    const exp = member.__experienceValue;
    if (!Number.isFinite(exp) || exp < 0) return ["Unspecified"];
    for (const bucket of experienceBuckets) {
      const r = parseExperienceBucketRange(bucket);
      if (exp >= r.min && (r.max === Infinity || exp <= r.max)) return [bucket];
    }
    return ["Unspecified"];
  }
  if (groupByKey === "Is Rated?") return [member.__isRated ? "Yes" : "No"];
  if (groupByKey === "Is Tagged?") return [member.__isTagged ? "Yes" : "No"];
  if (groupByKey === "Regional Partner") {
    return [member.is_regional_partner ? (member.regional_partner_status === "Inactive" ? "Inactive" : "Active") : "Not a Partner"];
  }
  if (groupByKey === "Retirement Status") {
    const raw = member.retirement_status;
    return [raw && String(raw).trim() ? String(raw).trim() : "Unspecified"];
  }
  return ["Unspecified"];
};

export const FAVORITES_STORAGE_KEY = "memberListFavorites";

export default function useMemberFilters(members) {
  const [, startTransition] = useTransition();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPlaced] = useState("all");
  const [groupBy, setGroupBy] = useState(null);
  const [retirementStatus, setRetirementStatus] = useState("All");
  // Deep-link support (e.g. from the daily report email): ?from=YYYY-MM-DD&to=YYYY-MM-DD
  // pre-fills the registration date range, ?tagged=yes pre-selects "Is Tagged? = Yes" below.
  const [registrationDateFrom, setRegistrationDateFrom] = useState(
    () => new URLSearchParams(window.location.search).get("from") || ""
  );
  const [registrationDateTo, setRegistrationDateTo] = useState(
    () => new URLSearchParams(window.location.search).get("to") || ""
  );
  const [ageRange, setAgeRange] = useState([0, 100]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [memberProjectsByPhone, setMemberProjectsByPhone] = useState({});
  const [ratedMemberIds, setRatedMemberIds] = useState(() => new Set());
  const [requirementData, setRequirementData] = useState(EMPTY_REQUIREMENT_DATA);

  const [sidebarFilters, setSidebarFilters] = useState(() => ({
    Gender: [],
    Category: [],
    Service: [],
    Rank: [],
    Level: [],
    Trade: [],
    City: [],
    State: [],
    Education: [],
    Project: [],
    Requirement: [],
    Status: "All",
    "Placement Status": "All",
    Experience: [],
    Tags: [],
    "BO Tags": [],
    "Is Rated?": [],
    "Is Tagged?": new URLSearchParams(window.location.search).get("tagged") === "yes" ? ["Yes"] : [],
    "Regional Partner": [],
  }));

  // Saved search/filter presets — see FavoritesMenu above.
  const [favorites, setFavorites] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error("Error loading favorites:", error);
      return [];
    }
  });

  const persistFavorites = (next) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error("Error saving favorites:", error);
    }
  };

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 180);

  const normalizeProjectPhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.startsWith("91") ? digits.slice(2) : digits;
  };

  const splitProjects = (value) =>
    String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  useEffect(() => {
    const loadProjectLinks = async () => {
      try {
        if (projectLinksCache && Date.now() - projectLinksCache.timestamp < SUPPORTING_DATA_TTL_MS) {
          setMemberProjectsByPhone(projectLinksCache.phoneToProjects);
          setAvailableProjects(projectLinksCache.projectList);
          return;
        }

        const snapshot = await getDocs(
          query(
            collection(db, "projectusersmaster"),
            select(
              "phone_number", "phone", "mobile", "contact_number", "mobile_number",
              "projects", "Projects", "project", "Project"
            )
          )
        );
        const phoneToProjects = {};
        const projectSet = new Set();

        snapshot.docs.forEach((snapDoc) => {
          const row = snapDoc.data() || {};
          const phone = normalizeProjectPhone(
            row.phone_number ||
              row.phone ||
              row.mobile ||
              row.contact_number ||
              row.mobile_number ||
              ""
          );
          if (!phone) return;

          const projects = splitProjects(row.projects || row.Projects || row.project || row.Project);
          if (!projects.length) return;

          if (!phoneToProjects[phone]) phoneToProjects[phone] = [];
          projects.forEach((project) => {
            phoneToProjects[phone].push(project);
            projectSet.add(project);
          });
        });

        Object.keys(phoneToProjects).forEach((phone) => {
          phoneToProjects[phone] = Array.from(new Set(phoneToProjects[phone]));
        });

        const projectList = ["All", ...Array.from(projectSet).sort((a, b) => a.localeCompare(b))];
        projectLinksCache = { timestamp: Date.now(), phoneToProjects, projectList };

        setMemberProjectsByPhone(phoneToProjects);
        setAvailableProjects(projectList);
      } catch (error) {
        console.error("Error loading project links:", error);
      }
    };

    void loadProjectLinks();
  }, []);

  useEffect(() => {
    const loadRatedMembers = async () => {
      try {
        if (ratedMembersCache && Date.now() - ratedMembersCache.timestamp < SUPPORTING_DATA_TTL_MS) {
          setRatedMemberIds(ratedMembersCache.ratedIds);
          return;
        }

        const snapshot = await getDocs(
          query(
            collectionGroup(db, "interactions"),
            select("ratingType", "workRating", "boRating", "referrerRating")
          )
        );
        const ratedIds = new Set();

        snapshot.docs.forEach((interactionDoc) => {
          const data = interactionDoc.data() || {};
          const isRated =
            data.ratingType &&
            data.ratingType !== "not_rated" &&
            (Number(data.workRating) > 0 || Number(data.boRating) > 0 || Number(data.referrerRating) > 0);
          if (!isRated) return;

          const userId = interactionDoc.ref.parent.parent?.id;
          if (userId) ratedIds.add(userId);
        });

        ratedMembersCache = { timestamp: Date.now(), ratedIds };
        setRatedMemberIds(ratedIds);
      } catch (error) {
        console.error("Error loading rated members:", error);
      }
    };

    void loadRatedMembers();
  }, []);

  // "Requirement" filter: every job, project and TCS-run project (Temp Staff)
  // that has at least one applicant, mapped to the members who applied to it.
  // Shared loader (utils/requirementApplicants.js) — also used by the Dashboard.
  useEffect(() => {
    let cancelled = false;
    loadRequirementApplicants()
      .then((data) => {
        if (!cancelled) setRequirementData(data);
      })
      .catch((error) => console.error("Error loading requirement filter data:", error));
    return () => { cancelled = true; };
  }, []);

  const memberIndex = useMemo(() => {
    // `member` is already normalized once in App.jsx's Layout (normalizeMemberRecord),
    // so full_name/phone_number/category/etc. are already direct properties here.
    // Re-running the getMemberX() fuzzy key-matching helpers on every one of 15k+ rows
    // was the dominant cost of this list (each helper rescans every raw key on the record
    // for every candidate name) — read the precomputed fields directly instead.
    return members.map((member) => {
      const name = member.full_name || getMemberName(member);
      const email = member.email || getMemberEmail(member);
      const phone = member.phone_number || getMemberPhone(member) || "";
      const category = member.category || getMemberCategory(member);
      const service = member.service || getMemberService(member);
      const rank = member.rank || getMemberRank(member);
      const state = member.state || getMemberState(member);
      const city = member.city || getMemberCity(member);
      const education = member.education || getMemberEducation(member);
      const skills = Array.isArray(member.skills) ? member.skills : parseMemberSkills(member);
      const experienceText = member.experience || member.total_experience || getMemberExperience(member);
      const experienceValue = parseFloat(experienceText);
      const memberPhoneDigits = normalizeProjectPhone(phone);
      const projectLabels = memberProjectsByPhone[memberPhoneDigits] || [];
      const projectLabelsLower = projectLabels.map((project) => String(project).toLowerCase());
      const registrationDate = parseMemberDate(member.registration_date);

      return {
        ...member,
        __name: name,
        __emailLower: String(email || "").toLowerCase(),
        __phoneLower: String(phone || "").toLowerCase(),
        __categoryLower: String(category || "").toLowerCase(),
        __serviceLower: String(service || "").toLowerCase(),
        __rankLower: String(rank || "").toLowerCase(),
        __stateLower: String(state || "").toLowerCase(),
        __cityLower: String(city || "").toLowerCase(),
        __educationLower: String(education || "").toLowerCase(),
        __skills: skills,
        __skillsLower: skills.map((skill) => String(skill).toLowerCase()),
        __projects: projectLabels,
        __projectsLower: projectLabelsLower,
        __searchBlob: [
          name,
          email,
          phone,
          category,
          service,
          rank,
          state,
          city,
          education,
          ...projectLabels,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        __experienceValue: Number.isFinite(experienceValue) ? experienceValue : NaN,
        __dataTagsLower: (Array.isArray(member.tags) ? member.tags : []).map((tag) => String(tag).toLowerCase()),
        __registrationDateMs: registrationDate ? registrationDate.getTime() : null,
        __isRated: ratedMemberIds.has(member.id),
        __isTagged: skills.some((skill) => String(skill).trim()),
      };
    });
  }, [members, memberProjectsByPhone, ratedMemberIds]);
  // Dynamic filter options — single pass over memberIndex (was 12 passes before)
  const filterOptions = useMemo(() => {
    const genderSet = new Set();
    const categorySet = new Set();
    const serviceSet = new Set();
    const rankSet = new Set();
    const levelSet = new Set();
    const tradeSet = new Set();
    const citySet = new Set();
    const stateSet = new Set();
    const educationSet = new Set();
    const statusSet = new Set();
    const skillsSet = new Set();
    const dataTagsSet = new Set();
    const experiences = [];

    for (const member of memberIndex) {
      if (member.gender) {
        const g = String(member.gender).trim();
        genderSet.add(g.toLowerCase() === "male" ? "Male" : g.toLowerCase() === "female" ? "Female" : g);
      }
      if (member.category) categorySet.add(String(member.category).trim());
      if (member.service)      serviceSet.add(String(member.service).trim());
      if (member.rank)         rankSet.add(String(member.rank).trim());
      if (member.level)        levelSet.add(String(member.level).trim());
      if (member.trade)        tradeSet.add(String(member.trade).trim());
      if (member.city)         citySet.add(String(member.city).trim());
      if (member.state)        stateSet.add(String(member.state).trim());
      if (member.education)    educationSet.add(String(member.education).trim());
      if (member.status)       statusSet.add(String(member.status).trim());
      for (const s of member.__skills) skillsSet.add(s);
      if (Array.isArray(member.tags)) {
        for (const t of member.tags) {
          const trimmed = String(t).trim();
          if (trimmed) dataTagsSet.add(trimmed);
        }
      }
      if (!isNaN(member.__experienceValue) && member.__experienceValue >= 0) {
        experiences.push(member.__experienceValue);
      }
    }

    const toSorted = (set) => Array.from(set).sort((a, b) => a.localeCompare(b));

    let buckets = [];
    if (experiences.length === 0) {
      buckets = ["0-1 yr", "1-3 yrs", "3-5 yrs", "5-10 yrs", "10+ yrs"];
    } else {
      const maxExp = Math.max(...experiences);
      const ceiling = Math.ceil(maxExp / 5) * 5;
      if (ceiling >= 1)  buckets.push("0-1 yr");
      if (ceiling >= 3)  buckets.push("1-3 yrs");
      if (ceiling >= 5)  buckets.push("3-5 yrs");
      if (ceiling >= 10) buckets.push("5-10 yrs");
      if (ceiling >= 15) buckets.push("10-15 yrs");
      if (ceiling >= 20) buckets.push("15-20 yrs");
      if (ceiling >= 25) buckets.push("20-25 yrs");
      if (ceiling >= 30) buckets.push("25-30 yrs");
      if (ceiling > 30)  buckets.push("30+ yrs");
      else if (ceiling >= 10) buckets.push(`${Math.max(10, ceiling - 5)}+ yrs`);
    }

    return {
      Gender:           toSorted(genderSet),
      Category:         toSorted(categorySet),
      Service:          toSorted(serviceSet),
      Rank:             toSorted(rankSet),
      Level:            toSorted(levelSet),
      Trade:            toSorted(tradeSet),
      City:             toSorted(citySet),
      State:            toSorted(stateSet),
      Education:        toSorted(educationSet),
      Project:          availableProjects.filter((p) => p !== "All"),
      Requirement:      requirementData.labels,
      Status:           toSorted(statusSet),
      Tags:             Array.from(skillsSet).sort((a, b) => a.localeCompare(b)),
      "BO Tags":      Array.from(dataTagsSet).sort((a, b) => a.localeCompare(b)),
      "Placement Status": ["Placed", "Active"],
      Experience:       buckets,
      "Is Rated?":      ["Yes", "No"],
      "Is Tagged?":     ["Yes", "No"],
      "Regional Partner": ["Active", "Inactive"],
    };
  }, [memberIndex, availableProjects, requirementData]);

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

  const handleFilterChange = (key, value) => {
    startTransition(() => {
      setSidebarFilters((prev) => ({ ...prev, [key]: value }));
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      setSidebarFilters({
        Gender: [],
        Category: [],
        Service: [],
        Rank: [],
        Level: [],
        Trade: [],
        City: [],
        State: [],
        Education: [],
        Project: [],
        Requirement: [],
        Status: "All",
        "Placement Status": "All",
        Experience: [],
        Tags: [],
        "BO Tags": [],
        "Is Rated?": [],
        "Is Tagged?": [],
        "Regional Partner": [],
      });
      setRetirementStatus("All");
      setRegistrationDateFrom("");
      setRegistrationDateTo("");
      setAgeRange([ageBounds.min, ageBounds.max]);
    });
  };

  const saveCurrentAsFavorite = (name) => {
    const snapshot = {
      id: Date.now().toString(36),
      name,
      searchTerm,
      sidebarFilters,
      retirementStatus,
      registrationDateFrom,
      registrationDateTo,
      ageRange,
      groupBy,
    };
    persistFavorites([...favorites, snapshot]);
  };

  const applyFavorite = (fav) => {
    startTransition(() => {
      setSearchTerm(fav.searchTerm || "");
      setSidebarFilters(fav.sidebarFilters || {});
      setRetirementStatus(fav.retirementStatus || "All");
      setRegistrationDateFrom(fav.registrationDateFrom || "");
      setRegistrationDateTo(fav.registrationDateTo || "");
      setAgeRange(fav.ageRange || [ageBounds.min, ageBounds.max]);
      setGroupBy(fav.groupBy || null);
    });
  };

  const deleteFavorite = (id) => {
    persistFavorites(favorites.filter((f) => f.id !== id));
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

  // Filtered + Sorted Members (Robust Alphabetical A → Z), everything except the
  // registration date range — the Dashboard's registration trends need this set,
  // and applying the date range on top of it (below) avoids a second full scan.
  const filteredMembersNoDateRange = useMemo(() => {
    const list = [];
    const searchTerm = debouncedSearchTerm.trim().toLowerCase();
    const selectedSidebarFilters = Object.entries(sidebarFilters).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== "All"
    );
    const activeAgeFilter = ageRange[0] > ageBounds.min || ageRange[1] < ageBounds.max;

    const fieldMap = {
      Gender: "gender",
      Category: "category",
      Service: "service",
      Rank: "rank",
      Level: "level",
      Trade: "trade",
      City: "city",
      State: "state",
      Education: "education",
      Project: "project",
    };

    const lowercasedSidebarFilters = selectedSidebarFilters.map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : String(value).toLowerCase(),
    ]);

    for (const member of memberIndex) {
      if (searchTerm) {
        if (
          !member.__searchBlob.includes(searchTerm) &&
          !member.__phoneLower.includes(searchTerm) &&
          !member.__emailLower.includes(searchTerm)
        ) {
          continue;
        }
      }

      if (filterPlaced === "placed" && member.isPlaced !== true) continue;
      if (filterPlaced === "active" && member.isPlaced === true) continue;
      if (retirementStatus !== "All" && member.retirement_status !== retirementStatus) continue;

      if (activeAgeFilter) {
        const age = member.age_years;
        if (!Number.isFinite(age) || age < ageRange[0] || age > ageRange[1]) continue;
      }

      let matchesSidebar = true;
      for (const [key, values] of lowercasedSidebarFilters) {
        if (key === "Tags") {
          if (!values.some((v) => member.__skillsLower.includes(v))) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "BO Tags") {
          if (!values.some((v) => member.__dataTagsLower.includes(v))) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "Placement Status") {
          const wantsPlaced = values.includes("placed");
          const wantsActive = values.includes("active");
          if (wantsPlaced && !wantsActive && member.isPlaced !== true) { matchesSidebar = false; break; }
          if (wantsActive && !wantsPlaced && member.isPlaced === true) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Is Rated?") {
          const wantsYes = values.includes("yes");
          const wantsNo = values.includes("no");
          if (wantsYes && !wantsNo && !member.__isRated) { matchesSidebar = false; break; }
          if (wantsNo && !wantsYes && member.__isRated) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Is Tagged?") {
          const wantsYes = values.includes("yes");
          const wantsNo = values.includes("no");
          if (wantsYes && !wantsNo && !member.__isTagged) { matchesSidebar = false; break; }
          if (wantsNo && !wantsYes && member.__isTagged) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Regional Partner") {
          const wantsActive = values.includes("active");
          const wantsInactive = values.includes("inactive");
          const isActivePartner = !!member.is_regional_partner && member.regional_partner_status !== "Inactive";
          const isInactivePartner = !!member.is_regional_partner && member.regional_partner_status === "Inactive";
          if (wantsActive && !wantsInactive && !isActivePartner) { matchesSidebar = false; break; }
          if (wantsInactive && !wantsActive && !isInactivePartner) { matchesSidebar = false; break; }
          continue;
        }

        if (key === "Experience") {
          const ranges = values.map((v) => parseExperienceRange(v)).filter(Boolean);
          if (!ranges.length) continue;
          const exp = member.__experienceValue;
          const matchesAny = Number.isFinite(exp) && ranges.some(
            (r) => exp >= r.min && (r.max === Infinity || exp <= r.max)
          );
          if (!matchesAny) {
            matchesSidebar = false;
            break;
          }
          continue;
        }

        if (key === "Project") {
          if (!values.some((v) => member.__projectsLower.includes(v))) {
            matchesSidebar = false;
          }
          if (!matchesSidebar) break;
          continue;
        }

        if (key === "Requirement") {
          if (!values.some((v) => requirementData.membersByLabel.get(v)?.has(member.id))) {
            matchesSidebar = false;
          }
          if (!matchesSidebar) break;
          continue;
        }

        const dbField = fieldMap[key];
        if (!dbField) continue;
        let memberValue;
        if (dbField === "category") memberValue = member.__categoryLower;
        else if (dbField === "service") memberValue = member.__serviceLower;
        else if (dbField === "rank") memberValue = member.__rankLower;
        else if (dbField === "state") memberValue = member.__stateLower;
        else if (dbField === "city") memberValue = member.__cityLower;
        else if (dbField === "education") memberValue = member.__educationLower;
        else memberValue = String(member[dbField] || "").toLowerCase();

        if (!values.includes(memberValue)) matchesSidebar = false;

        if (!matchesSidebar) break;
      }

      if (matchesSidebar) list.push(member);
    }

    // Fast sort — localeCompare is ~10x slower than direct comparison at 15k rows
    list.sort((a, b) => {
      const nameA = (a.__name || "ZZZ_NO_NAME").toLowerCase();
      const nameB = (b.__name || "ZZZ_NO_NAME").toLowerCase();
      return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
    });

    return list;
  }, [memberIndex, debouncedSearchTerm, filterPlaced, sidebarFilters, requirementData, retirementStatus, ageRange, ageBounds.min, ageBounds.max]);

  const filteredMembers = useMemo(() => {
    const fromBoundaryMs = parseDateBoundary(registrationDateFrom, false)?.getTime() ?? null;
    const toBoundaryMs = parseDateBoundary(registrationDateTo, true)?.getTime() ?? null;
    if (fromBoundaryMs === null && toBoundaryMs === null) return filteredMembersNoDateRange;

    return filteredMembersNoDateRange.filter((member) => {
      if (member.__registrationDateMs === null) return false;
      if (fromBoundaryMs !== null && member.__registrationDateMs < fromBoundaryMs) return false;
      if (toBoundaryMs !== null && member.__registrationDateMs > toBoundaryMs) return false;
      return true;
    });
  }, [filteredMembersNoDateRange, registrationDateFrom, registrationDateTo]);

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
    "Project",
    "Requirement",
    "Tags",
    "BO Tags",
    "Experience",
    "Is Rated?",
    "Is Tagged?",
    "Regional Partner",
  ];

  // One-click toggles shown in the Filters dropdown — each just flips a
  // value already tracked in sidebarFilters/retirementStatus, so the search
  // bar's chip row (below) reflects them automatically, same as any other
  // filter.
  const quickFilters = [
    {
      key: "tagged",
      label: "Tagged",
      active: (sidebarFilters["Is Tagged?"] || []).includes("Yes"),
      onToggle: () =>
        handleFilterChange("Is Tagged?", (sidebarFilters["Is Tagged?"] || []).includes("Yes") ? [] : ["Yes"]),
    },
    {
      key: "rated",
      label: "Rated",
      active: (sidebarFilters["Is Rated?"] || []).includes("Yes"),
      onToggle: () =>
        handleFilterChange("Is Rated?", (sidebarFilters["Is Rated?"] || []).includes("Yes") ? [] : ["Yes"]),
    },
    {
      key: "partner-active",
      label: "Regional Partner (Active)",
      active: (sidebarFilters["Regional Partner"] || []).includes("Active"),
      startGroup: true,
      onToggle: () => {
        const current = sidebarFilters["Regional Partner"] || [];
        const has = current.includes("Active");
        handleFilterChange("Regional Partner", has ? current.filter((v) => v !== "Active") : [...current, "Active"]);
      },
    },
    {
      key: "partner-inactive",
      label: "Regional Partner (Inactive)",
      active: (sidebarFilters["Regional Partner"] || []).includes("Inactive"),
      onToggle: () => {
        const current = sidebarFilters["Regional Partner"] || [];
        const has = current.includes("Inactive");
        handleFilterChange("Regional Partner", has ? current.filter((v) => v !== "Inactive") : [...current, "Inactive"]);
      },
    },
    {
      key: "retired",
      label: "Retired",
      active: retirementStatus === "Retired",
      startGroup: true,
      onToggle: () => setRetirementStatus(retirementStatus === "Retired" ? "All" : "Retired"),
    },
  ];

  // Every active filter/group renders as a removable chip in the search bar
  // — a generic projection of sidebarFilters/retirementStatus/groupBy rather
  // than a separately-tracked list, so it can never drift out of sync.
  const filterChips = [];
  Object.entries(sidebarFilters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        filterChips.push({
          key: `${key}:${v}`,
          label: v,
          onRemove: () => handleFilterChange(key, value.filter((x) => x !== v)),
        });
      });
    } else if (value && value !== "All") {
      filterChips.push({ key: `${key}:${value}`, label: value, onRemove: () => handleFilterChange(key, "All") });
    }
  });
  if (retirementStatus !== "All") {
    filterChips.push({ key: "retirement", label: retirementStatus, onRemove: () => setRetirementStatus("All") });
  }
  if (groupBy) {
    const activeGroupOption = MEMBER_GROUP_BY_OPTIONS.find((o) => o.key === groupBy);
    filterChips.push({
      key: "groupby",
      label: `Group: ${activeGroupOption?.label || groupBy}`,
      onRemove: () => setGroupBy(null),
    });
  }

  // The full field-by-field filter panel, embedded as the Filters dropdown's
  // collapsible "Advanced Filters" section instead of living in its own
  // block below the header.
  const advancedFiltersPanel = (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
        <button
          onClick={clearFilters}
          style={{
            padding: "6px 14px",
            background: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "12px",
            cursor: "pointer",
            fontWeight: "700",
            whiteSpace: "nowrap",
          }}
        >
          Clear All
        </button>
      </div>

      <div style={{ marginBottom: "14px" }}>
        <FilterAccordionList
          sections={[
            ...filterKeys.map((filterKey) => ({
              key: filterKey,
              label: filterKey,
              options: filterOptions[filterKey] || [],
              selected: sidebarFilters[filterKey] || [],
              onChange: (next) => handleFilterChange(filterKey, next),
            })),
            {
              key: "Retirement Status",
              label: "Retirement Status",
              options: ["Retired", "Not Retired"],
              selected: retirementStatus === "All" ? [] : [retirementStatus],
              onChange: (next) => setRetirementStatus(next.length ? next[next.length - 1] : "All"),
            },
          ]}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "stretch" }}>
        <div
          style={{
            flex: "1 1 320px",
            background: "#f8fafc",
            border: "1px solid #dbe3ee",
            borderRadius: "10px",
            padding: "10px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          <label style={{ display: "block", marginBottom: "6px", fontWeight: "700", fontSize: "11px", color: "#334155" }}>Date Range</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <DatePicker
              selected={toDatePickerValue(registrationDateFrom)}
              onChange={(date) =>
                startTransition(() => {
                  setRegistrationDateFrom(toDateInputValue(date));
                })
              }
              dateFormat="dd MMM yyyy"
              placeholderText="From date"
              showPopperArrow={false}
              className="member-date-range-input"
              wrapperClassName="member-date-range-wrapper"
              portalId="member-date-range-portal"
              popperClassName="member-date-range-popper"
            />
            <DatePicker
              selected={toDatePickerValue(registrationDateTo)}
              onChange={(date) =>
                startTransition(() => {
                  setRegistrationDateTo(toDateInputValue(date));
                })
              }
              dateFormat="dd MMM yyyy"
              placeholderText="To date"
              showPopperArrow={false}
              className="member-date-range-input"
              wrapperClassName="member-date-range-wrapper"
              portalId="member-date-range-portal"
              popperClassName="member-date-range-popper"
            />
          </div>
        </div>
        <div style={{ flex: "1 1 280px", border: "1px solid #dbe3ee", borderRadius: "12px", background: "#f8fafc", overflow: "hidden" }}>
          <DualRangeSlider
            label="Age Range"
            helperText="Drag both handles to narrow the visible age range."
            min={ageBounds.min}
            max={ageBounds.max}
            value={ageRange}
            onChange={(nextValue) => {
              startTransition(() => {
                setAgeRange(nextValue);
              });
            }}
            suffix=" yrs"
            className="member-age-range"
          />
        </div>
      </div>
    </>
  );

  return {
    searchTerm,
    setSearchTerm,
    groupBy,
    setGroupBy,
    memberIndex,
    filterOptions,
    filteredMembers,
    filteredMembersNoDateRange,
    registrationDateFrom,
    registrationDateTo,
    quickFilters,
    filterChips,
    advancedFiltersPanel,
    favorites,
    applyFavorite,
    deleteFavorite,
    saveCurrentAsFavorite,
    clearFilters,
    requirementData,
    availableProjects,
    ageBounds,
    sidebarFilters,
    retirementStatus,
  };
}
