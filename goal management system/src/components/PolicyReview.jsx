import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Printer, AlertCircle, CheckCircle2, Save
} from 'lucide-react';
import { CoolSelect } from './UI';
import { saveGeneratedDocument, wrapStandaloneHtml, snapshotElementHtml } from '../utils/documents';

const CHART_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxR_YWt7vbldI57ZxqX3WrnvZrp0gTLWPa8Fqo-YmMjRvo760WT_gd62njXd3q9e7n0/exec';

// Currency / percent helpers
const inr = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const s = abs.toString();
  if (s.length <= 3) return sign + '₹' + s;
  const last3 = s.slice(-3);
  const rest  = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return sign + '₹' + rest + ',' + last3;
};

const pct = (n, d = 2) => {
  if (n === null || isNaN(n)) return '—';
  return n.toFixed(d) + '%';
};

const irrPill = (v) => {
  if (isNaN(v) || v === null) return <span className="irr-pill pill-gold">—</span>;
  if (v >= 8)  return <span className="irr-pill pill-green">{pct(v)}</span>;
  if (v >= 5)  return <span className="irr-pill pill-amber">{pct(v)}</span>;
  return <span className="irr-pill pill-red">{pct(v)}</span>;
};

// XIRR Newton-Raphson + Bisection implementation
const xirr = (cfs, times) => {
  function npvAt(r) {
    let v = 0;
    for (let i = 0; i < cfs.length; i++) v += cfs[i] / Math.pow(1 + r, times[i]);
    return v;
  }
  const scale = cfs.reduce((s, c) => s + Math.abs(c), 0) || 1;

  // Newton-Raphson first
  let r = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0, dnpv = 0;
    for (let i = 0; i < cfs.length; i++) {
      const t = times[i];
      const f = Math.pow(1 + r, t);
      npv  += cfs[i] / f;
      dnpv -= t * cfs[i] / (f * (1 + r));
    }
    if (Math.abs(dnpv) < 1e-14) break;
    const nr = r - npv / dnpv;
    if (!isFinite(nr) || nr <= -1 || nr > 20) break;
    if (Math.abs(nr - r) < 1e-9) {
      if (Math.abs(npvAt(nr)) < 1e-6 * scale) return nr;
      break;
    }
    r = nr;
  }

  // Bisection fallback
  let lo = -0.999999, hi = 20;
  let fLo = npvAt(lo), fHi = npvAt(hi);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return NaN;
  for (let iter = 0; iter < 200; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-6 * scale || (hi - lo) < 1e-9) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
};

const sipFV = (pmt, rate, n) => {
  const r = rate / 100;
  if (n <= 0) return 0;
  if (r === 0) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
};

const lumpFV = (pv, rate, n) => {
  return pv * Math.pow(1 + rate / 100, n);
};

