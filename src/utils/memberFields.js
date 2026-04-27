const toText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const firstPresent = (record, keys) => {
  for (const key of keys) {
    if (!record || !(key in record)) continue;
    const value = record[key];
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

export const pickMemberText = (record, keys, fallback = "") => {
  const value = firstPresent(record, keys);
  const text = toText(value);
  return text || fallback;
};

export const getMemberOrganization = (record) =>
  pickMemberText(record, ["organization"]);

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
  pickMemberText(record, ["phone_number", "phone", "mobile", "contact_number", "mobile_number", "Mobile Number"]);

export const getMemberEmail = (record) =>
  pickMemberText(record, ["email", "email_id", "emailId", "Email"]);

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
  pickMemberText(record, ["education", "Education"]);

export const getMemberExperience = (record) =>
  pickMemberText(record, ["experience", "total_experience", "Total Experience"]);

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

export const normalizeMemberRecord = (raw = {}) => {
  const organization = getMemberOrganization(raw);
  const fullName = getMemberName(raw);
  const phoneNumber = getMemberPhone(raw);
  const rank = getMemberRank(raw);

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
    service: getMemberService(raw),
    rank,
    level: getMemberLevel(raw),
    trade: getMemberTrade(raw),
    city: getMemberCity(raw),
    state: getMemberState(raw),
    gender: pickMemberText(raw, ["gender", "Gender"]),
    email: getMemberEmail(raw),
    member_id: pickMemberText(raw, ["member_id", "Member Id"]),
    registration_date: pickMemberText(raw, ["entry_date", "registration_date", "Entry Date", "Registration Date"]),
    total_experience: getMemberExperience(raw),
    experience: getMemberExperience(raw),
    current_ctc: pickMemberText(raw, ["current_ctc", "Current Ctc"]),
    expected_ctc: pickMemberText(raw, ["expected_ctc", "Expected Ctc"]),
    education: getMemberEducation(raw),
    graduation_course: getMemberEducation(raw),
  };
};
