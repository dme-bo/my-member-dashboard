const toText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const normalizeLookupKey = (key) => String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const getRecordValue = (record, key) => {
  if (!record) return undefined;
  const targetKey = normalizeLookupKey(key);
  for (const actualKey of Object.keys(record)) {
    if (normalizeLookupKey(actualKey) === targetKey) {
      return record[actualKey];
    }
  }
  return undefined;
};

const firstPresent = (record, keys) => {
  for (const key of keys) {
    const value = getRecordValue(record, key);
    if (value === undefined) continue;
    if (value !== null && value !== undefined && toText(value) !== "") {
      return value;
    }
  }
  return "";
};

const monthLookup = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const normalizeDateInput = (dateInput) => {
  if (!dateInput) return null;

  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput;
  }

  if (typeof dateInput?.toDate === "function") {
    const parsed = dateInput.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();

    const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoDate) {
      const parsed = new Date(
        parseInt(isoDate[1], 10),
        parseInt(isoDate[2], 10) - 1,
        parseInt(isoDate[3], 10)
      );
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (slashDate) {
      const day = parseInt(slashDate[1], 10);
      const month = parseInt(slashDate[2], 10) - 1;
      const year = parseInt(slashDate[3], 10);
      const hour = parseInt(slashDate[4] || "0", 10);
      const minute = parseInt(slashDate[5] || "0", 10);
      const second = parseInt(slashDate[6] || "0", 10);
      const parsed = new Date(year, month, day, hour, minute, second);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return null;
};

export const pickMemberText = (record, keys, fallback = "") => {
  const value = firstPresent(record, keys);
  const text = toText(value);
  return text || fallback;
};

export const getMemberOrganization = (record) =>
  pickMemberText(record, ["organization", "Organization", "category", "Category"]);

export const getMemberName = (record) =>
  pickMemberText(
    record,
    [
      "full_name",
      "display_name",
      "displayName",
      "name",
      "Full Name",
    ],
    ""
  ) ||
  (() => {
    const first = toText(record?.first_name);
    const last = toText(record?.last_name);
    const combined = `${first} ${last}`.trim();
    return combined || "No Name";
  })();

export const getMemberPhone = (record) =>
  pickMemberText(record, ["phone_number", "phone", "mobile", "contact_number", "mobile_number", "Mobile Number", "Phone Number"]);

export const getMemberEmail = (record) =>
  pickMemberText(record, ["email", "email_id", "emailId", "Email", "E-mail"]);

export const getMemberState = (record) =>
  pickMemberText(record, ["state", "State"]);

export const getMemberCity = (record) =>
  pickMemberText(record, ["city", "City"]);

export const getMemberService = (record) =>
  pickMemberText(record, ["service", "Service"]);

export const getMemberRank = (record) =>
  normalizeRankLabel(pickMemberText(record, ["rank", "Rank"]));

export const getMemberLevel = (record) =>
  pickMemberText(record, ["level", "Level"]);

export const getMemberTrade = (record) =>
  pickMemberText(record, ["trade", "Trade"]);

export const getMemberEducation = (record) =>
  pickMemberText(record, ["education"]);

export const getMemberLatLongText = (record) =>
  (() => {
    const value = firstPresent(record, [
      "latlong",
      "lat_long",
      "latLng",
      "lat_lng",
      "coordinates",
      "geo_coordinates",
      "location_coordinates",
      "map_location",
    ]);
    if (value && typeof value === "object") return "";
    return toText(value);
  })();

const parseCoordinateNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseMemberLatLong = (record) => {
  const directValue = getRecordValue(record, "latlong")
    ?? getRecordValue(record, "lat_long")
    ?? getRecordValue(record, "latLng")
    ?? getRecordValue(record, "lat_lng")
    ?? getRecordValue(record, "coordinates")
    ?? getRecordValue(record, "geo_coordinates")
    ?? getRecordValue(record, "location_coordinates")
    ?? getRecordValue(record, "map_location");

  if (directValue && typeof directValue === "object" && !Array.isArray(directValue)) {
    const lat = parseCoordinateNumber(directValue.lat ?? directValue.latitude ?? directValue.y);
    const lng = parseCoordinateNumber(directValue.lng ?? directValue.lon ?? directValue.longitude ?? directValue.x);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  if (Array.isArray(directValue) && directValue.length >= 2) {
    const lat = parseCoordinateNumber(directValue[0]);
    const lng = parseCoordinateNumber(directValue[1]);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  const separateLat = parseCoordinateNumber(
    getRecordValue(record, "lat") ??
      getRecordValue(record, "latitude") ??
      getRecordValue(record, "Lat") ??
      getRecordValue(record, "Latitude")
  );
  const separateLng = parseCoordinateNumber(
    getRecordValue(record, "lng") ??
      getRecordValue(record, "lon") ??
      getRecordValue(record, "longitude") ??
      getRecordValue(record, "Lng") ??
      getRecordValue(record, "Lon") ??
      getRecordValue(record, "Longitude")
  );
  if (separateLat !== null && separateLng !== null) return { lat: separateLat, lng: separateLng };

  const text = toText(directValue || getMemberLatLongText(record));
  if (!text) return null;

  const cleaned = text
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split(/[, ]+/).filter(Boolean);
  if (parts.length >= 2) {
    const lat = parseCoordinateNumber(parts[0]);
    const lng = parseCoordinateNumber(parts[1]);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  const match = cleaned.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (match) {
    const lat = parseCoordinateNumber(match[1]);
    const lng = parseCoordinateNumber(match[2]);
    if (lat !== null && lng !== null) return { lat, lng };
  }

  const numberMatches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (numberMatches && numberMatches.length >= 2) {
    let lat = parseCoordinateNumber(numberMatches[0]);
    let lng = parseCoordinateNumber(numberMatches[1]);
    if (lat !== null && lng !== null) {
      const upper = cleaned.toUpperCase();
      if (/\bS\b/.test(upper)) lat = -Math.abs(lat);
      if (/\bW\b/.test(upper)) lng = -Math.abs(lng);
      return { lat, lng };
    }
  }

  return null;
};

export const getMemberExperience = (record) =>
  pickMemberText(record, ["experience", "total_experience", "Total Experience", "Total experience", "Service Experience (Years)"]);

export const getMemberStatus = (record) =>
  pickMemberText(record, ["status", "Status", "final_status", "Final Status", "background_status", "Background Status"]);

export const getMemberPlacementStatus = (record) => {
  const rawValue = pickMemberText(
    record,
    [
      "isPlaced",
      "is_placed",
      "placed",
      "Placed",
      "placement_status",
      "Placement Status",
      "Placed by BO",
    ]
  ).toLowerCase();

  if (!rawValue) return false;
  return ["yes", "true", "1", "placed", "active"].includes(rawValue);
};

export const getMemberTagsText = (record) =>
  pickMemberText(record, ["tags", "Tags"]);

export const parseMemberTags = (record) => {
  const text = getMemberTagsText(record);
  if (!text) return [];
  return String(text)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

export const parseMemberSkills = (record) => {
  const rawSkills = firstPresent(record, ["skills", "Skills"]);
  if (Array.isArray(rawSkills)) {
    return rawSkills.map((skill) => toText(skill)).filter(Boolean);
  }

  return String(rawSkills || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
};

const rankAliases = {
  adhikari: "Adhikari",
  ae: "AE",
  aee: "AEE",
  asi: "ASI",
  brig: "Brig",
  capt: "Capt",
  cdr: "Cdr",
  "cheng": "Ch Eng",
  col: "Col",
  constable: "Constable",
  cpl: "Cpl",
  cpo: "CPO",
  dc: "DC",
  dg: "DG",
  "fltlt": "Flt Lt",
  gen: "Gen",
  "gpcapt": "Gp Capt",
  "groupc": "Group C",
  "groupd": "Group D",
  "hcapt": "H/Capt",
  "hlt": "H/Lt",
  hav: "Hav",
  hc: "HC",
  je: "JE",
  jwo: "JWO",
  "lnk": "L/Nk",
  lac: "LAC",
  ldc: "LDC",
  lsm: "LSM",
  lt: "Lt",
  "ltcdr": "Lt Cdr",
  "ltcol": "Lt Col",
  maj: "Maj",
  "mcpoii": "MCPO II",
  mwo: "MWO",
  navik: "Navik",
  "nbsub": "Nb Sub",
  nk: "Nk",
  none: "None",
  pioneer: "Pioneer",
  po: "PO",
  "pradhannavik": "Pradhan Navik",
  se: "SE",
  sep: "Sep",
  sgt: "Sgt",
  si: "SI",
  "sqnldr": "Sqn Ldr",
  steno: "Steno",
  sub: "Sub",
  "submaj": "Sub Maj",
  udc: "UDC",
  "uttamnavik": "Uttam Navik",
  "wgcdr": "Wg Cdr",
  wo: "WO",
};

export const normalizeRankLabel = (rankInput) => {
  const text = toText(rankInput);
  if (!text) return "";

  const base = text.split("(")[0].trim();
  const key = base.toLowerCase().replace(/[^a-z0-9]/g, "");
  return rankAliases[key] || base || text;
};

export const parseMemberDate = (dateInput) => {
  const normalizedDate = normalizeDateInput(dateInput);
  if (normalizedDate) return normalizedDate;

  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();

    const isoLike = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (isoLike) {
      const day = parseInt(isoLike[1], 10);
      const month = monthLookup[isoLike[2].toLowerCase()];
      const year = parseInt(isoLike[3], 10);
      const hour = parseInt(isoLike[4] || "0", 10);
      const minute = parseInt(isoLike[5] || "0", 10);
      const second = parseInt(isoLike[6] || "0", 10);
      if (month !== undefined) {
        const parsed = new Date(year, month, day, hour, minute, second);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }

    const plain = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (plain) {
      const day = parseInt(plain[1], 10);
      const monthKey = plain[2].slice(0, 3).toLowerCase();
      const year = parseInt(plain[3], 10);
      const month = monthLookup[monthKey];
      if (month !== undefined) {
        const parsed = new Date(year, month, day);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }
  }

  return null;
};

export const getMemberDateOfBirth = (record) =>
  pickMemberText(record, ["dateofbirth", "date_of_birth", "dob", "DOB", "Dob", "Date of Birth", "Date Of Birth"]);

export const getMemberRetirementDate = (record) =>
  pickMemberText(
    record,
    [
      "actual_plan_date_of_retirement",
      "planned_retirement_date",
      "actual_retirement_date",
      "actual_retirement",
      "planned_retirement",
      "Actual Plan Date Of Retirement",
      "Actual Retirement",
    ]
  );

export const getMemberRetirementStatus = (record) => {
  const retirementDateText = getMemberRetirementDate(record);
  const retirementDate = parseMemberDate(retirementDateText);
  if (!retirementDate) return "Not Retired";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return retirementDate < todayStart ? "Retired" : "Not Retired";
};

export const getMemberAge = (record) => {
  const dobText = getMemberDateOfBirth(record);
  const dob = parseMemberDate(dobText);
  if (!dob) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

export const isMemberRetired = (record) => {
  return getMemberRetirementStatus(record) === "Retired";
};

export const normalizeMemberRecord = (raw = {}) => {
  const organization = getMemberOrganization(raw);
  const fullName = getMemberName(raw);
  const phoneNumber = getMemberPhone(raw);
  const rank = getMemberRank(raw);
  const service = getMemberService(raw);
  const state = getMemberState(raw);
  const city = getMemberCity(raw);
  const education = getMemberEducation(raw);
  const latlong = getMemberLatLongText(raw);
  const locationPoint = parseMemberLatLong(raw);
  const experience = getMemberExperience(raw);
  const ageYears = getMemberAge(raw);
  const retirementStatus = getMemberRetirementStatus(raw);
  const placementStatus = getMemberPlacementStatus(raw);
  const tags = parseMemberTags(raw);
  const skills = parseMemberSkills(raw);
  const tagsText = tags.join(", ");
  const skillsText = skills.join(", ");

  return {
    ...raw,
    full_name: fullName,
    display_name: pickMemberText(raw, ["display_name", "displayName"], fullName),
    name: pickMemberText(raw, ["name"], fullName),
    phone_number: phoneNumber,
    phone: pickMemberText(raw, ["phone"], phoneNumber),
    mobile: pickMemberText(raw, ["mobile"], phoneNumber),
    organization,
    category: pickMemberText(raw, ["category"], organization),
    BOCategory: pickMemberText(raw, ["BOCategory"]),
    service,
    rank,
    level: getMemberLevel(raw),
    trade: getMemberTrade(raw),
    city,
    state,
    gender: pickMemberText(raw, ["gender", "Gender"]),
    email: getMemberEmail(raw),
    member_id: pickMemberText(raw, ["member_id", "Member Id"]),
    registration_date: pickMemberText(raw, ["entry_date", "registration_date", "Entry Date", "Registration Date"]),
    total_experience: experience,
    experience,
    experience_years: (() => {
      const parsed = parseFloat(experience);
      return Number.isFinite(parsed) ? parsed : null;
    })(),
    age_years: ageYears,
    status: getMemberStatus(raw),
    isPlaced: placementStatus,
    retirement_status: retirementStatus,
    tags,
    Tags: tagsText,
    skills,
    Skills: skillsText,
    current_ctc: pickMemberText(raw, ["current_ctc", "Current Ctc"]),
    expected_ctc: pickMemberText(raw, ["expected_ctc", "Expected Ctc"]),
    education,
    graduation_course: education,
    latlong,
    location_point: locationPoint,
    dateofbirth: getMemberDateOfBirth(raw),
    actual_plan_date_of_retirement: getMemberRetirementDate(raw),
    planned_retirement_date: getMemberRetirementDate(raw),
    actual_retirement_date: pickMemberText(raw, ["actual_retirement_date", "Actual Retirement"]),
  };
};
