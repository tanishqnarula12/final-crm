// Authentication & authorization middleware.
import { verifyToken } from '../lib/jwt.js';
import { config } from '../config.js';
import { prisma } from '../db.js';

// Populates req.user from the session cookie, or 401s. Also re-checks that the
// account still exists and is active on every request (so deactivating a user
// takes effect immediately, even with a valid unexpired token).
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, roles: true, active: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Session invalid' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalid or expired' });
  }
}

// Restricts a route to users holding at least one of the given roles. Use
// after requireAuth. (Users can hold multiple roles now.)
export const requireRole = (...roles) => (req, res, next) => {
  const held = req.user?.roles || [];
  if (!held.some((r) => roles.includes(r))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Convenience: any authenticated user may write. (VIEWER no longer exists;
// real authorization is enforced per-record by the RBAC engine below. Kept as
// a thin pass-through so existing route wiring stays valid.)
export const requireWrite = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
};
