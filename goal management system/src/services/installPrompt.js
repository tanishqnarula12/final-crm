// Captures `beforeinstallprompt` at module load — i.e. as soon as main.jsx
// imports App.jsx, before the first render, regardless of whether the Login
// screen or the authenticated app is what's currently mounted. This matters
// because the event fires (at most) once per page load and is never
// replayed: if nothing was listening yet (e.g. InstallPrompt.jsx hadn't
// mounted because the user was still on the Login screen), it would be lost
// for the rest of that session.
let deferredEvent = null;
const handlers = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredEvent = e;
  handlers.forEach((h) => h(deferredEvent));
});

window.addEventListener('appinstalled', () => {
  deferredEvent = null;
  handlers.forEach((h) => h(null));
});

// Subscribe for the captured event (called immediately with the current
// value, then again on change). Returns an unsubscribe function.
export function onInstallPromptAvailable(handler) {
  handlers.add(handler);
  if (deferredEvent) handler(deferredEvent);
  return () => handlers.delete(handler);
}

export function clearInstallPrompt() {
  deferredEvent = null;
}
