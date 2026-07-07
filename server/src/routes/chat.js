// Internal chat module — REST layer.
//
// All writes happen here (validated + auth-gated like every other route);
// the Socket.IO gateway (chat/socket.js) is only used to fan events out to
// connected clients afterwards. Chat is a personal communication feature, so
// VIEWER accounts participate fully — requireAuth only, no requireWrite.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { fetchLinkPreview, firstUrlIn } from '../lib/linkPreview.js';
import {
  emitToConversation, emitToUser, joinMembersToConversation, getOnlineUserIds,
} from '../chat/socket.js';

const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Schemas & helpers
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  name: z.string().min(1).max(300),
  type: z.string().max(200).default('application/octet-stream'),
  size: z.coerce.number().default(0),
  dataUrl: z.string().max(8_000_000, 'Attachment too large (max ~5MB per file)'),
});

const pollSchema = z.object({
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(150)).min(2).max(12),
  multi: z.boolean().default(false),
});

const sendSchema = z.object({
  content: z.string().max(10_000).default(''),
  replyToId: z.string().optional().nullable(),
  attachments: z.array(attachmentSchema).max(10).default([]),
  mentions: z.array(z.object({ id: z.string(), name: z.string() })).max(20).default([]),
  poll: pollSchema.optional().nullable(),
});

const createConversationSchema = z.object({
  type: z.enum(['DM', 'GROUP']),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
  name: z.string().max(80).optional(),
});

// Membership guard — returns the member row or responds 403/404.
async function requireMembership(req, res, conversationId) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: req.user.id } },
  });
  if (!member) {
    res.status(403).json({ error: 'You are not a member of this conversation.' });
    return null;
  }
  return member;
}

const serializeMessage = (m, replyTo = null) => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  type: m.type || 'text',
  content: m.deletedAt ? '' : m.content,
  replyToId: m.replyToId,
  replyTo: replyTo && {
    id: replyTo.id,
    senderId: replyTo.senderId,
    content: replyTo.deletedAt ? '' : (replyTo.content || '').slice(0, 200),
    deleted: !!replyTo.deletedAt,
    hasAttachments: Array.isArray(replyTo.attachments) && replyTo.attachments.length > 0,
  },
  editedAt: m.editedAt,
  deleted: !!m.deletedAt,
  pinned: m.pinned,
  attachments: m.deletedAt ? [] : m.attachments,
  mentions: m.mentions,
  reactions: m.deletedAt ? {} : (m.reactions || {}),
  poll: m.deletedAt ? null : (m.poll || null),
  linkPreview: m.deletedAt ? null : m.linkPreview,
  createdAt: m.createdAt,
});

// Attach reply snippets to a batch of messages in one extra query.
async function withReplies(messages) {
  const replyIds = [...new Set(messages.map((m) => m.replyToId).filter(Boolean))];
  const replies = replyIds.length
    ? await prisma.chatMessage.findMany({ where: { id: { in: replyIds } } })
    : [];
  const byId = new Map(replies.map((r) => [r.id, r]));
  return messages.map((m) => serializeMessage(m, m.replyToId ? byId.get(m.replyToId) : null));
}

const serializeConversation = (c, meId, unread = 0, lastMessage = null) => ({
  id: c.id,
  type: c.type,
  name: c.name,
  description: c.description || '',
  photo: c.photo || '',
  createdBy: c.createdBy,
  metaUpdatedBy: c.metaUpdatedBy || null,
  metaUpdatedAt: c.metaUpdatedAt || null,
  updatedAt: c.updatedAt,
  members: c.members.map((m) => ({ userId: m.userId, lastReadAt: m.lastReadAt })),
  unread,
  lastMessage: lastMessage && {
    id: lastMessage.id,
    senderId: lastMessage.senderId,
    content: lastMessage.deletedAt ? '' : (lastMessage.content || '').slice(0, 120),
    deleted: !!lastMessage.deletedAt,
    hasAttachments: !lastMessage.deletedAt && Array.isArray(lastMessage.attachments) && lastMessage.attachments.length > 0,
    createdAt: lastMessage.createdAt,
  },
});

async function loadConversationForUser(conversationId, meId) {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!c) return null;
  const me = c.members.find((m) => m.userId === meId);
  if (!me) return null;
  const [unread, lastMessage] = await Promise.all([
    prisma.chatMessage.count({
      where: { conversationId: c.id, createdAt: { gt: me.lastReadAt }, senderId: { not: meId }, deletedAt: null },
    }),
    prisma.chatMessage.findFirst({
      where: { conversationId: c.id, ...(me.clearedAt ? { createdAt: { gt: me.clearedAt } } : {}) },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return serializeConversation(c, meId, unread, lastMessage);
}

// ---------------------------------------------------------------------------
// Directory & presence
// ---------------------------------------------------------------------------

// GET /api/chat/users — the team directory: every active user with the avatar
// photo + job title from their Advisor Profile. Fetched once per session by
// the client (photos are base64 and can be large).
router.get('/users', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, roles: true, profile: { select: { data: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles,
      photo: u.profile?.data?.photo || '',
      jobTitle: u.profile?.data?.role || '',
    })),
    online: getOnlineUserIds(),
  });
}));

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

