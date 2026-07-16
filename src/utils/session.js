const SESSION_COOKIE = "bo_dashboard_session";

// Hard cap on how long a login is trusted before the user is sent back
// to operations.briskolive.com regardless of activity.
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// How often an already-authenticated tab silently re-checks the email
// against the HR onboarding API, so a deactivated/removed account gets
// kicked back to login without waiting for the 24h expiry.
export const SESSION_RECHECK_MS = 15 * 60 * 1000; // 15 minutes

const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const writeCookie = (name, value, maxAgeMs) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${Math.floor(maxAgeMs / 1000)}; SameSite=Lax${secure}`;
};

const removeCookie = (name) => {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
};

export const getSession = () => {
  const raw = readCookie(SESSION_COOKIE);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    if (session.ts && Date.now() - session.ts > SESSION_TTL_MS) {
      removeCookie(SESSION_COOKIE);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

export const setSession = (session) => {
  writeCookie(SESSION_COOKIE, JSON.stringify(session), SESSION_TTL_MS);
};

export const clearSession = () => {
  removeCookie(SESSION_COOKIE);
};
