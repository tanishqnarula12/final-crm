import React, { useState } from 'react';
import {
  ChevronLeft, Pencil, Percent, TrendingUp, Calendar, IndianRupee, Info, CheckCircle2, History, ArrowRight, User,
  Plus, Trash2, Check, X, ClipboardList, Wallet
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Card, btnSecondary, btnPrimary, inputCls, selectCls } from './UI';
import {
  calcGoal, buildProjection, activeValuationId, goalContributions, monthLabel, fmtINR, fmtSip, fmtFull, goalEmoji, goalCreatedLabel, needsKidName, fmtDate, uid,
  MONTH_NAMES, CURRENT_MONTH, CURRENT_YEAR
} from '../utils/calc';

// Human-readable explanation of every Create Log entry that landed inside a
// projection row, e.g. "SIP +₹10,000/mo from 15 Jun 2027\nLumpsum +₹1,00,000 on 3 Aug 2027"
// — shown on the row's blue info icon so the row-over-row jump can be traced
// straight back to the log entry that caused it.
function contribRowHint(entries, only) {
  return entries
    .filter(e => !only || e.type === only)
    .map(e => {
      const sign = e.amount >= 0 ? '+' : '−';
      const amt = `${sign}${fmtFull(Math.abs(e.amount))}`;
      return e.type === 'sip'
        ? `SIP ${amt}/mo from ${fmtDate(e.date) || e.date}`
        : `Portfolio valuation of ${amt} added on ${fmtDate(e.date) || e.date}`;
    })
    .join('\n');
}

// Does this projection row contain a logged entry at all?
const hasContrib = (r) => !!(r.contributionsInRow && r.contributionsInRow.length > 0);
// A SIP change drives the Monthly SIP + Contribution underline …
const hasSipChange = (r) => !!(r.contributionsInRow && r.contributionsInRow.some(e => e.type === 'sip'));
// … while a portfolio valuation drives the Closing Bal underline (that's where it lands).
const hasValuation = (r) => !!(r.contributionsInRow && r.contributionsInRow.some(e => e.type === 'valuation'));

