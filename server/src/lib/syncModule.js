// Validated bulk-sync engine.
//
// The leads/tasks/meetings/prospects modules historically saved by having the
// browser PUT the WHOLE array; the server blindly `deleteMany`'d anything
// omitted and upserted the rest — no per-record authorization, no audit, and
// the client could hard-delete anything. This engine keeps that transport
// (minimal frontend churn) but makes the SERVER authoritative:
//
//   • diffs incoming vs. stored, classifying create / update / delete
//   • enforces canCreate / canEdit / canChangeStage / canDelete per record
//   • stamps owner fields (createdBy immutable, assignedTo, departmentOwner)
//     server-side, ignoring client attempts to forge them
//   • NEVER hard-deletes — omission is rejected (record kept) unless the actor
//     may delete, in which case it is SOFT-deleted (deletedAt)
//   • writes an ActivityLog row for every create/update/assign/stage/delete
//   • returns the authoritative list so the client reconciles
//
// All writes + logs happen in one interactive transaction.

import { can, canCreate, canEdit, canDelete, canChangeStage, isAdmin } from './permissions.js';
import { logActivity, diffFields } from './activityLog.js';

// Task change classification: a log/comment edit is NOT a details edit.
// `cobrEntries` (COBR's per-scheme done/rejected checklist) is deliberately
// log-tier too — the assignee is the one actually processing each broker-
// change entry, so marking done/rejected must not require the assigner-only
// `editDetails` right (mirrors how the assignee may add a comment/log).
// `remarks` is Queries' equivalent of `comments` (its raise/response thread).
const TASK_LOG_KEYS = new Set(['comments', 'stageRemark', 'cobrEntries', 'remarks']);
const TASK_STAGE_KEYS = new Set(['stage']);

// Keys excluded from the UPDATE field-diff (owner/audit noise + big arrays that
// have their own in-payload logs). Assignment/stage get their own log entries.
const NOISE_KEYS = new Set([
  'createdBy', 'assignedTo', 'departmentOwner', 'createdAt', 'updatedAt', 'deletedAt',
  'timeline', 'history', 'notes', 'followups', 'actuals', 'comments', 'cobrEntries', 'remarks',
]);

// Who may set/change the assignment field, per module policy.
function mayAssign(mode, actor, existing) {
  if (isAdmin(actor)) return true;
  if (mode === 'anyone') return true;
  if (mode === 'editor') return existing ? existing.departmentOwner === actor.id : true;
  return false; // 'admin' (or unknown) → admin only
}

/**
 * @param prisma  Prisma client
 * @param spec {
 *   module,            // 'leads' — OR a function (record) => moduleName, for
 *                       // modules that split into different permission rules
 *                       // per record (e.g. prospects: investment vs insurance
 *                       // by `proposalCategory`). `record` is either the
 *                       // incoming payload (create) or the stored Prisma row
 *                       // (edit/delete) — both expose the same field names.
 *   modelKey,          // 'lead' — prisma[modelKey]
 *   incoming,          // array from the client
 *   actor,             // req.user ({ id, role })
 *   promote,           // (payload) => promoted column object
 *   stageField,        // e.g. 'stage' (or null)
 *   assignOnCreate,    // 'admin' | 'anyone' | 'editor'
 *   assignOnEdit,      // 'admin' | 'anyone' | 'editor'
 *   deptOwnerIsActor,  // bool — stamp departmentOwner = actor.id on create (tasks: assignedBy)
 * }
 * @returns { list, stats }
 */
