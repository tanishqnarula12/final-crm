// On-screen toast previews. Two streams share one top-right stack:
//   • business notifications (task/meeting/lead/prospect/birthday) — arrive via
//     the notifications service; each pops a preview, plays the bell jingle and
//     shakes the bell.
//   • chat messages — when a new message arrives from someone else AND the user
//     isn't currently in the Chat module, a preview pops here too (the "new
//     chat notification" the chat module can't show while you're elsewhere).
// Each toast auto-dismisses after a few seconds; clicking it navigates.
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell, X, ClipboardList, AlarmClock, Video, Briefcase, UserPlus, Cake, MessageSquare, HelpCircle,
  CalendarClock, CalendarCheck2,
} from 'lucide-react';
import { onNotificationArrival, playNotificationJingle } from '../services/notifications';
import { onChatEvent } from '../services/chat';
import { getCurrentUser } from '../utils/auth';
import { teamName } from '../services/team';

const TYPE_META = {
  TASK_ASSIGNED:    { icon: ClipboardList, ring: 'ring-blue-500/30',   dot: 'bg-blue-500' },
  TASK_DUE:         { icon: AlarmClock,    ring: 'ring-rose-500/30',   dot: 'bg-rose-500' },
  MEETING_SOON:     { icon: Video,         ring: 'ring-violet-500/30', dot: 'bg-violet-500' },
  PROSPECT_ASSIGNED:{ icon: Briefcase,     ring: 'ring-amber-500/30',  dot: 'bg-amber-500' },
  LEAD_NEW:         { icon: UserPlus,      ring: 'ring-emerald-500/30',dot: 'bg-emerald-500' },
  LEAD_RM_ASSIGNED: { icon: UserPlus,      ring: 'ring-teal-500/30',   dot: 'bg-teal-500' },
  BIRTHDAY:         { icon: Cake,          ring: 'ring-pink-500/30',   dot: 'bg-pink-500' },
  QUERY_RAISED:     { icon: HelpCircle,    ring: 'ring-indigo-500/30', dot: 'bg-indigo-500' },
  LEAVE_APPLIED:    { icon: CalendarClock, ring: 'ring-amber-500/30',  dot: 'bg-amber-500' },
  LEAVE_RESPONDED:  { icon: CalendarCheck2,ring: 'ring-emerald-500/30',dot: 'bg-emerald-500' },
};
const fallback = { icon: Bell, ring: 'ring-slate-400/30', dot: 'bg-slate-400' };
const AUTO_DISMISS_MS = 6000;

export default function NotificationToaster({ view, onOpen, onOpenChat, onBellShake }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  };

  const push = (toast) => {
    setToasts((prev) => {
      if (prev.some((t) => t.id === toast.id)) return prev;
      return [toast, ...prev].slice(0, 4); // keep the stack short
    });
    const tm = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    timers.current.set(toast.id, tm);
  };

  // Business notifications.
  useEffect(() => {
    return onNotificationArrival((n) => {
      playNotificationJingle();
      onBellShake?.();
      push({ kind: 'notif', id: n.id, type: n.type, title: n.title, body: n.body, link: n.link });
    });
  }, [onBellShake]);

  // Chat messages — only surface here when NOT already in the chat module.
  useEffect(() => {
    const meId = getCurrentUser()?.id;
    return onChatEvent('message:new', ({ message }) => {
      if (!message || message.senderId === meId) return;
      if (view === 'chat') return; // the chat module shows it in place
      const sender = teamName(message.senderId) || 'New message';
      const snippet = (message.content || '').trim()
        || (message.attachments?.length ? '📎 Attachment' : (message.type === 'poll' ? '📊 Poll' : 'sent a message'));
      playNotificationJingle();
      push({ kind: 'chat', id: `chat-${message.id}`, title: sender, body: snippet });
    });
  }, [view]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { timers.current.forEach((tm) => clearTimeout(tm)); }, []);

  if (!toasts.length) return null;

  return createPortal(
    <div className="fixed top-16 right-4 z-[9998] flex flex-col gap-2.5 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => {
        const meta = t.kind === 'chat'
          ? { icon: MessageSquare, ring: 'ring-blue-500/30', dot: 'bg-blue-500' }
          : (TYPE_META[t.type] || fallback);
        const Icon = meta.icon;
        const handleClick = () => {
          if (t.kind === 'chat') onOpenChat?.();
          else onOpen?.(t);
          dismiss(t.id);
        };
        return (
          <div
            key={t.id}
            onClick={handleClick}
            className={`pointer-events-auto cursor-pointer flex items-start gap-3 p-3.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 shadow-2xl ring-1 ${meta.ring} animate-slide-in-right`}
          >
            <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${meta.dot}`}>
              <Icon size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100 leading-snug truncate">{t.title}</p>
              {t.body && <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mt-0.5">{t.body}</p>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
              className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
