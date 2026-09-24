// Clients + nested Goals + nested Moms.
//
// RBAC (this pass): only the Operations Manager (or Admin) may create an
// applicant or edit personal details; deletion is soft-only and Admin-only;
// every write is logged. Field names match the frontend's camelCase shapes so
// bodies pass through with minimal reshaping.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { goalCreateSchema, momCreateSchema } from '../lib/schemas.js';
import { can, canCreate, canEdit, canDelete } from '../lib/permissions.js';
import { findPanConflict, panConflictMessage, normalizePan } from '../lib/panUniqueness.js';
import { logActivity, diffFields, listActivity } from '../lib/activityLog.js';

const router = Router();
router.use(requireAuth);

// clientDetails keys that hold an assigned account id (the internal-team
// pickers) rather than a plain value — resolved to real names before logging
// so the trail reads "Relationship Manager: Nitesh Luthra → Mehul Khandelwal"
// instead of raw cuids.
const MANAGER_DETAIL_KEYS = new Set([
  'relationshipManager', 'portfolioManager', 'insuranceManager',
  'serviceManager', 'owner', 'operationManager', 'internalManager',
]);

// A readable one-line summary of a family member for log entries — never the
// raw object (dob/mobile/pan aren't diff-worthy at this granularity).
const familyMemberLabel = (f) => `${f?.name || 'Unnamed'}${f?.relation ? ` (${f.relation})` : ''}`;

// Builds the combined "what changed" map for a clients.PATCH: top-level scalar
// fields + every clientDetails field except `attachments` (which gets its own
// per-document UPLOAD/DELETE/RENAME entries — see cascadeDocumentLogs below).
// Manager-id fields are resolved to names; familyDetails is condensed to a
// name list instead of full member objects.
async function buildClientUpdateDiff(prisma, existing, updated) {
  const topDiff = diffFields(existing, updated, ['name', 'pan', 'age', 'assumptions', 'assignedTo']);

  const { attachments: _oldAtt, ...oldDetails } = existing.clientDetails || {};
  const { attachments: _newAtt, ...newDetails } = updated.clientDetails || {};
  const detailsDiff = diffFields(oldDetails, newDetails);

  if (detailsDiff.familyDetails) {
    detailsDiff.familyDetails = {
      from: (detailsDiff.familyDetails.from || []).map(familyMemberLabel),
      to: (detailsDiff.familyDetails.to || []).map(familyMemberLabel),
    };
  }

  const managerIds = new Set();
  for (const key of Object.keys(detailsDiff)) {
    if (!MANAGER_DETAIL_KEYS.has(key)) continue;
    if (detailsDiff[key].from) managerIds.add(detailsDiff[key].from);
    if (detailsDiff[key].to) managerIds.add(detailsDiff[key].to);
  }
  if (managerIds.size) {
    const users = await prisma.user.findMany({ where: { id: { in: [...managerIds] } }, select: { id: true, name: true } });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const key of Object.keys(detailsDiff)) {
      if (!MANAGER_DETAIL_KEYS.has(key)) continue;
      const { from, to } = detailsDiff[key];
      detailsDiff[key] = { from: (from && nameById.get(from)) || from || null, to: (to && nameById.get(to)) || to || null };
    }
  }

  return { ...topDiff, ...detailsDiff };
}

// Documents live in clientDetails.attachments — diffed separately (by id) so
// each upload/delete/rename gets its own clear log entry instead of being
// buried in a giant clientDetails.attachments array dump.
async function logDocumentChanges(prisma, clientId, existing, updated, performedBy) {
  const oldAtt = existing.clientDetails?.attachments || [];
  const newAtt = updated.clientDetails?.attachments || [];
  const oldById = new Map(oldAtt.filter((a) => a?.id).map((a) => [a.id, a]));
  const newById = new Map(newAtt.filter((a) => a?.id).map((a) => [a.id, a]));

  for (const [id, doc] of newById) {
    if (!oldById.has(id)) {
      await logActivity(prisma, {
        module: 'clients', recordId: clientId, action: 'UPLOAD_DOCUMENT',
        newValue: { name: doc.name, category: doc.category, applicantName: doc.applicantName }, performedBy,
      });
    }
  }
  for (const [id, doc] of oldById) {
    if (!newById.has(id)) {
      await logActivity(prisma, {
        module: 'clients', recordId: clientId, action: 'DELETE_DOCUMENT',
        oldValue: { name: doc.name, category: doc.category, applicantName: doc.applicantName }, performedBy,
      });
    }
  }
  for (const [id, doc] of newById) {
    const before = oldById.get(id);
    if (before && (before.name !== doc.name || before.category !== doc.category || before.applicantName !== doc.applicantName)) {
      await logActivity(prisma, {
        module: 'clients', recordId: clientId, action: 'RENAME_DOCUMENT',
        oldValue: { name: before.name }, newValue: { name: doc.name }, performedBy,
      });
    }
  }
}

const clientCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pan: z.string().optional().default(''),
  age: z.coerce.number().optional().default(0),
  assumptions: z.string().optional().default(''),
  clientDetails: z.record(z.any()).optional().default({}),
  assignedTo: z.string().optional(), // RM account id
});

const clientUpdateSchema = z.object({
  name: z.string().optional(),
  pan: z.string().optional(),
  age: z.coerce.number().optional(),
  assumptions: z.string().optional(),
  assetAllocation: z.any().optional(),
  clientDetails: z.record(z.any()).optional(),
  assignedTo: z.string().optional(),
});

const include = { goals: true, moms: true };
const forbidden = (res, msg) => res.status(403).json({ error: msg });

// GET /api/clients — every non-deleted client with nested goals + moms.
router.get('/', asyncHandler(async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    include: { goals: { where: { deletedAt: null } }, moms: { where: { deletedAt: null } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ clients });
}));

router.post('/', asyncHandler(async (req, res) => {
  if (!canCreate(req.user, 'clients')) {
    return forbidden(res, 'Only the Operations Manager can create applicants.');
  }
  const data = parseBody(clientCreateSchema, req.body);
  if (data.pan) {
    const conflict = await findPanConflict(data.pan);
    if (conflict) return res.status(409).json({ error: panConflictMessage(conflict, data.pan) });
    data.pan = normalizePan(data.pan);
  }
  // The real "Relationship Manager" picker (Client Profile / Internal Team
  // Assignments) writes clientDetails.relationshipManager, not the dedicated
  // `assignedTo` RBAC column — keep them in sync so this client's contextual
  // RM (used everywhere: Goals, Proposals, Prospects, MOM, Reviews) is always
  // resolvable from the one real column, not a JSON field parse.
  const assignedTo = data.assignedTo ?? data.clientDetails?.relationshipManager ?? null;
  const client = await prisma.client.create({
    data: { ...data, assignedTo, createdBy: req.user.id, departmentOwner: req.user.roles?.[0] || null },
    include,
  });
  await logActivity(prisma, {
    module: 'clients', recordId: client.id, action: 'CREATE',
    newValue: { id: client.id, name: client.name, pan: client.pan }, performedBy: req.user.id,
  });
  res.status(201).json({ client });
}));

// A client PATCH carries several unrelated things, each governed by its OWN
// matrix row. It used to demand Clients → Edit Personal Details for all of
// them, so e.g. a Portfolio Manager granted Asset Allocation → Edit, or anyone
// granted Documents → Upload, was still refused on save. Each part is now
// checked against its own right:
//   name / pan / age / assignedTo / clientDetails (bar attachments)
//                                   → Clients · Edit Personal Details
//   assumptions (Goal Report's planning notes) → Goal Report · Edit
//   assetAllocation                 → Asset Allocation · Edit
//   clientDetails.attachments       → Documents · Upload (add / rename) and
//                                     Documents · Delete (remove)
// Callers send the whole clientDetails object even to add one document, so
// every part is diffed against the stored client and only what actually
// changed is checked. A part the user may not change keeps its stored value
// (which also stops a stale browser copy from undoing someone else's edit);
// if nothing they asked for is allowed, the request is refused with the
// specific right that's missing.
const PERSONAL_TOP_KEYS = ['name', 'pan', 'age', 'assignedTo'];

const attachmentKey = (a) => (a && typeof a === 'object' ? (a.id ? `id:${a.id}` : `file:${a.fileName || ''}:${a.name || ''}`) : `str:${a}`);

