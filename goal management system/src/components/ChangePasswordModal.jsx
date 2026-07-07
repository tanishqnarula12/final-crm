import { useState } from 'react';
import { X, KeyRound, Check, ShieldCheck } from 'lucide-react';
import { Field, inputCls, btnPrimary, btnGhost } from './UI';
import { changePassword } from '../utils/auth';

// Self-service password change — any logged-in user (including VIEWER) can
// change their own password, but must prove they know the current one first.
// Distinct from the admin "Reset Password" field in UsersAdmin.jsx, which
// lets an admin set a new password for someone else without knowing the old one.
export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (!currentPassword) return setError('Enter your current password.');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('New password and confirmation do not match.');
    if (newPassword === currentPassword) return setError('New password must be different from the current password.');

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err?.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck size={15} />
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Change Password</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {done ? (
            <div className="text-center py-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Check size={22} />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Password changed successfully.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Use your new password the next time you sign in.</p>
            </div>
          ) : (
            <>
              <Field label="Current Password *">
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls + ' pl-9'} placeholder="Enter your current password" autoComplete="current-password" />
                </div>
              </Field>
              <Field label="New Password *" hint="Minimum 8 characters">
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls + ' pl-9'} placeholder="Set a new password" autoComplete="new-password" />
                </div>
              </Field>
              <Field label="Confirm New Password *">
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls + ' pl-9'} placeholder="Re-enter the new password" autoComplete="new-password" />
                </div>
              </Field>
              {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end items-center gap-2">
          {done ? (
            <button onClick={onClose} className={btnPrimary}>Done</button>
          ) : (
            <>
              <button onClick={onClose} className={btnGhost}>Cancel</button>
              <button onClick={submit} disabled={saving} className={btnPrimary}>
                {saving ? 'Changing…' : (<><Check size={14} /> Change Password</>)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
