// Activity-log helper — every create/edit/delete/assign/stage-change appends
// a row to `activity_logs`. `performedBy` is always a real User.id; the
// activity-log API resolves it to the user's name for display.

// Compute changed fields between two plain objects. Returns { field: {from,to} }
// for keys whose (JSON-compared) values differ. Used to build compact old/new
// snapshots and to skip no-op logging.
export function diffFields(oldObj = {}, newObj = {}, keys = null) {
  const out = {};
  const ks = keys || [...new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])];
  for (const k of ks) {
    const a = oldObj?.[k];
    const b = newObj?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a ?? null, to: b ?? null };
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
