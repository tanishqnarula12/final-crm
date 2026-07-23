import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, selectCls, CoolSelect } from './UI';
import { Plus, Trash2, Shield, Heart, Briefcase, FileText, Printer, ArrowLeft, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { LOGO_DATA_URI } from '../assets/logoBase64';
import { RELATIONS } from '../utils/team';
import { uid, DOB_MIN, dobMax } from '../utils/calc';
import { addProspects } from '../utils/prospects';
import { saveGeneratedDocument, wrapStandaloneHtml } from '../utils/documents';
import { ProspectModal } from './BusinessProspects';

export default function InsuranceProposal({ client, isViewer }) {
  const getSavedVal = (subKey, defaultVal) => {
    try {
      const clientId = client?.id || 'global';
      const key = `insurance_proposal_draft_${clientId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[subKey] !== undefined) return parsed[subKey];
      }
    } catch (e) {
      console.error(e);
    }
    return defaultVal;
  };

  // Main Proposal Settings
  const [proposer, setProposer] = useState(() => getSavedVal('proposer', client?.name || ''));
  const [types, setTypes] = useState(() => getSavedVal('types', {
    medical: true,
    term: false,
    accidental: false,
  }));

  // Applicants List
  const [applicants, setApplicants] = useState(() => {
    const saved = getSavedVal('applicants', null);
    if (saved && saved.length > 0) return saved;
    if (client) {
      const list = [];
      // 1. Proposer (Self)
      list.push({
        name: client.name,
        relation: 'Self',
        dob: client.clientDetails?.dob || '',
        smoking: 'No',
        tobacco: 'No',
        alcohol: 'No',
        ped: 'No',
        pedSpecify: ''
      });

      // 2. Family Members
      const family = client.clientDetails?.familyDetails || [];
      family.forEach(f => {
        list.push({
          name: f.name,
          relation: f.relation || '',
          dob: f.dob || '',
          smoking: 'No',
          tobacco: 'No',
          alcohol: 'No',
          ped: 'No',
          pedSpecify: ''
        });
      });
      return list;
    }
    return [];
  });

  // Resolve applicant options (Group leader client + family members)
  const applicantOptions = useMemo(() => {
    if (!client) return [];
    const opts = [{ name: client.name, relation: 'Self', dob: client.clientDetails?.dob || '', smoking: 'No', tobacco: 'No', alcohol: 'No', ped: 'No' }];
    (client.clientDetails?.familyDetails || []).forEach(f => {
      if (f.name) opts.push({ name: f.name, relation: f.relation || 'Member', dob: f.dob || '', smoking: f.smoking || 'No', tobacco: f.tobacco || 'No', alcohol: f.alcohol || 'No', ped: f.ped || 'No' });
    });
    return opts;
  }, [client]);

  // Medical State
  const [isPort, setIsPort] = useState(() => getSavedVal('isPort', false));
  const [portDate, setPortDate] = useState(() => getSavedVal('portDate', ''));
  const [basePolicies, setBasePolicies] = useState(() => getSavedVal('basePolicies', [
    { name: '', sum: '', premium: '', riders: '' }
  ]));
  const [topupPolicies, setTopupPolicies] = useState(() => getSavedVal('topupPolicies', [
    { company: '', name: '', deductible: '', sum: '', premium: '' }
  ]));

  // Term State
  const [termGroups, setTermGroups] = useState(() => getSavedVal('termGroups', [
    {
      insuredName: client?.name || '',
      policies: [{ name: '', sum: '', cover: '', premium: '' }]
    }
  ]));

  // Accidental State
  const [accidentalPolicies, setAccidentalPolicies] = useState(() => getSavedVal('accidentalPolicies', [
    { name: '', sum: '', premium: '', riders: '' }
  ]));

  // Preview Mode
  const [isPreview, setIsPreview] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // '', 'syncing', 'done', 'error'

  // Business Prospect creation
  const [showProspectModal, setShowProspectModal] = useState(false);
  const [prospectDrafts, setProspectDrafts] = useState([]);
  const [prospectBase, setProspectBase] = useState({});
  const [prospectToast, setProspectToast] = useState('');

  const lastLoadedClientId = useRef(client?.id || 'global');

  // Prepopulate or load draft when client changes
  useEffect(() => {
    const clientId = client?.id || 'global';
    lastLoadedClientId.current = clientId;

    const key = `insurance_proposal_draft_${clientId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.proposer !== undefined) setProposer(parsed.proposer);
        if (parsed.types !== undefined) setTypes(parsed.types);
        if (parsed.applicants !== undefined) {
          if (parsed.applicants.length > 0) {
            setApplicants(parsed.applicants);
          } else if (client) {
            const list = [];
            // 1. Proposer (Self)
            list.push({
              name: client.name,
              relation: 'Self',
              dob: client.clientDetails?.dob || '',
              smoking: 'No',
              tobacco: 'No',
              alcohol: 'No',
              ped: 'No',
              pedSpecify: ''
            });

            // 2. Family Members
            const family = client.clientDetails?.familyDetails || [];
            family.forEach(f => {
              list.push({
                name: f.name,
                relation: f.relation || '',
                dob: f.dob || '',
                smoking: 'No',
                tobacco: 'No',
                alcohol: 'No',
                ped: 'No',
                pedSpecify: ''
              });
            });
            setApplicants(list);
          } else {
            setApplicants([]);
          }
        }
        if (parsed.isPort !== undefined) setIsPort(parsed.isPort);
        if (parsed.portDate !== undefined) setPortDate(parsed.portDate);
        if (parsed.basePolicies !== undefined) setBasePolicies(parsed.basePolicies);
        if (parsed.topupPolicies !== undefined) setTopupPolicies(parsed.topupPolicies);
        if (parsed.termGroups !== undefined) setTermGroups(parsed.termGroups);
        if (parsed.accidentalPolicies !== undefined) setAccidentalPolicies(parsed.accidentalPolicies);
        return; // loaded draft successfully, skip defaults
      } catch (e) {
        console.error('Error loading insurance proposal draft:', e);
      }
    }

    // Default initialization if no draft exists
    if (client) {
      setProposer(client.name);
      
      const list = [];
      // 1. Proposer (Self)
      list.push({
        name: client.name,
        relation: 'Self',
        dob: client.clientDetails?.dob || '',
        smoking: 'No',
        tobacco: 'No',
        alcohol: 'No',
        ped: 'No',
        pedSpecify: ''
      });

      // 2. Family Members
      const family = client.clientDetails?.familyDetails || [];
      family.forEach(f => {
        list.push({
          name: f.name,
          relation: f.relation || '',
          dob: f.dob || '',
          smoking: 'No',
          tobacco: 'No',
          alcohol: 'No',
          ped: 'No',
          pedSpecify: ''
        });
      });

      setApplicants(list);

      // Set Term Group first member to client name
      setTermGroups([
        {
          insuredName: client.name,
          policies: [{ name: '', sum: '', cover: '', premium: '' }]
        }
      ]);
    } else {
      setProposer('');
      setApplicants([]);
      setTermGroups([
        {
          insuredName: '',
          policies: [{ name: '', sum: '', cover: '', premium: '' }]
        }
      ]);
    }

    // Reset other fields to defaults when client changes and no draft exists
    setTypes({
      medical: true,
      term: false,
      accidental: false,
    });
    setIsPort(false);
    setPortDate('');
    setBasePolicies([
      { name: '', sum: '', premium: '', riders: '' }
    ]);
    setTopupPolicies([
      { company: '', name: '', deductible: '', sum: '', premium: '' }
    ]);
    setAccidentalPolicies([
      { name: '', sum: '', premium: '', riders: '' }
    ]);
  }, [client]);

  // Save draft on updates
  useEffect(() => {
    const clientId = client?.id || 'global';
    if (clientId !== lastLoadedClientId.current) {
      return;
    }
    const key = `insurance_proposal_draft_${clientId}`;
    const draft = {
      proposer,
      types,
      applicants,
      isPort,
      portDate,
      basePolicies,
      topupPolicies,
      termGroups,
      accidentalPolicies
    };
    localStorage.setItem(key, JSON.stringify(draft));
  }, [client, proposer, types, applicants, isPort, portDate, basePolicies, topupPolicies, termGroups, accidentalPolicies]);

  // Checkbox Toggle Helpers
  const handleTypeChange = (key) => {
    setTypes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Add/Remove Applicant
  const addApplicant = () => {
    setApplicants(prev => [
      ...prev,
      { name: '', relation: '', dob: '', smoking: 'No', tobacco: 'No', alcohol: 'No', ped: 'No', pedSpecify: '' }
    ]);
  };

  const removeApplicant = (index) => {
    setApplicants(prev => prev.filter((_, i) => i !== index));
  };

  const updateApplicant = (index, key, value) => {
    setApplicants(prev => prev.map((c, i) => i === index ? { ...c, [key]: value } : c));
  };

  const updateApplicantName = (index, name) => {
    const opt = applicantOptions.find(o => o.name === name);
    setApplicants(prev => prev.map((c, i) => {
      if (i === index) {
        return {
          ...c,
          name,
          relation: opt ? opt.relation : c.relation,
          dob: opt ? opt.dob : c.dob,
          smoking: opt ? opt.smoking : c.smoking,
          tobacco: opt ? opt.tobacco : c.tobacco,
          alcohol: opt ? opt.alcohol : c.alcohol,
          ped: opt ? opt.ped : c.ped,
        };
      }
      return c;
    }));
  };

  // Add/Remove Medical Policies
  const addBasePolicy = () => {
    setBasePolicies(prev => [...prev, { name: '', sum: '', premium: '', riders: '' }]);
  };

  const removeBasePolicy = (index) => {
    setBasePolicies(prev => prev.filter((_, i) => i !== index));
  };

  const updateBasePolicy = (index, key, value) => {
    const v = AMOUNT_KEYS.includes(key) ? fmtAmt(value) : value;
    setBasePolicies(prev => prev.map((p, i) => i === index ? { ...p, [key]: v } : p));
  };

  const addTopupPolicy = () => {
    setTopupPolicies(prev => [...prev, { company: '', name: '', deductible: '', sum: '', premium: '' }]);
  };

  const removeTopupPolicy = (index) => {
    setTopupPolicies(prev => prev.filter((_, i) => i !== index));
  };

  const updateTopupPolicy = (index, key, value) => {
    const v = AMOUNT_KEYS.includes(key) ? fmtAmt(value) : value;
    setTopupPolicies(prev => prev.map((p, i) => i === index ? { ...p, [key]: v } : p));
  };

  // Add/Remove Term Groups & Policies
  const addTermGroup = () => {
    setTermGroups(prev => [
      ...prev,
      { insuredName: '', policies: [{ name: '', sum: '', cover: '', premium: '' }] }
    ]);
  };

  const removeTermGroup = (index) => {
    setTermGroups(prev => prev.filter((_, i) => i !== index));
  };

  const updateTermGroupInsured = (index, name) => {
    setTermGroups(prev => prev.map((g, i) => i === index ? { ...g, insuredName: name } : g));
  };

  const addTermPolicy = (groupIndex) => {
    setTermGroups(prev => prev.map((g, idx) => {
      if (idx === groupIndex) {
        return { ...g, policies: [...g.policies, { name: '', sum: '', cover: '', premium: '' }] };
      }
      return g;
    }));
  };

  const removeTermPolicy = (groupIndex, policyIndex) => {
    setTermGroups(prev => prev.map((g, idx) => {
      if (idx === groupIndex) {
        return { ...g, policies: g.policies.filter((_, pi) => pi !== policyIndex) };
      }
      return g;
    }));
  };

  const updateTermPolicy = (groupIndex, policyIndex, key, value) => {
    const v = AMOUNT_KEYS.includes(key) ? fmtAmt(value) : value;
    setTermGroups(prev => prev.map((g, idx) => {
      if (idx === groupIndex) {
        const updatedPolicies = g.policies.map((p, pi) => pi === policyIndex ? { ...p, [key]: v } : p);
        return { ...g, policies: updatedPolicies };
      }
      return g;
    }));
  };

  // Add/Remove Accidental Policies
  const addAccidentalPolicy = () => {
    setAccidentalPolicies(prev => [...prev, { name: '', sum: '', premium: '', riders: '' }]);
  };

  const removeAccidentalPolicy = (index) => {
    setAccidentalPolicies(prev => prev.filter((_, i) => i !== index));
  };

  const updateAccidentalPolicy = (index, key, value) => {
    const v = AMOUNT_KEYS.includes(key) ? fmtAmt(value) : value;
    setAccidentalPolicies(prev => prev.map((p, i) => i === index ? { ...p, [key]: v } : p));
  };

  // Format Helper
  const fmt = (v) => v || '—';
  
  const parseNum = (v) => {
    const n = parseFloat((String(v) || '0').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const fmtINR = (val) => {
    if (!val) return '—';
    const num = parseNum(val);
    return num.toLocaleString('en-IN');
  };

  // Live comma formatting for amount inputs (e.g. 50000 -> 50,000)
  const fmtAmt = (v) => {
    const digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return digits ? Number(digits).toLocaleString('en-IN') : '';
  };
  const AMOUNT_KEYS = ['sum', 'premium'];

  // Google Sheets Sync
  const syncToGoogleSheets = async () => {
    const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzczXKpFT-dfem3k_K9owUSEjbiMlVcrvqcuVzbdfu3g3VRdnw9XTvJhkjliHsscXo/exec";
    
    // Compute total values
    let totalMedical = 0;
    if (types.medical) {
      basePolicies.forEach(p => totalMedical += parseNum(p.premium));
      topupPolicies.forEach(p => totalMedical += parseNum(p.premium));
    }

    let totalTerm = 0;
    if (types.term) {
      termGroups.forEach(g => {
        g.policies.forEach(p => totalTerm += parseNum(p.premium));
      });
    }

    let totalAccidental = 0;
    if (types.accidental) {
      accidentalPolicies.forEach(p => totalAccidental += parseNum(p.premium));
    }

    const payload = {
      proposerName: proposer,
      clientsCount: applicants.length,
      types: [types.medical && 'Medical', types.term && 'Term', types.accidental && 'Accidental'].filter(Boolean).join(' + '),
      totalMedical,
      totalTerm,
      totalAccidental,
      totalPremium: totalMedical + totalTerm + totalAccidental,
      date: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
      isPort: types.medical ? (isPort ? 'Yes' : 'No') : 'N/A',
      portDate: types.medical && isPort && portDate ? new Date(portDate).toLocaleDateString('en-IN') : ''
    };

    setSyncStatus('syncing');
    try {
      // Use no-cors mode to bypass CORS issues with Google Script redirection
      await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSyncStatus('done');
    } catch (err) {
      console.error('Google Sheets Sync Failed:', err);
      setSyncStatus('error');
    }
  };

  const handleReset = () => {
    if (!window.confirm('Are you sure you want to reset the form? This will clear all entered details.')) {
      return;
    }

    const clientId = client?.id || 'global';
    const key = `insurance_proposal_draft_${clientId}`;
    localStorage.removeItem(key);

    // Reset to defaults
    if (client) {
      setProposer(client.name);
      
      const list = [];
      list.push({
        name: client.name,
        relation: 'Self',
        dob: '',
        smoking: 'No',
        tobacco: 'No',
        alcohol: 'No',
        ped: 'No',
        pedSpecify: ''
      });

      const family = client.clientDetails?.familyDetails || [];
      family.forEach(f => {
        list.push({
          name: f.name,
          relation: f.relation || '',
          dob: '',
          smoking: 'No',
          tobacco: 'No',
          alcohol: 'No',
          ped: 'No',
          pedSpecify: ''
        });
      });

      setApplicants(list);

      setTermGroups([
        {
          insuredName: client.name,
          policies: [{ name: '', sum: '', cover: '', premium: '' }]
        }
      ]);
    } else {
      setProposer('');
      setApplicants([]);
      setTermGroups([
        {
          insuredName: '',
          policies: [{ name: '', sum: '', cover: '', premium: '' }]
        }
      ]);
    }

    setTypes({
      medical: true,
      term: false,
      accidental: false,
    });
    setIsPort(false);
    setPortDate('');
    setBasePolicies([
      { name: '', sum: '', premium: '', riders: '' }
    ]);
    setTopupPolicies([
      { company: '', name: '', deductible: '', sum: '', premium: '' }
    ]);
    setAccidentalPolicies([
      { name: '', sum: '', premium: '', riders: '' }
    ]);
  };

  const handleGenerate = () => {
    if (!types.medical && !types.term && !types.accidental) {
      alert('Please select at least one proposal type.');
      return;
    }
    setIsPreview(true);
    syncToGoogleSheets();
  };

  const getProposalTypesLabel = () => {
    return [types.medical && 'Medical', types.term && 'Term', types.accidental && 'Accidental']
      .filter(Boolean)
      .join(' + ');
  };

  // ---- Business Prospect creation ----------------------------------------
  const sumPremium = (list) => (list || []).reduce((s, p) => s + parseNum(p.premium), 0);

  const openCreateProspect = () => {
    const drafts = [];

    if (types.medical) {
      const meds = [...basePolicies, ...topupPolicies].filter(p => p.name || p.company || p.sum || p.premium);
      drafts.push({
        proposalType: 'Medical Insurance',
        proposalCategory: 'insurance',
        amount: sumPremium(basePolicies) + sumPremium(topupPolicies),
        table: {
          cols: ['Policy / Company', 'Sum Assured', 'Premium (p.a.)'],
          rows: meds.map(p => [p.name || p.company || '—', p.sum ? '₹ ' + p.sum : '—', p.premium ? '₹ ' + p.premium : '—']),
        },
      });
    }
    if (types.term) {
      const rows = [];
      (termGroups || []).forEach(g => (g.policies || []).forEach(p => {
        if (p.name || p.sum || p.premium) rows.push([g.insuredName || proposer, p.name || '—', p.sum ? '₹ ' + p.sum : '—', p.premium ? '₹ ' + p.premium : '—']);
      }));
      let totalTerm = 0;
      (termGroups || []).forEach(g => { totalTerm += sumPremium(g.policies); });
      drafts.push({
        proposalType: 'Term Insurance',
        proposalCategory: 'insurance',
        amount: totalTerm,
        table: { cols: ['Insured', 'Policy', 'Sum Assured', 'Premium (p.a.)'], rows },
      });
    }
    if (types.accidental) {
      const accs = (accidentalPolicies || []).filter(p => p.name || p.sum || p.premium);
      drafts.push({
        proposalType: 'Accidental Insurance',
        proposalCategory: 'insurance',
        amount: sumPremium(accidentalPolicies),
        table: {
          cols: ['Policy', 'Sum Assured', 'Premium (p.a.)'],
          rows: accs.map(p => [p.name || '—', p.sum ? '₹ ' + p.sum : '—', p.premium ? '₹ ' + p.premium : '—']),
        },
      });
    }

    // Block empty proposals up front — a prospect can't be created without a
    // premium amount entered for every selected insurance type.
    const zeroAmountDraft = drafts.find(it => !(Number(it.amount) > 0));
    if (zeroAmountDraft) {
      alert(`Please enter a premium amount for "${zeroAmountDraft.proposalType}" before creating a prospect.`);
      return;
    }

    const d = client?.clientDetails || {};

    // Best-effort mapping from the client's stored profession to the KYC
    // section's Occupation options.
    const mapOccupation = (prof) => {
      const p = (prof || '').toLowerCase();
      if (p.includes('salaried')) return 'Salaried';
      if (p.includes('self-employed') || p.includes('business') || p.includes('professional')) return 'Self Employed';
      if (p.includes('homemaker')) return 'House Wife';
      return '';
    };

    // Auto-fetch the proposer's habits/PED straight from the Family / Applicants
    // grid above, so the advisor doesn't have to re-enter them in the Prospect's
    // KYC section.
    const proposerName = proposer || client?.name || '';
    const selfMember = applicants.find(a => a.name === proposerName) ||
      applicants.find(a => a.relation === 'Self') || applicants[0] || null;

    const kyc = {
      email: d.email || '',
      mobile: d.mobile || '',
      occupation: mapOccupation(d.profession),
      officeAddress1: d.address1 || '',
      officeAddress2: d.address2 || '',
      officeAddress3: d.address3 || '',
      officeCity: d.city || '',
      officePincode: d.pinCode || '',
      officeState: d.state || '',
      officeCountry: 'India',
    };
    if (selfMember) {
      kyc.smoking = selfMember.smoking || 'No';
      kyc.tobacco = selfMember.tobacco || 'No';
      kyc.alcohol = selfMember.alcohol || 'No';
      kyc.medicalHistory = selfMember.ped || 'No';
      if (selfMember.ped === 'Yes' && selfMember.pedSpecify) {
        kyc.diseases = selfMember.pedSpecify.split(',').map(name => name.trim()).filter(Boolean).map(name => ({ id: uid(), name }));
      }
    }

    setProspectBase({
      groupLeaderId: client?.id || '',
      groupLeader: client?.name || proposer,
      applicant: proposerName,
      pan: client?.pan || '',
      serviceManager: d.serviceManager || '',
      relationshipManager: d.relationshipManager || '',
      portfolioManager: d.portfolioManager || '',
      insuranceManager: d.insuranceManager || '',
      owner: d.owner || '',
      internalManager: d.internalManager || '',
      kyc,
    });
    setProspectDrafts(drafts);
    setShowProspectModal(true);
  };

  // Browser "Print / Save PDF" defaults its filename to document.title — set
  // it to "<Insurance Type(s)> Insurance Proposal of <Client>" right before
  // printing (comma-joined when more than one type is filled in), then
  // restore the app's normal title once the print dialog closes.
  const handlePrint = () => {
    const typeLabels = [
      types.medical && 'Medical',
      types.term && 'Term',
      types.accidental && 'Accidental',
    ].filter(Boolean);
    const who = proposer || client?.name || 'Client';
    const prevTitle = document.title;
    document.title = `${typeLabels.length ? typeLabels.join(', ') + ' ' : ''}Insurance Proposal of ${who}`;
    window.print();
    document.title = prevTitle;
  };

  const handleProspectConfirm = (list) => {
    addProspects(list);
    window.dispatchEvent(new Event('crm:prospects-updated'));
    setShowProspectModal(false);
    setProspectToast(`✅ ${list.length} prospect${list.length > 1 ? 's' : ''} created — see the Prospect module.`);
    setTimeout(() => setProspectToast(''), 4000);
  };

  const previewDocRef = useRef(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const handleSaveDocument = async () => {
    if (!client?.id) {
      setProspectToast('⚠️ This proposal is not linked to a saved client, so it cannot be saved.');
      setTimeout(() => setProspectToast(''), 4000);
      return;
    }
    if (!previewDocRef.current) return;
    setSavingDoc(true);
    try {
      const html = wrapStandaloneHtml(
        previewDocRef.current.outerHTML,
        `Insurance Proposal — ${client.name}`,
        INSURANCE_PRINT_STYLES
      );
      const name = await saveGeneratedDocument(client, {
        kind: 'insurance',
        label: 'Insurance Proposal',
        html,
      });
      setProspectToast(`✅ Saved to Documents as ${name}`);
    } catch (err) {
      setProspectToast(`⚠️ ${err.message || 'Could not save document.'}`);
    } finally {
      setSavingDoc(false);
      setTimeout(() => setProspectToast(''), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scope Style for Printing */}
      <style dangerouslySetInnerHTML={{ __html: INSURANCE_PRINT_STYLES }} />

      {!isPreview ? (
        // FORM SECTION
        <div className="space-y-6 animate-fade-in no-print">
          {/* Card 1: Setup Options */}
          <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100/40 dark:border-blue-900/30">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Insurance Proposal Setup</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Configure proposer details and select insurance categories</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className={btnGhost + ' text-rose-600 dark:text-rose-450 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5'}
              >
                ✕ Reset Form
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Proposer Name</label>
                {applicantOptions.length > 0 ? (
                  <CoolSelect
                    showValueOnSelect={true}
                    value={proposer}
                    onChange={(e) => setProposer(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select proposer…</option>
                    {applicantOptions.map(o => (
                      <option key={o.name} value={o.name}>{o.name} ({o.relation})</option>
                    ))}
                  </CoolSelect>
                ) : (
                  <input
                    type="text"
                    value={proposer}
                    onChange={(e) => setProposer(e.target.value)}
                    placeholder="e.g. full name"
                    className={inputCls}
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Proposal Type</label>
                <div className="flex flex-wrap gap-3 mt-1">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={types.medical}
                      onChange={() => handleTypeChange('medical')}
                      className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-750"
                    />
                    Medical
                  </label>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={types.term}
                      onChange={() => handleTypeChange('term')}
                      className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-750"
                    />
                    Term Life
                  </label>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={types.accidental}
                      onChange={() => handleTypeChange('accidental')}
                      className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-750"
                    />
                    Accidental
                  </label>
                </div>
              </div>
            </div>
          </Card>

          {/* Card 2: Applicants Grid */}
          <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50/50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100/40 dark:border-purple-900/30">
                  <Heart size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Family / Applicants Details</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Details of members included in the proposal</p>
                </div>
              </div>
              <button onClick={addApplicant} className={btnSecondary + ' py-2 px-3.5 text-xs'}>
                <Plus size={14} /> Add Member
              </button>
            </div>

            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
              {applicants.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 italic">No members configured. Add a member to begin.</div>
              ) : (
                applicants.map((member, index) => (
                  <div key={index} className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-950/30 border border-slate-200/50 dark:border-slate-805 relative space-y-4">
                    <button
                      onClick={() => removeApplicant(index)}
                      className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors"
                      title="Remove Member"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="text-[11px] font-bold text-blue-600 dark:text-blue-450 uppercase tracking-widest leading-none">Member #{index + 1}</div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
                      <div className="col-span-1 md:col-span-2 lg:col-span-2">
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Name</label>
                        {applicantOptions.length > 0 ? (
                          <CoolSelect
                            value={member.name}
                            onChange={(e) => updateApplicantName(index, e.target.value)}
                            className={selectCls + ' text-xs py-2 px-3'}
                          >
                            <option value="">Select applicant…</option>
                            {applicantOptions.map(o => (
                              <option key={o.name} value={o.name}>{o.name}</option>
                            ))}
                          </CoolSelect>
                        ) : (
                          <input
                            type="text"
                            value={member.name}
                            onChange={(e) => updateApplicant(index, 'name', e.target.value)}
                            className={inputCls + ' text-xs py-2 px-3'}
                            placeholder="Applicant Name"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Relation</label>
                        <select
                          value={member.relation}
                          onChange={(e) => updateApplicant(index, 'relation', e.target.value)}
                          className={selectCls + ' text-xs py-2 px-3'}
                        >
                          <option value="">Select…</option>
                          {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={member.dob}
                          onChange={(e) => updateApplicant(index, 'dob', e.target.value)}
                          min={DOB_MIN} max={dobMax()}
                          className={inputCls + ' text-xs py-2 px-3'}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Smoking</label>
                        <select
                          value={member.smoking}
                          onChange={(e) => updateApplicant(index, 'smoking', e.target.value)}
                          className={selectCls + ' text-xs py-2 px-3'}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Tobacco</label>
                        <select
                          value={member.tobacco}
                          onChange={(e) => updateApplicant(index, 'tobacco', e.target.value)}
                          className={selectCls + ' text-xs py-2 px-3'}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Alcohol</label>
                        <select
                          value={member.alcohol}
                          onChange={(e) => updateApplicant(index, 'alcohol', e.target.value)}
                          className={selectCls + ' text-xs py-2 px-3'}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">PED?</label>
                        <select
                          value={member.ped}
                          onChange={(e) => updateApplicant(index, 'ped', e.target.value)}
                          className={selectCls + ' text-xs py-2 px-3'}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </div>
                    </div>

                    {member.ped === 'Yes' && (
                      <div className="grid grid-cols-1 gap-1">
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Specify Pre-Existing Diseases</label>
                        <input
                          type="text"
                          value={member.pedSpecify}
                          onChange={(e) => updateApplicant(index, 'pedSpecify', e.target.value)}
                          placeholder="e.g. Hypertension (diagnosed 2021)"
                          className={inputCls + ' text-xs py-2 px-3'}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Card 3: Medical Insurance Section */}
          {types.medical && (
            <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <div className="w-10 h-10 rounded-xl bg-teal-50/50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-100/40 dark:border-teal-900/30">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">🏥 Medical Insurance Proposal</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Set up base cover, top-up cover, and porting status</p>
                </div>
              </div>

              {/* Porting Options */}
              <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200/40 dark:border-slate-805">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPort}
                    onChange={(e) => setIsPort(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-750"
                  />
                  Porting Existing Policy?
                </label>
                {isPort && (
                  <div>
                    <label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-2">Expected Port Date</label>
                    <input
                      type="date"
                      value={portDate}
                      onChange={(e) => setPortDate(e.target.value)}
                      className={inputCls + ' text-xs py-1.5 px-2.5 max-w-[160px] inline-block'}
                    />
                  </div>
                )}
              </div>

              {/* Base Policies Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Base Policies</h4>
                  <button onClick={addBasePolicy} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
                    <Plus size={12} /> Add Base
                  </button>
                </div>
                <div className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80 text-left">
                      <tr>
                        <th className="px-4 py-2.5 w-12 text-center">#</th>
                        <th className="px-4 py-2.5">Company & Policy Name</th>
                        <th className="px-4 py-2.5 w-44">Sum Assured (Rs)</th>
                        <th className="px-4 py-2.5 w-44">Premium p.a. (Rs)</th>
                        <th className="px-4 py-2.5">Riders / Notes</th>
                        <th className="px-4 py-2.5 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                      {basePolicies.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/20">
                          <td className="px-4 py-2 text-center font-bold text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => updateBasePolicy(i, 'name', e.target.value)}
                              placeholder="e.g. Niva Bupa ReAssure 2.0"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.sum}
                              onChange={(e) => updateBasePolicy(i, 'sum', e.target.value)}
                              placeholder="e.g. 10,00,000"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs text-right tabular-nums font-semibold'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.premium}
                              onChange={(e) => updateBasePolicy(i, 'premium', e.target.value)}
                              placeholder="e.g. 15,400"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs text-right tabular-nums font-semibold'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.riders}
                              onChange={(e) => updateBasePolicy(i, 'riders', e.target.value)}
                              placeholder="e.g. Safeguard+ Rider included"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs'}
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeBasePolicy(i)}
                              disabled={basePolicies.length === 1}
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors p-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top-Up Policies Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">Top-Up Policies</h4>
                  <button onClick={addTopupPolicy} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
                    <Plus size={12} /> Add Top-Up
                  </button>
                </div>
                <div className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80 text-left">
                      <tr>
                        <th className="px-4 py-2.5 w-12 text-center">#</th>
                        <th className="px-4 py-2.5">Company</th>
                        <th className="px-4 py-2.5">Policy Name</th>
                        <th className="px-4 py-2.5 w-36">Deductible (Rs)</th>
                        <th className="px-4 py-2.5 w-36">Sum Assured (Rs)</th>
                        <th className="px-4 py-2.5 w-36">Premium p.a. (Rs)</th>
                        <th className="px-4 py-2.5 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                      {topupPolicies.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/20">
                          <td className="px-4 py-2 text-center font-bold text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.company}
                              onChange={(e) => updateTopupPolicy(i, 'company', e.target.value)}
                              placeholder="e.g. Care Health"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => updateTopupPolicy(i, 'name', e.target.value)}
                              placeholder="e.g. Enhance Super Top-up"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.deductible}
                              onChange={(e) => updateTopupPolicy(i, 'deductible', e.target.value)}
                              placeholder="e.g. 5,00,000"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs text-right tabular-nums font-semibold'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.sum}
                              onChange={(e) => updateTopupPolicy(i, 'sum', e.target.value)}
                              placeholder="e.g. 45,00,000"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs text-right tabular-nums font-semibold'}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={p.premium}
                              onChange={(e) => updateTopupPolicy(i, 'premium', e.target.value)}
                              placeholder="e.g. 4,100"
                              className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-teal-500 text-xs text-right tabular-nums font-semibold'}
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeTopupPolicy(i)}
                              disabled={topupPolicies.length === 1}
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors p-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* Card 4: Term Life Insurance Section */}
          {types.term && (
            <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100/40 dark:border-indigo-900/30">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">🛡️ Term Life Insurance</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Organize policies under insured members</p>
                  </div>
                </div>
                <button onClick={addTermGroup} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
                  <Plus size={12} /> Add Insured
                </button>
              </div>

              {/* Insured Groups */}
              <div className="space-y-6 max-h-[500px] overflow-y-auto pr-1">
                {termGroups.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 italic">No insured members defined. Click "Add Insured" to start.</div>
                ) : (
                  termGroups.map((group, gi) => (
                    <div key={gi} className="p-5 rounded-2xl bg-indigo-50/20 dark:bg-slate-950/20 border border-indigo-100/50 dark:border-slate-805 space-y-4 relative">
                      <button
                        onClick={() => removeTermGroup(gi)}
                        className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors"
                        title="Remove Insured"
                      >
                        <Trash2 size={13} />
                      </button>

                      {/* Header Inputs */}
                      <div className="max-w-xs">
                        <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Insured Name</label>
                        <select
                          value={group.insuredName}
                          onChange={(e) => updateTermGroupInsured(gi, e.target.value)}
                          className={selectCls + ' text-xs py-1.5 px-2 bg-white dark:bg-slate-950'}
                        >
                          <option value="">Select or type member...</option>
                          {applicants.map((a, ai) => (
                            <option key={ai} value={a.name}>{a.name} ({a.relation})</option>
                          ))}
                        </select>
                      </div>

                      {/* Policies Table */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider pl-1.5 border-l-2 border-indigo-500 leading-none">Policies for {group.insuredName || 'Member'}</span>
                          <button onClick={() => addTermPolicy(gi)} className="text-xs font-bold text-indigo-600 dark:text-indigo-450 hover:underline flex items-center gap-1">
                            <Plus size={12} /> Add Policy
                          </button>
                        </div>

                        <div className="overflow-hidden border border-slate-200/50 dark:border-slate-805 rounded-xl bg-white dark:bg-slate-900">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-805 text-left">
                              <tr>
                                <th className="px-4 py-2 w-12 text-center">#</th>
                                <th className="px-4 py-2">Company & Policy Name</th>
                                <th className="px-4 py-2 w-44">Sum Assured (Rs)</th>
                                <th className="px-4 py-2 w-32">Cover Till Age</th>
                                <th className="px-4 py-2 w-44">Premium p.a. (Rs)</th>
                                <th className="px-4 py-2 w-12 text-center"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/30 dark:divide-slate-800/40">
                              {group.policies.map((pol, pi) => (
                                <tr key={pi} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                                  <td className="px-4 py-1.5 text-center font-bold text-slate-400">{pi + 1}</td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="text"
                                      value={pol.name}
                                      onChange={(e) => updateTermPolicy(gi, pi, 'name', e.target.value)}
                                      placeholder="e.g. HDFC Click2Protect Super"
                                      className={inputCls + ' py-1 px-1.5 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-xs'}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="text"
                                      value={pol.sum}
                                      onChange={(e) => updateTermPolicy(gi, pi, 'sum', e.target.value)}
                                      placeholder="e.g. 1,00,00,000"
                                      className={inputCls + ' py-1 px-1.5 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-xs text-right tabular-nums font-semibold'}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="text"
                                      value={pol.cover}
                                      onChange={(e) => updateTermPolicy(gi, pi, 'cover', e.target.value)}
                                      placeholder="e.g. 60"
                                      className={inputCls + ' py-1 px-1.5 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-xs text-center tabular-nums font-semibold'}
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="text"
                                      value={pol.premium}
                                      onChange={(e) => updateTermPolicy(gi, pi, 'premium', e.target.value)}
                                      placeholder="e.g. 24,000"
                                      className={inputCls + ' py-1 px-1.5 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 text-xs text-right tabular-nums font-semibold'}
                                    />
                                  </td>
                                  <td className="px-4 py-1.5 text-center">
                                    <button
                                      onClick={() => removeTermPolicy(gi, pi)}
                                      disabled={group.policies.length === 1}
                                      className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors p-1"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* Card 5: Accidental Insurance Section */}
          {types.accidental && (
            <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50/50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-100/40 dark:border-cyan-900/30">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">☂️ Accidental Insurance</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Set up personal accident covers</p>
                  </div>
                </div>
                <button onClick={addAccidentalPolicy} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
                  <Plus size={12} /> Add Accidental
                </button>
              </div>

              {/* Accidental Policies Table */}
              <div className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50/70 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80 text-left">
                    <tr>
                      <th className="px-4 py-2.5 w-12 text-center">#</th>
                      <th className="px-4 py-2.5">Company & Policy Name</th>
                      <th className="px-4 py-2.5 w-44">Sum Assured (Rs)</th>
                      <th className="px-4 py-2.5 w-44">Premium p.a. (Rs)</th>
                      <th className="px-4 py-2.5">Riders / Notes</th>
                      <th className="px-4 py-2.5 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                    {accidentalPolicies.map((p, i) => (
                      <tr key={i} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/20">
                        <td className="px-4 py-2 text-center font-bold text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => updateAccidentalPolicy(i, 'name', e.target.value)}
                            placeholder="e.g. HDFC Ergo Personal Accidental"
                            className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-cyan-500 text-xs'}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={p.sum}
                            onChange={(e) => updateAccidentalPolicy(i, 'sum', e.target.value)}
                            placeholder="e.g. 50,00,000"
                            className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-cyan-500 text-xs text-right tabular-nums font-semibold'}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={p.premium}
                            onChange={(e) => updateAccidentalPolicy(i, 'premium', e.target.value)}
                            placeholder="e.g. 6,200"
                            className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-cyan-500 text-xs text-right tabular-nums font-semibold'}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={p.riders}
                            onChange={(e) => updateAccidentalPolicy(i, 'riders', e.target.value)}
                            placeholder="e.g. Broken bones rider included"
                            className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-cyan-500 text-xs'}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => removeAccidentalPolicy(i)}
                            disabled={accidentalPolicies.length === 1}
                            className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Card 6: Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={handleGenerate} className={btnPrimary}>
              <Plus size={14} /> Generate Proposal
            </button>
          </div>
        </div>
      ) : (
        // PREVIEW / PRINT SECTION
        <div className="space-y-6 animate-scale-up">
          {/* Action Header Card (Hidden on print) */}
          <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-between gap-4 no-print shadow-sm">
            <button onClick={() => setIsPreview(false)} className={btnGhost + ' text-slate-600 dark:text-slate-400 py-2 px-4'}>
              <ArrowLeft size={16} /> Edit Form
            </button>
            <div className="flex items-center gap-3">
              {syncStatus === 'syncing' && (
                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping inline-block" />
                  Syncing to sheet...
                </span>
              )}
              {syncStatus === 'done' && (
                <span className="text-xs text-emerald-600 dark:text-emerald-450 flex items-center gap-1.5 font-bold">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  Synced to Sheets
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="text-xs text-rose-600 dark:text-rose-450 flex items-center gap-1.5 font-bold">
                  <AlertCircle size={14} className="text-rose-500" />
                  Sync failed
                </span>
              )}
              <button onClick={handleSaveDocument} disabled={savingDoc} className={btnSecondary + ' py-2 px-4 !text-emerald-700 dark:!text-emerald-400 !border-emerald-200 dark:!border-emerald-900/50 disabled:opacity-60'}>
                <Save size={15} /> {savingDoc ? 'Saving…' : 'Save Document'}
              </button>
              <button onClick={openCreateProspect} className={btnSecondary + ' py-2 px-4'}>
                <Briefcase size={15} /> Create Prospect
              </button>
              <button onClick={handlePrint} className={btnPrimary + ' py-2 px-5'}>
                <Printer size={15} /> Print / Save PDF
              </button>
            </div>
          </Card>

          {/* Clean Branded Preview Panel */}
          <div ref={previewDocRef} className="proposal-doc max-w-4xl mx-auto">
            <div className="prop-banner">
              <div className="prop-banner-circles">
                <span></span><span></span><span></span>
              </div>
              <div className="prop-banner-inner">
                <div>
                  <div className="prop-logo-area">
                    <div className="prop-logo-icon">
                      <img src={LOGO_DATA_URI} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff', borderRadius: '6px', padding: '1px' }} alt="logo" />
                    </div>
                    <div>
                      <div className="prop-logo-name">Team Fintness</div>
                      <div className="prop-logo-sub">Building fitter financial futures</div>
                    </div>
                  </div>
                  <div className="prop-date-tag">{new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  <h1 className="prop-main-title">Insurance Proposal</h1>
                  <div className="prop-prepared">Prepared for: <strong>{proposer || client?.name || 'Client'}</strong></div>
                </div>
                <div className="prop-ref-box">
                  <div className="prop-ref-label">Proposal Type</div>
                  <div className="prop-ref-value">{getProposalTypesLabel()}</div>
                </div>
              </div>
            </div>
            <div className="prop-body">
              {applicants.length > 0 && (
                <div className="space-y-3">
                  <div className="psec-title">👤 Client Details</div>
                  <div className="ptable-wrap">
                    <table className="ptable">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Relation</th>
                          <th>Date of Birth</th>
                          <th>Smoking</th>
                          <th>Tobacco</th>
                          <th>Alcohol</th>
                          <th>Pre-existing Disease</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applicants.map((m, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 600, color: '#0d2a5e' }}>{fmt(m.name)}</td>
                            <td style={{ fontWeight: 600 }}>{fmt(m.relation)}</td>
                            <td>{m.dob ? new Date(m.dob).toLocaleDateString('en-IN') : '—'}</td>
                            <td>
                              {m.smoking === 'Yes' ? (
                                <span className="badge by">⚠ Yes</span>
                              ) : (
                                <span className="badge bn">✓ No</span>
                              )}
                            </td>
                            <td>
                              {m.tobacco === 'Yes' ? (
                                <span className="badge by">⚠ Yes</span>
                              ) : (
                                <span className="badge bn">✓ No</span>
                              )}
                            </td>
                            <td>
                              {m.alcohol === 'Yes' ? (
                                <span className="badge by">⚠ Yes</span>
                              ) : (
                                <span className="badge bn">✓ No</span>
                              )}
                            </td>
                            <td>
                              {m.ped === 'Yes' ? (
                                <>
                                  <span className="badge by">⚠ Yes</span>
                                  {m.pedSpecify && (
                                    <>
                                      <br />
                                      <small style={{ color: 'var(--mist)' }}>({fmt(m.pedSpecify)})</small>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className="badge bn">✓ No</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {types.medical && (
                <div className="space-y-4" style={{ marginTop: '28px' }}>
                  <div className="psec-title">
                    🏥 Medical Insurance &nbsp;
                    {isPort ? (
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#6366f1', background: '#ede9fe', padding: '3px 12px', borderRadius: '20px', fontFamily: 'DM Sans, sans-serif' }}>
                        Port · {portDate ? new Date(portDate).toLocaleDateString('en-IN') : '—'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '13px', fontWeight: 500, color: '#0284c7', background: '#e0f2fe', padding: '3px 12px', borderRadius: '20px', fontFamily: 'DM Sans, sans-serif' }}>
                        New
                      </span>
                    )}
                  </div>

                  {basePolicies.filter(p => p.name || p.sum || p.premium).length > 0 && (
                    <div>
                      <div className="psub-label psub-base">Base Cover</div>
                      <div className="ptable-wrap">
                        <table className="ptable">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Company and Policy Name</th>
                              <th>Sum Assured</th>
                              <th>Premium (p.a.)</th>
                              {basePolicies.some(p => p.riders) && <th>Riders</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {basePolicies.filter(p => p.name || p.sum || p.premium).map((p, i) => (
                              <tr key={i}>
                                <td>{i + 1}</td>
                                <td style={{ fontWeight: 600 }}>{fmt(p.name)}</td>
                                <td>₹ {fmtINR(p.sum)}</td>
                                <td>₹ {fmtINR(p.premium)}</td>
                                {basePolicies.some(x => x.riders) && <td style={{ fontSize: '12px', color: 'var(--slate)' }}>{p.riders || '—'}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {topupPolicies.filter(p => p.company || p.name || p.deductible || p.sum || p.premium).length > 0 && (
                    <div style={{ marginTop: '18px' }}>
                      <div className="psub-label psub-topup">Top-Up Cover</div>
                      <div className="ptable-wrap">
                        <table className="ptable">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Company</th>
                              <th>Policy Name</th>
                              <th>Deductible</th>
                              <th>Sum Assured</th>
                              <th>Premium (p.a.)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {topupPolicies.filter(p => p.company || p.name || p.deductible || p.sum || p.premium).map((p, i) => (
                              <tr key={i}>
                                <td>{i + 1}</td>
                                <td style={{ fontWeight: 600 }}>{fmt(p.company)}</td>
                                <td style={{ fontWeight: 600 }}>{fmt(p.name)}</td>
                                <td>₹ {fmtINR(p.deductible)}</td>
                                <td>₹ {fmtINR(p.sum)}</td>
                                <td>₹ {fmtINR(p.premium)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {types.term && (
                <div style={{ marginTop: '28px' }}>
                  <div className="psec-title">🛡️ Term Life Insurance</div>
                  {termGroups.map((group, gi) => {
                    const activePol = group.policies.filter(p => p.name || p.sum || p.premium);
                    if (!activePol.length && !group.insuredName) return null;
                    return (
                      <div key={gi} style={{ marginTop: gi === 0 ? '0' : '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                          <div style={{ width: '24px', height: '24px', background: 'var(--term)', color: '#fff', borderRadius: '50%', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {gi + 1}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--term)' }}>{group.insuredName || '(Unnamed Insured)'}</span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--line)' }}></div>
                        </div>
                        {activePol.length > 0 && (
                          <div className="ptable-wrap">
                            <table className="ptable">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Company and Policy Name</th>
                                  <th>Sum Assured</th>
                                  <th>Cover Till Age</th>
                                  <th>Premium (p.a.)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {activePol.map((p, i) => (
                                  <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{fmt(p.name)}</td>
                                    <td>₹ {fmtINR(p.sum)}</td>
                                    <td>{fmt(p.cover)} yrs</td>
                                    <td>₹ {fmtINR(p.premium)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {types.accidental && (
                <div style={{ marginTop: '28px' }}>
                  <div className="psec-title">☂️ Accidental Insurance</div>
                  {accidentalPolicies.filter(p => p.name || p.sum || p.premium).length > 0 && (
                    <div className="ptable-wrap">
                      <table className="ptable">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Company and Policy Name</th>
                            <th>Sum Assured</th>
                            <th>Premium (p.a.)</th>
                            {accidentalPolicies.some(p => p.riders) && <th>Riders</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {accidentalPolicies.filter(p => p.name || p.sum || p.premium).map((p, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td style={{ fontWeight: 600, color: '#0d2a5e' }}>{fmt(p.name)}</td>
                              <td>₹ {fmtINR(p.sum)}</td>
                              <td>₹ {fmtINR(p.premium)}</td>
                              {accidentalPolicies.some(x => x.riders) && <td style={{ fontSize: '12px', color: 'var(--slate)' }}>{fmt(p.riders)}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="prop-footer">
                <div className="prop-footer-note">This proposal is prepared for discussion purposes only. Final premiums are subject to underwriting and insurer approval. All amounts are in Indian Rupees (₹). Terms and conditions of respective insurers apply.</div>
                <div className="prop-footer-brand">Team Fintness</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {prospectToast && (
        <div className="no-print fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-xl animate-fade-in">
          {prospectToast}
        </div>
      )}
      {showProspectModal && (
        <ProspectModal
          mode="create"
          drafts={prospectDrafts}
          base={prospectBase}
          clients={client ? [client] : []}
          onClose={() => setShowProspectModal(false)}
          onConfirm={handleProspectConfirm}
        />
      )}
    </div>
  );
}

const INSURANCE_PRINT_STYLES = `
  :root {
    --ink: #0d2a5e;
    --ink-light: #1a4080;
    --slate: #3a5a8a;
    --mist: #7a9cc4;
    --line: #c8daf0;
    --bg: #eef4fc;
    --white: #ffffff;
    --blue: #1558d6;
    --blue-mid: #2d6fe8;
    --blue-light: #ddeeff;
    --blue-xlight: #f0f6ff;
    --accent: #0ea5e9;
    --accent-light: #e0f4fe;
    --medical: #0a7abf;
    --medical-light: #ddf0fb;
    --term: #1558d6;
    --term-light: #ddeeff;
    --accidental: #10b981;
    --accidental-light: #d1fae5;
    --topup: #6366f1;
    --topup-light: #ede9fe;
    --danger: #dc2626;
    --radius: 12px;
    --shadow: 0 4px 24px rgba(13,42,94,0.09);
    --shadow-lg: 0 12px 48px rgba(13,42,94,0.16);
  }

  .proposal-doc {
    background: var(--white);
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--line);
    box-shadow: var(--shadow-lg);
    color: var(--ink);
    font-family: 'DM Sans', sans-serif;
    text-align: left;
  }

  /* Top banner */
  .prop-banner {
    background: linear-gradient(135deg, #0d2a5e 0%, #1558d6 100%);
    padding: 0;
    position: relative;
    overflow: hidden;
  }
  .prop-banner::after {
    content:'';
    position:absolute; bottom:0; left:0; right:0; height:4px;
    background: linear-gradient(90deg, #0ea5e9, #6366f1, #1558d6);
  }
  .prop-banner-inner {
    padding: 40px 48px 36px;
    position: relative; z-index:1;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
  }
  .prop-banner-circles {
    position:absolute; top:0; right:0; bottom:0;
    width:320px; overflow:hidden; pointer-events:none;
  }
  .prop-banner-circles span {
    position:absolute; border-radius:50%; border: 1px solid rgba(255,255,255,0.08);
  }
  .prop-banner-circles span:nth-child(1){width:260px;height:260px;top:-80px;right:-60px;background:rgba(255,255,255,0.04);}
  .prop-banner-circles span:nth-child(2){width:180px;height:180px;top:20px;right:60px;background:rgba(14,165,233,0.08);}
  .prop-banner-circles span:nth-child(3){width:100px;height:100px;top:60px;right:20px;background:rgba(255,255,255,0.05);}

  .prop-logo-area { display:flex; align-items:center; gap:12px; margin-bottom:28px; }
  .prop-logo-icon { width:42px;height:42px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px; }
  .prop-logo-name { font-family:'Cormorant Garamond',serif; font-size:20px; font-weight:600; color:#fff; letter-spacing:.02em; }
  .prop-logo-sub { font-size:10px; color:rgba(255,255,255,0.5); letter-spacing:.14em; text-transform:uppercase; }

  .prop-date-tag {
    display:inline-block;
    background:rgba(255,255,255,0.12);
    border:1px solid rgba(255,255,255,0.2);
    border-radius:20px;
    padding:5px 14px;
    font-size:12px;
    color:rgba(255,255,255,0.8);
    letter-spacing:.04em;
    margin-bottom:14px;
  }
  .prop-main-title {
    font-family:'Cormorant Garamond',serif;
    font-size:36px; font-weight:700;
    color:#fff;
    line-height:1.1;
    margin-bottom:10px;
    letter-spacing:.01em;
  }
  .prop-prepared {
    font-size:13px; color:rgba(255,255,255,0.6);
  }
  .prop-prepared strong { color:rgba(255,255,255,0.95); font-weight:600; }

  .prop-ref-box {
    background:rgba(255,255,255,0.1);
    border:1px solid rgba(255,255,255,0.18);
    border-radius:10px;
    padding:18px 22px;
    min-width:160px;
    text-align:center;
    flex-shrink:0;
    align-self:center;
  }
  .prop-ref-label { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,0.5); margin-bottom:6px; }
  .prop-ref-value { font-family:'Cormorant Garamond',serif; font-size:22px; font-weight:600; color:#fff; }

  /* Body */
  .prop-body { padding: 36px 48px 40px; }

  .psec-title {
    font-family:'Cormorant Garamond',serif;
    font-size:18px; font-weight:700;
    color: var(--ink);
    margin: 28px 0 14px;
    padding: 10px 16px;
    background: var(--bg);
    border-left: 4px solid var(--blue);
    border-radius: 0 8px 8px 0;
    display:flex; align-items:center; gap:8px;
  }
  .psec-title:first-child { margin-top:0; }

  .psub-label {
    font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    margin: 18px 0 10px; padding: 6px 12px;
    border-radius:4px; display:inline-block;
  }
  .psub-base { background:var(--medical-light); color:var(--medical); }
  .psub-topup { background:var(--topup-light); color:var(--topup); }

  .ptable {
    width:100%; border-collapse:collapse; margin-bottom:6px; font-size:13px;
    border:1px solid var(--line); border-radius:8px; overflow:hidden;
  }
  .ptable thead tr { background: linear-gradient(135deg, #0d2a5e, #1558d6); }
  .ptable th {
    text-align:left; padding:11px 16px;
    font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
    color:rgba(255,255,255,0.85); border:none;
  }
  .ptable tbody tr:nth-child(even) { background:#f5f8ff; }
  .ptable tbody tr:nth-child(odd) { background:#fff; }
  .ptable td { padding:12px 16px; border-bottom:1px solid var(--line); color:var(--ink); font-size:13px; font-weight:600; }
  .ptable tbody tr:last-child td { border-bottom:none; }
  .ptable td:first-child { font-weight:700; color:var(--blue); width:36px; }

  .badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; }
  .by { background:#fef9ec; color:#b45309; border:1px solid #fde68a; }
  .bn { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; }

  .prop-footer {
    margin-top:32px; padding-top:20px;
    border-top: 2px solid var(--line);
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    flex-wrap:wrap;
  }
  .prop-footer-note { font-size:11px; color:var(--slate); line-height:1.5; max-width:480px; }
  .prop-footer-brand { font-family:'Cormorant Garamond',serif; font-size:15px; font-weight:600; color:var(--blue); opacity:.5; }

  @media print {
    @page { size: A4; margin: 0; }
    html, body {
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0d2a5e !important;
    }
    
    /* Neutralize constraints on all parent containers of the proposal to let it take full width and flow correctly */
    html:has(.proposal-doc),
    body:has(.proposal-doc),
    div:has(.proposal-doc),
    main:has(.proposal-doc) {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      position: static !important;
      box-shadow: none !important;
      border: none !important;
      transform: none !important;
      filter: none !important;
    }

    /* Reset transforms and animations so visibility overrides work correctly */
    * { transform: none !important; animation: none !important; }
    /* Remove app chrome from the flow entirely so there is no leading/trailing gap */
    header, nav, aside, footer, .no-print { display: none !important; }
    /* Hide everything, then reveal only the proposal document (kept in normal
       flow so it paginates correctly across multiple pages) */
    body * { visibility: hidden !important; }
    .proposal-doc, .proposal-doc * { visibility: visible !important; }
    /* Neutralise width caps / centering / animation transforms on ancestors so
       the document uses the full printable width inside the @page margins */
    .proposal-doc {
      position: static !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      min-height: 297mm !important;
      box-sizing: border-box !important;
    }
    .proposal-doc .prop-banner-inner { padding: 40px 48px 36px !important; }
    .proposal-doc .prop-body { padding: 36px 48px 40px !important; }
    .proposal-doc .prop-banner { break-inside: avoid-page; }
    .proposal-doc .prop-body > div { break-inside: avoid-page; }
  }
`;
