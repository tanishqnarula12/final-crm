// Servicing → Other Assets: add / view / edit one asset.
//
// Group Leader → Applicant (only that group leader's own applicants, with the
// relation) → PAN (read-only, from the applicant master) → Category →
// Sub-Type → Current Asset Value, Created Date, Attachment, Remarks.
//
// Opens in View Mode once created (Edit / Delete in the footer, per the
// permission matrix), like every other Servicing register. Saving is blocked
// while a required field is empty, and when this applicant already has the
// chosen sub-type (one entry per applicant per sub-type — utils/otherAssets).
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Field, inputCls, selectCls, CoolSelect, btnPrimary, btnGhost } from '../UI';
import ClientApplicantFields from './ClientApplicantFields';
import AttachmentField from './AttachmentField';
import { RecordModal, LogTimeline, ViewEditFooter } from './RecordShell';
import {
  REC, recordTaskName, useEditGate, buildFieldChangeLog, diffAttachmentLog, toLogComments,
} from '../../utils/cobrModules';
import {
  ASSET_CATEGORIES, categoryLabel, subTypesFor, subTypeInfo, assetShortName, findDuplicateAsset, fmtRupees, fmtDmy, applicantsOf,
} from '../../utils/otherAssets';
import { getCurrentUser } from '../../utils/auth';
import { uid } from '../../utils/calc';
import { useBackLayer } from '../../utils/backNav';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Digits (and one decimal point) only; shown with Indian grouping.
const cleanAmount = (s) => {
  const t = String(s ?? '').replace(/[^\d.]/g, '');
  const [whole, ...rest] = t.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};
const groupIndian = (s) => {
  if (!s) return '';
  const [whole, frac] = String(s).split('.');
  const n = Number(whole || 0).toLocaleString('en-IN');
  return frac !== undefined ? `${n}.${frac}` : n;
};

const FIELD_DEFS = [
  { key: 'groupLeader', label: 'Group Leader' },
  { key: 'applicant', label: 'Applicant' },
  { key: 'assetCategory', label: 'Asset Category', format: (v) => (v ? categoryLabel(v) : '—') },
  { key: 'assetSubType', label: 'Asset Sub-Type' },
  { key: 'amount', label: 'Current Asset Value', format: (v) => fmtRupees(v) },
  { key: 'assetDate', label: 'Created Date', format: (v) => fmtDmy(v) },
  { key: 'remarks', label: 'Remarks' },
];

