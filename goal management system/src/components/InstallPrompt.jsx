// A small, dismissible "Install App" pill — surfaces the browser's native
// install flow (Chrome/Edge/Android "beforeinstallprompt"; iOS Safari has no
// programmatic equivalent, so it's simply not shown there). Snoozed for a
// week on dismiss, and never shown again once installed.
import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { onInstallPromptAvailable, clearInstallPrompt } from '../services/installPrompt';

const SNOOZE_KEY = 'crm:installPromptSnoozedUntil';
const SNOOZE_DAYS = 7;

const isSnoozed = () => {
  const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return Date.now() < until;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => onInstallPromptAvailable((event) => {
    setDeferredPrompt(event);
    setVisible(!!event && !isSnoozed());
  }), []);

  const dismiss = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    setVisible(false);
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    clearInstallPrompt();
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9997] flex items-center gap-3 p-3 pl-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl animate-slide-in-right max-w-[calc(100vw-2rem)]">
      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
        <Download size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">Install Fintness CRM</p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Faster access and desktop notifications.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
        title="Not now"
      >
        <X size={13} />
      </button>
    </div>
  );
}
