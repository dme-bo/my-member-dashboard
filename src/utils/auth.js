export const OPERATIONS_LOGIN_URL = "https://operations.briskolive.com/";
export const AUTH_EMAIL_PARAM = "authEmail";

export const goToLogin = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete(AUTH_EMAIL_PARAM);
  window.location.href = `${OPERATIONS_LOGIN_URL}?returnTo=${encodeURIComponent(url.toString())}`;
};
