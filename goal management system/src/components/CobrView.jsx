// COBR workspace — its own top-level sidebar section, now with five tabs:
// COBR (Change of Broker), Renewals, Claim, Fixed Deposit and Other Insurance
// Policies.
//
// Every record in every tab IS a Task row, distinguished by `relatedTo`
// (see utils/cobrModules.js) — same sync/save pipeline as the Tasks module
// (tasksChangeCounter bump on save), just specialized lists + editors.
//
// The COBR tab's behaviour is deliberately unchanged from before the other
// four tabs existed.
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, ArrowLeftRight, RefreshCw, ShieldAlert, Landmark, FileCheck2 } from 'lucide-react';
import { Card, btnPrimary, selectCls, CoolSelect } from './UI';
import { loadTasks, saveTasks } from '../utils/tasks';
import { COBR_STAGES, cobrTotals, isCobrTask } from '../utils/cobr';
import {
  REC, RENEWAL_STAGES, CLAIM_STAGES, FD_STAGES, POLICY_STAGES,
  isRenewal, isClaim, isFd, isPolicy, isOpenStage, claimSettlementDisplay, COBR_EXCEL_SPEC,
} from '../utils/cobrModules';
import { teamName } from '../services/team';
import { fmtINR } from '../utils/calc';
import { canDo } from '../utils/permissions';
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
  { id: REC.COBR, label: 'COBR', icon: ArrowLeftRight },
  { id: REC.RENEWAL, label: 'Renewals', icon: RefreshCw },
  { id: REC.CLAIM, label: 'Claim', icon: ShieldAlert },
  { id: REC.FD, label: 'Fixed Deposit', icon: Landmark },
  { id: REC.POLICY, label: 'Other Insurance Policies', icon: FileCheck2 },
];

const d = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const money = (v) => (v === '' || v == null ? '—' : fmtINR(Number(v) || 0));

