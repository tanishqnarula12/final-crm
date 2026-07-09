// The bell dropdown's contents — a live list of unread notifications with
// per-item "mark as read" (which makes it vanish immediately) and a
// "Mark all read" action. Rendered inside the popover shells already present
// in App.jsx (desktop dock + chat sidebar), so it owns only the inner body.
import React from 'react';
import {
  Bell, CheckCheck, Check, ClipboardList, AlarmClock, Video,
  Briefcase, UserPlus, Cake, HelpCircle,
} from 'lucide-react';

// Per-type icon + accent colour.
const TYPE_META = {
  TASK_ASSIGNED:    { icon: ClipboardList, cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  TASK_DUE:         { icon: AlarmClock,    cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' },
  MEETING_SOON:     { icon: Video,         cls: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  PROSPECT_ASSIGNED:{ icon: Briefcase,     cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' },
  LEAD_NEW:         { icon: UserPlus,      cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' },
  LEAD_RM_ASSIGNED: { icon: UserPlus,      cls: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400' },
  BIRTHDAY:         { icon: Cake,          cls: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' },
  QUERY_RAISED:     { icon: HelpCircle,    cls: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400' },
};
const fallbackMeta = { icon: Bell, cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' };

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export default function NotificationPanel({ notifications = [], onMarkRead, onMarkAllRead, onOpen }) {
  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">Notifications</span>
          {notifications.length > 0 && (
            <span className="text-[9px] font-black text-white bg-rose-500 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
              {notifications.length > 99 ? '99+' : notifications.length}
            </span>
          )}
        </div>
        {notifications.length > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
            title="Mark all as read"
          >
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-3">
            <Bell size={20} />
          </div>
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">You're all caught up</h4>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[220px] leading-relaxed">
            New tasks, meetings, leads, prospects and birthdays will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 max-h-[360px] overflow-y-auto -mr-1 pr-1">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || fallbackMeta;
            const Icon = meta.icon;
            const clickable = !!n.link;
            return (
              <li
                key={n.id}
                className={`group flex items-start gap-2.5 p-2 rounded-xl transition-colors ${clickable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                onClick={clickable ? () => onOpen?.(n) : undefined}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.cls}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-snug">{n.title}</p>
                  {n.body && <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug truncate">{n.body}</p>}
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{relativeTime(n.createdAt)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkRead?.(n.id); }}
                  className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Mark as read"
                >
                  <Check size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
