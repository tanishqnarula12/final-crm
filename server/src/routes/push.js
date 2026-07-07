// Web Push subscription management — pairs a browser's push endpoint with the
// logged-in user so lib/webpush.js knows where to deliver OS-level
// notifications. The actual notification content/sending lives in
// lib/notify.js + lib/webpush.js; this route only manages subscriptions.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// POST /api/push/subscribe — upsert by endpoint. A shared browser/device that
// later logs in as someone else simply reassigns the subscription to them
// (endpoint is globally unique per browser install), so it never double-fires.
router.post('/subscribe', asyncHandler(async (req, res) => {
  const { endpoint, keys } = parseBody(subscribeSchema, req.body);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers['user-agent'] || null },
    update: { userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: req.headers['user-agent'] || null },
  });
  res.status(201).json({ ok: true });
}));

// POST /api/push/unsubscribe — called on logout so a shared/public device
// stops receiving this user's notifications once they've signed out.
router.post('/unsubscribe', asyncHandler(async (req, res) => {
  const { endpoint } = parseBody(unsubscribeSchema, req.body);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
  res.json({ ok: true });
}));

export default router;
