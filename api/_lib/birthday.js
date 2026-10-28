// Helpers for the daily birthday SMS: working out who has a birthday today
// (in India time) and turning stored phone numbers into MSG91 recipients.

const IST = "Asia/Kolkata";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const validMonthDay = (month, day) => Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31;

// { month, day, year } of a Date as seen in India.
export function istParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: IST, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

// YYYY-MM-DD for "today" in India — also the value saved to mark a member as sent.
export function istDateKey(date = new Date()) {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Only the day and month of a stored date of birth matter. Handles Firestore
// Timestamps, Dates, epoch numbers and the text formats seen in member data
// (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY, DD Month YYYY). Returns
// { month, day } or null when the value can't be read.
export function birthMonthDay(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "object" && typeof value.toDate === "function") return birthMonthDay(value.toDate());
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const { month, day } = istParts(value);
    return { month, day };
  }
  if (typeof value === "object" && typeof value._seconds === "number") return birthMonthDay(new Date(value._seconds * 1000));
  if (typeof value === "number") return birthMonthDay(new Date(value > 1e11 ? value : value * 1000));

  const text = String(value).trim();
  if (!text) return null;

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/); // YYYY-MM-DD
  if (m) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    return validMonthDay(month, day) ? { month, day } : null;
  }

  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/); // DD-MM-YYYY (day first, as used in India)
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    return validMonthDay(month, day) ? { month, day } : null;
  }

  m = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{4})(?:\s.*)?$/); // DD-Mon-YYYY / DD Month YYYY
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return validMonthDay(month, day) ? { month, day } : null;
  }

  return null;
}

// 29 Feb birthdays are greeted on 28 Feb in years that have no 29 Feb.
export function isBirthdayToday(monthDay, today = istParts(new Date())) {
  if (!monthDay) return false;
  if (monthDay.month === today.month && monthDay.day === today.day) return true;
  const leapYear = (today.year % 4 === 0 && today.year % 100 !== 0) || today.year % 400 === 0;
  return !leapYear && monthDay.month === 2 && monthDay.day === 29 && today.month === 2 && today.day === 28;
}

// MSG91 wants the number with the country code and no "+" (e.g. 919876543210).
// Returns "" for anything that is not a plausible Indian mobile number.
export function toMsg91Mobile(phone, country = "91") {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `${country}${digits}`;
  const national = digits.startsWith(country) ? digits.slice(country.length) : "";
  return national.length === 10 && /^[6-9]/.test(national) ? digits : "";
}
