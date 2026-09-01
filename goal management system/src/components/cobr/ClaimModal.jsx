// Claims — create/edit an insurance claim and drive it through its workflow.
//
// The workflow LOOPS: "Additional Document Required" can repeat any number of
// times, and the Ombudsman phase can re-deny repeatedly, so the available
// moves are read from a transition map (CLAIM_ACTIONS in utils/cobrModules.js)
// rather than a fixed linear stage list. Nothing is ever overwritten — every
// transition appends an immutable stageHistory entry carrying its own note,
// attachments and settlement amount.
//
// Opens in View Mode once created — only the assigner (Assigned By) can
// unlock full editing via the Edit button; Assigned By/Assigned To may still
// drive the workflow (stage) regardless — a separate right. Every edited
// field is auto-logged into Comments & Logs as "Changed X: old -> new" on
// Save; workflow transitions log themselves immediately on Confirm.
import React, { useState, useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { inputCls, selectCls, Field, CoolSelect, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, AssignmentFields, LogTimeline, ViewEditFooter } from './RecordShell';
import {
  REC, CLAIM_STAGES, CLAIM_TYPES, RENEWAL_CLAIM_INSURANCE_TYPES,
  MOTOR_VEHICLE_TYPES, MOTOR_COVERAGE_TYPES, claimActionsFor, claimIsClosed,
  claimSettledTotal, makeHistoryEntry, recordTaskName, stageBadgeCls, STAGE_BTN_TONE,
  useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { uid, fmtINR } from '../../utils/calc';
import { teamName } from '../../services/team';

// Shared with Renewal/FD/Policy's StagePicker (RecordShell.jsx) so every
// register's stage control uses the exact same button styling.
const TONE_BTN = STAGE_BTN_TONE;

const FIELD_DEFS = [
  { key: 'insuranceType', label: 'Insurance Type' },
  { key: 'motorVehicleType', label: 'Sub Type (Vehicle)' },
  { key: 'motorCoverageType', label: 'Sub Type (Coverage)' },
  { key: 'policyName', label: 'Policy Name' },
  { key: 'policyNumber', label: 'Policy Number' },
  { key: 'sumAssured', label: 'Sum Assured', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'claimType', label: 'Claim Type' },
  { key: 'claimAmount', label: 'Claim Amount', format: (v) => (v ? fmtINR(Number(v) || 0) : '—') },
  { key: 'dueDate', label: 'Target Date' },
  { key: 'assignedTo', label: 'Assigned To', format: (v) => teamName(v) || '—' },
];

export default function ClaimModal({ record, clients = [], onClose, onSave }) {
  const isEdit = !!record;
  const me = getCurrentUser();
  const { isEditingMode, setIsEditingMode, canEditThis, canChangeStageThis, fieldsUnlocked } = useEditGate('claims', record, isEdit);

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
    claimType: record?.claimType || '',
    claimAmount: record?.claimAmount || '',
    dueDate: record?.dueDate || '',
    assignedTo: record?.assignedTo || '',
    subPersons: record?.subPersons || [],
    attachments: record?.attachments || [],
  }));

  const [stage, setStage] = useState(record?.stage || CLAIM_STAGES[0]);
  const [history, setHistory] = useState(record?.stageHistory || []);
  const [comments, setComments] = useState(record?.comments || []);

  // The transition the user is currently filling in, if any.
  const [pending, setPending] = useState(null); // the action descriptor
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [files, setFiles] = useState([]);

  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const closed = claimIsClosed(stage);
  const actions = canChangeStageThis && !closed ? claimActionsFor(stage) : [];
  const settled = claimSettledTotal(history);
  const remaining = Math.max(0, (Number(f.claimAmount) || 0) - settled);
  const dirty = isEdit && (stage !== (record?.stage || '') || history.length !== (record?.stageHistory || []).length);

  const startAction = (a) => {
    setPending(a);
    setNote('');
    setAmount(a.autoAmount ? String(remaining) : '');
    setFiles([]);
  };
  const cancelAction = () => { setPending(null); setNote(''); setAmount(''); setFiles([]); };

  const pendingReady = useMemo(() => {
    if (!pending) return false;
    if (pending.requiresNote && !note.trim()) return false;
    if (pending.requiresAmount && !(Number(amount) > 0)) return false;
    if (pending.autoAmount && !(Number(amount) > 0)) return false;
    if (pending.requiresAttachment && files.length === 0) return false;
    return true;
  }, [pending, note, amount, files]);

  const confirmAction = () => {
    if (!pending || !pendingReady) return;
    const by = me?.name || 'System';
    const usesAmount = pending.requiresAmount || pending.autoAmount;
    const entry = makeHistoryEntry({
      stage: pending.to,
      action: pending.label,
      note: note.trim(),
      attachments: files,
      settlementAmount: usesAmount ? amount : undefined,
      by,
    });
    setHistory((h) => [...h, entry]);
    setComments((c) => [...c, {
      at: new Date().toISOString(),
      by,
      text: `${pending.label}${stage !== pending.to ? ` — stage moved from ${stage} to ${pending.to}` : ' — recorded (stage unchanged)'}${note.trim() ? ` | ${note.trim()}` : ''}${usesAmount ? ` | ${fmtINR(Number(amount) || 0)} ${pending.key === 'full' ? 'settled in full' : 'received'}` : ''}${files.length ? ` | Document(s) uploaded: ${files.map((fl) => fl.fileName).join(', ')}` : ''}`,
    }]);
    // Files captured for a transition also join the record's own attachment set
    // so the claim carries every document ever supplied against it.
    if (files.length) set({ attachments: [...(f.attachments || []), ...files] });
    setStage(pending.to);
    cancelAction();
  };

  const canSave = useMemo(() => {
    // Base required-field completeness is a CREATE-time guard only — see
    // OtherPolicyModal's canSave for why applying it to an edit as well
    // turned a legacy/imported record missing e.g. Assigned To into a
    // record nobody could ever save again, not even a pure stage confirm.
    if (!isEdit && (!f.groupLeader || !f.applicant || !f.insuranceType || !f.claimType || !f.claimAmount || !f.assignedTo)) return false;
    if (f.insuranceType === 'Motor' && (!f.motorVehicleType || !f.motorCoverageType)) return false;
    return true;
  }, [f, isEdit]);

  const handleSave = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    let hist = history;
    let cmts = comments;

    if (!isEdit) {
      cmts = [...cmts, { at: now, by, text: `Claim created at stage "${stage}".` }];
      hist = [...hist, makeHistoryEntry({ stage, action: stage, note: 'Claim record created', attachments: f.attachments, by })];
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
      relatedTo: REC.CLAIM,
      taskName: recordTaskName(REC.CLAIM, f.applicant, f.claimType),
      ...f,
      stage,
      settlementAmount: claimSettledTotal(hist),
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
      policyName: record.policyName || '', policyNumber: record.policyNumber || '', sumAssured: record.sumAssured || '',
      claimType: record.claimType || '', claimAmount: record.claimAmount || '', dueDate: record.dueDate || '',
      assignedTo: record.assignedTo || '', subPersons: record.subPersons || [], attachments: record.attachments || [],
    });
    setIsEditingMode(false);
  };

  return (
    <RecordModal
      title={isEdit ? `Claim — ${f.applicant || 'Record'}` : 'New Claim'}
      subtitle={isEdit ? `${f.claimType || '—'} · ${f.policyNumber || 'No policy no.'}` : 'Register a claim and track it through settlement'}
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
          saveLabel={isEdit ? 'Save Changes' : 'Create Claim'}
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
            <CoolSelect
              value={f.insuranceType}
              onChange={(e) => {
                const next = e.target.value;
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

        <Field label="Claim Type *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <CoolSelect value={f.claimType} onChange={(e) => set({ claimType: e.target.value })} className={selectCls}>
              <option value="">Select…</option>
              {CLAIM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </fieldset>
        </Field>

        <Field label="Claim Amount *">
          <fieldset disabled={!fieldsUnlocked} className="contents">
            <input type="number" min="0" value={f.claimAmount} onChange={(e) => set({ claimAmount: e.target.value })} className={inputCls} />
          </fieldset>
        </Field>

        <Field label="Settlement Amount" hint="Total received across all settlements">
          <div className={`w-full px-3.5 py-2.5 text-sm border rounded-xl font-bold tabular-nums ${
            stage === 'Claim Settled' && settled >= (Number(f.claimAmount) || 0) && settled > 0
              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
              : settled > 0
                ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
          }`}>
            {fmtINR(settled)}
          </div>
        </Field>

        <AssignmentFields
          assignedTo={f.assignedTo}
          subPersons={f.subPersons}
          dueDate={f.dueDate}
          dueLabel="Target Date"
          onChange={set}
          disabled={!fieldsUnlocked}
        />
      </div>

      {/* Workflow */}
      <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Stage</span>
            <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${stageBadgeCls(REC.CLAIM, stage)}`}>
              {stage}
            </span>
          </div>
          {closed && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
              <Lock size={12} /> Claim closed
            </span>
          )}
        </div>

        {!isEdit ? (
          <p className="text-[11px] text-slate-400 italic">
            The claim starts at “Qualified”. Create it first, then drive the workflow from here.
          </p>
        ) : closed ? (
          <p className="text-[11px] text-slate-400 italic">
            This claim reached a final outcome. Its full history is preserved below.
          </p>
        ) : !canChangeStageThis ? (
          <p className="text-[11px] text-slate-400 italic">You do not have permission to move this claim forward.</p>
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
              {pending.to !== stage && (
                <span className="text-[10px] text-slate-400">→ moves to “{pending.to}”</span>
              )}
            </div>

            {pending.requiresNote && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  {pending.noteLabel || 'Note'} <span className="text-rose-500">*</span>
                </label>
                <textarea
                  autoFocus
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Required — this is saved permanently in the claim history."
                  className={inputCls + ' text-xs py-2 resize-y'}
                />
              </div>
            )}

            {pending.autoAmount && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">{pending.amountLabel}</label>
                <div className="w-full px-3.5 py-2.5 text-sm border border-emerald-200 dark:border-emerald-900/50 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                  {fmtINR(Number(amount) || 0)}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Claim Amount {fmtINR(Number(f.claimAmount) || 0)}{settled > 0 ? ` minus ${fmtINR(settled)} already settled` : ''} — no manual entry needed.
                </p>
              </div>
            )}

            {pending.requiresAmount && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  {pending.amountLabel || 'Amount'} <span className="text-rose-500">*</span>
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
                {pending.key === 'partial' && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                    The claim returns to “Claim Submitted” so the remaining balance can continue.
                  </p>
                )}
              </div>
            )}

            {(pending.requiresAttachment || pending.showAttachment) && (
              <div>
                <AttachmentField
                  label={pending.attachmentLabel || (pending.requiresAttachment ? 'Upload the required documents *' : 'Upload document (optional)')}
                  files={files}
                  onChange={setFiles}
                  hint={pending.requiresAttachment ? 'At least one file is required for this step.' : 'Optional — attach now if you already have it.'}
                />
                {pending.requiresAttachment && files.length === 0 && (
                  <p className="text-[10px] text-rose-500 dark:text-rose-400 font-semibold mt-1.5">
                    {pending.attachmentMissingMsg || 'Please upload at least one document before continuing.'}
                  </p>
                )}
              </div>
            )}

            {!pending.requiresNote && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1.5">Note (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth recording…" className={inputCls + ' text-xs py-2'} />
              </div>
            )}

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

      {!isEdit && (
        <AttachmentField
          label="Documents Collected"
          files={f.attachments}
          onChange={(files2) => set({ attachments: files2 })}
          hint="Attach whatever has been collected so far (optional)."
        />
      )}

      {isEdit && <LogTimeline comments={comments} />}
    </RecordModal>
  );
}
