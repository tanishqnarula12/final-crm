// COBR (Change of Broker) — creation flow.
//
// A COBR record IS a Task row (relatedTo: 'COBR') — on Confirm this builds a
// normal task object (same shape/fields TasksView's TaskFormModal produces)
// and hands it to the same `onSave` callback App.jsx already wires for Tasks
// (handleSaveTaskGlobal), so creation goes through the exact same
// syncBulk → RBAC → activity-log → notification pipeline as any other task.
import React, { useState, useMemo } from 'react';
import { X, Check, ArrowRight } from 'lucide-react';
import { btnPrimary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { GroupLeaderSelect, AmcRepeatableFields } from './TasksView';
import { AMC_LIST } from '../utils/tasks';
import { COBR_TYPES, emptyCobrRow } from '../utils/cobr';
import { loadTeam } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { uid } from '../utils/calc';
import { canDo } from '../utils/permissions';

export default function CobrFormModal({ clients = [], onClose, onSave }) {
  const [groupLeaderId, setGroupLeaderId] = useState('');
  const [groupLeader, setGroupLeader] = useState('');
  const [applicant, setApplicant] = useState('');
  const [pan, setPan] = useState('');
  const [cobrType, setCobrType] = useState('');
  const [amcs, setAmcs] = useState([]);
  const [cobrEntries, setCobrEntries] = useState({});
  const [assignedBy, setAssignedBy] = useState(getCurrentUser()?.id || '');
  const [assignedTo, setAssignedTo] = useState('');
  const [subPerson, setSubPerson] = useState('');
  const getTomorrowString = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const [dueDate, setDueDate] = useState(getTomorrowString());

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === groupLeaderId) || clients.find((c) => c.name === groupLeader) || null,
    [clients, groupLeaderId, groupLeader]
  );

  const applicantOptions = useMemo(() => {
    if (!selectedClient) return [];
    const opts = [{ name: selectedClient.name, relation: 'Self', pan: selectedClient.pan || '' }];
    (selectedClient.clientDetails?.familyDetails || []).forEach((f) => {
      if (f.name) opts.push({ name: f.name, relation: f.relation || 'Member', pan: f.pan || '' });
    });
    return opts;
  }, [selectedClient]);

  const toggleAmc = (amc) => {
    setAmcs((prev) => (prev.includes(amc) ? prev.filter((a) => a !== amc) : [...prev, amc]));
    setCobrEntries((prev) => {
      if (amcs.includes(amc)) { const next = { ...prev }; delete next[amc]; return next; } // deselecting drops its rows
      return prev;
    });
  };

  const addEntryRow = (amc) => {
    setCobrEntries((prev) => ({ ...prev, [amc]: [...(prev[amc] || []), { id: uid(), ...emptyCobrRow() }] }));
  };
  const removeEntryRow = (amc, rowId) => {
    setCobrEntries((prev) => ({ ...prev, [amc]: (prev[amc] || []).filter((r) => r.id !== rowId) }));
  };
  const updateEntryRow = (amc, rowId, field, value) => {
    setCobrEntries((prev) => ({
      ...prev,
      [amc]: (prev[amc] || []).map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
    }));
  };

  const hasEntries = Object.values(cobrEntries).some((rows) => (rows || []).length > 0);
  const canSave = !!groupLeader && !!applicant && !!cobrType && amcs.length > 0 && hasEntries && !!assignedTo && !!dueDate;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    const task = {
      id: uid(),
      taskName: `${cobrType} - ${groupLeader}`,
      relatedTo: 'COBR',
      cobrType,
      groupLeaderId: selectedClient?.id || groupLeaderId || '',
      groupLeader,
      applicant,
      pan,
      amcs,
      cobrEntries,
      stage: 'Open',
      assignedBy,
      assignedTo,
      subPerson,
      dueDate,
      comments: [{
        at: new Date().toISOString(),
        by: getCurrentUser()?.name || 'System',
        text: `COBR request created (${cobrType})`,
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(task);
  };

  if (!canDo('cobr', 'create')) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">You don't have permission to create a COBR request.</p>
          <button onClick={onClose} className={btnGhost + ' w-full justify-center'}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden animate-fade-in" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-none md:rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col h-full md:h-auto md:max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">New Change of Broker (COBR)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Group Leader *">
              <GroupLeaderSelect
                options={clients}
                value={groupLeader}
                pan={selectedClient?.pan}
                onSelect={(c) => { setGroupLeaderId(c.id); setGroupLeader(c.name); setApplicant(''); setPan(''); }}
              />
            </Field>
            <Field label="Applicant Name *">
              {applicantOptions.length > 0 ? (
                <CoolSelect
                  showValueOnSelect={true}
                  value={applicant}
                  onChange={(e) => {
                    const name = e.target.value;
                    setApplicant(name);
                    const opt = applicantOptions.find((o) => o.name === name);
                    setPan(opt?.pan || '');
                  }}
                  className={selectCls}
                >
                  <option value="">Select applicant…</option>
                  {applicantOptions.map((o) => <option key={o.name} value={o.name}>{o.name} — {o.relation}</option>)}
                </CoolSelect>
              ) : (
                <input value={applicant} disabled placeholder="Select a group leader first" className={inputCls + ' opacity-60 cursor-not-allowed'} />
              )}
            </Field>
            <Field label="PAN" hint="Auto-fetched from applicant">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-mono tracking-widest">
                {pan || '—'}
              </div>
            </Field>
            <Field label="COBR Type *">
              <div className="grid grid-cols-2 gap-2">
                {COBR_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCobrType(t)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      cobrType === t
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-400'
                    }`}
                  >
                    {cobrType === t && <Check size={12} className="inline mr-1 -mt-0.5" />} {t}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div>
            <Field label={`Select AMC ${amcs.length ? `(${amcs.length} selected)` : '(multi-select)'}`}>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30">
                {AMC_LIST.map((amc) => {
                  const on = amcs.includes(amc);
                  return (
                    <button
                      key={amc}
                      type="button"
                      onClick={() => toggleAmc(amc)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                        on
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-blue-400'
                      }`}
                    >
                      {on && <Check size={11} />} {amc}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          {amcs.length > 0 && (
            <div className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-4 space-y-2">
              <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scheme Name, Folio No. &amp; Amount — Per Selected AMC</h5>
              <AmcRepeatableFields
                amcs={amcs}
                entries={cobrEntries}
                fields={[
                  { key: 'schemeName', label: 'Scheme Name' },
                  { key: 'folioNo', label: 'Folio No.' },
                  { key: 'amount', label: 'Amount', type: 'number' },
                ]}
                onAdd={addEntryRow}
                onRemove={removeEntryRow}
                onUpdate={updateEntryRow}
                isEditingMode={true}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Field label="Due Date *">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Assigned By">
              <CoolSelect value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} className={selectCls}>
                <option value="">Select…</option>
                {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Assigned To *">
              <CoolSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls}>
                <option value="">Select…</option>
                {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Sub Person">
              <CoolSelect value={subPerson} onChange={(e) => setSubPerson(e.target.value)} className={selectCls}>
                <option value="">Select…</option>
                {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </CoolSelect>
            </Field>
          </div>
        </form>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canSave} className={btnPrimary + (!canSave ? ' opacity-50 cursor-not-allowed' : '')}>
            Confirm <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
