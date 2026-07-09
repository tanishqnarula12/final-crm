// Leave requests — backed by the CRM API (Postgres).
//
// Same "in-memory cache hydrated from the API" seam as utils/queries.js, but
// there's no single saveLeaves(array) — apply/edit/respond are three distinct,
// asymmetric actions (different party performs each), so each is its own
// dedicated function that calls its own endpoint and reconciles the cache
// from the server-authoritative response.

import { api } from '../services/api';

let cache = [];

export const loadLeave = () => cache;

// Fetches every leave request visible to the current user (own requests, or
// everyone's for Admin/Internal Manager) and populates the cache. Call once
// on login/app-load (App.jsx `loadData`).
export async function hydrateLeave() {
  const { leaves } = await api.get('/leave');
  cache = Array.isArray(leaves) ? leaves : [];
  window.dispatchEvent(new Event('crm:leave-updated'));
  return cache;
}

function upsertCache(row) {
  const i = cache.findIndex((r) => r.id === row.id);
  cache = i === -1 ? [row, ...cache] : cache.map((r) => (r.id === row.id ? row : r));
  window.dispatchEvent(new Event('crm:leave-updated'));
}

// Apply for leave. Throws ApiError on validation/network failure — callers
// show the message inline in the form.
export async function applyLeave({ fromDate, toDate, reason }) {
  const { leave } = await api.post('/leave', { fromDate, toDate, reason });
  upsertCache(leave);
  return leave;
}

// Edit your own request — also how "re-apply with a modified reason" works:
// editing a Rejected request resets it to Pending server-side.
export async function editLeave(id, { fromDate, toDate, reason }) {
  const { leave } = await api.patch(`/leave/${id}`, { fromDate, toDate, reason });
  upsertCache(leave);
  return leave;
}

// Admin / Internal Manager only: approve or reject, with an optional message.
export async function respondToLeave(id, decision, message) {
  const { leave } = await api.post(`/leave/${id}/respond`, { decision, message: message || undefined });
  upsertCache(leave);
  return leave;
}

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected'];

// Visual theme per status (badge colours) — same palette convention as Queries.
export const LEAVE_STATUS_THEME = {
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  Rejected: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

export const fmtLeaveDate = (isoDate) => {
  // fromDate/toDate are plain 'YYYY-MM-DD' strings, not timestamps — parse as
  // local calendar date so it never shifts a day off due to timezone math.
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return isoDate || '';
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtLeaveRange = (fromDate, toDate) =>
  fromDate === toDate ? fmtLeaveDate(fromDate) : `${fmtLeaveDate(fromDate)} – ${fmtLeaveDate(toDate)}`;

export const fmtLeaveStamp = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
