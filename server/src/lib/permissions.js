// RBAC engine — data-driven from the admin-configurable permission matrix.
//
// Effective access for a user = the UNION of their permanent roles' scopes,
// PLUS the RM role's scope on records where they are the assigned RM
// (contextual). ADMIN bypasses everything. Scope resolves against the record:
// ALL → yes; ASSIGNED → only if the record is theirs; NONE → no.
//
// The matrix lives in the DB (role_permissions); it's cached in-memory here and
// refreshed when the admin saves. Any cell missing from the DB falls back to
// the catalog default, so the engine is always safe even before the cache loads.

import { prisma } from '../db.js';
import { OWNERSHIP, defaultScope } from './permissionCatalog.js';

const RANK = { NONE: 0, ASSIGNED: 1, ALL: 2 };

// role:module:action -> scope
let cache = new Map();
let loaded = false;

export async function initPermissions() {
  const rows = await prisma.rolePermission.findMany();
  const next = new Map();
  for (const r of rows) next.set(`${r.role}:${r.module}:${r.action}`, r.scope);
  cache = next;
  loaded = true;
  return cache.size;
}
export const refreshPermissions = initPermissions;
export const isMatrixLoaded = () => loaded;

function cellScope(role, module, action) {
  const hit = cache.get(`${role}:${module}:${action}`);
  return hit || defaultScope(role, module, action);
}

export const isAdmin = (user) => Array.isArray(user?.roles) && user.roles.includes('ADMIN');

// "Is this account the RM of the client this record belongs to?" — checked in
// every shape a 'client'-kind record might carry that information:
//   record.assignedTo / record.clientDetails.relationshipManager  — the Client
//     record itself (assignedTo is the synced RBAC column; clientDetails is
//     the legacy form field the real UI actually writes — kept in sync with
//     assignedTo on every client write, see routes/clients.js, but checked
//     directly here too for safety).
//   record.client.assignedTo / record.client.clientDetails.relationshipManager
//     — a child record with its parent Client joined/attached as `.client`.
//   record.relationshipManager — a child record (e.g. a Prospect) that copies
//     the field directly onto itself at creation time, no join needed. This is
//     read from the RAW INCOMING payload at create-time (before a DB row exists).
//   record.payload.relationshipManager — the same field, but read from a
//     stored Prisma row whose full object lives in the JSONB `payload` column
//     (Prospects don't promote this field to a real column).
function isClientRm(record, uid) {
  return record.assignedTo === uid
    || record.relationshipManager === uid
    || record.payload?.relationshipManager === uid
    || record?.client?.assignedTo === uid
    || record?.clientDetails?.relationshipManager === uid
    || record?.client?.clientDetails?.relationshipManager === uid;
}

// ---- ownership resolvers ---------------------------------------------------
function ownsRecord(module, record, uid) {
  if (!record) return false;
  const kind = OWNERSHIP[module] || 'self';
  if (kind === 'creator') return record.createdBy === uid;
  if (kind === 'task') return record.departmentOwner === uid || record.assignedTo === uid;
  if (kind === 'client') return isClientRm(record, uid) || record.createdBy === uid;
  return record.assignedTo === uid || record.createdBy === uid; // self
}

// Is this user the assigned RM of the record (grants the contextual RM role)?
function isRmOf(module, record, uid) {
  if (!record) return false;
  const kind = OWNERSHIP[module] || 'self';
  if (kind === 'client') return isClientRm(record, uid);
  if (kind === 'task') return false; // RM isn't a task concept
  return record.assignedTo === uid; // self / creator
}

// The user's effective roles for this record (permanent + contextual RM).
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

// ---- core decision ---------------------------------------------------------
// ctx may carry { fromStage, toStage } for task stage moves.
export function can(user, module, action, record = null, ctx = {}) {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const roles = rolesFor(user, module, record);
  const scope = maxScope(roles, module, action);
  if (scope === 'NONE') return false;

  // Task-shaped overlay (fixed business rule): only the assigner edits
  // details; the assignee may change stage / add log, but not move it
  // backward. COBR records ARE Task rows (relatedTo: 'COBR') under their own
  // matrix column, so the same mechanics apply; Queries have the identical
  // two-party shape (raisedBy = departmentOwner, raisedTo = assignedTo), just
  // its own stage vocabulary (see STAGE_ORDER below).
  if (['tasks', 'cobr', 'queries'].includes(module) && ['editDetails', 'changeStage', 'editLog'].includes(action) && record) {
    if (scope === 'ALL') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    if (action === 'editDetails') return isAssigner;
    // changeStage / editLog:
    if (isAssigner) return true;
    if (!isAssignee) return false;
    if (action === 'editLog') return true;
    // assignee changing stage: forward only (no reopen / backward)
    return !isBackwardStage(module, ctx.fromStage, ctx.toStage);
  }

  if (scope === 'ALL') return true;
  // ASSIGNED with nothing to check ownership against (e.g. a create-time
  // check where the caller never passed the record/context being created
  // for) must NOT silently pass — that would let anyone holding an
  // ASSIGNED-scoped role act unscoped the moment a call site forgets to pass
  // a record. Deny; callers that need contextual-RM create rights must pass
  // the record (or its parent client) they're creating against.
  if (!record) return false;
  return ownsRecord(module, record, user.id);
}

// ---- stage direction (per module — each task-shaped module has its own
// vocabulary, so "backward" can't be a single hardcoded list) --------------
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
  if (terminal.has(from) && !terminal.has(to)) return true; // reopen
  const fi = stages.indexOf(from), ti = stages.indexOf(to);
  return fi >= 0 && ti >= 0 && ti < fi;
}

// ---- convenience wrappers (used by routes / syncModule) --------------------
const EDIT_ACTION = { tasks: 'editDetails', clients: 'editPersonal', investmentProspects: 'editDetails', insuranceProspects: 'editDetails' };
const STAGE_ACTION = { tasks: 'changeStage', investmentProspects: 'changeStage', insuranceProspects: 'changeStage' };
export const editActionFor = (m) => EDIT_ACTION[m] || 'edit';
export const stageActionFor = (m) => STAGE_ACTION[m] || 'edit';

// `record` is optional — for a 'client'-kind module, pass the incoming payload
// (or its parent client) so a contextual-RM ASSIGNED scope can be resolved at
// create-time, before any DB row exists yet.
export const canCreate = (user, module, record = null) => can(user, module, 'create', record);
export const canEdit = (user, module, record) => can(user, module, editActionFor(module), record);
export const canDelete = (user, module, record) => can(user, module, 'delete', record);
export const canView = (user, module, record) => can(user, module, 'view', record);
export const canAssign = (user, module) => can(user, module, 'assignRm', null);
export const canChangeStage = (user, module, record, fromStage, toStage) =>
  can(user, module, stageActionFor(module), record, { fromStage, toStage });
