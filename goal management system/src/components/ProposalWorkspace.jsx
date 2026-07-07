import React from 'react';
import InsuranceProposal from './InsuranceProposal';
import InvestmentProposal from './InvestmentProposal';
import { Card } from './UI';
import { ShieldAlert } from 'lucide-react';
import { canDo } from '../utils/permissions';

// RBAC: only show the tabs this account is actually allowed to create in.
// "Other Code" is a variant of the Investment flow, so it's gated the same
// as Investment Proposal. If nothing is allowed (e.g. a plain Internal User
// with no elevated role), show a clear "no access" state instead of a blank
// screen — never a workspace whose buttons quietly do nothing.
export default function ProposalWorkspace({ client, subTab, setSubTab, isViewer }) {
  // Pass `client` as the record so a contextual RM (set as this client's
  // Relationship Manager in Client Profile / Internal Team Assignments) gets
  // their ASSIGNED-scope rights recognized here — without it, "RM: Assigned"
  // in the matrix could never resolve, since there'd be no client to check.
  const mayInsurance = canDo('insuranceProposal', 'create', client);
  const mayInvestment = canDo('investmentProposal', 'create', client);
  const tabs = [
    { id: 'insurance', label: 'Insurance Proposal', allowed: mayInsurance },
    { id: 'investment', label: 'Investment Proposal', allowed: mayInvestment },
    { id: 'othercode', label: 'Other Code', allowed: mayInvestment },
  ].filter((t) => t.allowed);

  if (tabs.length === 0) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <ShieldAlert size={28} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">You don't have access to create proposals.</p>
        <p className="text-xs text-slate-400 mt-1">Ask an Admin to grant Investment or Insurance Proposal rights in the Permission Matrix.</p>
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
        {activeTab === 'insurance' ? (
          <InsuranceProposal key={client?.id || 'global'} client={client} isViewer={isViewer} />
        ) : activeTab === 'othercode' ? (
          <InvestmentProposal key={`othercode-${client?.id || 'global'}`} client={client} isViewer={isViewer} variant="othercode" />
        ) : (
          <InvestmentProposal key={client?.id || 'global'} client={client} isViewer={isViewer} />
        )}
      </div>
    </div>
  );
}
