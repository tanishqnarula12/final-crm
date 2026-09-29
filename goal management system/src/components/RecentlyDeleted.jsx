import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trash2, RefreshCw, RotateCcw, Filter, Paperclip } from 'lucide-react';
import { Card, btnGhost, selectCls, CoolSelect } from './UI';
import { api } from '../services/api';
import { hydrateTasks } from '../utils/tasks';
import { hydrateQueries } from '../utils/queries';
import { hydrateMeetings } from '../utils/meetings';
import { hydrateLeads } from '../services/leads';

// Admin-only: everything deleted in the last 90 days (tasks, Servicing
// records, queries, leads, meetings) with one-click Restore. Deletes are soft,
// so a restore brings a record back exactly as it was, files included; the
// activity log keeps both the DELETE and the RESTORE (GET /api/deleted).
const REFRESH = { tasks: hydrateTasks, queries: hydrateQueries, leads: hydrateLeads, meetings: hydrateMeetings };
const TYPE_THEME = {
  Renewal: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  Claim: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  Policy: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40',
  'Fixed Deposit': 'bg-cyan-50 text-cyan-700 ring-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-900/40',
};
const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function RecentlyDeleted() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [restoring, setRestoring] = useState(null); // id being restored
  const [restored, setRestored] = useState(new Set());
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { items: rows } = await api.get('/deleted?days=90');
      setItems(rows || []);
      setRestored(new Set());
    } catch (err) {
      setError(err?.message || 'Could not load deleted records.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => [...new Set(items.map((i) => i.type))], [items]);
  const shown = typeFilter ? items.filter((i) => i.type === typeFilter) : items;

  const restore = async (item) => {
    if (busy.current) return;
    if (!window.confirm(`Restore "${item.title}"?\n\nIt comes back exactly as it was${item.files ? `, with its ${item.files} file${item.files === 1 ? '' : 's'}` : ''}, for everyone who could see it before.`)) return;
    busy.current = true;
    setRestoring(item.id);
    try {
      await api.post(`/deleted/${item.kind}/${encodeURIComponent(item.id)}/restore`);
      setRestored((s) => new Set([...s, item.id]));
      REFRESH[item.kind]?.({ force: true }).catch(() => {});
    } catch (err) {
      alert(err?.message || 'Could not restore this record.');
    } finally {
      busy.current = false;
      setRestoring(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Trash2 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Recently deleted</h2>
            <p className="text-xs text-slate-400">Tasks, Servicing records, queries, leads and meetings deleted in the last 90 days. Restore brings one back exactly as it was.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-44">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
            <CoolSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls + ' pl-8 py-2 text-xs'}>
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </CoolSelect>
          </div>
          <button onClick={load} className={btnGhost + ' text-xs'} title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold p-6 text-center">{error}</p>
        ) : loading ? (
          <p className="text-sm text-slate-400 animate-pulse p-6 text-center">Loading deleted records…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-400 p-6 text-center">Nothing deleted in the last 90 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Created by</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const done = restored.has(i.id);
                  return (
                    <tr key={`${i.kind}:${i.id}`} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex shrink-0 items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 rounded-full ${TYPE_THEME[i.type] || 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/50'}`}>{i.type}</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[340px]" title={i.title}>{i.title}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                          {i.who && <span>{i.who}</span>}
                          {i.state && <span>· {i.state}</span>}
                          {i.files > 0 && <span className="inline-flex items-center gap-0.5">· <Paperclip size={10} /> {i.files} file{i.files === 1 ? '' : 's'}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {i.createdBy || '—'}
                        <div className="text-[10px] text-slate-400 tabular-nums">{fmt(i.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {i.deletedBy || '—'}
                        <div className="text-[10px] text-slate-400 tabular-nums">{fmt(i.deletedAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {done ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">✓ Restored</span>
                        ) : (
                          <button onClick={() => restore(i)} disabled={!!restoring} className={btnGhost + ' text-xs'}>
                            <RotateCcw size={13} className={restoring === i.id ? 'animate-spin' : ''} /> {restoring === i.id ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                      </td>
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
