// Other Insurance Policies — a register of policies a client holds that sit
// outside the Renewals and Claims workflows (policies bought elsewhere,
// legacy policies, or ones simply being tracked for completeness).
//
// Workflow: Qualified -> Policy Working Done -> Shared With Client -> Waiting
// For Update, then one of three outcomes — Policy Surrendered / Policy
// Matured (each asking "Amount Received?" and branching to an Amount or a
// Reason field) or Policy Continued (asking for a Next Reminder Date, which
// auto-creates a follow-up Task). Status, Outcome and Amount Received are
// kept as separate saved fields rather than folded into one compound status
// string, so the table can show them as genuinely separate columns.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// drive the workflow (stage) regardless. Every edited field is auto-logged
// into Comments & Logs as "Changed X: old -> new" on Save; workflow
// transitions log themselves immediately on Confirm.
import React, { useState, useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, ViewEditFooter } from './RecordShell';
import {
  REC, INSURANCE_TYPES, policyActionsFor, policyIsClosed, makeHistoryEntry, recordTaskName,
  stageBadgeCls, STAGE_BTN_TONE, useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

const TONE_BTN = STAGE_BTN_TONE;

const FIELD_DEFS = [
  { key: 'insuranceType', label: 'Insurance Type' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'policyName', label: 'Policy Name' },
  { key: 'policyNumber', label: 'Policy Number' },
  { key: 'sumAssured', label: 'Sum Assured', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'premiumAmount', label: 'Premium Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'premiumPayingTerm', label: 'Premium Paying Term', format: (v) => (v ? `${v} yrs` : '—') },
  { key: 'policyTerm', label: 'Policy Term', format: (v) => (v ? `${v} yrs` : '—') },
  { key: 'startDate', label: 'Start Date' },
  { key: 'dueDate', label: 'Next Due / Renewal Date' },
  { key: 'assignedTo', label: 'Assigned To', format: (v) => teamName(v) || '—' },
];

export default function OtherPolicyModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();
  const { isEditingMode, setIsEditingMode, canEditThis, canChangeStageThis, fieldsUnlocked } = useEditGate('otherInsurancePolicies', record, isEdit);

  const [f, setF] = useState(() => ({
    groupLeaderId: record?.groupLeaderId || '',
    groupLeader: record?.groupLeader || '',
    applicant: record?.applicant || '',
    pan: record?.pan || '',
    insuranceType: record?.insuranceType || '',
    companyName: record?.companyName || '',
    policyName: record?.policyName || '',
    policyNumber: record?.policyNumber || '',
    sumAssured: record?.sumAssured || '',
    premiumAmount: record?.premiumAmount || '',
    premiumPayingTerm: record?.premiumPayingTerm || '',
    policyTerm: record?.policyTerm || '',
    startDate: record?.startDate || '',
    dueDate: record?.dueDate || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
  }));

  const [stage, setStage] = useState(record?.stage || 'Qualified');
  const [outcome, setOutcome] = useState(record?.outcome || '');
  const [amountReceived, setAmountReceived] = useState(record?.amountReceived || '');
  const [reasonNotReceived, setReasonNotReceived] = useState(record?.reasonNotReceived || '');
  const [nextReminderDate, setNextReminderDate] = useState(record?.nextReminderDate || '');
  const [history, setHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);

  // The transition being filled in, if any.
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [received, setReceived] = useState(null); // outcomeFlow: true/false, unset until chosen
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reminderDate, setReminderDate] = useState('');

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const closed = policyIsClosed(stage);
  const actions = canChangeStageThis && !closed ? policyActionsFor(stage) : [];
  const dirty = isEdit && (stage !== (record?.stage || '') || history.length !== (record?.stageHistory || []).length);

  const startAction = (a) => {
    setPending(a);
    setNote('');
    setReceived(null);
    setAmount('');
    setReason('');
    setReminderDate('');
  };
  const cancelAction = () => { setPending(null); setNote(''); setReceived(null); setAmount(''); setReason(''); setReminderDate(''); };

  const pendingReady = useMemo(() => {
    if (!pending) return false;
    if (pending.outcomeFlow) {
      if (received === null) return false;
      if (received && !(Number(amount) > 0)) return false;
      if (!received && !reason.trim()) return false;
    }
    if (pending.reminderFlow && !reminderDate) return false;
    return true;
  }, [pending, received, amount, reason, reminderDate]);

  const confirmAction = () => {
    if (!pending || !pendingReady) return;
    const by = me?.name || 'System';
    let outcomeLabel = '';
    let logExtra = '';
    if (pending.outcomeFlow) {
      outcomeLabel = received ? 'Amount Received' : 'Amount Not Received';
      logExtra = received ? ` | ${fmtINR(Number(amount) || 0)} received` : ` | Not received — ${reason.trim()}`;
    } else if (pending.reminderFlow) {
      outcomeLabel = 'Continued';
      logExtra = ` | Next reminder: ${reminderDate}`;
    }

    const entry = makeHistoryEntry({
      stage: pending.to,
      action: pending.label,
      note: note.trim(),
      settlementAmount: pending.outcomeFlow && received ? amount : undefined,
      by,
    });
    setHistory((h) => [...h, entry]);
    setComments((c) => [...c, {
      at: new Date().toISOString(),
      by,
      text: `${pending.label} — stage moved from ${stage} to ${pending.to}${logExtra}${note.trim() ? ` | ${note.trim()}` : ''}`,
    }]);

    setStage(pending.to);
    setOutcome(outcomeLabel);
    setAmountReceived(pending.outcomeFlow && received ? amount : '');
    setReasonNotReceived(pending.outcomeFlow && !received ? reason.trim() : '');
    setNextReminderDate(pending.reminderFlow ? reminderDate : '');
    cancelAction();
  };

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.insuranceType || !f.assignedTo) return false;
    return true;
  }, [f]);

  // Policy Continued means there's a future check-in to schedule — create it
  // as an ordinary follow-up Task the moment that outcome is actually saved,
  // guarded so re-saving the record afterwards (e.g. an unrelated field edit)
  // doesn't spawn duplicates.
  const followUpTaskIfNeeded = (savedPolicy) => {
    if (stage !== 'Policy Continued' || !nextReminderDate) return null;
    if (record?.nextReminderDate === nextReminderDate && record?.stage === 'Policy Continued') return null;
    const now = new Date().toISOString();
    return {
      id: uid(),
      relatedTo: 'Others',
      taskName: `Follow-up: ${f.applicant || 'Client'} — Insurance Policy Continued`,
      groupLeaderId: f.groupLeaderId,
      groupLeader: f.groupLeader,
      applicant: f.applicant,
      pan: f.pan,
      dueDate: nextReminderDate,
      assignedTo: f.assignedTo,
      stage: 'Open',
      comments: [{ at: now, by: me?.name || 'System', text: `Auto-created from Other Insurance Policy "${savedPolicy.policyName || savedPolicy.policyNumber || 'record'}" continuing at renewal.` }],
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    let hist = history;
    let cmts = comments;

    if (!isEdit) {
      cmts = [...cmts, { at: now, by, text: `Policy record created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Record created', by })];
    } else if (isEditingMode) {
      const changeLines = [
        ...buildFieldChangeLog(record, f, FIELD_DEFS),
        ...diffAttachmentLog(record?.attachments, f.attachments),
      ];
      if (changeLines.length) cmts = [...cmts, ...toLogComments(changeLines)];
    }

    const saved = {
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.POLICY,
      taskName: recordTaskName(REC.POLICY, f.applicant, f.policyName),
      ...f,
      stage,
      outcome,
      amountReceived,
      reasonNotReceived,
      nextReminderDate,
      stageHistory: hist,
      comments: cmts,
      subPerson: f.subPersons[0] || '',
      assignedBy: record?.assignedBy || me?.id || '',
      createdAt: record?.createdAt || now,
      updatedAt: now,
    };

    const followUp = followUpTaskIfNeeded(saved);
    // The follow-up rides the same Task pipeline but isn't the record this
    // modal edits — pass both through the one onSave call (rather than two
    // separate saves) so they land in a single persist, avoiding a race
    // between two overlapping saveTasks() network round-trips.
    onSave(followUp ? [saved, followUp] : saved);
  };

  const handleCancelEdit = () => {
    if (!isEdit) { onClose(); return; }
    setF({
      groupLeaderId: record.groupLeaderId || '', groupLeader: record.groupLeader || '', applicant: record.applicant || '', pan: record.pan || '',
      insuranceType: record.insuranceType || '', companyName: record.companyName || '', policyName: record.policyName || '', policyNumber: record.policyNumber || '',
      sumAssured: record.sumAssured || '', premiumAmount: record.premiumAmount || '', premiumPayingTerm: record.premiumPayingTerm || '', policyTerm: record.policyTerm || '',
      startDate: record.startDate || '', dueDate: record.dueDate || '',
      assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [],
    });
    setIsEditingMode(false);
  };

  return (
    <RecordModal
      title={isEdit ? `Policy — ${f.applicant || 'Record'}` : 'New Insurance Policy'}
      subtitle={isEdit ? `${f.companyName || '—'} · ${f.policyNumber || 'No policy no.'}` : 'Record a policy held outside the renewal/claim flows'}
      onClose={onClose}
      footer={(
        <ViewEditFooter
          isEditingMode={isEditingMode}
          canEditThis={canEditThis}
          canSave={canSave}
          stageDirty={dirty}
          onEdit={() => setIsEditingMode(true)}
          onCancel={handleCancelEdit}
          onSave={handleSave}
          onClose={onClose}
          saveLabel={isEdit ? 'Save Changes' : 'Create Policy'}
          extra={dirty ? (
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Workflow updated — Save to confirm.
            </span>
          ) : null}
        />
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ClientApplicantFields
          clients={clients}
          groupLeaderId={f.groupLeaderId}
          groupLeader={f.groupLeader}
          applicant={f.applicant}
          pan={f.pan}
          onChange={set}
          disabled={isEdit}
        />

        <Field label="Insurance Type *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <CoolSelect value={f.insuranceType} onChange={(e) => set({ insuranceType: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {INSURANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        <Field label="Company Name">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="e.g. HDFC Life" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Name">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.policyName} onChange={(e) => set({ policyName: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Number">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.policyNumber} onChange={(e) => set({ policyNumber: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Sum Assured">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.sumAssured} onChange={(e) => set({ sumAssured: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Premium Amount">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.premiumAmount} onChange={(e) => set({ premiumAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Premium Paying Term" hint="Years">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.premiumPayingTerm} onChange={(e) => set({ premiumPayingTerm: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Term" hint="Years">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.policyTerm} onChange={(e) => set({ policyTerm: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Start Date">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          dueDate={f.dueDate}
          dueLabel="Next Due / Renewal Date"
          onChange={set}
          disabled={!fieldsUnlocked}
        />
      </div>

      {/* Workflow */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Stage</span>
            <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${stageBadgeCls(REC.POLICY, stage)}`}>
              {stage}
            </span>
          </div>
          {closed && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <Lock size={12} /> Policy closed
            </span>
          )}
        </div>

        {!isEdit ? (
          <p className="text-[11px] text-slate-400 italic">
            The policy starts at “Qualified”. Create it first, then drive the workflow from here.
          </p>
        ) : closed ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Outcome</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{outcome || '—'}</p>
            </div>
            <div className={`rounded-xl border px-3 py-2.5 ${outcome === 'Amount Received' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Amount Received</p>
              <p className={`text-xs font-bold tabular-nums ${outcome === 'Amount Received' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}`}>
                {outcome === 'Amount Received' ? fmtINR(Number(amountReceived) || 0) : outcome === 'Amount Not Received' ? (reasonNotReceived || 'Not received') : outcome === 'Continued' ? `Next reminder ${nextReminderDate || '—'}` : '—'}
              </p>
            </div>
          </div>
        ) : !canChangeStageThis ? (
          <p className="text-[11px] text-slate-400 italic">You do not have permission to move this policy forward.</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-400">What happened next?</p>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => startAction(a)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${TONE_BTN[a.tone] || TONE_BTN.blue} ${pending?.key === a.key ? 'ring-2 ring-blue-500/30' : ''}`}
                >
                  {a.label} <ArrowRight size={11} />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Transition capture panel */}
        {pending && (
          <div className="rounded-xl border-2 border-blue-300 dark:border-blue-900/60 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-blue-500" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{pending.label}</p>
            </div>

            {pending.outcomeFlow && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  Amount Received? <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReceived(true)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${received === true ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceived(false)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${received === false ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'}`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {pending.outcomeFlow && received === true && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  Amount Received <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount received"
                  className={inputCls + ' text-xs py-2'}
                />
              </div>
            )}

            {pending.outcomeFlow && received === false && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  autoFocus
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why wasn't an amount received? (required)"
                  className={inputCls + ' text-xs py-2 resize-y'}
                />
              </div>
            )}

            {pending.reminderFlow && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  Next Reminder Date <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  type="date"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className={inputCls + ' text-xs py-2'}
                />
                <p className="text-[10px] text-slate-400 mt-1">A follow-up task will be created automatically for this date.</p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth recording…" className={inputCls + ' text-xs py-2'} />
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelAction} className={btnGhost + ' py-1.5 px-3 text-[10px]'}>Cancel</button>
              <button
                type="button"
                onClick={confirmAction}
                disabled={!pendingReady}
                className={btnPrimary + ' py-1.5 px-3 text-[10px]' + (!pendingReady ? ' opacity-50 cursor-not-allowed' : '')}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>

      <AttachmentField
        label="Policy Documents"
        files={f.attachments}
        onChange={(files) => set({ attachments: files })}
        disabled={!fieldsUnlocked}
      />

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
