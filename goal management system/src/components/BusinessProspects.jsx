import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import SCHEMES from '../utils/schemes.json';
import {
  UserCheck, Search, X, Trash2, Pencil, Briefcase, CalendarClock, IndianRupee, CheckCircle2,
  LayoutGrid, Table as TableIcon, History, ArrowRight, Crown, Upload, Paperclip, ShieldCheck, Plus, Check, Download, Eye
} from 'lucide-react';
import { Card, Avatar, btnPrimary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import {
  loadProspects, saveProspects, CATEGORY_THEME, CATEGORY_LABEL, fmtProspectStamp, fmtAmountINR,
  PROSPECT_STAGES, INSURANCE_PROSPECT_STAGES, ALL_STAGE_THEME, ALL_PROSPECT_STAGES
} from '../utils/prospects';
import { uid } from '../utils/calc';
import { RELATIONS } from '../utils/team';
import { teamName, loadTeam } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canDo, isAdmin } from '../utils/permissions';
import { updateClient } from '../services/db';
import { CountrySelect, StateSelect, CitySelect } from './LocationPicker';
import { triggerInsuranceProspectDownload } from '../utils/prospectDownload';

// KYC dropdown option sets
const OCCUPATION_OPTIONS = ['Salaried', 'Self Employed', 'House Wife'];
const YES_NO = ['Yes', 'No'];

// "Consider Other Code?" source options (shown for SIP / Lumpsum investment
// proposals on the Create Prospect screen).
const OTHER_CODE_SOURCES = ['MF', 'Stock', 'FD', 'LIC'];
// Investment proposal types that may carry an Other Code annotation.
const OTHER_CODE_ELIGIBLE = ['Fresh SIP', 'Special SIP', 'Lumpsum Investment'];

// Document categories required for every insurance prospect, plus the
// occupation-conditional income-proof sets.
const BASE_DOC_CATEGORIES = [
  { key: 'aadharCard', label: 'Aadhaar Card' },
  { key: 'panCard', label: 'PAN Card' },
  { key: 'cancelledCheque', label: 'Cancelled Cheque' },
  { key: 'photo', label: 'Passport Size Photo' },
];
const SALARIED_DOC_CATEGORIES = [
  { key: 'salarySlip', label: 'Salary Slip (Last 3 Months)' },
  { key: 'bankStatement6m', label: '6 Month Bank Statement' },
];
const SELF_EMPLOYED_DOC_CATEGORIES = [
  { key: 'itr3yr', label: '3 Year ITR' },
  { key: 'computation3yr', label: '3 Year Computation' },
  { key: 'bankStatement6m', label: '6 Month Bank Statement' },
];

// Comprehensive document type list for the smart doc-upload picker.
// key = storage key, label = display name, group = <optgroup> heading.
const INSURANCE_DOC_TYPES = [
  // Identity Proof
  { key: 'aadharCard',      label: 'Aadhaar Card',              group: 'Identity Proof' },
  { key: 'panCard',         label: 'PAN Card',                   group: 'Identity Proof' },
  { key: 'passport',        label: 'Passport',                   group: 'Identity Proof' },
  { key: 'voterId',         label: 'Voter ID',                   group: 'Identity Proof' },
  { key: 'drivingLicense',  label: 'Driving License',            group: 'Identity Proof' },
  { key: 'birthCertificate',label: 'Birth Certificate',          group: 'Identity Proof' },
  // Address Proof
  { key: 'utilityBill',     label: 'Utility Bill',               group: 'Address Proof' },
  { key: 'rentAgreement',   label: 'Rent Agreement',             group: 'Address Proof' },
  { key: 'rationCard',      label: 'Ration Card',                group: 'Address Proof' },
  // Financial
  { key: 'cancelledCheque', label: 'Cancelled Cheque',           group: 'Financial' },
  { key: 'bankStatement3m', label: 'Bank Statement (3 Months)',  group: 'Financial' },
  { key: 'bankStatement6m', label: 'Bank Statement (6 Months)',  group: 'Financial' },
  { key: 'bankStatement12m',label: 'Bank Statement (12 Months)', group: 'Financial' },
  { key: 'itr1yr',          label: 'ITR (1 Year)',               group: 'Financial' },
  { key: 'itr3yr',          label: 'ITR (3 Years)',              group: 'Financial' },
  { key: 'computation3yr',  label: 'Computation (3 Years)',      group: 'Financial' },
  { key: 'form16',          label: 'Form 16',                    group: 'Financial' },
  { key: 'caCertificate',   label: 'CA Certificate',             group: 'Financial' },
  // Employment
  { key: 'salarySlip',      label: 'Salary Slip (Last 3 Months)',group: 'Employment' },
  { key: 'employmentLetter',label: 'Employment Letter',          group: 'Employment' },
  { key: 'appointmentLetter',label: 'Appointment Letter',        group: 'Employment' },
  // Medical
  { key: 'medicalReport',   label: 'Medical Report',             group: 'Medical' },
  { key: 'firstPrescription',label: 'First Prescription',        group: 'Medical' },
  { key: 'ecg',             label: 'ECG Report',                 group: 'Medical' },
  { key: 'bloodReport',     label: 'Blood Report',               group: 'Medical' },
  { key: 'xray',            label: 'X-Ray Report',               group: 'Medical' },
  // Insurance / Policy
  { key: 'photo',           label: 'Passport Size Photo',        group: 'Insurance' },
  { key: 'policyDocument',  label: 'Policy Document',            group: 'Insurance' },
  { key: 'proposalForm',    label: 'Proposal Form',              group: 'Insurance' },
  { key: 'previousPolicy',  label: 'Previous Policy',            group: 'Insurance' },
  { key: 'surrenderLetter', label: 'Surrender Letter',           group: 'Insurance' },
  // Other
  { key: 'other',           label: 'Other',                      group: 'Other' },
];

// Helper to look up a doc type label by key (handles legacy keys too)
const docTypeLabel = (key) => INSURANCE_DOC_TYPES.find(d => d.key === key)?.label || key;

// Composite key separator — must not appear in doc-type keys or applicant names
const DOC_KEY_SEP = '|||';

const CATEGORIES = [
  "Small Cap",
  "Mid Cap",
  "Large Cap",
  "Large and Mid Cap",
  "Flexi Cap",
  "Multi Cap",
  "Multi Asset",
  "Gold",
  "Debt"
];

const getSchemesForCategory = (cat) => {
  if (cat && SCHEMES[cat]) {
    return SCHEMES[cat];
  }
  const all = {};
  for (const c in SCHEMES) {
    SCHEMES[c].forEach(s => { all[s] = true; });
  }
  return Object.keys(all).sort();
};

