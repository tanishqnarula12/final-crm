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

export const NOTICE_TYPES = ['GENERAL', 'ANNOUNCEMENT', 'HOLIDAY', 'BIRTHDAY', 'EVENT'];
const MANAGER_ROLES = ['ADMIN', 'INTERNAL_MANAGER'];
const isManager = (user) => (user.roles || []).some((r) => MANAGER_ROLES.includes(r));

const createSchema = z.object({
  type: z.enum(NOTICE_TYPES).default('GENERAL'),
  title: z.string().trim().min(1, 'Title is required').max(140, 'Keep the title under 140 characters'),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Keep the message under 2000 characters'),
});

export const serializeNotice = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  createdBy: n.createdBy,
  createdAt: n.createdAt,
  updatedAt: n.updatedAt,
});

// GET /api/notices — the most recent posts, newest first. Open to anyone
// signed in; no per-record scoping.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.notice.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notices: rows.map(serializeNotice) });
}));

// POST /api/notices — anyone may post. Broadcast live to every connected
// dashboard (emitToAll), not just via the per-user notification — the board
// is open to everyone, so every open tab should see it appear instantly, the
// same way presence/typing already broadcast to everyone.
router.post('/', asyncHandler(async (req, res) => {
  const { type, title, message } = parseBody(createSchema, req.body);
  const row = await prisma.notice.create({
    data: { type, title, message, createdBy: req.user.id },
  });
  const notice = serializeNotice(row);
  res.status(201).json({ notice });
  emitToAll('notice:new', { notice });
  notifyNoticePosted(prisma, row, req.user.name).catch((err) => console.error('[notify] notice posted:', err));
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
