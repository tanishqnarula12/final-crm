// COBR workspace — five registers: COBR (Change of Broker), Renewals, Claim,
// Fixed Deposit and Other Insurance Policies. Since 1 Oct 2026 they are split
// across two sidebar modules (`section`): Servicing (COBR, Fixed Deposit,
// Other Insurance Policies) and Renewals & Claims. Same records, editors and
// permissions either way — only which tabs a module shows differs.
//
// Every record in every tab IS a Task row, distinguished by `relatedTo`
// (see utils/cobrModules.js) — same sync/save pipeline as the Tasks module
// (tasksChangeCounter bump on save), just specialized lists + editors.
//
// The COBR tab's behaviour is deliberately unchanged from before the other
// four tabs existed.
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, ArrowLeftRight, RefreshCw, ShieldAlert, Landmark, FileCheck2, Gem, CheckCircle2, FileSpreadsheet, ShieldCheck, X } from 'lucide-react';
import { Card, btnPrimary, btnGhost, selectCls, inputCls, CoolSelect, PageTitle, Field, FilterToggle, FilterPanel, ActiveFilterChips } from './UI';
import { loadTasks, saveTasks, loadOtherAssets, saveOtherAssets } from '../utils/tasks';
import { assetShortName, fmtRupees } from '../utils/otherAssets';
import OtherAssetsTab from './cobr/OtherAssetsTab';
import OtherAssetModal, { AssetAlert } from './cobr/OtherAssetModal';
import { COBR_STAGES, cobrTotals, isCobrTask } from '../utils/cobr';
import {
  REC, RENEWAL_STAGES, CLAIM_STAGES, FD_STAGES, POLICY_STAGES,
  isRenewal, isClaim, isFd, isPolicy, isOpenStage, claimSettlementDisplay, COBR_EXCEL_SPEC, stageReachedAt,
  WORKSPACE_SECTIONS, workspaceSectionOf,
} from '../utils/cobrModules';
import { teamName } from '../services/team';
import { fmtINR } from '../utils/calc';
import { canDo } from '../utils/permissions';
import { confirmDelete, filesNote } from '../utils/confirmDelete';
import RecordTable from './cobr/RecordTable';
import RenewalModal from './cobr/RenewalModal';
import ClaimModal from './cobr/ClaimModal';
import FixedDepositModal from './cobr/FixedDepositModal';
import OtherPolicyModal from './cobr/OtherPolicyModal';

const STAGE_THEME = {
  Open: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'In Process': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
};

const TABS = [
  { id: REC.ASSET, label: 'Other Assets', icon: Gem },
  { id: REC.COBR, label: 'COBR', icon: ArrowLeftRight },
  { id: REC.RENEWAL, label: 'Renewals', icon: RefreshCw },
  { id: REC.CLAIM, label: 'Claim', icon: ShieldAlert },
  { id: REC.FD, label: 'Fixed Deposit', icon: Landmark },
  { id: REC.POLICY, label: 'Other Insurance Policies', icon: FileCheck2 },
];

// What each tab tracks — shown under the module title.
const TAB_DESCRIPTION = {
  [REC.COBR]: 'Change of Broker (COBR) requests — tracked as tasks, with a per-scheme checklist.',
  [REC.RENEWAL]: 'Policy renewals — from the first WhatsApp link through to the document being shared.',
  [REC.CLAIM]: 'Insurance claims — full workflow, including the Ombudsman escalation path.',
  [REC.FD]: 'Fixed deposits nearing maturity — and whether the money comes back to us.',
  [REC.POLICY]: 'Other policies held by clients, tracked outside the renewal and claim flows.',
  [REC.ASSET]: 'Assets applicants own outside the Mutual Fund and Insurance modules — they flow into Asset Allocation and goal mapping automatically.',
};

const d = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const money = (v) => (v === '' || v == null ? '—' : fmtINR(Number(v) || 0));