function authorizeClientPatch(user, existing, data) {
  const refusals = [];
  const out = { ...data };
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  let applied = 0;

  // Top-level personal fields.
  const personalTopChanged = PERSONAL_TOP_KEYS.filter((k) => k in data && !same(data[k], existing[k]));
  const oldDetails = existing.clientDetails || {};
  const newDetails = data.clientDetails;
  const detailKeysChanged = newDetails
    ? [...new Set([...Object.keys(oldDetails), ...Object.keys(newDetails)])]
      .filter((k) => k !== 'attachments' && !same(newDetails[k], oldDetails[k]))
    : [];
  const mayEditPersonal = canEdit(user, 'clients', existing);
  if (personalTopChanged.length || detailKeysChanged.length) {
    if (mayEditPersonal) applied++;
    else {
      refusals.push('edit this client\'s personal details');
      personalTopChanged.forEach((k) => { delete out[k]; });
    }
  }

  // Goal Report planning notes.
  if ('assumptions' in data && !same(data.assumptions, existing.assumptions)) {
    if (can(user, 'goals', 'edit', existing)) applied++;
    else { refusals.push('edit this client\'s goal planning notes'); delete out.assumptions; }
  }

  // Asset allocation.
  if ('assetAllocation' in data && !same(data.assetAllocation, existing.assetAllocation)) {
    if (can(user, 'assetAllocation', 'edit', existing)) applied++;
    else { refusals.push('edit this client\'s asset allocation'); delete out.assetAllocation; }
  }

  // Documents, merged per item onto the STORED list so an allowed upload
  // never drags along a removal (or vice versa) the user may not make.
  let attachments = oldDetails.attachments;
  if (newDetails && 'attachments' in newDetails && !same(newDetails.attachments, oldDetails.attachments)) {
    const before = Array.isArray(oldDetails.attachments) ? oldDetails.attachments : [];
    const after = Array.isArray(newDetails.attachments) ? newDetails.attachments : [];
    const beforeByKey = new Map(before.map((a) => [attachmentKey(a), a]));
    const afterKeys = new Set(after.map(attachmentKey));
    const mayUpload = can(user, 'documents', 'upload', existing);
    const mayDelete = can(user, 'documents', 'delete', existing);
    let uploadRefused = false, deleteRefused = false;

    const merged = [];
    for (const a of after) {
      const prev = beforeByKey.get(attachmentKey(a));
      if (!prev) { // added
        if (mayUpload) { merged.push(a); applied++; } else uploadRefused = true;
      } else if (!same(prev, a)) { // renamed / re-categorised
        if (mayUpload) { merged.push(a); applied++; } else { merged.push(prev); uploadRefused = true; }
      } else merged.push(a);
    }
    for (const a of before) { // removed
      if (afterKeys.has(attachmentKey(a))) continue;
      if (mayDelete) applied++;
      else { merged.push(a); deleteRefused = true; }
    }
    if (uploadRefused) refusals.push('upload documents for this client');
    if (deleteRefused) refusals.push('delete this client\'s documents');
    attachments = merged;
  }

  if (newDetails) {
    // Personal detail keys the user may not change keep their stored values.
    const details = mayEditPersonal ? { ...newDetails } : { ...oldDetails };
    if (attachments === undefined) delete details.attachments;
    else details.attachments = attachments;
    out.clientDetails = details;
  }

  return { data: out, refusals, applied };
}

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Client not found' });
  const requested = parseBody(clientUpdateSchema, req.body);
  const { data, refusals, applied } = authorizeClientPatch(req.user, existing, requested);
  if (refusals.length && applied === 0) {
    return forbidden(res, `You don't have permission to ${refusals.join(' or ')}.`);
  }
  if (data.pan && normalizePan(data.pan) !== normalizePan(existing.pan)) {
    const conflict = await findPanConflict(data.pan, { excludeClientId: existing.id });
    if (conflict) return res.status(409).json({ error: panConflictMessage(conflict, data.pan) });
    data.pan = normalizePan(data.pan);
  }
  // Keep the RBAC `assignedTo` column in sync whenever the Relationship
  // Manager picker changes clientDetails.relationshipManager (see POST above).
  if (data.assignedTo === undefined && data.clientDetails?.relationshipManager !== undefined) {
    data.assignedTo = data.clientDetails.relationshipManager || null;
  }
  const client = await prisma.client.update({ where: { id: req.params.id }, data, include });

  const changed = await buildClientUpdateDiff(prisma, existing, client);
  if (Object.keys(changed).length) {
    await logActivity(prisma, {
      module: 'clients', recordId: client.id, action: 'UPDATE',
      oldValue: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])),
      newValue: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])),
      performedBy: req.user.id,
    });
  }
  await logDocumentChanges(prisma, client.id, existing, client, req.user.id);
  res.json({ client, ...(refusals.length ? { refused: refusals } : {}) });
}));

