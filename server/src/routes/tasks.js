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
import { slimTask, slimTaskList, pickTaskFiles, canOpenTaskFiles, restoreTaskFiles } from '../lib/taskFiles.js';

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
  OTHER_ASSET: 'otherAssets', // Servicing → Other Assets (1 Oct 2026)
};
const taskModuleFor = (r) => COBR_WORKSPACE_MODULE[r?.relatedTo ?? r?.payload?.relatedTo] || 'tasks';

// Other Assets: one entry per applicant per asset sub-type. The key carries a
// reference number (account / folio / demat id) so several holdings of one
// type can be allowed later just by filling it in; it is always empty today.
// The app checks before saving; this is the backstop for two people saving
// the same asset at once. A clashing NEW asset is dropped; a clashing EDIT is
// swapped for the stored version, so it stays as it was (and a whole-list save
// never mistakes it for a delete).
const assetKey = (p) => (p?.relatedTo === 'OTHER_ASSET'
  ? [p.groupLeaderId, String(p.applicant || '').trim().toLowerCase(), p.assetSubType, String(p.referenceNumber || '').trim().toLowerCase()].join('|')
  : null);
async function holdDuplicateAssets(incoming, deletedIds = []) {
  if (!incoming.some((t) => t.relatedTo === 'OTHER_ASSET')) return { tasks: incoming, held: 0, droppedIds: [] };
  const stored = await prisma.task.findMany({
    where: { deletedAt: null, payload: { path: ['relatedTo'], equals: 'OTHER_ASSET' } },
    select: { id: true, payload: true },
  });
  const storedById = new Map(stored.map((r) => [r.id, r.payload]));
  const deleting = new Set(deletedIds);
  const keyOf = new Map(stored.filter((r) => !deleting.has(r.id)).map((r) => [r.id, assetKey(r.payload)]));
  const tasks = []; const droppedIds = []; let held = 0;
  for (const t of incoming) {
    const k = assetKey(t);
    const clash = k && [...keyOf].some(([id, key]) => id !== t.id && key === k);
    if (!clash) { if (k) keyOf.set(t.id, k); tasks.push(t); continue; }
    held++;
    if (storedById.has(t.id)) tasks.push(storedById.get(t.id));
    else droppedIds.push(t.id);
  }
  return { tasks, held, droppedIds };
}

// Tasks are private to the two people on them (assigner + assignee) — Admin
// sees everything; everyone else only sees tasks where they're involved.
// `?since=<version>` → `{ unchanged: true }` when nothing changed (lib/listVersion.js).
// `?slim=1` → attachments without their files (lib/taskFiles.js).
router.get('/', asyncHandler(async (req, res) => {
  const check = await checkUnchanged(req, res, prisma, ['tasks']);
  if (check.unchanged) return;
  const rows = await loadRowsCached(prisma, 'task', check.fingerprint);
  const visible = rows.filter((r) => can(req.user, taskModuleFor(r), 'view', r));
  const slim = req.query.slim ? slimTaskList(rows) : null;
  res.json({ tasks: visible.map((r) => (slim ? slim.get(r.id) : r.payload)), version: check.version });
}));

// GET /api/tasks/:id/files[?ids=a,b] — attachment files for one task:
// `{ files: { [attachmentId]: { dataUrl } } }`. For slim lists.
router.get('/:id/files', asyncHandler(async (req, res) => {
  const row = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!row || row.deletedAt) return res.status(404).json({ error: 'Task not found' });
  if (!(await canOpenTaskFiles(prisma, req.user, row, taskModuleFor))) return res.status(403).json({ error: 'Not allowed' });
  const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids.split(',').slice(0, 200) : null;
  res.set('Cache-Control', 'no-store');
  res.json({ files: pickTaskFiles(row.payload, ids) });
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
  const slim = req.query.slim ? slimTaskList(rows) : null;
  res.json({ tasks: closed.map((r) => (slim ? slim.get(r.id) : r.payload)) });
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
  const { tasks: sent } = parseBody(bulkSchema, req.body);
  await restoreTaskFiles(prisma, req.user, sent, taskModuleFor);
  const { tasks, held } = await holdDuplicateAssets(sent);
  const { list, stats, events } = await syncBulk(prisma, { ...syncSpec, incoming: tasks, actor: req.user });
  stats.rejected += held;
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
  const { tasks: sent, deletedIds } = parseBody(partialSchema, req.body);
  await restoreTaskFiles(prisma, req.user, sent, taskModuleFor);
  const { tasks, held, droppedIds } = await holdDuplicateAssets(sent, deletedIds);
  const { list, stats, events, removedIds } = await syncBulk(prisma, {
    ...syncSpec, incoming: tasks, actor: req.user, partial: true, deleteIds: deletedIds,
  });
  stats.rejected += held;
  // `?slim=1`: answer in the shape the browser keeps (files stay on the server).
  res.json({ ok: true, tasks: req.query.slim ? list.map(slimTask) : list, removedIds: [...removedIds, ...droppedIds], stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] tasks:', err));
}));

export default router;
