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
// A task's "sub person" is a third participant (e.g. an RM assigns a task to
// an ops person AND tags a sub-person who also works it). Stored in the task
// payload (not a promoted column), so it's read from either shape can() gets:
// the raw payload directly, or a stored Prisma row's `.payload`.
const taskSubPerson = (record) => record?.subPerson ?? record?.payload?.subPerson ?? null;

// A meeting's host (assignedTo) and attendees are stored as plain NAME
// strings, not user ids (predates the id-based assignment used elsewhere —
// e.g. Tasks). So "is this user on the meeting" has to be matched by name,
// case-insensitively. Fragile against a later name change (the exact
// gotcha this app hit with its own admin rename), but there's no id to key
// off today.
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
  const kind = OWNERSHIP[module] || 'self';
  if (kind === 'creator') return record.createdBy === uid;
  // task = the three people on it: assigner (departmentOwner), assignee
  // (assignedTo) and the sub-person. Nobody else "owns" (sees) it.
  if (kind === 'task') return record.departmentOwner === uid || record.assignedTo === uid || taskSubPerson(record) === uid;
  // meeting = the creator, the host, or an attendee (by name — see above).
  if (kind === 'meeting') return isMeetingParticipant(record, user);
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

  // A prospect's creator may always edit its details — their own record — even
  // if their role's matrix scope wouldn't otherwise grant it (mirrors the task
  // assigner's edit right). Never restricts anyone; purely an additive grant to
  // whoever created the prospect. Stage moves stay matrix-governed.
  if (record && record.createdBy === user.id
      && ['investmentProspects', 'insuranceProspects'].includes(module)
      && action === 'editDetails') {
    return true;
  }

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
    // For Queries specifically, this two-party rule is a hard confidentiality
    // requirement — even a role matrix-configured to ALL (e.g. an oversight
    // role, or an admin having broadened everyone's scope) must NOT bypass
    // it: only the raiser edits, only the recipient moves the stage, anyone
    // else may view but never touch. Tasks/COBR keep the ALL-bypass
    // (Internal Manager's deliberate "close to Admin" oversight exception).
    if (scope === 'ALL' && module !== 'queries') return true;
    const isAssigner = record.departmentOwner === user.id;
    const isAssignee = record.assignedTo === user.id;
    const isSubPerson = taskSubPerson(record) === user.id;
    if (action === 'editDetails') return isAssigner; // only the assigner edits details
    if (isAssigner) return true;
    // editLog (comment): the assignee AND the sub-person may both add a log.
    if (action === 'editLog') return isAssignee || isSubPerson;
    // changeStage: the assignee may move it forward (no reopen / backward);
    // the sub-person may NOT change the stage — comment only.
    if (!isAssignee) return false;
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
  return ownsRecord(module, record, user);
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