// ===========================================================================
// PROSPECTS MODULE — list of all generated business prospects
// ===========================================================================
export default function ProspectsView({ isViewer, onOpenProspect, prospectsChangeCounter, activeProspectId, setActiveProspectId, clients = [], initialQuery = '' }) {
  const [prospects, setProspects] = useState(() => loadProspects());
  const [query, setQuery] = useState(initialQuery);
  const [stageFilter, setStageFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card'
  const [editing, setEditing] = useState(null); // local fallback modal when no onOpenProspect is supplied

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Re-read from storage when proposal pages add prospects
  useEffect(() => {
    const sync = () => setProspects(loadProspects());
    window.addEventListener('focus', sync);
    window.addEventListener('crm:prospects-updated', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('crm:prospects-updated', sync);
    };
  }, []);

  // Re-sync when a parent-driven edit (e.g. from Client Profile) saves a change
  useEffect(() => {
    setProspects(loadProspects());
  }, [prospectsChangeCounter]);

  // Deep-link: open a specific prospect's form when navigated here with an id
  useEffect(() => {
    if (activeProspectId) {
      const found = prospects.find(p => p.id === activeProspectId);
      if (found) openEdit(found);
      if (setActiveProspectId) setActiveProspectId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProspectId, prospects]);

  const persist = (next) => { setProspects(next); saveProspects(next); };

  // RBAC: which module governs this prospect (investment vs insurance), and
  // whether the current account may do anything with it at all — used to
  // hide the Edit affordance entirely for a prospect the account has neither
  // editDetails nor changeStage rights on (only Admin may delete one).
  const prospectModuleFor = (p) => (p.proposalCategory === 'insurance' ? 'insuranceProspects' : 'investmentProspects');
  const mayEditOrStage = (p) => canDo(prospectModuleFor(p), 'editDetails', p) || canDo(prospectModuleFor(p), 'changeStage', p);
  const me = getCurrentUser();
  const mayDelete = isAdmin(me);

  const openEdit = (p) => {
    if (onOpenProspect) onOpenProspect(p);
    else setEditing(p);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prospects
      .filter(p => stageFilter === 'all' || (p.stage || 'Qualified') === stageFilter)
      .filter(p => catFilter === 'all' || p.proposalCategory === catFilter)
      .filter(p => !q ||
        (p.applicant || '').toLowerCase().includes(q) ||
        (p.groupLeader || '').toLowerCase().includes(q) ||
        (p.proposalType || '').toLowerCase().includes(q) ||
        (p.pan || '').toLowerCase().includes(q))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [prospects, query, stageFilter, catFilter]);

  const stageCounts = useMemo(() => {
    const c = { all: prospects.length };
    ALL_PROSPECT_STAGES.forEach(s => { c[s] = prospects.filter(p => (p.stage || 'Qualified') === s).length; });
    return c;
  }, [prospects]);

  const handleSaveEdit = (updated) => {
    persist(prospects.map(p => p.id === updated.id ? updated : p));
    setEditing(null);
  };
  const handleDelete = (id) => {
    if (!window.confirm('Delete this prospect? This cannot be undone.')) return;
    persist(prospects.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <UserCheck size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Business Prospects</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Opportunities generated from Insurance &amp; Investment proposals</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prospect…" className={inputCls + ' pl-9 w-full md:w-56'} />
          </div>
          {/* View toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 shrink-0">
            <button onClick={() => setViewMode('table')} title="Table view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><TableIcon size={15} /></button>
            <button onClick={() => setViewMode('card')} title="Card view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'card' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={15} /></button>
          </div>
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" count={stageCounts.all} active={stageFilter === 'all'} onClick={() => setStageFilter('all')} />
        {ALL_PROSPECT_STAGES.filter(s => stageCounts[s] > 0 || stageFilter === s).map(s => (
          <FilterChip key={s} label={s} count={stageCounts[s]} active={stageFilter === s} onClick={() => setStageFilter(s)} />
        ))}
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-800" />
        {['all', 'investment', 'insurance', 'othercode'].map(c => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              catFilter === c
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {c === 'all' ? 'All Types' : (CATEGORY_LABEL[c] || c)}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <UserCheck className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {prospects.length === 0 ? 'No prospects yet' : 'No prospects match your filters'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Open a client's Proposals → build a proposal → click <strong>Create Prospect</strong>.</p>
        </Card>
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Proposal</th>
                  <th className="text-left px-6 py-4 font-bold">Applicant</th>
                  <th className="text-right px-6 py-4 font-bold">Amount</th>
                  <th className="text-left px-6 py-4 font-bold">Closing</th>
                  <th className="text-center px-6 py-4 font-bold">Stage</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => openEdit(p)} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{p.proposalType}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${CATEGORY_THEME[p.proposalCategory] || CATEGORY_THEME.investment}`}>{CATEGORY_LABEL[p.proposalCategory] || p.proposalCategory}</span>
                        {(p.proposalType === 'Proposed SIP Changes' || p.proposalType === 'sipchanges') && (
                          <>
                            {p.sipRejected && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40">
                                Rejected: {fmtAmountINR(p.sipRejected)}
                              </span>
                            )}
                            {p.sipContinue && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                                Continue: {fmtAmountINR(p.sipContinue)}
                              </span>
                            )}
                          </>
                        )}
                        {p.otherCodeEnabled && (
                          <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                            Other Code{p.otherCodeSource ? ` · ${p.otherCodeSource}` : ''}{p.otherCodeAmount ? ` · ${fmtAmountINR(p.otherCodeAmount)}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-700 dark:text-slate-300 font-medium">{p.applicant || '—'}</div>
                      {p.pan && <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">{p.pan}</div>}
                      {p.groupLeader && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1"><Crown size={10} className="text-amber-500" /> {p.groupLeader}</div>}
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums font-bold text-slate-900 dark:text-white">{fmtAmountINR(p.amount)}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 tabular-nums">{p.closingDate ? new Date(p.closingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${ALL_STAGE_THEME[p.stage || 'Qualified']}`}>{p.stage || 'Qualified'}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.proposalCategory === 'insurance' && (
                          <button onClick={(e) => { e.stopPropagation(); triggerInsuranceProspectDownload(p); }} className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-all" title="Download Report"><Download size={14} /></button>
                        )}
                        {mayDelete && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all" title="Delete"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id} className="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${CATEGORY_THEME[p.proposalCategory] || CATEGORY_THEME.investment}`}>{CATEGORY_LABEL[p.proposalCategory] || p.proposalCategory}</span>
                  <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${ALL_STAGE_THEME[p.stage || 'Qualified']}`}>{p.stage || 'Qualified'}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {p.proposalCategory === 'insurance' && (
                    <button onClick={(e) => { e.stopPropagation(); triggerInsuranceProspectDownload(p); }} className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50/50 dark:hover:bg-violet-950/30" title="Download Report"><Download size={13} /></button>
                  )}
                  {mayEditOrStage(p) && (
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/30" title="Edit"><Pencil size={13} /></button>
                  )}
                  {mayDelete && (
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/30" title="Delete"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
              <button onClick={() => openEdit(p)} className="text-left w-full mt-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{p.proposalType}</h3>
                <div className="mt-1 text-lg font-black text-slate-900 dark:text-white tabular-nums">{fmtAmountINR(p.amount)}</div>
                {p.otherCodeEnabled && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                      Other Code{p.otherCodeSource ? ` · ${p.otherCodeSource}` : ''}{p.otherCodeAmount ? ` · ${fmtAmountINR(p.otherCodeAmount)}` : ''}
                    </span>
                  </div>
                )}
                {(p.proposalType === 'Proposed SIP Changes' || p.proposalType === 'sipchanges') && (p.sipRejected || p.sipContinue) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {p.sipRejected && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40">
                        Rejected: {fmtAmountINR(p.sipRejected)}
                      </span>
                    )}
                    {p.sipContinue && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                        Continue: {fmtAmountINR(p.sipContinue)}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <Avatar name={p.applicant} size="sm" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{p.applicant}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <CalendarClock size={10} /> {p.closingDate ? `Closing ${new Date(p.closingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : (p.createdAt ? fmtProspectStamp(p.createdAt) : '—')}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Local fallback modal — only used when this view manages its own state
          (i.e. no onOpenProspect was supplied by a parent like App.jsx) */}
      {!onOpenProspect && editing && (
        <ProspectModal
          mode="edit"
          initial={editing}
          clients={clients}
          isViewer={isViewer}
          onClose={() => setEditing(null)}
          onConfirm={(list) => handleSaveEdit(list[0])}
        />
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

// ===========================================================================
// PROSPECT MODAL — confirmation/edit form
//   mode "create": receives `drafts` (one per selected proposal) + `base`;
//                  each proposal is its own tab with its own table + remarks.
//   mode "edit":   receives a single `initial` prospect (+ stage management)
// ===========================================================================
export function ProspectModal({ mode = 'create', drafts = [], base = {}, initial = null, clients = [], onClose, onConfirm, isViewer = false }) {
  const isEdit = mode === 'edit';
  const seed = isEdit ? initial : base;

  // RBAC: creation itself is already gated upstream (ProposalWorkspace only
  // shows tabs this account can create in). For an existing prospect, the
  // module — and so the rule — depends on its category: Portfolio Manager/RM
  // edit investment prospects, only Service Manager moves their stage;
  // Insurance Manager alone edits/stages insurance prospects.
  const prospectModuleKey = initial?.proposalCategory === 'insurance' ? 'insuranceProspects' : 'investmentProspects';
  const canEditDetails = !isEdit || canDo(prospectModuleKey, 'editDetails', initial);
  const canChangeStage = !isEdit || canDo(prospectModuleKey, 'changeStage', initial);
  // Once a prospect exists, everything that came from the original proposal
  // (group leader, applicant, PAN, closing date, amount, scheme table, other-code)
  // is permanently locked — no role can edit it, unlike canEditDetails above
  // which only gates *whether this account* may edit. Only prospect-management
  // fields entered after the fact (stage, remarks, policy issuance) stay editable.
  const locked = isEdit;

  // Shared header fields (apply to every prospect being created)
  const [groupLeader, setGroupLeader] = useState(seed.groupLeader || '');

  // The client this prospect belongs to (used to read/write Documents attachments)
  const linkedClient = useMemo(
    () => clients.find(c => c.id === (seed.groupLeaderId || initial?.groupLeaderId)) || clients.find(c => c.name === groupLeader) || null,
    [clients, seed, initial, groupLeader]
  );

  const [applicant, setApplicant] = useState(seed.applicant || '');
  const [pan, setPan] = useState(seed.pan || '');
  const [closingDate, setClosingDate] = useState(seed.closingDate || '');
  // Inherited from the client's Internal Team Assignments (ids used for RBAC).
  // Prefilled from the client profile but EDITABLE via a team-member dropdown
  // on create — one person can be the manager on many things, so the advisor
  // can reassign here and the chosen value is what the prospect is created
  // with. A dropdown (not free text) keeps the value a valid team id, so
  // access can't silently break the way typing over an id would.
  const [serviceManager, setServiceManager] = useState(seed.serviceManager || '');
  const [relationshipManager, setRelationshipManager] = useState(seed.relationshipManager || '');
  const [owner, setOwner] = useState(seed.owner || '');
  const [internalManager, setInternalManager] = useState(seed.internalManager || '');
  const [insuranceManager, setInsuranceManager] = useState(seed.insuranceManager || '');
  const [portfolioManager, setPortfolioManager] = useState(seed.portfolioManager || '');

  // KYC & health questionnaire — collected once per applicant, applies to every
  // proposal in this confirmation (shown only when an insurance proposal is involved)
  const [kyc, setKyc] = useState(() => {
    const merged = {
      email: '', mobile: '', nomineeName: '', nomineeRelation: '',
      height: '', weight: '', placeOfBirth: '', motherName: '', fatherName: '',
      occupation: '', maritalStatus: '', smoking: '', tobacco: '', alcohol: '',
      medicalHistory: '', covid: '', annualIncome: '',
      officeAddress1: '', officeAddress2: '', officeAddress3: '',
      officeCity: '', officePincode: '', officeState: '', officeCountry: '',
      diseases: [],
      ...(seed.kyc || {}),
    };
    // Migrate the legacy single Disease Name field (pre-multi-disease) into the new list
    if ((!merged.diseases || merged.diseases.length === 0) && seed.kyc?.diseaseName) {
      merged.diseases = [{ id: uid(), name: seed.kyc.diseaseName }];
    }
    return merged;
  });
  const updateKyc = (field, val) => setKyc(prev => ({ ...prev, [field]: val }));

  const addDisease = () => setKyc(prev => ({ ...prev, diseases: [...(prev.diseases || []), { id: uid(), name: '' }] }));
  const updateDiseaseName = (diseaseId, name) => setKyc(prev => ({
    ...prev,
    diseases: (prev.diseases || []).map(d => d.id === diseaseId ? { ...d, name } : d),
  }));
  const removeDisease = (diseaseId) => {
    setKyc(prev => ({ ...prev, diseases: (prev.diseases || []).filter(d => d.id !== diseaseId) }));
    setDocuments(prev => {
      const next = { ...prev };
      delete next[`firstPrescription_${diseaseId}`];
      return next;
    });
  };

  // Documents — multi-file per category; merged into the client's Documents/Attachments on save
  const [documents, setDocuments] = useState(() => ({ ...(seed.documents || {}) }));

  // Keep documents dataUrl synchronized with the client's attachments when client loads/updates
  useEffect(() => {
    if (!linkedClient || !linkedClient.clientDetails?.attachments) return;
    const clientAttachments = linkedClient.clientDetails.attachments;
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
  }, [linkedClient]);

  const addDocFiles = (category, files) => {
    setDocuments(prev => ({ ...prev, [category]: [...(prev[category] || []), ...files] }));
  };
  const removeDocFile = (category, fileId) => {
    setDocuments(prev => ({ ...prev, [category]: (prev[category] || []).filter(f => f.id !== fileId) }));
  };

  // Stage management (edit mode)
  const initialStage = initial?.stage || 'Qualified';
  const [stage, setStage] = useState(initialStage);
  const [stageRemark, setStageRemark] = useState('');
  const stageChanged = isEdit && stage !== initialStage;

  // Policy Issued — additional mandatory fields once that stage is selected
  const [policyIssueDate, setPolicyIssueDate] = useState(initial?.policyIssueDate || '');

  // Per-proposal items (each has its own amount, table AND remarks). One tab each.
  const initialItems = isEdit
    ? [{
        proposalType: initial.proposalType,
        proposalCategory: initial.proposalCategory,
        amount: initial.amount,
        table: initial.table || { cols: [], rows: [] },
        remarks: initial.remarks || '',
        remarksBy: initial.remarksBy || '',
        remarksAt: initial.remarksAt || '',
        sipRejected: initial.sipRejected || '',
        sipContinue: initial.sipContinue || '',
        otherCodeEnabled: initial.otherCodeEnabled || false,
        otherCodeSource: initial.otherCodeSource || '',
        otherCodeAmount: initial.otherCodeAmount || ''
      }]
    : drafts.map(d => ({ remarks: '', sipRejected: '', sipContinue: '', otherCodeEnabled: false, otherCodeSource: '', otherCodeAmount: '', ...d }));
  const [items, setItems] = useState(initialItems);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = items[activeIdx] || items[0] || {};

  const setActiveField = (field, val) => {
    setItems(prev => prev.map((it, idx) => idx === activeIdx ? { ...it, [field]: val } : it));
  };

  const handleTableChange = (rowIndex, colIndex, value) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx !== activeIdx) return it;
      const newRows = [...it.table.rows];
      const row = [...newRows[rowIndex]];
      row[colIndex] = value;
      newRows[rowIndex] = row;

      // Re-calculate totals if there is a totalRow
      let newTotalRow = it.table.totalRow;
      let newAmount = it.amount;
      if (newTotalRow) {
        newTotalRow = it.table.cols.map((col, ci) => {
          if (ci === 0) return "";
          if (ci === 1) return "TOTAL";
          const isNum = (col.toLowerCase().includes('amount') || col.toLowerCase().includes('sip') || col.toLowerCase().includes('term')) && !col.toLowerCase().includes('date');
          if (isNum) {
            const sum = newRows.reduce((s, r) => {
              const val = String(r[ci] || '').replace(/,/g, '');
              const num = parseFloat(val);
              return s + (isNaN(num) ? 0 : num);
            }, 0);
            newAmount = sum; // Auto-update the main prospect amount!
            return sum;
          }
          return "";
        });
      }

      return {
        ...it,
        amount: newAmount,
        table: {
          ...it.table,
          rows: newRows,
          totalRow: newTotalRow
        }
      };
    }));
  };

  // KYC section is only shown when at least one selected proposal in this
  // confirmation is an Insurance proposal (it's informational, not enforced).
  const hasInsuranceItem = items.some(it => it.proposalCategory === 'insurance');

  // Insurance prospects move through an underwriting-shaped pipeline;
  // everything else keeps the generic investment pipeline.
  const stageOptions = hasInsuranceItem ? INSURANCE_PROSPECT_STAGES : PROSPECT_STAGES;

  const requiredDocCategories = useMemo(() => {
    if (!hasInsuranceItem) return [];
    const extra = kyc.occupation === 'Salaried' ? SALARIED_DOC_CATEGORIES
      : kyc.occupation === 'Self Employed' ? SELF_EMPLOYED_DOC_CATEGORIES
      : [];
    return [...BASE_DOC_CATEGORIES, ...extra];
  }, [hasInsuranceItem, kyc.occupation]);



  // NOTE: KYC fields, the disease/prescription set, document uploads, and the
  // Policy-Issued date/document are all shown with "*" / "Required" guidance
  // for completeness, but are intentionally NOT enforced — a prospect can be
  // created or saved with a partial (or empty) KYC section.
  const canSave = (!isEdit || canEditDetails || canChangeStage) &&
    groupLeader.trim() && applicant.trim() && items.length > 0 &&
    (!stageChanged || stageRemark.trim()) &&
    items.every(it => String(it.amount || '').trim() !== '' && Number(it.amount) > 0);

  // Pushes newly uploaded KYC documents into the linked client's Documents/Attachments
  // store, so they show up in the Documents module too.
  // Only runs for insurance prospects (KYC upload section only exists for those).
  const syncDocumentsToClient = async () => {
    if (!hasInsuranceItem || !linkedClient) return;
    const diseaseNameById = Object.fromEntries((kyc.diseases || []).map(d => [d.id, d.name || 'Disease']));
    const allLegacyCategories = [...BASE_DOC_CATEGORIES, ...SALARIED_DOC_CATEGORIES, ...SELF_EMPLOYED_DOC_CATEGORIES, { key: 'policyDocument', label: 'Policy Document' }];
    const newAttachments = [];
    Object.entries(documents).forEach(([catKey, files]) => {
      // Resolve label + applicant from composite key (new format) or legacy key
      let label, fileApplicant;
      if (catKey.includes(DOC_KEY_SEP)) {
        const [dtKey, appName] = catKey.split(DOC_KEY_SEP);
        label = docTypeLabel(dtKey);
        fileApplicant = appName;
      } else {
        label = allLegacyCategories.find(c => c.key === catKey)?.label;
        if (!label && catKey.startsWith('firstPrescription_')) {
          const diseaseId = catKey.slice('firstPrescription_'.length);
          label = `First Prescription (${diseaseNameById[diseaseId] || 'Disease'})`;
        }
        label = label || catKey;
        fileApplicant = applicant.trim() || groupLeader.trim();
      }
      // Count how many non-prospect docs already exist for this category+applicant
      // so we can continue the numbering sequence from the right number.
      const existingClientDocs = linkedClient.clientDetails?.attachments || [];
      const seedIds = new Set(
        seed?.documents ? Object.values(seed.documents).flatMap(a => (a || []).map(f => f.id)) : []
      );
      const withinBatchCount = {};
      (files || []).forEach(f => {
        const appName = f.applicantName || fileApplicant || applicant.trim() || groupLeader.trim();
        const key = `${label}|||${appName}`;
        // Count existing client docs with same category+applicant that aren't from this prospect
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

    // Resolve IDs of documents originally associated with this prospect
    const originalIds = new Set();
    if (seed && seed.documents) {
      Object.values(seed.documents).forEach(arr => {
        (arr || []).forEach(f => {
          if (f.id) originalIds.add(f.id);
        });
      });
    }

    // Keep all client attachments except duplicates or deleted prospect documents
    const existing = (linkedClient.clientDetails?.attachments || []).filter(ex => {
      if (newAttachments.some(n => n.id === ex.id)) return false;
      if (originalIds.has(ex.id)) {
        // If it was in the prospect's original documents, but is no longer in newAttachments,
        // we should delete it ONLY if it wasn't a pre-existing general attachment (i.e. has isExisting: true).
        const originalFile = Object.values(seed.documents || {}).flatMap(a => a || []).find(f => f.id === ex.id);
        if (originalFile && originalFile.isExisting) {
          return true; // Keep it!
        }
        return false; // Delete it!
      }
      return true;
    });

    await updateClient(linkedClient.id, {
      clientDetails: { ...linkedClient.clientDetails, attachments: [...newAttachments, ...existing] }
    });
    if (window.refreshAppData) await window.refreshAppData();
  };

  const handleConfirm = () => {
    if (!canSave) return;

    // Strip base64 file data from documents before saving to localStorage.
    // Uploaded files (Aadhaar, PAN, photos etc.) can be several MB each; including
    // them in the prospect object silently blows past the 5 MB localStorage quota
    // and causes saveProspects() to silently fail — prospect never appears anywhere.
    // The actual binaries are written to client.clientDetails.attachments by
    // syncDocumentsToClient() which runs immediately after onConfirm().
    const safeDocuments = {};
    if (hasInsuranceItem) {
      Object.entries(documents).forEach(([key, files]) => {
        safeDocuments[key] = (files || []).map(({ dataUrl, data, ...meta }) => meta);
      });
    }

    const shared = {
      groupLeaderId: seed.groupLeaderId || initial?.groupLeaderId || '',
      groupLeader: groupLeader.trim(), applicant: applicant.trim(), pan, closingDate,
      serviceManager, relationshipManager, owner, internalManager, insuranceManager, portfolioManager,
      kyc: hasInsuranceItem ? kyc : (seed.kyc || {}),
      documents: hasInsuranceItem ? safeDocuments : (seed.documents || {}),
      policyIssueDate: stage === 'Policy Issued' ? policyIssueDate : (initial?.policyIssueDate || ''),
    };
    const historyAuthor = getCurrentUser()?.name || 'System';
    let stageHistory = [...(initial?.stageHistory || [])];
    // First log entry, once, when the prospect is created: "Prospect created by
    // <user>" so the timeline always opens with who created it and when.
    if (!isEdit) {
      stageHistory.push({
        at: new Date().toISOString(),
        by: historyAuthor,
        from: '',
        to: '',
        remark: 'Prospect created',
        created: true,
      });
    }
    if (stageChanged) {
      stageHistory.push({
        at: new Date().toISOString(),
        by: historyAuthor,
        from: initialStage,
        to: stage,
        remark: stageRemark.trim()
      });
    } else if (stageRemark.trim()) {
      stageHistory.push({
        at: new Date().toISOString(),
        by: historyAuthor,
        from: '',
        to: '',
        remark: stageRemark.trim()
      });
    }

    const list = items.map((it) => ({
      id: (isEdit && initial?.id) || uid(),
      ...shared,
      proposalType: it.proposalType,
      proposalCategory: it.proposalCategory,
      amount: it.amount,
      table: it.table || { cols: [], rows: [] },
      remarks: it.remarks || '',
      // Remarks is a single free-text field, not a log — track who last
      // touched it (only re-stamped when the text actually changed).
      remarksBy: (it.remarks || '') !== (isEdit ? (initial?.remarks || '') : '') ? historyAuthor : (initial?.remarksBy || ''),
      remarksAt: (it.remarks || '') !== (isEdit ? (initial?.remarks || '') : '') ? new Date().toISOString() : (initial?.remarksAt || ''),
      sipRejected: it.sipRejected || '',
      sipContinue: it.sipContinue || '',
      otherCodeEnabled: !!it.otherCodeEnabled,
      otherCodeSource: it.otherCodeEnabled ? (it.otherCodeSource || '') : '',
      otherCodeAmount: it.otherCodeEnabled ? (it.otherCodeAmount || '') : '',
      stage: isEdit ? stage : 'Qualified',
      stageHistory,
      createdAt: (isEdit && initial?.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Create/save the prospect FIRST so it can never be blocked or lost by a
    // document-sync hiccup. The KYC document upload to the client's Documents
    // store then runs as a best-effort background step.
    onConfirm(list);
    syncDocumentsToClient().catch(err => console.error('Failed to sync KYC documents to client:', err));
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-50 flex items-center justify-center p-0 md:p-6 overflow-hidden animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col h-full md:h-[90vh] max-h-screen" onClick={(e) => e.stopPropagation()}>
        {/* Header (fixed) */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {isEdit ? <Pencil size={15} /> : <Briefcase size={16} />}
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {isEdit ? 'Edit Prospect' : `Confirm Prospect${items.length > 1 ? `s (${items.length})` : ''}`}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body (scrolls) */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Stage — gated independently of the rest of the details (a Service
              Manager / Insurance Manager may hold ONLY changeStage rights,
              not editDetails, or vice versa for Portfolio Manager/RM). */}
          {isEdit && (
            <div className="max-w-xs">
              <Field label="Stage">
                <CoolSelect
                  value={stage} onChange={(e) => setStage(e.target.value)} disabled={!canChangeStage}
                  className={selectCls + (!canChangeStage ? ' opacity-60 cursor-not-allowed' : '')}
                >
                  {stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </CoolSelect>
              </Field>
              {!canChangeStage && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">You don't have permission to change this prospect's stage.</p>}
            </div>
          )}

          {/* Everything below is the actual prospect DETAIL data — locked read-only
              (via a native disabled <fieldset>, which cascades to every input/
              select/textarea/button inside) for an account that lacks editDetails
              rights on this prospect's category. `contents` keeps the fieldset
              itself out of the layout so it doesn't disturb spacing/grid. */}
          {locked && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 -mt-2">These are the original proposal details and can no longer be edited — only the stage, remarks, and policy issuance below can change.</p>
          )}
          {/* Shared prospect fields */}
          <fieldset disabled={locked} className="contents">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Group Leader Name *" hint="Locked — set from the client record">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                {groupLeader || '—'}
              </div>
            </Field>
            <Field label="Applicant Name *" hint="Locked — set from the client record">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                {applicant || '—'}
              </div>
            </Field>
            <Field label="PAN of Applicant" hint="Locked — set from the client record">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-mono tracking-widest uppercase">
                {pan || '—'}
              </div>
            </Field>
            <Field label="Created Date & Time" hint="Set automatically">
              <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 tabular-nums">
                {isEdit && initial?.createdAt ? fmtProspectStamp(initial.createdAt) : 'On confirm'}
              </div>
            </Field>
            <Field label="Closing Date">
              <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Service Manager" hint="Prefilled from profile — editable"><TeamSelect value={serviceManager} onChange={setServiceManager} /></Field>
            <Field label="Relationship Manager" hint="Prefilled from profile — editable"><TeamSelect value={relationshipManager} onChange={setRelationshipManager} /></Field>
            <Field label="Owner" hint="Prefilled from profile — editable"><TeamSelect value={owner} onChange={setOwner} /></Field>
            <Field label="Internal Manager" hint="Prefilled from profile — editable"><TeamSelect value={internalManager} onChange={setInternalManager} /></Field>
            <Field label="Insurance Manager" hint="Prefilled from profile — editable"><TeamSelect value={insuranceManager} onChange={setInsuranceManager} /></Field>
            <Field label="Portfolio Manager" hint="Prefilled from profile — editable"><TeamSelect value={portfolioManager} onChange={setPortfolioManager} /></Field>
          </div>
          </fieldset>


          {/* Proposals — tabbed sections (one per proposal), each with its own table + remarks */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {isEdit ? 'Proposal' : `Proposals — ${items.length} prospect${items.length > 1 ? 's' : ''} will be created`}
            </h4>

            {items.length > 1 && (
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/70 dark:bg-slate-950/40 rounded-xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((it, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`px-3.5 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                      activeIdx === i ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {it.proposalType}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-4 space-y-3">
              <fieldset disabled={locked} className="contents">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${CATEGORY_THEME[active.proposalCategory] || CATEGORY_THEME.investment}`}>{CATEGORY_LABEL[active.proposalCategory] || active.proposalCategory}</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{active.proposalType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {active.proposalType === 'SIP Cancellation' || active.proposalType === 'SIP Registration' ? 'Amount *' : 'Amount'}
                  </span>
                  <div className="relative">
                    <IndianRupee size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={active.amount}
                      onChange={(e) => setActiveField('amount', e.target.value.replace(/[^0-9.]/g, ''))}
                      className={inputCls + ' pl-7 py-1.5 w-36 text-right tabular-nums font-bold'}
                    />
                  </div>
                </div>
              </div>
              <ProspectTable table={active.table} onChange={handleTableChange} />

              {/* Consider Other Code? — only for SIP / Lumpsum investment proposals */}
              {active.proposalCategory === 'investment' && OTHER_CODE_ELIGIBLE.includes(active.proposalType) && (
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/15 p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setActiveField('otherCodeEnabled', !active.otherCodeEnabled)}
                    className="flex items-center gap-2.5 cursor-pointer select-none"
                  >
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                        active.otherCodeEnabled
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {active.otherCodeEnabled && <Check size={13} />}
                    </span>
                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Consider Other Code?</span>
                  </button>

                  {active.otherCodeEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <Field label="Source">
                        <CoolSelect
                          value={active.otherCodeSource}
                          onChange={(e) => setActiveField('otherCodeSource', e.target.value)}
                          className={selectCls}
                        >
                          <option value="">Select source…</option>
                          {OTHER_CODE_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </CoolSelect>
                      </Field>
                      <Field label="Amount">
                        <div className="relative">
                          <IndianRupee size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            value={active.otherCodeAmount}
                            onChange={(e) => setActiveField('otherCodeAmount', e.target.value.replace(/[^0-9.]/g, ''))}
                            placeholder="e.g. 50000"
                            className={inputCls + ' pl-7 tabular-nums'}
                          />
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              )}
          </fieldset>

          {/* Prospect-management fields — stay editable (subject to RBAC) even
              after the prospect has been created, unlike the locked fieldset above. */}
          <fieldset disabled={isEdit && !canEditDetails} className="contents">
          {!canEditDetails && isEdit && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 -mt-2">You don't have permission to edit this prospect's details — only the stage above.</p>
          )}
              {/* Policy Issued — extra mandatory fields alongside the log entry */}
              {stage === 'Policy Issued' && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/15 p-4 space-y-3">
                  <h5 className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> Policy Issuance Details
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Policy Issue Date *">
                      <input type="date" value={policyIssueDate} onChange={(e) => setPolicyIssueDate(e.target.value)} className={inputCls} />
                    </Field>
                    <DocUploadGroup
                      label="Upload Policy Document"
                      required
                      files={documents.policyDocument || []}
                      onAdd={(files) => addDocFiles('policyDocument', files)}
                      onRemove={(fileId) => removeDocFile('policyDocument', fileId)}
                      existingDocs={existingDocsFor(linkedClient, 'Policy Document', documents.policyDocument)}
                      clientAttachments={linkedClient?.clientDetails?.attachments || []}
                      isViewer={isViewer}
                    />
                  </div>
                </div>
              )}

              <Field label="Remarks (for this proposal)">
                <textarea value={active.remarks} onChange={(e) => setActiveField('remarks', e.target.value)} rows={2} className={inputCls + ' resize-y'} placeholder={`Notes for ${active.proposalType}…`} />
                {active.remarksBy && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Last edited by <span className="font-semibold text-blue-500 dark:text-blue-400">{active.remarksBy}</span>
                    {active.remarksAt ? ` · ${new Date(active.remarksAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                  </p>
                )}
              </Field>
              </fieldset>
            </div>
          </div>

          {/* KYC & Health Questionnaire — only for Insurance proposals */}
          {hasInsuranceItem && (
            <InsuranceKycSection
              kyc={kyc}
              updateKyc={updateKyc}
              addDisease={addDisease}
              updateDiseaseName={updateDiseaseName}
              removeDisease={removeDisease}
              documents={documents}
              addDocFiles={addDocFiles}
              removeDocFile={removeDocFile}
              requiredDocCategories={requiredDocCategories}
              linkedClient={linkedClient}
              isViewer={isViewer}
            />
          )}

          {/* Comments & Logs (Stage change log timeline - shifted here, below proposal/KYC) */}
          {isEdit && (initial?.stageHistory || []).length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <History size={14} /> Comments &amp; Logs
              </h4>
              <ol className="space-y-3 max-h-48 overflow-y-auto pl-3 pr-1">
                {[...initial.stageHistory].map((h, i) => {
                  let fromStage = h.from;
                  let toStage = h.to;
                  let remark = h.remark;
                  let isStageChange = !!(fromStage && toStage);

                  if (h.text) {
                    const match = h.text.match(/^Stage changed from (.*) to (.*?)(?:\s*\|\s*(.*))?$/);
                    if (match) {
                      fromStage = match[1];
                      toStage = match[2];
                      remark = match[3];
                      isStageChange = true;
                    } else {
                      remark = h.text;
                      isStageChange = false;
                    }
                  }

                  return (
                    <li key={i} className="relative pl-5 border-l-2 border-slate-200 dark:border-slate-800">
                      <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-slate-900" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{fmtProspectStamp(h.at)}</span>
                          {h.by && <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400">• {h.by}</span>}
                          {h.created ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">Created</span>
                          ) : isStageChange ? (
                            <>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${ALL_STAGE_THEME[fromStage] || 'bg-slate-50 text-slate-700'}`}>{fromStage}</span>
                              <ArrowRight size={11} className="text-slate-450" />
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${ALL_STAGE_THEME[toStage] || 'bg-slate-50 text-slate-700'}`}>{toStage}</span>
                            </>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 ring-1 ring-blue-200/60 dark:bg-blue-955/30 dark:text-blue-400 dark:ring-blue-900/40">Manual Log</span>
                          )}
                        </div>
                        {remark && (
                          <p className="text-sm text-slate-650 dark:text-slate-350 leading-relaxed font-sans mt-1">
                            {remark}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* New comment input area (shifted here, below the timeline). A stage-
              change remark requires changeStage rights; a general log entry
              requires editDetails — matching whichever action it accompanies. */}
          {isEdit && (stageChanged ? canChangeStage : canEditDetails) && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              {stageChanged ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/15 p-4">
                  <Field label={`Reason for stage change → ${stage} *`} hint="Required whenever the prospect stage changes">
                    <textarea value={stageRemark} onChange={(e) => setStageRemark(e.target.value)} rows={2} className={inputCls + ' resize-y'} placeholder="Explain why the stage changed…" />
                  </Field>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/10 p-4">
                  <Field label="Add log / comment entry">
                    <textarea value={stageRemark} onChange={(e) => setStageRemark(e.target.value)} rows={2} className={inputCls + ' resize-y'} placeholder="Type a log entry or note…" />
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer (fixed) */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-none md:rounded-b-2xl flex items-center justify-between gap-2 shrink-0">
          {/* Download button — only for insurance prospects */}
          <div>
            {hasInsuranceItem && (
              <button
                type="button"
                onClick={() => {
                  const safeDocuments = {};
                  Object.entries(documents).forEach(([key, files]) => {
                    const valid = (files || []).filter(f => f && (f.fileName || f.name));
                    if (valid.length) safeDocuments[key] = valid.map(({ dataUrl, data, ...meta }) => meta);
                  });
                  triggerInsuranceProspectDownload(
                    { applicant, groupLeader, pan, closingDate, serviceManager, relationshipManager, portfolioManager, insuranceManager, owner, internalManager, stage: stage || 'Qualified', amount: items[0]?.amount, createdAt: new Date().toISOString(), kyc, documents: safeDocuments },
                    items
                  );
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all cursor-pointer"
              >
                <Download size={13} /> Download Report
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button onClick={handleConfirm} disabled={!canSave} className={btnPrimary}>
              <CheckCircle2 size={14} /> {isEdit ? 'Save Changes' : `Confirm & Create${items.length > 1 ? ` ${items.length}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ===========================================================================
// INSURANCE KYC & HEALTH QUESTIONNAIRE — collected once per applicant when
// any selected proposal is an Insurance proposal. Divided into the same
// professional-form sections requested: personal/contact, nominee, physical,
// family, occupation & marital status, habits, medical history, financials,
// office address, and category-tagged document uploads.
// ===========================================================================
function KycField({ label, children }) {
  return <Field label={`${label} *`}>{children}</Field>;
}

// Displays the real team member name for a stored account id — matches the
// "Created Date & Time" read-only look used elsewhere in this modal.
function ReadOnlyTeamField({ id }) {
  return (
    <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
      {teamName(id) || '—'}
    </div>
  );
}

// Editable team-member picker (value = user id) — prefilled from the client
// profile but changeable at prospect-create time. Auto-disables inside the
// modal's locked <fieldset> once the prospect exists.
function TeamSelect({ value, onChange }) {
  return (
    <CoolSelect value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="">Select…</option>
      {loadTeam().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </CoolSelect>
  );
}

function YesNoSelect({ value, onChange }) {
  return (
    <CoolSelect value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="">Select…</option>
      {YES_NO.map(o => <option key={o} value={o}>{o}</option>)}
    </CoolSelect>
  );
}

function InsuranceKycSection({ kyc, updateKyc, addDisease, updateDiseaseName, removeDisease, documents, addDocFiles, removeDocFile, requiredDocCategories, linkedClient, isViewer = false }) {
  const k = (field) => kyc[field] || '';
  const set = (field) => (e) => updateKyc(field, e.target.value);

  return (
    <div className="space-y-5 pt-5 border-t-2 border-dashed border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
          <ShieldCheck size={16} />
        </span>
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Insurance KYC &amp; Health Questionnaire</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Required for the applicant before this insurance prospect can be confirmed</p>
        </div>
      </div>

      {/* Personal & Contact */}
      <KycSubSection title="Personal & Contact Details">
        <KycField label="Mail"><input type="email" value={k('email')} onChange={set('email')} className={inputCls} placeholder="name@example.com" /></KycField>
        <KycField label="Mobile"><input value={k('mobile')} onChange={set('mobile')} className={inputCls} placeholder="+91 98765 43210" /></KycField>
      </KycSubSection>

      {/* Nominee */}
      <KycSubSection title="Nominee Details">
        <KycField label="Nominee Name"><input value={k('nomineeName')} onChange={set('nomineeName')} className={inputCls} /></KycField>
        <KycField label="Nominee Relation">
          <CoolSelect value={k('nomineeRelation')} onChange={set('nomineeRelation')} className={selectCls}>
            <option value="">Select relation…</option>
            {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </CoolSelect>
        </KycField>
      </KycSubSection>

      {/* Physical & Birth */}
      <KycSubSection title="Physical & Birth Details">
        <KycField label="Height"><input value={k('height')} onChange={set('height')} className={inputCls} placeholder="e.g. 5ft 8in or 173 cm" /></KycField>
        <KycField label="Weight (KG)"><input value={k('weight')} onChange={set('weight')} className={inputCls} placeholder="e.g. 70" /></KycField>
        <KycField label="Place of Birth"><input value={k('placeOfBirth')} onChange={set('placeOfBirth')} className={inputCls} /></KycField>
      </KycSubSection>

      {/* Family */}
      <KycSubSection title="Family Details">
        <KycField label="Mother's Name"><input value={k('motherName')} onChange={set('motherName')} className={inputCls} /></KycField>
        <KycField label="Father's Name"><input value={k('fatherName')} onChange={set('fatherName')} className={inputCls} /></KycField>
      </KycSubSection>

      {/* Occupation & Marital Status */}
      <KycSubSection title="Occupation & Marital Status">
        <KycField label="Occupation">
          <CoolSelect value={k('occupation')} onChange={set('occupation')} className={selectCls}>
            <option value="">Select occupation…</option>
            {OCCUPATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </CoolSelect>
        </KycField>
        <KycField label="Marital Status"><YesNoSelect value={k('maritalStatus')} onChange={(v) => updateKyc('maritalStatus', v)} /></KycField>
      </KycSubSection>

      {/* Habits */}
      <KycSubSection title="Habits">
        <KycField label="Smoking"><YesNoSelect value={k('smoking')} onChange={(v) => updateKyc('smoking', v)} /></KycField>
        <KycField label="Tobacco"><YesNoSelect value={k('tobacco')} onChange={(v) => updateKyc('tobacco', v)} /></KycField>
        <KycField label="Alcohol"><YesNoSelect value={k('alcohol')} onChange={(v) => updateKyc('alcohol', v)} /></KycField>
      </KycSubSection>

      {/* Medical History */}
      <KycSubSection title="Medical History">
        <KycField label="Any Medical History"><YesNoSelect value={k('medicalHistory')} onChange={(v) => updateKyc('medicalHistory', v)} /></KycField>
        <KycField label="Covid"><YesNoSelect value={k('covid')} onChange={(v) => updateKyc('covid', v)} /></KycField>
      </KycSubSection>

      {/* Diseases — shown below Any Medical History; supports multiple diseases,
          each with its own name and its own First Prescription upload */}
      {kyc.medicalHistory === 'Yes' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-2 border-l-2 border-blue-400">Diseases &amp; Prescriptions *</h5>
            <button type="button" onClick={addDisease} className={btnGhost + ' py-1 px-2.5 text-[10px]'}>
              <Plus size={11} /> Add Disease
            </button>
          </div>

          {(!kyc.diseases || kyc.diseases.length === 0) ? (
            <p className="text-[11px] text-blue-500 dark:text-blue-400 italic">No diseases added yet — click "Add Disease" to record at least one (required).</p>
          ) : (
            <div className="space-y-3">
              {kyc.diseases.map((d, idx) => (
                <div key={d.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 w-5 shrink-0">{idx + 1}.</span>
                    <input
                      value={d.name}
                      onChange={(e) => updateDiseaseName(d.id, e.target.value)}
                      className={inputCls + ' flex-1'}
                      placeholder="Disease name"
                    />
                    <button type="button" onClick={() => removeDisease(d.id)} className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <DocUploadGroup
                    label={`First Prescription${d.name ? ' — ' + d.name : ''}`}
                    required
                    files={documents[`firstPrescription_${d.id}`] || []}
                    onAdd={(files) => addDocFiles(`firstPrescription_${d.id}`, files)}
                    onRemove={(fileId) => removeDocFile(`firstPrescription_${d.id}`, fileId)}
                    existingDocs={existingDocsFor(linkedClient, `First Prescription (${d.name || 'Disease'})`, documents[`firstPrescription_${d.id}`])}
                    clientAttachments={linkedClient?.clientDetails?.attachments || []}
                    isViewer={isViewer}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Financial */}
      <KycSubSection title="Financial Details">
        <KycField label="Annual Income"><input value={k('annualIncome')} onChange={set('annualIncome')} className={inputCls} placeholder="₹" /></KycField>
      </KycSubSection>

      {/* Office Address */}
      <KycSubSection title="Office Address">
        <KycField label="Address Line 1"><input value={k('officeAddress1')} onChange={set('officeAddress1')} className={inputCls} /></KycField>
        <Field label="Address Line 2"><input value={k('officeAddress2')} onChange={set('officeAddress2')} className={inputCls} /></Field>
        <Field label="Address Line 3"><input value={k('officeAddress3')} onChange={set('officeAddress3')} className={inputCls} /></Field>
        <KycField label="Country">
          <CountrySelect
            value={k('officeCountry')}
            onChange={(v) => { updateKyc('officeCountry', v); updateKyc('officeState', ''); updateKyc('officeCity', ''); }}
          />
        </KycField>
        <KycField label="State">
          <StateSelect
            country={k('officeCountry')}
            value={k('officeState')}
            onChange={(v) => { updateKyc('officeState', v); updateKyc('officeCity', ''); }}
          />
        </KycField>
        <KycField label="City">
          <CitySelect country={k('officeCountry')} state={k('officeState')} value={k('officeCity')} onChange={(v) => updateKyc('officeCity', v)} />
        </KycField>
        <KycField label="Pincode"><input value={k('officePincode')} onChange={set('officePincode')} className={inputCls} /></KycField>
      </KycSubSection>

      {/* Documents */}
      <KycSubSection title="Documents" hint="Any file format accepted · multiple files per category">
        <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {requiredDocCategories.map(cat => (
            <DocUploadGroup
              key={cat.key}
              label={cat.label}
              required
              files={documents[cat.key] || []}
              onAdd={(files) => addDocFiles(cat.key, files)}
              onRemove={(id) => removeDocFile(cat.key, id)}
              existingDocs={existingDocsFor(linkedClient, cat.label, documents[cat.key])}
              clientAttachments={linkedClient?.clientDetails?.attachments || []}
              isViewer={isViewer}
            />
          ))}
        </div>
      </KycSubSection>
    </div>
  );
}

function KycSubSection({ title, hint, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h5 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-2 border-l-2 border-rose-400">{title}</h5>
        {hint && <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
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

// --- Category Cell component (rendered as a select dropdown) ----------------
function CategoryCell({ value, onChange }) {
  return (
    <CoolSelect
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent border-0 focus:bg-slate-50 dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500 py-1 px-1.5 rounded text-xs text-slate-700 dark:text-slate-300"
    >
      <option value="">Select Category...</option>
      {CATEGORIES.map((cat, idx) => (
        <option key={idx} value={cat}>{cat}</option>
      ))}
    </CoolSelect>
  );
}

// --- Scheme Autocomplete Cell component (rendered as input with dropdown) ---
function SchemeAutocompleteCell({ value, categoryValue, onChange }) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [filtered, setFiltered] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const handleFocus = () => {
    setFocused(true);
    updateFilteredList(query);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setFocused(false);
    }, 180);
  };

  const updateFilteredList = (q) => {
    const list = getSchemesForCategory(categoryValue);
    const trimmed = q.toLowerCase().trim();
    const matches = list.filter(item => item.toLowerCase().indexOf(trimmed) >= 0);
    setFiltered(matches.slice(0, 50));
    setActiveIndex(-1);
  };

  const handleChange = (val) => {
    const cleaned = val.replace(/[\r\n]/g, ' ');
    setQuery(cleaned);
    onChange(cleaned);
    updateFilteredList(cleaned);
  };

  const selectOption = (val) => {
    setQuery(val);
    onChange(val);
    setFocused(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (focused && filtered.length > 0 && activeIndex >= 0 && activeIndex < filtered.length) {
        selectOption(filtered[activeIndex]);
      }
    }
    if (!focused || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    }
  };

  return (
    <div className="relative">
      <textarea
        value={query}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search mutual fund..."
        rows={2}
        className="w-full bg-transparent border-0 focus:bg-slate-50 dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500 py-1 px-1.5 rounded text-xs text-slate-700 dark:text-slate-350 resize-none h-10 leading-normal"
      />
      {focused && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((item, idx) => (
            <div
              key={idx}
              onMouseDown={() => selectOption(item)}
              className={`px-3 py-1.5 text-xs font-semibold cursor-pointer truncate text-slate-800 dark:text-slate-200 transition-colors ${
                activeIndex === idx
                  ? 'bg-blue-50 dark:bg-blue-955/40 text-blue-600'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-850/50'
              }`}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Renders the proposal table (cols + rows, optional total) --------------
function ProspectTable({ table, onChange }) {
  const cols = table?.cols || [];
  const rows = table?.rows || [];
  const totalRow = table?.totalRow || null;
  if (cols.length === 0 || rows.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 italic font-medium">No table data.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
          <tr>{cols.map((c, i) => <th key={i} className="px-3 py-2 text-left">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {(Array.isArray(r) ? r : cols.map(() => '')).map((cell, ci) => {
                const colName = cols[ci] || '';
                const isCategoryCol = colName.toLowerCase().includes('category');
                const isSchemeCol = colName.toLowerCase().includes('scheme');
                const isAmountCol = (colName.toLowerCase().includes('amount') || colName.toLowerCase().includes('sip') || colName.toLowerCase().includes('term')) && !colName.toLowerCase().includes('date');

                return (
                  <td key={ci} className="px-1 py-1">
                    {onChange ? (
                      isCategoryCol ? (
                        <CategoryCell
                          value={cell}
                          onChange={(val) => onChange(ri, ci, val)}
                        />
                      ) : isSchemeCol ? (
                        <SchemeAutocompleteCell
                          value={cell}
                          categoryValue={(() => {
                            const catColIndex = cols.findIndex(col => col.toLowerCase().includes('category'));
                            return catColIndex !== -1 ? r[catColIndex] : '';
                          })()}
                          onChange={(val) => onChange(ri, ci, val)}
                        />
                      ) : (
                        <input
                          type="text"
                          value={cell == null ? '' : String(cell)}
                          onChange={(e) => onChange(ri, ci, e.target.value)}
                          className={`w-full bg-transparent border-0 focus:bg-slate-50 dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-500 py-1 px-1.5 rounded text-xs text-slate-700 dark:text-slate-350 ${isAmountCol ? 'text-right font-mono font-semibold' : ''}`}
                        />
                      )
                    ) : (
                      <span className="px-2 py-1.5 block text-slate-700 dark:text-slate-300">{cell === '' || cell == null ? '—' : String(cell)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          {totalRow && (
            <tr className="bg-slate-50 dark:bg-slate-950/50 font-bold">
              {totalRow.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-slate-900 dark:text-white">
                  {cell === '' || cell == null ? '' : (typeof cell === 'number' ? '₹ ' + cell.toLocaleString('en-IN') : String(cell))}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
