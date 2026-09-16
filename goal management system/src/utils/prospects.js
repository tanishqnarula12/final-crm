// Business Prospects — backed by the CRM API (Postgres).
// Prospects are generated from the Proposals page ("Create Prospect"): each
// selected proposal (Investment sub-type or Insurance type) becomes one prospect
// carrying the generated proposal table, amount and the client's coverage team.
//
// Same "in-memory cache hydrated from the API" seam as tasks/leads/meetings:
// `loadProspects()` stays synchronous, `saveProspects()` updates the cache
// immediately and persists the whole array to the server in the background.
// Prospects can carry large embedded documents (base64), which is exactly why
// this used to hit the localStorage ~5MB quota — moving to Postgres removes
// that ceiling entirely.

import { api } from '../services/api';

let cache = [];

export const loadProspects = () => cache;

// Fetches every prospect from the server and populates the cache. Call once
// on login/app-load (App.jsx `loadData`) before any component reads prospects.
export async function hydrateProspects() {
  const { prospects } = await api.get('/prospects');
  cache = Array.isArray(prospects) ? prospects : [];
  window.dispatchEvent(new Event('crm:prospects-updated'));
  return cache;
}

export const saveProspects = (prospects) => {
  // Every caller (persist a single edit, addProspects a new create, a
  // Client-Profile-driven update) builds its "next" array by copying the
  // FULL previous list and changing only the record(s) it actually means to
  // touch — so `before` (this tab's own cache, one line up) still lines up
  // 1:1 with everything in `prospects` this tab did NOT just edit.
  const before = cache;
  cache = prospects;
  window.dispatchEvent(new Event('crm:prospects-updated'));
  const beforeById = new Map(before.map((p) => [p.id, p]));
  // This tab's cache only refreshes on login, an explicit re-hydrate, or a
  // PROSPECT_ASSIGNED notification — a stage move by someone else (no
  // reassignment involved) never reaches an open tab. Blindly PUTting the
  // full array would then resend THIS tab's stale copy of every prospect it
  // never touched, and the server — seeing a real, authorized change —
  // silently reverts whoever else's more recent edit, mis-attributed to
  // whoever happened to save next (e.g. creating an unrelated prospect from
  // a proposal). So: re-fetch live state first, and for every record this
  // tab did NOT itself just change (identical to what `before` already had),
  // ship the server's current value instead of this tab's possibly-stale one
  // — only this tab's own real, intended edits ever get sent as-is.
  api.get('/prospects')
    .then(({ prospects: fresh } = {}) => {
      const freshById = new Map((Array.isArray(fresh) ? fresh : []).map((p) => [p.id, p]));
      const rebased = prospects.map((p) => {
        const prior = beforeById.get(p.id);
        const touchedByThisTab = !prior || JSON.stringify(prior) !== JSON.stringify(p);
        if (touchedByThisTab) return p;
        return freshById.get(p.id) || p;
      });
      return api.put('/prospects', { prospects: rebased });
    })
    .then((res) => {
      if (Array.isArray(res?.prospects)) {
        cache = res.prospects;
        window.dispatchEvent(new Event('crm:prospects-updated'));
      }
      if (res?.stats?.rejected > 0) {
        alert(`${res.stats.rejected} change${res.stats.rejected === 1 ? '' : 's'} could not be saved — you may not have permission for this prospect type. The list has been refreshed.`);
      }
    })
    .catch((err) => {
      console.error('saveProspects failed:', err);
      hydrateProspects().catch(() => {});
      alert('Could not save the prospect — the server rejected the request. Please try again.');
    });
};

// Append new prospects and persist; returns the merged list.
export const addProspects = (newOnes) => {
  const all = [...newOnes, ...loadProspects()];
  saveProspects(all);
  return all;
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
