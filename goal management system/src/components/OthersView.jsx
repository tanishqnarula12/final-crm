import { useState } from 'react';
import { Wrench, AlertCircle } from 'lucide-react';
import { Card, inputCls, Field } from './UI';

// Sub-tab is controlled by the sidebar flyout → App.jsx → here via `subTab` prop.
export default function OthersView({ subTab = 'other_tools' }) {
  const activeSubTab = subTab;

  // =========================================================================
  // CALCULATOR STATE & LOGIC
  // =========================================================================
  const [calcType, setCalcType] = useState('sip');
  const [amount, setAmount] = useState(10000);
  const [rate, setRate] = useState(12);
  const [years, setYears] = useState(15);

  const calcResults = () => {
    const p = Number(amount) || 0;
    const r = (Number(rate) || 0) / 100;
    const t = Number(years) || 0;
    let invested = 0, totalValue = 0;
    if (calcType === 'sip') {
      const monthlyRate = r / 12;
      const months = t * 12;
      invested = p * months;
      totalValue = monthlyRate === 0
        ? invested
        : p * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);
    } else {
      invested = p;
      totalValue = p * Math.pow(1 + r, t);
    }
    const estReturns = Math.max(0, totalValue - invested);
    return { invested: Math.round(invested), returns: Math.round(estReturns), total: Math.round(totalValue) };
  };

  const { invested, returns, total } = calcResults();

  const fmtINR = (val) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Others Module</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Access utility tools.</p>
      </div>

      {/* ====================================================================
          CALCULATOR TAB
          ==================================================================== */}
      {activeSubTab === 'other_tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-scale-up">
          {/* Controls */}
          <Card className="p-6 lg:col-span-1 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Wrench size={18} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Quick Calculator</h3>
              </div>

              {/* Type tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
                {[{ id: 'sip', label: 'SIP Calculator', def: 10000 }, { id: 'lumpsum', label: 'Lumpsum Calculator', def: 100000 }].map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setCalcType(t.id); setAmount(t.def); }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      calcType === t.id
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/40 dark:border-slate-800/60'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <Field label={calcType === 'sip' ? 'Monthly Investment *' : 'Principal Amount *'}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                  <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className={inputCls + ' pl-7'} />
                </div>
              </Field>

              <Field label="Expected Annual Return (%) *">
                <div className="relative">
                  <input type="number" value={rate} onChange={e => setRate(Number(e.target.value))} className={inputCls} step="0.1" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                </div>
              </Field>

              <Field label="Time Period (Years) *">
                <div className="relative">
                  <input type="number" value={years} onChange={e => setYears(Number(e.target.value))} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Yrs</span>
                </div>
              </Field>
            </div>

            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-6 flex items-start gap-1.5 leading-relaxed bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900">
              <AlertCircle size={12} className="shrink-0 text-slate-500 mt-0.5" />
              <span>Calculations are illustrative projections and assume regular compounding. Actual returns are subject to market changes.</span>
            </div>
          </Card>

          {/* Projection Dashboard */}
          <Card className="p-6 lg:col-span-2 flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/10 dark:from-slate-900 dark:to-slate-950">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Projection Summary</h3>
                <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/30 px-2.5 py-0.5 rounded-full font-bold">
                  {calcType === 'sip' ? 'Regular SIP' : 'One-time Lumpsum'}
                </span>
              </div>

              <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-200/40 dark:border-slate-800/40">
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Estimated Future Value</span>
                <span className="text-4xl font-extrabold tracking-tight leading-none text-slate-900 dark:text-white">
                  {fmtINR(total)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Total Invested</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-200 tabular-nums">{fmtINR(invested)}</span>
                </div>
                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">Est. Capital Gains</span>
                  <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmtINR(returns)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>Investment ({Math.round((invested / total) * 100) || 0}%)</span>
                  <span>Gains ({Math.round((returns / total) * 100) || 0}%)</span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  <div style={{ width: `${(invested / total) * 100}%` }} className="bg-blue-600 dark:bg-blue-500 h-full" />
                  <div style={{ width: `${(returns / total) * 100}%` }} className="bg-emerald-500 dark:bg-emerald-400 h-full flex-1" />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { n: 1, title: 'Compounding Effect', body: 'Regular investments benefit from compound interest, which exponentially increases gains in outer years.' },
                { n: 2, title: 'Inflation Impact', body: 'Aim for returns that outpace inflation to ensure the purchasing power of your capital grows over time.' },
              ].map(({ n, title, body }) => (
                <div key={n} className="flex items-start gap-2 text-xs">
                  <span className="w-5 h-5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0">{n}</span>
                  <div>
                    <h4 className="font-bold text-slate-700 dark:text-slate-300">{title}</h4>
                    <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
