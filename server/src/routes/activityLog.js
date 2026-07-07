// GET /api/activity-log — the audit trail (Admin only). Optional filters:
// ?module=leads&recordId=xyz&limit=200. Each row is enriched with the
// performer's real name so the log reads as real people, never hardcoded ones.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { listActivity } from '../lib/activityLog.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', asyncHandler(async (req, res) => {
  const { module, recordId } = req.query;
  const where = {};
  if (module) where.moduleName = String(module);
  if (recordId) where.recordId = String(recordId);
  res.json({ logs: await listActivity(prisma, where, Number(req.query.limit) || 200) });
}));

export default router;
