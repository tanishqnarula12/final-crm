// Lead Management — data seam, now backed by the CRM API (Postgres) instead
// of localStorage.
//
// THE SEAM: every read/write of leads goes through this module. `loadLeads()`
// stays perfectly SYNCHRONOUS (this file's own business-logic functions —
// intakeLead, updateLead, assignLead, etc. — all call it mid-function, as do
// several components), so it reads from an in-memory cache rather than
// hitting the network. The cache is hydrated once from the API (see
// `hydrateLeads()`, called from App.jsx on login) and every `saveLeads()`
// call updates the cache immediately (so the UI never waits) while
// persisting the full array to the server in the background — the same
// "rewrite the whole list" semantics `localStorage.setItem` used to have.
//
// `intakeLead(payload, source)` is the single entry point every inbound lead
// flows through — manual entry, the website form (Phase 2), and imports.

import { loadTasks, saveTasks } from '../utils/tasks';
import { uid } from '../utils/calc';
import { api } from './api';

// --- Domain constants -------------------------------------------------------
// Workflow: Created → forwarded to Internal Manager (Waiting for Assignment) →
// assign RM (+others) → Qualified (Initial Call task) → Initial Call Won →
// Connected → Schedule Meeting → Meeting Pending → Meeting Done →
// Convert to Client (opens the New Client form; client saved Inactive).
export const LEAD_STAGES = [
  'Waiting for Assignment', 'Qualified', 'Connected', 'Meeting Pending',
  'Meeting Done', 'Converted',
];

export const LEAD_STATUSES = ['Active', 'Lost', 'Dormant', 'Junk'];

export const LEAD_SOURCES = ['Website', 'Referred By Client', 'Referred By Users'];

export const CLIENT_TYPES = ['Retail', 'HNI', 'Ultra HNI'];

// "Related To" — the subject of inquiry. Mirrors the website contact form's
// dropdown; auto-picked from the website submission, editable in the CRM.
export const RELATED_TO_OPTIONS = [
  'Wealth Creation',
  'Retirement Planning',
  'Tax Optimization',
  'Investment Planning',
  'Insurance Planning',
  'Risk Mitigation',
  'Estate Planning',
  'Asset Management',
  'General Support',
];

export const LOST_REASONS = [
  'Not Interested', 'Budget Constraints', 'Chose Competitor',
  'Unreachable', 'Wrong Number', 'Duplicate', 'Other',
];

export const FOLLOWUP_TYPES = ['Call', 'WhatsApp', 'Email', 'Physical Meeting', 'Reminder'];

// Allowed forward transitions (the lifecycle matrix). Lost/Dormant/Junk are
// modelled as `status` and can be applied from any active stage.
const NEXT_STAGE = {
  'Waiting for Assignment': ['Qualified'],
  'Qualified': ['Connected'],
  'Connected': ['Meeting Pending'],
  'Meeting Pending': ['Meeting Done'],
  'Meeting Done': ['Converted'],
  'Converted': [],
};
export const nextStages = (stage) => NEXT_STAGE[stage] || [];

// --- Themes (badge styling, matches the rest of the CRM) --------------------
export const STAGE_THEME = {
  'Waiting for Assignment': 'bg-slate-50 text-slate-700 ring-slate-200/60 dark:bg-slate-800/40 dark:text-slate-300 dark:ring-slate-700/50',
  'Qualified': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'Connected': 'bg-cyan-50 text-cyan-700 ring-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-900/40',
  'Meeting Pending': 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  'Meeting Done': 'bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40',
  'Converted': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
};

export const STATUS_THEME = {
  'Active': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Lost': 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
  'Dormant': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  'Junk': 'bg-slate-100 text-slate-500 ring-slate-200/60 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700/50',
};

export const SOURCE_THEME = {
  'Website': 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'Referred By Client': 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  'Referred By Users': 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
};

// --- Storage ----------------------------------------------------------------
// Map any legacy stage names (from before the lifecycle rework) onto the
// current pipeline so existing leads don't get stuck with no available action.
const LEGACY_STAGE_MAP = {
  'New': 'Waiting for Assignment',
  'Meeting Scheduled': 'Meeting Pending',
  'Draft MOM': 'Meeting Done',
  'MOM Sent': 'Meeting Done',
  'Send MOM': 'Meeting Done',
};
const migrateLead = (l) => {
  const stage = LEGACY_STAGE_MAP[l.stage] || l.stage;
  // Normalize a couple of shape changes too (relatedTo string → array — a lead
  // can now be interested in more than one thing, e.g. both Investment & Insurance).
  const relatedTo = Array.isArray(l.relatedTo) ? l.relatedTo : (l.relatedTo ? [l.relatedTo] : []);
  return (stage !== l.stage || relatedTo !== l.relatedTo) ? { ...l, stage, relatedTo } : l;
};

