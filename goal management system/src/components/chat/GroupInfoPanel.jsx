import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Pencil, Check, Users as UsersIcon, Crown, ShieldCheck, Trash2 } from 'lucide-react';
import { ChatAvatar, GroupAvatar } from './Avatars';
import { updateConversation, deleteConversation } from '../../services/chat';
import { fmtTime, dayLabel } from './chatFormat';
import AvatarCropperModal from '../AvatarCropperModal';

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

// WhatsApp-style group info drawer: avatar, name, description (all editable by
// any member), an audit line of who last edited, and a member roster whose
// rows open each teammate's profile card.
export default function GroupInfoPanel({ conv, me, usersById, onlineSet, onClose, onUpdated, onDeleted, onOpenProfile }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conv.name || '');
  const [description, setDescription] = useState(conv.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState(null); // raw, uncropped selection — staged for AvatarCropperModal
  const fileRef = useRef(null);

  const editor = conv.metaUpdatedBy ? usersById.get(conv.metaUpdatedBy) : null;
  const memberUsers = conv.members.map((m) => usersById.get(m.userId)).filter(Boolean);

  const persist = async (patch) => {
    setError('');
    setSaving(true);
    try {
      const { conversation } = await updateConversation(conv.id, patch);
      onUpdated?.(conversation);
      return true;
    } catch (err) {
      setError(err?.message || 'Failed to save.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveText = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    const ok = await persist({ name: name.trim(), description: description.trim() });
    if (ok) setEditing(false);
  };

  // Only the creator or a system admin may delete the whole group.
  const canDelete = conv.createdBy === me.id || (me.roles || []).includes('ADMIN');
  const handleDelete = async () => {
    if (!window.confirm(`Delete "${conv.name}" for everyone? All its messages will be permanently removed. This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteConversation(conv.id);
      onDeleted?.(conv.id);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to delete group.');
      setSaving(false);
    }
  };

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) { setError('Image must be under 3MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const onCropConfirm = (croppedDataUrl) => {
    setCropSrc(null);
    persist({ photo: croppedDataUrl });
  };

  const roleTint = {
    ADMIN: 'text-blue-500', RM: 'text-emerald-500', PORTFOLIO_MANAGER: 'text-violet-500',
    INSURANCE_MANAGER: 'text-amber-500', SERVICE_MANAGER: 'text-cyan-500',
    OPERATIONS_MANAGER: 'text-rose-500', INTERNAL_MANAGER: 'text-indigo-500', INTERNAL_USER: 'text-slate-400',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9997] flex justify-end animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200/70 dark:border-slate-800 flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/70 dark:border-slate-800">
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Group info</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center px-5 py-6 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              {conv.photo ? (
                <img src={conv.photo} alt={conv.name} className="w-24 h-24 rounded-full object-cover shadow-lg ring-4 ring-white dark:ring-slate-900" />
              ) : (
                <GroupAvatar size={96} />
              )}
              <button
                onClick={() => fileRef.current?.click()}
                title="Change group photo"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-slate-900 hover:scale-110 active:scale-95 transition-all cursor-pointer"
              >
                <Camera size={14} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              {cropSrc && (
                <AvatarCropperModal src={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={onCropConfirm} />
              )}
            </div>

            {editing ? (
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                className="mt-4 w-full text-center text-lg font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                placeholder="Group name"
              />
            ) : (
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {conv.name}
                <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-blue-500 cursor-pointer" title="Edit">
                  <Pencil size={13} />
                </button>
              </h2>
            )}
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Group · {conv.members.length} members</p>
          </div>

          {/* Description */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Description</div>
            {editing ? (
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add a group description…"
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-blue-500"
              />
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {conv.description || <span className="italic text-slate-400">No description yet.</span>}
              </p>
            )}

            {conv.metaUpdatedAt && !editing && (
              <p className="text-[10px] text-slate-400 mt-2">
                Last edited by <b className="text-slate-500 dark:text-slate-400">{editor?.id === me.id ? 'you' : (editor?.name || 'someone')}</b>
                {' · '}{dayLabel(conv.metaUpdatedAt)} at {fmtTime(conv.metaUpdatedAt)}
              </p>
            )}

            {error && <p className="text-[11px] font-bold text-rose-500 mt-2">{error}</p>}

            {editing && (
              <div className="flex items-center gap-2 mt-3">
                <button onClick={saveText} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50">
                  <Check size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditing(false); setName(conv.name || ''); setDescription(conv.description || ''); setError(''); }} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="px-2 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 mb-1.5 flex items-center gap-1.5">
              <UsersIcon size={11} /> {conv.members.length} Members
            </div>
            {memberUsers.map((u) => {
              const isCreator = conv.createdBy === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => onOpenProfile?.(u)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
                >
                  <ChatAvatar user={u} size={38} online={onlineSet.has(u.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                      {u.id === me.id ? 'You' : u.name}
                      {isCreator && <Crown size={11} className="text-amber-500" title="Group creator" />}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{u.jobTitle || u.email}</div>
                  </div>
                  <ShieldCheck size={13} className={roleTint[u.roles?.[0]] || 'text-slate-400'} title={(u.roles || []).join(', ')} />
                </button>
              );
            })}
          </div>

          {/* Danger zone — delete the whole group (creator / admin only) */}
          {canDelete && (
            <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleDelete}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete Group
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
