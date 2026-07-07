// Authentication routes: login / logout / me.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { verifyPassword, hashPassword } from '../lib/password.js';
import { signToken, cookieOptions } from '../lib/jwt.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody, publicUser } from '../lib/validate.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// POST /api/auth/login — verify credentials, set the httpOnly session cookie.
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Same generic message whether the email is unknown or the password is wrong,
  // so we don't leak which accounts exist.
  const invalid = () => res.status(401).json({ error: 'Invalid email or password.' });
  if (!user || !user.active) return invalid();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id });
  res.cookie(config.cookieName, token, cookieOptions());
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/logout — clear the session cookie.
router.post('/logout', (req, res) => {
  res.clearCookie(config.cookieName, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// GET /api/auth/me — current session's user (used by the frontend to restore
// auth state on load and to gate the UI by role).
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/change-password — self-service password change. Any
// authenticated account (including VIEWER) may change their own password,
// but only by proving they know the current one first. This is deliberately
// separate from the admin "Reset Password" field in routes/users.js, which
// lets an ADMIN set a new password for someone else without knowing the old
// one (account recovery) — this route never allows that.
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.json({ ok: true });
}));

export default router;
