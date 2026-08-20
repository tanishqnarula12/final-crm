// Fixed Deposits — track a maturing FD and whether the money comes back to us.
//
// Stored as a Task row (relatedTo: 'FD'). Selecting the "Invested With Us"
// stage reveals the Investment Amount field, which is then required.
import React, { useState, useMemo } from 'react';
import { inputCls, selectCls, Field, CoolSelect } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StageHistory } from './RecordShell';
import { btnPrimary, btnGhost } from '../UI';
import { REC, FD_STAGES, makeHistoryEntry, recordTaskName, stageBadgeCls } from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid } from '../../utils/calc';
import { canDo } from '../../utils/permissions';

export default function FixedDepositModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();

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
  const [stageRemark, setStageRemark] = useState('');
  const initialStage = record?.stage || FD_STAGES[0];

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const canEditDetails = !isEdit || canDo('cobr', 'editDetails', record);
  const canChangeStage = !isEdit || canDo('cobr', 'changeStage', record);
  const stageChanged = isEdit && stage !== initialStage;
  const investedWithUs = stage === 'Invested With Us';

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.bankName || !f.maturityDate || !f.maturityAmount || !f.assignedTo) return false;
    if (investedWithUs && !(Number(f.investmentAmount) > 0)) return false;
    if (stageChanged && !stageRemark.trim()) return false;
    return true;
  }, [f, investedWithUs, stageChanged, stageRemark]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    const comments = [...(record?.comments || [])];
    const stageHistory = [...(record?.stageHistory || [])];

    if (!isEdit) {
      comments.push({ at: now, by, text: `Fixed Deposit record created at stage "${stage}".` });
      stageHistory.push(makeHistoryEntry({ stage, action: stage, note: 'Record created', by }));
    } else if (stageChanged) {
      comments.push({ at: now, by, text: `Stage changed from ${initialStage} to ${stage} — ${stageRemark.trim()}` });
      stageHistory.push(makeHistoryEntry({
        stage,
        action: stage,
        note: stageRemark.trim(),
        settlementAmount: investedWithUs ? f.investmentAmount : undefined,
        by,
      }));
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
      stageHistory,
      comments,
      // The maturity date is what this record is really chasing.
      dueDate: f.maturityDate,
      subPerson: f.subPersons[0] || '',
      assignedBy: record?.assignedBy || me?.id || '',
      createdAt: record?.createdAt || now,
      updatedAt: now,
    });
  };

  return (
    <RecordModal
      title={isEdit ? `Fixed Deposit — ${f.applicant || 'Record'}` : 'New Fixed Deposit'}
      subtitle={isEdit ? `${f.bankName || '—'} · matures ${f.maturityDate || '—'}` : 'Track an FD through to maturity'}
      onClose={onClose}
      footer={(
        <>
          <span />
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Close</button>
            <button onClick={handleSave} disabled={!canSave} className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}>
              {isEdit ? 'Save Changes' : 'Create FD'}
            </button>
          </div>
        </>
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
          <fieldset disabled={!canEditDetails} className="contents">
            <input value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="e.g. HDFC Bank" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Starting Date">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="date" value={f.startingDate} onChange={(e) => set({ startingDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Maturity Date *">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="date" value={f.maturityDate} onChange={(e) => set({ maturityDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Maturity Amount *">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="number" min="0" value={f.maturityAmount} onChange={(e) => set({ maturityAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        {/* No date field here — the Maturity Date above IS this record's due date. */}
        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          showDate={false}
          onChange={set}
          disabled={!canEditDetails}
        />
      </div>

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <Field label="Status / Stage">
          <fieldset disabled={!canChangeStage} className="contents">
            <CoolSelect value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls + (!canChangeStage ? ' opacity-60 cursor-not-allowed' : '')}>
              {FD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        {investedWithUs && (
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

        {stageChanged && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 p-3">
            <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block mb-1.5">
              Reason for stage change ({initialStage} → {stage}) <span className="text-rose-500">*</span>
            </label>
            <input
              value={stageRemark}
              onChange={(e) => setStageRemark(e.target.value)}
              placeholder="Why is the stage changing? (required to save)"
              className={inputCls + ' text-xs py-2'}
            />
          </div>
        )}

        <AttachmentField
          label="Attachments"
          files={f.attachments}
          onChange={(files) => set({ attachments: files })}
          disabled={!canEditDetails}
        />
      </div>

      {isEdit && (
        <>
          <StageHistory history={record?.stageHistory || []} badgeCls={(s) => stageBadgeCls(REC.FD, s)} />
          <LogTimeline comments={record?.comments || []} />
        </>
      )}
    </RecordModal>
  );
}
