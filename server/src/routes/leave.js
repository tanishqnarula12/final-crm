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
const timeRe = /^\d{2}:\d{2}$/;
const LEAVE_TYPES = ['Full Day', 'Half Day', 'Early Leave', 'Late Entry'];
const HALF_DAY_SLOTS = ['First Half', 'Second Half'];

const applySchema = z.object({
  fromDate: z.string().regex(dateRe, 'Invalid date'),
  toDate: z.string().regex(dateRe, 'Invalid date'),
  leaveType: z.enum(LEAVE_TYPES).default('Full Day'),
  halfDaySlot: z.enum(HALF_DAY_SLOTS).optional().nullable(),
  timeValue: z.string().regex(timeRe, 'Invalid time').optional().nullable(),
  reason: z.string().trim().min(1, 'Reason is required'),
});

// Half Day/Early Leave/Late Entry each need their own extra detail, and are
// single-day concepts regardless of what fromDate/toDate the client sent — a
// "half day" spanning a date range makes no sense. Returns { error } (send it
// as-is, 400) or { data } (the normalized body to save) — mirrors the
// existing inline `if (...) return res.status(400)...` style in this file
// rather than introducing a throw-based error type.
function normalizeLeaveType(body) {
  const { leaveType, halfDaySlot, timeValue } = body;
  if (leaveType === 'Half Day' && !halfDaySlot) {
    return { error: 'Pick First Half or Second Half.' };
  }
  if ((leaveType === 'Early Leave' || leaveType === 'Late Entry') && !timeValue) {
    return { error: leaveType === 'Early Leave' ? "Pick the time you'll leave." : 'Pick your expected arrival time.' };
  }
  return {
    data: {
      ...body,
      toDate: leaveType === 'Full Day' ? body.toDate : body.fromDate,
      halfDaySlot: leaveType === 'Half Day' ? halfDaySlot : null,
      timeValue: (leaveType === 'Early Leave' || leaveType === 'Late Entry') ? timeValue : null,
    },
  };
}
const respondSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  message: z.string().trim().optional(),
});

const serialize = (r) => ({
  id: r.id,
  createdBy: r.createdBy,
  fromDate: r.fromDate,
  toDate: r.toDate,
  leaveType: r.leaveType || 'Full Day',
  halfDaySlot: r.halfDaySlot,
  timeValue: r.timeValue,
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
  const parsed = parseBody(applySchema, req.body);
  if (parsed.toDate < parsed.fromDate) return res.status(400).json({ error: '"To" date cannot be before the "From" date.' });
  const { error, data } = normalizeLeaveType(parsed);
  if (error) return res.status(400).json({ error });
  const { fromDate, toDate, leaveType, halfDaySlot, timeValue, reason } = data;

  const row = await prisma.leave.create({
    data: { createdBy: req.user.id, fromDate, toDate, leaveType, halfDaySlot, timeValue, reason, status: 'Pending' },
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

  const parsed = parseBody(applySchema, req.body);
  if (parsed.toDate < parsed.fromDate) return res.status(400).json({ error: '"To" date cannot be before the "From" date.' });
  const { error, data: normalized } = normalizeLeaveType(parsed);
  if (error) return res.status(400).json({ error });
  const { fromDate, toDate, leaveType, halfDaySlot, timeValue, reason } = normalized;

  const wasRejected = existing.status === 'Rejected';
  const data = { fromDate, toDate, leaveType, halfDaySlot, timeValue, reason };
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
