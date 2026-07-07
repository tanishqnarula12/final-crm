import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, PiggyBank, ArrowDownLeft, ArrowUpRight, Repeat,
  Shield, HeartPulse, Activity, FileBadge, Users, UserPlus, UserCheck, Skull, Clock,
  CalendarCheck, ListChecks, Briefcase, Landmark, Coins, Sparkles, PauseCircle,
  Calendar, CheckSquare, ExternalLink, AlertCircle, Video
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip
} from 'recharts';
import { Card } from './UI';
import { fmtINR } from '../utils/calc';
import { loadProspects, ALL_STAGE_THEME } from '../utils/prospects';
import { loadTasks, TASK_STAGES, STAGE_THEME } from '../utils/tasks';
import { loadMeetings, MEETING_STATUSES } from '../utils/meetings';
import { hasAllocation } from '../utils/assets';

// Parse "₹ 50,000" / "50000" / numbers → number
const num = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;

// Ensure a meeting link is a usable absolute URL before opening it.
const normalizeUrl = (url) => {
  const u = (url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

// Investment proposalType buckets
const SIP_IN_TYPES = ['Fresh SIP', 'Special SIP', 'SIP Registration'];
const SIP_OUT_TYPES = ['SIP Cancellation'];
const LUMP_TYPES = ['Lumpsum Investment'];
const REDEEM_TYPES = ['Redemption Proposal'];

const isThisMonth = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

export default function DashboardView({
  clients = [],
  advisorName = '',
  tasksChangeCounter,
  prospectsChangeCounter,
  meetingsChangeCounter,
  setView,
  onNewClient,
  onNewMeeting,
  onNewTask,
  onOpenTask,
  onOpenMeeting,
  onOpenProspect
}) {
  const [prospects, setProspects] = useState(() => loadProspects());
  const [tasks, setTasks] = useState(() => loadTasks());
  const [meetings, setMeetings] = useState(() => loadMeetings());

  // Live refresh whenever the underlying stores change
  useEffect(() => { setProspects(loadProspects()); }, [prospectsChangeCounter]);
  useEffect(() => { setTasks(loadTasks()); }, [tasksChangeCounter]);
  useEffect(() => { setMeetings(loadMeetings()); }, [meetingsChangeCounter]);
  useEffect(() => {
    const sync = () => { setProspects(loadProspects()); setTasks(loadTasks()); setMeetings(loadMeetings()); };
    window.addEventListener('focus', sync);
    window.addEventListener('crm:prospects-updated', sync);
    window.addEventListener('crm:meetings-updated', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('crm:prospects-updated', sync);
      window.removeEventListener('crm:meetings-updated', sync);
    };
  }, []);

  // 1. Investments calculations
  const inv = useMemo(() => {
    const items = prospects.filter(p => p.proposalCategory === 'investment');
    const sumOf = (types) => items.filter(p => types.includes(p.proposalType)).reduce((s, p) => s + num(p.amount), 0);
    const sipIn = sumOf(SIP_IN_TYPES);
    const sipOut = sumOf(SIP_OUT_TYPES);
    const lump = sumOf(LUMP_TYPES);
    const redeem = sumOf(REDEEM_TYPES);
    const knownTypes = [...SIP_IN_TYPES, ...SIP_OUT_TYPES, ...LUMP_TYPES, ...REDEEM_TYPES];
    const other = items.filter(p => !knownTypes.includes(p.proposalType));
    const otherAmt = other.reduce((s, p) => s + num(p.amount), 0);
    return { sipIn, sipOut, netSip: sipIn - sipOut, lump, redeem, netLump: lump - redeem, otherCount: other.length, otherAmt, count: items.length };
  }, [prospects]);

  // 2. Insurance calculations
  const ins = useMemo(() => {
    const items = prospects.filter(p => p.proposalCategory === 'insurance');
    const premiumOf = (label) => items.filter(p => p.proposalType === label).reduce((s, p) => s + num(p.amount), 0);
    const countOf = (label) => items.filter(p => p.proposalType === label).length;
    const term = premiumOf('Term Insurance');
    const medical = premiumOf('Medical Insurance');
    const accidental = premiumOf('Accidental Insurance');
    const issued = items.filter(p => p.stage === 'Policy Issued').length;
    const types = [
      { label: 'Term', count: countOf('Term Insurance'), color: '#3b82f6' },
      { label: 'Medical', count: countOf('Medical Insurance'), color: '#10b981' },
      { label: 'Accidental', count: countOf('Accidental Insurance'), color: '#8b5cf6' },
    ];
    const stageMap = {};
    items.forEach(p => { const s = p.stage || 'Qualified'; stageMap[s] = (stageMap[s] || 0) + 1; });
    return { term, medical, accidental, totalPremium: term + medical + accidental, issued, types, stages: stageMap, count: items.length };
  }, [prospects]);

  // 3. Client metrics calculations
  const cli = useMemo(() => {
    const total = clients.length;
    let applicants = 0, active = 0, inactive = 0, dead = 0, newLeads = 0, newApplicants = 0;
    clients.forEach(c => {
      const d = c.clientDetails || {};
      const fam = Array.isArray(d.familyDetails) ? d.familyDetails.length : 0;
      applicants += 1 + fam;
      const status = d.status || 'Active';
      if (status === 'Active') active++;
      else if (status === 'Inactive') inactive++;
      else dead++;
      if (isThisMonth(c.createdAt)) { newLeads++; newApplicants += 1 + fam; }
    });
    return { total, applicants, active, inactive, dead, newLeads, newApplicants };
  }, [clients]);

  // 4. Revenue/AUM calculations
  const rev = useMemo(() => {
    let aum = 0, totalSip = 0;
    clients.forEach(c => {
      (c.goals || []).forEach(g => { aum += num(g.currentInv); totalSip += num(g.currentSip); });
    });
    const withAlloc = clients.filter(c => hasAllocation(c)).length;
    return { aum, totalSip, withAlloc };
  }, [clients]);

  // 5. Operations/Stages counts
  const ops = useMemo(() => {
    const taskStages = {};
    TASK_STAGES.forEach(s => { taskStages[s] = tasks.filter(t => (t.stage || 'Open') === s).length; });
    const meetStatus = {};
    MEETING_STATUSES.forEach(s => { meetStatus[s] = meetings.filter(m => (m.status || 'Scheduled') === s).length; });
    const prospStages = {};
    prospects.forEach(p => { const s = p.stage || 'Qualified'; prospStages[s] = (prospStages[s] || 0) + 1; });
    return { taskStages, taskTotal: tasks.length, meetStatus, meetTotal: meetings.length, prospStages, prospTotal: prospects.length };
  }, [tasks, meetings, prospects]);

  // 6. Top Clients calculations (by total AUM)
  const topClients = useMemo(() => {
    return clients
      .map(c => {
        const clientAum = (c.goals || []).reduce((sum, g) => sum + num(g.currentInv), 0);
        const clientSip = (c.goals || []).reduce((sum, g) => sum + num(g.currentSip), 0);
        return {
          id: c.id,
          name: c.name,
          aum: clientAum,
          sip: clientSip
        };
      })
      .filter(c => c.aum > 0)
      .sort((a, b) => b.aum - a.aum)
      .slice(0, 5);
  }, [clients]);

  // Max AUM for proportional leaderboard bar sizes
  const maxAum = useMemo(() => {
    if (topClients.length === 0) return 1;
    return Math.max(...topClients.map(c => c.aum)) || 1;
  }, [topClients]);

  // 7. Client status distribution donut chart data
  const statusData = useMemo(() => {
    return [
      { name: 'Active', value: cli.active, color: '#10b981' },
      { name: 'Inactive', value: cli.inactive, color: '#f59e0b' },
      { name: 'Dead', value: cli.dead, color: '#f43f5e' },
    ].filter(d => d.value > 0);
  }, [cli]);

  // 8. Client Tiers count
  const tierData = useMemo(() => {
    let retail = 0, hni = 0, uhni = 0;
    clients.forEach(c => {
      const tier = (c.clientDetails?.clientType || 'Retail').toLowerCase();
      if (tier === 'hni') hni++;
      else if (tier === 'ultra hni' || tier === 'uhni') uhni++;
      else retail++;
    });
    const totalTiers = retail + hni + uhni;
    return [
      { name: 'Retail Clients', value: retail, color: 'bg-blue-500', pct: totalTiers ? Math.round((retail / totalTiers) * 100) : 0 },
      { name: 'HNI Clients', value: hni, color: 'bg-indigo-500', pct: totalTiers ? Math.round((hni / totalTiers) * 100) : 0 },
      { name: 'Ultra HNI Clients', value: uhni, color: 'bg-pink-500', pct: totalTiers ? Math.round((uhni / totalTiers) * 100) : 0 },
    ];
  }, [clients]);

  // 9. Insurance Policy types donut chart data
  const policyTypesData = useMemo(() => {
    return ins.types.filter(t => t.count > 0).map(t => ({
      name: t.label,
      value: t.count,
      color: t.color
    }));
  }, [ins]);

  // 10. Filter next 3 scheduled meetings
  const upcomingMeetings = useMemo(() => {
    const now = new Date();
    return meetings
      .filter(m => m.status === 'Scheduled')
      .map(m => {
        let dateVal = m.date || '';
        let timeVal = m.time || '00:00';
        let dt = new Date(`${dateVal}T${timeVal}`);
        return {
          ...m,
          dateObj: isNaN(dt.getTime()) ? null : dt
        };
      })
      .filter(m => m.dateObj ? m.dateObj >= now || m.date === now.toISOString().split('T')[0] : true)
      .sort((a, b) => {
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj - b.dateObj;
      })
      .slice(0, 4);
  }, [meetings]);

  // 11. Filter top 5 active tasks
  const priorityTasks = useMemo(() => {
    return tasks
      .filter(t => t.stage !== 'Completed' && t.stage !== 'Lost')
      .map(t => {
        let dt = t.dueDate ? new Date(t.dueDate) : null;
        return {
          ...t,
          dateObj: dt && !isNaN(dt.getTime()) ? dt : null
        };
      })
      .sort((a, b) => {
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj - b.dateObj;
      })
      .slice(0, 5);
  }, [tasks]);

  // 12. Filter active prospects for sidebar list (excluding closed/issued stages)
  const activeProspects = useMemo(() => {
    return prospects
      .filter(p => p.stage !== 'Close Won' && p.stage !== 'Close Lost' && p.stage !== 'Policy Issued' && p.stage !== 'Policy Rejected')
      .slice(0, 4);
  }, [prospects]);

  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (advisorName || 'Advisor').split(' ')[0];

  const ChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2 py-1.5 rounded-lg shadow-md text-xs font-bold text-slate-800 dark:text-slate-200">
          {payload[0].name}: <span className="tabular-nums font-black text-slate-900 dark:text-white ml-1">{payload[0].value}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-200">
      
      {/* Welcome header banner */}
      <div className="rounded-2xl border border-slate-200/50 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/60 p-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Advisor Dashboard · {today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        
        {/* Left Side: Charts & Analytics (Spans 2 columns) */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Headline KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HeroKpi icon={Landmark} accent="indigo" label="Total AUM Managed" value={fmtINR(rev.aum)} hint={`${clients.length} client groups · ${rev.withAlloc} mapped`} />
            <HeroKpi icon={PiggyBank} accent="emerald" label="Total SIP Book" value={fmtINR(rev.totalSip)} hint="Active monthly systematic volume" />
            <HeroKpi icon={TrendingUp} accent="blue" label="Net New SIP Volume" value={fmtINR(inv.netSip)} hint="Monthly registrations − cancellations" signed={inv.netSip} />
            <HeroKpi icon={Coins} accent="cyan" label="Net Lumpsum Flow" value={fmtINR(inv.netLump)} hint="Monthly lumpsum − redemptions" signed={inv.netLump} />
          </div>

          {/* Investments Section */}
          <section className="space-y-3.5">
            <SectionHeader icon={TrendingUp} accent="emerald" title="Investment Operations" subtitle="SIP, lumpsum & redemption flows from active proposals" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FlowCard
                title="Net SIP Book" net={inv.netSip}
                inRow={{ icon: ArrowUpRight, label: 'SIP Registration', value: inv.sipIn }}
                outRow={{ icon: ArrowDownLeft, label: 'SIP Cancellation', value: inv.sipOut }}
              />
              <FlowCard
                title="Net Lumpsum Flow" net={inv.netLump}
                inRow={{ icon: ArrowUpRight, label: 'Lumpsum Investment', value: inv.lump }}
                outRow={{ icon: ArrowDownLeft, label: 'Redemption Flow', value: inv.redeem }}
              />
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col justify-between bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-550 flex items-center justify-center shadow-sm"><Repeat size={14} /></span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Other Proposals</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Pause, STP, SWP, Switches</p>
                  </div>
                </div>
                <div className="flex items-end gap-3 mt-6">
                  <div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight">{inv.otherCount}</div>
                    <div className="text-[9px] text-slate-450 dark:text-slate-500 font-extrabold uppercase tracking-wider mt-0.5">Active proposals</div>
                  </div>
                  <div className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-350 text-[10px] font-bold border border-slate-200/40 dark:border-slate-700">
                    {fmtINR(inv.otherAmt)}
                  </div>
                </div>
              </Card>
            </div>
          </section>

          {/* Leaderboard: Top Clients by AUM */}
          <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-bold text-slate-850 dark:text-slate-200 uppercase tracking-wider">Top Clients by AUM</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Top 5 client relationships ranked by current investment value</p>
              </div>
              <Landmark size={15} className="text-slate-400 dark:text-slate-500" />
            </div>
            
            {topClients.length > 0 ? (
              <div className="space-y-4 py-1">
                {topClients.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-4 group">
                    <span className="w-6 h-6 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-550 dark:text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="text-slate-700 dark:text-slate-205 truncate">{c.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-400 font-medium">SIP: <strong className="text-slate-550 dark:text-slate-450 tabular-nums">{fmtINR(c.sip)}</strong></span>
                          <span className="text-slate-900 dark:text-white tabular-nums">{fmtINR(c.aum)}</span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 dark:bg-blue-600 transition-all duration-500" 
                          style={{ width: `${(c.aum / maxAum) * 100}%` }} 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-36 flex flex-col items-center justify-center text-center">
                <Landmark size={24} className="text-slate-300 dark:text-slate-700 mb-1" />
                <p className="text-xs text-slate-400 dark:text-slate-500 italic font-bold">No active client investments recorded yet.</p>
              </div>
            )}
          </Card>

          {/* Clients & Distribution */}
          <section className="space-y-3.5">
            <SectionHeader icon={Users} title="Clients & Distribution" subtitle="Group structure, account tiers & active status mix" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Client Tiers */}
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl md:col-span-1 flex flex-col justify-between bg-white dark:bg-slate-900">
                <div>
                  <h4 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-4">Client Tiers</h4>
                  <div className="space-y-3.5">
                    {tierData.map((tier) => (
                      <div key={tier.name} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-650 dark:text-slate-350">{tier.name}</span>
                          <span className="text-slate-900 dark:text-white tabular-nums">{tier.value} <span className="text-[9px] text-slate-455 font-medium">({tier.pct}%)</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${tier.color}`} style={{ width: `${tier.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-center">
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{cli.total}</p>
                    <p className="text-[9px] text-slate-450 font-bold">Groups</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{cli.applicants}</p>
                    <p className="text-[9px] text-slate-450 font-bold">People</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">+{cli.newLeads}</p>
                    <p className="text-[9px] text-slate-455 font-bold">New</p>
                  </div>
                </div>
              </Card>

              {/* Status Mix Donut */}
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-5 bg-white dark:bg-slate-900">
                <div className="flex-1 space-y-3 w-full">
                  <h4 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider">Client Status Mix</h4>
                  <div className="space-y-2.5 mt-4">
                    {statusData.map((s) => (
                      <div key={s.name} className="flex items-center gap-2.5 text-xs font-bold">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-650 dark:text-slate-350">{s.name} Clients</span>
                        <span className="ml-auto text-slate-900 dark:text-white tabular-nums">{s.value}</span>
                      </div>
                    ))}
                    {statusData.length === 0 && (
                      <p className="text-xs italic text-slate-400">No client status mix available.</p>
                    )}
                  </div>
                </div>
                {statusData.length > 0 ? (
                  <div className="relative w-[110px] h-[110px] flex items-center justify-center shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={43}
                          paddingAngle={3.5}
                          dataKey="value"
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums leading-none">{cli.total}</span>
                      <span className="text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold mt-0.5">Total</span>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          </section>

          {/* Insurance Segment & Policy Details */}
          <section className="space-y-3.5">
            <SectionHeader icon={Shield} title="Insurance Pipeline" subtitle="Premiums booked & policies lifecycle pipeline" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Premium Booked Card */}
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col justify-between bg-white dark:bg-slate-900">
                <div>
                  <h4 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-3">Premium Booked</h4>
                  <div className="space-y-3">
                    <PremiumRow icon={Shield} label="Term Life" value={ins.term} />
                    <PremiumRow icon={HeartPulse} label="Medical Health" value={ins.medical} />
                    <PremiumRow icon={Activity} label="Accidental" value={ins.accidental} />
                  </div>
                </div>
                <div className="pt-3.5 mt-4 border-t border-slate-105 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Total Premium</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{fmtINR(ins.totalPremium)}</span>
                </div>
              </Card>

              {/* Policy Types Booked Donut */}
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900">
                <div className="flex-1 w-full space-y-2">
                  <h4 className="text-xs font-bold text-slate-455 dark:text-slate-500 uppercase tracking-wider">Types Booked</h4>
                  <div className="space-y-1.5 mt-3">
                    {ins.types.map(t => (
                      <div key={t.label} className="flex items-center gap-2 text-xs font-bold">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-slate-650 dark:text-slate-355">{t.label}</span>
                        <span className="ml-auto text-slate-950 dark:text-white tabular-nums">{t.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {policyTypesData.length > 0 ? (
                  <div className="relative w-[110px] h-[110px] flex items-center justify-center shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={policyTypesData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={41}
                          paddingAngle={3.5}
                          dataKey="value"
                        >
                          {policyTypesData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums leading-none">{ins.count}</span>
                      <span className="text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold mt-0.5">Total</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] italic text-slate-400 dark:text-slate-500">None booked.</div>
                )}
              </Card>

              {/* Policy Stages List */}
              <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
                <h4 className="text-xs font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-3">Policy Stages</h4>
                <StageList map={ins.stages} order={['Qualified', 'Document Pending', 'Proposal Submitted', 'Payment Done', 'Waiting for Underwriter', 'Policy Issued', 'Policy Rejected']} emptyText="No insurance prospects." />
              </Card>

            </div>
          </section>

          {/* Operational Activities Breakdown */}
          <section className="space-y-3.5">
            <SectionHeader icon={Sparkles} title="Operational Breakdown" subtitle="Aggregate system pipelines tracked by lifecycle stages" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <OpsCard icon={ListChecks} title="Tasks" total={ops.taskTotal}
                map={ops.taskStages} order={TASK_STAGES} emptyText="No tasks yet" />
              <OpsCard icon={CalendarCheck} title="Meetings" total={ops.meetTotal}
                map={ops.meetStatus} order={MEETING_STATUSES} emptyText="No meetings yet" />
              <OpsCard icon={Briefcase} title="Business Prospects" total={ops.prospTotal}
                map={ops.prospStages} order={['Qualified', 'Work Executed', 'Close Won', 'Close Lost', 'Document Pending', 'Proposal Submitted', 'Payment Done', 'Waiting for Underwriter', 'Policy Issued', 'Policy Rejected']} emptyText="No prospects yet" />
            </div>
          </section>

        </div>

        {/* Right Side: Command Center / Operations Sidebar (Spans 1 column) */}
        <div className="xl:sticky xl:top-20 space-y-6 self-start">
          
          {/* Quick Actions Console */}
          <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 relative overflow-hidden">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-450 dark:text-slate-500 mb-3.5 flex items-center gap-1.5">
              <Sparkles size={13} className="text-blue-500" /> Advisor Actions Console
            </h4>
            <div className="grid grid-cols-3 gap-3 relative z-10">
              <button 
                onClick={onNewClient}
                className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/15 hover:border-blue-200/60 dark:hover:border-blue-900/60 transition-all duration-300 text-center group cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-505 flex items-center justify-center mb-2 group-hover:text-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 group-hover:scale-105 transition-all duration-300"><UserPlus size={16} /></span>
                <span className="text-xs font-bold text-slate-650 dark:text-slate-350 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Add Client</span>
              </button>
              <button 
                onClick={onNewMeeting}
                className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/15 hover:border-emerald-200/60 dark:hover:border-emerald-900/60 transition-all duration-300 text-center group cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-855 text-slate-400 dark:text-slate-505 flex items-center justify-center mb-2 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40 group-hover:scale-105 transition-all duration-300"><CalendarCheck size={16} /></span>
                <span className="text-xs font-bold text-slate-650 dark:text-slate-355 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Schedule</span>
              </button>
              <button 
                onClick={onNewTask}
                className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200/50 dark:border-slate-800/60 hover:bg-violet-50/30 dark:hover:bg-violet-950/15 hover:border-violet-200/60 dark:hover:border-violet-900/60 transition-all duration-300 text-center group cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-855 text-slate-400 dark:text-slate-505 flex items-center justify-center mb-2 group-hover:text-violet-500 group-hover:bg-violet-50 dark:group-hover:bg-violet-950/40 group-hover:scale-105 transition-all duration-300"><ListChecks size={16} /></span>
                <span className="text-xs font-bold text-slate-650 dark:text-slate-355 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">Log Task</span>
              </button>
            </div>
          </Card>

          {/* Upcoming Meetings Timeline */}
          <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Scheduled Meetings</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Your immediate calendar timeline</p>
              </div>
              <button 
                onClick={() => setView('meetings')} 
                className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/20 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
                title="View Full Calendar"
              >
                <ExternalLink size={13} />
              </button>
            </div>
            
            <div className="space-y-3">
              {upcomingMeetings.map((m) => (
                <div 
                  key={m.id}
                  onClick={() => onOpenMeeting(m)}
                  className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/10 hover:border-blue-200 dark:hover:border-blue-900 hover:bg-white dark:hover:bg-slate-900/40 transition-all duration-200 cursor-pointer flex items-start gap-3 group"
                >
                  {/* Clean calendar sheet block */}
                  <div className="flex flex-col items-stretch text-center w-11 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 shadow-sm">
                    <span className="text-[7.5px] uppercase tracking-widest font-black py-0.5 bg-blue-500 dark:bg-blue-600 text-white leading-none">
                      {m.dateObj ? m.dateObj.toLocaleDateString('en-IN', { month: 'short' }) : '—'}
                    </span>
                    <span className="text-xs font-bold py-1 text-slate-700 dark:text-slate-300 leading-none tabular-nums">
                      {m.dateObj ? m.dateObj.getDate() : '—'}
                    </span>
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{m.title || 'Client Briefing'}</h5>
                    <p className="text-xs text-slate-500 dark:text-slate-450 font-medium mt-0.5 truncate">Client: <span className="font-bold text-slate-650 dark:text-slate-350">{m.clientName || 'Unknown'}</span></p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${m.mode === 'Online' ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'}`}>{m.mode || 'Offline'}</span>
                      {m.time && <span className="text-[8px] text-slate-400 dark:text-slate-500 font-extrabold flex items-center gap-0.5"><Clock size={10} /> {m.time}</span>}
                      {m.mode === 'Online' && m.link && (
                        <a
                          href={normalizeUrl(m.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[8px] font-bold flex items-center gap-1 transition-all ml-1"
                        >
                          <Video size={10} /> Join Now
                        </a>
                      )}
                    </div>
                  </div>
                  
                  {/* Attendee Stack */}
                  <div className="shrink-0 flex -space-x-1 overflow-hidden self-center pr-1">
                    {Array.isArray(m.attendees) && m.attendees.slice(0, 2).map((att, i) => (
                      <span key={i} className="w-5.5 h-5.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-605 dark:text-indigo-400 flex items-center justify-center text-[7px] font-black border border-white dark:border-slate-900 shadow-sm" title={att}>
                        {att.split(' ').map(n=>n[0]).join('').substring(0, 2)}
                      </span>
                    ))}
                    {Array.isArray(m.attendees) && m.attendees.length > 2 && (
                      <span className="w-5.5 h-5.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-[7px] font-black border border-white dark:border-slate-900 shadow-sm">
                        +{m.attendees.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              
              {upcomingMeetings.length === 0 && (
                <div className="p-4 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500">
                  <Calendar size={22} className="mb-1 opacity-55 text-slate-350" />
                  <p className="text-xs font-bold">No upcoming meetings scheduled.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Active Tasks Checklist */}
          <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Priority Tasks</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Immediate operational activities pending</p>
              </div>
              <button 
                onClick={() => setView('tasks')} 
                className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-805 border border-slate-200/20 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer"
                title="View All Tasks"
              >
                <ExternalLink size={13} />
              </button>
            </div>

            <div className="space-y-2.5">
              {priorityTasks.map((t) => (
                <div 
                  key={t.id}
                  onClick={() => onOpenTask(t)}
                  className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/10 hover:border-violet-200 dark:hover:border-violet-900 hover:bg-white dark:hover:bg-slate-900/40 transition-all duration-200 cursor-pointer flex items-center gap-3 group"
                >
                  <span className="w-5.5 h-5.5 rounded border border-slate-300 dark:border-slate-750 text-slate-300 dark:text-slate-750 flex items-center justify-center hover:text-violet-500 hover:border-violet-400 shrink-0 transition-colors bg-white dark:bg-slate-900">
                    <CheckSquare size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-850 dark:text-slate-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{t.taskName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {t.dueDate && (
                        <span className={`text-[9px] font-bold ${new Date(t.dueDate) < new Date() ? 'text-rose-500 font-extrabold flex items-center gap-0.5' : 'text-slate-450 dark:text-slate-505'}`}>
                          {new Date(t.dueDate) < new Date() ? <AlertCircle size={10} /> : null}
                          Due: {t.dueDate}
                        </span>
                      )}
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <span className="text-[9px] text-slate-405 dark:text-slate-500 font-bold truncate">For: {t.applicant || 'Client'}</span>
                    </div>
                  </div>
                  
                  <span className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-black shrink-0 border border-current leading-none ${STAGE_THEME[t.stage] || 'bg-slate-100 text-slate-655'}`}>{t.stage}</span>
                </div>
              ))}

              {priorityTasks.length === 0 && (
                <div className="p-4 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500">
                  <CheckSquare size={22} className="mb-1 opacity-55 text-slate-350" />
                  <p className="text-xs font-bold">No pending priority tasks found.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Active Prospects Card */}
          <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Active Prospects</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Pipeline deals being tracked</p>
              </div>
              <button 
                onClick={() => setView('prospects')} 
                className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/20 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-305 transition-colors cursor-pointer"
                title="View All Prospects"
              >
                <ExternalLink size={13} />
              </button>
            </div>

            <div className="space-y-2.5">
              {activeProspects.map((p) => (
                <div 
                  key={p.id}
                  onClick={() => onOpenProspect && onOpenProspect(p)}
                  className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/10 hover:border-emerald-200 dark:hover:border-emerald-900 hover:bg-white dark:hover:bg-slate-900/40 transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-850 dark:text-slate-200 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{p.proposalType}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold truncate">For: {p.applicant || 'Client'}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800" />
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium tabular-nums">{fmtINR(p.amount)}</span>
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-black shrink-0 border border-current leading-none ${ALL_STAGE_THEME[p.stage || 'Qualified'] || 'bg-slate-100 text-slate-655'}`}>
                    {p.stage || 'Qualified'}
                  </span>
                </div>
              ))}

              {activeProspects.length === 0 && (
                <div className="p-4 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500">
                  <Briefcase size={22} className="mb-1 opacity-55 text-slate-350" />
                  <p className="text-xs font-bold">No active prospects found.</p>
                </div>
              )}
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <span className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/60 text-slate-400 dark:text-slate-550 flex items-center justify-center shadow-sm">
          <Icon size={16} />
        </span>
      )}
      <div>
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider leading-none">{title}</h2>
        <p className="text-xs text-slate-450 dark:text-slate-500 font-medium mt-1.5">{subtitle}</p>
      </div>
    </div>
  );
}

const ICON_THEMES = {
  indigo: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  cyan: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
};

function HeroKpi({ icon: Icon, accent, label, value, hint, signed }) {
  const trendColor = signed === undefined ? '' : signed < 0 ? 'text-rose-600 dark:text-rose-455' : 'text-emerald-600 dark:text-emerald-455';
  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm shadow-slate-100/50 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">{label}</p>
          <p className={`text-2xl sm:text-3xl font-black tracking-tight tabular-nums mt-3.5 leading-none ${trendColor || 'text-slate-900 dark:text-white'}`}>{value}</p>
          {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 font-medium truncate leading-none">{hint}</p>}
        </div>
        <span className={`shrink-0 w-9.5 h-9.5 rounded-xl flex items-center justify-center ${ICON_THEMES[accent] || 'bg-slate-50 text-slate-500'}`}>
          <Icon size={17} />
        </span>
      </div>
    </Card>
  );
}

function FlowCard({ title, net, inRow, outRow }) {
  const InIcon = inRow.icon, OutIcon = outRow.icon;
  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col justify-between bg-white dark:bg-slate-900 transition-colors">
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{title}</h4>
          {net < 0 ? <TrendingDown size={14} className="text-rose-500 shrink-0" /> : <TrendingUp size={14} className="text-emerald-500 shrink-0" />}
        </div>
        <div className={`text-2xl font-bold tabular-nums tracking-tight leading-none ${net < 0 ? 'text-rose-600 dark:text-rose-455' : 'text-slate-900 dark:text-white'}`}>{fmtINR(net)}</div>
      </div>
      <div className="space-y-2 mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-850">
        <div className="flex items-center gap-2">
          <span className="w-6.5 h-6.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 flex items-center justify-center shrink-0"><InIcon size={12} /></span>
          <span className="text-xs font-bold text-slate-500">{inRow.label}</span>
          <span className="ml-auto text-xs font-black text-emerald-600 dark:text-emerald-450 tabular-nums">{fmtINR(inRow.value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6.5 h-6.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-450 flex items-center justify-center shrink-0"><OutIcon size={12} /></span>
          <span className="text-xs font-bold text-slate-500">{outRow.label}</span>
          <span className="ml-auto text-xs font-black text-rose-600 dark:text-rose-450 tabular-nums">{fmtINR(outRow.value)}</span>
        </div>
      </div>
    </Card>
  );
}

function PremiumRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
      <span className="text-xs font-bold text-slate-650 dark:text-slate-350">{label}</span>
      <span className="ml-auto text-xs font-black text-slate-900 dark:text-white tabular-nums">{fmtINR(value)}</span>
    </div>
  );
}

// A vertical list of stages with counts (only non-zero shown), themed dots
const STAGE_DOT = {
  'Qualified': 'bg-blue-500', 'Document Pending': 'bg-amber-500', 'Proposal Submitted': 'bg-violet-500',
  'Payment Done': 'bg-cyan-500', 'Waiting for Underwriter': 'bg-orange-500', 'Policy Issued': 'bg-emerald-500',
  'Policy Rejected': 'bg-rose-500', 'Work Executed': 'bg-amber-500', 'Close Won': 'bg-emerald-500', 'Close Lost': 'bg-rose-500',
  'Open': 'bg-blue-500', 'In Process': 'bg-amber-500', 'Waiting For Client': 'bg-violet-500', 'Completed': 'bg-emerald-500', 'Lost': 'bg-rose-500',
  'Scheduled': 'bg-blue-500', 'Cancelled': 'bg-rose-500',
};

function StageList({ map, order, emptyText }) {
  const rows = order.filter(s => (map[s] || 0) > 0).map(s => ({ label: s, value: map[s] }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) return <p className="text-[10px] text-slate-400 dark:text-slate-500 italic font-bold py-2">{emptyText}</p>;
  const max = Math.max(...rows.map(r => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STAGE_DOT[r.label] || 'bg-slate-400'}`} />
          <span className="text-[11px] font-bold text-slate-650 dark:text-slate-350 truncate flex-1">{r.label}</span>
          <div className="w-16 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
            <div className={`h-full rounded-full ${STAGE_DOT[r.label] || 'bg-slate-400'}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-[11px] font-black text-slate-850 dark:text-slate-205 tabular-nums w-4 text-right shrink-0">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function OpsCard({ icon: Icon, title, total, map, order, emptyText }) {
  return (
    <Card className="p-5 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl flex flex-col justify-between bg-white dark:bg-slate-900 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-205 uppercase tracking-wider">{title}</h4>
        </div>
        <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums leading-none">{total}</span>
      </div>
      <StageList map={map} order={order} emptyText={emptyText} />
    </Card>
  );
}
