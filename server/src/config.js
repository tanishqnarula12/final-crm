// Centralized, validated environment configuration.
// Everything that reads process.env goes through here so misconfiguration
// fails loudly at startup instead of surfacing as confusing runtime errors.
import dotenv from 'dotenv';

dotenv.config();

const required = (key) => {
  const val = process.env[key];
  if (!val || !val.trim()) {
    throw new Error(`Missing required environment variable: ${key}. Copy server/.env.example to server/.env and fill it in.`);
  }
  return val;
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  tokenTtl: process.env.TOKEN_TTL || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  // Name of the auth cookie carrying the session JWT.
  cookieName: 'fintness_session',
  // Web Push (VAPID). Optional: if unset, push sending is silently skipped —
  // the in-app bell + socket notifications keep working regardless (see
  // lib/notify.js). Generate a pair with `npx web-push generate-vapid-keys`;
  // the public half is also baked into the frontend build as VITE_VAPID_PUBLIC_KEY.
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:mail@fintness.in',
  },
  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Administrator',
    email: process.env.SEED_ADMIN_EMAIL || 'mail@fintness.in',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe#2026',
  },
  // Portfolio Review (AI PDF analysis) — server-side only, never sent to the browser.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