let cache = [];

// Synchronous — reads the in-memory cache. See the module header for why.
export const loadLeads = () => cache;

// Fetches every lead from the server and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads leads.
export async function hydrateLeads() {
  const { leads } = await api.get('/leads');
  cache = Array.isArray(leads) ? leads.map(migrateLead) : [];
  window.dispatchEvent(new Event('crm:leads-updated'));
  return cache;
}

export const saveLeads = (leads) => {
  cache = leads;
  window.dispatchEvent(new Event('crm:leads-updated'));
  // The server validates every change (RBAC) and returns the authoritative
  // list; reconcile so any rejected edit reverts in the UI — and tell the user
  // when that happens, so a blocked change (e.g. a delete only Admin can do)
  // doesn't just silently "not stick" with no explanation.
  api.put('/leads', { leads })
    .then((res) => {
      if (Array.isArray(res?.leads)) {
        cache = res.leads;
        window.dispatchEvent(new Event('crm:leads-updated'));
      }
      if (res?.stats?.rejected > 0) {
        window.dispatchEvent(new CustomEvent('crm:leads-sync-warning', {
          detail: { message: `${res.stats.rejected} change${res.stats.rejected === 1 ? '' : 's'} could not be saved — you may not have permission. The list has been refreshed.` },
        }));
      }
    })
    .catch((err) => {
      console.error('Failed to persist leads:', err);
      // Roll back to the server's actual state so the UI never shows a
      // change (e.g. "deleted") that didn't really happen.
      hydrateLeads().catch(() => {});
      window.dispatchEvent(new CustomEvent('crm:leads-sync-warning', {
        detail: { message: 'Your change could not be saved. The list has been refreshed.' },
      }));
    });
};

// --- Helpers ----------------------------------------------------------------
export const fmtStamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const leadName = (l) => (l.name || `${l.firstName || ''} ${l.lastName || ''}`).trim() || 'Unnamed Lead';

const normalizeMobile = (m) => (m || '').replace(/[^0-9]/g, '').slice(-10);

// 0–100 lead score: source weight + client type + engagement + recency.
export const computeScore = (lead) => {
  let s = 0;
  const srcW = { 'Referred By Client': 26, 'Referred By Users': 22, 'Website': 16 };
  s += srcW[lead.leadSource] || 12;
  const typeW = { 'Ultra HNI': 30, 'HNI': 22, 'Retail': 12 };
  s += typeW[lead.clientType] || 12;
  if (lead.email) s += 8;
  if (lead.mobile) s += 6;
  if (Array.isArray(lead.relatedTo) ? lead.relatedTo.length : lead.relatedTo) s += 8;
  const stageW = { 'Waiting for Assignment': 0, 'Qualified': 6, 'Connected': 12, 'Meeting Pending': 16, 'Meeting Done': 22, 'Converted': 25 };
  s += stageW[lead.stage] || 0;
  return Math.max(0, Math.min(100, Math.round(s)));
};