export default function PolicyReview({ client, onBack }) {
  const [chartJsLoaded, setChartJsLoaded] = useState(false);
  const chartInstsRef = useRef({});

  // Dynamic script loader for Chart.js
  useEffect(() => {
    const loadChartJs = async () => {
      if (window.Chart) {
        setChartJsLoaded(true);
        return;
      }
      try {
        const existingScript = document.querySelector(`script[src="${CHART_JS_URL}"]`);
        if (existingScript) {
          setChartJsLoaded(true);
          return;
        }
        const script = document.createElement('script');
        script.src = CHART_JS_URL;
        script.onload = () => setChartJsLoaded(true);
        script.onerror = () => console.error('Failed to load Chart.js');
        document.head.appendChild(script);
      } catch (err) {
        console.error('Error loading Chart.js:', err);
      }
    };
    loadChartJs();

    return () => {
      // Clean up charts
      Object.keys(chartInstsRef.current).forEach(id => {
        if (chartInstsRef.current[id]) {
          chartInstsRef.current[id].destroy();
        }
      });
    };
  }, []);

  // Top level inputs state
  const [clientName, setClientName] = useState('');
  const [clientPan, setClientPan] = useState('');
  const [groupLeader, setGroupLeader] = useState('');
  const [mfReturn, setMfReturn] = useState('12');
  const [ltcg, setLtcg] = useState('12.5');

  const ltcgRate = parseFloat(ltcg) || 12.5;

  // Sync details from selected client prop
  useEffect(() => {
    if (client) {
      setClientName(client.name || '');
      setClientPan(client.pan || '');
      setGroupLeader(client.clientDetails?.relationshipManager || '');
    }
  }, [client]);

  // List of active policies
  const [policies, setPolicies] = useState([]);
  const [policyCounter, setPolicyCounter] = useState(0);

  const getInitialPolicy = (id) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    const startDateStr = d.toISOString().split('T')[0];
    
    const dMaturity = new Date(startDateStr);
    dMaturity.setFullYear(dMaturity.getFullYear() + 20);
    const maturityDateStr = dMaturity.toISOString().split('T')[0];

    return {
      id,
      policyName: '',
      policyNo: '',
      policyCategory: 'traditional',
      policySubtype: 'endowment',
      sumAssured: '',
      premiumFrequency: '1',
      installmentPremium: '',
      annualPremium: '',
      policyTerm: '20',
      premiumTerm: '15',
      startDate: startDateStr,
      maturityDate: maturityDateStr,
      premiumsPaid: '5',
      totalPremiumPaid: '',
      totalPremiumPaidManual: false,
      t_revBonusRate: '45',
      t_termBonusRate: '0',
      t_gsvPct: '30',
      t_svFactor: '0.30',
      u_minPayTerm: '5',
      u_fundValue: '',
      u_nav: '',
      u_units: '',
      u_surrenderCharge: '4',
      u_paidup: '',
      u_mortality: '0.5',
      u_pac: '5',
      u_fmc: '1.35',
      u_pac2: '0.1',
      fvMode: 'manual', // manual | nav
    };
  };

  // Add first policy block on initialization
  useEffect(() => {
    if (policies.length === 0) {
      const nextId = policyCounter + 1;
      setPolicies([getInitialPolicy(nextId)]);
      setPolicyCounter(nextId);
    }
  }, []);

  const addNewPolicy = () => {
    const nextId = policyCounter + 1;
    setPolicies(prev => [...prev, getInitialPolicy(nextId)]);
    setPolicyCounter(nextId);
  };

  const removePolicy = (id) => {
    if (policies.length <= 1) {
      alert('⚠️ You must have at least one policy.');
      return;
    }
    setPolicies(prev => prev.filter(p => p.id !== id));
  };

  const updatePolicyField = (policyId, field, value) => {
    setPolicies(prevPolicies =>
      prevPolicies.map(p => {
        if (p.id !== policyId) return p;
        let updated = { ...p, [field]: value };

        if (field === 'policyCategory') {
          updated.fvMode = 'manual';
        }

        // recalculate annual premium if installment premium or frequency changes
        if (field === 'installmentPremium' || field === 'premiumFrequency') {
          const inst = parseFloat(updated.installmentPremium) || 0;
          const freq = parseFloat(updated.premiumFrequency) || 1;
          updated.annualPremium = inst ? (inst * freq).toString() : '';
          
          if (!updated.totalPremiumPaidManual) {
            const annual = inst * freq;
            const paid = parseFloat(updated.premiumsPaid) || 0;
            updated.totalPremiumPaid = annual ? (annual * paid).toString() : '';
          }
        }

        // recalculate total premium paid if premiums paid changes
        if (field === 'premiumsPaid') {
          if (!updated.totalPremiumPaidManual) {
            const annual = parseFloat(updated.annualPremium) || 0;
            const paid = parseFloat(value) || 0;
            updated.totalPremiumPaid = annual ? (annual * paid).toString() : '';
          }
        }

        // track if total premium paid is edited manually
        if (field === 'totalPremiumPaid') {
          updated.totalPremiumPaidManual = !!value;
        }

        // dates: start date + term -> maturity date
        if (field === 'startDate' || field === 'policyTerm') {
          const startVal = updated.startDate;
          const term = parseFloat(updated.policyTerm) || 0;
          if (startVal && term) {
            const start = new Date(startVal);
            start.setFullYear(start.getFullYear() + term);
            updated.maturityDate = start.toISOString().split('T')[0];
          }
        }

        // dates: maturity date -> back-calculate policy term
        if (field === 'maturityDate') {
          const startVal = updated.startDate;
          const maturityVal = value;
          if (startVal && maturityVal) {
            const start = new Date(startVal);
            const maturity = new Date(maturityVal);
            const diffMs = maturity - start;
            const diffYrs = diffMs / (1000 * 60 * 60 * 24 * 365.25);
            const rounded = Math.round(diffYrs * 10) / 10;
            if (rounded > 0) {
              updated.policyTerm = Math.round(rounded).toString();
            }
          }
        }

        // nav x units auto calc
        if (field === 'u_nav' || field === 'u_units') {
          const nav = parseFloat(updated.u_nav) || 0;
          const units = parseFloat(updated.u_units) || 0;
          if (nav && units) {
            updated.u_fundValue = (nav * units).toFixed(2);
          }
        }

        return updated;
      })
    );
  };

  // State to hold compiled analysis results
  const [results, setResults] = useState(null);
  const [syncStatus, setSyncStatus] = useState(''); // syncing | done | error

  // Google Sheet Auto-Save
  const saveToGoogleSheet = (policyId, resultsObj, singleResult) => {
    if (!GOOGLE_SHEET_URL) return;

    const gv = (f) => (singleResult[f] !== undefined ? singleResult[f] : '');
    const inrVal = (n) => inr(n);

    const params = new URLSearchParams({
      c1:  clientName,
      c2:  gv('policyName') || `Policy #${policyId}`,
      c3:  gv('policyNo'),
      c4:  gv('policyCategory'),
      c5:  gv('policySubtype'),
      c6:  gv('sumAssured'),
      c7:  gv('annualPremium'),
      c8:  gv('policyTerm'),
      c9:  gv('premiumTerm'),
      c10: gv('startDate'),
      c11: gv('maturityDate'),
      c12: gv('premiumsPaid'),
      c13: gv('totalPremiumPaid'),
      c14: inrVal(gv('continueVal')),
      c15: inrVal(gv('paidUpVal')),
      c16: inrVal(gv('surrenderVal')),
      c17: inrVal(gv('mfFinalVal')),
      c18: pct(gv('continueIRR')),
      c19: pct(gv('surrenderIRR')),
      c20: mfReturn,
      c21: inrVal(gv('wealthGain')),
      c22: gv('recTitle')
    });

    setSyncStatus('syncing');
    const img = new Image();
    img.src = GOOGLE_SHEET_URL + '?' + params.toString();
    img.onload = () => setSyncStatus('done');
    img.onerror = () => setSyncStatus('error');
  };

  // Perform Newton-Raphson XIRR & Comparison Calculations
  const handleAnalyze = () => {
    let hasErrors = false;
    
    // Validate inputs
    for (const p of policies) {
      if (!p.sumAssured || !p.annualPremium || !p.policyTerm || !p.premiumTerm || !p.premiumsPaid || !p.startDate || !p.maturityDate) {
        alert(`⚠️ Please fill in all required policy details for Policy #${p.id}:\nSum Assured, Premium, Policy Term, Premium Paying Term, Years Paid, Start Date, and Maturity Date.`);
        hasErrors = true;
        break;
      }
    }
    if (hasErrors) return;

    const expectedReturn = parseFloat(mfReturn) || 12;
    const ltcgRate = parseFloat(ltcg) || 12.5;

    const computedResults = policies.map(p => {
      const isUlip = p.policyCategory === 'ulip';
      const sa = parseFloat(p.sumAssured) || 0;
      const ap = parseFloat(p.annualPremium) || 0;
      const pt = parseFloat(p.policyTerm) || 0;
      const pmt = parseFloat(p.premiumTerm) || 0;
      const paid = parseFloat(p.premiumsPaid) || 0;
      const tpp = parseFloat(p.totalPremiumPaid) || (ap * paid);

      const yearsLeft = pt - paid;
      const futurePremYears = Math.max(0, pmt - paid);

      let continueMaturity = 0;
      let paidUpMaturity = 0;
      let paidUpSA = 0;
      let surrenderValue = 0;

      // Charge bar values for ULIPs
      let chargesDragTotal = 0;
      let netReturnUlip = 0;
      let ulipCharges = [];

      if (!isUlip) {
        const revBonusRate = parseFloat(p.t_revBonusRate) || 0;
        const termBonusRate = parseFloat(p.t_termBonusRate) || 0;
        const gsvPct = parseFloat(p.t_gsvPct) || 0;
        const ssvFactor = parseFloat(p.t_svFactor) || 0;

        const revBonusPerYr = (sa / 1000) * revBonusRate;
        const revBonusTotal = revBonusPerYr * pt;
        const termBonus = (sa / 1000) * termBonusRate;

        continueMaturity = sa + revBonusTotal + termBonus;

        const pvBaseA = (ap * paid) + (revBonusPerYr * paid);
        paidUpSA = pvBaseA * Math.pow(1.0275, yearsLeft);
        paidUpMaturity = paidUpSA;

        const gsv = tpp * (gsvPct / 100);
        const accruedBonus = revBonusPerYr * paid;
        const partA = accruedBonus * (gsvPct / 100);
        const eligiblePrem = ap * Math.max(0, paid - 1);
        const partB = eligiblePrem * ssvFactor;
        const ssvCalc = partA + partB;

        surrenderValue = Math.max(gsv, ssvCalc);
      } else {
        const fundValue = parseFloat(p.u_fundValue) || 0;
        const surChargePct = parseFloat(p.u_surrenderCharge) || 0;
        const paidUpFV = parseFloat(p.u_paidup) || fundValue;
        const mortalityPct = parseFloat(p.u_mortality) || 0;
        const pacPct = parseFloat(p.u_pac) || 0;
        const fmcPct = parseFloat(p.u_fmc) || 0;
        const adminPct = parseFloat(p.u_pac2) || 0;

        chargesDragTotal = mortalityPct + fmcPct + adminPct;
        const effectivePremAlloc = 1 - (pacPct / 100);
        const ulipNetRate = Math.max(0, expectedReturn - chargesDragTotal);

        surrenderValue = fundValue * (1 - (surChargePct / 100));
        continueMaturity = lumpFV(fundValue, ulipNetRate, yearsLeft)
                        + sipFV(ap * effectivePremAlloc, ulipNetRate, futurePremYears);

        paidUpSA = paidUpFV;
        paidUpMaturity = lumpFV(paidUpFV, ulipNetRate, yearsLeft);

        ulipCharges = [
          { name: 'Premium Allocation', val: pacPct },
          { name: 'Fund Management (FMC)', val: fmcPct },
          { name: 'Mortality Charges', val: mortalityPct },
          { name: 'Policy Admin Charges', val: adminPct }
        ];
        netReturnUlip = expectedReturn - chargesDragTotal;
      }

      // Mutual fund projection
      const mfLump = lumpFV(surrenderValue, expectedReturn, yearsLeft);
      const mfSIPatEnd = sipFV(ap, expectedReturn, futurePremYears);
      const sipExtraYears = yearsLeft - futurePremYears;
      const mfSIP = sipExtraYears > 0 ? lumpFV(mfSIPatEnd, expectedReturn, sipExtraYears) : mfSIPatEnd;
      
      const mfGross = mfLump + mfSIP;
      const mfCostBasis = surrenderValue + (ap * futurePremYears);
      const mfGain = Math.max(0, mfGross - mfCostBasis);
      const mfTax = mfGain * (ltcgRate / 100);
      const mfFinal = mfGross - mfTax;

      // IRR calculations
      let continueIRR = NaN;
      let paidUpIRR = NaN;
      let surrenderIRR = NaN;

      // cfs arrays
      {
        const cfs = [];
        const ts = [];
        for (let y = 0; y < pmt; y++) { cfs.push(-ap); ts.push(y); }
        cfs.push(continueMaturity); ts.push(pt);
        continueIRR = xirr(cfs, ts) * 100;
      }
      {
        const cfs = [];
        const ts = [];
        for (let y = 0; y < paid; y++) { cfs.push(-ap); ts.push(y); }
        cfs.push(paidUpMaturity); ts.push(pt);
        paidUpIRR = xirr(cfs, ts) * 100;
      }
      {
        const cfs = [];
        const ts = [];
        for (let y = 0; y < paid; y++) { cfs.push(-ap); ts.push(y); }
        cfs.push(surrenderValue); ts.push(paid);
        surrenderIRR = xirr(cfs, ts) * 100;
      }

      // Growth datasets
      const wealthGain = mfFinal - continueMaturity;
      const maxYearsLeft = Math.max(yearsLeft, 1);
      const chartLabels = [];
      const cPolicyData = [];
      const cPaidUpData = [];
      const cMFData = [];
      const r = expectedReturn / 100;

      for (let y = 0; y <= maxYearsLeft; y++) {
        chartLabels.push(`+${y}yr`);

        let totalContVal = 0;
        let totalPuVal = 0;
        let totalMfVal = 0;

        if (y <= yearsLeft) {
          totalContVal = surrenderValue + (continueMaturity - surrenderValue) * (y / maxYearsLeft);
          totalPuVal = surrenderValue + (paidUpMaturity - surrenderValue) * (y / maxYearsLeft);
          
          const lump = surrenderValue * Math.pow(1 + r, y);
          let sip = 0;
          if (y > 0 && futurePremYears > 0) {
            const sipContribYears = Math.min(y, futurePremYears);
            const sipAtEnd = ap * ((Math.pow(1 + r, sipContribYears) - 1) / r) * (1 + r);
            const extraYears = y - sipContribYears;
            sip = sipAtEnd * Math.pow(1 + r, extraYears);
          }
          const gross = lump + sip;
          if (y === yearsLeft) {
            const gain = Math.max(0, gross - mfCostBasis);
            const tax = gain * (ltcgRate / 100);
            totalMfVal = gross - tax;
          } else {
            totalMfVal = gross;
          }
        } else {
          totalContVal = continueMaturity * Math.pow(1 + r, y - yearsLeft);
          totalPuVal = paidUpMaturity * Math.pow(1 + r, y - yearsLeft);
          totalMfVal = mfFinal * Math.pow(1 + r, y - yearsLeft);
        }

        cPolicyData.push(Math.round(totalContVal));
        cPaidUpData.push(Math.round(totalPuVal));
        cMFData.push(Math.round(totalMfVal));
      }

      // Scenarios decision sorting
      const scenarios = [
        { name: 'Continue Policy', value: continueMaturity, type: 'continue', emoji: '📜', color: '#3b82f6' },
        { name: 'Go Paid-up', value: paidUpMaturity, type: 'paidup', emoji: '🔒', color: '#d97706' },
        { name: 'Mutual Fund is Better', value: mfFinal, type: 'mf', emoji: '📈', color: '#16a34a' }
      ];
      scenarios.sort((a, b) => b.value - a.value);
      const winner = scenarios[0];
      const runnerUp = scenarios[1];
      const diff = winner.value - runnerUp.value;

      // Recommended details
      let recType = 'review';
      let recEmoji = '💡';
      let recTitle = 'Under Review';
      let recBody = '';
      let actionSteps = [];

      if (winner.type === 'mf') {
        recType = 'mfbetter';
        recEmoji = '📈';
        recTitle = 'Mutual Fund is the Recommended Path';
        recBody = `Mutual Fund strategy gives the highest wealth accumulation of ${inr(mfFinal)}, which is ${inr(diff)} more than the next best option (${runnerUp.name}: ${inr(runnerUp.value)}). Surrendering your policy and migrating to diversified mutual funds is recommended.`;
        actionSteps = [
          `🏦 Procure exact surrender value quote for this policy from insurer`,
          `📊 Reinvest surrender value (${inr(surrenderValue)}) as a lump sum in mutual funds`,
          `📈 Channel saved premium of ${inr(ap)} per year into equity SIPs`,
          `🛡️ Purchase a low-cost pure term insurance plan to replace life cover`
        ];
      } else if (winner.type === 'paidup') {
        recType = 'paidup';
        recEmoji = '⏸️';
        recTitle = 'Go Paid-up — Highly Recommended';
        recBody = `Making the policy paid-up gives the highest maturity value of ${inr(paidUpMaturity)}, which is ${inr(diff)} more than the next best option (${runnerUp.name}: ${inr(runnerUp.value)}). This halts ongoing premium outflows while letting the accrued corpus compound.`;
        actionSteps = [
          `📝 Submit Paid-up application for this policy to the insurer`,
          `📈 Redirect saved premium of ${inr(ap)} per year into equity mutual fund SIPs`,
          `🛡️ Verify if existing life cover from other sources is sufficient`
        ];
      } else {
        recType = 'continue';
        recEmoji = '✅';
        recTitle = 'Continue Policy';
        recBody = `Continuing your existing policy gives the highest maturity value of ${inr(continueMaturity)}, which is ${inr(diff)} more than the next best option (${runnerUp.name}: ${inr(runnerUp.value)}). Your policy's return is solid relative to alternative options.`;
        actionSteps = [
          `📅 Set reminders for premium payment schedule`,
          `📄 Ensure all nomination details are updated and correct`,
          `📈 Keep mutual fund investments running separately for wealth growth`
        ];
      }

      const singleResult = {
        policyId: p.id,
        policyName: p.policyName,
        policyNo: p.policyNo,
        policyCategory: p.policyCategory,
        policySubtype: p.policySubtype,
        sumAssured: sa,
        annualPremium: ap,
        policyTerm: pt,
        premiumTerm: pmt,
        startDate: p.startDate,
        maturityDate: p.maturityDate,
        premiumsPaid: paid,
        totalPremiumPaid: tpp,
        yearsLeft: maxYearsLeft,
        continueVal: continueMaturity,
        paidUpVal: paidUpMaturity,
        surrenderVal: surrenderValue,
        mfFinalVal: mfFinal,
        continueIRR,
        paidUpIRR,
        surrenderIRR,
        wealthGain,
        winner,
        diff,
        recType,
        recEmoji,
        recTitle,
        recBody,
        actionSteps,
        chartLabels,
        cPolicyData,
        cPaidUpData,
        cMFData,
        isUlip,
        chargesDragTotal,
        netReturnUlip,
        ulipCharges
      };

      // Call sheet auto-save
      setTimeout(() => {
        saveToGoogleSheet(p.id, computedResults, singleResult);
      }, 500);

      return singleResult;
    });

    setResults(computedResults);
  };

  // Rebuild charts via Chart.js dynamically when results state is set
  useEffect(() => {
    if (!results || !chartJsLoaded || !window.Chart) return;

    results.forEach(res => {
      const canvasId = `growthChart-${res.policyId}`;
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      if (chartInstsRef.current[res.policyId]) {
        chartInstsRef.current[res.policyId].destroy();
      }

      const ctx = canvas.getContext('2d');
      chartInstsRef.current[res.policyId] = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: res.chartLabels,
          datasets: [
            {
              label: 'Continue Policy',
              data: res.cPolicyData,
              borderColor: '#60a5fa',
              backgroundColor: 'rgba(96,165,250,0.07)',
              borderWidth: 2.5,
              pointRadius: 2,
              fill: false,
              tension: 0.3
            },
            {
              label: 'Paid-up Policy',
              data: res.cPaidUpData,
              borderColor: '#fbbf24',
              backgroundColor: 'rgba(251,191,36,0.05)',
              borderWidth: 2,
              pointRadius: 2,
              borderDash: [6, 3],
              fill: false,
              tension: 0.3
            },
            {
              label: 'Mutual Funds (post-tax)',
              data: res.cMFData,
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74,222,128,0.07)',
              borderWidth: 2.5,
              pointRadius: 2,
              fill: false,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: {
                font: { family: 'IBM Plex Sans', size: 11 },
                color: '#475569',
                boxWidth: 12,
                padding: 16,
                usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: 'rgba(255,255,255,0.97)',
              borderColor: 'rgba(37,99,235,0.2)',
              borderWidth: 1,
              titleColor: '#1e293b',
              bodyColor: '#475569',
              padding: 12,
              callbacks: {
                label: (ctxVal) => `  ${ctxVal.dataset.label}: ${inr(ctxVal.raw)}`
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { font: { family: 'IBM Plex Mono', size: 10 }, color: '#94a3b8', maxRotation: 0 }
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: {
                font: { family: 'IBM Plex Mono', size: 10 },
                color: '#94a3b8',
                callback: (v) => v >= 10000000 ? '₹' + v / 10000000 + 'Cr'
                             : v >= 100000  ? '₹' + v / 100000 + 'L'
                             : v >= 1000    ? '₹' + v / 1000 + 'K'
                             : '₹' + v
              }
            }
          }
        }
      });
    });

  }, [results, chartJsLoaded]);

  // Reset inputs
  const handleReset = () => {
    setPolicies([getInitialPolicy(1)]);
    setPolicyCounter(1);
    setMfReturn('12');
    setLtcg('12.5');
    setResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Browser Print handler
  const handlePrint = () => {
    if (!results || results.length === 0) {
      alert('Please analyze a policy first, then export.');
      return;
    }

    const originalTitle = document.title;
    document.title = `Policy Review_${clientName || 'Client'}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 500);
  };

  // Save the rendered Policy Review as a document in the client's Documents.
  const resultsRef = useRef(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docMsg, setDocMsg] = useState('');
  const handleSaveDocument = async () => {
    if (!results || results.length === 0) {
      alert('Please analyze a policy first, then save.');
      return;
    }
    if (!client?.id) {
      setDocMsg('⚠️ Not linked to a saved client — cannot save.');
      setTimeout(() => setDocMsg(''), 4000);
      return;
    }
    if (!resultsRef.current) return;
    setSavingDoc(true);
    try {
      const inner = snapshotElementHtml(resultsRef.current);
      const html = wrapStandaloneHtml(
        `<div class="policy-review-container">${inner}</div>`,
        `Policy Review — ${clientName || client.name}`,
        POLICY_REVIEW_STYLES
      );
      const name = await saveGeneratedDocument(client, {
        kind: 'policy',
        label: 'Policy Review Report',
        html,
      });
      setDocMsg(`✅ Saved to Documents as ${name}`);
    } catch (err) {
      setDocMsg(`⚠️ ${err.message || 'Could not save document.'}`);
    } finally {
      setSavingDoc(false);
      setTimeout(() => setDocMsg(''), 4000);
    }
  };

  return (
    <div className="policy-review-container">
      {/* Dynamic Style tags to contain the premium look CSS from policy tool, scoped to our container */}
      <style>{POLICY_REVIEW_STYLES}</style>

      {docMsg && (
        <div className="no-print" style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 50, padding: '12px 20px', borderRadius: '12px', background: '#059669', color: '#fff', fontSize: '14px', fontWeight: 600, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
          {docMsg}
        </div>
      )}

      {/* Main App Block */}
      <div className="app no-print">
        {/* Action buttons */}
        <div className="page-hero" style={{ justifyContent: 'flex-end' }}>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={handleReset} type="button">🔄 Reset Form</button>
            {results && <button className="btn btn-outline" onClick={handleSaveDocument} type="button" disabled={savingDoc}>{savingDoc ? '💾 Saving…' : '💾 Save Document'}</button>}
            {results && <button className="btn btn-gold" onClick={handlePrint} type="button">🖨️ Export PDF / Print</button>}
          </div>
        </div>

        {/* Client Metadata and Global assumptions */}
        <div className="grid-2" style={{ marginBottom: '24px' }}>
          {/* Card 1: Client Info */}
          <div className="card">
            <div className="card-head">
              <div className="cicon ci-blue">👤</div>
              <div>
                <div className="ctitle">Client Information</div>
                <div className="csub">Primary details of the policy holder</div>
              </div>
            </div>
            <div className="card-body">
              <div className="fg fg-3">
                <div className="field">
                  <label>Client Name</label>
                  <input 
                    type="text" 
                    value={clientName} 
                    onChange={e => setClientName(e.target.value)} 
                    placeholder="Enter Client Name" 
                  />
                </div>
                <div className="field">
                  <label>PAN Number</label>
                  <input 
                    type="text" 
                    value={clientPan} 
                    onChange={e => setClientPan(e.target.value.toUpperCase())} 
                    placeholder="ABCDE1234F" 
                  />
                </div>
                <div className="field">
                  <label>Group Leader / RM</label>
                  <input 
                    type="text" 
                    value={groupLeader} 
                    onChange={e => setGroupLeader(e.target.value)} 
                    placeholder="Enter Manager Name" 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: MF Assumptions */}
          <div className="card">
            <div className="card-head">
              <div className="cicon ci-green">📈</div>
              <div>
                <div className="ctitle">Mutual Fund Assumptions</div>
                <div className="csub">Comparison parameters for direct investment</div>
              </div>
            </div>
            <div className="card-body">
              <div className="fg fg-2">
                <div className="field">
                  <label>Expected MF CAGR (%)</label>
                  <div className="inp-wrap has-suffix">
                    <input 
                      type="number" 
                      value={mfReturn} 
                      onChange={e => setMfReturn(e.target.value)} 
                      placeholder="12" 
                    />
                    <span className="inp-suffix">%</span>
                  </div>
                </div>
                <div className="field">
                  <label>Equity LTCG Tax Rate (%)</label>
                  <div className="inp-wrap has-suffix">
                    <input 
                      type="number" 
                      value={ltcg} 
                      onChange={e => setLtcg(e.target.value)} 
                      placeholder="12.5" 
                    />
                    <span className="inp-suffix">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Policies List */}
        <div id="policies-container">
          {policies.map((p, index) => {
            const isUlip = p.policyCategory === 'ulip';
            
            // Auto Calculations for displaying in the form fields
            const sa = parseFloat(p.sumAssured) || 0;
            const ap = parseFloat(p.annualPremium) || 0;
            const paid = parseFloat(p.premiumsPaid) || 0;
            const pt = parseFloat(p.policyTerm) || 0;
            const tpp = parseFloat(p.totalPremiumPaid) || (ap * paid);

            let revBonus = 0;
            let termBonus = 0;
            let paidUpVal = 0;
            let ssvCalc = 0;
            let eligiblePrem = 0;
            let gsv = 0;
            let finalSV = 0;

            let totalDrag = 0;
            let netR = 0;

            if (!isUlip) {
              const revBonusRate = parseFloat(p.t_revBonusRate) || 0;
              const termBonusRate = parseFloat(p.t_termBonusRate) || 0;
              const gsvPct = parseFloat(p.t_gsvPct) || 0;
              const ssvFac = parseFloat(p.t_svFactor) || 0;

              revBonus = (sa / 1000) * revBonusRate;
              termBonus = (sa / 1000) * termBonusRate;

              const PAIDUP_RATE = 0.0275;
              const pvBase = (ap * paid) + (revBonus * paid);
              const yearsRemaining = Math.max(0, pt - paid);
              paidUpVal = pvBase * Math.pow(1 + PAIDUP_RATE, yearsRemaining);

              const accruedBonus = revBonus * paid;
              const partA = accruedBonus * (gsvPct / 100);
              eligiblePrem = ap * Math.max(0, paid - 1);
              const partB = eligiblePrem * ssvFac;
              ssvCalc = partA + partB;
              gsv = tpp * (gsvPct / 100);
              finalSV = Math.max(gsv, ssvCalc);
            } else {
              const mortality = parseFloat(p.u_mortality) || 0;
              const pac = parseFloat(p.u_pac) || 0;
              const FMC = parseFloat(p.u_fmc) || 0;
              const adminC = parseFloat(p.u_pac2) || 0;
              const mfR = parseFloat(mfReturn) || 12;

              totalDrag = mortality + FMC + adminC;
              netR = Math.max(0, mfR - totalDrag);
            }

            return (
              <div className="policy-block" key={p.id} data-policy-id={p.id}>
                <div className="policy-badge">{index + 1}</div>
                <div className="policy-block-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingRight: '45px' }}>
                  <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Policy #{index + 1}</div>
                  {policies.length > 1 && (
                    <button 
                      className="btn" 
                      onClick={() => removePolicy(p.id)} 
                      style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)', backgroundColor: 'transparent' }} 
                      type="button"
                    >
                      🗑️ Remove Policy
                    </button>
                  )}
                </div>

                <div className="grid-2">
                  {/* Card 1: Policy core info */}
                  <div className="card">
                    <div className="card-head">
                      <div className="cicon ci-gold">📋</div>
                      <div>
                        <div className="ctitle">Policy Details</div>
                        <div className="csub">Basic information about the insurance policy</div>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="fg fg-2" style={{ marginBottom: '14px' }}>
                        <div className="field">
                          <label>Policy Name</label>
                          <input 
                            type="text" 
                            value={p.policyName} 
                            onChange={e => updatePolicyField(p.id, 'policyName', e.target.value)} 
                            placeholder="e.g. LIC Jeevan Anand" 
                          />
                        </div>
                        <div className="field">
                          <label>Policy No.</label>
                          <input 
                            type="text" 
                            value={p.policyNo} 
                            onChange={e => updatePolicyField(p.id, 'policyNo', e.target.value)} 
                            placeholder="e.g. 123456789" 
                          />
                        </div>
                      </div>

                      <div className="inner-section">Policy Type</div>
                      <div className="fg fg-2">
                        <div className="field">
                          <label>Policy Category</label>
                          <CoolSelect 
                            value={p.policyCategory} 
                            onChange={e => updatePolicyField(p.id, 'policyCategory', e.target.value)}
                          >
                            <option value="traditional">Traditional</option>
                            <option value="ulip">ULIP</option>
                          </CoolSelect>
                        </div>
                        {!isUlip && (
                          <div className="field" id={`subtype-wrap-${p.id}`}>
                            <label>Sub Type</label>
                            <CoolSelect 
                              value={p.policySubtype} 
                              onChange={e => updatePolicyField(p.id, 'policySubtype', e.target.value)}
                            >
                              <option value="endowment">Endowment</option>
                              <option value="moneyback">Money Back</option>
                              <option value="whole_life">Whole Life</option>
                            </CoolSelect>
                          </div>
                        )}
                      </div>

                      <div className="inner-section">Core Policy Numbers</div>
                      <div className="fg fg-2">
                        <div className="field">
                          <label>Sum Assured <span className="tip" title="Guaranteed amount on death or maturity">?</span></label>
                          <div className="inp-wrap has-prefix">
                            <span className="inp-prefix">₹</span>
                            <input 
                              type="number" 
                              value={p.sumAssured} 
                              onChange={e => updatePolicyField(p.id, 'sumAssured', e.target.value)} 
                              placeholder="10,00,000" 
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label>Premium Frequency <span className="tip" title="How often the premium is paid">?</span></label>
                          <CoolSelect 
                            value={p.premiumFrequency} 
                            onChange={e => updatePolicyField(p.id, 'premiumFrequency', e.target.value)}
                          >
                            <option value="12">Monthly</option>
                            <option value="4">Quarterly</option>
                            <option value="2">Half Yearly</option>
                            <option value="1">Yearly</option>
                          </CoolSelect>
                        </div>
                        <div className="field">
                          <label>Premium Per Installment <span className="tip" title="Amount paid each time">?</span></label>
                          <div className="inp-wrap has-prefix">
                            <span className="inp-prefix">₹</span>
                            <input 
                              type="number" 
                              value={p.installmentPremium} 
                              onChange={e => updatePolicyField(p.id, 'installmentPremium', e.target.value)} 
                              placeholder="50,000" 
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label>Annual Premium Total <span className="tip" title="Auto-calculated: Installment × frequency per year.">?</span></label>
                          <div className="inp-wrap has-prefix">
                            <span className="inp-prefix">₹</span>
                            <input 
                              type="number" 
                              value={p.annualPremium} 
                              readOnly 
                              placeholder="Auto" 
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label>Policy Term (Years)</label>
                          <input 
                            type="number" 
                            value={p.policyTerm} 
                            onChange={e => updatePolicyField(p.id, 'policyTerm', e.target.value)} 
                            placeholder="20" 
                          />
                        </div>
                        <div className="field">
                          <label>Premium Paying Term</label>
                          <input 
                            type="number" 
                            value={p.premiumTerm} 
                            onChange={e => updatePolicyField(p.id, 'premiumTerm', e.target.value)} 
                            placeholder="15" 
                          />
                        </div>
                        <div className="field">
                          <label>Policy Start Date</label>
                          <input 
                            type="date" 
                            value={p.startDate} 
                            onChange={e => updatePolicyField(p.id, 'startDate', e.target.value)} 
                          />
                        </div>
                        <div className="field">
                          <label>Maturity Date</label>
                          <input 
                            type="date" 
                            value={p.maturityDate} 
                            onChange={e => updatePolicyField(p.id, 'maturityDate', e.target.value)} 
                          />
                        </div>
                        <div className="field">
                          <label>Years Premium Paid So Far</label>
                          <input 
                            type="number" 
                            value={p.premiumsPaid} 
                            onChange={e => updatePolicyField(p.id, 'premiumsPaid', e.target.value)} 
                            placeholder="5" 
                          />
                        </div>
                        <div className="field">
                          <label>Total Premium Paid Till Date <span className="tip" title="Auto-calculated. Override if different.">?</span></label>
                          <div className="inp-wrap has-prefix">
                            <span className="inp-prefix">₹</span>
                            <input 
                              type="number" 
                              value={p.totalPremiumPaid} 
                              onChange={e => updatePolicyField(p.id, 'totalPremiumPaid', e.target.value)} 
                              placeholder="Auto-calculated" 
                            />
                          </div>
                        </div>
                      </div>

                      {ap > 0 && paid > 0 && pt > 0 && (
                        <div className="live-strip" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                          <div className="live-item">
                            <div className="li-label">Annual Premium</div>
                            <div className="li-val c-gold">{inr(ap)}</div>
                          </div>
                          <div className="live-item">
                            <div className="li-label">Total Paid</div>
                            <div className="li-val c-gold">{inr(tpp)}</div>
                          </div>
                          <div className="live-item">
                            <div className="li-label">Years Remaining</div>
                            <div className="li-val">{Math.max(0, pt - paid)} yrs</div>
                          </div>
                          <div className="live-item">
                            <div className="li-label">% Term Completed</div>
                            <div className="li-val">{pt > 0 ? pct((paid / pt) * 100, 0) : '—'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Bonus & Surrender values */}
                  <div className="card">
                    <div className="card-head">
                      <div className="cicon ci-teal">💎</div>
                      <div>
                        <div className="ctitle">Bonus & Surrender Details</div>
                        <div className="csub">{isUlip ? 'ULIP fund value, surrender charges and all annual charges' : 'Traditional policy bonus and surrender values'}</div>
                      </div>
                    </div>
                    <div className="card-body">
                      {!isUlip ? (
                        <div>
                          <div className="inner-section">Bonus Details</div>
                          <div className="fg fg-2">
                            <div className="field">
                              <label>Rev. Bonus Rate (per ₹1000 SA/yr) <span className="tip" title="₹ bonus per ₹1000 sum assured each year">?</span></label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input 
                                  type="number" 
                                  value={p.t_revBonusRate} 
                                  onChange={e => updatePolicyField(p.id, 't_revBonusRate', e.target.value)} 
                                  placeholder="45" 
                                />
                              </div>
                            </div>
                            <div className="field">
                              <label>Revisionary Bonus <span className="tip" title={`Formula: (SA ÷ 1000) × Rate\n= (${inr(sa)} ÷ 1000) × ${p.t_revBonusRate}\n= ${inr(revBonus)} per year`}>?</span></label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input type="number" value={revBonus ? revBonus.toFixed(2) : ''} readOnly placeholder="Auto" />
                              </div>
                            </div>
                            <div className="field">
                              <label>Terminal Bonus Rate (per ₹1000)</label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input 
                                  type="number" 
                                  value={p.t_termBonusRate} 
                                  onChange={e => updatePolicyField(p.id, 't_termBonusRate', e.target.value)} 
                                  placeholder="0" 
                                />
                              </div>
                            </div>
                            <div className="field">
                              <label>Terminal Bonus <span className="tip" title={`Formula: (SA ÷ 1000) × Terminal Rate\n= (${inr(sa)} ÷ 1000) × ${p.t_termBonusRate}\n= ${inr(termBonus)}`}>?</span></label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input type="number" value={termBonus ? termBonus.toFixed(2) : ''} readOnly placeholder="Auto" />
                              </div>
                            </div>
                          </div>

                          <div className="inner-section">Surrender Values</div>
                          <div className="fg fg-2">
                            <div className="field">
                              <label>Guaranteed Surrender Value %</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.t_gsvPct} 
                                  onChange={e => updatePolicyField(p.id, 't_gsvPct', e.target.value)} 
                                  placeholder="30" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                            <div className="field">
                              <label>Surrender Value Factor</label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">×</span>
                                <input 
                                  type="number" 
                                  value={p.t_svFactor} 
                                  onChange={e => updatePolicyField(p.id, 't_svFactor', e.target.value)} 
                                  placeholder="0.30" 
                                  step="0.01" 
                                />
                              </div>
                            </div>
                            <div className="field">
                              <label>Paid-up Value <span className="tip" title={`Step 1: Total Premium Paid\n= AP × YrsPaid = ${inr(ap)} × ${paid} = ${inr(ap * paid)}\n\nStep 2: Accrued Bonus\n= RevBonus × YrsPaid = ${inr(revBonus)} × ${paid} = ${inr(revBonus * paid)}\n\nStep 3: PV Base\n= ${inr(ap * paid)} + ${inr(revBonus * paid)} = ${inr((ap * paid) + (revBonus * paid))}\n\nStep 4: FV (Rate=2.75%, NPER=${Math.max(0, pt - paid)})\n= ${inr((ap * paid) + (revBonus * paid))} × (1.0275)^${Math.max(0, pt - paid)}\n= ${inr(paidUpVal)}`}>?</span></label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input type="number" value={paidUpVal ? paidUpVal.toFixed(2) : ''} readOnly placeholder="Auto" />
                              </div>
                            </div>
                            <div className="field">
                              <label>Special Surrender Value <span className="tip" title={`Part A (Bonus portion):\nRevBonus × YrsPaid = ${inr(revBonus)} × ${paid} = ${inr(revBonus * paid)}\n× GSV ${p.t_gsvPct}% = ${inr((revBonus * paid) * (parseFloat(p.t_gsvPct) / 100))}\n\nPart B (Premium portion):\nAP × (YrsPaid−1) = ${inr(ap)} × ${Math.max(0, paid - 1)} = ${inr(eligiblePrem)}\n× SV Factor ${p.t_svFactor} = ${inr(eligiblePrem * parseFloat(p.t_svFactor))}\n\nSSV = Part A + Part B = ${inr(ssvCalc)}`}>?</span></label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input type="number" value={ssvCalc ? ssvCalc.toFixed(2) : ''} readOnly placeholder="Auto" />
                              </div>
                            </div>
                          </div>

                          <div className="live-strip" style={{ marginTop: '14px', gridTemplateColumns: '1fr 1fr 1fr' }}>
                            <div className="live-item">
                              <div className="li-label">GSV</div>
                              <div className="li-val c-amber">{gsv ? inr(gsv) : '—'}</div>
                            </div>
                            <div className="live-item">
                              <div className="li-label">SSV (Calc.)</div>
                              <div className="li-val c-blue">{ssvCalc ? inr(ssvCalc) : '—'}</div>
                            </div>
                            <div className="live-item">
                              <div className="li-label">Final SV (Higher)</div>
                              <div className="li-val c-gold">{finalSV ? inr(finalSV) : '—'}</div>
                              <div className="li-badge" style={{ color: 'var(--text3)', fontSize: '10px' }}>
                                {finalSV ? (gsv >= ssvCalc ? 'Higher: GSV' : 'Higher: SSV') : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="inner-section">ULIP Structure</div>
                          <div className="fg fg-2">
                            <div className="field">
                              <label>Minimum Paying Term</label>
                              <input 
                                type="number" 
                                value={p.u_minPayTerm} 
                                onChange={e => updatePolicyField(p.id, 'u_minPayTerm', e.target.value)} 
                                placeholder="5" 
                              />
                            </div>
                            <div className="field">
                              <label>Current Fund Value</label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input 
                                  type="number" 
                                  value={p.u_fundValue} 
                                  onChange={e => updatePolicyField(p.id, 'u_fundValue', e.target.value)} 
                                  placeholder="0" 
                                  readOnly={p.fvMode === 'nav'}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: '7px' }}>Fund Value Input Mode</div>
                            <div className="toggle-group">
                              <button 
                                className={`tgl-btn ${p.fvMode === 'manual' ? 'active' : ''}`}
                                onClick={() => updatePolicyField(p.id, 'fvMode', 'manual')}
                                type="button"
                              >
                                ✏️ Enter Manually
                              </button>
                              <button 
                                className={`tgl-btn ${p.fvMode === 'nav' ? 'active' : ''}`}
                                onClick={() => updatePolicyField(p.id, 'fvMode', 'nav')}
                                type="button"
                              >
                                🧮 NAV × Units
                              </button>
                            </div>
                          </div>

                          {p.fvMode === 'nav' && (
                            <div style={{ marginTop: '12px' }}>
                              <div className="fg fg-2">
                                <div className="field">
                                  <label>Current NAV (₹)</label>
                                  <div className="inp-wrap has-prefix">
                                    <span className="inp-prefix">₹</span>
                                    <input 
                                      type="number" 
                                      value={p.u_nav} 
                                      onChange={e => updatePolicyField(p.id, 'u_nav', e.target.value)} 
                                      placeholder="25.60" 
                                      step="0.01" 
                                    />
                                  </div>
                                </div>
                                <div className="field">
                                  <label>Units Held</label>
                                  <input 
                                    type="number" 
                                    value={p.u_units} 
                                    onChange={e => updatePolicyField(p.id, 'u_units', e.target.value)} 
                                    placeholder="5000" 
                                    step="0.001" 
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="inner-section">Surrender & Charges</div>
                          <div className="fg fg-2">
                            <div className="field">
                              <label>Surrender Charges</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.u_surrenderCharge} 
                                  onChange={e => updatePolicyField(p.id, 'u_surrenderCharge', e.target.value)} 
                                  placeholder="4" 
                                  step="0.01" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                            <div className="field">
                              <label>Paid-up Fund Value</label>
                              <div className="inp-wrap has-prefix">
                                <span className="inp-prefix">₹</span>
                                <input 
                                  type="number" 
                                  value={p.u_paidup} 
                                  onChange={e => updatePolicyField(p.id, 'u_paidup', e.target.value)} 
                                  placeholder="0" 
                                />
                              </div>
                            </div>
                          </div>

                          <div className="inner-section">Annual Charge Rates (% of Fund / Premium)</div>
                          <div className="fg fg-2">
                            <div className="field">
                              <label>Mortality Charges</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.u_mortality} 
                                  onChange={e => updatePolicyField(p.id, 'u_mortality', e.target.value)} 
                                  placeholder="0.5" 
                                  step="0.01" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                            <div className="field">
                              <label>Premium Allocation Charges</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.u_pac} 
                                  onChange={e => updatePolicyField(p.id, 'u_pac', e.target.value)} 
                                  placeholder="5" 
                                  step="0.01" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                            <div className="field">
                              <label>Fund Management Charges</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.u_fmc} 
                                  onChange={e => updatePolicyField(p.id, 'u_fmc', e.target.value)} 
                                  placeholder="1.35" 
                                  step="0.01" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                            <div className="field">
                              <label>Policy Admin Charges</label>
                              <div className="inp-wrap has-suffix">
                                <input 
                                  type="number" 
                                  value={p.u_pac2} 
                                  onChange={e => updatePolicyField(p.id, 'u_pac2', e.target.value)} 
                                  placeholder="0.1" 
                                  step="0.01" 
                                />
                                <span className="inp-suffix">%</span>
                              </div>
                            </div>
                          </div>

                          <div className="live-strip" style={{ marginTop: '14px', gridTemplateColumns: '1fr 1fr' }}>
                            <div className="live-item">
                              <div className="li-label">Total Annual Drag</div>
                              <div className="li-val c-red">{pct(totalDrag + (parseFloat(p.u_pac) || 0) / 10)}</div>
                            </div>
                            <div className="live-item">
                              <div className="li-label">Net Return</div>
                              <div className="li-val c-teal">{pct(netR)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Row */}
        <div className="action-row" style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '20px', marginBottom: '20px' }}>
          <button className="btn btn-outline" onClick={addNewPolicy} type="button">➕ Add Another Policy</button>
          <button className="btn btn-analyze" onClick={handleAnalyze} type="button">⚡ Perform Analysis</button>
        </div>
      </div>

      {/* Results Workspace (Visually active inside CRM, and prints A4 Landscape) */}
      {results && (
        <div id="results-container" ref={resultsRef} className="results-wrapper">
          {results.map(res => (
            <div key={res.policyId} className="card result-card" style={{ marginBottom: '24px', breakInside: 'avoid' }}>
              <div className="card-head" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(37,99,235,0.03)' }}>
                <div className="cicon ci-blue" id={`r-policy-badge-${res.policyId}`}>{res.policyId}</div>
                <div style={{ flex: 1 }}>
                  <div className="ctitle" id={`r-policy-name-${res.policyId}`}>{res.policyName || `Policy #${res.policyId}`} {res.policyNo ? `(${res.policyNo})` : ''}</div>
                  <div className="csub" id={`r-policy-label-${res.policyId}`}>Policy #{res.policyId} — Individual Review</div>
                </div>
                <div style={{ textAlign: 'right' }} className="no-print">
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }} id={`r-client-name-${res.policyId}`}>{clientName}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }} id={`r-client-meta-${res.policyId}`}>
                    {clientPan && <div>PAN: {clientPan}</div>}
                    {groupLeader && <div>RM: {groupLeader}</div>}
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="score-section" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
                  <div className="score-ring-wrap">
                    <svg viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
                      <circle 
                        id={`score-arc-${res.policyId}`} 
                        cx="50" cy="50" r="44" 
                        fill="none" 
                        stroke={res.winner.color} 
                        strokeWidth="6" 
                        strokeDasharray="276" 
                        strokeDashoffset="0"
                      />
                    </svg>
                    <div className="score-center">
                      <div className="score-num" style={{ color: res.winner.color, fontSize: '18px' }} id={`score-num-${res.policyId}`}>
                        ₹{(res.winner.value / 100000).toFixed(2)}L
                      </div>
                      <div className="score-lbl">Maturity</div>
                    </div>
                  </div>
                  <div className="score-details">
                    <div className="score-title" id={`score-verdict-${res.policyId}`}>{res.winner.name}</div>
                    <div className="score-desc" id={`score-desc-${res.policyId}`} style={{ fontSize: '13px', color: 'var(--text2)' }}>
                      {res.winner.name} gives the highest maturity value · {inr(res.diff)} more than {res.winner.name === 'Continue Policy' ? 'Go Paid-up' : 'Continue Policy'} ({inr(res.winner.name === 'Continue Policy' ? res.paidUpVal : res.continueVal)})
                    </div>
                    <div className="score-tags" id={`score-tags-${res.policyId}`}>
                      <span className={`stag tag-continue ${res.winner.type === 'continue' ? 'winner' : ''}`}>Continue: {inr(res.continueVal)}</span>
                      <span className={`stag tag-paidup ${res.winner.type === 'paidup' ? 'winner' : ''}`}>Paid-up: {inr(res.paidUpVal)}</span>
                      <span className={`stag tag-surrender ${res.winner.type === 'surrender' ? 'winner' : ''}`}>Surrender: {inr(res.surrenderVal)}</span>
                      <span className={`stag tag-mf ${res.winner.type === 'mf' ? 'winner' : ''}`}>MF: {inr(res.mfFinalVal)}</span>
                    </div>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="mcard">
                    <div className="mc-icon">📜</div>
                    <div className="mc-lbl">Continue IRR</div>
                    <div className={`mc-val ${res.continueIRR >= 7 ? 'c-green' : res.continueIRR >= 5 ? 'c-amber' : 'c-red'}`} id={`mc-cont-irr-${res.policyId}`}>{pct(res.continueIRR)}</div>
                    <div className="mc-sub">Yield at maturity</div>
                  </div>
                  <div className="mcard">
                    <div className="mc-icon">🔒</div>
                    <div className="mc-lbl">Paid-up IRR</div>
                    <div className={`mc-val ${res.paidUpIRR >= 7 ? 'c-green' : res.paidUpIRR >= 5 ? 'c-amber' : 'c-red'}`} id={`mc-pu-irr-${res.policyId}`}>{pct(res.paidUpIRR)}</div>
                    <div className="mc-sub">Yield on paid up term</div>
                  </div>
                  <div className="mcard">
                    <div className="mc-icon">🚪</div>
                    <div className="mc-lbl">Surrender IRR</div>
                    <div className={`mc-val ${res.surrenderIRR >= 7 ? 'c-green' : res.surrenderIRR >= 5 ? 'c-amber' : 'c-red'}`} id={`mc-sur-irr-${res.policyId}`}>{pct(res.surrenderIRR)}</div>
                    <div className="mc-sub">Yield on immediate exit</div>
                  </div>
                  <div className="mcard">
                    <div className="mc-icon">📈</div>
                    <div className="mc-lbl">MF Comp. Rate</div>
                    <div className="mc-val c-green" id={`mc-mf-ret-${res.policyId}`}>{pct(parseFloat(mfReturn))}</div>
                    <div className="mc-sub">Target fund CAGR</div>
                  </div>
                </div>

                <div className="grid-2" style={{ marginTop: '20px', gap: '20px' }}>
                  {/* Left: Summary and chart */}
                  <div>
                    <div className="ctable-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Scenario</th>
                            <th style={{ textAlign: 'right' }}>Maturity Value</th>
                            <th style={{ textAlign: 'right' }}>Expected IRR</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr id={`tr-continue-${res.policyId}`} className={res.winner.type === 'continue' ? 'tr-best' : ''}>
                            <td className="scenario-name"><span className="sdot" style={{ background: '#3b82f6' }}></span>Continue Policy</td>
                            <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }} id={`td-cont-val-${res.policyId}`}>{inr(res.continueVal)}</td>
                            <td style={{ textAlign: 'right' }} id={`td-cont-irr-${res.policyId}`}>{irrPill(res.continueIRR)}</td>
                          </tr>
                          <tr id={`tr-paidup-${res.policyId}`} className={res.winner.type === 'paidup' ? 'tr-best' : ''}>
                            <td className="scenario-name"><span className="sdot" style={{ background: '#fbbf24' }}></span>Go Paid-up</td>
                            <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }} id={`td-pu-val-${res.policyId}`}>{inr(res.paidUpVal)}</td>
                            <td style={{ textAlign: 'right' }} id={`td-pu-irr-${res.policyId}`}>{irrPill(res.paidUpIRR)}</td>
                          </tr>
                          <tr id={`tr-surrender-${res.policyId}`} className={res.winner.type === 'surrender' ? 'tr-best' : ''}>
                            <td className="scenario-name"><span className="sdot" style={{ background: '#ef4444' }}></span>Surrender Value</td>
                            <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }} id={`td-sur-val-${res.policyId}`}>{inr(res.surrenderVal)}</td>
                            <td style={{ textAlign: 'right' }} id={`td-sur-irr-${res.policyId}`}>{irrPill(res.surrenderIRR)}</td>
                          </tr>
                          <tr id={`tr-mf-${res.policyId}`} className={res.winner.type === 'mf' ? 'tr-best' : ''}>
                            <td className="scenario-name"><span className="sdot" style={{ background: '#10b981' }}></span>Mutual Fund (post-tax)</td>
                            <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }} id={`td-mf-val-${res.policyId}`}>{inr(res.mfFinalVal)}</td>
                            <td style={{ textAlign: 'right' }} id={`td-mf-irr-${res.policyId}`}><span className="irr-pill pill-green">{pct(parseFloat(mfReturn))}</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className={`wg-bar ${res.wealthGain >= 0 ? 'pos' : 'neg'}`} id={`wg-bar-${res.policyId}`}>
                      <div>
                        <div className="wg-label" id={`wg-label-${res.policyId}`}>
                          {res.wealthGain >= 0 ? 'MF generates more wealth than continuing policy' : 'Policy generates more wealth than MF in this case'}
                        </div>
                        <div className="wg-sub" id={`wg-sub-${res.policyId}`}>
                          {inr(res.mfFinalVal)} (MF) vs {inr(res.continueVal)} (Policy) at term of {res.yearsLeft} years
                        </div>
                      </div>
                      <div className={`wg-val ${res.wealthGain >= 0 ? 'pos' : 'neg'}`} id={`wg-val-${res.policyId}`}>
                        {res.wealthGain >= 0 ? '+' : ''}{inr(res.wealthGain)}
                      </div>
                    </div>
                  </div>

                  {/* Right: Growth Chart */}
                  <div className="card" style={{ padding: '16px', background: 'transparent' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', marginBottom: '8px' }}>Projected Wealth Growth</div>
                    <div className="chart-wrap">
                      <canvas id={`growthChart-${res.policyId}`}></canvas>
                    </div>
                  </div>
                </div>

                {/* Breakeven Timeline bar */}
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>Maturity Timeline Progress</div>
                  <div className="breakeven-line">
                    <div className="bel-fill" id={`bel-fill-${res.policyId}`} style={{ width: `${Math.min(100, Math.round((res.premiumsPaid / res.policyTerm) * 100))}%` }}></div>
                    <div className="bel-marker" id={`bel-marker-${res.policyId}`} style={{ left: `${Math.min(100, Math.round((res.premiumsPaid / res.policyTerm) * 100))}%` }}></div>
                    <div className="bel-year" id={`bel-year-${res.policyId}`} style={{ left: `${Math.min(100, Math.round((res.premiumsPaid / res.policyTerm) * 100))}%` }}>Yr {res.premiumsPaid} (Paid)</div>
                  </div>
                  <div className="bel-labels">
                    <span>Year 0 (Start)</span>
                    <span id={`bel-mid-${res.policyId}`}>Year {Math.round(res.policyTerm / 2)}</span>
                    <span>Year {res.policyTerm} (Maturity)</span>
                  </div>
                </div>

                {/* ULIP Charges Breakdown */}
                {res.isUlip && (
                  <div id={`ulip-charges-card-${res.policyId}`} className="card" style={{ padding: '20px', marginTop: '20px' }}>
                    <div className="card-head" style={{ padding: '0 0 10px', borderBottom: '1px solid var(--border)' }}>
                      <div className="cicon ci-red">📊</div>
                      <div>
                        <div className="ctitle">ULIP Charges Breakdown & Drag</div>
                        <div className="csub">Live charge allocations and impact on gross returns</div>
                      </div>
                    </div>
                    <div className="card-body" style={{ padding: '15px 0 0' }}>
                      <div className="fg fg-3" style={{ marginBottom: '15px' }}>
                        <div className="field">
                          <label>Total Charge Drag</label>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--red)' }} id={`ulip-total-drag-${res.policyId}`}>{pct(res.chargesDragTotal, 2)}</div>
                        </div>
                        <div className="field">
                          <label>Estimated Net Return</label>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--teal)' }} id={`ulip-net-ret-text-${res.policyId}`}>{pct(res.netReturnUlip)}</div>
                        </div>
                        <div className="field">
                          <label>Assumed Gross return</label>
                          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }} id={`ulip-gross-ret-${res.policyId}`}>{pct(parseFloat(mfReturn))}</div>
                        </div>
                      </div>
                      <div className="charge-bars" id={`charge-bars-${res.policyId}`}>
                        <div style={{ fontWeight: 600, marginTop: '10px', marginBottom: '6px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                          {res.policyName || `Policy #${res.policyId}`}
                        </div>
                        {res.ulipCharges.map((ch, cidx) => {
                          const maxC = Math.max(...res.ulipCharges.map(c => c.val), 0.01);
                          return (
                            <div className="charge-row" key={cidx}>
                              <span className="charge-name">{ch.name}</span>
                              <div className="charge-bar-bg">
                                <div className="charge-bar-fill" style={{ width: `${Math.min(100, (ch.val / maxC) * 100)}%` }}></div>
                              </div>
                              <span className="charge-pct">{pct(ch.val)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Final Recommendation Box */}
                <div style={{ marginTop: '20px' }}>
                  <div className={`rec-box ${res.recType}`} id={`rec-box-${res.policyId}`}>
                    <div className="rec-emoji" id={`rec-emoji-${res.policyId}`}>{res.recEmoji}</div>
                    <div className="rec-body-wrap">
                      <div className={`rec-title ${res.recType}`} id={`rec-title-${res.policyId}`}>{res.recTitle}</div>
                      <div className="rec-body" id={`rec-body-${res.policyId}`}>{res.recBody}</div>
                      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text2)', marginBottom: '4px' }}>Proposed Action Steps</div>
                        <div id={`action-steps-${res.policyId}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {res.actionSteps.map((step, sidx) => (
                            <div key={sidx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: 'var(--text2)' }}>
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Metrics Grid */}
                <div className="detail-grid" id={`detail-grid-${res.policyId}`} style={{ marginTop: '20px' }}>
                  <div className="detail-item">
                    <div className="di-label">Maturity Value</div>
                    <div className="di-val">{inr(res.continueVal)}</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">Paid-up SA</div>
                    <div className="di-val">{inr(res.sumAssured * (res.premiumsPaid / res.policyTerm))}</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">Surrender Value</div>
                    <div className="di-val">{inr(res.surrenderVal)}</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">MF Final Value</div>
                    <div className="di-val">{inr(res.mfFinalVal)}</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">MF Tax (LTCG)</div>
                    <div className="di-val">{inr(Math.max(0, res.mfFinalVal - (res.surrenderVal + res.annualPremium * Math.max(0, res.premiumTerm - res.premiumsPaid))) * (ltcgRate / 100))}</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">Years to Maturity</div>
                    <div className="di-val">{res.yearsLeft} yrs</div>
                  </div>
                  <div className="detail-item">
                    <div className="di-label">Completion %</div>
                    <div className="di-val">{pct((res.premiumsPaid / res.policyTerm) * 100, 0)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Executive Summary Table */}
          <div className="card" style={{ marginTop: '24px', marginBottom: '24px', overflow: 'visible', breakInside: 'avoid' }}>
            <div className="card-head" style={{ background: 'rgba(37, 99, 235, 0.03)', borderBottom: '1px solid var(--border)' }}>
              <div className="cicon ci-purple">📋</div>
              <div>
                <div className="ctitle" style={{ fontFamily: 'Playfair Display, serif', fontSize: '18px' }}>Executive Summary Table</div>
                <div className="csub">Comparison overview of all analysed policies</div>
              </div>
            </div>
            <div className="ctable-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client Name</th>
                    <th className="text-left">Policy Name & No.</th>
                    <th style={{ textAlign: 'right' }}>Continue Policy</th>
                    <th style={{ textAlign: 'right' }}>Paid-up</th>
                    <th style={{ textAlign: 'right' }}>Surrender Value</th>
                    <th style={{ textAlign: 'right' }}>Mutual Fund</th>
                    <th className="text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(row => (
                    <tr key={row.policyId}>
                      <td style={{ fontWeight: 600 }}>{clientName}</td>
                      <td className="text-left">{row.policyName || `Policy #${row.policyId}`} {row.policyNo ? `(${row.policyNo})` : ''}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>{inr(row.continueVal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>{inr(row.paidUpVal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>{inr(row.surrenderVal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace' }}>{inr(row.mfFinalVal)}</td>
                      <td className="text-left" style={{ fontWeight: 600, color: row.winner.type === 'mf' ? 'var(--green)' : row.winner.type === 'paidup' ? 'var(--amber)' : 'var(--blue)' }}>
                        {row.winner.type === 'mf' ? 'Mutual is best' : (row.winner.type === 'paidup' ? 'Go Paid-up' : 'Continue Policy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', lineHeight: '1.7', padding: '0 40px', marginTop: '12px' }}>
            ⚠️ This tool is for advisor use only. All projections are illustrative and based on inputs provided. 
            IRR calculations use Newton-Raphson XIRR method. Actual policy benefits may vary. 
            Consult the policy document and insurer for exact surrender values. 
            Mutual fund returns are not guaranteed.
          </div>
        </div>
      )}

      {/* Toast Notification for Sync */}
      {syncStatus && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderRadius: '12px', background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', animation: 'fadeIn 0.3s ease' }} className="no-print">
          {syncStatus === 'syncing' && (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>Syncing to Google Sheets...</span>
            </>
          )}
          {syncStatus === 'done' && (
            <>
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)' }}>Data synced successfully!</span>
            </>
          )}
          {syncStatus === 'error' && (
            <>
              <AlertCircle size={16} className="text-rose-500" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--red)' }}>Google Sheets sync failed.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Scoped and clean layout CSS based on policy/index.html styling rules
const POLICY_REVIEW_STYLES = `
  .policy-review-container {
    --navy:    #f0f4f8;
    --navy2:   #e8eef4;
    --navy3:   #ffffff;
    --navy4:   #dce5ef;
    --navy5:   #c8d6e5;
    --gold:    #2563eb;
    --gold2:   #1d4ed8;
    --gold3:   #1e40af;
    --teal:    #0891b2;
    --red:     #dc2626;
    --green:   #16a34a;
    --amber:   #d97706;
    --blue:    #3b82f6;
    --purple:  #7c3aed;
    --text:    #1e293b;
    --text2:   #475569;
    --text3:   #94a3b8;
    --border:  rgba(0,0,0,0.08);
    --borderG: rgba(37,99,235,0.2);
    --radius:  15px;
    --rsm:     9px;
    --card:    rgba(255,255,255,0.95);
    
    font-family: 'IBM Plex Sans', sans-serif;
    color: var(--text);
    position: relative;
    z-index: 1;
  }

  .policy-review-container input[type=number]::-webkit-inner-spin-button,
  .policy-review-container input[type=number]::-webkit-outer-spin-button {
    -webkit-appearance: none; margin: 0;
  }
  .policy-review-container input[type=number] { -moz-appearance: textfield; }

  .policy-review-container .btn {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 13px; font-weight: 500;
    border: none; cursor: pointer;
    border-radius: var(--rsm);
    display: inline-flex; align-items: center; gap: 7px;
    transition: all .2s; letter-spacing: .015em;
  }
  .policy-review-container .btn-gold {
    background: linear-gradient(135deg, var(--gold), #1d4ed8);
    color: #fff; padding: 9px 20px; font-weight: 700;
    box-shadow: 0 4px 18px rgba(37,99,235,0.28);
  }
  .policy-review-container .btn-gold:hover { transform: translateY(-1px); box-shadow: 0 6px 26px rgba(37,99,235,0.42); }
  .policy-review-container .btn-outline {
    background: transparent;
    border: 1px solid var(--borderG);
    color: var(--gold); padding: 9px 16px;
  }
  .policy-review-container .btn-outline:hover { background: rgba(37,99,235,0.06); }
  .policy-review-container .btn-ghost { background: transparent; color: var(--text2); padding: 8px 14px; font-size: 12px; }
  .policy-review-container .btn-ghost:hover { color: var(--text); }
  .policy-review-container .btn-analyze {
    background: linear-gradient(135deg, #2563eb, #60a5fa, #2563eb);
    background-size: 200% auto;
    color: #fff;
    padding: 15px 44px; font-size: 15px; font-weight: 700;
    border-radius: 12px; letter-spacing: .04em;
    box-shadow: 0 8px 30px rgba(37,99,235,0.3);
    animation: shimmer 3s linear infinite;
  }
  .policy-review-container .btn-analyze:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(37,99,235,0.45); }
  @keyframes shimmer { 0% { background-position: 0% center; } 100% { background-position: 200% center; } }

  .policy-review-container .app {
    max-width: 1280px; margin: 0 auto;
    padding: 16px 0 40px;
  }

  .policy-review-container .page-hero {
    margin-bottom: 24px;
    display: flex; align-items: flex-end; justify-content: space-between;
  }
  .policy-review-container .hero-kicker {
    font-size: 10px; font-weight: 600; letter-spacing: .18em;
    text-transform: uppercase; color: var(--gold);
    margin-bottom: 6px;
  }
  .policy-review-container .hero-title {
    font-family: 'Playfair Display', serif;
    font-size: 28px; line-height: 1.15;
    background: linear-gradient(135deg, var(--text), var(--gold3));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .policy-review-container .hero-sub { font-size: 13px; color: var(--text2); margin-top: 4px; }

  .policy-review-container .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .policy-review-container .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .policy-review-container .full { grid-column: 1/-1; }

  .policy-review-container .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    backdrop-filter: blur(12px);
    overflow: hidden;
    transition: border-color .3s;
  }
  .policy-review-container .card:hover { border-color: rgba(37,99,235,0.18); }
  .policy-review-container .card-head {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 12px;
  }
  .policy-review-container .cicon {
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; flex-shrink: 0;
  }
  .policy-review-container .ci-gold { background: rgba(37,99,235,0.1); border: 1px solid rgba(37,99,235,0.2); }
  .policy-review-container .ci-teal { background: rgba(45,212,191,0.12); border: 1px solid rgba(45,212,191,0.2); }
  .policy-review-container .ci-blue { background: rgba(96,165,250,0.12); border: 1px solid rgba(96,165,250,0.2); }
  .policy-review-container .ci-red { background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.2); }
  .policy-review-container .ci-green { background: rgba(74,222,128,0.12); border: 1px solid rgba(74,222,128,0.2); }
  .policy-review-container .ci-purple { background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.2); }
  .policy-review-container .ctitle { font-size: 13px; font-weight: 600; color: var(--text); }
  .policy-review-container .csub { font-size: 11px; color: var(--text3); margin-top: 1px; }
  .policy-review-container .card-body { padding: 18px 20px; }

  .policy-review-container .inner-section {
    font-size: 10px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: var(--gold);
    padding: 14px 0 10px;
    border-top: 1px solid var(--border);
    margin-top: 18px;
    display: flex; align-items: center; gap: 10px;
  }
  .policy-review-container .inner-section:first-child { border-top: none; padding-top: 0; margin-top: 0; }
  .policy-review-container .inner-section::after { content:''; flex: 1; height: 1px; background: linear-gradient(to right, rgba(37,99,235,0.2), transparent); }

  .policy-review-container .fg { display: grid; gap: 14px; }
  .policy-review-container .fg-2 { grid-template-columns: 1fr 1fr; }
  .policy-review-container .fg-3 { grid-template-columns: 1fr 1fr 1fr; }
  .policy-review-container .fg-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .policy-review-container .fg-full { grid-column: 1/-1; }

  .policy-review-container .field { display: flex; flex-direction: column; gap: 5px; }
  .policy-review-container .field label {
    font-size: 10px; font-weight: 600; letter-spacing: .1em;
    text-transform: uppercase; color: var(--text2);
    display: flex; align-items: center; gap: 6px;
  }

  .policy-review-container .tip, .policy-review-container .tip-dynamic {
    width: 14px; height: 14px;
    background: rgba(37,99,235,0.1);
    border: 1px solid rgba(37,99,235,0.25);
    border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 8px; color: var(--gold);
    cursor: help; position: relative; flex-shrink: 0;
    transition: all .2s; font-style: normal;
  }
  .policy-review-container .tip:hover, .policy-review-container .tip-dynamic:hover { background: rgba(37,99,235,0.2); }

  .policy-review-container input, .policy-review-container select {
    height: 38px; padding: 0 12px;
    background: rgba(241,245,249,0.8);
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: var(--rsm);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 13px; color: var(--text);
    outline: none; transition: all .2s; width: 100%;
  }
  .policy-review-container input:focus, .policy-review-container select:focus {
    border-color: var(--gold);
    background: rgba(37,99,235,0.04);
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
  }
  .policy-review-container input[readonly] {
    background: rgba(241,245,249,0.5);
    color: var(--text2); cursor: not-allowed;
    border-color: rgba(0,0,0,0.06);
  }
  
  .policy-review-container #annualPremium[readonly],
  .policy-review-container input[readonly][id^="annualPremium-"],
  .policy-review-container input[readonly][id^="t_revBonus-"],
  .policy-review-container input[readonly][id^="t_termBonus-"],
  .policy-review-container input[readonly][id^="t_paidup-"],
  .policy-review-container input[readonly][id^="t_ssv-"] {
    background: rgba(37,99,235,0.06);
    color: var(--gold2);
    border-color: rgba(37,99,235,0.18);
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
  }
  .policy-review-container input::placeholder { color: var(--text3); }
  .policy-review-container select option { background: #fff; color: var(--text); }

  .policy-review-container .inp-wrap { position: relative; }
  .policy-review-container .inp-prefix { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 12px; font-weight: 500; pointer-events: none; font-family: 'IBM Plex Mono', monospace; }
  .policy-review-container .inp-suffix { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--text3); font-size: 11px; pointer-events: none; }
  .policy-review-container .has-prefix input { padding-left: 22px; }
  .policy-review-container .has-suffix input { padding-right: 26px; }

  .policy-review-container .toggle-group {
    display: flex;
    background: rgba(241,245,249,0.8);
    border: 1px solid var(--border);
    border-radius: 8px; padding: 3px; gap: 3px;
  }
  .policy-review-container .tgl-btn {
    flex: 1; padding: 6px 10px; border-radius: 6px;
    font-size: 11px; font-weight: 500; cursor: pointer;
    border: none; background: transparent;
    color: var(--text2); transition: all .2s;
    font-family: 'IBM Plex Sans', sans-serif;
  }
  .policy-review-container .tgl-btn.active {
    background: rgba(37,99,235,0.12);
    color: var(--gold);
    border: 1px solid rgba(37,99,235,0.25);
  }

  .policy-review-container .live-strip {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 10px; margin-top: 14px;
  }
  .policy-review-container .live-item {
    background: rgba(241,245,249,0.8);
    border: 1px solid var(--border);
    border-radius: var(--rsm);
    padding: 10px 14px;
  }
  .policy-review-container .li-label { font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text3); }
  .policy-review-container .li-val { font-size: 15px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: var(--text); margin-top: 2px; }
  .policy-review-container .li-badge { font-size: 9px; margin-top: 2px; }

  .policy-review-container .score-section {
    display: flex; align-items: center; gap: 24px;
    padding: 18px;
  }
  .policy-review-container .score-ring-wrap {
    position: relative; flex-shrink: 0;
    width: 100px; height: 100px;
  }
  .policy-review-container .score-ring-wrap svg { width: 100%; height: 100%; }
  .policy-review-container .score-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .policy-review-container .score-num { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; }
  .policy-review-container .score-lbl { font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text2); }
  .policy-review-container .score-details { flex: 1; }
  .policy-review-container .score-title { font-family: 'Playfair Display', serif; font-size: 18px; margin-bottom: 4px; }
  .policy-review-container .score-desc { font-size: 12px; color: var(--text2); line-height: 1.5; }
  .policy-review-container .score-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .policy-review-container .stag {
    font-size: 10px; font-weight: 500;
    padding: 2px 8px; border-radius: 20px;
    border: 1px solid;
  }
  .policy-review-container .tag-continue { color: #3b82f6; border-color: rgba(96,165,250,0.4); background: rgba(96,165,250,0.08); }
  .policy-review-container .tag-continue.winner { color: #fff; border-color: #3b82f6; background: #3b82f6; font-weight: 600; }
  .policy-review-container .tag-paidup { color: #d97706; border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.08); }
  .policy-review-container .tag-paidup.winner { color: #fff; border-color: #d97706; background: #d97706; font-weight: 600; }
  .policy-review-container .tag-surrender { color: #ef4444; border-color: rgba(248,113,113,0.4); background: rgba(248,113,113,0.08); }
  .policy-review-container .tag-surrender.winner { color: #fff; border-color: #ef4444; background: #ef4444; font-weight: 600; }
  .policy-review-container .tag-mf { color: #16a34a; border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.08); }
  .policy-review-container .tag-mf.winner { color: #fff; border-color: #16a34a; background: #16a34a; font-weight: 600; }

  .policy-review-container .metric-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 15px; }
  .policy-review-container .mcard {
    background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px;
    transition: border-color .3s;
  }
  .policy-review-container .mcard:hover { border-color: rgba(37,99,235,0.18); }
  .policy-review-container .mc-lbl { font-size: 9px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--text3); }
  .policy-review-container .mc-val { font-size: 22px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; margin: 6px 0 2px; line-height: 1; }
  .policy-review-container .mc-sub { font-size: 10px; color: var(--text3); }
  .policy-review-container .mc-icon { font-size: 18px; margin-bottom: 4px; }
  .policy-review-container .c-gold { color: var(--gold); }
  .policy-review-container .c-green { color: var(--green); }
  .policy-review-container .c-red { color: var(--red); }
  .policy-review-container .c-blue { color: var(--blue); }
  .policy-review-container .c-amber { color: var(--amber); }

  .policy-review-container .ctable-wrap { overflow: hidden; }
  .policy-review-container table { width: 100%; border-collapse: collapse; }
  .policy-review-container thead th {
    background: rgba(241,245,249,0.8);
    padding: 10px 16px;
    text-align: left;
    font-size: 9px; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: var(--text3);
    border-bottom: 1px solid var(--border);
  }
  .policy-review-container thead th:not(:first-child) { text-align: right; }
  .policy-review-container tbody td {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    font-size: 13px; color: var(--text);
  }
  .policy-review-container tbody td:not(:first-child) { text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
  .policy-review-container tbody tr:last-child td { border-bottom: none; }
  .policy-review-container tbody tr:hover { background: rgba(37,99,235,0.03); }
  .policy-review-container .tr-best td { background: rgba(22,163,74,0.06) !important; }
  .policy-review-container .tr-worst td { background: rgba(220,38,38,0.04) !important; }
  .policy-review-container .tr-highlight td { background: rgba(37,99,235,0.05) !important; }
  .policy-review-container .scenario-name { display: flex; align-items: center; gap: 8px; font-weight: 500; }
  .policy-review-container .sdot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  
  .policy-review-container .irr-pill {
    display: inline-block;
    padding: 2px 8px; border-radius: 12px;
    font-size: 10px; font-weight: 600;
    font-family: 'IBM Plex Mono', monospace;
  }
  .policy-review-container .pill-green { background: rgba(74,222,128,0.15); color: var(--green); border: 1px solid rgba(74,222,128,0.25); }
  .policy-review-container .pill-amber { background: rgba(251,191,36,0.12); color: var(--amber); border: 1px solid rgba(251,191,36,0.25); }
  .policy-review-container .pill-red { background: rgba(248,113,113,0.12); color: var(--red); border: 1px solid rgba(248,113,113,0.25); }
  .policy-review-container .pill-blue { background: rgba(96,165,250,0.12); color: var(--blue); border: 1px solid rgba(96,165,250,0.25); }
  .policy-review-container .pill-gold { background: rgba(37,99,235,0.1); color: var(--gold); border: 1px solid rgba(37,99,235,0.25); }

  .policy-review-container .wg-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px; border-radius: var(--rsm); margin-top: 14px;
    border: 1px solid;
  }
  .policy-review-container .wg-bar.pos { background: rgba(74,222,128,0.06); border-color: rgba(74,222,128,0.2); }
  .policy-review-container .wg-bar.neg { background: rgba(248,113,113,0.06); border-color: rgba(248,113,113,0.2); }
  .policy-review-container .wg-label { font-size: 11px; font-weight: 500; color: var(--text2); }
  .policy-review-container .wg-sub { font-size: 10px; color: var(--text3); margin-top: 2px; }
  .policy-review-container .wg-val { font-size: 18px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; }
  .policy-review-container .wg-val.pos { color: var(--green); }
  .policy-review-container .wg-val.neg { color: var(--red); }

  .policy-review-container .rec-box {
    border-radius: var(--radius); padding: 18px;
    display: flex; align-items: flex-start; gap: 14px;
    border: 1px solid;
  }
  .policy-review-container .rec-box.surrender { background: rgba(248,113,113,0.06); border-color: rgba(248,113,113,0.25); }
  .policy-review-container .rec-box.continue { background: rgba(74,222,128,0.05); border-color: rgba(74,222,128,0.22); }
  .policy-review-container .rec-box.mfbetter { background: rgba(74,222,128,0.08); border-color: rgba(74,222,128,0.3); }
  .policy-review-container .rec-box.paidup { background: rgba(251,191,36,0.05); border-color: rgba(251,191,36,0.22); }
  .policy-review-container .rec-box.review { background: rgba(37,99,235,0.04); border-color: rgba(37,99,235,0.2); }
  .policy-review-container .rec-emoji { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
  .policy-review-container .rec-title { font-family: 'Playfair Display', serif; font-size: 16px; margin-bottom: 4px; }
  .policy-review-container .rec-title.surrender { color: var(--red); }
  .policy-review-container .rec-title.continue { color: var(--green); }
  .policy-review-container .rec-title.mfbetter { color: var(--green); }
  .policy-review-container .rec-title.paidup { color: var(--amber); }
  .policy-review-container .rec-title.review { color: var(--gold); }
  .policy-review-container .rec-body { font-size: 12px; color: var(--text2); line-height: 1.6; }

  .policy-review-container .breakeven-line {
    position: relative; height: 6px;
    background: rgba(0,0,0,0.08);
    border-radius: 4px; margin: 18px 0 8px;
    overflow: visible;
  }
  .policy-review-container .bel-fill {
    height: 100%; border-radius: 4px;
    background: linear-gradient(to right, var(--red), var(--amber), var(--green));
    transition: width .8s ease;
  }
  .policy-review-container .bel-marker {
    position: absolute; top: -6px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--gold); border: 2px solid #fff;
    transform: translateX(-50%);
    box-shadow: 0 0 10px rgba(37,99,235,0.3);
  }
  .policy-review-container .bel-labels { display: flex; justify-content: space-between; font-size: 10px; color: var(--text3); }
  .policy-review-container .bel-year {
    position: absolute; top: -28px;
    transform: translateX(-50%);
    background: var(--navy3); border: 1px solid var(--borderG);
    color: var(--gold); font-size: 10px; font-weight: 600;
    padding: 2px 8px; border-radius: 5px; white-space: nowrap;
  }

  .policy-review-container .chart-wrap { height: 260px; position: relative; }

  .policy-review-container .charge-bars { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .policy-review-container .charge-row { display: flex; align-items: center; gap: 10px; }
  .policy-review-container .charge-name { font-size: 11px; color: var(--text2); width: 140px; flex-shrink: 0; }
  .policy-review-container .charge-bar-bg { flex: 1; height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; }
  .policy-review-container .charge-bar-fill { height: 100%; border-radius: 3px; background: linear-gradient(to right, var(--red), rgba(248,113,113,0.5)); }
  .policy-review-container .charge-pct { font-size: 11px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: var(--text2); width: 36px; text-align: right; }

  .policy-review-container .detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .policy-review-container .detail-item { padding: 10px 12px; background: rgba(241,245,249,0.7); border: 1px solid var(--border); border-radius: var(--rsm); }
  .policy-review-container .di-label { font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text3); }
  .policy-review-container .di-val { font-size: 14px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: var(--text); margin-top: 2px; }

  .policy-review-container .policy-block {
    position: relative;
    margin-bottom: 24px;
    border: 1px dashed rgba(37,99,235,0.18);
    border-radius: var(--radius);
    padding: 20px;
    background: rgba(255,255,255,0.5);
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.01);
  }
  .policy-review-container .policy-badge {
    position: absolute;
    top: -14px; right: 20px;
    width: 30px; height: 30px;
    background: linear-gradient(135deg, var(--gold), var(--gold2));
    color: #fff; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 13px;
    box-shadow: 0 4px 10px rgba(37,99,235,0.3);
    z-index: 10;
  }
  .policy-review-container .fade-in { animation: fadeIn 0.4s ease forwards; }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .policy-review-container .text-left { text-align: left !important; font-family: inherit !important; font-size: 13px !important; }

  @media print {
    @page {
      size: A4 landscape;
      margin: 10mm 10mm;
    }
    .policy-review-container {
      background: #ffffff !important;
      color: #1e293b !important;
    }
    .policy-review-container .no-print {
      display: none !important;
    }
    
    /* Hide top app structures for correct printer output flow */
    header, nav, aside, footer, .no-print { display: none !important; }
    
    /* Reveal only the results section */
    body * { visibility: hidden !important; }
    .results-wrapper, .results-wrapper * { visibility: visible !important; }
    .results-wrapper {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      background: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
      visibility: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .policy-review-container .card {
      break-inside: avoid;
      margin-bottom: 12px !important;
      border: 1.5px solid #cbd5e1 !important;
      background: #ffffff !important;
      box-shadow: none !important;
      overflow: visible !important;
    }
    .policy-review-container .card-body { padding: 12px !important; }
    .policy-review-container .card-head {
      padding: 8px 12px !important;
      background: #f1f5f9 !important;
      border-bottom: 1.5px solid #cbd5e1 !important;
    }
    .policy-review-container thead th {
      background: #cbd5e1 !important;
      color: #0f172a !important;
      border-bottom: 1.5px solid #94a3b8 !important;
    }
    .policy-review-container tbody td {
      border-bottom: 1px solid #cbd5e1 !important;
      color: #334155;
      padding: 8px 12px !important;
    }
    .policy-review-container tbody td:not(:first-child) { text-align: right !important; }
    .policy-review-container .ctable-wrap { overflow: visible !important; }
    .policy-review-container .metric-row {
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 8px !important;
      margin-bottom: 8px !important;
    }
    .policy-review-container .mcard {
      padding: 6px 10px !important; 
      border: 1.5px solid #cbd5e1 !important;
      background: #ffffff !important;
    }
    .policy-review-container .mcard .mc-icon { font-size: 14px !important; margin-bottom: 2px !important; }
    .policy-review-container .mcard .mc-lbl { font-size: 8px !important; }
    .policy-review-container .mcard .mc-val { font-size: 18px !important; margin: 4px 0 2px !important; }
    .policy-review-container .mcard .mc-sub { font-size: 8px !important; }
    
    .policy-review-container .grid-2 {
      grid-template-columns: 1fr 1fr !important;
      gap: 12px !important;
    }
    .policy-review-container .wg-bar {
      border: 1px solid #cbd5e1 !important;
      background: #f8fafc !important;
    }
    .policy-review-container .wg-bar.pos { background-color: rgba(74,222,128,0.08) !important; border-color: #22c55e !important; }
    .policy-review-container .wg-bar.neg { background-color: rgba(248,113,113,0.08) !important; border-color: #ef4444 !important; }
    .policy-review-container .wg-val.pos { color: #16a34a !important; }
    .policy-review-container .wg-val.neg { color: #dc2626 !important; }
    
    .policy-review-container .score-section { padding: 8px !important; }
    .policy-review-container .score-ring-wrap { width: 80px !important; height: 80px !important; }
    .policy-review-container .rec-box {
      padding: 10px !important;
      border: 1.5px solid #cbd5e1 !important;
      background: #f8fafc !important;
    }
    .policy-review-container .rec-box.mfbetter { background-color: rgba(74,222,128,0.08) !important; border-color: #16a34a !important; }
    .policy-review-container .rec-box.paidup { background-color: rgba(251,191,36,0.05) !important; border-color: #d97706 !important; }
    .policy-review-container .rec-box.continue { background-color: rgba(74,222,128,0.05) !important; border-color: #16a34a !important; }
    
    .policy-review-container .detail-grid {
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 6px !important;
    }
    .policy-review-container .detail-item {
      border: 1px solid #cbd5e1 !important;
      background: #f8fafc !important;
      padding: 6px 8px !important;
    }
    .policy-review-container .chart-wrap { height: 160px !important; }
  }
`;
