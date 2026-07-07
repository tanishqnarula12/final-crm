// Web Push subscription — the "OS notification, even with the tab in the
// background or closed" channel. Complements, not replaces, the existing
// socket + in-app bell (services/notifications.js): this only adds a native
// notification via the service worker's `push` handler (src/sw.js).
//
// Respects the browser's permission model: we only ever call
// Notification.requestPermission() once per login, and never if the user
// (or a previous visit) already said "denied" — no nagging.
import { api } from './api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// VAPID public key (URL-safe base64) -> the Uint8Array applicationServerKey wants.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Ask for permission (only if not already decided) and register the push
// subscription with the backend. Safe to call on every login — it's a no-op
// once already subscribed, and silent if the browser lacks push support or
// the user previously declined.
export async function subscribeToPush() {
  if (!supported() || !VAPID_PUBLIC_KEY) return;
  try {
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  } catch (err) {
    console.error('Push subscribe failed:', err);
  }
}

// Unsubscribe this device on logout so a shared/public computer doesn't keep
// receiving the signed-out user's notifications.
export async function unsubscribeFromPush() {
  if (!supported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const { endpoint } = subscription.toJSON();
    await subscription.unsubscribe();
    await api.post('/push/unsubscribe', { endpoint });
  } catch (err) {
    console.error('Push unsubscribe failed:', err);
  }
}
