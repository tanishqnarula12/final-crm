import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Plus, X, SlidersHorizontal, Search, CheckCircle2, AlertCircle, FileSpreadsheet, PieChart, Wallet,
  Columns3, Check, Lock, Target, TrendingUp, ShieldCheck, HeartPulse, Activity, Trash2
} from 'lucide-react';
import {
  Avatar, Card, Field, inputCls, selectCls, btnPrimary, btnGhost, CoolSelect
} from './UI';
import { getCurrentUser } from '../utils/auth';
import { canCreateClient, canDeleteClient } from '../utils/permissions';
import { hasAllocation } from '../utils/assets';

// Manage Columns — the optional columns an advisor can pin onto the Client
// Directory table, on top of the always-on Name / PAN / Age columns.
const MAX_OPTIONAL_COLUMNS = 4;
const DEFAULT_VISIBLE_COLUMNS = ['goalsDefined', 'goalStatus', 'assetAllocationStatus'];
const COLUMNS_STORAGE_KEY = 'crm:clientListColumns';

const OPTIONAL_COLUMNS = [
  {
    key: 'goalsDefined', label: 'Goals Defined', icon: Target,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300 tabular-nums font-semibold">{c.goals ? c.goals.length : 0}</td>,
  },
  {
    key: 'goalStatus', label: 'Goal Status', icon: CheckCircle2,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={Boolean(c.goals && c.goals.length > 0)} yesIcon={CheckCircle2} /></td>,
  },
  {
    key: 'assetAllocationStatus', label: 'Asset Allocation Status', icon: PieChart,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={hasAllocation(c)} yesIcon={PieChart} noIcon={Wallet} /></td>,
  },
  {
    key: 'mutualFunds', label: 'Mutual Fund', icon: TrendingUp,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={c.clientDetails?.mutualFunds === 'Yes'} yesIcon={TrendingUp} /></td>,
  },
  {
    key: 'termInsurance', label: 'Term Insurance', icon: ShieldCheck,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={c.clientDetails?.insuranceTerm === 'Yes'} yesIcon={ShieldCheck} /></td>,
  },
  {
    key: 'medicalInsurance', label: 'Medical Insurance', icon: HeartPulse,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={c.clientDetails?.insuranceMedical === 'Yes'} yesIcon={HeartPulse} /></td>,
  },
  {
    key: 'accidentalInsurance', label: 'Accidental Insurance', icon: Activity,
    cell: (c) => <td className="px-6 py-4"><StatusPill ok={c.clientDetails?.insuranceAccidental === 'Yes'} yesIcon={Activity} /></td>,
  },
];

function StatusPill({ ok, yesIcon: YesIcon = CheckCircle2, noIcon: NoIcon = AlertCircle }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-900/30 rounded-full">
      <YesIcon size={11} /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/50 dark:ring-slate-700/50 rounded-full">
      <NoIcon size={11} /> No
    </span>
  );
}

