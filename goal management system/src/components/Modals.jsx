import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, CheckCircle2, Upload, AlertCircle, FileSpreadsheet, ChevronDown, ChevronUp, UserCog, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Field, inputCls, selectCls, btnPrimary, btnSecondary, btnGhost, CoolSelect } from './UI';
import {
  calcGoal, monthsBetween, fmtFull, fmtINR, fmtSip, nv, parseNum, GOAL_PRESETS, CURRENT_MONTH, CURRENT_YEAR, MONTH_NAMES, needsKidName,
  DOB_MIN, dobMax, isValidDob, parseFlexibleDate,
} from '../utils/calc';
import { RELATIONS } from '../utils/team';
import { loadTeam } from '../services/team';
import { CountrySelect, StateSelect, CitySelect } from './LocationPicker';
import { isAdminRole } from '../utils/auth';

// Profession options for personal details
const PROFESSIONS = [
  'Salaried – Private Sector', 'Salaried – Government Sector', 'Business',
  'Self-Employed', 'Professional', 'Agriculturist / Farmer', 'Retired',
  'Homemaker', 'Student', 'Defence Personnel', 'NRI', 'Other',
];

// Client Type options
const CLIENT_TYPES = [
  'Retail', 'HNI', 'Ultra HNI',
];

// Marital status options for personal details
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];

