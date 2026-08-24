// Modal chrome + the parts every COBR-workspace record editor repeats:
// assignment fields, the stage picker, and the comments timeline. The
// view/edit-mode gate and change-log helpers live in utils/cobrModules.js
// (they're plain functions/hooks, not components — react-refresh requires a
// component-only file to keep hot reload working).
import React from 'react';
import { X, MessageSquare, ArrowRight, Pencil } from 'lucide-react';
import { Avatar, inputCls, selectCls, Field, CoolSelect, btnPrimary, btnGhost } from '../UI';
import { fmtTaskStamp } from '../../utils/tasks';
import { loadTeam, teamName } from '../../services/team';
import { stageBadgeCls, STAGE_BTN_TONE, STAGE_SETS } from '../../utils/cobrModules';

// View Mode -> Close / Edit(if allowed); Edit Mode -> Cancel / Save. Mirrors
// the Tasks module's TaskFormModal footer pattern so every editor in the app
// behaves the same way.
//
// `stageDirty` covers a case View Mode alone can't: the assignee (who has
// stage rights but not edit rights) confirms a stage transition via the
// always-live StagePicker WITHOUT ever entering Edit Mode — with no dirty
// flag, "Save Changes" would never appear and that confirmed transition
// would be silently lost on Close. When dirty, Save shows in View Mode too
// (alongside Edit, if the account also holds edit rights), so a stage-only
// change can be persisted without needing details-edit permission at all.
export function ViewEditFooter({ isEditingMode, canEditThis, canSave, stageDirty, onEdit, onCancel, onSave, onClose, saveLabel = 'Save Changes', extra }) {
  if (isEditingMode) {
    return (
      <>
        {extra || <span />}
        <div className="flex gap-2 ml-auto">
          <button onClick={onCancel} className={btnGhost}>Cancel</button>
          <button onClick={onSave} disabled={!canSave} className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}>
            {saveLabel}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      {extra || <span />}
      <div className="flex gap-2 ml-auto">
        <button onClick={onClose} className={btnGhost}>{stageDirty ? 'Discard' : 'Close'}</button>
        {canEditThis && (
          <button onClick={onEdit} className={stageDirty ? btnGhost : btnPrimary}>
            <Pencil size={13} /> Edit
          </button>
        )}
        {stageDirty && (
          <button onClick={onSave} disabled={!canSave} className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}>
            {saveLabel}
          </button>
        )}
      </div>
    </>
  );
}

export function RecordModal({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden animate-fade-in" onClick={onClose}>
      <div
        className={`bg-white dark:bg-slate-900 rounded-none md:rounded-2xl w-full ${maxWidth} shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col h-full md:h-auto md:max-h-[92vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function AssignmentFields({ assignedTo, subPersons = [], dueDate, dueLabel = 'Due Date', onChange, disabled = false, showDate = true }) {
  return (
    <>
      {showDate && (
        <Field label={dueLabel}>
          <fieldset disabled={disabled} className="contents">
            <input
              type="date"
              value={dueDate || ''}
              onChange={(e) => onChange({ dueDate: e.target.value })}
              className={inputCls + (disabled ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')}
            />
          </fieldset>
        </Field>
      )}

      <Field label="Assigned To *">
        <fieldset disabled={disabled} className="contents">
          <CoolSelect
            value={assignedTo || ''}
            onChange={(e) => onChange({ assignedTo: e.target.value })}
            className={selectCls + (disabled ? ' opacity-60 cursor-not-allowed' : '')}
          >
            <option value="">Select…</option>
            {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </CoolSelect>
        </fieldset>
      </Field>

      <Field label="Sub Persons" hint="Optional — anyone else working this record">
        <fieldset disabled={disabled} className="contents">
          <CoolSelect
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id && !subPersons.includes(id)) onChange({ subPersons: [...subPersons, id] });
            }}
            placeholder="Add a sub person…"
            emptyHint="No more people to add"
            className={selectCls + (disabled ? ' opacity-60 cursor-not-allowed' : '')}
          >
            <option value="">Select…</option>
            {loadTeam().filter((m) => !subPersons.includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </CoolSelect>
        </fieldset>
        {subPersons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {subPersons.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200/60 dark:ring-blue-900/40 text-[11px] font-bold">
                <Avatar name={teamName(id)} size="xs" />
                {teamName(id) || '—'}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange({ subPersons: subPersons.filter((x) => x !== id) })}
                    title="Remove"
                    className="text-blue-400 hover:text-rose-500 transition-colors cursor-pointer ml-0.5"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </Field>
    </>
  );
}

// Current-stage badge + a row of outline pill buttons for every OTHER stage —
// the same visual language as Claim's "What happened next?" workflow buttons,
// reused verbatim so every register's stage control looks identical rather
// than each screen inventing its own. Unlike Claim (which only offers the
// stages reachable from a transition map), these registers have a simple
// vocabulary with no branching, so every other stage is clickable directly —
// this replaces what used to be a plain dropdown, not the underlying rule
// that any stage can be picked.
// `actions`, when given, is a { stage: [reachableStage, ...] } map — the
// picker then only offers what's reachable from the CURRENT stage, enforcing
// a sequential, no-skipping flow (Renewal's funnel). Without it, every other
// stage in the vocabulary stays clickable (FD/Policy — simple or status-like
// vocabularies where any-to-any doesn't need gating).
export function StagePicker({ type, stage, onSelect, disabled = false, actions }) {
  const stages = STAGE_SETS[type]?.stages || [];
  const options = actions ? (actions[stage] || []) : stages.filter((s) => s !== stage);
  const sequential = !!actions;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Stage</span>
        <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${stageBadgeCls(type, stage)}`}>
          {stage}
        </span>
      </div>

      {disabled ? (
        <p className="text-[11px] text-slate-400 italic">You do not have permission to change the stage.</p>
      ) : options.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">{sequential ? 'This stage is final — nothing further to advance.' : 'No other stages available.'}</p>
      ) : (
        <>
          <p className="text-[11px] text-slate-400 mb-2">{sequential ? "What's next?" : 'Update stage'}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((s) => {
              const tone = STAGE_SETS[type]?.tone?.[s] || 'slate';
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSelect(s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${STAGE_BTN_TONE[tone] || STAGE_BTN_TONE.blue}`}
                >
                  {s} <ArrowRight size={11} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function LogTimeline({ comments = [] }) {
  return (
    <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
      <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
        <MessageSquare size={14} /> Comments &amp; Logs
      </h4>
      {comments.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No log entries yet.</p>
      ) : (
        <ol className="space-y-2 max-h-40 overflow-y-auto pl-3 pr-1">
          {comments.map((c, i) => (
            <li key={i} className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800 text-xs">
              <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
              <p className="text-slate-600 dark:text-slate-300">{c.text}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {fmtTaskStamp(c.at)}
                {c.by && <span className="text-blue-500 dark:text-blue-400 font-semibold ml-1.5">• {c.by}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}


