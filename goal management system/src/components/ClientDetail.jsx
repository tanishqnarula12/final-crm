import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download, Plus, Target, Trash2, Pencil, FileText, RefreshCw, CheckCircle2, Save, TrendingUp, IndianRupee,
  Users, Briefcase, Shield, Heart, User
} from 'lucide-react';
import { 
  Avatar, Card, btnPrimary, btnSecondary, btnGhost, inputCls 
} from './UI';
import {
  calcGoal, fmtINR, fmtFull, fmtSip, goalIcon, goalEmoji, achievementColor, generateAssumptionsText, refreshAssumptionsText, monthLabel, goalCreatedLabel, needsKidName, fmtDate
} from '../utils/calc';
import { exportClientPdf } from '../utils/pdf';
import { teamName } from '../services/team';

// Theme mapper for different categories of wealth goals (Minimal & Premium edition)
const getGoalTheme = (name) => {
  const n = name.toLowerCase();
  if (n.includes('freedom') || n.includes('wealth') || n.includes('creation') || n.includes('saving') || n.includes('fund')) {
    return {
      cardBg: 'bg-indigo-50/60 dark:bg-indigo-950/30',
      border: 'border-indigo-200/60 dark:border-indigo-900/30 hover:border-indigo-300 dark:hover:border-indigo-700',
      primaryText: 'text-indigo-950 dark:text-indigo-200',
      titleHover: 'group-hover:text-indigo-700 dark:group-hover:text-indigo-300'
    };
  }
  if (n.includes('education') || n.includes('kids') || n.includes('marriage') || n.includes('gift') || n.includes('wedding')) {
    return {
      cardBg: 'bg-emerald-50/60 dark:bg-emerald-950/30',
      border: 'border-emerald-200/60 dark:border-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700',
      primaryText: 'text-emerald-950 dark:text-emerald-200',
      titleHover: 'group-hover:text-emerald-700 dark:group-hover:text-emerald-300'
    };
  }
  if (n.includes('home') || n.includes('car') || n.includes('dream') || n.includes('house') || n.includes('vacation') || n.includes('plane') || n.includes('travel')) {
    return {
      cardBg: 'bg-amber-50/60 dark:bg-amber-950/30',
      border: 'border-amber-200/60 dark:border-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700',
      primaryText: 'text-amber-950 dark:text-amber-200',
      titleHover: 'group-hover:text-amber-700 dark:group-hover:text-amber-300'
    };
  }
  if (n.includes('emergency') || n.includes('shield') || n.includes('crisis') || n.includes('medical') || n.includes('health')) {
    return {
      cardBg: 'bg-rose-50/60 dark:bg-rose-950/30',
      border: 'border-rose-200/60 dark:border-rose-900/30 hover:border-rose-300 dark:hover:border-rose-700',
      primaryText: 'text-rose-950 dark:text-rose-200',
      titleHover: 'group-hover:text-rose-700 dark:group-hover:text-rose-300'
    };
  }
  // Default
  return {
    cardBg: 'bg-slate-50/60 dark:bg-slate-900/50',
    border: 'border-slate-200/60 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700',
    primaryText: 'text-slate-900 dark:text-white',
    titleHover: 'group-hover:text-blue-600 dark:group-hover:text-blue-400'
  };
};