export default function OtherAssetModal({ record, startEditing = false, clients = [], onClose, onSave, onDelete, canDelete = false, onViewExisting }) {
  const isEdit = !!record;
  const me = getCurrentUser();
  const { isEditingMode, setIsEditingMode, canEditThis, fieldsUnlocked } = useEditGate('otherAssets', record, isEdit, startEditing);
  const initialForm = () => ({
    groupLeaderId: record?.groupLeaderId || '',
    groupLeader: record?.groupLeader || '',
    applicant: record?.applicant || '',
    pan: record?.pan || '',
    assetCategory: record?.assetCategory || '',
    assetSubType: record?.assetSubType || '',
    amount: record?.amount != null && record?.amount !== '' ? String(record.amount) : '',
    assetDate: record?.assetDate || todayIso(),
    attachments: record?.attachments || [],
    remarks: record?.remarks || '',
  });
  const [f, setF] = useState(initialForm);
  const [duplicate, setDuplicate] = useState(null);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const client = useMemo(
    () => clients.find((c) => c.id === f.groupLeaderId) || clients.find((c) => c.name === f.groupLeader) || null,
    [clients, f.groupLeaderId, f.groupLeader]
  );
  const relation = useMemo(
    () => applicantsOf(client).find((o) => o.name === f.applicant)?.relation || (isEdit && f.applicant === record?.applicant ? record?.applicantRelation || '' : ''),
    [client, f.applicant, isEdit, record]
  );
  const subTypes = subTypesFor(f.assetCategory);
  const info = subTypeInfo(f.assetCategory, f.assetSubType);
  const editable = !isEdit || fieldsUnlocked;

  // Every required field filled in (Attachment and Remarks are optional).
  const complete = !!(f.groupLeaderId && f.applicant && f.assetCategory && f.assetSubType && Number(f.amount) > 0 && f.assetDate);
  const attachmentsChanged = isEdit && (f.attachments || []).map((a) => a.id).join(',') !== (record?.attachments || []).map((a) => a.id).join(',');

  const handleSave = () => {
    if (!complete) return;
    const now = new Date().toISOString();
    const by = me?.name || 'System';
    const saved = {
      ...(record || {}),
      id: record?.id || uid(),
      relatedTo: REC.ASSET,
      taskName: recordTaskName(REC.ASSET, f.applicant, assetShortName(f.assetSubType)),
      groupLeaderId: f.groupLeaderId,
      groupLeader: f.groupLeader,
      applicant: f.applicant,
      applicantRelation: relation,
      pan: f.pan,
      assetCategory: f.assetCategory,
      assetSubType: f.assetSubType,
      // Kept for later: several holdings of one type (account / folio / demat
      // no.) are allowed once this is filled in — see utils/otherAssets.js.
      referenceNumber: record?.referenceNumber || '',
      amount: Number(f.amount),
      assetDate: f.assetDate,
      attachments: f.attachments,
      remarks: f.remarks.trim(),
      createdAt: record?.createdAt || now,
      updatedAt: now,
    };
    const dup = findDuplicateAsset(saved);
    if (dup) { setDuplicate(dup); return; }
    let comments = record?.comments || [];
    if (!isEdit) comments = [{ at: now, by, text: `Asset recorded: ${f.assetSubType} — ${fmtRupees(saved.amount)}` }];
    else {
      const lines = [...buildFieldChangeLog(record, saved, FIELD_DEFS), ...diffAttachmentLog(record?.attachments, f.attachments)];
      if (lines.length) comments = [...comments, ...toLogComments(lines)];
    }
    onSave({ ...saved, comments }, !isEdit);
  };

  const handleCancelEdit = () => {
    if (!isEdit) { onClose(); return; }
    setF(initialForm());
    setIsEditingMode(false);
  };

  return (
    <>
      <RecordModal
        title={isEdit ? `${assetShortName(record.assetSubType)} — ${record.applicant || 'Asset'}` : 'Add Asset'}
        subtitle={isEdit ? `${categoryLabel(record.assetCategory)} · ${record.groupLeader || '—'}` : 'Record an asset owned by an applicant'}
        onClose={onClose}
        maxWidth="max-w-2xl"
        footer={(
          <ViewEditFooter
            isEditingMode={isEditingMode}
            canEditThis={canEditThis}
            canSave={complete}
            stageDirty={!isEditingMode && attachmentsChanged}
            onEdit={() => setIsEditingMode(true)}
            onCancel={handleCancelEdit}
            onSave={handleSave}
            onClose={onClose}
            saveLabel={isEdit ? 'Save Changes' : 'Save Asset'}
            extra={isEdit && !isEditingMode && canDelete ? (
              <button type="button" onClick={() => onDelete && onDelete(record)} className={btnGhost + ' text-rose-600 dark:text-rose-400'}>
                <Trash2 size={13} /> Delete
              </button>
            ) : (!complete && isEditingMode ? (
              <span className="text-[11px] text-slate-400">Fill in every field marked *</span>
            ) : null)}
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
            disabled={!editable}
          />

          <Field label="Relation" hint="From the applicant master">
            <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
              {relation || '—'}
            </div>
          </Field>

          <Field label="Asset Category *">
            {editable ? (
              <CoolSelect
                searchable={false}
                value={f.assetCategory}
                onChange={(e) => { const v = e.target.value; if (v !== f.assetCategory) set({ assetCategory: v, assetSubType: '' }); }}
                placeholder="Select category…"
                className={selectCls}
              >
                <option value="">Select category…</option>
                {ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </CoolSelect>
            ) : (
              <div className={inputCls + ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed'}>{categoryLabel(f.assetCategory)}</div>
            )}
          </Field>

          <Field label="Asset Sub-Type *" hint={info?.hint || ''}>
            {editable ? (
              f.assetCategory ? (
                <CoolSelect
                  value={f.assetSubType}
                  onChange={(e) => set({ assetSubType: e.target.value })}
                  placeholder="Select sub-type…"
                  className={selectCls}
                >
                  <option value="">Select sub-type…</option>
                  {f.assetCategory === 'physical'
                    ? [...new Set(subTypes.map((s) => s.groupTitle))].map((g) => (
                      <optgroup key={g} label={g}>
                        {subTypes.filter((s) => s.groupTitle === g).map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                      </optgroup>
                    ))
                    : subTypes.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                </CoolSelect>
              ) : (
                <input disabled placeholder="Select a category first" className={inputCls + ' opacity-60 cursor-not-allowed'} />
              )
            ) : (
              <div className={inputCls + ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed'}>{f.assetSubType || '—'}</div>
            )}
          </Field>

          <Field label="Current Asset Value *" hint="The value today — update it whenever it changes">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 pointer-events-none">₹</span>
              <input
                inputMode="decimal"
                value={groupIndian(f.amount)}
                onChange={(e) => set({ amount: cleanAmount(e.target.value) })}
                disabled={!editable}
                placeholder="e.g. 8,00,000"
                className={inputCls + ' pl-8 tabular-nums' + (!editable ? ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed' : '')}
              />
            </div>
          </Field>

          <Field label="Created Date *" hint="Today by default — change it if needed">
            <input
              type="date"
              value={f.assetDate}
              onChange={(e) => set({ assetDate: e.target.value })}
              disabled={!editable}
              className={inputCls + (!editable ? ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed' : '')}
            />
          </Field>
        </div>

        <Field label="Remarks">
          <textarea
            rows={3}
            value={f.remarks}
            onChange={(e) => set({ remarks: e.target.value })}
            disabled={!editable}
            placeholder="Optional notes about this asset…"
            className={inputCls + ' resize-y' + (!editable ? ' bg-slate-50 dark:bg-slate-950 text-slate-500 cursor-not-allowed' : '')}
          />
        </Field>

        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/30 p-4">
          <AttachmentField
            label="Attachment"
            files={f.attachments}
            taskId={record?.id}
            onChange={(files) => set({ attachments: files })}
            disabled={isEdit ? !canEditThis : false}
            lockedHint={f.attachments.length ? '' : 'No documents attached.'}
            hint="Optional — e.g. a statement, certificate or valuation."
          />
        </div>

        {isEdit && <LogTimeline comments={record.comments || []} />}
      </RecordModal>

      {duplicate && (
        <AssetAlert
          title="Asset Already Exists"
          onClose={() => setDuplicate(null)}
          actions={(
            <>
              <button type="button" onClick={() => setDuplicate(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={() => { const d = duplicate; setDuplicate(null); onViewExisting && onViewExisting(d); }} className={btnPrimary}>View Existing Asset</button>
            </>
          )}
        >
          {isEdit
            ? `${f.applicant} already has a ${assetShortName(f.assetSubType)} asset.`
            : `${f.applicant} already has a ${assetShortName(f.assetSubType)} asset recorded. A duplicate ${assetShortName(f.assetSubType)} entry cannot be created for the same applicant.`}
        </AssetAlert>
      )}
    </>
  );
}

// Small alert / confirm card on top of everything (the Task-form look).
export function AssetAlert({ title, children, actions, onClose, tone = 'amber' }) {
  useBackLayer(true, onClose);
  const toneCls = tone === 'rose'
    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400';
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={onClose}>
      <div role="alertdialog" aria-label={title} className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start gap-3">
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toneCls}`}><AlertTriangle size={18} /></span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{children}</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex flex-wrap justify-end gap-2">
          {actions}
        </div>
      </div>
    </div>,
    document.body
  );
}
