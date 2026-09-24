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
// Each record's write + its own log entries commit in their OWN small
// transaction — NOT one transaction wrapping the whole incoming array. That
// used to be one `prisma.$transaction` around the entire loop, which for a
// big batch (this engine backs Leads/Tasks/COBR/Renewals/Claims/FDs/
// Policies/Queries — `tasks` alone can be hundreds of rows) meant dozens of
// sequential DB round-trips (an update plus up to 3 activity-log inserts per
// changed record) all held open under ONE transaction, locking every row it
// touched until the entire loop finished. Under real concurrent usage that
// serialized into minutes-long lock contention that cascaded into unrelated
// reads timing out — even an unrelated `prisma migrate deploy` connection
// got starved by it once. Per-record transactions mean each save's lock
// footprint is milliseconds, not the whole batch's runtime. The tradeoff:
// a failure partway through no longer rolls back the whole batch — records
// already written before the failure stay written. A per-record try/catch
// below turns a single record's DB error into `stats.failed` instead of
// aborting the rest of the batch, so one bad row can't block everyone else's
// change in the same save.
import {
  can, canCreate, canEdit, canDelete, canChangeStage, canChangeStageBack, isAdmin, isBackwardStage, isPreQualifiedOwner,
} from './permissions.js';
import { logActivity, diffFields } from './activityLog.js';

// Task change classification: a log/comment edit is NOT a details edit.
// `cobrEntries` (COBR's per-scheme done/rejected checklist) is deliberately
// log-tier too — the assignee is the one actually processing each broker-
// change entry, so marking done/rejected must not require the assigner-only
// `editDetails` right (mirrors how the assignee may add a comment/log).
// `remarks` is Queries' equivalent of `comments` (its raise/response thread).
const TASK_LOG_KEYS = new Set(['comments', 'stageRemark', 'cobrEntries', 'remarks']);
const TASK_STAGE_KEYS = new Set(['stage']);

// Modules whose changes get split into details/stage/log (see the UPDATE
// branch below) instead of a single flat edit permission. The COBR
// workspace's Renewals/Claims/Fixed Deposits/Other Insurance Policies use
// the identical assigner/assignee shape as Tasks/COBR/Queries.
const TASK_SHAPED_MODULES = new Set(['tasks', 'cobr', 'queries', 'renewals', 'claims', 'fixedDeposits', 'otherInsurancePolicies']);

// Keys excluded from the UPDATE field-diff (owner/audit noise + big arrays that
// have their own in-payload logs). Assignment/stage get their own log entries.
const NOISE_KEYS = new Set([
  'createdBy', 'assignedTo', 'departmentOwner', 'createdAt', 'updatedAt', 'deletedAt',
  'timeline', 'history', 'notes', 'followups', 'actuals', 'comments', 'cobrEntries', 'remarks',
  // Prospects' own append-only log — already surfaced by the dedicated
  // STAGE_CHANGE entry below, so diffing it here would just show a noisy,
  // unreadable "[object Object] -> [object Object], [object Object]" for
  // every save (it's an array of {at, by, from, to, remark} objects).
  'stageHistory',
]);

// Who may set/change the assignment field, per module policy.
//   'admin'  — Admin only (modules with no assignment row in the matrix).
//   'anyone' — whoever may create/edit the record.
//   'editor' — the record's assigner (departmentOwner), or — for the
//              two-party modules — anyone the matrix lets edit its details
//              (e.g. Internal Manager's ALL oversight scope on Tasks/COBR).
//              Before, only the assigner could reassign, so an Internal
//              Manager editing a task's assignee saw it silently snap back
//              despite holding ALL on Edit Details.
//   'matrix' — the matrix's own Assign RM cell for this module (Leads). Before,
//              Leads used 'admin' here, so a role the admin had granted
//              Assign RM saw the button (the UI honours the matrix) but every
//              assignment was rejected on save — "could not be saved, you may
//              not have permission".
function mayAssign(mode, actor, existing, mod, rec) {
  if (isAdmin(actor)) return true;
  if (mode === 'anyone') return true;
  if (mode === 'editor') {
    if (!existing) return true;
    if (existing.departmentOwner === actor.id) return true;
    return TASK_SHAPED_MODULES.has(mod) && can(actor, mod, 'editDetails', existing);
  }
  if (mode === 'matrix') return can(actor, mod, 'assignRm', existing || rec);
  return false; // 'admin' (or unknown) → admin only
}