// GET /api/chat/conversations — my conversations, most recently active first.
router.get('/conversations', asyncHandler(async (req, res) => {
  const meId = req.user.id;
  const convs = await prisma.conversation.findMany({
    where: { members: { some: { userId: meId } } },
    include: { members: true },
    orderBy: { updatedAt: 'desc' },
  });
  const result = await Promise.all(convs.map(async (c) => {
    const me = c.members.find((m) => m.userId === meId);
    const [unread, lastMessage] = await Promise.all([
      prisma.chatMessage.count({
        where: { conversationId: c.id, createdAt: { gt: me.lastReadAt }, senderId: { not: meId }, deletedAt: null },
      }),
      prisma.chatMessage.findFirst({
        where: { conversationId: c.id, ...(me.clearedAt ? { createdAt: { gt: me.clearedAt } } : {}) },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return serializeConversation(c, meId, unread, lastMessage);
  }));
  res.json({ conversations: result });
}));

// POST /api/chat/conversations — start a DM (deduped) or create a group.
router.post('/conversations', asyncHandler(async (req, res) => {
  const meId = req.user.id;
  const { type, memberIds, name } = parseBody(createConversationSchema, req.body);
  const uniqueMembers = [...new Set([meId, ...memberIds])];

  if (type === 'DM') {
    if (uniqueMembers.length !== 2) {
      return res.status(400).json({ error: 'A DM must have exactly one other member.' });
    }
    const otherId = uniqueMembers.find((id) => id !== meId);
    // Dedupe: reuse an existing DM between these two users.
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DM',
        AND: [
          { members: { some: { userId: meId } } },
          { members: { some: { userId: otherId } } },
        ],
      },
    });
    if (existing) {
      return res.json({ conversation: await loadConversationForUser(existing.id, meId) });
    }
  } else if (!name?.trim()) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  // Ensure every member id is a real active user.
  const count = await prisma.user.count({ where: { id: { in: uniqueMembers }, active: true } });
  if (count !== uniqueMembers.length) {
    return res.status(400).json({ error: 'One or more selected users do not exist.' });
  }

  const conv = await prisma.conversation.create({
    data: {
      type,
      name: type === 'GROUP' ? name.trim() : null,
      createdBy: meId,
      members: { create: uniqueMembers.map((userId) => ({ userId })) },
    },
    include: { members: true },
  });

  joinMembersToConversation(conv.id, uniqueMembers);
  const payload = serializeConversation(conv, meId, 0, null);
  for (const uid of uniqueMembers) {
    if (uid !== meId) emitToUser(uid, 'conversation:new', { conversationId: conv.id });
  }
  res.status(201).json({ conversation: payload });
}));

// POST /api/chat/conversations/:id/read — advance my read cursor.
router.post('/conversations/:id/read', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const now = new Date();
  await prisma.conversationMember.update({ where: { id: member.id }, data: { lastReadAt: now } });
  emitToConversation(req.params.id, 'read', {
    conversationId: req.params.id, userId: req.user.id, lastReadAt: now,
  });
  res.json({ ok: true });
}));

// POST /api/chat/conversations/:id/clear — "Clear chat" (WhatsApp-style): hides
// every message before now from MY view only. Nothing is deleted — the other
// member(s) keep their full history, and sending a new message continues the
// same conversation.
router.post('/conversations/:id/clear', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  await prisma.conversationMember.update({ where: { id: member.id }, data: { clearedAt: new Date() } });
  res.json({ ok: true });
}));

// GET /api/chat/conversations/:id/search?q= — search this chat's history.
router.get('/conversations/:id/search', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ messages: [] });
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: req.params.id, deletedAt: null, content: { contains: q, mode: 'insensitive' },
      ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json({ messages: await withReplies(messages) });
}));

// GET /api/chat/conversations/:id/pinned — this chat's pinned messages.
router.get('/conversations/:id/pinned', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: req.params.id, pinned: true, deletedAt: null,
      ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ messages: await withReplies(messages) });
}));

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// GET /api/chat/conversations/:id/messages?before=<iso>&limit=50 — paginated,
// newest-first (client reverses for display).
router.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  // Both bounds land on the same `createdAt` key, so they're merged into one
  // range object (lt AND gt) rather than one silently overwriting the other.
  const createdAt = {};
  if (before && !Number.isNaN(before.getTime())) createdAt.lt = before;
  if (member.clearedAt) createdAt.gt = member.clearedAt;
  const messages = await prisma.chatMessage.findMany({
    where: {
      conversationId: req.params.id,
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ messages: await withReplies(messages), hasMore: messages.length === limit });
}));

