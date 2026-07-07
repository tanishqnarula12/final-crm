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

const SOCKET_URL = api.baseUrl.replace(/\/api$/, '');

let socket = null;

export function connectChat() {
  if (socket) return socket;
  socket = io(SOCKET_URL, { withCredentials: true });
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
export const searchMessages = (conversationId, q) =>
  api.get(`/chat/conversations/${conversationId}/search?q=${encodeURIComponent(q)}`);
export const fetchPinned = (conversationId) => api.get(`/chat/conversations/${conversationId}/pinned`);
