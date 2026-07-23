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

// A task's third participant (sub-person). Client records ARE the payload, so
// it's read directly; `.payload` fallback keeps it safe either way.
const taskSubPerson = (record) => record?.subPerson ?? record?.payload?.subPerson ?? null;

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

function ownsRecord(module, record, user) {
  if (!record) return false;
  const uid = user.id;
  const kind = ownershipKind(module);
  if (kind === 'creator') return record.createdBy === uid;
  // The three people on a task: assigner, assignee and sub-person.
  if (kind === 'task') return record.departmentOwner === uid || record.assignedTo === uid || taskSubPerson(record) === uid;
  if (kind === 'meeting') return isMeetingParticipant(record, user);
  if (kind === 'client') return isClientRm(record, uid) || record.createdBy === uid;
  return record.assignedTo === uid || record.createdBy === uid;
}

function isRmOf(module, record, uid) {
  if (!record) return false;
  const kind = ownershipKind(module);
  if (kind === 'client') return isClientRm(record, uid);
  if (kind === 'task') return false;
  return record.assignedTo === uid;
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
};
const TERMINAL_STAGES = {
  tasks: new Set(['Completed', 'Lost']),
  cobr: new Set(['Completed', 'Lost']),
  queries: new Set(['Resolved', 'Closed']),
};
function isBackwardStage(module, from, to) {
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

  const roles = rolesFor(user, module, record);
  const scope = maxScope(roles, module, action);
  if (scope === 'NONE') return false;

  if (['tasks', 'cobr', 'queries'].includes(module) && ['editDetails', 'changeStage', 'editLog'].includes(action) && record) {
    // Queries: this two-party rule is a hard confidentiality requirement, even
    // for a role matrix-configured to ALL — only the raiser edits, only the
    // recipient moves the stage. Tasks/COBR keep the ALL-bypass (Internal
    // Manager's oversight exception). Mirrors the server engine exactly.
    if (scope === 'ALL' && module !== 'queries') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    const isSubPerson = taskSubPerson(record) === user.id;
    if (action === 'editDetails') return isAssigner;
    if (isAssigner) return true;
    // Comment: assignee + sub-person. Change stage: assignee only (not sub-person).
    if (action === 'editLog') return isAssignee || isSubPerson;
    if (!isAssignee) return false;
    return !isBackwardStage(module, ctx.fromStage, ctx.toStage);
  }

  if (scope === 'ALL') return true;
  // ASSIGNED with no record to check ownership against must deny, not guess —
  // mirrors the server engine (server/src/lib/permissions.js).
  if (!record) return false;
  return ownsRecord(module, record, user);
}
