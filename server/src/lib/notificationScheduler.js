// Time-based notification scheduler.
//
// A single in-process timer (tick every 60s) drives the three scheduled
// notification types. Idempotency is guaranteed by the (userId,dedupeKey)
// unique index on Notification, NOT by tracking state here — so a tick that
// runs twice, or a server restart mid-window, never double-sends:
//
//   • MEETING_SOON — a Scheduled meeting starting within the next 10 minutes,
//     to its host (assignedTo) + creator. dedupeKey `meeting-soon:<id>`.
//   • TASK_DUE     — every due/overdue open task, THREE times a day (09:00,
//     13:00, 17:00 local), to its assignee. dedupeKey per task+date+slot.
//   • BIRTHDAY     — once a day (from 08:00 local), every teammate is told
//     about each user whose profile DOB falls today. dedupeKey per person+date.
//
// All times are the server's local timezone, matching how meetings/tasks store
// their date/time strings (no offset) and how the frontend parses them.
import { prisma } from '../db.js';
import { pushNotifications, NOTIF } from './notify.js';

const TICK_MS = 60 * 1000;
const MEETING_WINDOW_MS = 10 * 60 * 1000; // "10 minutes before"
const TASK_DUE_SLOTS = [9, 13, 17];       // local hours — 3 reminders a day
const BIRTHDAY_FROM_HOUR = 8;             // don't wish people at 3am
const DONE_TASK_STAGES = new Set(['completed', 'lost']);

let timer = null;

// Local YYYY-MM-DD for a Date (used in dedupe keys + due comparisons).
const localDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Local MM-DD for birthday matching (year-agnostic).
const monthDay = (isoOrDate) => {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---- Meeting reminders ----------------------------------------------------
export async function runMeetingReminders(now) {
  const rows = await prisma.meeting.findMany({ where: { deletedAt: null } });
  const items = [];
  for (const row of rows) {
    const m = row.payload || {};
    if (m.status && m.status !== 'Scheduled') continue;
    if (!m.date) continue;
    const start = new Date(`${m.date}T${m.time || '00:00'}`);
    if (Number.isNaN(start.getTime())) continue;
    const untilMs = start.getTime() - now.getTime();
    if (untilMs <= 0 || untilMs > MEETING_WINDOW_MS) continue;

    const recipients = new Set([row.assignedTo, row.createdBy].filter(Boolean));
    const when = m.time ? ` at ${m.time}` : '';
    const title = m.title || m.subject || m.agenda || 'Meeting';
    for (const uid of recipients) {
      items.push({
        userId: uid, type: NOTIF.MEETING_SOON,
        title: 'Meeting starting soon',
        body: `${title}${when} — starts in a few minutes`,
        link: { view: 'meetings', id: row.id },
        dedupeKey: `meeting-soon:${row.id}`,
      });
    }
  }
  await pushNotifications(prisma, items);
}

// ---- Task-due reminders (3×/day) ------------------------------------------
export async function runTaskDueReminders(now) {
  const hour = now.getHours();
  const slot = TASK_DUE_SLOTS.indexOf(hour);
  if (slot === -1) return; // not a reminder hour
  const todayKey = localDateKey(now);

  const rows = await prisma.task.findMany({ where: { deletedAt: null } });
  const items = [];
  for (const row of rows) {
    const t = row.payload || {};
    const stage = String(t.stage || '').toLowerCase();
    if (DONE_TASK_STAGES.has(stage)) continue;
    if (!t.dueDate) continue;
    const dueKey = String(t.dueDate).slice(0, 10); // YYYY-MM-DD
    if (dueKey > todayKey) continue; // not due yet (due today or overdue only)

    const recipient = row.assignedTo || row.createdBy;
    if (!recipient) continue;
    const overdue = dueKey < todayKey;
    const title = t.title || t.name || 'Task';
    items.push({
      userId: recipient, type: NOTIF.TASK_DUE,
      title: overdue ? 'Task overdue' : 'Task due today',
      body: `${title}${overdue ? ` (was due ${dueKey})` : ''}`,
      link: { view: 'tasks', id: row.id },
      dedupeKey: `task-due:${row.id}:${todayKey}:${slot}`,
    });
  }
  await pushNotifications(prisma, items);
}

// ---- Birthday reminders (once/day) ----------------------------------------
export async function runBirthdayReminders(now) {
  if (now.getHours() < BIRTHDAY_FROM_HOUR) return;
  const todayKey = localDateKey(now);
  const todayMd = monthDay(now);

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, profile: { select: { data: true } } },
  });
  const celebrants = users.filter((u) => {
    const dob = u.profile?.data?.dob;
    return dob && monthDay(dob) === todayMd;
  });
  if (!celebrants.length) return;

  const items = [];
  for (const person of celebrants) {
    for (const u of users) {
      if (u.id === person.id) continue; // don't tell someone it's their own birthday
      items.push({
        userId: u.id, type: NOTIF.BIRTHDAY,
        title: '🎂 Birthday today!',
        body: `Today is ${person.name}'s birthday — wish them! 🎉`,
        link: null,
        dedupeKey: `birthday:${person.id}:${todayKey}`,
      });
    }
  }
  await pushNotifications(prisma, items);
}

async function tick() {
  const now = new Date();
  try { await runMeetingReminders(now); } catch (err) { console.error('[scheduler] meetings:', err); }
  try { await runTaskDueReminders(now); } catch (err) { console.error('[scheduler] task-due:', err); }
  try { await runBirthdayReminders(now); } catch (err) { console.error('[scheduler] birthdays:', err); }
}

export function startNotificationScheduler() {
  if (timer) return;
  // First run shortly after boot (let the server settle), then every minute.
  setTimeout(tick, 15 * 1000);
  timer = setInterval(tick, TICK_MS);
  console.log('[fintness-crm] Notification scheduler started (60s tick).');
}

export function stopNotificationScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}
