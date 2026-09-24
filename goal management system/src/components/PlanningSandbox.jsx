// Goal Planner & Asset Allocation demo tools (Others → Goal Planner /
// Asset Allocation).
//
// The exact same screens as a client's Goal Mapping and Asset Allocation
// Mapping — ClientDetail, GoalDetail, GoalFormModal, AssetAllocationDetail and
// AssetAllocationModal, all reused untouched — but driven by a throwaway demo
// client instead of a saved one, so an RM can walk a client or a lead through
// the calculations in a meeting without first creating a client record.
//
// Nothing here ever reaches the server. Every handler below is the local-state
// twin of App.jsx's handleAddGoal / handleUpdateGoal / handleDeleteGoal /
// handleSaveAssumptions / handleSaveAllocation, including the same edit-history
// bookkeeping, so the change logs and every number behave identically.
//
// Both tools share ONE demo client, so assets entered under Asset Allocation
// can be mapped to goals in the Goal Planner exactly as for a real client. It
// autosaves on every change to this browser's localStorage (kept per signed-in
// user, so two people sharing a machine don't see each other's demo) — a
// reload, switching modules or closing the browser mid-meeting loses nothing.
// "Refresh" wipes it back to a blank demo in one click.
import React, { useEffect, useMemo, useState } from 'react';
import { Presentation, RefreshCw, X } from 'lucide-react';
import ClientDetail from './ClientDetail';
import GoalDetail from './GoalDetail';
import { GoalFormModal } from './Modals';
import { AssetAllocationDetail } from './AssetAllocation';
import AssetAllocationModal from './AssetAllocationModal';
import { Field, inputCls, btnPrimary, btnGhost, btnSecondary } from './UI';
import { calcGoal, uid, buildGoalEdits } from '../utils/calc';
import { normalizeAllocation, buildAllocationEdits } from '../utils/assets';
import { getCurrentUser } from '../utils/auth';

const storageKey = () => `crm:planningSandbox:${getCurrentUser()?.id || 'anon'}`;

const blankClient = () => ({
  id: 'planning-sandbox',
  name: 'Prospective Client',
  pan: '',
  age: '',
  goals: [],
  assetAllocation: null,
  assumptions: '',
});

function loadSandbox() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return { ...blankClient(), ...JSON.parse(raw) };
  } catch { /* storage blocked or corrupt — start fresh */ }
  return blankClient();
}

function saveSandbox(client) {
  try { localStorage.setItem(storageKey(), JSON.stringify(client)); } catch { /* best effort */ }
}

function clearSandbox() {
  try { localStorage.removeItem(storageKey()); } catch { /* ignore */ }
}

const editedBy = () => getCurrentUser()?.name || 'System';

