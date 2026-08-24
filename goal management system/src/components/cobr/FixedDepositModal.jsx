// Fixed Deposits — track a maturing FD and whether the money comes back to us.
//
// Stored as a Task row (relatedTo: 'FD'). Selecting the "Invested With Us"
// stage reveals the Investment Amount field, which is then required.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// change the Stage regardless. Every stage transition captures its own
// reason immediately (so clicking through several stages in one sitting
// keeps each one's reason, not just the last); every edited field is
// auto-logged into Comments & Logs as "Changed X: old -> new" on Save.
import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { inputCls, Field } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StagePicker, ViewEditFooter } from './RecordShell';
import { btnPrimary, btnGhost } from '../UI';
import {
  REC, FD_STAGES, makeHistoryEntry, recordTaskName,
  useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

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
    investmentAmount: record?.investmentAmount || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
  }));

  const [stage, setStage] = useState(record?.stage || FD_STAGES[0]);
  const [stageHistory, setStageHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);
  const [pendingStage, setPendingStage] = useState(null);
  const [stageRemark, setStageRemark] = useState('');

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const investedWithUs = stage === 'Invested With Us';

  const requestStageChange = (next) => {
    if (!isEdit) { setStage(next); return; }
    setPendingStage(next);
    setStageRemark('');
  };
  const cancelStageChange = () => { setPendingStage(null); setStageRemark(''); };
  const confirmStageChange = () => {
    if (!pendingStage || !stageRemark.trim()) return;
    if (pendingStage === 'Invested With Us' && !(Number(f.investmentAmount) > 0)) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    setComments((c) => [...c, { at: now, by, text: `Stage changed from ${stage} to ${pendingStage} — ${stageRemark.trim()}` }]);
    setStageHistory((h) => [...h, makeHistoryEntry({
      stage: pendingStage, action: pendingStage, note: stageRemark.trim(),
      settlementAmount: pendingStage === 'Invested With Us' ? f.investmentAmount : undefined,
      by,
    })]);
    setStage(pendingStage);
    cancelStageChange();
  };

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.bankName || !f.maturityDate || !f.maturityAmount || !f.assignedTo) return false;
    if (investedWithUs && !(Number(f.investmentAmount) > 0)) return false;
    return true;
  }, [f, investedWithUs]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    let hist = stageHistory;
    let cmts = comments;

    if (!isEdit) {
      cmts = [...cmts, { at: now, by, text: `Fixed Deposit record created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Record created', by })];
    } else if (isEditingMode) {
      const changeLines = [
        ...buildFieldChangeLog(record, f, FIELD_DEFS),
        ...diffAttachmentLog(record?.attachments, f.attachments),
      ];
      if (changeLines.length) cmts = [...cmts, ...toLogComments(changeLines)];
    }

    onSave({
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.FD,
      taskName: recordTaskName(REC.FD, f.applicant, f.bankName),
      ...f,
      // Only meaningful once the money actually came to us.
      investmentAmount: investedWithUs ? f.investmentAmount : '',
      stage,
      stageHistory: hist,
      comments: cmts,
      // The maturity date is what this record is really chasing.
      dueDate: f.maturityDate,
      subPerson: f.subPersons[0] || '',
      assignedBy: record?.assignedBy || me?.id || '',
      createdAt: record?.createdAt || now,
      updatedAt: now,
    });
  };

  const handleCancelEdit = () => {
    if (!isEdit) { onClose(); return; }
    setF({
      groupLeaderId: record.groupLeaderId || '', groupLeader: record.groupLeader || '', applicant: record.applicant || '', pan: record.pan || '',
      bankName: record.bankName || '', startingDate: record.startingDate || '', maturityDate: record.maturityDate || '', maturityAmount: record.maturityAmount || '',
      investmentAmount: record.investmentAmount || '', assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [],
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
          stageDirty={isEdit && stage !== record.stage}
          onEdit={() => setIsEditingMode(true)}
          onCancel={handleCancelEdit}
          onSave={handleSave}
          onClose={onClose}
          saveLabel={isEdit ? 'Save Changes' : 'Create FD'}
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

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <StagePicker type={REC.FD} stage={stage} onSelect={requestStageChange} disabled={!canChangeStageThis} />

        {pendingStage === 'Invested With Us' && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/10 p-3">
            <label className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block mb-1.5">
              Investment Amount <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={f.investmentAmount}
              onChange={(e) => set({ investmentAmount: e.target.value })}
              placeholder="How much was invested with us"
              className={inputCls + ' text-xs py-2'}
            />
          </div>
        )}

        {pendingStage && (
          <div className="rounded-xl border-2 border-blue-300 dark:border-blue-900/60 bg-white dark:bg-slate-900 p-3 space-y-2">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Check size={12} className="text-blue-500" /> Reason for stage change ({stage} → {pendingStage}) <span className="text-rose-500">*</span>
            </label>
            <input
              autoFocus
              value={stageRemark}
              onChange={(e) => setStageRemark(e.target.value)}
              placeholder="Why is the stage changing? (required)"
              className={inputCls + ' text-xs py-2'}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelStageChange} className={btnGhost + ' py-1.5 px-3 text-[10px]'}>Cancel</button>
              <button
                type="button"
                onClick={confirmStageChange}
                disabled={!stageRemark.trim() || (pendingStage === 'Invested With Us' && !(Number(f.investmentAmount) > 0))}
                className={btnPrimary + ' py-1.5 px-3 text-[10px]' + (!stageRemark.trim() ? ' opacity-50 cursor-not-allowed' : '')}
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
          disabled={!fieldsUnlocked}
        />
      </div>

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
