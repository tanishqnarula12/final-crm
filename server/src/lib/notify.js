// In-app notifications — creation + real-time fan-out.
//
// Two entry points:
//   • pushNotifications(prisma, items) — low-level: insert (deduped on the
//     (userId,dedupeKey) unique index) and emit `notification:new` to each
//     recipient's socket room. Used by both the event mapper and scheduler.
//   • notifyFromEvents(prisma, events) — maps the domain events syncBulk emits
//     (task/lead/prospect create + lead RM assignment) into notification rows.
//
// Rows are hidden once read (readAt set), never hard-deleted, so the dedupe
// key keeps working across a mark-as-read.
import { emitToUser } from '../chat/socket.js';
import { sendWebPush } from './webpush.js';

export const NOTIF = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_DUE: 'TASK_DUE',
  MEETING_SOON: 'MEETING_SOON',
  PROSPECT_ASSIGNED: 'PROSPECT_ASSIGNED',
  LEAD_NEW: 'LEAD_NEW',
  LEAD_RM_ASSIGNED: 'LEAD_RM_ASSIGNED',
  BIRTHDAY: 'BIRTHDAY',
  QUERY_RAISED: 'QUERY_RAISED',
  LEAVE_APPLIED: 'LEAVE_APPLIED',
  LEAVE_RESPONDED: 'LEAVE_RESPONDED',
};

export const serializeNotification = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body || '',
  link: n.link || null,
  read: !!n.readAt,
  createdAt: n.createdAt,
});

