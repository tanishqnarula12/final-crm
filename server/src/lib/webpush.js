// Web Push sending — the "OS notification while the tab isn't open" channel,
// alongside the existing socket.io live push and the REST-served bell list.
//
// Deliberately isolated from lib/notify.js's DB write: a push failure (browser
// unsubscribed, network blip) must never affect whether the notification row
// or the socket event lands.
import webpush from 'web-push';
import { config } from '../config.js';
import { prisma } from '../db.js';

// A malformed key (bad copy-paste, stray whitespace/quotes) must degrade to
// "push disabled" — never crash the whole process. web-push's setVapidDetails
// throws synchronously, and this runs at module-import time, so an unguarded
// call here would take down the entire API, not just the push feature.
let enabled = false;
if (config.vapid.publicKey && config.vapid.privateKey) {
  try {
    webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    enabled = true;
  } catch (err) {
    console.error('[fintness-crm] Invalid VAPID keys — Web Push disabled (in-app + socket notifications still work):', err?.message || err);
  }
} else {
  console.warn('[fintness-crm] VAPID keys not set — Web Push notifications are disabled (in-app + socket notifications still work).');
}

/**
 * Push a notification row to every device the recipient has subscribed on.
 * Silently drops subscriptions the browser has revoked (404/410 from the
 * push service) so they stop being retried forever.
 */
export async function sendWebPush(notificationRow) {
  if (!enabled) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: notificationRow.userId } });
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: notificationRow.title,
    body: notificationRow.body || '',
    link: notificationRow.link || null,
    tag: notificationRow.id,
  });

  await Promise.all(subs.map(async (sub) => {
    const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(pushSubscription, payload);
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        // Browser revoked/expired this subscription — stop retrying it.
        await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
      } else {
        console.error('[fintness-crm] Web Push send failed:', err?.message || err);
      }
    }
  }));
}
