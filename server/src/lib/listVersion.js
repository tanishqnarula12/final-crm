// "Has this list changed since I last fetched it?" — for the browser's
// 12-second background refresh.
//
// Every open Dashboard / Clients / Tasks / Prospects screen re-requests its
// whole list every 12 seconds. Almost always nothing changed, yet each request
// read the full table out of Supabase and sent all of it to the browser. For
// clients (document files inline) and tasks (attachments inline) that was tens
// of megabytes per tick, which is what overran the Supabase egress quota
// (681 GB of 250 GB by 28 Sep 2026) and kept the API too busy to answer saves.
//
// Now each list response carries a `version`; the browser sends it back as
// `?since=`. When nothing it could see has changed, the answer is a tiny
// `{ unchanged: true }` and no table data is read at all. The version is a
// fingerprint of every row's id + updatedAt + deletedAt (small heap columns —
// the big JSON columns are never touched), mixed with who is asking (id and
// roles) and the permission matrix's version, since those decide which rows a
// user sees. A random per-process id is mixed in too, so a restart (possibly
// with a different matrix) always re-sends once.
import crypto from 'crypto';
import { permissionsVersion } from './permissions.js';

const BOOT_ID = crypto.randomBytes(8).toString('hex');

// Table names are fixed strings from our own routes, never user input.
const FINGERPRINT_SQL = (table) => `SELECT md5(coalesce(string_agg(
    id || '|' || "updatedAt"::text || '|' || coalesce("deletedAt"::text, ''), ',' ORDER BY id), '')) AS fp,
  count(*)::int AS n FROM "${table}"`;

export async function tableFingerprint(prisma, table) {
  const [row] = await prisma.$queryRawUnsafe(FINGERPRINT_SQL(table));
  return `${row.fp}:${row.n}`;
}

export async function tablesFingerprint(prisma, tables) {
  const parts = await Promise.all(tables.map((t) => tableFingerprint(prisma, t)));
  return parts.join('/');
}

// The version a given user gets for a given data fingerprint.
export function listVersion(user, fingerprint) {
  return crypto.createHash('sha1')
    .update([BOOT_ID, permissionsVersion(), user?.id || '', [...(user?.roles || [])].sort().join(','), fingerprint].join('|'))
    .digest('base64url');
}

// A table's non-deleted rows, read once per fingerprint and shared by every
// request until something changes (the per-user visibility filter still runs
// on each request). Tasks carry their attachments inline (~9 MB), so this is
// what keeps a busy afternoon of refreshes from re-reading them from Supabase.
const rowCaches = new Map();

export async function loadRowsCached(prisma, modelKey, fingerprint) {
  const hit = rowCaches.get(modelKey);
  if (hit && fingerprint && hit.fingerprint === fingerprint) return hit.rows;
  const rows = await prisma[modelKey].findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  if (fingerprint) rowCaches.set(modelKey, { fingerprint, rows });
  return rows;
}

// Answers `{ unchanged: true, version }` and returns true when the caller's
// `?since=` still matches. Otherwise returns the version to send with the list.
export async function checkUnchanged(req, res, prisma, tables) {
  res.set('Cache-Control', 'no-store');
  const fingerprint = await tablesFingerprint(prisma, tables);
  const version = listVersion(req.user, fingerprint);
  if (req.query.since && req.query.since === version) {
    res.json({ unchanged: true, version });
    return { unchanged: true, version, fingerprint };
  }
  return { unchanged: false, version, fingerprint };
}
