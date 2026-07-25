// Chat module — service layer.
//
// REST (via the shared api client) for all reads/writes; a single Socket.IO
// connection for real-time events. The socket authenticates with the same
// httpOnly session cookie as the REST API (withCredentials), so there is no
// token handling here at all.
import { io } from 'socket.io-client';
import { api } from './api';

// ---------------------------------------------------------------------------
// Socket singleton
// ---------------------------------------------------------------------------

// The socket must connect to the API ORIGIN only. Socket.IO interprets any PATH
// in the URL as a NAMESPACE — so the REST "/api" suffix, if left on, makes the
// client ask for the "/api" namespace, which the server never registered. The
// server then rejects the connection ("Invalid namespace") and closes it,
// silently killing EVERY real-time feature (online presence, live messages,
// read receipts, typing, notifications) and forcing a manual refresh.
// `new URL(...).origin` strips the path unconditionally — including any trailing
// whitespace/newline the old `/\/api$/` regex couldn't (see api.js) — so the
// namespace is always the default "/".
const SOCKET_URL = (() => {
  try {
    return new URL(api.baseUrl).origin;
  } catch {
    // api.baseUrl isn't absolute (shouldn't happen in practice) — best-effort strip.
    return api.baseUrl.trim().replace(/\/api\/?$/, '');
  }
})();

let socket = null;

export function connectChat() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    withCredentials: true,
    // Connect over WebSocket FIRST, not the Engine.IO default of "start on
    // HTTP long-polling, then upgrade to WebSocket". In production (custom
    // domain in front of Render) that polling->websocket UPGRADE fails every
    // time ("WebSocket is closed before the connection is established"), so
    // the socket was silently stuck on slow, flaky long-polling — which is
    // what made chat/presence/notifications lag by seconds and need a manual
    // refresh. A DIRECT websocket connection works and authenticates fine
    // (verified against production); it's only the upgrade step that breaks.
    // `tryAllTransports` keeps long-polling as a real fallback for any client
    // whose network blocks WebSockets entirely, so nobody is left worse off.
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
  });
  return socket;
}

export function disconnectChat() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export const getChatSocket = () => socket;

// Subscribe to a socket event; returns an unsubscribe fn (safe if never connected).
export function onChatEvent(event, handler) {
  const s = connectChat();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function emitTyping(conversationId, isTyping) {
  socket?.emit('typing', { conversationId, isTyping });
}

// ---------------------------------------------------------------------------
// REST calls
// ---------------------------------------------------------------------------

export const fetchChatUsers = () => api.get('/chat/users');
export const fetchConversations = () => api.get('/chat/conversations');
export const createConversation = (payload) => api.post('/chat/conversations', payload);
export const fetchMessages = (conversationId, before) =>
  api.get(`/chat/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const sendMessage = (conversationId, payload) =>
  api.post(`/chat/conversations/${conversationId}/messages`, payload);
export const editMessage = (messageId, content) => api.patch(`/chat/messages/${messageId}`, { content });
export const deleteMessage = (messageId) => api.del(`/chat/messages/${messageId}`);
export const pinMessage = (messageId, pinned) => api.post(`/chat/messages/${messageId}/pin`, { pinned });
export const reactToMessage = (messageId, emoji) => api.post(`/chat/messages/${messageId}/react`, { emoji });
export const votePoll = (messageId, optionId) => api.post(`/chat/messages/${messageId}/vote`, { optionId });
export const updateConversation = (conversationId, payload) => api.patch(`/chat/conversations/${conversationId}`, payload);
export const deleteConversation = (conversationId) => api.del(`/chat/conversations/${conversationId}`);
export const markRead = (conversationId) => api.post(`/chat/conversations/${conversationId}/read`);
export const clearChat = (conversationId) => api.post(`/chat/conversations/${conversationId}/clear`);
// "Delete chat" (delete-for-me): removes it from my list; reappears on a new message.
export const deleteChatForMe = (conversationId) => api.post(`/chat/conversations/${conversationId}/delete`);
export const searchMessages = (conversationId, q) =>
  api.get(`/chat/conversations/${conversationId}/search?q=${encodeURIComponent(q)}`);
export const fetchPinned = (conversationId) => api.get(`/chat/conversations/${conversationId}/pinned`);
