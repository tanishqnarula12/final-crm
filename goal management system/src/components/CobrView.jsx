// COBR (Change of Broker) module — its own top-level sidebar section.
//
// COBR records ARE Task rows (relatedTo: 'COBR') filtered out of the shared
// `loadTasks()` cache — same sync/save pipeline as the Tasks module
// (tasksChangeCounter bump on save), just a specialized list + editor.
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, ArrowLeftRight } from 'lucide-react';
import { Card, btnPrimary, selectCls, CoolSelect } from './UI';
import { loadTasks } from '../utils/tasks';
import { COBR_STAGES, cobrTotals, isCobrTask } from '../utils/cobr';
import { teamName } from '../services/team';
import { fmtINR } from '../utils/calc';
import { canDo } from '../utils/permissions';

const STAGE_THEME = {
  Open: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  'In Process': 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
};

export default function CobrView({ isViewer, tasksChangeCounter, onNewCobr, onOpenCobr }) {
  const [tasks, setTasks] = useState(() => loadTasks());
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  useEffect(() => { setTasks(loadTasks()); }, [tasksChangeCounter]);

  const cobrTasks = useMemo(() => tasks.filter(isCobrTask), [tasks]);

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

  const mayCreate = !isViewer && canDo('cobr', 'create');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <ArrowLeftRight size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Change of Broker (COBR)</h2>
            <p className="text-xs text-slate-400">Broker-change requests — tracked as tasks, with a per-scheme checklist.</p>
          </div>
        </div>
        {mayCreate && (
          <button onClick={onNewCobr} className={btnPrimary + ' text-xs'}>
            <Plus size={14} /> New COBR
          </button>
        )}
      </div>

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
                  <th className="px-4 py-3">Group Leader</th>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right text-emerald-500">Done</th>
                  <th className="px-4 py-3 text-right text-rose-500">Rejected</th>
                  <th className="px-4 py-3 text-right text-slate-400">Pending</th>
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
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200">{t.groupLeader || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{t.applicant || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{t.cobrType || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">{teamName(t.assignedTo) || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 rounded-full ${STAGE_THEME[t.stage] || 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {t.stage || 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums text-right">{fmtINR(totals.total)}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-emerald-600 dark:text-emerald-400">{completed ? fmtINR(totals.done) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-rose-600 dark:text-rose-400">{completed ? fmtINR(totals.rejected) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-right text-slate-500 dark:text-slate-400">{completed ? fmtINR(totals.pending) : '—'}</td>
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
