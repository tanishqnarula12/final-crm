import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Save, RotateCcw, Check, X, Minus, Lock, HelpCircle, Info } from 'lucide-react';
import { Card, btnPrimary, btnGhost } from './UI';
import { api } from '../services/api';
import { setMatrix as pushMatrix } from '../services/permissions';

// Admin-only editor for the RBAC permission matrix. Modules down the left, and
// for the selected module a grid of action rows × role columns. Each cell is a
// 3-state control (None / Assigned / All). Admin is shown but locked to All.
const SCOPES = ['NONE', 'ASSIGNED', 'ALL'];
const SCOPE_META = {
  NONE: { label: 'None', Icon: X, cls: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-slate-200 dark:border-slate-700' },
  ASSIGNED: { label: 'Assigned', Icon: Minus, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-300 dark:border-amber-800' },
  ALL: { label: 'All', Icon: Check, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800' },
};

// Plain-English explanation of what "Assigned" actually checks, per ownership
// kind (server: permissionCatalog.js `OWNERSHIP`). Shown dynamically for the
// module currently selected, so "Assigned" never feels like a mystery.
const OWNERSHIP_GUIDE = {
  self: 'the record\'s "Assigned To" is this person, or they created it.',
  creator: 'this person created the record. Being assigned to it does not count here — only the original creator does.',
  task: 'this person assigned the task (they\'re the "Assigned By") OR the task is assigned to them (they\'re the "Assigned To"). Nobody else can see or edit the task at all.',
  client: 'this person is the Relationship Manager assigned to the client (or to the client the record belongs to, for Goals / Proposals / Reviews / Prospects / Documents), or they created it.',
};

export default function PermissionsMatrix() {
  const [catalog, setCatalog] = useState(null);
  const [matrix, setLocal] = useState({});
  const [activeModule, setActiveModule] = useState(null);
  const [dirty, setDirty] = useState({}); // `${module}:${action}:${role}` -> scope
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { catalog: cat, matrix: m } = await api.get('/permissions');
        setCatalog(cat);
        setLocal(m);
        setActiveModule(cat.modules[0]?.key || null);
      } catch (err) {
        setError(err?.message || 'Failed to load permissions.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const roles = catalog?.roles || [];
  const roleLabels = catalog?.roleLabels || {};
  const actionLabels = catalog?.actionLabels || {};
  const mod = useMemo(() => catalog?.modules?.find((m) => m.key === activeModule), [catalog, activeModule]);
  const dirtyCount = Object.keys(dirty).length;
  const activeOwnershipKind = catalog?.ownership?.[activeModule] || 'self';

  const cycle = (module, action, role) => {
    const cur = matrix?.[module]?.[action]?.[role] || 'NONE';
    const next = SCOPES[(SCOPES.indexOf(cur) + 1) % SCOPES.length];
    setLocal((prev) => ({
      ...prev,
      [module]: { ...prev[module], [action]: { ...prev[module][action], [role]: next } },
    }));
    setDirty((prev) => ({ ...prev, [`${module}:${action}:${role}`]: next }));
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const cells = Object.entries(dirty).map(([k, scope]) => {
        const [module, action, role] = k.split(':');
        return { module, action, role, scope };
      });
      const { matrix: m } = await api.put('/permissions', { cells });
      setLocal(m); setDirty({}); pushMatrix(m);
    } catch (err) {
      setError(err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset ALL modules to the default permissions? This overwrites your customisations.')) return;
    setSaving(true); setError('');
    try {
      const { matrix: m } = await api.post('/permissions/reset');
      setLocal(m); setDirty({}); pushMatrix(m);
    } catch (err) {
      setError(err?.message || 'Failed to reset.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-400 animate-pulse p-6 text-center">Loading permissions…</p>;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Permission Matrix</h2>
            <p className="text-xs text-slate-400">Set what each role can do per module. Click a cell to cycle None → Assigned → All.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGuide((v) => !v)} className={btnGhost + ' text-xs'}>
            <HelpCircle size={13} /> {showGuide ? 'Hide guide' : 'What do these mean?'}
          </button>
          <button onClick={reset} disabled={saving} className={btnGhost + ' text-xs'} title="Reset to defaults">
            <RotateCcw size={13} /> Reset defaults
          </button>
          <button onClick={save} disabled={saving || dirtyCount === 0} className={btnPrimary + ' text-xs'}>
            <Save size={13} /> {saving ? 'Saving…' : dirtyCount ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : 'Saved'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}

      {/* Guide — explains None/Assigned/All, Admin bypass, and RM's contextual
          nature, plus the live meaning of "Assigned" for whichever module is
          open. Defaults to visible so a new admin isn't left guessing. */}
      {showGuide && (
        <Card className="p-4 space-y-3 bg-blue-50/40 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            <Info size={14} className="text-blue-500" /> How to read this matrix
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <ScopeExplainer scope="NONE" text="This role can never do this action — on any record, ever." />
            <ScopeExplainer scope="ASSIGNED" text="Only on records connected to them. What counts as &ldquo;connected&rdquo; depends on the module — see below." />
            <ScopeExplainer scope="ALL" text="On every record in this module, with no restriction." />
          </div>

          <div className="pt-2 border-t border-blue-100 dark:border-blue-900/30 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>
              <b className="text-slate-800 dark:text-slate-100">For {mod?.label || 'this module'}</b>, "Assigned" means:{' '}
              {OWNERSHIP_GUIDE[activeOwnershipKind]}
            </p>
            <p>
              <b className="text-slate-800 dark:text-slate-100">Admin</b> always has full access to everything and doesn't appear as an editable column — there is only ever one Admin account.
            </p>
            <p>
              <b className="text-slate-800 dark:text-slate-100">Relationship Manager (RM) is not a fixed role.</b> Setting rights in the RM column only takes effect for a user on the specific leads/clients where they've been set as the assigned RM — never everywhere. A user's other roles (Portfolio Manager, Operations Manager, etc., assigned in User Management) apply everywhere, all the time, and stack together.
            </p>
            <p>
              <b className="text-slate-800 dark:text-slate-100">If an account holds more than one role, the most permissive wins.</b> Restricting one role's cell here has no effect on an account that also holds a different role left at a wider setting — check User Management to see every role a person currently holds before assuming a matrix change fully locks them down.
            </p>
          </div>
        </Card>
      )}

      <div className="flex gap-4 items-start">
        {/* Module nav */}
        <div className="w-40 shrink-0 space-y-1">
          {catalog.modules.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveModule(m.key)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeModule === m.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Matrix for the active module. table-fixed + a colgroup keeps every
            role column the same (narrow) width regardless of label length, so
            adding more roles never forces cells to compress/overlap — it just
            scrolls horizontally past the fold. */}
        <Card className="flex-1 p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed" style={{ minWidth: `${140 + (roles.length + 1) * 84}px` }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 84 }} />
                {roles.map((r) => <col key={r} style={{ width: 84 }} />)}
              </colgroup>
              <thead>
                <tr className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2.5 sticky left-0 bg-white dark:bg-slate-900">Action</th>
                  <th className="px-1 py-2.5 text-center">
                    <span className="inline-flex flex-col items-center gap-0.5 text-blue-600 dark:text-blue-400"><Lock size={9} /> Admin</span>
                  </th>
                  {roles.map((r) => (
                    <th key={r} className="px-1 py-2.5 text-center leading-tight break-words" title={roleLabels[r] || r}>{roleLabels[r] || r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mod?.actions.map((action) => (
                  <tr key={action} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900">
                      {actionLabels[action] || action}
                    </td>
                    {/* Admin is always ALL, locked */}
                    <td className="px-1 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-full py-1 rounded-lg border text-[9px] font-bold bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900 opacity-80">
                        <Check size={10} className="mr-0.5 shrink-0" /> All
                      </span>
                    </td>
                    {roles.map((role) => {
                      const scope = matrix?.[activeModule]?.[action]?.[role] || 'NONE';
                      const { label, Icon, cls } = SCOPE_META[scope];
                      return (
                        <td key={role} className="px-1 py-2 text-center">
                          <button
                            onClick={() => cycle(activeModule, action, role)}
                            title={`${roleLabels[role] || role} · ${label} (click to change)`}
                            className={`inline-flex items-center justify-center gap-0.5 w-full py-1 rounded-lg border text-[9px] font-bold transition-all cursor-pointer hover:scale-105 ${cls}`}
                          >
                            <Icon size={10} className="shrink-0" /> {label}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScopeExplainer({ scope, text }) {
  const { label, Icon, cls } = SCOPE_META[scope];
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${cls}`}>
        <Icon size={10} /> {label}
      </span>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{text}</p>
    </div>
  );
}