export default function PlanningSandbox({ mode }) {
  const [client, setClient] = useState(loadSandbox);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [showDetailsForm, setShowDetailsForm] = useState(false);

  // Switching between the two tools re-mounts this component; re-read so an
  // edit made in the other tool is always reflected.
  useEffect(() => { setClient(loadSandbox()); setSelectedGoalId(null); }, [mode]);

  const update = (patch) => setClient((prev) => {
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
    saveSandbox(next);
    return next;
  });

  // The components render the PAN in a pill; show a dash rather than an
  // empty pill when none was entered.
  const shown = useMemo(() => ({ ...client, pan: client.pan || '—' }), [client]);

  const selectedGoal = selectedGoalId ? (client.goals || []).find((g) => g.id === selectedGoalId) : null;

  // Same totals App.jsx computes for a real client's Goal Mapping header.
  const totals = useMemo(() => {
    let totalAdditional = 0, totalLump = 0, totalCurrentSip = 0;
    (client.goals || []).forEach((g) => {
      const c = calcGoal(g);
      totalAdditional += c.additionalSip;
      totalLump += c.lumpSumRequired;
      totalCurrentSip += c.todayEffectiveSip;
    });
    return { totalSip: totalCurrentSip + totalAdditional, totalAdditional, totalLump, totalCurrentSip };
  }, [client.goals]);

  const addGoal = (goal) => update((prev) => ({ goals: [...(prev.goals || []), { ...goal, id: uid() }] }));
  const updateGoal = (goalId, updates) => update((prev) => ({
    goals: (prev.goals || []).map((g) => (g.id === goalId ? { ...g, ...updates } : g)),
  }));
  const deleteGoal = (goalId) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;
    if (selectedGoalId === goalId) setSelectedGoalId(null);
    update((prev) => ({ goals: (prev.goals || []).filter((g) => g.id !== goalId) }));
  };

  const saveAllocation = (patch) => {
    const prev = normalizeAllocation(client.assetAllocation);
    const merged = normalizeAllocation({
      values: patch.values || prev.values,
      custom: patch.custom || prev.custom,
      remark: patch.remark !== undefined ? patch.remark : prev.remark,
      peRatio: patch.peRatio !== undefined ? patch.peRatio : prev.peRatio,
    });
    const changes = buildAllocationEdits(prev, merged);
    if (changes.length === 0) return;
    const history = [...prev.history, { at: new Date().toISOString(), by: editedBy(), changes }];
    update({ assetAllocation: { ...merged, history, updatedAt: new Date().toISOString() } });
  };

  // Back to a blank demo — goals, assumptions, asset allocation and name all
  // cleared, plus any open form or goal page closed.
  const refresh = () => {
    clearSandbox();
    setSelectedGoalId(null);
    setShowGoalForm(false);
    setEditingGoalId(null);
    setShowAllocModal(false);
    setShowDetailsForm(false);
    setClient(blankClient());
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 px-5 py-3.5">
        <div className="flex items-start gap-3">
          <Presentation size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {mode === 'assets' ? 'Asset Allocation' : 'Goal Planner'} — demo mode
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/70 mt-0.5">
              For showing the calculations in a meeting. Autosaved on this device as you go; never saved to any client or lead. Refresh clears it for the next demo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowDetailsForm(true)} className={btnSecondary}>Edit name</button>
          <button onClick={refresh} className={btnSecondary} title="Clear everything in this demo and start fresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {mode === 'goals' && !selectedGoal && (
        <div className="animate-scale-up">
          <ClientDetail
            client={shown}
            totals={totals}
            onAddGoal={() => { setEditingGoalId(null); setShowGoalForm(true); }}
            onSelectGoal={setSelectedGoalId}
            onDeleteGoal={deleteGoal}
            onSaveAssumptions={(text) => update({ assumptions: text })}
            onEditClient={() => setShowDetailsForm(true)}
            isViewer={false}
          />
        </div>
      )}

      {mode === 'goals' && selectedGoal && (
        <div className="animate-scale-up">
          <GoalDetail
            goal={selectedGoal}
            clientName={client.name}
            onBack={() => setSelectedGoalId(null)}
            onEdit={() => { setEditingGoalId(selectedGoal.id); setShowGoalForm(true); }}
            onSaveContributions={(contributions, changes) => {
              const prevHistory = Array.isArray(selectedGoal.history) ? selectedGoal.history : [];
              const history = (changes && changes.length)
                ? [...prevHistory, { at: new Date().toISOString(), by: editedBy(), changes }]
                : prevHistory;
              updateGoal(selectedGoal.id, { contributions, actuals: [], history });
            }}
            isViewer={false}
          />
        </div>
      )}

      {mode === 'assets' && (
        <div className="animate-scale-up">
          <AssetAllocationDetail
            client={shown}
            onEdit={() => setShowAllocModal(true)}
            onSaveRemark={(remark) => saveAllocation({ remark })}
            isViewer={false}
          />
        </div>
      )}

      {showGoalForm && (
        <GoalFormModal
          initial={editingGoalId ? (client.goals || []).find((g) => g.id === editingGoalId) : null}
          assetAllocation={client.assetAllocation}
          clientGoals={client.goals || []}
          onClose={() => { setShowGoalForm(false); setEditingGoalId(null); }}
          onSave={(g) => {
            if (editingGoalId) {
              const prev = (client.goals || []).find((x) => x.id === editingGoalId);
              const changes = prev ? buildGoalEdits(prev, g) : [];
              const prevHistory = Array.isArray(prev?.history) ? prev.history : [];
              const history = changes.length
                ? [...prevHistory, { at: new Date().toISOString(), by: editedBy(), changes }]
                : prevHistory;
              updateGoal(editingGoalId, { ...g, history });
            } else {
              addGoal({ ...g, createdAt: g.createdAt || new Date().toISOString(), history: [] });
            }
            setShowGoalForm(false);
            setEditingGoalId(null);
          }}
        />
      )}

      {showAllocModal && (
        <AssetAllocationModal
          clientName={client.name}
          initial={client.assetAllocation}
          onClose={() => setShowAllocModal(false)}
          onSave={(patch) => { saveAllocation(patch); setShowAllocModal(false); }}
        />
      )}

      {showDetailsForm && (
        <DemoDetailsModal
          initial={client}
          onClose={() => setShowDetailsForm(false)}
          onSave={(details) => { update(details); setShowDetailsForm(false); }}
        />
      )}
    </div>
  );
}

// Name / PAN / age for the demo — only what the Goal Mapping and Asset
// Allocation headers and PDF exports actually show.
function DemoDetailsModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name || '');
  const [pan, setPan] = useState(initial.pan || '');
  const [age, setAge] = useState(initial.age || '');

  const submit = () => onSave({
    name: name.trim() || 'Prospective Client',
    pan: pan.trim().toUpperCase(),
    age: age === '' ? '' : Number(age),
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full flex flex-col max-h-[90vh] max-w-md shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Demo details</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <Field label="Name" hint="Shown on screen and on the exported PDF">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Prospective Client" autoFocus />
          </Field>
          <Field label="PAN (optional)">
            <input value={pan} onChange={(e) => setPan(e.target.value)} className={inputCls + ' uppercase'} maxLength={10} />
          </Field>
          <Field label="Age (optional)">
            <input type="number" min="0" value={age} onChange={(e) => setAge(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl shrink-0 flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={submit} className={btnPrimary}>Save</button>
        </div>
      </div>
    </div>
  );
}
