// Authentication — API-backed, secure.
//
// The real credential is an httpOnly session cookie set by the backend and
// never visible to JavaScript. For instant UI on reload we keep a small,
// NON-SENSITIVE snapshot of the logged-in user (id/name/email/role) in
// localStorage; it is only a hint — `refreshSession()` re-validates it against
// the server (GET /auth/me) on startup and corrects/clears it.
//
// The synchronous accessors (isAuthenticated / getRole / isViewerRole) are
// preserved so existing components and useState initializers keep working
// unchanged; they read the cached snapshot.

import { api, ApiError } from '../services/api.js';

const CACHE_KEY = 'crm:authUser';

let currentUser = readCache();

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(user) {
  currentUser = user;
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore quota errors */
  }
}

// --- Synchronous accessors (same API as before) ----------------------------
// Users hold multiple roles now (`roles: []`); ADMIN is singular and bypasses
// all permission checks.
export const getCurrentUser = () => currentUser;
export const isAuthenticated = () => !!currentUser;
export const getRoles = () => currentUser?.roles || [];
export const hasRole = (role) => (currentUser?.roles || []).includes(role);
export const isAdminRole = () => hasRole('ADMIN');
// Kept for back-compat with any lingering callers; VIEWER no longer exists.
export const isViewerRole = () => false;
export const getRole = () => currentUser?.roles?.[0] || null;

// --- Async operations -------------------------------------------------------

// Validate the session cookie against the server and refresh the cached user.
// Returns the user (and caches it) or null if not authenticated.
export async function refreshSession() {
  try {
    const { user } = await api.get('/auth/me');
    writeCache(user);
    return user;
  } catch (err) {
    // 401 => not logged in; clear stale cache. Network error => keep cache so
    // a transient outage doesn't kick the user out; caller decides.
    if (err instanceof ApiError && err.status === 401) writeCache(null);
    return null;
  }
}

// Log in with email + password. Throws ApiError on bad credentials.
export async function login(email, password) {
  const { user } = await api.post('/auth/login', { email, password });
  writeCache(user);
  return user;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    /* ignore — clear locally regardless */
  }
  writeCache(null);
}

// Self-service password change — requires the current password. Throws
// ApiError (e.g. 401 "Current password is incorrect.") on failure.
export async function changePassword(currentPassword, newPassword) {
  await api.post('/auth/change-password', { currentPassword, newPassword });
}
