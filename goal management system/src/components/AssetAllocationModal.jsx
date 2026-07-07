import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, Wallet, MessageSquare, Check, BarChart2 } from 'lucide-react';
import { inputCls, btnPrimary, btnGhost } from './UI';
import { fmtFull, fmtINR, uid } from '../utils/calc';
import { ASSET_SCHEMA, SECTION_IDS, normalizeAllocation } from '../utils/assets';

// Accent classes per section, keyed by schema accent
const ACCENTS = {
  indigo: { bar: 'border-indigo-500 dark:border-indigo-400', chip: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-indigo-200/50 dark:ring-indigo-900/40', icon: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' },
  amber: { bar: 'border-amber-500 dark:border-amber-400', chip: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-amber-200/50 dark:ring-amber-900/40', icon: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
  rose: { bar: 'border-rose-500 dark:border-rose-400', chip: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 ring-rose-200/50 dark:ring-rose-900/40', icon: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' },
};

const parseAmt = (s) => {
  const n = Number(String(s).replace(/,/g, ''));
  return isFinite(n) && n > 0 ? n : 0;
};

export default function AssetAllocationModal({ clientName, initial, onClose, onSave }) {
  const norm = useMemo(() => normalizeAllocation(initial), [initial]);

  // Working form state — amounts kept as strings so fields can be cleared
  const [values, setValues] = useState(() => {
    const v = { financial: {}, physical: {}, liabilities: {} };
    SECTION_IDS.forEach(sid => {
      Object.entries(norm.values[sid]).forEach(([label, amt]) => { v[sid][label] = String(amt); });
    });
    return v;
  });
  const [custom, setCustom] = useState(() => {
    const c = { financial: [], physical: [], liabilities: [] };
    SECTION_IDS.forEach(sid => { c[sid] = norm.custom[sid].map(x => ({ id: x.id, label: x.label, amount: String(x.amount), group: x.group || '' })); });
    return c;
  });
  const [remark, setRemark] = useState(norm.remark || '');
  const [peRatio, setPeRatio] = useState(norm.peRatio || '');

  const setVal = (sid, label, str) => setValues(prev => ({ ...prev, [sid]: { ...prev[sid], [label]: str } }));

  const addCustom = (sid, group) => setCustom(prev => ({ ...prev, [sid]: [...prev[sid], { id: uid(), label: '', amount: '', group }] }));
  const updCustom = (sid, id, key, val) => setCustom(prev => ({ ...prev, [sid]: prev[sid].map(x => x.id === id ? { ...x, [key]: val } : x) }));
  const delCustom = (sid, id) => setCustom(prev => ({ ...prev, [sid]: prev[sid].filter(x => x.id !== id) }));

  // Live section totals
  const sectionSum = (sid) => {
    const section = ASSET_SCHEMA.find(s => s.id === sid);
    let total = 0;
    section.groups.forEach(g => g.items.forEach(it => { total += parseAmt(values[sid][it.label]); }));
    custom[sid].forEach(x => { total += parseAmt(x.amount); });
    return total;
  };

  const finTotal = sectionSum('financial');
  const phyTotal = sectionSum('physical');
  const liaTotal = sectionSum('liabilities');
  const netWorth = finTotal + phyTotal - liaTotal;

  const handleSave = () => {
    const clean = { values: { financial: {}, physical: {}, liabilities: {} }, custom: { financial: [], physical: [], liabilities: [] }, remark: remark.trim() };
    SECTION_IDS.forEach(sid => {
      const section = ASSET_SCHEMA.find(s => s.id === sid);
      section.groups.forEach(g => g.items.forEach(it => {
        const amt = parseAmt(values[sid][it.label]);
        if (amt > 0) clean.values[sid][it.label] = amt;
      }));
      clean.custom[sid] = custom[sid]
        .map(x => ({ id: x.id, label: x.label.trim(), amount: parseAmt(x.amount), group: x.group || '' }))
        .filter(x => x.label && x.amount > 0);
    });
    clean.peRatio = peRatio.trim();
    onSave(clean);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Asset Allocation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{clientName} · enter values for holdings you want shown</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 overflow-y-auto space-y-8">
          {ASSET_SCHEMA.map(section => {
            const ac = ACCENTS[section.accent] || ACCENTS.indigo;
            const SectionIcon = section.icon;
            const sTotal = sectionSum(section.id);
            return (
              <section key={section.id} className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ac.icon}`}>
                      <SectionIcon size={16} />
                    </div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">{section.title}</h4>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full ring-1 tabular-nums ${ac.chip}`}>
                    {fmtINR(sTotal)}
                  </span>
                </div>

                {section.groups.map(group => {
                  const groupCustom = custom[section.id].filter(x => x.group === group.id);
                  return (
                    <div key={group.id} className="space-y-3">
                      <h5 className={`text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-2.5 border-l-2 ${ac.bar} leading-none`}>
                        {group.title}
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        {group.items.map(it => (
                          <div key={it.label} className="space-y-1">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {it.label}
                              {it.hint && <span className="block text-[10px] font-normal text-slate-400 dark:text-slate-500 mt-0.5">{it.hint}</span>}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 text-sm pointer-events-none">₹</span>
                              <input
                                type="number" min="0" step="any"
                                value={values[section.id][it.label] ?? ''}
                                onChange={(e) => setVal(section.id, it.label, e.target.value)}
                                placeholder="0"
                                className={inputCls + ' pl-7 tabular-nums'}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Per-group custom entries */}
                      <div className="space-y-2 pt-0.5 pl-2.5">
                        {groupCustom.map(row => (
                          <div key={row.id} className="flex items-center gap-2">
                            <input
                              value={row.label}
                              onChange={(e) => updCustom(section.id, row.id, 'label', e.target.value)}
                              placeholder={`Custom ${group.title.toLowerCase()} item`}
                              className={inputCls + ' flex-1'}
                            />
                            <div className="relative w-40 shrink-0">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 text-sm pointer-events-none">₹</span>
                              <input
                                type="number" min="0" step="any"
                                value={row.amount}
                                onChange={(e) => updCustom(section.id, row.id, 'amount', e.target.value)}
                                placeholder="0"
                                className={inputCls + ' pl-7 tabular-nums'}
                              />
                            </div>
                            <button onClick={() => delCustom(section.id, row.id)} title="Remove" className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                        <button onClick={() => addCustom(section.id, group.id)} className={btnGhost + ' !px-2.5 !py-1.5'}>
                          <Plus size={13} /> Add custom to {group.title}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}

          {/* P/E Ratio */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <BarChart2 size={16} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">P/E Ratio</h4>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Price to Earnings ratio — optional portfolio metric</p>
              </div>
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              value={peRatio}
              onChange={(e) => setPeRatio(e.target.value)}
              placeholder="e.g. 22.5"
              className={inputCls + ' w-48 tabular-nums'}
            />
          </section>

          {/* Remark */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <MessageSquare size={16} />
              </div>
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Remark</h4>
            </div>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="Optional notes about this client's allocation, rebalancing plan, observations…"
              className={inputCls + ' font-sans leading-relaxed resize-y'}
            />
          </section>
        </div>

        {/* Sticky footer with live net worth + actions */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 rounded-b-2xl shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Net Worth</span>
                <span className={`text-lg font-black tabular-nums ${netWorth < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{fmtFull(netWorth)}</span>
              </div>
              <div className="hidden sm:block text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed border-l border-slate-200 dark:border-slate-800 pl-4">
                <div>Assets <span className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">{fmtINR(finTotal + phyTotal)}</span></div>
                <div>Liabilities <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtINR(liaTotal)}</span></div>
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={onClose} className={btnGhost}>Cancel</button>
              <button onClick={handleSave} className={btnPrimary}><Check size={14} /> Save Allocation</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