// POST /api/chat/conversations/:id/messages — send.
router.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const { content, replyToId, attachments, mentions, poll } = parseBody(sendSchema, req.body);
  if (!content.trim() && attachments.length === 0 && !poll) {
    return res.status(400).json({ error: 'Message is empty.' });
  }

  // Reply target must belong to the same conversation.
  let replyTo = null;
  if (replyToId) {
    replyTo = await prisma.chatMessage.findUnique({ where: { id: replyToId } });
    if (!replyTo || replyTo.conversationId !== req.params.id) {
      return res.status(400).json({ error: 'Invalid reply target.' });
    }
  }

  // Build the poll payload (server assigns stable option ids + empty votes).
  const pollData = poll
    ? {
        question: poll.question.trim(),
        multi: poll.multi,
        options: poll.options.map((text, i) => ({ id: `o${i}`, text: text.trim() })),
        votes: {},
      }
    : null;

  // Link preview is fetched in the BACKGROUND after responding (see below) —
  // it involves an external HTTP request (up to ~3.5s) that must never block
  // the message from appearing instantly, the way it would in WhatsApp.
  const url = poll ? null : firstUrlIn(content);

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        conversationId: req.params.id,
        senderId: req.user.id,
        type: poll ? 'poll' : 'text',
        content: content.trim(),
        replyToId: replyTo?.id || null,
        attachments,
        mentions,
        poll: pollData,
      },
    }),
    prisma.conversation.update({ where: { id: req.params.id }, data: { updatedAt: now } }),
    // Sending implies having read everything up to now.
    prisma.conversationMember.update({ where: { id: member.id }, data: { lastReadAt: now } }),
  ]);

  const serialized = serializeMessage(message, replyTo);
  emitToConversation(req.params.id, 'message:new', { message: serialized });
  res.status(201).json({ message: serialized });

  // Fire-and-forget: enrich with a link preview once fetched, then patch +
  // notify. Never awaited — the request above has already been answered.
  if (url) attachLinkPreviewAsync(message.id, req.params.id, url);
}));

// PATCH /api/chat/messages/:id — edit own message.
router.patch('/messages/:id', asyncHandler(async (req, res) => {
  const { content } = parseBody(z.object({ content: z.string().min(1).max(10_000) }), req.body);
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  if (msg.senderId !== req.user.id) return res.status(403).json({ error: 'You can only edit your own messages.' });

  const url = firstUrlIn(content);
  const updated = await prisma.chatMessage.update({
    where: { id: msg.id },
    data: { content: content.trim(), editedAt: new Date(), linkPreview: url ? msg.linkPreview : null },
  });
  const serialized = serializeMessage(updated);
  emitToConversation(msg.conversationId, 'message:update', { message: serialized });
  res.json({ message: serialized });

  // Re-fetch the preview in the background if the edited text now has a URL
  // (or a different one) — same non-blocking pattern as sending.
  if (url && url !== msg.linkPreview?.url) attachLinkPreviewAsync(msg.id, msg.conversationId, url);
}));

// Fetches an OpenGraph preview for `url` and patches it onto the message once
// ready, emitting `message:update` so it appears a moment after the message
// itself — exactly like WhatsApp's own link-preview behavior.
async function attachLinkPreviewAsync(messageId, conversationId, url) {
  try {
    const linkPreview = await fetchLinkPreview(url);
    if (!linkPreview) return;
    const updated = await prisma.chatMessage.update({ where: { id: messageId }, data: { linkPreview } });
    if (updated.deletedAt) return; // don't resurrect a deleted message's content
    emitToConversation(conversationId, 'message:update', { message: serializeMessage(updated) });
  } catch (err) {
    console.error('[chat] background link preview failed:', err);
  }
}

// DELETE /api/chat/messages/:id — soft delete (sender, or an ADMIN moderating).
router.delete('/messages/:id', asyncHandler(async (req, res) => {
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  if (msg.senderId !== req.user.id && !req.user.roles.includes('ADMIN')) {
    return res.status(403).json({ error: 'You can only delete your own messages.' });
  }
  const updated = await prisma.chatMessage.update({
    where: { id: msg.id },
    data: { deletedAt: new Date(), content: '', attachments: [], linkPreview: null, pinned: false },
  });
  const serialized = serializeMessage(updated);
  emitToConversation(msg.conversationId, 'message:update', { message: serialized });
  res.json({ message: serialized });
}));

