import React, { useEffect, useRef, useState } from 'react';
import {
  Camera, Pencil, Save, X, IdCard, Fingerprint, Calendar, CalendarClock,
  Phone, Mail, MapPin, Users, Landmark, Banknote, Building2, KeyRound,
  Eye, EyeOff, Heart, Stethoscope, Briefcase, User
} from 'lucide-react';
import { Card, Field, inputCls, selectCls, btnPrimary, btnGhost, CoolSelect } from './UI';
import AvatarCropperModal from './AvatarCropperModal';
import { CountrySelect, StateSelect, CitySelect } from './LocationPicker';
import { RELATIONS } from '../utils/team';
import { avatarColor, initials, fmtDate, DOB_MIN, dobMax } from '../utils/calc';
import {
  loadAdvisorProfile, saveAdvisorProfile, ADVISOR_ROLES, MARITAL_STATUS_OPTIONS
} from '../utils/advisorProfile';

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

function ProfileAvatar({ name, photo, size = 80 }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
      className={`${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
    >
      {initials(name || 'NA')}
    </div>
  );
}

function tenureLabel(since) {
  if (!since) return null;
  const start = new Date(since);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (rem > 0 || years === 0) parts.push(`${rem} mo${rem !== 1 ? 's' : ''}`);
  return parts.join(' ');
}

function groupDigits(value, groupSize = 4) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.replace(new RegExp(`(.{${groupSize}})`, 'g'), '$1 ').trim();
}

function maskDigits(value, keep = 4) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length <= keep) return groupDigits(digits);
  const masked = 'X'.repeat(digits.length - keep) + digits.slice(-keep);
  return groupDigits(masked);
}

const ACCENTS = {
  blue: { box: 'from-blue-50/70 to-sky-50/40 dark:from-blue-950/15 dark:to-slate-950/20 border-blue-100/70 dark:border-blue-900/20', chip: 'bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-blue-500/25', title: 'text-blue-700 dark:text-blue-300', icon: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
  cyan: { box: 'from-cyan-50/70 to-blue-50/40 dark:from-cyan-950/15 dark:to-slate-950/20 border-cyan-100/70 dark:border-cyan-900/20', chip: 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-cyan-500/25', title: 'text-cyan-700 dark:text-cyan-300', icon: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400' },
  indigo: { box: 'from-indigo-50/70 to-violet-50/40 dark:from-indigo-950/15 dark:to-slate-950/20 border-indigo-100/70 dark:border-indigo-900/20', chip: 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-indigo-500/25', title: 'text-indigo-700 dark:text-indigo-300', icon: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400' },
  purple: { box: 'from-purple-50/70 to-fuchsia-50/40 dark:from-purple-950/15 dark:to-slate-950/20 border-purple-100/70 dark:border-purple-900/20', chip: 'bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-purple-500/25', title: 'text-purple-700 dark:text-purple-300', icon: 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400' },
};

function SectionBox({ accent, icon: Icon, title, action, children }) {
  const t = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className={`p-5 rounded-2xl bg-gradient-to-br ${t.box} border space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2.5">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-md ${t.chip}`}>
            <Icon size={15} />
          </span>
          <span className={`text-xs font-black uppercase tracking-wider ${t.title}`}>{title}</span>
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, accent, label, value, multiline, emptyText = 'Not configured' }) {
  const t = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className="flex items-start gap-3">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.icon}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <span className="font-semibold block text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`font-bold text-slate-800 dark:text-slate-200 text-xs ${multiline ? 'whitespace-pre-line leading-relaxed' : ''}`}>
          {value || <span className="text-slate-400 dark:text-slate-600 italic font-normal">{emptyText}</span>}
        </span>
      </div>
    </div>
  );
}

