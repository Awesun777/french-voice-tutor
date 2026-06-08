export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Google Sign-In URL — redirects through our own server route which handles the OAuth flow.
export const getLoginUrl = (returnPath?: string) => {
  const url = new URL(`${window.location.origin}/api/auth/google/login`);
  if (returnPath) url.searchParams.set("returnPath", returnPath);
  return url.toString();
};

// Keep the old name as an alias for any code that still imports it
export const getGoogleLoginUrl = getLoginUrl;
