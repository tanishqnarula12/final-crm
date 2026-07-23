import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, Search, Trash2, Video, MapPin, Link as LinkIcon, Calendar, CalendarDays, Clock,
  CheckCircle2, RotateCcw, XCircle, ChevronLeft, ChevronRight, Table as TableIcon, LayoutGrid,
  Globe, Building, Pencil, User, FileText, Users, Copy, Check, Send
} from 'lucide-react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, selectCls, Field, CoolSelect, Avatar } from './UI';
import { loadTeam } from '../services/team';
import { getCurrentUser } from '../utils/auth';
import { canEditMeeting, canDeleteMeeting, isAdmin } from '../utils/permissions';
import {
  loadMeetings, saveMeetings, MEETING_MODES, MEETING_STATUSES, MEETING_STATUS_THEME,
  MODE_THEME, meetingDateTime, fmtMeetingWhen, fmtMeetingStamp,
} from '../utils/meetings';
import { uid, initials, avatarColor } from '../utils/calc';

// ===========================================================================
// MEETINGS MODULE — table + calendar views of all scheduled/done meetings
// ===========================================================================
export default function MeetingsView({ clients = [], isViewer, onOpenMeeting, onScheduleMeeting, onCreateMom, onConvertLead, meetingsChangeCounter, activeMeetingId, setActiveMeetingId }) {
  const [meetings, setMeetings] = useState(() => loadMeetings());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'calendar'

  useEffect(() => {
    setMeetings(loadMeetings());
  }, [meetingsChangeCounter]);

  useEffect(() => {
    const sync = () => setMeetings(loadMeetings());
    window.addEventListener('focus', sync);
    window.addEventListener('crm:meetings-updated', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('crm:meetings-updated', sync);
    };
  }, []);

  // Deep-link: open a specific meeting when navigated here with an id
  useEffect(() => {
    if (activeMeetingId) {
      const found = meetings.find(m => m.id === activeMeetingId);
      if (found) onOpenMeeting && onOpenMeeting(found);
      if (setActiveMeetingId) setActiveMeetingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeetingId, meetings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings
      .filter(m => statusFilter === 'all' || (m.status || 'Scheduled') === statusFilter)
      .filter(m => !q ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.clientName || '').toLowerCase().includes(q) ||
        (m.assignedTo || '').toLowerCase().includes(q) ||
        (m.mode || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const da = meetingDateTime(a)?.getTime() || 0;
        const db = meetingDateTime(b)?.getTime() || 0;
        return db - da;
      });
  }, [meetings, query, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: meetings.length };
    MEETING_STATUSES.forEach(s => { c[s] = meetings.filter(m => (m.status || 'Scheduled') === s).length; });
    return c;
  }, [meetings]);

  // Split the filtered list into Today / Upcoming / Earlier buckets for the
  // table view. Dates are ISO (YYYY-MM-DD) so string comparison is safe.
  const grouped = useMemo(() => {
    const todayKey = dayKey(new Date());
    const today = [];
    const upcoming = [];
    const earlier = [];
    filtered.forEach(m => {
      if (!m.date) { earlier.push(m); return; }
      if (m.date === todayKey) today.push(m);
      else if (m.date > todayKey) upcoming.push(m);
      else earlier.push(m);
    });
    const asc = (a, b) => (meetingDateTime(a)?.getTime() || 0) - (meetingDateTime(b)?.getTime() || 0);
    const desc = (a, b) => (meetingDateTime(b)?.getTime() || 0) - (meetingDateTime(a)?.getTime() || 0);
    today.sort(asc);
    upcoming.sort(asc);
    earlier.sort(desc);
    return [
      { key: 'today', label: "Today's Meetings", icon: CalendarDays, items: today },
      { key: 'upcoming', label: 'Upcoming Meetings', icon: Calendar, items: upcoming },
      { key: 'earlier', label: 'Earlier', icon: Clock, items: earlier },
    ];
  }, [filtered]);

  const openCreate = () => { onScheduleMeeting && onScheduleMeeting(null); };
  const openEdit = (m) => { onOpenMeeting && onOpenMeeting(m); };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this meeting? This cannot be undone.')) return;
    setMeetings(prev => {
      const updated = prev.filter(m => m.id !== id);
      saveMeetings(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Video size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Meetings</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Schedule, track, and review client meetings</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings…" className={inputCls + ' pl-9 w-full md:w-56'} />
          </div>
          {/* View toggle */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 shrink-0">
            <button onClick={() => setViewMode('table')} title="Table view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><TableIcon size={15} /></button>
            <button onClick={() => setViewMode('calendar')} title="Calendar view" className={`p-1.5 rounded-lg cursor-pointer transition-colors ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={15} /></button>
          </div>
          {!isViewer && (
            <button onClick={openCreate} className={btnPrimary + ' shrink-0'}>
              <Plus size={14} /> Schedule Meeting
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" count={counts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
        {MEETING_STATUSES.map(s => (
          <FilterChip key={s} label={s} count={counts[s]} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView meetings={meetings} onOpenMeeting={openEdit} statusFilter={statusFilter} query={query} />
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <CalendarDays className="mx-auto text-slate-400 dark:text-slate-600 mb-4" size={36} />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4">
            {meetings.length === 0 ? 'No meetings scheduled yet' : 'No meetings match your filters'}
          </p>
          {!isViewer && meetings.length === 0 && (
            <button onClick={openCreate} className={btnSecondary}><Plus size={14} /> Schedule the first meeting</button>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.filter(g => g.items.length > 0).map(g => (
            <MeetingGroupTable
              key={g.key}
              title={g.label}
              icon={g.icon}
              meetings={g.items}
              onOpen={openEdit}
              onDelete={handleDelete}
              onCreateMom={onCreateMom}
              onConvertLead={onConvertLead}
              isViewer={isViewer}
              highlight={g.key === 'today'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingGroupTable({ title, icon: Icon, meetings, onOpen, onDelete, onCreateMom, onConvertLead, isViewer, highlight }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm ${
          highlight ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        }`}>
          <Icon size={14} />
        </span>
        <h3 className={`text-sm font-bold ${highlight ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>{title}</h3>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{meetings.length}</span>
      </div>
      <Card className={`overflow-hidden border shadow-md ${highlight ? 'border-blue-200/70 dark:border-blue-900/40' : 'border-slate-200/60 dark:border-slate-800/80'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-6 py-4 font-bold">Meeting</th>
                <th className="text-left px-6 py-4 font-bold">Name</th>
                <th className="text-center px-6 py-4 font-bold">Type</th>
                <th className="text-left px-6 py-4 font-bold">When</th>
                <th className="text-center px-6 py-4 font-bold">Mode</th>
                <th className="text-left px-6 py-4 font-bold">With</th>
                <th className="text-center px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {meetings.map(m => (
                <tr key={m.id} onClick={() => onOpen(m)} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 dark:text-slate-100">{m.title || 'Untitled meeting'}</div>
                    {m.agenda && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[220px]">{m.agenda}</div>}
                    {Array.isArray(m.attendees) && m.attendees.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5" title={m.attendees.join(', ')}>
                        <div className="flex -space-x-1.5">
                          {m.attendees.slice(0, 4).map(a => (
                            <span key={a} className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[7px] font-black ring-2 ring-white dark:ring-slate-900 ${avatarColor(a)}`}>{initials(a)}</span>
                          ))}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 ml-1 inline-flex items-center gap-0.5">
                          <Users size={10} /> {m.attendees.length}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={m.clientName || 'Meeting'} size="sm" />
                      <div>
                        <div className="text-slate-700 dark:text-slate-300 font-medium">{m.clientName || '—'}</div>
                        {m.pan && <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5 uppercase">{m.pan}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {m.leadId
                      ? <span className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ring-1 bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40">Lead</span>
                      : <span className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ring-1 bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40">Client</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">{fmtMeetingWhen(m)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ring-1 ${MODE_THEME[m.mode] || MODE_THEME.Online}`}>
                      {m.mode === 'Offline' ? <Building size={12} /> : <Globe size={12} />} {m.mode || 'Online'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{m.assignedTo || '—'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg ring-1 ${MEETING_STATUS_THEME[m.status] || MEETING_STATUS_THEME.Scheduled}`}>
                      {m.status || 'Scheduled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {m.status === 'Completed' && m.leadId && onConvertLead && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onConvertLead(m); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm hover:shadow-emerald-500/25"
                          title="Convert this lead to a client"
                        >
                          <CheckCircle2 size={14} /> Convert to Client
                        </button>
                      )}
                      {m.status === 'Completed' && onCreateMom && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onCreateMom(m); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm hover:shadow-cyan-500/25"
                          title="Create Minutes of Meeting for this client"
                        >
                          <FileText size={14} /> Create MOM
                        </button>
                      )}
                      {m.mode === 'Online' && m.link && m.status !== 'Completed' && (
                        <a
                          href={normalizeUrl(m.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm hover:shadow-blue-500/25"
                          title="Join the meeting"
                        >
                          <Video size={14} /> Join
                        </a>
                      )}
                      {/* Delete only shows when the matrix actually grants
                          meeting-delete (Admin-only by default). */}
                      {!isViewer && canDeleteMeeting(getCurrentUser(), m) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
                          className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete meeting"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
        active
          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CALENDAR VIEW — month grid with meeting chips on each day
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Ensure a meeting link is a usable absolute URL before opening it.
const normalizeUrl = (url) => {
  const u = (url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

function CalendarView({ meetings, onOpenMeeting, statusFilter, query }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [hover, setHover] = useState(null); // { meeting, top, left }
  const hideTimer = useRef(null);

  const showTip = (meeting, e) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    const r = e.currentTarget.getBoundingClientRect();
    const tipWidth = 256;
    let left = r.left;
    if (left + tipWidth > window.innerWidth - 12) left = window.innerWidth - tipWidth - 12;
    if (left < 12) left = 12;
    setHover({ meeting, top: r.bottom + 8, left });
  };
  // Delay the hide so the cursor can travel from the chip onto the tooltip
  // without it vanishing (classic hover-bridge behaviour).
  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(null), 160);
  };
  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const visibleMeetings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings
      .filter(m => statusFilter === 'all' || (m.status || 'Scheduled') === statusFilter)
      .filter(m => !q ||
        (m.title || '').toLowerCase().includes(q) ||
        (m.clientName || '').toLowerCase().includes(q) ||
        (m.assignedTo || '').toLowerCase().includes(q));
  }, [meetings, statusFilter, query]);

  // Group meetings by their date key (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const map = {};
    visibleMeetings.forEach(m => {
      if (!m.date) return;
      (map[m.date] = map[m.date] || []).push(m);
    });
    Object.values(map).forEach(list => list.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
    return map;
  }, [visibleMeetings]);

  // Build the 6-week grid of days for the current month
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const start = new Date(year, month, 1 - firstDay);
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [cursor]);

  const monthMeetingCount = useMemo(
    () => cells.filter(d => d.getMonth() === cursor.getMonth()).reduce((sum, d) => sum + (byDay[dayKey(d)]?.length || 0), 0),
    [cells, byDay, cursor]
  );

  const goPrev = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  const todayKey = dayKey(today);

  return (
    <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
      {/* Calendar header */}
      <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-slate-900 dark:to-slate-900">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Calendar size={17} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{monthMeetingCount} meeting{monthMeetingCount !== 1 ? 's' : ''} this month</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={goToday} className={btnSecondary + ' py-1.5 px-3 text-[11px]'}>Today</button>
          <button onClick={goPrev} title="Previous month" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-800 flex items-center justify-center transition-all cursor-pointer">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goNext} title="Next month" className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-800 flex items-center justify-center transition-all cursor-pointer">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const k = dayKey(d);
          const dayMeetings = byDay[k] || [];
          const isToday = k === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[104px] border-b border-r border-slate-100 dark:border-slate-800/80 p-1.5 flex flex-col gap-1 ${
                inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-950/30'
              } ${i % 7 === 0 ? 'border-l' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-blue-600 text-white shadow-sm'
                    : inMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-700'
                }`}>
                  {d.getDate()}
                </span>
                {dayMeetings.length > 0 && (
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{dayMeetings.length}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 overflow-hidden">
                {dayMeetings.slice(0, 3).map(m => {
                  const cancelled = m.status === 'Cancelled';
                  const done = m.status === 'Completed';
                  return (
                    <button
                      key={m.id}
                      onClick={(e) => {
                        const link = normalizeUrl(m.link);
                        if ((e.ctrlKey || e.metaKey) && m.mode === 'Online' && link) {
                          window.open(link, '_blank', 'noopener,noreferrer');
                        } else {
                          onOpenMeeting(m);
                        }
                      }}
                      onMouseEnter={(e) => showTip(m, e)}
                      onMouseLeave={scheduleHide}
                      title={m.mode === 'Online' && m.link ? 'Ctrl/⌘ + Click to join the meeting' : ''}
                      className={`w-full flex items-center gap-1 px-1 py-1 rounded-md text-[9px] font-semibold transition-all cursor-pointer hover:scale-[1.02] ${
                        cancelled
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400'
                          : done
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-black shrink-0 ${avatarColor(m.clientName || m.title || 'Meeting')}`}
                      >
                        {initials(m.clientName || m.title || 'M')}
                      </span>
                      <span className="tabular-nums font-bold">{m.time || ''}</span>
                      <span className={`truncate ${cancelled ? 'line-through' : ''}`}>{m.title || m.clientName || 'Meeting'}</span>
                    </button>
                  );
                })}
                {dayMeetings.length > 3 && (
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 pl-1">+{dayMeetings.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — pro-style detail popover (portaled to avoid clipping) */}
      {hover && createPortal(
        <div
          style={{ position: 'fixed', top: hover.top, left: hover.left, width: 256, zIndex: 9999 }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/80 shadow-2xl p-3.5 animate-fade-in"
        >
          <div className="flex items-center gap-2.5 pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
            <Avatar name={hover.meeting.clientName || hover.meeting.title || 'Meeting'} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{hover.meeting.clientName || '—'}</div>
              {hover.meeting.pan && <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase">{hover.meeting.pan}</div>}
            </div>
            <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md ring-1 shrink-0 ${MEETING_STATUS_THEME[hover.meeting.status] || MEETING_STATUS_THEME.Scheduled}`}>
              {hover.meeting.status || 'Scheduled'}
            </span>
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">{hover.meeting.title || 'Untitled meeting'}</div>
          <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5"><Clock size={11} className="text-slate-400 shrink-0" /> {fmtMeetingWhen(hover.meeting)}</div>
            <div className="flex items-center gap-1.5">
              {hover.meeting.mode === 'Offline' ? <Building size={11} className="text-slate-400 shrink-0" /> : <Globe size={11} className="text-slate-400 shrink-0" />}
              {hover.meeting.mode || 'Online'}
              {hover.meeting.mode === 'Offline' && hover.meeting.location && <span className="truncate">· {hover.meeting.location}</span>}
            </div>
            {hover.meeting.assignedTo && <div className="flex items-center gap-1.5"><User size={11} className="text-slate-400 shrink-0" /> With {hover.meeting.assignedTo}</div>}
            {Array.isArray(hover.meeting.attendees) && hover.meeting.attendees.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Users size={11} className="text-slate-400 shrink-0" />
                <div className="flex -space-x-1.5">
                  {hover.meeting.attendees.slice(0, 5).map(a => (
                    <span key={a} className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[7px] font-black ring-2 ring-white dark:ring-slate-900 ${avatarColor(a)}`}>{initials(a)}</span>
                  ))}
                </div>
                {hover.meeting.attendees.length > 5 && <span className="text-[10px] font-semibold">+{hover.meeting.attendees.length - 5}</span>}
              </div>
            )}
            {hover.meeting.agenda && <div className="flex items-start gap-1.5 pt-1 text-slate-500 dark:text-slate-500"><CalendarDays size={11} className="text-slate-400 shrink-0 mt-0.5" /> <span className="line-clamp-2">{hover.meeting.agenda}</span></div>}
          </div>
          {hover.meeting.mode === 'Online' && hover.meeting.link && (
            <a
              href={normalizeUrl(hover.meeting.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[11px] font-bold transition-all cursor-pointer"
            >
              <Video size={13} /> Join Meeting
            </a>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[9px] text-slate-400 dark:text-slate-500 font-medium">
            {hover.meeting.mode === 'Online' && hover.meeting.link
              ? <>Tip: <span className="font-bold">Ctrl/⌘ + Click</span> the chip to join · Click to open details</>
              : <>Click the chip to open details</>}
          </div>
        </div>,
        document.body
      )}
    </Card>
  );
}

// ===========================================================================
// MEETING FORM MODAL — schedule / edit / reschedule / mark-done
//   `initial` with an `id` → edit an existing meeting
//   `initial` without an `id` (but maybe clientId prefilled) → new meeting
//   `lockClient` → client picker is fixed (used when scheduling from a profile)
// ===========================================================================
export function MeetingFormModal({ initial, clients = [], isViewer, lockClient = false, onCreateMom, onConvertLead, onClose, onSave }) {
  const isEdit = Boolean(initial?.id);
  const isLeadMeeting = !!initial?.leadId;
  const [isEditingMode, setIsEditingMode] = useState(!isEdit);

  const [title, setTitle] = useState(initial?.title || '');
  const [agenda, setAgenda] = useState(initial?.agenda || '');
  const [groupLeaderId, setGroupLeaderId] = useState(initial?.clientId || initial?.groupLeaderId || '');
  const [date, setDate] = useState(initial?.date || '');
  const [time, setTime] = useState(initial?.time || '');
  const [mode, setMode] = useState(initial?.mode || 'Online');
  const [link, setLink] = useState(initial?.link || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo || '');
  const [status, setStatus] = useState(initial?.status || 'Scheduled');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [history, setHistory] = useState(Array.isArray(initial?.history) ? initial.history : []);
  const [attendees, setAttendees] = useState(Array.isArray(initial?.attendees) ? initial.attendees : []);
  const [copied, setCopied] = useState(false);

  // Reschedule sub-panel
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(initial?.date || '');
  const [newTime, setNewTime] = useState(initial?.time || '');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const groupLeaders = useMemo(
    () => clients.map(c => ({ id: c.id, name: c.name, pan: c.pan })),
    [clients]
  );
  const selectedClient = useMemo(
    () => clients.find(c => c.id === groupLeaderId) || null,
    [clients, groupLeaderId]
  );

  const clientName = selectedClient?.name || initial?.clientName || '';
  const pan = selectedClient?.pan || initial?.pan || '';

  // Attendee suggestions: team members only, minus whoever's already on the list.
  const attendeeSuggestions = useMemo(() => {
    const seen = new Set(attendees.map(a => a.toLowerCase()));
    return loadTeam().map(m => m.name).filter(t => t && !seen.has(t.toLowerCase()));
  }, [attendees]);

  const addAttendee = (name) => {
    const n = (name || '').trim();
    if (!n) return;
    if (attendees.some(a => a.toLowerCase() === n.toLowerCase())) return;
    setAttendees(prev => [...prev, n]);
  };
  const removeAttendee = (name) => setAttendees(prev => prev.filter(a => a !== name));

  // Build a clean, paste-ready meeting summary to share with the client.
  const buildShareText = () => {
    const lines = ['📅 *Meeting Invitation — Team Fintness*', ''];
    if (title.trim()) lines.push(`*${title.trim()}*`);
    if (clientName) lines.push(`👤 Client: ${clientName}`);
    if (date && time) {
      lines.push(`🗓 When: ${fmtMeetingWhen({ date, time })}`);
    } else if (date) {
      lines.push(`🗓 Date: ${date}`);
    }
    lines.push(`💻 Mode: ${mode}`);
    if (mode === 'Online' && link.trim()) lines.push(`🔗 Join Link: ${normalizeUrl(link)}`);
    if (mode === 'Offline' && location.trim()) lines.push(`📍 Location: ${location.trim()}`);
    if (assignedTo) lines.push(`👔 Hosted by: ${assignedTo}`);
    if (attendees.length) lines.push(`🧑‍🤝‍🧑 Attendees: ${attendees.join(', ')}`);
    if (agenda.trim()) lines.push('', `📝 Purpose: ${agenda.trim()}`);
    lines.push('', 'Looking forward to connecting with you!', '— Team Fintness');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // RBAC gating (mirrors the server): only the creator, the host, or an
  // attendee (or Admin/Internal Manager per the matrix) may edit / mark-done /
  // cancel / reschedule. Everyone else may only view. Legacy meetings with no
  // createdBy fall back to editable (predates this restriction).
  const me = getCurrentUser();
  const canEditThis = !isEdit || isAdmin(me) || !initial?.createdBy || canEditMeeting(me, initial);
  const canSave = !isViewer && canEditThis && clientName && title.trim() && date && time;

  const buildMeeting = (overrides = {}) => ({
    id: initial?.id || uid(),
    leadId: initial?.leadId || undefined,
    clientId: groupLeaderId,
    clientName,
    pan,
    title: title.trim(),
    agenda: agenda.trim(),
    date,
    time,
    mode,
    link: mode === 'Online' ? link.trim() : '',
    location: mode === 'Offline' ? location.trim() : '',
    assignedTo,
    attendees,
    status,
    notes: notes.trim(),
    history,
    createdAt: initial?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const handleSave = () => {
    if (!canSave) return;
    onSave(buildMeeting());
  };

  const handleMarkDone = () => {
    const log = { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', action: 'Completed', text: 'Meeting marked as done' };
    onSave(buildMeeting({ status: 'Completed', history: [...history, log] }));
  };

  const handleCancelMeeting = () => {
    if (!window.confirm('Mark this meeting as cancelled?')) return;
    const log = { at: new Date().toISOString(), by: getCurrentUser()?.name || 'System', action: 'Cancelled', text: 'Meeting cancelled' };
    onSave(buildMeeting({ status: 'Cancelled', history: [...history, log] }));
  };

  const handleConfirmReschedule = () => {
    if (!newDate || !newTime) {
      alert('Please pick a new date and time to reschedule.');
      return;
    }
    if (!rescheduleReason.trim()) {
      alert('Please add a reason for rescheduling.');
      return;
    }
    const fromLabel = `${date || '—'} ${time || ''}`.trim();
    const toLabel = `${newDate} ${newTime}`;
    const log = {
      at: new Date().toISOString(),
      by: getCurrentUser()?.name || 'System',
      action: 'Rescheduled',
      text: `Rescheduled from ${fromLabel} to ${toLabel} | ${rescheduleReason.trim()}`,
    };
    // Mutate THIS meeting's date/time — keeps the same id, stays Scheduled.
    onSave(buildMeeting({ date: newDate, time: newTime, status: 'Scheduled', history: [...history, log] }));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {isEdit ? <Pencil size={15} /> : <Plus size={16} />}
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {isEdit ? 'Meeting Details' : 'Schedule Meeting'}
            </h3>
            {isEdit && (
              <span className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ring-1 ${MEETING_STATUS_THEME[status] || MEETING_STATUS_THEME.Scheduled}`}>
                {status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Client *" hint={lockClient ? 'Locked to this client' : 'The client this meeting is with'}>
              {lockClient ? (
                <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Avatar name={clientName} size="sm" /> {clientName || '—'}
                </div>
              ) : (
                <CoolSelect
                  showValueOnSelect={false}
                  value={groupLeaderId}
                  onChange={(e) => setGroupLeaderId(e.target.value)}
                  className={selectCls}
                  disabled={!isEditingMode}
                >
                  <option value="">Select client…</option>
                  {groupLeaders.map(g => <option key={g.id} value={g.id}>{g.name}{g.pan ? ` — ${g.pan}` : ''}</option>)}
                </CoolSelect>
              )}
            </Field>
            <Field label="Meeting With" hint={isLeadMeeting ? 'Fixed to the RM assigned to this lead' : 'Advisor / team member'}>
              {isLeadMeeting ? (
                <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Avatar name={assignedTo} size="sm" /> {assignedTo || '—'}
                </div>
              ) : (
                <CoolSelect value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls} disabled={!isEditingMode}>
                  <option value="">Select team member…</option>
                  {loadTeam().map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </CoolSelect>
              )}
            </Field>

            <div className="md:col-span-2">
              <Field label="Meeting Title *">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Portfolio Review &amp; Goal Planning" className={inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
              </Field>
            </div>

            <Field label="Date *">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
            </Field>
            <Field label="Time *">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
            </Field>

            <Field label="Mode *">
              <CoolSelect value={mode} onChange={(e) => setMode(e.target.value)} className={selectCls} disabled={!isEditingMode}>
                {MEETING_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </CoolSelect>
            </Field>
            {mode === 'Online' ? (
              <Field label="Meeting Link" hint="Zoom / Google Meet / Teams">
                <div className="relative">
                  <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" className={inputCls + ' pl-9' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
                </div>
              </Field>
            ) : (
              <Field label="Location" hint="Office / venue address">
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Team Fintness Office, Jaipur" className={inputCls + ' pl-9' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
                </div>
              </Field>
            )}

            {/* Attendees — pick from a dropdown of the client, family & team */}
            <div className="md:col-span-2">
              <Field label="Attendees" hint="Select everyone who will be present">
                <CoolSelect
                  value=""
                  onChange={(e) => addAttendee(e.target.value)}
                  className={selectCls}
                  placeholder={attendeeSuggestions.length ? 'Select attendees…' : 'Everyone added'}
                  emptyHint="No more people to add"
                  disabled={!isEditingMode}
                >
                  <option value="">Select an attendee to add…</option>
                  {attendeeSuggestions.map(s => <option key={s} value={s}>{s}</option>)}
                </CoolSelect>

                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {attendees.map(a => (
                      <span key={a} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200/60 dark:ring-blue-900/40 text-[11px] font-bold">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-black ${avatarColor(a)}`}>{initials(a)}</span>
                        {a}
                        {isEditingMode && (
                          <button type="button" onClick={() => removeAttendee(a)} className="text-blue-400 hover:text-rose-500 transition-colors cursor-pointer ml-0.5"><X size={11} /></button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Agenda / Notes">
                <textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="What's this meeting about?" className={inputCls + ' resize-y' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
              </Field>
            </div>
          </div>

          {/* Copy & Share — paste-ready meeting summary for the client */}
          {clientName && title.trim() && date && time && (
            <div className="p-4 rounded-2xl border border-blue-200/70 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/15 dark:to-slate-950/20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Send size={13} /> Share with Client
                </h4>
                <button onClick={handleCopy} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm ${copied ? 'bg-emerald-600 text-white' : 'bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'}`}>
                  {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-sans bg-white/70 dark:bg-slate-950/40 rounded-xl p-3 border border-slate-200/60 dark:border-slate-800/60 max-h-44 overflow-y-auto">{buildShareText()}</pre>
            </div>
          )}

          {/* Reschedule sub-panel */}
          {isEdit && rescheduling && (
            <div className="p-4 rounded-2xl border border-blue-200/70 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/15 space-y-3 animate-scale-up">
              <h4 className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <RotateCcw size={13} /> Reschedule this meeting
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="New Date *">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputCls} />
                </Field>
                <Field label="New Time *">
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Reason for rescheduling *">
                <input value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} placeholder="e.g. Client requested a later slot" className={inputCls} />
              </Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setRescheduling(false); setRescheduleReason(''); }} className={btnGhost + ' py-1.5 px-3 text-[11px]'}>Cancel</button>
                <button onClick={handleConfirmReschedule} className={btnPrimary + ' py-1.5 px-3 text-[11px]'}>
                  <RotateCcw size={12} /> Confirm Reschedule
                </button>
              </div>
            </div>
          )}

          {/* Completed notes */}
          {isEdit && status === 'Completed' && (
            <Field label="Meeting Outcome / Minutes">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed / decided?" className={inputCls + ' resize-y' + (!isEditingMode ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} disabled={!isEditingMode} />
            </Field>
          )}

          {/* History log */}
          {isEdit && history.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Activity Log</h4>
              <div className="relative pl-5 space-y-3 before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:bg-slate-100 dark:before:bg-slate-800/80">
                {[...history].reverse().map((h, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[16px] top-1 w-3 h-3 rounded-full bg-white dark:bg-slate-900 border-2 border-blue-500 dark:border-blue-400 z-10" />
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 font-medium break-words">{h.text}</div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                      {fmtMeetingStamp(h.at)}{h.by && <span className="text-blue-500 dark:text-blue-400 font-semibold ml-1.5">• {h.by}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Mark-done/reschedule/cancel are the same "edit" right as the
                fields above — creator, host, attendee, or Admin/Internal
                Manager per the matrix. Everyone else (view-only) doesn't see
                these, since the server would reject them anyway. */}
            {isEdit && status === 'Scheduled' && !isViewer && canEditThis && (
              <>
                <button onClick={handleMarkDone} className={btnSecondary + ' py-2 px-3 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50'}>
                  <CheckCircle2 size={14} /> Mark as Done
                </button>
                <button onClick={() => setRescheduling(r => !r)} className={btnSecondary + ' py-2 px-3'}>
                  <RotateCcw size={14} /> Reschedule
                </button>
                <button onClick={handleCancelMeeting} className={btnGhost + ' py-2 px-3 text-rose-600 dark:text-rose-400'}>
                  <XCircle size={14} /> Cancel Meeting
                </button>
              </>
            )}
            {isEdit && status === 'Completed' && isLeadMeeting && onConvertLead && (
              <button
                onClick={() => onConvertLead(buildMeeting())}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-lg shadow-emerald-500/15 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <CheckCircle2 size={14} /> Convert to Client
              </button>
            )}
            {isEdit && status === 'Completed' && onCreateMom && (
              <button
                onClick={() => onCreateMom(buildMeeting())}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-xl shadow-lg shadow-cyan-500/15 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <FileText size={14} /> Create MOM
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Close</button>
            {!isViewer && (
              isEditingMode ? (
                <button onClick={handleSave} disabled={!canSave} className={btnPrimary}>
                  {isEdit ? 'Save Changes' : 'Schedule Meeting'}
                </button>
              ) : (
                // Only the creator/host/attendee (or Admin/Internal Manager)
                // sees an Edit button — everyone else viewing this meeting
                // (matrix view is broad) gets Close only.
                canEditThis && (
                  <button onClick={() => setIsEditingMode(true)} className={btnPrimary}>
                    <Pencil size={14} /> Edit Meeting
                  </button>
                )
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
