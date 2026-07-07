import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, Pin, Pencil, Trash2, Copy, CornerUpLeft, Download, ChevronUp,
  CheckCheck, Check, Users as UsersIcon, MessageSquare, ExternalLink, ArrowLeft,
  ChevronDown, Smile, Plus, BarChart3, MoreVertical, Info, Eraser,
} from 'lucide-react';
import {
  fetchMessages, sendMessage, editMessage, deleteMessage, pinMessage,
  markRead, searchMessages, fetchPinned, onChatEvent,
  reactToMessage, votePoll, clearChat,
} from '../../services/chat';
import { ChatAvatar, GroupAvatar } from './Avatars';
import {
  fileMeta, humanSize, isImageAttachment,
  fmtTime, dayLabel, renderContent, conversationName, conversationOtherUser,
} from './chatFormat';
import Composer from './Composer';
import EmojiPicker from './EmojiPicker';
import { QUICK_REACTIONS } from './emojiData';
import ProfileCard from './ProfileCard';
import GroupInfoPanel from './GroupInfoPanel';

export default function MessagePane({ conv, me, usersById, onlineSet, onQuickAction, onBackToList, onConversationUpdate, onConversationRemoved }) {
  const [messages, setMessages] = useState([]); // ascending by createdAt
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> name
  const [highlightId, setHighlightId] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { dataUrl, name }
  const [dragOver, setDragOver] = useState(false);
  const [profileUser, setProfileUser] = useState(null); // ProfileCard target
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

  // Search & pinned panels
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [pinnedList, setPinnedList] = useState([]);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimers = useRef({});
  const dragCounter = useRef(0);
  const headerMenuBtnRef = useRef(null);

  const convId = conv.id;
  const isGroup = conv.type === 'GROUP';
  const others = useMemo(() => conv.members.filter((m) => m.userId !== me.id), [conv.members, me.id]);
  const otherUser = conversationOtherUser(conv, me.id, usersById);
  const title = conversationName(conv, me.id, usersById);
  const memberUsers = useMemo(
    () => conv.members.map((m) => usersById.get(m.userId)).filter(Boolean),
    [conv.members, usersById]
  );

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const nearBottom = () => {
    const el = scrollRef.current;
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight < 140 : true;
  };

  // ---- Initial load & conversation switches --------------------------------
  useEffect(() => {
    let cancelled = false;
    setMessages([]); setLoading(true); setReplyTo(null); setEditing(null);
    setSearchOpen(false); setSearchQ(''); setSearchResults(null);
    setPinnedList([]); setPinnedIndex(0); setTypingUsers({}); setGroupInfoOpen(false);
    (async () => {
      try {
        const { messages: batch, hasMore: more } = await fetchMessages(convId);
        if (cancelled) return;
        setMessages(batch.slice().reverse());
        setHasMore(more);
        markRead(convId).catch(() => {});
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    fetchPinned(convId).then(({ messages: pins }) => { if (!cancelled) setPinnedList(pins); }).catch(() => {});
    return () => { cancelled = true; };
  }, [convId]);

  // Keep the pinned-index in range as the pinned list shrinks (unpin/delete).
  useEffect(() => {
    setPinnedIndex((i) => Math.min(i, Math.max(0, pinnedList.length - 1)));
  }, [pinnedList.length]);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [loading]);

  // ---- Socket subscriptions -------------------------------------------------
  useEffect(() => {
    const offNew = onChatEvent('message:new', ({ message }) => {
      if (message.conversationId !== convId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.senderId === me.id || nearBottom()) {
        requestAnimationFrame(() => scrollToBottom(true));
      }
      if (message.senderId !== me.id) markRead(convId).catch(() => {});
    });
    const offUpdate = onChatEvent('message:update', ({ message }) => {
      if (message.conversationId !== convId) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
      setPinnedList((prev) => {
        const rest = prev.filter((p) => p.id !== message.id);
        return message.pinned && !message.deleted ? [message, ...rest] : rest;
      });
    });
    const offTyping = onChatEvent('typing', ({ conversationId, userId, name, isTyping }) => {
      if (conversationId !== convId || userId === me.id) return;
      clearTimeout(typingTimers.current[userId]);
      if (isTyping) {
        setTypingUsers((prev) => ({ ...prev, [userId]: name }));
        typingTimers.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => { const n = { ...prev }; delete n[userId]; return n; });
        }, 3500);
      } else {
        setTypingUsers((prev) => { const n = { ...prev }; delete n[userId]; return n; });
      }
    });
    return () => { offNew(); offUpdate(); offTyping(); };
  }, [convId, me.id]);

  // ---- Pagination & jumping ---------------------------------------------------
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !messages.length) return null;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    try {
      const { messages: batch, hasMore: more } = await fetchMessages(convId, messages[0].createdAt);
      const older = batch.slice().reverse();
      setMessages((prev) => [...older, ...prev]);
      setHasMore(more);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
      return older;
    } finally {
      setLoadingOlder(false);
    }
  }, [convId, messages, loadingOlder]);

  const flash = (id) => {
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1800);
  };

  const jumpTo = async (id) => {
    setSearchOpen(false);
    for (let i = 0; i < 12; i++) {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flash(id);
        return;
      }
      const older = await loadOlderRef.current();
      if (!older || older.length === 0) break;
    }
  };
  const loadOlderRef = useRef(loadOlder);
  useEffect(() => { loadOlderRef.current = loadOlder; }, [loadOlder]);

  // ---- Actions ------------------------------------------------------------------
  const handleSend = async ({ content, attachments, mentions, replyToId, poll }) => {
    const { message } = await sendMessage(convId, { content, attachments, mentions, replyToId, poll });
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setReplyTo(null);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const handleSaveEdit = async (content) => {
    await editMessage(editing.id, content);
    setEditing(null);
  };

  const handleDelete = (m) => setDeleteTarget(m);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMessage(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      alert(err?.message || 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  const handlePin = async (m) => {
    try { await pinMessage(m.id, !m.pinned); } catch (err) { alert(err?.message || 'Failed.'); }
  };

  const handleReact = async (m, emoji) => {
    try { await reactToMessage(m.id, emoji); } catch (err) { console.error('react failed', err); }
  };

  const handleVote = async (m, optionId) => {
    try { await votePoll(m.id, optionId); } catch (err) { console.error('vote failed', err); }
  };

  const openProfile = (user) => { if (user) setProfileUser(user); };
  const openHeaderInfo = () => { if (isGroup) setGroupInfoOpen(true); else openProfile(otherUser); };

  const handleClearChat = async () => {
    setHeaderMenuOpen(false);
    if (!window.confirm('Clear this chat? Messages will be removed from your view only — nothing is deleted for the other side.')) return;
    setClearing(true);
    try {
      await clearChat(convId);
      setMessages([]);
      setHasMore(false);
    } catch (err) {
      alert(err?.message || 'Failed to clear chat.');
    } finally {
      setClearing(false);
    }
  };

  const runSearch = async (q) => {
    setSearchQ(q);
    if (!q.trim()) { setSearchResults(null); return; }
    try {
      const { messages: hits } = await searchMessages(convId, q.trim());
      setSearchResults(hits);
    } catch { setSearchResults([]); }
  };

  // ---- Drag & drop ---------------------------------------------------------------
  const onDragEnter = (e) => { e.preventDefault(); dragCounter.current += 1; setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragOver(false); } };
  const onDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0; setDragOver(false);
    if (e.dataTransfer?.files?.length) composerRef.current?.addFiles(e.dataTransfer.files);
  };

  // ---- Read receipts (WhatsApp ticks) -----------------------------------------------
  const readByAll = (m) =>
    others.length > 0 && others.every((o) => new Date(o.lastReadAt) >= new Date(m.createdAt));

  // ---- Presence / status line ----------------------------------------------------------
  const typingNames = Object.values(typingUsers);
  const statusLine = typingNames.length
    ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…`
    : isGroup
      ? memberUsers.map((u) => (u.id === me.id ? 'You' : u.name.split(' ')[0])).join(', ')
      : (otherUser && onlineSet.has(otherUser.id) ? 'Online' : 'Offline');

  return (
    <div
      className="flex-1 flex flex-col min-w-0 relative"
      onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-40 bg-blue-600/10 backdrop-blur-[2px] border-2 border-dashed border-blue-500 rounded-none flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="px-6 py-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-2xl text-sm font-bold text-blue-600 dark:text-blue-400">
            Drop files to attach 📎
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        {onBackToList && (
          <button
            onClick={onBackToList}
            className="md:hidden p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-805 cursor-pointer transition-all active:scale-95 border border-slate-200/40 dark:border-slate-800/40"
            title="Back to chats"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        {/* Clickable header → profile (DM) or group info (GROUP) */}
        <button onClick={openHeaderInfo} className="flex items-center gap-3 min-w-0 flex-1 text-left group/hdr cursor-pointer">
          {isGroup
            ? (conv.photo ? <img src={conv.photo} alt={title} className="w-10 h-10 rounded-full object-cover shrink-0" /> : <GroupAvatar size={40} />)
            : <ChatAvatar user={otherUser} size={40} online={otherUser ? onlineSet.has(otherUser.id) : false} />}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate flex items-center gap-2 group-hover/hdr:text-blue-600 dark:group-hover/hdr:text-blue-400 transition-colors">
              {title}
              {isGroup && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-full">
                  <UsersIcon size={9} /> {conv.members.length}
                </span>
              )}
            </h3>
            <p className={`text-[11px] truncate font-medium ${typingNames.length ? 'text-blue-500 animate-pulse' : 'text-slate-450 dark:text-slate-500'}`}>
              {statusLine}
            </p>
          </div>
        </button>
        <button
          ref={headerMenuBtnRef}
          onClick={() => setHeaderMenuOpen((o) => !o)}
          title="Chat menu"
          className={`p-2 rounded-xl transition-all cursor-pointer ${headerMenuOpen ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30'}`}
        >
          <MoreVertical size={18} />
        </button>
        {headerMenuOpen && (
          <AnchoredPopover anchorRef={headerMenuBtnRef} placement="bottom" onClose={() => setHeaderMenuOpen(false)}>
            <div className="w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-1.5 overflow-hidden">
              <MenuItem icon={Info} label="Details" onClick={() => { setHeaderMenuOpen(false); openHeaderInfo(); }} />
              <MenuItem icon={Search} label="Search" onClick={() => { setHeaderMenuOpen(false); setSearchOpen((o) => !o); setSearchQ(''); setSearchResults(null); }} />
              <MenuItem icon={Eraser} label={clearing ? 'Clearing…' : 'Clear chat'} onClick={handleClearChat} danger disabled={clearing} />
            </div>
          </AnchoredPopover>
        )}
      </div>

      {/* Search bar + results */}
      {searchOpen && (
        <div className="shrink-0 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 animate-fade-in">
          <div className="relative px-4 py-2.5">
            <Search size={13} className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              autoFocus value={searchQ} onChange={(e) => runSearch(e.target.value)}
              placeholder="Search this chat…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 placeholder-slate-400"
            />
          </div>
          {searchResults !== null && (
            <div className="max-h-56 overflow-y-auto px-2 pb-2">
              {searchResults.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic px-3 py-2">No messages found.</p>
              ) : searchResults.map((r) => (
                <button key={r.id} onClick={() => jumpTo(r.id)} className="w-full text-left px-3 py-2 rounded-xl hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500">{usersById.get(r.senderId)?.name || '—'}</span>
                    <span className="text-[9px] text-slate-400">{dayLabel(r.createdAt)} · {fmtTime(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{r.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pinned message bar — WhatsApp-style: shows one pinned message at a time,
          click to jump to it, chevron cycles through the rest when there's more than one. */}
      {pinnedList.length > 0 && (
        <div className="shrink-0 flex items-center gap-2.5 pl-4 pr-2 py-2 border-b border-amber-200/50 dark:border-amber-900/30 bg-amber-50/70 dark:bg-amber-950/15 animate-fade-in">
          <Pin size={14} className="text-amber-500 shrink-0" />
          <button onClick={() => jumpTo(pinnedList[pinnedIndex]?.id)} className="min-w-0 flex-1 text-left cursor-pointer">
            <div className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Pinned message{pinnedList.length > 1 ? ` · ${pinnedIndex + 1}/${pinnedList.length}` : ''}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
              {pinnedList[pinnedIndex]?.content || '📎 Attachment'}
            </div>
          </button>
          {pinnedList.length > 1 && (
            <button
              onClick={() => setPinnedIndex((i) => (i + 1) % pinnedList.length)}
              title="Next pinned message"
              className="p-1.5 rounded-full text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-950/40 cursor-pointer shrink-0 transition-colors"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 chat-doodle-bg">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs font-semibold text-slate-400 animate-pulse">Loading messages…</span>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-1">
                <button onClick={loadOlder} disabled={loadingOlder} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-600 shadow-sm transition-all cursor-pointer">
                  <ChevronUp size={11} /> {loadingOlder ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center">
                  <MessageSquare size={24} />
                </div>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No messages yet</p>
                <p className="text-xs text-slate-400">Say hi to start the conversation 👋</p>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const mine = m.senderId === me.id;
              const sender = usersById.get(m.senderId);
              const grouped = prev && prev.senderId === m.senderId && !showDay &&
                new Date(m.createdAt) - new Date(prev.createdAt) < 4 * 60 * 1000;
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 shadow-sm">
                        {dayLabel(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    m={m} mine={mine} meId={me.id} sender={sender} grouped={grouped}
                    isGroup={isGroup}
                    isAdmin={(me.roles || []).includes('ADMIN')}
                    highlighted={highlightId === m.id}
                    read={mine && readByAll(m)}
                    onReply={() => { setEditing(null); setReplyTo(m); }}
                    onEdit={() => { setReplyTo(null); setEditing(m); }}
                    onDelete={() => handleDelete(m)}
                    onPin={() => handlePin(m)}
                    onReact={(emoji) => handleReact(m, emoji)}
                    onVote={(optionId) => handleVote(m, optionId)}
                    onJumpToReply={() => m.replyTo && jumpTo(m.replyTo.id)}
                    onOpenImage={(a) => setLightbox({ dataUrl: a.dataUrl, name: a.name })}
                    onOpenProfile={openProfile}
                    usersById={usersById}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Composer */}
      <Composer
        ref={composerRef}
        conversationId={convId}
        isGroup={isGroup}
        members={memberUsers.filter((u) => u.id !== me.id)}
        usersById={usersById}
        replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
        editing={editing} onCancelEdit={() => setEditing(null)}
        onSend={handleSend} onSaveEdit={handleSaveEdit}
        onQuickAction={onQuickAction}
      />

      {/* Image lightbox */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in" onClick={() => setLightbox(null)}>
          <div className="max-w-4xl max-h-[90vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-[80vh] rounded-2xl object-contain shadow-2xl animate-scale-up" />
            <div className="flex items-center justify-between text-white/90">
              <span className="text-xs font-bold truncate">{lightbox.name}</span>
              <div className="flex items-center gap-3">
                <a href={lightbox.dataUrl} download={lightbox.name} className="inline-flex items-center gap-1.5 text-xs font-bold hover:text-white cursor-pointer"><Download size={13} /> Download</a>
                <button onClick={() => setLightbox(null)} className="hover:text-white cursor-pointer"><X size={18} /></button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete message confirmation (WhatsApp-style modal, not a native confirm()) */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-5">Delete message?</h3>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Profile card */}
      {profileUser && (
        <ProfileCard
          user={profileUser}
          online={onlineSet.has(profileUser.id)}
          isSelf={profileUser.id === me.id}
          onClose={() => setProfileUser(null)}
        />
      )}

      {/* Group info drawer */}
      {groupInfoOpen && isGroup && (
        <GroupInfoPanel
          conv={conv} me={me} usersById={usersById} onlineSet={onlineSet}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={(c) => onConversationUpdate?.(c)}
          onDeleted={(id) => onConversationRemoved?.(id)}
          onOpenProfile={(u) => openProfile(u)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anchored popover (menus, reaction bar) — portal-positioned near an anchor,
// closes on outside-click / Escape. Avoids clipping inside the scroll area.
// ---------------------------------------------------------------------------
function AnchoredPopover({ anchorRef, onClose, placement = 'bottom', children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const { width, height } = el.getBoundingClientRect();
    const margin = 6;
    let top = placement === 'top' ? a.top - height - margin : a.bottom + margin;
    let left = a.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    if (placement === 'bottom' && top + height > window.innerHeight - 8) top = a.top - height - margin;
    if (placement === 'top' && top < 8) top = a.bottom + margin;
    setPos({ top: Math.max(8, top), left });
  }, [anchorRef, placement]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, zIndex: 9990, visibility: pos ? 'visible' : 'hidden' }}
      className="animate-pop-in"
    >
      {children}
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// A single message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  m, mine, meId, sender, grouped, isGroup, isAdmin, highlighted, read,
  onReply, onEdit, onDelete, onPin, onReact, onVote, onJumpToReply, onOpenImage, onOpenProfile, usersById,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [reactFull, setReactFull] = useState(false);
  const caretRef = useRef(null);
  const smileyRef = useRef(null);

  const canEdit = mine && !m.deleted && (m.content || '').length > 0 && m.type !== 'poll';
  const canDelete = (mine || isAdmin) && !m.deleted;

  const bubbleCls = mine
    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-lg shadow-blue-500/15'
    : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200/70 dark:border-slate-800 rounded-2xl rounded-bl-md shadow-sm';

  const images = (m.attachments || []).filter(isImageAttachment);
  const files = (m.attachments || []).filter((a) => !isImageAttachment(a));

  const reactionEntries = Object.entries(m.reactions || {}).filter(([, ids]) => (ids || []).length > 0);
  const myEmoji = reactionEntries.find(([, ids]) => ids.includes(meId))?.[0] || null;

  const doReact = (emoji) => { onReact(emoji); setReactOpen(false); setReactFull(false); };

  return (
    <div id={`msg-${m.id}`} className={`group flex gap-2 animate-msg-in ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2.5'} ${highlighted ? 'animate-pulse' : ''}`}>
      {!mine && (
        <div className="w-8 shrink-0 self-end">
          {!grouped && (
            <button onClick={() => onOpenProfile(sender)} className="cursor-pointer" title={sender?.name}>
              <ChatAvatar user={sender} size={30} />
            </button>
          )}
        </div>
      )}

      <div className={`relative max-w-[78%] md:max-w-[64%] ${highlighted ? 'ring-2 ring-amber-400 rounded-2xl' : ''}`}>
        {/* Hover controls: react (smiley) + menu (caret) */}
        {!m.deleted && (
          <div className={`absolute -top-3.5 ${mine ? 'left-1' : 'right-1'} flex items-center gap-0.5 z-10 transition-opacity ${menuOpen || reactOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button
              ref={smileyRef}
              onClick={() => { setReactOpen((o) => !o); setReactFull(false); setMenuOpen(false); }}
              title="React"
              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-slate-500 hover:text-amber-500 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Smile size={14} />
            </button>
            <button
              ref={caretRef}
              onClick={() => { setMenuOpen((o) => !o); setReactOpen(false); }}
              title="More"
              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md text-slate-500 hover:text-blue-600 flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronDown size={15} />
            </button>
          </div>
        )}

        {/* Reaction quick-bar / full picker */}
        {reactOpen && (
          <AnchoredPopover anchorRef={smileyRef} placement="top" onClose={() => { setReactOpen(false); setReactFull(false); }}>
            {reactFull ? (
              <EmojiPicker onPick={doReact} />
            ) : (
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-2xl px-1.5 py-1">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => doReact(e)}
                    className={`w-9 h-9 text-xl leading-none rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:scale-125 transition-all cursor-pointer flex items-center justify-center ${myEmoji === e ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}
                  >
                    {e}
                  </button>
                ))}
                <button onClick={() => setReactFull(true)} title="More emojis" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-blue-600 flex items-center justify-center cursor-pointer transition-colors">
                  <Plus size={16} />
                </button>
              </div>
            )}
          </AnchoredPopover>
        )}

        {/* Action menu (WhatsApp-web style) */}
        {menuOpen && (
          <AnchoredPopover anchorRef={caretRef} placement="bottom" onClose={() => setMenuOpen(false)}>
            <div className="w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-1.5 overflow-hidden">
              <MenuItem icon={CornerUpLeft} label="Reply" onClick={() => { onReply(); setMenuOpen(false); }} />
              {m.content && <MenuItem icon={Copy} label="Copy" onClick={() => { navigator.clipboard?.writeText(m.content); setMenuOpen(false); }} />}
              <MenuItem icon={Pin} label={m.pinned ? 'Unpin' : 'Pin'} onClick={() => { onPin(); setMenuOpen(false); }} />
              {canEdit && <MenuItem icon={Pencil} label="Edit" onClick={() => { onEdit(); setMenuOpen(false); }} />}
              {canDelete && <MenuItem icon={Trash2} label="Delete" danger onClick={() => { onDelete(); setMenuOpen(false); }} />}
            </div>
          </AnchoredPopover>
        )}

        <div className={`px-3.5 py-2 ${bubbleCls}`}>
          {isGroup && !mine && !grouped && (
            <button onClick={() => onOpenProfile(sender)} className="text-[10px] font-black text-blue-600 dark:text-blue-400 mb-0.5 hover:underline cursor-pointer">
              {sender?.name || 'Unknown'}
            </button>
          )}

          {m.pinned && !m.deleted && (
            <div className={`flex items-center gap-1 text-[9px] font-bold mb-1 ${mine ? 'text-amber-200' : 'text-amber-500'}`}>
              <Pin size={9} /> Pinned
            </div>
          )}

          {/* Reply quote */}
          {m.replyTo && (
            <button
              onClick={onJumpToReply}
              className={`w-full text-left mb-1.5 px-2.5 py-1.5 rounded-lg border-l-2 cursor-pointer transition-colors ${
                mine ? 'bg-white/15 border-white/60 hover:bg-white/25' : 'bg-slate-50 dark:bg-slate-950/50 border-blue-400 hover:bg-slate-100 dark:hover:bg-slate-950'
              }`}
            >
              <div className={`text-[9px] font-black ${mine ? 'text-white/90' : 'text-blue-600 dark:text-blue-400'}`}>
                {usersById.get(m.replyTo.senderId)?.name || '—'}
              </div>
              <div className={`text-[11px] truncate ${mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>
                {m.replyTo.deleted ? 'Message deleted' : (m.replyTo.content || (m.replyTo.hasAttachments ? '📎 Attachment' : ''))}
              </div>
            </button>
          )}

          {/* Deleted / Poll / normal */}
          {m.deleted ? (
            <p className={`text-xs italic ${mine ? 'text-white/60' : 'text-slate-400'}`}>🚫 This message was deleted</p>
          ) : m.type === 'poll' && m.poll ? (
            <PollCard poll={m.poll} meId={meId} mine={mine} onVote={onVote} />
          ) : (
            <>
              {/* Images */}
              {images.length > 0 && (
                <div className={`grid gap-1.5 mb-1.5 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {images.map((a, i) => (
                    <button key={i} onClick={() => onOpenImage(a)} className="cursor-pointer rounded-xl overflow-hidden group/img relative">
                      <img src={a.dataUrl} alt={a.name} className="w-full max-h-64 object-cover transition-transform duration-300 group-hover/img:scale-[1.03]" />
                    </button>
                  ))}
                </div>
              )}

              {/* Files */}
              {files.map((a, i) => {
                const { Icon, tint, label } = fileMeta(a);
                return (
                  <a
                    key={i} href={a.dataUrl} download={a.name}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl mb-1.5 transition-colors cursor-pointer ${
                      mine ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-950'
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${mine ? 'bg-white/20 text-white' : `bg-white dark:bg-slate-900 ${tint}`}`}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs font-bold truncate ${mine ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>{a.name}</span>
                      <span className={`block text-[9px] font-semibold ${mine ? 'text-white/70' : 'text-slate-400'}`}>{label} · {humanSize(a.size)}</span>
                    </span>
                    <Download size={13} className={mine ? 'text-white/80' : 'text-slate-400'} />
                  </a>
                );
              })}

              {/* Text */}
              {m.content && (
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                  {renderContent(m.content, m.mentions, mine)}
                </p>
              )}

              {/* Link preview */}
              {m.linkPreview && (
                <a
                  href={m.linkPreview.url} target="_blank" rel="noopener noreferrer"
                  className={`mt-1.5 flex gap-2.5 rounded-xl overflow-hidden border-l-2 px-2.5 py-2 transition-colors cursor-pointer ${
                    mine ? 'bg-white/15 border-white/60 hover:bg-white/25' : 'bg-slate-50 dark:bg-slate-950/50 border-blue-400 hover:bg-slate-100 dark:hover:bg-slate-950'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[9px] font-bold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                      <ExternalLink size={8} className="inline mr-1" />{m.linkPreview.siteName}
                    </span>
                    <span className={`block text-[11px] font-bold truncate ${mine ? 'text-white' : 'text-slate-800 dark:text-slate-200'}`}>{m.linkPreview.title}</span>
                    {m.linkPreview.description && (
                      <span className={`block text-[10px] leading-snug line-clamp-2 ${mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>{m.linkPreview.description}</span>
                    )}
                  </span>
                  {m.linkPreview.image && (
                    <img src={m.linkPreview.image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                </a>
              )}
            </>
          )}

          {/* Meta line */}
          <div className={`flex items-center gap-1 justify-end mt-0.5 ${mine ? 'text-white/70' : 'text-slate-400'}`}>
            {m.editedAt && !m.deleted && <span className="text-[8.5px] italic mr-0.5">edited</span>}
            <span className="text-[9px] font-semibold tabular-nums">{fmtTime(m.createdAt)}</span>
            {mine && !m.deleted && (
              read
                ? <CheckCheck size={12} className="text-sky-300" />
                : <Check size={12} />
            )}
          </div>
        </div>

        {/* Reaction pills */}
        {reactionEntries.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {reactionEntries.map(([emoji, ids]) => {
              const reactedByMe = ids.includes(meId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  title={ids.map((id) => usersById.get(id)?.name || 'Someone').join(', ')}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer hover:scale-105 ${
                    reactedByMe
                      ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span className="text-sm leading-none">{emoji}</span>
                  <span className="tabular-nums">{ids.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        danger ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
      }`}
    >
      <Icon size={15} className="shrink-0" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Poll rendering
// ---------------------------------------------------------------------------
function PollCard({ poll, meId, mine, onVote }) {
  const totalVoters = new Set(Object.values(poll.votes || {}).flat()).size;
  const totalVotes = Object.values(poll.votes || {}).reduce((s, ids) => s + ids.length, 0);
  const subTint = mine ? 'text-white/70' : 'text-slate-400';

  return (
    <div className="w-[240px] max-w-full">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 size={13} className={mine ? 'text-white/80' : 'text-blue-500'} />
        <span className={`text-[9px] font-bold uppercase tracking-widest ${subTint}`}>{poll.multi ? 'Poll · multiple' : 'Poll'}</span>
      </div>
      <p className={`text-[13px] font-bold mb-2 ${mine ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>{poll.question}</p>
      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const ids = poll.votes?.[opt.id] || [];
          const pct = totalVotes ? Math.round((ids.length / totalVotes) * 100) : 0;
          const voted = ids.includes(meId);
          return (
            <button
              key={opt.id}
              onClick={() => onVote(opt.id)}
              className={`relative block w-full box-border text-left rounded-lg overflow-hidden border transition-all cursor-pointer ${
                mine ? 'border-white/25 hover:border-white/50' : 'border-slate-200 dark:border-slate-700 hover:border-blue-400'
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 transition-all duration-500 ${mine ? 'bg-white/20' : 'bg-blue-500/15'}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center gap-2 px-2.5 py-1.5">
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${voted ? (mine ? 'bg-white border-white text-blue-600' : 'bg-blue-600 border-blue-600 text-white') : (mine ? 'border-white/50' : 'border-slate-300 dark:border-slate-600')}`}>
                  {voted && <Check size={10} />}
                </span>
                <span className={`min-w-0 flex-1 truncate text-xs font-semibold ${mine ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>{opt.text}</span>
                <span className={`w-9 text-right shrink-0 text-[10px] font-bold tabular-nums ${subTint}`}>{pct}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={`text-[10px] font-semibold mt-2 ${subTint}`}>{totalVoters} {totalVoters === 1 ? 'vote' : 'votes'}</p>
    </div>
  );
}