// Does `key` differ between the stored payload and the incoming record?
const fieldChanged = (before, after, key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null);

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
 *   assignOnCreate,    // 'admin' | 'anyone' | 'editor' | 'matrix'
 *   assignOnEdit,      // 'admin' | 'anyone' | 'editor' | 'matrix'
 *   deptOwnerIsActor,  // bool — stamp departmentOwner = actor.id on create (tasks: assignedBy)
 *   assignFields,      // extra payload keys that ARE part of the assignment
 *                       // (Leads: ownerId, contributors) — governed only by
 *                       // the assignment right, never the plain edit right
 *   assignCompanions,  // keys that change as a side effect of an assignment
 *                       // (Leads: leadScore) — ride on the assignment right
 *                       // when one is granted in the same save; otherwise
 *                       // they're ordinary detail edits
 *   assignStage,       // { from, to } — the stage move an assignment makes
 *                       // (Leads: Waiting for Assignment → Qualified), allowed
 *                       // as part of a granted assignment
 * }
 * @returns { list, stats }
 */
export async function syncBulk(prisma, spec) {
  const {
    module, modelKey, incoming, actor, promote,
    stageField = null, assignOnCreate = 'admin', assignOnEdit = 'admin', deptOwnerIsActor = false,
    assignFields = [], assignCompanions = [], assignStage = null,
  } = spec;
  const assignFieldSet = new Set(assignFields);
  const assignCompanionSet = new Set(assignCompanions);
  const moduleFor = typeof module === 'function' ? module : () => module;
  const model = prisma[modelKey];

  const existingRows = await model.findMany();
  const byId = new Map(existingRows.map((r) => [r.id, r]));
  const incomingIds = new Set(incoming.map((r) => r.id));
  const stats = { created: 0, updated: 0, rejected: 0, deleted: 0, kept: 0, failed: 0 };
  // Domain events for the notification layer — populated only once the
  // record's own transaction has actually committed, acted on by the route
  // AFTER the response (never emits sockets inside a tx).
  const events = [];

  for (const rec of incoming) {
    const existing = byId.get(rec.id);
    const now = new Date();

    // ---- CREATE ------------------------------------------------------------
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
        assignedTo: mayAssign(assignOnCreate, actor, null, mod, rec) ? (rec.assignedTo ?? null) : null,
      };
      const payload = { ...rec, ...owner, createdAt: now.toISOString(), updatedAt: now.toISOString() };
      try {
        await prisma.$transaction(async (tx) => {
          await tx[modelKey].create({
            data: { id: rec.id, ...promote(payload), ...owner, deletedAt: null, payload },
          });
          await logActivity(tx, {
            module: mod, recordId: rec.id, action: 'CREATE',
            newValue: summarize(payload), performedBy: actor.id,
          });
        });
      } catch (err) {
        stats.failed++;
        console.error(`[syncBulk] create failed for ${mod} ${rec.id}:`, err);
        continue;
      }
      events.push({ type: 'CREATE', module: mod, record: payload, actorId: actor.id });
      stats.created++;
      continue;
    }

    // Skip untouched rows (cheap identity check on the stored payload).
    if (JSON.stringify(existing.payload) === JSON.stringify(rec)) { stats.kept++; continue; }

    // ---- UPDATE --------------------------------------------------------------
    const mod = moduleFor(existing);

    // Resolve the desired assignment (ignore a forbidden change). A change to
    // any of the module's assignFields counts as an assignment request too.
    const wantAssigned = rec.assignedTo ?? null;
    const curAssigned = existing.assignedTo ?? null;
    let nextAssigned = curAssigned;
    const assignFieldsChanged = assignFields.some((k) => fieldChanged(existing.payload, rec, k));
    const assignmentRequested = wantAssigned !== curAssigned || assignFieldsChanged;
    const assignAllowed = assignmentRequested && mayAssign(assignOnEdit, actor, existing, mod, rec);
    if (assignAllowed) nextAssigned = wantAssigned;
    // An assignment the actor may not make leaves every assignment field at
    // its stored value (assignedTo itself is pinned via `owner` below).
    if (assignmentRequested && !assignAllowed) {
      assignFields.forEach((k) => { rec[k] = existing.payload?.[k]; });
    }

    const from = stageField ? (existing[stageField] ?? null) : null;
    let to = stageField ? (rec[stageField] ?? null) : null;
    let stageChanged = stageField && from !== to;
    // The stage move an assignment itself makes (Leads: Waiting for
    // Assignment → Qualified) rides on the assignment right.
    const assignmentStageMove = assignAllowed && !!assignStage && stageChanged
      && from === assignStage.from && to === assignStage.to;
    // Keys whose change is already settled by the assignment decision above,
    // so they're kept out of the ordinary details check.
    const settledByAssignment = (k) => assignFieldSet.has(k) || (assignAllowed && assignCompanionSet.has(k));
    let allowed;
    if (TASK_SHAPED_MODULES.has(mod)) {
      // Split the change into details / stage / log and require the matching
      // permission for each part (assigner edits details; assignee may change
      // stage forward + add log). COBR rows are Tasks (relatedTo: 'COBR')
      // under their own matrix column, and Queries share the identical
      // two-party (raiser/recipient) shape — same split applies to both.
      // Each aspect applies INDEPENDENTLY — a save that bundles a stage move
      // with a detail edit must not be all-or-nothing. It used to be: one
      // disallowed aspect rejected the WHOLE record, so someone allowed to
      // move the stage but not edit details (the normal assignee case) saw
      // their stage change silently vanish on the next reconciliation, since
      // the modal always saves the full form. Now whichever aspect is
      // disallowed is reverted to its stored value and the rest still lands
      // — the same treatment the non-task-shaped branch below already got.
      const changed = Object.keys(diffFields(existing.payload, rec));
      const detailKeys = changed.filter((k) => !TASK_LOG_KEYS.has(k) && !TASK_STAGE_KEYS.has(k) && !NOISE_KEYS.has(k) && !settledByAssignment(k));
      const logKeys = changed.filter((k) => TASK_LOG_KEYS.has(k));
      const detailChanged = detailKeys.length > 0;
      const logChanged = logKeys.length > 0;
      const detailAllowed = !detailChanged || can(actor, mod, 'editDetails', existing);
      const stageAllowed = !stageChanged || can(actor, mod, 'changeStage', existing, { fromStage: from, toStage: to });
      // editLog is only required when the log is the ONLY thing that changed
      // — alongside a detail/stage edit it rides on that aspect's own right.
      const logAllowed = !logChanged || detailChanged || stageChanged || can(actor, mod, 'editLog', existing);
      allowed = detailAllowed || stageAllowed || logAllowed;
      if (!allowed && assignAllowed) allowed = true;
      if (!allowed) { stats.rejected++; continue; } // keep the stored version

      if (!detailAllowed) detailKeys.forEach((k) => { rec[k] = existing.payload[k]; });
      if (!logAllowed) logKeys.forEach((k) => { rec[k] = existing.payload[k]; });
      if (!stageAllowed) rec[stageField] = existing[stageField];
      // Re-derive after any partial revert — the STAGE_CHANGE log/event
      // below must reflect what was actually applied, not what was asked for.
      to = stageField ? (rec[stageField] ?? null) : null;
      stageChanged = stageField && from !== to;
      // Everything disallowed got reverted — nothing left to write.
      if (JSON.stringify(existing.payload) === JSON.stringify(rec)) { stats.kept++; continue; }
    } else {
      // Stage and non-stage changes need their OWN, independent permission
      // check, and each must apply INDEPENDENTLY too — a save that bundles
      // both (e.g. a Prospect's "Close Won" move saved together with an
      // updated remark/amount) must not be all-or-nothing. The old
      // either/or check rejected the WHOLE record whenever the actor
      // lacked rights for EITHER aspect, discarding a stage move the actor
      // WAS allowed to make just because it rode along with a detail edit
      // they weren't (or vice versa) — which is exactly what made a
      // "Close Won" move appear to revert on its own: the optimistic UI
      // showed it, then the next reconciliation pulled back the server's
      // real (unchanged) row. Now whichever aspect is disallowed is simply
      // reverted to its stored value instead of voiding the whole update.
      const changedKeys = Object.keys(diffFields(existing.payload, rec))
        .filter((k) => k !== stageField && !NOISE_KEYS.has(k) && !settledByAssignment(k));
      const detailAllowed = changedKeys.length === 0 || canEdit(actor, mod, existing);
      // A stale browser tab re-sending an old `stage` value alongside an
      // unrelated edit must not silently walk the record backward (e.g.
      // out of a Prospect's Close Won) — same "no reopen without an
      // explicit action" rule Tasks/COBR/Queries already enforce via
      // isBackwardStage, extended here to every module with a STAGE_ORDER
      // entry (currently the two Prospect modules; a no-op everywhere
      // else, since isBackwardStage returns false for an unlisted module).
      // Moving an investment prospect INTO Pre-Qualified is its own hard
      // rule: only that prospect's RM/PM (or Admin), whatever the matrix says.
      // Any other backward move needs the matrix's changeStageBack right.
      // Confirming it OUT of Pre-Qualified into Qualified is the same
      // ownership check, not just the matrix's normal changeStage scope —
      // that's the point the RM/PM commits to a Closing Date (enforced
      // client-side), so only they (or Admin) may make that specific move;
      // a Service Manager or anyone else with generic changeStage rights
      // still cannot.
      const intoPreQualified = mod === 'investmentProspects' && to === 'Pre-Qualified';
      const outOfPreQualified = mod === 'investmentProspects' && from === 'Pre-Qualified' && to === 'Qualified';
      const stageAllowed = !stageChanged || assignmentStageMove || (
        intoPreQualified || outOfPreQualified
          ? isPreQualifiedOwner(actor, existing)
          : canChangeStage(actor, mod, existing, from, to)
          && (!isBackwardStage(mod, from, to) || canChangeStageBack(actor, mod, existing))
      );
      allowed = detailAllowed || stageAllowed;
      if (!allowed && assignAllowed) allowed = true;
      if (!allowed) { stats.rejected++; continue; } // keep the stored version

      if (!detailAllowed) changedKeys.forEach((k) => { rec[k] = existing.payload[k]; });
      if (!stageAllowed) rec[stageField] = existing[stageField];
      // Re-derive after any partial revert above — the STAGE_CHANGE log/
      // event further down must reflect what was actually applied, not
      // what was originally requested.
      to = stageField ? (rec[stageField] ?? null) : null;
      stageChanged = stageField && from !== to;
      // Everything disallowed got reverted back to the stored value —
      // nothing left to actually write.
      if (JSON.stringify(existing.payload) === JSON.stringify(rec)) { stats.kept++; continue; }
    }

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
    // A new entry appended to the record's discussion thread (Queries'
    // `remarks`, Tasks/COBR's `comments`) — surfaced as a domain event so the
    // notification layer can tell the OTHER participant someone commented.
    // Only GROWTH counts: editing or reordering an existing entry isn't a
    // new comment and must not ping anyone.
    const threadKey = mod === 'queries' ? 'remarks' : 'comments';
    const threadBefore = Array.isArray(existing.payload?.[threadKey]) ? existing.payload[threadKey] : [];
    const threadAfter = Array.isArray(payload?.[threadKey]) ? payload[threadKey] : [];
    const fieldDiff = diffFields(existing.payload, payload,
      Object.keys(payload).filter((k) => !NOISE_KEYS.has(k) && k !== stageField));

    try {
      await prisma.$transaction(async (tx) => {
        await tx[modelKey].update({
          where: { id: rec.id },
          data: { ...promote(payload), ...owner, payload },
        });

        if (nextAssigned !== curAssigned) {
          await logActivity(tx, {
            module: mod, recordId: rec.id, action: 'ASSIGN',
            oldValue: { assignedTo: curAssigned }, newValue: { assignedTo: nextAssigned },
            performedBy: actor.id,
          });
        }
        if (stageChanged) {
          await logActivity(tx, {
            module: mod, recordId: rec.id, action: 'STAGE_CHANGE',
            oldValue: { stage: from }, newValue: { stage: to }, performedBy: actor.id,
          });
        }
        if (Object.keys(fieldDiff).length) {
          await logActivity(tx, {
            module: mod, recordId: rec.id, action: 'UPDATE',
            oldValue: pick(fieldDiff, 'from'), newValue: pick(fieldDiff, 'to'),
            performedBy: actor.id,
          });
        }
      });
    } catch (err) {
      stats.failed++;
      console.error(`[syncBulk] update failed for ${mod} ${rec.id}:`, err);
      continue;
    }

    if (nextAssigned !== curAssigned) {
      events.push({ type: 'ASSIGN', module: mod, record: payload, from: curAssigned, to: nextAssigned, actorId: actor.id });
    }
    if (stageChanged) {
      events.push({ type: 'STAGE_CHANGE', module: mod, record: payload, from, to, actorId: actor.id });
    }
    if (threadAfter.length > threadBefore.length) {
      events.push({
        type: 'LOG_APPEND', module: mod, record: payload, actorId: actor.id,
        entry: threadAfter[threadAfter.length - 1],
      });
    }
    stats.updated++;
  }

  // ---- DELETE (omitted rows) -----------------------------------------------
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
      try {
        await prisma.$transaction(async (tx) => {
          await tx[modelKey].update({ where: { id: row.id }, data: { deletedAt: new Date() } });
          await logActivity(tx, {
            module: mod, recordId: row.id, action: 'DELETE',
            oldValue: summarize(row.payload), performedBy: actor.id,
          });
        });
      } catch (err) {
        stats.failed++;
        console.error(`[syncBulk] delete failed for ${mod} ${row.id}:`, err);
        continue;
      }
      events.push({ type: 'DELETE', module: mod, record: row.payload, actorId: actor.id });
      stats.deleted++;
    } else {
      stats.kept++; // omission is NOT a delete — the record survives
    }
  }

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
