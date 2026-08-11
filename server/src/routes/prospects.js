// Business Prospects — bulk transport (see routes/leads.js for the pattern),
// now with REAL per-role enforcement via syncBulk. Prospects split into two
// permission modules depending on `proposalCategory`:
//   'insurance'            -> insuranceProspects (Insurance Manager only)
//   'investment'/'othercode' -> investmentProspects (Portfolio Manager / RM
//                                edit details; Service Manager changes stage)
// syncBulk resolves the module per-record via `prospectModuleFor`, so a
// single bulk save can contain a mix of both categories and each row is
// checked against its own rule.
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

const prospectSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ prospects: z.array(prospectSchema) });

const prospectModuleFor = (r) => (r?.proposalCategory === 'insurance' ? 'insuranceProspects' : 'investmentProspects');

router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.prospect.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, prospectModuleFor(r), 'view', r));
  res.json({ prospects: visible.map((r) => r.payload) });
}));

// GET /api/prospects/:id/activity — this prospect's modification history
// (who edited what, and every stage change). Gated behind the same 'view'
// check as the list route — a Pre-Qualified prospect's activity log is just
// as sensitive as the record itself, so someone who can't see the prospect
// (e.g. a Service Manager before the RM moves it to Qualified) can't see its
// history either. logActivity/syncBulk already write CREATE/UPDATE/
// STAGE_CHANGE/ASSIGN/DELETE entries for every prospect save — nothing new
// to write here, just a scoped read.
router.get('/:id/activity', asyncHandler(async (req, res) => {
  const row = await prisma.prospect.findUnique({ where: { id: req.params.id } });
  if (!row || row.deletedAt) return res.status(404).json({ error: 'Prospect not found' });
  if (!can(req.user, prospectModuleFor(row), 'view', row)) return res.status(403).json({ error: 'Not permitted' });
  const logs = await listActivity(prisma, { moduleName: prospectModuleFor(row), recordId: req.params.id });
  res.json({ logs });
}));

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
    promote: (p) => ({
      groupLeaderId: p.groupLeaderId ?? null,
      proposalCategory: p.proposalCategory ?? null,
      stage: p.stage ?? null,
    }),
  });
  res.json({ ok: true, prospects: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] prospects:', err));
}));

export default router;
