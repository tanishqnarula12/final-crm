import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, UserPlus, ListChecks, FolderOpen, UserCheck, LayoutDashboard, Video, TrendingUp, MoreHorizontal, Calculator, FileSpreadsheet, HelpCircle } from 'lucide-react';
import logoImg from '../assets/logo.png';

const NAV = [
  { id: 'dashboard', label: 'Dash', icon: LayoutDashboard },
  { id: 'leads', label: 'Leads', icon: UserPlus },
  { id: 'clients', label: 'Client', icon: Users },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'cobr', label: 'COBR', icon: FileSpreadsheet },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'documents', label: 'Docs', icon: FolderOpen },
  { id: 'prospects', label: 'Prospect', icon: UserCheck },
  { id: 'queries', label: 'Queries', icon: HelpCircle },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'others', label: 'Others', icon: MoreHorizontal },
];

const OTHERS_TOOLS = [
  { id: 'other_tools', label: 'Calculator', icon: Calculator, gradient: 'from-blue-500 to-indigo-600' },
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
      className="no-print sticky top-0 h-screen flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/70 dark:border-slate-800/70 z-30 shrink-0 shadow-md dark:shadow-none overflow-hidden"
    >
      <div className="flex flex-col h-full w-full py-6 justify-between items-center min-h-0">
        {/* Logo */}
        <div className="flex flex-col items-center shrink-0 w-full mb-6">
          <img
            src={logoImg}
            className="h-10 w-10 object-contain rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-sm"
            alt="Team Fintness"
          />
        </div>

        {/* Nav */}
        <nav className="w-full px-2 space-y-4 flex-1 flex flex-col items-center overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-h-0 py-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active    = view === id;
            const badge     = badges[id] || 0;
            const isOthers  = id === 'others';

            const btn = (
              <button
                ref={isOthers ? othersRef : undefined}
                onClick={() => { setView(id); }}
                onDoubleClick={() => onNavDoubleClick && onNavDoubleClick(id)}
                className={`dock-item w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative ${
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
            {OTHERS_TOOLS.map(({ id: tid, label: tlabel, icon: TIcon, gradient }) => {
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
