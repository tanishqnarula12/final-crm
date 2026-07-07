import React, { useState, useMemo } from 'react';
import {
  Wallet, PieChart as PieIcon, Pencil, Plus, Search, Scale,
  TrendingUp, Home, CreditCard, MessageSquare, History, ArrowRight, Save, Layers
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, Avatar, btnPrimary, btnSecondary, btnGhost, inputCls } from './UI';
import { fmtINR, fmtFull, fmtDate } from '../utils/calc';
import {
  normalizeAllocation, allocationTotals, groupComposition, sectionGroupColumns,
  hasAllocation, SECTION_COLORS, fmtPct
} from '../utils/assets';

const tooltipStyle = {
  backgroundColor: 'var(--tooltip-bg)',
  borderColor: 'var(--tooltip-border)',
  borderRadius: '12px',
  fontSize: '12px',
  color: 'var(--tooltip-color)',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
};

// ===========================================================================
// LIST — all clients with their net worth + allocation status
// ===========================================================================
export function AssetAllocationList({ clients, onSelect }) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.pan || '').toLowerCase().includes(q))
      .map(c => ({ client: c, totals: allocationTotals(c.assetAllocation), allocated: hasAllocation(c) }))
      .sort((a, b) => b.totals.netWorth - a.totals.netWorth);
  }, [clients, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Asset Allocation</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Net worth &amp; portfolio composition across {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or PAN…" className={inputCls + ' pl-9 w-full md:w-64'} />
        </div>
      </div>

      <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 font-bold">Client</th>
                <th className="text-right px-6 py-4 font-bold">Financial</th>
                <th className="text-right px-6 py-4 font-bold">Physical</th>
                <th className="text-right px-6 py-4 font-bold">Liabilities</th>
                <th className="text-right px-6 py-4 font-bold">Net Worth</th>
                <th className="text-center px-6 py-4 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {rows.map(({ client: c, totals: t, allocated }) => (
                <tr key={c.id} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => onSelect(c.id)}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <span className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 tabular-nums">{allocated ? fmtINR(t.financial) : '—'}</td>
                  <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 tabular-nums">{allocated ? fmtINR(t.physical) : '—'}</td>
                  <td className="px-6 py-4 text-right text-rose-600 dark:text-rose-400 tabular-nums">{allocated && t.liabilities > 0 ? fmtINR(t.liabilities) : '—'}</td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white tabular-nums">{allocated ? fmtINR(t.netWorth) : '—'}</td>
                  <td className="px-6 py-4 text-center">
                    {allocated ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-900/30 rounded-full">
                        <PieIcon size={11} /> Allocated
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/50 dark:ring-slate-700/50 rounded-full">
                        Not set
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-20 text-slate-400 dark:text-slate-600">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-800">
                        <Wallet size={32} />
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{clients.length === 0 ? 'No clients yet' : 'No results found'}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{clients.length === 0 ? 'Add clients from the Clients tab first' : 'Try a different search'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// DETAIL — one client's full allocation profile
// ===========================================================================
export function AssetAllocationDetail({ client, onEdit, onSaveRemark, isViewer }) {
  const alloc = useMemo(() => normalizeAllocation(client.assetAllocation), [client.assetAllocation]);
  const t = useMemo(() => allocationTotals(alloc), [alloc]);
  const allocated = hasAllocation(client);

  const finRows = useMemo(() => groupComposition(alloc, 'financial'), [alloc]);
  const phyRows = useMemo(() => groupComposition(alloc, 'physical'), [alloc]);
  const liaRows = useMemo(() => groupComposition(alloc, 'liabilities'), [alloc]);
  const finCols = useMemo(() => sectionGroupColumns(alloc, 'financial').filter(c => c.items.length > 0), [alloc]);
  const phyCols = useMemo(() => sectionGroupColumns(alloc, 'physical').filter(c => c.items.length > 0), [alloc]);
  const liaCols = useMemo(() => sectionGroupColumns(alloc, 'liabilities').filter(c => c.items.length > 0), [alloc]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} size="lg" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{client.name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-medium flex items-center flex-wrap gap-2">
                <span className="font-mono tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-lg text-xs border border-slate-200/40 dark:border-slate-700/40">{client.pan}</span>
                {alloc.updatedAt && fmtDate(alloc.updatedAt) && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="text-slate-400 dark:text-slate-500">Updated {fmtDate(alloc.updatedAt)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          {!isViewer && (
            <button onClick={onEdit} className={btnPrimary + ' w-full md:w-auto'}>
              <Pencil size={14} /> {allocated ? 'Edit Allocation' : 'Create Allocation'}
            </button>
          )}
        </div>

        {allocated && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3">
            <NetTile label="Net Worth" value={fmtFull(t.netWorth)} accent="emerald" big negative={t.netWorth < 0} icon={Scale} />
            <NetTile label="Total Assets" value={fmtINR(t.totalAssets)} accent="violet" icon={Wallet} />
            <NetTile label="Loans & Liabilities" value={fmtINR(t.liabilities)} accent="rose" icon={CreditCard} />
          </div>
        )}
      </Card>

      {!allocated ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <Wallet className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">No asset allocation recorded yet for this client</p>
          {!isViewer && (
            <button onClick={onEdit} className={btnSecondary}>
              <Plus size={14} /> Create allocation
            </button>
          )}
        </Card>
      ) : (
        <>
          {/* Net Worth Composition — the single headline pie */}
          <NetWorthComposition t={t} peRatio={alloc.peRatio} />

          {/* Asset & Liability Composition — class-level split of all three sections,
              shown side by side: Financial Assets · Physical Assets · Loans & Liabilities */}
          <section className="space-y-4">
            <SectionHeading icon={Layers} title="Asset & Liability Composition" hint="How each section splits across classes" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              <CompositionCard
                title="Financial Assets"
                icon={TrendingUp}
                accent="indigo"
                total={t.financial}
                rows={finRows}
                emptyText="No financial assets recorded."
              />
              <CompositionCard
                title="Physical Assets"
                icon={Home}
                accent="amber"
                total={t.physical}
                rows={phyRows}
                emptyText="No physical assets recorded."
              />
              <CompositionCard
                title="Loans & Liabilities"
                icon={CreditCard}
                accent="rose"
                total={t.liabilities}
                rows={liaRows}
                emptyText="No liabilities recorded — debt-free. 🎉"
              />
            </div>
          </section>

          {/* Asset Allocation Breakdown — every holding within its own asset class
              (each class column treated as 100%) */}
          <section className="space-y-4">
            <SectionHeading icon={Wallet} title="Asset Allocation Breakdown" hint="Every holding within its asset class (class = 100%)" />
            {finCols.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">Financial Assets</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                  {finCols.map(col => (
                    <AllocationDetailCard key={col.id} title={col.title} icon={TrendingUp} accent="indigo" total={col.total} items={col.items} emptyText="No holdings." />
                  ))}
                </div>
              </div>
            )}
            {phyCols.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">Physical Assets</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {phyCols.map(col => (
                    <AllocationDetailCard key={col.id} title={col.title} icon={Home} accent="amber" total={col.total} items={col.items} emptyText="No holdings." />
                  ))}
                </div>
              </div>
            )}
            {finCols.length === 0 && phyCols.length === 0 && (
              <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-2">No asset holdings recorded yet.</p>
              </Card>
            )}
          </section>

          {/* Liability Allocation Breakdown — every liability within its own
              category (each category column treated as 100%) */}
          <section className="space-y-4">
            <SectionHeading icon={CreditCard} title="Liability Allocation Breakdown" hint="Every liability within its category (category = 100%)" />
            {liaCols.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {liaCols.map(col => (
                  <AllocationDetailCard key={col.id} title={col.title} icon={CreditCard} accent="rose" total={col.total} items={col.items} emptyText="No liabilities." />
                ))}
              </div>
            ) : (
              <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
                <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-2">No liabilities recorded — this client is debt-free. 🎉</p>
              </Card>
            )}
          </section>
        </>
      )}

      {/* Remark */}
      <RemarkSection remark={alloc.remark} onSave={onSaveRemark} isViewer={isViewer} />

      {/* Edit history */}
      <AllocationChangeLog history={alloc.history} />
    </div>
  );
}