export const scoreBand = (score) => (score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold');

const activity = (type, action, description, meta = {}, actor = 'System', source = 'system') => ({
  id: uid(), type, action, description, meta, actor, source, createdAt: new Date().toISOString(),
});

// --- Core operations --------------------------------------------------------

// THE single intake entry point. Normalizes a raw payload (manual / website /
// import) into a lead, dedupes by mobile, auto-assigns, scores, logs, persists,
// and fires events (`crm:lead-received` is what the UI listens to for realtime).
export function intakeLead(payload = {}, source = 'Manual Entry', actor = 'System') {
  const leads = loadLeads();
  const mob = normalizeMobile(payload.mobile);

  // Duplicate detection by normalized mobile (active, non-archived).
  if (mob) {
    const dupe = leads.find(l => normalizeMobile(l.mobile) === mob && !l.archivedAt);
    if (dupe) {
      return { duplicate: true, lead: dupe };
    }
  }

  const now = new Date().toISOString();
  const base = {
    id: uid(),
    name: payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
    mobile: payload.mobile || '',
    email: payload.email || '',
    city: payload.city || '',
    relatedTo: Array.isArray(payload.relatedTo) ? payload.relatedTo : (payload.relatedTo ? [payload.relatedTo] : []),
    leadSource: source,
    // Referral context (only populated for the matching source)
    referredClientId: payload.referredClientId || '',
    referredClientName: payload.referredClientName || '',
    referredClientPan: payload.referredClientPan || '',
    referredUser: payload.referredUser || '',
    clientType: payload.clientType || 'Retail',
    remarks: payload.remarks || payload.message || payload.subject || '',
    stage: 'Waiting for Assignment',
    status: 'Active',
    lostReason: '',
    ownerId: payload.ownerId || '',
    contributors: Array.isArray(payload.contributors) ? payload.contributors : [],
    notes: [],
    followups: [],
    timeline: [],
    clientId: null,
    leadScore: 0,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
  };
  base.leadScore = computeScore(base);
  base.timeline = [
    activity('LEAD_CREATED', 'Lead created', `Lead captured from ${source}.`, { source }, actor, source === 'Website' ? 'website' : 'manual'),
    activity('FORWARDED', 'Forwarded to Internal Manager', 'Awaiting RM assignment by the Internal Manager.', {}, 'System'),
  ];

  const updated = [base, ...leads];
  saveLeads(updated);
  // Realtime signal — UI prepends + toasts, same pattern as prospects/meetings.
  window.dispatchEvent(new CustomEvent('crm:lead-received', { detail: { lead: base } }));
  return { duplicate: false, lead: base };
}

// Patch a lead and auto-log meaningful changes (stage / status / owner) to the
// timeline. Also runs Phase-1 automations on stage transitions.
export function updateLead(id, patch = {}, actor = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  const prev = leads[idx];
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };

  const events = [];
  if (patch.stage && patch.stage !== prev.stage) {
    events.push(activity('STAGE_CHANGED', 'Stage changed', `Stage moved from ${prev.stage} to ${patch.stage}.`, { from: prev.stage, to: patch.stage }, actor));
  }
  if (patch.status && patch.status !== prev.status) {
    events.push(activity('STATUS_CHANGED', 'Status changed', `Status set to ${patch.status}${patch.lostReason ? ` — ${patch.lostReason}` : ''}.`, { from: prev.status, to: patch.status }, actor));
  }
  if (patch.ownerId && patch.ownerId !== prev.ownerId) {
    events.push(activity('OWNER_CHANGED', 'Owner changed', `Owner changed from ${prev.ownerId || '—'} to ${patch.ownerId}.`, { from: prev.ownerId, to: patch.ownerId }, actor));
  }
  next.leadScore = computeScore(next);
  if (events.length) next.timeline = [...events, ...(prev.timeline || [])];

  leads[idx] = next;
  saveLeads(leads);
  return next;
}

// Internal Manager assigns an RM (+ optional others) → lead becomes Qualified
// and an "Initial Call" task is auto-created in the Tasks module for the RM.
export function assignLead(id, { ownerId, contributors = [] }, actor = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1 || !ownerId) return null;
  const lead = leads[idx];
  const now = new Date().toISOString();

  lead.ownerId = ownerId;
  // RBAC ownership: the assigned RM's account id. The server only accepts this
  // change from an Admin (leads assignOnEdit = 'admin'), matching the rule that
  // only Admin assigns the RM; ownership then shifts to that account.
  lead.assignedTo = ownerId;
  lead.contributors = contributors;
  lead.stage = 'Qualified';
  lead.updatedAt = now;
  lead.timeline = [
    activity('STAGE_CHANGED', 'Stage changed', 'Stage moved from Waiting for Assignment to Qualified.', { from: 'Waiting for Assignment', to: 'Qualified' }, actor),
    activity('LEAD_ASSIGNED', 'Lead assigned', `RM set to ${ownerId}${contributors.length ? `; others: ${contributors.join(', ')}` : ''}. Initial Call task created.`, { to: ownerId, contributors }, actor),
    ...(lead.timeline || []),
  ];
  lead.leadScore = computeScore(lead);
  leads[idx] = lead;
  saveLeads(leads);

  // Auto-create the Initial Call task for the RM (carries leadId so completing
  // it advances the lead to Connected).
  const tasks = loadTasks();
  if (!tasks.some(t => t.leadId === id && t.otherSpecify === 'Initial Call')) {
    tasks.unshift({
      id: uid(), leadId: id,
      taskName: `${leadName(lead)} - Initial Call`,
      stage: 'Open', groupLeader: leadName(lead), applicant: leadName(lead),
      pan: '', relatedTo: 'Others', otherSpecify: 'Initial Call', amcs: [],
      assignedBy: actor, assignedTo: ownerId, dueDate: '',
      description: `Initial Call for ${leadName(lead)} (${lead.mobile}). Marking this task Completed moves the lead to Connected.`,
      comments: [], createdAt: now, updatedAt: now,
    });
    saveTasks(tasks);
  }
  return lead;
}

// Hook: called when the lead's Initial Call task is marked Completed (Won).
// Advances Qualified → Connected and logs the remark.
export function markConnectedFromTask(leadId, remark = '', actor = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === leadId);
  if (idx === -1) return null;
  const lead = leads[idx];
  if (lead.stage !== 'Qualified') return lead; // only the right transition
  lead.stage = 'Connected';
  lead.updatedAt = new Date().toISOString();
  lead.timeline = [
    activity('STAGE_CHANGED', 'Stage changed', 'Initial Call completed (Won) — moved to Connected.', { from: 'Qualified', to: 'Connected' }, actor),
    ...(remark ? [activity('REMARK_ADDED', 'Initial Call remark', remark, {}, actor)] : []),
    ...(lead.timeline || []),
  ];
  lead.leadScore = computeScore(lead);
  leads[idx] = lead;
  saveLeads(leads);
  return lead;
}

