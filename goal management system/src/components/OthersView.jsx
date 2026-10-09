import { Card } from './UI';
import TopPerformingSchemes from './TopPerformingSchemes';
import PlanningSandbox from './PlanningSandbox';
import AssetTaxationGuide from './AssetTaxationGuide';
import Calculators from './Calculators';
import { canTopSchemes } from '../utils/permissions';

// Sub-tab is controlled by the sidebar flyout → App.jsx → here via `subTab` prop.
export default function OthersView({ subTab = 'other_tools' }) {
  const activeSubTab = subTab;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header — the Top Schemes module carries its own heading, so the
          generic one is shown only for the tools that don't. */}
      {activeSubTab === 'other_tools' && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Others Module</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Access utility tools.</p>
        </div>
      )}

      {/* ====================================================================
          TOP PERFORMING SCHEMES TAB
          ==================================================================== */}
      {activeSubTab === 'top_schemes' && (canTopSchemes('view') ? <TopPerformingSchemes /> : (
        // The sidebar already hides it without View; this covers a tab left
        // open when an admin takes the right away.
        <Card className="p-10 text-center">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">You don't have access to Top Performing Schemes.</p>
          <p className="text-xs text-slate-400 mt-1">Ask an Admin to grant it in the Permission Matrix.</p>
        </Card>
      ))}

      {/* ====================================================================
          GOAL PLANNER / ASSET ALLOCATION — client-free demo copies of the
          client profile's Goal Mapping and Asset Allocation Mapping
          ==================================================================== */}
      {activeSubTab === 'goal_planner' && <PlanningSandbox mode="goals" />}
      {activeSubTab === 'asset_planner' && <PlanningSandbox mode="assets" />}

      {/* ASSET TAXATION GUIDE — read-only reference (utils/assetTaxation.js) */}
      {activeSubTab === 'tax_guide' && <AssetTaxationGuide />}

      {/* CALCULATOR — SIP, Lumpsum and the planning calculators (Calculators.jsx) */}
      {activeSubTab === 'other_tools' && <Calculators />}
    </div>
  );
}
