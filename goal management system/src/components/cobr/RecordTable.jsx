// Generic list view shared by every COBR-workspace register.
//
// Each tab supplies its own column set, searchable fields and stage
// vocabulary; the search / stage filter / date-range filter / sorting /
// S. No. / status-badge behaviour is implemented once here so all five tabs
// stay consistent.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, ArrowUp, ArrowDown, X, Trash2, Filter, Columns3, Check, Lock } from 'lucide-react';
import { Card, selectCls, inputCls, CoolSelect, Field, FilterToggle, FilterPanel, ActiveFilterChips } from '../UI';
import { stageBadgeCls, listStageLabel } from '../../utils/cobrModules';
import { getCurrentUser } from '../../utils/auth';
import { useBackLayer } from '../../utils/backNav';
import { ExcelActions } from './ExcelTools';

// Per-user table settings kept in this browser (like the Clients
// directory's columns and filters) — they survive signing out and back in.
const savedKey = (key, what) => `crm:recordTable:${key}:${what}:${getCurrentUser()?.id || 'anon'}`;
const readSaved = (key, what) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(savedKey(key, what));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const writeSaved = (key, what, value) => {
  if (!key) return;
  try { localStorage.setItem(savedKey(key, what), JSON.stringify(value)); } catch { /* private mode / quota — just not kept */ }
};

// First/last day of the current calendar month as YYYY-MM-DD, in local
// time — never toISOString() (UTC-based; near midnight IST it can land on
// the wrong calendar day). Used to default the due-date filter to "this
// month" instead of opening with every record ever in view.
const pad2 = (n) => String(n).padStart(2, '0');
const currentMonthRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { first: `${y}-${pad2(m + 1)}-01`, last: `${y}-${pad2(m + 1)}-${pad2(lastDay)}` };
};