function Modal({ title, onClose, children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl w-full flex flex-col max-h-[90vh] ${maxWidth} shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 rounded-b-2xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientFormModal({ initial, clients = [], autosaveKey, onClose, onSave }) {
  const isEdit = !!initial;
  const [activeTab, setActiveTab] = useState('personal');
  const [errors, setErrors] = useState({});
  const isAdmin = isAdminRole();

  // Load initial values safely — if an autosave draft exists for this form
  // (e.g. the advisor got interrupted midway through converting a lead),
  // restore it in preference to the plain prefill so no progress is lost.
  const draftKey = autosaveKey ? `crm:clientFormDraft:${autosaveKey}` : null;
  const draft = useMemo(() => {
    if (!draftKey) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [draftKey]);
  const initialDetails = draft?.clientDetails || initial?.clientDetails || {};

  // 1. Personal Details State
  const [name, setName] = useState(draft?.name ?? (initial ? initial.name : ''));
  const [pan, setPan] = useState(draft?.pan ?? (initial ? initial.pan : ''));
  const [age, setAge] = useState(draft?.age ?? (initial ? (initial.age || '') : ''));
  const [mobile, setMobile] = useState(initialDetails.mobile || '');
  const [email, setEmail] = useState(initialDetails.email || '');
  const [address1, setAddress1] = useState(initialDetails.address1 || '');
  const [address2, setAddress2] = useState(initialDetails.address2 || '');
  const [address3, setAddress3] = useState(initialDetails.address3 || '');
  const [country, setCountry] = useState(initialDetails.country || 'India');
  const [stateName, setStateName] = useState(initialDetails.state || '');
  const [city, setCity] = useState(initialDetails.city || '');
  const [pinCode, setPinCode] = useState(initialDetails.pinCode || '');
  const [status, setStatus] = useState(initialDetails.status || 'Active');

  // 2. Internal Details State — editable manager assignments (dropdowns)
  const [relationshipManager, setRelationshipManager] = useState(initialDetails.relationshipManager || '');
  const [portfolioManager, setPortfolioManager] = useState(initialDetails.portfolioManager || '');
  const [insuranceManager, setInsuranceManager] = useState(initialDetails.insuranceManager || '');
  const [serviceManager, setServiceManager] = useState(initialDetails.serviceManager || '');
  // Standing assignments — now real, editable account assignments (were hardcoded).
  const [owner, setOwner] = useState(initialDetails.owner || '');
  const [operationManager, setOperationManager] = useState(initialDetails.operationManager || '');
  const [internalManager, setInternalManager] = useState(initialDetails.internalManager || '');

  // 3. Family Details State (Tabular applicants name & relation & PAN)
  const [familyDetails, setFamilyDetails] = useState(
    Array.isArray(initialDetails.familyDetails) ? initialDetails.familyDetails : []
  );

  // 4. Business Details State (Mutual Funds, Insurance - Term, Medical, Accidental)
  const [mutualFunds, setMutualFunds] = useState(initialDetails.mutualFunds || 'No');
  const [insuranceTerm, setInsuranceTerm] = useState(initialDetails.insuranceTerm || 'No');
  const [insuranceMedical, setInsuranceMedical] = useState(initialDetails.insuranceMedical || 'No');
  const [insuranceAccidental, setInsuranceAccidental] = useState(initialDetails.insuranceAccidental || 'No');

  // 5. Profession (with free-text fallback when "Other" is selected)
  const [profession, setProfession] = useState(initialDetails.profession || '');
  const [professionOther, setProfessionOther] = useState(initialDetails.professionOther || '');

  // 6. Client Type & DOB (for primary applicant)
  const [clientType, setClientType] = useState(initialDetails.clientType || '');
  const [dob, setDob] = useState(initialDetails.dob || '');

  // 7. Marital Status (mapped into the MOM workspace)
  const [maritalStatus, setMaritalStatus] = useState(initialDetails.maritalStatus || '');

  // Autosave — persist this in-progress form to localStorage so a big form
  // (e.g. converting a lead to a client) never loses progress if the tab is
  // closed or the modal is dismissed accidentally. Cleared on successful save.
  useEffect(() => {
    if (!draftKey) return;
    const snapshot = {
      name, pan, age, mobile, email, address1, address2, address3, country, stateName, city, pinCode, status,
      relationshipManager, portfolioManager, insuranceManager, serviceManager, owner, operationManager, internalManager,
      familyDetails, mutualFunds, insuranceTerm, insuranceMedical, insuranceAccidental,
      profession, professionOther, clientType, dob, maritalStatus,
    };
    try { localStorage.setItem(draftKey, JSON.stringify(snapshot)); } catch { /* storage full/unavailable — skip */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftKey, name, pan, age, mobile, email, address1, address2, address3, country, stateName, city, pinCode, status,
    relationshipManager, portfolioManager, insuranceManager, serviceManager, owner, operationManager, internalManager,
    familyDetails, mutualFunds, insuranceTerm, insuranceMedical, insuranceAccidental,
    profession, professionOther, clientType, dob, maritalStatus,
  ]);

  const clearDraft = () => { if (draftKey) { try { localStorage.removeItem(draftKey); } catch { /* noop */ } } };

  useEffect(() => {
    if (dob) {
      const birthDate = new Date(dob);
      if (!isNaN(birthDate.getTime())) {
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        setAge(calculatedAge >= 0 ? String(calculatedAge) : '0');
      }
    }
  }, [dob]);

  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

  const handleAddFamilyMember = () => {
    setFamilyDetails([...familyDetails, { name: '', relation: '', pan: '', dob: '', mobile: '', email: '' }]);
  };

  const handleRemoveFamilyMember = (idx) => {
    setFamilyDetails(familyDetails.filter((_, i) => i !== idx));
  };

  const handleFamilyMemberChange = (idx, field, val) => {
    const updated = familyDetails.map((m, i) => i === idx ? { ...m, [field]: val } : m);
    setFamilyDetails(updated);
  };

  
  const handleSave = () => {
    const errs = {};
    
    // Validate Personal Details
    if (!name.trim()) errs.name = "Required";
    if (!age || isNaN(age) || age <= 0) errs.age = "Required";
    if (!dob) errs.dob = "Required";
    else if (!isValidDob(dob)) errs.dob = dob > dobMax() ? "Cannot be in the future" : "Enter a valid date of birth";
    
    if (!pan.trim()) errs.pan = "Required";
    else if (pan.length !== 10 || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) errs.pan = "Invalid format";
    else if (clients.some(c => c.id !== initial?.id && (c.pan || '').toUpperCase() === pan.toUpperCase())) {
      errs.pan = "A client with this PAN already exists — group leader PAN must be unique";
    }

    if (!mobile.trim()) errs.mobile = "Required";
    else if (mobile.replace(/[^0-9]/g, '').length < 10) errs.mobile = "Invalid format";
    
    if (!email.trim()) errs.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid format";
    
    if (!clientType) errs.clientType = "Required";
    if (!status) errs.status = "Required";
    if (!profession) errs.profession = "Required";
    if (profession === 'Other' && !professionOther.trim()) errs.professionOther = "Required";
    
    if (!address1.trim()) errs.address1 = "Required";
    if (!address2.trim()) errs.address2 = "Required";
    if (!address3.trim()) errs.address3 = "Required";
    
    if (!country) errs.country = "Required";
    if (!stateName) errs.stateName = "Required";
    if (!city) errs.city = "Required";
    
    if (!pinCode.trim()) errs.pinCode = "Required";
    else if (!/^\d{6}$/.test(pinCode)) errs.pinCode = "6 digits required";
    
    // Validate Internal Details
    if (!relationshipManager) errs.relationshipManager = "Required";
    if (!portfolioManager) errs.portfolioManager = "Required";
    if (!insuranceManager) errs.insuranceManager = "Required";
    if (!serviceManager) errs.serviceManager = "Required";

    // Validate Family & Business (Relation is optional)
    let hasFamErrs = false;
    const famErrs = {};
    familyDetails.forEach((f, idx) => {
      const fE = {};
      if (!f.name.trim()) { fE.name = "Required"; hasFamErrs = true; }
      if (!f.pan?.trim()) { fE.pan = "Required"; hasFamErrs = true; }
      else if (f.pan.length !== 10 || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(f.pan)) { fE.pan = "Invalid format"; hasFamErrs = true; }
      if (!f.dob) { fE.dob = "Required"; hasFamErrs = true; }
      else if (!isValidDob(f.dob)) { fE.dob = f.dob > dobMax() ? "Cannot be in the future" : "Enter a valid date of birth"; hasFamErrs = true; }
      if (Object.keys(fE).length > 0) famErrs[idx] = fE;
    });

    setErrors(errs);
    if (hasFamErrs) errs.familyDetails = famErrs;

    if (Object.keys(errs).length > 0 || hasFamErrs) {
      alert("Please fix the highlighted errors before saving. Make sure to check all tabs.");
      
      // Auto-switch to the first tab with an error
      if (['name', 'age', 'dob', 'pan', 'mobile', 'email', 'clientType', 'status', 'profession', 'professionOther', 'address1', 'address2', 'address3', 'country', 'stateName', 'city', 'pinCode'].some(k => errs[k])) {
        setActiveTab('personal');
      } else if (['relationshipManager', 'portfolioManager', 'insuranceManager', 'serviceManager'].some(k => errs[k])) {
        setActiveTab('internal');
      } else {
        setActiveTab('familyBusiness');
      }
      return;
    }

    const clientDetails = {
      mobile,
      email,
      clientType,
      dob,
      address1,
      address2,
      address3,
      country,
      state: stateName,
      city,
      pinCode,
      profession,
      professionOther: profession === 'Other' ? professionOther : '',
      relationshipManager,
      portfolioManager,
      insuranceManager,
      serviceManager,
      owner,
      operationManager,
      internalManager,
      familyDetails: familyDetails.filter(f => f.name.trim()),
      mutualFunds,
      insuranceTerm,
      insuranceMedical,
      insuranceAccidental,
      status,
      maritalStatus,
      // Preserve any previously-saved CRM data (editor removed from this form)
      openActivities: initialDetails.openActivities || [],
      closedActivities: initialDetails.closedActivities || [],
      meetingHistory: initialDetails.meetingHistory || [],
      businessProspects: initialDetails.businessProspects || [],
      attachments: initialDetails.attachments || [],
      notes: initialDetails.notes || '',
    };
    clearDraft();
    onSave(name, pan, Number(age) || 0, clientDetails);
  };

  const tabClass = (tab) => `
    flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer
    ${activeTab === tab 
      ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-extrabold' 
      : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:border-slate-300'}
  `;

  return (
    <Modal
      title={isEdit ? "Edit Client Profile" : "Create Client Profile"}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          {activeTab === 'personal' && (
            <button onClick={() => setActiveTab('internal')} className={btnPrimary}>
              Next
            </button>
          )}
          {activeTab === 'internal' && (
            <button onClick={() => setActiveTab('familyBusiness')} className={btnPrimary}>
              Next
            </button>
          )}
          {activeTab === 'familyBusiness' && (
            <button 
              onClick={handleSave} 
              className={btnPrimary}
            >
              {isEdit ? "Save Changes" : "Create Client"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-800">
          <button type="button" onClick={() => setActiveTab('personal')} className={tabClass('personal')}>Personal Details</button>
          <button type="button" onClick={() => setActiveTab('internal')} className={tabClass('internal')}>Internal Details</button>
          <button type="button" onClick={() => setActiveTab('familyBusiness')} className={tabClass('familyBusiness')}>Family & Business</button>
        </div>

        {/* Tab 1: Personal Details */}
        {activeTab === 'personal' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            <Field label="Full Name *" error={errors.name}>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Aarav Sharma" />
            </Field>
            <Field label="Age (Auto-calculated) *" error={errors.age}>
              <input type="number" value={age} readOnly className={`${inputCls} bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed`} placeholder="Select Date of Birth first" />
            </Field>
            <Field label="Date of Birth *" error={errors.dob}>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min={DOB_MIN} max={dobMax()} className={inputCls} />
            </Field>
            <Field label="PAN Card Number *" error={errors.pan} hint={pan && !panValid ? 'Format usually: 5 letters, 4 digits, 1 letter' : null}>
              <input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g. ABCDE1234F"
                maxLength={10}
                className={inputCls + ' font-mono tracking-widest uppercase'}
              />
            </Field>
            <Field label="Mobile Number *" error={errors.mobile}>
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputCls} placeholder="e.g. +91 98765 43210" />
            </Field>
            <Field label="Email Address *" error={errors.email}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="e.g. aarav@example.com" />
            </Field>
            <Field label="Client Type *" error={errors.clientType}>
              <div className="relative">
                <CoolSelect value={clientType} onChange={(e) => setClientType(e.target.value)} className={selectCls}>
                  <option value="">Select client type…</option>
                  {CLIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </CoolSelect>
              </div>
            </Field>
            <Field label="Client Status *" error={errors.status} hint={!isAdmin ? 'Only Admin can change client status' : null}>
              <div className="relative">
                <CoolSelect value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls + (!isAdmin ? ' opacity-60 cursor-not-allowed' : '')} disabled={!isAdmin}>
                  <option value="Active">Active</option>
                  <option value="Dead">Dead</option>
                  <option value="Inactive">Inactive</option>
                </CoolSelect>
              </div>
            </Field>
            <Field label="Marital Status">
              <div className="relative">
                <CoolSelect value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} className={selectCls}>
                  <option value="">Select marital status…</option>
                  {MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
                </CoolSelect>
              </div>
            </Field>
            <Field label="Profession *" error={errors.profession}>
              <div className="relative">
                <CoolSelect value={profession} onChange={(e) => setProfession(e.target.value)} className={selectCls}>
                  <option value="">Select profession…</option>
                  {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </CoolSelect>
              </div>
              {profession === 'Other' && (
                <input
                  value={professionOther}
                  onChange={(e) => setProfessionOther(e.target.value)}
                  placeholder="Please specify profession"
                  className={inputCls + ' mt-2 animate-fade-in'}
                />
              )}
            </Field>
            <Field label="Address Line 1 *" error={errors.address1}>
              <input value={address1} onChange={(e) => setAddress1(e.target.value)} className={inputCls} placeholder="Flat/House No, Building Name" />
            </Field>
            <Field label="Address Line 2 *" error={errors.address2}>
              <input value={address2} onChange={(e) => setAddress2(e.target.value)} className={inputCls} placeholder="Street, Area, Locality" />
            </Field>
            <Field label="Address Line 3 *" error={errors.address3}>
              <input value={address3} onChange={(e) => setAddress3(e.target.value)} className={inputCls} placeholder="Landmark (Optional)" />
            </Field>
            <Field label="Country *" error={errors.country}>
              <CountrySelect
                value={country}
                onChange={(v) => { setCountry(v); setStateName(''); setCity(''); }}
              />
            </Field>
            <Field label="State *" error={errors.stateName}>
              <StateSelect
                country={country}
                value={stateName}
                onChange={(v) => { setStateName(v); setCity(''); }}
              />
            </Field>
            <Field label="City *" error={errors.city}>
              <CitySelect country={country} state={stateName} value={city} onChange={setCity} />
            </Field>
            <Field label="Pin Code *" error={errors.pinCode}>
              <input value={pinCode} onChange={(e) => setPinCode(e.target.value)} className={inputCls} placeholder="e.g. 400001" />
            </Field>
          </div>
        )}

        {/* Tab 2: Internal Details */}
        {activeTab === 'internal' && (
          <div className="space-y-6 animate-fade-in">
            {/* Editable manager assignments */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pl-2 border-l-2 border-blue-500">
                <UserCog size={15} className="text-blue-600 dark:text-blue-400" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">Manager Assignments</h4>
              </div>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 pl-3.5">Assign team members from the roster to each managing role for this client.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Relationship Manager *" error={errors.relationshipManager}>
                  <ManagerSelect value={relationshipManager} onChange={setRelationshipManager} />
                </Field>
                <Field label="Portfolio Manager *" error={errors.portfolioManager}>
                  <ManagerSelect value={portfolioManager} onChange={setPortfolioManager} />
                </Field>
                <Field label="Insurance Manager *" error={errors.insuranceManager}>
                  <ManagerSelect value={insuranceManager} onChange={setInsuranceManager} />
                </Field>
                <Field label="Service Manager *" error={errors.serviceManager}>
                  <ManagerSelect value={serviceManager} onChange={setServiceManager} />
                </Field>
              </div>
            </div>

            {/* Standing assignments — real accounts from the team directory. */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pl-2 border-l-2 border-indigo-500">
                <UserCog size={14} className="text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">Standing Assignments</h4>
              </div>
              <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 pl-3.5">Assign real team members to these roles for this client.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Owner"><ManagerSelect value={owner} onChange={setOwner} /></Field>
                <Field label="Operation Manager"><ManagerSelect value={operationManager} onChange={setOperationManager} /></Field>
                <Field label="Internal Manager"><ManagerSelect value={internalManager} onChange={setInternalManager} /></Field>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Family & Business Details */}
        {activeTab === 'familyBusiness' && (
          <div className="space-y-6 animate-fade-in">
            {/* Family Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-blue-500">Family Details</h4>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-sm">
                <table className="w-full text-xs text-left min-w-[760px]">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Applicant Name *</th>
                      <th className="px-4 py-3">PAN *</th>
                      <th className="px-4 py-3">Relation</th>
                      <th className="px-4 py-3">Date of Birth *</th>
                      <th className="px-4 py-3">Mobile</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 w-16 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {familyDetails.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500 italic">No family members added yet.</td>
                      </tr>
                    ) : (
                      familyDetails.map((member, idx) => (
                        <tr key={idx} className="bg-white dark:bg-slate-950">
                          <td className="px-4 py-2 align-top">
                            <input 
                              value={member.name} 
                              onChange={(e) => handleFamilyMemberChange(idx, 'name', e.target.value)} 
                              placeholder="Applicant Name" 
                              className={`${inputCls} text-xs py-1.5 ${errors.familyDetails?.[idx]?.name ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''}`} 
                            />
                            {errors.familyDetails?.[idx]?.name && <p className="text-[10px] text-rose-600 font-bold mt-1">{errors.familyDetails[idx].name}</p>}
                          </td>
                          <td className="px-4 py-2 align-top">
                            <input
                              value={member.pan || ''}
                              onChange={(e) => handleFamilyMemberChange(idx, 'pan', e.target.value.toUpperCase().slice(0, 10))}
                              placeholder="e.g. ABCDE1234F"
                              className={`${inputCls} text-xs py-1.5 font-mono font-semibold uppercase ${errors.familyDetails?.[idx]?.pan ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
                              maxLength={10}
                            />
                            {errors.familyDetails?.[idx]?.pan && <p className="text-[10px] text-rose-600 font-bold mt-1">{errors.familyDetails[idx].pan}</p>}
                          </td>
                          <td className="px-4 py-2 align-top">
                            <div className="relative">
                              <CoolSelect
                                value={member.relation}
                                onChange={(e) => handleFamilyMemberChange(idx, 'relation', e.target.value)}
                                className={selectCls + ' text-xs py-1.5'}
                              >
                                <option value="">Select relation…</option>
                                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                              </CoolSelect>
                            </div>
                          </td>
                          <td className="px-4 py-2 align-top">
                            <input
                              type="date"
                              value={member.dob || ''}
                              onChange={(e) => handleFamilyMemberChange(idx, 'dob', e.target.value)}
                              min={DOB_MIN} max={dobMax()}
                              className={`${inputCls} text-xs py-1.5 ${errors.familyDetails?.[idx]?.dob ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20' : ''}`}
                            />
                            {errors.familyDetails?.[idx]?.dob && <p className="text-[10px] text-rose-600 font-bold mt-1">{errors.familyDetails[idx].dob}</p>}
                          </td>
                          <td className="px-4 py-2 align-top">
                            <input
                              value={member.mobile || ''}
                              onChange={(e) => handleFamilyMemberChange(idx, 'mobile', e.target.value)}
                              placeholder="Mobile"
                              className={`${inputCls} text-xs py-1.5`}
                            />
                          </td>
                          <td className="px-4 py-2 align-top">
                            <input
                              type="email"
                              value={member.email || ''}
                              onChange={(e) => handleFamilyMemberChange(idx, 'email', e.target.value)}
                              placeholder="Email"
                              className={`${inputCls} text-xs py-1.5`}
                            />
                          </td>
                          <td className="px-4 py-2 text-center align-top">
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
                className="w-full py-2 border border-dashed border-slate-350 dark:border-slate-800 hover:border-blue-500 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/10 dark:hover:bg-blue-950/10 transition-all cursor-pointer"
              >
                + Add Family Member
              </button>
            </div>

            {/* Business Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider pl-2 border-l-2 border-blue-500">Business Details</h4>
              <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 w-40 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr className="bg-white dark:bg-slate-950">
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Mutual Funds</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-w-[120px] mx-auto">
                          {['Yes', 'No'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setMutualFunds(val)}
                              className={`flex-1 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                                mutualFunds === val 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-950">
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Term Insurance</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-w-[120px] mx-auto">
                          {['Yes', 'No'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setInsuranceTerm(val)}
                              className={`flex-1 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                                insuranceTerm === val 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-950">
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Medical Insurance</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-w-[120px] mx-auto">
                          {['Yes', 'No'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setInsuranceMedical(val)}
                              className={`flex-1 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                                insuranceMedical === val 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-white dark:bg-slate-950">
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Accidental Insurance</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-w-[120px] mx-auto">
                          {['Yes', 'No'].map(val => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setInsuranceAccidental(val)}
                              className={`flex-1 py-1 text-[10px] font-bold transition-all cursor-pointer ${
                                insuranceAccidental === val 
                                  ? 'bg-blue-600 text-white' 
                                  : 'bg-white dark:bg-slate-950 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                              }`}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function GoalFormModal({ initial, onClose, onSave }) {
  const isEdit = !!initial;
  const initialIsPreset = initial ? GOAL_PRESETS.includes(initial.name) && initial.name !== 'Others' : true;
  const [nameChoice, setNameChoice] = useState(initial ? (initialIsPreset ? initial.name : 'Others') : '');
  const [customName, setCustomName] = useState(initial && !initialIsPreset ? initial.name : '');
  const [kidName, setKidName] = useState(initial ? (initial.kidName || '') : '');
  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    amount: initial.amount,
    targetMonth: initial.targetMonth || 1,
    targetYear: initial.targetYear,
    inflation: initial.inflation,
    expectedReturn: initial.expectedReturn,
    sipIncRate: initial.sipIncRate,
    currentInv: initial.currentInv,
    currentSip: initial.currentSip,
    createdMonth: initial.createdMonth || CURRENT_MONTH,
    createdYear: initial.createdYear || CURRENT_YEAR,
  } : {
    name: '',
    amount: undefined,
    targetMonth: CURRENT_MONTH,
    targetYear: CURRENT_YEAR + 10,
    inflation: 6,
    expectedReturn: 12,
    sipIncRate: 10,
    currentInv: undefined,
    currentSip: undefined,
    createdMonth: CURRENT_MONTH,
    createdYear: CURRENT_YEAR,
  });
  
  // Editable goal creation/anchor date — lets backdated goals (created before this app existed) compound correctly
  const [createdDate, setCreatedDate] = useState(() => {
    if (initial?.createdAt) {
      const d = new Date(initial.createdAt);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (initial) {
      const m = String(initial.createdMonth || CURRENT_MONTH).padStart(2, '0');
      return `${initial.createdYear || CURRENT_YEAR}-${m}-01`;
    }
    return new Date().toISOString().slice(0, 10);
  });

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleCreatedDateChange = (e) => {
    const v = e.target.value;
    setCreatedDate(v);
    const d = new Date(v + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      setForm(f => ({ ...f, createdMonth: d.getMonth() + 1, createdYear: d.getFullYear() }));
    }
  };
  const effectiveName = nameChoice === 'Others' ? customName.trim() : nameChoice;
  const showKidName = needsKidName(effectiveName);
  const previewCalc = calcGoal({ ...form, name: effectiveName });
  const targetBeforeStart = monthsBetween(form.createdMonth, form.createdYear, form.targetMonth, form.targetYear) <= 0;

  const handleSave = () => {
    if (!effectiveName || targetBeforeStart || !form.amount) return;
    const createdAtDate = new Date(createdDate + 'T00:00:00');
    const createdAt = isNaN(createdAtDate.getTime()) ? (initial?.createdAt || new Date().toISOString()) : createdAtDate.toISOString();
    const normalized = {
      ...form,
      name: effectiveName,
      kidName: showKidName ? kidName.trim() : '',
      amount: Number(form.amount) || 0,
      inflation: Number(form.inflation) || 0,
      expectedReturn: Number(form.expectedReturn) || 0,
      sipIncRate: Number(form.sipIncRate) || 0,
      currentInv: Number(form.currentInv) || 0,
      currentSip: Number(form.currentSip) || 0,
      createdAt,
    };
    onSave(normalized);
  };

  return (
    <Modal
      title={isEdit ? 'Modify Goal parameters' : 'Configure New Goal'}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button onClick={handleSave} disabled={!effectiveName || targetBeforeStart || !form.amount} className={btnPrimary}>
              {isEdit ? 'Save Changes' : 'Configure Goal'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Goal Category Preset">
          <div className="relative">
            <CoolSelect value={nameChoice} onChange={(e) => setNameChoice(e.target.value)} className={selectCls}>
              <option value="" disabled>Select target goal preset…</option>
              {GOAL_PRESETS.map(g => <option key={g} value={g}>{g}</option>)}
            </CoolSelect>
          </div>
          {nameChoice === 'Others' && (
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Enter custom goal description"
              className={inputCls + ' mt-2 animate-fade-in'}
            />
          )}
          {showKidName && (
            <div className="mt-2 animate-fade-in">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Kid's Name</label>
              <input
                value={kidName}
                onChange={(e) => setKidName(e.target.value)}
                placeholder="e.g. Aanya"
                className={inputCls}
              />
            </div>
          )}
        </Field>
        <Field label="Target cost today (₹)">
          <input type="number" value={nv(form.amount)} onChange={(e) => upd('amount', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 50,00,000" />
        </Field>

        <Field label="Goal Created Date" hint="Backdate this if the goal already existed before using this app">
          <input type="date" value={createdDate} onChange={handleCreatedDateChange} max={new Date().toISOString().slice(0, 10)} className={inputCls} />
        </Field>
        <div className="hidden md:block" />

        <Field label="Target Month">
          <div className="relative">
            <CoolSelect value={form.targetMonth} onChange={(e) => upd('targetMonth', Number(e.target.value))} className={selectCls}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </CoolSelect>
          </div>
        </Field>
        <Field label="Target Year">
          <input type="number" value={nv(form.targetYear)} onChange={(e) => upd('targetYear', parseNum(e, 0))} className={inputCls} />
        </Field>

        <Field label="Future cost (inflation-adjusted)">
          <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-bold tabular-nums shadow-sm">{fmtFull(previewCalc.futureValue)}</div>
        </Field>
        <Field label="Planning Horizon">
          <div className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 shadow-sm">
            {targetBeforeStart ? <span className="text-rose-600 dark:text-rose-400 font-bold">Target date must be in future</span> : <span className="tabular-nums font-semibold">{previewCalc.months} months ({previewCalc.years.toFixed(2)} yrs)</span>}
          </div>
        </Field>

        <Field label="Assumed Inflation Rate (%)">
          <input type="number" step="0.1" value={nv(form.inflation)} onChange={(e) => upd('inflation', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="Expected Portfolio Return (%)">
          <input type="number" step="0.1" value={nv(form.expectedReturn)} onChange={(e) => upd('expectedReturn', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="SIP Annual Step-Up (%)">
          <input type="number" step="0.1" value={nv(form.sipIncRate)} onChange={(e) => upd('sipIncRate', parseNum(e))} className={inputCls} />
        </Field>
        <Field label="Existing Accumulated Corpus (₹)">
          <input type="number" value={nv(form.currentInv)} onChange={(e) => upd('currentInv', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 5,00,000" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Current Monthly SIP Allocation (₹)">
            <input type="number" value={nv(form.currentSip)} onChange={(e) => upd('currentSip', parseNum(e, 0))} className={inputCls} placeholder="₹ e.g. 25,000" />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 p-5 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-slate-950 dark:to-slate-900 border border-blue-100 dark:border-slate-800 rounded-xl shadow-sm">
        <PreviewTile label="Required Monthly SIP" value={fmtSip(previewCalc.sipRequired) + '/mo'} />
        <PreviewTile label="Additional SIP Needed" value={previewCalc.sipOnTrack ? null : (fmtSip(previewCalc.additionalSip) + '/mo')} pill={previewCalc.sipOnTrack ? 'On track' : null} />
        <PreviewTile label="Lump-sum Equivalent" value={fmtINR(previewCalc.lumpSumRequired)} />
        <PreviewTile label="Projected Progress" value={previewCalc.achievementPct.toFixed(1) + '%'} />
      </div>
    </Modal>
  );
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One family member's field errors — mirrors the manual Create/Edit Client
// form's rule (a family row that has a name needs a valid PAN and DOB too;
// mobile/email are optional but checked for format if given).
function familyMemberErrors(f) {
  const ff = {};
  if (!f.pan) ff.pan = 'Missing PAN';
  else if (!PAN_RE.test(f.pan)) ff.pan = 'Invalid PAN format';
  if (!f.dob) ff.dob = 'Missing DOB';
  else if (!isValidDob(f.dob)) ff.dob = 'Invalid DOB';
  if (f.email && !EMAIL_RE.test(f.email)) ff.email = 'Invalid email';
  return ff;
}

// Resolve a manager reference from the sheet (a team member's id, verbatim,
// or their name, case-insensitively) to a real active team member id — same
// matching rule App.jsx's resolveManager() uses at actual import time, so a
// row that validates here won't silently import with a blank manager there.
function resolveManagerId(v, team) {
  if (!v) return '';
  if (team.some((m) => m.id === v)) return v;
  const hit = team.find((m) => m.name.trim().toLowerCase() === String(v).trim().toLowerCase());
  return hit ? hit.id : '';
}

const MANAGER_LABELS = {
  relationshipManager: 'Relationship Manager',
  portfolioManager: 'Portfolio Manager',
  insuranceManager: 'Insurance Manager',
  serviceManager: 'Service Manager',
};

// Every reason a parsed row can't be imported as-is — the full rule set the
// manual Create/Edit Client form enforces (required fields, email/mobile/
// pincode/DOB format, a manager name that actually matches someone), plus
// duplicate-PAN checks the manual form doesn't need (one row at a time
// there; a whole sheet here). `fields` flags exactly which columns are
// wrong, `familyFields[i]` the same for the i-th family member — the
// preview table highlights and lets you fix both right there.
function rowErrors(r, i, allRows, existingClients, team) {
  const fields = {};
  const msgs = [];
  const flag = (field, msg) => { fields[field] = true; msgs.push(msg); };

  if (!r.name) flag('name', 'Missing name');
  if (!r.pan) flag('pan', 'Missing PAN');
  else if (!PAN_RE.test(r.pan)) flag('pan', 'Invalid PAN format');
  else if (allRows.some((other, j) => j !== i && other.pan === r.pan)) flag('pan', 'Duplicate PAN in sheet');
  else if (existingClients.some((c) => (c.pan || '').toUpperCase() === r.pan)) flag('pan', 'PAN already exists');

  if (!r.email) flag('email', 'Missing email');
  else if (!EMAIL_RE.test(r.email)) flag('email', 'Invalid email');
  if (!r.mobile) flag('mobile', 'Missing mobile');
  else if (r.mobile.replace(/[^0-9]/g, '').length < 10) flag('mobile', 'Invalid mobile');
  if (!r.pinCode) flag('pinCode', 'Missing pincode');
  else if (!/^\d{6}$/.test(r.pinCode)) flag('pinCode', 'Invalid pincode');
  if (!r.dob) flag('dob', 'Missing DOB');
  else if (!isValidDob(r.dob)) flag('dob', 'Invalid DOB');
  // Address is required on the manual Create/Edit Client form — match that
  // here too, since a bulk-imported client shouldn't skip a rule a manually
  // added one can't.
  if (!r.address1) flag('address1', 'Missing address line 1');
  if (!r.address2) flag('address2', 'Missing address line 2');
  if (!r.address3) flag('address3', 'Missing address line 3');
  if (!r.clientType) flag('clientType', 'Missing client type');
  if (!r.profession) flag('profession', 'Missing profession');
  if (!r.state) flag('state', 'Missing state');
  if (!r.city) flag('city', 'Missing city');

  for (const mf of Object.keys(MANAGER_LABELS)) {
    const v = r.managers?.[mf];
    if (!v) flag(mf, `Missing ${MANAGER_LABELS[mf]}`);
    else if (!resolveManagerId(v, team)) flag(mf, `${MANAGER_LABELS[mf]} "${v}" doesn't match any team member`);
  }

  const familyFields = (r.familyDetails || []).map(familyMemberErrors);
  familyFields.forEach((ff, fi) => {
    if (Object.keys(ff).length) msgs.push(`Family ${fi + 1} (${r.familyDetails[fi].name}): ${Object.values(ff).join(', ')}`);
  });

  return { fields, msgs, familyFields };
}

// Normalize a header for fuzzy matching: lowercase, strip spaces/dots/_/-.
const normHeader = (h) => String(h).toLowerCase().replace(/[\s._-]/g, '');

// Candidate header keys (already normalized) for each client field, so the
// sheet's column labels don't have to match a rigid template exactly.
const COLS = {
  name: ['name', 'clientname', 'fullname', 'applicantname'],
  pan: ['pan', 'panno', 'pannumber', 'pancard', 'pancardno'],
  age: ['age', 'clientage', 'years'],
  dob: ['dob', 'dateofbirth', 'birthdate', 'birthday'],
  mobile: ['mobile', 'mobileno', 'mobilenumber', 'phone', 'phoneno', 'contact', 'contactno'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  clientType: ['clienttype', 'type', 'category'],
  profession: ['profession', 'occupation', 'job'],
  address1: ['address1', 'addressline1', 'address', 'addr1'],
  address2: ['address2', 'addressline2', 'addr2'],
  address3: ['address3', 'addressline3', 'addr3'],
  city: ['city'],
  state: ['state'],
  country: ['country'],
  pinCode: ['pincode', 'pin', 'postalcode', 'zip', 'zipcode'],
  status: ['status', 'clientstatus'],
  mutualFunds: ['mutualfunds', 'mutualfund', 'mf'],
  insuranceTerm: ['terminsurance', 'insuranceterm', 'term'],
  insuranceMedical: ['medicalinsurance', 'insurancemedical', 'medical', 'health', 'healthinsurance'],
  insuranceAccidental: ['accidentalinsurance', 'insuranceaccidental', 'accidental'],
  relationshipManager: ['relationshipmanager', 'rm'],
  portfolioManager: ['portfoliomanager', 'pm'],
  insuranceManager: ['insurancemanager', 'im'],
  serviceManager: ['servicemanager', 'sm'],
  owner: ['owner', 'accountowner'],
  operationManager: ['operationmanager', 'operationsmanager', 'opsmanager', 'om'],
  internalManager: ['internalmanager'],
};

const MANAGER_FIELDS = ['relationshipManager', 'portfolioManager', 'insuranceManager', 'serviceManager', 'owner', 'operationManager', 'internalManager'];
const HOLDING_FIELDS = ['mutualFunds', 'insuranceTerm', 'insuranceMedical', 'insuranceAccidental'];

const yesNo = (v) => {
  const s = String(v).trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return 'Yes';
  return 'No';
};

// The full set of columns the sample template ships with (also the export order).
const TEMPLATE_HEADERS = [
  'Name', 'PAN', 'Age', 'DOB', 'Mobile', 'Email', 'Client Type', 'Profession',
  'Address 1', 'Address 2', 'Address 3', 'City', 'State', 'Country', 'Pincode', 'Status',
  'Mutual Funds', 'Term Insurance', 'Medical Insurance', 'Accidental Insurance',
  'Relationship Manager', 'Portfolio Manager', 'Insurance Manager', 'Service Manager', 'Owner', 'Operation Manager', 'Internal Manager',
  'Family 1 Name', 'Family 1 Relation', 'Family 1 PAN', 'Family 1 DOB', 'Family 1 Mobile', 'Family 1 Email',
  'Family 2 Name', 'Family 2 Relation', 'Family 2 PAN', 'Family 2 DOB', 'Family 2 Mobile', 'Family 2 Email',
  // A 3rd example makes the "just keep numbering" pattern obvious — the import
  // parser (see famKeys below) already reads "Family <n> ..." for any n, so
  // there's no real cap; Family 4, 5, etc. work exactly the same way.
  'Family 3 Name', 'Family 3 Relation', 'Family 3 PAN', 'Family 3 DOB', 'Family 3 Mobile', 'Family 3 Email',
];

export function ExcelImportModal({ onClose, onImport, clients = [] }) {
  const fileRef = useRef();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  // Keyed by the sheet's own row number (stable across partial imports —
  // array position isn't, once imported rows are removed from `rows`).
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const downloadTemplate = () => {
    const example = {
      Name: 'Aarav Sharma', PAN: 'ABCPS1234A', Age: 33, DOB: '1992-05-15',
      Mobile: '9876543210', Email: 'aarav@example.com', 'Client Type': 'HNI', Profession: 'Salaried – Private Sector',
      'Address 1': 'Flat 101, Sunrise Apartments', 'Address 2': 'MG Road', 'Address 3': 'Near City Mall',
      City: 'Jaipur', State: 'Rajasthan', Country: 'India', Pincode: '302004', Status: 'Active',
      'Mutual Funds': 'Yes', 'Term Insurance': 'No', 'Medical Insurance': 'Yes', 'Accidental Insurance': 'No',
      'Relationship Manager': 'Mehul Khandelwal', 'Portfolio Manager': 'Nitesh Luthra', 'Insurance Manager': 'Mehul Khandelwal',
      'Service Manager': 'Mehul Khandelwal', Owner: 'Nitesh Luthra', 'Operation Manager': 'Mehul Khandelwal', 'Internal Manager': 'Mehul Khandelwal',
      'Family 1 Name': 'Nisha Sharma', 'Family 1 Relation': 'Spouse', 'Family 1 PAN': 'XYZPN5678B', 'Family 1 DOB': '1994-08-22', 'Family 1 Mobile': '9876500000', 'Family 1 Email': 'nisha@example.com',
      'Family 2 Name': 'Aryan Sharma', 'Family 2 Relation': 'Son', 'Family 2 PAN': '', 'Family 2 DOB': '2016-03-10', 'Family 2 Mobile': '', 'Family 2 Email': '',
      'Family 3 Name': 'Kavita Sharma', 'Family 3 Relation': 'Mother', 'Family 3 PAN': '', 'Family 3 DOB': '1965-11-02', 'Family 3 Mobile': '', 'Family 3 Email': '',
    };
    const ws = XLSX.utils.json_to_sheet([example], { header: TEMPLATE_HEADERS });
    ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, 'client_import_template.xlsx');
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setRows(null);
    setImportedCount(0);
    setExpandedRows(new Set());

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data.length) { setError('The sheet appears to be empty.'); return; }

        const headers = Object.keys(data[0]);
        // Map each declared field to the actual header key present in the sheet.
        const keyFor = {};
        for (const [field, cands] of Object.entries(COLS)) {
          const hit = headers.find((h) => cands.includes(normHeader(h)));
          if (hit) keyFor[field] = hit;
        }
        // Family columns: "Family <n> <Field>" -> famKeys[n][field] = header.
        const famKeys = {};
        for (const h of headers) {
          const m = normHeader(h).match(/^family(\d+)(name|relation|pan|dob|mobile|email)$/);
          if (m) {
            const idx = Number(m[1]);
            (famKeys[idx] = famKeys[idx] || {})[m[2]] = h;
          }
        }

        if (!keyFor.name) { setError('Could not find a "Name" column in the sheet.'); return; }
        if (!keyFor.pan) { setError('Could not find a "PAN" column in the sheet.'); return; }

        const val = (r, field) => (keyFor[field] ? String(r[keyFor[field]] ?? '').trim() : '');

        const parsed = data
          .map((r, i) => {
            const familyDetails = Object.keys(famKeys)
              .sort((a, b) => Number(a) - Number(b))
              .map((idx) => {
                const fk = famKeys[idx];
                const g = (f) => (fk[f] ? String(r[fk[f]] ?? '').trim() : '');
                // DOB needs the raw cell value (number/Date/text) before it's
                // stringified, so parseFlexibleDate can tell them apart.
                const dob = fk.dob ? parseFlexibleDate(r[fk.dob]) : '';
                return { name: g('name'), relation: g('relation'), pan: g('pan').toUpperCase(), dob, mobile: g('mobile'), email: g('email') };
              })
              .filter((f) => f.name);

            const managers = {};
            for (const mf of MANAGER_FIELDS) managers[mf] = val(r, mf);
            const holdings = {};
            for (const hf of HOLDING_FIELDS) holdings[hf] = keyFor[hf] ? yesNo(r[keyFor[hf]]) : 'No';

            return {
              rowNum: i + 2,
              name: val(r, 'name'),
              pan: val(r, 'pan').toUpperCase(),
              age: keyFor.age ? (Number(r[keyFor.age]) || 0) : 0,
              dob: keyFor.dob ? parseFlexibleDate(r[keyFor.dob]) : '', mobile: val(r, 'mobile'), email: val(r, 'email'),
              clientType: val(r, 'clientType'), profession: val(r, 'profession'),
              address1: val(r, 'address1'), address2: val(r, 'address2'), address3: val(r, 'address3'),
              city: val(r, 'city'), state: val(r, 'state'), country: val(r, 'country') || 'India',
              pinCode: val(r, 'pinCode'), status: val(r, 'status') || 'Active',
              ...holdings, managers, familyDetails,
            };
          })
          .filter((r) => r.name || r.pan);

        if (!parsed.length) { setError('No data rows found after the header.'); return; }
        setRows(parsed);
      } catch {
        setError('Failed to read the file. Make sure it is a valid .xlsx or .xls file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const team = loadTeam();
  const errorsByRow = useMemo(
    () => rows ? rows.map((r, i) => rowErrors(r, i, rows, clients, team)) : [],
    [rows, clients, team]
  );
  const validRows = rows ? rows.filter((r, i) => errorsByRow[i].msgs.length === 0) : [];

  // Fix a bad cell right in the preview instead of re-editing the sheet and
  // re-uploading — re-validates live (errorsByRow is derived from `rows`).
  // Keyed by rowNum (stable) rather than array position, since a partial
  // import below removes rows and shifts everyone else's position.
  const updateRow = (rowNum, field, value) => {
    setRows((prev) => prev.map((r) => (r.rowNum === rowNum ? { ...r, [field]: value } : r)));
  };

  const updateFamilyField = (rowNum, famIndex, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.rowNum !== rowNum) return r;
      return { ...r, familyDetails: r.familyDetails.map((f, fi) => (fi === famIndex ? { ...f, [field]: value } : f)) };
    }));
  };

  const toggleExpand = (rowNum) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum); else next.add(rowNum);
      return next;
    });
  };

  // Import whatever's currently valid, then keep the modal open with just the
  // still-broken rows — at ~700 entries, forcing every single row to be
  // perfect before anything can be saved would be a nightmare. Only closes
  // once nothing is left to fix.
  const handleImport = async () => {
    setImporting(true);
    try {
      const toImport = validRows;
      await onImport(toImport);
      setImportedCount((c) => c + toImport.length);
      const remaining = rows.filter((r) => !toImport.includes(r));
      if (remaining.length) setRows(remaining);
      else onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title="Import Client Portfolios"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {importedCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">{importedCount} imported so far — </span>}
            {rows ? `${validRows.length} of ${rows.length} rows valid` : (importedCount > 0 ? 'All done' : 'Upload a .xlsx / .xls file')}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>{importedCount > 0 ? 'Close' : 'Cancel'}</button>
            <button
              onClick={handleImport}
              disabled={!validRows.length || importing}
              className={btnPrimary}
            >
              {importing ? 'Importing…' : `Import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Sample template helper */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
          <div className="flex items-start gap-2.5">
            <Download size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">First time? Download the sample template</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Fill your client data in this exact format (personal, address, holdings, team assignments &amp; family members), then upload it back. The template shows 2 example family members, but you can add more — just copy the "Family 2 …" columns again as "Family 3 …", "Family 4 …" and so on; there's no limit.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className={btnSecondary + ' text-xs whitespace-nowrap shrink-0'}
          >
            <Download size={13} /> Template
          </button>
        </div>

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600 hover:bg-blue-50/10 dark:hover:bg-blue-950/10 rounded-2xl p-8 flex flex-col items-center gap-2.5 transition-all text-slate-500 dark:text-slate-450 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer shadow-inner"
        >
          <FileSpreadsheet size={32} className="text-slate-400 dark:text-slate-600" />
          <span className="font-bold text-sm uppercase tracking-wider">Click to upload spreadsheet</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-sans font-medium">Imports full client data — Name &amp; PAN required, everything else optional — .xlsx / .xls</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

        {error && (
          <div className="flex items-start gap-2.5 p-4.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 text-xs font-medium border border-rose-200/50 dark:border-rose-900/40 animate-fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {rows && (
          <>
            {rows.length !== validRows.length && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Rows highlighted in red have an error — the exact reason is shown under <strong>Status</strong>.
                Click into a highlighted field to fix it directly (click the <strong>Family</strong> count to expand
                and fix family-member fields too) — no need to re-upload. You can <strong>import the valid rows now</strong>
                {' '}and keep fixing the rest; already-imported rows drop off this list.
              </p>
            )}
            <div className="overflow-auto max-h-72 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-md">
              <table className="w-full text-xs min-w-[1160px]">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left w-10">#</th>
                    <th className="px-3 py-3 text-left">Name</th>
                    <th className="px-3 py-3 text-left">PAN</th>
                    <th className="px-3 py-3 text-left">Mobile</th>
                    <th className="px-3 py-3 text-left">Email</th>
                    <th className="px-3 py-3 text-left">Address 1</th>
                    <th className="px-3 py-3 text-left">Address 2</th>
                    <th className="px-3 py-3 text-left">Address 3</th>
                    <th className="px-3 py-3 text-left">Pincode</th>
                    <th className="px-3 py-3 text-left">DOB</th>
                    <th className="px-3 py-3 text-left">Family</th>
                    <th className="px-3 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r, i) => {
                    const { fields: badFields, msgs, familyFields } = errorsByRow[i];
                    const ok = msgs.length === 0;
                    const hasFamily = (r.familyDetails || []).length > 0;
                    const expanded = expandedRows.has(r.rowNum);
                    const detailFieldKeys = ['clientType', 'profession', 'state', 'city', 'relationshipManager', 'portfolioManager', 'insuranceManager', 'serviceManager'];
                    const detailsHaveErrors = detailFieldKeys.some((k) => badFields[k]) || familyFields.some((ff) => Object.keys(ff).length);
                    const cellCls = (field, extra = '') =>
                      `w-full bg-transparent border rounded-md px-1.5 py-1 text-xs focus:outline-none focus:ring-2 ${extra} ${
                        badFields[field]
                          ? 'border-rose-400 text-rose-700 dark:text-rose-400 focus:ring-rose-500/30'
                          : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:ring-blue-500/30 text-slate-800 dark:text-slate-200'
                      }`;
                    const detailCellCls = (field, extra = '') =>
                      `w-full bg-white dark:bg-slate-900 border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 ${extra} ${
                        badFields[field]
                          ? 'border-rose-400 text-rose-700 dark:text-rose-400 focus:ring-rose-500/30'
                          : 'border-slate-200 dark:border-slate-800 focus:ring-blue-500/30 text-slate-800 dark:text-slate-200'
                      }`;
                    return (
                      <React.Fragment key={r.rowNum}>
                        <tr className={`border-t border-slate-100 dark:border-slate-800 ${ok ? 'bg-white dark:bg-slate-900' : 'bg-rose-50/20 dark:bg-rose-950/10'}`}>
                          <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500">{r.rowNum}</td>
                          <td className="px-1 py-1">
                            <input value={r.name} onChange={(e) => updateRow(r.rowNum, 'name', e.target.value)} className={cellCls('name', 'font-bold')} placeholder="empty" />
                          </td>
                          <td className="px-1 py-1">
                            <input
                              value={r.pan}
                              onChange={(e) => updateRow(r.rowNum, 'pan', e.target.value.toUpperCase().slice(0, 10))}
                              className={cellCls('pan', 'font-mono tracking-wider uppercase')}
                              placeholder="empty"
                              maxLength={10}
                            />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.mobile} onChange={(e) => updateRow(r.rowNum, 'mobile', e.target.value)} className={cellCls('mobile', 'tabular-nums')} placeholder="—" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.email} onChange={(e) => updateRow(r.rowNum, 'email', e.target.value)} className={cellCls('email', 'lowercase')} placeholder="—" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.address1} onChange={(e) => updateRow(r.rowNum, 'address1', e.target.value)} className={cellCls('address1')} placeholder="empty" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.address2} onChange={(e) => updateRow(r.rowNum, 'address2', e.target.value)} className={cellCls('address2')} placeholder="empty" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.address3} onChange={(e) => updateRow(r.rowNum, 'address3', e.target.value)} className={cellCls('address3')} placeholder="empty" />
                          </td>
                          <td className="px-1 py-1">
                            <input value={r.pinCode} onChange={(e) => updateRow(r.rowNum, 'pinCode', e.target.value)} className={cellCls('pinCode', 'tabular-nums')} placeholder="—" maxLength={6} />
                          </td>
                          <td className="px-1 py-1">
                            <input type="date" value={r.dob || ''} onChange={(e) => updateRow(r.rowNum, 'dob', e.target.value)} min={DOB_MIN} max={dobMax()} className={cellCls('dob', 'tabular-nums')} />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggleExpand(r.rowNum)}
                              title="Client type, profession, location, team assignments & family members"
                              className={`inline-flex items-center gap-0.5 tabular-nums font-bold cursor-pointer ${
                                detailsHaveErrors ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {r.familyDetails?.length || 0} {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </td>
                          <td className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px] max-w-[200px]">
                            {ok
                              ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} /> Valid</span>
                              : (
                                <span className="inline-flex items-start gap-1 text-rose-600 dark:text-rose-400" title={msgs.join('; ')}>
                                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                  <span className="normal-case font-semibold leading-snug">{msgs.join(', ')}</span>
                                </span>
                              )
                            }
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50/70 dark:bg-slate-950/40">
                            <td />
                            <td colSpan={11} className="px-3 py-2.5 space-y-3">
                              <div>
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Client Type / Profession / Location</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Client Type</label>
                                    <select value={r.clientType} onChange={(e) => updateRow(r.rowNum, 'clientType', e.target.value)} className={detailCellCls('clientType')}>
                                      <option value="">Select…</option>
                                      {CLIENT_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Profession</label>
                                    <select value={r.profession} onChange={(e) => updateRow(r.rowNum, 'profession', e.target.value)} className={detailCellCls('profession')}>
                                      <option value="">Select…</option>
                                      {PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">State</label>
                                    <input value={r.state} onChange={(e) => updateRow(r.rowNum, 'state', e.target.value)} className={detailCellCls('state')} placeholder="empty" />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">City</label>
                                    <input value={r.city} onChange={(e) => updateRow(r.rowNum, 'city', e.target.value)} className={detailCellCls('city')} placeholder="empty" />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Team Assignments</div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                  {Object.entries(MANAGER_LABELS).map(([mf, label]) => (
                                    <div key={mf}>
                                      <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">{label}</label>
                                      <select
                                        value={resolveManagerId(r.managers?.[mf], team)}
                                        onChange={(e) => updateRow(r.rowNum, 'managers', { ...r.managers, [mf]: e.target.value })}
                                        className={detailCellCls(mf)}
                                      >
                                        <option value="">Select…</option>
                                        {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                      </select>
                                      {badFields[mf] && !resolveManagerId(r.managers?.[mf], team) && r.managers?.[mf] && (
                                        <p className="text-[9px] text-rose-600 dark:text-rose-400 mt-0.5">Sheet had "{r.managers[mf]}" — pick the right person</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {hasFamily && (
                              <table className="w-full text-[11px]">
                                <thead className="text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                  <tr>
                                    <th className="text-left font-bold py-1 px-1">Name</th>
                                    <th className="text-left font-bold py-1 px-1">Relation</th>
                                    <th className="text-left font-bold py-1 px-1">PAN</th>
                                    <th className="text-left font-bold py-1 px-1">DOB</th>
                                    <th className="text-left font-bold py-1 px-1">Mobile</th>
                                    <th className="text-left font-bold py-1 px-1">Email</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.familyDetails.map((f, fi) => {
                                    const ff = familyFields[fi] || {};
                                    const famCellCls = (field, extra = '') =>
                                      `w-full bg-white dark:bg-slate-900 border rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 ${extra} ${
                                        ff[field]
                                          ? 'border-rose-400 text-rose-700 dark:text-rose-400 focus:ring-rose-500/30'
                                          : 'border-slate-200 dark:border-slate-800 focus:ring-blue-500/30 text-slate-800 dark:text-slate-200'
                                      }`;
                                    return (
                                      <tr key={fi}>
                                        <td className="px-1 py-1">
                                          <input value={f.name} onChange={(e) => updateFamilyField(r.rowNum, fi, 'name', e.target.value)} className={famCellCls('name', 'font-bold')} />
                                        </td>
                                        <td className="px-1 py-1">
                                          <select value={f.relation || ''} onChange={(e) => updateFamilyField(r.rowNum, fi, 'relation', e.target.value)} className={famCellCls('relation')}>
                                            <option value="">Select…</option>
                                            {RELATIONS.map((rel) => <option key={rel} value={rel}>{rel}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-1 py-1">
                                          <input
                                            value={f.pan}
                                            onChange={(e) => updateFamilyField(r.rowNum, fi, 'pan', e.target.value.toUpperCase().slice(0, 10))}
                                            className={famCellCls('pan', 'font-mono uppercase')}
                                            placeholder="empty"
                                            maxLength={10}
                                          />
                                        </td>
                                        <td className="px-1 py-1">
                                          <input type="date" value={f.dob || ''} onChange={(e) => updateFamilyField(r.rowNum, fi, 'dob', e.target.value)} min={DOB_MIN} max={dobMax()} className={famCellCls('dob', 'tabular-nums')} />
                                        </td>
                                        <td className="px-1 py-1">
                                          <input value={f.mobile || ''} onChange={(e) => updateFamilyField(r.rowNum, fi, 'mobile', e.target.value)} className={famCellCls('mobile', 'tabular-nums')} placeholder="—" />
                                        </td>
                                        <td className="px-1 py-1">
                                          <input value={f.email || ''} onChange={(e) => updateFamilyField(r.rowNum, fi, 'email', e.target.value)} className={famCellCls('email', 'lowercase')} placeholder="—" />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// Manager assignment dropdown — picks a real account from the team directory
// and stores its account id.
function ManagerSelect({ value, onChange }) {
  return (
    <div className="relative">
      <CoolSelect value={value} onChange={(e) => onChange(e.target.value)} className={selectCls + ' pr-9'}>
        <option value="">Unassigned</option>
        {loadTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </CoolSelect>
    </div>
  );
}

function PreviewTile({ label, value, pill }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">{label}</p>
      {pill ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-250/50 dark:ring-emerald-900/50 rounded-full">
          <CheckCircle2 size={11} /> {pill}
        </span>
      ) : (
        <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      )}
    </div>
  );
}