// --- Net worth stat tile -------------------------------------------------
function NetTile({ label, value, accent, big, negative, icon: Icon }) {
  const accents = {
    slate: 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white',
    indigo: 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-400',
    amber: 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400',
    rose: 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400',
    emerald: 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400',
    violet: 'bg-violet-50/60 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/40 text-violet-700 dark:text-violet-400',
  };
  return (
    <div className={`rounded-2xl border p-5 flex items-start justify-between gap-2 ${accents[accent]}`}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mb-1.5">{label}</p>
        <p className={`font-black tabular-nums truncate ${big ? 'text-2xl' : 'text-lg'} ${negative ? 'text-rose-600 dark:text-rose-400' : ''}`}>{value}</p>
      </div>
      {Icon && <div className="w-9 h-9 rounded-xl bg-white/70 dark:bg-slate-900/60 flex items-center justify-center shrink-0 border border-white/40 dark:border-slate-800/80 shadow-sm"><Icon size={15} /></div>}
    </div>
  );
}

// --- Section heading (icon + title + hint) -------------------------------
function SectionHeading({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 leading-tight">{title}</h3>
        {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

// --- Net Worth Composition — headline pie (financial / physical / liabilities)
function NetWorthComposition({ t, peRatio }) {
  const data = [
    { name: 'Financial Assets', value: t.financial, color: SECTION_COLORS.financial },
    { name: 'Physical Assets', value: t.physical, color: SECTION_COLORS.physical },
    { name: 'Liabilities', value: t.liabilities, color: SECTION_COLORS.liabilities },
  ].filter(d => d.value > 0);
  const gross = t.financial + t.physical + t.liabilities;

  return (
    <section className="space-y-4">
      <SectionHeading icon={PieIcon} title="Net Worth Composition" hint="Assets vs liabilities at a glance" />
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
        {gross === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-6">No values recorded yet.</p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start">
            {/* Pie chart */}
            <div className="flex items-center justify-center shrink-0">
              <div className="relative w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={72} outerRadius={108} paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                      {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [fmtINR(v), n]} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Net Worth</span>
                  <span className={`text-base font-black tabular-nums leading-tight ${t.netWorth < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{fmtINR(t.netWorth)}</span>
                </div>
              </div>
            </div>

            {/* Right side — fills remaining card width */}
            <div className="flex-1 min-w-0 space-y-5">
              {/* Legend rows with progress bars */}
              <div className="space-y-4">
                {data.map((d, i) => {
                  const pctNum = gross > 0 ? (d.value / gross) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{fmtINR(d.value)}</span>
                          <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color: d.color }}>{fmtPct(d.value, gross)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(1, pctNum)}%`, backgroundColor: d.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* P/E Ratio tile */}
              {peRatio && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-xl px-4 py-3 w-fit min-w-[140px]">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">P/E Ratio</p>
                    <p className="text-sm font-black text-indigo-700 dark:text-indigo-400 tabular-nums">{peRatio}x</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

// --- Composition card (financial / physical groups, or liability items) --
const CARD_ACCENTS = {
  indigo: { ring: 'border-indigo-200/60 dark:border-indigo-900/40', icon: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400', text: 'text-indigo-700 dark:text-indigo-400' },
  amber: { ring: 'border-amber-200/60 dark:border-amber-900/40', icon: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400', text: 'text-amber-700 dark:text-amber-400' },
  rose: { ring: 'border-rose-200/60 dark:border-rose-900/40', icon: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400', text: 'text-rose-700 dark:text-rose-400' },
};

function CompositionCard({ title, icon: Icon, accent, total, rows, emptyText }) {
  const ac = CARD_ACCENTS[accent] || CARD_ACCENTS.indigo;
  return (
    <Card className={`p-6 border shadow-md flex flex-col ${ac.ring}`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ac.icon}`}><Icon size={16} /></div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{title}</h4>
        </div>
        <span className={`text-lg font-black tabular-nums shrink-0 ${ac.text}`}>{fmtINR(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-6">{emptyText}</p>
      ) : (
        <div className="space-y-3.5">
          {rows.map(r => <CompositionRow key={r.id} label={r.label} amount={r.amount} color={r.color} total={total} custom={r.custom} />)}
        </div>
      )}
    </Card>
  );
}

function CompositionRow({ label, amount, color, total, custom }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">{label}</span>
          {custom && <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">custom</span>}
        </span>
        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
          {fmtINR(amount)} <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 ml-0.5">{pct.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// --- Allocation detail card (every individual entry, category = 100%) ----
function AllocationDetailCard({ title, icon: Icon, accent, total, items, emptyText }) {
  const ac = CARD_ACCENTS[accent] || CARD_ACCENTS.indigo;
  return (
    <Card className={`p-6 border shadow-md flex flex-col ${ac.ring}`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ac.icon}`}><Icon size={16} /></div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{title}</h4>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{fmtINR(total)}</p>
          </div>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full shrink-0 tabular-nums ${ac.icon}`}>100%</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-6">{emptyText}</p>
      ) : (
        <div className="space-y-3.5">
          {items.map(it => <CompositionRow key={it.label} label={it.label} amount={it.amount} color={it.color} total={total} custom={it.isCustom} />)}
        </div>
      )}
    </Card>
  );
}

// --- Remark (inline editable) -------------------------------------------
function RemarkSection({ remark, onSave, isViewer }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(remark || '');

  const startEdit = () => { setDraft(remark || ''); setEditing(true); };
  const save = () => { onSave(draft.trim()); setEditing(false); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <MessageSquare size={16} /> Remark
        </h3>
        {!editing && !isViewer && (
          <button onClick={startEdit} className={btnSecondary}>
            <Pencil size={14} /> {remark ? 'Edit Remark' : 'Add Remark'}
          </button>
        )}
      </div>
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
        {editing ? (
          <div className="space-y-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder="Add a manual remark about this client's allocation…"
              className={inputCls + ' font-sans leading-relaxed resize-y'}
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEditing(false)} className={btnGhost}>Cancel</button>
              <button onClick={save} className={btnPrimary}><Save size={14} /> Save Remark</button>
            </div>
          </div>
        ) : remark ? (
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{remark}</p>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-2">
            No remark yet. {isViewer ? '' : 'Click "Add Remark" to record a manual note.'}
          </p>
        )}
      </Card>
    </div>
  );
}

// --- Edit history (same visual language as the goal change log) ----------
function fmtLogStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${fmtDate(iso)} · ${time}`;
}

function AllocationChangeLog({ history }) {
  const entries = Array.isArray(history) ? [...history].reverse() : [];
  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
        <History size={16} /> Edit History
      </h3>
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-4">
            No edits yet. Any change to this client's allocation will be logged here.
          </p>
        ) : (
          <ol className="space-y-5">
            {entries.map((entry, i) => (
              <li key={i} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-blue-500 dark:bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">{fmtLogStamp(entry.at)}{entry.by && <span className="text-blue-500 dark:text-blue-400 ml-1.5">• {entry.by}</span>}</p>
                <ul className="space-y-1.5">
                  {(entry.changes || []).map((ch, j) => (
                    <li key={j} className="text-sm text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-white">{ch.label}</span>
                      <span className="text-slate-400 dark:text-slate-500">changed from</span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-xs font-bold tabular-nums">{ch.from}</span>
                      <ArrowRight size={13} className="text-slate-400 dark:text-slate-500" />
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold tabular-nums">{ch.to}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
