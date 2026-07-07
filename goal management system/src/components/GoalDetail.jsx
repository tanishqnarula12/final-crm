import React, { useState } from 'react';
import {
  ChevronLeft, Pencil, Percent, TrendingUp, Calendar, IndianRupee, Info, CheckCircle2, History, ArrowRight, User,
  Plus, Trash2, Check, X, TrendingDown, ClipboardList
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Card, btnSecondary, btnPrimary, btnGhost, inputCls } from './UI';
import {
  calcGoal, buildProjection, monthLabel, fmtINR, fmtSip, goalIcon, goalEmoji, achievementColor, MONTH_NAMES, goalCreatedLabel, needsKidName, fmtDate, uid
} from '../utils/calc';

export default function GoalDetail({ goal, clientName, onBack, onEdit, onSaveActuals, isViewer }) {
  const c = calcGoal(goal);
  const projection = buildProjection(goal);
  const remainingLabel = c.years >= 1 ? `${c.years.toFixed(1)} years to go` : c.months > 0 ? `${c.months} months to go` : 'Due now';

  // Logged actual portfolio values ("Create Log")
  const actuals = Array.isArray(goal.actuals) ? goal.actuals : [];

  // Quick lookup of each projection year's opening/closing balance, to compare actuals against
  const projByYear = new Map();
  projection.forEach(r => projByYear.set(r.year, r));

  // Projected corpus interpolated to the exact date of a logged entry (opening → closing across the year)
  const projAt = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const r = projByYear.get(d.getFullYear());
    if (!r) return null;
    const frac = Math.min(1, Math.max(0, (d.getMonth() + 1) / 12));
    return r.openingBal + (r.closingBal - r.openingBal) * frac;
  };

  // Keep only the latest logged value per year for plotting (one point per x-axis tick)
  const actualByYear = new Map();
  actuals.forEach(a => {
    const d = new Date(a.date);
    if (isNaN(d.getTime())) return;
    const y = d.getFullYear();
    const prev = actualByYear.get(y);
    if (!prev || new Date(a.date) > new Date(prev.date)) actualByYear.set(y, a);
  });

  // Overall standing = where the most recent logged value sits vs its projection (drives line + shadow colour)
  const latestActual = actuals.length
    ? [...actuals].sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null;
  let aheadOverall = true;
  if (latestActual) {
    const proj = projAt(latestActual.date);
    if (proj != null) aheadOverall = (Number(latestActual.amount) || 0) >= proj;
  }
  const actualColor = aheadOverall ? '#10b981' : '#ef4444';
  const actualFill = aheadOverall ? 'url(#colorActualUp)' : 'url(#colorActualDown)';

  const hasActuals = actualByYear.size > 0;
  const startYear = projection.length ? projection[0].year : null;
  const startCorpus = Number(goal.currentInv) || 0;

  // Format data for Recharts
  const chartData = projection.map(r => {
    const row = {
      name: String(r.year),
      'Closing Balance': Math.round(r.closingBal),
      'Total Invested': Math.round(r.totalInvested)
    };
    const a = actualByYear.get(r.year);
    if (a) {
      const proj = projAt(a.date);
      row['Actual'] = Math.round(Number(a.amount) || 0);
      row['ActualProj'] = proj != null ? Math.round(proj) : null;
      row['ActualIsEntry'] = true;
    } else if (hasActuals && r.year === startYear) {
      // Synthetic origin so the dotted actual line starts from the current corpus, just like the projected line
      row['Actual'] = Math.round(startCorpus);
      row['ActualProj'] = Math.round(r.openingBal);
    }
    return row;
  });

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
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs">
          <MiniStat icon={Percent} label="Inflation" value={`${goal.inflation}%`} />
          <MiniStat icon={TrendingUp} label="Expected return" value={`${goal.expectedReturn}%`} />
          <MiniStat icon={Calendar} label="SIP annual step-up" value={`${goal.sipIncRate}%`} />
          <MiniStat icon={IndianRupee} label="Current corpus" value={fmtINR(goal.currentInv)} />
        </div>
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
                    <linearGradient id="colorActualUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorActualDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
                  <Area type="monotone" dataKey="Closing Balance" stroke="var(--chart-balance)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClosing)" />
                  <Area type="monotone" dataKey="Total Invested" stroke="var(--chart-invested)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorInvested)" />
                  {hasActuals && (
                    <Area
                      type="monotone"
                      dataKey="Actual"
                      stroke={actualColor}
                      strokeWidth={2.5}
                      strokeDasharray="6 5"
                      fillOpacity={1}
                      fill={actualFill}
                      connectNulls
                      isAnimationActive={false}
                      dot={<ActualDot />}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-6 mt-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-blue-500 dark:bg-indigo-500" />
                <span className="text-slate-600 dark:text-slate-400">Closing Balance (Projected Corpus)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-400 dark:bg-slate-600" />
                <span className="text-slate-600 dark:text-slate-400">Total Invested Principal</span>
              </div>
              {hasActuals && (
                <div className="flex items-center gap-2">
                  <div className="w-5 border-t-2 border-dashed" style={{ borderColor: actualColor }} />
                  <span className="text-slate-600 dark:text-slate-400">
                    Actual Logged Value (<span className="text-emerald-600 dark:text-emerald-400">ahead</span> / <span className="text-rose-600 dark:text-rose-400">behind</span> plan)
                  </span>
                </div>
              )}
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
                  <th className="text-left px-6 py-4 font-bold">Year</th>
                  <th className="text-right px-6 py-4 font-bold">Opening Bal</th>
                  <th className="text-right px-6 py-4 font-bold">Monthly SIP</th>
                  <th className="text-right px-6 py-4 font-bold">Contribution</th>
                  <th className="text-right px-6 py-4 font-bold">Estimated Growth</th>
                  <th className="text-right px-6 py-4 font-bold">Closing Bal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {projection.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {r.year}
                        {r.isPartial && (
                          <span
                            title={`Calculated months: ${MONTH_NAMES[r.firstMonth - 1]}${r.firstMonth === r.lastMonth ? '' : '–' + MONTH_NAMES[r.lastMonth - 1]} ${r.year} (${r.monthsCovered} ${r.monthsCovered === 1 ? 'month' : 'months'})`}
                            className="text-slate-400 hover:text-slate-650 cursor-help"
                          >
                            <Info size={13} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-650 dark:text-slate-350 tabular-nums">{fmtINR(r.openingBal)}</td>
                    <td className="px-6 py-3.5 text-right text-slate-650 dark:text-slate-350 tabular-nums">{fmtSip(r.monthlySip)}</td>
                    <td className="px-6 py-3.5 text-right text-slate-650 dark:text-slate-350 tabular-nums">{fmtINR(r.yearContribution)}</td>
                    <td className="px-6 py-3.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{fmtINR(r.growth)}</td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-900 dark:text-white tabular-nums">{fmtINR(r.closingBal)}</td>
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

      <CreateLog actuals={actuals} projAt={projAt} onSave={onSaveActuals} isViewer={isViewer} />

      <ChangeLog history={goal.history} />
    </div>
  );
}

// Per-point dot on the chart's actual line: green when at/above the projected corpus, red when below
function ActualDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || !payload.ActualIsEntry) return null;
  const proj = payload.ActualProj;
  const ahead = proj == null || payload.Actual >= proj;
  const color = ahead ? '#10b981' : '#ef4444';
  return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#fff" strokeWidth={1.75} />;
}

// "Create Log" — record actual portfolio values (amount + date) that overlay onto the growth chart.
function CreateLog({ actuals, projAt, onSave, isViewer }) {
  const [editingId, setEditingId] = useState(null); // entry id, or 'new', or null
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const list = [...(actuals || [])].sort((a, b) => new Date(a.date) - new Date(b.date));

  const startAdd = () => {
    setEditingId('new');
    setDate(new Date().toISOString().slice(0, 10));
    setAmount('');
    setError('');
  };
  const startEdit = (e) => {
    setEditingId(e.id);
    setDate((e.date || '').slice(0, 10));
    setAmount(String(e.amount ?? ''));
    setError('');
  };
  const cancel = () => { setEditingId(null); setDate(''); setAmount(''); setError(''); };

  const fmtEntry = (d, a) => `${fmtDate(d) || d}: ${fmtINR(Number(a) || 0)}`;

  const save = () => {
    const amt = Number(amount);
    if (!date) { setError('Pick a date for this entry.'); return; }
    if (!isFinite(amt) || amt < 0) { setError('Enter a valid amount.'); return; }
    let next, changes;
    if (editingId === 'new') {
      next = [...(actuals || []), { id: uid(), date, amount: amt }];
      changes = [{ label: 'Create Log entry added', from: '—', to: fmtEntry(date, amt) }];
    } else {
      const prev = (actuals || []).find(x => x.id === editingId);
      next = (actuals || []).map(x => x.id === editingId ? { ...x, date, amount: amt } : x);
      changes = [{ label: 'Create Log entry edited', from: prev ? fmtEntry(prev.date, prev.amount) : '—', to: fmtEntry(date, amt) }];
    }
    onSave(next, changes);
    cancel();
  };

  const remove = (id) => {
    if (!window.confirm('Delete this log entry?')) return;
    const prev = (actuals || []).find(x => x.id === id);
    const changes = prev ? [{ label: 'Create Log entry removed', from: fmtEntry(prev.date, prev.amount), to: '—' }] : [];
    onSave((actuals || []).filter(x => x.id !== id), changes);
    if (editingId === id) cancel();
  };

  const EntryForm = (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
      <div className="flex-1 space-y-1.5">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </div>
      <div className="flex-1 space-y-1.5">
        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actual Amount (₹)</label>
        <input type="number" min="0" step="any" value={amount} placeholder="e.g. 1250000" onChange={(e) => setAmount(e.target.value)} className={inputCls} />
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
        </h3>
        {!isViewer && editingId === null && (
          <button onClick={startAdd} className={btnSecondary}><Plus size={14} /> Add Entry</button>
        )}
      </div>
      <Card className="p-6 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Log the actual value of this goal's portfolio on any date. Each entry is plotted on the Growth Projection Chart as a dotted line —
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> green</span> when it beats the projected corpus,
          <span className="text-rose-600 dark:text-rose-400 font-semibold"> red</span> when it falls short.
        </p>

        {!isViewer && editingId === 'new' && EntryForm}
        {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        {list.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 font-medium text-center py-4">
            No entries yet. {isViewer ? '' : 'Add an entry to track actual progress against the plan.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-3 py-3 font-bold">Date</th>
                  <th className="text-right px-3 py-3 font-bold">Actual Amount</th>
                  <th className="text-right px-3 py-3 font-bold">Projected</th>
                  <th className="text-center px-3 py-3 font-bold">Status</th>
                  {!isViewer && <th className="text-right px-3 py-3 font-bold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {list.map((e) => {
                  if (editingId === e.id) {
                    return (
                      <tr key={e.id}>
                        <td colSpan={isViewer ? 4 : 5} className="py-3">{EntryForm}</td>
                      </tr>
                    );
                  }
                  const proj = projAt(e.date);
                  const amt = Number(e.amount) || 0;
                  const ahead = proj == null || amt >= proj;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-3 py-3.5 font-semibold text-slate-900 dark:text-slate-100">{fmtDate(e.date) || e.date}</td>
                      <td className="px-3 py-3.5 text-right font-bold text-slate-900 dark:text-white tabular-nums">{fmtINR(amt)}</td>
                      <td className="px-3 py-3.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">{proj == null ? '—' : fmtINR(proj)}</td>
                      <td className="px-3 py-3.5 text-center">
                        {proj == null ? (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full ${ahead
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-900/40'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 ring-1 ring-rose-200/50 dark:ring-rose-900/40'}`}>
                            {ahead ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {ahead ? 'Ahead' : 'Behind'}
                          </span>
                        )}
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
