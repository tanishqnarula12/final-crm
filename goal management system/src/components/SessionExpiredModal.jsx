import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, LogIn, LogOut, Eye, EyeOff, Clock } from 'lucide-react';
import { Field, inputCls, btnPrimary, btnGhost } from './UI';
import { login } from '../utils/auth';

// Shown on top of the current screen when the session ends while the app is
// open (it expired, or someone logged out in another tab). Signing in here
// keeps everything on screen — a half-filled proposal, an open note — so the
// user just clicks Save again. Locked to the account that was signed in:
// the open screen belongs to that person.
export default function SessionExpiredModal({ email, onSignedIn, onSignOut }) {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError('');
    try {
      const user = await login(email, password);
      onSignedIn(user);
    } catch (err) {
      setError(err?.message || 'Wrong password. Try again.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[20000] bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up"
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock size={17} />
            </span>
            <div>
              <h3 id="session-expired-title" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Your session has ended</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Sign in again to carry on. Everything on your screen stays as it is — if a save didn't go through, just click Save again.
              </p>
            </div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{email}</div>
          <Field label="Password">
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className={inputCls + ' pl-9 pr-9'}
                placeholder="Enter your password"
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-between items-center gap-2">
          <button type="button" onClick={onSignOut} className={btnGhost}>
            <LogOut size={14} /> Sign out
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Signing in…' : (<><LogIn size={14} /> Sign in</>)}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
