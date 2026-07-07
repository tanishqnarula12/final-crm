// Tasks — bulk transport preserved, enforcement + logging via syncBulk. Rules:
//   • everyone may create; assignedBy (departmentOwner) auto-captured = creator
//   • only assignedBy (or Admin) may edit / reopen / move a stage backward
//   • the assignee may move forward but NOT to a previous stage
//   • nobody hard-deletes; every change logged
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { syncBulk } from '../lib/syncModule.js';
import { can } from '../lib/permissions.js';
import { notifyFromEvents } from '../lib/notify.js';

const router = Router();
router.use(requireAuth);

const taskSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ tasks: z.array(taskSchema) });

// COBR (Change of Broker) records are Task rows tagged `relatedTo: 'COBR'` —
// a distinct, separately admin-configurable matrix column ('cobr') under the
// same assigner/assignee task overlay, resolved per-record here exactly like
// investment/insurance prospects split from a single `prospects` concept.
// `relatedTo` isn't a promoted column, so it's read from either shape
// syncBulk hands this: the incoming payload directly (create) or the stored
// Prisma row, where it only exists nested under `.payload` (update/delete).
const taskModuleFor = (r) => ((r?.relatedTo ?? r?.payload?.relatedTo) === 'COBR' ? 'cobr' : 'tasks');

// Tasks are private to the two people on them (assigner + assignee) — Admin
// sees everything; everyone else only sees tasks where they're involved.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.task.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, taskModuleFor(r), 'view', r));
  res.json({ tasks: visible.map((r) => r.payload) });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { tasks } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, {
    module: taskModuleFor,
    modelKey: 'task',
    incoming: tasks,
    actor: req.user,
    stageField: 'stage',
    assignOnCreate: 'anyone', // the creator picks the assignee
    assignOnEdit: 'editor',   // only assignedBy may reassign later
    deptOwnerIsActor: true,   // departmentOwner = assignedBy = creator
    promote: (t) => ({
      leadId: t.leadId ?? null,
      stage: t.stage ?? null,
      groupLeaderId: t.groupLeaderId ?? null,
      assignedTo: t.assignedTo ?? null,
    }),
  });
  res.json({ ok: true, tasks: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] tasks:', err));
}));

export default router;
