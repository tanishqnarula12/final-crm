// Renewals — create/edit a policy-renewal follow-up.
//
// Stored as a Task row (relatedTo: 'RENEWAL'), so it rides the same save
// pipeline, RBAC engine and notifications as every other task. The funnel is
// strictly sequential (RENEWAL_ACTIONS) — the picker only ever offers the
// next stage (+ Close Lost), so a stage becomes available only once the one
// before it is done. Each transition captures its own reason and is appended
// immediately to an immutable stageHistory (mirroring Claim's pending/confirm
// pattern) — collapsing several clicks into one end-of-session diff would
// silently discard every intermediate step's reason.
import React, { useState, useMemo } from 'react';
import { TrendingUp, Repeat, Check } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StageHistory, StagePicker } from './RecordShell';
import {
  REC, RENEWAL_STAGES, RENEWAL_ACTIONS, RENEWAL_CLAIM_INSURANCE_TYPES,
  MOTOR_VEHICLE_TYPES, MOTOR_COVERAGE_TYPES, renewalAttachmentsUnlocked,
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
    motorVehicleType: record?.motorVehicleType || '',
    motorCoverageType: record?.motorCoverageType || '',
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
  const [stageHistory, setStageHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);

  // The stage awaiting a captured reason — nothing is applied to `stage`
  // until Confirm, so a stray click never silently commits an unexplained
  // transition. In create mode there's no history to explain yet, so
  // StagePicker sets `stage` directly instead of routing through this.
  const [pendingStage, setPendingStage] = useState(null);
  const [stageRemark, setStageRemark] = useState('');

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const canEditDetails = !isEdit || canDo('cobr', 'editDetails', record);
  const canChangeStage = !isEdit || canDo('cobr', 'changeStage', record);
  const attachUnlocked = renewalAttachmentsUnlocked(stage);

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
    setStageHistory((h) => [...h, makeHistoryEntry({ stage: pendingStage, action: pendingStage, note: stageRemark.trim(), attachments: f.attachments, by })]);
    setStage(pendingStage);
    cancelStageChange();
  };

  const canSave = useMemo(() => {
    if (!f.groupLeader || !f.applicant || !f.insuranceType || !f.premiumAmount || !f.dueDate || !f.assignedTo) return false;
    if (f.insuranceType === 'Motor' && (!f.motorVehicleType || !f.motorCoverageType)) return false;
    if (f.upSell && !f.upSellAmount) return false;
    if (f.crossSell && (!f.crossSellCompany || !f.crossSellPolicy)) return false;
    return true;
  }, [f]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';

    let hist = stageHistory;
    let cmts = comments;
    if (!isEdit) {
      cmts = [...cmts, { at: now, by, text: `Renewal record created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Record created', by })];
    }

    onSave({
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.RENEWAL,
      taskName: recordTaskName(REC.RENEWAL, f.applicant, f.policyName),
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
            <CoolSelect
              value={f.insuranceType}
              onChange={(e) => {
                const next = e.target.value;
                // Clear the Motor cascade the moment Insurance Type changes
                // away from Motor, so a stale vehicle/coverage never survives
                // hidden underneath an unrelated type.
                set(next === 'Motor' ? { insuranceType: next } : { insuranceType: next, motorVehicleType: '', motorCoverageType: '' });
              }}
              className={selectCls}
            >
              <option value="">Select…</option>
              {RENEWAL_CLAIM_INSURANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        {f.insuranceType === 'Motor' && (
          <Field label="Sub Type *" hint="Vehicle">
            <fieldset disabled={!canEditDetails} className="contents">
              <CoolSelect
                value={f.motorVehicleType}
                onChange={(e) => set({ motorVehicleType: e.target.value, motorCoverageType: '' })}
                className={selectCls}
              >
                <option value="">Select…</option>
                {MOTOR_VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </CoolSelect>
            </fieldset>
          </Field>
        )}

        {f.insuranceType === 'Motor' && f.motorVehicleType && (
          <Field label="Sub Type *" hint="Coverage">
            <fieldset disabled={!canEditDetails} className="contents">
              <CoolSelect value={f.motorCoverageType} onChange={(e) => set({ motorCoverageType: e.target.value })} className={selectCls}>
                <option value="">Select…</option>
                {MOTOR_COVERAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </CoolSelect>
            </fieldset>
          </Field>
        )}

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
        <StagePicker type={REC.RENEWAL} stage={stage} onSelect={requestStageChange} disabled={!canChangeStage} actions={RENEWAL_ACTIONS} />

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
          <StageHistory history={stageHistory} badgeCls={(s) => stageBadgeCls(REC.RENEWAL, s)} />
          <LogTimeline comments={comments} />
        </>
      )}
    </RecordModal>
  );
}
