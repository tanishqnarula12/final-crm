// Queries — internal staff Q&A, bulk transport + enforcement via syncBulk.
// Same two-party shape as Tasks: whoever raises it (departmentOwner) vs.
// whoever it's raised to (assignedTo). Rules:
//   • everyone may create; raisedBy (departmentOwner) auto-captured = creator
//   • only the raiser (or Admin) may edit the query's own details / reopen it
//   • the recipient may move the stage forward but NOT back to a previous one
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
import { listActivity } from '../lib/activityLog.js';

const router = Router();
router.use(requireAuth);

const querySchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ queries: z.array(querySchema) });

// ~5MB of raw file ≈ 6.9MB once base64-encoded; the app-wide JSON body limit is
// 25mb, so one file per request stays comfortably inside it.
const attachmentSchema = z.object({
  name: z.string().min(1).max(300),
  type: z.string().max(200).default('application/octet-stream'),
  size: z.coerce.number().default(0),
  dataUrl: z.string().min(1).max(7_000_000, 'Attachment too large (max ~5MB per file)'),
});

// Loads a query and checks the caller may see it (the same two-party rule the
// bulk route enforces), 404/403-ing otherwise. Returns null once it has
// responded, so callers just `if (!q) return;`.
async function loadVisibleQuery(req, res, id) {
  const row = await prisma.query.findFirst({ where: { id, deletedAt: null } });
  if (!row) {
    res.status(404).json({ error: 'Query not found.' });
    return null;
  }
  if (!can(req.user, 'queries', 'view', row)) {
    res.status(403).json({ error: 'You do not have access to this query.' });
    return null;
  }
  return row;
}

// Queries are private to the two people on them (raiser + recipient) — Admin
// sees everything; everyone else only sees queries they're involved in.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.query.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, 'queries', 'view', r));
  res.json({ queries: visible.map((r) => r.payload) });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { queries } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, {
    module: 'queries',
    modelKey: 'query',
    incoming: queries,
    actor: req.user,
    stageField: 'stage',
    assignOnCreate: 'anyone', // the raiser picks who it's raised to
    assignOnEdit: 'editor',   // only the raiser may reassign later
    deptOwnerIsActor: true,   // departmentOwner = raisedBy = creator
    promote: (q) => ({
      stage: q.stage ?? null,
      category: q.category ?? null,
      assignedTo: q.assignedTo ?? null,
    }),
  });
  res.json({ ok: true, queries: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] queries:', err));
}));

// GET /api/queries/:id/activity — this query's audit trail: every field-level
// change (category/text edits, stage moves, reassignment), each stamped with
// who did it and when — same pattern as the per-client log
// (routes/clients.js), just scoped to whoever may VIEW this query (the raiser,
// the recipient, or Admin) rather than open to anyone. Remarks/comments have
// their own thread already (the `remarks` field) and are deliberately NOT
// duplicated in here — this is the "what changed", not the conversation.
router.get('/:id/activity', asyncHandler(async (req, res) => {
  const q = await loadVisibleQuery(req, res, req.params.id);
  if (!q) return;
  const logs = await listActivity(prisma, { moduleName: 'queries', recordId: q.id });
  res.json({ logs });
}));

// ---------------------------------------------------------------------------
// Attachments — see the QueryAttachment model for why these live outside the
// query payload. Anyone who may VIEW the query may list, open and add files;
// removing one is restricted to whoever uploaded it (or an Admin).
// ---------------------------------------------------------------------------

// Metadata only — never the base64 blob, so opening a query stays light no
// matter how many (or how large) its files are.
router.get('/:id/attachments', asyncHandler(async (req, res) => {
  const q = await loadVisibleQuery(req, res, req.params.id);
  if (!q) return;
  const attachments = await prisma.queryAttachment.findMany({
    where: { queryId: q.id },
    select: { id: true, name: true, type: true, size: true, uploadedBy: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ attachments });
}));

// One file WITH its data — fetched on demand when the user opens/downloads it.
router.get('/:id/attachments/:attId', asyncHandler(async (req, res) => {
  const q = await loadVisibleQuery(req, res, req.params.id);
  if (!q) return;
  const attachment = await prisma.queryAttachment.findFirst({
    where: { id: req.params.attId, queryId: q.id },
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });
  res.json({ attachment });
}));

router.post('/:id/attachments', asyncHandler(async (req, res) => {
  const q = await loadVisibleQuery(req, res, req.params.id);
  if (!q) return;
  const data = parseBody(attachmentSchema, req.body);
  const row = await prisma.queryAttachment.create({
    data: { ...data, queryId: q.id, uploadedBy: req.user.id },
    select: { id: true, name: true, type: true, size: true, uploadedBy: true, createdAt: true },
  });
  res.status(201).json({ attachment: row });
}));

router.delete('/:id/attachments/:attId', asyncHandler(async (req, res) => {
  const q = await loadVisibleQuery(req, res, req.params.id);
  if (!q) return;
  const row = await prisma.queryAttachment.findFirst({
    where: { id: req.params.attId, queryId: q.id },
    select: { id: true, uploadedBy: true },
  });
  if (!row) return res.status(404).json({ error: 'Attachment not found.' });
  if (row.uploadedBy !== req.user.id && !req.user.roles.includes('ADMIN')) {
    return res.status(403).json({ error: 'You can only remove attachments you uploaded.' });
  }
  await prisma.queryAttachment.delete({ where: { id: row.id } });
  res.json({ ok: true });
}));

export default router;
