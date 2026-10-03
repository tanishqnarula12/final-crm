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
import { createListSync } from '../services/listSync';

let cache = [];
const sync = createListSync('/prospects', 'prospects');

export const loadProspects = () => cache;

// Fetches the prospects from the server (only if they changed since the last
// fetch — see services/listSync) and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads prospects,
// or as a recovery step after a write fails (see the .catch()s below).
export async function hydrateProspects(opts) {
  const prospects = await sync.fetch({ force: !!opts?.force });
  if (!prospects) return cache;
  cache = prospects;
  window.dispatchEvent(new Event('crm:prospects-updated'));
  return cache;
}

// Persists an edit (a detail change, a stage move, or both together) to ONE
// existing prospect. Updates the cache optimistically, then reconciles to
// whatever the server actually applied — the server may only grant PART of
// what was asked (e.g. a stage move an actor is allowed to make, saved
// alongside a detail edit they aren't), so the response is the record's real
// resulting state, not necessarily an echo of what was sent. The write guard
// keeps a background refresh that was already in flight from briefly putting
// the old stage back on screen.
export async function saveProspect(prospect) {
  const done = sync.beginWrite();
  cache = cache.map((p) => (p.id === prospect.id ? prospect : p));
  window.dispatchEvent(new Event('crm:prospects-updated'));
  try {
    const { prospect: saved } = await api.patch(`/prospects/${prospect.id}`, prospect);
    cache = cache.map((p) => (p.id === saved.id ? saved : p));
    window.dispatchEvent(new Event('crm:prospects-updated'));
    return saved;
  } catch (err) {
    console.error('saveProspect failed:', err);
    done();
    hydrateProspects({ force: true }).catch(() => {});
    alert(err?.message?.includes('permission')
      ? err.message
      : 'Could not save the prospect — the server rejected the request. Please try again.');
    throw err;
  } finally {
    done();
  }
}

// Removes ONE prospect (Admin only, enforced server-side).
export async function deleteProspect(id) {
  const done = sync.beginWrite();
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
  } finally {
    done();
  }
}

// Creates one or a few new prospects (a "Create Prospect" confirm can produce
// several at once — one per proposal type selected — but that count is
// always bounded by what's on screen, never by how many prospects already
// exist). Returns the merged cache.
export const addProspects = (newOnes) => {
  const done = sync.beginWrite();
  cache = [...newOnes, ...cache];
  window.dispatchEvent(new Event('crm:prospects-updated'));
  api.post('/prospects', { prospects: newOnes })
    .finally(done)
    .then(({ prospects: created, rejectedIds } = {}) => {
      const createdById = new Map((Array.isArray(created) ? created : []).map((p) => [p.id, p]));
      // Prospects the server refused never got saved — drop them now and say
      // so, instead of showing them until the next refresh quietly removes them.
      const rejected = new Set(Array.isArray(rejectedIds) ? rejectedIds : []);
      cache = cache.filter((p) => !rejected.has(p.id)).map((p) => createdById.get(p.id) || p);
      window.dispatchEvent(new Event('crm:prospects-updated'));
      if (rejected.size) {
        alert(`${rejected.size === 1 ? 'A prospect was' : `${rejected.size} prospects were`} not created — you don't have permission to create this kind of prospect for this client.`);
      }
    })
    .catch((err) => {
      console.error('addProspects failed:', err);
      hydrateProspects({ force: true }).catch(() => {});
      alert('Could not save the new prospect — the server rejected the request. Please try again.');
    });
  return cache;
};

// "Is this prospect already created?" — asked before Create Prospect saves,
// so an accidental second click can't quietly make the same prospect twice.
// Same client, applicant, proposal type and amount counts as the same
// prospect. Checked against this screen's list (which already holds one that
// is being saved this very moment) and against the server, which also sees
// prospects this user can't open (an investment prospect in Pre-Qualified is
// visible only to its RM / Portfolio Manager). Returns
// [{ draft, matches: [{ id, proposalType, applicant, amount, createdAt, stage }] }]
// for the drafts that match; never throws — if the server can't be asked,
// the local list alone decides.
const normText = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const amountOf = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
const sameClient = (a, b) => (a.groupLeaderId && b.groupLeaderId
  ? String(a.groupLeaderId) === String(b.groupLeaderId)
  : normText(a.groupLeader) === normText(b.groupLeader));
const sameProspect = (a, b) => normText(a.applicant) === normText(b.applicant)
  && (a.proposalCategory || '') === (b.proposalCategory || '')
  && normText(a.proposalType) === normText(b.proposalType)
  && amountOf(a.amount) === amountOf(b.amount);

export async function findDuplicateProspects(drafts) {
  const byDraft = new Map(drafts.map((d) => [d.id, new Map()]));
  drafts.forEach((d) => {
    cache.filter((p) => p.id !== d.id && sameClient(p, d) && sameProspect(p, d)).forEach((p) => {
      byDraft.get(d.id).set(p.id, {
        id: p.id, proposalType: p.proposalType || '', applicant: p.applicant || '',
        amount: p.amount ?? '', createdAt: p.createdAt || '', stage: p.stage || '',
      });
    });
  });
  try {
    // Only what the check (and the server's may-create test) needs — not the
    // proposal table, KYC or documents.
    const FIELDS = ['id', 'groupLeaderId', 'groupLeader', 'applicant', 'pan', 'proposalCategory', 'proposalType', 'amount',
      'relationshipManager', 'portfolioManager', 'serviceManager', 'insuranceManager', 'owner', 'internalManager'];
    const slim = drafts.map((d) => Object.fromEntries(FIELDS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])));
    const { duplicates } = await api.post('/prospects/duplicates', { prospects: slim });
    (Array.isArray(duplicates) ? duplicates : []).forEach(({ id, matches }) => {
      const found = byDraft.get(id);
      if (!found) return;
      (matches || []).forEach((m) => { if (!found.has(m.id)) found.set(m.id, m); });
    });
  } catch {
    // Older server (no /duplicates yet) or offline — the local list decides.
  }
  return drafts
    .map((d) => ({ draft: d, matches: [...byDraft.get(d.id).values()] }))
    .filter((x) => x.matches.length);
}

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
