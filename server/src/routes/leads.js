// Leads — bulk transport (whole-array PUT) preserved, but every create/edit/
// assign/delete is now validated + logged server-side via syncBulk. Rules:
//   • any user may create a lead (starts unassigned; createdBy = actor)
//   • only Admin may set/change the assigned RM (assignedTo)
//   • only the assigned RM (or Admin) may edit after assignment
//   • nobody deletes leads (omission never deletes)
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { syncBulk } from '../lib/syncModule.js';
import { notifyFromEvents } from '../lib/notify.js';
import { logActivity } from '../lib/activityLog.js';
import { momCreateSchema } from '../lib/schemas.js';
import { canCreate, canEdit } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

const leadSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ leads: z.array(leadSchema) });

router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.lead.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json({ leads: rows.map((r) => r.payload) });
}));

// The Minutes of Meeting drafted against this lead (the "Create MoM" stage,
// before conversion — see routes/moms.js and clients.js's twin POST /:clientId/moms
// for the client-side equivalent used after conversion). Same 'mom' permission
// module/action either way.
router.get('/:leadId/moms', asyncHandler(async (req, res) => {
  const moms = await prisma.mom.findMany({
    where: { leadId: req.params.leadId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ moms });
}));

router.post('/:leadId/moms', asyncHandler(async (req, res) => {
  // Pass the parent lead so an ASSIGNED-scoped role (e.g. RM) can resolve
  // ownership against it — without a record, ASSIGNED always denies (see
  // permissions.js).
  const parentLead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
  if (!canCreate(req.user, 'mom', parentLead)) return res.status(403).json({ error: 'You cannot create MOMs.' });
  const data = parseBody(momCreateSchema, req.body);
  const mom = await prisma.mom.create({
    data: { ...data, leadId: req.params.leadId, createdBy: req.user.id },
  });
  await logActivity(prisma, {
    module: 'moms', recordId: mom.id, action: 'CREATE',
    newValue: { id: mom.id, leadId: mom.leadId }, performedBy: req.user.id,
  });
  res.status(201).json({ mom });
}));

// Moves this lead's MOM(s) over to the client it just converted into, so the
// draft the advisor spent the "Create MoM" stage on doesn't get orphaned —
// it shows up in the new client's own "Draft MOM" tab going forward, same as
// any MOM created there directly. Gated on lead-edit (converting the lead
// already requires it) rather than the MOM's own creator-only ownership, so
// whoever is allowed to convert the lead can carry its MOM along too.
const reparentMomsSchema = z.object({ clientId: z.string().min(1) });
router.post('/:leadId/moms/reparent', asyncHandler(async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  if (!canEdit(req.user, 'leads', lead)) return res.status(403).json({ error: 'You cannot move this lead\'s MOMs.' });
  const { clientId } = parseBody(reparentMomsSchema, req.body);
  const moms = await prisma.mom.findMany({ where: { leadId: req.params.leadId, deletedAt: null } });
  if (!moms.length) return res.json({ ok: true, moved: 0 });
  await prisma.$transaction(
    moms.map((m) => prisma.mom.update({ where: { id: m.id }, data: { clientId, leadId: null } }))
  );
  await Promise.all(moms.map((m) => logActivity(prisma, {
    module: 'moms', recordId: m.id, action: 'UPDATE',
    oldValue: { leadId: req.params.leadId, clientId: null }, newValue: { leadId: null, clientId },
    performedBy: req.user.id,
  })));
  res.json({ ok: true, moved: moms.length });
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
