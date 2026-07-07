// GET /api/team — the real team directory: every active account, for
// assignment pickers across the CRM (RM, task assignee, meeting host, etc.).
// Replaces the old hardcoded TEAM_MEMBERS roster. Any authenticated user may
// read it (it's just names/roles, no secrets).
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, roles: true, profile: { select: { data: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({
    team: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles,
      jobTitle: u.profile?.data?.role || '',
    })),
  });
}));

export default router;
