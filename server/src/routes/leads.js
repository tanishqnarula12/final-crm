// Leads — bulk transport (whole-array PUT) preserved, but every create/edit/
// assign/delete is now validated + logged server-side via syncBulk. Rules:
//   • any user may create a lead (starts unassigned; createdBy = actor)
//   • only Admin may set/change the assigned RM (assignedTo)
//   • only the assigned RM (or Admin) may edit after assignment
//   • nobody deletes leads (omission never deletes)
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { syncBulk } from '../lib/syncModule.js';
import { notifyFromEvents } from '../lib/notify.js';
import { logActivity } from '../lib/activityLog.js';
import { canEdit, canChangeStage, isMatrixLoaded } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

const leadSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ leads: z.array(leadSchema) });

router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.lead.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json({ leads: rows.map((r) => r.payload) });
}));

// TEMPORARY diagnostic — Admin only, read-only. Runs the real syncBulk decision
// logic (imported, not reimplemented) against a live user+lead pair to explain
// exactly why an edit would be allowed/rejected. Remove after the Manish "can't
// mark lead Lost" investigation is closed.
router.get('/_diag', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { userId, leadId } = req.query;
  const [user, lead] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.lead.findUnique({ where: { id: leadId } }),
  ]);
  if (!user) return res.status(404).json({ error: 'user not found' });
  if (!lead) return res.status(404).json({ error: 'lead not found' });

  // Exactly what updateLead(id, { status: 'Lost', lostReason: '...' }) would
  // send: the stored payload with status swapped, stage untouched.
  const rec = { ...lead.payload, status: 'Lost', lostReason: 'diag-test' };
  const from = lead.stage ?? null;
  const to = rec.stage ?? null;
  const stageChanged = from !== to;

  const allowed = stageChanged
    ? canChangeStage(user, 'leads', lead, from, to)
    : canEdit(user, 'leads', lead);

  res.json({
    matrixLoaded: isMatrixLoaded(),
    user: { id: user.id, name: user.name, roles: user.roles, active: user.active },
    lead: {
      id: lead.id, name: lead.payload?.name,
      assignedTo: lead.assignedTo, ownerId: lead.ownerId, createdBy: lead.createdBy,
      stage: lead.stage, status: lead.status,
    },
    stageChanged, from, to,
    allowed,
  });
}));

// A deleted lead's still-pipeline children (Tasks/Meetings created against its
// leadId, before it's ever converted to a Client) have no DB-level FK/cascade
// — leadId is a plain string column, not a relation — so they'd otherwise
// linger forever, visible in Tasks/Meetings, pointing at a lead that no
// longer exists. Soft-delete them alongside the lead (never hard-delete,
// matching the rest of the app's policy) and log each one.
async function cascadeDeleteLeadChildren(leadIds, actorId) {
  if (!leadIds.length) return;
  const [tasks, meetings] = await Promise.all([
    prisma.task.findMany({ where: { leadId: { in: leadIds }, deletedAt: null } }),
    prisma.meeting.findMany({ where: { leadId: { in: leadIds }, deletedAt: null } }),
  ]);
  if (!tasks.length && !meetings.length) return;
  await prisma.$transaction(async (tx) => {
    for (const t of tasks) {
      await tx.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
      await logActivity(tx, {
        module: 'tasks', recordId: t.id, action: 'DELETE',
        oldValue: { id: t.id, leadId: t.leadId, reason: 'parent lead deleted' }, performedBy: actorId,
      });
    }
    for (const m of meetings) {
      await tx.meeting.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
      await logActivity(tx, {
        module: 'meetings', recordId: m.id, action: 'DELETE',
        oldValue: { id: m.id, leadId: m.leadId, reason: 'parent lead deleted' }, performedBy: actorId,
      });
    }
  });
}

router.put('/', asyncHandler(async (req, res) => {
  const { leads } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, {
    module: 'leads',
    modelKey: 'lead',
    incoming: leads,
    actor: req.user,
    stageField: 'stage',
    assignOnCreate: 'admin', // only Admin assigns an RM
    assignOnEdit: 'admin',
    promote: (l) => ({
      stage: l.stage ?? null,
      status: l.status ?? null,
      ownerId: l.ownerId ?? null,
      mobile: l.mobile ?? null,
    }),
  });
  const deletedLeadIds = events.filter((e) => e.type === 'DELETE').map((e) => e.record.id);
  await cascadeDeleteLeadChildren(deletedLeadIds, req.user.id);
  res.json({ ok: true, leads: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] leads:', err));
}));

export default router;
