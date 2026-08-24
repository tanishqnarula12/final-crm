// Other Insurance Policies — a register of policies a client holds that sit
// outside the Renewals and Claims workflows (policies bought elsewhere,
// legacy policies, or ones simply being tracked for completeness).
//
// NOTE: no field/stage spec was supplied for this tab, so the shape below is
// a straightforward policy register modelled on the Renewals/Claims fields
// that were specified. Easy to adjust once the intended fields are confirmed.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// change the Stage regardless. Every stage transition captures its own
// reason immediately; every edited field is auto-logged into Comments & Logs
// as "Changed X: old -> new" on Save.
import React, { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StagePicker, ViewEditFooter } from './RecordShell';
import { btnPrimary, btnGhost } from '../UI';
import {
  REC, POLICY_STAGES, INSURANCE_TYPES, makeHistoryEntry, recordTaskName,
  useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

const FIELD_DEFS = [
  { key: 'insuranceType', label: 'Insurance Type' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'policyName', label: 'Policy Name' },
  { key: 'policyNumber', label: 'Policy Number' },
  { key: 'sumAssured', label: 'Sum Assured', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'premiumAmount', label: 'Premium Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'startDate', label: 'Start Date' },
  { key: 'dueDate', label: 'Next Due / Renewal Date' },
  { key: 'assignedTo', label: 'Assigned To', format: (v) => teamName(v) || '—' },
  { key: 'remarks', label: 'Remarks' },
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
    startDate: record?.startDate || '',
    dueDate: record?.dueDate || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
    remarks: record?.remarks || '',
  }));

  const [stage, setStage] = useState(record?.stage || POLICY_STAGES[0]);
  const [stageHistory, setStageHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);
  const [pendingStage, setPendingStage] = useState(null);
  const [stageRemark, setStageRemark] = useState('');

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const requestStageChange = (next) => {
    if (!isEdit) { setStage(next); return; }
    setPendingStage(next);
    setStageRemark('');
  };
  const cancelStageChange = () => { setPendingStage(null); setStageRemark(''); };
  const confirmStageChange = () => {
    if (!pendingStage || !stageRemark.trim()) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    setComments((c) => [...c, { at: now, by, text: `Stage changed from ${stage} to ${pendingStage} — ${stageRemark.trim()}` }]);
    setStageHistory((h) => [...h, makeHistoryEntry({ stage: pendingStage, action: pendingStage, note: stageRemark.trim(), by })]);
    setStage(pendingStage);
    cancelStageChange();
  };

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.insuranceType || !f.companyName || !f.assignedTo) return false;
    return true;
  }, [f]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    let hist = stageHistory;
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

    onSave({
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.POLICY,
      taskName: recordTaskName(REC.POLICY, f.applicant, f.policyName),
      ...f,
      stage,
      stageHistory: hist,
      comments: cmts,
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
      insuranceType: record.insuranceType || '', companyName: record.companyName || '', policyName: record.policyName || '', policyNumber: record.policyNumber || '',
      sumAssured: record.sumAssured || '', premiumAmount: record.premiumAmount || '', startDate: record.startDate || '', dueDate: record.dueDate || '',
      assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [], remarks: record.remarks || '',
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
          stageDirty={isEdit && stage !== record.stage}
          onEdit={() => setIsEditingMode(true)}
          onCancel={handleCancelEdit}
          onSave={handleSave}
          onClose={onClose}
          saveLabel={isEdit ? 'Save Changes' : 'Create Policy'}
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

        <Field label="Company Name *">
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

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <StagePicker type={REC.POLICY} stage={stage} onSelect={requestStageChange} disabled={!canChangeStageThis} />

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
                disabled={!stageRemark.trim()}
                className={btnPrimary + ' py-1.5 px-3 text-[10px]' + (!stageRemark.trim() ? ' opacity-50 cursor-not-allowed' : '')}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        <Field label="Remarks">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <textarea rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} className={inputCls + ' resize-y'} />
          </fieldset>
        </Field>

        <AttachmentField
          label="Policy Documents"
          files={f.attachments}
          onChange={(files) => set({ attachments: files })}
          disabled={!fieldsUnlocked}
        />
      </div>

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
