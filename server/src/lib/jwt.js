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
