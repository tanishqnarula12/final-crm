// Others → Calculator: SIP, Lumpsum and the planning calculators an advisor
// reaches for in a client conversation. Inputs on the left, the result on the
// right (the layout the SIP / Lumpsum calculator always had); the maths lives
// in utils/calculators.js. Nothing here is saved.
import { useMemo, useState } from 'react';
import {
  AlertCircle, Repeat, Banknote, TrendingUp, Scale, Percent, CalendarDays, ArrowDownToLine,
  ArrowRightLeft, TrendingDown, Layers, Landmark, Plus, Trash2, TriangleAlert,
} from 'lucide-react';
import { Card, inputCls, Field, btnSecondary } from './UI';
import {
  sip, lumpsum, stepUpSip, sipVsLumpsum, cagr, xirr, swp, stp, inflationAdjusted, compoundInterest, loanEmi,
  STP_FREQUENCIES, COMPOUNDING, MAX_YEARS,
} from '../utils/calculators';

const fmtINR = (val) => (Number.isFinite(val)
  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(val))
  : '—');
const fmtPct = (val) => (Number.isFinite(val) ? `${val.toFixed(2)}%` : '—');
const fmtAmt = (v) => {
  const digits = String(v ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-IN') : '';
};
const toNum = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return localDay(d); };

// Field builders: amount (₹, comma-formatted), pct, years, count, select.
const amount = (key, label) => ({ key, label, kind: 'amount' });
const pct = (key, label) => ({ key, label, kind: 'pct' });
const years = (key, label = 'Time Period (Years) *') => ({ key, label, kind: 'years' });
const count = (key, label, hint) => ({ key, label, kind: 'count', hint });
const choice = (key, label, options) => ({ key, label, kind: 'select', options });

const SIP_TIPS = [
  { n: 1, title: 'Compounding Effect', body: 'Regular investments benefit from compound interest, which exponentially increases gains in outer years.' },
  { n: 2, title: 'Inflation Impact', body: 'Aim for returns that outpace inflation to ensure the purchasing power of your capital grows over time.' },
];

