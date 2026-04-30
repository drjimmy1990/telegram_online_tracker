/**
 * Auth — Simple client-side password gate.
 * Not a server-side auth system. Just hides the dashboard behind a password
 * stored in VITE_DASHBOARD_PASSWORD.
 */

const STORAGE_KEY = "teletracker_auth";
const PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || "";

/**
 * Check if the user has previously authenticated.
 */
export function isAuthenticated() {
  if (!PASSWORD) return true; // No password configured = open access
  return localStorage.getItem(STORAGE_KEY) === hashPassword(PASSWORD);
}

/**
 * Attempt login with the given password.
 * Returns true on success, false on failure.
 */
export function login(password) {
  if (password === PASSWORD) {
    localStorage.setItem(STORAGE_KEY, hashPassword(PASSWORD));
    return true;
  }
  return false;
}

/**
 * Clear auth session.
 */
export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Simple hash for localStorage (not cryptographic — just obfuscation).
 */
function hashPassword(pw) {
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const char = pw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return "tt_" + Math.abs(hash).toString(36);
}
