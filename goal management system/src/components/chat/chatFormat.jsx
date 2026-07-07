// Chat formatting helpers — file-type icons, sizes, timestamps, and message
// content rendering (links, @mentions, newlines). Pure functions only; the
// avatar components live in Avatars.jsx (kept separate for fast-refresh).
import { FileText, FileSpreadsheet, File, Image as ImageIcon } from 'lucide-react';

// --- Files -------------------------------------------------------------------

export const isImageAttachment = (a) => (a?.type || '').startsWith('image/');

export function fileMeta(a) {
  const name = (a?.name || '').toLowerCase();
  const type = a?.type || '';
  if (type.startsWith('image/')) return { Icon: ImageIcon, tint: 'text-sky-500', label: 'Image' };
  if (type.includes('pdf') || name.endsWith('.pdf')) return { Icon: FileText, tint: 'text-rose-500', label: 'PDF' };
  if (name.endsWith('.doc') || name.endsWith('.docx') || type.includes('word')) return { Icon: FileText, tint: 'text-blue-500', label: 'Word' };
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv') || type.includes('sheet') || type.includes('excel')) return { Icon: FileSpreadsheet, tint: 'text-emerald-500', label: 'Excel' };
  return { Icon: File, tint: 'text-slate-400', label: 'File' };
}

export const humanSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// --- Time --------------------------------------------------------------------

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fmtListStamp = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// --- Content rendering --------------------------------------------------------

// Auto-links every kind of web address, not just fully-qualified ones:
//   https://fintness.in   www.fintnessfinserv.in   fintness.in   x.io/path
// A scheme-less match is linked when it starts with "www." or its TLD looks
// like a real domain suffix (so "Node.js" / "index.html" stay plain text).
// Emails are skipped (a match immediately preceded by "@" is left as text).
const URL_RE = /((?:https?:\/\/)?(?:www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?)/g;
const TRAIL_RE = /[.,;:!?)\]}'"]+$/;

// Common TLDs that make a scheme-less token count as a link.
const LINK_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'co', 'in', 'uk', 'us', 'ca', 'au',
  'de', 'fr', 'jp', 'cn', 'br', 'ru', 'it', 'es', 'nl', 'se', 'no', 'ch', 'sg', 'ae',
  'info', 'biz', 'me', 'ai', 'app', 'dev', 'xyz', 'tech', 'store', 'online', 'site', 'live',
  'news', 'blog', 'cloud', 'finance', 'money', 'bank', 'fund', 'capital', 'invest', 'ind',
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isLinkable = (token) => {
  const noScheme = token.replace(/^https?:\/\//i, '');
  if (/^https?:\/\//i.test(token)) return true;
  if (/^www\./i.test(noScheme)) return true;
  const host = noScheme.split(/[/:?#]/)[0];
  const tld = host.split('.').pop().toLowerCase();
  return LINK_TLDS.has(tld);
};

// Highlights @mentions inside a plain-text segment.
function renderMentions(text, mentionRe, mentionCls, keyBase) {
  if (!mentionRe) return [<span key={keyBase}>{text}</span>];
  const segs = text.split(mentionRe);
  const hits = text.match(mentionRe) || [];
  const out = [];
  segs.forEach((seg, j) => {
    if (seg) out.push(<span key={`${keyBase}-t${j}`}>{seg}</span>);
    if (j < hits.length) out.push(<span key={`${keyBase}-m${j}`} className={mentionCls}>{hits[j]}</span>);
  });
  return out;
}

// Renders message text with clickable links, highlighted @mentions and
// preserved newlines. `mine` switches the mention highlight to a light style
// so it stays readable on the sender's blue gradient bubble.
export function renderContent(content = '', mentions = [], mine = false) {
  if (!content) return null;
  const mentionCls = mine
    ? 'font-bold text-white bg-white/25 rounded px-1'
    : 'font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 rounded px-0.5';
  const mentionNames = mentions.map((m) => m.name).filter(Boolean);
  const mentionRe = mentionNames.length
    ? new RegExp(`@(?:${mentionNames.map(escapeRe).join('|')})`, 'g')
    : null;

  const nodes = [];
  let last = 0;
  let key = 0;
  for (const match of content.matchAll(URL_RE)) {
    const token = match[0];
    const idx = match.index;
    const precededByAt = idx > 0 && content[idx - 1] === '@';
    if (precededByAt || !isLinkable(token)) continue; // leave as plain text

    // Plain text before this link.
    if (idx > last) nodes.push(...renderMentions(content.slice(last, idx), mentionRe, mentionCls, `pre${key}`));

    const trail = (token.match(TRAIL_RE) || [''])[0];
    const url = trail ? token.slice(0, token.length - trail.length) : token;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    nodes.push(
      <a key={`lnk${key}`} href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-current/40 hover:decoration-current break-all">
        {url}
      </a>
    );
    if (trail) nodes.push(<span key={`tr${key}`}>{trail}</span>);
    last = idx + token.length;
    key += 1;
  }
  if (last < content.length) nodes.push(...renderMentions(content.slice(last), mentionRe, mentionCls, `post${key}`));
  return nodes;
}

// Display name for a conversation from the current user's perspective.
export function conversationName(conv, meId, usersById) {
  if (conv.type === 'GROUP') return conv.name || 'Group';
  const other = conv.members.find((m) => m.userId !== meId);
  return usersById.get(other?.userId)?.name || 'Direct Message';
}

export function conversationOtherUser(conv, meId, usersById) {
  if (conv.type !== 'DM') return null;
  const other = conv.members.find((m) => m.userId !== meId);
  return usersById.get(other?.userId) || null;
}
