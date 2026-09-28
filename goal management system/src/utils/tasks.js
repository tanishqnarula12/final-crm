// Task management — backed by the CRM API (Postgres).
//
// Same "in-memory cache hydrated from the API" seam as services/leads.js:
// `loadTasks()` stays synchronous (components and services/leads.js itself
// call it mid-function), and `saveTasks()` updates the cache immediately
// while persisting the whole array to the server in the background — the
// same "rewrite the whole list" semantic `localStorage.setItem` used to have.

import { api } from '../services/api';
import { createListSync } from '../services/listSync';

let cache = [];
// Tasks come "slim": each attachment (Renewal / Claim / FD / Other-Policy
// records keep their files here) has its details but not its file, marked
// `fileStripped: true` — the files were ~97% of the list (9.7 MB, Sep 2026).
// A file is fetched when someone opens it (services/clientFiles.js
// fetchTaskFiles). Saving a slim task back is safe: the server re-joins every
// attachment with its stored file.
const sync = createListSync('/tasks?slim=1', 'tasks');

const hasSlimAttachments = (t) => [t?.attachments, ...(Array.isArray(t?.stageHistory) ? t.stageHistory.map((h) => h?.attachments) : [])]
  .some((list) => Array.isArray(list) && list.some((a) => a?.fileStripped === true));

export const loadTasks = () => cache;

// Fetches the tasks from the server (only if they changed since the last
// fetch — see services/listSync) and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads tasks.
export async function hydrateTasks(opts) {
  const tasks = await sync.fetch({ force: !!opts?.force });
  if (!tasks) return cache;
  cache = tasks;
  window.dispatchEvent(new Event('crm:tasks-updated'));
  return cache;
}

// CLOSED tasks (Completed/Lost) for one client, visible to ANYONE who can view
// that client — not just the task participants. Used by the Client Profile's
// "Closed Activities" so completed work is transparent to the whole team,
// while open/in-progress tasks stay confidential (those come from the normal
// RBAC-filtered cache above). Not cached — fetched per profile open.
export async function fetchClosedTasksForClient(clientId) {
  if (!clientId) return [];
  try {
    const { tasks } = await api.get(`/tasks/closed-for-client/${clientId}?slim=1`);
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return []; // client not viewable / server hiccup — show nothing extra
  }
}

// Merges the server's answer to a partial save into the cache: the touched
// tasks as actually stored (a rejected edit comes back as the stored version,
// so it reverts), minus any that are gone or no longer visible.
const mergeSaved = (saved = [], removedIds = []) => {
  const removed = new Set(removedIds);
  const byId = new Map(saved.map((t) => [t.id, t]));
  const next = cache.filter((t) => !removed.has(t.id)).map((t) => byId.get(t.id) || t);
  const known = new Set(next.map((t) => t.id));
  const added = saved.filter((t) => !known.has(t.id)); // e.g. a delete the server refused
  cache = added.length ? [...added, ...next] : next;
};

