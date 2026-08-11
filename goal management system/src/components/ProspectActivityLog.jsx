// Per-prospect audit trail — shown inside the Prospect edit modal so anyone
// who can see this prospect can also see who changed what on it: detail
// edits, stage changes (Pre-Qualified -> Qualified -> ...), and reassignments.
// Reads GET /api/prospects/:id/activity (server resolves performedBy -> real
// name, and re-checks 'view' permission — a Pre-Qualified prospect's history
// is exactly as restricted as the prospect itself). Same shape/behavior as
// ClientActivityLog.jsx, just prospect-scoped and with stage-change support.
import React, { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, Plus, Pencil, Trash2, ArrowRightLeft, UserCog } from 'lucide-react';
import { Card, btnGhost } from './UI';
import { fetchProspectActivity } from '../utils/prospects';

const ACTION_META = {
  CREATE:       { icon: Plus,           cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400', label: 'Created' },
  UPDATE:       { icon: Pencil,         cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400', label: 'Edited details' },
  DELETE:       { icon: Trash2,         cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400', label: 'Deleted' },
  STAGE_CHANGE: { icon: ArrowRightLeft, cls: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400', label: 'Changed stage' },
  ASSIGN:       { icon: UserCog,        cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400', label: 'Reassigned' },
};
const fallbackMeta = { icon: ScrollText, cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400', label: 'Change' };

const FIELD_LABELS = {
  closingDate: 'Closing Date', serviceManager: 'Service Manager', relationshipManager: 'Relationship Manager',
  owner: 'Owner', internalManager: 'Internal Manager', insuranceManager: 'Insurance Manager',
  portfolioManager: 'Portfolio Manager', amount: 'Amount', remarks: 'Remarks',
  policyIssueDate: 'Policy Issue Date', assignedTo: 'Assigned To',
};
const fieldLabel = (key) => FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const fmtVal = (v) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    if (!v.length) return '—';
    // Plain values join into a readable list; an array of objects (should
    // already be excluded server-side via NOISE_KEYS, but stay defensive
    // for any future field) falls back to JSON rather than "[object Object]".
    return v.every((x) => typeof x !== 'object' || x === null) ? v.join(', ') : JSON.stringify(v);
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

function ChangeSummary({ log }) {
  if (log.action === 'STAGE_CHANGE') {
    return (
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
        {fmtVal(log.oldValue?.stage)} <span className="text-slate-350 dark:text-slate-600">→</span> {fmtVal(log.newValue?.stage)}
      </p>
    );
  }
  if (log.action === 'UPDATE' && log.newValue && typeof log.newValue === 'object') {
    const keys = Object.keys(log.newValue);
    if (!keys.length) return null;
    return (
      <ul className="mt-1 space-y-0.5">
        {keys.map((k) => (
          <li key={k} className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{fieldLabel(k)}:</span>{' '}
            {fmtVal(log.oldValue?.[k])} <span className="text-slate-350 dark:text-slate-600">→</span> {fmtVal(log.newValue?.[k])}
          </li>
        ))}
      </ul>
    );
  }
  if (log.action === 'CREATE' || log.action === 'DELETE') {
    const name = (log.newValue || log.oldValue)?.name || (log.newValue || log.oldValue)?.title;
    return name ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{name}</p> : null;
  }
  return null;
}

export default function ProspectActivityLog({ prospectId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!prospectId) return;
    setLoading(true); setError('');
    try {
      setLogs(await fetchProspectActivity(prospectId));
    } catch (err) {
      setError(err?.message || 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [prospectId]);

  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 dark:from-slate-500 dark:to-slate-700 text-white flex items-center justify-center shadow-sm">
            <ScrollText size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Modification History</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Every edit and stage change — by real user</p>
          </div>
        </div>
        <button onClick={load} className={btnGhost + ' text-xs'} title="Refresh">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
        {error ? (
          <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold p-3 text-center">{error}</p>
        ) : loading ? (
          <p className="text-xs text-slate-400 animate-pulse p-3 text-center">Loading activity…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-slate-450 dark:text-slate-500 italic font-medium p-2">No changes recorded yet.</p>
        ) : (
          <ol className="space-y-2.5 max-h-[280px] overflow-y-auto -mr-1 pr-1">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] || fallbackMeta;
              const Icon = meta.icon;
              return (
                <li key={l.id} className="flex items-start gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.cls}`}>
                    <Icon size={12} />
                  </div>
                  <div className="min-w-0 flex-1 pb-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                        {l.performedByName} <span className="font-normal text-slate-500 dark:text-slate-400">— {meta.label}</span>
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">{fmt(l.timestamp)}</span>
                    </div>
                    <ChangeSummary log={l} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
