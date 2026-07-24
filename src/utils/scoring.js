// src/utils/scoring.js
import { parseMemberDate } from "./memberFields";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TAG_GRACE_DAYS = 7;

// Last 3 *complete* calendar months, excluding the current (partial) month.
// e.g. if today is in July, the window is Apr 1 - Jun 30 (end exclusive = Jul 1).
export const getLastThreeCompleteMonthsRange = (referenceDate = new Date()) => {
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 3, 1);
  return { start, end };
};

export const getCurrentMonthRange = (referenceDate = new Date()) => {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  return { start, end };
};

const isWithinRange = (date, range) => date && date >= range.start && date < range.end;

export const countRegistrationsInRange = (memberRecords, range) =>
  memberRecords.reduce((count, member) => {
    const regDate = parseMemberDate(member.registration_date);
    return isWithinRange(regDate, range) ? count + 1 : count;
  }, 0);

// If actual meets or beats target: score 0 (no positive scoring for exceeding it).
// If actual falls short: score is the negative deficit (actual - target).
export const computeRegistrationTargetScore = (actual, target) => {
  const met = actual >= target;
  return { actual, target, met, score: met ? 0 : actual - target };
};

const hasAnyTags = (member) => {
  if (Array.isArray(member.skills)) return member.skills.length > 0;
  return Boolean(String(member.skills || member.Skills || "").trim());
};

// Grace period of 7 days from registration date to get tagged.
// Untagged past the grace period loses 1 point per overdue day; tagged members score 0.
export const computeMemberTaggingScore = (member, referenceDate = new Date()) => {
  const regDate = parseMemberDate(member.registration_date);
  if (!regDate) return null;

  const todayStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const regDateStart = new Date(regDate.getFullYear(), regDate.getMonth(), regDate.getDate());
  const daysSinceRegistration = Math.max(0, Math.round((todayStart - regDateStart) / MS_PER_DAY));
  const tagged = hasAnyTags(member);
  const overdueDays = Math.max(0, daysSinceRegistration - TAG_GRACE_DAYS);
  const score = tagged ? 0 : -overdueDays;

  return { regDate: regDateStart, daysSinceRegistration, tagged, overdueDays, score };
};

// Tagging score only applies to members registered in the current month.
export const computeCurrentMonthTaggingScores = (memberRecords, referenceDate = new Date()) => {
  const range = getCurrentMonthRange(referenceDate);

  return memberRecords
    .map((member) => {
      const regDate = parseMemberDate(member.registration_date);
      if (!isWithinRange(regDate, range)) return null;
      const result = computeMemberTaggingScore(member, referenceDate);
      return result ? { member, ...result } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
};

export const TAGGING_GRACE_DAYS = TAG_GRACE_DAYS;
