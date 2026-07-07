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

const TASK_STAGES = ['Open', 'Waiting For Client', 'In Process', 'Completed', 'Lost'];
const TASK_TERMINAL = new Set(['Completed', 'Lost']);
function isBackwardStage(from, to) {
  if (!from || !to || from === to) return false;
  if (TASK_TERMINAL.has(from) && !TASK_TERMINAL.has(to)) return true;
  const fi = TASK_STAGES.indexOf(from), ti = TASK_STAGES.indexOf(to);
  return fi >= 0 && ti >= 0 && ti < fi;
}

export function can(module, action, record = null, ctx = {}) {
  const user = getCurrentUser();
  if (!user) return false;
  if ((user.roles || []).includes('ADMIN')) return true;

  const roles = rolesFor(user, module, record);
  const scope = maxScope(roles, module, action);
  if (scope === 'NONE') return false;

  if ((module === 'tasks' || module === 'cobr') && ['editDetails', 'changeStage', 'editLog'].includes(action) && record) {
    if (scope === 'ALL') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    if (action === 'editDetails') return isAssigner;
    if (isAssigner) return true;
    if (!isAssignee) return false;
    if (action === 'editLog') return true;
    return !isBackwardStage(ctx.fromStage, ctx.toStage);
  }

  if (scope === 'ALL') return true;
  // ASSIGNED with no record to check ownership against must deny, not guess —
  // mirrors the server engine (server/src/lib/permissions.js).
  if (!record) return false;
  return ownsRecord(module, record, user.id);
}
