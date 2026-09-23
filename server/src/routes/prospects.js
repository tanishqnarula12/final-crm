// Business Prospects — bulk transport (see routes/leads.js for the pattern),
// now with REAL per-role enforcement via syncBulk. Prospects split into two
// permission modules depending on `proposalCategory`:
//   'insurance'            -> insuranceProspects (Insurance Manager only)
//   'investment'/'othercode' -> investmentProspects (Portfolio Manager / RM
//                                edit details; Service Manager changes stage)
// syncBulk resolves the module per-record via `prospectModuleFor`, so a
// single bulk save can contain a mix of both categories and each row is
// checked against its own rule.
//
// ---------------------------------------------------------------------------
// Single-record routes (POST /, PATCH /:id, DELETE /:id) — added alongside
// the bulk PUT below, NOT instead of it.
// ---------------------------------------------------------------------------
// Every ordinary prospect action from the UI — a stage move, a detail edit, a
// create, a delete — always touches exactly ONE record. It used to go through
// PUT / (bulk) anyway: the client rebuilt the FULL prospects array (changing
// only the one record it meant to touch) and PUT the whole thing, and syncBulk
// unconditionally re-read the ENTIRE prospects table (twice — once up front,
// once to build the response) and diffed every incoming row against it, even
// though only one row had actually changed. With a couple dozen prospects
// that's free; at hundreds of rows (and climbing) it's real, visible latency
// on every single save, for no reason tied to what actually changed.
//
// These three routes do the SAME per-record checks the bulk engine already
// enforces (mirrored from its non-task-shaped branch below — prospects never
// uses the task-shaped one; neither 'investmentProspects' nor
// 'insuranceProspects' is in syncModule.js's TASK_SHAPED_MODULES), but reach
// the ONE row by its id (an indexed lookup) instead of scanning the table.
//
// Deliberately NOT implemented by refactoring syncModule.js to share code
// with these routes: syncBulk backs Leads/Tasks/COBR/Renewals/Claims/Fixed
// Deposits/Other Policies/Queries too, and this module's omission-based
// delete semantics (anything left out of the incoming array that the actor
// COULD delete gets soft-deleted) make it actively unsafe to call with
// anything less than the true full array — passing it a single-record array
// would make every OTHER prospect look "omitted" and eligible for deletion.
// Keeping these routes' logic self-contained, hand-mirrored from the exact
// branch prospects already uses, means this change cannot alter behavior for
// any other module even in principle — nothing outside this file changed.
// If that branch's rules ever change, mirror the change here too (each
// block below is commented with the syncModule.js line it mirrors).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { syncBulk } from '../lib/syncModule.js';
import {
  can, canCreate, canEdit, canDelete, canChangeStage, canChangeStageBack, isAdmin, isBackwardStage, isPreQualifiedOwner,
} from '../lib/permissions.js';
import { logActivity, diffFields } from '../lib/activityLog.js';
import { notifyFromEvents } from '../lib/notify.js';

const router = Router();
router.use(requireAuth);

const prospectSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ prospects: z.array(prospectSchema) });

const prospectModuleFor = (r) => (r?.proposalCategory === 'insurance' ? 'insuranceProspects' : 'investmentProspects');

// Same promote() the bulk route below passes to syncBulk — the payload
// fields duplicated onto real (indexed/queryable) columns.
const promote = (p) => ({
  groupLeaderId: p.groupLeaderId ?? null,
  proposalCategory: p.proposalCategory ?? null,
  stage: p.stage ?? null,
});

// Mirrors syncModule.js's NOISE_KEYS exactly (only the subset that can ever
// apply to a non-task-shaped module — prospects have no cobrEntries/remarks/
// stageHistory-style fields of their own, but keeping the identical set costs
// nothing and guarantees no drift if one is ever added).
const NOISE_KEYS = new Set([
  'createdBy', 'assignedTo', 'departmentOwner', 'createdAt', 'updatedAt', 'deletedAt',
  'timeline', 'history', 'notes', 'followups', 'actuals', 'comments', 'cobrEntries', 'remarks',
  'stageHistory',
]);

// Mirrors syncModule.js's mayAssign(), specialized to prospects' own fixed
// policy — routes/prospects.js's bulk PUT below always passes
// assignOnCreate:'admin', assignOnEdit:'admin' to syncBulk, i.e. only an
// Admin may set/change a prospect's `assignedTo`. mayAssign('admin', ...)
// reduces to exactly this.
const mayAssignProspect = (actor) => isAdmin(actor);

const summarize = (payload = {}) => {
  const keep = ['id', 'name', 'title', 'stage', 'status', 'clientId', 'leadId', 'assignedTo', 'createdBy'];
  const out = {};
  for (const k of keep) if (payload?.[k] !== undefined) out[k] = payload[k];
  return out;
};

router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.prospect.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, prospectModuleFor(r), 'view', r));
  res.json({ prospects: visible.map((r) => r.payload) });
}));