export default function ClientDetail({ client, totals, onAddGoal, onSelectGoal, onDeleteGoal, onSaveAssumptions, onEditClient, isViewer }) {
  const containerRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [includeProjection, setIncludeProjection] = useState(false);
  const [subTab, setSubTab] = useState('goals'); // 'goals' or 'profile'

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportClientPdf(containerRef.current, client, includeProjection);
    } catch (err) {
      alert('Could not generate PDF: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-6 animate-fade-in">
      {/* Client Summary Header */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 rounded-[24px]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={client.name} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{client.name}</h2>
                {!isViewer && (
                  <button
                    onClick={onEditClient}
                    title="Edit client details"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all cursor-pointer"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-medium flex items-center gap-2">
                <span className="font-mono tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-lg text-xs border border-slate-200/40 dark:border-slate-700/40">{client.pan}</span>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span>{client.age || '—'} years old</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button onClick={handleExport} disabled={exporting} className={btnSecondary + ' flex-1 md:flex-none'}>
              <Download size={14} className={exporting ? 'animate-bounce' : ''} /> {exporting ? 'Generating…' : 'Export PDF'}
            </button>
            <button
              onClick={() => setIncludeProjection(v => !v)}
              title="Toggle Year-by-year projection tables in exported PDF"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex-1 md:flex-none cursor-pointer ${
                includeProjection
                  ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/40'
                  : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              <TrendingUp size={12} /> {includeProjection ? 'Projections: On' : 'Projections: Off'}
            </button>
            {!isViewer && (
              <button onClick={onAddGoal} className={btnPrimary + ' flex-1 md:flex-none'}>
                <Plus size={14} /> Add goal
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100/80 dark:bg-slate-950/40 rounded-xl max-w-md mt-2 shadow-inner border border-slate-200/20 dark:border-slate-800/40">
        <button
          type="button"
          onClick={() => setSubTab('goals')}
          className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            subTab === 'goals'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm font-extrabold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-750'
          }`}
        >
          Goals & Portfolio
        </button>
        <button
          type="button"
          onClick={() => setSubTab('profile')}
          className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            subTab === 'profile'
              ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm font-extrabold'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-750'
          }`}
        >
          CRM & Profile Details
        </button>
      </div>

      {subTab === 'goals' ? (
        <div className="space-y-6 animate-fade-in">
          {client.goals && client.goals.length > 0 && (
            <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 rounded-[28px] space-y-6">
              {/* SIP Summary Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2.5 border-l-2 border-blue-500 dark:border-blue-400 leading-none">SIP Allocation Matrix</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SummaryTile label="Current SIP Allocation" value={fmtSip(totals.totalCurrentSip) + '/mo'} icon={TrendingUp} accent="blue" />
                  <SummaryTile label="Additional SIP Required" value={fmtSip(totals.totalAdditional) + '/mo'} icon={Plus} accent="indigo" />
                  <SummaryTile label="Total Monthly SIP Needed" value={fmtSip(totals.totalCurrentSip + totals.totalAdditional) + '/mo'} icon={CheckCircle2} accent="emerald" />
                </div>
              </div>

              {/* Lump-sum Summary Section */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2.5 border-l-2 border-emerald-500 dark:border-emerald-400 leading-none">Lump-sum Equivalent</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SummaryTile label="Lump-sum Equivalent Today" value={fmtFull(totals.totalLump)} icon={IndianRupee} accent="emerald" />
                </div>
              </div>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Goals Summary ({client.goals ? client.goals.length : 0})</h3>
          </div>

          {!client.goals || client.goals.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800 rounded-3xl">
              <Target className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">No goals configured yet for this client portfolio</p>
              <button onClick={onAddGoal} className={btnSecondary}>
                <Plus size={14} /> Create the first goal
              </button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...client.goals].sort((a, b) =>
                (a.targetYear * 12 + (a.targetMonth || 1)) - (b.targetYear * 12 + (b.targetMonth || 1))
              ).map(g => {
                const c = calcGoal(g);
                const theme = getGoalTheme(g.name);
                return (
                  <div 
                    key={g.id} 
                    onClick={() => onSelectGoal(g.id)}
                    className={`p-6 ${theme.cardBg} rounded-[28px] border ${theme.border} shadow-md shadow-slate-100/80 dark:shadow-none transition-all duration-300 hover:scale-[1.015] hover:-translate-y-1.5 active:scale-[0.99] group cursor-pointer hover:shadow-xl hover:shadow-slate-200/40 dark:hover:shadow-none space-y-4`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 text-3xl select-none">
                          {goalEmoji(g.name)}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-bold ${theme.primaryText} truncate text-base ${theme.titleHover} transition-colors tracking-tight`}>
                            {g.name}
                          </h4>
                          {needsKidName(g.name) && g.kidName && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                              Kid: {g.kidName}
                            </p>
                          )}
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-bold uppercase tracking-wider text-[10px]">
                            Target {monthLabel(g.targetMonth || 1, g.targetYear)}
                            {c.years > 0 && ` · ${c.years >= 1 ? `${c.years.toFixed(1)} yrs` : `${c.months} mo`}`}
                          </p>
                          <p className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">
                            Created {goalCreatedLabel(g)}
                          </p>
                        </div>
                      </div>
                      {!isViewer && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteGoal(g.id); }}
                          className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 p-2 rounded-xl hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100 cursor-pointer active:scale-95"
                          title="Delete goal"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Achievement Progress</span>
                        <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{c.achievementPct.toFixed(1)}%</span>
                      </div>
                      <div className="h-3.5 bg-slate-200/50 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/20 dark:border-slate-900 shadow-inner">
                        <div className={`h-full rounded-full transition-all duration-500 ${achievementColor(c.achievementPct)}`} style={{ width: `${Math.min(100, c.achievementPct)}%` }} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 border-t border-slate-200/20 dark:border-slate-800/50 pt-4">
                      <KV label="Goal cost (today)" value={fmtINR(g.amount)} />
                      <KV label="Future value" value={fmtINR(c.futureValue)} />
                      <KV label="Current corpus" value={fmtINR(g.currentInv)} />
                      <KV label="Current SIP" value={fmtSip(g.currentSip) + '/mo'} />
                      <KV label="Total SIP needed" value={fmtSip(c.sipRequired) + '/mo'} highlight />
                      <KV label="Additional SIP" value={fmtSip(c.additionalSip) + '/mo'} highlight negative={c.additionalSip < 0} />
                      <div className="col-span-2">
                        <KV label="Lump-sum equivalent required today" value={fmtINR(c.lumpSumRequired)} isLump />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6">
            <AssumptionsSection client={client} onSave={onSaveAssumptions} isViewer={isViewer} />
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <ClientDetailsCard client={client} />
        </div>
      )}
    </div>
  );
}

const getQualitativeNotes = (text, client) => {
  if (!text) return '';
  const fresh = generateAssumptionsText(client);
  if (text.trim() === fresh.trim()) return '';
  
  // Try to remove the fresh block
  let cleaned = text.replace(fresh, '').trim();
  
  // If the fresh block didn't match perfectly, strip lines matching headers or bullets
  if (cleaned.includes('Inflation rate:') || cleaned.includes('Expected return:') || cleaned.includes('SIP step-up rate:')) {
    cleaned = cleaned.split('\n')
      .filter(line => {
        const l = line.trim();
        return !l.startsWith('•') && 
               !l.startsWith('*') && 
               !l.startsWith('-') && 
               !l.startsWith('Inflation rate') && 
               !l.startsWith('Expected return') && 
               !l.startsWith('SIP step-up rate');
      })
      .join('\n')
      .trim();
  }
  return cleaned;
};

function AssumptionsSection({ client, onSave, isViewer }) {
  const savedText = client.assumptions;
  const hasSaved = typeof savedText === 'string' && savedText.length > 0;
  const generated = useMemo(() => generateAssumptionsText(client), [client]);
  const displayText = hasSaved ? savedText : generated;

  const notesOnly = useMemo(() => {
    return getQualitativeNotes(displayText, client);
  }, [displayText, client]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notesOnly);

  useEffect(() => {
    if (!editing) {
      setDraft(getQualitativeNotes(displayText, client));
    }
  }, [displayText, editing, client]);

  const startEdit = () => {
    setDraft(getQualitativeNotes(displayText, client));
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
  };
  const save = () => {
    const fresh = generateAssumptionsText(client);
    const combined = draft.trim() ? `${fresh}\n\n${draft.trim()}` : fresh;
    onSave(combined);
    setEditing(false);
  };

  return (
    <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100/40 dark:border-blue-900/30 flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Planning Assumptions</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Growth and forecasting guidelines used for portfolio projections</p>
          </div>
        </div>
        {!editing && !isViewer && (
          <button onClick={startEdit} className={btnSecondary}>
            <Pencil size={14} /> Edit Notes
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-5">
          {client.goals && client.goals.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Quantitative Rates Matrix</h4>
              <div className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-950/50 shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80">
                    <tr>
                      <th className="text-left px-5 py-3 font-bold">Goal Category</th>
                      <th className="text-right px-5 py-3 font-bold">Inflation</th>
                      <th className="text-right px-5 py-3 font-bold">Exp. Return</th>
                      <th className="text-right px-5 py-3 font-bold">SIP Step-Up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                    {client.goals.map(g => (
                      <tr key={g.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg select-none">{goalEmoji(g.name)}</span>
                            <span className="font-bold text-slate-900 dark:text-white">{g.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 ring-1 ring-rose-200/40 dark:ring-rose-900/20 text-xs font-bold">
                            {g.inflation}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-200/40 dark:ring-emerald-900/20 text-xs font-bold">
                            {g.expectedReturn}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200/40 dark:ring-blue-900/20 text-xs font-bold">
                            {g.sipIncRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-450 dark:text-slate-500 font-sans italic">
              No financial goals configured yet. Projections and rates will display once goals are added.
            </div>
          )}

          <div className="space-y-2.5">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Qualitative Planning Notes</h4>
            {notesOnly ? (
              <div className="rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200/50 dark:border-slate-800/80 px-5 py-4 text-sm text-slate-700 dark:text-slate-350 whitespace-pre-wrap leading-relaxed font-sans shadow-inner">
                {notesOnly}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50/30 dark:bg-slate-950/20 border border-dashed border-slate-200 dark:border-slate-800 px-5 py-5 text-center text-xs text-slate-400 dark:text-slate-500 font-sans italic">
                No customized planning notes saved yet. Click "Edit Notes" to add custom commentary, recommendations, or planning disclaimers.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Edit Planning Notes</h4>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 italic">Quantitative rates are synced automatically</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className={inputCls + ' font-sans leading-relaxed resize-y focus:ring-blue-500'}
            placeholder="Enter advisor notes, disclaimers, or qualitative assumptions here..."
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-850">
            <button onClick={cancel} className={btnGhost}>Cancel</button>
            <button onClick={save} className={btnPrimary}>
              <Save size={14} /> Save notes
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryTile({ label, value, icon: Icon, accent }) {
  const accents = {
    blue: 'bg-blue-50/60 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/40 shadow-sm',
    indigo: 'bg-indigo-50/60 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40 shadow-sm',
    emerald: 'bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40 shadow-sm',
  };
  return (
    <div className={`rounded-2xl ${accents[accent]} p-5 flex items-start justify-between border border-transparent transition-all duration-300`}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-75 mb-2">{label}</p>
        <p className="text-xl font-bold tracking-tight tabular-nums truncate">{value}</p>
      </div>
      <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/40 dark:border-slate-800/80 shadow-sm text-slate-800 dark:text-white">
        <Icon size={16} />
      </div>
    </div>
  );
}

function KV({ label, value, pill, highlight, isLump, negative }) {
  let containerCls = 'bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800 shadow-sm';
  let labelCls = 'text-slate-400 dark:text-slate-500';
  let valueCls = 'text-slate-800 dark:text-slate-200';

  if (highlight && negative) {
    containerCls = 'bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800 shadow-sm';
    labelCls = 'text-rose-600 dark:text-rose-400';
    valueCls = 'text-rose-600 dark:text-rose-400 font-extrabold';
  } else if (highlight) {
    containerCls = 'bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800 shadow-sm';
    labelCls = 'text-blue-600 dark:text-blue-400';
    valueCls = 'text-blue-800 dark:text-blue-300 font-extrabold';
  } else if (isLump) {
    containerCls = 'bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800 shadow-sm';
    labelCls = 'text-emerald-600 dark:text-emerald-400';
    valueCls = 'text-emerald-800 dark:text-emerald-300 font-black text-sm';
  }

  return (
    <div className={`p-3 rounded-2xl border transition-all duration-250 ${containerCls}`}>
      <p className={`text-[9px] font-bold mb-1.5 uppercase tracking-wider ${labelCls}`}>{label}</p>
      {pill ? (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-[9px] font-bold bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-450 ring-1 ring-emerald-500/20 rounded-full mt-1.5 animate-fade-in">
          <CheckCircle2 size={10} className="text-emerald-500" /> {pill}
        </span>
      ) : (
        <p className={`font-bold tabular-nums text-xs ${valueCls}`}>{value}</p>
      )}
    </div>
  );
}

function ClientDetailsCard({ client }) {
  const details = client.clientDetails || {};
  const {
    mobile = '',
    email = '',
    clientType = '',
    dob = '',
    address1 = '',
    address2 = '',
    address3 = '',
    city = '',
    state = '',
    pinCode = '',
    groupLeaderName = '',
    owner = '',
    relationshipManager = '',
    portfolioManager = '',
    serviceManager = '',
    insuranceManager = '',
    operationManager = '',
    internalManager = '',
    familyDetails = [],
    mutualFunds = 'No',
    insuranceTerm = 'No',
    insuranceMedical = 'No',
    insuranceAccidental = 'No'
  } = details;

  const hasFamily = familyDetails && familyDetails.length > 0;

  const formattedAddress = [
    address1,
    address2,
    address3,
    [city, state, pinCode].filter(Boolean).join(', ')
  ].filter(Boolean).join('\n');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Box 1: Personal & Contact details */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-5">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800/60">
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-805 flex items-center justify-center">
            <User size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Contact Profile</h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Personal contact info</p>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          <ProfileField icon={Phone} label="Mobile" value={mobile} />
          <ProfileField icon={Mail} label="Email" value={email} />
          <ProfileField icon={User} label="Client Type" value={clientType} />
          {dob && <ProfileField icon={User} label="Date of Birth" value={fmtDate(dob)} />}
          <ProfileField icon={MapPin} label="Address" value={formattedAddress} isMultiline />
        </div>
      </Card>

      {/* Box 2: Internal Assignment Details */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-5">
        <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800/60">
          <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-805 flex items-center justify-center">
            <Users size={15} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Coverage Team</h4>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Internal managing staff</p>
          </div>
        </div>

        <div className="space-y-3.5">
          <RoleField label="Group Leader" value={groupLeaderName} />
          <RoleField label="Account Owner" value={teamName(owner)} />
          <RoleField label="Relationship Manager" value={teamName(relationshipManager)} />
          <RoleField label="Portfolio Manager" value={teamName(portfolioManager)} />
          <RoleField label="Service Manager" value={teamName(serviceManager)} />
          <RoleField label="Insurance Manager" value={teamName(insuranceManager)} />
          <RoleField label="Operation Manager" value={teamName(operationManager)} />
          <RoleField label="Internal Manager" value={teamName(internalManager)} />
        </div>
      </Card>

      {/* Box 3: Family & Holdings Details */}
      <div className="space-y-6">
        {/* Family Details Card */}
        <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-4">
          <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-805 flex items-center justify-center">
              <Heart size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Family Members</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Co-applicants & relations</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-40 overflow-y-auto pr-1">
            {!hasFamily ? (
              <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500 italic">No family members configured</div>
            ) : (
              familyDetails.map((f, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs gap-2">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{f.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-sans mt-0.5 space-x-2">
                      {f.dob && <span>DOB: {fmtDate(f.dob)}</span>}
                      {f.mobile && <span>📞 {f.mobile}</span>}
                      {f.email && <span className="lowercase">✉ {f.email}</span>}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200/20 shrink-0">{f.relation}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Business holdings status Card */}
        <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-4">
          <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-805 flex items-center justify-center">
              <Briefcase size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Active Holdings</h4>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Fintness business relations</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <HoldingPill label="Mutual Funds" active={mutualFunds === 'Yes'} />
            <HoldingPill label="Term Insurance" active={insuranceTerm === 'Yes'} />
            <HoldingPill label="Medical Insurance" active={insuranceMedical === 'Yes'} />
            <HoldingPill label="Accidental Insurance" active={insuranceAccidental === 'Yes'} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProfileField({ icon: Icon, label, value, isMultiline }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 border border-slate-200/20 dark:border-slate-800/40 flex items-center justify-center shrink-0">
        <Icon size={12} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
        {isMultiline ? (
          <span className="block font-semibold text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed mt-0.5">
            {value || <span className="text-slate-400 dark:text-slate-650 italic font-normal">Not configured</span>}
          </span>
        ) : (
          <span className="block font-semibold text-slate-700 dark:text-slate-200 mt-0.5 truncate">
            {value || <span className="text-slate-400 dark:text-slate-655 italic font-normal">Not configured</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function RoleField({ label, value }) {
  return (
    <div className="flex items-center justify-between text-xs border-b border-slate-100/50 dark:border-slate-800/20 pb-2">
      <span className="text-slate-400 dark:text-slate-500 font-medium">{label}</span>
      <span className="font-bold text-slate-800 dark:text-slate-200">
        {value || <span className="text-slate-400 dark:text-slate-600 italic font-normal">Unassigned</span>}
      </span>
    </div>
  );
}

function HoldingPill({ label, active }) {
  return (
    <div className={`p-2.5 rounded-xl border text-center transition-all duration-300 ${
      active 
        ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-800 dark:text-slate-200 shadow-sm' 
        : 'bg-slate-50/40 dark:bg-slate-950/10 border-slate-100 dark:border-slate-850/40 text-slate-400 dark:text-slate-550'
    }`}>
      <span className="block text-[10px] font-bold truncate">{label}</span>
      <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider mt-1.5">
        {active ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
            <span className="text-emerald-600 dark:text-emerald-450">Active</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shrink-0" />
            <span className="text-rose-600 dark:text-rose-450">Inactive</span>
          </>
        )}
      </span>
    </div>
  );
}

