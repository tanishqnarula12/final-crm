import React, { useState, useEffect, useRef, useMemo } from 'react';
import SCHEMES from '../utils/schemes.json';
import { Card, btnPrimary, btnSecondary, btnGhost, inputCls, CoolSelect, selectCls } from './UI';
import { Plus, Trash2, ArrowLeft, CheckCircle2, ChevronRight, Printer, Lightbulb, Briefcase, Save } from 'lucide-react';
import { LOGO_DATA_URI } from '../assets/logoBase64';
import { addProspects } from '../utils/prospects';
import { saveGeneratedDocument, wrapStandaloneHtml } from '../utils/documents';
import { ProspectModal } from './BusinessProspects';

const TYPES = [
  { id: "sip", label: "Fresh SIP" },
  { id: "specialsip", label: "Special SIP" },
  { id: "sipchanges", label: "Proposed SIP Changes" },
  { id: "sipcancel", label: "SIP Cancellation" },
  { id: "sippause", label: "SIP Pause" },
  { id: "stpcancel", label: "STP Cancelation" },
  { id: "swpcancel", label: "SWP Cancelation" },
  { id: "redemption", label: "Redemption Proposal" },
  { id: "lumpsum", label: "Lumpsum Investment" },
  { id: "stp", label: "STP Proposal" },
  { id: "swp", label: "SWP Proposal" },
  { id: "switch", label: "Switch Proposal" }
];

const CATEGORIES = [
  "Small Cap",
  "Mid Cap",
  "Large Cap",
  "Large and Mid Cap",
  "Flexi Cap",
  "Multi Cap",
  "Multi Asset",
  "Gold",
  "Debt",
  "Balanced Advantage",
  "Hybrid",
  "Arbitrage",
  "ELSS",
  "Value Oriented",
  "Focused",
  "Thematic",
  "Sectoral",
  "Index",
  "Others"
];

