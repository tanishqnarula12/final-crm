import React from 'react';
import { Target, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { Card, Avatar, btnSecondary } from './UI';
import { goalIcon, goalEmoji, calcGoal, monthLabel, fmtINR, fmtSip, achievementBadge, needsKidName } from '../utils/calc';

export function GoalsOverview({ goalGroups, onSelect }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Goal Categories Summary</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{goalGroups.length} unique financial goals defined across all clients</p>
      </div>
      {goalGroups.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <Target className="mx-auto text-slate-400 dark:text-slate-500 mb-3" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No client goals defined yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goalGroups.map(g => {
            return (
              <Card 
                key={g.name} 
                className="p-5 border border-slate-200/60 dark:border-slate-800/80 hover:shadow-lg dark:hover:shadow-none hover:border-blue-300 dark:hover:border-blue-900/60 hover:scale-[1.01] transition-all duration-300 group cursor-pointer" 
              >
                <div onClick={() => onSelect(g.name)} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 flex items-center justify-center shrink-0 text-2xl select-none">
                      {goalEmoji(g.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{g.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{g.count} {g.count === 1 ? 'portfolio profile' : 'portfolio profiles'}</p>
                    </div>
                  </div>
                  <span className="text-3xl font-black text-blue-600 dark:text-indigo-400 name-count tabular-nums pr-1 opacity-80 group-hover:opacity-100 transition-opacity">{g.count}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GoalGroupDetail({ groupName, entries, onBack, onSelectClient }) {
  const showKidName = needsKidName(groupName);
  return (
    <div className="space-y-6 animate-scale-up">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors group cursor-pointer">
        <ChevronLeft size={16} className="transition-transform group-hover:translate-x-[-2px]" /> Back to overview
      </button>

      <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 bg-gradient-to-r from-blue-50/20 to-sky-50/20 dark:from-slate-900 dark:to-slate-850">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 flex items-center justify-center shrink-0 text-3xl select-none">
            {goalEmoji(groupName)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{groupName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{entries.length} {entries.length === 1 ? 'client portfolio has' : 'client portfolios have'} this goal configured</p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 font-bold">Client Name</th>
                {showKidName && <th className="text-left px-6 py-4 font-bold">Kid Name</th>}
                <th className="text-right px-6 py-4 font-bold">Target Date</th>
                <th className="text-right px-6 py-4 font-bold">Goal cost (today)</th>
                <th className="text-right px-6 py-4 font-bold">Additional SIP needed</th>
                <th className="text-right px-6 py-4 font-bold">Projected progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {entries.map(e => {
                const c = calcGoal(e.goal);
                return (
                  <tr key={e.id + e.goal.id} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors" onClick={() => onSelectClient(e.id)}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} size="sm" />
                        <span className="font-bold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{e.name}</span>
                      </div>
                    </td>
                    {showKidName && (
                      <td className="px-6 py-3.5 text-left">
                        {e.goal.kidName
                          ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">{e.goal.kidName}</span>
                          : <span className="text-slate-400 dark:text-slate-600">—</span>}
                      </td>
                    )}
                    <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-400 tabular-nums">{monthLabel(e.goal.targetMonth || 1, e.goal.targetYear)}</td>
                    <td className="px-6 py-3.5 text-right text-slate-600 dark:text-slate-400 tabular-nums font-medium">{fmtINR(e.goal.amount)}</td>
                    <td className="px-6 py-3.5 text-right">
                      {c.sipOnTrack ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20 dark:ring-emerald-900/30 rounded-full">
                          <CheckCircle2 size={11} /> On track
                        </span>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300 tabular-nums font-bold">{fmtSip(c.additionalSip)}/mo</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full ${achievementBadge(c.achievementPct)}`}>
                        {c.achievementPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
