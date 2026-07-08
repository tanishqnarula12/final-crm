import { useState, useEffect, useCallback } from 'react';
import {
  Users as UsersIcon, Plus, X, Pencil, Trash2, ShieldCheck, ShieldAlert, Eye, KeyRound, Check,
  Briefcase, PieChart, Shield, Headphones, Settings, Crown,
} from 'lucide-react';
import { Card, btnPrimary, btnGhost, inputCls, selectCls, Field, CoolSelect } from './UI';
import { CountrySelect, StateSelect, CitySelect } from './LocationPicker';
import { RELATIONS } from '../utils/team';
import { ADVISOR_ROLES, MARITAL_STATUS_OPTIONS } from '../utils/advisorProfile';
import { DOB_MIN, dobMax } from '../utils/calc';
import { api } from '../services/api';
import { getCurrentUser } from '../utils/auth';

// The 7 RBAC access roles. This is the ACCESS/permission axis — distinct from
// the "Job Title / Advisor Role" (ADVISOR_ROLES) HR label captured below.
const ROLE_META = {
  ADMIN:              { label: 'Admin',              icon: ShieldCheck, theme: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',       desc: 'Full access — bypasses all permission checks + user management' },
  RM:                 { label: 'Relationship Manager', icon: Briefcase, theme: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40', desc: 'Edits leads/clients assigned to them' },
  PORTFOLIO_MANAGER:  { label: 'Portfolio Manager',  icon: PieChart,    theme: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40', desc: 'Goals, asset allocation, proposals & reviews' },
  INSURANCE_MANAGER:  { label: 'Insurance Manager',  icon: Shield,      theme: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',     desc: 'Insurance proposals & policy reviews' },
  SERVICE_MANAGER:    { label: 'Service Manager',    icon: Headphones,  theme: 'bg-cyan-50 text-cyan-700 ring-cyan-200/60 dark:bg-cyan-950/30 dark:text-cyan-400 dark:ring-cyan-900/40',         desc: 'Changes prospect stages' },
  OPERATIONS_MANAGER: { label: 'Operations Manager', icon: Settings,    theme: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',         desc: 'Creates applicants & edits client personal details' },
  INTERNAL_MANAGER:   { label: 'Internal Manager',   icon: Crown,       theme: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40', desc: 'Broad access close to Admin, everywhere — except delete. Fully editable in the Permission Matrix (not locked like Admin).' },
  INTERNAL_USER:      { label: 'Internal User',      icon: Eye,         theme: 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700/50',   desc: 'Baseline access — create leads/tasks, view assigned records' },
  // Legacy labels kept so any not-yet-migrated row still renders.
  MANAGER: { label: 'Manager', icon: ShieldAlert, theme: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40', desc: 'Legacy role' },
  VIEWER:  { label: 'Viewer',  icon: Eye,         theme: 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800/60 dark:text-slate-400 dark:ring-slate-700/50',  desc: 'Legacy role' },
};
// Only the real roles are selectable in the dropdown (legacy ones excluded).
const ROLES = ['ADMIN', 'RM', 'PORTFOLIO_MANAGER', 'INSURANCE_MANAGER', 'SERVICE_MANAGER', 'OPERATIONS_MANAGER', 'INTERNAL_MANAGER', 'INTERNAL_USER'];

// Admin-only screen to provision team members. No public signup exists — this
// is the only way accounts are created. Talks to the /api/users endpoints,
// which are themselves ADMIN-gated on the server. Creating (and editing) a
// user opens the same full HR-profile form as the "My Profile" page, so the
// admin can capture a new team member's complete details up front.
export default function UsersAdmin() {
  const me = getCurrentUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited, or null for create

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { users } = await api.get('/users');
      setUsers(users);
    } catch (err) {
      setError(err?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (u) => { setEditing(u); setShowForm(true); };

  const handleDelete = async (u) => {
    if (u.id === me?.id) { alert('You cannot delete your own account.'); return; }
    if (!window.confirm(`Delete ${u.name} (${u.email})? This cannot be undone.`)) return;
    try {
      await api.del(`/users/${u.id}`);
      load();
    } catch (err) {
      alert(err?.message || 'Failed to delete user.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <UsersIcon size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">User Management</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">Create and manage team member accounts &amp; access</p>
          </div>
        </div>
        <button onClick={openCreate} className={btnPrimary + ' shrink-0'}>
          <Plus size={14} /> New User
        </button>
      </div>

      {error && (
        <Card className="p-4 border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading users…</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-6 py-4 font-bold">Name</th>
                  <th className="text-left px-6 py-4 font-bold">Email</th>
                  <th className="text-left px-6 py-4 font-bold">Role</th>
                  <th className="text-center px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {users.map(u => {
                  const roles = u.roles && u.roles.length ? u.roles : ['INTERNAL_USER'];
                  return (
                    <tr key={u.id} className="hover:bg-blue-50/20 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {u.name} {u.id === me?.id && <span className="text-[10px] font-semibold text-blue-500 ml-1">(you)</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{u.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {roles.map((r) => {
                            const meta = ROLE_META[r] || ROLE_META.INTERNAL_USER;
                            const RoleIcon = meta.icon;
                            return (
                              <span key={r} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full ring-1 ${meta.theme}`}>
                                <RoleIcon size={10} /> {meta.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Disabled</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(u)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all opacity-0 group-hover:opacity-100" title="Edit user">
                          <Pencil size={14} />
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => handleDelete(u)} className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-all opacity-0 group-hover:opacity-100" title="Delete user">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showForm && (
        <UserFormModal
          initial={editing}
          isSelf={editing?.id === me?.id}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

const emptyBank = () => ({ accountHolder: '', bankName: '', accountNumber: '', ifsc: '', branch: '' });

function UserFormModal({ initial, isSelf, onClose, onSaved }) {
  const isEdit = !!initial;

  // --- Account & access ---
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [accessRoles, setAccessRoles] = useState(initial?.roles?.length ? initial.roles : ['INTERNAL_USER']);
  const isAdminUser = (initial?.roles || []).includes('ADMIN');
  // "Internal User" is the no-special-role baseline — it doesn't stack with a
  // specific department role, because that's exactly what caused real
  // confusion: an admin restricts, say, Operations Manager's rights in the
  // matrix, but the account ALSO still holds Internal User (kept by default
  // when it was created), whose own matrix cells weren't touched — so the
  // union of roles quietly keeps the old, wider access. Making the two
  // mutually exclusive means picking a specific role always fully replaces
  // the baseline, matching what an admin expects "give them just this role" to do.
  const toggleRole = (r) => setAccessRoles((prev) => {
    if (r === 'INTERNAL_USER') return ['INTERNAL_USER'];
    const next = prev.includes(r) ? prev.filter((x) => x !== r) : [...prev.filter((x) => x !== 'INTERNAL_USER'), r];
    return next.length ? next : ['INTERNAL_USER'];
  });
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState('');

  // --- Full HR profile (same shape as "My Profile") ---
  const [profileLoading, setProfileLoading] = useState(isEdit);
  const [jobTitle, setJobTitle] = useState('');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [aadhar, setAadhar] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [disease, setDisease] = useState('');
  const [teamMemberSince, setTeamMemberSince] = useState('');
  const [mobile, setMobile] = useState('');
  const [profileEmail, setProfileEmail] = useState(initial?.email || '');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [address3, setAddress3] = useState('');
  const [country, setCountry] = useState('India');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [familyDetails, setFamilyDetails] = useState([]);
  const [bankDetails, setBankDetails] = useState(emptyBank());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When editing, load this user's existing profile to prefill the form.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const { profile } = await api.get(`/users/${initial.id}/profile`);
        if (cancelled || !profile) return;
        setJobTitle(profile.role || '');
        setDob(profile.dob || '');
        setPan(profile.pan || '');
        setAadhar(profile.aadhar || '');
        setMaritalStatus(profile.maritalStatus || '');
        setDisease(profile.disease || '');
        setTeamMemberSince(profile.teamMemberSince || '');
        setMobile(profile.mobile || '');
        setProfileEmail(profile.email || initial.email || '');
        setAddress1(profile.address1 || '');
        setAddress2(profile.address2 || '');
        setAddress3(profile.address3 || '');
        setCountry(profile.country || 'India');
        setStateName(profile.state || '');
        setCity(profile.city || '');
        setPinCode(profile.pinCode || '');
        setFamilyDetails(Array.isArray(profile.familyDetails) ? profile.familyDetails : []);
        setBankDetails({ ...emptyBank(), ...(profile.bankDetails || {}) });
      } catch (err) {
        console.error('Failed to load user profile:', err);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, initial?.id]);

  const panValid = !pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
  const aadharValid = !aadhar || /^\d{12}$/.test(aadhar.replace(/\s/g, ''));

  const handleAddFamilyMember = () => setFamilyDetails([...familyDetails, { name: '', relation: '', dob: '', mobile: '' }]);
  const handleRemoveFamilyMember = (idx) => setFamilyDetails(familyDetails.filter((_, i) => i !== idx));
  const handleFamilyMemberChange = (idx, field, val) => setFamilyDetails(familyDetails.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  const handleBankChange = (field, val) => setBankDetails(prev => ({ ...prev, [field]: val }));

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Name is required.');
    if (!isEdit && !email.trim()) return setError('Email is required.');
    if (!isEdit && password.length < 8) return setError('Password must be at least 8 characters.');
    if (isEdit && password && password.length < 8) return setError('New password must be at least 8 characters.');
    if (!panValid) return setError('PAN format must be: 5 letters, 4 digits, 1 letter.');
    if (!aadharValid) return setError('Aadhar No. must be 12 digits.');
    if (!isAdminUser && accessRoles.length === 0) return setError('Select at least one access role.');

    const profile = {
      role: jobTitle,
      dob,
      pan,
      aadhar: aadhar.replace(/\s/g, ''),
      maritalStatus,
      disease,
      teamMemberSince,
      mobile,
      email: profileEmail,
      address1,
      address2,
      address3,
      country,
      state: stateName,
      city,
      pinCode,
      familyDetails: familyDetails.filter(f => f.name.trim()),
      bankDetails,
    };

    setSaving(true);
    try {
      if (isEdit) {
        const patch = { name: name.trim(), active, profile };
        if (!isAdminUser) patch.roles = accessRoles; // the sole admin's roles stay locked
        if (password) patch.password = password;
        await api.patch(`/users/${initial.id}`, patch);
      } else {
        await api.post('/users', { name: name.trim(), email: email.trim(), password, roles: accessRoles, profile });
      }
      onSaved();
    } catch (err) {
      setError(err?.message || 'Failed to save user.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {isEdit ? <Pencil size={15} /> : <Plus size={16} />}
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{isEdit ? 'Edit User' : 'New User'}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-7 max-h-[70vh] overflow-y-auto">
          {profileLoading ? (
            <p className="text-sm text-slate-400 italic">Loading profile…</p>
          ) : (
            <>
              {/* Account & Access */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-blue-500">Account &amp; Access</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Full Name *">
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Priya Sharma" />
                  </Field>
                  <Field label="Login Email *" hint={isEdit ? 'Email cannot be changed after creation' : 'Used to sign in'}>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isEdit} className={inputCls + (isEdit ? ' bg-slate-50 dark:bg-slate-950/20 cursor-not-allowed text-slate-500' : '')} placeholder="name@fintness.in" />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Access Roles *" hint="A user can hold several department roles at once — their rights are the union (the most permissive wins). Picking one replaces 'Internal User', the no-role baseline. RM applies per assigned client/lead.">
                      {isAdminUser ? (
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40">
                          <ShieldCheck size={15} className="text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Admin</span>
                          <span className="text-[10px] text-blue-500/80">— sole administrator, full access (locked)</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {ROLES.filter(r => r !== 'ADMIN').map(r => {
                            const on = accessRoles.includes(r);
                            const Icon = ROLE_META[r].icon;
                            return (
                              <button
                                key={r} type="button" onClick={() => toggleRole(r)}
                                title={ROLE_META[r].desc}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                  on ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300'
                                }`}
                              >
                                {on ? <Check size={13} /> : <Icon size={13} />} {ROLE_META[r].label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Field>
                  </div>
                  <Field label={isEdit ? 'Reset Password' : 'Password *'} hint={isEdit ? 'Leave blank to keep the current password' : 'Minimum 8 characters'}>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls + ' pl-9'} placeholder={isEdit ? 'New password (optional)' : 'Set an initial password'} />
                    </div>
                  </Field>
                </div>
                {isEdit && (
                  <label className={`flex items-center gap-2.5 cursor-pointer select-none ${isSelf ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => !isSelf && setActive(a => !a)}
                      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : ''}`} />
                    </button>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Account active {isSelf && '(cannot disable yourself)'}</span>
                  </label>
                )}
              </div>

              {/* Personal & Identity */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-indigo-500">Personal &amp; Identity</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Job Title / Advisor Role">
                    <CoolSelect value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={selectCls}>
                      <option value="">Select role…</option>
                      {ADVISOR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </CoolSelect>
                  </Field>
                  <Field label="Team Member Since">
                    <input type="date" value={teamMemberSince} onChange={(e) => setTeamMemberSince(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Date of Birth">
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min={DOB_MIN} max={dobMax()} className={inputCls} />
                  </Field>
                  <Field label="PAN No." hint={pan && !panValid ? 'Format must be: 5 letters, 4 digits, 1 letter' : null}>
                    <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))} placeholder="e.g. ABCDE1234F" maxLength={10} className={inputCls + ' font-mono tracking-widest uppercase'} />
                  </Field>
                  <Field label="Aadhar No." hint={aadhar && !aadharValid ? 'Must be 12 digits' : null}>
                    <input value={aadhar} onChange={(e) => setAadhar(e.target.value.replace(/[^\d]/g, '').slice(0, 12))} placeholder="e.g. 123456789012" maxLength={12} className={inputCls + ' font-mono tracking-widest'} />
                  </Field>
                  <Field label="Marital Status">
                    <CoolSelect value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={selectCls}>
                      <option value="">Select status…</option>
                      {MARITAL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </CoolSelect>
                  </Field>
                  <Field label="Disease, If Any">
                    <input value={disease} onChange={(e) => setDisease(e.target.value)} className={inputCls} placeholder="e.g. None" />
                  </Field>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-cyan-500">Contact Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Mobile Number">
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} placeholder="e.g. +91 98765 43210" />
                  </Field>
                  <Field label="Contact Email" hint="Shown on the profile — can differ from the login email">
                    <input type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} className={inputCls} placeholder="e.g. name@teamfintness.com" />
                  </Field>
                  <Field label="Address Line 1">
                    <input value={address1} onChange={(e) => setAddress1(e.target.value)} className={inputCls} placeholder="House / Street" />
                  </Field>
                  <Field label="Address Line 2">
                    <input value={address2} onChange={(e) => setAddress2(e.target.value)} className={inputCls} placeholder="Locality / Area" />
                  </Field>
                  <Field label="Address Line 3">
                    <input value={address3} onChange={(e) => setAddress3(e.target.value)} className={inputCls} placeholder="Landmark (optional)" />
                  </Field>
                  <Field label="Pin Code">
                    <input value={pinCode} onChange={(e) => setPinCode(e.target.value)} className={inputCls} placeholder="e.g. 302001" />
                  </Field>
                  <Field label="Country">
                    <CountrySelect value={country} onChange={(v) => { setCountry(v); setStateName(''); setCity(''); }} />
                  </Field>
                  <Field label="State">
                    <StateSelect country={country} value={stateName} onChange={(v) => { setStateName(v); setCity(''); }} />
                  </Field>
                  <Field label="City">
                    <CitySelect country={country} state={stateName} value={city} onChange={setCity} />
                  </Field>
                </div>
              </div>

              {/* Family Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-violet-500">Family Details</h4>
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-sm">
                  <table className="w-full text-xs text-left min-w-[500px]">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Relation</th>
                        <th className="px-4 py-3">Date of Birth</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3 w-16 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {familyDetails.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500 italic">No family members added yet.</td>
                        </tr>
                      ) : (
                        familyDetails.map((member, idx) => (
                          <tr key={idx} className="bg-white dark:bg-slate-950">
                            <td className="px-4 py-2">
                              <input value={member.name} onChange={(e) => handleFamilyMemberChange(idx, 'name', e.target.value)} placeholder="Name" className={inputCls + ' text-xs py-1.5'} />
                            </td>
                            <td className="px-4 py-2">
                              <CoolSelect value={member.relation} onChange={(e) => handleFamilyMemberChange(idx, 'relation', e.target.value)} className={selectCls + ' text-xs py-1.5'}>
                                <option value="">Select relation…</option>
                                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                              </CoolSelect>
                            </td>
                            <td className="px-4 py-2">
                              <input type="date" value={member.dob || ''} onChange={(e) => handleFamilyMemberChange(idx, 'dob', e.target.value)} min={DOB_MIN} max={dobMax()} className={inputCls + ' text-xs py-1.5'} />
                            </td>
                            <td className="px-4 py-2">
                              <input value={member.mobile || ''} onChange={(e) => handleFamilyMemberChange(idx, 'mobile', e.target.value)} placeholder="Mobile" className={inputCls + ' text-xs py-1.5'} />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button type="button" onClick={() => handleRemoveFamilyMember(idx)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer">
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={handleAddFamilyMember} className="w-full py-2 border border-dashed border-slate-350 dark:border-slate-800 hover:border-violet-500 rounded-xl text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50/10 dark:hover:bg-violet-950/10 transition-all cursor-pointer">
                  + Add Family Member
                </button>
              </div>

              {/* Bank Details */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-purple-500">Bank Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Account Holder Name">
                    <input value={bankDetails.accountHolder} onChange={(e) => handleBankChange('accountHolder', e.target.value)} className={inputCls} placeholder="e.g. Priya Sharma" />
                  </Field>
                  <Field label="Bank Name">
                    <input value={bankDetails.bankName} onChange={(e) => handleBankChange('bankName', e.target.value)} className={inputCls} placeholder="e.g. HDFC Bank" />
                  </Field>
                  <Field label="Account Number">
                    <input value={bankDetails.accountNumber} onChange={(e) => handleBankChange('accountNumber', e.target.value.replace(/\D/g, ''))} className={inputCls + ' font-mono tracking-wider'} placeholder="e.g. 50100123456789" />
                  </Field>
                  <Field label="IFSC Code">
                    <input value={bankDetails.ifsc} onChange={(e) => handleBankChange('ifsc', e.target.value.toUpperCase().slice(0, 11))} className={inputCls + ' font-mono tracking-widest uppercase'} placeholder="e.g. HDFC0001234" />
                  </Field>
                  <Field label="Branch">
                    <input value={bankDetails.branch} onChange={(e) => handleBankChange('branch', e.target.value)} className={inputCls} placeholder="e.g. Jaipur - C Scheme" />
                  </Field>
                </div>
              </div>

              {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl flex justify-end items-center gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={submit} disabled={saving || profileLoading} className={btnPrimary}>
            {saving ? 'Saving…' : (<><Check size={14} /> {isEdit ? 'Save Changes' : 'Create User'}</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
