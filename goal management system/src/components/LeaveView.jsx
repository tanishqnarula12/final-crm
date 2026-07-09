// Leave module — reachable only from the Account & General Settings profile
// dropdown (no sidebar entry, by design). Everyone can apply for their own
// leave and see its status; only Admin / Internal Manager see the "Team
// Approvals" section and can approve or reject.
import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, X, CheckCircle2, XCircle, RefreshCw, Pencil } from 'lucide-react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, Field } from './UI';
import { teamName } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canCreateLeave, canEditLeave, canRespondToLeave } from '../utils/permissions';
import {
  loadLeave, applyLeave, editLeave, respondToLeave,
  LEAVE_STATUS_THEME, fmtLeaveRange, fmtLeaveStamp,
} from '../utils/leave';

export default function LeaveView() {
  const me = getCurrentUser();
  const mayCreate = canCreateLeave();
  const mayRespond = canRespondToLeave();
  const [leaves, setLeaves] = useState(() => loadLeave());
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [respondingTo, setRespondingTo] = useState(null);

  useEffect(() => {
    const onUpdate = () => setLeaves(loadLeave());
    window.addEventListener('crm:leave-updated', onUpdate);
    return () => window.removeEventListener('crm:leave-updated', onUpdate);
  }, []);

  const mine = useMemo(
    () => leaves.filter((l) => l.createdBy === me?.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [leaves, me?.id]
  );
  const others = useMemo(
    () => leaves.filter((l) => l.createdBy !== me?.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [leaves, me?.id]
  );
  const pendingCount = useMemo(() => others.filter((l) => l.status === 'Pending').length, [others]);

  const openApply = () => { setEditing(null); setShowForm(true); };
  const openEdit = (l) => { setEditing(l); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSaved = () => closeForm();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <CalendarDays size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Leave</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Apply for leave and track its approval</p>
          </div>
        </div>
        {mayCreate && (
          <button onClick={openApply} className={btnPrimary + ' shrink-0'}>
            <Plus size={14} /> Apply for Leave
          </button>
        )}
      </div>

      {/* My Requests */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">My Requests</h3>
        {mine.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
            <CalendarDays className="mx-auto text-slate-400 dark:text-slate-600 mb-3" size={32} />
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">No leave requests yet</p>
            {mayCreate && (
              <button onClick={openApply} className={btnSecondary}><Plus size={14} /> Apply for leave</button>
            )}
          </Card>
        ) : (
          <div className="space-y-2.5">
            {mine.map((l) => (
              <LeaveRow key={l.id} leave={l} showRequester={false} onEdit={canEditLeave(me, l) && l.status !== 'Approved' ? () => openEdit(l) : null} />
            ))}
          </div>
        )}
      </div>

      {/* Team Approvals — Admin / Internal Manager only */}
      {mayRespond && (
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
            Team Approvals
            {pendingCount > 0 && (
              <span className="text-[9px] font-black text-white bg-amber-500 rounded-full min-w-[16px] h-4 px-1.5 flex items-center justify-center">
                {pendingCount} pending
              </span>
            )}
          </h3>
          {others.length === 0 ? (
            <Card className="p-10 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No leave requests from the team yet</p>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {others.map((l) => (
                <LeaveRow
                  key={l.id}
                  leave={l}
                  showRequester
                  onRespond={l.status === 'Pending' ? () => setRespondingTo(l) : null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <LeaveFormModal initial={editing} onClose={closeForm} onSaved={handleSaved} />
      )}
      {respondingTo && (
        <LeaveRespondModal leave={respondingTo} onClose={() => setRespondingTo(null)} onResponded={() => setRespondingTo(null)} />
      )}
    </div>
  );
}

function LeaveRow({ leave, showRequester, onEdit, onRespond }) {
  const theme = LEAVE_STATUS_THEME[leave.status] || LEAVE_STATUS_THEME.Pending;
  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">{fmtLeaveRange(leave.fromDate, leave.toDate)}</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${theme}`}>
              {leave.status}
            </span>
          </div>
          {showRequester && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Requested by <strong className="text-slate-700 dark:text-slate-300">{teamName(leave.createdBy) || '—'}</strong></p>
          )}
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words leading-relaxed">{leave.reason}</p>
          {leave.responseMessage && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
              "{leave.responseMessage}" {leave.respondedBy && <>— {teamName(leave.respondedBy) || 'Approver'}</>}
            </p>
          )}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-wider font-semibold">
            Applied {fmtLeaveStamp(leave.createdAt)}
            {leave.respondedAt && <> • Responded {fmtLeaveStamp(leave.respondedAt)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && (
            <button onClick={onEdit} className={btnSecondary}>
              {leave.status === 'Rejected' ? <><RefreshCw size={13} /> Re-apply</> : <><Pencil size={13} /> Edit</>}
            </button>
          )}
          {onRespond && (
            <button onClick={onRespond} className={btnPrimary}>Respond</button>
          )}
        </div>
      </div>
    </Card>
  );
}

function LeaveFormModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const isReapply = isEdit && initial.status === 'Rejected';
  const [fromDate, setFromDate] = useState(initial?.fromDate || '');
  const [toDate, setToDate] = useState(initial?.toDate || '');
  const [reason, setReason] = useState(initial?.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSave = fromDate && toDate && reason.trim() && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      if (isEdit) await editLeave(initial.id, { fromDate, toDate, reason: reason.trim() });
      else await applyLeave({ fromDate, toDate, reason: reason.trim() });
      onSaved();
    } catch (err) {
      setError(err?.message || 'Could not save the leave request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            {isReapply ? 'Re-apply for Leave' : isEdit ? 'Edit Leave Request' : 'Apply for Leave'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {isReapply && (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 leading-relaxed">
              This request was rejected{initial.responseMessage ? `: "${initial.responseMessage}"` : '.'} Update the details below to resubmit it — it will go back to Admin / Internal Manager as a new Pending request.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="From *">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="To *">
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} min={fromDate || undefined} />
            </Field>
          </div>
          <Field label="Reason *" error={error}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className={inputCls + ' resize-y'}
              placeholder="Tell your Admin / Internal Manager why you need this leave…"
            />
          </Field>
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canSave} className={btnPrimary}>
            {saving ? 'Saving…' : isReapply ? 'Resubmit' : isEdit ? 'Save Changes' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaveRespondModal({ leave, onClose, onResponded }) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const decide = async (decision) => {
    setSaving(true);
    setError('');
    try {
      await respondToLeave(leave.id, decision, message.trim());
      onResponded();
    } catch (err) {
      setError(err?.message || 'Could not record your decision.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Respond to Leave Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p><strong className="text-slate-700 dark:text-slate-300">{teamName(leave.createdBy) || 'This user'}</strong> requested leave for <strong className="text-slate-700 dark:text-slate-300">{fmtLeaveRange(leave.fromDate, leave.toDate)}</strong>.</p>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 whitespace-pre-wrap break-words leading-relaxed">{leave.reason}</p>

          <Field label="Message (optional)" hint="Visible to the requester — e.g. why it was rejected, or a note along with the approval." error={error}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className={inputCls + ' resize-y'}
              placeholder="Not mandatory…"
            />
          </Field>
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost} disabled={saving}>Cancel</button>
          <button onClick={() => decide('Rejected')} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-all cursor-pointer disabled:opacity-50">
            <XCircle size={14} /> Reject
          </button>
          <button onClick={() => decide('Approved')} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer disabled:opacity-50">
            <CheckCircle2 size={14} /> Approve
          </button>
        </div>
      </div>
    </div>
  );
}
