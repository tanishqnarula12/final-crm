// Renewals — create/edit a policy-renewal follow-up.
//
// Stored as a Task row (relatedTo: 'RENEWAL'), so it rides the same save
// pipeline, RBAC engine and notifications as every other task. Stage changes
// require a reason (the Tasks/COBR convention) and are appended to an
// immutable stageHistory, never overwritten.
import React, { useState, useMemo } from 'react';
import { TrendingUp, Repeat } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StageHistory } from './RecordShell';
import { btnPrimary, btnGhost } from '../UI';
import {
  REC, RENEWAL_STAGES, INSURANCE_TYPES, renewalAttachmentsUnlocked,
  makeHistoryEntry, recordTaskName, stageBadgeCls,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid } from '../../utils/calc';
import { canDo } from '../../utils/permissions';

export default function RenewalModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();

  const [f, setF] = useState(() => ({
    groupLeaderId: record?.groupLeaderId || '',
    groupLeader: record?.groupLeader || '',
    applicant: record?.applicant || '',
    pan: record?.pan || '',
    insuranceType: record?.insuranceType || '',
    policyName: record?.policyName || '',
    policyNumber: record?.policyNumber || '',
    sumAssured: record?.sumAssured || '',
    premiumAmount: record?.premiumAmount || '',
    dueDate: record?.dueDate || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
    upSell: record?.upSell || false,
    upSellAmount: record?.upSellAmount || '',
    crossSell: record?.crossSell || false,
    crossSellCompany: record?.crossSellCompany || '',
    crossSellPolicy: record?.crossSellPolicy || '',
  }));

  const [stage, setStage] = useState(record?.stage || RENEWAL_STAGES[0]);
  const [stageRemark, setStageRemark] = useState('');
  const initialStage = record?.stage || RENEWAL_STAGES[0];

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const canEditDetails = !isEdit || canDo('cobr', 'editDetails', record);
  const canChangeStage = !isEdit || canDo('cobr', 'changeStage', record);
  const stageChanged = isEdit && stage !== initialStage;
  const attachUnlocked = renewalAttachmentsUnlocked(stage);

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.insuranceType || !f.premiumAmount || !f.dueDate || !f.assignedTo) return false;
    if (stageChanged && !stageRemark.trim()) return false;
    if (f.upSell && !f.upSellAmount) return false;
    if (f.crossSell && (!f.crossSellCompany || !f.crossSellPolicy)) return false;
    return true;
  }, [f, stageChanged, stageRemark]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';

    const comments = [...(record?.comments || [])];
    const stageHistory = [...(record?.stageHistory || [])];

    if (!isEdit) {
      comments.push({ at: now, by, text: `Renewal record created at stage "${stage}".` });
      stageHistory.push(makeHistoryEntry({ stage, action: stage, note: 'Record created', by }));
    } else if (stageChanged) {
      comments.push({ at: now, by, text: `Stage changed from ${initialStage} to ${stage} — ${stageRemark.trim()}` });
      stageHistory.push(makeHistoryEntry({ stage, action: stage, note: stageRemark.trim(), attachments: f.attachments, by }));
    }

    onSave({
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.RENEWAL,
      taskName: recordTaskName(REC.RENEWAL, f.applicant, f.policyName),
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
      title={isEdit ? `Renewal — ${f.applicant || 'Record'}` : 'New Renewal'}
      subtitle={isEdit ? `${f.policyNumber || 'No policy no.'} · ${f.pan || '—'}` : 'Track a policy renewal through to completion'}
      onClose={onClose}
      footer={(
        <>
          <span />
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Close</button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}
              title={stageChanged && !stageRemark.trim() ? 'Add a reason for the stage change first' : ''}
            >
              {isEdit ? 'Save Changes' : 'Create Renewal'}
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

        <Field label="Policy Name">
          <fieldset disabled={!canEditDetails} className="contents">
            <input value={f.policyName} onChange={(e) => set({ policyName: e.target.value })} placeholder="e.g. HDFC Click 2 Protect" className={inputCls} />
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

        <Field label="Premium Amount *">
          <fieldset disabled={!canEditDetails} className="contents">
            <input type="number" min="0" value={f.premiumAmount} onChange={(e) => set({ premiumAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          dueDate={f.dueDate}
          dueLabel="Due Date *"
          onChange={set}
          disabled={!canEditDetails}
        />
      </div>

      {/* Stage */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <Field label="Status / Stage">
          <fieldset disabled={!canChangeStage} className="contents">
            <CoolSelect value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls + (!canChangeStage ? ' opacity-60 cursor-not-allowed' : '')}>
              {RENEWAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

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
          label="Attachment"
          files={f.attachments}
          onChange={(files) => set({ attachments: files })}
          disabled={!attachUnlocked || !canEditDetails}
          lockedHint={`Attachments unlock once the stage reaches "Payment Done".`}
        />
      </div>

      {/* Up Sell / Cross Sell */}
      <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-4 space-y-3">
        <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opportunity</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canEditDetails}
            onClick={() => set({ upSell: !f.upSell })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              f.upSell
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
            }`}
          >
            <TrendingUp size={12} /> Up Sell
          </button>
          <button
            type="button"
            disabled={!canEditDetails}
            onClick={() => set({ crossSell: !f.crossSell })}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              f.crossSell
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
            }`}
          >
            <Repeat size={12} /> Cross Sell
          </button>
        </div>

        {(f.upSell || f.crossSell) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {f.upSell && (
              <Field label="Up Sell Amount *">
                <fieldset disabled={!canEditDetails} className="contents">
                  <input type="number" min="0" value={f.upSellAmount} onChange={(e) => set({ upSellAmount: e.target.value })} className={inputCls} />
                </fieldset>
              </Field>
            )}
            {f.crossSell && (
              <>
                <Field label="Cross Sell — Company Name *">
                  <fieldset disabled={!canEditDetails} className="contents">
                    <input value={f.crossSellCompany} onChange={(e) => set({ crossSellCompany: e.target.value })} className={inputCls} />
                  </fieldset>
                </Field>
                <Field label="Cross Sell — Policy Name *">
                  <fieldset disabled={!canEditDetails} className="contents">
                    <input value={f.crossSellPolicy} onChange={(e) => set({ crossSellPolicy: e.target.value })} className={inputCls} />
                  </fieldset>
                </Field>
              </>
            )}
          </div>
        )}
      </div>

      {isEdit && (
        <>
          <StageHistory history={record?.stageHistory || []} badgeCls={(s) => stageBadgeCls(REC.RENEWAL, s)} />
          <LogTimeline comments={record?.comments || []} />
        </>
      )}
    </RecordModal>
  );
}