function MaskedRow({ icon: Icon, accent, label, rawValue, revealed, onToggle, emptyText = 'Not configured' }) {
  if (!rawValue) {
    return <InfoRow icon={Icon} accent={accent} label={label} value="" emptyText={emptyText} />;
  }
  return (
    <div className="flex items-start gap-3">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${(ACCENTS[accent] || ACCENTS.blue).icon}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-semibold block text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs font-mono tracking-wider">
            {revealed ? groupDigits(rawValue) : maskDigits(rawValue)}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
            title={revealed ? 'Hide' : 'Reveal'}
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyProfileView() {
  const [profile, setProfile] = useState(() => loadAdvisorProfile());
  const [showEdit, setShowEdit] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [cropSrc, setCropSrc] = useState(null); // raw, uncropped selection — staged for AvatarCropperModal
  const [showAadhar, setShowAadhar] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const fileInputRef = useRef(null);

  // The `useState(() => loadAdvisorProfile())` above only reads the cache at
  // mount time. If this view happens to mount before the app-load hydrate
  // resolves (or the cache is refreshed later from elsewhere, e.g. another
  // module's `window.refreshAppData()`), local state would otherwise go
  // stale and a subsequent save here would overwrite the server copy with
  // whatever we saw at mount — silently reverting fields (most visibly the
  // photo). Stay in sync with the shared cache instead.
  useEffect(() => {
    const onUpdate = () => setProfile(loadAdvisorProfile());
    window.addEventListener('crm:advisor-profile-updated', onUpdate);
    return () => window.removeEventListener('crm:advisor-profile-updated', onUpdate);
  }, []);

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      alert('Image is too large. Please choose a file smaller than 3MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (croppedDataUrl) => {
    setCropSrc(null);
    setPendingPhoto(croppedDataUrl);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSavePhoto = () => {
    const updated = { ...profile, photo: pendingPhoto };
    setProfile(updated);
    saveAdvisorProfile(updated);
    setPendingPhoto(null);
  };

  const handleCancelPhoto = () => {
    setPendingPhoto(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveProfile = (updatedFields) => {
    const updated = { ...profile, ...updatedFields };
    setProfile(updated);
    saveAdvisorProfile(updated);
    setShowEdit(false);
  };

  const formattedAddress = [
    profile.address1,
    profile.address2,
    profile.address3,
    [profile.city, profile.state, profile.pinCode].filter(Boolean).join(', '),
    profile.country,
  ].filter(Boolean).join('\n');

  const tenure = tenureLabel(profile.teamMemberSince);
  const bank = profile.bankDetails || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <Card className="relative overflow-hidden p-6 border border-slate-200/60 dark:border-slate-800/80 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
        <div className="pointer-events-none absolute -top-16 -right-12 w-48 h-48 rounded-full bg-blue-400/10 dark:bg-blue-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-32 w-44 h-44 rounded-full bg-indigo-400/10 dark:bg-indigo-500/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="ring-4 ring-white/70 dark:ring-slate-800/70 rounded-full shadow-lg overflow-hidden">
                <ProfileAvatar name={profile.name} photo={pendingPhoto || profile.photo} size={80} />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-slate-900 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Change Photo"
              >
                <Camera size={13} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              {cropSrc && (
                <AvatarCropperModal src={cropSrc} onCancel={handleCropCancel} onConfirm={handleCropConfirm} />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{profile.name || 'Your Name'}</h2>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm">
                  <Briefcase size={12} />
                  {profile.role || 'Team Member'}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-2 flex-wrap">
                {profile.teamMemberSince && (
                  <>
                    <span className="font-mono tracking-wider bg-indigo-100/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-0.5 rounded-lg text-xs border border-indigo-200/60 dark:border-indigo-900/40 inline-flex items-center gap-1.5">
                      <CalendarClock size={11} /> Member since {fmtDate(profile.teamMemberSince)}
                    </span>
                    {tenure && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">•</span>
                        <span>{tenure} with Team Fintness</span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
          <button onClick={() => setShowEdit(true)} className={btnPrimary + ' w-full md:w-auto'}>
            <Pencil size={14} /> Edit Profile
          </button>
        </div>

        {pendingPhoto && (
          <div className="relative mt-5 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/80 dark:bg-slate-950/40 border border-blue-200/60 dark:border-blue-900/30">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">New photo selected — save to update your profile picture.</span>
            <div className="flex gap-2 ml-auto">
              <button onClick={handleCancelPhoto} className={btnGhost + ' py-1.5 px-3 text-[11px]'}>
                <X size={12} /> Cancel
              </button>
              <button onClick={handleSavePhoto} className={btnPrimary + ' py-1.5 px-3 text-[11px]'}>
                <Save size={12} /> Save Photo
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Profile Details */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xl rounded-3xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
            <User size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Profile &amp; Personal Details</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Identity documents, contact information, family, and bank details
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
          <SectionBox accent="blue" icon={IdCard} title="Identity & Personal Details">
            <div className="space-y-3">
              <InfoRow icon={Calendar} accent="blue" label="Date of Birth" value={profile.dob ? fmtDate(profile.dob) : ''} />
              <InfoRow icon={IdCard} accent="blue" label="PAN No." value={profile.pan} />
              <MaskedRow icon={Fingerprint} accent="blue" label="Aadhar No." rawValue={profile.aadhar} revealed={showAadhar} onToggle={() => setShowAadhar(v => !v)} />
              <InfoRow icon={Heart} accent="blue" label="Marital Status" value={profile.maritalStatus} />
              <InfoRow icon={Stethoscope} accent="blue" label="Disease, If Any" value={profile.disease} emptyText="None reported" />
            </div>
          </SectionBox>

          <SectionBox accent="cyan" icon={Phone} title="Contact Information">
            <div className="space-y-3">
              <InfoRow icon={Phone} accent="cyan" label="Mobile" value={profile.mobile} />
              <InfoRow icon={Mail} accent="cyan" label="Email" value={profile.email} />
              <InfoRow icon={MapPin} accent="cyan" label="Address" value={formattedAddress} multiline emptyText="No address configured" />
            </div>
          </SectionBox>

          <SectionBox accent="indigo" icon={Users} title="Family Details">
            {!profile.familyDetails || profile.familyDetails.length === 0 ? (
              <p className="text-xs text-slate-450 dark:text-slate-500 italic font-medium">No family members configured</p>
            ) : (
              <div className="overflow-x-auto border border-indigo-100/70 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-sm">
                <table className="w-full text-xs text-left text-slate-700 dark:text-slate-350 min-w-[320px]">
                  <thead className="bg-indigo-50/70 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider border-b border-indigo-100 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px]">Name</th>
                      <th className="px-4 py-2.5 text-[10px]">Relation</th>
                      <th className="px-4 py-2.5 text-[10px]">Date of Birth</th>
                      <th className="px-4 py-2.5 text-[10px]">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {profile.familyDetails.map((f, i) => (
                      <tr key={i} className="hover:bg-indigo-50/40 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200">{f.name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-[11px] font-bold ring-1 ring-indigo-200/50 dark:ring-indigo-900/30">
                            {f.relation || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{f.dob ? fmtDate(f.dob) : '—'}</td>
                        <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">{f.mobile || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionBox>

          <SectionBox accent="purple" icon={Landmark} title="Bank Details">
            <div className="space-y-3">
              <InfoRow icon={User} accent="purple" label="Account Holder" value={bank.accountHolder} />
              <InfoRow icon={Landmark} accent="purple" label="Bank Name" value={bank.bankName} />
              <MaskedRow icon={Banknote} accent="purple" label="Account Number" rawValue={bank.accountNumber} revealed={showAccount} onToggle={() => setShowAccount(v => !v)} />
              <InfoRow icon={KeyRound} accent="purple" label="IFSC Code" value={bank.ifsc} />
              <InfoRow icon={Building2} accent="purple" label="Branch" value={bank.branch} />
            </div>
          </SectionBox>
        </div>
      </Card>

      {showEdit && (
        <ProfileEditModal profile={profile} onClose={() => setShowEdit(false)} onSave={handleSaveProfile} />
      )}
    </div>
  );
}

function Modal({ title, onClose, children, footer, maxWidth = 'max-w-3xl' }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl w-full ${maxWidth} shadow-2xl my-8 border border-slate-200/50 dark:border-slate-800/80 animate-scale-up`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

function ProfileEditModal({ profile, onClose, onSave }) {
  const [name, setName] = useState(profile.name || '');
  const [role, setRole] = useState(profile.role || '');
  const [dob, setDob] = useState(profile.dob || '');
  const [pan, setPan] = useState(profile.pan || '');
  const [aadhar, setAadhar] = useState(profile.aadhar || '');
  const [maritalStatus, setMaritalStatus] = useState(profile.maritalStatus || '');
  const [disease, setDisease] = useState(profile.disease || '');
  const [teamMemberSince, setTeamMemberSince] = useState(profile.teamMemberSince || '');
  const [mobile, setMobile] = useState(profile.mobile || '');
  const [email, setEmail] = useState(profile.email || '');
  const [address1, setAddress1] = useState(profile.address1 || '');
  const [address2, setAddress2] = useState(profile.address2 || '');
  const [address3, setAddress3] = useState(profile.address3 || '');
  const [country, setCountry] = useState(profile.country || 'India');
  const [stateName, setStateName] = useState(profile.state || '');
  const [city, setCity] = useState(profile.city || '');
  const [pinCode, setPinCode] = useState(profile.pinCode || '');
  const [familyDetails, setFamilyDetails] = useState(
    Array.isArray(profile.familyDetails) ? profile.familyDetails : []
  );
  const [bankDetails, setBankDetails] = useState({
    accountHolder: '', bankName: '', accountNumber: '', ifsc: '', branch: '', ...(profile.bankDetails || {})
  });

  const panValid = !pan || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
  const aadharValid = !aadhar || /^\d{12}$/.test(aadhar.replace(/\s/g, ''));

  const handleAddFamilyMember = () => {
    setFamilyDetails([...familyDetails, { name: '', relation: '', dob: '', mobile: '' }]);
  };
  const handleRemoveFamilyMember = (idx) => {
    setFamilyDetails(familyDetails.filter((_, i) => i !== idx));
  };
  const handleFamilyMemberChange = (idx, field, val) => {
    setFamilyDetails(familyDetails.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  };

  const handleBankChange = (field, val) => {
    setBankDetails(prev => ({ ...prev, [field]: val }));
  };

  const handleSave = () => {
    if (!name.trim() || !panValid || !aadharValid) return;
    onSave({
      name: name.trim(),
      role,
      dob,
      pan,
      aadhar: aadhar.replace(/\s/g, ''),
      maritalStatus,
      disease,
      teamMemberSince,
      mobile,
      email,
      address1,
      address2,
      address3,
      country,
      state: stateName,
      city,
      pinCode,
      familyDetails: familyDetails.filter(f => f.name.trim()),
      bankDetails,
    });
  };

  return (
    <Modal
      title="Edit Profile"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || !panValid || !aadharValid} className={btnPrimary}>
            Save Changes
          </button>
        </div>
      }
    >
      <div className="space-y-7">
        {/* Personal & Identity */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-blue-500">Personal &amp; Identity</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. full name" />
            </Field>
            <Field label="Role">
              <CoolSelect value={role} onChange={(e) => setRole(e.target.value)} className={selectCls} placeholder="Select role…">
                <option value="">Select role…</option>
                {ADVISOR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </CoolSelect>
            </Field>
            <Field label="Date of Birth">
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min={DOB_MIN} max={dobMax()} className={inputCls} />
            </Field>
            <Field label="Team Member Since">
              <input type="date" value={teamMemberSince} onChange={(e) => setTeamMemberSince(e.target.value)} className={inputCls} />
            </Field>
            <Field label="PAN No." hint={pan && !panValid ? 'Format must be: 5 letters, 4 digits, 1 letter' : null}>
              <input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                className={inputCls + ' font-mono tracking-widest uppercase'}
              />
            </Field>
            <Field label="Aadhar No." hint={aadhar && !aadharValid ? 'Must be 12 digits' : null}>
              <input
                value={aadhar}
                onChange={(e) => setAadhar(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                placeholder="e.g. 123456789012"
                maxLength={12}
                className={inputCls + ' font-mono tracking-widest'}
              />
            </Field>
            <Field label="Marital Status">
              <CoolSelect value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={selectCls} placeholder="Select status…">
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
            <Field label="Email Address">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="e.g. you@teamfintness.com" />
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
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-indigo-500">Family Details</h4>
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
                        <input
                          value={member.name}
                          onChange={(e) => handleFamilyMemberChange(idx, 'name', e.target.value)}
                          placeholder="Name"
                          className={inputCls + ' text-xs py-1.5'}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <CoolSelect
                          value={member.relation}
                          onChange={(e) => handleFamilyMemberChange(idx, 'relation', e.target.value)}
                          className={selectCls + ' text-xs py-1.5'}
                        >
                          <option value="">Select relation…</option>
                          {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </CoolSelect>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={member.dob || ''}
                          onChange={(e) => handleFamilyMemberChange(idx, 'dob', e.target.value)}
                          min={DOB_MIN} max={dobMax()}
                          className={inputCls + ' text-xs py-1.5'}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={member.mobile || ''}
                          onChange={(e) => handleFamilyMemberChange(idx, 'mobile', e.target.value)}
                          placeholder="Mobile"
                          className={inputCls + ' text-xs py-1.5'}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveFamilyMember(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={handleAddFamilyMember}
            className="w-full py-2 border border-dashed border-slate-350 dark:border-slate-800 hover:border-indigo-500 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 transition-all cursor-pointer"
          >
            + Add Family Member
          </button>
        </div>

        {/* Bank Details */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-purple-500">Bank Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Account Holder Name">
              <input value={bankDetails.accountHolder} onChange={(e) => handleBankChange('accountHolder', e.target.value)} className={inputCls} placeholder="e.g. full name" />
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
      </div>
    </Modal>
  );
}
