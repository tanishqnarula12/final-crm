// Leave requests — deliberately NOT routed through syncBulk() (see the
// Prisma model comment in schema.prisma for why): apply / edit(re-apply) /
// respond(approve-reject) are three distinct, asymmetric actions performed
// by different parties, served here as plain, explicit REST endpoints.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { can } from '../lib/permissions.js';
import { logActivity } from '../lib/activityLog.js';
import { notifyLeaveApplied, notifyLeaveResponded } from '../lib/notify.js';

const router = Router();
router.use(requireAuth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const applySchema = z.object({
  fromDate: z.string().regex(dateRe, 'Invalid date'),
  toDate: z.string().regex(dateRe, 'Invalid date'),
  reason: z.string().trim().min(1, 'Reason is required'),
});
const respondSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  message: z.string().trim().optional(),
});

const serialize = (r) => ({
  id: r.id,
  createdBy: r.createdBy,
  fromDate: r.fromDate,
  toDate: r.toDate,
  reason: r.reason,
  status: r.status,
  responseMessage: r.responseMessage,
  respondedBy: r.respondedBy,
  respondedAt: r.respondedAt,
  history: r.history,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// GET /api/leave — your own requests; Admin/Internal Manager get everyone's
// (the matrix's `view: ALL` for them, resolved the same way every other
// view-filtered list in this app is).
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.leave.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  const visible = rows.filter((r) => can(req.user, 'leave', 'view', r));
  res.json({ leaves: visible.map(serialize) });
}));

// POST /api/leave — apply for leave. Anyone may create their own.
router.post('/', asyncHandler(async (req, res) => {
  const { fromDate, toDate, reason } = parseBody(applySchema, req.body);
  if (toDate < fromDate) return res.status(400).json({ error: '"To" date cannot be before the "From" date.' });

  const row = await prisma.leave.create({
    data: { createdBy: req.user.id, fromDate, toDate, reason, status: 'Pending' },
  });
  await logActivity(prisma, { module: 'leave', recordId: row.id, action: 'CREATE', newValue: serialize(row), performedBy: req.user.id });
  res.status(201).json({ leave: serialize(row) });
  notifyLeaveApplied(prisma, row).catch((err) => console.error('[notify] leave applied:', err));
}));

// PATCH /api/leave/:id — edit your own request. Used for the "re-apply with
// a modified reason" flow: editing a Rejected request resets it to Pending
// (pushing the old decision into `history` first) and re-notifies approvers;
// an Approved request is locked (no editing after the fact).
router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.leave.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Leave request not found.' });
  if (!can(req.user, 'leave', 'editDetails', existing)) {
    return res.status(403).json({ error: 'You can only edit your own leave request.' });
  }
  if (existing.status === 'Approved') {
    return res.status(400).json({ error: 'An approved leave request can no longer be edited.' });
  }

  const { fromDate, toDate, reason } = parseBody(applySchema, req.body);
  if (toDate < fromDate) return res.status(400).json({ error: '"To" date cannot be before the "From" date.' });

  const wasRejected = existing.status === 'Rejected';
  const data = { fromDate, toDate, reason };
  if (wasRejected) {
    data.status = 'Pending';
    data.responseMessage = null;
    data.respondedBy = null;
    data.respondedAt = null;
    data.history = [
      ...(Array.isArray(existing.history) ? existing.history : []),
      { status: existing.status, message: existing.responseMessage, by: existing.respondedBy, at: existing.respondedAt },
    ];
  }

  const row = await prisma.leave.update({ where: { id: existing.id }, data });
  await logActivity(prisma, {
    module: 'leave', recordId: row.id, action: wasRejected ? 'STAGE_CHANGE' : 'UPDATE',
    oldValue: serialize(existing), newValue: serialize(row), performedBy: req.user.id,
  });
  res.json({ leave: serialize(row) });
  if (wasRejected) notifyLeaveApplied(prisma, row).catch((err) => console.error('[notify] leave re-applied:', err));
}));

// POST /api/leave/:id/respond — Admin / Internal Manager only: approve or
// reject, with an optional message either way.
router.post('/:id/respond', asyncHandler(async (req, res) => {
  const existing = await prisma.leave.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Leave request not found.' });
  if (!can(req.user, 'leave', 'respond', existing)) {
    return res.status(403).json({ error: 'You do not have permission to approve or reject leave requests.' });
  }
  if (existing.status !== 'Pending') {
    return res.status(400).json({ error: `This request is already ${existing.status.toLowerCase()}.` });
  }

  const { decision, message } = parseBody(respondSchema, req.body);
  const row = await prisma.leave.update({
    where: { id: existing.id },
    data: { status: decision, responseMessage: message || null, respondedBy: req.user.id, respondedAt: new Date() },
  });
  await logActivity(prisma, {
    module: 'leave', recordId: row.id, action: 'STAGE_CHANGE',
    oldValue: serialize(existing), newValue: serialize(row), performedBy: req.user.id,
  });
  res.json({ leave: serialize(row) });
  notifyLeaveResponded(prisma, row).catch((err) => console.error('[notify] leave responded:', err));
}));

export default router;