export async function syncBulk(prisma, spec) {
  const {
    module, modelKey, incoming, actor, promote,
    stageField = null, assignOnCreate = 'admin', assignOnEdit = 'admin', deptOwnerIsActor = false,
  } = spec;
  const moduleFor = typeof module === 'function' ? module : () => module;
  const model = prisma[modelKey];

  const existingRows = await model.findMany();
  const byId = new Map(existingRows.map((r) => [r.id, r]));
  const incomingIds = new Set(incoming.map((r) => r.id));
  const stats = { created: 0, updated: 0, rejected: 0, deleted: 0, kept: 0 };
  // Domain events for the notification layer — populated inside the tx, acted
  // on by the route AFTER commit + response (never emits sockets inside a tx).
  const events = [];

  await prisma.$transaction(async (tx) => {
    const txModel = tx[modelKey];

    for (const rec of incoming) {
      const existing = byId.get(rec.id);
      const now = new Date();

      // ---- CREATE ----------------------------------------------------------
      if (!existing) {
        const mod = moduleFor(rec);
        // Pass the incoming payload itself so a 'client'-kind module can
        // resolve contextual RM (e.g. a Prospect that already carries the
        // copied `relationshipManager` field from the client it belongs to)
        // before any DB row exists to check ownership against.
        if (!canCreate(actor, mod, rec)) { stats.rejected++; continue; }
        const owner = {
          createdBy: actor.id,
          departmentOwner: deptOwnerIsActor ? actor.id : (rec.departmentOwner ?? null),
          assignedTo: mayAssign(assignOnCreate, actor, null) ? (rec.assignedTo ?? null) : null,
        };
        const payload = { ...rec, ...owner, createdAt: now.toISOString(), updatedAt: now.toISOString() };
        await txModel.create({
          data: { id: rec.id, ...promote(payload), ...owner, deletedAt: null, payload },
        });
        await logActivity(tx, {
          module: mod, recordId: rec.id, action: 'CREATE',
          newValue: summarize(payload), performedBy: actor.id,
        });
        events.push({ type: 'CREATE', module: mod, record: payload, actorId: actor.id });
        stats.created++;
        continue;
      }

      // Skip untouched rows (cheap identity check on the stored payload).
      if (JSON.stringify(existing.payload) === JSON.stringify(rec)) { stats.kept++; continue; }

      // ---- UPDATE ----------------------------------------------------------
      // Resolve the desired assignment (ignore a forbidden change).
      const wantAssigned = rec.assignedTo ?? null;
      const curAssigned = existing.assignedTo ?? null;
      let nextAssigned = curAssigned;
      const assignmentRequested = wantAssigned !== curAssigned;
      if (assignmentRequested && mayAssign(assignOnEdit, actor, existing)) nextAssigned = wantAssigned;

      const from = stageField ? (existing[stageField] ?? null) : null;
      const to = stageField ? (rec[stageField] ?? null) : null;
      const stageChanged = stageField && from !== to;

      const mod = moduleFor(existing);
      let allowed;
      if (mod === 'tasks' || mod === 'cobr' || mod === 'queries') {
        // Split the change into details / stage / log and require the matching
        // permission for each part (assigner edits details; assignee may change
        // stage forward + add log). COBR rows are Tasks (relatedTo: 'COBR')
        // under their own matrix column, and Queries share the identical
        // two-party (raiser/recipient) shape — same split applies to both.
        const changed = Object.keys(diffFields(existing.payload, rec));
        const detailChanged = changed.some((k) => !TASK_LOG_KEYS.has(k) && !TASK_STAGE_KEYS.has(k) && !NOISE_KEYS.has(k));
        const logChanged = changed.some((k) => TASK_LOG_KEYS.has(k));
        allowed = true;
        if (detailChanged) allowed = allowed && can(actor, mod, 'editDetails', existing);
        if (stageChanged) allowed = allowed && can(actor, mod, 'changeStage', existing, { fromStage: from, toStage: to });
        if (logChanged && !detailChanged && !stageChanged) allowed = allowed && can(actor, mod, 'editLog', existing);
      } else {
        allowed = stageChanged
          ? canChangeStage(actor, mod, existing, from, to)
          : canEdit(actor, mod, existing);
      }
      // An allowed reassignment (e.g. Admin) is permitted even if plain edit isn't.
      if (!allowed && nextAssigned !== curAssigned) allowed = true;

      if (!allowed) { stats.rejected++; continue; } // keep the stored version

      const owner = {
        createdBy: existing.createdBy,               // immutable
        departmentOwner: existing.departmentOwner,   // immutable (assignedBy)
        assignedTo: nextAssigned,
      };
      const payload = {
        ...rec, ...owner,
        createdAt: existing.createdAt?.toISOString?.() ?? existing.payload?.createdAt ?? undefined,
        updatedAt: now.toISOString(),
      };
      await txModel.update({
        where: { id: rec.id },
        data: { ...promote(payload), ...owner, payload },
      });

      if (nextAssigned !== curAssigned) {
        await logActivity(tx, {
          module: mod, recordId: rec.id, action: 'ASSIGN',
          oldValue: { assignedTo: curAssigned }, newValue: { assignedTo: nextAssigned },
          performedBy: actor.id,
        });
        events.push({ type: 'ASSIGN', module: mod, record: payload, from: curAssigned, to: nextAssigned, actorId: actor.id });
      }
      if (stageChanged) {
        await logActivity(tx, {
          module: mod, recordId: rec.id, action: 'STAGE_CHANGE',
          oldValue: { stage: from }, newValue: { stage: to }, performedBy: actor.id,
        });
      }
      const fieldDiff = diffFields(existing.payload, payload,
        Object.keys(payload).filter((k) => !NOISE_KEYS.has(k) && k !== stageField));
      if (Object.keys(fieldDiff).length) {
        await logActivity(tx, {
          module: mod, recordId: rec.id, action: 'UPDATE',
          oldValue: pick(fieldDiff, 'from'), newValue: pick(fieldDiff, 'to'),
          performedBy: actor.id,
        });
      }
      stats.updated++;
    }

    // ---- DELETE (omitted rows) ---------------------------------------------
    for (const row of existingRows) {
      if (incomingIds.has(row.id) || row.deletedAt) continue;
      const mod = moduleFor(row);
      // A record the actor can't even VIEW is not "omitted" in any meaningful
      // sense — their bulk save only ever contains what they can see, so a
      // record outside that view is simply none of their business, not a
      // delete request. (Without this guard, a scoped viewer — e.g. someone
      // who only sees their own tasks — would look like they "deleted" every
      // other task in existence the moment they saved anything.)
      if (!can(actor, mod, 'view', row)) { stats.kept++; continue; }
      if (canDelete(actor, mod, row)) {
        await txModel.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
        await logActivity(tx, {
          module: mod, recordId: row.id, action: 'DELETE',
          oldValue: summarize(row.payload), performedBy: actor.id,
        });
        events.push({ type: 'DELETE', module: mod, record: row.payload, actorId: actor.id });
        stats.deleted++;
      } else {
        stats.kept++; // omission is NOT a delete — the record survives
      }
    }
  }, { timeout: 20000 });

  // Scope the returned "authoritative list" to what the actor can actually
  // view — a PUT response should never hand a scoped viewer rows they
  // couldn't see via GET (e.g. someone else's private tasks).
  const list = (await model.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }))
    .filter((r) => can(actor, moduleFor(r), 'view', r))
    .map((r) => r.payload);
  return { list, stats, events };
}

// A compact snapshot for CREATE/DELETE logs (avoid dumping huge payloads).
function summarize(payload = {}) {
  const keep = ['id', 'name', 'title', 'stage', 'status', 'clientId', 'leadId', 'assignedTo', 'createdBy'];
  const out = {};
  for (const k of keep) if (payload?.[k] !== undefined) out[k] = payload[k];
  return out;
}

// From a { field: {from,to} } diff, project one side into { field: value }.
function pick(diff, side) {
  const out = {};
  for (const [k, v] of Object.entries(diff)) out[k] = v[side];
  return out;
}