// First non-empty value among `keys` on `rec`.
const pick = (rec, keys) => {
  for (const k of keys) {
    const v = rec?.[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const taskLabel = (rec) => pick(rec, ['taskName', 'title', 'name']) || 'Untitled task';
const leadLabel = (rec) => {
  const name = pick(rec, ['name', 'firstName']);
  const mobile = pick(rec, ['mobile', 'phone']);
  return name || mobile || 'New lead';
};
const prospectLabel = (rec) => {
  const who = pick(rec, ['applicant', 'groupLeader', 'name']);
  const type = pick(rec, ['proposalType', 'proposalCategory']);
  return [who, type].filter(Boolean).join(' — ') || 'Business prospect';
};
const queryLabel = (rec) => pick(rec, ['category']) && pick(rec, ['query'])
  ? `${pick(rec, ['category'])} — ${pick(rec, ['query']).slice(0, 80)}`
  : pick(rec, ['category', 'query']) || 'New query';
const leaveLabel = (rec) => `${rec.fromDate}${rec.toDate && rec.toDate !== rec.fromDate ? ` – ${rec.toDate}` : ''}`;

// Resolve a recipient reference to a REAL active user id. Most records store
// the user id directly, but some legacy rows store the display name instead
// (e.g. a task assigned to "Nitesh Luthra"); we match those by name so the
// notification still reaches the right person. Unresolvable refs are dropped
// rather than creating a mis-addressed row nobody can ever see.
async function resolveRecipients(prisma, items) {
  const refs = [...new Set((items || []).map((i) => i?.userId).filter(Boolean))];
  if (!refs.length) return new Map();
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const byId = new Set(users.map((u) => u.id));
  const byName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));
  const map = new Map();
  for (const ref of refs) {
    if (byId.has(ref)) map.set(ref, ref);
    else {
      const hit = byName.get(String(ref).trim().toLowerCase());
      if (hit) map.set(ref, hit);
    }
  }
  return map;
}

/**
 * Insert notifications and push them live. Recipients are resolved to real user
 * ids (id or legacy name); unresolvable ones are skipped. Silently skips rows
 * that violate the (userId,dedupeKey) unique index (already-sent reminders).
 * @returns the rows actually created.
 */
export async function pushNotifications(prisma, items) {
  const list = (items || []).filter((i) => i?.userId && i?.title);
  if (!list.length) return [];
  const resolved = await resolveRecipients(prisma, list);
  const created = [];
  for (const it of list) {
    const userId = resolved.get(it.userId);
    if (!userId) continue; // recipient couldn't be matched to an active user
    try {
      const row = await prisma.notification.create({
        data: {
          userId,
          type: it.type,
          title: it.title,
          body: it.body || '',
          link: it.link ?? null,
          dedupeKey: it.dedupeKey ?? null,
        },
      });
      created.push(row);
    } catch (err) {
      if (err?.code === 'P2002') continue; // duplicate dedupeKey — already sent
      throw err;
    }
  }
  for (const row of created) {
    try { emitToUser(row.userId, 'notification:new', { notification: serializeNotification(row) }); }
    catch { /* socket gateway may be down; the row is still persisted */ }
    // Fire-and-forget: an OS-level push (device asleep/tab closed) alongside
    // the live socket event. Never let a push failure affect the response.
    sendWebPush(row).catch((err) => console.error('[fintness-crm] sendWebPush failed:', err?.message || err));
  }
  return created;
}

// Cache the pipeline-manager recipient list for a "new lead" burst (a single
// bulk save can create several leads at once — one query, not N).
async function pipelineManagerIds(prisma) {
  const rows = await prisma.user.findMany({
    where: { active: true, roles: { hasSome: ['ADMIN', 'INTERNAL_MANAGER'] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Translate syncBulk domain events into notifications.
 *   • tasks CREATE            → assignee: "New task assigned"
 *   • leads CREATE            → Admins + Internal Managers: "New lead added"
 *   • prospects CREATE        → RM/assignee: "Business prospect assigned"
 *   • leads ASSIGN (RM set)   → new RM: "You are now the RM for a lead"
 *   • queries CREATE/ASSIGN   → recipient: "A query has been raised to you"
 * Never notifies the actor about their own action.
 */
export async function notifyFromEvents(prisma, events) {
  if (!events?.length) return;
  const items = [];
  let managers = null;

  for (const ev of events) {
    const rec = ev.record || {};
    if (ev.type === 'CREATE' && (ev.module === 'tasks' || ev.module === 'cobr')) {
      if (rec.assignedTo && rec.assignedTo !== ev.actorId) {
        items.push({
          userId: rec.assignedTo, type: NOTIF.TASK_ASSIGNED,
          title: ev.module === 'cobr' ? 'New COBR task assigned to you' : 'New task assigned to you',
          body: taskLabel(rec),
          link: { view: ev.module === 'cobr' ? 'cobr' : 'tasks', id: rec.id },
        });
      }
    } else if (ev.type === 'CREATE' && ev.module === 'leads') {
      if (!managers) managers = await pipelineManagerIds(prisma);
      for (const uid of managers) {
        if (uid === ev.actorId) continue;
        items.push({
          userId: uid, type: NOTIF.LEAD_NEW,
          title: 'New lead added', body: leadLabel(rec),
          link: { view: 'leads', id: rec.id },
        });
      }
    } else if (ev.type === 'CREATE' && (ev.module === 'investmentProspects' || ev.module === 'insuranceProspects')) {
      const target = rec.assignedTo || rec.relationshipManager;
      if (target && target !== ev.actorId) {
        items.push({
          userId: target, type: NOTIF.PROSPECT_ASSIGNED,
          title: 'Business prospect assigned to you', body: prospectLabel(rec),
          link: { view: 'prospects', id: rec.id },
        });
      }
    } else if (ev.type === 'ASSIGN' && ev.module === 'leads') {
      if (ev.to && ev.to !== ev.actorId) {
        items.push({
          userId: ev.to, type: NOTIF.LEAD_RM_ASSIGNED,
          title: 'You are now the RM for a lead', body: leadLabel(rec),
          link: { view: 'leads', id: rec.id },
        });
      }
    } else if (ev.type === 'CREATE' && ev.module === 'queries') {
      if (rec.assignedTo && rec.assignedTo !== ev.actorId) {
        items.push({
          userId: rec.assignedTo, type: NOTIF.QUERY_RAISED,
          title: 'A query has been raised to you', body: queryLabel(rec),
          link: { view: 'queries', id: rec.id },
        });
      }
    } else if (ev.type === 'ASSIGN' && ev.module === 'queries') {
      if (ev.to && ev.to !== ev.actorId) {
        items.push({
          userId: ev.to, type: NOTIF.QUERY_RAISED,
          title: 'A query has been raised to you', body: queryLabel(rec),
          link: { view: 'queries', id: rec.id },
        });
      }
    }
  }

  await pushNotifications(prisma, items);
}

// Leave isn't routed through syncBulk (see routes/leave.js for why), so it
// doesn't produce domain events for notifyFromEvents above — these two are
// called directly from the route handlers instead.

// A new leave request → every Admin + Internal Manager (same audience as a
// new lead), so whoever's on approval duty sees it regardless of who applied.
export async function notifyLeaveApplied(prisma, leaveRow) {
  const managers = await pipelineManagerIds(prisma);
  const items = managers
    .filter((uid) => uid !== leaveRow.createdBy)
    .map((uid) => ({
      userId: uid, type: NOTIF.LEAVE_APPLIED,
      title: 'New leave request', body: leaveLabel(leaveRow),
      link: { view: 'leave', id: leaveRow.id },
    }));
  await pushNotifications(prisma, items);
}

// A decision on a leave request → the requester, regardless of who decided.
export async function notifyLeaveResponded(prisma, leaveRow) {
  if (!leaveRow.createdBy || leaveRow.createdBy === leaveRow.respondedBy) return;
  await pushNotifications(prisma, [{
    userId: leaveRow.createdBy, type: NOTIF.LEAVE_RESPONDED,
    title: leaveRow.status === 'Approved' ? 'Your leave request was approved' : 'Your leave request was rejected',
    body: leaveRow.responseMessage || leaveLabel(leaveRow),
    link: { view: 'leave', id: leaveRow.id },
  }]);
}
