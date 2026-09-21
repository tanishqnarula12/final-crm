// Dashboard notice board — open to every user: anyone may post, anyone may
// read, deliberately NOT gated by the admin-configurable permission matrix
// (unlike tasks/prospects/etc.) since "open for all" is the whole point.
// Only deletion is restricted (the poster, or Admin/Internal Manager for
// moderation), and the system-generated daily birthday post (createdBy
// null — see notificationScheduler.js) can only be removed by an admin.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { notifyNoticePosted, notifyNoticeReacted } from '../lib/notify.js';
import { emitToAll } from '../chat/socket.js';

const router = Router();
router.use(requireAuth);

export const NOTICE_TYPES = ['GENERAL', 'ANNOUNCEMENT', 'HOLIDAY', 'BIRTHDAY', 'EVENT', 'LEAVE'];
const MANAGER_ROLES = ['ADMIN', 'INTERNAL_MANAGER'];
const isManager = (user) => (user.roles || []).some((r) => MANAGER_ROLES.includes(r));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^\d{2}:\d{2}$/;

// Local YYYY-MM-DD / HH:MM — mirrors notificationScheduler.js's localDateKey
// exactly (same server-local-timezone convention every date field in this
// app uses).
const localDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const localTimeKey = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const createSchema = z.object({
  type: z.enum(NOTICE_TYPES).default('GENERAL'),
  title: z.string().trim().min(1, 'Title is required').max(140, 'Keep the title under 140 characters'),
  message: z.string().trim().min(1, 'Message is required').max(2000, 'Keep the message under 2000 characters'),
  // The date (+ optional time) it should start showing — omitted/today (with
  // no time, or a past time) means "post now" (today's existing behavior); a
  // future date, or today with a later time, schedules it (see the
  // scheduler's runScheduledNotices). visibleForDays is how long it stays up
  // once triggered; null/omitted = never expires.
  date: z.string().regex(dateRe, 'Invalid date').optional(),
  time: z.string().regex(timeRe, 'Invalid time').optional().nullable(),
  visibleForDays: z.number().int().positive().nullable().optional(),
});

// Renders a LEAVE notice's title/message FRESH, relative to `now` — never
// frozen at the moment it was approved. The same stored record reads
// "will be on leave" days ahead of the date, "is on leave today" once that
// day genuinely arrives, and "was on leave" if it's ever read afterward
// (rare in practice — endOfDayExpiry below already removes it from GET
// /api/notices by then — but still correct if something reads it directly).
export function renderLeaveNotice(data, now = new Date()) {
  const { name, fromDate, toDate, leaveType, halfDaySlot, timeValue } = data;
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const todayKey = localDateKey(now);
  const tense = fromDate === todayKey ? 'today' : fromDate > todayKey ? 'future' : 'past';
  const isMultiDay = toDate !== fromDate;

  if (leaveType === 'Half Day') {
    const slot = halfDaySlot || 'Half Day';
    const title = tense === 'today' ? `🌴 ${name} is on leave today (${slot})`
      : tense === 'future' ? `🌴 ${name} will be on leave (${slot})`
      : `🌴 ${name} was on leave (${slot})`;
    return { title, message: `${name} will be away for the ${slot} on ${fmt(fromDate)}.` };
  }
  if (leaveType === 'Early Leave') {
    const title = tense === 'today' ? `🌴 ${name} is leaving early today`
      : tense === 'future' ? `🌴 ${name} will leave early`
      : `🌴 ${name} left early`;
    return { title, message: `${name} will leave early (around ${timeValue}) on ${fmt(fromDate)}.` };
  }
  if (leaveType === 'Late Entry') {
    const title = tense === 'today' ? `🌴 ${name} will arrive late today`
      : tense === 'future' ? `🌴 ${name} will arrive late`
      : `🌴 ${name} arrived late`;
    return { title, message: `${name} will arrive late (around ${timeValue}) on ${fmt(fromDate)}.` };
  }
  if (isMultiDay) {
    // A range has no single "today" — it's future until it starts, ongoing
    // through it, past once it ends. (endOfDayExpiry removes it from GET
    // /api/notices right as it ends, so "past" is only ever seen elsewhere.)
    const state = todayKey < fromDate ? 'future' : todayKey > toDate ? 'past' : 'ongoing';
    const title = state === 'future' ? `🌴 ${name} will be on leave`
      : state === 'past' ? `🌴 ${name} was on leave`
      : `🌴 ${name} is on leave`;
    const verb = state === 'future' ? 'will be' : state === 'past' ? 'was' : 'is';
    return { title, message: `${name} ${verb} on leave from ${fmt(fromDate)} to ${fmt(toDate)}.` };
  }
  const title = tense === 'today' ? `🌴 ${name} is on leave today`
    : tense === 'future' ? `🌴 ${name} will be on leave`
    : `🌴 ${name} was on leave`;
  return { title, message: `${name} is on leave on ${fmt(fromDate)}.` };
}

