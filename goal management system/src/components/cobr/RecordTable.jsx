// Generic list view shared by every COBR-workspace register.
//
// Each tab supplies its own column set, searchable fields and stage
// vocabulary; the search / stage filter / date-range filter / sorting /
// S. No. / status-badge behaviour is implemented once here so all five tabs
// stay consistent.
import React, { useMemo, useState } from 'react';
import { Search, ArrowUp, ArrowDown, X, Trash2, Filter } from 'lucide-react';
import { Card, selectCls, inputCls, CoolSelect } from '../UI';
import { stageBadgeCls } from '../../utils/cobrModules';
import { ExcelToolbar } from './ExcelTools';

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

const fmtStageDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
  // (record) => date string — a milestone date shown under the stage badge
  // once the record reaches the stage that milestone belongs to.
  stageDateFor = null,
}) {
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  // The date pickers update fromInput/toInput live as the user picks a date;
  // the actual filter (from/to, read by `filtered` below) only moves when
  // Apply Filter is clicked. Two separate state pairs rather than one,
  // because picking a "from" date alone used to silently apply an
  // incomplete range mid-pick with no way to tell it had taken effect.
  const [fromInput, setFromInput] = useState(() => (dateField ? currentMonthRange().first : ''));
  const [toInput, setToInput] = useState(() => (dateField ? currentMonthRange().last : ''));
  const [from, setFrom] = useState(() => (dateField ? currentMonthRange().first : ''));
  const [to, setTo] = useState(() => (dateField ? currentMonthRange().last : ''));
  const [sort, setSort] = useState({ key: '__created', dir: 'desc' });

  const applyDateFilter = () => { setFrom(fromInput); setTo(toInput); };
  const dateFilterDirty = fromInput !== from || toInput !== to;

  const counts = useMemo(() => {
    const c = { all: rows.length };
    stages.forEach((s) => { c[s] = rows.filter((r) => r.stage === s).length; });
    return c;
  }, [rows, stages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (stageFilter !== 'all' && r.stage !== stageFilter) return false;
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
  }, [rows, query, stageFilter, from, to, sort, columns, searchFields, dateField]);

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

  const filtersActive = query || stageFilter !== 'all' || from || to || fromInput || toInput;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="w-52">
          <CoolSelect value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className={selectCls + ' py-2 text-xs'}>
            <option value="all">All Statuses ({counts.all})</option>
            {stages.map((s) => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
          </CoolSelect>
        </div>

        {dateField && (
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{dateField.label} from</label>
              <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className={inputCls + ' py-1.5 text-xs w-[150px]'} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">to</label>
              <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} className={inputCls + ' py-1.5 text-xs w-[150px]'} />
            </div>
            <button
              onClick={applyDateFilter}
              disabled={!dateFilterDirty}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                dateFilterDirty
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800'
              }`}
              title="Apply the selected due-date range"
            >
              <Filter size={12} /> Apply Filter
            </button>
          </div>
        )}

        {filtersActive && (
          <button
            onClick={() => { setQuery(''); setStageFilter('all'); setFrom(''); setTo(''); setFromInput(''); setToInput(''); }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer pb-2"
          >
            <X size={12} /> Clear
          </button>
        )}

        {excelSpec && (
          <div className="ml-auto">
            <ExcelToolbar
              spec={excelSpec}
              rows={filtered}
              allRows={rows}
              clients={clients}
              onImport={onImportRecords}
              canImport={canImportExcel}
            />
          </div>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">{filtersActive ? 'No records match these filters.' : emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: `${minWidth}px` }}>
              <thead>
                {/* whitespace-nowrap on every header keeps the bold/tracked-out
                    header font from wrapping to two lines while the lighter
                    body font on the same column stays single-line below it —
                    that mismatch is what made the header row look misaligned
                    against the data rows. */}
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 w-12 whitespace-nowrap align-middle">S.No.</th>
                  {columns.map((c) => (
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
                    {columns.map((c) => (
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
                        {r.stage || '—'}
                      </span>
                      {stageDateFor?.(r) && (
                        <div className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                          {fmtStageDate(stageDateFor(r))}
                        </div>
                      )}
                    </td>
                    {onDelete && (
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        {(!canDelete || canDelete(r)) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
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
        )}
      </Card>
    </div>
  );
}
