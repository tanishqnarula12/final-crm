import React from 'react';
import { ShieldAlert } from 'lucide-react';
import PolicyReview from './PolicyReview';
import PortfolioReview from './PortfolioReview';
import { Card } from './UI';
import { can } from '../utils/permissions';

// Tab switcher for the client "Review" workspace — Policy Review (existing)
// first, Portfolio Review (new) second. Mirrors ProposalWorkspace.jsx's tab
// pattern exactly. Each tab shows only if the matrix's View row for it allows
// this client.
export default function ReviewWorkspace({ client, subTab, setSubTab }) {
  const tabs = [
    { id: 'policy', label: 'Policy Review', allowed: can('policyReview', 'view', client) },
    { id: 'portfolio', label: 'Portfolio Review', allowed: can('portfolioReview', 'view', client) },
  ].filter((t) => t.allowed);

  if (tabs.length === 0) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <ShieldAlert size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">You don't have access to reviews for this client.</p>
        <p className="text-xs text-slate-400 mt-1">Ask an Admin to grant Policy Review or Portfolio Review rights in the Permission Matrix.</p>
      </Card>
    );
  }

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
