import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Search, Trash2, HelpCircle, MessageSquare, ArrowRight } from 'lucide-react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { loadTeam, teamName } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canCreateQuery, canEditQuery, canChangeQueryStage, isAdmin } from '../utils/permissions';
import { loadQueries, saveQueries, QUERY_STAGES, QUERY_CATEGORIES, STAGE_THEME, fmtQueryStamp } from '../utils/queries';
import { uid } from '../utils/calc';

export default function QueriesView({ isViewer, activeQueryId, setActiveQueryId, onOpenQuery, queriesChangeCounter }) {
  const mayCreateQuery = !isViewer && canCreateQuery(getCurrentUser());
  const [queries, setQueries] = useState(() => loadQueries());
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setQueries(loadQueries());
  }, [queriesChangeCounter]);

  useEffect(() => {
    const onSyncWarning = (e) => {
      setToast(`⚠ ${e.detail?.message || 'Some changes could not be saved.'}`);
      setTimeout(() => setToast(''), 5000);
    };
    window.addEventListener('crm:queries-sync-warning', onSyncWarning);
    return () => window.removeEventListener('crm:queries-sync-warning', onSyncWarning);
  }, []);

  useEffect(() => {
    if (activeQueryId) {
      const found = queries.find(q => q.id === activeQueryId);
      if (found) onOpenQuery && onOpenQuery(found);
      if (setActiveQueryId) setActiveQueryId(null);
    }
  }, [activeQueryId, queries, setActiveQueryId, onOpenQuery]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queries
      .filter(x => stageFilter === 'all' || x.stage === stageFilter)
      .filter(x => !q ||
        (x.query || '').toLowerCase().includes(q) ||
        (x.category || '').toLowerCase().includes(q) ||
        (teamName(x.createdBy) || '').toLowerCase().includes(q) ||
        (teamName(x.assignedTo) || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [queries, search, stageFilter]);

  const counts = useMemo(() => {
    const c = { all: queries.length };
    QUERY_STAGES.forEach(s => { c[s] = queries.filter(x => x.stage === s).length; });
    return c;
  }, [queries]);

  const openCreate = () => { onOpenQuery && onOpenQuery(null); };
  const openEdit = (q) => { onOpenQuery && onOpenQuery(q); };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this query? This cannot be undone.')) return;
    setQueries(prev => {
      const updated = prev.filter(x => x.id !== id);
      saveQueries(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <HelpCircle size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Queries</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Raise a query to any team member and track it to resolution</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search queries…" className={inputCls + ' pl-9 w-full md:w-56'} />
          </div>
          {mayCreateQuery && (
            <button onClick={openCreate} className={btnPrimary + ' shrink-0'}>
              <Plus size={14} /> New Query
            </button>
          )}
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" count={counts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
        {QUERY_STAGES.map(s => (
          <FilterChip key={s} label={s} count={counts[s]} active={stageFilter === s} onClick={() => setStageFilter(s)} />
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <HelpCircle className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">
            {queries.length === 0 ? 'No queries yet' : 'No queries match your filters'}
          </p>
          {!isViewer && queries.length === 0 && (
            <button onClick={openCreate} className={btnSecondary}><Plus size={14} /> Raise the first query</button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Related To</th>
                  <th className="text-left px-6 py-4 font-bold">Query</th>
                  <th className="text-left px-6 py-4 font-bold">Raised By</th>
                  <th className="text-left px-6 py-4 font-bold">Raised To</th>
                  <th className="text-left px-6 py-4 font-bold">Created</th>
                  <th className="text-center px-6 py-4 font-bold">Stage</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {filtered.map(q => (
                  <tr key={q.id} onClick={() => openEdit(q)} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{q.category || '—'}</div>
                    </td>
                    <td className="px-6 py-4 max-w-[320px]">
                      <div className="text-slate-700 dark:text-slate-300 font-medium truncate">{q.query || '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{(q.createdBy || q.departmentOwner) ? teamName(q.createdBy || q.departmentOwner) : '—'}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{q.assignedTo ? teamName(q.assignedTo) : '—'}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 tabular-nums">{q.createdAt ? fmtQueryStamp(q.createdAt) : '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[q.stage] || STAGE_THEME['Open']}`}>
                        {q.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isViewer && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(q.id); }}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete query"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {toast && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold animate-scale-up">
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
        active
          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
    </button>
  );
}

export function QueryFormModal({ initial, isViewer, onClose, onSave }) {
  const isEdit = !!initial;
  const me = getCurrentUser();
  const [category, setCategory] = useState(initial?.category || '');
  const [queryText, setQueryText] = useState(initial?.query || '');
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || '');
  const [stage, setStage] = useState(initial?.stage || 'Open');
  const [remark, setRemark] = useState('');
  const [remarks, setRemarks] = useState(Array.isArray(initial?.remarks) ? initial.remarks : []);
  const team = loadTeam();

  const hasStageChanged = isEdit && stage !== (initial?.stage || 'Open');

  // RBAC gating (mirrors the server): only the raiser (departmentOwner) or
  // Admin may edit the query's own text/category; the recipient can't move
  // the stage backward. Legacy/edge rows with no departmentOwner stay editable.
  const canEditThis = !isEdit || isAdmin(me) || !initial?.departmentOwner || canEditQuery(me, initial);
  const stageOk = !hasStageChanged || canChangeQueryStage(me, initial, initial?.stage || 'Open', stage);
  const canSave = !isViewer && canEditThis && stageOk && category && queryText.trim() && assignedTo;

  const handleSubmit = () => {
    if (!canSave) return;
    const author = me?.name || 'System';
    let finalRemarks = [...remarks];
    if (hasStageChanged) {
      finalRemarks.push({ at: new Date().toISOString(), by: author, text: `Stage changed from ${initial?.stage || 'Open'} to ${stage}${remark.trim() ? ` | ${remark.trim()}` : ''}` });
    } else if (remark.trim()) {
      finalRemarks.push({ at: new Date().toISOString(), by: author, text: remark.trim() });
    }

    const record = {
      id: initial?.id || uid(),
      category,
      query: queryText.trim(),
      assignedTo,
      stage: isEdit ? stage : 'Open',
      remarks: finalRemarks,
      // Stamp the raiser locally so "Raised By" shows immediately (before the
      // server reconciles). The server keeps createdBy immutable regardless, so
      // this can only ever match what the server will confirm.
      createdBy: initial?.createdBy || me?.id || '',
      departmentOwner: initial?.departmentOwner || me?.id || '',
      createdAt: initial?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(record);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{isEdit ? 'Query' : 'Raise a Query'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {isEdit && (
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>Raised by <strong className="text-slate-700 dark:text-slate-300">{teamName(initial.createdBy || initial.departmentOwner) || '—'}</strong></span>
              <span>{fmtQueryStamp(initial.createdAt)}</span>
            </div>
          )}

          <Field label="Query Related To *">
            <CoolSelect value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls} disabled={!canEditThis}>
              <option value="">Select…</option>
              {QUERY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </CoolSelect>
          </Field>

          <Field label="Query *">
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              rows={3}
              className={inputCls + ' resize-y'}
              placeholder="Describe the query…"
              disabled={!canEditThis}
            />
          </Field>

          <Field label="Raised To *">
            <CoolSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls} disabled={!canEditThis}>
              <option value="">Select team member…</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </CoolSelect>
          </Field>

          {isEdit && (
            <Field label="Stage *">
              <CoolSelect value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls}>
                {QUERY_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </CoolSelect>
            </Field>
          )}

          {isEdit && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare size={14} /> Remarks
              </h4>
              {remarks.length > 0 ? (
                <ol className="space-y-3 max-h-48 overflow-y-auto pl-3 pr-1">
                  {remarks.map((r, i) => {
                    const stageMatch = r.text.match(/^Stage changed from (.*) to (.*?)(?:\s*\|\s*(.*))?$/);
                    if (stageMatch) {
                      const [, fromStage, toStage, rest] = stageMatch;
                      return (
                        <li key={i} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                          <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{fmtQueryStamp(r.at)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${STAGE_THEME[fromStage] || 'bg-slate-50 text-slate-700'}`}>{fromStage}</span>
                            <ArrowRight size={11} className="text-slate-450" />
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${STAGE_THEME[toStage] || 'bg-slate-50 text-slate-700'}`}>{toStage}</span>
                          </div>
                          {rest && <p className="text-sm text-slate-650 dark:text-slate-350 leading-relaxed mt-1">{rest}</p>}
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                          {fmtQueryStamp(r.at)}{r.by && <span className="text-blue-500 dark:text-blue-400 font-semibold ml-1.5">• {r.by}</span>}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words leading-relaxed">{r.text}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No remarks yet.</p>
              )}
            </div>
          )}

          {isEdit && !isViewer && (
            <div className="pt-2">
              <Field label={hasStageChanged ? `Reason for stage change → ${stage}` : 'Add a remark'}>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  className={inputCls + ' resize-y'}
                  placeholder={hasStageChanged ? 'Explain why the stage changed…' : 'Add a remark…'}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          {!isViewer && (
            <button onClick={handleSubmit} disabled={!canSave} className={btnPrimary}>
              {isEdit ? 'Save Changes' : 'Raise Query'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
