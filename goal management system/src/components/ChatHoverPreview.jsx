// Hover-preview popover for the chat dock icon — lets you glance at unread
// conversations (who + last message) without opening the whole Chat module.
// Clicking an item opens Chat, jumps straight into that conversation, and
// scrolls/highlights its last message (see App.jsx's pendingChatOpen +
// ChatView's initialConversationId/MessagePane's initialMessageId).
import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ChatAvatar, GroupAvatar } from './chat/Avatars';
import { conversationName, conversationOtherUser, fmtListStamp } from './chat/chatFormat';

export default function ChatHoverPreview({ conversations, usersById, me, online, onOpen }) {
  const unread = conversations.filter((c) => c.unread > 0);

  return (
    <div className="text-left">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
        <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">Unread Messages</span>
        {unread.length > 0 && (
          <span className="text-[9px] font-black text-white bg-rose-500 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </div>

      {unread.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-6">
          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-2">
            <MessageSquare size={17} />
          </div>
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">No unread messages</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 max-h-[360px] overflow-y-auto -mr-1 pr-1">
          {unread.slice(0, 8).map((c) => {
            const other = conversationOtherUser(c, me.id, usersById);
            const name = conversationName(c, me.id, usersById);
            const lm = c.lastMessage;
            const preview = lm
              ? (lm.deleted ? '🚫 Message deleted' : (lm.content || (lm.hasAttachments ? '📎 Attachment' : '')))
              : 'No messages yet';
            return (
              <li
                key={c.id}
                className="group flex items-start gap-2.5 p-2 rounded-xl transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                onClick={() => onOpen(c.id, lm?.id)}
              >
                {c.type === 'GROUP'
                  ? <GroupAvatar size={32} photo={c.photo} />
                  : <ChatAvatar user={other} size={32} online={other ? online.has(other.id) : false} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-snug truncate">{name}</p>
                    {lm && <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">{fmtListStamp(lm.createdAt)}</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug truncate">
                    {lm?.senderId === me.id ? 'You: ' : ''}{preview}
                  </p>
                </div>
                <span className="shrink-0 min-w-[16px] h-[16px] px-1 mt-0.5 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center">
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
