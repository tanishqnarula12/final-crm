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
let streamStarted = false;

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

// Attach the live stream once (App calls this after connectChat()).
export function startNotificationStream() {
  if (streamStarted) return;
  streamStarted = true;
  onChatEvent('notification:new', ({ notification }) => {
    if (!notification) return;
    if (cache.some((n) => n.id === notification.id)) return; // de-dupe
    cache = [notification, ...cache];
    emit();
    arrivalHandlers.forEach((h) => { try { h(notification); } catch { /* isolate */ } });
  });
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

// A short two-tone "bell jingle" synthesized with the Web Audio API — no asset
// file to bundle, and it respects an already-open AudioContext gesture policy
// (falls back silently if the browser blocks autoplay).
let audioCtx = null;
export function playNotificationJingle() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    // Two quick chime notes (a rising ding-dong).
    [[880, 0], [1174.66, 0.14]].forEach(([freq, at]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.42);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.45);
    });
  } catch { /* audio unavailable — silent */ }
}
