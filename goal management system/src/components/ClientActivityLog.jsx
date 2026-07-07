// Per-client audit trail — shown inside Client Profile so every user (not
// just Admin) can see who changed what on this specific client: personal
// detail edits, document uploads/renames/deletes, and manager reassignments.
// Reads GET /api/clients/:id/activity (server resolves performedBy -> real
// name). The cross-module, unfiltered dashboard (ActivityLogView.jsx) stays
// Admin-only; this view is scoped to one client and open to anyone.
import React, { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, Plus, Pencil, Trash2, Upload, FileEdit, FileX2 } from 'lucide-react';
import { Card, btnGhost } from './UI';
import { fetchClientActivity } from '../services/db';

const ACTION_META = {
  CREATE:           { icon: Plus,     cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400', label: 'Created' },
  UPDATE:           { icon: Pencil,   cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400', label: 'Edited details' },
  DELETE:           { icon: Trash2,   cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400', label: 'Deleted' },
  UPLOAD_DOCUMENT:  { icon: Upload,   cls: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400', label: 'Uploaded a document' },
  DELETE_DOCUMENT:  { icon: FileX2,   cls: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400', label: 'Deleted a document' },
  RENAME_DOCUMENT:  { icon: FileEdit, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400', label: 'Renamed a document' },
};
const fallbackMeta = { icon: ScrollText, cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400', label: 'Change' };

// clientDetails keys -> human labels. Anything not listed falls back to a
// prettified camelCase-to-Title-Case conversion, so a new field added to the
// Edit Client form still reads sensibly here with zero extra work.
const FIELD_LABELS = {
  mobile: 'Mobile', email: 'Email', clientType: 'Client Type', dob: 'Date of Birth',
  address1: 'Address Line 1', address2: 'Address Line 2', address3: 'Address Line 3',
  city: 'City', state: 'State', pinCode: 'Pincode', profession: 'Profession', professionOther: 'Profession (Other)',
  relationshipManager: 'Relationship Manager', portfolioManager: 'Portfolio Manager',
  insuranceManager: 'Insurance Manager', serviceManager: 'Service Manager',
  owner: 'Owner', operationManager: 'Operation Manager', internalManager: 'Internal Manager',
  familyDetails: 'Family Members', mutualFunds: 'Mutual Funds', insuranceTerm: 'Term Insurance',
  insuranceMedical: 'Medical Insurance', insuranceAccidental: 'Accidental Insurance',
  name: 'Name', pan: 'PAN', age: 'Age', assumptions: 'Assumptions', assignedTo: 'Assigned RM',
};
const fieldLabel = (key) => FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const fmtVal = (v) => {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// Renders what actually changed for an entry — field-by-field for UPDATE,
// the document name for document actions, the plain summary otherwise.
function ChangeSummary({ log }) {
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
  if (['UPLOAD_DOCUMENT', 'RENAME_DOCUMENT'].includes(log.action)) {
    const name = log.newValue?.name;
    return name ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{name}</p> : null;
  }
  if (log.action === 'DELETE_DOCUMENT') {
    const name = log.oldValue?.name;
    return name ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{name}</p> : null;
  }
  if (log.action === 'CREATE' || log.action === 'DELETE') {
    const name = (log.newValue || log.oldValue)?.name;
    return name ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{name}</p> : null;
  }
  return null;
}

export default function ClientActivityLog({ client }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!client?.id) return;
    setLoading(true); setError('');
    try {
      setLogs(await fetchClientActivity(client.id));
    } catch (err) {
      setError(err?.message || 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  };

  // Refetch whenever this client is edited elsewhere on the page (any save
  // bumps `updatedAt` server-side, which flows back through `client`).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [client?.id, client?.updatedAt]);

  return (
    <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xl rounded-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 dark:from-slate-500 dark:to-slate-700 text-white flex items-center justify-center shadow-lg shadow-slate-500/20">
            <ScrollText size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Activity Log</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">
              Every edit, document upload, and reassignment — by real user
            </p>
          </div>
        </div>
        <button onClick={load} className={btnGhost + ' text-xs'} title="Refresh">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        {error ? (
          <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold p-4 text-center">{error}</p>
        ) : loading ? (
          <p className="text-sm text-slate-400 animate-pulse p-4 text-center">Loading activity…</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-slate-450 dark:text-slate-500 italic font-medium p-2">No changes recorded yet for this client.</p>
        ) : (
          <ol className="space-y-3 max-h-[420px] overflow-y-auto -mr-1 pr-1">
            {logs.map((l) => {
              const meta = ACTION_META[l.action] || fallbackMeta;
              const Icon = meta.icon;
              return (
                <li key={l.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.cls}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1 pb-3 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
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
