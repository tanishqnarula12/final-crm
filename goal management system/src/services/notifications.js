// Notifications — service layer for the on-screen bell panel.
//
// Same cache-over-API seam as services/team.js: a synchronous `loadNotifications()`
// the UI reads mid-render, hydrated once on login and kept live by the shared
// chat socket (a `notification:new` event prepends to the cache). "Read" hides
// a notification everywhere immediately (optimistic), then persists.
import { api } from './api';
import { onChatEvent } from './chat';

let cache = []; // unread notifications, newest-first
const EVT = 'crm:notifications-updated';
const arrivalHandlers = new Set();
let unsubStream = null; // detach fn for the currently-attached socket listener, if any

export const loadNotifications = () => cache;
export const unreadCount = () => cache.length;

const emit = () => window.dispatchEvent(new Event(EVT));

// Subscribe to cache changes (badge count, panel list).
export function onNotificationsUpdated(handler) {
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}

// Subscribe to a *new arrival* (for the toast preview + jingle + bell shake).
export function onNotificationArrival(handler) {
  arrivalHandlers.add(handler);
  return () => arrivalHandlers.delete(handler);
}

// A notification created shortly before this hydrate is treated as an
// "arrival" too (toast + jingle), not just a silent panel entry — covers
// logging in moments after being assigned something, where the live socket
// push happened before this tab ever connected.
const RECENT_ARRIVAL_MS = 2 * 60 * 1000;

export async function hydrateNotifications() {
  const prevIds = new Set(cache.map((n) => n.id));
  try {
    const { notifications } = await api.get('/notifications');
    cache = Array.isArray(notifications) ? notifications : [];
  } catch (err) {
    console.error('Failed to load notifications:', err);
    cache = [];
  }
  emit();
  const now = Date.now();
  cache
    .filter((n) => !prevIds.has(n.id) && now - new Date(n.createdAt).getTime() < RECENT_ARRIVAL_MS)
    .forEach((n) => arrivalHandlers.forEach((h) => { try { h(n); } catch { /* isolate */ } }));
  return cache;
}

// Attach the live stream to the current socket (App calls this after
// connectChat(), once per login). Idempotent *for the currently-connected
// socket* — but unlike a one-time-ever flag, `stopNotificationStream()` lets
// a logout/login cycle in the same tab (new socket instance) reattach a
// fresh listener instead of silently staying deaf forever.
export function startNotificationStream() {
  if (unsubStream) return;
  unsubStream = onChatEvent('notification:new', ({ notification }) => {
    if (!notification) return;
    if (cache.some((n) => n.id === notification.id)) return; // de-dupe
    cache = [notification, ...cache];
    emit();
    arrivalHandlers.forEach((h) => { try { h(notification); } catch { /* isolate */ } });
  });
}

export function stopNotificationStream() {
  if (unsubStream) { unsubStream(); unsubStream = null; }
}

export function clearNotifications() {
  cache = [];
  emit();
}

export async function markNotificationRead(id) {
  cache = cache.filter((n) => n.id !== id); // optimistic: vanish immediately
  emit();
  try { await api.post(`/notifications/${id}/read`); }
  catch (err) { console.error('Failed to mark notification read:', err); }
}

export async function markAllNotificationsRead() {
  if (!cache.length) return;
  cache = [];
  emit();
  try { await api.post('/notifications/read-all'); }
  catch (err) { console.error('Failed to mark all notifications read:', err); }
}

// A single synthesized "guitar strum" — no asset file to bundle, and it
// respects an already-open AudioContext gesture policy (falls back silently
// if the browser blocks autoplay). A G-major chord's notes plucked in quick
// succession (~18ms apart, like a pick crossing the strings), each a bright
// sawtooth run through a lowpass filter that closes fast (the "pluck"
// brightness fading to a mellower body) with a snappy attack and a natural
// exponential ring-out — replaces the earlier three-note synth arpeggio.
let audioCtx = null;
export function playNotificationJingle() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    const chord = [196.00, 246.94, 293.66, 392.00, 493.88]; // G3, B3, D4, G4, B4
    chord.forEach((freq, i) => {
      const at = i * 0.018;
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(4500, now + at);
      filter.frequency.exponentialRampToValueAtTime(500, now + at + 0.5);
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.linearRampToValueAtTime(0.11, now + at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.9);
      osc.connect(filter).connect(gain).connect(audioCtx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.95);
    });
  } catch { /* audio unavailable — silent */ }
}
