// COBR (Change of Broker) — view/edit an existing COBR task.
//
// A COBR record IS a Task row; this modal is the specialized editor for it
// (the checklist of AMC/scheme entries with mandatory-remark Done/Rejected
// marking, and the reopen-only-from-the-COBR-module rule) — everything else
// (stage, assignment, comments) behaves exactly like a regular task and goes
// through the identical save pipeline via `onSave` (App.jsx's
// handleSaveTaskGlobal, shared with the plain Task module).
import React, { useState } from 'react';
import { X, Check, XCircle, RotateCcw, Lock, MessageSquare } from 'lucide-react';
import { btnPrimary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { STAGE_THEME, fmtTaskStamp } from '../utils/tasks';
import { COBR_STAGES, cobrTotals, clearRejectedEntries } from '../utils/cobr';
import { loadTeam } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { fmtINR } from '../utils/calc';
import { canDo } from '../utils/permissions';

// `interactive` = the working view (opened from the Tasks module / dashboard /
// profile task lists): the Mark Done/Rejected checklist is live and detail
// fields are editable. When false = the COBR module's summary view: the
// checklist is READ-ONLY (status badges only, no marking) — marking happens in
// the Tasks module — and this view is only for tracking totals + reopening.
export default function CobrTaskModal({ task, interactive = true, allowReopen = false, onClose, onSave }) {
  const [stage, setStage] = useState(task.stage || 'Open');
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || '');
  const [subPerson, setSubPerson] = useState(task.subPerson || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [cobrEntries, setCobrEntries] = useState(task.cobrEntries || {});
  const [comments, setComments] = useState(Array.isArray(task.comments) ? task.comments : []);
  const [pendingRow, setPendingRow] = useState(null); // { amc, rowId, action } — awaiting a mandatory remark
  const [remark, setRemark] = useState('');
  const [stageRemark, setStageRemark] = useState('');
  // The stage value already written to the log. Auto-advance (below) keeps this
  // in sync so it never double-logs; a MANUAL dropdown change makes
  // stage !== loggedStage, which forces a mandatory reason before Save.
  const [loggedStage, setLoggedStage] = useState(task.stage || 'Open');

  const detailsEditable = interactive && canDo('cobr', 'editDetails', task);
  const showMark = interactive && canDo('cobr', 'editLog', task);
  const initialStage = task.stage || 'Open';
  const isCompleted = stage === 'Completed';
  const wasCompleted = initialStage === 'Completed';
  const reopening = wasCompleted && stage !== 'Completed';
  // A manual stage change (not the auto-advance, not a reopen) needs a reason.
  const stageChangePending = interactive && !reopening && stage !== loggedStage;

  const totals = cobrTotals(cobrEntries);

  const requestStatus = (amc, rowId, action) => {
    if (!showMark) return;
    setPendingRow({ amc, rowId, action });
    setRemark('');
  };

  const confirmStatus = () => {
    if (!pendingRow || !remark.trim()) return;
    const { amc, rowId, action } = pendingRow;
    const row = (cobrEntries[amc] || []).find((r) => r.id === rowId);
    setCobrEntries((prev) => ({
      ...prev,
      [amc]: (prev[amc] || []).map((r) => (r.id === rowId ? { ...r, status: action } : r)),
    }));
    // Working on an untouched (Open) COBR task auto-advances it to In Process —
    // and that stage change is folded into THIS SAME log line (one combined
    // entry of the done/rejected mark + the stage change), not a separate row.
    const willAdvance = stage === 'Open';
    if (willAdvance) { setStage('In Process'); setLoggedStage('In Process'); }
    setComments((prev) => [...prev, {
      at: new Date().toISOString(),
      by: getCurrentUser()?.name || 'System',
      text: `Marked "${row?.schemeName || 'entry'}" (${amc}) as ${action === 'done' ? 'Done' : 'Rejected'} — ${remark.trim()}${willAdvance ? ' | Stage changed from Open to In Process' : ''}`,
    }]);
    setPendingRow(null);
    setRemark('');
  };

  const handleStageChange = (next) => {
    setStage(next);
    if (next === loggedStage) setStageRemark(''); // reverted — no reason needed
  };

  // Explicit reopen (COBR module only): flips a Completed task back to In
  // Process and clears every Rejected entry to Pending immediately (visual
  // feedback) — the mandatory reopen log line is appended on Save via the
  // `reopening` flag. Much clearer than making the user hunt the stage dropdown.
  const handleReopen = () => {
    setStage('In Process');
    setCobrEntries((prev) => clearRejectedEntries(prev));
  };

  const handleSave = () => {
    // A manual stage change is blocked until a reason is given (mandatory log,
    // matching the Tasks module convention).
    if (stageChangePending && !stageRemark.trim()) return;

    const finalEntries = reopening ? clearRejectedEntries(cobrEntries) : cobrEntries;
    const extra = [];
    if (reopening) {
      extra.push({
        at: new Date().toISOString(),
        by: getCurrentUser()?.name || 'System',
        text: 'COBR task reopened — rejected entries cleared back to pending.',
      });
    } else if (stageChangePending) {
      extra.push({
        at: new Date().toISOString(),
        by: getCurrentUser()?.name || 'System',
        text: `Stage changed from ${loggedStage} to ${stage} — ${stageRemark.trim()}`,
      });
    }
    onSave({
      ...task,
      stage,
      assignedTo,
      subPerson,
      dueDate,
      cobrEntries: finalEntries,
      comments: [...comments, ...extra],
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-none md:rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col h-full md:h-auto md:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{task.taskName}</h3>
            <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-0.5">{task.applicant} · {task.pan || '—'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Stage">
              {interactive && !wasCompleted ? (
                <CoolSelect value={stage} onChange={(e) => handleStageChange(e.target.value)} className={selectCls}>
                  {COBR_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </CoolSelect>
              ) : (
                <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 flex items-center gap-2">
                  {isCompleted && <Lock size={12} className="text-slate-400" />}
                  <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[stage] || STAGE_THEME.Open}`}>{stage}</span>
                </div>
              )}
              {interactive && wasCompleted && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Reopen this from the COBR module.</p>
              )}
            </Field>
            <Field label="Due Date">
              <fieldset disabled={!detailsEditable} className="contents">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls + (!detailsEditable ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} />
              </fieldset>
            </Field>
            <Field label="Assigned To">
              <fieldset disabled={!detailsEditable} className="contents">
                <CoolSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls + (!detailsEditable ? ' opacity-60 cursor-not-allowed' : '')}>
                  <option value="">Select…</option>
                  {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </CoolSelect>
              </fieldset>
            </Field>
            <Field label="Sub Person">
              <fieldset disabled={!detailsEditable} className="contents">
                <CoolSelect value={subPerson} onChange={(e) => setSubPerson(e.target.value)} className={selectCls + (!detailsEditable ? ' opacity-60 cursor-not-allowed' : '')}>
                  <option value="">Select…</option>
                  {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </CoolSelect>
              </fieldset>
            </Field>
          </div>

          {/* Mandatory reason for a manual stage change (Tasks-module convention) */}
          {stageChangePending && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 p-3">
              <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1.5">
                Reason for stage change ({loggedStage} → {stage}) <span className="text-rose-500">*</span>
              </label>
              <input
                value={stageRemark}
                onChange={(e) => setStageRemark(e.target.value)}
                placeholder="Why is the stage changing? (required to save)"
                className={inputCls + ' text-xs py-2'}
              />
            </div>
          )}

          {/* Totals */}
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4">
            <div className={`grid gap-3 ${isCompleted ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'}`}>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Total Amount</span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200 tabular-nums">{fmtINR(totals.total)}</span>
              </div>
              {isCompleted && (
                <>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 block mb-1">Done</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtINR(totals.done)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 block mb-1">Rejected</span>
                    <span className="text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtINR(totals.rejected)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-450 block mb-1">Pending</span>
                    <span className="text-lg font-bold text-slate-600 dark:text-slate-300 tabular-nums">{fmtINR(totals.pending)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scheme Checklist</h4>
              {!interactive && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Mark Done / Rejected from the Tasks module</span>
              )}
            </div>
            {Object.keys(cobrEntries).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No AMC entries on this request.</p>
            ) : Object.entries(cobrEntries).map(([amc, rows]) => (
              <div key={amc} className="rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> {amc}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[520px]">
                    <thead>
                      <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-3 py-2">Scheme Name</th>
                        <th className="px-3 py-2">Folio No</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-center">Done</th>
                        <th className="px-3 py-2 text-center">Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rows || []).map((row) => {
                        const isPending = pendingRow?.amc === amc && pendingRow?.rowId === row.id;
                        const isDone = row.status === 'done';
                        const isRejected = row.status === 'rejected';
                        return (
                          <React.Fragment key={row.id}>
                            <tr className="border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                              <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">{row.schemeName || '—'}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400 tabular-nums">{row.folioNo || '—'}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300 tabular-nums text-right">{fmtINR(Number(row.amount) || 0)}</td>
                              <td className="px-3 py-2 text-center">
                                {showMark ? (
                                  <button
                                    type="button"
                                    onClick={() => requestStatus(amc, row.id, 'done')}
                                    title="Mark Done"
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
                                      isDone
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                        : 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                    }`}
                                  >
                                    <Check size={14} />
                                  </button>
                                ) : (
                                  isDone ? <Check size={15} className="inline text-emerald-600 dark:text-emerald-400" /> : <span className="text-slate-300 dark:text-slate-700">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {showMark ? (
                                  <button
                                    type="button"
                                    onClick={() => requestStatus(amc, row.id, 'rejected')}
                                    title="Mark Rejected"
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
                                      isRejected
                                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                        : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                    }`}
                                  >
                                    <XCircle size={14} />
                                  </button>
                                ) : (
                                  isRejected ? <XCircle size={15} className="inline text-rose-600 dark:text-rose-400" /> : <span className="text-slate-300 dark:text-slate-700">—</span>
                                )}
                              </td>
                            </tr>
                            {isPending && (
                              <tr>
                                <td colSpan={5} className="px-3 pb-2.5">
                                  <div className="flex items-center gap-2 pl-2 border-l-2 border-blue-400">
                                    <input
                                      autoFocus
                                      value={remark}
                                      onChange={(e) => setRemark(e.target.value)}
                                      placeholder={`Remark for marking ${pendingRow.action === 'done' ? 'Done' : 'Rejected'} (required)…`}
                                      className={inputCls + ' text-xs py-1.5'}
                                    />
                                    <button type="button" onClick={confirmStatus} disabled={!remark.trim()} className={btnPrimary + ' py-1.5 px-2.5 text-[10px] shrink-0' + (!remark.trim() ? ' opacity-50 cursor-not-allowed' : '')}>
                                      Confirm
                                    </button>
                                    <button type="button" onClick={() => setPendingRow(null)} className={btnGhost + ' py-1.5 px-2.5 text-[10px] shrink-0'}>
                                      Cancel
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Comments / Logs */}
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
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          {allowReopen && isCompleted ? (
            <button
              onClick={handleReopen}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all cursor-pointer"
              title="Reopen this COBR task"
            >
              <RotateCcw size={14} /> Reopen Task
            </button>
          ) : reopening ? (
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <RotateCcw size={12} /> Reopening — rejected entries cleared. Save to confirm.
            </span>
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Close</button>
            <button
              onClick={handleSave}
              disabled={stageChangePending && !stageRemark.trim()}
              className={btnPrimary + (stageChangePending && !stageRemark.trim() ? ' opacity-50 cursor-not-allowed' : '')}
              title={stageChangePending && !stageRemark.trim() ? 'Add a reason for the stage change first' : ''}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
