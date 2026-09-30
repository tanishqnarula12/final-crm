import { useEffect, useRef } from 'react';

// The phone's Back button (and the browser's) inside the CRM.
//
// The CRM is one page that switches screens itself, so to the browser the
// whole app used to be a single history entry and Back left it. Now every
// open "layer" — a popup or sheet, a sub-screen like a client profile, or any
// module other than the Dashboard — owns one history entry, and Back closes
// the top layer. On the Dashboard with nothing open, the first Back shows
// "Press back again to exit"; a second Back within 2 seconds leaves.
//
// History stack: [page the CRM loaded on] [guard] [one entry per layer]…
// Layers close highest priority first (popups over sub-screens over modules),
// then newest first. A layer closed from the UI (its X, Save, a nav tab)
// hands its entry back, so entries and open layers stay one-to-one. The URL
// never changes. Chrome ignores history entries a page adds before the user
// has interacted with it, so the guard is only added on the first tap/key.

export const LAYER = { MODULE: 1, SCREEN: 2, DETAIL: 3, OVERLAY: 10 };
export const EXIT_HINT_EVENT = 'crm:back-exit-hint';
const EXIT_WINDOW_MS = 2000;

let seq = 0;
const layers = [];        // { id, priority, onBack }
let depth = 0;            // our entries above the load entry: 1 = guard, 2+ = layers
let ignorePops = 0;       // popstates caused by our own history.go()
let owed = 0;             // entries to hand back for layers closed from the UI
let flushQueued = false;
let rearmTimer = null;
let started = false;

const push = () => { depth += 1; window.history.pushState({ crmBack: true, depth }, ''); };
const goBack = (n) => { if (n > 0) { ignorePops += 1; window.history.go(-n); } };
const topLayer = () => layers.reduce((top, l) => (!top || l.priority > top.priority || (l.priority === top.priority && l.id > top.id) ? l : top), null);

function ensureGuard() {
  clearTimeout(rearmTimer);
  if (depth === 0) push();
}

// Layers closed from the UI in one go (e.g. a save that also switches screen)
// hand their entries back together, once the current event has finished.
function flush() {
  flushQueued = false;
  const n = Math.min(owed, Math.max(0, depth - 1)); // never below the guard
  owed = 0;
  goBack(n);
}

function onPopState(e) {
  depth = e.state && e.state.crmBack ? e.state.depth : 0;
  if (ignorePops > 0) { ignorePops -= 1; return; }
  owed = 0;
  if (layers.length) {
    // Normally exactly one entry was popped → close the top layer. If the
    // browser went back further (it skips entries it considers unwanted),
    // close as many layers as entries were popped.
    const keep = Math.max(0, depth - 1);
    do {
      const top = topLayer();
      layers.splice(layers.indexOf(top), 1);
      // onBack returning false means "can't close right now" (e.g. an upload
      // in flight): the layer stays open and gets its entry back.
      if (top.onBack() === false) { layers.push(top); push(); return; }
    } while (layers.length > keep);
    return;
  }
  // Nothing open: the Dashboard. Step down to the load entry (dropping any
  // stale entries, e.g. after a reload), hint, and leave the next Back to
  // the browser — it exits. After the window, re-arm the guard.
  goBack(depth);
  depth = 0;
  window.dispatchEvent(new CustomEvent(EXIT_HINT_EVENT));
  clearTimeout(rearmTimer);
  rearmTimer = setTimeout(() => { if (depth === 0 && !layers.length) push(); }, EXIT_WINDOW_MS);
}

export function startBackNav() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const s = window.history.state;
  depth = s && s.crmBack ? s.depth : 0;
  // Reloaded while something was open: nothing is open now, go back to the guard.
  if (depth > 1) { goBack(depth - 1); depth = 1; }
  window.addEventListener('popstate', onPopState);
  const firstTouch = () => {
    window.removeEventListener('pointerdown', firstTouch, true);
    window.removeEventListener('keydown', firstTouch, true);
    ensureGuard();
  };
  window.addEventListener('pointerdown', firstTouch, true);
  window.addEventListener('keydown', firstTouch, true);
}

function openLayer(priority, onBack) {
  ensureGuard();
  const layer = { id: ++seq, priority, onBack };
  layers.push(layer);
  push();
  return layer;
}

function closeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i === -1) return; // already closed by Back
  layers.splice(i, 1);
  owed += 1;
  if (!flushQueued) { flushQueued = true; queueMicrotask(flush); }
}

// While `open` is true, Back calls `onBack` (which should close the thing,
// or return false to stay open).
// Put it in any popup/sheet (`useBackLayer(true, onClose)` when the component
// only exists while open) or on a screen state (`useBackLayer(!!clientId, …)`).
export function useBackLayer(open, onBack, priority = LAYER.OVERLAY) {
  const ref = useRef(onBack);
  useEffect(() => { ref.current = onBack; });
  useEffect(() => {
    if (!open) return undefined;
    const layer = openLayer(priority, () => (ref.current ? ref.current() : undefined));
    return () => closeLayer(layer);
  }, [open, priority]);
}
