// Activity-log helper — every create/edit/delete/assign/stage-change appends
// a row to `activity_logs`. `performedBy` is always a real User.id; the
// activity-log API resolves it to the user's name for display.

// JSON.stringify with object keys sorted at every level, so two objects with
// identical content but different key ORDER compare equal. This matters
// because Postgres JSONB does NOT preserve object key insertion order — a
// value read back from a `Json` column can have its keys in a completely
// different order than what was originally written, even though nothing in
// it actually changed. Array element order IS preserved and stays significant.
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// "Nothing here" in any shape — undefined (key absent), null, '', [], or {}.
// A field that predates some later-added schema key (e.g. a task saved
// before `nftFields`/`subPersons` existed) has that key MISSING entirely;
// resubmitting the same record today (the frontend always includes every
// field, defaulted to its empty shape) makes it merely PRESENT-BUT-EMPTY.
// Both mean the same thing — no real content — so they must compare equal,
// or every such field falsely looks "changed" the first time the record is
// ever resaved.
function isEmpty(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

// Compute changed fields between two plain objects. Returns { field: {from,to} }
// for keys whose (order-insensitive JSON-compared) values differ. Used to build
// compact old/new snapshots and to skip no-op logging — including the
// tasks/cobr/queries overlay's "did details actually change" check, so:
//   - a nested object field (e.g. a task's `nftFields`) round-tripping through
//     Postgres JSONB doesn't get flagged as changed when only its key order
//     shifted (stableStringify), and
//   - a field going from "key absent" to "present but empty" (or vice versa)
//     doesn't get flagged as changed either (isEmpty) — see above.
export function diffFields(oldObj = {}, newObj = {}, keys = null) {
  const out = {};
  const ks = keys || [...new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])];
  for (const k of ks) {
    const a = oldObj?.[k];
    const b = newObj?.[k];
    if (isEmpty(a) && isEmpty(b)) continue;
    if (stableStringify(a) !== stableStringify(b)) out[k] = { from: a ?? null, to: b ?? null };
  }
  return out;
}

// Append one audit row. Accepts either a Prisma client or a transaction client
// as `db`, so it can participate in the same transaction as the write.
export function logActivity(db, { module, recordId, action, oldValue = null, newValue = null, performedBy }) {
  return db.activityLog.create({
    data: {
      moduleName: module,
      recordId: String(recordId),
      action,
      oldValue: oldValue ?? undefined,
      newValue: newValue ?? undefined,
      performedBy,
    },
  });
}

// Shared query + "resolve performedBy id -> real name" + serialize, used by
// both the admin-only global viewer (routes/activityLog.js) and any
// record-scoped log (e.g. routes/clients.js's per-client history) so the two
// views render identically.
export async function listActivity(prisma, where, limit = 200) {
  const rows = await prisma.activityLog.findMany({
    where, orderBy: { timestamp: 'desc' }, take: Math.min(limit, 500),
  });
  const ids = [...new Set(rows.map((r) => r.performedBy).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    module: r.moduleName,
    recordId: r.recordId,
    action: r.action,
    oldValue: r.oldValue,
    newValue: r.newValue,
    performedBy: r.performedBy,
    performedByName: nameById.get(r.performedBy) || 'Unknown user',
    timestamp: r.timestamp,
  }));
}
