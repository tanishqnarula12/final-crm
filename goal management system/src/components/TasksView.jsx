import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, Search, Trash2, ListChecks, MessageSquare, Send, Pencil, Check, ChevronDown, Crown, ArrowRight,
  Upload, Paperclip, Eye, Download, History
} from 'lucide-react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { RELATIONS } from '../utils/team';
import { loadTeam, teamName } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canCreateTask, canEditTask, canDeleteTask, canChangeTaskStage, isAdmin } from '../utils/permissions';
import {
  loadTasks, saveTasks, TASK_STAGES, STAGE_THEME, RELATED_OPTIONS, NFT_TYPES, AMC_LIST, fmtTaskStamp
} from '../utils/tasks';
import { uid } from '../utils/calc';
import { updateClient } from '../services/db';

export default function TasksView({ clients = [], isViewer, activeTaskId, setActiveTaskId, onOpenTask, tasksChangeCounter }) {
  const me = getCurrentUser();
  const mayCreateTask = !isViewer && canCreateTask(me);
  const [tasks, setTasks] = useState(() => loadTasks());
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setTasks(loadTasks());
  }, [tasksChangeCounter]);

  useEffect(() => {
    const onSyncWarning = (e) => {
      setToast(`⚠ ${e.detail?.message || 'Some changes could not be saved.'}`);
      setTimeout(() => setToast(''), 5000);
    };
    window.addEventListener('crm:tasks-sync-warning', onSyncWarning);
    return () => window.removeEventListener('crm:tasks-sync-warning', onSyncWarning);
  }, []);

  useEffect(() => {
    if (activeTaskId) {
      const found = tasks.find(t => t.id === activeTaskId);
      if (found) {
        onOpenTask && onOpenTask(found);
      }
      if (setActiveTaskId) {
        setActiveTaskId(null);
      }
    }
  }, [activeTaskId, tasks, setActiveTaskId, onOpenTask]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter(t => stageFilter === 'all' || t.stage === stageFilter)
      .filter(t => !q ||
        (t.taskName || '').toLowerCase().includes(q) ||
        (t.applicant || '').toLowerCase().includes(q) ||
        (t.groupLeader || '').toLowerCase().includes(q) ||
        (t.pan || '').toLowerCase().includes(q) ||
        (t.nftType || '').toLowerCase().includes(q) ||
        (teamName(t.assignedTo) || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [tasks, query, stageFilter]);

  const counts = useMemo(() => {
    const c = { all: tasks.length };
    TASK_STAGES.forEach(s => { c[s] = tasks.filter(t => t.stage === s).length; });
    return c;
  }, [tasks]);

  const openCreate = () => { onOpenTask && onOpenTask(null); };
  const openEdit = (task) => { onOpenTask && onOpenTask(task); };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id);
      saveTasks(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <ListChecks size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Tasks</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Track and assign work across the team</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…" className={inputCls + ' pl-9 w-full md:w-56'} />
          </div>
          {mayCreateTask && (
            <button onClick={openCreate} className={btnPrimary + ' shrink-0'}>
              <Plus size={14} /> New Task
            </button>
          )}
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" count={counts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
        {TASK_STAGES.map(s => (
          <FilterChip key={s} label={s} count={counts[s]} active={stageFilter === s} onClick={() => setStageFilter(s)} />
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <ListChecks className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">
            {tasks.length === 0 ? 'No tasks yet' : 'No tasks match your filters'}
          </p>
          {!isViewer && tasks.length === 0 && (
            <button onClick={openCreate} className={btnSecondary}><Plus size={14} /> Create the first task</button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Task</th>
                  <th className="text-left px-6 py-4 font-bold">Related To</th>
                  <th className="text-left px-6 py-4 font-bold">Applicant</th>
                  <th className="text-left px-6 py-4 font-bold">Assigned To</th>
                  <th className="text-left px-6 py-4 font-bold">Due</th>
                  <th className="text-center px-6 py-4 font-bold">Stage</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {filtered.map(t => (
                  <tr key={t.id} onClick={() => openEdit(t)} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{t.taskName || 'Untitled task'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">
                        {t.relatedTo === 'NFT' ? (t.nftType || 'NFT') : (t.otherSpecify || t.relatedTo || '—')}
                      </div>
                      {t.relatedTo === 'NFT' && Array.isArray(t.amcs) && t.amcs.length > 0 && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[200px]">{t.amcs.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">{t.applicant || '—'}</div>
                      {t.pan && <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">{t.pan}</div>}
                      {t.groupLeader && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <Crown size={10} className="text-amber-500" /> {t.groupLeader}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{t.assignedTo ? teamName(t.assignedTo) : '—'}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 tabular-nums">{t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[t.stage] || STAGE_THEME['Open']}`}>
                        {t.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {/* Delete only shows for someone the permission matrix
                          actually grants task-delete to (Admin by default). */}
                      {!isViewer && canDeleteTask(me, t) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete task"
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

// Finds attachments already on file for this client that match a document category label
function existingDocsFor(linkedClient, categoryLabel, currentCategoryFiles = []) {
  if (!linkedClient) return [];
  const atts = linkedClient.clientDetails?.attachments || [];
  const currentIds = new Set(currentCategoryFiles.map(f => f.id));
  const needle = categoryLabel.toLowerCase();
  return atts.filter(a =>
    a && typeof a === 'object' &&
    (a.category?.toLowerCase() === needle) &&
    !currentIds.has(a.id)
  );
}

// Multi-file upload control for one document category — supports any file type,
// shows files already on record for the client plus newly added ones (removable).
function DocUploadGroup({ label, required, files, onAdd, onRemove, existingDocs = [], clientAttachments = [], isViewer = false }) {
  const inputRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);
  // Hover tooltip state: { dataUrl, name, x, y }
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimer = useRef(null);

  const handleFiles = (e) => {
    if (isViewer) return;
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    let pending = picked.length;
    const collected = [];
    picked.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        collected.push({
          id: uid(),
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          dataUrl: ev.target.result,
          date: new Date().toISOString(),
        });
        pending -= 1;
        if (pending === 0) onAdd(collected);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleUseExisting = (doc) => {
    onAdd([{
      id: doc.id,
      fileName: doc.fileName || doc.name,
      fileType: doc.fileType || 'application/octet-stream',
      dataUrl: doc.dataUrl || doc.data || '',
      date: doc.date || new Date().toISOString(),
      isExisting: true
    }]);
  };

  const isSatisfied = files.length > 0;

  const showTooltip = (e, dataUrl, name) => {
    clearTimeout(tooltipTimer.current);
    if (!dataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ dataUrl, name, anchorRect: rect });
    }, 250);
  };
  const hideTooltip = () => { clearTimeout(tooltipTimer.current); setTooltip(null); };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold ${required && !isSatisfied ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>
          {label}{required && !isViewer ? ' *' : ''}
        </span>
        {!isViewer && (
          <button type="button" onClick={() => inputRef.current?.click()} className={btnGhost + ' py-1 px-2 text-[10px]'}>
            <Upload size={11} /> Upload
          </button>
        )}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles} disabled={isViewer} />
      </div>

      {/* Click-to-open full preview modal */}
      {previewFile && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate block">{previewFile.name}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Uploaded by {previewFile.uploadedBy || 'System'}{previewFile.date ? ` · ${new Date(previewFile.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={previewFile.dataUrl} download={previewFile.name} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Download size={11} /> Download</a>
                <button onClick={() => setPreviewFile(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-2">
              {previewFile.dataUrl.startsWith('data:image/') ? (
                <img src={previewFile.dataUrl} alt={previewFile.name} className="max-w-full max-h-full object-contain rounded-lg" />
              ) : previewFile.dataUrl.startsWith('data:application/pdf') ? (
                <iframe src={previewFile.dataUrl} title={previewFile.name} className="w-full h-[70vh] rounded-lg border-0" />
              ) : (
                <div className="text-center space-y-3">
                  <Paperclip size={32} className="mx-auto text-slate-400" />
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{previewFile.name}</p>
                  <p className="text-xs text-slate-400">Preview not available for this file type.</p>
                  <a href={previewFile.dataUrl} download={previewFile.name} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"><Download size={13} /> Download File</a>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hover tooltip preview */}
      {tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: Math.min(tooltip.anchorRect.left, window.innerWidth - 224),
            top: tooltip.anchorRect.top - 8,
            transform: 'translateY(-100%)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
          className="w-52 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200/70 dark:border-slate-700/60 overflow-hidden"
        >
          {tooltip.dataUrl.startsWith('data:image/') ? (
            <img src={tooltip.dataUrl} alt={tooltip.name} className="w-full object-contain max-h-36 bg-slate-50 dark:bg-slate-950" />
          ) : tooltip.dataUrl.startsWith('data:application/pdf') ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-6 bg-slate-50 dark:bg-slate-950">
              <Paperclip size={22} className="text-red-500" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">PDF Document</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 py-6 bg-slate-50 dark:bg-slate-950">
              <Paperclip size={22} className="text-blue-500" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">File</span>
            </div>
          )}
          <div className="px-2.5 py-1.5 bg-white dark:bg-slate-900">
            <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{tooltip.name}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Click to open full preview</p>
          </div>
        </div>,
        document.body
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map(f => {
            const onFile = clientAttachments.some(a => a.id === f.id) || f.isExisting;
            return (
              <span
                key={f.id}
                title={`Uploaded by ${f.uploadedBy || 'System'}${f.date ? ` · ${new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`}
                className={`group inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-default ring-1 ${
                  onFile
                    ? 'bg-emerald-50 dark:bg-emerald-955/30 text-emerald-700 dark:text-emerald-400 ring-emerald-200/60 dark:ring-emerald-900/40'
                    : 'bg-blue-50 dark:bg-blue-955/30 text-blue-700 dark:text-blue-400 ring-blue-200/60 dark:ring-blue-900/40'
                }`}
                onMouseEnter={e => showTooltip(e, f.dataUrl, f.fileName || f.name)}
                onMouseLeave={hideTooltip}
              >
                <Paperclip size={10} />
                <button
                  type="button"
                  onClick={() => f.dataUrl && setPreviewFile({ dataUrl: f.dataUrl, name: f.fileName || f.name, uploadedBy: f.uploadedBy, date: f.date })}
                  className={`cursor-pointer flex items-center gap-0.5 ${
                    onFile ? 'hover:text-emerald-900 dark:hover:text-emerald-200' : 'hover:text-blue-900 dark:hover:text-blue-200'
                  }`}
                >
                  {f.fileName || f.name} <Eye size={10} className="inline-block" />
                </button>
                {onFile && <span className="opacity-60 text-[9px] font-medium">(on file)</span>}
                {!isViewer && (
                  <button
                    type="button"
                    onClick={() => {
                      hideTooltip();
                      onRemove(f.id);
                    }}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Suggestions list */}
      {!isViewer && existingDocs.length > 0 && (
        <div className="mt-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/80 space-y-1.5">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
            Existing document found on file:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {existingDocs.map(d => (
              <span
                key={d.id}
                className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 text-[10px] font-medium border border-slate-250/60 dark:border-slate-800 cursor-default"
                onMouseEnter={e => showTooltip(e, d.dataUrl, d.name || d.fileName)}
                onMouseLeave={hideTooltip}
              >
                <Paperclip size={10} className="text-slate-400" />
                <span className="truncate max-w-[120px]" title={d.name || d.fileName}>
                  {d.name || d.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    hideTooltip();
                    handleUseExisting(d);
                  }}
                  className="ml-1 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 dark:bg-blue-955/40 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-[9px] transition-colors cursor-pointer"
                >
                  + Link
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {!isSatisfied && required && !isViewer && (
        <p className="text-[10px] text-blue-500 dark:text-blue-400 italic">Required — upload at least one file.</p>
      )}
    </div>
  );
}

// Per-AMC repeatable row list (e.g. Scheme Name + Folio No, or Scheme Name +
// Date + Amount) — lets the advisor add multiple entries under each selected
// AMC. Shared by Change of Broker and the SIP Consolidation/Cancellation/
// Registration NFT types.
export function AmcRepeatableFields({ amcs, entries, fields, onAdd, onRemove, onUpdate, isEditingMode, emptyHint }) {
  if (amcs.length === 0) {
    return <p className="text-xs text-amber-600 dark:text-amber-400 italic">Please select at least one AMC to add entries.</p>;
  }
  return (
    <div className="space-y-3">
      {amcs.map(amc => {
        const rows = (entries || {})[amc] || [];
        return (
          <div key={amc} className="p-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> {amc}
              </span>
              {isEditingMode && (
                <button type="button" onClick={() => onAdd(amc)} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer">
                  <Plus size={11} /> Add
                </button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">{emptyHint || 'No entries added yet.'}</p>
            ) : rows.map(row => (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                {fields.map(f => (
                  <input
                    key={f.key}
                    type={f.type || 'text'}
                    value={row[f.key] || ''}
                    onChange={e => onUpdate(amc, row.id, f.key, e.target.value)}
                    disabled={!isEditingMode}
                    placeholder={f.label}
                    className={inputCls + ' flex-1 min-w-[110px] py-1.5 text-xs' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')}
                  />
                ))}
                {isEditingMode && (
                  <button type="button" onClick={() => onRemove(amc, row.id)} className="text-rose-500 hover:text-rose-700 shrink-0 cursor-pointer">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Searchable Group Leader picker — combobox with a typeahead + dropdown that
// shows each client's PAN so the right group leader can be disambiguated.
export function GroupLeaderSelect({ options, value, pan, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = options.filter(o => {
    const s = q.toLowerCase().trim();
    return !s || o.name.toLowerCase().includes(s) || (o.pan || '').toLowerCase().includes(s);
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={selectCls + ' flex items-center justify-between text-left gap-2' + (disabled ? ' opacity-65 cursor-not-allowed bg-slate-50 dark:bg-slate-950/20' : '')}
      >
        <span className={`truncate ${value ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}>
          {value || 'Search & select group leader…'}
          {value && pan && <span className="ml-2 text-[10px] font-mono text-slate-400 dark:text-slate-500">{pan}</span>}
        </span>
        <ChevronDown size={15} className="text-slate-400 shrink-0" />
      </button>
      {open && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or PAN…" className={inputCls + ' pl-8 py-1.5 text-xs'} />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500 italic">No clients found.</div>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelect(o); setOpen(false); setQ(''); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-colors ${value === o.name ? 'bg-blue-50/40 dark:bg-slate-800/40' : ''}`}
              >
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{o.name}</span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">{o.pan || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskFormModal({ initial, clients, isViewer, onClose, onSave }) {
  const isEdit = !!initial;
  const [isEditingMode, setIsEditingMode] = useState(!isEdit);
  const [stage, setStage] = useState(initial?.stage || 'Open');
  const [stageRemark, setStageRemark] = useState('');
  const [groupLeaderId, setGroupLeaderId] = useState(initial?.groupLeaderId || '');
  const [groupLeader, setGroupLeader] = useState(initial?.groupLeader || '');
  const [pan, setPan] = useState(initial?.pan || '');
  const [applicant, setApplicant] = useState(initial?.applicant || '');
  const [relatedTo, setRelatedTo] = useState(initial?.relatedTo || '');
  const [nftType, setNftType] = useState(initial?.nftType || '');
  const [otherSpecify, setOtherSpecify] = useState(initial?.otherSpecify || '');
  const [amcs, setAmcs] = useState(Array.isArray(initial?.amcs) ? initial.amcs : []);
  // assigned_by is auto-captured as the current account for new tasks.
  const [assignedBy, setAssignedBy] = useState(initial?.assignedBy || getCurrentUser()?.id || '');
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || '');
  const [subPerson, setSubPerson] = useState(initial?.subPerson || '');
  const getTomorrowString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [dueDate, setDueDate] = useState(initial?.dueDate || getTomorrowString());
  const [description, setDescription] = useState(initial?.description || '');
  const [comments, setComments] = useState(Array.isArray(initial?.comments) ? initial.comments : []);

  // Dynamic NFT fields state
  const [nftFields, setNftFields] = useState(() => ({
    bankName: '',
    ifsc: '',
    micr: '',
    accountType: '',
    accountNo: '',
    newMobile: '',
    newMobileRelation: '',
    newEmail: '',
    newEmailRelation: '',
    mailId: '',
    mailIdRelation: '',
    mobileNo: '',
    mobileNoRelation: '',
    occupation: '',
    annualIncome: '',
    nomineeName: '',
    nomineeRelation: '',
    placeOfBirth: '',
    correctDob: '',
    oldIfsc: '',
    newIfsc: '',
    mandateMode: '',
    folios: {},
    targetFolios: {},
    sourceFolios: {},
    brokerSchemes: {},
    sipEntries: {},
    sipCancelEntries: {},
    sipRegisterEntries: {},
    ...(initial?.nftFields || {})
  }));

  // Task-specific documents
  const [documents, setDocuments] = useState(() => ({
    cancelledCheque: [],
    panCard: [],
    eAadhar: [],
    bankProof: [],
    nomineePanCard: [],
    ...(initial?.documents || {})
  }));

  // Must be declared before the useEffect below that depends on it
  const selectedClient = useMemo(
    () => clients.find(c => c.id === groupLeaderId) || clients.find(c => c.name === groupLeader) || null,
    [clients, groupLeaderId, groupLeader]
  );

  // Sync dataUrl from client attachments
  useEffect(() => {
    if (!selectedClient || !selectedClient.clientDetails?.attachments) return;
    const clientAttachments = selectedClient.clientDetails.attachments;
    setDocuments(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(catKey => {
        next[catKey] = (next[catKey] || []).map(f => {
          const matched = clientAttachments.find(a => a.id === f.id);
          if (matched && !f.dataUrl && (matched.dataUrl || matched.data)) {
            changed = true;
            return {
              ...f,
              dataUrl: matched.dataUrl || matched.data
            };
          }
          return f;
        });
      });
      return changed ? next : prev;
    });
  }, [selectedClient]);

  const addDocFiles = (category, files) => {
    setDocuments(prev => ({ ...prev, [category]: [...(prev[category] || []), ...files] }));
  };
  const removeDocFile = (category, fileId) => {
    setDocuments(prev => ({ ...prev, [category]: (prev[category] || []).filter(f => f.id !== fileId) }));
  };

  const syncDocumentsToClient = async (finalDocs) => {
    if (!selectedClient) return;
    const newAttachments = [];
    const docLabels = {
      cancelledCheque: 'Cancelled Cheque',
      panCard: 'PAN Card',
      eAadhar: 'Aadhaar Card',
      bankProof: 'Bank Proof',
      nomineePanCard: 'Nominee PAN Card'
    };
    Object.entries(finalDocs).forEach(([catKey, files]) => {
      const label = docLabels[catKey] || catKey;
      const fileApplicant = applicant.trim() || groupLeader.trim();
      const existingClientDocs = selectedClient.clientDetails?.attachments || [];
      const seedIds = new Set(
        initial?.documents ? Object.values(initial.documents).flatMap(a => (a || []).map(f => f.id)) : []
      );
      const withinBatchCount = {};
      (files || []).forEach(f => {
        const appName = f.applicantName || fileApplicant;
        const key = `${label}|||${appName}`;
        const priorCount = existingClientDocs.filter(a =>
          a.category?.toLowerCase() === label.toLowerCase() &&
          a.applicantName === appName &&
          !seedIds.has(a.id)
        ).length;
        withinBatchCount[key] = (withinBatchCount[key] || 0) + 1;
        const n = priorCount + withinBatchCount[key];
        const docName = n > 1 ? `${label} (${n})_${appName}` : `${label}_${appName}`;
        newAttachments.push({
          id: f.id,
          name: docName,
          fileName: f.fileName,
          fileType: f.fileType,
          dataUrl: f.dataUrl,
          date: f.date,
          uploadedBy: getCurrentUser()?.name || 'System',
          category: label,
          applicantName: appName,
          docNumber: n,
        });
      });
    });
    const originalIds = new Set();
    if (initial && initial.documents) {
      Object.values(initial.documents).forEach(arr => {
        (arr || []).forEach(f => {
          if (f.id) originalIds.add(f.id);
        });
      });
    }
    const existing = (selectedClient.clientDetails?.attachments || []).filter(ex => {
      if (newAttachments.some(n => n.id === ex.id)) return false;
      if (originalIds.has(ex.id)) {
        const originalFile = Object.values(initial.documents || {}).flatMap(a => a || []).find(f => f.id === ex.id);
        if (originalFile && originalFile.isExisting) {
          return true;
        }
        return false;
      }
      return true;
    });
    await updateClient(selectedClient.id, {
      clientDetails: { ...selectedClient.clientDetails, attachments: [...newAttachments, ...existing] }
    });
    if (window.refreshAppData) await window.refreshAppData();
  };

  const updateNftField = (field, value) => {
    setNftFields(prev => ({ ...prev, [field]: value }));
  };
  const updateAmcFolio = (amc, value) => {
    setNftFields(prev => ({
      ...prev,
      folios: { ...(prev.folios || {}), [amc]: value }
    }));
  };
  const updateAmcTargetFolio = (amc, value) => {
    setNftFields(prev => ({
      ...prev,
      targetFolios: { ...(prev.targetFolios || {}), [amc]: value }
    }));
  };
  const updateAmcSourceFolio = (amc, value) => {
    setNftFields(prev => ({
      ...prev,
      sourceFolios: { ...(prev.sourceFolios || {}), [amc]: value }
    }));
  };
  const addAmcListRow = (listKey, amc, emptyRow) => {
    setNftFields(prev => ({
      ...prev,
      [listKey]: {
        ...(prev[listKey] || {}),
        [amc]: [...((prev[listKey] || {})[amc] || []), { id: uid(), ...emptyRow }]
      }
    }));
  };
  const removeAmcListRow = (listKey, amc, rowId) => {
    setNftFields(prev => ({
      ...prev,
      [listKey]: {
        ...(prev[listKey] || {}),
        [amc]: ((prev[listKey] || {})[amc] || []).filter(r => r.id !== rowId)
      }
    }));
  };
  const updateAmcListRow = (listKey, amc, rowId, field, value) => {
    setNftFields(prev => ({
      ...prev,
      [listKey]: {
        ...(prev[listKey] || {}),
        [amc]: ((prev[listKey] || {})[amc] || []).map(r => r.id === rowId ? { ...r, [field]: value } : r)
      }
    }));
  };

  // Group Leaders = the clients themselves (entered as "Self"). The superset.
  const groupLeaders = useMemo(
    () => clients.map(c => ({ id: c.id, name: c.name, pan: c.pan })),
    [clients]
  );

  // Applicants = the subset: the client (Self) + all their family members.
  const applicantOptions = useMemo(() => {
    if (!selectedClient) return [];
    const opts = [{ name: selectedClient.name, relation: 'Self', pan: selectedClient.pan || '', dob: selectedClient.clientDetails?.dob || '' }];
    (selectedClient.clientDetails?.familyDetails || []).forEach(f => {
      if (f.name) opts.push({ name: f.name, relation: f.relation || 'Member', pan: f.pan || '', dob: f.dob || '' });
    });
    return opts;
  }, [selectedClient]);

  // Best-effort mapping from the client's stored profession to the KYC-style
  // Occupation dropdown options (same mapping used for the Insurance KYC auto-fetch).
  const mapOccupation = (prof) => {
    const p = (prof || '').toLowerCase();
    if (p.includes('salaried')) return 'Salaried';
    if (p.includes('self-employed') || p.includes('business') || p.includes('professional')) return 'Self Employed';
    if (p.includes('homemaker')) return 'House Wife';
    if (p.includes('retired')) return 'Retired';
    if (p.includes('student')) return 'Student';
    return '';
  };

  // Auto-map fields the client already has on file when the applicant / NFT
  // type make an obvious source field available — never overwrites a value
  // the advisor has already entered/edited.
  useEffect(() => {
    if (!isEditingMode || !selectedClient) return;
    if (nftType === 'DOB Updation') {
      const opt = applicantOptions.find(o => o.name === applicant);
      if (opt?.dob && !nftFields.correctDob) {
        setNftFields(prev => ({ ...prev, correctDob: opt.dob }));
      }
    }
    if (nftType === 'FATCA Updation') {
      const mapped = mapOccupation(selectedClient.clientDetails?.profession);
      if (mapped && !nftFields.occupation) {
        setNftFields(prev => ({ ...prev, occupation: mapped }));
      }
    }
  }, [nftType, applicant, selectedClient, isEditingMode]);

  // Auto-derive the task name: "<Applicant> - <Related module>"
  const relatedLabel = relatedTo === 'NFT' ? nftType : (relatedTo === 'Others' ? otherSpecify.trim() : '');
  const taskName = applicant && relatedLabel ? `${applicant} - ${relatedLabel}` : '';

  const handleGroupLeader = (gl) => {
    setGroupLeaderId(gl.id);
    setGroupLeader(gl.name);
    // Reset applicant/PAN — default the applicant to the group leader (Self)
    setApplicant(gl.name);
    setPan(gl.pan || '');
  };

  const handleApplicant = (name) => {
    setApplicant(name);
    const opt = applicantOptions.find(o => o.name === name);
    setPan(opt ? opt.pan : '');
  };

  const handleRelatedTo = (val) => {
    setRelatedTo(val);
    if (val !== 'NFT') { setNftType(''); setAmcs([]); }
    if (val !== 'Others') setOtherSpecify('');
  };

  const toggleAmc = (amc) => {
    setAmcs(prev => prev.includes(amc) ? prev.filter(a => a !== amc) : [...prev, amc]);
  };



  const handleCancel = () => {
    if (isEdit) {
      // Revert edits to initial
      setStage(initial?.stage || 'Open');
      setGroupLeaderId(initial?.groupLeaderId || '');
      setGroupLeader(initial?.groupLeader || '');
      setPan(initial?.pan || '');
      setApplicant(initial?.applicant || '');
      setRelatedTo(initial?.relatedTo || '');
      setNftType(initial?.nftType || '');
      setOtherSpecify(initial?.otherSpecify || '');
      setAmcs(Array.isArray(initial?.amcs) ? initial.amcs : []);
      setAssignedBy(initial?.assignedBy || '');
      setAssignedTo(initial?.assignedTo || '');
      setSubPerson(initial?.subPerson || '');
      setDueDate(initial?.dueDate || getTomorrowString());
      setDescription(initial?.description || '');
      setComments(Array.isArray(initial?.comments) ? initial.comments : []);
      setNftFields(initial?.nftFields || {});
      setDocuments(initial?.documents || {});
      setStageRemark('');
      setIsEditingMode(false);
    } else {
      onClose();
    }
  };

  const hasStageChanged = isEdit && stage !== (initial?.stage || 'Open');
  const logEntryCompulsory = hasStageChanged && !stageRemark.trim();

  // RBAC gating (mirrors the server): only the assigner (assignedBy) or Admin
  // may edit/reopen; the assignee cannot move a task to a previous stage.
  // Legacy tasks with no departmentOwner fall back to editable.
  const me = getCurrentUser();
  const canEditThis = !isEdit || isAdmin(me) || !initial?.departmentOwner || canEditTask(me, initial);
  const stageOk = !hasStageChanged || canChangeTaskStage(me, initial, initial?.stage || 'Open', stage);
  const permissionBlocked = isEdit && (!canEditThis || !stageOk);

  const canSave = !isViewer && canEditThis && stageOk && groupLeader && applicant && relatedTo && relatedLabel && (!hasStageChanged || stageRemark.trim());

  const handleSubmit = () => {
    if (logEntryCompulsory) {
      alert("A comment/log entry is compulsory when changing the task stage. Please add a log entry explaining the change.");
      return;
    }
    if (!canSave) return;

    const commentAuthor = getCurrentUser()?.name || 'System';
    let finalComments = [...comments];
    if (hasStageChanged) {
      finalComments.push({
        at: new Date().toISOString(),
        by: commentAuthor,
        text: `Stage changed from ${initial?.stage || 'Open'} to ${stage} | ${stageRemark.trim()}`
      });
    } else if (stageRemark.trim()) {
      finalComments.push({
        at: new Date().toISOString(),
        by: commentAuthor,
        text: stageRemark.trim()
      });
    }

    const safeDocuments = {};
    Object.entries(documents).forEach(([key, files]) => {
      safeDocuments[key] = (files || []).map(({ dataUrl, data, ...meta }) => meta);
    });

    const task = {
      id: initial?.id || uid(),
      leadId: initial?.leadId || undefined,
      taskName,
      stage: isEdit ? stage : 'Open',
      groupLeader,
      groupLeaderId,
      pan,
      applicant,
      relatedTo,
      nftType: relatedTo === 'NFT' ? nftType : '',
      otherSpecify: relatedTo === 'Others' ? otherSpecify.trim() : '',
      amcs: relatedTo === 'NFT' ? amcs : [],
      nftFields: relatedTo === 'NFT' ? nftFields : {},
      documents: relatedTo === 'NFT' ? safeDocuments : {},
      assignedBy,
      assignedTo,
      subPerson,
      dueDate,
      description,
      comments: finalComments,
      createdAt: initial?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(task);
    if (relatedTo === 'NFT') {
      syncDocumentsToClient(documents).catch(err => console.error('Failed to sync documents to client:', err));
    }
  };

  const renderNftTypeFields = () => {
    if (relatedTo !== 'NFT') return null;

    const inputStyle = inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '');
    const selectStyle = selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '');

    if (nftType === 'NSE Bank Addition') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            NSE Bank Addition Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Bank Name *">
              <input value={nftFields.bankName || ''} onChange={e => updateNftField('bankName', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="IFSC *">
              <input value={nftFields.ifsc || ''} onChange={e => updateNftField('ifsc', e.target.value.toUpperCase())} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. HDFC0000123" />
            </Field>
            <Field label="MICR">
              <input value={nftFields.micr || ''} onChange={e => updateNftField('micr', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="9-digit MICR code" />
            </Field>
            <Field label="Account Type *">
              <CoolSelect value={nftFields.accountType || ''} onChange={e => updateNftField('accountType', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select type…</option>
                <option value="Saving">Saving</option>
                <option value="Current">Current</option>
              </CoolSelect>
            </Field>
            <div className="sm:col-span-2">
              <DocUploadGroup
                label="Upload Cancelled Cheque or Statement *"
                required
                files={documents.cancelledCheque || []}
                onAdd={(files) => addDocFiles('cancelledCheque', files)}
                onRemove={(fileId) => removeDocFile('cancelledCheque', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Cancelled Cheque', documents.cancelledCheque).concat(existingDocsFor(selectedClient, '6 Month Bank Statement', documents.cancelledCheque))}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
            </div>
          </div>
        </div>
      );
    }

    if (nftType === 'Change of Bank') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Change of Bank Details (New Bank Details)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Bank Name *">
              <input value={nftFields.bankName || ''} onChange={e => updateNftField('bankName', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. ICICI Bank" />
            </Field>
            <Field label="A/c No. *">
              <input value={nftFields.accountNo || ''} onChange={e => updateNftField('accountNo', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="Account number" />
            </Field>
            <Field label="IFSC *">
              <input value={nftFields.ifsc || ''} onChange={e => updateNftField('ifsc', e.target.value.toUpperCase())} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. ICIC0000123" />
            </Field>
            <Field label="MICR">
              <input value={nftFields.micr || ''} onChange={e => updateNftField('micr', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="9-digit MICR code" />
            </Field>
            <Field label="Account Type *">
              <CoolSelect value={nftFields.accountType || ''} onChange={e => updateNftField('accountType', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select type…</option>
                <option value="Saving">Saving</option>
                <option value="Current">Current</option>
              </CoolSelect>
            </Field>
            <div className="sm:col-span-2">
              <DocUploadGroup
                label="Upload Cancelled Cheque or Statement of Old or New Bank *"
                required
                files={documents.cancelledCheque || []}
                onAdd={(files) => addDocFiles('cancelledCheque', files)}
                onRemove={(fileId) => removeDocFile('cancelledCheque', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Cancelled Cheque', documents.cancelledCheque).concat(existingDocsFor(selectedClient, '6 Month Bank Statement', documents.cancelledCheque))}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
            </div>
          </div>

          {/* Folios in front of AMC */}
          {amcs.length > 0 && (
            <div className="pt-3 border-t border-blue-100 dark:border-slate-800 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Folios In Front of Selected AMCs</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {amcs.map(amc => (
                  <div key={amc} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-bold text-slate-700 dark:text-slate-350">{amc}</span>
                    <input
                      value={nftFields.folios?.[amc] || ''}
                      onChange={e => updateAmcFolio(amc, e.target.value)}
                      disabled={!isEditingMode}
                      placeholder="Folio No."
                      className={inputStyle + ' flex-1 py-1.5 text-xs'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (nftType === 'Change of Contact Details') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Change of Contact Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="New Mobile No. *">
              <input value={nftFields.newMobile || ''} onChange={e => updateNftField('newMobile', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="+91" />
            </Field>
            <Field label="Mobile Relation">
              <CoolSelect value={nftFields.newMobileRelation || ''} onChange={e => updateNftField('newMobileRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <Field label="New Email ID *">
              <input type="email" value={nftFields.newEmail || ''} onChange={e => updateNftField('newEmail', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="new@example.com" />
            </Field>
            <Field label="Email Relation">
              <CoolSelect value={nftFields.newEmailRelation || ''} onChange={e => updateNftField('newEmailRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
          </div>

          {/* Folios in front of AMC */}
          {amcs.length > 0 && (
            <div className="pt-3 border-t border-blue-100 dark:border-slate-800 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Folios In Front of Selected AMCs</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {amcs.map(amc => (
                  <div key={amc} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-bold text-slate-700 dark:text-slate-350">{amc}</span>
                    <input
                      value={nftFields.folios?.[amc] || ''}
                      onChange={e => updateAmcFolio(amc, e.target.value)}
                      disabled={!isEditingMode}
                      placeholder="Folio No."
                      className={inputStyle + ' flex-1 py-1.5 text-xs'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (nftType === 'Folio Consolidation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Folio Consolidation Details
          </h4>
          {amcs.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 italic">Please select at least one AMC to specify target and source folios.</p>
          ) : (
            <div className="space-y-3">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Target &amp; Source Folios Per AMC</h5>
              {amcs.map(amc => (
                <div key={amc} className="p-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> {amc}
                  </div>
                  <Field label="Target Folio No. *">
                    <input
                      value={nftFields.targetFolios?.[amc] || ''}
                      onChange={e => updateAmcTargetFolio(amc, e.target.value)}
                      disabled={!isEditingMode}
                      placeholder="Enter target folio"
                      className={inputStyle + ' py-1.5 text-xs'}
                    />
                  </Field>
                  <Field label="Source Folio No. *">
                    <input
                      value={nftFields.sourceFolios?.[amc] || ''}
                      onChange={e => updateAmcSourceFolio(amc, e.target.value)}
                      disabled={!isEditingMode}
                      placeholder="Enter source folios"
                      className={inputStyle + ' py-1.5 text-xs'}
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (nftType === 'IIN, Mandate and FATCA Creation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/20 dark:bg-violet-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wider pl-2 border-l-2 border-violet-500">
            IIN, Mandate and FATCA Creation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mail ID *">
              <input type="email" value={nftFields.mailId || ''} onChange={e => updateNftField('mailId', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="mail@example.com" />
            </Field>
            <Field label="Mail ID Relation *">
              <CoolSelect value={nftFields.mailIdRelation || ''} onChange={e => updateNftField('mailIdRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Mobile No. *">
              <input value={nftFields.mobileNo || ''} onChange={e => updateNftField('mobileNo', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="+91" />
            </Field>
            <Field label="Mobile No. Relation *">
              <CoolSelect value={nftFields.mobileNoRelation || ''} onChange={e => updateNftField('mobileNoRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Occupation *">
              <CoolSelect value={nftFields.occupation || ''} onChange={e => updateNftField('occupation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select occupation…</option>
                <option value="Salaried">Salaried</option>
                <option value="Self Employed">Self Employed</option>
                <option value="House Wife">House Wife</option>
                <option value="Business">Business</option>
                <option value="Retired">Retired</option>
                <option value="Student">Student</option>
                <option value="Other">Other</option>
              </CoolSelect>
            </Field>
            <Field label="Annual Income *">
              <CoolSelect value={nftFields.annualIncome || ''} onChange={e => updateNftField('annualIncome', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select income range…</option>
                <option value="0 to 5">0 to 5 Lakhs</option>
                <option value="5 to 10">5 to 10 Lakhs</option>
                <option value="10 to 25">10 to 25 Lakhs</option>
                <option value="25 and Above">25 Lakhs and Above</option>
              </CoolSelect>
            </Field>
            <Field label="Nominee Name">
              <input value={nftFields.nomineeName || ''} onChange={e => updateNftField('nomineeName', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="Nominee full name" />
            </Field>
            <Field label="Nominee Relation">
              <CoolSelect value={nftFields.nomineeRelation || ''} onChange={e => updateNftField('nomineeRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Place of Birth *">
              <input value={nftFields.placeOfBirth || ''} onChange={e => updateNftField('placeOfBirth', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="City, Country" />
            </Field>
          </div>

          {/* Document Upload Section */}
          <div className="pt-3 border-t border-violet-100 dark:border-slate-800 space-y-3">
            <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Required Document Uploads</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DocUploadGroup
                label="PAN Card *"
                required
                files={documents.panCard || []}
                onAdd={(files) => addDocFiles('panCard', files)}
                onRemove={(fileId) => removeDocFile('panCard', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'PAN Card', documents.panCard)}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
              <DocUploadGroup
                label="E-Aadhar *"
                required
                files={documents.eAadhar || []}
                onAdd={(files) => addDocFiles('eAadhar', files)}
                onRemove={(fileId) => removeDocFile('eAadhar', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Aadhaar Card', documents.eAadhar)}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
              <DocUploadGroup
                label="Bank Proof *"
                required
                files={documents.bankProof || []}
                onAdd={(files) => addDocFiles('bankProof', files)}
                onRemove={(fileId) => removeDocFile('bankProof', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Cancelled Cheque', documents.bankProof).concat(existingDocsFor(selectedClient, '6 Month Bank Statement', documents.bankProof))}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
              <DocUploadGroup
                label="Nominee PAN Card"
                files={documents.nomineePanCard || []}
                onAdd={(files) => addDocFiles('nomineePanCard', files)}
                onRemove={(fileId) => removeDocFile('nomineePanCard', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Nominee PAN Card', documents.nomineePanCard).concat(existingDocsFor(selectedClient, 'PAN Card', documents.nomineePanCard))}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
            </div>
          </div>
        </div>
      );
    }

    if (nftType === 'Change of Broker') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Change of Broker Details
          </h4>
          <div className="space-y-2">
            <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scheme Names &amp; Folio No. In Front of Selected AMCs</h5>
            <AmcRepeatableFields
              amcs={amcs}
              entries={nftFields.brokerSchemes || {}}
              fields={[{ key: 'schemeName', label: 'Scheme Name' }, { key: 'folioNo', label: 'Folio No.' }]}
              onAdd={(amc) => addAmcListRow('brokerSchemes', amc, { schemeName: '', folioNo: '' })}
              onRemove={(amc, rowId) => removeAmcListRow('brokerSchemes', amc, rowId)}
              onUpdate={(amc, rowId, field, value) => updateAmcListRow('brokerSchemes', amc, rowId, field, value)}
              isEditingMode={isEditingMode}
            />
          </div>
        </div>
      );
    }

    if (nftType === 'SIP Consolidation') {
      const sipFields = [{ key: 'schemeName', label: 'Scheme Name' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount', type: 'number' }];
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-5 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            SIP Consolidation Details
          </h4>
          <div className="space-y-2">
            <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SIP Cancellation — Scheme Names, Date &amp; Amount In Front of Selected AMCs</h5>
            <AmcRepeatableFields
              amcs={amcs}
              entries={nftFields.sipCancelEntries || {}}
              fields={sipFields}
              onAdd={(amc) => addAmcListRow('sipCancelEntries', amc, { schemeName: '', date: '', amount: '' })}
              onRemove={(amc, rowId) => removeAmcListRow('sipCancelEntries', amc, rowId)}
              onUpdate={(amc, rowId, field, value) => updateAmcListRow('sipCancelEntries', amc, rowId, field, value)}
              isEditingMode={isEditingMode}
            />
          </div>
          <div className="space-y-2 pt-4 border-t border-blue-100 dark:border-slate-800">
            <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SIP Registration — Scheme Names, Date &amp; Amount In Front of Selected AMCs</h5>
            <AmcRepeatableFields
              amcs={amcs}
              entries={nftFields.sipRegisterEntries || {}}
              fields={sipFields}
              onAdd={(amc) => addAmcListRow('sipRegisterEntries', amc, { schemeName: '', date: '', amount: '' })}
              onRemove={(amc, rowId) => removeAmcListRow('sipRegisterEntries', amc, rowId)}
              onUpdate={(amc, rowId, field, value) => updateAmcListRow('sipRegisterEntries', amc, rowId, field, value)}
              isEditingMode={isEditingMode}
            />
          </div>
        </div>
      );
    }

    if (['SIP Cancellation', 'SIP Registration'].includes(nftType)) {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            {nftType} Details
          </h4>
          <div className="space-y-2">
            <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scheme Names, Date &amp; Amount In Front of Selected AMCs</h5>
            <AmcRepeatableFields
              amcs={amcs}
              entries={nftFields.sipEntries || {}}
              fields={[{ key: 'schemeName', label: 'Scheme Name' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount', type: 'number' }]}
              onAdd={(amc) => addAmcListRow('sipEntries', amc, { schemeName: '', date: '', amount: '' })}
              onRemove={(amc, rowId) => removeAmcListRow('sipEntries', amc, rowId)}
              onUpdate={(amc, rowId, field, value) => updateAmcListRow('sipEntries', amc, rowId, field, value)}
              isEditingMode={isEditingMode}
            />
          </div>
        </div>
      );
    }

    if (nftType === 'DOB Updation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            DOB Updation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Correct DOB *" hint="Auto-filled from applicant's DOB on file, if available">
              <input type="date" value={nftFields.correctDob || ''} onChange={e => updateNftField('correctDob', e.target.value)} disabled={!isEditingMode} className={inputStyle} />
            </Field>
          </div>
        </div>
      );
    }

    if (nftType === 'Nominee Updation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Nominee Updation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nominee Name *">
              <input value={nftFields.nomineeName || ''} onChange={e => updateNftField('nomineeName', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="Nominee full name" />
            </Field>
            <Field label="Nominee Relation *">
              <CoolSelect value={nftFields.nomineeRelation || ''} onChange={e => updateNftField('nomineeRelation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select relation…</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <div className="sm:col-span-2">
              <DocUploadGroup
                label="Nominee PAN Card"
                required
                files={documents.nomineePanCard || []}
                onAdd={(files) => addDocFiles('nomineePanCard', files)}
                onRemove={(fileId) => removeDocFile('nomineePanCard', fileId)}
                existingDocs={existingDocsFor(selectedClient, 'Nominee PAN Card', documents.nomineePanCard).concat(existingDocsFor(selectedClient, 'PAN Card', documents.nomineePanCard))}
                clientAttachments={selectedClient?.clientDetails?.attachments || []}
                isViewer={isViewer || !isEditingMode}
              />
            </div>
          </div>
        </div>
      );
    }

    if (nftType === 'Change of IFSC') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Change of IFSC Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Old IFSC *">
              <input value={nftFields.oldIfsc || ''} onChange={e => updateNftField('oldIfsc', e.target.value.toUpperCase())} disabled={!isEditingMode} className={inputStyle} placeholder="Old IFSC code" />
            </Field>
            <Field label="New IFSC *">
              <input value={nftFields.newIfsc || ''} onChange={e => updateNftField('newIfsc', e.target.value.toUpperCase())} disabled={!isEditingMode} className={inputStyle} placeholder="New IFSC code" />
            </Field>
          </div>

          {/* Folios in front of AMC */}
          {amcs.length > 0 && (
            <div className="pt-3 border-t border-blue-100 dark:border-slate-800 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Folios In Front of Selected AMCs</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {amcs.map(amc => (
                  <div key={amc} className="flex items-center gap-2">
                    <span className="w-16 text-xs font-bold text-slate-700 dark:text-slate-350">{amc}</span>
                    <input
                      value={nftFields.folios?.[amc] || ''}
                      onChange={e => updateAmcFolio(amc, e.target.value)}
                      disabled={!isEditingMode}
                      placeholder="Folio No."
                      className={inputStyle + ' flex-1 py-1.5 text-xs'}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (nftType === 'Mandate Creation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            Mandate Creation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mode *">
              <CoolSelect value={nftFields.mandateMode || ''} onChange={e => updateNftField('mandateMode', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select mode…</option>
                <option value="Online">Online</option>
                <option value="Physical">Physical</option>
              </CoolSelect>
            </Field>
            <Field label="Bank Name *">
              <input value={nftFields.bankName || ''} onChange={e => updateNftField('bankName', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="A/c No. *">
              <input value={nftFields.accountNo || ''} onChange={e => updateNftField('accountNo', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="Account number" />
            </Field>
            <Field label="IFSC *">
              <input value={nftFields.ifsc || ''} onChange={e => updateNftField('ifsc', e.target.value.toUpperCase())} disabled={!isEditingMode} className={inputStyle} placeholder="e.g. HDFC0000123" />
            </Field>
            <Field label="MICR">
              <input value={nftFields.micr || ''} onChange={e => updateNftField('micr', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="9-digit MICR code" />
            </Field>
            <Field label="Account Type *">
              <CoolSelect value={nftFields.accountType || ''} onChange={e => updateNftField('accountType', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select type…</option>
                <option value="Saving">Saving</option>
                <option value="Current">Current</option>
              </CoolSelect>
            </Field>
          </div>
        </div>
      );
    }

    if (nftType === 'FATCA Updation') {
      return (
        <div className="md:col-span-2 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider pl-2 border-l-2 border-blue-500">
            FATCA Updation Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Annual Income *">
              <CoolSelect value={nftFields.annualIncome || ''} onChange={e => updateNftField('annualIncome', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select income range…</option>
                <option value="0 to 5">0 to 5 Lakhs</option>
                <option value="5 to 10">5 to 10 Lakhs</option>
                <option value="10 to 25">10 to 25 Lakhs</option>
                <option value="25 and Above">25 Lakhs and Above</option>
              </CoolSelect>
            </Field>
            <Field label="Place of Birth *">
              <input value={nftFields.placeOfBirth || ''} onChange={e => updateNftField('placeOfBirth', e.target.value)} disabled={!isEditingMode} className={inputStyle} placeholder="City, Country" />
            </Field>
            <Field label="Occupation *" hint="Auto-filled from the client's profession on file, if available">
              <CoolSelect value={nftFields.occupation || ''} onChange={e => updateNftField('occupation', e.target.value)} disabled={!isEditingMode} className={selectStyle}>
                <option value="">Select occupation…</option>
                <option value="Salaried">Salaried</option>
                <option value="Self Employed">Self Employed</option>
                <option value="House Wife">House Wife</option>
                <option value="Business">Business</option>
                <option value="Retired">Retired</option>
                <option value="Student">Student</option>
                <option value="Other">Other</option>
              </CoolSelect>
            </Field>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {isEditingMode ? (isEdit ? <Pencil size={15} /> : <Plus size={16} />) : <ListChecks size={15} />}
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {isEditingMode ? (isEdit ? 'Edit Task' : 'New Task') : 'Task Details'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Auto-generated Task Name */}
          <div className="md:col-span-2">
            <Field label="Task Name" hint="Auto-generated from Applicant + Related module">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-semibold text-slate-800 dark:text-slate-200">
                {taskName || <span className="text-slate-400 dark:text-slate-600 font-normal italic">Select applicant &amp; related module…</span>}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Group Leader *" hint="The client (entered as Self) — the family/group head">
              <GroupLeaderSelect options={groupLeaders} value={groupLeader} pan={selectedClient?.pan} onSelect={handleGroupLeader} disabled={!isEditingMode} />
            </Field>
            <Field label="Applicant *" hint="A member of the selected group">
              <CoolSelect showValueOnSelect={true} value={applicant} onChange={(e) => handleApplicant(e.target.value)} disabled={!selectedClient || !isEditingMode} className={selectCls + (!selectedClient || !isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                <option value="">{selectedClient ? 'Select applicant…' : 'Select a group leader first'}</option>
                {applicantOptions.map(o => <option key={o.name} value={o.name}>{o.name} — {o.relation}</option>)}
                {applicant && !applicantOptions.some(o => o.name === applicant) && <option value={applicant}>{applicant}</option>}
              </CoolSelect>
            </Field>
            <Field label="PAN" hint="Auto-fetched from applicant">
              <input value={pan} readOnly placeholder="Auto" className={inputCls + ' font-mono tracking-widest uppercase bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400'} />
            </Field>

            {isEdit && (
              <Field label="Stage">
                <CoolSelect
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value);
                    if (e.target.value === (initial?.stage || 'Open')) {
                      setStageRemark('');
                    }
                  }}
                  className={selectCls}
                >
                  {TASK_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </CoolSelect>
              </Field>
            )}


            {!isEdit && (
              <Field label="Stage" hint="New tasks always start as Open">
                <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
                  <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME['Open']}`}>Open</span>
                </div>
              </Field>
            )}

            {/* Related to */}
            <Field label="Related To *">
              <CoolSelect value={relatedTo} onChange={(e) => handleRelatedTo(e.target.value)} disabled={!isEditingMode} className={selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                <option value="">Select…</option>
                {RELATED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </CoolSelect>
            </Field>
            {relatedTo === 'NFT' && (
              <Field label="NFT Type *">
                <CoolSelect value={nftType} onChange={(e) => setNftType(e.target.value)} disabled={!isEditingMode} className={selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                  <option value="">Select NFT type…</option>
                  {NFT_TYPES.map(n => <option key={n} value={n}>{n}</option>)}
                </CoolSelect>
              </Field>
            )}
            {relatedTo === 'Others' && (
              <Field label="Please Specify *">
                <input value={otherSpecify} onChange={(e) => setOtherSpecify(e.target.value)} disabled={!isEditingMode} placeholder="Specify the request…" className={inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} />
              </Field>
            )}

            {/* AMC multi-select (only for NFT) */}
            {relatedTo === 'NFT' && (
              <div className="md:col-span-2">
                <Field label={`Select AMC ${amcs.length ? `(${amcs.length} selected)` : '(multi-select)'}`}>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30">
                    {AMC_LIST.map(amc => {
                      const on = amcs.includes(amc);
                      return (
                        <button
                          key={amc}
                          type="button"
                          disabled={!isEditingMode}
                          onClick={() => toggleAmc(amc)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            on
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-400'
                          } ${!isEditingMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {on && <Check size={11} />} {amc}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}

            {renderNftTypeFields()}

            <Field label="Created Date & Time" hint="Set automatically">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 tabular-nums">
                {initial?.createdAt ? fmtTaskStamp(initial.createdAt) : 'On save'}
              </div>
            </Field>
            <Field label="Due Date">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!isEditingMode} className={inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} />
            </Field>

            <Field label="Assigned By">
              <CoolSelect value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} disabled={!isEditingMode} className={selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                <option value="">Select…</option>
                {loadTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Assigned To">
              <CoolSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={!isEditingMode} className={selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                <option value="">Select…</option>
                {loadTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Sub Person">
              <CoolSelect value={subPerson} onChange={(e) => setSubPerson(e.target.value)} disabled={!isEditingMode} className={selectCls + (!isEditingMode ? ' opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-955/20' : '')}>
                <option value="">Select…</option>
                {loadTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>

            <div className="md:col-span-2">
              <Field label="Description">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isEditingMode} rows={3} placeholder="Details of the task…" className={inputCls + ' resize-y' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} />
              </Field>
            </div>
          </div>

          {/* Comments / Logs */}
          {isEdit && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare size={14} /> Comments &amp; Logs
              </h4>
              {comments.length > 0 ? (
                <ol className="space-y-3 max-h-48 overflow-y-auto pl-3 pr-1">
                  {comments.map((c, i) => {
                    const stageChangeMatch = c.text.match(/^Stage changed from (.*) to (.*?)(?:\s*\|\s*(.*))?$/);
                    if (stageChangeMatch) {
                      const fromStage = stageChangeMatch[1];
                      const toStage = stageChangeMatch[2];
                      const remark = stageChangeMatch[3];
                      return (
                        <li key={i} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                          <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{fmtTaskStamp(c.at)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${STAGE_THEME[fromStage] || 'bg-slate-50 text-slate-700'}`}>{fromStage}</span>
                              <ArrowRight size={11} className="text-slate-450" />
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${STAGE_THEME[toStage] || 'bg-slate-50 text-slate-700'}`}>{toStage}</span>
                            </div>
                            {remark && (
                              <p className="text-sm text-slate-650 dark:text-slate-350 leading-relaxed font-sans mt-1">
                                {remark}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                          {fmtTaskStamp(c.at)}
                          {c.by && <span className="text-blue-500 dark:text-blue-400 font-semibold ml-1.5">• {c.by}</span>}
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words break-all leading-relaxed">{c.text}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No comments yet.</p>
              )}

            </div>
          )}

          {/* New comment input area (shifted to bottom, below comments timeline) */}
          {isEdit && !isViewer && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              {hasStageChanged ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/15 p-4">
                  <Field label={`Reason for stage change → ${stage} *`} hint="Required whenever the task stage changes">
                    <textarea
                      value={stageRemark}
                      onChange={(e) => setStageRemark(e.target.value)}
                      rows={2}
                      className={inputCls + ' resize-y'}
                      placeholder="Explain why the stage changed…"
                    />
                  </Field>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/10 p-4">
                  <Field label="Add log / comment entry">
                    <textarea
                      value={stageRemark}
                      onChange={(e) => setStageRemark(e.target.value)}
                      rows={2}
                      className={inputCls + ' resize-y'}
                      placeholder="Type a log entry or note…"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end items-center gap-2">
          {logEntryCompulsory && (
            <span className="text-xs text-rose-500 font-semibold mr-auto">
              * Log entry required for stage change
            </span>
          )}
          {permissionBlocked && !logEntryCompulsory && (
            <span className="text-xs text-rose-500 font-semibold mr-auto">
              {!stageOk ? 'Only the person who assigned this task can move it to an earlier stage.'
                       : 'Only the person who assigned this task (or an Admin) can edit it.'}
            </span>
          )}
          {isEditingMode || hasStageChanged || stageRemark.trim() ? (
            <>
              <button onClick={handleCancel} className={btnGhost}>Cancel</button>
              <button onClick={handleSubmit} disabled={!canSave} className={btnPrimary}>
                {isEdit ? 'Save Changes' : 'Create Task'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={btnGhost}>Close</button>
              {/* "Edit Task" (full details edit) only for the assigner or Admin.
                  The assignee + sub-person don't see it — but the Stage
                  dropdown above stays enabled for them, so they can still move
                  the stage forward (which is all they're allowed to do). */}
              {!isViewer && canEditThis && (
                <button onClick={() => setIsEditingMode(true)} className={btnPrimary}>
                  Edit Task
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