// Helper to clean commas and parse floats
const parseNum = (v) => {
  const n = parseFloat((String(v) || '0').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const fmtINR = (val) => {
  if (val === undefined || val === null || val === '') return '—';
  const num = parseNum(val);
  return num.toLocaleString('en-IN');
};

const fmtINRhtml = (val) => {
  if (val === undefined || val === null || val === '') return '—';
  const num = parseNum(val);
  return '₹ ' + num.toLocaleString('en-IN');
};

// Live comma formatting for amount inputs (e.g. 50000 -> 50,000)
const fmtAmt = (v) => {
  const isNegative = String(v == null ? '' : v).trim().startsWith('-');
  const digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  const formatted = digits ? Number(digits).toLocaleString('en-IN') : '';
  return isNegative ? '-' + formatted : formatted;
};

export default function InvestmentProposal({ client, isViewer, variant = 'investment' }) {
  const isOtherCode = variant === 'othercode';
  const proposalCategory = isOtherCode ? 'othercode' : 'investment';
  // "Other Code" is a restricted clone of the Investment proposal — only the
  // SIP Cancellation and Redemption components are offered.
  const availableTypes = isOtherCode
    ? TYPES.filter(t => t.id === 'sipcancel' || t.id === 'redemption')
    : TYPES;

  const totalSip = (row) => parseNum(row.currentSip) + parseNum(row.proposedSip);

  const getColStyle = (key) => {
    if (!key) return {};
    const kLower = key.toLowerCase();
    if (kLower.includes('category')) return { minWidth: '140px' };
    if (kLower.includes('scheme')) return { minWidth: '280px' };
    if (key === 'date') return { minWidth: '100px' };
    if (key === 'amount' || key === 'currentSip' || key === 'proposedSip' || key === 'totalSip' || key === 'shortTerm' || key === 'longTerm' || key === 'fromAmount' || key === 'toAmount') return { minWidth: '110px' };
    if (key === 'taxLiability') return { minWidth: '140px' };
    return { minWidth: '100px' };
  };

  const getSavedVal = (subKey, defaultVal) => {
    try {
      const clientId = client?.id || 'global';
      const key = `${variant}_proposal_draft_${clientId}`;
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

  const [clientName, setClientName] = useState(() => getSavedVal('clientName', client?.name || ''));

  // Resolve applicant options (Group leader client + family members)
  const applicantOptions = useMemo(() => {
    if (!client) return [];
    const opts = [{ name: client.name, relation: 'Self' }];
    (client.clientDetails?.familyDetails || []).forEach(f => {
      if (f.name) opts.push({ name: f.name, relation: f.relation || 'Member' });
    });
    return opts;
  }, [client]);
  const [selTypes, setSelTypes] = useState(() => getSavedVal('selTypes', isOtherCode ? ['sipcancel'] : ['sip']));
  const [activeTab, setActiveTab] = useState(() => getSavedVal('activeTab', isOtherCode ? 'sipcancel' : 'sip'));

  // Inline preview (rendered on the same page, like the Insurance proposal)
  const [isPreview, setIsPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [proposalDataState, setProposalDataState] = useState([]);

  // Business Prospect creation
  const [showProspectModal, setShowProspectModal] = useState(false);
  const [prospectDrafts, setProspectDrafts] = useState([]);
  const [prospectBase, setProspectBase] = useState({});
  const [prospectToast, setProspectToast] = useState('');

  const [sections, setSections] = useState(() => getSavedVal('sections', {
    sip: [{ category: '', scheme: '', date: '', amount: '' }],
    specialsip: [{ category: '', scheme: '', date: '', amount: '' }],
    sipchanges: [{ category: '', scheme: '', date: '', currentSip: '', proposedSip: '' }],
    sipcancel: [{ category: '', scheme: '', date: '', amount: '' }],
    sippause: [{ category: '', scheme: '', date: '', amount: '' }],
    stpcancel: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', amount: '' }],
    swpcancel: [{ category: '', scheme: '', date: '', amount: '' }],
    redemption: [{ category: '', scheme: '', amount: '', shortTerm: '', longTerm: '' }],
    lumpsum: [{ category: '', scheme: '', amount: '' }],
    stp: [{ fromCategory: '', fromScheme: '', fromAmount: '', toCategory: '', toScheme: '', toAmount: '' }],
    swp: [{ category: '', scheme: '', date: '', amount: '' }],
    switch: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', toAmount: '' }]
  }));

  const [remarks, setRemarks] = useState(() => getSavedVal('remarks', {
    sip: '', specialsip: '', sipchanges: '', sipcancel: '', sippause: '', stpcancel: '', swpcancel: '', redemption: '', lumpsum: '', stp: '', swp: '', switch: ''
  }));

  // Redemption settings
  const [redemptionIncludeExemption, setRedemptionIncludeExemption] = useState(() => getSavedVal('redemptionIncludeExemption', true));
  const [redemptionBookedGain, setRedemptionBookedGain] = useState(() => getSavedVal('redemptionBookedGain', ''));
  const [bankDetails, setBankDetails] = useState(() => getSavedVal('bankDetails', {
    redemption: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }],
    swp: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }]
  }));

  // Autocomplete UI States
  const [acFocusRow, setAcFocusRow] = useState(null); // { tab: string, index: number, key: string }
  const [acFiltered, setAcFiltered] = useState([]);
  const [acActiveIdx, setAcActiveIdx] = useState(-1);
  const acRefs = useRef({});

  const lastLoadedClientId = useRef(client?.id || 'global');

  useEffect(() => {
    const clientId = client?.id || 'global';
    lastLoadedClientId.current = clientId;
    
    const key = `${variant}_proposal_draft_${clientId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.clientName !== undefined) setClientName(parsed.clientName);
        if (parsed.selTypes !== undefined) setSelTypes(parsed.selTypes);
        if (parsed.activeTab !== undefined) setActiveTab(parsed.activeTab);
        if (parsed.sections !== undefined) {
          const mergedSections = {
            sip: [{ category: '', scheme: '', date: '', amount: '' }],
            sipchanges: [{ category: '', scheme: '', date: '', currentSip: '', proposedSip: '' }],
            sipcancel: [{ category: '', scheme: '', date: '', amount: '' }],
            sippause: [{ category: '', scheme: '', date: '', amount: '' }],
            stpcancel: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', amount: '' }],
            swpcancel: [{ category: '', scheme: '', date: '', amount: '' }],
            redemption: [{ category: '', scheme: '', amount: '', shortTerm: '', longTerm: '' }],
            lumpsum: [{ category: '', scheme: '', amount: '' }],
            stp: [{ fromCategory: '', fromScheme: '', fromAmount: '', toCategory: '', toScheme: '', toAmount: '' }],
            swp: [{ category: '', scheme: '', date: '', amount: '' }],
            switch: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', toAmount: '' }],
            ...parsed.sections
          };
          setSections(mergedSections);
        }
        if (parsed.remarks !== undefined) {
          const mergedRemarks = {
            sip: '', specialsip: '', sipchanges: '', sipcancel: '', sippause: '', stpcancel: '', swpcancel: '', redemption: '', lumpsum: '', stp: '', swp: '', switch: '',
            ...parsed.remarks
          };
          setRemarks(mergedRemarks);
        }
        if (parsed.redemptionIncludeExemption !== undefined) setRedemptionIncludeExemption(parsed.redemptionIncludeExemption);
        if (parsed.redemptionBookedGain !== undefined) setRedemptionBookedGain(parsed.redemptionBookedGain);
        if (parsed.bankDetails !== undefined) setBankDetails(parsed.bankDetails);
        return;
      } catch (e) {
        console.error(e);
      }
    }
    
    // Otherwise reset to defaults
    setClientName(client?.name || '');
    setSelTypes(['sip']);
    setActiveTab('sip');
    setSections({
      sip: [{ category: '', scheme: '', date: '', amount: '' }],
      sipchanges: [{ category: '', scheme: '', date: '', currentSip: '', proposedSip: '' }],
      sipcancel: [{ category: '', scheme: '', date: '', amount: '' }],
      sippause: [{ category: '', scheme: '', date: '', amount: '' }],
      stpcancel: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', amount: '' }],
      swpcancel: [{ category: '', scheme: '', date: '', amount: '' }],
      redemption: [{ category: '', scheme: '', amount: '', shortTerm: '', longTerm: '' }],
      lumpsum: [{ category: '', scheme: '', amount: '' }],
      stp: [{ fromCategory: '', fromScheme: '', fromAmount: '', toCategory: '', toScheme: '', toAmount: '' }],
      swp: [{ category: '', scheme: '', date: '', amount: '' }],
      switch: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', toAmount: '' }]
    });
    setRemarks({
      sip: '', specialsip: '', sipchanges: '', sipcancel: '', sippause: '', stpcancel: '', swpcancel: '', redemption: '', lumpsum: '', stp: '', swp: '', switch: ''
    });
    setRedemptionIncludeExemption(true);
    setRedemptionBookedGain('');
    setBankDetails({
      redemption: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }],
      swp: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }]
    });
  }, [client]);

  useEffect(() => {
    const clientId = client?.id || 'global';
    if (clientId !== lastLoadedClientId.current) {
      return;
    }
    const key = `${variant}_proposal_draft_${clientId}`;
    const draft = {
      clientName,
      selTypes,
      activeTab,
      sections,
      remarks,
      redemptionIncludeExemption,
      redemptionBookedGain,
      bankDetails
    };
    localStorage.setItem(key, JSON.stringify(draft));
  }, [client, clientName, selTypes, activeTab, sections, remarks, redemptionIncludeExemption, redemptionBookedGain, bankDetails]);

  // Autocomplete computation
  const getSchemesForCategory = (cat) => {
    if (cat && SCHEMES[cat]) {
      return SCHEMES[cat];
    }
    const all = {};
    for (const c in SCHEMES) {
      SCHEMES[c].forEach(s => { all[s] = true; });
    }
    return Object.keys(all).sort();
  };

  const handleAcInputChange = (tab, index, key, value, catValue) => {
    updateRow(tab, index, key, value);
    const query = value.toLowerCase().trim();
    const list = getSchemesForCategory(catValue);
    const filtered = list.filter(item => item.toLowerCase().indexOf(query) >= 0);
    setAcFiltered(filtered.slice(0, 50));
    setAcActiveIdx(-1);
  };

  const selectAcOption = (tab, index, key, value) => {
    updateRow(tab, index, key, value);
    setAcFocusRow(null);
  };

  // Row Manipulation
  const newRow = (type) => {
    switch (type) {
      case 'sip': return { category: '', scheme: '', date: '', amount: '' };
      case 'specialsip': return { category: '', scheme: '', date: '', amount: '' };
      case 'sipchanges': return { category: '', scheme: '', date: '', currentSip: '', proposedSip: '' };
      case 'sipcancel': return { category: '', scheme: '', date: '', amount: '' };
      case 'sippause': return { category: '', scheme: '', date: '', amount: '' };
      case 'stpcancel': return { fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', amount: '' };
      case 'swpcancel': return { category: '', scheme: '', date: '', amount: '' };
      case 'redemption': return { category: '', scheme: '', amount: '', shortTerm: '', longTerm: '' };
      case 'lumpsum': return { category: '', scheme: '', amount: '' };
      case 'stp': return { fromCategory: '', fromScheme: '', fromAmount: '', toCategory: '', toScheme: '', toAmount: '' };
      case 'swp': return { category: '', scheme: '', date: '', amount: '' };
      case 'switch': return { fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', toAmount: '' };
      default: return {};
    }
  };

  const addRow = () => {
    setSections(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] || []), newRow(activeTab)]
    }));
  };

  const removeRow = (index) => {
    setSections(prev => {
      const list = prev[activeTab] || [];
      if (list.length === 1) return prev; // Keep at least one row
      return {
        ...prev,
        [activeTab]: list.filter((_, i) => i !== index)
      };
    });
  };

  const updateRow = (tab, index, key, value) => {
    setSections(prev => {
      const list = [...(prev[tab] || [])];
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [tab]: list };
    });
  };

  const toggleTypeChip = (typeId) => {
    setSelTypes(prev => {
      if (prev.includes(typeId)) {
        if (prev.length === 1) return prev; // must select at least one
        const next = prev.filter(t => t !== typeId);
        if (activeTab === typeId) {
          setActiveTab(next[0]);
        }
        return next;
      } else {
        return [...prev, typeId];
      }
    });
  };

  const handleReset = () => {
    if (!window.confirm('Are you sure you want to reset the form? This will clear all entered details.')) {
      return;
    }

    const clientId = client?.id || 'global';
    const key = `${variant}_proposal_draft_${clientId}`;
    localStorage.removeItem(key);

    setClientName(client?.name || '');
    setSelTypes(['sip']);
    setActiveTab('sip');
    setSections({
      sip: [{ category: '', scheme: '', date: '', amount: '' }],
      sipchanges: [{ category: '', scheme: '', date: '', currentSip: '', proposedSip: '' }],
      sipcancel: [{ category: '', scheme: '', date: '', amount: '' }],
      sippause: [{ category: '', scheme: '', date: '', amount: '' }],
      stpcancel: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', amount: '' }],
      swpcancel: [{ category: '', scheme: '', date: '', amount: '' }],
      redemption: [{ category: '', scheme: '', amount: '', shortTerm: '', longTerm: '' }],
      lumpsum: [{ category: '', scheme: '', amount: '' }],
      stp: [{ fromCategory: '', fromScheme: '', fromAmount: '', toCategory: '', toScheme: '', toAmount: '' }],
      swp: [{ category: '', scheme: '', date: '', amount: '' }],
      switch: [{ fromCategory: '', fromScheme: '', toCategory: '', toScheme: '', toAmount: '' }]
    });
    setRemarks({
      sip: '', specialsip: '', sipchanges: '', sipcancel: '', sippause: '', stpcancel: '', swpcancel: '', redemption: '', lumpsum: '', stp: '', swp: '', switch: ''
    });
    setRedemptionIncludeExemption(true);
    setRedemptionBookedGain('');
    setBankDetails({
      redemption: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }],
      swp: [{ bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }]
    });
  };


  // Tax calculations
  const getRedemptionState = () => {
    const booked = parseNum(redemptionBookedGain);
    const exemption = redemptionIncludeExemption ? Math.max(0, 125000 - booked) : 0;
    return { includeExemption: redemptionIncludeExemption, booked, exemption };
  };

  const calcAllRedemptionTaxes = () => {
    const rows = sections.redemption || [];
    const rs = getRedemptionState();

    const equityRows = [];
    const debtRows = [];
    rows.forEach(r => {
      if (r.category === 'Debt') debtRows.push(r);
      else equityRows.push(r);
    });

    const netEquityST = equityRows.reduce((s, r) => s + parseNum(r.shortTerm), 0);
    const netEquityLT = equityRows.reduce((s, r) => s + parseNum(r.longTerm), 0);

    let adjustedLT = netEquityLT;
    let adjustedST = netEquityST;
    if (netEquityST < 0) {
      adjustedLT = netEquityLT + netEquityST;
      adjustedST = 0;
    }

    const exemption = rs.exemption;
    const taxableLT = adjustedLT > 0 ? Math.max(0, adjustedLT - exemption) : 0;
    const equityLTTax = taxableLT * 0.125;
    const equitySTTax = adjustedST > 0 ? adjustedST * 0.20 : 0;

    let debtLTTax = 0;
    let hasDebtST = false;
    debtRows.forEach(r => {
      debtLTTax += parseNum(r.longTerm) * 0.125;
      if (parseNum(r.shortTerm) > 0) hasDebtST = true;
    });

    return {
      equitySTTax,
      equityLTTax,
      equityTax: equitySTTax + equityLTTax,
      debtLTTax,
      hasDebtST,
      netEquityST,
      netEquityLT,
      adjustedST,
      adjustedLT,
      taxableLT
    };
  };

  const calcRedemptionTax = (row, exemptionRemaining) => {
    const isDebt = row.category === 'Debt';
    const st = parseNum(row.shortTerm);
    const lt = parseNum(row.longTerm);
    let ltTax = 0;
    let stLabel = '-';
    let ltLabel = '-';

    if (isDebt) {
      stLabel = st > 0 ? "As Per Tax Slab" : "-";
      ltTax = lt > 0 ? Math.round(lt * 0.125) : 0;
      ltLabel = lt > 0 ? fmtINR(String(ltTax)) : "-";
    } else {
      stLabel = st !== 0 ? (st > 0 ? fmtINR(String(Math.round(st * 0.20))) : "Loss") : "-";
      if (lt !== 0) {
        ltLabel = lt > 0 ? fmtINR(String(Math.round(Math.max(0, lt - exemptionRemaining) * 0.125))) : "Loss";
        exemptionRemaining = Math.max(0, exemptionRemaining - lt);
      }
    }
    return { stLabel, ltLabel, exemptionRemaining, isDebt };
  };

  // Totals mapping
  const calcTotal = (type, key) => {
    const rows = sections[type] || [];
    if (type === 'sipchanges' && key === 'totalSip') {
      return rows.reduce((s, r) => s + parseNum(r.currentSip) + parseNum(r.proposedSip), 0);
    }
    return rows.reduce((s, r) => s + parseNum(r[key]), 0);
  };

  // Accompanying banks
  const addBankAccount = (type) => {
    setBankDetails(prev => ({
      ...prev,
      [type]: [...(prev[type] || []), { bankName: '', accNo: '', ifsc: '', accType: 'Savings', amount: '' }]
    }));
  };

  const removeBankAccount = (type, index) => {
    setBankDetails(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  const updateBankAccount = (type, index, key, value) => {
    setBankDetails(prev => {
      const list = [...(prev[type] || [])];
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [type]: list };
    });
  };

  // Preview page generation (porting the exact HTML generation logic)
  const generatePreview = () => {
    const cn = clientName || 'Client';
    const thS = "background:#0d2b5e;color:#fff;padding:10px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;text-align:left;font-weight:800;";
    const tdS = "padding:10px 12px;font-size:12px;border-bottom:1px solid #bfdbfe;color:#1e293b;font-weight:600;";

    // Build proposal data for Excel
    const proposalData = [];

    selTypes.forEach((type) => {
      const label = TYPES.find((p) => p.id === type)?.label || '';
      const sheetName = label.substring(0, 31);
      const cols = COLS[type];
      const keys = KEYS[type];
      const ck = CURR[type];
      const rows = sections[type] || [];
      const excelRows = [];
      const extras = [];

      if (type === "redemption") {
        const calc = calcAllRedemptionTaxes();
        const rs = getRedemptionState();
        let exemR = rs.exemption;
        rows.forEach((row) => {
          const result = calcRedemptionTax(row, exemR);
          exemR = result.exemptionRemaining;
          let taxDisp = "";
          if (result.isDebt) {
            const pts = [];
            if (parseNum(row.shortTerm) > 0) pts.push("As Per Tax Slab");
            if (parseNum(row.longTerm) > 0) pts.push(result.ltLabel);
            taxDisp = pts.length ? pts.join(" + ") : "-";
          } else {
            const pts2 = [];
            if (parseNum(row.shortTerm) > 0) pts2.push(result.stLabel);
            if (parseNum(row.longTerm) > 0) pts2.push(result.ltLabel);
            taxDisp = pts2.length ? pts2.join(" + ") : "-";
          }
          excelRows.push([
            row.category || "",
            row.scheme || "",
            parseNum(row.amount) || "",
            parseNum(row.shortTerm) || "",
            parseNum(row.longTerm) || "",
            taxDisp
          ]);
        });
        const totalAmt = rows.reduce((s, r) => s + parseNum(r.amount), 0);
        const totalST = rows.reduce((s, r) => s + parseNum(r.shortTerm), 0);
        const totalLT = rows.reduce((s, r) => s + parseNum(r.longTerm), 0);
        const totalRow = ["", "TOTAL", totalAmt, totalST, totalLT, ""];
        extras.push(["Exemption:", rs.includeExemption ? "Included (Rs 1,25,000)" : "Excluded"]);
        if (rs.booked) extras.push(["Booked Capital Gain:", parseNum(redemptionBookedGain)]);
        extras.push(["Equity Tax Liability:", Math.round(calc.equityTax)]);
        extras.push(["Debt Tax Liability:", Math.round(calc.debtLTTax)]);
        if (calc.hasDebtST) extras.push(["Note:", "Debt Short Term: As Per Tax Slab"]);
        if (calc.netEquityST < 0 && calc.netEquityLT > 0) {
          extras.push(["Adjustment:", `ST Loss of ${Math.abs(calc.netEquityST)} adjusted against LT Gain. Net LT = ${calc.adjustedLT}`]);
        }
        if (bankDetails.redemption && bankDetails.redemption.length > 0) {
          bankDetails.redemption.forEach((bank, bidx) => {
            if (bank.bankName || bank.accNo || bank.ifsc) {
              extras.push([
                "Bank Account " + (bidx + 1) + ":",
                `${bank.bankName} | A/C: ${bank.accNo} | IFSC: ${bank.ifsc} | Type: ${bank.accType} | Amount: ${bank.amount ? fmtINR(bank.amount) : "-"}`
              ]);
            }
          });
        }
        if (remarks[type]) extras.push(["Remarks:", remarks[type]]);
        proposalData.push({
          label: label,
          sheetName: sheetName,
          cols: ["Category", "Scheme Name", "Amount (Rs)", "Short Term (Rs)", "Long Term (Rs)", "Tax Liability"],
          rows: excelRows,
          totalRow: totalRow,
          extras: extras
        });
      } else {
        rows.forEach((row) => {
          const r = [];
          keys.forEach((key) => {
            if (type === "sipchanges" && key === "totalSip") {
              r.push(totalSip(row) || "");
            } else {
              r.push(row[key] || "");
            }
          });
          excelRows.push(r);
        });
        let totalRow = null;
        if (HAS_TOTAL.includes(type)) {
          if (SPLIT_TOTAL[type]) {
            const sp2 = SPLIT_TOTAL[type];
            const tr2 = ["", "TOTAL"];
            for (let si = 2; si < keys.length; si++) tr2.push("");
            sp2.cols.forEach((key) => {
              const ki = keys.indexOf(key);
              if (ki >= 0) tr2[ki] = calcTotal(type, key);
            });
            totalRow = tr2;
          } else {
            const tr = keys.map((key) => {
              if (ck.includes(key)) {
                return calcTotal(type, key);
              }
              return "";
            });
            tr[0] = "";
            tr[1] = "TOTAL";
            totalRow = tr;
          }
        }
        if (type === "swp" && bankDetails.swp && bankDetails.swp.length > 0) {
          bankDetails.swp.forEach((bank, bidx) => {
            if (bank.bankName || bank.accNo || bank.ifsc) {
              extras.push([
                "Bank Account " + (bidx + 1) + ":",
                `${bank.bankName} | A/C: ${bank.accNo} | IFSC: ${bank.ifsc} | Type: ${bank.accType} | Amount: ${bank.amount ? fmtINR(bank.amount) : "-"}`
              ]);
            }
          });
        }
        if (remarks[type]) extras.push(["Remarks:", remarks[type]]);
        proposalData.push({
          label: label,
          sheetName: sheetName,
          cols: cols,
          rows: excelRows,
          totalRow: totalRow,
          extras: extras
        });
      }
    });

    const pagesHtml = selTypes.map((type) => {
      const label = TYPES.find(t => t.id === type)?.label || '';
      const secContent = type === 'redemption'
        ? buildRedemptionPrintSec(tdS, thS)
        : buildNormalPrintSec(type, label, tdS, thS);
      return `
        <div class='inv-page'>
          ${pageHeader(type, cn, LOGO_DATA_URI)}
          ${secContent}
          <div class='inv-page-footer' style='margin-top:32px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #bfdbfe;padding-top:12px;'>
            This document is confidential and prepared exclusively for ${cn}. For queries, please contact your advisor.
          </div>
        </div>
      `;
    }).join('');

    setProposalDataState(proposalData);
    setPreviewHtml(pagesHtml);
    setIsPreview(true);
  };

  // Representative total amount for a proposal type (auto-fetched for prospects)
  const amountForType = (type) => {
    if (type === 'sipchanges') return calcTotal(type, 'totalSip');
    if (type === 'stp' || type === 'switch') return calcTotal(type, 'toAmount');
    const keys = CURR[type] || [];
    return keys.length ? calcTotal(type, keys[0]) : 0;
  };

  // Build one prospect draft per selected proposal type, then open the confirm modal
  const openCreateProspect = () => {
    // Block empty proposals up front — a prospect can't be created from a
    // proposal with no amount entered (SIP Cancellation/Registration are
    // exempt here since their amount is typed fresh in the confirm modal,
    // which enforces it there instead).
    const zeroAmountType = selTypes.find((type) => type !== 'sipchanges' && !(Number(amountForType(type)) > 0));
    if (zeroAmountType) {
      const label = TYPES.find((p) => p.id === zeroAmountType)?.label || zeroAmountType;
      alert(`Please enter an amount for "${label}" before creating a prospect.`);
      return;
    }
    const drafts = [];
    selTypes.forEach((type) => {
      const label = TYPES.find((p) => p.id === type)?.label || '';
      const sec = proposalDataState.find(s => s.label === label);
      if (type === 'sipchanges') {
        const cancelRows = sec ? sec.rows.map(r => [
          r[0] || '',
          r[1] || '',
          r[2] || '',
          ''
        ]) : [];

        const regRows = sec ? sec.rows.map(r => [
          r[0] || '',
          r[1] || '',
          r[2] || '',
          ''
        ]) : [];

        drafts.push({
          proposalType: 'SIP Cancellation',
          proposalCategory,
          amount: '',
          table: {
            cols: ["Category", "Scheme Name", "Date of SIP", "Amount (Rs)"],
            rows: cancelRows,
            totalRow: ["", "TOTAL", "", 0]
          },
        });
        drafts.push({
          proposalType: 'SIP Registration',
          proposalCategory,
          amount: '',
          table: {
            cols: ["Category", "Scheme Name", "Date of SIP", "Amount (Rs)"],
            rows: regRows,
            totalRow: ["", "TOTAL", "", 0]
          },
        });
      } else {
        drafts.push({
          proposalType: label,
          proposalCategory,
          amount: amountForType(type),
          table: sec ? { cols: sec.cols, rows: sec.rows, totalRow: sec.totalRow } : { cols: [], rows: [] },
        });
      }
    });
    const d = client?.clientDetails || {};
    setProspectBase({
      groupLeaderId: client?.id || '',
      groupLeader: client?.name || clientName,
      applicant: clientName || client?.name || '',
      pan: client?.pan || '',
      serviceManager: d.serviceManager || '',
      relationshipManager: d.relationshipManager || '',
      portfolioManager: d.portfolioManager || '',
      insuranceManager: d.insuranceManager || '',
      owner: d.owner || '',
      internalManager: d.internalManager || '',
    });
    setProspectDrafts(drafts);
    setShowProspectModal(true);
  };

  const handleProspectConfirm = (list) => {
    addProspects(list);
    window.dispatchEvent(new Event('crm:prospects-updated'));
    setShowProspectModal(false);
    setProspectToast(`✅ ${list.length} prospect${list.length > 1 ? 's' : ''} created — see the Prospect module.`);
    setTimeout(() => setProspectToast(''), 4000);
  };

  const [savingDoc, setSavingDoc] = useState(false);
  const handleSaveDocument = async () => {
    if (!client?.id) {
      setProspectToast('⚠️ This proposal is not linked to a saved client, so it cannot be saved.');
      setTimeout(() => setProspectToast(''), 4000);
      return;
    }
    setSavingDoc(true);
    try {
      const docLabel = isOtherCode ? 'Other Code Proposal' : 'Investment Proposal';
      const html = wrapStandaloneHtml(
        `<div class="inv-proposal-doc">${previewHtml}</div>`,
        `${docLabel} — ${client.name}`
      );
      const name = await saveGeneratedDocument(client, {
        kind: isOtherCode ? 'othercode' : 'investment',
        label: docLabel,
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

  const getIntroText = (type) => {
    switch (type) {
      case 'sip': return "We recommend starting fresh Systematic Investment Plans (SIP) in the following mutual fund schemes to align with your long-term wealth accumulation objectives.";
      case 'specialsip': return "We recommend initiating Special Systematic Investment Plans (Special SIP) in the following mutual fund schemes as a targeted strategy to address specific financial goals or market opportunities.";
      case 'sipchanges': return "Based on our review, we propose the following changes to your existing Systematic Investment Plans (SIP) to optimize asset allocation and portfolio performance.";
      case 'sipcancel': return "This is in reference to our discussion regarding your ongoing SIP investments. Following a review of your portfolio and financial objectives, we recommend discontinuing the following SIPs. The proposed change is designed to better align your investments with your current requirements and overall financial plan.";
      case 'sippause': return "This is in reference to our discussion regarding your SIP investments. Considering your current financial situation and cash flow requirements, we recommend a temporary pause of the following SIPs for 2 months. The objective is to provide short-term flexibility while preserving your overall investment strategy.";
      case 'stpcancel': return "This is in reference to our discussion regarding your ongoing STP investments. As the intended amount has been successfully transferred from the source scheme to the target scheme, we recommend discontinuing the following STP. The proposed change is intended to streamline your portfolio and ensure alignment with your current investment strategy and financial objectives.";
      case 'swpcancel': return "This is in reference to our discussion regarding your ongoing SWP investments. Following a review of your portfolio and financial objectives, we recommend discontinuing the following SWP. The proposed change is designed to better align your investments with your current requirements and overall financial plan.";
      case 'redemption': return "We recommend executing redemptions from the following mutual fund schemes. The estimated capital gains tax liabilities are summarized below.";
      case 'lumpsum': return "We recommend making one-time lumpsum investments in the following mutual fund schemes to deploy your investable surplus efficiently.";
      case 'stp': return "We propose Systematic Transfer Plans (STP) to systematically move funds from your source schemes to the target destination schemes for staggered market entry.";
      case 'swp': return "To fulfill your regular cash flow requirements, we propose Systematic Withdrawal Plans (SWP) from the following mutual fund schemes as structured below.";
      case 'switch': return "We recommend switching your balances from the current source schemes into the target schemes listed below to rebalance your portfolio.";
      default: return "";
    }
  };

  const pageHeader = (type, cn, LOGO) => {
    const dStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
      <div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;'>
        <div>
          <div style='font-family:serif;font-size:30px;color:#0d2b5e;font-weight:bold;'>Team Fintness</div>
          <div style='font-size:11px;color:#1a4a9c;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-top:2px;'>Investment Advisory</div>
        </div>
        <img src='${LOGO}' style='max-height:72px;max-width:180px;object-fit:contain;'/>
      </div>
      <div style='height:3px;background:linear-gradient(90deg,#0d2b5e 0%,#1558d6 60%,#0ea5e9 100%);margin:16px 0 20px;border-radius:2px;'></div>
      <div style='font-size:36px;font-family:serif;color:#0d2b5e;margin-bottom:4px;font-weight:bold;'>${dStr}</div>
      <div style='font-size:13.5px;color:#64748b;margin-bottom:28px;'>Prepared for: <strong style='color:#0d2b5e;'>${cn}</strong></div>
      <div style='background:#eff6ff;border-left:4px solid #1a4a9c;padding:18px 22px;margin-bottom:34px;font-size:14px;line-height:1.85;color:#374151;border-radius:0 8px 8px 0;'>${getIntroText(type)}</div>
    `;
  };

  const buildNormalPrintSec = (type, label, tdS, thS) => {
    const cols = COLS[type];
    const keys = KEYS[type];
    const currList = CURR[type];
    const rows = sections[type] || [];
    const fci = keys.findIndex(kk => currList.includes(kk));

    const hasTwoSchemes = cols.filter(c => c.toLowerCase().includes('scheme')).length > 1;
    const getColWidth = (colName) => {
      const name = colName.toLowerCase();
      if (name.includes('scheme')) return hasTwoSchemes ? '25%' : '40%';
      if (name.includes('category')) return hasTwoSchemes ? '12%' : '20%';
      if (name.includes('amount') || name.includes('date') || name.includes('tax') || name.includes('term')) {
        return hasTwoSchemes ? '11%' : '17%';
      }
      return '';
    };

    let headersHTML = `<th style='${thS}width:${hasTwoSchemes ? '4%' : '5%'};'>S.No</th>`;
    cols.forEach((col, ci) => {
      const isNum = currList.includes(keys[ci]);
      const align = isNum ? "text-align:right;" : "";
      const w = getColWidth(col);
      const wStyle = w ? `width:${w};` : "";
      headersHTML += `<th style='${thS}${align}${wStyle}'>${col}</th>`;
    });

    let rowsHTML = '';
    rows.forEach((row, i) => {
      const bg = i % 2 === 1 ? "#f8fafc" : "#ffffff";
      rowsHTML += `<tr style='background:${bg}'><td style='${tdS}color:#1a4a9c;font-weight:700;'>${i + 1}</td>`;
      keys.forEach(key => {
        let val = '';
        if (type === 'sipchanges' && key === 'totalSip') {
          val = fmtINRhtml(String(parseNum(row.currentSip) + parseNum(row.proposedSip)));
        } else {
          val = currList.includes(key) ? fmtINRhtml(row[key]) : (row[key] || "-");
        }
        const isNum = currList.includes(key);
        const align = isNum ? "text-align:right;" : "";
        rowsHTML += `<td style='${tdS}${align}'>${val}</td>`;
      });
      rowsHTML += `</tr>`;
    });

    let footerHTML = '';
    if (HAS_TOTAL.includes(type)) {
      if (SPLIT_TOTAL[type]) {
        const sp = SPLIT_TOTAL[type];
        footerHTML += `<tr><td colspan='${sp.labelCols}' style='background:#0047AB;color:#fff;padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;text-align:right;'>TOTAL</td>`;
        sp.cols.forEach(key => {
          if (key === "") footerHTML += `<td style='background:#0047AB;'></td>`;
          else footerHTML += `<td style='background:#0047AB;color:#fff;padding:10px 12px;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;'>${fmtINRhtml(String(calcTotal(type, key)))}</td>`;
        });
        footerHTML += `</tr>`;
      } else {
        footerHTML += `<tr><td colspan='${fci + 1}' style='background:#0047AB;color:#fff;padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;text-align:right;'>TOTAL</td>`;
        currList.forEach(key => {
          footerHTML += `<td style='background:#0047AB;color:#fff;padding:10px 12px;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;'>${fmtINRhtml(String(calcTotal(type, key)))}</td>`;
        });
        footerHTML += `</tr>`;
      }
    }

    let bankHTML = '';
    if (type === 'swp') {
      bankHTML = buildBankDetailsPrintHTML('swp', thS, tdS);
    }

    let noteHTML = '';
    if (type === 'sippause') {
      noteHTML = `<div style='margin-top:12px;padding:12px 16px;background:#fefce8;border-left:4px solid #ca8a04;border-radius:6px;font-size:12px;color:#854d0e;font-weight:500;display:flex;align-items:center;gap:8px;'>💡 <strong>Note:</strong> This SIP will be automatically resumed after 2 months.</div>`;
    }

    const rem = remarks[type];
    const remHTML = rem ? `<div style='margin-top:16px;padding:14px 18px;background:#f8fafc;border:1px solid #bfdbfe;border-radius:8px;'><div style='font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1a4a9c;margin-bottom:6px;'>Remarks</div><div style='font-size:13px;color:#334155;line-height:1.8;white-space:pre-wrap;'>${rem}</div></div>` : '';

    return `
      <div style='margin-bottom:24px;'>
        <div style='font-size:16px;font-weight:700;color:#0d2b5e;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #bfdbfe;'>${label}</div>
        <table style='width:100%;border-collapse:collapse;'>
          <thead><tr>${headersHTML}</tr></thead>
          <tbody>${rowsHTML}${footerHTML}</tbody>
        </table>
        ${noteHTML}
        ${bankHTML}
        ${remHTML}
      </div>
    `;
  };

  const buildRedemptionPrintSec = (tdS, thS) => {
    const rows = sections.redemption || [];
    const rs = getRedemptionState();
    const calc = calcAllRedemptionTaxes();
    let exemptionRemaining = rs.exemption;

    let rowsHTML = '';
    rows.forEach((row, i) => {
      const result = calcRedemptionTax(row, exemptionRemaining);
      exemptionRemaining = result.exemptionRemaining;
      
      let taxDisplay = "";
      if (result.isDebt) {
        const pts = [];
        if (parseNum(row.shortTerm) > 0) pts.push("As Per Tax Slab");
        if (parseNum(row.longTerm) > 0) pts.push(result.ltLabel);
        taxDisplay = pts.length ? pts.join(" + ") : "-";
      } else {
        const pts2 = [];
        if (parseNum(row.shortTerm) > 0) pts2.push(result.stLabel);
        if (parseNum(row.longTerm) > 0) pts2.push(result.ltLabel);
        taxDisplay = pts2.length ? pts2.join(" + ") : "-";
      }

      const bg = i % 2 === 1 ? "#f8fafc" : "#ffffff";
      rowsHTML += `
        <tr style='background:${bg}'>
          <td style='${tdS}color:#1a4a9c;font-weight:700;'>${i + 1}</td>
          <td style='${tdS}'>${row.category || "-"}</td>
          <td style='${tdS}'>${row.scheme || "-"}</td>
          <td style='${tdS}text-align:right;white-space:nowrap;'>${fmtINRhtml(row.amount)}</td>
          <td style='${tdS}text-align:right;white-space:nowrap;'>${fmtINRhtml(row.shortTerm)}</td>
          <td style='${tdS}text-align:right;white-space:nowrap;'>${fmtINRhtml(row.longTerm)}</td>
          <td style='${tdS}'>${taxDisplay}</td>
        </tr>
      `;
    });

    const totalAmt = rows.reduce((s, r) => s + parseNum(r.amount), 0);
    const totalST = rows.reduce((s, r) => s + parseNum(r.shortTerm), 0);
    const totalLT = rows.reduce((s, r) => s + parseNum(r.longTerm), 0);

    const debtDisp = `₹ ${Math.round(calc.debtLTTax).toLocaleString('en-IN')}`;

    const bankHTML = buildBankDetailsPrintHTML('redemption', thS, tdS);
    const rem = remarks.redemption;
    const remHTML = rem ? `<div style='margin-top:16px;padding:14px 18px;background:#f8fafc;border:1px solid #bfdbfe;border-radius:8px;'><div style='font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1a4a9c;margin-bottom:6px;'>Remarks</div><div style='font-size:13px;color:#334155;line-height:1.8;white-space:pre-wrap;'>${rem}</div></div>` : '';

    // Informational note on applicable capital-gains tax rates
    const noteHTML = `
      <div style='margin-top:16px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:4px;font-size:12px;color:#334155;line-height:1.5;display:flex;align-items:center;flex-wrap:wrap;gap:8px;'>
        <strong style='color:#92400e;text-transform:uppercase;font-size:11px;letter-spacing:1px;display:flex;align-items:center;gap:4px;margin-right:4px;'>
          <span style='font-size:14px;'>💡</span> Applicable Tax Rates:
        </strong>
        <span style='font-weight:700;color:#0d2b5e;'>Equity:</span> Short Term <strong>20%</strong>, Long Term <strong>12%</strong>
        <span style='color:#f59e0b;margin:0 6px;'>|</span>
        <span style='font-weight:700;color:#0d2b5e;'>Debt:</span> Short Term <strong>As Per Tax Slab</strong>, Long Term <strong>12.5%</strong>
      </div>`;

    return `
      <div style='margin-bottom:24px;'>
        <div style='font-size:16px;font-weight:700;color:#0d2b5e;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #bfdbfe;'>Redemption Proposal</div>
        <table style='width:100%;border-collapse:collapse;'>
          <thead>
            <tr>
              <th style='${thS}width:5%;'>S.No</th>
              <th style='${thS}width:20%;'>Category</th>
              <th style='${thS}width:30%;'>Scheme Name</th>
              <th style='${thS}text-align:right;width:11%;'>Amount (Rs)</th>
              <th style='${thS}text-align:right;width:11%;'>Short Term (Rs)</th>
              <th style='${thS}text-align:right;width:11%;'>Long Term (Rs)</th>
              <th style='${thS}width:12%;'>Tax Liability</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
            <tr>
              <td colspan='3' style='background:#0047AB;color:#fff;padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;text-align:right;'>TOTAL</td>
              <td style='background:#0047AB;color:#fff;padding:10px 12px;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;'>${fmtINRhtml(String(totalAmt))}</td>
              <td style='background:#0047AB;color:#fff;padding:10px 12px;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;'>${fmtINRhtml(String(totalST))}</td>
              <td style='background:#0047AB;color:#fff;padding:10px 12px;font-size:13px;font-weight:700;text-align:right;white-space:nowrap;'>${fmtINRhtml(String(totalLT))}</td>
              <td style='background:#0047AB;padding:10px 12px;'></td>
            </tr>
          </tbody>
        </table>
        
        <div style='margin-top:10px;padding:8px 12px;background:#eff6ff;border-left:3px solid #1a4a9c;border-radius:4px;font-size:11.5px;color:#1a4a9c;'>
          ${rs.includeExemption ? '✓ ₹1.25 Lakh Exemption Included' : '✗ ₹1.25 Lakh Exemption Excluded'}${rs.booked > 0 ? ` &nbsp;|&nbsp; Booked Gain: ₹ ${rs.booked.toLocaleString('en-IN')}` : ''}
        </div>

        <div style='margin-top:14px;display:flex;gap:14px;'>
          <div style='flex:1;padding:14px 20px;background:#0d2b5e;border-radius:8px;color:#fff;'>
            <div style='font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.8;margin-bottom:8px;font-weight:700;'>Equity Tax Liability</div>
            <div style='font-size:20px;font-weight:800;margin-bottom:8px;'>₹ ${Math.round(calc.equityTax).toLocaleString('en-IN')}</div>
            <div style='font-size:12px;opacity:0.9;line-height:1.6;'>
              Short Term: ₹ ${Math.round(calc.equitySTTax).toLocaleString('en-IN')}<br>
              Long Term: ₹ ${Math.round(calc.equityLTTax).toLocaleString('en-IN')}
            </div>
          </div>
          <div style='flex:1;padding:14px 20px;background:#1a4a9c;border-radius:8px;color:#fff;'>
            <div style='font-size:10px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.8;margin-bottom:8px;font-weight:700;'>Debt Tax Liability</div>
            <div style='font-size:20px;font-weight:800;margin-bottom:8px;'>${debtDisp}</div>
            <div style='font-size:12px;opacity:0.9;line-height:1.6;'>
              Short Term: ${calc.hasDebtST ? 'As Per Tax Slab, will be added to your income' : '₹ 0'}<br>
              Long Term: ₹ ${Math.round(calc.debtLTTax).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        ${bankHTML}
        ${noteHTML}
        ${remHTML}
      </div>
    `;
  };

  const buildBankDetailsPrintHTML = (type, thS, tdS) => {
    const list = bankDetails[type] || [];
    const valid = list.filter(b => b.bankName || b.accNo || b.ifsc);
    if (valid.length === 0) return '';

    let rowsHTML = '';
    valid.forEach((bank, i) => {
      rowsHTML += `
        <tr>
          <td style='${tdS}color:#1a4a9c;font-weight:700;'>${i + 1}</td>
          <td style='${tdS}font-weight:bold;'>${bank.bankName || "—"}</td>
          <td style='${tdS}font-family:monospace;'>${bank.accNo || "—"}</td>
          <td style='${tdS}font-family:monospace;'>${bank.ifsc || "—"}</td>
          <td style='${tdS}'>${bank.accType}</td>
          <td style='${tdS}text-align:right;'>${bank.amount ? fmtINRhtml(bank.amount) : "—"}</td>
        </tr>
      `;
    });

    return `
      <div style='margin-top:20px;'>
        <div style='font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0d2b5e;margin-bottom:8px;'>Accompanying Bank Details</div>
        <table style='width:100%;border-collapse:collapse;'>
          <thead>
            <tr>
              <th style='${thS}'>S.No</th>
              <th style='${thS}'>Bank Name</th>
              <th style='${thS}'>Account No</th>
              <th style='${thS}'>IFSC</th>
              <th style='${thS}'>Type</th>
              <th style='${thS}text-align:right;'>Amount</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `;
  };

  // Autocomplete UI dropdown helper
  const renderAutocompleteDropdown = (tab, index, key, catVal) => {
    if (!acFocusRow || acFocusRow.tab !== tab || acFocusRow.index !== index || acFocusRow.key !== key) return null;
    if (acFiltered.length === 0) return null;

    return (
      <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {acFiltered.map((item, idx) => (
          <div
            key={idx}
            onMouseDown={() => selectAcOption(tab, index, key, item)}
            className={`px-3 py-2 text-xs font-semibold cursor-pointer truncate text-slate-800 dark:text-slate-200 transition-colors ${
              acActiveIdx === idx
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-450'
                : 'hover:bg-slate-50 dark:hover:bg-slate-850/50'
            }`}
          >
            {item}
          </div>
        ))}
      </div>
    );
  };

  // Keyboard navigation for Autocomplete
  const handleAcKeyDown = (e, tab, index, key) => {
    if (!acFocusRow || acFocusRow.tab !== tab || acFocusRow.index !== index || acFocusRow.key !== key) return;
    const count = acFiltered.length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcActiveIdx(prev => Math.min(prev + 1, count - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcActiveIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      if (acActiveIdx >= 0 && acActiveIdx < count) {
        e.preventDefault();
        selectAcOption(tab, index, key, acFiltered[acActiveIdx]);
      }
    }
  };

  // Scheme columns meta mapping
  const COLS = {
    sip: ["Category", "Scheme Name", "Date of SIP", "Amount (Rs)"],
    specialsip: ["Category", "Scheme Name", "Date of SIP", "Amount (Rs)"],
    sipchanges: ["Category", "Scheme Name", "Date of SIP", "Current SIP (Rs)", "Proposed SIP (Rs)", "Total SIP (Rs)"],
    sipcancel: ["Category", "Scheme Name", "Date of SIP", "SIP Amount (Rs)"],
    sippause: ["Category", "Scheme Name", "Date of SIP", "SIP Amount (Rs)"],
    stpcancel: ["From Category", "From Scheme Name", "To Category", "To Scheme Name", "STP Amount (Rs)"],
    swpcancel: ["Category", "Scheme Name", "Date of SWP", "SWP Amount (Rs)"],
    redemption: ["Category", "Scheme Name", "Amount (Rs)", "Short Term (Rs)", "Long Term (Rs)", "Tax Liability"],
    lumpsum: ["Category", "Scheme Name", "Amount (Rs)"],
    stp: ["From Category", "From Scheme Name", "From Amount (Rs)", "To Category", "To Scheme Name", "To Amount (Rs)"],
    swp: ["Category", "Scheme Name", "Date of SWP", "Amount (Rs)"],
    switch: ["From Category", "From Scheme Name", "To Category", "To Scheme Name", "To Amount (Rs)"]
  };

  const KEYS = {
    sip: ["category", "scheme", "date", "amount"],
    specialsip: ["category", "scheme", "date", "amount"],
    sipchanges: ["category", "scheme", "date", "currentSip", "proposedSip", "totalSip"],
    sipcancel: ["category", "scheme", "date", "amount"],
    sippause: ["category", "scheme", "date", "amount"],
    stpcancel: ["fromCategory", "fromScheme", "toCategory", "toScheme", "amount"],
    swpcancel: ["category", "scheme", "date", "amount"],
    redemption: ["category", "scheme", "amount", "shortTerm", "longTerm", "taxLiability"],
    lumpsum: ["category", "scheme", "amount"],
    stp: ["fromCategory", "fromScheme", "fromAmount", "toCategory", "toScheme", "toAmount"],
    swp: ["category", "scheme", "date", "amount"],
    switch: ["fromCategory", "fromScheme", "toCategory", "toScheme", "toAmount"]
  };

  const CURR = {
    sip: ["amount"],
    specialsip: ["amount"],
    sipchanges: ["currentSip", "proposedSip", "totalSip"],
    sipcancel: ["amount"],
    sippause: ["amount"],
    stpcancel: ["amount"],
    swpcancel: ["amount"],
    redemption: ["amount", "shortTerm", "longTerm"],
    lumpsum: ["amount"],
    stp: ["fromAmount", "toAmount"],
    swp: ["amount"],
    switch: ["toAmount"]
  };

  const HAS_TOTAL = ["sip", "specialsip", "sipchanges", "sipcancel", "sippause", "stpcancel", "swpcancel", "redemption", "lumpsum", "stp", "swp", "switch"];

  const SPLIT_TOTAL = {
    // labelCols + cols.length must equal the total column count (incl. S.No)
    sipchanges: { labelCols: 4, cols: ["currentSip", "proposedSip", "totalSip"] },
    stp: { labelCols: 3, cols: ["fromAmount", "", "", "toAmount"] },
    switch: { labelCols: 5, cols: ["toAmount"] },
    stpcancel: { labelCols: 5, cols: ["amount"] }
  };

  // Get current active tab columns & rows
  const activeCols = COLS[activeTab] || [];
  const activeKeys = KEYS[activeTab] || [];
  const activeRows = sections[activeTab] || [];
  const currList = CURR[activeTab] || [];

  // Per-row computed tax-liability labels for the Redemption table (cascades the exemption)
  const redemptionDisplays = (() => {
    if (activeTab !== 'redemption') return [];
    const rs = getRedemptionState();
    let exemR = rs.exemption;
    return (sections.redemption || []).map((row) => {
      const result = calcRedemptionTax(row, exemR);
      exemR = result.exemptionRemaining;
      const pts = [];
      if (result.isDebt) {
        if (parseNum(row.shortTerm) > 0) pts.push('As Per Tax Slab');
        if (parseNum(row.longTerm) > 0) pts.push('₹ ' + result.ltLabel);
      } else {
        if (parseNum(row.shortTerm) > 0) pts.push(result.stLabel === 'Loss' ? 'Loss' : '₹ ' + result.stLabel);
        if (parseNum(row.longTerm) > 0) pts.push(result.ltLabel === 'Loss' ? 'Loss' : '₹ ' + result.ltLabel);
      }
      return pts.length ? pts.join(' + ') : '—';
    });
  })();

  if (isPreview) {
    return (
      <div className="space-y-6 animate-scale-up">
        <style dangerouslySetInnerHTML={{ __html: INVESTMENT_PRINT_STYLES }} />
        {/* Action Header (hidden on print) */}
        <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-2xl flex items-center justify-between gap-4 no-print shadow-sm">
          <button onClick={() => setIsPreview(false)} className={btnGhost + ' text-slate-600 dark:text-slate-400 py-2 px-4'}>
            <ArrowLeft size={16} /> Edit Form
          </button>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveDocument} disabled={savingDoc} className={btnSecondary + ' py-2 px-4 !text-emerald-700 dark:!text-emerald-400 !border-emerald-200 dark:!border-emerald-900/50 disabled:opacity-60'}>
              <Save size={15} /> {savingDoc ? 'Saving…' : 'Save Document'}
            </button>
            <button onClick={openCreateProspect} className={btnSecondary + ' py-2 px-4'}>
              <Briefcase size={15} /> Create Prospect
            </button>
            <button onClick={() => window.print()} className={btnPrimary + ' py-2 px-5'}>
              <Printer size={15} /> Print / Save PDF
            </button>
          </div>
        </Card>

        {/* Branded preview document */}
        <div className="inv-proposal-doc max-w-4xl mx-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />

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

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100/40 dark:border-blue-900/30">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{isOtherCode ? 'Other Code Setup' : 'Investment Proposal Setup'}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-sans">Set client name and select proposal category components</p>
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
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Client Name</label>
            {applicantOptions.length > 0 ? (
              <CoolSelect
                showValueOnSelect={true}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className={selectCls}
              >
                <option value="">Select client…</option>
                {applicantOptions.map(o => (
                  <option key={o.name} value={o.name}>{o.name} ({o.relation})</option>
                ))}
              </CoolSelect>
            ) : (
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. full name"
                className={inputCls}
              />
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Proposal Components</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {availableTypes.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTypeChip(t.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold select-none cursor-pointer transition-colors ${
                    selTypes.includes(t.id)
                      ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/40 font-bold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Editor Workspace Card */}
      <Card className="p-6 border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-md rounded-[20px] space-y-6">
        {/* Sub-tabs for selected components */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200/40 dark:border-slate-805 rounded-xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {selTypes.map(tId => {
            const label = TYPES.find(p => p.id === tId)?.label || '';
            const active = activeTab === tId;
            return (
              <button
                key={tId}
                type="button"
                onClick={() => setActiveTab(tId)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Dynamic proposal form fields */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-350 uppercase tracking-wider">
              {TYPES.find(p => p.id === activeTab)?.label} Details
            </h4>
            <button onClick={addRow} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
              <Plus size={12} /> Add Row
            </button>
          </div>

          {/* Autocomplete Input Table */}
          <div className="overflow-x-auto border border-slate-200/60 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-950/20 min-h-[250px] pb-12">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80 text-left">
                <tr>
                  <th className="px-4 py-2.5 w-12 text-center">#</th>
                  {activeCols.map((col, ci) => {
                    const isNum = currList.includes(activeKeys[ci]);
                    return (
                      <th key={ci} className={`px-4 py-2.5 ${isNum ? 'text-right' : ''}`} style={getColStyle(activeKeys[ci])}>
                        {col}
                      </th>
                    );
                  })}
                  <th className="px-4 py-2.5 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {activeRows.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                    <td className="px-4 py-2.5 text-center font-bold text-slate-400">{index + 1}</td>
                    
                    {activeKeys.map((key, ki) => {
                      const isCategoryField = key.toLowerCase().includes('category');
                      const isSchemeField = key.toLowerCase().includes('scheme');
                      const isNum = currList.includes(key);

                      if (isCategoryField) {
                        return (
                          <td key={ki} className="px-3 py-2" style={getColStyle(key)}>
                            <select
                              value={row[key] || ''}
                              onChange={(e) => updateRow(activeTab, index, key, e.target.value)}
                              className={inputCls + ' py-1.5 px-2 bg-transparent border-0 focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-blue-500 text-xs'}
                            >
                              <option value="">Select Category...</option>
                              {CATEGORIES.map((cat, cidx) => (
                                <option key={cidx} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (isSchemeField) {
                        const catKeyName = activeTab === 'stp' || activeTab === 'switch'
                          ? (key.startsWith('from') ? 'fromCategory' : 'toCategory')
                          : 'category';
                        const relatedCategoryValue = row[catKeyName];

                        return (
                          <td key={ki} className="px-3 py-2 relative" style={getColStyle(key)}>
                            <input
                              type="text"
                              value={row[key] || ''}
                              onFocus={() => {
                                setAcFocusRow({ tab: activeTab, index, key });
                                const list = getSchemesForCategory(relatedCategoryValue);
                                const q = (row[key] || '').toLowerCase().trim();
                                const filtered = list.filter(item => item.toLowerCase().indexOf(q) >= 0);
                                setAcFiltered(filtered.slice(0, 50));
                                setAcActiveIdx(-1);
                              }}
                              onBlur={() => {
                                setTimeout(() => {
                                  setAcFocusRow(null);
                                }, 180);
                              }}
                              onKeyDown={(e) => handleAcKeyDown(e, activeTab, index, key)}
                              onChange={(e) => handleAcInputChange(activeTab, index, key, e.target.value, relatedCategoryValue)}
                              placeholder="Type to search mutual fund..."
                              className={inputCls + ' py-1.5 px-2 bg-transparent border-0 focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-blue-500 text-xs'}
                            />
                            {renderAutocompleteDropdown(activeTab, index, key, relatedCategoryValue)}
                          </td>
                        );
                      }

                      // Read-only total SIP column
                      if (activeTab === 'sipchanges' && key === 'totalSip') {
                        return (
                          <td key={ki} className="px-4 py-2 text-right tabular-nums font-semibold font-bold text-slate-500 dark:text-slate-400" style={getColStyle(key)}>
                            {fmtINRhtml(String(totalSip(row)))}
                          </td>
                        );
                      }

                      // Read-only computed Tax Liability column for Redemption (from Short/Long Term)
                      if (activeTab === 'redemption' && key === 'taxLiability') {
                        return (
                          <td key={ki} className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300" style={getColStyle(key)}>
                            {redemptionDisplays[index] || '—'}
                          </td>
                        );
                      }

                      return (
                        <td key={ki} className="px-3 py-2" style={getColStyle(key)}>
                          <input
                            type="text"
                            value={row[key] || ''}
                            onChange={(e) => updateRow(activeTab, index, key, isNum ? fmtAmt(e.target.value) : e.target.value)}
                            placeholder={isNum ? 'e.g. 5,000' : (key === 'date' ? 'e.g. 10th' : 'e.g. Remarks')}
                            className={inputCls + ` py-1.5 px-2 bg-transparent border-0 focus:bg-white dark:focus:bg-slate-950 focus:ring-1 focus:ring-blue-500 text-xs ${
                              isNum ? 'text-right tabular-nums font-semibold' : ''
                            }`}
                          />
                        </td>
                      );
                    })}

                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => removeRow(index)}
                        disabled={activeRows.length === 1}
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

          {/* Table Footer Totals (Inline display) */}
          {HAS_TOTAL.includes(activeTab) && activeRows.length > 0 && (
            <div className="flex items-center justify-end gap-6 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/50 dark:border-slate-805 text-xs">
              {activeTab === 'sipchanges' ? (
                <>
                  <div className="font-bold text-slate-500 dark:text-slate-400">Current SIP: <span className="font-mono text-slate-900 dark:text-white">{fmtINRhtml(String(calcTotal(activeTab, 'currentSip')))}</span></div>
                  <div className="font-bold text-slate-500 dark:text-slate-400">Proposed SIP: <span className="font-mono text-slate-900 dark:text-white">{fmtINRhtml(String(calcTotal(activeTab, 'proposedSip')))}</span></div>
                  <div className="font-bold text-blue-600 dark:text-blue-450 border-l border-slate-200 dark:border-slate-800 pl-4">Total SIP: <span className="font-mono text-blue-700 dark:text-blue-400 font-extrabold">{fmtINRhtml(String(calcTotal(activeTab, 'totalSip')))}</span></div>
                </>
              ) : activeTab === 'stp' ? (
                <>
                  <div className="font-bold text-slate-500 dark:text-slate-400">From Total: <span className="font-mono text-slate-900 dark:text-white">{fmtINRhtml(String(calcTotal(activeTab, 'fromAmount')))}</span></div>
                  <div className="font-bold text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800 pl-4">To Total: <span className="font-mono text-slate-900 dark:text-white">{fmtINRhtml(String(calcTotal(activeTab, 'toAmount')))}</span></div>
                </>
              ) : activeTab === 'switch' ? (
                <div className="font-bold text-slate-950 dark:text-white">Total Switch Value: <span className="font-mono text-blue-600 dark:text-blue-400 font-extrabold">{fmtINRhtml(String(calcTotal(activeTab, 'toAmount')))}</span></div>
              ) : (
                <div className="font-bold text-slate-950 dark:text-white">Total Amount: <span className="font-mono text-blue-600 dark:text-blue-400 font-extrabold">{fmtINRhtml(String(calcTotal(activeTab, currList[0])))}</span></div>
              )}
            </div>
          )}
        </div>

        {/* SWP and Redemption Accompanying Banks Form */}
        {(activeTab === 'swp' || activeTab === 'redemption') && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Accompanying Bank Accounts</h4>
                <p className="text-[10px] text-slate-400 mt-1">Specify destination bank logs for redemption/SWP credits</p>
              </div>
              <button onClick={() => addBankAccount(activeTab)} className={btnSecondary + ' py-1.5 px-3 text-xs'}>
                <Plus size={12} /> Add Bank
              </button>
            </div>

            <div className="overflow-hidden border border-slate-200/60 dark:border-slate-800/80 rounded-xl bg-white dark:bg-slate-950/20">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200/50 dark:border-slate-800/80 text-left">
                  <tr>
                    <th className="px-4 py-2.5 w-12 text-center">#</th>
                    <th className="px-4 py-2.5">Bank Name</th>
                    <th className="px-4 py-2.5">Account Number</th>
                    <th className="px-4 py-2.5 w-36">IFSC Code</th>
                    <th className="px-4 py-2.5 w-32">Account Type</th>
                    <th className="px-4 py-2.5 w-36 text-right">Amount (Rs)</th>
                    <th className="px-4 py-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  {(bankDetails[activeTab] || []).map((bank, bidx) => (
                    <tr key={bidx} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                      <td className="px-4 py-2 text-center font-bold text-slate-400">{bidx + 1}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={bank.bankName}
                          onChange={(e) => updateBankAccount(activeTab, bidx, 'bankName', e.target.value)}
                          placeholder="e.g. HDFC Bank"
                          className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 text-xs'}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={bank.accNo}
                          onChange={(e) => updateBankAccount(activeTab, bidx, 'accNo', e.target.value)}
                          placeholder="e.g. 50100234..."
                          className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 text-xs font-mono'}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={bank.ifsc}
                          onChange={(e) => updateBankAccount(activeTab, bidx, 'ifsc', e.target.value)}
                          placeholder="e.g. HDFC0000012"
                          className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 text-xs font-mono uppercase'}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={bank.accType}
                          onChange={(e) => updateBankAccount(activeTab, bidx, 'accType', e.target.value)}
                          className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 text-xs'}
                        >
                          <option value="Savings">Savings</option>
                          <option value="Current">Current</option>
                          <option value="NRE">NRE</option>
                          <option value="NRO">NRO</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={bank.amount}
                          onChange={(e) => updateBankAccount(activeTab, bidx, 'amount', fmtAmt(e.target.value))}
                          placeholder="e.g. 10,000"
                          className={inputCls + ' py-1.5 px-2 border-0 bg-transparent focus:bg-white dark:focus:bg-slate-950 text-xs text-right tabular-nums font-semibold'}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => removeBankAccount(activeTab, bidx)}
                          disabled={bankDetails[activeTab].length === 1}
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
        )}

        {/* Redemption Extras (Taxes and Exemptions) */}
        {activeTab === 'redemption' && (
          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-805">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Redemption Taxation Override</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-4">
                <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-350 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={redemptionIncludeExemption}
                    onChange={(e) => setRedemptionIncludeExemption(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-750"
                  />
                  Include ₹1.25 Lakh Equity Exemption?
                </label>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Booked Capital Gain in FY (Rs)</label>
                  <input
                    type="text"
                    value={redemptionBookedGain}
                    onChange={(e) => setRedemptionBookedGain(fmtAmt(e.target.value))}
                    placeholder="e.g. 45,000"
                    className={inputCls + ' max-w-[200px]'}
                  />
                </div>
              </div>

              {/* Taxation summary card */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated Tax Summary</div>
                
                {(() => {
                  const taxes = calcAllRedemptionTaxes();
                  return (
                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-450 font-sans">
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                        <span>Equity Tax Liability:</span>
                        <span>₹ {Math.round(taxes.equityTax).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>- Short Term (20%):</span>
                        <span>₹ {Math.round(taxes.equitySTTax).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>- Long Term (12.5%):</span>
                        <span>₹ {Math.round(taxes.equityLTTax).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>Debt Tax Liability:</span>
                        <span>₹ {Math.round(taxes.debtLTTax).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>- Short Term:</span>
                        <span>{taxes.hasDebtST ? 'As Per Tax Slab' : '₹ 0'}</span>
                      </div>
                      <div className="flex justify-between pl-3 text-[11px]">
                        <span>- Long Term (12.5%):</span>
                        <span>₹ {Math.round(taxes.debtLTTax).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Tips / Notes */}
        {activeTab === 'sipchanges' && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-bold">Tip:</span> For <em>Proposed SIP</em>, enter a negative value (e.g. -5,000) to reduce. <em>Total SIP</em> is auto-calculated.
            </div>
          </div>
        )}
        {activeTab === 'sippause' && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-bold">Note:</span> This SIP will be automatically resumed after 2 months.
            </div>
          </div>
        )}

        {/* Remarks Input */}
        <div className="space-y-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Remarks for {TYPES.find(p => p.id === activeTab)?.label}</label>
          <textarea
            value={remarks[activeTab] || ''}
            onChange={(e) => setRemarks(prev => ({ ...prev, [activeTab]: e.target.value }))}
            rows={3}
            placeholder="Add comments or guidelines..."
            className={inputCls}
          />
        </div>

        {/* Proposal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={generatePreview} className={btnPrimary}>
            Generate Proposal <ChevronRight size={14} className="inline ml-1" />
          </button>
        </div>
      </Card>
    </div>
  );
}

const INVESTMENT_PRINT_STYLES = `
  .inv-proposal-doc {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 12px 48px rgba(13,42,94,0.12);
    overflow: hidden;
    color: #1e3a5f;
  }
  .inv-proposal-doc .inv-page { padding: 28px 36px; }
  .inv-proposal-doc .inv-page + .inv-page { border-top: 1px solid #e2e8f0; }

  @media print {
    @page { size: A4; margin: 0; }
    html, body { height: auto !important; margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
    
    /* Neutralize constraints on all parent containers of the proposal to let it take full width and flow correctly */
    html:has(.inv-proposal-doc),
    body:has(.inv-proposal-doc),
    div:has(.inv-proposal-doc),
    main:has(.inv-proposal-doc) {
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
       flow so its pages paginate correctly) */
    body * { visibility: hidden !important; }
    .inv-proposal-doc, .inv-proposal-doc * { visibility: visible !important; }
    .inv-proposal-doc {
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
    }
    .inv-proposal-doc .inv-page {
      padding: 40px 48px 80px !important;
      min-height: 297mm !important;
      box-sizing: border-box !important;
      position: relative !important;
      page-break-after: always;
      break-inside: avoid-page;
    }
    .inv-proposal-doc .inv-page:last-child { page-break-after: avoid; }
    .inv-proposal-doc .inv-page-footer {
      position: absolute !important;
      bottom: 40px !important;
      left: 48px !important;
      right: 48px !important;
      margin-top: 0 !important;
    }
  }
`;

