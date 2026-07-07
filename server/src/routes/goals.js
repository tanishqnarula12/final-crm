// Update/delete a single goal by id. Creation happens nested under a client
// (POST /api/clients/:clientId/goals) — see routes/clients.js.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { goalUpdateSchema } from '../lib/schemas.js';
import { logActivity } from '../lib/activityLog.js';
import { can } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.goal.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Goal not found' });
  if (!can(req.user, 'goals', 'edit', existing)) return res.status(403).json({ error: 'You cannot edit this goal.' });
  const data = parseBody(goalUpdateSchema, req.body);
  const goal = await prisma.goal.update({ where: { id: req.params.id }, data });
  await logActivity(prisma, {
    module: 'goals', recordId: goal.id, action: 'UPDATE',
    newValue: { id: goal.id, name: goal.name }, performedBy: req.user.id,
  });
  res.json({ goal });
}));

// Soft-delete (global rule: no hard deletes). The row is hidden from reads via
// the `deletedAt: null` filter on the clients include.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.goal.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Goal not found' });
  if (!can(req.user, 'goals', 'delete', existing)) return res.status(403).json({ error: 'Records cannot be deleted.' });
  await prisma.goal.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  await logActivity(prisma, {
    module: 'goals', recordId: req.params.id, action: 'DELETE', performedBy: req.user.id,
  });
  res.json({ ok: true });
}));

export default router;