export default function CobrView({
  isViewer,
  clients = [],
  tasksChangeCounter,
  onNewCobr,
  onOpenCobr,
  activeCobrId,
  setActiveCobrId,
  onSaveRecord,
}) {
  const [tab, setTab] = useState(REC.COBR);
  const [tasks, setTasks] = useState(() => loadTasks());
  // Which record editor is open, if any: { type, record|null }
  const [editor, setEditor] = useState(null);

  useEffect(() => { setTasks(loadTasks()); }, [tasksChangeCounter]);

  // Excel Upload, Delete AND the New-record button all ride each register's
  // OWN create/delete permission (the four were split into independent
  // Permission Matrix columns already) — NOT the single shared 'cobr'
  // column. A role granted ALL on e.g. otherInsurancePolicies but nothing on
  // 'cobr' itself used to see Import/Delete work but the "+ New Policy"
  // button stay hidden, which read as "the matrix grant isn't respected."
  const PERMISSION_MODULE = { [REC.RENEWAL]: 'renewals', [REC.CLAIM]: 'claims', [REC.FD]: 'fixedDeposits', [REC.POLICY]: 'otherInsurancePolicies' };
  const mayCreate = !isViewer && canDo(PERMISSION_MODULE[tab] || 'cobr', 'create');
  const canImportFor = (type) => !isViewer && canDo(PERMISSION_MODULE[type], 'create');
  const canDeleteFor = (type, record) => !isViewer && canDo(PERMISSION_MODULE[type], 'delete', record);

  const handleDeleteRecord = (type, record) => {
    const label = COBR_EXCEL_SPEC[type]?.label || 'record';
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
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
  useEffect(() => {
    if (!activeCobrId) return;
    const foundCobr = cobrTasks.find((t) => t.id === activeCobrId);
    if (foundCobr) {
      setTab(REC.COBR);
      onOpenCobr(foundCobr, true);
      if (setActiveCobrId) setActiveCobrId(null);
      return;
    }
    for (const type of [REC.RENEWAL, REC.CLAIM, REC.FD, REC.POLICY]) {
      const found = (rowsFor[type] || []).find((t) => t.id === activeCobrId);
      if (found) {
        setTab(type);
        setEditor({ type, record: found });
        if (setActiveCobrId) setActiveCobrId(null);
        return;
      }
    }
  }, [activeCobrId, cobrTasks, rowsFor, setActiveCobrId, onOpenCobr]);

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
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            {active?.icon ? <active.icon size={20} /> : <ArrowLeftRight size={20} />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {tab === REC.COBR ? 'Change of Broker (COBR)' : active?.label}
            </h2>
            <p className="text-xs text-slate-400">
              {tab === REC.COBR && 'Broker-change requests — tracked as tasks, with a per-scheme checklist.'}
              {tab === REC.RENEWAL && 'Policy renewals — from the first WhatsApp link through to the document being shared.'}
              {tab === REC.CLAIM && 'Insurance claims — full workflow, including the Ombudsman escalation path.'}
              {tab === REC.FD && 'Fixed deposits nearing maturity — and whether the money comes back to us.'}
              {tab === REC.POLICY && 'Other policies held by clients, tracked outside the renewal and claim flows.'}
            </p>
          </div>
        </div>

        {mayCreate && (
          tab === REC.COBR ? (
            <button onClick={onNewCobr} className={btnPrimary + ' text-xs'}>
              <Plus size={14} /> New COBR
            </button>
          ) : (
            <button onClick={() => setEditor({ type: tab, record: null })} className={btnPrimary + ' text-xs'}>
              <Plus size={14} /> New {tab === REC.POLICY ? 'Policy' : active?.label.replace(/s$/, '')}
            </button>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-px">
        {TABS.map((t) => {
          const on = t.id === tab;
          const badge = t.id === REC.COBR
            ? cobrTasks.filter((x) => (x.stage || 'Open') !== 'Completed').length
            : openCount(t.id);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 -mb-px ${
                on
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-950/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <t.icon size={13} /> {t.label}
              {badge > 0 && (
                <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black ${
                  on ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
          minWidth={1260}
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
          minWidth={1340}
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
          ]}
        />
      )}

      {tab === REC.FD && (
        <RecordTable
          type={REC.FD}
          rows={rowsFor[REC.FD]}
          stages={FD_STAGES}
          searchFields={['applicant', 'groupLeader', 'pan', 'bankName']}
          searchPlaceholder="Search applicant, PAN, bank…"
          dateField={{ key: 'maturityDate', label: 'Maturity' }}
          onOpen={(r) => setEditor({ type: REC.FD, record: r })}
          emptyText="No fixed deposits tracked yet."
          minWidth={1260}
          excelSpec={COBR_EXCEL_SPEC[REC.FD]}
          clients={clients}
          onImportRecords={handleImportRecords}
          canImportExcel={canImportFor(REC.FD)}
          onDelete={(r) => handleDeleteRecord(REC.FD, r)}
          canDelete={(r) => canDeleteFor(REC.FD, r)}
          columns={[
            { key: 'applicant', label: 'Client / Applicant', cls: 'font-bold text-slate-800 dark:text-slate-200' },
            { key: 'pan', label: 'PAN', cls: 'font-mono text-slate-500 dark:text-slate-400' },
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cobrTasks
      .filter((t) => stageFilter === 'all' || t.stage === stageFilter)
      .filter((t) => !q
        || (t.groupLeader || '').toLowerCase().includes(q)
        || (t.applicant || '').toLowerCase().includes(q)
        || (t.pan || '').toLowerCase().includes(q)
        || (teamName(t.assignedTo) || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [cobrTasks, query, stageFilter]);

  const counts = useMemo(() => {
    const c = { all: cobrTasks.length };
    COBR_STAGES.forEach((s) => { c[s] = cobrTasks.filter((t) => t.stage === s).length; });
    return c;
  }, [cobrTasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search group leader, applicant, PAN, assignee…"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
        <div className="w-44">
          <CoolSelect value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={selectCls + ' py-2 text-xs'}>
            <option value="all">All Stages ({counts.all})</option>
            {COBR_STAGES.map((s) => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
          </CoolSelect>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">No COBR requests match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
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
        )}
      </Card>
    </div>
  );
}
