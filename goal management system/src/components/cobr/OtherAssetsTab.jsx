// Servicing → Other Assets: the list. Quick filters (All / Financial /
// Physical), search (applicant, PAN, group leader, asset type) and a Filter
// panel (as in Clients) for group leader, applicant, category, sub-type and
// created date; while it's closed the active filters show as chips. Same look
// as the other Servicing registers (cobr/RecordTable.jsx): a table on wider
// screens, one card per asset on phones. Clicking an asset opens it.
import { useMemo, useState } from 'react';
import { Search, X, Eye, Pencil, Trash2, Paperclip } from 'lucide-react';
import { Card, CoolSelect, selectCls, inputCls, Field, FilterToggle, FilterPanel, ActiveFilterChips } from '../UI';
import { ASSET_CATEGORIES, categoryLabel, subTypesFor, fmtRupees, fmtDmy } from '../../utils/otherAssets';

const QUICK = [{ id: 'all', label: 'All' }, { id: 'financial', label: 'Financial Assets' }, { id: 'physical', label: 'Physical Assets' }];

export default function OtherAssetsTab({ assets = [], onOpen, onEdit, onDelete, canEditFor, canDeleteFor }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [groupLeaderId, setGroupLeaderId] = useState('');
  const [applicant, setApplicant] = useState('');
  const [subType, setSubType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const leaders = useMemo(() => {
    const m = new Map();
    assets.forEach((a) => { if (a.groupLeaderId && !m.has(a.groupLeaderId)) m.set(a.groupLeaderId, a.groupLeader || '—'); });
    return [...m].sort((x, y) => x[1].localeCompare(y[1]));
  }, [assets]);
  const applicants = useMemo(() => [...new Set(assets
    .filter((a) => !groupLeaderId || a.groupLeaderId === groupLeaderId)
    .map((a) => a.applicant).filter(Boolean))].sort(), [assets, groupLeaderId]);
  const subTypeOptions = category === 'all'
    ? [...subTypesFor('financial'), ...subTypesFor('physical')]
    : subTypesFor(category);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets
      .filter((a) => category === 'all' || a.assetCategory === category)
      .filter((a) => !groupLeaderId || a.groupLeaderId === groupLeaderId)
      .filter((a) => !applicant || a.applicant === applicant)
      .filter((a) => !subType || a.assetSubType === subType)
      .filter((a) => (!from || (a.assetDate || '') >= from) && (!to || (a.assetDate || '') <= to))
      .filter((a) => !q
        || (a.applicant || '').toLowerCase().includes(q)
        || (a.pan || '').toLowerCase().includes(q)
        || (a.groupLeader || '').toLowerCase().includes(q)
        || (a.assetSubType || '').toLowerCase().includes(q)
        || categoryLabel(a.assetCategory).toLowerCase().includes(q))
      .sort((x, y) => (x.groupLeader || '').localeCompare(y.groupLeader || '')
        || (x.applicant || '').localeCompare(y.applicant || '')
        || (x.assetSubType || '').localeCompare(y.assetSubType || ''));
  }, [assets, query, category, groupLeaderId, applicant, subType, from, to]);

  const total = filtered.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const filtersActive = query || category !== 'all' || groupLeaderId || applicant || subType || from || to;
  const clearAll = () => { setQuery(''); setCategory('all'); setGroupLeaderId(''); setApplicant(''); setSubType(''); setFrom(''); setTo(''); };
  // What the Filter panel holds (everything but the search box).
  const clearPanel = () => { setCategory('all'); setGroupLeaderId(''); setApplicant(''); setSubType(''); setFrom(''); setTo(''); };
  const leaderName = leaders.find(([id]) => id === groupLeaderId)?.[1] || '';
  const chips = [
    groupLeaderId && { key: 'gl', label: `Group leader: ${leaderName}`, onRemove: () => { setGroupLeaderId(''); setApplicant(''); } },
    applicant && { key: 'ap', label: `Applicant: ${applicant}`, onRemove: () => setApplicant('') },
    category !== 'all' && { key: 'cat', label: `Category: ${categoryLabel(category)}`, onRemove: () => setCategory('all') },
    subType && { key: 'st', label: `Sub-type: ${subType}`, onRemove: () => setSubType('') },
    (from || to) && { key: 'dt', label: `Created: ${from ? fmtDmy(from) : '…'} – ${to ? fmtDmy(to) : '…'}`, onRemove: () => { setFrom(''); setTo(''); } },
  ].filter(Boolean);
  const panelCount = chips.length;
  const pickCategory = (c) => { setCategory(c); if (c !== 'all' && subType && !subTypesFor(c).some((s) => s.label === subType)) setSubType(''); };

  const actions = (a) => (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={(e) => { e.stopPropagation(); onOpen(a); }} title="View" className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50/60 dark:hover:bg-blue-950/30 cursor-pointer"><Eye size={14} /></button>
      {canEditFor(a) && (
        <button onClick={(e) => { e.stopPropagation(); onEdit(a); }} title="Edit" className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50/60 dark:hover:bg-blue-950/30 cursor-pointer"><Pencil size={14} /></button>
      )}
      {canDeleteFor(a) && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(a); }} title="Delete" className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 cursor-pointer"><Trash2 size={14} /></button>
      )}
    </div>
  );
  const files = (a) => ((a.attachments || []).length
    ? <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400"><Paperclip size={11} /> {a.attachments.length}</span>
    : '—');

  return (
    <div className="space-y-4">
      {/* Quick filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {QUICK.map((qf) => {
          const n = qf.id === 'all' ? assets.length : assets.filter((a) => a.assetCategory === qf.id).length;
          const on = category === qf.id;
          return (
            <button
              key={qf.id}
              data-asset-quick={qf.id}
              onClick={() => pickCategory(qf.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                on
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {qf.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${on ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Search + Filter (the filters live in the panel, as in Clients) */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search applicant, PAN, group leader, asset type…"
            className={inputCls + ' pl-9'}
          />
        </div>
        <FilterToggle open={showFilters} onClick={() => setShowFilters((s) => !s)} count={panelCount} />
        {filtersActive && (
          <button onClick={clearAll} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer">
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {showFilters ? (
        <FilterPanel onClear={panelCount ? clearPanel : null}>
          <Field label="Group Leader">
            <CoolSelect value={groupLeaderId} onChange={(e) => { setGroupLeaderId(e.target.value); setApplicant(''); }} placeholder="All group leaders" className={selectCls}>
              <option value="">All group leaders</option>
              {leaders.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </CoolSelect>
          </Field>
          <Field label="Applicant">
            <CoolSelect value={applicant} onChange={(e) => setApplicant(e.target.value)} placeholder="All applicants" className={selectCls}>
              <option value="">All applicants</option>
              {applicants.map((n) => <option key={n} value={n}>{n}</option>)}
            </CoolSelect>
          </Field>
          <Field label="Asset Category">
            <CoolSelect searchable={false} value={category === 'all' ? '' : category} onChange={(e) => pickCategory(e.target.value || 'all')} placeholder="All categories" className={selectCls}>
              <option value="">All categories</option>
              {ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </CoolSelect>
          </Field>
          <Field label="Asset Sub-Type">
            <CoolSelect value={subType} onChange={(e) => setSubType(e.target.value)} placeholder="All sub-types" className={selectCls}>
              <option value="">All sub-types</option>
              {subTypeOptions.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </CoolSelect>
          </Field>
          <Field label="Created Date">
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Created from" className={inputCls + ' min-w-0'} />
              <span className="text-slate-400 dark:text-slate-600">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Created to" className={inputCls + ' min-w-0'} />
            </div>
          </Field>
        </FilterPanel>
      ) : (
        <ActiveFilterChips chips={chips} onClearAll={clearPanel} />
      )}

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">
            {filtersActive ? 'No assets match these filters.' : 'No assets recorded yet. Use + Add Asset to record one.'}
          </p>
        ) : (
          <>
            {/* Phones: one card per asset. */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((a) => (
                <div key={a.id} onClick={() => onOpen(a)} className="p-4 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words">{a.applicant || '—'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{a.applicantRelation || '—'} · {a.groupLeader || '—'}</div>
                    </div>
                    <span className="shrink-0 text-sm font-black text-slate-900 dark:text-white tabular-nums">{fmtRupees(a.amount)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-3">
                    <div className="min-w-0 col-span-2"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Asset</dt><dd className="text-xs mt-0.5 text-slate-700 dark:text-slate-200 font-semibold break-words">{a.assetSubType} <span className="font-normal text-slate-400">· {categoryLabel(a.assetCategory)}</span></dd></div>
                    <div className="min-w-0"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">PAN</dt><dd className="text-xs mt-0.5 font-mono text-slate-500 dark:text-slate-400">{a.pan || '—'}</dd></div>
                    <div className="min-w-0"><dt className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Created</dt><dd className="text-xs mt-0.5 text-slate-600 dark:text-slate-300">{fmtDmy(a.assetDate)}</dd></div>
                  </dl>
                  <div className="flex items-center justify-between mt-2 -mb-1">
                    <span className="text-xs">{files(a)}</span>
                    {actions(a)}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left" style={{ minWidth: '1040px' }}>
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    {['Group Leader', 'Applicant', 'Relation', 'Applicant PAN', 'Asset Category', 'Asset Sub-Type'].map((h) => (
                      <th key={h} className="px-3 py-3 whitespace-nowrap align-middle">{h}</th>
                    ))}
                    <th className="px-3 py-3 whitespace-nowrap align-middle text-right">Current Asset Value</th>
                    <th className="px-3 py-3 whitespace-nowrap align-middle">Created Date</th>
                    <th className="px-3 py-3 whitespace-nowrap align-middle">Attachment</th>
                    <th className="px-3 py-3 whitespace-nowrap align-middle text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} onClick={() => onOpen(a)} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer">
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-slate-600 dark:text-slate-300">{a.groupLeader || '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle font-bold text-slate-800 dark:text-slate-200">{a.applicant || '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-slate-600 dark:text-slate-300">{a.applicantRelation || '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle font-mono text-slate-500 dark:text-slate-400">{a.pan || '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-slate-600 dark:text-slate-300">{categoryLabel(a.assetCategory)}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-slate-700 dark:text-slate-200 font-semibold">{a.assetSubType || '—'}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-right tabular-nums font-bold text-slate-900 dark:text-white">{fmtRupees(a.amount)}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle text-slate-600 dark:text-slate-300 tabular-nums">{fmtDmy(a.assetDate)}</td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap align-middle">{files(a)}</td>
                      <td className="px-3 py-2 whitespace-nowrap align-middle">{actions(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <span>{filtered.length} asset{filtered.length === 1 ? '' : 's'}{filtersActive ? ` of ${assets.length}` : ''}</span>
              <span className="tabular-nums">Total {fmtRupees(total)}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
