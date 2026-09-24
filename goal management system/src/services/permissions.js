// Client-side mirror of the server RBAC engine (server/src/lib/permissions.js).
//
// Drives UI gating ONLY — the server is the authoritative gate. Fetches the
// admin-configured matrix + catalog once on login (`hydratePermissions`) and
// evaluates `can(module, action, record)` with the same rules: multi-role
// union, contextual RM, scope resolution and the task overlay.

import { api } from './api';
import { getCurrentUser } from '../utils/auth';

let CATALOG = null;
let MATRIX = {}; // MATRIX[module][action][role] = scope

export async function hydratePermissions() {
  try {
    const { catalog, matrix } = await api.get('/permissions');
    CATALOG = catalog;
    MATRIX = matrix || {};
  } catch (err) {
    console.error('Failed to load permission matrix:', err);
  }
  window.dispatchEvent(new Event('crm:permissions-updated'));
  return { CATALOG, MATRIX };
}

export const getCatalog = () => CATALOG;
export const getMatrix = () => MATRIX;
// Let the editor push a freshly-saved matrix so gating updates without a reload.
export const setMatrix = (m) => { MATRIX = m || {}; window.dispatchEvent(new Event('crm:permissions-updated')); };

const RANK = { NONE: 0, ASSIGNED: 1, ALL: 2 };
const ownershipKind = (module) => CATALOG?.ownership?.[module] || 'self';

function cellScope(role, module, action) {
  return MATRIX?.[module]?.[action]?.[role] || 'NONE';
}

// "Is this account the RM of the client this record belongs to?" — checked in
// every shape a 'client'-kind record might carry that info: the Client record
// itself (assignedTo, kept synced with clientDetails.relationshipManager — the
// field the real Client Profile UI actually writes), a joined `.client`, or a
// child record (e.g. a Prospect) that copies `relationshipManager` onto itself
// directly at creation time.
function isClientRm(record, uid) {
  return record.assignedTo === uid
    || record.relationshipManager === uid
    || record?.client?.assignedTo === uid
    || record?.clientDetails?.relationshipManager === uid
    || record?.client?.clientDetails?.relationshipManager === uid;
}

// A prospect carries several parallel assignee fields — relationshipManager,
// portfolioManager, serviceManager (investment) and insuranceManager
// (insurance). isClientRm() above only recognizes the RM, so a Portfolio
// Manager granted ASSIGNED changeStage/editDetails on Investment Prospects
// could never satisfy ownership here — mirrors server/src/lib/permissions.js's
// isProspectAssignee() exactly.
function isProspectAssignee(record, uid) {
  return isClientRm(record, uid)
    || record.portfolioManager === uid
    || record.serviceManager === uid
    || record.insuranceManager === uid;
}

// A task's extra participants (sub-people). Client records ARE the payload, so
// it's read directly; `.payload` fallback keeps it safe either way. Mirrors the
// server: reads the `subPersons` array, falling back to the legacy single
// `subPerson` string on tasks created before multi-select.
function taskSubPersons(record) {
  const list = record?.subPersons ?? record?.payload?.subPersons;
  if (Array.isArray(list)) return list.filter(Boolean);
  const legacy = record?.subPerson ?? record?.payload?.subPerson;
  return legacy ? [legacy] : [];
}

// A meeting's host (assignedTo) and attendees are stored as plain NAME
// strings, not user ids (mirrors server/src/lib/permissions.js exactly — see
// its comment for why). Matched case-insensitively by name.
function isMeetingParticipant(record, user) {
  if (!record) return false;
  if (record.createdBy === user.id) return true;
  const myName = (user.name || '').trim().toLowerCase();
  if (!myName) return false;
  if ((record.assignedTo || '').trim().toLowerCase() === myName) return true;
  const attendees = record.attendees ?? record.payload?.attendees;
  return Array.isArray(attendees) && attendees.some((a) => (a || '').trim().toLowerCase() === myName);
}