export const serializeNotice = (n) => {
  const rendered = n.templateKind === 'LEAVE' && n.templateData ? renderLeaveNotice(n.templateData) : null;
  return {
    id: n.id,
    type: n.type,
    title: rendered?.title ?? n.title,
    message: rendered?.message ?? n.message,
    createdBy: n.createdBy,
    effectiveDate: n.effectiveDate,
    effectiveTime: n.effectiveTime,
    expiresAt: n.expiresAt,
    reactions: n.reactions || {},
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
};

// "Visible for N days starting on effectiveDate" — N=1 means visible only
// through the end of effectiveDate itself (day 1), not day 2, so the offset
// is N-1, not N.
export const endOfDayExpiry = (effectiveDate, visibleForDays) => {
  if (!visibleForDays) return null;
  const d = new Date(`${effectiveDate}T00:00:00`);
  d.setDate(d.getDate() + visibleForDays - 1);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Whether a notice dated/timed for `effectiveDate`/`effectiveTime` has
// actually arrived as of `now` — a date-only row (no effectiveTime) is due
// the instant its date starts; a timed row on TODAY additionally waits for
// that clock time; any row whose date has already passed is due regardless
// of what its time says (time only gates the launch day itself).
export function isDue(row, now) {
  const todayKey = localDateKey(now);
  if (row.effectiveDate < todayKey) return true;
  if (row.effectiveDate > todayKey) return false;
  return !row.effectiveTime || row.effectiveTime <= localTimeKey(now);
}

// Shared by every automated poster (the daily birthday job, an approved
// Full Day leave) — createdBy stays null (a system post, not attributed to
// whoever triggered it), posts for today with no specific time, and is
// broadcast live the same way a normal post is. `expiresAt` defaults to
// never (leave's post), but a caller may pass one (birthday's "gone after
// today"). `dedupeKey` is only needed by callers that might otherwise fire
// twice (the scheduler's recurring tick); a P2002 there is swallowed, not
// thrown, so a duplicate attempt is just a no-op.
export async function postSystemNotice(prisma, { type, title, message, dedupeKey = null, expiresAt = null, templateKind = null, templateData = null }) {
  try {
    const row = await prisma.notice.create({
      data: { type, title, message, createdBy: null, dedupeKey, effectiveDate: localDateKey(), triggered: true, expiresAt, templateKind, templateData },
    });
    emitToAll('notice:new', { notice: serializeNotice(row) });
    return row;
  } catch (err) {
    if (err?.code === 'P2002') return null; // duplicate dedupeKey — already posted
    throw err;
  }
}

// GET /api/notices — the most recent posts, newest first. Open to anyone
// signed in; no per-record scoping. A notice whose effective date/time hasn't
// arrived, or whose expiry has passed, is excluded — it isn't "deleted", it's
// just not currently live (see runScheduledNotices for the live trigger/expiry
// broadcast that keeps an already-open dashboard in sync with this filter).
// effectiveTime can't be expressed in the DB query (it's a same-day
// time-of-day gate, not a column Postgres can compare against `now`
// directly), so the date filter narrows to candidates and isDue() does the
// final check in app code.
router.get('/', asyncHandler(async (req, res) => {
  const now = new Date();
  const rows = await prisma.notice.findMany({
    where: {
      deletedAt: null,
      effectiveDate: { lte: localDateKey(now) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ notices: rows.filter((r) => isDue(r, now)).map(serializeNotice) });
}));

// POST /api/notices — anyone may post, optionally scheduled for a future
// date/time and/or set to auto-expire after N days. A due post (today, no
// time, or today with a time that's already passed) broadcasts immediately,
// exactly like before; a future date, or today with a later time, is saved
// but stays invisible to everyone (including the poster) until the
// scheduler's sweep triggers and broadcasts it once it's actually due.
router.post('/', asyncHandler(async (req, res) => {
  const { type, title, message, date, time, visibleForDays } = parseBody(createSchema, req.body);
  const now = new Date();
  const todayKey = localDateKey(now);
  const effectiveDate = date && date > todayKey ? date : todayKey;
  const effectiveTime = effectiveDate === todayKey ? (time || null) : null; // a time only means anything on the launch day
  const expiresAt = endOfDayExpiry(effectiveDate, visibleForDays);
  const triggered = isDue({ effectiveDate, effectiveTime }, now);

  const row = await prisma.notice.create({
    data: { type, title, message, createdBy: req.user.id, effectiveDate, effectiveTime, expiresAt, triggered },
  });
  const notice = serializeNotice(row);
  res.status(201).json({ notice, scheduled: !triggered });
  if (triggered) {
    emitToAll('notice:new', { notice });
    notifyNoticePosted(prisma, row, req.user.name).catch((err) => console.error('[notify] notice posted:', err));
  }
}));

// POST /api/notices/:id/react — toggle an emoji reaction. Same WhatsApp-style
// rule as chat messages: each user gets at most ONE reaction on a notice,
// reacting with the same emoji again removes it, a different emoji replaces
// it. Broadcast live to every dashboard, and — unless you're reacting to
// your own notice — the poster gets a notification naming you and the emoji.
router.post('/:id/react', asyncHandler(async (req, res) => {
  const { emoji } = parseBody(z.object({ emoji: z.string().min(1).max(16) }), req.body);
  const existing = await prisma.notice.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Notice not found.' });

  const reactions = { ...(existing.reactions || {}) };
  const uid = req.user.id;
  const hadSame = (reactions[emoji] || []).includes(uid);
  for (const key of Object.keys(reactions)) {
    reactions[key] = reactions[key].filter((id) => id !== uid);
    if (reactions[key].length === 0) delete reactions[key];
  }
  if (!hadSame) reactions[emoji] = [...(reactions[emoji] || []), uid];

  const updated = await prisma.notice.update({ where: { id: existing.id }, data: { reactions } });
  const notice = serializeNotice(updated);
  res.json({ notice });
  emitToAll('notice:updated', { notice });
  if (!hadSame) {
    notifyNoticeReacted(prisma, updated, uid, req.user.name, emoji).catch((err) => console.error('[notify] notice reacted:', err));
  }
}));

// DELETE /api/notices/:id — the poster, or Admin/Internal Manager. The daily
// system birthday post (createdBy null) has no poster, so only a manager can
// remove it.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await prisma.notice.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Notice not found.' });
  const isOwner = existing.createdBy && existing.createdBy === req.user.id;
  if (!isOwner && !isManager(req.user)) {
    return res.status(403).json({ error: 'You can only remove your own notices.' });
  }
  await prisma.notice.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
  emitToAll('notice:deleted', { id: existing.id });
}));

export default router;
