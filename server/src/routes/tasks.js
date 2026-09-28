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
import { checkUnchanged, tableFingerprint, loadRowsCached } from '../lib/listVersion.js';

const router = Router();
router.use(requireAuth);

const taskSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ tasks: z.array(taskSchema) });
const partialSchema = z.object({ tasks: z.array(taskSchema), deletedIds: z.array(z.string().min(1)).default([]) });

// COBR (Change of Broker) records are Task rows tagged `relatedTo: 'COBR'` —
// a distinct, separately admin-configurable matrix column ('cobr') under the
// same assigner/assignee task overlay, resolved per-record here exactly like
// investment/insurance prospects split from a single `prospects` concept.
// `relatedTo` isn't a promoted column, so it's read from either shape
// syncBulk hands this: the incoming payload directly (create) or the stored
// Prisma row, where it only exists nested under `.payload` (update/delete).
// The COBR workspace owns five registers — Change of Broker itself plus
// Renewals, Claims, Fixed Deposits and Other Insurance Policies. All five are
// Task rows and all five are governed by the single existing `cobr`
// permission-matrix column, so adding them needed no new matrix rows.
// The COBR workspace's other four registers each got their own matrix column
// (2026-08-21) — only COBR itself still shares the single 'cobr' column.
const COBR_WORKSPACE_MODULE = {
  COBR: 'cobr',
  RENEWAL: 'renewals',
  CLAIM: 'claims',
  FD: 'fixedDeposits',
  POLICY: 'otherInsurancePolicies',
};
const taskModuleFor = (r) => COBR_WORKSPACE_MODULE[r?.relatedTo ?? r?.payload?.relatedTo] || 'tasks';

// Tasks are private to the two people on them (assigner + assignee) — Admin
// sees everything; everyone else only sees tasks where they're involved.
// `?since=<version>` → `{ unchanged: true }` when nothing changed (lib/listVersion.js).
router.get('/', asyncHandler(async (req, res) => {
  const check = await checkUnchanged(req, res, prisma, ['tasks']);
  if (check.unchanged) return;
  const rows = await loadRowsCached(prisma, 'task', check.fingerprint);
  const visible = rows.filter((r) => can(req.user, taskModuleFor(r), 'view', r));
  res.json({ tasks: visible.map((r) => r.payload), version: check.version });
}));

// GET /api/tasks/closed-for-client/:clientId — CLOSED tasks (Completed/Lost)
// for a specific client, visible to ANYONE who can view that client, not just
// the task's participants. Open/in-progress tasks stay confidential (only the
// assigner/assignee/sub-person see them, via GET /); but once a task is closed
// it surfaces in the client's profile "Closed Activities" for the whole team,
// for transparency on completed work.
router.get('/closed-for-client/:clientId', asyncHandler(async (req, res) => {
  const { clientId } = req.params;
  const client = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!can(req.user, 'clients', 'view', client)) return res.status(403).json({ error: 'Not allowed' });

  const rows = await loadRowsCached(prisma, 'task', await tableFingerprint(prisma, 'tasks'));
  const closed = rows.filter((r) => {
    const p = r.payload || {};
    const forClient = p.groupLeaderId === clientId || p.groupLeader === client.name;
    const isClosed = p.stage === 'Completed' || p.stage === 'Lost';
    return forClient && isClosed;
  });
  res.json({ tasks: closed.map((r) => r.payload) });
}));

const syncSpec = {
  module: taskModuleFor,
  modelKey: 'task',
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
};

// Whole-list save — what older browsers still send.
router.put('/', asyncHandler(async (req, res) => {
  const { tasks } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, { ...syncSpec, incoming: tasks, actor: req.user });
  res.json({ ok: true, tasks: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] tasks:', err));
}));

// PATCH / — only the tasks that changed (+ `deletedIds` for removed ones).
// Same per-record rules as the whole-list PUT above, but a one-task edit no
// longer uploads, re-reads and re-downloads every task with its attachments
// (~9 MB in Sep 2026). Answers with just the touched tasks as now stored, and
// `removedIds` for touched ones that are gone or no longer visible to you.
// A separate route, not a flag on PUT: a browser on this code talking to an
// older server gets a 404 and falls back to the whole-list PUT, instead of
// that server reading a short list as "delete everything else".
router.patch('/', asyncHandler(async (req, res) => {
  const { tasks, deletedIds } = parseBody(partialSchema, req.body);
  const { list, stats, events, removedIds } = await syncBulk(prisma, {
    ...syncSpec, incoming: tasks, actor: req.user, partial: true, deleteIds: deletedIds,
  });
  res.json({ ok: true, tasks: list, removedIds, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] tasks:', err));
}));

export default router;
