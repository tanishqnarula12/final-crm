import { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Filter } from 'lucide-react';
import { Card, btnGhost, selectCls, CoolSelect } from './UI';
import { api } from '../services/api';

// Admin-only audit trail viewer over GET /api/activity-log. Shows real user
// names (the server resolves performedBy → User.name), so entries always
// reflect real accounts.
const MODULES = ['', 'leads', 'clients', 'tasks', 'goals', 'moms'];
const ACTION_THEME = {
  CREATE: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  UPDATE: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  ASSIGN: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  STAGE_CHANGE: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  DELETE: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
  UPLOAD_DOCUMENT: 'bg-purple-50 text-purple-700 ring-purple-200/60 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-900/40',
  DELETE_DOCUMENT: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
  RENAME_DOCUMENT: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
};

const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const compact = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return Object.entries(v).map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : val}`).join(', ');
  } catch { return ''; }
};

export default function ActivityLogView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { logs: rows } = await api.get(`/activity-log${moduleFilter ? `?module=${moduleFilter}` : ''}`);
      setLogs(rows || []);
    } catch (err) {
      setError(err?.message || 'Failed to load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-5xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ScrollText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Activity Log</h2>
            <p className="text-xs text-slate-400">Every create, edit, assignment and deletion — by real user.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-44">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
            <CoolSelect value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={selectCls + ' pl-8 py-2 text-xs'}>
              {MODULES.map((m) => <option key={m || 'all'} value={m}>{m ? m[0].toUpperCase() + m.slice(1) : 'All modules'}</option>)}
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
          <p className="text-sm text-slate-400 animate-pulse p-6 text-center">Loading activity…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-slate-400 p-6 text-center">No activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{fmt(l.timestamp)}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{l.performedByName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 capitalize">{l.module}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 rounded-full ${ACTION_THEME[l.action] || 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {l.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-[260px] truncate" title={`${compact(l.oldValue)} → ${compact(l.newValue)}`}>
                      {compact(l.newValue) || compact(l.oldValue) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
