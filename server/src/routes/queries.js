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

const router = Router();
router.use(requireAuth);

const querySchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ queries: z.array(querySchema) });

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

export default router;
