import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MessageSquare, Search, Plus, X, Users as UsersIcon, Check, Sparkles
} from 'lucide-react';
import { btnPrimary, btnGhost, inputCls, Field } from '../UI';
import {
  connectChat, onChatEvent, fetchChatUsers, fetchConversations, createConversation,
} from '../../services/chat';
import { getCurrentUser } from '../../utils/auth';
import { ChatAvatar, GroupAvatar } from './Avatars';
import { fmtListStamp, conversationName, conversationOtherUser } from './chatFormat';
import MessagePane from './MessagePane';

export default function ChatView({ onQuickAction, initialConversationId, initialMessageId }) {
  const me = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [online, setOnline] = useState(new Set());
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [startingChat, setStartingChat] = useState(false); // in-flight guard — a fast double-click on the same (or another) person before the first request lands would otherwise race the server's dedupe check and create two DM conversations
  // React state updates are async/batched, so two clicks landing in the same
  // tick would both still see `startingChat === false` from the stale
  // closure. A ref is checked/set synchronously, so the second click is
  // reliably rejected even before the first re-render happens.
  const startingChatRef = useRef(false);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const active = conversations.find((c) => c.id === activeId) || null;

  const refreshConversations = useCallback(async () => {
    try {
      const { conversations: convs } = await fetchConversations();
      setConversations(convs);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  // Initial load: directory + conversations + socket.
  useEffect(() => {
    connectChat();
    let cancelled = false;
    (async () => {
      try {
        const [{ users: dir, online: onlineIds }] = await Promise.all([
          fetchChatUsers(),
          refreshConversations(),
        ]);
        if (cancelled) return;
        setUsers(dir);
        setOnline(new Set(onlineIds));
      } catch (err) {
        console.error('Failed to load chat directory:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshConversations]);

  // Socket subscriptions for the list.
  useEffect(() => {
    const offPresence = onChatEvent('presence', ({ online: ids }) => setOnline(new Set(ids)));

    const offNew = onChatEvent('message:new', ({ message }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === message.conversationId);
        if (idx === -1) { refreshConversations(); return prev; }
        const c = prev[idx];
        const isActive = message.conversationId === activeId;
        const updated = {
          ...c,
          updatedAt: message.createdAt,
          lastMessage: {
            id: message.id, senderId: message.senderId,
            content: (message.content || '').slice(0, 120),
            deleted: false, hasAttachments: (message.attachments || []).length > 0,
            createdAt: message.createdAt,
          },
          unread: message.senderId === me.id || isActive ? c.unread : c.unread + 1,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    });

    const offRead = onChatEvent('read', ({ conversationId, userId, lastReadAt }) => {
      setConversations((prev) => prev.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          members: c.members.map((m) => (m.userId === userId ? { ...m, lastReadAt } : m)),
          unread: userId === me.id ? 0 : c.unread,
        };
      }));
    });

    const offConvNew = onChatEvent('conversation:new', () => refreshConversations());

    const offConvUpdate = onChatEvent('conversation:update', ({ conversation }) => {
      setConversations((prev) => prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)));
    });

    const offConvRemoved = onChatEvent('conversation:removed', ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setActiveId((cur) => (cur === conversationId ? null : cur));
    });

    return () => { offPresence(); offNew(); offRead(); offConvNew(); offConvUpdate(); offConvRemoved(); };
  }, [activeId, me.id, refreshConversations]);

  // Local echo when I edit a group's info (before/besides the socket event).
  const handleConversationUpdate = useCallback((conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c)));
  }, []);

  // When I delete a group, drop it locally immediately (socket also fires).
  const handleConversationRemoved = (conversationId) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    setActiveId((cur) => (cur === conversationId ? null : cur));
  };

  // Opening a conversation zeroes its unread locally (server cursor is
  // advanced by MessagePane's markRead).
  const openConversation = (id) => {
    setActiveId(id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  // Jumping in from the chat-icon hover preview (App.jsx) — select the
  // target conversation as soon as we know about it. `conversations` may
  // still be loading at this point; once it arrives, `active` below simply
  // resolves on its own since `activeId` is already set.
  useEffect(() => {
    if (initialConversationId) openConversation(initialConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  const startDM = async (userId) => {
    if (startingChatRef.current) return; // already creating one — ignore a fast repeat click
    startingChatRef.current = true;
    setStartingChat(true);
    try {
      const { conversation } = await createConversation({ type: 'DM', memberIds: [userId] });
      setConversations((prev) => (prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]));
      setShowNew(false);
      openConversation(conversation.id);
    } catch (err) {
      alert(err?.message || 'Failed to start chat.');
    } finally {
      startingChatRef.current = false;
      setStartingChat(false);
    }
  };

  const createGroup = async (name, memberIds) => {
    if (startingChatRef.current) return;
    startingChatRef.current = true;
    setStartingChat(true);
    try {
      const { conversation } = await createConversation({ type: 'GROUP', memberIds, name });
      setConversations((prev) => [conversation, ...prev]);
      setShowNew(false);
      openConversation(conversation.id);
    } finally {
      startingChatRef.current = false;
      setStartingChat(false);
    }
  };

  const filtered = conversations.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return conversationName(c, me.id, usersById).toLowerCase().includes(q) ||
      (c.lastMessage?.content || '').toLowerCase().includes(q);
  });

  return (
    <div className="animate-fade-in w-full h-full flex bg-white dark:bg-slate-900">
      {/* ─── Conversation list ─────────────────────────────────────────── */}
      <div className={`w-full md:w-80 lg:w-96 shrink-0 border-r border-slate-200/70 dark:border-slate-800 flex-col bg-white dark:bg-slate-900 ${active ? 'hidden md:flex' : 'flex'}`}>
        <div className="shrink-0 p-4 pb-3 space-y-3 border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <MessageSquare size={17} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-none">Chats</h2>
                <p className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold mt-0.5">{online.size} online</p>
              </div>
            </div>
            <button onClick={() => setShowNew(true)} title="New chat" className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-all hover:scale-105 cursor-pointer">
              <Plus size={17} />
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-slate-400 animate-pulse px-4 py-6 text-center">Loading chats…</p>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                <MessageSquare size={20} />
              </div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {conversations.length === 0 ? 'No conversations yet' : 'No chats match your search'}
              </p>
              {conversations.length === 0 && (
                <button onClick={() => setShowNew(true)} className={btnGhost + ' text-[11px]'}>
                  <Plus size={12} /> Start your first chat
                </button>
              )}
            </div>
          ) : filtered.map((c) => {
            const other = conversationOtherUser(c, me.id, usersById);
            const name = conversationName(c, me.id, usersById);
            const isActive = c.id === activeId;
            const lm = c.lastMessage;
            const preview = lm
              ? (lm.deleted ? '🚫 Message deleted' : `${lm.senderId === me.id ? 'You: ' : ''}${lm.content || (lm.hasAttachments ? '📎 Attachment' : '')}`)
              : 'No messages yet';
            return (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-l-2 ${
                  isActive
                    ? 'bg-blue-50/70 dark:bg-blue-950/25 border-blue-500'
                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                {c.type === 'GROUP' ? <GroupAvatar size={42} photo={c.photo} /> : <ChatAvatar user={other} size={42} online={other ? online.has(other.id) : false} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] truncate ${c.unread ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-800 dark:text-slate-200'}`}>{name}</span>
                    {lm && <span className={`text-[9px] font-semibold shrink-0 ${c.unread ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>{fmtListStamp(lm.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`text-[11px] truncate ${c.unread ? 'font-bold text-slate-600 dark:text-slate-300' : 'text-slate-450 dark:text-slate-500'}`}>{preview}</span>
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Active conversation / empty state ─────────────────────────── */}
      {active ? (
        <MessagePane
          key={active.id}
          conv={active} me={me} usersById={usersById} onlineSet={online}
          onQuickAction={onQuickAction}
          onBackToList={() => setActiveId(null)}
          onConversationUpdate={handleConversationUpdate}
          onConversationRemoved={handleConversationRemoved}
          initialMessageId={active.id === initialConversationId ? initialMessageId : undefined}
        />
      ) : (
        <div className="flex-1 hidden md:flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-50/80 to-blue-50/30 dark:from-slate-950/60 dark:to-slate-950/20 text-center px-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-blue-500/25 animate-scale-up">
            <MessageSquare size={34} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-2">Team Fintness Chat</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
            Pick a conversation or start a new one. Mention teammates with <b>@</b>, use <b>/</b> for quick actions, drag &amp; drop files to share.
          </p>
          <button onClick={() => setShowNew(true)} className={btnPrimary + ' mt-2'}>
            <Sparkles size={13} /> New Conversation
          </button>
        </div>
      )}

      {showNew && (
        <NewChatModal
          me={me} users={users} online={online}
          starting={startingChat}
          onClose={() => setShowNew(false)}
          onStartDM={startDM}
          onCreateGroup={createGroup}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New chat / group modal
// ---------------------------------------------------------------------------

function NewChatModal({ me, users, online, starting, onClose, onStartDM, onCreateGroup }) {
  const [tab, setTab] = useState('dm'); // 'dm' | 'group'
  const [q, setQ] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const teammates = users.filter((u) => u.id !== me.id && u.name.toLowerCase().includes(q.trim().toLowerCase()));

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const submitGroup = async () => {
    setError('');
    if (!groupName.trim()) return setError('Give the group a name.');
    if (selected.size === 0) return setError('Select at least one member.');
    setSaving(true);
    try {
      await onCreateGroup(groupName.trim(), [...selected]);
    } catch (err) {
      setError(err?.message || 'Failed to create group.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">New Conversation</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
            {[
              { id: 'dm', label: 'Direct Message', Icon: MessageSquare },
              { id: 'group', label: 'New Group', Icon: UsersIcon },
            ].map(({ id, label, Icon }) => (
              <button
                key={id} onClick={() => { setTab(id); setError(''); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  tab === id ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/40 dark:border-slate-800/60' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {tab === 'group' && (
            <Field label="Group Name *">
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className={inputCls} placeholder="e.g. Operations Team" />
            </Field>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teammates…" className={inputCls + ' pl-8 py-2 text-xs'} />
          </div>

          <div className="space-y-1">
            {teammates.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">No teammates found.</p>
            ) : teammates.map((u) => (
              <button
                key={u.id}
                disabled={tab === 'dm' && starting}
                onClick={() => (tab === 'dm' ? onStartDM(u.id) : toggle(u.id))}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ChatAvatar user={u} size={36} online={online.has(u.id)} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{u.jobTitle || u.email}</div>
                </div>
                {tab === 'group' && (
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                    selected.has(u.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'
                  }`}>
                    {selected.has(u.id) && <Check size={12} />}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        {tab === 'group' && (
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-between items-center gap-2">
            <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500">{selected.size} member{selected.size === 1 ? '' : 's'} selected</span>
            <button onClick={submitGroup} disabled={saving || starting} className={btnPrimary}>
              {saving ? 'Creating…' : (<><UsersIcon size={13} /> Create Group</>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
