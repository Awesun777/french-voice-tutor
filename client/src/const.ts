export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Google Sign-In URL — redirects through our own server route which handles
// the OAuth flow. Identity scopes only; Drive access is a separate connect
// flow below, so signing in never shows a Drive consent (or, while the app's
// Drive scopes are unverified, Google's warning screen).
export const getLoginUrl = (returnPath?: string) => {
  const url = new URL(`${window.location.origin}/api/auth/google/login`);
  if (returnPath) url.searchParams.set("returnPath", returnPath);
  return url.toString();
};

// Keep the old name as an alias for any code that still imports it
export const getGoogleLoginUrl = getLoginUrl;

// Google Drive connect/reconnect — the only flow that requests Drive scopes.
export const getDriveConnectUrl = (returnPath?: string) => {
  const url = new URL(`${window.location.origin}/api/auth/google/connect-drive`);
  if (returnPath) url.searchParams.set("returnPath", returnPath);
  return url.toString();
};