// GET /api/clients/:id/activity — this client's audit trail (personal-detail
// edits, document uploads/renames/deletes, manager reassignments). Any
// authenticated user may view it — Clients aren't view-scoped in this app
// (any logged-in account can already see any client's other tabs), so this
// matches the existing exposure level; only the ADMIN-only, unfiltered
// cross-module dashboard (routes/activityLog.js) stays locked down.
router.get('/:id/activity', asyncHandler(async (req, res) => {
  const logs = await listActivity(prisma, { moduleName: 'clients', recordId: req.params.id });
  res.json({ logs });
}));

// Soft-delete only, Admin only (canDelete returns false for non-admins;
// admin bypasses). Cascades a soft-delete to the client's goals + moms.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Client not found' });
  if (!canDelete(req.user, 'clients', existing)) {
    return forbidden(res, 'Records cannot be deleted.');
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.client.update({ where: { id: req.params.id }, data: { deletedAt: now } }),
    prisma.goal.updateMany({ where: { clientId: req.params.id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.mom.updateMany({ where: { clientId: req.params.id, deletedAt: null }, data: { deletedAt: now } }),
  ]);
  await logActivity(prisma, {
    module: 'clients', recordId: req.params.id, action: 'DELETE',
    oldValue: { id: existing.id, name: existing.name }, performedBy: req.user.id,
  });
  res.json({ ok: true });
}));

// Nested creation — goals/moms are always created under a client. Both belong
// to Portfolio Manager / assigned RM workflows; enforcement for those modules
// lands next pass, so creation here stays open to authenticated users but is
// stamped with ownership + logged.
router.post('/:clientId/goals', asyncHandler(async (req, res) => {
  // Fetch the parent client so a contextual-RM (ASSIGNED scope) create right
  // can be resolved — goals are a 'client'-kind module, so "assigned" means
  // "you are this client's assigned RM," which only a real client record can answer.
  const parentClient = await prisma.client.findUnique({ where: { id: req.params.clientId } });
  if (!canCreate(req.user, 'goals', parentClient)) return forbidden(res, 'You cannot create goals.');
  const data = parseBody(goalCreateSchema, req.body);
  const goal = await prisma.goal.create({
    data: { ...data, clientId: req.params.clientId, createdBy: req.user.id },
  });
  await logActivity(prisma, {
    module: 'goals', recordId: goal.id, action: 'CREATE',
    newValue: { id: goal.id, name: goal.name, clientId: goal.clientId }, performedBy: req.user.id,
  });
  res.status(201).json({ goal });
}));

router.post('/:clientId/moms', asyncHandler(async (req, res) => {
  // Pass the parent client so an ASSIGNED-scoped role (e.g. RM) can resolve
  // ownership against it — without a record, ASSIGNED always denies (see
  // permissions.js), which is exactly the bug this used to have.
  const parentClient = await prisma.client.findUnique({ where: { id: req.params.clientId } });
  if (!canCreate(req.user, 'mom', parentClient)) return forbidden(res, 'You cannot create MOMs.');
  const data = parseBody(momCreateSchema, req.body);
  const mom = await prisma.mom.create({
    data: { ...data, clientId: req.params.clientId, createdBy: req.user.id },
  });
  await logActivity(prisma, {
    module: 'moms', recordId: mom.id, action: 'CREATE',
    newValue: { id: mom.id, clientId: mom.clientId }, performedBy: req.user.id,
  });
  res.status(201).json({ mom });
}));

export default router;
