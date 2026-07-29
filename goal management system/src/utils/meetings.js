// Meetings — backed by the CRM API (Postgres).
//
// A meeting belongs to a client (groupLeaderId). Lifecycle:
//   Scheduled  → upcoming, surfaces in the client's Open Activities
//   Completed  → done, surfaces in the client's Meeting History
//   Cancelled  → dropped (kept for the audit trail)
// "Reschedule" mutates the SAME meeting record (new date/time) and appends a
// history entry — it never spawns a second meeting.
//
// Same "in-memory cache hydrated from the API" seam as tasks/leads:
// `loadMeetings()` stays synchronous, `saveMeetings()` updates the cache
// immediately and persists the whole array to the server in the background.

import { api } from '../services/api';

let cache = [];

export const loadMeetings = () => cache;

// Fetches every meeting from the server and populates the cache. Call once on
// login/app-load (App.jsx `loadData`) before any component reads meetings.
export async function hydrateMeetings() {
  const { meetings } = await api.get('/meetings');
  cache = Array.isArray(meetings) ? meetings : [];
  window.dispatchEvent(new Event('crm:meetings-updated'));
  return cache;
}

export const saveMeetings = (meetings) => {
  cache = meetings;
  window.dispatchEvent(new Event('crm:meetings-updated'));
  // The server validates every change (RBAC — creator/host/attendee) and
  // returns the authoritative list; reconcile so a rejected edit reverts in
  // the UI — and tell the user when that happens. Without this, a blocked
  // reschedule/cancel (e.g. someone who isn't the creator/host/attendee
  // trying to change it) looked like it saved (the optimistic cache update
  // stuck) but silently reverted on the next refresh — exactly what made
  // rescheduling look broken, with zero explanation why.
  api.put('/meetings', { meetings })
    .then((res) => {
      if (Array.isArray(res?.meetings)) {
        cache = res.meetings;
        window.dispatchEvent(new Event('crm:meetings-updated'));
      }
      if (res?.stats?.rejected > 0) {
        window.dispatchEvent(new CustomEvent('crm:meetings-sync-warning', {
          detail: { message: `${res.stats.rejected} change${res.stats.rejected === 1 ? '' : 's'} could not be saved — you may not have permission to edit this meeting. The list has been refreshed.` },
        }));
      }
    })
    .catch((err) => {
      console.error('Failed to persist meetings:', err);
      hydrateMeetings().catch(() => {});
      window.dispatchEvent(new CustomEvent('crm:meetings-sync-warning', {
        detail: { message: 'Your change could not be saved. The list has been refreshed.' },
      }));
    });
};

export const MEETING_MODES = ['Online', 'Offline'];

export const MEETING_STATUSES = ['Scheduled', 'Completed', 'Cancelled'];

// Visual theme per status (badge colours), matching the app's badge style.
export const MEETING_STATUS_THEME = {
  Scheduled: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  Cancelled: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

export const MODE_THEME = {
  Online: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  Offline: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
};

// Combine a meeting's date (YYYY-MM-DD) and time (HH:MM) into a Date object.
export const meetingDateTime = (m) => {
  if (!m || !m.date) return null;
  const d = new Date(`${m.date}T${m.time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// True when a scheduled meeting's date/time is still in the future.
export const isUpcoming = (m) => {
  if (m.status !== 'Scheduled') return false;
  const dt = meetingDateTime(m);
  return dt ? dt.getTime() >= Date.now() - 60 * 60 * 1000 : true; // 1hr grace
};

// True when a meeting is still sitting at "Scheduled" past its date/time (the
// same 1hr grace as isUpcoming) — nobody marked it Done or Cancelled, so it
// needs a reschedule or a cancel. Surfaced as an "Overdue" flag so these don't
// just quietly pile up looking like normal upcoming meetings.
export const isOverdue = (m) => {
  if (m.status !== 'Scheduled') return false;
  const dt = meetingDateTime(m);
  return dt ? dt.getTime() < Date.now() - 60 * 60 * 1000 : false;
};

export const fmtMeetingStamp = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const fmtMeetingWhen = (m) => {
  const dt = meetingDateTime(m);
  if (!dt) return '—';
  return dt.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
