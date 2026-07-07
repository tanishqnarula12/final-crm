import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Card, Avatar, Field, selectCls, CoolSelect } from './UI';
import { goalEmoji, monthLabel, fmtINR, fmtSip, achievementBadge, CURRENT_MONTH, CURRENT_YEAR } from '../utils/calc';

export default function ReportsView({ goalNames, goalFilter, setGoalFilter, timeframe, setTimeframe, rows, onOpenClient }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Planning & Timeline Reports</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">Track and filter client portfolio goals grouped by chronological target dates</p>
      </div>

      <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Goal Category Filter">
            <div className="relative">
              <CoolSelect value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className={selectCls}>
                <option value="all">All Goal Categories</option>
                {goalNames.map(n => <option key={n} value={n}>{n}</option>)}
              </CoolSelect>
            </div>
          </Field>
          <Field label="Target Time Horizon">
            <div className="relative">
              <CoolSelect value={timeframe} onChange={(e) => setTimeframe(Number(e.target.value))} className={selectCls}>
                <option value={1}>1 Year Horizon</option>
                <option value={3}>3 Years Horizon</option>
                <option value={5}>5 Years Horizon</option>
                <option value={10}>10 Years Horizon</option>
                <option value={15}>15 Years Horizon</option>
                <option value={20}>20 Years Horizon</option>
                <option value={50}>All timeframes</option>
              </CoolSelect>
            </div>
          </Field>
        </div>
      </Card>

      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
        Found {rows.length} {rows.length === 1 ? 'goal target' : 'goal targets'} due on or before <span className="font-bold text-slate-800 dark:text-slate-200 underline decoration-blue-500/40 decoration-2">{monthLabel(CURRENT_MONTH, CURRENT_YEAR + timeframe)}</span>
      </p>

      <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 font-bold">Client Profile</th>
                <th className="text-left px-6 py-4 font-bold">Goal Target</th>
                <th className="text-right px-6 py-4 font-bold">Target Month</th>
                <th className="text-right px-6 py-4 font-bold">Time Horizon</th>
                <th className="text-right px-6 py-4 font-bold">Future Cost</th>
                <th className="text-right px-6 py-4 font-bold">Additional SIP needed</th>
                <th className="text-right px-6 py-4 font-bold">Plan Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {rows.map((r, i) => {
                return (
                  <tr key={i} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => onOpenClient(r.clientId)}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.clientName} size="sm" />
                        <span className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{r.clientName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700 dark:text-slate-350 font-bold">
                      <div className="flex items-center gap-2">
                        <span className="text-base select-none shrink-0">{goalEmoji(r.goal.name)}</span>
                        <span>{r.goal.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-400 tabular-nums font-medium">{monthLabel(r.goal.targetMonth || 1, r.goal.targetYear)}</td>
                    <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-400 tabular-nums font-medium">{r.calc.years >= 1 ? `${r.calc.years.toFixed(1)} yrs` : `${r.calc.months} mo`}</td>
                    <td className="px-6 py-3.5 text-right text-slate-900 dark:text-slate-100 tabular-nums font-bold">{fmtINR(r.calc.futureValue)}</td>
                    <td className="px-6 py-3.5 text-right">
                      {r.calc.sipOnTrack ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20 dark:ring-emerald-900/30 rounded-full animate-fade-in">
                          <CheckCircle2 size={11} /> On track
                        </span>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300 tabular-nums font-bold">{fmtSip(r.calc.additionalSip)}/mo</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full ${achievementBadge(r.calc.achievementPct)}`}>
                        {r.calc.achievementPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-16 text-slate-400 dark:text-slate-600">
                    No client goals match the chosen timeline or category filters
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
