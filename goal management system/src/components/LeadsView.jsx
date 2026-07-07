import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  UserPlus, Search, Plus, X, Phone, MessageCircle, Mail, CalendarPlus,
  Trash2, Pencil, Check, Clock, Crown, LayoutGrid, Table as TableIcon,
  Flame, Star, Snowflake, ArrowRight, CheckCircle2, Send, Zap, Activity,
  Briefcase, RefreshCw, ChevronRight, User,
} from 'lucide-react';
import { Card, Avatar, Field, inputCls, selectCls, btnPrimary, btnSecondary, btnGhost, CoolSelect } from './UI';
import { loadTeam, teamName } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canAssignLead, canCreateLead, canDeleteLead } from '../utils/permissions';
import {
  loadLeads, intakeLead, updateLead, addNote, addFollowUp, completeFollowUp, deleteLead,
  assignLead, winInitialCall,
  LEAD_STAGES, LEAD_SOURCES, CLIENT_TYPES, RELATED_TO_OPTIONS, LOST_REASONS, FOLLOWUP_TYPES,
  STAGE_THEME, STATUS_THEME, SOURCE_THEME, scoreBand, computeScore, leadName, fmtStamp,
} from '../services/leads';

const scoreChip = (score) => {
  const band = scoreBand(score);
  const map = {
    Hot: { cls: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40', Icon: Flame },
    Warm: { cls: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40', Icon: Star },
    Cold: { cls: 'bg-sky-50 text-sky-700 ring-sky-200/60 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-900/40', Icon: Snowflake },
  };
  return { ...map[band], band };
};

export default function LeadsView({
  isViewer, clients = [], onConvertLead, onScheduleLeadMeeting, onLeadMeetingDone, onOpenLeadMeetingForm, leadsChangeCounter,
}) {
  // RBAC: gate create/delete on the matrix, not the retired isViewer flag.
  const me = getCurrentUser();
  const mayCreateLead = !isViewer && canCreateLead(me);
  const [leads, setLeads] = useState(() => loadLeads());
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);
  const [toast, setToast] = useState('');

  const refresh = () => setLeads(loadLeads());
  useEffect(() => { refresh(); }, [leadsChangeCounter]);
  useEffect(() => {
    const onUpdate = () => refresh();
    const onReceived = (e) => {
      refresh();
      const l = e.detail?.lead;
      setToast(`🔔 New lead: ${l ? leadName(l) : ''} (${l?.leadSource || ''})`);
      setTimeout(() => setToast(''), 4000);
    };
    const onSyncWarning = (e) => {
      setToast(`⚠ ${e.detail?.message || 'Some changes could not be saved.'}`);
      setTimeout(() => setToast(''), 5000);
    };
    window.addEventListener('crm:leads-updated', onUpdate);
    window.addEventListener('crm:lead-received', onReceived);
    window.addEventListener('crm:leads-sync-warning', onSyncWarning);
    window.addEventListener('focus', onUpdate);
    return () => {
      window.removeEventListener('crm:leads-updated', onUpdate);
      window.removeEventListener('crm:lead-received', onReceived);
      window.removeEventListener('crm:leads-sync-warning', onSyncWarning);
      window.removeEventListener('focus', onUpdate);
    };
  }, []);

  const openLead = useMemo(() => leads.find(l => l.id === openLeadId) || null, [leads, openLeadId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter(l => statusFilter === 'all' || (l.status || 'Active') === statusFilter)
      .filter(l => stageFilter === 'all' || (l.stage || 'New') === stageFilter)
      .filter(l => sourceFilter === 'all' || l.leadSource === sourceFilter)
      .filter(l => !q ||
        leadName(l).toLowerCase().includes(q) ||
        (l.mobile || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.pan || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [leads, query, stageFilter, statusFilter, sourceFilter]);

  const counts = useMemo(() => {
    const c = { all: leads.length };
    LEAD_STAGES.forEach(s => { c[s] = leads.filter(l => (l.stage || 'New') === s && (l.status || 'Active') === 'Active').length; });
    return c;
  }, [leads]);

  const meName = getCurrentUser()?.name || 'System';
  const handleSaveLead = (data) => {
    if (editing) {
      updateLead(editing.id, data, meName);
    } else {
      const res = intakeLead(data, data.leadSource || 'Website', meName);
      if (res.duplicate) {
        setToast(`⚠ A lead with this mobile already exists: ${leadName(res.lead)}`);
        setTimeout(() => setToast(''), 4000);
      }
    }
    refresh();
    setShowForm(false);
    setEditing(null);
  };

  const handleSimulate = () => {
    const samples = [
      { name: 'Ananya Rao', mobile: '+91 99' + Math.floor(10000000 + Math.random() * 89999999), email: 'ananya@example.com', clientType: 'HNI', relatedTo: 'Investment Planning', remarks: 'Interested in SIP planning', city: 'Bengaluru' },
      { name: 'Karthik Menon', mobile: '+91 98' + Math.floor(10000000 + Math.random() * 89999999), email: 'karthik@example.com', clientType: 'Retail', relatedTo: 'Risk Mitigation', remarks: 'Term insurance enquiry', city: 'Kochi' },
      { name: 'Diya Shah', mobile: '+91 97' + Math.floor(10000000 + Math.random() * 89999999), email: 'diya@example.com', clientType: 'Ultra HNI', relatedTo: 'Wealth Creation', remarks: 'Portfolio review', city: 'Mumbai' },
    ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    intakeLead(pick, 'Website', 'Website');
    refresh();
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return;
    deleteLead(id);
    if (openLeadId === id) setOpenLeadId(null);
    refresh();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Leads</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Capture, qualify &amp; convert — the front door to every client</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, mobile, email, PAN…" className={inputCls + ' pl-9 w-full md:w-64'} />
          </div>
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 shrink-0">
            <button onClick={() => setViewMode('table')} title="Table view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><TableIcon size={15} /></button>
            <button onClick={() => setViewMode('card')} title="Card view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'card' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={15} /></button>
          </div>
          {mayCreateLead && (
            <>
              <button onClick={handleSimulate} title="Simulate an inbound website lead (demo)" className={btnSecondary + ' shrink-0'}>
                <Zap size={14} /> Simulate Web Lead
              </button>
              <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary + ' shrink-0'}>
                <Plus size={14} /> New Lead
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stage funnel chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" count={counts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
        {LEAD_STAGES.map(s => (
          <FilterChip key={s} label={s} count={counts[s]} active={stageFilter === s} onClick={() => setStageFilter(s)} />
        ))}
      </div>

      {/* Status + source filters */}
      <div className="flex flex-wrap items-center gap-2">
        {['Active', 'Lost', 'Dormant', 'Junk', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              statusFilter === s ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {s === 'all' ? 'All Statuses' : s}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-800" />
        <div className="w-44">
          <CoolSelect value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={selectCls + ' text-xs py-1.5'}>
            <option value="all">All Sources</option>
            {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </CoolSelect>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <UserPlus className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">
            {leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
          </p>
          {!isViewer && leads.length === 0 && (
            <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnSecondary}><Plus size={14} /> Capture the first lead</button>
          )}
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Lead</th>
                  <th className="text-left px-6 py-4 font-bold">Contact</th>
                  <th className="text-center px-6 py-4 font-bold">Source</th>
                  <th className="text-center px-6 py-4 font-bold">RM</th>
                  <th className="text-center px-6 py-4 font-bold">Stage</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {filtered.map(l => {
                  const sc = scoreChip(l.leadScore || 0);
                  return (
                    <tr key={l.id} onClick={() => setOpenLeadId(l.id)} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={leadName(l)} size="sm" />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100">{leadName(l)}</div>
                            {l.status !== 'Active' && <span className={`inline-flex items-center px-1.5 py-0.5 mt-1 text-[8px] font-black uppercase tracking-wider rounded-md ring-1 ${STATUS_THEME[l.status]}`}>{l.status}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-700 dark:text-slate-300 font-medium tabular-nums">{l.mobile || '—'}</div>
                        {l.email && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{l.email}</div>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${SOURCE_THEME[l.leadSource] || SOURCE_THEME['Manual Entry']}`}>{l.leadSource}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{l.ownerId ? teamName(l.ownerId) : <span className="text-slate-400 italic text-[10px] font-normal">Unassigned</span>}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[l.stage] || STAGE_THEME.New}`}>{l.stage}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canDeleteLead(me, l) && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(l.id); }} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100" title="Delete lead">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(l => {
            const sc = scoreChip(l.leadScore || 0);
            return (
              <div key={l.id} onClick={() => setOpenLeadId(l.id)} className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[l.stage] || STAGE_THEME.New}`}>{l.stage}</span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <Avatar name={leadName(l)} size="sm" />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{leadName(l)}</div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{l.mobile}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    <User size={13} className={l.ownerId ? 'text-blue-500' : 'text-slate-400'} />
                    {l.ownerId ? teamName(l.ownerId) : <span className="italic">Unassigned</span>}
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${SOURCE_THEME[l.leadSource] || SOURCE_THEME['Manual Entry']}`}>{l.leadSource}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <LeadFormModal initial={editing} clients={clients} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSaveLead} />
      )}
      {openLead && (
        <LeadDetailModal
          lead={openLead}
          isViewer={isViewer}
          onClose={() => setOpenLeadId(null)}
          onEdit={() => { setEditing(openLead); setShowForm(true); }}
          onRefresh={refresh}
          onConvertLead={onConvertLead}
          onScheduleLeadMeeting={onScheduleLeadMeeting}
          onLeadMeetingDone={onLeadMeetingDone}
          onOpenLeadMeetingForm={onOpenLeadMeetingForm}
          onToast={(m) => { setToast(m); setTimeout(() => setToast(''), 4000); }}
        />
      )}

      {toast && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold animate-scale-up">
          {toast}
        </div>, document.body
      )}
    </div>
  );
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
        active ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count || 0}</span>
    </button>
  );
}

// ===========================================================================
// CREATE / EDIT LEAD MODAL
// ===========================================================================
function LeadFormModal({ initial, clients = [], onClose, onSave }) {
  const isEdit = !!initial;
  const [f, setF] = useState(() => ({
    name: initial?.name || `${initial?.firstName || ''} ${initial?.lastName || ''}`.trim(),
    mobile: initial?.mobile || '', email: initial?.email || '',
    city: initial?.city || '',
    relatedTo: Array.isArray(initial?.relatedTo) ? initial.relatedTo : (initial?.relatedTo ? [initial.relatedTo] : []),
    leadSource: initial?.leadSource || 'Website',
    referredClientId: initial?.referredClientId || '', referredClientName: initial?.referredClientName || '', referredClientPan: initial?.referredClientPan || '',
    referredUser: initial?.referredUser || '',
    clientType: initial?.clientType || 'Retail',
    remarks: initial?.remarks || initial?.message || '',
    ownerId: initial?.ownerId || '',
  }));
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const pickReferredClient = (id) => {
    const c = clients.find(x => x.id === id);
    setF(prev => ({ ...prev, referredClientId: id, referredClientName: c?.name || '', referredClientPan: c?.pan || '' }));
  };

  const canSave = f.name.trim() && f.mobile.trim() && f.leadSource &&
    (f.leadSource !== 'Referred By Client' || f.referredClientId) &&
    (f.leadSource !== 'Referred By Users' || f.referredUser);

  const previewScore = computeScore({ ...f, stage: initial?.stage || 'New' });
  const sc = scoreChip(previewScore);

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">{isEdit ? <Pencil size={15} /> : <Plus size={16} />}</span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{isEdit ? 'Edit Lead' : 'Capture New Lead'}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full Name *"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="e.g. Aarav Sharma" /></Field>
            <Field label="Mobile Number *"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} className={inputCls} placeholder="+91 98765 43210" /></Field>
            <Field label="Email ID"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="name@example.com" /></Field>
            <Field label="City / Location"><input value={f.city} onChange={(e) => set('city', e.target.value)} className={inputCls} placeholder="e.g. Jaipur" /></Field>
          </div>

          <Field label="Related To" hint="Subject of inquiry — select all that apply (a lead can be interested in both Investment and Insurance)">
            <div className="flex flex-wrap gap-2">
              {RELATED_TO_OPTIONS.map(a => {
                const active = f.relatedTo.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set('relatedTo', active ? f.relatedTo.filter(x => x !== a) : [...f.relatedTo, a])}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ring-1 transition-all cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white ring-blue-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Lead Source *">
              <CoolSelect value={f.leadSource} onChange={(e) => set('leadSource', e.target.value)} className={selectCls}>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Client Type">
              <CoolSelect value={f.clientType} onChange={(e) => set('clientType', e.target.value)} className={selectCls}>
                {CLIENT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </CoolSelect>
            </Field>
          </div>

          {/* Source-conditional referral fields */}
          {f.leadSource === 'Referred By Client' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-900/40">
              <Field label="Group Leader (Client) *">
                <CoolSelect value={f.referredClientId} onChange={(e) => pickReferredClient(e.target.value)} className={selectCls}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.pan ? ` — ${c.pan}` : ''}</option>)}
                </CoolSelect>
              </Field>
              <Field label="PAN (auto)"><input value={f.referredClientPan} readOnly className={inputCls + ' font-mono tracking-widest uppercase bg-slate-50 dark:bg-slate-950 text-slate-500'} placeholder="Auto from client" /></Field>
            </div>
          )}
          {f.leadSource === 'Referred By Users' && (
            <div className="p-3 rounded-xl bg-violet-50/50 dark:bg-violet-950/15 border border-violet-200/60 dark:border-violet-900/40">
              <Field label="Referred By (User) *">
                <CoolSelect value={f.referredUser} onChange={(e) => set('referredUser', e.target.value)} className={selectCls}>
                  <option value="">Select team member…</option>
                  {loadTeam().map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </CoolSelect>
              </Field>
            </div>
          )}


          <Field label="Lead Remarks"><textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls + ' resize-y'} placeholder="Anything the lead mentioned…" /></Field>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex items-center justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={() => onSave(f)} disabled={!canSave} className={btnPrimary}>{isEdit ? 'Save Changes' : 'Create Lead'}</button>
        </div>
      </div>
    </div>, document.body
  );
}

// ===========================================================================
// LEAD DETAIL MODAL — stage stepper, quick actions, timeline, notes, follow-ups
// ===========================================================================
function LeadDetailModal({ lead, isViewer, onClose, onEdit, onRefresh, onConvertLead, onScheduleLeadMeeting, onLeadMeetingDone, onOpenLeadMeetingForm, onToast }) {
  const [tab, setTab] = useState('timeline');
  const [noteText, setNoteText] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [lostReason, setLostReason] = useState('Not Interested');
  const [fuType, setFuType] = useState('Call');
  const [fuDate, setFuDate] = useState('');
  // Assignment panel (Internal Manager assigns RM + others)
  const [assignRm, setAssignRm] = useState(lead.ownerId || '');
  const [assignOthers, setAssignOthers] = useState(Array.isArray(lead.contributors) ? lead.contributors : []);
  // Inline initial-call remark panel (replaces window.prompt)
  const [showCallRemarkForm, setShowCallRemarkForm] = useState(false);
  const [callRemark, setCallRemark] = useState('');

  const me = getCurrentUser();
  const meName = me?.name || 'System';
  const canAssign = canAssignLead(me); // only Admin assigns the RM

  const setStatus = (status, reason) => {
    updateLead(lead.id, { status, ...(reason ? { lostReason: reason } : {}) }, meName);
    setShowLost(false);
    onRefresh();
  };

  const doAssign = () => {
    if (!assignRm) { onToast('Pick a Relationship Manager'); return; }
    assignLead(lead.id, { ownerId: assignRm, contributors: assignOthers }, meName);
    onRefresh();
  };
  const toggleOther = (n) => setAssignOthers(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  const doWinInitialCall = () => {
    if (!callRemark.trim()) { onToast('A remark is required to mark the call Won'); return; }
    winInitialCall(lead.id, callRemark.trim(), meName);
    setCallRemark('');
    setShowCallRemarkForm(false);
    onRefresh();
  };

  const doOpenMeetingForm = () => {
    onOpenLeadMeetingForm && onOpenLeadMeetingForm(lead);
    onClose();
  };
  const doMeetingDone = () => { onLeadMeetingDone && onLeadMeetingDone(lead); onRefresh(); };
  const handleConvert = () => { if (lead.stage === 'Meeting Done') { onClose(); onConvertLead && onConvertLead(lead); } };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote(lead.id, noteText, meName);
    setNoteText('');
    onRefresh();
  };

  const handleAddFu = () => {
    if (!fuDate) { onToast('Pick a follow-up date'); return; }
    addFollowUp(lead.id, { type: fuType, dueAt: new Date(fuDate).toISOString() }, meName);
    setFuDate('');
    onRefresh();
  };

  const sc = scoreChip(lead.leadScore || 0);
  const stageIdx = LEAD_STAGES.indexOf(lead.stage);

  return createPortal(
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col h-full md:h-[90vh] max-h-screen" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar name={leadName(lead)} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{leadName(lead)}</h3>
                <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${STAGE_THEME[lead.stage]}`}>{lead.stage}</span>
                {lead.status !== 'Active' && <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${STATUS_THEME[lead.status]}`}>{lead.status}</span>}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="tabular-nums">{lead.mobile}</span>{lead.email && <><span>·</span>{lead.email}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isViewer && <button onClick={onEdit} className={btnSecondary + ' py-2 px-3'}><Pencil size={13} /> Edit</button>}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><X size={18} /></button>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1 min-w-max">
            {LEAD_STAGES.map((s, i) => (
              <React.Fragment key={s}>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                  i < stageIdx ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : i === stageIdx ? STAGE_THEME[s] + ' ring-1'
                      : 'bg-slate-50 text-slate-400 dark:bg-slate-800/40 dark:text-slate-600'}`}>
                  {i < stageIdx && <Check size={10} />} {s}
                </span>
                {i < LEAD_STAGES.length - 1 && <ChevronRight size={12} className="text-slate-300 dark:text-slate-700 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Quick actions + stage-contextual control */}
        {!isViewer && lead.status === 'Active' && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {lead.mobile && <a href={`tel:${lead.mobile}`} className={btnSecondary + ' py-1.5 px-3 text-[11px]'}><Phone size={12} /> Call</a>}
              {lead.mobile && <a href={`https://wa.me/${(lead.mobile || '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className={btnSecondary + ' py-1.5 px-3 text-[11px] text-emerald-600 dark:text-emerald-400'}><MessageCircle size={12} /> WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className={btnSecondary + ' py-1.5 px-3 text-[11px]'}><Mail size={12} /> Email</a>}
              <span className="ml-auto flex items-center gap-2">
                {!showLost ? (
                  <>
                    <button onClick={() => setShowLost(true)} className={btnGhost + ' py-1.5 px-2.5 text-[11px] text-rose-600 dark:text-rose-400'}>Mark Lost</button>
                    <button onClick={() => setStatus('Junk')} className={btnGhost + ' py-1.5 px-2.5 text-[11px]'}>Junk</button>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <div className="w-40"><CoolSelect value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={selectCls + ' text-xs py-1.5'}>{LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</CoolSelect></div>
                    <button onClick={() => setStatus('Lost', lostReason)} className={btnPrimary + ' py-1.5 px-3 text-[11px]'}>Confirm Lost</button>
                    <button onClick={() => setShowLost(false)} className={btnGhost + ' py-1.5 px-2 text-[11px]'}>Cancel</button>
                  </span>
                )}
              </span>
            </div>

            {/* Stage-specific next action — assigning the RM is Admin-only. */}
            {lead.stage === 'Waiting for Assignment' && canAssign && (
              <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/15 border border-blue-200/60 dark:border-blue-900/40 space-y-2.5">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider">Admin — Assign Lead</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-52"><Field label="Relationship Manager *"><CoolSelect value={assignRm} onChange={(e) => setAssignRm(e.target.value)} className={selectCls + ' text-xs py-1.5'}><option value="">Select RM…</option>{loadTeam().filter(m => Array.isArray(m.roles) && m.roles.includes('RM')).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</CoolSelect></Field></div>
                  <button onClick={doAssign} className={btnPrimary + ' py-2 px-3'}><ArrowRight size={13} /> Assign &amp; Qualify</button>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Others (optional)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {loadTeam().filter(m => m.id !== assignRm).map(m => (
                      <button key={m.id} type="button" onClick={() => toggleOther(m.id)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${assignOthers.includes(m.id) ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/40 font-bold' : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'}`}>
                        {assignOthers.includes(m.id) && <Check size={10} className="inline mr-1" />}{m.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {lead.stage === 'Qualified' && (
              <div className="p-3 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/15 border border-cyan-200/60 dark:border-cyan-900/40 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Initial Call task assigned to <b className="text-cyan-700 dark:text-cyan-300">{lead.ownerId ? teamName(lead.ownerId) : '—'}</b>. Mark it done here or from the Tasks module to move to Connected.
                  </span>
                  {!showCallRemarkForm && (
                    <button onClick={() => setShowCallRemarkForm(true)} className={btnPrimary + ' py-1.5 px-3 text-[11px] ml-auto'}>
                      <CheckCircle2 size={12} /> Mark Initial Call Won
                    </button>
                  )}
                </div>
                {showCallRemarkForm && (
                  <div className="space-y-2">
                    <Field label="Initial Call Remarks *" hint="Required — explain the outcome of the call">
                      <textarea
                        rows={2}
                        value={callRemark}
                        onChange={(e) => setCallRemark(e.target.value)}
                        placeholder="e.g. Connected with client, interested in SIP planning…"
                        className={inputCls + ' resize-y text-xs'}
                      />
                    </Field>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => { setShowCallRemarkForm(false); setCallRemark(''); }} className={btnGhost + ' py-1.5 px-3 text-[11px]'}>Cancel</button>
                      <button onClick={doWinInitialCall} disabled={!callRemark.trim()} className={btnPrimary + ' py-1.5 px-3 text-[11px]'}>
                        <CheckCircle2 size={12} /> Confirm Won
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {lead.stage === 'Connected' && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-950/15 border border-violet-200/60 dark:border-violet-900/40">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Lead is connected — schedule a meeting to proceed.</span>
                <button onClick={doOpenMeetingForm} className={btnPrimary + ' py-1.5 px-3 text-[11px] ml-auto'}>
                  <CalendarPlus size={12} /> Schedule Meeting
                </button>
              </div>
            )}

            {lead.stage === 'Meeting Pending' && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/15 border border-indigo-200/60 dark:border-indigo-900/40">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Meeting scheduled (visible in the Meetings module). Mark it done to proceed.</span>
                <button onClick={doMeetingDone} className={btnPrimary + ' py-1.5 px-3 text-[11px] ml-auto'}><CheckCircle2 size={12} /> Mark Meeting Done</button>
              </div>
            )}

            {lead.stage === 'Meeting Done' && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-900/40">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Ready to convert — this opens the New Client form prefilled with the lead's details.</span>
                <button onClick={handleConvert} className="ml-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-lg shadow-emerald-500/15 transition-all cursor-pointer">
                  <CheckCircle2 size={13} /> Convert to Client
                </button>
              </div>
            )}
          </div>
        )}
        {lead.status !== 'Active' && !isViewer && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <button onClick={() => setStatus('Active')} className={btnSecondary + ' py-1.5 px-3 text-[11px]'}><RefreshCw size={12} /> Reopen Lead</button>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 pt-4 shrink-0 flex items-center gap-1.5">
          {[['timeline', 'Timeline', Activity], ['followups', 'Follow-ups', Clock], ['details', 'Details', Briefcase]].map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${tab === id ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {tab === 'timeline' && (
            <div className="space-y-5">
              {!isViewer && (
                <div className="flex items-start gap-2">
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }} placeholder="Add a remark…" className={inputCls + ' text-xs'} />
                  <button onClick={handleAddNote} disabled={!noteText.trim()} className={btnPrimary + ' py-2.5 px-3 shrink-0'}><Send size={13} /></button>
                </div>
              )}
              <div className="relative pl-6 space-y-4 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800/80">
                {(lead.timeline || []).map(ev => (
                  <div key={ev.id} className="relative">
                    <span className="absolute -left-[19px] top-1 w-3.5 h-3.5 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-500 dark:border-blue-400 z-10" />
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{ev.action}</div>
                    {ev.description && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">{ev.description}</div>}
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{ev.actor} · {fmtStamp(ev.createdAt)}</div>
                  </div>
                ))}
                {(lead.timeline || []).length === 0 && <p className="text-xs text-slate-400 italic">No activity yet.</p>}
              </div>
            </div>
          )}

          {tab === 'followups' && (
            <div className="space-y-4">
              {!isViewer && (
                <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                  <div className="w-36"><Field label="Type"><CoolSelect value={fuType} onChange={(e) => setFuType(e.target.value)} className={selectCls + ' text-xs py-1.5'}>{FOLLOWUP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</CoolSelect></Field></div>
                  <div className="flex-1 min-w-[180px]"><Field label="When"><input type="datetime-local" value={fuDate} onChange={(e) => setFuDate(e.target.value)} className={inputCls + ' text-xs py-1.5'} /></Field></div>
                  <button onClick={handleAddFu} className={btnPrimary + ' py-2 px-3'}><Plus size={13} /> Schedule</button>
                </div>
              )}
              <div className="space-y-2">
                {(lead.followups || []).map(fu => (
                  <div key={fu.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${fu.status === 'Done' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'}`}>
                      {fu.type === 'Call' ? <Phone size={14} /> : fu.type === 'WhatsApp' ? <MessageCircle size={14} /> : fu.type === 'Email' ? <Mail size={14} /> : fu.type === 'Physical Meeting' ? <CalendarPlus size={14} /> : <Clock size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{fu.type} <span className="text-slate-400 font-normal">· {fmtStamp(fu.dueAt)}</span></div>
                      {fu.outcome && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{fu.outcome}</div>}
                    </div>
                    {fu.status === 'Pending' && !isViewer ? (
                      <button onClick={() => { const o = window.prompt('Outcome / note for this follow-up:', 'Connected'); if (o !== null) { completeFollowUp(lead.id, fu.id, o, meName); onRefresh(); } }} className={btnSecondary + ' py-1 px-2.5 text-[10px]'}><Check size={11} /> Complete</button>
                    ) : (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${fu.status === 'Done' ? 'text-emerald-600' : 'text-slate-400'}`}>{fu.status}</span>
                    )}
                  </div>
                ))}
                {(lead.followups || []).length === 0 && <p className="text-xs text-slate-400 italic">No follow-ups scheduled.</p>}
              </div>
            </div>
          )}

          {tab === 'details' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <DetailRow label="Full Name" value={leadName(lead)} />
              <DetailRow label="Mobile Number" value={lead.mobile} />
              <DetailRow label="Email ID" value={lead.email} />
              <DetailRow label="City / Location" value={lead.city} />
              <DetailRow label="Related To" value={Array.isArray(lead.relatedTo) ? lead.relatedTo.join(', ') : lead.relatedTo} />
              <DetailRow label="Lead Source" value={lead.leadSource} />
              {lead.leadSource === 'Referred By Client' && <DetailRow label="Referred By (Client)" value={[lead.referredClientName, lead.referredClientPan].filter(Boolean).join(' · ')} />}
              {lead.leadSource === 'Referred By Users' && <DetailRow label="Referred By (User)" value={lead.referredUser} />}
              <DetailRow label="Client Type" value={lead.clientType} />
              <DetailRow label="Assigned RM" value={lead.ownerId ? teamName(lead.ownerId) : 'Unassigned'} />
              <DetailRow label="Created" value={fmtStamp(lead.createdAt)} />
              <div className="sm:col-span-2"><DetailRow label="Lead Remarks" value={lead.remarks} /></div>
            </div>
          )}
        </div>
      </div>
    </div>, document.body
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold text-slate-800 dark:text-slate-200 ${mono ? 'font-mono tracking-wider' : ''}`}>{value || <span className="text-slate-400 dark:text-slate-600 italic font-normal">—</span>}</div>
    </div>
  );
}
