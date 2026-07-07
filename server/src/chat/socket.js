// Socket.IO gateway for the chat module.
//
// Authentication reuses the exact same httpOnly session cookie as the REST
// API: the handshake's Cookie header is parsed, the JWT verified, and the
// user loaded/active-checked — an unauthenticated socket never connects.
//
// Data WRITES all go through the REST routes (routes/chat.js) so validation
// and auth live in one place; this gateway handles the real-time fan-out:
// rooms, presence, typing indicators, and re-broadcasting events the REST
// layer hands it via emitToConversation()/emitToUser().
import { Server } from 'socket.io';
import { verifyToken } from '../lib/jwt.js';
import { config } from '../config.js';
import { prisma } from '../db.js';

let io = null;

// userId -> Set<socketId>, for presence.
const onlineSockets = new Map();

const parseCookies = (header = '') =>
  Object.fromEntries(
    header.split(';').map((p) => {
      const i = p.indexOf('=');
      return i === -1 ? [p.trim(), ''] : [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
    })
  );

export const getOnlineUserIds = () => [...onlineSockets.keys()];

export function emitToConversation(conversationId, event, payload) {
  if (io) io.to(`conv:${conversationId}`).emit(event, payload);
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  if (event === 'notification:new') {
    const room = io.sockets.adapter.rooms.get(`user:${userId}`);
    console.log(`[notify-emit] user:${userId} sockets-in-room=${room ? room.size : 0} online=${onlineSockets.has(userId)}`);
  }
  io.to(`user:${userId}`).emit(event, payload);
}

// Make every online socket of the given members join a (new) conversation's
// room so they receive its events without reconnecting.
export function joinMembersToConversation(conversationId, memberIds) {
  if (!io) return;
  for (const uid of memberIds) {
    io.in(`user:${uid}`).socketsJoin(`conv:${conversationId}`);
  }
}

const broadcastPresence = () => {
  if (io) io.emit('presence', { online: getOnlineUserIds() });
};

export function initChat(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
  });

  // --- Handshake auth (same cookie the REST API uses) ----------------------
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.request.headers.cookie);
      const token = cookies[config.cookieName];
      if (!token) return next(new Error('unauthorized'));
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, name: true, roles: true, active: true },
      });
      if (!user || !user.active) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;

    // Presence bookkeeping
    if (!onlineSockets.has(user.id)) onlineSockets.set(user.id, new Set());
    onlineSockets.get(user.id).add(socket.id);

    // Join the personal room + every conversation this user belongs to.
    socket.join(`user:${user.id}`);
    const memberships = await prisma.conversationMember.findMany({
      where: { userId: user.id },
      select: { conversationId: true },
    });
    for (const m of memberships) socket.join(`conv:${m.conversationId}`);

    broadcastPresence();

    // Typing indicator — fan out to everyone else in the conversation.
    socket.on('typing', ({ conversationId, isTyping }) => {
      if (typeof conversationId !== 'string') return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        conversationId,
        userId: user.id,
        name: user.name,
        isTyping: !!isTyping,
      });
    });

    socket.on('disconnect', () => {
      const set = onlineSockets.get(user.id);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) onlineSockets.delete(user.id);
      }
      broadcastPresence();
    });
  });

  return io;
}
