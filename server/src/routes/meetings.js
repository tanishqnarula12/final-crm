// Meetings — bulk transport. Full per-role enforcement (only creator edits)
// lands next pass; this pass honors the global rules: NO hard deletes (omitted
// rows are soft-deleted, not destroyed) and ownership is stamped (createdBy on
// create). Full object stored verbatim in `payload`; a few fields promoted.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

const meetingSchema = z.object({ id: z.string().min(1) }).passthrough();
const bulkSchema = z.object({ meetings: z.array(meetingSchema) });

router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.meeting.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  res.json({ meetings: rows.map((r) => r.payload) });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { meetings } = parseBody(bulkSchema, req.body);
  const ids = meetings.map((m) => m.id);

  await prisma.$transaction([
    // Soft-delete (not destroy) anything the client omitted.
    prisma.meeting.updateMany({
      where: { id: { notIn: ids.length ? ids : ['__none__'] }, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    ...meetings.map((m) =>
      prisma.meeting.upsert({
        where: { id: m.id },
        create: { id: m.id, clientId: m.clientId ?? null, groupLeaderId: m.groupLeaderId ?? null, leadId: m.leadId ?? null, status: m.status ?? null, createdBy: m.createdBy ?? req.user.id, assignedTo: m.assignedTo ?? null, payload: m },
        update: { clientId: m.clientId ?? null, groupLeaderId: m.groupLeaderId ?? null, leadId: m.leadId ?? null, status: m.status ?? null, assignedTo: m.assignedTo ?? null, payload: m },
      })
    ),
  ]);

  res.json({ ok: true });
}));

export default router;