// POST /api/chat/messages/:id/pin — pin/unpin (any member of the conversation).
router.post('/messages/:id/pin', asyncHandler(async (req, res) => {
  const { pinned } = parseBody(z.object({ pinned: z.boolean() }), req.body);
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  const member = await requireMembership(req, res, msg.conversationId);
  if (!member) return;
  const updated = await prisma.chatMessage.update({ where: { id: msg.id }, data: { pinned } });
  const serialized = serializeMessage(updated);
  emitToConversation(msg.conversationId, 'message:update', { message: serialized });
  res.json({ message: serialized });
}));

// POST /api/chat/messages/:id/react — toggle an emoji reaction. WhatsApp-style:
// each user gets at most ONE reaction on a message; reacting with the same
// emoji again removes it, a different emoji replaces it.
router.post('/messages/:id/react', asyncHandler(async (req, res) => {
  const { emoji } = parseBody(z.object({ emoji: z.string().min(1).max(16) }), req.body);
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  const member = await requireMembership(req, res, msg.conversationId);
  if (!member) return;

  const reactions = { ...(msg.reactions || {}) };
  const uid = req.user.id;
  const hadSame = (reactions[emoji] || []).includes(uid);
  // Remove me from every emoji first (one reaction per user).
  for (const key of Object.keys(reactions)) {
    reactions[key] = reactions[key].filter((id) => id !== uid);
    if (reactions[key].length === 0) delete reactions[key];
  }
  // Re-add unless this was a toggle-off of the same emoji.
  if (!hadSame) reactions[emoji] = [...(reactions[emoji] || []), uid];

  const updated = await prisma.chatMessage.update({ where: { id: msg.id }, data: { reactions } });
  const serialized = serializeMessage(updated);
  emitToConversation(msg.conversationId, 'message:update', { message: serialized });
  res.json({ message: serialized });
}));

// POST /api/chat/messages/:id/vote — vote in a poll. Single-choice polls
// replace the prior vote; multi-choice toggle each option independently.
router.post('/messages/:id/vote', asyncHandler(async (req, res) => {
  const { optionId } = parseBody(z.object({ optionId: z.string().min(1) }), req.body);
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg || msg.deletedAt || msg.type !== 'poll' || !msg.poll) {
    return res.status(404).json({ error: 'Poll not found.' });
  }
  const member = await requireMembership(req, res, msg.conversationId);
  if (!member) return;

  const poll = { ...msg.poll };
  if (!poll.options.some((o) => o.id === optionId)) {
    return res.status(400).json({ error: 'Invalid poll option.' });
  }
  const votes = { ...(poll.votes || {}) };
  const uid = req.user.id;
  const hadThis = (votes[optionId] || []).includes(uid);
  if (!poll.multi) {
    for (const key of Object.keys(votes)) votes[key] = votes[key].filter((id) => id !== uid);
  } else {
    votes[optionId] = (votes[optionId] || []).filter((id) => id !== uid);
  }
  if (!hadThis) votes[optionId] = [...(votes[optionId] || []), uid];
  for (const key of Object.keys(votes)) if (votes[key].length === 0) delete votes[key];
  poll.votes = votes;

  const updated = await prisma.chatMessage.update({ where: { id: msg.id }, data: { poll } });
  const serialized = serializeMessage(updated);
  emitToConversation(msg.conversationId, 'message:update', { message: serialized });
  res.json({ message: serialized });
}));

// PATCH /api/chat/conversations/:id — edit a GROUP's name / description / photo.
// Any member may edit; we record who changed it and when for the info panel.
router.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const patch = parseBody(z.object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(1000).optional(),
    photo: z.string().max(4_000_000).optional(), // base64 data URL (~3MB)
  }), req.body);

  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (conv.type !== 'GROUP') {
    return res.status(400).json({ error: 'Only group conversations can be edited.' });
  }

  const data = { metaUpdatedBy: req.user.id, metaUpdatedAt: new Date() };
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.photo !== undefined) data.photo = patch.photo || null;

  await prisma.conversation.update({ where: { id: req.params.id }, data });
  const serialized = await loadConversationForUser(req.params.id, req.user.id);
  emitToConversation(req.params.id, 'conversation:update', { conversation: serialized });
  res.json({ conversation: serialized });
}));

// DELETE /api/chat/conversations/:id — delete a GROUP for everyone. Only the
// group's creator or a system ADMIN may do this. Cascades to members +
// messages; every member is told to drop it from their UI.
router.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const member = await requireMembership(req, res, req.params.id);
  if (!member) return;
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (conv.type !== 'GROUP') {
    return res.status(400).json({ error: 'Only groups can be deleted.' });
  }
  if (conv.createdBy !== req.user.id && !req.user.roles.includes('ADMIN')) {
    return res.status(403).json({ error: 'Only the group creator or an admin can delete this group.' });
  }
  emitToConversation(req.params.id, 'conversation:removed', { conversationId: req.params.id });
  await prisma.conversation.delete({ where: { id: req.params.id } }); // cascades
  res.json({ ok: true });
}));

export default router;
