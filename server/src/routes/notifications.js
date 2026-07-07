// In-app notifications — REST layer for the on-screen bell panel.
//
// Personal to req.user (never a body-supplied id), like routes/profile.js:
// every authenticated user — including VIEWER — reads and clears only their
// own notifications. Real-time delivery is handled by the socket gateway
// (lib/notify.js emits `notification:new`); this route serves the initial
// list + mark-as-read.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { serializeNotification } from '../lib/notify.js';

const router = Router();
router.use(requireAuth);

// GET /api/notifications — my unread notifications, newest first. "Read" rows
// are hidden (marking read makes a notification disappear), so we only return
// unread ones. Capped so a long-idle account can't pull thousands at once.
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.notification.findMany({
    where: { userId: req.user.id, readAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notifications: rows.map(serializeNotification) });
}));

// POST /api/notifications/:id/read — mark one read (it vanishes from the panel).
router.post('/:id/read', asyncHandler(async (req, res) => {
  // Scope the update to the caller's own rows — a foreign id updates nothing.
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Notification not found.' });
  res.json({ ok: true });
}));

// POST /api/notifications/read-all — clear every unread notification at once.
router.post('/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
}));

export default router;
