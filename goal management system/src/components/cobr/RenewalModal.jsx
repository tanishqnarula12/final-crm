// Renewals — create/edit a policy-renewal follow-up.
//
// Stored as a Task row (relatedTo: 'RENEWAL'), so it rides the same save
// pipeline, RBAC engine and notifications as every other task. The funnel is
// strictly sequential (RENEWAL_ACTIONS) — the picker only ever offers the
// next stage (+ Close Lost), so a stage becomes available only once the one
// before it is done. Each transition captures its own reason and is appended
// immediately to comments (mirroring Claim's pending/confirm pattern) —
// collapsing several clicks into one end-of-session diff would silently
// discard every intermediate step's reason.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// change the Stage regardless (a separate right). Every edited field is
// auto-logged into Comments & Logs as "Changed X: old -> new" on Save.
import React, { useState, useMemo } from 'react';
import { TrendingUp, Repeat, Check } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, StagePicker, ViewEditFooter } from './RecordShell';
import {
  REC, RENEWAL_STAGES, RENEWAL_ACTIONS, RENEWAL_CLAIM_INSURANCE_TYPES,
  MOTOR_VEHICLE_TYPES, MOTOR_COVERAGE_TYPES, MODE_OF_PAYMENT_OPTIONS, renewalAttachmentsUnlocked,
  makeHistoryEntry, recordTaskName,
  useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

const FIELD_DEFS = [
  { key: 'insuranceType', label: 'Insurance Type' },
  { key: 'motorVehicleType', label: 'Sub Type (Vehicle)' },
  { key: 'motorCoverageType', label: 'Sub Type (Coverage)' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'policyName', label: 'Policy Name' },
  { key: 'policyNumber', label: 'Policy Number' },
  { key: 'sumAssured', label: 'Sum Assured', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'premiumAmount', label: 'Premium Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'paymentLink', label: 'Payment Link' },
  { key: 'modeOfPayment', label: 'Mode of Payment' },
  { key: 'brokerCode', label: 'Broker Code' },
  { key: 'dueDate', label: 'Due Date' },
  { key: 'assignedTo', label: 'Assigned To', format: (v) => teamName(v) || '—' },
  { key: 'upSell', label: 'Up Sell', format: (v) => (v === 'true' || v === true ? 'Yes' : 'No') },
  { key: 'upSellAmount', label: 'Up Sell Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'crossSell', label: 'Cross Sell', format: (v) => (v === 'true' || v === true ? 'Yes' : 'No') },
  { key: 'crossSellCompany', label: 'Cross Sell Company' },
  { key: 'crossSellPolicy', label: 'Cross Sell Policy' },
  { key: 'crossSellAmount', label: 'Cross Sell Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
];

export default function RenewalModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();
  const { isEditingMode, setIsEditingMode, canEditThis, canChangeStageThis, fieldsUnlocked } = useEditGate('renewals', record, isEdit);

  const [f, setF] = useState(() => ({
    groupLeaderId: record?.groupLeaderId || '',
    groupLeader: record?.groupLeader || '',
    applicant: record?.applicant || '',
    pan: record?.pan || '',
    insuranceType: record?.insuranceType || '',
    motorVehicleType: record?.motorVehicleType || '',
    motorCoverageType: record?.motorCoverageType || '',
    companyName: record?.companyName || '',
    policyName: record?.policyName || '',
    policyNumber: record?.policyNumber || '',
    sumAssured: record?.sumAssured || '',
    premiumAmount: record?.premiumAmount || '',
    paymentLink: record?.paymentLink || '',
    modeOfPayment: record?.modeOfPayment || '',
    brokerCode: record?.brokerCode || '',
    dueDate: record?.dueDate || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
    upSell: record?.upSell || false,
    upSellAmount: record?.upSellAmount || '',
    crossSell: record?.crossSell || false,
    crossSellCompany: record?.crossSellCompany || '',
    crossSellPolicy: record?.crossSellPolicy || '',
    crossSellAmount: record?.crossSellAmount || '',
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
  // Files captured specifically for the Payment Done -> Policy Document
  // Upload transition, which requires its own attachment before it can be
  // confirmed — separate from the general Attachment section below (which
  // stays Edit-Mode-gated), since whoever is actually advancing the stage
  // (often the assignee, not the assigner) needs to supply the document at
  // that exact moment without needing full edit rights.
  const [transitionFiles, setTransitionFiles] = useState([]);

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const attachUnlocked = renewalAttachmentsUnlocked(stage);
  const requiresDocForPending = pendingStage === 'Policy Document Upload';

  // Up Sell / Cross Sell ride alongside whoever can move the stage forward
  // (not the assigner-only "Edit" gate) — the point is to capture an
  // opportunity the moment it comes up mid-workflow, without a detour
  // through general edit mode.
  const oppChanged = isEdit && (
    !!f.upSell !== !!record.upSell
    || String(f.upSellAmount || '') !== String(record.upSellAmount || '')
    || !!f.crossSell !== !!record.crossSell
    || String(f.crossSellCompany || '') !== String(record.crossSellCompany || '')
    || String(f.crossSellPolicy || '') !== String(record.crossSellPolicy || '')
    || String(f.crossSellAmount || '') !== String(record.crossSellAmount || '')
  );

  const requestStageChange = (next) => {
    if (!isEdit) { setStage(next); return; }
    setPendingStage(next);
    setStageRemark('');
    setTransitionFiles([]);
  };
  const cancelStageChange = () => { setPendingStage(null); setStageRemark(''); setTransitionFiles([]); };
  const confirmStageChange = () => {
    if (!pendingStage) return;
    if (requiresDocForPending && transitionFiles.length === 0) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    const mergedAttachments = transitionFiles.length ? [...(f.attachments || []), ...transitionFiles] : f.attachments;
    setComments((c) => [...c, {
      at: now, by,
      text: `Stage changed from ${stage} to ${pendingStage}${stageRemark.trim() ? ` — ${stageRemark.trim()}` : ''}${transitionFiles.length ? ` | Document(s) uploaded: ${transitionFiles.map((fl) => fl.fileName).join(', ')}` : ''}`,
    }]);
    setStageHistory((h) => [...h, makeHistoryEntry({ stage: pendingStage, action: pendingStage, note: stageRemark.trim(), attachments: mergedAttachments, by })]);
    if (transitionFiles.length) set({ attachments: mergedAttachments });
    setStage(pendingStage);
    cancelStageChange();
  };

  const canSave = useMemo(() => {
    // Base required-field completeness is a CREATE-time guard only — see
    // OtherPolicyModal's canSave for why applying it to an edit as well
    // turned a legacy/imported record missing e.g. Assigned To into a
    // record nobody could ever save again, not even a pure stage confirm.
    // The conditional checks below stay live on every edit too, since they
    // react to values the CURRENT session is actively setting (e.g. flipping
    // Insurance Type to Motor), not a pre-existing gap.
    if (!isEdit && (!f.groupLeader || !f.applicant || !f.insuranceType || !f.premiumAmount || !f.dueDate || !f.assignedTo)) return false;
    if (f.insuranceType === 'Motor' && (!f.motorVehicleType || !f.motorCoverageType)) return false;
    if (f.upSell && !f.upSellAmount) return false;
    if (f.crossSell && (!f.crossSellCompany || !f.crossSellPolicy || !f.crossSellAmount)) return false;
    return true;
  }, [f, isEdit]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';

    let hist = stageHistory;
    let cmts = comments;
    if (!isEdit) {
      cmts = [...cmts, { at: now, by, text: `Renewal record created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Record created', by })];
    } else {
      // Runs on every save, not just full Edit Mode — Up Sell/Cross Sell can
      // now be updated inline (gated on canChangeStageThis) without ever
      // entering Edit Mode, and that change still needs to be logged.
      // buildFieldChangeLog/diffAttachmentLog are no-ops when nothing in
      // their field set actually differs, so this is safe to always run.
      const changeLines = [
        ...buildFieldChangeLog(record, f, FIELD_DEFS),
        ...diffAttachmentLog(record?.attachments, f.attachments),
      ];
      if (changeLines.length) cmts = [...cmts, ...toLogComments(changeLines)];
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

  const handleCancelEdit = () => {
    if (!isEdit) { onClose(); return; }
    setF({
      groupLeaderId: record.groupLeaderId || '', groupLeader: record.groupLeader || '', applicant: record.applicant || '', pan: record.pan || '',
      insuranceType: record.insuranceType || '', motorVehicleType: record.motorVehicleType || '', motorCoverageType: record.motorCoverageType || '',
      companyName: record.companyName || '',
      policyName: record.policyName || '', policyNumber: record.policyNumber || '', sumAssured: record.sumAssured || '', premiumAmount: record.premiumAmount || '',
      paymentLink: record.paymentLink || '', modeOfPayment: record.modeOfPayment || '', brokerCode: record.brokerCode || '',
      dueDate: record.dueDate || '', assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [],
      upSell: record.upSell || false, upSellAmount: record.upSellAmount || '', crossSell: record.crossSell || false,
      crossSellCompany: record.crossSellCompany || '', crossSellPolicy: record.crossSellPolicy || '', crossSellAmount: record.crossSellAmount || '',
    });
    setIsEditingMode(false);
  };

  return (
    <RecordModal
      title={isEdit ? `Renewal — ${f.applicant || 'Record'}` : 'New Renewal'}
      subtitle={isEdit ? `${f.policyNumber || 'No policy no.'} · ${f.pan || '—'}` : 'Track a policy renewal through to completion'}
      onClose={onClose}
      footer={(
        <ViewEditFooter
          isEditingMode={isEditingMode}
          canEditThis={canEditThis}
          canSave={canSave}
          stageDirty={isEdit && (stage !== record.stage || oppChanged)}
          onEdit={() => setIsEditingMode(true)}
          onCancel={handleCancelEdit}
          onSave={handleSave}
          onClose={onClose}
          saveLabel={isEdit ? 'Save Changes' : 'Create Renewal'}
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
            <fieldset disabled={!fieldsUnlocked} className="contents">
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
            <fieldset disabled={!fieldsUnlocked} className="contents">
              <CoolSelect value={f.motorCoverageType} onChange={(e) => set({ motorCoverageType: e.target.value })} className={selectCls}>
                <option value="">Select…</option>
                {MOTOR_COVERAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </CoolSelect>
            </fieldset>
          </Field>
        )}

        <Field label="Company Name">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} placeholder="e.g. HDFC Life" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Policy Name">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.policyName} onChange={(e) => set({ policyName: e.target.value })} placeholder="e.g. HDFC Click 2 Protect" className={inputCls} />
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

        <Field label="Premium Amount *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.premiumAmount} onChange={(e) => set({ premiumAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Payment Link">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.paymentLink} onChange={(e) => set({ paymentLink: e.target.value })} placeholder="https://…" className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Mode of Payment">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <CoolSelect value={f.modeOfPayment} onChange={(e) => set({ modeOfPayment: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {MODE_OF_PAYMENT_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        <Field label="Broker Code">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input value={f.brokerCode} onChange={(e) => set({ brokerCode: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          dueDate={f.dueDate}
          dueLabel="Due Date *"
          onChange={set}
          disabled={!fieldsUnlocked}
        />
      </div>

      {/* Stage */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <StagePicker type={REC.RENEWAL} stage={stage} onSelect={requestStageChange} disabled={!canChangeStageThis} actions={RENEWAL_ACTIONS} />

        {pendingStage && (
          <div className="rounded-xl border-2 border-blue-300 dark:border-blue-900/60 bg-white dark:bg-slate-900 p-3 space-y-2">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Check size={12} className="text-blue-500" /> Reason for stage change ({stage} → {pendingStage})
            </label>
            <input
              autoFocus
              value={stageRemark}
              onChange={(e) => setStageRemark(e.target.value)}
              placeholder="Why is the stage changing? (optional)"
              className={inputCls + ' text-xs py-2'}
            />

            {requiresDocForPending && (
              <div className="pt-1">
                <AttachmentField
                  label="Upload Policy Document — Required"
                  files={transitionFiles}
                  onChange={setTransitionFiles}
                  hint="The policy document must be attached before this stage can be confirmed."
                />
                {transitionFiles.length === 0 && (
                  <p className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold mt-1.5">
                    Please upload the policy document before moving to Policy Document Uploaded.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={cancelStageChange} className={btnGhost + ' py-1.5 px-3 text-[10px]'}>Cancel</button>
              <button
                type="button"
                onClick={confirmStageChange}
                disabled={requiresDocForPending && transitionFiles.length === 0}
                className={btnPrimary + ' py-1.5 px-3 text-[10px]' + (requiresDocForPending && transitionFiles.length === 0 ? ' opacity-50 cursor-not-allowed' : '')}
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
          disabled={!attachUnlocked || !fieldsUnlocked}
          lockedHint={!attachUnlocked ? 'Attachments unlock once the stage reaches "Payment Done".' : 'Click Edit to add an attachment.'}
        />
      </div>

      {/* Up Sell / Cross Sell — available to whoever can move the stage
          forward (assigner or assignee), not just in full Edit Mode, so an
          opportunity can be captured the moment it comes up. */}
      <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-4 space-y-3">
        <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Opportunity</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canChangeStageThis}
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
            disabled={!canChangeStageThis}
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
                <fieldset disabled={!canChangeStageThis} className="contents">
                  <input type="number" min="0" value={f.upSellAmount} onChange={(e) => set({ upSellAmount: e.target.value })} className={inputCls} />
                </fieldset>
              </Field>
            )}
            {f.crossSell && (
              <>
                <Field label="Cross Sell — Company Name *">
                  <fieldset disabled={!canChangeStageThis} className="contents">
                    <input value={f.crossSellCompany} onChange={(e) => set({ crossSellCompany: e.target.value })} className={inputCls} />
                  </fieldset>
                </Field>
                <Field label="Cross Sell — Policy Name *">
                  <fieldset disabled={!canChangeStageThis} className="contents">
                    <input value={f.crossSellPolicy} onChange={(e) => set({ crossSellPolicy: e.target.value })} className={inputCls} />
                  </fieldset>
                </Field>
                <Field label="Cross Sell — Amount *">
                  <fieldset disabled={!canChangeStageThis} className="contents">
                    <input type="number" min="0" value={f.crossSellAmount} onChange={(e) => set({ crossSellAmount: e.target.value })} className={inputCls} />
                  </fieldset>
                </Field>
              </>
            )}
          </div>
        )}
      </div>

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
