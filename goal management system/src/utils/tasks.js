// Task management — backed by the CRM API (Postgres).
//
// Same "in-memory cache hydrated from the API" seam as services/leads.js:
// `loadTasks()` stays synchronous (components and services/leads.js itself
// call it mid-function), and `saveTasks()` updates the cache immediately
// while persisting the whole array to the server in the background — the
// same "rewrite the whole list" semantic `localStorage.setItem` used to have.

import { api } from '../services/api';

let cache = [];

export const loadTasks = () => cache;

// Fetches every task from the server and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads tasks.
export async function hydrateTasks() {
  const { tasks } = await api.get('/tasks');
  cache = Array.isArray(tasks) ? tasks : [];
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
    const { tasks } = await api.get(`/tasks/closed-for-client/${clientId}`);
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return []; // client not viewable / server hiccup — show nothing extra
  }
}

export const saveTasks = (tasks) => {
  cache = tasks;
  window.dispatchEvent(new Event('crm:tasks-updated'));
  // The server validates every change (RBAC) and returns the authoritative
  // list; reconcile so any rejected edit reverts in the UI — and tell the user
  // when that happens, so a blocked change doesn't just silently "not stick"
  // with no explanation (e.g. an assignee trying to edit task details, or
  // moving a stage backward).
  api.put('/tasks', { tasks })
    .then((res) => {
      if (Array.isArray(res?.tasks)) {
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
      hydrateTasks().catch(() => {});
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
