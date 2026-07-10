import React from 'react';
import PolicyReview from './PolicyReview';
import PortfolioReview from './PortfolioReview';

// Tab switcher for the client "Review" workspace — Policy Review (existing)
// first, Portfolio Review (new) second. Mirrors ProposalWorkspace.jsx's tab
// pattern exactly.
export default function ReviewWorkspace({ client, subTab, setSubTab }) {
  const tabs = [
    { id: 'policy', label: 'Policy Review' },
    { id: 'portfolio', label: 'Portfolio Review' },
  ];
  const activeTab = tabs.some((t) => t.id === subTab) ? subTab : tabs[0].id;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab Switcher */}
      <div className="no-print flex items-center gap-2 p-1 bg-slate-100/80 dark:bg-slate-950/40 rounded-xl max-w-2xl shadow-inner border border-slate-200/20 dark:border-slate-800/40">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
              activeTab === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm font-extrabold'
                : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Render Sub-Tool */}
      <div className="mt-4">
        {activeTab === 'policy' ? (
          <PolicyReview key={client?.id || 'global'} client={client} />
        ) : (
          <PortfolioReview key={client?.id || 'global'} client={client} />
        )}
      </div>
    </div>
  );
}