// When the record actually closed. Records saved before these fields existed
// still carry the moment in their own stage history, so read it back from
// there rather than showing a dash for everything already settled/invested.
const claimClosedOn = (r) => r.settlementDate || stageReachedAt(r.stageHistory, 'Claim Settled');
const fdClosedOn = (r) => r.investmentDate || stageReachedAt(r.stageHistory, 'Invested With Us');

export default function CobrView({
  isViewer,
  clients = [],
  tasksChangeCounter,
  onNewCobr,
  onOpenCobr,
  activeCobrId,
  setActiveCobrId,
  onSaveRecord,
  section = 'servicing',
  onSwitchSection,
}) {
  const sectionTypes = WORKSPACE_SECTIONS[section] || WORKSPACE_SECTIONS.servicing;
  const tabs = sectionTypes.map((id) => TABS.find((t) => t.id === id)).filter(Boolean);
  const [tab, setTab] = useState(sectionTypes[0]);
  const [tasks, setTasks] = useState(() => loadTasks());
  // Servicing → Other Assets (kept apart from the task list — utils/tasks.js).
  const [assets, setAssets] = useState(() => loadOtherAssets());
  // Which record editor is open, if any: { type, record|null, startEditing? }
  const [editor, setEditor] = useState(null);
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { setTasks(loadTasks()); setAssets(loadOtherAssets()); }, [tasksChangeCounter]);
  // The server's answer to a save (e.g. a duplicate it refused) lands later.
  useEffect(() => {
    const sync = () => setAssets(loadOtherAssets());
    window.addEventListener('crm:tasks-updated', sync);
    return () => window.removeEventListener('crm:tasks-updated', sync);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  // Excel Upload, Delete AND the New-record button all ride each register's
  // OWN create/delete permission (the four were split into independent
  // Permission Matrix columns already) — NOT the single shared 'cobr'
  // column. A role granted ALL on e.g. otherInsurancePolicies but nothing on
  // 'cobr' itself used to see Import/Delete work but the "+ New Policy"
  // button stay hidden, which read as "the matrix grant isn't respected."
  const PERMISSION_MODULE = { [REC.RENEWAL]: 'renewals', [REC.CLAIM]: 'claims', [REC.FD]: 'fixedDeposits', [REC.POLICY]: 'otherInsurancePolicies', [REC.ASSET]: 'otherAssets' };
  const mayCreate = !isViewer && canDo(PERMISSION_MODULE[tab] || 'cobr', 'create');
  const canImportFor = (type) => !isViewer && canDo(PERMISSION_MODULE[type], 'create');
  const canDeleteFor = (type, record) => !isViewer && canDo(PERMISSION_MODULE[type], 'delete', record);
  const canEditAsset = (a) => !isViewer && canDo('otherAssets', 'editDetails', a);

  // Other Assets: save / delete straight into the asset list (saveOtherAssets
  // carries every task along untouched), then a confirmation message.
  const handleSaveAsset = (rec, isNew) => {
    const list = loadOtherAssets();
    saveOtherAssets(list.some((a) => a.id === rec.id) ? list.map((a) => (a.id === rec.id ? rec : a)) : [rec, ...list]);
    setAssets(loadOtherAssets());
    setEditor(null);
    const what = `${rec.applicant} — ${assetShortName(rec.assetSubType)}`;
    setToast(isNew
      ? { title: 'Asset Added Successfully', body: `${what} has been added successfully.` }
      : { title: 'Asset Updated', body: `${what} has been updated.` });
  };
  const handleDeleteAsset = (rec) => {
    saveOtherAssets(loadOtherAssets().filter((a) => a.id !== rec.id));
    setAssets(loadOtherAssets());
    setAssetToDelete(null);
    setEditor(null);
    setToast({ title: 'Asset Deleted', body: `${rec.applicant} — ${assetShortName(rec.assetSubType)} was deleted. An admin can restore it from Recently deleted.` });
  };

  const handleDeleteRecord = (type, record) => {
    const label = COBR_EXCEL_SPEC[type]?.label || 'record';
    if (!confirmDelete(label, record.taskName, [record.stage && `Stage: ${record.stage}`, filesNote(record.attachments)])) return;
    saveTasks(loadTasks().filter((t) => t.id !== record.id));
  };

  const rowsFor = useMemo(() => ({
    [REC.RENEWAL]: tasks.filter(isRenewal),
    [REC.CLAIM]: tasks.filter(isClaim),
    [REC.FD]: tasks.filter(isFd),
    [REC.POLICY]: tasks.filter(isPolicy),
  }), [tasks]);

  const cobrTasks = useMemo(() => tasks.filter(isCobrTask), [tasks]);

  // Deep-link from a notification click — open the specific record (any of
  // the five registers, since they all deep-link to this one workspace view)
  // once its row is available, switching to its tab first, then reset so it
  // doesn't re-trigger on re-render.
  // A record that lives in the OTHER module (every notification still links
  // to Servicing) is handed over with its id kept, so that module opens it.
  useEffect(() => {
    if (!activeCobrId) return;
    const foundCobr = cobrTasks.find((t) => t.id === activeCobrId);
    const foundType = foundCobr ? REC.COBR
      : [REC.RENEWAL, REC.CLAIM, REC.FD, REC.POLICY].find((type) => (rowsFor[type] || []).some((t) => t.id === activeCobrId));
    if (!foundType) return;
    if (!sectionTypes.includes(foundType)) {
      if (onSwitchSection) onSwitchSection(workspaceSectionOf(foundType));
      return;
    }
    if (foundCobr) {
      setTab(REC.COBR);
      onOpenCobr(foundCobr, true);
      if (setActiveCobrId) setActiveCobrId(null);
      return;
    }
    setTab(foundType);
    setEditor({ type: foundType, record: rowsFor[foundType].find((t) => t.id === activeCobrId) });
    if (setActiveCobrId) setActiveCobrId(null);
  }, [activeCobrId, cobrTasks, rowsFor, setActiveCobrId, onOpenCobr, sectionTypes, onSwitchSection]);

  const openCount = (type) => (rowsFor[type] || []).filter((r) => isOpenStage(type, r.stage)).length;

  const handleSaved = (rec) => {
    onSaveRecord && onSaveRecord(rec);
    setEditor(null);
  };

  const handleImportRecords = (records) => {
    onSaveRecord && onSaveRecord(records);
  };

  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — the same blue icon tile + title as every other module, the
          module's own sidebar icon, and what the open tab tracks below it. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <PageTitle
          icon={section === 'renewalsClaims' ? ShieldCheck : FileSpreadsheet}
          title={section === 'renewalsClaims' ? 'Renewals & Claims' : 'Servicing'}
          subtitle={TAB_DESCRIPTION[tab]}
        />

        {mayCreate && (
          <div className="shrink-0">
            {tab === REC.COBR ? (
              <button onClick={onNewCobr} className={btnPrimary + ' text-xs'}>
                <Plus size={14} /> New COBR
              </button>
            ) : tab === REC.ASSET ? (
              <button onClick={() => setEditor({ type: REC.ASSET, record: null })} className={btnPrimary + ' text-xs'}>
                <Plus size={14} /> Add Asset
              </button>
            ) : (
              <button onClick={() => setEditor({ type: tab, record: null })} className={btnPrimary + ' text-xs'}>
                <Plus size={14} /> New {tab === REC.POLICY ? 'Policy' : active?.label.replace(/s$/, '')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs — the same pill bar as the Clients module's tabs. */}
      <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm transition-colors">
          {tabs.map((t) => {
            const on = t.id === tab;
            const badge = t.id === REC.COBR
              ? cobrTasks.filter((x) => (x.stage || 'Open') !== 'Completed').length
              : t.id === REC.ASSET ? assets.length // no stages — how many are recorded
                : openCount(t.id);
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                  on
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/10 dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <t.icon size={14} /> {t.label}
                {badge > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black normal-case tracking-normal ${
                    on ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === REC.ASSET && (
        <OtherAssetsTab
          assets={assets}
          onOpen={(a) => setEditor({ type: REC.ASSET, record: a })}
          onEdit={(a) => setEditor({ type: REC.ASSET, record: a, startEditing: true })}
          onDelete={setAssetToDelete}
          canEditFor={canEditAsset}
          canDeleteFor={(a) => canDeleteFor(REC.ASSET, a)}
        />
      )}

      {tab === REC.COBR && (
        <CobrTab cobrTasks={cobrTasks} onOpenCobr={onOpenCobr} />
      )}

      {tab === REC.RENEWAL && (
        <RecordTable
          type={REC.RENEWAL}
          rows={rowsFor[REC.RENEWAL]}
          stages={RENEWAL_STAGES}
          searchFields={['applicant', 'groupLeader', 'pan', 'policyNumber', 'policyName', 'insuranceType']}
          searchPlaceholder="Search applicant, PAN, policy no., insurance type…"
          dateField={{ key: 'dueDate', label: 'Due date' }}
          onOpen={(r) => setEditor({ type: REC.RENEWAL, record: r })}
          emptyText="No renewals tracked yet."
          minWidth={1380}
          excelSpec={COBR_EXCEL_SPEC[REC.RENEWAL]}
          clients={clients}
          onImportRecords={handleImportRecords}
          canImportExcel={canImportFor(REC.RENEWAL)}
          onDelete={(r) => handleDeleteRecord(REC.RENEWAL, r)}
          canDelete={(r) => canDeleteFor(REC.RENEWAL, r)}
          columns={[
            { key: 'applicant', label: 'Client / Applicant', cls: 'font-bold text-slate-800 dark:text-slate-200' },
            { key: 'pan', label: 'PAN', cls: 'font-mono text-slate-500 dark:text-slate-400' },
            { key: 'insuranceType', label: 'Insurance Type' },
            { key: 'premiumAmount', label: 'Premium Amount', align: 'right', render: (r) => money(r.premiumAmount), sortValue: (r) => Number(r.premiumAmount) || 0 },
            { key: 'dueDate', label: 'Due Date', render: (r) => d(r.dueDate) },
            {
              key: 'crossUpSell',
              label: 'Cross / Up Sell',
              render: (r) => {
                const parts = [];
                if (r.upSell && r.upSellAmount) parts.push(<div key="u" className="text-indigo-600 dark:text-indigo-400 font-bold whitespace-nowrap">Up Sell: {money(r.upSellAmount)}</div>);
                if (r.crossSell && r.crossSellAmount) parts.push(<div key="c" className="text-indigo-600 dark:text-indigo-400 font-bold whitespace-nowrap">Cross Sell: {money(r.crossSellAmount)}</div>);
                return parts.length ? <div className="space-y-0.5">{parts}</div> : '—';
              },
              sortValue: (r) => (Number(r.upSellAmount) || 0) + (Number(r.crossSellAmount) || 0),
            },
            {
              key: 'commissionReceived',
              label: 'Commission',
              render: (r) => r.commissionReceived === 'Yes'
                ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">Yes</span>
                : r.commissionReceived === 'No'
                  ? <span className="text-rose-600 dark:text-rose-400 font-bold">No</span>
                  : '—',
              sortValue: (r) => r.commissionReceived || '',
            },
          ]}
        />
      )}

      {tab === REC.CLAIM && (
        <RecordTable
          type={REC.CLAIM}
          rows={rowsFor[REC.CLAIM]}
          stages={CLAIM_STAGES}
          searchFields={['applicant', 'groupLeader', 'pan', 'policyNumber', 'claimType', 'insuranceType']}
          searchPlaceholder="Search applicant, PAN, policy no., claim type…"
          dateField={{ key: 'dueDate', label: 'Target date' }}
          onOpen={(r) => setEditor({ type: REC.CLAIM, record: r })}
          emptyText="No claims registered yet."
          minWidth={1480}
          excelSpec={COBR_EXCEL_SPEC[REC.CLAIM]}
          clients={clients}
          onImportRecords={handleImportRecords}
          canImportExcel={canImportFor(REC.CLAIM)}
          onDelete={(r) => handleDeleteRecord(REC.CLAIM, r)}
          canDelete={(r) => canDeleteFor(REC.CLAIM, r)}
          columns={[
            { key: 'applicant', label: 'Client / Applicant', cls: 'font-bold text-slate-800 dark:text-slate-200' },
            { key: 'pan', label: 'PAN', cls: 'font-mono text-slate-500 dark:text-slate-400' },
            { key: 'insuranceType', label: 'Insurance Type' },
            { key: 'claimType', label: 'Claim Type' },
            { key: 'claimAmount', label: 'Claim Amount', align: 'right', render: (r) => money(r.claimAmount), sortValue: (r) => Number(r.claimAmount) || 0 },
            {
              key: 'settlementAmount',
              label: 'Settlement Amount',
              align: 'right',
              render: (r) => {
                const { amount, kind } = claimSettlementDisplay(r);
                if (kind === 'none') return '—';
                const cls = kind === 'full' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
                return <span className={`font-bold ${cls}`}>{money(amount)}</span>;
              },
              sortValue: (r) => claimSettlementDisplay(r).amount,
            },
            {
              key: 'settlementDate',
              label: 'Settlement Date',
              render: (r) => (r.stage === 'Claim Settled' ? d(claimClosedOn(r)) : '—'),
              sortValue: (r) => claimClosedOn(r) || '',
            },
          ]}
        />
      )}

      {tab === REC.FD && (
        <RecordTable
          type={REC.FD}
          rows={rowsFor[REC.FD]}
          stages={FD_STAGES}
          searchFields={['applicant', 'groupLeader', 'pan', 'bankName', 'jointHolderName', 'jointHolderPan']}
          searchPlaceholder="Search applicant, PAN, bank, joint holder…"
          dateField={{ key: 'maturityDate', label: 'Maturity' }}
          onOpen={(r) => setEditor({ type: REC.FD, record: r })}
          emptyText="No fixed deposits tracked yet."
          minWidth={1640}
          excelSpec={COBR_EXCEL_SPEC[REC.FD]}
          clients={clients}
          onImportRecords={handleImportRecords}
          canImportExcel={canImportFor(REC.FD)}
          onDelete={(r) => handleDeleteRecord(REC.FD, r)}
          canDelete={(r) => canDeleteFor(REC.FD, r)}
          columns={[
            { key: 'applicant', label: 'Client / Applicant', cls: 'font-bold text-slate-800 dark:text-slate-200' },
            { key: 'pan', label: 'PAN', cls: 'font-mono text-slate-500 dark:text-slate-400' },
            { key: 'jointHolderName', label: 'Joint Holder', render: (r) => r.jointHolderName || '—' },
            { key: 'jointHolderPan', label: 'Joint Holder PAN', cls: 'font-mono text-slate-500 dark:text-slate-400', render: (r) => r.jointHolderPan || '—' },
            { key: 'bankName', label: 'Bank' },
            { key: 'startingDate', label: 'Starting Date', render: (r) => d(r.startingDate) },
            { key: 'maturityDate', label: 'Maturity Date', render: (r) => d(r.maturityDate) },
            { key: 'maturityAmount', label: 'Maturity Amount', align: 'right', render: (r) => money(r.maturityAmount), sortValue: (r) => Number(r.maturityAmount) || 0 },
            {
              key: 'investmentAmount',
              label: 'Investment Amount',
              align: 'right',
              render: (r) => (r.stage === 'Invested With Us' ? <span className="font-bold text-violet-600 dark:text-violet-400">{money(r.investmentAmount)}</span> : '—'),
              sortValue: (r) => (r.stage === 'Invested With Us' ? Number(r.investmentAmount) || 0 : 0),
            },
            {
              key: 'investmentDate',
              label: 'Investment Date',
              render: (r) => (r.stage === 'Invested With Us' ? d(fdClosedOn(r)) : '—'),
              sortValue: (r) => fdClosedOn(r) || '',
            },
          ]}
        />
      )}

      {tab === REC.POLICY && (
        <RecordTable
          type={REC.POLICY}
          rows={rowsFor[REC.POLICY]}
          stages={POLICY_STAGES}
          searchFields={['applicant', 'groupLeader', 'pan', 'companyName', 'policyName', 'policyNumber', 'insuranceType']}
          searchPlaceholder="Search applicant, PAN, company, policy…"
          dateField={{ key: 'dueDate', label: 'Next due' }}
          onOpen={(r) => setEditor({ type: REC.POLICY, record: r })}
          emptyText="No other policies recorded yet."
          minWidth={1360}
          excelSpec={COBR_EXCEL_SPEC[REC.POLICY]}
          clients={clients}
          onImportRecords={handleImportRecords}
          canImportExcel={canImportFor(REC.POLICY)}
          onDelete={(r) => handleDeleteRecord(REC.POLICY, r)}
          canDelete={(r) => canDeleteFor(REC.POLICY, r)}
          columns={[
            { key: 'applicant', label: 'Client / Applicant', cls: 'font-bold text-slate-800 dark:text-slate-200' },
            { key: 'pan', label: 'PAN', cls: 'font-mono text-slate-500 dark:text-slate-400' },
            { key: 'insuranceType', label: 'Insurance Type' },
            { key: 'premiumAmount', label: 'Premium Amount', align: 'right', render: (r) => money(r.premiumAmount), sortValue: (r) => Number(r.premiumAmount) || 0 },
            { key: 'dueDate', label: 'Due Date', render: (r) => d(r.dueDate) },
            {
              key: 'outcome',
              label: 'Outcome',
              render: (r) => {
                if (!r.outcome) return '—';
                const cls = r.outcome === 'Amount Received' ? 'text-emerald-600 dark:text-emerald-400'
                  : r.outcome === 'Amount Not Received' ? 'text-rose-600 dark:text-rose-400'
                    : 'text-blue-600 dark:text-blue-400';
                return <span className={`font-bold ${cls}`}>{r.outcome}</span>;
              },
            },
            {
              key: 'amountReceived',
              label: 'Amount Received',
              align: 'right',
              render: (r) => (r.outcome === 'Amount Received' ? <span className="font-bold text-emerald-600 dark:text-emerald-400">{money(r.amountReceived)}</span> : '—'),
              sortValue: (r) => (r.outcome === 'Amount Received' ? Number(r.amountReceived) || 0 : 0),
            },
          ]}
        />
      )}

      {editor?.type === REC.RENEWAL && (
        <RenewalModal record={editor.record} clients={clients} onClose={() => setEditor(null)} onSave={handleSaved} />
      )}
      {editor?.type === REC.CLAIM && (
        <ClaimModal record={editor.record} clients={clients} onClose={() => setEditor(null)} onSave={handleSaved} />
      )}
      {editor?.type === REC.FD && (
        <FixedDepositModal record={editor.record} clients={clients} onClose={() => setEditor(null)} onSave={handleSaved} />
      )}
      {editor?.type === REC.POLICY && (
        <OtherPolicyModal record={editor.record} clients={clients} onClose={() => setEditor(null)} onSave={handleSaved} />
      )}
      {editor?.type === REC.ASSET && (
        <OtherAssetModal
          key={editor.record?.id || 'new'}
          record={editor.record}
          startEditing={!!editor.startEditing}
          clients={clients}
          onClose={() => setEditor(null)}
          onSave={handleSaveAsset}
          canDelete={!!editor.record && canDeleteFor(REC.ASSET, editor.record)}
          onDelete={setAssetToDelete}
          onViewExisting={(a) => setEditor({ type: REC.ASSET, record: a })}
        />
      )}
      {assetToDelete && (
        <AssetAlert
          tone="rose"
          title="Delete this asset?"
          onClose={() => setAssetToDelete(null)}
          actions={(
            <>
              <button type="button" onClick={() => setAssetToDelete(null)} className={btnGhost}>Cancel</button>
              <button type="button" onClick={() => handleDeleteAsset(assetToDelete)} className="inline-flex items-center justify-center gap-1.5 px-4.5 py-2.5 text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-500/15 transition-all cursor-pointer">Delete</button>
            </>
          )}
        >
          <p>Are you sure you want to delete this asset?</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px] pt-0.5">Applicant</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{assetToDelete.applicant || '—'}</dd>
            <dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px] pt-0.5">Asset</dt><dd className="font-semibold text-slate-800 dark:text-slate-200">{assetToDelete.assetSubType || '—'}</dd>
            <dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px] pt-0.5">Current Value</dt><dd className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fmtRupees(assetToDelete.amount)}</dd>
          </dl>
          <p className="text-[11px] text-slate-400 mt-3">It disappears for everyone, and from Asset Allocation. An admin can restore it from Recently deleted.</p>
        </AssetAlert>
      )}
      {toast && createPortal(
        <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm md:w-auto animate-scale-up">
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xl">
            <CheckCircle2 size={18} className="text-emerald-400 dark:text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{toast.title}</p>
              <p className="text-xs opacity-80 mt-0.5">{toast.body}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The original COBR list — unchanged behaviour, just lifted into its own
// component so the tab bar can sit above it.
// ---------------------------------------------------------------------------
function CobrTab({ cobrTasks, onOpenCobr }) {
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [groupLeader, setGroupLeader] = useState('');
  const [applicant, setApplicant] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const leaderOptions = useMemo(() => [...new Set(cobrTasks.map((t) => t.groupLeader).filter(Boolean))].sort(), [cobrTasks]);
  const applicantOptions = useMemo(() => [...new Set(cobrTasks
    .filter((t) => !groupLeader || t.groupLeader === groupLeader)
    .map((t) => t.applicant).filter(Boolean))].sort(), [cobrTasks, groupLeader]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cobrTasks
      .filter((t) => stageFilter === 'all' || t.stage === stageFilter)
      .filter((t) => !groupLeader || t.groupLeader === groupLeader)
      .filter((t) => !applicant || t.applicant === applicant)
      .filter((t) => !q
        || (t.groupLeader || '').toLowerCase().includes(q)
        || (t.applicant || '').toLowerCase().includes(q)
        || (t.pan || '').toLowerCase().includes(q)
        || (teamName(t.assignedTo) || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [cobrTasks, query, stageFilter, groupLeader, applicant]);

  const counts = useMemo(() => {
    const c = { all: cobrTasks.length };
    COBR_STAGES.forEach((s) => { c[s] = cobrTasks.filter((t) => t.stage === s).length; });
    return c;
  }, [cobrTasks]);

  const clearPanel = () => { setStageFilter('all'); setGroupLeader(''); setApplicant(''); };
  const chips = [
    groupLeader && { key: 'gl', label: `Group leader: ${groupLeader}`, onRemove: () => { setGroupLeader(''); setApplicant(''); } },
    applicant && { key: 'ap', label: `Applicant: ${applicant}`, onRemove: () => setApplicant('') },
    stageFilter !== 'all' && { key: 'st', label: `Stage: ${stageFilter}`, onRemove: () => setStageFilter('all') },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Search + Filter (the filters live in the panel, as in Clients) */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search group leader, applicant, PAN, assignee…"
            className={inputCls + ' pl-9'}
          />
        </div>
        <FilterToggle open={showFilters} onClick={() => setShowFilters((s) => !s)} count={chips.length} />
        {(query || chips.length > 0) && (
          <button onClick={() => { setQuery(''); clearPanel(); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {showFilters ? (
        <FilterPanel onClear={chips.length ? clearPanel : null}>
          {leaderOptions.length > 0 && (
            <Field label="Group Leader">
              <CoolSelect value={groupLeader} onChange={(e) => { setGroupLeader(e.target.value); setApplicant(''); }} placeholder="All group leaders" className={selectCls}>
                <option value="">All group leaders</option>
                {leaderOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </CoolSelect>
            </Field>
          )}
          {applicantOptions.length > 0 && (
            <Field label="Applicant">
              <CoolSelect value={applicant} onChange={(e) => setApplicant(e.target.value)} placeholder="All applicants" className={selectCls}>
                <option value="">All applicants</option>
                {applicantOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </CoolSelect>
            </Field>
          )}
          <Field label="Stage">
            <CoolSelect value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={selectCls}>
              <option value="all">All Stages ({counts.all})</option>
              {COBR_STAGES.map((s) => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
            </CoolSelect>
          </Field>
        </FilterPanel>
      ) : (
        <ActiveFilterChips chips={chips} onClearAll={clearPanel} />
      )}

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">No COBR requests match this filter.</p>
        ) : (
          <>
          {/* Phones: one card per request instead of the 980px table. */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((t) => {
              const totals = cobrTotals(t.cobrEntries);
              const completed = t.stage === 'Completed';
              return (
                <div key={t.id} onClick={() => onOpenCobr(t, true)} className="p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">{t.groupLeader || '—'}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.applicant && t.applicant !== t.groupLeader && <span>{t.applicant} · </span>}
                        <span className="font-mono">{t.pan || '—'}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center leading-none px-2 py-1 text-[9px] font-bold uppercase tracking-wider ring-1 rounded-full ${STAGE_THEME[t.stage] || 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {t.stage || 'Open'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{t.cobrType || '—'} · {teamName(t.assignedTo) || '—'}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums shrink-0">{fmtINR(totals.total)}</span>
                  </div>
                  {completed && (
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] font-semibold tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">Done {fmtINR(totals.done)}</span>
                      <span className="text-rose-600 dark:text-rose-400">Rejected {fmtINR(totals.rejected)}</span>
                      <span className="text-slate-500 dark:text-slate-400">Pending {fmtINR(totals.pending)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left min-w-[980px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 whitespace-nowrap align-middle">Group Leader</th>
                  <th className="px-4 py-3 whitespace-nowrap align-middle">Applicant</th>
                  <th className="px-4 py-3 whitespace-nowrap align-middle">PAN</th>
                  <th className="px-4 py-3 whitespace-nowrap align-middle">Type</th>
                  <th className="px-4 py-3 whitespace-nowrap align-middle">Assigned To</th>
                  <th className="px-4 py-3 whitespace-nowrap align-middle">Stage</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap align-middle">Total</th>
                  <th className="px-4 py-3 text-right text-emerald-500 whitespace-nowrap align-middle">Done</th>
                  <th className="px-4 py-3 text-right text-rose-500 whitespace-nowrap align-middle">Rejected</th>
                  <th className="px-4 py-3 text-right text-slate-400 whitespace-nowrap align-middle">Pending</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const totals = cobrTotals(t.cobrEntries);
                  const completed = t.stage === 'Completed';
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpenCobr(t, true)}
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap align-middle">{t.groupLeader || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap align-middle">{t.applicant || '—'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">{t.pan || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap align-middle">{t.cobrType || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap align-middle">{teamName(t.assignedTo) || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        <span className={`inline-flex items-center leading-none px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 rounded-full ${STAGE_THEME[t.stage] || 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {t.stage || 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums text-right align-middle">{fmtINR(totals.total)}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-emerald-600 dark:text-emerald-400 align-middle">{completed ? fmtINR(totals.done) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-rose-600 dark:text-rose-400 align-middle">{completed ? fmtINR(totals.rejected) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-slate-500 dark:text-slate-400 align-middle">{completed ? fmtINR(totals.pending) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