// A MOM's writer, or the RM of the client / lead it belongs to — mirrors
// isMomOwner() in the server engine. Pass the MOM with its parent attached as
// `.client` / `.lead` (or the parent itself when creating one).
function isMomOwner(record, uid) {
  return record.createdBy === uid
    || isClientRm(record, uid)
    || record.ownerId === uid
    || record?.lead?.assignedTo === uid
    || record?.lead?.ownerId === uid;
}

const isUnassignedLead = (record) => !record.ownerId && !record.assignedTo;

function ownsRecord(module, record, user) {
  if (!record) return false;
  const uid = user.id;
  const kind = ownershipKind(module);
  if (kind === 'creator') return record.createdBy === uid;
  if (kind === 'mom') return isMomOwner(record, uid);
  // The people on a task: assigner, assignee and any sub-people.
  if (kind === 'task') return record.departmentOwner === uid || record.assignedTo === uid || taskSubPersons(record).includes(uid);
  if (kind === 'meeting') return isMeetingParticipant(record, user);
  if (kind === 'client') return isClientRm(record, uid) || record.createdBy === uid;
  if (kind === 'prospect') return isProspectAssignee(record, uid) || record.createdBy === uid;
  // self (leads): ownerId alongside assignedTo — mirrors the server engine,
  // see its comment. Some leads predate the assignedTo RBAC column, so
  // ownerId (what the UI shows as "RM") is the only reliable signal on them.
  return record.assignedTo === uid || record.ownerId === uid || record.createdBy === uid;
}

function isRmOf(module, record, uid) {
  if (!record) return false;
  const kind = ownershipKind(module);
  if (kind === 'client' || kind === 'prospect') return isClientRm(record, uid);
  if (kind === 'mom') return isClientRm(record, uid) || record.ownerId === uid
    || record?.lead?.assignedTo === uid || record?.lead?.ownerId === uid;
  if (kind === 'task') return false;
  return record.assignedTo === uid || record.ownerId === uid;
}

function rolesFor(user, module, record) {
  const roles = new Set(user.roles || []);
  if (record && isRmOf(module, record, user.id)) roles.add('RM');
  return [...roles];
}

function maxScope(roles, module, action) {
  let best = 'NONE';
  for (const role of roles) {
    const s = cellScope(role, module, action);
    if (RANK[s] > RANK[best]) best = s;
  }
  return best;
}

// Per-module stage vocabularies (each task-shaped module has its own —
// "backward" can't be a single hardcoded list). Mirrors the server's
// server/src/lib/permissions.js STAGE_ORDER/TERMINAL_STAGES exactly.
const STAGE_ORDER = {
  tasks: ['Open', 'Waiting For Client', 'In Process', 'Completed', 'Lost'],
  cobr: ['Open', 'Waiting For Client', 'In Process', 'Completed', 'Lost'],
  queries: ['Open', 'In Progress', 'Resolved', 'Closed'],
  investmentProspects: ['Pre-Qualified', 'Qualified', 'Work Executed', 'Close Won', 'Close Lost'],
  insuranceProspects: ['Qualified', 'Document Pending', 'Proposal Submitted', 'Payment Done', 'Waiting for Underwriter', 'Policy Issued', 'Policy Rejected'],
};
const TERMINAL_STAGES = {
  tasks: new Set(['Completed', 'Lost']),
  cobr: new Set(['Completed', 'Lost']),
  queries: new Set(['Resolved', 'Closed']),
  investmentProspects: new Set(['Close Won', 'Close Lost']),
  insuranceProspects: new Set(['Policy Issued', 'Policy Rejected']),
};
// Two-party modules — can()'s overlay settles stage direction for these.
const TASK_SHAPED = ['tasks', 'cobr', 'queries', 'renewals', 'claims', 'fixedDeposits', 'otherInsurancePolicies'];
export function isBackwardStage(module, from, to) {
  if (!from || !to || from === to) return false;
  const stages = STAGE_ORDER[module] || [];
  const terminal = TERMINAL_STAGES[module] || new Set();
  if (terminal.has(from) && !terminal.has(to)) return true;
  const fi = stages.indexOf(from), ti = stages.indexOf(to);
  return fi >= 0 && ti >= 0 && ti < fi;
}

