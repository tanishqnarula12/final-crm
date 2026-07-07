// Admin-only user management. There is NO public signup: only an ADMIN can
// create accounts, set roles, reset passwords, and activate/deactivate users.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody, publicUser } from '../lib/validate.js';

const router = Router();

// Every route here requires an authenticated ADMIN.
router.use(requireAuth, requireRole('ADMIN'));

const roleEnum = z.enum([
  'ADMIN', 'RM', 'PORTFOLIO_MANAGER', 'INSURANCE_MANAGER',
  'SERVICE_MANAGER', 'OPERATIONS_MANAGER', 'INTERNAL_MANAGER', 'INTERNAL_USER',
]);
// A user can hold several permanent roles. ADMIN is singular and handled
// specially (see the guards below) — it can't be freely granted.
const rolesEnum = z.array(roleEnum).min(1, 'Select at least one role');

// The profile blob is the same free-form shape as the self-service "My
// Profile" page (see routes/profile.js / utils/advisorProfile.js on the
// frontend) — stored as-is, no field-by-field validation here.
const profileSchema = z.record(z.any()).optional();

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roles: rolesEnum.default(['INTERNAL_USER']),
  profile: profileSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  roles: rolesEnum.optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  profile: profileSchema,
});

// Exactly one ADMIN may exist. Nobody may grant ADMIN to another account or
// create a second admin; the sole admin can't drop their own ADMIN role.
async function assertAdminInvariant(res, { targetId, nextRoles, isSelf }) {
  const wantsAdmin = nextRoles?.includes('ADMIN');
  if (wantsAdmin) {
    const existingAdmin = await prisma.user.findFirst({ where: { roles: { has: 'ADMIN' } } });
    if (existingAdmin && existingAdmin.id !== targetId) {
      res.status(400).json({ error: 'There can only be one Admin. Remove Admin from the current admin first.' });
      return false;
    }
  } else if (isSelf) {
    res.status(400).json({ error: 'You cannot remove your own Admin role.' });
    return false;
  }
  return true;
}

// GET /api/users — list all users (newest first).
router.get('/', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ users: users.map(publicUser) });
}));

// GET /api/users/:id/profile — fetch a specific user's full profile
// (identity/contact/family/bank details), for prefilling the admin edit form.
router.get('/:id/profile', asyncHandler(async (req, res) => {
  const row = await prisma.advisorProfile.findUnique({ where: { userId: req.params.id } });
  res.json({ profile: row?.data ?? null });
}));

// POST /api/users — create a new user account. Optionally accepts a `profile`
// object (the same shape the "My Profile" page manages) so an admin can fill
// in a new team member's full details at creation time.
router.post('/', asyncHandler(async (req, res) => {
  const { name, email, password, roles, profile } = parseBody(createSchema, req.body);
  if (!(await assertAdminInvariant(res, { targetId: null, nextRoles: roles, isSelf: false }))) return;
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: await hashPassword(password),
      roles,
      ...(profile ? { profile: { create: { data: profile } } } : {}),
    },
  });
  res.status(201).json({ user: publicUser(user) });
}));

// PATCH /api/users/:id — update name/role/active/profile and/or reset password.
router.patch('/:id', asyncHandler(async (req, res) => {
  const patch = parseBody(updateSchema, req.body);
  const { id } = req.params;

  const isSelf = id === req.user.id;
  // Guard: an admin cannot deactivate themselves.
  if (isSelf && patch.active === false) {
    return res.status(400).json({ error: 'You cannot deactivate yourself.' });
  }
  // Single-admin invariant on any role change.
  if (patch.roles !== undefined) {
    if (!(await assertAdminInvariant(res, { targetId: id, nextRoles: patch.roles, isSelf }))) return;
  }

  const data = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.roles !== undefined) data.roles = patch.roles;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.password !== undefined) data.passwordHash = await hashPassword(patch.password);

  const user = await prisma.user.update({ where: { id }, data });

  if (patch.profile !== undefined) {
    await prisma.advisorProfile.upsert({
      where: { userId: id },
      create: { userId: id, data: patch.profile },
      update: { data: patch.profile },
    });
  }

  res.json({ user: publicUser(user) });
}));

// DELETE /api/users/:id — remove a user (cannot delete self).
router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  // No DB-level FK on push_subscriptions (userId is a loose reference, like
  // assignedTo elsewhere) — clean it up explicitly so a deleted user's device
  // doesn't linger and eat a doomed push attempt on every future notification.
  await prisma.pushSubscription.deleteMany({ where: { userId: req.params.id } });
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
