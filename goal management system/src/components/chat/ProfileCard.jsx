import { createPortal } from 'react-dom';
import { X, Mail, Briefcase, ShieldCheck, MessageSquare } from 'lucide-react';
import { ChatAvatar } from './Avatars';

const ROLE_LABEL = {
  ADMIN: 'Admin', RM: 'Relationship Manager', PORTFOLIO_MANAGER: 'Portfolio Manager',
  INSURANCE_MANAGER: 'Insurance Manager', SERVICE_MANAGER: 'Service Manager',
  OPERATIONS_MANAGER: 'Operations Manager', INTERNAL_MANAGER: 'Internal Manager', INTERNAL_USER: 'Internal User',
};
const roleLabels = (roles = []) => roles.map((r) => ROLE_LABEL[r] || r).join(', ') || '—';

// A lightweight "contact card" showing only a teammate's BASIC details
// (avatar, name, job title, role, email, presence) — deliberately not the
// full HR profile. Opened by clicking avatars/names anywhere in chat.
export default function ProfileCard({ user, online = false, isSelf = false, onClose, onMessage }) {
  if (!user) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xs bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden animate-scale-up" onClick={(e) => e.stopPropagation()}>
        {/* Header banner */}
        <div className="relative h-24 bg-gradient-to-br from-blue-500 to-indigo-600">
          <button onClick={onClose} className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-sm transition-colors cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pb-5 -mt-11">
          <div className="ring-4 ring-white dark:ring-slate-900 rounded-full w-fit shadow-lg">
            <ChatAvatar user={user} size={80} online={online} />
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            {user.name}{isSelf && <span className="text-[10px] font-semibold text-blue-500">(you)</span>}
          </h3>
          <p className={`text-[11px] font-bold ${online ? 'text-emerald-500' : 'text-slate-400'}`}>
            {online ? '● Online' : '○ Offline'}
          </p>

          <div className="mt-4 space-y-2.5">
            {user.jobTitle && (
              <Row icon={Briefcase} label="Job Title" value={user.jobTitle} />
            )}
            <Row icon={ShieldCheck} label="Access Role" value={roleLabels(user.roles)} />
            {user.email && <Row icon={Mail} label="Email" value={user.email} />}
          </div>

          {onMessage && !isSelf && (
            <button
              onClick={() => { onMessage(user); onClose(); }}
              className="mt-5 w-full py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <MessageSquare size={13} /> Message
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 break-words">{value}</div>
      </div>
    </div>
  );
}
