# Team Fintness CRM — Monorepo

Wealth advisory CRM: client/goal planning, leads, tasks, meetings, proposals, and business prospects, under the **Team Fintness** brand.

See [`context.md`](context.md) for the full architecture writeup and running feature/change log.

## Layout

```
crm 2.0/
├── server/                    # Node/Express + Prisma + PostgreSQL API — auth, all data
├── goal management system/    # React + Vite frontend (the CRM itself)
└── other tools on html/       # Standalone single-file tools (MOM builder, Policy Review)
```

## Running locally

Two processes, started in order:

```bash
# 1. Backend — see server/README.md for first-time setup (env vars, DB migrate, seed admin)
cd server
npm install
npm run dev            # http://localhost:4000

# 2. Frontend — in a second terminal
cd "goal management system"
npm install
npm run dev            # http://localhost:5173
```

Log in with the admin account created by `server`'s seed script, then create real team accounts from **Profile menu → User Management** (admin-only — there is no public signup).

## Deploying

See [`goal management system/deployment.md`](goal%20management%20system/deployment.md) for the full guide (database, backend host, frontend host, and how to move the database to a self-hosted machine later without a rewrite).

## Security model, in short

- No hardcoded credentials anywhere in the shipped frontend — auth is a real bcrypt + JWT httpOnly-cookie session against `server/`.
- Roles: `ADMIN` (+ user management), `MANAGER` (read/write), `VIEWER` (read-only, enforced server-side).
- The database is plain PostgreSQL reached only through `server/` via Prisma — no vendor-specific SDK or RLS in the data path, so it isn't locked to any one host.