// ---------------------------------------------------------------------------
// POST / — create one or a few prospects (never scales with the existing
// table: a "Create Prospect" confirm can produce a handful of drafts at once
// — one per proposal type selected — but is always bounded by what's on
// screen, never by the total prospects that already exist). Each incoming
// row is checked and inserted independently; one row failing doesn't block
// the rest (matches the bulk engine's per-record failure isolation).
// ---------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const { prospects } = parseBody(bulkSchema, req.body);
  const created = [];
  const rejectedIds = [];
  const events = [];

  for (const rec of prospects) {
    const mod = prospectModuleFor(rec);
    // Mirrors syncModule.js CREATE branch: canCreate(actor, mod, rec).
    if (!canCreate(req.user, mod, rec)) { rejectedIds.push(rec.id); continue; }

    // Idempotency: a client-generated id that already exists (e.g. a retried
    // request after a dropped response) is treated as already-created rather
    // than erroring — an indexed lookup, not a table scan.
    const already = await prisma.prospect.findUnique({ where: { id: rec.id }, select: { payload: true, deletedAt: true } });
    if (already && !already.deletedAt) { created.push(already.payload); continue; }

    const now = new Date();
    const owner = {
      createdBy: req.user.id,
      departmentOwner: rec.departmentOwner ?? null,
      assignedTo: mayAssignProspect(req.user) ? (rec.assignedTo ?? null) : null,
    };
    const payload = { ...rec, ...owner, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    try {
      await prisma.$transaction(async (tx) => {
        await tx.prospect.create({ data: { id: rec.id, ...promote(payload), ...owner, deletedAt: null, payload } });
        await logActivity(tx, { module: mod, recordId: rec.id, action: 'CREATE', newValue: summarize(payload), performedBy: req.user.id });
      });
    } catch (err) {
      console.error(`[prospects] create failed for ${rec.id}:`, err);
      rejectedIds.push(rec.id);
      continue;
    }
    created.push(payload);
    events.push({ type: 'CREATE', module: mod, record: payload, actorId: req.user.id });
  }

  res.status(201).json({ prospects: created, rejectedIds });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] prospects create:', err));
}));

