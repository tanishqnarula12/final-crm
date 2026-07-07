import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Paperclip, X, CornerUpLeft, Pencil, Zap, AtSign, Smile, BarChart3, Trash2 } from 'lucide-react';
import { emitTyping } from '../../services/chat';
import { ChatAvatar } from './Avatars';
import { fileMeta, humanSize, isImageAttachment } from './chatFormat';
import EmojiPicker from './EmojiPicker';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // per-file cap (server caps the dataUrl too)
const ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv';

// Quick actions triggered by typing "/" — a mix of in-app navigation and
// text inserts. Navigation ones are handled by App via onQuickAction.
const SLASH_COMMANDS = [
  { cmd: '/poll', desc: 'Create a poll', action: 'poll' },
  { cmd: '/task', desc: 'Create a new task', action: 'task' },
  { cmd: '/meeting', desc: 'Go to Meetings & schedule', action: 'meeting' },
  { cmd: '/lead', desc: 'Go to Leads', action: 'lead' },
  { cmd: '/client', desc: 'Go to Clients', action: 'client' },
  { cmd: '/dash', desc: 'Go to Dashboard', action: 'dash' },
  { cmd: '/date', desc: "Insert today's date", insert: () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
  { cmd: '/shrug', desc: 'Insert ¯\\_(ツ)_/¯', insert: () => '¯\\_(ツ)_/¯' },
];

const Composer = forwardRef(function Composer(
  { conversationId, isGroup, members, replyTo, onCancelReply, editing, onCancelEdit, onSend, onSaveEdit, onQuickAction, usersById },
  ref
) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null); // null = closed
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showPoll, setShowPoll] = useState(false);

  const taRef = useRef(null);
  const fileRef = useRef(null);
  const typingRef = useRef({ timer: null, active: false });
  const mentionsRef = useRef([]); // { id, name } picked in this draft

  // When entering edit mode, load the message's content into the box.
  useEffect(() => {
    if (editing) {
      setValue(editing.content || '');
      setAttachments([]);
      mentionsRef.current = editing.mentions || [];
      taRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // Reset draft when switching conversations.
  useEffect(() => {
    setValue(''); setAttachments([]); setError('');
    setMentionQuery(null); setSlashOpen(false); setEmojiOpen(false); setShowPoll(false);
    mentionsRef.current = [];
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    if (typingRef.current.active) {
      typingRef.current.active = false;
      emitTyping(conversationId, false);
    }
    clearTimeout(typingRef.current.timer);
  }, [conversationId]);

  const signalTyping = () => {
    if (!typingRef.current.active) {
      typingRef.current.active = true;
      emitTyping(conversationId, true);
    }
    clearTimeout(typingRef.current.timer);
    typingRef.current.timer = setTimeout(stopTyping, 2500);
  };

  useEffect(() => () => stopTyping(), [stopTyping]);

  // --- Attachments ----------------------------------------------------------

  const addFiles = useCallback((files) => {
    setError('');
    const list = Array.from(files || []);
    list.forEach((file) => {
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" is larger than 5MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: ev.target.result },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  // Let the message pane (drag & drop overlay) push files into the composer.
  useImperativeHandle(ref, () => ({ addFiles, focus: () => taRef.current?.focus() }), [addFiles]);

  const handlePaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  // --- Mention / slash popups -------------------------------------------------

  const updatePopups = (text, caret) => {
    // @mention only exists in GROUP conversations — a DM has one recipient.
    if (isGroup) {
      const upToCaret = text.slice(0, caret);
      const m = upToCaret.match(/(^|\s)@([\w ]{0,30})$/);
      if (m) { setMentionQuery(m[2].toLowerCase()); setMentionIndex(0); }
      else setMentionQuery(null);
    }
    setSlashOpen(text.startsWith('/') && !text.includes(' ') && text.length <= 20);
    setSlashIndex(0);
  };

  const mentionCandidates = (members || []).filter(
    (u) => mentionQuery !== null && u.name.toLowerCase().includes(mentionQuery)
  ).slice(0, 6);

  const slashCandidates = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value.toLowerCase())).slice(0, 7);

  const pickMention = (user) => {
    const ta = taRef.current;
    const caret = ta.selectionStart;
    const upToCaret = value.slice(0, caret);
    const replaced = upToCaret.replace(/(^|\s)@([\w ]{0,30})$/, `$1@${user.name} `);
    const next = replaced + value.slice(caret);
    setValue(next);
    if (!mentionsRef.current.some((x) => x.id === user.id)) {
      mentionsRef.current = [...mentionsRef.current, { id: user.id, name: user.name }];
    }
    setMentionQuery(null);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = replaced.length; });
  };

  const pickSlash = (c) => {
    setSlashOpen(false);
    if (c.action === 'poll') { setValue(''); setShowPoll(true); return; }
    if (c.insert) {
      setValue((v) => v.replace(/^\/\w*/, c.insert()));
      taRef.current?.focus();
    } else if (c.action) {
      setValue('');
      onQuickAction?.(c.action);
    }
  };

  // Insert an emoji at the caret position.
  const insertEmoji = (emoji) => {
    const ta = taRef.current;
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = start + emoji.length; }
    });
  };

  // --- Send / save -------------------------------------------------------------

  const activeMentions = () =>
    mentionsRef.current.filter((m) => value.includes(`@${m.name}`));

  const submit = async () => {
    if (sending) return;
    setError('');
    if (editing) {
      const content = value.trim();
      if (!content) return;
      setSending(true);
      try {
        await onSaveEdit(content);
        setValue('');
        mentionsRef.current = [];
      } catch (err) {
        setError(err?.message || 'Failed to save.');
      } finally {
        setSending(false);
      }
      return;
    }
    const content = value.trim();
    if (!content && attachments.length === 0) return;
    setSending(true);
    stopTyping();
    try {
      await onSend({ content, attachments, mentions: activeMentions(), replyToId: replyTo?.id || null });
      setValue('');
      setAttachments([]);
      mentionsRef.current = [];
    } catch (err) {
      setError(err?.message || 'Failed to send.');
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const submitPoll = async ({ question, options, multi }) => {
    await onSend({ content: '', attachments: [], mentions: [], replyToId: replyTo?.id || null, poll: { question, options, multi } });
    setShowPoll(false);
  };

  const onKeyDown = (e) => {
    if (mentionQuery !== null && mentionCandidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionCandidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionCandidates[mentionIndex]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (slashOpen && slashCandidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashCandidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashCandidates.length) % slashCandidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSlash(slashCandidates[slashIndex]); return; }
      if (e.key === 'Escape') { setSlashOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      if (editing) onCancelEdit?.();
      if (replyTo) onCancelReply?.();
    }
  };

  const onChange = (e) => {
    setValue(e.target.value);
    signalTyping();
    updatePopups(e.target.value, e.target.selectionStart);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };

  const replyUser = replyTo ? usersById.get(replyTo.senderId) : null;

  return (
    <div className="relative border-t border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3">
      {/* Mention popup (groups only) */}
      {isGroup && mentionQuery !== null && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-30 animate-scale-up">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800">
            <AtSign size={11} /> Mention
          </div>
          {mentionCandidates.map((u, i) => (
            <button
              key={u.id}
              onClick={() => pickMention(u)}
              onMouseEnter={() => setMentionIndex(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors ${i === mentionIndex ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
            >
              <ChatAvatar user={u} size={26} />
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                {u.jobTitle && <div className="text-[10px] text-slate-400 truncate">{u.jobTitle}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Slash-command popup */}
      {slashOpen && slashCandidates.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden z-30 animate-scale-up">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800">
            <Zap size={11} /> Quick actions
          </div>
          {slashCandidates.map((c, i) => (
            <button
              key={c.cmd}
              onClick={() => pickSlash(c)}
              onMouseEnter={() => setSlashIndex(i)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer transition-colors ${i === slashIndex ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
            >
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">{c.cmd}</span>
              <span className="text-[10px] text-slate-450 dark:text-slate-500">{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker popup */}
      {emojiOpen && !editing && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setEmojiOpen(false)} />
          <div className="absolute bottom-full left-3 mb-2 z-30 animate-pop-in">
            <EmojiPicker onPick={insertEmoji} />
          </div>
        </>
      )}

      {/* Reply / edit banner */}
      {(replyTo || editing) && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950/40 border-l-2 border-blue-500 animate-fade-in">
          {editing ? <Pencil size={13} className="text-blue-500 shrink-0" /> : <CornerUpLeft size={13} className="text-blue-500 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {editing ? 'Editing message' : `Replying to ${replyUser?.name || 'message'}`}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {(editing ? editing.content : replyTo.content) || '📎 Attachment'}
            </div>
          </div>
          <button onClick={() => (editing ? onCancelEdit?.() : onCancelReply?.())} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer p-1">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 animate-fade-in">
          {attachments.map((a, i) => {
            const { Icon, tint } = fileMeta(a);
            return (
              <span key={i} className="group inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {isImageAttachment(a) ? (
                  <img src={a.dataUrl} alt={a.name} className="w-6 h-6 rounded object-cover" />
                ) : (
                  <Icon size={14} className={tint} />
                )}
                <span className="max-w-[140px] truncate">{a.name}</span>
                <span className="text-[9px] text-slate-400 font-medium">{humanSize(a.size)}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-rose-500 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {error && <p className="text-[11px] font-bold text-rose-500 mb-1.5">{error}</p>}

      <div className="flex items-end gap-1.5">
        {!editing && (
          <>
            <button
              onClick={() => { setEmojiOpen((o) => !o); }}
              title="Emoji"
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${emojiOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'text-slate-450 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'}`}
            >
              <Smile size={19} />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-slate-450 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all cursor-pointer"
            >
              <Paperclip size={18} />
            </button>
            <button
              onClick={() => setShowPoll(true)}
              title="Create poll"
              className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-slate-450 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all cursor-pointer"
            >
              <BarChart3 size={18} />
            </button>
          </>
        )}
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

        <textarea
          ref={taRef}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          onBlur={stopTyping}
          placeholder={editing ? 'Edit your message…' : (isGroup ? 'Type a message…  ( @ to mention · / for actions )' : 'Type a message…  ( / for quick actions )')}
          className="flex-1 resize-none px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder-slate-400 dark:placeholder-slate-600"
          style={{ maxHeight: 160 }}
        />

        <button
          onClick={submit}
          disabled={sending || (!value.trim() && attachments.length === 0)}
          title={editing ? 'Save' : 'Send'}
          className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
        >
          {editing ? <Pencil size={16} /> : <Send size={16} />}
        </button>
      </div>

      {showPoll && <PollComposer onClose={() => setShowPoll(false)} onCreate={submitPoll} />}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Poll composer modal
// ---------------------------------------------------------------------------
function PollComposer({ onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleOptChange = (i, v) => {
    setOptions((prev) => {
      const next = prev.map((o, j) => (j === i ? v : o));
      // Auto-add new empty option if we edited the last index and it's not empty, and we have < 12 options
      if (i === prev.length - 1 && v.trim() !== '' && prev.length < 12) {
        next.push('');
      }
      return next;
    });
  };

  const removeOpt = (i) => {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)));
  };

  const submit = async () => {
    setError('');
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q) return setError('Enter a poll question.');
    if (opts.length < 2) return setError('Add at least two options.');
    setSaving(true);
    try {
      await onCreate({ question: q, options: opts, multi });
    } catch (err) {
      setError(err?.message || 'Failed to create poll.');
      setSaving(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-[2px] flex items-center justify-center p-4 animate-fade-in" 
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/60 dark:border-slate-800/80 animate-scale-up flex flex-col max-h-[85vh] overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Close on left, Title next to it */}
        <div className="flex items-center gap-4 px-6 pt-6 pb-4 shrink-0">
          <button 
            onClick={onClose} 
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Create poll</h3>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {/* Question Section */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-500">Question</label>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 focus-within:border-blue-500 dark:focus-within:border-blue-500 transition-colors">
              <input
                autoFocus 
                value={question} 
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask question"
                className="flex-1 py-2.5 text-base bg-transparent text-slate-900 dark:text-white focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
              />
              <Smile size={18} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 cursor-pointer" />
            </div>
          </div>

          {/* Options Section */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-500">Options</label>
            <div className="space-y-4">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-3 group animate-fade-in">
                  <div className="flex-1 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 focus-within:border-blue-500 dark:focus-within:border-blue-500 transition-colors">
                    <input
                      value={o} 
                      onChange={(e) => handleOptChange(i, e.target.value)}
                      placeholder="Add text"
                      className="flex-1 py-2 text-sm bg-transparent text-slate-900 dark:text-white focus:outline-none placeholder-slate-400 dark:placeholder-slate-500"
                    />
                    <Smile size={16} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 cursor-pointer shrink-0" />
                  </div>
                  
                  {/* Delete Option & Drag Handle indicator */}
                  <div className="flex items-center gap-1.5 shrink-0 w-16 justify-end">
                    {options.length > 2 && o.trim() !== '' && (
                      <button 
                        onClick={() => removeOpt(i)} 
                        className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        title="Delete option"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    
                    {/* WhatsApp-style custom double horizontal lines drag handle */}
                    <div className="flex flex-col gap-0.5 text-slate-300 dark:text-slate-600 select-none p-1.5 cursor-grab">
                      <div className="w-3.5 h-0.5 bg-current rounded-full" />
                      <div className="w-3.5 h-0.5 bg-current rounded-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Allow Multiple Answers Toggle */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-350">Allow multiple answers</span>
            <button
              type="button"
              onClick={() => setMulti((v) => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer ${multi ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${multi ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {error && <p className="text-xs font-bold text-rose-500 animate-pulse">{error}</p>}
          
          {/* Spacer to prevent scrollable content overlap with floating send button */}
          <div className="h-20" />
        </div>

        {/* Floating WhatsApp-Style Send Button */}
        <button
          onClick={submit}
          disabled={saving}
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 cursor-pointer z-10"
          title="Send Poll"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={20} className="ml-0.5 fill-current text-white" />
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}

export default Composer;
