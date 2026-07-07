// "My Profile" — the logged-in user's own HR-style profile (identity,
// contact, family, bank details). Unlike the other data modules, this is
// scoped implicitly to req.user.id (never a body-supplied id), so every
// authenticated user — including VIEWER — can read/update only their own
// profile; there is no cross-user access here by construction.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

// The profile shape is advisor-defined free-form data (see the frontend's
// defaultProfile()) — stored as-is.
const putSchema = z.object({ data: z.record(z.any()) });

router.get('/', asyncHandler(async (req, res) => {
  const row = await prisma.advisorProfile.findUnique({ where: { userId: req.user.id } });
  res.json({ profile: row?.data ?? null });
}));

router.put('/', asyncHandler(async (req, res) => {
  const { data } = parseBody(putSchema, req.body);
  const row = await prisma.advisorProfile.upsert({
    where: { userId: req.user.id },
    create: { userId: req.user.id, data },
    update: { data },
  });
  res.json({ profile: row.data });
}));

export default router;
