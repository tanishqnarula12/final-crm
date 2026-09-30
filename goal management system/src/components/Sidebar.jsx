import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, UserPlus, ListChecks, FolderOpen, UserCheck, LayoutDashboard, Video, TrendingUp, MoreHorizontal, Calculator, FileSpreadsheet, HelpCircle, Trophy, Target, PieChart } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { canTopSchemes } from '../utils/permissions';
import { useBackLayer } from '../utils/backNav';

const NAV = [
  { id: 'dashboard', label: 'Dash', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'clients', label: 'Client', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'prospects', label: 'Prospect', icon: UserCheck },
  // "cobr" (the internal id/view key, unchanged elsewhere) now covers COBR,
  // Renewals, Claims, Fixed Deposits and Other Insurance Policies — this is
  // the post-sale client-servicing workspace, not just Change of Broker
  // requests, so the label reflects the whole thing rather than one tab.
  { id: 'cobr', label: 'Servicing', icon: FileSpreadsheet },
  { id: 'queries', label: 'Queries', icon: HelpCircle },
  { id: 'documents', label: 'Docs', icon: FolderOpen },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'others', label: 'Others', icon: MoreHorizontal },
];

const OTHERS_TOOLS = [
  { id: 'other_tools', label: 'Calculator', icon: Calculator, gradient: 'from-blue-500 to-indigo-600' },
  { id: 'top_schemes', label: 'Top Schemes', icon: Trophy, gradient: 'from-amber-500 to-orange-600' },
  { id: 'goal_planner', label: 'Goal Planner', icon: Target, gradient: 'from-emerald-500 to-teal-600' },
  { id: 'asset_planner', label: 'Asset Alloc.', icon: PieChart, gradient: 'from-violet-500 to-purple-600' },
];

