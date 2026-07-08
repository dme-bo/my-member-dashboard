export const OPERATIONS_LOGIN_URL = "https://operations.briskolive.com/";
export const AUTH_EMAIL_PARAM = "authEmail";

export const goToLogin = () => {
  window.location.href = `${OPERATIONS_LOGIN_URL}?returnTo=${encodeURIComponent(window.location.href)}`;
};
