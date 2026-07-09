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

function ownsRecord(module, record, uid) {
  if (!record) return false;
  const kind = ownershipKind(module);
  if (kind === 'creator') return record.createdBy === uid;
  if (kind === 'task') return record.departmentOwner === uid || record.assignedTo === uid;
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

  const roles = rolesFor(user, module, record);
  const scope = maxScope(roles, module, action);
  if (scope === 'NONE') return false;

  if (['tasks', 'cobr', 'queries'].includes(module) && ['editDetails', 'changeStage', 'editLog'].includes(action) && record) {
    if (scope === 'ALL') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    if (action === 'editDetails') return isAssigner;
    if (isAssigner) return true;
    if (!isAssignee) return false;
    if (action === 'editLog') return true;
    return !isBackwardStage(module, ctx.fromStage, ctx.toStage);
  }

  if (scope === 'ALL') return true;
  // ASSIGNED with no record to check ownership against must deny, not guess —
  // mirrors the server engine (server/src/lib/permissions.js).
  if (!record) return false;
  return ownsRecord(module, record, user.id);
}