export default function GoalDetail({ goal, clientName, onBack, onEdit, onSaveContributions, isViewer }) {
  const c = calcGoal(goal);
  const projection = buildProjection(goal);
  const remainingLabel = c.years >= 1 ? `${c.years.toFixed(1)} years to go` : c.months > 0 ? `${c.months} months to go` : 'Due now';

  // Create Log — a ledger of real events (portfolio valuations / SIP changes)
  // that feed directly into the simulation above.
  // Reads `goal.contributions`, falling back to this CRM's legacy
  // `goal.actuals` rows so goals logged before the typed ledger still show
  // (and still calculate) — see goalContributions() in utils/calc.
  const contributions = goalContributions(goal);

  // Format data for Recharts — three lines: what the goal will cost (Target
  // Value, inflating over time), where the corpus actually is given every
  // logged entry (Current Value), and how much principal has gone in
  // (Invested Value). The series opens at the goal's CREATION month so the
  // chart shows the year the goal started from, not just the first period end.
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const chartData = projection.length === 0 ? [] : [
    {
      name: `${MONTH_NAMES[createdM - 1]} '${String(createdY).slice(2)}`,
      'Target Value': Math.round(Number(goal.amount) || 0),
      'Current Value': Math.round(c.startCorpus),
      'Invested Value': Math.round(c.startCorpus),
    },
    ...projection.map(r => ({
      name: r.chartName,
      'Target Value': Math.round(r.targetValue),
      'Current Value': Math.round(r.closingBal),
      'Invested Value': Math.round(r.totalInvested),
    })),
  ];

  // Custom Tooltip Formatter
  const formatTooltipValue = (value) => {
    return [fmtINR(value), null];
  };

  const achievementBarColor = (pct) => {
    if (pct >= 99.95) return 'bg-gradient-to-r from-emerald-500 to-teal-500';
    if (pct >= 60) return 'bg-gradient-to-r from-orange-400 to-amber-500';
    if (pct >= 30) return 'bg-gradient-to-r from-yellow-400 to-amber-500';
    return 'bg-gradient-to-r from-rose-500 to-red-600';
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors group cursor-pointer">
        <ChevronLeft size={16} className="transition-transform group-hover:translate-x-[-2px]" /> Back to {clientName}'s portfolio
      </button>

      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 flex items-center justify-center shrink-0 text-4xl select-none">
              {goalEmoji(goal.name)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{goal.name}</h2>
              {needsKidName(goal.name) && goal.kidName && (
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1.5">
                  <User size={13} /> Kid: {goal.kidName}
                </p>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-medium flex items-center flex-wrap gap-2">
                <span>Target {monthLabel(goal.targetMonth || 1, goal.targetYear)}</span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span>{remainingLabel}</span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="text-slate-400 dark:text-slate-500">Created {goalCreatedLabel(goal)}</span>
              </p>
            </div>
          </div>
          {!isViewer && (
            <button onClick={onEdit} className={btnSecondary + ' w-full sm:w-auto'}>
              <Pencil size={14} /> Edit Details
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          <Metric label="Goal cost (today)" value={fmtINR(goal.amount)} />
          <Metric label="Future value" value={fmtINR(c.futureValue)} />
          <Metric label="Additional SIP" value={fmtSip(c.additionalSip) + '/mo'} negative={c.additionalSip < 0} />
          <Metric label="Lump-sum required" value={fmtINR(c.lumpSumRequired)} />
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Goal Achievement with current plan</span>
            <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{c.achievementPct.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/20 dark:border-slate-900">
            <div className={`h-full transition-all duration-500 ${achievementBarColor(c.achievementPct)}`} style={{ width: `${Math.min(100, c.achievementPct)}%` }} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-medium">
            Projected corpus <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtINR(c.projectedCorpus)}</span> vs target future value <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtINR(c.futureValue)}</span>
            {c.shortfall > 0 && <> · shortfall <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmtINR(c.shortfall)}</span></>}
          </p>
          {(c.hasContributions || c.hasMappedAssets) && (
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2 font-semibold flex items-center gap-1.5">
              <Info size={12} />
              {c.hasContributions && c.hasMappedAssets
                ? 'Includes logged contributions and mapped assets in the calculation below.'
                : c.hasContributions
                  ? 'Includes logged contributions (see Create Log) in the calculation below.'
                  : `Includes ${fmtINR(c.startCorpus - (Number(goal.currentInv) || 0))} of mapped assets in the starting corpus.`}
            </p>
          )}
          {c.hasContributions && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
              Current effective SIP (incl. log) <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtSip(c.todayEffectiveSip)}/mo</span>
              {' + additional '}<span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtSip(c.additionalSip)}/mo</span>
              {' = '}<span className="font-bold text-slate-900 dark:text-white tabular-nums">{fmtSip(c.sipRequired)}/mo</span> needed from today forward
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs">
          <MiniStat icon={Percent} label="Inflation" value={`${goal.inflation}%`} />
          <MiniStat icon={TrendingUp} label="Expected return" value={`${goal.expectedReturn}%`} />
          <MiniStat icon={Calendar} label="SIP annual step-up" value={`${goal.sipIncRate}%`} />
          <MiniStat icon={IndianRupee} label="Starting corpus" value={fmtINR(c.startCorpus)} />
        </div>

        {c.hasMappedAssets && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Wallet size={12} /> Mapped Assets</p>
            <div className="flex flex-wrap gap-2">
              {goal.mappedAssets.map(a => (
                <span key={a.id || a.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200/50 dark:ring-blue-900/40 rounded-full">
                  {a.label} · {fmtINR(a.amount)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Visual Charts section */}
      {chartData.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider">Growth Projection Chart</h3>
          <Card className="p-6 border border-slate-200 dark:border-slate-800">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorClosing" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-balance)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--chart-balance)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-invested)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--chart-invested)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => {
                      if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
                      if (val >= 100000) return `${(val / 100000).toFixed(0)}L`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return val;
                    }}
                  />
                  <Tooltip
                    formatter={formatTooltipValue}
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg)',
                      borderColor: 'var(--tooltip-border)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: 'var(--tooltip-color)',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                    }}
                    labelClassName="font-bold text-slate-800 dark:text-slate-200"
                  />
                  <Area type="monotone" dataKey="Current Value" stroke="var(--chart-balance)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClosing)" />
                  <Area type="monotone" dataKey="Invested Value" stroke="var(--chart-invested)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorInvested)" />
                  <Area type="monotone" dataKey="Target Value" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 5" fill="none" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-6 mt-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-blue-500 dark:bg-indigo-500" />
                <span className="text-slate-600 dark:text-slate-400">Current Value (Projected Corpus)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-400 dark:bg-slate-600" />
                <span className="text-slate-600 dark:text-slate-400">Invested Value (Principal)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 border-t-2 border-dashed" style={{ borderColor: '#f59e0b' }} />
                <span className="text-slate-600 dark:text-slate-400">Target Value (Inflation-Adjusted Goal Cost)</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider">Year-by-year projection details</h3>
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Period</th>
                  <th className="text-right px-6 py-4 font-bold">Opening Bal</th>
                  <th className="text-right px-6 py-4 font-bold">Monthly SIP</th>
                  <th className="text-right px-6 py-4 font-bold">Contribution</th>
                  <th className="text-right px-6 py-4 font-bold">Estimated Growth</th>
                  <th className="text-right px-6 py-4 font-bold">Closing Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {projection.map((r, i) => (
                  <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors ${hasContrib(r) ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}`}>
                    <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {r.label}
                        {r.isPartial && (
                          <span
                            title={`Partial period — ${r.monthsCovered} ${r.monthsCovered === 1 ? 'month' : 'months'} of contributions (${r.label})`}
                            className="text-slate-400 hover:text-slate-650 cursor-help"
                          >
                            <Info size={13} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-650 dark:text-slate-350 tabular-nums">{fmtINR(r.openingBal)}</td>
                    <td className={`px-6 py-3.5 text-right tabular-nums ${hasSipChange(r) ? 'underline decoration-blue-500 decoration-2 underline-offset-4 text-blue-700 dark:text-blue-400' : 'text-slate-650 dark:text-slate-350'}`}>
                      {fmtSip(r.monthlySip)}
                    </td>
                    <td className="px-6 py-3.5 tabular-nums">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className={hasSipChange(r) ? 'underline decoration-blue-500 decoration-2 underline-offset-4 text-blue-700 dark:text-blue-400' : 'text-slate-650 dark:text-slate-350'}>
                          {fmtINR(r.yearContribution)}
                        </span>
                        <span className="w-[13px] shrink-0 inline-flex items-center justify-center">
                          {hasSipChange(r) && (
                            <span
                              title={contribRowHint(r.contributionsInRow, 'sip')}
                              className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-help"
                            >
                              <Info size={13} />
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{fmtINR(r.growth)}</td>
                    <td className="px-6 py-3.5 tabular-nums">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className={hasValuation(r) ? 'underline decoration-blue-500 decoration-2 underline-offset-4 text-blue-700 dark:text-blue-400 font-bold' : 'font-bold text-slate-900 dark:text-white'}>
                          {fmtINR(r.closingBal)}
                        </span>
                        <span className="w-[13px] shrink-0 inline-flex items-center justify-center">
                          {hasValuation(r) && (
                            <span
                              title={contribRowHint(r.contributionsInRow, 'valuation')}
                              className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-help"
                            >
                              <Info size={13} />
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
                {projection.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-10 text-slate-400 dark:text-slate-600">Target date is now or in the past</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <CreateLog contributions={contributions} onSave={onSaveContributions} isViewer={isViewer} />

      <ChangeLog history={goal.history} />
    </div>
  );
}

const CONTRIB_TYPES = [
  { id: 'valuation', label: 'Portfolio Valuation', hint: 'A portfolio value recorded on a date. The amount is added to the closing balance of the period it falls in, and compounds from there. Enter a minus sign to record a reduction. Only the most recent valuation counts — logging a new one supersedes any earlier ones (they stay visible below but no longer affect the calculation).' },
  { id: 'sip', label: 'SIP', hint: 'A permanent change to the ongoing monthly SIP from this date forward. Positive = increase, minus = decrease. Every future annual step-up applies to the new, updated SIP amount.' },
];

// "Create Log" — a ledger of real events (portfolio valuations / SIP changes)
// that feed directly into the simulation, not just chart annotations.
function CreateLog({ contributions, onSave, isViewer }) {
  const [editingId, setEditingId] = useState(null); // entry id, or 'new', or null
  const [type, setType] = useState('valuation');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const list = [...(contributions || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  // Only the latest portfolio valuation counts toward the calculation — earlier
  // ones are shown here for the record but marked superseded.
  const activeValId = activeValuationId(contributions);

  const startAdd = () => {
    setEditingId('new');
    setType('valuation');
    setDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setError('');
  };
  const startEdit = (e) => {
    setEditingId(e.id);
    setType(e.type === 'sip' ? 'sip' : 'valuation');
    setDate((e.date || '').slice(0, 10));
    setAmount(String(e.amount ?? ''));
    setError('');
  };
  const cancel = () => { setEditingId(null); setDate(''); setAmount(''); setError(''); };

  const fmtEntry = (t, d, a) => {
    const amt = Number(a) || 0;
    const sign = amt >= 0 ? '+' : '−';
    return `${t === 'sip' ? 'SIP' : 'Portfolio valuation'} ${sign}${fmtFull(Math.abs(amt))} on ${fmtDate(d) || d}`;
  };

  const save = () => {
    const amt = Number(amount);
    if (!date) { setError('Pick a date for this entry.'); return; }
    if (!isFinite(amt) || amt === 0) { setError('Enter a non-zero amount (use a minus sign to decrease).'); return; }
    let next, changes;
    if (editingId === 'new') {
      next = [...(contributions || []), { id: uid(), type, date, amount: amt }];
      changes = [{ label: 'Contribution logged', from: '—', to: fmtEntry(type, date, amt) }];
    } else {
      const prev = (contributions || []).find(x => x.id === editingId);
      next = (contributions || []).map(x => x.id === editingId ? { ...x, type, date, amount: amt } : x);
      changes = [{ label: 'Contribution edited', from: prev ? fmtEntry(prev.type, prev.date, prev.amount) : '—', to: fmtEntry(type, date, amt) }];
    }
    onSave(next, changes);
    cancel();
  };

  const remove = (id) => {
    if (!window.confirm('Delete this log entry? The calculation will update once removed.')) return;
    const prev = (contributions || []).find(x => x.id === id);
    const changes = prev ? [{ label: 'Contribution removed', from: fmtEntry(prev.type, prev.date, prev.amount), to: '—' }] : [];
    onSave((contributions || []).filter(x => x.id !== id), changes);
    if (editingId === id) cancel();
  };

  const EntryForm = (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
      <div className="w-full sm:w-44 space-y-1.5">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</label>
        <div className="relative">
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {CONTRIB_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </div>
      <div className="flex-1 space-y-1.5">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {type === 'sip' ? 'SIP Change (₹/mo)' : 'Valuation Amount (₹)'}
        </label>
        <input type="number" step="any" onWheel={(e) => e.target.blur()} value={amount} placeholder={type === 'sip' ? 'e.g. 5000 or -2000' : 'e.g. 100000 or -50000'} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={save} className={btnPrimary}><Check size={14} /> Save</button>
        <button onClick={cancel} className={btnSecondary}><X size={14} /> Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <ClipboardList size={16} /> Create Log
          <button
            onClick={() => setShowInfo(v => !v)}
            title="What is Lumpsum vs SIP?"
            className={`p-1 rounded-full transition-colors cursor-pointer ${showInfo ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400' : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'}`}
          >
            <Info size={13} />
          </button>
        </h3>
        {!isViewer && editingId === null && (
          <button onClick={startAdd} className={btnSecondary}><Plus size={14} /> Add Entry</button>
        )}
      </div>
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
        {showInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
            {CONTRIB_TYPES.map(t => (
              <div key={t.id} className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-3.5">
                <p className="text-xs font-black text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">{t.label}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{t.hint}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Log real portfolio valuations and SIP changes — every entry is applied to the calculation from its date forward, not just plotted on the chart.
          </p>
        )}

        {!isViewer && editingId === 'new' && EntryForm}
        {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        {list.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-4">
            No entries yet. {isViewer ? '' : 'Add an entry to record a real contribution change.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-3 py-3 font-bold">Date</th>
                  <th className="text-left px-3 py-3 font-bold">Type</th>
                  <th className="text-right px-3 py-3 font-bold">Amount</th>
                  {!isViewer && <th className="text-right px-3 py-3 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {list.map((e) => {
                  if (editingId === e.id) {
                    return (
                      <tr key={e.id}>
                        <td colSpan={isViewer ? 3 : 4} className="py-3">{EntryForm}</td>
                      </tr>
                    );
                  }
                  const amt = Number(e.amount) || 0;
                  const positive = amt >= 0;
                  const superseded = e.type !== 'sip' && e.id !== activeValId;
                  return (
                    <tr key={e.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors ${superseded ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{fmtDate(e.date) || e.date}</td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full ${e.type === 'sip'
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/50 dark:ring-indigo-900/40'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-900/40'}`}>
                            {e.type === 'sip' ? 'SIP' : 'Portfolio Valuation'}
                          </span>
                          {superseded && (
                            <span title="A newer portfolio valuation exists — this one no longer affects the calculation" className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/50 dark:ring-slate-700/50 cursor-help">
                              Superseded
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`px-3 py-3.5 text-right font-bold tabular-nums ${superseded ? 'text-slate-400 dark:text-slate-500' : positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {positive ? '+' : '−'}{fmtFull(Math.abs(amt))}{e.type === 'sip' ? '/mo' : ''}
                      </td>
                      {!isViewer && (
                        <td className="px-3 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => startEdit(e)} title="Edit" className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => remove(e.id)} title="Delete" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function fmtLogStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${fmtDate(iso)} · ${time}`;
}

function ChangeLog({ history }) {
  const entries = Array.isArray(history) ? [...history].reverse() : [];

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-slate-800 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
        <History size={16} /> Edit History
      </h3>
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-4">
            No edits yet. Any change to this goal's parameters will be logged here.
          </p>
        ) : (
          <ol className="space-y-5">
            {entries.map((entry, i) => (
              <li key={i} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800">
                <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-blue-500 dark:bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  {fmtLogStamp(entry.at)}{entry.by && <span className="text-blue-500 dark:text-blue-400 ml-1.5">• {entry.by}</span>}
                </p>
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

function Metric({ label, value, pill, highlight, negative }) {
  return (
    <Card className={`p-5 hover:translate-y-[-1px] duration-300 border ${highlight ? 'border-blue-200 dark:border-blue-900/60 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 dark:from-slate-900 dark:to-slate-850' : negative ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10' : 'border-slate-200/60 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40'}`}>
      <p className={`text-[10px] font-bold mb-2 uppercase tracking-wider ${negative ? 'text-rose-500 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>{label}</p>
      {pill ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-450 ring-1 ring-emerald-250/50 dark:ring-emerald-900/50 rounded-full">
          <CheckCircle2 size={11} /> {pill}
        </span>
      ) : (
        <p className={`text-base font-bold tabular-nums ${negative ? 'text-rose-600 dark:text-rose-400' : highlight ? 'text-blue-800 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>{value}</p>
      )}
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-450 border border-slate-200/30 dark:border-slate-800 flex items-center justify-center shrink-0">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">{label}</p>
        <p className="font-bold text-slate-900 dark:text-white tabular-nums truncate text-xs mt-0.5">{value}</p>
      </div>
    </div>
  );
}
