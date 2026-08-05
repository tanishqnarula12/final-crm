import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Search, Trash2, HelpCircle, MessageSquare, ArrowRight, Paperclip, Download, FileText, Image as ImageIcon, Film, Eye, ScrollText, UploadCloud } from 'lucide-react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { loadTeam, teamName } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canCreateQuery, canEditQuery, canChangeQueryStage, isAdmin } from '../utils/permissions';
import {
  loadQueries, saveQueries, QUERY_STAGES, QUERY_CATEGORIES, STAGE_THEME, fmtQueryStamp,
  fetchQueryAttachments, fetchQueryAttachment, uploadQueryAttachment, deleteQueryAttachment, fetchQueryActivity,
  MAX_ATTACHMENT_BYTES, ATTACHMENT_ACCEPT, humanFileSize, previewKind,
} from '../utils/queries';
import { uid } from '../utils/calc';

// --- Activity log (audit trail) display helpers ------------------------
// action -> human label. Mirrors what syncModule.js actually logs for
// queries (see server/src/lib/syncModule.js): CREATE, UPDATE (category/text
// edits — stage and assignedTo get their own more specific entries below),
// STAGE_CHANGE, ASSIGN.
const ACTIVITY_ACTION_LABEL = {
  CREATE: 'Raised the query',
  UPDATE: 'Edited the query',
  STAGE_CHANGE: 'Changed the stage',
  ASSIGN: 'Reassigned the query',
  DELETE: 'Deleted the query',
};
const ACTIVITY_FIELD_LABEL = { category: 'Category', query: 'Query Text', stage: 'Stage', assignedTo: 'Raised To' };
// A CREATE entry's newValue is a compact snapshot for the admin activity-log
// dashboard (id/stage/createdBy/assignedTo — see summarize() in
// syncModule.js), not a "what changed" diff — there's nothing to have
// changed FROM on the very first row. Only these actions represent an actual
// before/after change worth breaking down field-by-field.
const ACTIVITY_DIFF_ACTIONS = new Set(['UPDATE', 'STAGE_CHANGE', 'ASSIGN']);
// assignedTo values are user ids (resolve to a name); everything else is
// already a plain display string. Long free text is truncated so one entry
// never blows out the log's height.
const fmtActivityVal = (field, v) => {
  if (v == null || v === '') return '—';
  const s = field === 'assignedTo' ? (teamName(v) || v) : String(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};

export default function QueriesView({ isViewer, activeQueryId, setActiveQueryId, onOpenQuery, queriesChangeCounter }) {
  const mayCreateQuery = !isViewer && canCreateQuery(getCurrentUser());
  const [queries, setQueries] = useState(() => loadQueries());
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('Open');
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
        <FilterChip label="Open" count={counts['Open']} active={stageFilter === 'Open'} onClick={() => setStageFilter('Open')} />
        <FilterChip label="All" count={counts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
        {QUERY_STAGES.filter(s => s !== 'Open').map(s => (
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
                  <th className="text-left px-6 py-4 font-bold whitespace-nowrap">Created</th>
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
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">{q.createdAt ? fmtQueryStamp(q.createdAt) : '—'}</td>
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

  // --- Attachments (existing queries only — a file needs a saved query to hang
  // off. Uploads/removals hit their own endpoints immediately, independently of
  // this form's Save, so they never ride along in the bulk query payload.) ---
  const [attachments, setAttachments] = useState([]);
  // Files picked while RAISING a query: there's no query row to hang them off
  // yet, so they're held here and uploaded right after the query is created
  // (App.handleSaveQueryGlobal does it, since this modal unmounts on save).
  const [pendingFiles, setPendingFiles] = useState([]);
  const [attBusy, setAttBusy] = useState(false);
  const [attError, setAttError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!isEdit || !initial?.id) return;
    let cancelled = false;
    fetchQueryAttachments(initial.id)
      .then(({ attachments: list }) => { if (!cancelled) setAttachments(list || []); })
      .catch(() => { if (!cancelled) setAttError('Could not load attachments.'); });
    return () => { cancelled = true; };
  }, [isEdit, initial?.id]);

  // --- Activity log — the audit trail (category/text edits, stage moves,
  // reassignment), distinct from Remarks (the conversation thread above).
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!isEdit || !initial?.id) return;
    let cancelled = false;
    setActivityLoading(true);
    fetchQueryActivity(initial.id)
      .then((logs) => { if (!cancelled) setActivity(logs || []); })
      .catch(() => { /* the log is a nicety — a failed fetch shouldn't block the rest of the modal */ })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, [isEdit, initial?.id]);

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

  const handleFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setAttError('');
    setAttBusy(true);
    try {
      for (const file of list) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttError(`"${file.name}" is larger than 5MB.`);
          continue;
        }
        const dataUrl = await readAsDataUrl(file);
        const meta = {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
        };
        if (isEdit) {
          const { attachment } = await uploadQueryAttachment(initial.id, meta);
          setAttachments((prev) => [...prev, attachment]);
        } else {
          setPendingFiles((prev) => [...prev, meta]);
        }
      }
    } catch (err) {
      setAttError(err?.message || 'Upload failed.');
    } finally {
      setAttBusy(false);
    }
  };

  // Ctrl+V while focus is on the remark box — a pasted image (e.g. a
  // screenshot) attaches the same way a picked file would, via handleFiles.
  // Pasted plain text is left alone so normal typing/pasting a remark still
  // works untouched.
  const handleRemarkPaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type?.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  // Explicit "Paste" button — for when focus isn't on the remark box, or the
  // image was copied without a keyboard paste. Uses the async Clipboard API
  // (Chrome/Edge; not universally supported, hence the try/catch message).
  const handlePasteButton = async () => {
    setAttError('');
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (!imgType) continue;
        const blob = await item.getType(imgType);
        const ext = imgType.split('/')[1] || 'png';
        files.push(new File([blob], `pasted-image-${Date.now()}.${ext}`, { type: imgType }));
      }
      if (!files.length) { setAttError('No image found on the clipboard.'); return; }
      await handleFiles(files);
    } catch (err) {
      setAttError('Could not read the clipboard — copy an image first, or use "Attach file" instead.');
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer?.files);
  };

  // --- Previews -------------------------------------------------------------
  // Images, videos and PDFs render inline (hover for a peek, click the eye for
  // a full view) so nobody has to download a file just to look at it. Blobs are
  // fetched on demand and cached per attachment, so hovering the same row
  // repeatedly costs one request, not one per hover.
  const blobCache = useRef(new Map());
  const [hoverPreview, setHoverPreview] = useState(null); // { att, dataUrl, top, left }
  const [lightbox, setLightbox] = useState(null);         // { att, dataUrl }
  const hoverToken = useRef(0);

  const loadBlob = async (att) => {
    if (blobCache.current.has(att.id)) return blobCache.current.get(att.id);
    const { attachment } = await fetchQueryAttachment(initial.id, att.id);
    blobCache.current.set(att.id, attachment.dataUrl);
    return attachment.dataUrl;
  };

  const showHoverPreview = async (att, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const token = ++hoverToken.current;
    try {
      const dataUrl = await loadBlob(att);
      // The pointer may have moved on while the blob was loading — only show
      // the preview if this is still the row being hovered.
      if (hoverToken.current !== token) return;
      setHoverPreview({ att, dataUrl, top: rect.top, left: rect.right + 12 });
    } catch { /* preview is a nicety — failing silently is fine, download still works */ }
  };
  const hideHoverPreview = () => { hoverToken.current++; setHoverPreview(null); };

  const openPreview = async (att) => {
    setAttError('');
    hideHoverPreview();
    try {
      setLightbox({ att, dataUrl: await loadBlob(att) });
    } catch (err) {
      setAttError(err?.message || 'Could not preview that file.');
    }
  };

  // Pull the blob only when the user actually opens the file, then hand it to
  // the browser as a download.
  const openAttachment = async (att) => {
    setAttError('');
    try {
      const { attachment } = await fetchQueryAttachment(initial.id, att.id);
      const a = document.createElement('a');
      a.href = attachment.dataUrl;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setAttError(err?.message || 'Could not open that file.');
    }
  };

  const removeAttachment = async (att) => {
    if (!window.confirm(`Remove "${att.name}"?`)) return;
    setAttError('');
    try {
      await deleteQueryAttachment(initial.id, att.id);
      setAttachments((prev) => prev.filter((x) => x.id !== att.id));
    } catch (err) {
      setAttError(err?.message || 'Could not remove that file.');
    }
  };

  const hasStageChanged = isEdit && stage !== (initial?.stage || 'Open');

  // RBAC gating (mirrors the server): only the raiser (departmentOwner) or
  // Admin may edit the query's own text/category; the recipient (assignedTo)
  // may change the stage forward + add a remark, but not the text/category;
  // anyone else who can merely VIEW the query (the matrix grants broad view
  // access) gets neither — they can read it, not touch it. Legacy/edge rows
  // with no departmentOwner stay fully editable (predate this restriction).
  const canEditThis = !isEdit || isAdmin(me) || !initial?.departmentOwner || canEditQuery(me, initial);
  const mayParticipate = !isEdit || isAdmin(me) || !initial?.departmentOwner
    || initial.departmentOwner === me?.id || initial.assignedTo === me?.id;
  const stageOk = !hasStageChanged || canChangeQueryStage(me, initial, initial?.stage || 'Open', stage);

  // Only treat this as a "details edit" (needing the raiser-only right) if
  // category/query/assignedTo actually changed — a plain stage move or
  // remark by the recipient must not be blocked by a right they don't need.
  // The fields themselves are also disabled for non-editors below, so this
  // mainly guards against a stale/forced value rather than gating the happy path.
  const detailsChanged = isEdit && (
    category !== (initial?.category || '')
    || queryText.trim() !== (initial?.query || '')
    || assignedTo !== (initial?.assignedTo || '')
  );
  const canSave = !isViewer
    && (!detailsChanged || canEditThis)
    && (!hasStageChanged && !remark.trim() ? true : mayParticipate)
    && stageOk
    && category && queryText.trim() && assignedTo;

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
    // On an existing query the files are already uploaded; on a new one they
    // ride along so they can be attached once the query row exists.
    onSave(record, isEdit ? [] : pendingFiles);
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
              <CoolSelect value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls + (!mayParticipate ? ' opacity-60 cursor-not-allowed' : '')} disabled={!mayParticipate}>
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
                <ol className="space-y-3 max-h-80 overflow-y-auto pl-3 pr-1">
                  {remarks.map((r, i) => {
                    // Split off the remark on the FIRST " | " before parsing "from X to Y" —
                    // a remark that itself contains the word "to" (e.g. "sent to client")
                    // would otherwise confuse a single greedy regex into cutting the stage
                    // names at the wrong "to" and swallowing half the remark into toStage.
                    const pipeIdx = r.text.indexOf(' | ');
                    const head = pipeIdx === -1 ? r.text : r.text.slice(0, pipeIdx);
                    const stageMatch = head.match(/^Stage changed from (.+) to (.+)$/);
                    if (stageMatch) {
                      const [, fromStage, toStage] = stageMatch;
                      const rest = pipeIdx === -1 ? undefined : r.text.slice(pipeIdx + 3);
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

          {/* Attachments — PDFs, images, statements etc. Uploaded/removed
              immediately via their own endpoints (not part of Save). */}
          {(
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Paperclip size={14} /> Attachments
              </h4>

              {!isViewer && mayParticipate && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onPaste={handleRemarkPaste}
                  onClick={() => !attBusy && fileRef.current?.click()}
                  tabIndex={0}
                  role="button"
                  className={`flex flex-col items-center justify-center gap-1.5 text-center px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-800 bg-slate-50/40 dark:bg-slate-950/20'
                  }`}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
                  />
                  {attBusy ? (
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Uploading…</p>
                  ) : (
                    <>
                      <UploadCloud size={20} className={dragOver ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'} />
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        Drag &amp; drop a file, or <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">click to browse</span>
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        or paste an image — Ctrl+V, or{' '}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handlePasteButton(); }}
                          className="text-blue-500 dark:text-blue-400 underline underline-offset-2 cursor-pointer"
                        >
                          click to paste from clipboard
                        </button>
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Files staged while raising — not uploaded until the query is created. */}
              {!isEdit && pendingFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {pendingFiles.map((f, i) => {
                    const kind = previewKind(f.type, f.name);
                    const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText;
                    const tint = kind === 'image' ? 'text-violet-500' : kind === 'video' ? 'text-rose-500' : 'text-blue-500';
                    return (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white dark:bg-slate-900 ${tint}`}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{f.name}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500">{humanFileSize(f.size)} · attaches when you raise the query</span>
                        </span>
                        <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))} title="Remove" className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/60 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!isEdit && pendingFiles.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No attachments yet.</p>
              )}

              {isEdit && (attachments.length > 0 ? (
                <ul className="space-y-1.5">
                  {attachments.map((att) => {
                    const kind = previewKind(att.type, att.name);
                    const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText;
                    const tint = kind === 'image' ? 'text-violet-500' : kind === 'video' ? 'text-rose-500' : 'text-blue-500';
                    return (
                      <li
                        key={att.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30"
                        onMouseEnter={kind ? (e) => showHoverPreview(att, e) : undefined}
                        onMouseLeave={kind ? hideHoverPreview : undefined}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white dark:bg-slate-900 ${tint}`}>
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                            {humanFileSize(att.size)} · {teamName(att.uploadedBy) || 'Unknown'} · {fmtQueryStamp(att.createdAt)}
                          </span>
                        </span>
                        {kind && (
                          <button type="button" onClick={() => openPreview(att)} title="Preview" className="text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 p-1.5 rounded-lg hover:bg-violet-50/60 dark:hover:bg-violet-950/30 transition-colors cursor-pointer shrink-0">
                            <Eye size={14} />
                          </button>
                        )}
                        <button type="button" onClick={() => openAttachment(att)} title="Download" className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors cursor-pointer shrink-0">
                          <Download size={14} />
                        </button>
                        {!isViewer && (att.uploadedBy === me?.id || isAdmin(me)) && (
                          <button type="button" onClick={() => removeAttachment(att)} title="Remove" className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/60 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No attachments yet.</p>
              ))}

              {attError && <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{attError}</p>}
            </div>
          )}

          {/* Only the raiser or recipient may add a remark — someone who can
              merely view this query (broad matrix access) doesn't see the box. */}
          {isEdit && !isViewer && mayParticipate && (
            <div className="pt-2">
              <Field label={hasStageChanged ? `Reason for stage change → ${stage}` : 'Add a remark'}>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  onPaste={handleRemarkPaste}
                  rows={2}
                  className={inputCls + ' resize-y'}
                  placeholder={hasStageChanged ? 'Explain why the stage changed…' : 'Add a remark… (you can also paste an image, Ctrl+V)'}
                />
              </Field>
            </div>
          )}

          {/* Activity log — the audit trail: every field-level change (who
              edited the category/text, moved the stage, or reassigned it),
              distinct from Remarks above (the conversation). Sits last, after
              everything else, since it's a reference/history section rather
              than something you act on. */}
          {isEdit && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <ScrollText size={14} /> Activity Log
              </h4>
              {activityLoading ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic animate-pulse">Loading activity…</p>
              ) : activity.length > 0 ? (
                <ol className="space-y-3 max-h-48 overflow-y-auto pl-3 pr-1">
                  {activity.map((l) => {
                    const changed = ACTIVITY_DIFF_ACTIONS.has(l.action)
                      ? Object.keys(l.newValue || {}).filter((k) => k !== 'id')
                      : [];
                    return (
                      <li key={l.id} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600 ring-2 ring-white dark:ring-slate-900" />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                          {fmtQueryStamp(l.timestamp)}
                          <span className="text-slate-600 dark:text-slate-300 font-semibold ml-1.5">• {l.performedByName}</span>
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{ACTIVITY_ACTION_LABEL[l.action] || l.action}</p>
                        {changed.length > 0 && (
                          <ul className="mt-0.5 space-y-0.5">
                            {changed.map((k) => (
                              <li key={k} className="text-[11px] text-slate-500 dark:text-slate-400">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">{ACTIVITY_FIELD_LABEL[k] || k}:</span>{' '}
                                {fmtActivityVal(k, l.oldValue?.[k])} <span className="text-slate-350 dark:text-slate-600">→</span> {fmtActivityVal(k, l.newValue?.[k])}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No activity recorded yet.</p>
              )}
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

      {/* Hover peek — a small floating preview beside the row, so you can see
          what a file is without opening or downloading it. Portaled so the
          modal's own scroll/overflow can't clip it. */}
      {hoverPreview && createPortal(
        <div
          style={{ position: 'fixed', top: Math.min(hoverPreview.top, window.innerHeight - 240), left: Math.min(hoverPreview.left, window.innerWidth - 260), zIndex: 9999 }}
          className="w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 pointer-events-none animate-fade-in"
        >
          {previewKind(hoverPreview.att.type, hoverPreview.att.name) === 'image' && (
            <img src={hoverPreview.dataUrl} alt={hoverPreview.att.name} className="w-full max-h-48 object-contain rounded-lg" />
          )}
          {previewKind(hoverPreview.att.type, hoverPreview.att.name) === 'video' && (
            <video src={hoverPreview.dataUrl} muted className="w-full max-h-48 rounded-lg" />
          )}
          {previewKind(hoverPreview.att.type, hoverPreview.att.name) === 'pdf' && (
            <embed src={hoverPreview.dataUrl} type="application/pdf" className="w-full h-48 rounded-lg" />
          )}
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate mt-1.5 px-1">{hoverPreview.att.name}</p>
        </div>,
        document.body
      )}

      {/* Full preview */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-fade-in" onClick={() => setLightbox(null)}>
          <div className="w-full max-w-5xl max-h-full flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 text-white/90 shrink-0">
              <span className="text-sm font-bold truncate">{lightbox.att.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => openAttachment(lightbox.att)} className="inline-flex items-center gap-1.5 text-xs font-bold hover:text-white cursor-pointer">
                  <Download size={14} /> Download
                </button>
                <button onClick={() => setLightbox(null)} className="hover:text-white cursor-pointer"><X size={20} /></button>
              </div>
            </div>
            {previewKind(lightbox.att.type, lightbox.att.name) === 'image' && (
              <img src={lightbox.dataUrl} alt={lightbox.att.name} className="max-h-[80vh] w-auto mx-auto rounded-2xl object-contain shadow-2xl animate-scale-up" />
            )}
            {previewKind(lightbox.att.type, lightbox.att.name) === 'video' && (
              <video src={lightbox.dataUrl} controls autoPlay className="max-h-[80vh] w-full rounded-2xl shadow-2xl animate-scale-up" />
            )}
            {previewKind(lightbox.att.type, lightbox.att.name) === 'pdf' && (
              <iframe src={lightbox.dataUrl} title={lightbox.att.name} className="w-full h-[80vh] rounded-2xl bg-white shadow-2xl animate-scale-up" />
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
