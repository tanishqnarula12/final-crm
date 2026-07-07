# Team Fintness CRM — Deployment Guide

The app is now two deployable pieces:

1. **`server/`** — the Node/Express + Prisma API. Owns the database and all auth. Must be deployed first (or at least deployed somewhere reachable) — the frontend cannot function without it.
2. **`goal management system/`** — the React/Vite frontend. A static build that talks to `server/` over HTTPS.

Local development instructions live in [`server/README.md`](../server/README.md) (backend) and this file (frontend + the combined picture). Start there for running everything on your own machine before deploying.

---

## Step 1: Database (PostgreSQL)

You need a reachable Postgres instance. Two options, and moving between them later is just a connection-string change:

* **Supabase (current default)** — Project Settings → Database → Connection string → URI (Session/Direct, port 5432). Supabase is used purely as a managed Postgres host here; the app does **not** use the Supabase JS SDK, Row Level Security, or Supabase Auth.
* **Self-hosted Postgres** (e.g. a Mac Mini, a VPS) — any reachable `postgresql://` URL works.

Either way, you end up with one `DATABASE_URL` value for Step 2.

---

## Step 2: Deploy the Backend (`server/`)

Deploy `server/` to any Node host (Render, Railway, Fly.io, a VPS, etc.). Steps:

1. Set environment variables (see `server/.env.example` for the full list):
   * `DATABASE_URL` — from Step 1.
   * `JWT_SECRET` — a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Different from your local dev secret.**
   * `CLIENT_ORIGIN` — the deployed frontend's URL (Step 3), so CORS allows it.
   * `NODE_ENV=production` — this also marks the session cookie `Secure` (HTTPS-only).
   * `SEED_ADMIN_*` — only needed the first time you run the seed.
2. Install deps and apply the schema:
   ```bash
   npm install
   npm run prisma:deploy   # applies migrations, does not prompt
   npm run seed            # creates the first ADMIN account — change its password after first login
   ```
3. Start it: `npm start`. Confirm `GET /health` responds.
4. There is **no public signup** — the seeded admin creates every other account from the in-app **Profile menu → User Management** screen once the frontend is live.

---

## Step 3: Deploy the Frontend (`goal management system/`)

The frontend is a static Vite build — deployable to Vercel, Netlify, or any static host.
It also builds as an installable **PWA** (manifest + service worker, `vite-plugin-pwa`),
with real OS-level push notifications — see "PWA & Push Notifications" below.

1. **Commit your code** to a private Git repository. Do **not** commit `.env.local`.
2. Set environment variables on your hosting provider:
   * `VITE_API_URL` = the deployed backend's API base, e.g. `https://api.yourdomain.com/api`
   * `VITE_VAPID_PUBLIC_KEY` = the **public** half of the VAPID keypair (see below) — must
     match `VAPID_PUBLIC_KEY` set on the backend. Not a secret; safe to expose.
3. Deploy (Vercel example):
   * **Framework Preset**: Vite
   * **Root Directory**: `goal management system`
   * **Build Command**: `npm run build` (default)
4. Once live, log in with the seeded admin account and create real team accounts from **User Management**.
5. **PWA requires HTTPS** (or `localhost`) — service workers refuse to register otherwise.
   Any of the hosts above serve HTTPS by default, so no extra config is needed there.

---

## PWA & Push Notifications

The CRM is installable (desktop + mobile "Add to Home Screen" / "Install App") and can push
real OS-level notifications — not just the in-app bell — even when the tab is in the
background or closed, via the [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).

**How it fits together:**
- `src/sw.js` — the custom service worker (built with `vite-plugin-pwa`'s `injectManifest`
  strategy). Precaches the app shell and handles `push` / `notificationclick`.
- `server/src/lib/webpush.js` + `server/src/routes/push.js` — sends the push and manages
  subscriptions (`PushSubscription` model). This is *in addition to*, not instead of, the
  existing socket.io live-notification stream and the REST-served bell panel — if push isn't
  configured, or the browser has no push support, everything else keeps working unchanged.

**One-time setup — generate a VAPID keypair** (do this once per environment; dev already has one):
```bash
cd server
npx web-push generate-vapid-keys
```
Set the three resulting values:
| Variable | Where | Secret? |
|---|---|---|
| `VAPID_PUBLIC_KEY` | `server/.env` | No |
| `VAPID_PRIVATE_KEY` | `server/.env` | **Yes — never commit or expose** |
| `VAPID_SUBJECT` | `server/.env` (default `mailto:mail@fintness.in`) | No |
| `VITE_VAPID_PUBLIC_KEY` | frontend hosting env vars | No — same value as `VAPID_PUBLIC_KEY` |

Leave these unset to disable Web Push entirely (the server logs a warning once and silently
skips sending; the in-app bell and socket notifications are unaffected).

**What the user sees:** after logging in, the browser asks for notification permission once
(never re-asked if declined). Granting it registers a push subscription with the backend.
From then on, every notification that would populate the bell (task assigned, meeting soon,
lead assigned, etc.) also arrives as a native OS notification, even if the CRM tab isn't
focused. Logging out unsubscribes the device — important on shared/reception computers.

**Icons:** `public/pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`,
`apple-touch-icon.png` and `favicon-32x32.png` were generated from the existing brand mark
(`src/assets/logo.png`). Regenerate them the same way if the logo changes (any image tool
that can export those five sizes on a white background works — nothing framework-specific).

---

## Moving the database later (e.g. to a self-hosted Mac Mini)

1. Install PostgreSQL + Node on the new machine.
2. Copy `server/` there; `npm install`.
3. Point `DATABASE_URL` at the new Postgres; set a fresh `JWT_SECRET`.
4. `npm run prisma:deploy && npm run seed && npm start`.
5. Point the frontend's `VITE_API_URL` at the new server's address and redeploy the frontend.

No application code changes — only configuration. This is the entire reason the backend was built against plain Postgres via Prisma instead of the Supabase SDK.

---

## Legacy note

This app previously shipped `database.sql` and `migration_*.sql` files describing the **old** schema from when the frontend talked to Supabase directly (no auth, public read/write policies). They've since been removed — the schema now lives entirely in `server/prisma/schema.prisma` and its migrations (`server/prisma/migrations/`).
