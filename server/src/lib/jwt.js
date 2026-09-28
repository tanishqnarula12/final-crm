// Session token helpers. The JWT is stored in an httpOnly cookie (see
// middleware/auth.js), so it is never readable by frontend JavaScript.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const signToken = (payload) =>
  jwt.sign(payload, config.jwtSecret, { expiresIn: config.tokenTtl });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

// Cookie options for the session cookie. Secure only in production (so it also
// works over plain http://localhost in dev).
export const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  path: '/',
});

// Sessions are renewed while in use: once a token is 12 hours old (or half its
// lifetime, if TOKEN_TTL is shorter), /auth/me and /auth/renew hand out a
// fresh one. Someone who uses the CRM daily stays signed in; a session still
// ends after TOKEN_TTL (7 days) of no use. Before this, a login ended exactly
// 7 days after signing in, even mid-work, and the next save failed with
// "Not authenticated". Only those two routes renew — never ordinary data
// requests — so a background refresh finishing just after "Log out" can't
// set a fresh cookie and quietly sign the user back in.
const RENEW_AFTER_SEC = 12 * 60 * 60;

export function renewSessionIfOld(res, claims) {
  if (!claims?.sub || !claims.iat || !claims.exp) return false;
  const age = Math.floor(Date.now() / 1000) - claims.iat;
  if (age < Math.min(RENEW_AFTER_SEC, Math.floor((claims.exp - claims.iat) / 2))) return false;
  res.cookie(config.cookieName, signToken({ sub: claims.sub }), cookieOptions());
  return true;
}
