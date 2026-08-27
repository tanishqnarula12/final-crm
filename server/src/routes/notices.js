// Dashboard notice board — open to every user: anyone may post, anyone may
// read, deliberately NOT gated by the admin-configurable permission matrix
// (unlike tasks/prospects/etc.) since "open for all" is the whole point.
// Only deletion is restricted (the poster, or Admin/Internal Manager for
// moderation), and the system-generated daily birthday post (createdBy
// null — see notificationScheduler.js) can only be removed by an admin.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { notifyNoticePosted } from '../lib/notify.js';
import { emitToAll } from '../chat/socket.js';

const router = Router();
router.use(requireAuth);

export const NOTICE_TYPES = ['GENERAL', 'ANNOUNCEMENT', 'HOLIDAY', 'BIRTHDAY', 'EVENT', 'LEAVE'];
const MANAGER_ROLES = ['ADMIN', 'INTERNAL_MANAGER'];
const isManager = (user) => (user.roles || []).some((r) => MANAGER_ROLES.includes(r));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

// Local YYYY-MM-DD — mirrors notificationScheduler.js's localDateKey exactly
// (same server-local-timezone convention every date field in this app uses).
const localDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const createSchema = z.object({
  type: z.enum(NOTICE_TYPES).default('GENERAL'),
  title: z.string().trim().min(1, 'Title is required').max(140, 'Keep the title under 140 characters'),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Keep the message under 2000 characters'),
  // The date it should start showing — omitted/today means "post now" (today's
  // existing behavior); a future date schedules it (see the scheduler's
  // runScheduledNotices). visibleForDays is how long it stays up once
  // triggered; null/omitted = never expires.
  date: z.string().regex(dateRe, 'Invalid date').optional(),
  visibleForDays: z.number().int().positive().nullable().optional(),
});

export const serializeNotice = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  createdBy: n.createdBy,
  effectiveDate: n.effectiveDate,
  expiresAt: n.expiresAt,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

const endOfDayExpiry = (effectiveDate, visibleForDays) => {
  if (!visibleForDays) return null;
  const d = new Date(`${effectiveDate}T00:00:00`);
  d.setDate(d.getDate() + visibleForDays);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Shared by every automated poster (the daily birthday job, an approved
// Full Day leave) — createdBy stays null (a system post, not attributed to
// whoever triggered it), always posts for today with no expiry (neither
// caller schedules ahead), and is broadcast live the same way a normal post
// is. `dedupeKey` is only needed by callers that might otherwise fire twice
// (the scheduler's recurring tick); a P2002 there is swallowed, not thrown,
// so a duplicate attempt is just a no-op.
export async function postSystemNotice(prisma, { type, title, message, dedupeKey = null }) {
  try {
    const row = await prisma.notice.create({
      data: { type, title, message, createdBy: null, dedupeKey, effectiveDate: localDateKey(), triggered: true },
    });
    emitToAll('notice:new', { notice: serializeNotice(row) });
    return row;
  } catch (err) {
    if (err?.code === 'P2002') return null; // duplicate dedupeKey — already posted
    throw err;
  }
}

// GET /api/notices — the most recent posts, newest first. Open to anyone
// signed in; no per-record scoping. A notice whose effective date hasn't
// arrived, or whose expiry has passed, is excluded — it isn't "deleted", it's
// just not currently live (see runScheduledNotices for the live trigger/expiry
// broadcast that keeps an already-open dashboard in sync with this filter).
router.get('/', asyncHandler(async (req, res) => {
  const now = new Date();
  const rows = await prisma.notice.findMany({
    where: {
      deletedAt: null,
      effectiveDate: { lte: localDateKey(now) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notices: rows.map(serializeNotice) });
}));

// POST /api/notices — anyone may post, optionally scheduled for a future
// date and/or set to auto-expire after N days. A same-day (or past — treated
// as today) post broadcasts immediately, exactly like before; a future date
// is saved but stays invisible to everyone (including the poster) until the
// scheduler's daily sweep triggers and broadcasts it that day.
router.post('/', asyncHandler(async (req, res) => {
  const { type, title, message, date, visibleForDays } = parseBody(createSchema, req.body);
  const todayKey = localDateKey();
  const effectiveDate = date && date > todayKey ? date : todayKey;
  const expiresAt = endOfDayExpiry(effectiveDate, visibleForDays);
  const triggered = effectiveDate <= todayKey;

  const row = await prisma.notice.create({
    data: { type, title, message, createdBy: req.user.id, effectiveDate, expiresAt, triggered },
  });
  const notice = serializeNotice(row);
  res.status(201).json({ notice, scheduled: !triggered });
  if (triggered) {
    emitToAll('notice:new', { notice });
    notifyNoticePosted(prisma, row, req.user.name).catch((err) => console.error('[notify] notice posted:', err));
  }
}));

// DELETE /api/notices/:id — the poster, or Admin/Internal Manager. The daily
// system birthday post (createdBy null) has no poster, so only a manager can
// remove it.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.notice.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Notice not found.' });
  const isOwner = existing.createdBy && existing.createdBy === req.user.id;
  if (!isOwner && !isManager(req.user)) {
    return res.status(403).json({ error: 'You can only remove your own notices.' });
  }
  await prisma.notice.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
  emitToAll('notice:deleted', { id: existing.id });
}));

export default router;
