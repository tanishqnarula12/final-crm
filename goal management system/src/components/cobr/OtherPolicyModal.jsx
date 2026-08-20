// Other Insurance Policies — a register of policies a client holds that sit
// outside the Renewals and Claims workflows (policies bought elsewhere,
// legacy policies, or ones simply being tracked for completeness).
//
// NOTE: no field/stage spec was supplied for this tab, so the shape below is
// a straightforward policy register modelled on the Renewals/Claims fields
// that were specified. Easy to adjust once the intended fields are confirmed.
import React, { useState, useMemo } from 'react';
import { inputCls, selectCls, Field, CoolSelect } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StageHistory, StagePicker } from './RecordShell';
import { btnPrimary, btnGhost } from '../UI';
import { REC, POLICY_STAGES, INSURANCE_TYPES, makeHistoryEntry, recordTaskName, stageBadgeCls } from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid } from '../../utils/calc';
import { canDo } from '../../utils/permissions';

export default function OtherPolicyModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();

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
  const [stageRemark, setStageRemark] = useState('');
  const initialStage = record?.stage || POLICY_STAGES[0];

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const canEditDetails = !isEdit || canDo('cobr', 'editDetails', record);
  const canChangeStage = !isEdit || canDo('cobr', 'changeStage', record);
  const stageChanged = isEdit && stage !== initialStage;

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.insuranceType || !f.companyName || !f.assignedTo) return false;
    if (stageChanged && !stageRemark.trim()) return false;
    return true;
  }, [f, stageChanged, stageRemark]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    const comments = [...(record?.comments || [])];
    const stageHistory = [...(record?.stageHistory || [])];

    if (!isEdit) {
      comments.push({ at: now, by, text: `Policy record created at stage "${stage}".` });
      stageHistory.push(makeHistoryEntry({ stage, action: stage, note: 'Record created', by }));
    } else if (stageChanged) {
      comments.push({ at: now, by, text: `Stage changed from ${initialStage} to ${stage} — ${stageRemark.trim()}` });
      stageHistory.push(makeHistoryEntry({ stage, action: stage, note: stageRemark.trim(), by }));
    }

    onSave({
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.POLICY,
      taskName: recordTaskName(REC.POLICY, f.applicant, f.policyName),
      ...f,
      stage,
      stageHistory,
      comments,
      subPerson: f.subPersons[0] || '',
      assignedBy: record?.assignedBy || me?.id || '',
      createdAt: record?.createdAt || now,
      updatedAt: now,
    });
  };

  return (
    <RecordModal
      title={isEdit ? `Policy — ${f.applicant || 'Record'}` : 'New Insurance Policy'}
      subtitle={isEdit ? `${f.companyName || '—'} · ${f.policyNumber || 'No policy no.'}` : 'Record a policy held outside the renewal/claim flows'}
      onClose={onClose}
      footer={(
        <>
          <span />
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Close</button>
            <button onClick={handleSave} disabled={!canSave} className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}>
              {isEdit ? 'Save Changes' : 'Create Policy'}
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

        <Field label="Insurance Type *">
          <fieldset disabled={!canEditDetails} className="contents">
            <CoolSelect value={f.insuranceType} onChange={(e) => set({ insuranceType: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {INSURANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        <Field label="Company Name *">
          <fieldset disabled={!canEditDetails} className="contents">
            <input value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="e.g. HDFC Life" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Name">
          <fieldset disabled={!canEditDetails} className="contents">
            <input value={f.policyName} onChange={(e) => set({ policyName: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Number">
          <fieldset disabled={!canEditDetails} className="contents">
            <input value={f.policyNumber} onChange={(e) => set({ policyNumber: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Sum Assured">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="number" min="0" value={f.sumAssured} onChange={(e) => set({ sumAssured: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Premium Amount">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="number" min="0" value={f.premiumAmount} onChange={(e) => set({ premiumAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Start Date">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          dueDate={f.dueDate}
          dueLabel="Next Due / Renewal Date"
          onChange={set}
          disabled={!canEditDetails}
        />
      </div>

      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <StagePicker type={REC.POLICY} stage={stage} onSelect={setStage} disabled={!canChangeStage} />

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

        <Field label="Remarks">
          <fieldset disabled={!canEditDetails} className="contents">
            <textarea rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} className={inputCls + ' resize-y'} />
          </fieldset>
        </Field>

        <AttachmentField
          label="Policy Documents"
          files={f.attachments}
          onChange={(files) => set({ attachments: files })}
          disabled={!canEditDetails}
        />
      </div>

      {isEdit && (
        <>
          <StageHistory history={record?.stageHistory || []} badgeCls={(s) => stageBadgeCls(REC.POLICY, s)} />
          <LogTimeline comments={record?.comments || []} />
        </>
      )}
    </RecordModal>
  );
}
