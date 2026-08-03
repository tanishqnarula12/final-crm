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
  QUERY_RESOLVED: 'QUERY_RESOLVED',
  QUERY_COMMENTED: 'QUERY_COMMENTED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_COMPLETED: 'TASK_COMPLETED',
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
 *   • queries STAGE→Resolved  → raiser: "Your query has been resolved"
 *   • queries LOG_APPEND      → the other party: "<name> commented on a query"
 * Never notifies the actor about their own action.
 */
export async function notifyFromEvents(prisma, events) {
  if (!events?.length) return;
  const items = [];
  let managers = null;

  // Records whose stage moved in this same save. A stage change also appends a
  // remark explaining it, so without this the one action would fire BOTH a
  // stage notification and a "commented" one. The stage notification is the
  // more meaningful of the two, so the comment ping is suppressed for these.
  const stageMoved = new Set(
    events.filter((e) => e.type === 'STAGE_CHANGE').map((e) => `${e.module}:${e.record?.id}`)
  );

  // Every event in one call shares the same actor, so this resolves at most once.
  let actorNameCache;
  const actorName = async () => {
    if (actorNameCache === undefined) {
      const u = events[0]?.actorId
        ? await prisma.user.findUnique({ where: { id: events[0].actorId }, select: { name: true } })
        : null;
      actorNameCache = u?.name || 'Someone';
    }
    return actorNameCache;
  };

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
    } else if (ev.type === 'STAGE_CHANGE' && (ev.module === 'tasks' || ev.module === 'cobr') && ev.to === 'Completed') {
      // Tell whoever assigned it (departmentOwner) that the assignee marked
      // it done, unless the assigner completed it themself.
      if (rec.departmentOwner && rec.departmentOwner !== ev.actorId) {
        items.push({
          userId: rec.departmentOwner, type: NOTIF.TASK_COMPLETED,
          title: ev.module === 'cobr' ? 'COBR task completed' : 'Task completed',
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
      // Notify the RM (assignedTo, or relationshipManager for the normal
      // advisor-created flow) AND the Service Manager selected on the
      // prospect — Service Manager owns changeStage on it, so they need to
      // know a new one landed too. Deduped so the same person holding both
      // roles (or being the creator) isn't notified twice / about themself.
      const seen = new Set();
      for (const target of [rec.assignedTo || rec.relationshipManager, rec.serviceManager]) {
        if (!target || target === ev.actorId || seen.has(target)) continue;
        seen.add(target);
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
    } else if (ev.type === 'LOG_APPEND' && ev.module === 'tasks') {
      // Someone added a comment/log entry on a task — tell every OTHER
      // participant (the assigner, the assignee, and any sub-people), same
      // "tell the other party" pattern as a query remark.
      const who = await actorName();
      const body = String(ev.entry?.text || '').trim().slice(0, 140) || taskLabel(rec);
      const subPersons = Array.isArray(rec.subPersons) ? rec.subPersons : (rec.subPerson ? [rec.subPerson] : []);
      const participants = new Set([rec.departmentOwner, rec.assignedTo, ...subPersons].filter(Boolean));
      for (const target of participants) {
        if (target === ev.actorId) continue;
        items.push({
          userId: target, type: NOTIF.TASK_COMMENTED,
          title: `${who} commented on a task`, body,
          link: { view: 'tasks', id: rec.id },
        });
      }
    } else if (ev.type === 'LOG_APPEND' && ev.module === 'queries') {
      // Someone added a remark on a query — tell the OTHER party (the raiser
      // if the recipient commented, and vice versa). departmentOwner = raisedBy.
      if (!stageMoved.has(`${ev.module}:${rec.id}`)) {
        const who = await actorName();
        const body = String(ev.entry?.text || '').trim().slice(0, 140) || queryLabel(rec);
        for (const target of [rec.departmentOwner, rec.assignedTo]) {
          if (!target || target === ev.actorId) continue;
          if (items.some((i) => i.userId === target && i.type === NOTIF.QUERY_COMMENTED)) continue;
          items.push({
            userId: target, type: NOTIF.QUERY_COMMENTED,
            title: `${who} commented on a query`, body,
            link: { view: 'queries', id: rec.id },
          });
        }
      }
    } else if (ev.type === 'STAGE_CHANGE' && ev.module === 'queries' && ev.to === 'Resolved') {
      // departmentOwner = raisedBy (deptOwnerIsActor on the queries route) —
      // tell the person who raised it that their query was resolved, unless
      // they somehow resolved it themselves.
      if (rec.departmentOwner && rec.departmentOwner !== ev.actorId) {
        items.push({
          userId: rec.departmentOwner, type: NOTIF.QUERY_RESOLVED,
          title: 'Your query has been resolved', body: queryLabel(rec),
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