// ---------------------------------------------------------------------------
// PATCH /:id — update ONE prospect (stage move, detail edit, or both in one
// save). Fetches and writes that single row by id; never touches any other
// prospect. Mirrors syncModule.js's non-task-shaped UPDATE branch exactly —
// each numbered comment below names the line range it mirrors.
// ---------------------------------------------------------------------------
router.patch('/:id', asyncHandler(async (req, res) => {
  const rec = parseBody(prospectSchema, req.body);
  const existing = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Prospect not found.' });

  const mod = prospectModuleFor(existing);

  // No-op guard (syncModule.js:151) — cheap for ONE record's payload, unlike
  // the bulk path where this ran 279+ times per save.
  if (JSON.stringify(existing.payload) === JSON.stringify(rec)) {
    return res.json({ prospect: existing.payload });
  }

  // Reassignment resolution (syncModule.js:154-159).
  const wantAssigned = rec.assignedTo ?? null;
  const curAssigned = existing.assignedTo ?? null;
  let nextAssigned = curAssigned;
  const assignmentRequested = wantAssigned !== curAssigned;
  if (assignmentRequested && mayAssignProspect(req.user)) nextAssigned = wantAssigned;

  const from = existing.stage ?? null;
  let to = rec.stage ?? null;
  let stageChanged = from !== to;

  // Non-task-shaped UPDATE branch (syncModule.js:204-258) — the ONLY branch
  // prospects ever uses (neither investmentProspects nor insuranceProspects
  // is in TASK_SHAPED_MODULES).
  const changedKeys = Object.keys(diffFields(existing.payload, rec))
    .filter((k) => k !== 'stage' && !NOISE_KEYS.has(k));
  const detailAllowed = changedKeys.length === 0 || canEdit(req.user, mod, existing);

  const intoPreQualified = mod === 'investmentProspects' && to === 'Pre-Qualified';
  const outOfPreQualified = mod === 'investmentProspects' && from === 'Pre-Qualified' && to === 'Qualified';
  const stageAllowed = !stageChanged || (
    intoPreQualified || outOfPreQualified
      ? isPreQualifiedOwner(req.user, existing)
      : canChangeStage(req.user, mod, existing, from, to)
        && (!isBackwardStage(mod, from, to) || canChangeStageBack(req.user, mod, existing))
  );

  let allowed = detailAllowed || stageAllowed;
  if (!allowed && nextAssigned !== curAssigned) allowed = true;
  if (!allowed) {
    return res.status(403).json({ error: 'You do not have permission to make this change.', prospect: existing.payload });
  }

  // Whichever aspect is disallowed reverts to its stored value instead of
  // voiding the whole save (syncModule.js:248-249) — e.g. a Service Manager
  // moving the stage alongside an unrelated field they can't touch still
  // gets their stage move applied.
  if (!detailAllowed) changedKeys.forEach((k) => { rec[k] = existing.payload[k]; });
  if (!stageAllowed) rec.stage = existing.stage;
  to = rec.stage ?? null;
  stageChanged = from !== to;
  if (JSON.stringify(existing.payload) === JSON.stringify(rec)) {
    return res.json({ prospect: existing.payload });
  }

  // Shared tail (syncModule.js:260-327): owner stamping, write, activity
  // logs, events.
  const owner = {
    createdBy: existing.createdBy,
    departmentOwner: existing.departmentOwner,
    assignedTo: nextAssigned,
  };
  const now = new Date();
  const payload = {
    ...rec, ...owner,
    createdAt: existing.createdAt?.toISOString?.() ?? existing.payload?.createdAt ?? undefined,
    updatedAt: now.toISOString(),
  };
  const threadBefore = Array.isArray(existing.payload?.comments) ? existing.payload.comments : [];
  const threadAfter = Array.isArray(payload?.comments) ? payload.comments : [];
  const fieldDiff = diffFields(existing.payload, payload,
    Object.keys(payload).filter((k) => !NOISE_KEYS.has(k) && k !== 'stage'));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.prospect.update({ where: { id: existing.id }, data: { ...promote(payload), ...owner, payload } });
      if (nextAssigned !== curAssigned) {
        await logActivity(tx, {
          module: mod, recordId: existing.id, action: 'ASSIGN',
          oldValue: { assignedTo: curAssigned }, newValue: { assignedTo: nextAssigned }, performedBy: req.user.id,
        });
      }
      if (stageChanged) {
        await logActivity(tx, {
          module: mod, recordId: existing.id, action: 'STAGE_CHANGE',
          oldValue: { stage: from }, newValue: { stage: to }, performedBy: req.user.id,
        });
      }
      if (Object.keys(fieldDiff).length) {
        await logActivity(tx, {
          module: mod, recordId: existing.id, action: 'UPDATE',
          oldValue: Object.fromEntries(Object.entries(fieldDiff).map(([k, v]) => [k, v.from])),
          newValue: Object.fromEntries(Object.entries(fieldDiff).map(([k, v]) => [k, v.to])),
          performedBy: req.user.id,
        });
      }
    });
  } catch (err) {
    console.error(`[prospects] update failed for ${existing.id}:`, err);
    return res.status(500).json({ error: 'Could not save this prospect. Please try again.' });
  }

  const events = [];
  if (nextAssigned !== curAssigned) events.push({ type: 'ASSIGN', module: mod, record: payload, from: curAssigned, to: nextAssigned, actorId: req.user.id });
  if (stageChanged) events.push({ type: 'STAGE_CHANGE', module: mod, record: payload, from, to, actorId: req.user.id });
  if (threadAfter.length > threadBefore.length) {
    events.push({ type: 'LOG_APPEND', module: mod, record: payload, actorId: req.user.id, entry: threadAfter[threadAfter.length - 1] });
  }

  res.json({ prospect: payload });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] prospects update:', err));
}));

// ---------------------------------------------------------------------------
// DELETE /:id — soft-delete ONE prospect, explicitly (not by omission —
// unlike the bulk path, so it needs no full-table comparison to work out
// what "wasn't in the array" means). Mirrors syncModule.js's DELETE branch
// (syncModule.js:341-359).
// ---------------------------------------------------------------------------
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Prospect not found.' });
  const mod = prospectModuleFor(existing);
  if (!canDelete(req.user, mod, existing)) {
    return res.status(403).json({ error: 'You do not have permission to delete this prospect.' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.prospect.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      await logActivity(tx, {
        module: mod, recordId: existing.id, action: 'DELETE',
        oldValue: summarize(existing.payload), performedBy: req.user.id,
      });
    });
  } catch (err) {
    console.error(`[prospects] delete failed for ${existing.id}:`, err);
    return res.status(500).json({ error: 'Could not delete this prospect. Please try again.' });
  }

  res.json({ ok: true });
  notifyFromEvents(prisma, [{ type: 'DELETE', module: mod, record: existing.payload, actorId: req.user.id }])
    .catch((err) => console.error('[notify] prospects delete:', err));
}));

// ---------------------------------------------------------------------------
// PUT / — bulk transport, UNCHANGED. Kept for any genuinely bulk operation;
// ordinary single-prospect UI actions no longer route through it (see the
// three routes above).
// ---------------------------------------------------------------------------
router.put('/', asyncHandler(async (req, res) => {
  const { prospects } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, {
    module: prospectModuleFor,
    modelKey: 'prospect',
    incoming: prospects,
    actor: req.user,
    stageField: 'stage',
    assignOnCreate: 'admin',
    assignOnEdit: 'admin',
    promote,
  });
  res.json({ ok: true, prospects: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] prospects:', err));
}));

export default router;
