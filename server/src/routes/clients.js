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
import { canCreate, canEdit, canDelete } from '../lib/permissions.js';
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
    const dupe = await prisma.client.findFirst({ where: { pan: data.pan, deletedAt: null } });
    if (dupe) return res.status(409).json({ error: 'A client with this PAN already exists — group leader PAN must be unique.' });
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

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Client not found' });
  if (!canEdit(req.user, 'clients', existing)) {
    return forbidden(res, 'Only the Operations Manager can edit client details.');
  }
  const data = parseBody(clientUpdateSchema, req.body);
  if (data.pan && data.pan !== existing.pan) {
    const dupe = await prisma.client.findFirst({ where: { pan: data.pan, deletedAt: null, NOT: { id: existing.id } } });
    if (dupe) return res.status(409).json({ error: 'A client with this PAN already exists — group leader PAN must be unique.' });
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
  res.json({ client });
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
  if (!canCreate(req.user, 'mom')) return forbidden(res, 'You cannot create MOMs.');
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