export default function RecordTable({
  type,
  rows = [],
  columns = [],
  stages = [],
  searchFields = [],
  searchPlaceholder = 'Search…',
  dateField = null, // { key, label }
  onOpen,
  emptyText = 'Nothing here yet.',
  minWidth = 1000,
  excelSpec = null,
  clients = [],
  onImportRecords = null,
  canImportExcel = false,
  onDelete = null, // (record) => void — omit to hide the delete column entirely
  canDelete = null, // (record) => boolean
  tabs = null, // the module's tab bar, to lead the search row
  // Remember this table's filter-panel choices (per user, in this browser)
  // under this key — sticky until cleared, like the Clients directory's.
  saveKey = null,
  // Let people pick the columns (the Clients directory's "Manage columns"):
  // { defaults: [column keys shown until someone picks], locked: [always shown] }.
  // Saved under `saveKey` too.
  columnPicker = null,
}) {
  // Saved filters: the due-date range opens on "this month" (rolling on to
  // the next month) unless someone picked their own dates. A cleared range
  // isn't kept — one "Clear" used to drop the month filter for good — so
  // the next visit opens on this month again.
  const saved = useMemo(() => readSaved(saveKey, 'filters') || {}, [saveKey]);
  const initialRange = () => {
    if (!dateField) return { first: '', last: '' };
    if (saved.range === 'custom' && (saved.from || saved.to)) return { first: saved.from || '', last: saved.to || '' };
    return currentMonthRange();
  };
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState(() => (saved.stage && stages.includes(saved.stage) ? saved.stage : 'all'));
  // The date pickers update fromInput/toInput live as the user picks a date;
  // the actual filter (from/to, read by `filtered` below) only moves when
  // Apply Filter is clicked. Two separate state pairs rather than one,
  // because picking a "from" date alone used to silently apply an
  // incomplete range mid-pick with no way to tell it had taken effect.
  const [fromInput, setFromInput] = useState(() => initialRange().first);
  const [toInput, setToInput] = useState(() => initialRange().last);
  const [from, setFrom] = useState(() => initialRange().first);
  const [to, setTo] = useState(() => initialRange().last);
  const [sort, setSort] = useState({ key: '__created', dir: 'desc' });
  const [groupLeader, setGroupLeader] = useState(() => saved.groupLeader || '');
  const [applicant, setApplicant] = useState(() => saved.applicant || '');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!saveKey) return;
    const month = currentMonthRange();
    const isMonth = !dateField || (from === month.first && to === month.last);
    writeSaved(saveKey, 'filters', {
      stage: stageFilter === 'all' ? '' : stageFilter, groupLeader, applicant,
      range: isMonth ? 'month' : 'custom', from, to,
    });
  }, [saveKey, dateField, stageFilter, groupLeader, applicant, from, to]);

  // Columns: locked ones always, the rest as picked (in the table's own order).
  const locked = columnPicker?.locked || [];
  const pickable = columnPicker ? columns.filter((c) => !locked.includes(c.key)) : [];
  const [visibleKeys, setVisibleKeys] = useState(() => {
    if (!columnPicker) return null;
    const keys = readSaved(saveKey, 'columns');
    return Array.isArray(keys) ? keys.filter((k) => pickable.some((c) => c.key === k)) : columnPicker.defaults;
  });
  useEffect(() => { if (columnPicker && visibleKeys) writeSaved(saveKey, 'columns', visibleKeys); }, [columnPicker, saveKey, visibleKeys]);
  const shownColumns = columnPicker ? columns.filter((c) => locked.includes(c.key) || visibleKeys.includes(c.key)) : columns;
  const toggleColumn = (key) => setVisibleKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  // Fewer columns → a narrower table (no sideways scroll for nothing).
  const tableMinWidth = columnPicker
    ? Math.max(900, Math.round((minWidth * (shownColumns.length + 2)) / (locked.length + columnPicker.defaults.length + 2)))
    : minWidth;

  const [pickerAt, setPickerAt] = useState(null); // { top, left } while the picker is open
  const pickerBtnRef = useRef(null);
  const closePicker = () => setPickerAt(null);
  useBackLayer(!!pickerAt, closePicker);
  const placePicker = () => {
    const r = pickerBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 288; // w-72
    const max = document.documentElement.clientWidth - width - 16;
    setPickerAt({ top: r.bottom + 6, left: Math.max(16, Math.min(r.right - width, max)) });
  };
  const pickerOpen = !!pickerAt;
  useEffect(() => {
    if (!pickerOpen) return undefined;
    window.addEventListener('scroll', placePicker, true);
    window.addEventListener('resize', placePicker);
    return () => {
      window.removeEventListener('scroll', placePicker, true);
      window.removeEventListener('resize', placePicker);
    };
  }, [pickerOpen]);

  const applyDateFilter = () => { setFrom(fromInput); setTo(toInput); };
  const dateFilterDirty = fromInput !== from || toInput !== to;

  // Group leader / applicant choices come from the register's own rows
  // (applicants narrowed to the chosen group leader), as in Other Assets.
  const leaderOptions = useMemo(() => [...new Set(rows.map((r) => r.groupLeader).filter(Boolean))].sort(), [rows]);
  const applicantOptions = useMemo(() => [...new Set(rows
    .filter((r) => !groupLeader || r.groupLeader === groupLeader)
    .map((r) => r.applicant).filter(Boolean))].sort(), [rows, groupLeader]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    stages.forEach((s) => { c[s] = rows.filter((r) => r.stage === s).length; });
    return c;
  }, [rows, stages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (stageFilter !== 'all' && r.stage !== stageFilter) return false;
      if (groupLeader && r.groupLeader !== groupLeader) return false;
      if (applicant && r.applicant !== applicant) return false;
      if (dateField && (from || to)) {
        const v = r[dateField.key] || '';
        if (!v) return false;
        if (from && v < from) return false;
        if (to && v > to) return false;
      }
      if (!q) return true;
      return searchFields.some((f) => String(r[f] ?? '').toLowerCase().includes(q));
    });

    const col = columns.find((c) => c.key === sort.key);
    const valueOf = (r) => {
      if (sort.key === '__created') return r.createdAt || '';
      if (sort.key === 'stage') return r.stage || '';
      if (col?.sortValue) return col.sortValue(r);
      return r[sort.key] ?? '';
    };
    out = [...out].sort((a, b) => {
      const av = valueOf(a); const bv = valueOf(b);
      let cmp;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, query, stageFilter, groupLeader, applicant, from, to, sort, columns, searchFields, dateField]);

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }));
  };

  const SortIcon = ({ colKey }) => {
    if (sort.key !== colKey) return null;
    return sort.dir === 'asc'
      ? <ArrowUp size={10} className="inline ml-1 -mt-0.5" />
      : <ArrowDown size={10} className="inline ml-1 -mt-0.5" />;
  };

  const filtersActive = query || stageFilter !== 'all' || groupLeader || applicant || from || to || fromInput || toInput;
  const clearDates = () => { setFrom(''); setTo(''); setFromInput(''); setToInput(''); };
  const clearPanel = () => { setStageFilter('all'); setGroupLeader(''); setApplicant(''); clearDates(); };
  const dmy = (s) => (s ? s.split('-').reverse().join('-') : '…');
  // The filters in force (dates as applied), shown as chips while the panel
  // is closed — so e.g. the default "due this month" range is always visible.
  const chips = [
    groupLeader && { key: 'gl', label: `Group leader: ${groupLeader}`, onRemove: () => { setGroupLeader(''); setApplicant(''); } },
    applicant && { key: 'ap', label: `Applicant: ${applicant}`, onRemove: () => setApplicant('') },
    stageFilter !== 'all' && { key: 'st', label: `Status: ${listStageLabel(type, stageFilter)}`, onRemove: () => setStageFilter('all') },
    dateField && (from || to) && { key: 'dt', label: `${dateField.label}: ${dmy(from)} – ${dmy(to)}`, onRemove: clearDates },
  ].filter(Boolean);

  const clearButton = filtersActive && (
    <button
      onClick={() => { setQuery(''); clearPanel(); }}
      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
    >
      <X size={12} /> Clear
    </button>
  );
  const filterToggle = (
    <>
      <FilterToggle open={showFilters} onClick={() => setShowFilters((s) => !s)} count={chips.length} />
      {/* Beside Filter rather than at the table's right edge, which is
          off-screen on a laptop until the wide table is scrolled. */}
      {columnPicker && (
        <button
          ref={pickerBtnRef}
          type="button"
          onClick={() => (pickerOpen ? closePicker() : placePicker())}
          title="Manage columns"
          aria-label="Manage columns"
          aria-expanded={pickerOpen}
          className={`inline-flex items-center gap-1.5 px-3 xl:px-4 py-2.5 text-xs font-bold uppercase tracking-wider border rounded-xl transition-all cursor-pointer shrink-0 ${
            pickerOpen
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/60 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Columns3 size={14} /> <span className="hidden xl:inline">Columns</span>
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Search + Filter (the filters and Excel live in the panel, as in
          Clients). With `tabs` (Renewals & Claims) the module's tabs lead the
          row and search + Filter sit at its right, as in Clients. */}
      {tabs ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{tabs}</div>
          <div className="flex items-center gap-2.5 w-full md:w-auto md:ml-auto">
            {clearButton}
            <div className="relative flex-1 min-w-0 md:flex-none">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={inputCls + ' pl-9 w-full md:w-80 xl:w-96'}
              />
            </div>
            {filterToggle}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className={inputCls + ' pl-9'}
            />
          </div>
          {filterToggle}
          {clearButton}
        </div>
      )}

      {showFilters ? (
        <FilterPanel
          onClear={chips.length || fromInput || toInput ? clearPanel : null}
          actions={excelSpec && (
            <ExcelActions
              spec={excelSpec}
              rows={filtered}
              allRows={rows}
              clients={clients}
              onImport={onImportRecords}
              canImport={canImportExcel}
            />
          )}
        >
          {leaderOptions.length > 0 && (
            <Field label="Group Leader">
              <CoolSelect value={groupLeader} onChange={(e) => { setGroupLeader(e.target.value); setApplicant(''); }} placeholder="All group leaders" className={selectCls}>
                <option value="">All group leaders</option>
                {leaderOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </CoolSelect>
            </Field>
          )}
          {applicantOptions.length > 0 && (
            <Field label="Applicant">
              <CoolSelect value={applicant} onChange={(e) => setApplicant(e.target.value)} placeholder="All applicants" className={selectCls}>
                <option value="">All applicants</option>
                {applicantOptions.map((n) => <option key={n} value={n}>{n}</option>)}
              </CoolSelect>
            </Field>
          )}
          <Field label="Status">
            <CoolSelect value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={selectCls}>
              <option value="all">All Statuses ({counts.all})</option>
              {stages.map((s) => <option key={s} value={s}>{listStageLabel(type, s)} ({counts[s] || 0})</option>)}
            </CoolSelect>
          </Field>
          {dateField && (
            <Field label={dateField.label}>
              <div className="flex items-center gap-2">
                <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} aria-label={`${dateField.label} from`} className={inputCls + ' min-w-0'} />
                <span className="text-slate-400 dark:text-slate-600">–</span>
                <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} aria-label={`${dateField.label} to`} className={inputCls + ' min-w-0'} />
                <button
                  onClick={applyDateFilter}
                  disabled={!dateFilterDirty}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    dateFilterDirty
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800'
                  }`}
                  title={`Apply the selected ${dateField.label.toLowerCase()} range`}
                >
                  <Filter size={12} /> Apply
                </button>
              </div>
            </Field>
          )}
        </FilterPanel>
      ) : (
        <ActiveFilterChips chips={chips} onClearAll={clearPanel} />
      )}

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">{filtersActive ? 'No records match these filters.' : emptyText}</p>
        ) : (
          <>
          {/* Phones: one card per record — the first column as its title,
              the status badge, then every other column as label / value. */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r, i) => {
              const [first, ...rest] = shownColumns;
              const val = (c) => (c.render ? c.render(r) : (r[c.key] || '—'));
              return (
                <div key={r.id} onClick={() => onOpen && onOpen(r)} className="p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 tabular-nums">#{i + 1}</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">{first ? val(first) : '—'}</div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center leading-none px-2 py-1 text-[9px] font-bold uppercase tracking-wider ring-1 rounded-full ${stageBadgeCls(type, r.stage)}`}>
                      {listStageLabel(type, r.stage) || '—'}
                    </span>
                  </div>
                  {rest.length > 0 && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3">
                      {rest.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{c.label}</dt>
                          <dd className={`text-xs mt-0.5 break-words ${c.cls || 'text-slate-600 dark:text-slate-300'}`}>{val(c)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {onDelete && (!canDelete || canDelete(r)) && (
                    <div className="flex justify-end mt-2 -mb-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 -mr-1.5 rounded-lg cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: `${tableMinWidth}px` }}>
              <thead>
                {/* whitespace-nowrap on every header keeps the bold/tracked-out
                    header font from wrapping to two lines while the lighter
                    body font on the same column stays single-line below it —
                    that mismatch is what made the header row look misaligned
                    against the data rows. */}
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 w-12 whitespace-nowrap align-middle">S.No.</th>
                  {shownColumns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-4 py-3 cursor-pointer select-none whitespace-nowrap align-middle hover:text-slate-600 dark:hover:text-slate-300 transition-colors ${c.align === 'right' ? 'text-right' : ''}`}
                    >
                      {c.label}<SortIcon colKey={c.key} />
                    </th>
                  ))}
                  <th
                    onClick={() => toggleSort('stage')}
                    className="px-4 py-3 cursor-pointer select-none whitespace-nowrap align-middle hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    Status<SortIcon colKey="stage" />
                  </th>
                  {onDelete && <th className="px-4 py-3 w-10 whitespace-nowrap align-middle" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpen && onOpen(r)}
                    className="group border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap align-middle">{i + 1}</td>
                    {shownColumns.map((c) => (
                      <td key={c.key} className={`px-4 py-3 text-xs whitespace-nowrap align-middle ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.cls || 'text-slate-600 dark:text-slate-300'}`}>
                        {c.render ? c.render(r) : (r[c.key] || '—')}
                      </td>
                    ))}
                    {/* leading-none on the badge removes its own inherited line-height
                        from the height calculation — without it, the pill's line box
                        can end up taller than the plain-text cells beside it, which
                        visually reads as the badge sitting a couple pixels lower even
                        though the <td> itself is vertically centered like the rest. */}
                    <td className="px-4 py-3 whitespace-nowrap align-middle">
                      <span className={`inline-flex items-center leading-none px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 rounded-full ${stageBadgeCls(type, r.stage)}`}>
                        {listStageLabel(type, r.stage) || '—'}
                      </span>
                    </td>
                    {onDelete && (
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        {(!canDelete || canDelete(r)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100 touch:opacity-100 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {/* Manage columns — the Clients directory's picker, same look. */}
      {pickerAt && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={closePicker} />
          <div
            role="dialog"
            aria-label="Manage columns"
            style={{ position: 'fixed', top: `${pickerAt.top}px`, left: `${pickerAt.left}px` }}
            className="w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-2xl z-50 p-3 animate-scale-up text-left"
          >
            <div className="px-2 pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Always shown</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {['S.No.', ...columns.filter((c) => locked.includes(c.key)).map((c) => c.label), 'Status'].map((label) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    <Lock size={9} /> {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-2 py-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Optional columns</p>
              <button
                type="button"
                onClick={() => setVisibleKeys(columnPicker.defaults)}
                className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
              >
                Reset
              </button>
            </div>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {pickable.map((c) => {
                const checked = visibleKeys.includes(c.key);
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => toggleColumn(c.key)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-700'
                    }`}>
                      {checked && <Check size={11} />}
                    </span>
                    {Icon && <Icon size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />}
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-1">{c.label}</span>
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
