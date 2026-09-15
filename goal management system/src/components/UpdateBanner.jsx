// The service worker (sw.js) already calls skipWaiting()+clientsClaim() so a
// freshly deployed version takes over almost immediately once the browser
// notices one exists — but the browser only ever checks for a new sw.js on
// navigation (a fresh page load) or roughly once a day in the background.
// A CRM tab that's just left open all day across a deploy gets neither: no
// navigation ever happens in a SPA, and a day is far too slow to be useful
// here. So this actively asks the browser to check — on mount, whenever the
// tab regains focus, and on a short interval — instead of only listening
// and hoping the browser gets around to it on its own. Once an update IS
// found, that same skipWaiting+clientsClaim makes it take over within
// moments, firing `controllerchange`, at which point this lets the user
// choose when to refresh rather than silently reloading out from under
// someone mid-form — several tools here (Policy Review, Goal calculator,
// etc.) don't autosave, so a surprise reload would lose whatever they'd typed.
import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const CHECK_INTERVAL_MS = 60 * 1000;
// A controllerchange in the first few seconds after load is virtually never
// "a new version just shipped while you were using the app" — it's the SW
// registration racing the page's own first paint (most likely right after a
// manual refresh, which is exactly when the browser also re-checks the SW
// and can find a build that finished landing moments earlier). Showing the
// banner for that race is what made it pop up immediately after refreshing
// to get the latest version — confusing since that tab already has it.
const BOOT_GRACE_MS = 15 * 1000;

export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const bootAt = Date.now();
    // controllerchange also fires on the very first-ever activation (no
    // controller -> a controller) once the SW claims a page that loaded
    // before it existed. Only a change FROM an already-present controller
    // is an actual version switch while the app was in use.
    const hadControllerAtBoot = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadControllerAtBoot && Date.now() - bootAt > BOOT_GRACE_MS) setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let cancelled = false;
    let registration = null;
    const checkForUpdate = () => { registration?.update().catch(() => {}); };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (cancelled || !reg) return;
      registration = reg;
      checkForUpdate();
    });

    const onVisibilityChange = () => { if (document.visibilityState === 'visible') checkForUpdate(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', checkForUpdate);
    const intervalId = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
      clearInterval(intervalId);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9997] flex items-center gap-3 p-3 pl-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl animate-slide-in-right max-w-[calc(100vw-2rem)]">
      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
        <RefreshCw size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Update available</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">A new version of the CRM has loaded.</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
}
