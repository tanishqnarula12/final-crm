// Query management — backed by the CRM API (Postgres).
//
// Same "in-memory cache hydrated from the API" seam as utils/tasks.js:
// `loadQueries()` stays synchronous, and `saveQueries()` updates the cache
// immediately while persisting the whole array to the server in the
// background, reconciling with the server-authoritative list afterward.

import { api } from '../services/api';

let cache = [];

export const loadQueries = () => cache;

// Fetches every query from the server and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads queries.
export async function hydrateQueries() {
  const { queries } = await api.get('/queries');
  cache = Array.isArray(queries) ? queries : [];
  window.dispatchEvent(new Event('crm:queries-updated'));
  return cache;
}

export const saveQueries = (queries) => {
  cache = queries;
  window.dispatchEvent(new Event('crm:queries-updated'));
  // The server validates every change (RBAC) and returns the authoritative
  // list; reconcile so any rejected edit reverts in the UI — and tell the user
  // when that happens (e.g. someone other than the raiser trying to edit the
  // query's own text, or the recipient trying to move the stage backward).
  api.put('/queries', { queries })
    .then((res) => {
      if (Array.isArray(res?.queries)) {
        cache = res.queries;
        window.dispatchEvent(new Event('crm:queries-updated'));
      }
      if (res?.stats?.rejected > 0) {
        window.dispatchEvent(new CustomEvent('crm:queries-sync-warning', {
          detail: { message: `${res.stats.rejected} change${res.stats.rejected === 1 ? '' : 's'} could not be saved — you may not have permission. The list has been refreshed.` },
        }));
      }
    })
    .catch((err) => {
      console.error('Failed to persist queries:', err);
      hydrateQueries().catch(() => {});
      window.dispatchEvent(new CustomEvent('crm:queries-sync-warning', {
        detail: { message: 'Your change could not be saved. The list has been refreshed.' },
      }));
    });
};

export const QUERY_STAGES = ['Open', 'In Progress', 'Resolved', 'Closed'];

// Visual theme per stage (badge colours) — same palette convention as Tasks.
export const STAGE_THEME = {
  'Open': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'In Progress': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  'Resolved': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Closed': 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800/40 dark:text-slate-400 dark:ring-slate-700/40',
};

// "Query Related To" — what the query is about.
export const QUERY_CATEGORIES = [
  'Client', 'Lead', 'Investment', 'Insurance', 'Task', 'Meeting', 'COBR', 'Operations', 'Other',
];

export const fmtQueryStamp = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