const CALCULATORS = [
  {
    id: 'sip', label: 'SIP', title: 'SIP Calculator', icon: Repeat,
    defaults: { amount: '10,000', ratePct: 12, years: 15 },
    fields: [amount('amount', 'Monthly Investment *'), pct('ratePct', 'Expected Annual Return (%) *'), years('years')],
    how: 'Each instalment is invested at the start of the month and grows at the annual return ÷ 12 a month.',
  },
  {
    id: 'lumpsum', label: 'Lumpsum', title: 'Lumpsum Calculator', icon: Banknote,
    defaults: { amount: '1,00,000', ratePct: 12, years: 15 },
    fields: [amount('amount', 'Principal Amount *'), pct('ratePct', 'Expected Annual Return (%) *'), years('years')],
    how: 'The amount is invested once and grows at the annual return, compounded yearly.',
  },
  {
    id: 'stepup', label: 'Step-Up SIP', title: 'Step-Up SIP Calculator', icon: TrendingUp,
    defaults: { amount: '10,000', stepUpPct: 10, ratePct: 12, years: 15 },
    fields: [amount('amount', 'Monthly Investment (first year) *'), pct('stepUpPct', 'Annual Step-Up (%) *'), pct('ratePct', 'Expected Annual Return (%) *'), years('years')],
    how: 'The monthly SIP rises by the step-up % at the start of every year; instalments grow at the annual return ÷ 12 a month.',
  },
  {
    id: 'sipvslump', label: 'SIP vs Lumpsum', title: 'SIP vs Lumpsum Calculator', icon: Scale,
    defaults: { total: '12,00,000', ratePct: 12, years: 10 },
    fields: [amount('total', 'Total Amount to Invest *'), pct('ratePct', 'Expected Annual Return (%) *'), years('years')],
    how: 'The same total either goes in today as a lumpsum, or is spread as equal monthly SIPs over the period — worked out exactly like the SIP and Lumpsum calculators.',
  },
  {
    id: 'cagr', label: 'CAGR', title: 'CAGR Calculator', icon: Percent,
    defaults: { initial: '1,00,000', final: '2,50,000', years: 5 },
    fields: [amount('initial', 'Initial Value *'), amount('final', 'Final Value *'), years('years', 'Duration (Years) *')],
    how: 'CAGR = (Final ÷ Initial)^(1 ÷ Years) − 1: the steady yearly growth that turns the initial value into the final value.',
  },
  {
    id: 'xirr', label: 'XIRR', title: 'XIRR Calculator', icon: CalendarDays,
    defaults: null, // its own inputs — see XirrInputs
    how: 'XIRR is the yearly return that accounts for when each amount went in or came out (actual days ÷ 365, as in Excel).',
  },
  {
    id: 'swp', label: 'SWP', title: 'SWP (Systematic Withdrawal Plan) Calculator', icon: ArrowDownToLine,
    defaults: { corpus: '50,00,000', withdrawal: '30,000', ratePct: 8, years: 20 },
    fields: [amount('corpus', 'Total Investment *'), amount('withdrawal', 'Monthly Withdrawal *'), pct('ratePct', 'Expected Annual Return (%) *'), years('years')],
    how: 'Each month the balance grows at the annual return ÷ 12, then the withdrawal is paid out — until the period ends or the money runs out.',
  },
  {
    id: 'stp', label: 'STP', title: 'STP (Systematic Transfer Plan) Calculator', icon: ArrowRightLeft,
    defaults: { amount: '6,00,000', installments: '12', frequency: 'Monthly', sourceRatePct: 6.5, targetRatePct: 12 },
    fields: [
      amount('amount', 'Amount in Source Fund *'),
      choice('frequency', 'Frequency *', STP_FREQUENCIES.map((f) => f.id)),
      count('installments', 'Installments *', 'The amount moves across in this many equal instalments.'),
      pct('sourceRatePct', 'Source Fund Return (%) *'),
      pct('targetRatePct', 'Target Fund Return (%) *'),
    ],
    how: 'At the start of each period one instalment moves to the target fund, then both funds grow for that period. What the source fund earned meanwhile stays in it.',
  },
  {
    id: 'inflation', label: 'Inflation-Adjusted', title: 'Inflation-Adjusted Returns Calculator', icon: TrendingDown,
    defaults: { amount: '10,00,000', ratePct: 12, inflationPct: 6, years: 10 },
    fields: [amount('amount', 'Investment Amount *'), pct('ratePct', 'Expected Annual Return (%) *'), pct('inflationPct', 'Expected Inflation (%) *'), years('years')],
    how: "Real return = (1 + return) ÷ (1 + inflation) − 1. The future value is shown in today's money by taking inflation out of it.",
  },
  {
    id: 'compound', label: 'Compound Interest', title: 'Compound Interest Calculator', icon: Layers,
    defaults: { principal: '1,00,000', ratePct: 8, years: 10, compounding: 'Quarterly' },
    fields: [amount('principal', 'Principal Amount *'), pct('ratePct', 'Annual Interest Rate (%) *'), years('years'), choice('compounding', 'Compounding *', COMPOUNDING.map((c) => c.id))],
    how: 'Amount = Principal × (1 + rate ÷ n)^(n × years), where n is how many times a year interest is added.',
  },
  {
    id: 'emi', label: 'Loan & EMI', title: 'Loan and EMI Calculator', icon: Landmark,
    defaults: { loan: '25,00,000', ratePct: 8.5, years: 20 },
    fields: [amount('loan', 'Loan Amount *'), pct('ratePct', 'Annual Interest Rate (%) *'), years('years', 'Loan Tenure (Years) *')],
    how: 'EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), with r the monthly rate and n the number of months.',
  },
];

