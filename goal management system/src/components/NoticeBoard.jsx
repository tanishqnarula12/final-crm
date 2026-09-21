import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, Cake, PartyPopper, MessageSquare, Calendar, Palmtree, Pin, Trash2, Plus, X, Smile } from 'lucide-react';
import { Card, Avatar, inputCls, selectCls, btnPrimary, btnSecondary, CoolSelect } from './UI';
import { listNotices, createNotice, deleteNotice, reactToNotice, NOTICE_TYPES, VISIBLE_FOR_OPTIONS } from '../services/notices';
import { teamName } from '../services/team';
import { onChatEvent } from '../services/chat';
import { getCurrentUser } from '../utils/auth';
import { QUICK_REACTIONS } from './chat/emojiData';
import EmojiPicker from './chat/EmojiPicker';
import logoImg from '../assets/logo.png';

const TYPE_META = {
  GENERAL: { label: 'General', icon: MessageSquare, badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  ANNOUNCEMENT: { label: 'Announcement', icon: Megaphone, badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  HOLIDAY: { label: 'Holiday', icon: Calendar, badge: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' },
  BIRTHDAY: { label: 'Birthday', icon: Cake, badge: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' },
  EVENT: { label: 'Event', icon: PartyPopper, badge: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  LEAVE: { label: 'Leave', icon: Palmtree, badge: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400' },
};
// System-only types — never manually postable (birthdays/leave are generated
// automatically from real profile/HR data, so letting anyone free-type one
// would let them fake an announcement about someone else).
const SYSTEM_ONLY_TYPES = ['BIRTHDAY', 'LEAVE'];
const MANAGER_ROLES = ['ADMIN', 'INTERNAL_MANAGER'];

// Local YYYY-MM-DD — never use toISOString() here (UTC-based; near midnight
// IST it can report the wrong calendar day).
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const fmtDate = (isoOrDateStr) => {
  const d = new Date(isoOrDateStr.length === 10 ? `${isoOrDateStr}T00:00:00` : isoOrDateStr);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const timeAgo = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function NoticeBoard() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [toast, setToast] = useState('');
  const me = getCurrentUser();

  const toggleExpand = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const refresh = useCallback(() => {
    listNotices().then(setNotices).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // True real-time sync: the server broadcasts notice:new / notice:deleted to
  // EVERY connected socket the instant anyone posts or removes a notice (open
  // board = open broadcast, not scoped to notification recipients), so every
  // dashboard patches its list immediately — no refetch, no window-focus wait,
  // and it covers deletes too (which never had a notification of their own).
  // window focus stays as a cheap fallback in case a tab's socket dropped.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const offNew = onChatEvent('notice:new', ({ notice }) => {
      if (!notice) return;
      setNotices((cur) => (cur.some((n) => n.id === notice.id) ? cur : [notice, ...cur]));
    });
    const offDeleted = onChatEvent('notice:deleted', ({ id }) => {
      setNotices((cur) => cur.filter((n) => n.id !== id));
    });
    // A reaction (by anyone, on any device) patches that one notice's
    // reactions live — this is also how MY OWN reaction round-trips back in,
    // since the optimistic update below is overwritten by this once the
    // server responds/broadcasts, keeping a single source of truth.
    const offUpdated = onChatEvent('notice:updated', ({ notice }) => {
      if (!notice) return;
      setNotices((cur) => cur.map((n) => (n.id === notice.id ? notice : n)));
    });
    return () => { window.removeEventListener('focus', onFocus); offNew(); offDeleted(); offUpdated(); };
  }, [refresh]);

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this notice?')) return;
    const prev = notices;
    setNotices((cur) => cur.filter((n) => n.id !== id));
    try { await deleteNotice(id); } catch { setNotices(prev); }
  };

  // Optimistic, mirroring the same one-emoji-per-user toggle the server
  // applies, so the click feels instant instead of waiting on a round trip —
  // reconciled moments later by the notice:updated broadcast above (or, for
  // the reactor's own tab if the socket event races the HTTP response,
  // simply left as-is since both land on the same end state).
  const handleReact = async (id, emoji) => {
    const meId = me?.id;
    setNotices((cur) => cur.map((n) => {
      if (n.id !== id) return n;
      const reactions = {};
      for (const [e, ids] of Object.entries(n.reactions || {})) {
        const kept = (ids || []).filter((uid) => uid !== meId);
        if (kept.length) reactions[e] = kept;
      }
      const hadSame = (n.reactions?.[emoji] || []).includes(meId);
      if (!hadSame) reactions[emoji] = [...(reactions[emoji] || []), meId];
      return { ...n, reactions };
    }));
    try {
      const { notice } = await reactToNotice(id, emoji);
      setNotices((cur) => cur.map((n) => (n.id === id ? notice : n)));
    } catch {
      refresh(); // reconcile with the server rather than leave a stale optimistic state
    }
  };

  const canDelete = (n) => n.createdBy === me?.id || (me?.roles || []).some((r) => MANAGER_ROLES.includes(r));
  const visible = showAll ? notices : notices.slice(0, 5);

  // { id, anchorRect } of the notice whose reaction popover is open, or null.
  const [reactPopover, setReactPopover] = useState(null);
  const [reactFull, setReactFull] = useState(false);
  const openReactPopover = (id, e) => {
    setReactPopover({ id, anchorRect: e.currentTarget.getBoundingClientRect() });
    setReactFull(false);
  };
  const closeReactPopover = () => { setReactPopover(null); setReactFull(false); };
  const pickReaction = (emoji) => { handleReact(reactPopover.id, emoji); closeReactPopover(); };

  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0"><Pin size={14} /></span>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Notice Board</h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Birthdays, holidays &amp; team announcements</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/20 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
          title="Post a Notice"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="space-y-2.5">
        {visible.map((n) => {
          const meta = TYPE_META[n.type] || TYPE_META.GENERAL;
          const Icon = meta.icon;
          const posterName = n.createdBy ? teamName(n.createdBy) : 'Team Fintness';
          const isLong = n.message.length > 110;
          const isExpanded = expanded.has(n.id);
          const reactionEntries = Object.entries(n.reactions || {}).filter(([, ids]) => (ids || []).length > 0);
          const myEmoji = reactionEntries.find(([, ids]) => ids.includes(me?.id))?.[0] || null;
          return (
            <div key={n.id} className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/10 group">
              <div className="flex items-start gap-2.5">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.badge}`}><Icon size={13} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{n.title}</h5>
                    {canDelete(n) && (
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-350 hover:text-rose-600 transition-all shrink-0 cursor-pointer"
                        title="Remove notice"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p className={`text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5 whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-2'}`}>{n.message}</p>
                  {isLong && (
                    <button
                      onClick={() => toggleExpand(n.id)}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-450 hover:underline mt-0.5 cursor-pointer"
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Avatar name={posterName} photo={n.createdBy ? undefined : logoImg} size="xs" />
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">{posterName} · {timeAgo(n.createdAt)}</span>
                  </div>

                  {/* Reactions — emoji pills (click yours to remove, click any
                      to switch) plus a React button that opens the picker. */}
                  <div className="flex items-center flex-wrap gap-1 mt-1.5">
                    {reactionEntries.map(([emoji, ids]) => {
                      const reactedByMe = ids.includes(me?.id);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleReact(n.id, emoji)}
                          title={ids.map((uid) => teamName(uid) || 'Someone').join(', ')}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer hover:scale-105 ${
                            reactedByMe
                              ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span className="text-xs leading-none">{emoji}</span>
                          <span className="tabular-nums">{ids.length}</span>
                        </button>
                      );
                    })}
                    <button
                      onClick={(e) => openReactPopover(n.id, e)}
                      title="React"
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                        myEmoji
                          ? 'opacity-0 group-hover:opacity-100 border-transparent text-slate-400 hover:text-amber-500'
                          : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500 hover:border-amber-300 dark:hover:border-amber-800'
                      }`}
                    >
                      <Smile size={11} /> {!myEmoji && 'React'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {reactPopover && createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={closeReactPopover} />
            <div
              style={{
                position: 'fixed',
                top: reactPopover.anchorRect.bottom + 6,
                left: Math.min(reactPopover.anchorRect.left, window.innerWidth - (reactFull ? 300 : 240)),
                zIndex: 50,
              }}
              className="animate-scale-up"
            >
              {reactFull ? (
                <EmojiPicker onPick={pickReaction} />
              ) : (
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-2xl px-1.5 py-1">
                  {QUICK_REACTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => pickReaction(e)}
                      className="w-9 h-9 text-xl leading-none rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-125 transition-all cursor-pointer flex items-center justify-center"
                    >
                      {e}
                    </button>
                  ))}
                  <button onClick={() => setReactFull(true)} title="More emojis" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-blue-600 flex items-center justify-center cursor-pointer transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              )}
            </div>
          </>,
          document.body
        )}

        {!loading && notices.length === 0 && (
          <div className="p-4 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500">
            <Pin size={20} className="mb-1 opacity-55 text-slate-350" />
            <p className="text-xs font-bold">No notices yet — be the first to post one.</p>
          </div>
        )}
      </div>

      {notices.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] font-bold text-blue-600 dark:text-blue-450 hover:underline cursor-pointer"
        >
          {showAll ? 'Show Less' : `View All (${notices.length})`}
        </button>
      )}

      {toast && (
        <p className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{toast}</p>
      )}

      {showForm && (
        <NewNoticeModal
          onClose={() => setShowForm(false)}
          onPosted={({ notice, scheduled }) => {
            setShowForm(false);
            if (scheduled) {
              setToast(`✅ Notice scheduled for ${fmtDate(notice.effectiveDate)}`);
              setTimeout(() => setToast(''), 5000);
            } else {
              setNotices((prev) => (prev.some((n) => n.id === notice.id) ? prev : [notice, ...prev]));
            }
          }}
        />
      )}
    </Card>
  );
}

function NewNoticeModal({ onClose, onPosted }) {
  const [type, setType] = useState('GENERAL');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(() => localDateStr());
  const [time, setTime] = useState('');
  const [visibleForDays, setVisibleForDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const today = localDateStr();
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const isScheduled = date > today || (date === today && time && time > nowTime());

  const submit = async () => {
    if (!title.trim() || !message.trim()) { setError('Title and message are required.'); return; }
    setSaving(true);
    setError('');
    try {
      const result = await createNotice({ type, title: title.trim(), message: message.trim(), date, time: time || null, visibleForDays });
      onPosted(result);
    } catch (err) {
      setError(err.message || 'Could not post the notice.');
      setSaving(false);
    }
  };

  // Portaled straight to <body> — NoticeBoard renders inside UI.jsx's <Card>,
  // whose backdrop-blur establishes a containing block for fixed-position
  // descendants (per the CSS Filter Effects spec, same as `transform`), which
  // trapped this modal inside the card's own box instead of the viewport.
  // Every other overlay in this app (CoolSelect's menu, the sidebar flyout)
  // already portals to document.body for exactly this reason.
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md flex flex-col max-h-[90vh] shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Post a Notice</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Notice Type</label>
            <CoolSelect showValueOnSelect value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
              {NOTICE_TYPES.filter((t) => !SYSTEM_ONLY_TYPES.includes(t)).map((t) => (
                <option key={t} value={t}>{TYPE_META[t]?.label || t}</option>
              ))}
            </CoolSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Notice Date</label>
              <input
                type="date" value={date} min={today}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Notice Time <span className="normal-case text-slate-350 dark:text-slate-600">(optional)</span>
              </label>
              <input
                type="time" value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Visible For</label>
            <CoolSelect
              value={visibleForDays === null ? 'null' : String(visibleForDays)}
              onChange={(e) => setVisibleForDays(e.target.value === 'null' ? null : Number(e.target.value))}
              className={selectCls}
            >
              {VISIBLE_FOR_OPTIONS.map((o) => (
                <option key={o.label} value={o.days === null ? 'null' : o.days}>{o.label}</option>
              ))}
            </CoolSelect>
          </div>
          {isScheduled && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 -mt-2">
              This will post on {fmtDate(date)}{time ? ` at ${time}` : ''} — it stays hidden (including from you) until then.
            </p>
          )}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Title</label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office closed for Diwali" className={inputCls} maxLength={140}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Message</label>
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              placeholder="Details for the team…" className={inputCls} maxLength={2000}
            />
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-450 font-bold">{error}</p>}
        </div>
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl shrink-0 flex justify-end gap-2.5">
          <button onClick={onClose} className={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={saving} className={btnPrimary + (saving ? ' opacity-60 cursor-not-allowed' : '')}>
            {saving ? 'Posting…' : 'Post Notice'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
