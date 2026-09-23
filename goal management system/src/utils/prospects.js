// Business Prospects — backed by the CRM API (Postgres).
// Prospects are generated from the Proposals page ("Create Prospect"): each
// selected proposal (Investment sub-type or Insurance type) becomes one prospect
// carrying the generated proposal table, amount and the client's coverage team.
//
// Same "in-memory cache hydrated from the API" seam as tasks/leads/meetings:
// `loadProspects()` stays synchronous. Every WRITE below is a targeted,
// single-record call (POST for create, PATCH /:id for edit/stage-change,
// DELETE /:id for delete) — never a full-array PUT of every prospect, which
// is what this used to do and is exactly why a save used to cost more the
// more prospects existed, regardless of how small the actual change was (see
// server/src/routes/prospects.js for the full story and the new routes).
// Prospects can carry large embedded documents (base64), which is exactly why
// this used to hit the localStorage ~5MB quota — moving to Postgres removes
// that ceiling entirely.

import { api } from '../services/api';

let cache = [];

export const loadProspects = () => cache;

// Fetches every prospect from the server and populates the cache. Call once
// on login/app-load (App.jsx `loadData`) before any component reads prospects,
// or as a recovery step after a write fails (see the .catch()s below).
export async function hydrateProspects() {
  const { prospects } = await api.get('/prospects');
  cache = Array.isArray(prospects) ? prospects : [];
  window.dispatchEvent(new Event('crm:prospects-updated'));
  return cache;
}

// Persists an edit (a detail change, a stage move, or both together) to ONE
// existing prospect. Updates the cache optimistically, then reconciles to
// whatever the server actually applied — the server may only grant PART of
// what was asked (e.g. a stage move an actor is allowed to make, saved
// alongside a detail edit they aren't), so the response is the record's real
// resulting state, not necessarily an echo of what was sent.
export async function saveProspect(prospect) {
  cache = cache.map((p) => (p.id === prospect.id ? prospect : p));
  window.dispatchEvent(new Event('crm:prospects-updated'));
  try {
    const { prospect: saved } = await api.patch(`/prospects/${prospect.id}`, prospect);
    cache = cache.map((p) => (p.id === saved.id ? saved : p));
    window.dispatchEvent(new Event('crm:prospects-updated'));
    return saved;
  } catch (err) {
    console.error('saveProspect failed:', err);
    hydrateProspects().catch(() => {});
    alert(err?.message?.includes('permission')
      ? err.message
      : 'Could not save the prospect — the server rejected the request. Please try again.');
    throw err;
  }
}

// Removes ONE prospect (Admin only, enforced server-side).
export async function deleteProspect(id) {
  const before = cache;
  cache = cache.filter((p) => p.id !== id);
  window.dispatchEvent(new Event('crm:prospects-updated'));
  try {
    await api.del(`/prospects/${id}`);
  } catch (err) {
    console.error('deleteProspect failed:', err);
    cache = before; // restore — the delete didn't actually happen
    window.dispatchEvent(new Event('crm:prospects-updated'));
    alert('Could not delete the prospect — the server rejected the request. Please try again.');
    throw err;
  }
}

// Creates one or a few new prospects (a "Create Prospect" confirm can produce
// several at once — one per proposal type selected — but that count is
// always bounded by what's on screen, never by how many prospects already
// exist). Returns the merged cache.
export const addProspects = (newOnes) => {
  cache = [...newOnes, ...cache];
  window.dispatchEvent(new Event('crm:prospects-updated'));
  api.post('/prospects', { prospects: newOnes })
    .then(({ prospects: created } = {}) => {
      const createdById = new Map((Array.isArray(created) ? created : []).map((p) => [p.id, p]));
      cache = cache.map((p) => createdById.get(p.id) || p);
      window.dispatchEvent(new Event('crm:prospects-updated'));
    })
    .catch((err) => {
      console.error('addProspects failed:', err);
      hydrateProspects().catch(() => {});
      alert('Could not save the new prospect — the server rejected the request. Please try again.');
    });
  return cache;
};

export const CATEGORY_THEME = {
  investment: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  insurance: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  othercode: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40',
};

// Human-readable label for a prospect's category badge.
export const CATEGORY_LABEL = {
  investment: 'Investment',
  insurance: 'Insurance',
  othercode: 'Other Code',
};

// Lifecycle stages for a business prospect — Investment prospects use the generic
// pipeline; Insurance prospects use their own underwriting-shaped pipeline.
// "Pre-Qualified" is the entry stage for a new investment prospect — visible
// only to that prospect's own assigned RM/Portfolio Manager (see the server's
// permissions.js) until the RM moves it to "Qualified", at which point it
// opens up to everyone (Service Manager included) same as any other stage.
export const PROSPECT_STAGES = ['Pre-Qualified', 'Qualified', 'Work Executed', 'Close Won', 'Close Lost'];

export const INSURANCE_PROSPECT_STAGES = [
  'Qualified',
  'Document Pending',
  'Proposal Submitted',
  'Payment Done',
  'Waiting for Underwriter',
  'Policy Issued',
  'Policy Rejected',
];

export const PROSPECT_STAGE_THEME = {
  'Pre-Qualified': 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  'Qualified': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'Work Executed': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  'Close Won': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Close Lost': 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

export const INSURANCE_PROSPECT_STAGE_THEME = {
  'Qualified': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'Document Pending': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  'Proposal Submitted': 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  'Payment Done': 'bg-cyan-50 text-cyan-700 ring-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-900/40',
  'Waiting for Underwriter': 'bg-orange-50 text-orange-700 ring-orange-200/60 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-900/40',
  'Policy Issued': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Policy Rejected': 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

// Combined lookups for rendering a stage badge / filter chips regardless of
// which pipeline (investment or insurance) a given prospect belongs to.
export const ALL_STAGE_THEME = { ...PROSPECT_STAGE_THEME, ...INSURANCE_PROSPECT_STAGE_THEME };
export const ALL_PROSPECT_STAGES = [
  'Pre-Qualified',
  'Qualified',
  'Document Pending',
  'Proposal Submitted',
  'Payment Done',
  'Waiting for Underwriter',
  'Policy Issued',
  'Policy Rejected',
  'Work Executed',
  'Close Won',
  'Close Lost',
];

export const fmtProspectStamp = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const fmtAmountINR = (val) => {
  const n = Number(String(val ?? '').toString().replace(/,/g, '')) || 0;
  return '₹ ' + n.toLocaleString('en-IN');
};