// Callers hand over the whole updated list (the old "rewrite the list"
// contract), but only what actually differs from the cache is sent: the
// changed/new tasks and the ids of removed ones (PATCH /tasks). Sending the
// full list meant every one-task edit uploaded and re-downloaded every task
// with its attachments (~9 MB in Sep 2026). A server without PATCH (404)
// gets the whole list via PUT, exactly as before.
export const saveTasks = (tasks) => {
  const before = cache;
  const beforeById = new Map(before.map((t) => [t.id, t]));
  const nextIds = new Set(tasks.map((t) => t.id));
  const changed = tasks.filter((t) => beforeById.get(t.id) !== t);
  const deletedIds = before.filter((t) => !nextIds.has(t.id)).map((t) => t.id);

  cache = tasks;
  window.dispatchEvent(new Event('crm:tasks-updated'));
  if (!changed.length && !deletedIds.length) return;

  const done = sync.beginWrite();
  // The server validates every change (RBAC) and returns the authoritative
  // version; reconcile so any rejected edit reverts in the UI — and tell the
  // user when that happens, so a blocked change doesn't just silently "not
  // stick" with no explanation (e.g. an assignee trying to edit task
  // details, or moving a stage backward).
  api.patch('/tasks?slim=1', { tasks: changed, deletedIds })
    .catch((err) => {
      // The whole-list fallback is for a server without PATCH — which also
      // never sends slim tasks. If this list is slim, that server can't
      // re-join the files, so never send it there.
      if ((err?.status === 404 || err?.status === 405) && !tasks.some(hasSlimAttachments)) return api.put('/tasks', { tasks });
      throw err;
    })
    .finally(done)
    .then((res) => {
      if (Array.isArray(res?.removedIds)) {
        mergeSaved(res.tasks, res.removedIds);
        window.dispatchEvent(new Event('crm:tasks-updated'));
      } else if (Array.isArray(res?.tasks)) {
        cache = res.tasks;
        window.dispatchEvent(new Event('crm:tasks-updated'));
      }
      if (res?.stats?.rejected > 0) {
        window.dispatchEvent(new CustomEvent('crm:tasks-sync-warning', {
          detail: { message: `${res.stats.rejected} change${res.stats.rejected === 1 ? '' : 's'} could not be saved — you may not have permission. The list has been refreshed.` },
        }));
      }
    })
    .catch((err) => {
      console.error('Failed to persist tasks:', err);
      hydrateTasks({ force: true }).catch(() => {});
      window.dispatchEvent(new CustomEvent('crm:tasks-sync-warning', {
        detail: { message: 'Your change could not be saved. The list has been refreshed.' },
      }));
    });
};

export const TASK_STAGES = [
  'Open',
  'Waiting For Client',
  'In Process',
  'Completed',
  'Lost',
];

// Sub-people on a task/COBR record: the extra participants beyond the assigner
// and assignee, each of whom may add comments/logs (but not change the stage).
// Stored as the `subPersons` ARRAY; records created before multi-select carry a
// single `subPerson` string instead, so both shapes are read here — and both
// are written on save (see the modals), which keeps a browser still running an
// older bundle working. Mirrors taskSubPersons() in the permission engines.
export const readSubPersons = (t) => {
  if (Array.isArray(t?.subPersons)) return t.subPersons.filter(Boolean);
  return t?.subPerson ? [t.subPerson] : [];
};

// Visual theme per stage (badge colours)
export const STAGE_THEME = {
  'Open': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'In Process': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  'Waiting For Client': 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  'Completed': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Lost': 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

// "Related to" top-level options
export const RELATED_OPTIONS = ['NFT', 'Others'];

// NFT (Non-Financial Transaction) types — shown when "Related to" = NFT
export const NFT_TYPES = [
  'NSE Bank Addition',
  'Change of Bank',
  'Change of Broker',
  'Change of Contact Details',
  'Change of Name',
  'Change of Tax Status',
  'Folio Consolidation',
  'KYC - Private Limited',
  'KYC - HUF',
  'KYC - Individual (RI)',
  'KYC - NRI',
  'KYC - Trust',
  'KYC - Partnership',
  'KYC Modification',
  'Minor to Major',
  'New PAN Application',
  'PAN Card Updations',
  'PAN, KYC & FATCA Updation',
  'FATCA Updation',
  'IIN, Mandate and FATCA Creation',
  'Mandate Creation',
  'Unit Transmission',
  'Change of IFSC',
  'Nominee Updation',
  'DOB Updation',
  'SIP Consolidation',
  'SIP Cancellation',
  'SIP Registration',
];

// AMC list — multi-select shown when "Related to" = NFT
export const AMC_LIST = [
  'Kotak', 'HDFC', 'ICICI', 'AXIS', 'TATA', 'Franklin', 'SBI', 'UTI',
  'Sundaram', 'Aditya Birla', 'Nippon', 'Bandhan', 'PGIM', 'DSP', 'PPFS',
  'Quant', 'Canara', 'LIC', 'Mahindra', 'Motilal Oswal', 'Mirae',
  'Baroda BNP', 'INVESCO', 'WhiteOak', 'HSBC',
];

export const fmtTaskStamp = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
