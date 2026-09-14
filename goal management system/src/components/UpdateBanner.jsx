// The service worker (sw.js) already calls skipWaiting()+clientsClaim() so a
// freshly deployed version takes over in the background almost immediately —
// but that alone never tells an already-open tab to reload. Its JS is
// already loaded and running in memory; claiming future network requests
// doesn't retroactively change code that's already executing. This listens
// for that handoff (the `controllerchange` event) and lets the user choose
// when to refresh, rather than silently reloading out from under someone
// mid-form — several tools here (Policy Review, Goal calculator, etc.)
// don't autosave, so a surprise reload would lose whatever they'd typed.
import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // controllerchange also fires on the very first-ever activation (no
    // controller -> a controller) once the SW claims a page that loaded
    // before it existed. Only a change FROM an already-present controller
    // is an actual version switch while the app was in use.
    const hadControllerAtBoot = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadControllerAtBoot) setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
