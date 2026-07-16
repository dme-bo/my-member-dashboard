const SESSION_KEY = "bo_dashboard_session";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const getSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (session?.ts && Date.now() - session.ts > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
};

export const setSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};