export default function ClientList({ clients, onSelect, onSelectFreshly, onAdd, onImport, onDelete, isViewer }) {
  // RBAC: only the Operations Manager (or Admin) may create applicants; only
  // Admin may delete (soft). The server enforces this too.
  const me = getCurrentUser();
  const mayCreateClient = !isViewer && canCreateClient(me);
  const mayDeleteClient = canDeleteClient(me);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pickerRect, setPickerRect] = useState(null);
  const columnTriggerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [goalsMin, setGoalsMin] = useState('');
  const [goalsMax, setGoalsMax] = useState('');
  const [goalSet, setGoalSet] = useState('all');
  const [allocSet, setAllocSet] = useState('all');
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(k => OPTIONAL_COLUMNS.some(c => c.key === k)).slice(0, MAX_OPTIONAL_COLUMNS);
      }
    } catch {
      /* fall through to default */
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch {
      /* ignore quota errors */
    }
  }, [visibleColumns]);

  const toggleColumn = (key) => {
    setVisibleColumns(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= MAX_OPTIONAL_COLUMNS) return prev;
      return [...prev, key];
    });
  };

  const updatePickerRect = () => {
    const r = columnTriggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const dropdownWidth = 288; // w-72 is 18rem = 288px
    const margin = 16; // 1rem safety margin
    const clientWidth = document.documentElement.clientWidth;

    // Align the right edge of the dropdown with the right edge of the button
    let left = r.right - dropdownWidth;

    // Clamp to ensure it doesn't go off-screen
    const maxLeft = clientWidth - dropdownWidth - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    setPickerRect({ top: r.bottom + 6, left });
  };

  const openColumnPicker = () => {
    updatePickerRect();
    setShowColumnPicker(s => !s);
  };

  // Keep the popover pinned to the trigger button if the page scrolls or the
  // window resizes while it's open (it was already positioned synchronously
  // on open by openColumnPicker, so this only handles drift afterwards).
  useEffect(() => {
    if (!showColumnPicker) return;
    window.addEventListener('scroll', updatePickerRect, true);
    window.addEventListener('resize', updatePickerRect);
    return () => {
      window.removeEventListener('scroll', updatePickerRect, true);
      window.removeEventListener('resize', updatePickerRect);
    };
  }, [showColumnPicker]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const aMin = ageMin === '' ? null : Number(ageMin);
    const aMax = ageMax === '' ? null : Number(ageMax);
    const gMin = goalsMin === '' ? null : Number(goalsMin);
    const gMax = goalsMax === '' ? null : Number(goalsMax);
    return clients.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.pan || '').toLowerCase().includes(q)) return false;
      if (aMin !== null && c.age < aMin) return false;
      if (aMax !== null && c.age > aMax) return false;
      const gc = c.goals ? c.goals.length : 0;
      if (gMin !== null && gc < gMin) return false;
      if (gMax !== null && gc > gMax) return false;
      if (goalSet === 'yes' && gc === 0) return false;
      if (goalSet === 'no' && gc > 0) return false;
      if (allocSet !== 'all') {
        const allocated = hasAllocation(c);
        if (allocSet === 'yes' && !allocated) return false;
        if (allocSet === 'no' && allocated) return false;
      }
      return true;
    });
  }, [clients, query, ageMin, ageMax, goalsMin, goalsMax, goalSet, allocSet]);

  const activeCount =
    (ageMin !== '' || ageMax !== '' ? 1 : 0) +
    (goalsMin !== '' || goalsMax !== '' ? 1 : 0) +
    (goalSet !== 'all' ? 1 : 0) +
    (allocSet !== 'all' ? 1 : 0);

  const clearAll = () => {
    setAgeMin(''); setAgeMax(''); setGoalsMin(''); setGoalsMax(''); setGoalSet('all'); setAllocSet('all');
  };

  return (
    <div className="space-y-6">
      {/* Header row: title + search bar + filter toggle + add client */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Clients Directory</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {filtered.length === clients.length ? `Showing all ${clients.length} profiles` : `Showing ${filtered.length} of ${clients.length} profiles`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search bar — always visible */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or PAN…"
              className={inputCls + ' pl-9 w-56'}
            />
          </div>
          <button
            onClick={() => setShowFilters(s => !s)}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border rounded-xl transition-all cursor-pointer ${
              showFilters
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/60 shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal size={14} /> Filter
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-blue-600 dark:bg-blue-500 text-white">
                {activeCount}
              </span>
            )}
          </button>

          {mayCreateClient && (
            <button onClick={onAdd} className={btnPrimary}>
              <Plus size={14} /> Add client
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <Card className="p-6 border border-blue-100 dark:border-blue-900/40 bg-blue-50/10 dark:bg-blue-950/5 shadow-md animate-scale-up">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Age Range">
              <div className="flex items-center gap-2">
                <input type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="Min" className={inputCls} />
                <span className="text-slate-400 dark:text-slate-600">–</span>
                <input type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="Max" className={inputCls} />
              </div>
            </Field>
            <Field label="Goals Count">
              <div className="flex items-center gap-2">
                <input type="number" min="0" value={goalsMin} onChange={(e) => setGoalsMin(e.target.value)} placeholder="Min" className={inputCls} />
                <span className="text-slate-400 dark:text-slate-600">–</span>
                <input type="number" min="0" value={goalsMax} onChange={(e) => setGoalsMax(e.target.value)} placeholder="Max" className={inputCls} />
              </div>
            </Field>
            <Field label="Goal Status">
              <div className="relative">
                <CoolSelect value={goalSet} onChange={(e) => setGoalSet(e.target.value)} className={selectCls}>
                  <option value="all">All clients</option>
                  <option value="yes">Goal set: Yes</option>
                  <option value="no">Goal set: No</option>
                </CoolSelect>
              </div>
            </Field>
            <Field label="Asset Allocation Status">
              <div className="relative">
                <CoolSelect value={allocSet} onChange={(e) => setAllocSet(e.target.value)} className={selectCls}>
                  <option value="all">All clients</option>
                  <option value="yes">Allocation set: Yes</option>
                  <option value="no">Allocation set: No</option>
                </CoolSelect>
              </div>
            </Field>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200/40 dark:border-slate-800/40">
            {/* Import Excel lives inside the filter panel */}
            {mayCreateClient && (
              <button
                onClick={onImport}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer w-full sm:w-auto justify-center"
              >
                <FileSpreadsheet size={14} /> Import Excel
              </button>
            )}
            {activeCount > 0 && (
              <button onClick={clearAll} className={btnGhost}>
                <X size={14} /> Clear filters
              </button>
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 font-bold">Client Name</th>
                <th className="text-left px-6 py-4 font-bold">PAN Card</th>
                <th className="text-left px-6 py-4 font-bold">Age</th>
                {visibleColumns.map(key => {
                  const col = OPTIONAL_COLUMNS.find(c => c.key === key);
                  return col ? <th key={key} className="text-left px-6 py-4 font-bold">{col.label}</th> : null;
                })}
                <th className="px-3 py-4 w-10 text-right">
                  <button
                    ref={columnTriggerRef}
                    type="button"
                    onClick={openColumnPicker}
                    title="Manage columns"
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border transition-all cursor-pointer ${
                      showColumnPicker
                        ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/60'
                        : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <Columns3 size={12} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {filtered.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  onClick={() => onSelect(c.id)}
                  onDoubleClick={() => onSelectFreshly && onSelectFreshly(c.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <span className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs tracking-wider">{c.pan}</td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-300 tabular-nums">{c.age || '—'}</td>
                  {visibleColumns.map(key => {
                    const col = OPTIONAL_COLUMNS.find(oc => oc.key === key);
                    return col ? React.cloneElement(col.cell(c), { key }) : null;
                  })}
                  <td className="px-3 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    {mayDeleteClient && onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer inline-flex items-center justify-center"
                        title="Delete Client"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4 + visibleColumns.length} className="text-center py-20 text-slate-400 dark:text-slate-600">
                    {clients.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-800">
                          <Users size={32} />
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-300">No Clients Registered</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">Click "Add client" or "Import Excel" to establish client profiles and start goal planning</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <span className="font-semibold text-slate-500 dark:text-slate-400">No results found</span>
                        <span className="text-xs">Adjust your filters to see more profiles</span>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showColumnPicker && pickerRect && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowColumnPicker(false)} />
          <div
            style={{ position: 'fixed', top: `${pickerRect.top}px`, left: `${pickerRect.left}px` }}
            className="w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-2xl z-50 p-3 animate-scale-up text-left"
          >
            <div className="px-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Always shown</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {['Client Name', 'PAN', 'Age'].map(label => (
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <Lock size={9} /> {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-2 py-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Optional columns</p>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Pick up to {MAX_OPTIONAL_COLUMNS}</p>
            </div>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {OPTIONAL_COLUMNS.map(col => {
                const checked = visibleColumns.includes(col.key);
                const limitReached = !checked && visibleColumns.length >= MAX_OPTIONAL_COLUMNS;
                const Icon = col.icon;
                return (
                  <button
                    key={col.key}
                    type="button"
                    disabled={limitReached}
                    onClick={() => toggleColumn(col.key)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      limitReached
                        ? 'opacity-40 cursor-not-allowed'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      checked
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}>
                      {checked && <Check size={11} />}
                    </span>
                    <Icon size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1">{col.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