export function can(module, action, record = null, ctx = {}) {
  const user = getCurrentUser();
  if (!user) return false;
  if ((user.roles || []).includes('ADMIN')) return true;

  // A prospect's creator may always edit its details (their own record),
  // mirroring the server engine. Additive grant only; stage stays matrix-governed.
  if (record && record.createdBy === user.id
      && ['investmentProspects', 'insuranceProspects'].includes(module)
      && action === 'editDetails') {
    return true;
  }

  // Unassigned leads are visible to whoever may Assign RM on them — mirrors
  // the server engine.
  if (module === 'leads' && action === 'view' && record && isUnassignedLead(record)
      && can('leads', 'assignRm', record)) {
    return true;
  }

  // ctx.noContextualRm: checking a record that doesn't exist yet — only the
  // roles the user actually holds count (mirrors the server engine).
  const roles = ctx.noContextualRm ? [...new Set(user.roles || [])] : rolesFor(user, module, record);
  const scope = maxScope(roles, module, action);
  if (scope === 'NONE') return false;

  // Two-party overlay: narrows an ASSIGNED scope to the people on the record;
  // ALL means every record, on every module (mirrors the server engine).
  if (TASK_SHAPED.includes(module) && ['editDetails', 'changeStage', 'editLog'].includes(action) && record) {
    if (scope === 'ALL') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    const isSubPerson = taskSubPersons(record).includes(user.id);
    if (action === 'editDetails') return isAssigner;
    if (isAssigner) return true;
    // Comment: assignee + sub-person. Change stage: assignee only (not sub-person).
    if (action === 'editLog') return isAssignee || isSubPerson;
    if (!isAssignee) return false;
    // Backward/reopen is its own matrix right (changeStageBack) — mirrors the
    // server engine, which no longer hardcodes it to Admin only.
    if (!isBackwardStage(module, ctx.fromStage, ctx.toStage)) return true;
    return maxScope(roles, module, 'changeStageBack') !== 'NONE';
  }

  if (scope === 'ALL') return true;
  // ASSIGNED with no record to check ownership against must deny, not guess —
  // mirrors the server engine (server/src/lib/permissions.js).
  if (!record) return false;
  return ownsRecord(module, record, user);
}

// Does one of the current user's own roles grant this on at least SOME
// record? Mirrors canSomewhere() in the server engine.
export function canSomewhere(module, action) {
  const user = getCurrentUser();
  if (!user) return false;
  if ((user.roles || []).includes('ADMIN')) return true;
  return maxScope(user.roles || [], module, action) !== 'NONE';
}

// Only an investment prospect's own RM or Portfolio Manager (or Admin) may put
// it into "Pre-Qualified" — mirrors isPreQualifiedOwner in the server engine.
export function isPreQualifiedOwner(record) {
  const user = getCurrentUser();
  if (!user || !record) return false;
  if ((user.roles || []).includes('ADMIN')) return true;
  return record.relationshipManager === user.id || record.portfolioManager === user.id;
}

// Can the current user move `record` from `from` to `to`? Mirrors the server's
// sync check exactly, so a stage picker can show ONLY the stages that would
// actually save — never a stage that looks selectable but gets reverted.
export function canMoveToStage(module, record, from, to) {
  if (!to || to === from) return true;
  if (module === 'investmentProspects' && to === 'Pre-Qualified') return isPreQualifiedOwner(record);
  // Confirming a prospect OUT of Pre-Qualified into Qualified is the same
  // RM/PM-only ownership check, not the matrix's normal changeStage scope —
  // mirrors server/src/lib/syncModule.js's outOfPreQualified rule exactly.
  if (module === 'investmentProspects' && from === 'Pre-Qualified' && to === 'Qualified') return isPreQualifiedOwner(record);
  const stageAction = module === 'leads' ? 'edit' : 'changeStage';
  if (!can(module, stageAction, record, { fromStage: from, toStage: to })) return false;
  // Two-party modules already resolved direction inside can()'s overlay.
  if (TASK_SHAPED.includes(module) || !isBackwardStage(module, from, to)) return true;
  return can(module, 'changeStageBack', record);
}