export default function Sidebar({ view, setView, onNavDoubleClick, badges = {}, onSelectOthersTab, othersSubTab }) {
  const [othersOpen, setOthersOpen] = useState(false);
  // Position of the flyout (fixed, relative to viewport)
  const [flyoutY, setFlyoutY] = useState(0);
  const othersRef = useRef(null);
  const closeTimer = useRef(null);

  const openFlyout = () => {
    clearTimeout(closeTimer.current);
    if (othersRef.current) {
      const rect = othersRef.current.getBoundingClientRect();
      // Centre the flyout on the button vertically
      setFlyoutY(rect.top + rect.height / 2);
    }
    setOthersOpen(true);
  };
  const closeFlyout = () => {
    closeTimer.current = setTimeout(() => setOthersOpen(false), 130);
  };

  return (
    <aside
      style={{ width: '64px' }}
      className="no-print sticky top-0 h-screen hidden md:flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/70 dark:border-slate-800/70 z-30 shrink-0 shadow-md dark:shadow-none overflow-hidden"
    >
      {/* Short screens (a phone or small tablet on its side): no logo and
          tighter spacing, so most of the modules fit without scrolling. */}
      <div className="flex flex-col h-full w-full py-6 [@media(max-height:520px)]:py-2 justify-between items-center min-h-0">
        {/* Logo */}
        <div className="flex flex-col items-center shrink-0 w-full mb-6 [@media(max-height:520px)]:hidden">
          <img
            src={logoImg}
            className="h-10 w-10 object-contain rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-sm"
            alt="Team Fintness"
          />
        </div>

        {/* Nav */}
        <nav className="w-full px-2 space-y-4 [@media(max-height:520px)]:space-y-1 flex-1 flex flex-col items-center overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-0 py-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active    = view === id;
            const badge     = badges[id] || 0;
            const isOthers  = id === 'others';

            const btn = (
              <button
                ref={isOthers ? othersRef : undefined}
                data-nav={id}
                onClick={() => { setView(id); }}
                onDoubleClick={() => onNavDoubleClick && onNavDoubleClick(id)}
                className={`dock-item w-12 h-12 [@media(max-height:520px)]:h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative ${
                  active
                    ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 dark:border-blue-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className="text-[8px] font-bold mt-1 tracking-tight leading-none">{label}</span>
                {badge > 0 && (
                  <span className="absolute top-1 right-1.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[8px] font-black rounded-full bg-rose-500 text-white ring-2 ring-white dark:ring-slate-900">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            );

            if (!isOthers) {
              return (
                <div key={id} className="dock-item-container relative flex items-center justify-center w-full">
                  {btn}
                </div>
              );
            }

            // ── Others — hover wrapper (triggers the portal flyout) ────────
            return (
              <div
                key={id}
                className="dock-item-container relative flex items-center justify-center w-full"
                onMouseEnter={openFlyout}
                onMouseLeave={closeFlyout}
              >
                {btn}
              </div>
            );
          })}
        </nav>
      </div>

      {/* ── Flyout rendered into <body> so it escapes sidebar overflow ─────── */}
      {othersOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: flyoutY,
            left: 76,          // sidebar width (64) + 12px gap
            transform: 'translateY(-50%)',
            zIndex: 9999,
          }}
          onMouseEnter={openFlyout}
          onMouseLeave={closeFlyout}
        >
          {/* Arrow pointer */}
          <div
            style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%) rotate(-45deg)' }}
            className="w-3 h-3 bg-white dark:bg-slate-900 border-l border-t border-slate-200/70 dark:border-slate-700/60"
          />

          {/* Glass card */}
          <div className="bg-white/90 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200/70 dark:border-slate-700/60 shadow-2xl shadow-slate-900/20 dark:shadow-slate-950/70 rounded-2xl p-2 flex flex-row gap-1.5 animate-scale-up">
            {/* Top Schemes follows the matrix's Top Performing Schemes → View. */}
            {OTHERS_TOOLS.filter((t) => t.id !== 'top_schemes' || canTopSchemes('view')).map(({ id: tid, label: tlabel, icon: TIcon, gradient }) => {
              const isActive = view === 'others' && othersSubTab === tid;
              return (
                <button
                  key={tid}
                  onClick={() => {
                    setView('others');
                    onSelectOthersTab && onSelectOthersTab(tid);
                    setOthersOpen(false);
                  }}
                  style={{ width: 64, height: 64 }}
                  className={`
                    flex-shrink-0 flex flex-col items-center justify-center gap-1.5 rounded-xl
                    transition-all duration-150 cursor-pointer select-none
                    ${isActive
                      ? `bg-gradient-to-br ${gradient} text-white shadow-md`
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}
                  `}
                >
                  <TIcon size={18} />
                  <span className="text-[9px] font-bold tracking-wide">{tlabel}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}

// ── Phones (below md): a bottom tab bar instead of the side rail ────────────
// Four main modules plus "More", which opens a sheet with every other module
// and the Others tools. Tablets and up keep the rail above.
const PRIMARY = ['dashboard', 'leads', 'clients', 'tasks'];
const MOBILE_LABEL = { clients: 'Clients', prospects: 'Prospects', documents: 'Documents' };

export function MobileNav({ view, setView, badges = {}, onSelectOthersTab, othersSubTab }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  useBackLayer(sheetOpen, () => setSheetOpen(false));
  const primary = NAV.filter((n) => PRIMARY.includes(n.id));
  const rest = NAV.filter((n) => !PRIMARY.includes(n.id) && n.id !== 'others');
  const tools = OTHERS_TOOLS.filter((t) => t.id !== 'top_schemes' || canTopSchemes('view'));
  const moreActive = sheetOpen || rest.some((n) => n.id === view) || view === 'others';
  const moreBadge = rest.reduce((sum, n) => sum + (badges[n.id] || 0), 0);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [sheetOpen]);

  const go = (id) => { setSheetOpen(false); setView(id); };
  const badgeEl = (n) => n > 0 && (
    <span className="absolute -top-1 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-black rounded-full bg-rose-500 text-white ring-2 ring-white dark:ring-slate-900">
      {n > 99 ? '99+' : n}
    </span>
  );
  const tab = (id, label, Icon, active, badge, onClick) => (
    <button
      key={id}
      data-nav={id}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="relative flex flex-col items-center justify-center gap-1 min-w-0 cursor-pointer select-none"
    >
      <span className={`relative w-12 h-7 rounded-full flex items-center justify-center transition-colors ${
        active ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
      }`}>
        <Icon size={19} />
        {badgeEl(badge)}
      </span>
      <span className={`text-[10px] font-bold leading-none truncate max-w-full px-0.5 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {label}
      </span>
    </button>
  );

  return (
    <>
      <nav className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/70 dark:border-slate-800/70 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-16 px-1">
          {primary.map(({ id, label, icon }) => tab(id, MOBILE_LABEL[id] || label, icon, view === id && !sheetOpen, badges[id] || 0, () => go(id)))}
          {tab('more', 'More', MoreHorizontal, moreActive, moreBadge, () => setSheetOpen((o) => !o))}
        </div>
      </nav>

      {sheetOpen && createPortal(
        <div className="md:hidden fixed inset-0 z-[35]">
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200/70 dark:border-slate-800 shadow-2xl animate-slide-up px-4 pt-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-2">Modules</p>
            <div className="grid grid-cols-4 gap-1.5 mb-5">
              {rest.map(({ id, label, icon: Icon }) => {
                const active = view === id;
                return (
                  <button
                    key={id}
                    data-nav-sheet={id}
                    onClick={() => go(id)}
                    className="relative flex flex-col items-center gap-1.5 py-2 rounded-2xl active:bg-slate-100 dark:active:bg-slate-800 cursor-pointer select-none min-w-0"
                  >
                    <span className={`relative w-12 h-12 rounded-2xl flex items-center justify-center ${
                      active ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}>
                      <Icon size={20} />
                      {badgeEl(badges[id] || 0)}
                    </span>
                    <span className={`text-[11px] font-semibold leading-tight text-center truncate max-w-full ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {MOBILE_LABEL[id] || label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-1 mb-2">Tools</p>
            <div className="grid grid-cols-4 gap-1.5">
              {tools.map(({ id: tid, label: tlabel, icon: TIcon, gradient }) => {
                const active = view === 'others' && othersSubTab === tid;
                return (
                  <button
                    key={tid}
                    data-nav-sheet={tid}
                    onClick={() => { setSheetOpen(false); setView('others'); onSelectOthersTab && onSelectOthersTab(tid); }}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl active:bg-slate-100 dark:active:bg-slate-800 cursor-pointer select-none min-w-0"
                  >
                    <span className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br ${gradient} text-white shadow-md ${active ? 'ring-2 ring-offset-2 ring-blue-500 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
                      <TIcon size={20} />
                    </span>
                    <span className={`text-[11px] font-semibold leading-tight text-center truncate max-w-full ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {tlabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
