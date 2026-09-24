import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Plus, X, SlidersHorizontal, Search, CheckCircle2, AlertCircle, FileSpreadsheet, PieChart, Wallet,
  Columns3, Check, Lock, Target, TrendingUp, ShieldCheck, HeartPulse, Activity, Trash2,
  MapPin, Map, Tag, Briefcase, UserCheck, BadgeCheck, Clock, Skull
} from 'lucide-react';
import {
  Avatar, Card, Field, inputCls, selectCls, btnPrimary, btnGhost, CoolSelect, MultiSelect
} from './UI';
import { getCurrentUser } from '../utils/auth';
import { canCreateClient, canDeleteClient } from '../utils/permissions';
import { hasAllocation } from '../utils/assets';
import { teamName, loadTeam } from '../services/team';
import ClientSearchDropdown from './ClientSearchDropdown';

// Manage Columns — the optional columns an advisor can pin onto the Client
// Directory table, on top of the always-on Name / PAN / Age columns.
const MAX_OPTIONAL_COLUMNS = 4;
const DEFAULT_VISIBLE_COLUMNS = ['goalsDefined', 'goalStatus', 'assetAllocationStatus'];
const COLUMNS_STORAGE_KEY = 'crm:clientListColumns';

// The filter panel's own values (age/goals range, goal/allocation status) —
// separate storage key from the columns picker above, same "sticky until an
// explicit Clear" behaviour the Leads module's filters use.
const FILTERS_STORAGE_KEY = 'crm:clientListFilters';
// City/State/Client Type/Client Status/Occupation/RM are multi-select — []
// means "no restriction", same convention Leads/Prospects filters use.
const DEFAULT_FILTERS = {
  ageMin: '', ageMax: '', goalsMin: '', goalsMax: '', goalSet: 'all', allocSet: 'all',
  cities: [], states: [], clientTypes: [], statuses: [], occupations: [], rms: [],
};
const asArray = (v, fallback) => (Array.isArray(v) ? v : fallback);
const loadSavedFilters = () => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      cities: asArray(parsed?.cities, DEFAULT_FILTERS.cities),
      states: asArray(parsed?.states, DEFAULT_FILTERS.states),
      clientTypes: asArray(parsed?.clientTypes, DEFAULT_FILTERS.clientTypes),
      statuses: asArray(parsed?.statuses, DEFAULT_FILTERS.statuses),
      occupations: asArray(parsed?.occupations, DEFAULT_FILTERS.occupations),
      rms: asArray(parsed?.rms, DEFAULT_FILTERS.rms),
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
};

// Shared field accessors — the SAME fallback logic backs the filter
// predicate, the derived option lists and the table cell, so a client can
// never be excluded by one and shown as a different value by another.
const clientCity = (c) => c.clientDetails?.city || '';
const clientState = (c) => c.clientDetails?.state || '';
const clientTypeOf = (c) => c.clientDetails?.clientType || '';
const clientStatusOf = (c) => c.clientDetails?.status || 'Active';
// "Occupation" as advisors mean it is the fixed Profession field, not the
// free-text clientDetails.occupation — that one lives under the form's
// optional "Additional Details" section and the bulk-Excel-import flow never
// writes it at all, so it's blank for most of a real directory. Profession is
// required on every creation path (manual + import), and the import flow's
// own column-header synonym list already maps a sheet column literally
// titled "Occupation" onto this field (see Modals.jsx's COLS map) — so this
// is what "Occupation" already means elsewhere in this app.
const clientOccupation = (c) => c.clientDetails?.profession || '';
const clientRmId = (c) => c.clientDetails?.relationshipManager || '';

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
  {
    key: 'city', label: 'City', icon: MapPin,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{clientCity(c) || '—'}</td>,
  },
  {
    key: 'state', label: 'State', icon: Map,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{clientState(c) || '—'}</td>,
  },
  {
    key: 'clientType', label: 'Client Type', icon: Tag,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{clientTypeOf(c) || '—'}</td>,
  },
  {
    key: 'clientStatus', label: 'Client Status', icon: BadgeCheck,
    cell: (c) => <td className="px-6 py-4"><ClientStatusPill status={clientStatusOf(c)} /></td>,
  },
  {
    key: 'occupation', label: 'Occupation', icon: Briefcase,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{clientOccupation(c) || '—'}</td>,
  },
  {
    key: 'rm', label: 'RM', icon: UserCheck,
    cell: (c) => <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{teamName(clientRmId(c)) || '—'}</td>,
  },
];

