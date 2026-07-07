// Update/delete a single Minutes-of-Meeting record by id. Creation happens
// nested under a client (POST /api/clients/:clientId/moms) — see routes/clients.js.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { momUpdateSchema } from '../lib/schemas.js';
import { logActivity } from '../lib/activityLog.js';
import { can } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.mom.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'MOM not found' });
  // MOM: only the creator (or Admin) may edit.
  if (!can(req.user, 'mom', 'edit', existing)) return res.status(403).json({ error: 'Only the creator can edit this MOM.' });
  const data = parseBody(momUpdateSchema, req.body);
  const mom = await prisma.mom.update({ where: { id: req.params.id }, data });
  await logActivity(prisma, {
    module: 'moms', recordId: mom.id, action: 'UPDATE', performedBy: req.user.id,
  });
  res.json({ mom });
}));

// Soft-delete (global rule: no hard deletes).
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.mom.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'MOM not found' });
  if (!can(req.user, 'mom', 'delete', existing)) return res.status(403).json({ error: 'Records cannot be deleted.' });
  await prisma.mom.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  await logActivity(prisma, {
    module: 'moms', recordId: req.params.id, action: 'DELETE', performedBy: req.user.id,
  });
  res.json({ ok: true });
}));

export default router;
