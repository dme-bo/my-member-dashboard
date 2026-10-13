// Single place for how dates are shown in the UI: "dd Mmm yyyy" (e.g. "05 Sep 2026").
//
// Month names are a fixed table on purpose. Intl/toLocaleDateString with
// { month: "short" } is locale- and ICU-version-dependent — en-GB renders
// September as "Sept" in current browsers — so it can't guarantee "Sep".
import { parseMemberDate } from "./memberFields";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n) => String(n).padStart(2, "0");

// Accepts a Date, a Firestore Timestamp (or its revived/plain {seconds} form),
// epoch milliseconds, or any date string parseMemberDate understands
// (YYYY-MM-DD, DD/MM/YYYY, "5 Sep 2026", "05-Sep-2026", ISO timestamps...).
export const toValidDate = (input) => {
  if (input === null || input === undefined || input === "") return null;

  let date = null;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === "object" && typeof input.toDate === "function") {
    date = input.toDate();
  } else if (typeof input === "object" && typeof input.seconds === "number") {
    date = new Date(input.seconds * 1000 + Math.round((input.nanoseconds || 0) / 1e6));
  } else if (typeof input === "number") {
    date = new Date(input);
  } else {
    date = parseMemberDate(input);
  }

  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
};

// "05 Sep 2026"
export const formatDateDDMMMYYYY = (input, fallback = "-") => {
  const date = toValidDate(input);
  if (!date) return fallback;
  return `${pad2(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

// "05 Sep 2026, 03:45 PM"
export const formatDateTimeDDMMMYYYY = (input, fallback = "-") => {
  const date = toValidDate(input);
  if (!date) return fallback;
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  return `${formatDateDDMMMYYYY(date)}, ${pad2(hours12)}:${pad2(date.getMinutes())} ${meridiem}`;
};

// For date values that arrive as free text and may carry a trailing time, e.g.
// workshop_start_date "21-Sep-2026 10:30" or job_postedon "21-Sep-2026": the
// date part becomes "21 Sep 2026" and anything after it ("10:30") is kept.
// Other parseable dates (YYYY-MM-DD, DD/MM/YYYY, Timestamps) go through
// formatDateDDMMMYYYY; text that isn't a date at all is returned unchanged.
export const formatDateText = (value, fallback = "-") => {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;

  const text = String(value).trim();
  const hyphenated = /^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})(.*)$/.exec(text);
  if (hyphenated) {
    const month = MONTHS.find((m) => m.toLowerCase() === hyphenated[2].toLowerCase());
    if (month) return `${pad2(Number(hyphenated[1]))} ${month} ${hyphenated[3]}${hyphenated[4]}`;
  }

  const date = typeof value === "string" ? toValidDate(text) : toValidDate(value);
  return date ? formatDateDDMMMYYYY(date) : text;
};

// "Sep 2026" — month + year labels (same fixed month table, so never "Sept").
export const formatMonthYear = (input, fallback = "-") => {
  const date = toValidDate(input);
  if (!date) return fallback;
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};