// Mark the lead's Initial Call task as Won (Completed) from inside the lead —
// completes the task in the Tasks module AND advances the lead to Connected.
export function winInitialCall(leadId, remark = '', actor = 'System') {
  const tasks = loadTasks();
  let changed = false;
  const updatedTasks = tasks.map(t => {
    if (t.leadId === leadId && t.otherSpecify === 'Initial Call' && t.stage !== 'Completed') {
      changed = true;
      return {
        ...t, stage: 'Completed', updatedAt: new Date().toISOString(),
        comments: [...(t.comments || []), { at: new Date().toISOString(), text: `Won — ${remark || 'Initial call completed'}` }],
      };
    }
    return t;
  });
  if (changed) saveTasks(updatedTasks);
  return markConnectedFromTask(leadId, remark, actor);
}

// Hook: called when a lead-linked meeting is scheduled / completed.
export function syncMeetingToLead(leadId, action, meta = {}, actor = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === leadId);
  if (idx === -1) return null;
  const lead = leads[idx];
  let event = null;
  if (action === 'scheduled' && (lead.stage === 'Connected' || lead.stage === 'Meeting Pending')) {
    lead.stage = 'Meeting Pending';
    event = activity('MEETING_SCHEDULED', 'Meeting scheduled', `${meta.mode || ''} meeting set for ${meta.when || ''}.`, meta, actor);
  } else if (action === 'completed' && lead.stage === 'Meeting Pending') {
    lead.stage = 'Meeting Done';
    event = activity('MEETING_COMPLETED', 'Meeting done', 'Meeting marked as done — moved to Meeting Done.', meta, actor);
  }
  if (event) {
    lead.updatedAt = new Date().toISOString();
    lead.timeline = [event, ...(lead.timeline || [])];
    lead.leadScore = computeScore(lead);
    leads[idx] = lead;
    saveLeads(leads);
  }
  return lead;
}

export function addNote(id, text, author = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1 || !text.trim()) return null;
  const lead = leads[idx];
  const note = { id: uid(), text: text.trim(), author, createdAt: new Date().toISOString() };
  lead.notes = [note, ...(lead.notes || [])];
  lead.timeline = [activity('REMARK_ADDED', 'Remark added', text.trim(), {}, author), ...(lead.timeline || [])];
  lead.updatedAt = new Date().toISOString();
  saveLeads(leads);
  return lead;
}

export function addFollowUp(id, fu, author = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  const lead = leads[idx];
  const rec = { id: uid(), type: fu.type, dueAt: fu.dueAt, priority: fu.priority || 'Medium', status: 'Pending', outcome: '', createdAt: new Date().toISOString() };
  lead.followups = [rec, ...(lead.followups || [])];
  lead.nextFollowUpAt = fu.dueAt;
  lead.timeline = [activity('FOLLOWUP_SCHEDULED', 'Follow-up scheduled', `${fu.type} follow-up scheduled for ${fmtStamp(fu.dueAt)}.`, {}, author), ...(lead.timeline || [])];
  lead.updatedAt = new Date().toISOString();
  saveLeads(leads);
  return lead;
}

export function completeFollowUp(id, fuId, outcome, author = 'System') {
  const leads = loadLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  const lead = leads[idx];
  lead.followups = (lead.followups || []).map(f => f.id === fuId ? { ...f, status: 'Done', outcome, completedAt: new Date().toISOString() } : f);
  lead.timeline = [activity('FOLLOWUP_COMPLETED', 'Follow-up completed', outcome ? `Outcome: ${outcome}` : 'Follow-up completed.', {}, author), ...(lead.timeline || [])];
  lead.updatedAt = new Date().toISOString();
  saveLeads(leads);
  return lead;
}

export function deleteLead(id) {
  saveLeads(loadLeads().filter(l => l.id !== id));
}

// Build the Client (Group Leader) payload from a lead (used at conversion).
// The actual client write happens in App (where loadData lives), then the lead
// is stamped Converted + clientId via updateLead.
export function clientPayloadFromLead(lead) {
  return {
    name: leadName(lead),
    pan: '',
    age: 0,
    clientDetails: {
      mobile: lead.mobile || '',
      email: lead.email || '',
      clientType: lead.clientType || 'Retail',
      city: lead.city || '',
      country: 'India',
      relationshipManager: lead.ownerId || '',
      status: 'Inactive',
      leadId: lead.id,
      familyDetails: [],
    },
  };
}
