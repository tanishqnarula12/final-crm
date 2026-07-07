# Team Fintness CRM — Backend API

Secure Node + Express + Prisma + PostgreSQL backend for the CRM.

**Portable by design:** the server talks to plain PostgreSQL via a single
`DATABASE_URL`. Use Supabase's Postgres now; to move to a self-hosted machine
(e.g. a Mac Mini) later, install Postgres + Node there and change that one
variable — no code changes.

---

## First-time setup

```bash
cd server
npm install
cp .env.example .env      # then edit .env (see below)
```

Fill in `.env`:

- **`DATABASE_URL`** — your Postgres connection string.
  - *Supabase:* Project Settings → Database → Connection string → **URI**
    (Session/Direct, port 5432).
  - *Local / Mac Mini:* `postgresql://postgres:PASSWORD@localhost:5432/fintness_crm`
- **`JWT_SECRET`** — a long random string. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **`CLIENT_ORIGIN`** — the frontend URL (dev default `http://localhost:5173`).
- **`SEED_ADMIN_*`** — the first admin account (change the password after first login).

Create the tables and the first admin:

```bash
npm run prisma:deploy   # apply migrations to the database in DATABASE_URL
npm run seed            # create the initial ADMIN user
```

## Run

```bash
npm run dev     # auto-restart on change (development)
# or
npm start       # plain start
```

The API listens on `http://localhost:4000`. Health check: `GET /health`.

> The frontend now needs this server running to log in. Start the API first,
> then run the frontend (`cd "goal management system" && npm run dev`).
> The frontend points at the API via `VITE_API_URL` in its `.env.local`
> (default `http://localhost:4000/api`).

## Accounts

There is **no public signup**. The seed creates one admin; that admin creates
everyone else from the in-app **Profile menu → User Management** screen.
Roles: `ADMIN` (all + user management), `MANAGER` (full read/write),
`VIEWER` (read-only).

## Moving hosts later (e.g. to a Mac Mini)

1. Install PostgreSQL + Node on the new machine.
2. Copy the `server/` folder there; `npm install`.
3. Set `DATABASE_URL` to the new Postgres; set a fresh `JWT_SECRET`.
4. `npm run prisma:deploy && npm run seed && npm start`.

No application code changes — only configuration.

## API surface (Phase 1)

| Method | Path              | Access | Purpose                        |
|--------|-------------------|--------|--------------------------------|
| GET    | `/health`         | public | Liveness check                 |
| POST   | `/api/auth/login` | public | Log in, sets httpOnly cookie   |
| POST   | `/api/auth/logout`| public | Clears the session cookie      |
| GET    | `/api/auth/me`    | auth   | Current user (session restore) |
| GET    | `/api/users`      | admin  | List users                     |
| POST   | `/api/users`      | admin  | Create a user                  |
| PATCH  | `/api/users/:id`  | admin  | Update role/name/active/password |
| DELETE | `/api/users/:id`  | admin  | Delete a user                  |
| POST   | `/api/push/subscribe`   | auth | Register this browser's Web Push subscription |
| POST   | `/api/push/unsubscribe` | auth | Remove this browser's subscription (called on logout) |

Data modules (clients, goals, MOMs, tasks, leads, meetings, prospects,
profile) are migrated to the API in Phase 2.

## Web Push (OS-level notifications)

Optional — set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (see
`.env.example`; generate with `npx web-push generate-vapid-keys`) to enable native
browser/OS notifications alongside the existing socket.io + REST bell panel. Unset,
this is silently disabled — nothing else is affected. See
[`../goal management system/deployment.md`](../goal%20management%20system/deployment.md#pwa--push-notifications)
for the full picture (frontend service worker, subscribe/unsubscribe flow).