const XIRR_DEFAULT = () => ({
  flows: [
    { type: 'invest', date: yearsAgo(3), amount: '1,00,000' },
    { type: 'invest', date: yearsAgo(1), amount: '50,000' },
  ],
  currentValue: '1,90,000',
  valuationDate: localDay(new Date()),
});

// ---- inputs ----------------------------------------------------------------

function InputFor({ f, value, onChange }) {
  if (f.kind === 'amount') {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
        <input type="text" inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(fmtAmt(e.target.value))} aria-label={f.label} className={inputCls + ' pl-7 tabular-nums'} />
      </div>
    );
  }
  if (f.kind === 'select') {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={inputCls + ' cursor-pointer'}>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const suffix = f.kind === 'pct' ? '%' : f.kind === 'years' ? 'Yrs' : '';
  return (
    <div className="relative">
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(f.kind === 'count' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
        step={f.kind === 'pct' ? '0.1' : '1'}
        min={f.kind === 'pct' ? undefined : '0'}
        max={f.kind === 'years' ? String(MAX_YEARS) : undefined}
        aria-label={f.label}
        className={inputCls + ' tabular-nums'}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">{suffix}</span>}
    </div>
  );
}

function XirrInputs({ v, set }) {
  const setFlow = (i, patch) => set({ ...v, flows: v.flows.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Transactions *</span>
        {v.flows.map((f, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-2 rounded-xl border border-slate-200/70 dark:border-slate-800 p-2.5" data-xirr-row>
            <select value={f.type} onChange={(e) => setFlow(i, { type: e.target.value })} aria-label="Type" className={inputCls + ' py-2 text-xs cursor-pointer'}>
              <option value="invest">Invested</option>
              <option value="withdraw">Withdrawn</option>
            </select>
            <input type="date" value={f.date} onChange={(e) => setFlow(i, { date: e.target.value })} aria-label="Date" className={inputCls + ' py-2 text-xs'} />
            <div className="relative col-span-2 flex items-center gap-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
              <input type="text" inputMode="numeric" value={f.amount} onChange={(e) => setFlow(i, { amount: fmtAmt(e.target.value) })} aria-label="Amount" placeholder="Amount" className={inputCls + ' pl-7 py-2 text-xs tabular-nums'} />
              <button type="button" onClick={() => set({ ...v, flows: v.flows.filter((_, k) => k !== i) })} disabled={v.flows.length === 1} aria-label="Remove transaction" className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer disabled:cursor-default shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => set({ ...v, flows: [...v.flows, { type: 'invest', date: '', amount: '' }] })} className={btnSecondary + ' w-full py-2 text-[11px]'}>
          <Plus size={12} /> Add Transaction
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current Value *">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
            <input type="text" inputMode="numeric" value={v.currentValue} onChange={(e) => set({ ...v, currentValue: fmtAmt(e.target.value) })} aria-label="Current Value" className={inputCls + ' pl-7 tabular-nums'} />
          </div>
        </Field>
        <Field label="As On *">
          <input type="date" value={v.valuationDate} onChange={(e) => set({ ...v, valuationDate: e.target.value })} aria-label="As On" className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

// ---- results ---------------------------------------------------------------

function Tile({ label, value, tone = 'slate' }) {
  const color = { slate: 'text-slate-800 dark:text-slate-200', green: 'text-emerald-600 dark:text-emerald-400', red: 'text-rose-600 dark:text-rose-400', blue: 'text-blue-600 dark:text-blue-400' }[tone];
  return (
    <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 min-w-0">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">{label}</span>
      <span className={`text-lg font-bold tabular-nums break-words ${color}`}>{value}</span>
    </div>
  );
}

function SplitBar({ a, b, aLabel, bLabel, bClass = 'bg-emerald-500 dark:bg-emerald-400' }) {
  const total = a + b;
  if (!(total > 0) || a < 0 || b < 0) return null;
  return (
    <div className="space-y-2" data-split-bar>
      <div className="flex justify-between text-[10px] font-bold text-slate-500">
        <span>{aLabel} ({Math.round((a / total) * 100) || 0}%)</span>
        <span>{bLabel} ({Math.round((b / total) * 100) || 0}%)</span>
      </div>
      <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
        <div style={{ width: `${(a / total) * 100}%` }} className="bg-blue-600 dark:bg-blue-500 h-full" />
        <div style={{ width: `${(b / total) * 100}%` }} className={`${bClass} h-full flex-1`} />
      </div>
    </div>
  );
}

function YearTable({ cols, rows }) {
  if (!rows?.length) return null;
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">Year by year</span>
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800" data-year-table>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <tr>{cols.map((c, i) => <th key={c} className={`px-3 py-2 whitespace-nowrap ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, ri) => (
              <tr key={ri}>{r.map((cell, ci) => <td key={ci} className={`px-3 py-2 tabular-nums whitespace-nowrap ${ci ? 'text-right text-slate-700 dark:text-slate-200' : 'font-bold text-slate-500 dark:text-slate-400'}`}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Notice({ children, tone = 'amber' }) {
  const cls = tone === 'amber'
    ? 'border-amber-200/70 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200'
    : 'border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 text-slate-600 dark:text-slate-300';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${cls}`} data-calc-notice>
      <TriangleAlert size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// Every calculator's result as { badge, heroLabel, hero, tiles, bar, table, notice, tips }.
function resultFor(id, v) {
  const yr = (y) => `Year ${y}`;
  switch (id) {
    case 'sip':
    case 'lumpsum': {
      const r = (id === 'sip' ? sip : lumpsum)({ amount: toNum(v.amount), ratePct: v.ratePct, years: v.years });
      const invested = Math.round(r.invested), returns = Math.round(r.gains), total = Math.round(r.value);
      return {
        badge: id === 'sip' ? 'Regular SIP' : 'One-time Lumpsum',
        heroLabel: 'Estimated Future Value', hero: fmtINR(total),
        tiles: [{ label: 'Total Invested', value: fmtINR(invested) }, { label: 'Est. Capital Gains', value: fmtINR(returns), tone: 'green' }],
        bar: { a: invested, b: returns, aLabel: 'Investment', bLabel: 'Gains' },
        tips: SIP_TIPS,
      };
    }
    case 'stepup': {
      const r = stepUpSip({ amount: toNum(v.amount), stepUpPct: v.stepUpPct, ratePct: v.ratePct, years: v.years });
      return {
        badge: `Step-up ${Number(v.stepUpPct) || 0}% a year`,
        heroLabel: 'Estimated Future Value', hero: fmtINR(r.value),
        tiles: [
          { label: 'Total Invested', value: fmtINR(r.invested) },
          { label: 'Est. Capital Gains', value: fmtINR(r.gains), tone: r.gains < 0 ? 'red' : 'green' },
          { label: 'Monthly SIP in the Last Year', value: fmtINR(r.lastMonthly) },
          { label: 'Plain SIP would grow to', value: fmtINR(sip({ amount: toNum(v.amount), ratePct: v.ratePct, years: Math.round((Number(v.years) || 0) * 12) / 12 }).value) },
        ],
        bar: { a: r.invested, b: r.gains, aLabel: 'Investment', bLabel: 'Gains' },
        table: { cols: ['Year', 'Monthly SIP', 'Invested so far', 'Value'], rows: r.rows.map((x) => [yr(x.year), fmtINR(x.monthly), fmtINR(x.invested), fmtINR(x.value)]) },
      };
    }
    case 'sipvslump': {
      const r = sipVsLumpsum({ total: toNum(v.total), ratePct: v.ratePct, years: v.years });
      const ahead = r.difference >= 0 ? 'Lumpsum' : 'SIP';
      return {
        badge: 'Same amount, two ways',
        heroLabel: `${ahead} ends ahead by`, hero: fmtINR(Math.abs(r.difference)),
        tiles: [
          { label: `SIP: ${fmtINR(r.monthly)} a month × ${r.months}`, value: fmtINR(r.sip.value), tone: 'blue' },
          { label: `Lumpsum: ${fmtINR(toNum(v.total))} today`, value: fmtINR(r.lumpsum.value), tone: 'green' },
          { label: 'SIP Gains', value: fmtINR(r.sip.gains) },
          { label: 'Lumpsum Gains', value: fmtINR(r.lumpsum.gains) },
        ],
        bar: { a: r.sip.value, b: r.lumpsum.value, aLabel: 'SIP value', bLabel: 'Lumpsum value' },
        notice: { tone: 'slate', text: 'At the same return, money invested earlier has longer to grow. A SIP spreads the entry over time, which lowers the risk of investing everything at a market high.' },
      };
    }
    case 'cagr': {
      const r = cagr({ initial: toNum(v.initial), final: toNum(v.final), years: v.years });
      if (!r) return { badge: 'CAGR', heroLabel: 'CAGR', hero: '—', notice: { text: 'Enter an initial value above 0, a final value and the number of years.' } };
      return {
        badge: 'Compound annual growth',
        heroLabel: 'CAGR', hero: fmtPct(r.cagrPct),
        tiles: [
          { label: 'Absolute Return', value: fmtPct(r.absolutePct), tone: r.absolutePct < 0 ? 'red' : 'green' },
          { label: r.gain < 0 ? 'Loss' : 'Gain', value: fmtINR(r.gain), tone: r.gain < 0 ? 'red' : 'green' },
        ],
      };
    }
    case 'xirr': {
      const flows = v.flows
        .filter((f) => f.date && toNum(f.amount))
        .map((f) => ({ date: f.date, amount: f.type === 'invest' ? -toNum(f.amount) : toNum(f.amount) }));
      if (v.valuationDate && toNum(v.currentValue)) flows.push({ date: v.valuationDate, amount: toNum(v.currentValue) });
      const r = xirr(flows);
      if (!r) return { badge: 'XIRR', heroLabel: 'XIRR', hero: '—', notice: { text: 'Needs at least one investment and a current value (or a withdrawal), each with a date and an amount.' } };
      return {
        badge: `${flows.length} dated amounts`,
        heroLabel: 'XIRR (annualised)', hero: fmtPct(r.ratePct),
        tiles: [
          { label: 'Total Invested', value: fmtINR(r.invested) },
          { label: 'Withdrawn + Current Value', value: fmtINR(r.received), tone: 'blue' },
          { label: r.gain < 0 ? 'Loss' : 'Gain', value: fmtINR(r.gain), tone: r.gain < 0 ? 'red' : 'green' },
        ],
      };
    }
    case 'swp': {
      const r = swp({ corpus: toNum(v.corpus), withdrawal: toNum(v.withdrawal), ratePct: v.ratePct, years: v.years });
      const plural = (n, w) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
      const lasted = r.ranOutAt ? [plural(Math.floor(r.ranOutAt / 12), 'year'), plural(r.ranOutAt % 12, 'month')].filter(Boolean).join(' ') : '';
      return {
        badge: 'Monthly withdrawals',
        heroLabel: `Value Left After ${Number(v.years) || 0} Years`, hero: fmtINR(r.finalValue),
        tiles: [
          { label: 'Total Withdrawn', value: fmtINR(r.totalWithdrawn), tone: 'blue' },
          { label: 'Total Investment', value: fmtINR(toNum(v.corpus)) },
          { label: 'Est. Returns Earned', value: fmtINR(r.gains), tone: r.gains < 0 ? 'red' : 'green' },
        ],
        notice: r.ranOutAt ? { text: `The money runs out in month ${r.ranOutAt} (after ${lasted}) — the withdrawal is more than the investment can sustain.` } : null,
        table: { cols: ['Year', 'Withdrawn', 'Withdrawn so far', 'Balance'], rows: r.rows.map((x) => [yr(x.year), fmtINR(x.withdrawn), fmtINR(x.totalWithdrawn), fmtINR(x.balance)]) },
      };
    }
    case 'stp': {
      const r = stp({ amount: toNum(v.amount), installments: v.installments, frequency: v.frequency, sourceRatePct: v.sourceRatePct, targetRatePct: v.targetRatePct });
      if (!r.periods) return { badge: 'STP', heroLabel: 'Total Value', hero: '—', notice: { text: 'Enter the amount and the number of installments.' } };
      return {
        badge: `${r.periods} ${v.frequency.toLowerCase()} transfers`,
        heroLabel: `Total Value After ${r.periods} ${r.unit}${r.periods === 1 ? '' : 's'}`, hero: fmtINR(r.value),
        tiles: [
          { label: `Each Transfer (${v.frequency})`, value: fmtINR(r.each), tone: 'blue' },
          { label: 'In Target Fund', value: fmtINR(r.target), tone: 'green' },
          { label: 'Left in Source Fund', value: fmtINR(r.source) },
          { label: 'Est. Gains', value: fmtINR(r.gains), tone: r.gains < 0 ? 'red' : 'green' },
        ],
        bar: { a: r.target, b: r.source, aLabel: 'Target fund', bLabel: 'Source fund', bClass: 'bg-amber-400 dark:bg-amber-500' },
        table: { cols: ['Year', 'Transferred so far', 'Source Fund', 'Target Fund', 'Total'], rows: r.rows.map((x) => [yr(x.year), fmtINR(x.transferred), fmtINR(x.source), fmtINR(x.target), fmtINR(x.total)]) },
      };
    }
    case 'inflation': {
      const r = inflationAdjusted({ amount: toNum(v.amount), ratePct: v.ratePct, inflationPct: v.inflationPct, years: v.years });
      return {
        badge: `Inflation ${Number(v.inflationPct) || 0}%`,
        heroLabel: "Worth in Today's Money", hero: fmtINR(r.real),
        tiles: [
          { label: `Future Value (after ${Number(v.years) || 0} yrs)`, value: fmtINR(r.nominal), tone: 'blue' },
          { label: 'Real Return (a year)', value: fmtPct(r.realRatePct), tone: r.realRatePct < 0 ? 'red' : 'green' },
          { label: 'Eaten by Inflation', value: fmtINR(r.lostToInflation), tone: 'red' },
          { label: `${fmtINR(toNum(v.amount))} Today Will Cost`, value: fmtINR(r.todaysAmountLater) },
        ],
        notice: r.realRatePct < 0 ? { text: 'The return is below inflation, so the money loses buying power every year.' } : null,
      };
    }
    case 'compound': {
      const r = compoundInterest({ principal: toNum(v.principal), ratePct: v.ratePct, years: v.years, compounding: v.compounding });
      return {
        badge: `Compounded ${v.compounding.toLowerCase()}`,
        heroLabel: 'Maturity Value', hero: fmtINR(r.value),
        tiles: [
          { label: 'Principal', value: fmtINR(toNum(v.principal)) },
          { label: 'Interest Earned', value: fmtINR(r.interest), tone: 'green' },
          { label: 'Effective Annual Rate', value: fmtPct(r.effectivePct), tone: 'blue' },
        ],
        bar: { a: toNum(v.principal), b: r.interest, aLabel: 'Principal', bLabel: 'Interest' },
        table: { cols: ['Year', 'Interest so far', 'Value'], rows: r.rows.map((x) => [yr(x.year), fmtINR(x.interest), fmtINR(x.value)]) },
      };
    }
    case 'emi': {
      const r = loanEmi({ loan: toNum(v.loan), ratePct: v.ratePct, years: v.years });
      if (!r) return { badge: 'Loan', heroLabel: 'Monthly EMI', hero: '—', notice: { text: 'Enter the loan amount and the tenure.' } };
      return {
        badge: `${r.months} monthly EMIs`,
        heroLabel: 'Monthly EMI', hero: fmtINR(r.emi),
        tiles: [
          { label: 'Loan Amount', value: fmtINR(toNum(v.loan)) },
          { label: 'Total Interest', value: fmtINR(r.totalInterest), tone: 'red' },
          { label: 'Total Payment', value: fmtINR(r.totalPayment), tone: 'blue' },
        ],
        bar: { a: toNum(v.loan), b: r.totalInterest, aLabel: 'Principal', bLabel: 'Interest', bClass: 'bg-rose-500 dark:bg-rose-400' },
        table: { cols: ['Year', 'Principal Paid', 'Interest Paid', 'Balance'], rows: r.rows.map((x) => [yr(x.year), fmtINR(x.principal), fmtINR(x.interest), fmtINR(x.balance)]) },
      };
    }
    default:
      return null;
  }
}

export default function Calculators() {
  const [calcId, setCalcId] = useState('sip');
  const [values, setValues] = useState(() => ({
    ...Object.fromEntries(CALCULATORS.filter((c) => c.defaults).map((c) => [c.id, { ...c.defaults }])),
    xirr: XIRR_DEFAULT(),
  }));
  const calc = CALCULATORS.find((c) => c.id === calcId);
  const v = values[calcId];
  const setV = (next) => setValues((prev) => ({ ...prev, [calcId]: next }));
  const res = useMemo(() => resultFor(calcId, v), [calcId, v]);
  const Icon = calc.icon;

  return (
    <div className="space-y-6 animate-scale-up">
      {/* Which calculator */}
      <Card className="p-3 sm:p-4">
        <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Calculators">
          {CALCULATORS.map((c) => {
            const CIcon = c.icon;
            const active = c.id === calcId;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-calc={c.id}
                onClick={() => setCalcId(c.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <CIcon size={14} className="shrink-0" /> {c.label}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <Card className="p-6 lg:col-span-1 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Icon size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300" data-calc-title>{calc.title}</h3>
            </div>
            {calcId === 'xirr' ? <XirrInputs v={v} set={setV} /> : calc.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <InputFor f={f} value={v[f.key]} onChange={(val) => setV({ ...v, [f.key]: val })} />
              </Field>
            ))}
          </div>

          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-6 flex items-start gap-1.5 leading-relaxed bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900">
            <AlertCircle size={12} className="shrink-0 text-slate-500 mt-0.5" />
            <span>{calc.how} Calculations are illustrative projections. Actual returns are subject to market changes.</span>
          </div>
        </Card>

        {/* Result */}
        <Card className="p-6 lg:col-span-2 flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/10 dark:from-slate-900 dark:to-slate-950 min-w-0">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Projection Summary</h3>
              <span className="text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/30 px-2.5 py-0.5 rounded-full font-bold" data-calc-badge>
                {res.badge}
              </span>
            </div>

            <div className="text-center py-6 px-3 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-200/40 dark:border-slate-800/40">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">{res.heroLabel}</span>
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none text-slate-900 dark:text-white tabular-nums break-words" data-calc-hero>
                {res.hero}
              </span>
            </div>

            {res.notice && <Notice tone={res.notice.tone}>{res.notice.text}</Notice>}

            {res.tiles?.length > 0 && (
              <div className={`grid grid-cols-2 ${res.tiles.length === 3 ? 'xl:grid-cols-3' : ''} gap-4`} data-calc-tiles>
                {res.tiles.map((t) => <Tile key={t.label} {...t} />)}
              </div>
            )}

            {res.bar && <SplitBar {...res.bar} />}
            {res.table && <YearTable {...res.table} />}
          </div>

          {res.tips && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {res.tips.map(({ n, title, body }) => (
                <div key={n} className="flex items-start gap-2 text-xs">
                  <span className="w-5 h-5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0">{n}</span>
                  <div>
                    <h4 className="font-bold text-slate-700 dark:text-slate-300">{title}</h4>
                    <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
