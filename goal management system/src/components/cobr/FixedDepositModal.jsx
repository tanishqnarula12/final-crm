// Fixed Deposits — track a maturing FD through to one of two outcomes: the
// client renews it themselves (which schedules a follow-up reminder — see
// reminderFlow below) or the money comes to us as an investment.
//
// Workflow: Qualified -> WhatsApp Link Sent -> Waiting for Update, then one
// of two outcomes — FD Renewed (asks for a Next Reminder Date, which
// auto-creates a follow-up Task, same as Policy Continued) or Invested With
// Us (requires the Investment Amount, shown in the FD table). Same
// action-button + transition-map architecture as Claims/Policies.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// drive the workflow (stage) AND attach documents regardless — attachments
// aren't gated behind full Edit Mode, same as every other COBR-workspace
// register. Every edited field is auto-logged into Comments & Logs as
// "Changed X: old -> new" on Save (this now runs on every save, not just
// full Edit Mode, so an attachment added outside Edit Mode still gets
// logged); workflow transitions log themselves immediately on Confirm.
import React, { useState, useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { inputCls, Field, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, ViewEditFooter } from './RecordShell';
import {
  REC, fdActionsFor, fdIsClosed, makeHistoryEntry, recordTaskName,
  stageBadgeCls, STAGE_BTN_TONE, useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

const TONE_BTN = STAGE_BTN_TONE;

const FIELD_DEFS = [
  { key: 'bankName', label: 'Bank Name' },
  { key: 'startingDate', label: 'Starting Date' },
  { key: 'maturityDate', label: 'Maturity Date' },
  { key: 'maturityAmount', label: 'Maturity Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'assignedTo', label: 'Assigned To', format: (v) => teamName(v) || '—' },
];

export default function FixedDepositModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();
  const { isEditingMode, setIsEditingMode, canEditThis, canChangeStageThis, fieldsUnlocked } = useEditGate('fixedDeposits', record, isEdit);

  const [f, setF] = useState(() => ({
    groupLeaderId: record?.groupLeaderId || '',
    groupLeader: record?.groupLeader || '',
    applicant: record?.applicant || '',
    pan: record?.pan || '',
    bankName: record?.bankName || '',
    startingDate: record?.startingDate || '',
    maturityDate: record?.maturityDate || '',
    maturityAmount: record?.maturityAmount || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
  }));

  const [stage, setStage] = useState(record?.stage || 'Qualified');
  const [investmentAmount, setInvestmentAmount] = useState(record?.investmentAmount || '');
  const [nextReminderDate, setNextReminderDate] = useState(record?.nextReminderDate || '');
  const [history, setHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);

  // The transition being filled in, if any.
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [reminderDate, setReminderDate] = useState('');

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const closed = fdIsClosed(stage);
  const actions = canChangeStageThis && !closed ? fdActionsFor(stage) : [];
  const idsOf = (arr) => (arr || []).map((a) => a.id).sort().join(',');
  const attachmentsChanged = isEdit && idsOf(f.attachments) !== idsOf(record?.attachments);
  const dirty = isEdit && (stage !== (record?.stage || '') || history.length !== (record?.stageHistory || []).length || attachmentsChanged);

  const startAction = (a) => { setPending(a); setNote(''); setAmount(''); setReminderDate(''); };
  const cancelAction = () => { setPending(null); setNote(''); setAmount(''); setReminderDate(''); };

  const pendingReady = useMemo(() => {
    if (!pending) return false;
    if (pending.requiresAmount && !(Number(amount) > 0)) return false;
    if (pending.reminderFlow && !reminderDate) return false;
    return true;
  }, [pending, amount, reminderDate]);

  const confirmAction = () => {
    if (!pending || !pendingReady) return;
    const by = me?.name || 'System';
    const entry = makeHistoryEntry({
      stage: pending.to,
      action: pending.label,
      note: note.trim(),
      settlementAmount: pending.requiresAmount ? amount : undefined,
      by,
    });
    setHistory((h) => [...h, entry]);
    setComments((c) => [...c, {
      at: new Date().toISOString(),
      by,
      text: `${pending.label} — stage moved from ${stage} to ${pending.to}${pending.requiresAmount ? ` | ${fmtINR(Number(amount) || 0)} invested with us` : ''}${pending.reminderFlow ? ` | Next reminder: ${reminderDate}` : ''}${note.trim() ? ` | ${note.trim()}` : ''}`,
    }]);
    setStage(pending.to);
    if (pending.requiresAmount) setInvestmentAmount(amount);
    if (pending.reminderFlow) setNextReminderDate(reminderDate);
    cancelAction();
  };

  const canSave = useMemo(() => {
    // Required-field completeness is a CREATE-time guard only — see
    // OtherPolicyModal's canSave for why applying it to an edit as well
    // turned a legacy/imported record missing e.g. Assigned To into a
    // record nobody could ever save again, not even a pure stage confirm.
    if (!isEdit && (!f.groupLeader || !f.applicant || !f.bankName || !f.maturityDate || !f.maturityAmount || !f.assignedTo)) return false;
    return true;
  }, [f, isEdit]);

  // FD Renewed means there's a future check-in to schedule — create it as an
  // ordinary follow-up Task the moment that outcome is actually saved,
  // guarded so re-saving the record afterwards (e.g. an unrelated field
  // edit) doesn't spawn duplicates. Mirrors OtherPolicyModal's Policy
  // Continued follow-up exactly.
  const followUpTaskIfNeeded = (savedFd) => {
    if (stage !== 'FD Renewed' || !nextReminderDate) return null;
    if (record?.nextReminderDate === nextReminderDate && record?.stage === 'FD Renewed') return null;
    const now = new Date().toISOString();
    return {
      id: uid(),
      relatedTo: 'Others',
      taskName: `Follow-up: ${f.applicant || 'Client'} — FD Renewed`,
      groupLeaderId: f.groupLeaderId,
      groupLeader: f.groupLeader,
      applicant: f.applicant,
      pan: f.pan,
      dueDate: nextReminderDate,
      assignedTo: f.assignedTo,
      stage: 'Open',
      comments: [{ at: now, by: me?.name || 'System', text: `Auto-created from Fixed Deposit "${savedFd.bankName || 'record'}" being renewed by the client.` }],
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
      cmts = [...cmts, { at: now, by, text: `Fixed Deposit record created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Record created', by })];
    } else {
      // Runs on every save, not just full Edit Mode — attachments (and any
      // sub-form field) can now change outside Edit Mode too, and that
      // change still needs to be logged. buildFieldChangeLog/diffAttachmentLog
      // are no-ops when nothing in their field set actually differs.
      const changeLines = [
        ...buildFieldChangeLog(record, f, FIELD_DEFS),
        ...diffAttachmentLog(record?.attachments, f.attachments),
      ];
      if (changeLines.length) cmts = [...cmts, ...toLogComments(changeLines)];
    }

    const saved = {
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.FD,
      taskName: recordTaskName(REC.FD, f.applicant, f.bankName),
      ...f,
      stage,
      // Only meaningful once that specific outcome actually happened.
      investmentAmount: stage === 'Invested With Us' ? investmentAmount : '',
      nextReminderDate: stage === 'FD Renewed' ? nextReminderDate : '',
      stageHistory: hist,
      comments: cmts,
      // The maturity date is what this record is really chasing.
      dueDate: f.maturityDate,
      subPerson: f.subPersons[0] || '',
      assignedBy: record?.assignedBy || me?.id || '',
      createdAt: record?.createdAt || now,
      updatedAt: now,
    };

    const followUp = followUpTaskIfNeeded(saved);
    // Both land in one persist (rather than two separate saveTasks() calls)
    // to avoid a race between overlapping network round-trips — see
    // App.jsx's handleSaveWorkspaceRecord, which already accepts an array.
    onSave(followUp ? [saved, followUp] : saved);
  };

  const handleCancelEdit = () => {
    if (!isEdit) { onClose(); return; }
    setF({
      groupLeaderId: record.groupLeaderId || '', groupLeader: record.groupLeader || '', applicant: record.applicant || '', pan: record.pan || '',
      bankName: record.bankName || '', startingDate: record.startingDate || '', maturityDate: record.maturityDate || '', maturityAmount: record.maturityAmount || '',
      assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [],
    });
    setIsEditingMode(false);
  };

  return (
    <RecordModal
      title={isEdit ? `Fixed Deposit — ${f.applicant || 'Record'}` : 'New Fixed Deposit'}
      subtitle={isEdit ? `${f.bankName || '—'} · matures ${f.maturityDate || '—'}` : 'Track an FD through to maturity'}
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
          saveLabel={isEdit ? 'Save Changes' : 'Create FD'}
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

        <Field label="Bank Name *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="e.g. HDFC Bank" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Starting Date">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="date" value={f.startingDate} onChange={(e) => set({ startingDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Maturity Date *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="date" value={f.maturityDate} onChange={(e) => set({ maturityDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Maturity Amount *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.maturityAmount} onChange={(e) => set({ maturityAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        {/* No date field here — the Maturity Date above IS this record's due date. */}
        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          showDate={false}
          onChange={set}
          disabled={!fieldsUnlocked}
        />
      </div>

      {/* Workflow */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Stage</span>
            <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${stageBadgeCls(REC.FD, stage)}`}>
              {stage}
            </span>
          </div>
          {closed && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <Lock size={12} /> FD closed
            </span>
          )}
        </div>

        {!isEdit ? (
          <p className="text-[11px] text-slate-400 italic">
            The FD starts at “Qualified”. Create it first, then drive the workflow from here.
          </p>
        ) : closed ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {stage === 'Invested With Us' ? 'Investment Amount' : 'Next Reminder'}
            </p>
            <p className={`text-xs font-bold tabular-nums ${stage === 'Invested With Us' ? 'text-violet-700 dark:text-violet-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {stage === 'Invested With Us' ? fmtINR(Number(investmentAmount) || 0) : (nextReminderDate || 'No reminder set')}
            </p>
          </div>
        ) : !canChangeStageThis ? (
          <p className="text-[11px] text-slate-400 italic">You do not have permission to move this FD forward.</p>
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

            {pending.requiresAmount && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  {pending.amountLabel} <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="How much was invested with us"
                  className={inputCls + ' text-xs py-2'}
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

        <AttachmentField
          label="Attachments"
          files={f.attachments}
          onChange={(files) => set({ attachments: files })}
          disabled={!canChangeStageThis}
          lockedHint="You do not have permission to add attachments to this FD."
        />
      </div>

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
