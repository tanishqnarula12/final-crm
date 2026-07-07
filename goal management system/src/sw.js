// Custom service worker (vite-plugin-pwa "injectManifest" strategy).
//
// Two jobs:
//   1. Precache the built app shell (via workbox) so the CRM opens instantly
//      and works offline for the static shell — API calls still need the
//      network, this is not an offline-data app.
//   2. Web Push: show a native OS notification for `push` events, and route
//      the user to the right screen on `notificationclick`. This is the part
//      that can't be expressed by the "generateSW" strategy.
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// --- Web Push ----------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload — ignore */ }

  const title = data.title || 'Team Fintness CRM';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || undefined, // same tag replaces an unread notification instead of stacking
    renotify: !!data.tag,
    data: { link: data.link || null, notificationId: data.tag || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking the OS notification focuses an already-open CRM tab (and hands it
// the link to navigate to via postMessage) or opens a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { link, notificationId } = event.notification.data || {};

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        client.postMessage({ type: 'notification-click', link, notificationId });
        return client.focus();
      }
    }
    await self.clients.openWindow('/');
  })());
});
