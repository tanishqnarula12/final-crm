// Meetings — bulk transport preserved, enforcement + logging via syncBulk.
// Rules: anyone may create/schedule a meeting; only the CREATOR (or Admin /
// Internal Manager per the matrix) may edit, mark done, cancel, or reschedule
// it afterwards — matches the schema's long-standing `createdBy` comment
// ("only creator can edit") that the old hand-rolled upsert never enforced.
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

const meetingSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ meetings: z.array(meetingSchema) });

// Meetings are visible to everyone by default (matrix view = ALL) — this GET
// intentionally does NOT filter by ownership, only by can(...,'view',...) per
// row, so a custom matrix that scopes view down still works correctly.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.meeting.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, 'meetings', 'view', r));
  res.json({ meetings: visible.map((r) => r.payload) });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { meetings } = parseBody(bulkSchema, req.body);
  const { list, stats, events } = await syncBulk(prisma, {
    module: 'meetings',
    modelKey: 'meeting',
    incoming: meetings,
    actor: req.user,
    assignOnCreate: 'anyone', // the creator can name a host (assignedTo)
    assignOnEdit: 'editor',   // only the creator may change it later
    promote: (m) => ({
      clientId: m.clientId ?? null,
      groupLeaderId: m.groupLeaderId ?? null,
      leadId: m.leadId ?? null,
      status: m.status ?? null,
      assignedTo: m.assignedTo ?? null,
    }),
  });
  res.json({ ok: true, meetings: list, stats });
  notifyFromEvents(prisma, events).catch((err) => console.error('[notify] meetings:', err));
}));

export default router;