// Mirrors ClientProfile.jsx's own StatusBadge (Active/Inactive/Dead) at
// table-cell size — that component isn't exported, so this is a compact
// twin rather than a cross-file import.
function ClientStatusPill({ status }) {
  const s = status || 'Active';
  const theme = s === 'Active'
    ? { cls: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-900/30', Icon: CheckCircle2 }
    : s === 'Inactive'
      ? { cls: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-900/30', Icon: Clock }
      : { cls: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 ring-rose-200/50 dark:ring-rose-900/30', Icon: Skull };
  const Icon = theme.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${theme.cls}`}>
      <Icon size={11} /> {s}
    </span>
  );
}

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

export default function ClientList({ clients, onSelect, onSelectFreshly, onSelectApplicant, onAdd, onImport, onDelete, onDeleteAll, isViewer }) {
  // RBAC: Clients → Create / Delete from the matrix; the server enforces the
  // same. Per-row delete checks that client (so Assigned works); "delete all"
  // needs Delete on every client (All).
  const me = getCurrentUser();
  const mayCreateClient = !isViewer && canCreateClient(me);
  const mayDeleteClient = canDeleteClient(me);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pickerRect, setPickerRect] = useState(null);
  const columnTriggerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimer = useRef(null);
  const savedFilters = useMemo(loadSavedFilters, []);
  const [ageMin, setAgeMin] = useState(savedFilters.ageMin);
  const [ageMax, setAgeMax] = useState(savedFilters.ageMax);
  const [goalsMin, setGoalsMin] = useState(savedFilters.goalsMin);
  const [goalsMax, setGoalsMax] = useState(savedFilters.goalsMax);
  const [goalSet, setGoalSet] = useState(savedFilters.goalSet);
  const [allocSet, setAllocSet] = useState(savedFilters.allocSet);
  const [cityFilters, setCityFilters] = useState(savedFilters.cities);
  const [stateFilters, setStateFilters] = useState(savedFilters.states);
  const [clientTypeFilters, setClientTypeFilters] = useState(savedFilters.clientTypes);
  const [statusFilters, setStatusFilters] = useState(savedFilters.statuses);
  const [occupationFilters, setOccupationFilters] = useState(savedFilters.occupations);
  const [rmFilters, setRmFilters] = useState(savedFilters.rms);
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

  // Offered in the City/State/Client Type/Client Status/Occupation pickers:
  // whatever values actually exist in the data, same as Leads/Prospects do
  // for their own free-text-ish filter dimensions — never an option that
  // could match zero clients.
  const cityOptions = useMemo(() => Array.from(new Set(clients.map(clientCity).filter(Boolean))).sort(), [clients]);
  const stateOptions = useMemo(() => Array.from(new Set(clients.map(clientState).filter(Boolean))).sort(), [clients]);
  const clientTypeOptions = useMemo(() => Array.from(new Set(clients.map(clientTypeOf).filter(Boolean))).sort(), [clients]);
  const statusOptions = useMemo(() => Array.from(new Set(clients.map(clientStatusOf))).sort(), [clients]);
  const occupationOptions = useMemo(() => Array.from(new Set(clients.map(clientOccupation).filter(Boolean))).sort(), [clients]);
  // Full team roster (+ Unassigned), not just RMs currently in use — mirrors
  // Leads' own RM filter exactly (also computed fresh each render, off the
  // already-cached team directory), so both modules behave the same way.
  const rmOptions = [{ value: 'unassigned', label: 'Unassigned' }, ...loadTeam().map(m => ({ value: m.id, label: m.name }))];

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
      if (cityFilters.length > 0 && !cityFilters.includes(clientCity(c))) return false;
      if (stateFilters.length > 0 && !stateFilters.includes(clientState(c))) return false;
      if (clientTypeFilters.length > 0 && !clientTypeFilters.includes(clientTypeOf(c))) return false;
      if (statusFilters.length > 0 && !statusFilters.includes(clientStatusOf(c))) return false;
      if (occupationFilters.length > 0 && !occupationFilters.includes(clientOccupation(c))) return false;
      if (rmFilters.length > 0 && !rmFilters.includes(clientRmId(c) || 'unassigned')) return false;
      return true;
    });
  }, [clients, query, ageMin, ageMax, goalsMin, goalsMax, goalSet, allocSet,
      cityFilters, stateFilters, clientTypeFilters, statusFilters, occupationFilters, rmFilters]);

  const activeCount =
    (ageMin !== '' || ageMax !== '' ? 1 : 0) +
    (goalsMin !== '' || goalsMax !== '' ? 1 : 0) +
    (goalSet !== 'all' ? 1 : 0) +
    (allocSet !== 'all' ? 1 : 0) +
    (cityFilters.length > 0 ? 1 : 0) +
    (stateFilters.length > 0 ? 1 : 0) +
    (clientTypeFilters.length > 0 ? 1 : 0) +
    (statusFilters.length > 0 ? 1 : 0) +
    (occupationFilters.length > 0 ? 1 : 0) +
    (rmFilters.length > 0 ? 1 : 0);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        ageMin, ageMax, goalsMin, goalsMax, goalSet, allocSet,
        cities: cityFilters, states: stateFilters, clientTypes: clientTypeFilters,
        statuses: statusFilters, occupations: occupationFilters, rms: rmFilters,
      }));
    } catch { /* private mode / quota — filters just won't persist */ }
  }, [ageMin, ageMax, goalsMin, goalsMax, goalSet, allocSet,
      cityFilters, stateFilters, clientTypeFilters, statusFilters, occupationFilters, rmFilters]);

  const clearAll = () => {
    setAgeMin(DEFAULT_FILTERS.ageMin); setAgeMax(DEFAULT_FILTERS.ageMax);
    setGoalsMin(DEFAULT_FILTERS.goalsMin); setGoalsMax(DEFAULT_FILTERS.goalsMax);
    setGoalSet(DEFAULT_FILTERS.goalSet); setAllocSet(DEFAULT_FILTERS.allocSet);
    setCityFilters(DEFAULT_FILTERS.cities); setStateFilters(DEFAULT_FILTERS.states);
    setClientTypeFilters(DEFAULT_FILTERS.clientTypes); setStatusFilters(DEFAULT_FILTERS.statuses);
    setOccupationFilters(DEFAULT_FILTERS.occupations); setRmFilters(DEFAULT_FILTERS.rms);
  };

  // Table-header icon filter buttons (per optional column) drive the EXACT
  // same state as the panel pickers above, so whichever affordance is used
  // they always agree — keyed by OPTIONAL_COLUMNS key.
  const columnFilterProps = {
    city: { options: cityOptions.map(v => ({ value: v, label: v })), selected: cityFilters, onChange: setCityFilters, label: 'cities' },
    state: { options: stateOptions.map(v => ({ value: v, label: v })), selected: stateFilters, onChange: setStateFilters, label: 'states' },
    clientType: { options: clientTypeOptions.map(v => ({ value: v, label: v })), selected: clientTypeFilters, onChange: setClientTypeFilters, label: 'types' },
    clientStatus: { options: statusOptions.map(v => ({ value: v, label: v })), selected: statusFilters, onChange: setStatusFilters, label: 'statuses' },
    occupation: { options: occupationOptions.map(v => ({ value: v, label: v })), selected: occupationFilters, onChange: setOccupationFilters, label: 'occupations' },
    rm: { options: rmOptions, selected: rmFilters, onChange: setRmFilters, label: 'RM' },
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
          {/* Search bar — always visible. Filters the table below by name/PAN
              (unchanged), AND — while focused with a query typed — shows a
              richer live dropdown that also reaches into family members
              (Applicants) and matches on mobile/email/PAN too. */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { clearTimeout(searchBlurTimer.current); setSearchFocused(true); }}
              onBlur={() => { searchBlurTimer.current = setTimeout(() => setSearchFocused(false), 150); }}
              placeholder="Search name, mobile, email or PAN…"
              className={inputCls + ' pl-9 w-56 md:w-72'}
            />
            {searchFocused && query.trim() && (
              <ClientSearchDropdown
                query={query}
                clients={clients}
                onSelectApplicant={(clientId, applicant) => {
                  setSearchFocused(false);
                  setQuery('');
                  onSelectApplicant?.(clientId, applicant);
                }}
                onSelectGroupLeader={(clientId) => {
                  setSearchFocused(false);
                  setQuery('');
                  onSelect(clientId);
                }}
              />
            )}
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
          {/* TEMPORARY admin cleanup button — password-gated wipe of all
              clients, used once to clear the wrongly-mapped import before
              re-importing with correct owner/RM names. */}
          {mayDeleteClient && onDeleteAll && clients.length > 0 && (
            <button
              onClick={() => setShowDeleteAll(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-all cursor-pointer"
              title="Delete every client (admin cleanup)"
            >
              <Trash2 size={14} /> Delete all clients
            </button>
          )}
        </div>
      </div>

      {showDeleteAll && (
        <DeleteAllClientsModal
          count={clients.length}
          onClose={() => setShowDeleteAll(false)}
          onConfirm={onDeleteAll}
        />
      )}

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
            <Field label="City" hint="Pick any number — leave empty for all">
              <MultiSelect label="cities" allLabel="All Cities" options={cityOptions.map(v => ({ value: v, label: v }))} selected={cityFilters} onChange={setCityFilters} />
            </Field>
            <Field label="State" hint="Pick any number — leave empty for all">
              <MultiSelect label="states" allLabel="All States" options={stateOptions.map(v => ({ value: v, label: v }))} selected={stateFilters} onChange={setStateFilters} />
            </Field>
            <Field label="Client Type" hint="Pick any number — leave empty for all">
              <MultiSelect label="client types" allLabel="All Client Types" options={clientTypeOptions.map(v => ({ value: v, label: v }))} selected={clientTypeFilters} onChange={setClientTypeFilters} />
            </Field>
            <Field label="Client Status" hint="Pick any number — leave empty for all">
              <MultiSelect label="statuses" allLabel="All Statuses" options={statusOptions.map(v => ({ value: v, label: v }))} selected={statusFilters} onChange={setStatusFilters} />
            </Field>
            <Field label="Occupation" hint="Pick any number — leave empty for all">
              <MultiSelect label="occupations" allLabel="All Occupations" options={occupationOptions.map(v => ({ value: v, label: v }))} selected={occupationFilters} onChange={setOccupationFilters} />
            </Field>
            <Field label="RM" hint="Pick any number — leave empty for all">
              <MultiSelect label="RM" allLabel="All RMs" options={rmOptions} selected={rmFilters} onChange={setRmFilters} />
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
                  if (!col) return null;
                  const cf = columnFilterProps[key];
                  return (
                    <th key={key} className="text-left px-6 py-4 font-bold">
                      {cf ? (
                        <span className="inline-flex items-center gap-1.5">
                          {col.label}
                          <MultiSelect variant="icon" label={cf.label} options={cf.options} selected={cf.selected} onChange={cf.onChange} />
                        </span>
                      ) : col.label}
                    </th>
                  );
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
                    {canDeleteClient(me, c) && onDelete && (
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

// TEMPORARY admin cleanup modal: password gate -> explicit "are you sure"
// confirmation -> soft-deletes every client. Two deliberate barriers because
// this wipes the whole directory.
const DELETE_ALL_PASSWORD = '1-2KA4,4-2KA1';

function DeleteAllClientsModal({ count, onClose, onConfirm }) {
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState('password'); // 'password' | 'confirm' | 'working' | 'done'
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submitPassword = () => {
    if (password === DELETE_ALL_PASSWORD) { setError(''); setStage('confirm'); }
    else setError('Incorrect password.');
  };

  const runDelete = async () => {
    setStage('working');
    try {
      const res = await onConfirm();
      setResult(res || {});
      setStage('done');
    } catch (e) {
      setError(e?.message || 'Deletion failed.');
      setStage('confirm');
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in" onClick={stage === 'working' ? undefined : onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Trash2 size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete all clients</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{count} client{count === 1 ? '' : 's'} in the directory</p>
          </div>
        </div>

        {stage === 'password' && (
          <>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">Enter the admin cleanup password to continue.</p>
            <input
              type="password" value={password} autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
              placeholder="Password" className={inputCls}
            />
            {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={onClose} className={btnGhost}>Cancel</button>
              <button onClick={submitPassword} disabled={!password} className={btnPrimary + ' disabled:opacity-50'}>Continue</button>
            </div>
          </>
        )}

        {stage === 'confirm' && (
          <>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 p-4 mb-4">
              <p className="text-sm font-bold text-rose-700 dark:text-rose-400">Are you sure you want to delete ALL {count} clients?</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">This removes every client from the directory. Re-importing the same PANs afterwards is allowed. This cannot be undone from here.</p>
            </div>
            {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className={btnGhost}>Cancel</button>
              <button onClick={runDelete} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer">
                <Trash2 size={14} /> Yes, delete all
              </button>
            </div>
          </>
        )}

        {stage === 'working' && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-9 h-9 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Deleting {count} clients…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="py-2">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 p-4 mb-4">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Deleted {result?.done ?? 0} client{(result?.done ?? 0) === 1 ? '' : 's'}.</p>
              {result?.failed > 0 && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{result.failed} could not be deleted — try again.</p>}
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">You can now re-import your Excel with the corrected owner/RM names.</p>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className={btnPrimary}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
