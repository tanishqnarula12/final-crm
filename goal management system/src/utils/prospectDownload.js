// Opens a clean, A4-formatted Insurance Prospect Report in a new tab and
// immediately triggers the browser's Print → Save as PDF dialog.
// No third-party library needed — native browser PDF output is always crisper.

import { LOGO_DATA_URI } from '../assets/logoBase64';
import { teamName } from '../services/team';

const pad = n => String(n).padStart(2, '0');

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
};

const fmtINR = (val) => {
  const n = Number(val);
  if ((!val && val !== 0) || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
};

const row2 = (label, value) =>
  (value != null && value !== '')
    ? `<div class="f"><span class="fl">${label}</span><span class="fv">${value}</span></div>`
    : '';

const buildTable = (table) => {
  if (!table?.cols?.length) return '<p class="na">No table data available.</p>';
  const heads = table.cols.map(c => `<th>${c}</th>`).join('');
  const rows  = (table.rows || []).filter(r => r.some(v => v)).map(r =>
    `<tr>${r.map(v => `<td>${v ?? ''}</td>`).join('')}</tr>`
  ).join('');
  const foot  = table.totalRow
    ? `<tr class="tf">${table.totalRow.map((v, i) =>
        `<td>${i > 1 && typeof v === 'number' && v > 0 ? fmtINR(v) : (v ?? '')}</td>`
      ).join('')}</tr>`
    : '';
  return `<table><thead><tr>${heads}</tr></thead><tbody>${rows}${foot}</tbody></table>`;
};

// Human-readable labels for each document category key
const DOC_LABEL_MAP = {
  aadharCard:       'Aadhaar Card',
  panCard:          'PAN Card',
  cancelledCheque:  'Cancelled Cheque',
  photo:            'Photo',
  salarySlip:       'Salary Slip (Last 3 Months)',
  bankStatement6m:  '6 Month Bank Statement',
  itr3yr:           '3 Year ITR',
  computation3yr:   '3 Year Computation',
  policyDocument:   'Policy Document',
};

const DOC_KEY_SEP = '|||';

// Resolves a doc-type key to human label (handles composite keys like "panCard|||Aarav Sharma")
const resolveDocLabel = (key) => {
  const dtKey = key.includes(DOC_KEY_SEP) ? key.split(DOC_KEY_SEP)[0] : key;
  return DOC_LABEL_MAP[dtKey] || dtKey;
};

const buildDocumentsSection = (documents) => {
  if (!documents || typeof documents !== 'object') return '';
  const entries = Object.entries(documents).filter(([, files]) => Array.isArray(files) && files.length > 0);
  if (!entries.length) return '';

  // Group files by applicant name for display
  const byApplicant = {};
  entries.forEach(([key, files]) => {
    const appName = key.includes(DOC_KEY_SEP) ? key.split(DOC_KEY_SEP)[1] : (files[0]?.applicantName || 'General');
    const label   = resolveDocLabel(key);
    if (!byApplicant[appName]) byApplicant[appName] = [];
    files.forEach(f => byApplicant[appName].push({ label, fileName: f.fileName || f.name || 'file' }));
  });

  const applicantBlocks = Object.entries(byApplicant).map(([appName, items]) => {
    const chips = items.map(({ label, fileName }) =>
      `<div class="doc-chip">
        <span class="doc-tick">✓</span>
        <span class="doc-label">${label}</span>
        <span class="doc-names">${fileName}</span>
      </div>`
    ).join('');
    return `<div class="doc-applicant">
      <p class="doc-app-name">${appName}</p>
      <div class="doc-grid">${chips}</div>
    </div>`;
  }).join('');

  return `
    <div class="section">
      <h3 class="sec-title">Documents Submitted</h3>
      ${applicantBlocks}
    </div>`;
};

const generateHTML = ({ prospect, items }) => {
  const kyc = prospect.kyc || {};
  const now  = new Date();
  const today = `${pad(now.getDate())} ${now.toLocaleString('en-IN', { month: 'long' })} ${now.getFullYear()}`;

  const coverType = items
    ? items.map(i => i.proposalType).join(' + ')
    : (prospect.proposalType || 'Insurance Proposal');

  const proposalSections = items
    ? items.map(it => `
        <div class="section">
          <h3 class="sec-title">${it.proposalType || 'Proposal'}</h3>
          ${buildTable(it.table)}
          ${it.remarks ? `<div class="remark">${it.remarks}</div>` : ''}
        </div>`).join('')
    : `<div class="section">
        <h3 class="sec-title">${prospect.proposalType || 'Proposal Details'}</h3>
        ${buildTable(prospect.table)}
        ${prospect.remarks ? `<div class="remark">${prospect.remarks}</div>` : ''}
       </div>`;

  const docsSection = buildDocumentsSection(prospect.documents);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Insurance Prospect — ${prospect.applicant || 'Client'}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
/* ── RESET ── */
*{box-sizing:border-box;margin:0;padding:0}
html{font-family:'Inter',Arial,sans-serif;font-size:10pt;color:#0f172a;background:#fff}
body{margin:0;padding:0}

/* ── PAGE ── */
@page{
  size:A4 portrait;
  margin:15mm 18mm 18mm 18mm;
}

/* ─── COMPACT HEADER ─── */
.header{
  background:#0d1f3c;
  border-radius:10px;
  padding:16px 20px 0;
  margin-bottom:9mm;
  overflow:hidden;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
  page-break-inside:avoid;
}
.h-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.h-brand{display:flex;align-items:center;gap:10px}
.h-logo{width:34px;height:34px;border-radius:8px;object-fit:contain;background:#fff;padding:2px}
.h-brand-text{}
.h-brand-name{font-size:11pt;font-weight:800;color:#fff;letter-spacing:-0.3px;line-height:1}
.h-brand-sub{font-size:6.5pt;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-top:2px}
.h-badge{
  font-size:6pt;font-weight:800;letter-spacing:2px;text-transform:uppercase;
  padding:4px 10px;border-radius:99px;
  background:rgba(59,130,246,0.22);color:#93c5fd;border:1px solid rgba(59,130,246,0.35);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

.h-divider{height:1px;background:rgba(255,255,255,0.09);margin-bottom:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}

.h-client{margin-bottom:12px}
.h-name{font-size:22pt;font-weight:800;color:#fff;letter-spacing:-0.8px;line-height:1.05}
.h-type{font-size:9.5pt;font-weight:300;color:rgba(255,255,255,0.42);margin-top:3px;font-style:italic}

.h-meta{display:flex;gap:0;margin-bottom:0}
.h-meta-item{
  padding:10px 16px 10px 0;
  margin-right:16px;
  border-right:1px solid rgba(255,255,255,0.08);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.h-meta-item:last-child{border-right:none}
.h-meta-label{font-size:6pt;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.28);display:block;margin-bottom:3px}
.h-meta-val{font-size:9pt;font-weight:600;color:#fff}

.h-bar{
  height:3px;
  background:linear-gradient(90deg,#3b82f6,#6366f1,transparent);
  margin:0 -20px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* ─── CONTENT ─── */
.sec-title{
  font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#64748b;
  border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-bottom:4mm;
}
.section{margin-bottom:8mm;page-break-inside:avoid}

/* Field grid */
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm 7mm}
.grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:4mm 7mm}
.f{display:flex;flex-direction:column;gap:2px}
.fl{font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8}
.fv{font-size:9pt;font-weight:500;color:#1e293b}

/* Tables */
table{width:100%;border-collapse:collapse;margin-top:2mm;font-size:8.5pt}
thead tr{background:#f1f5f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
th{font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;padding:6px 10px;text-align:left;border-bottom:2px solid #cbd5e1}
td{color:#334155;padding:6px 10px;border-bottom:1px solid #f1f5f9}
.tf td{font-weight:700;background:#f8fafc;color:#0f172a;border-top:2px solid #cbd5e1;-webkit-print-color-adjust:exact;print-color-adjust:exact}

.remark{margin-top:3mm;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;padding:7px 11px;font-size:8pt;color:#475569;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.na{font-size:8.5pt;color:#94a3b8;font-style:italic}

/* Documents */
.doc-grid{display:flex;flex-wrap:wrap;gap:6px}
.doc-chip{
  display:flex;align-items:flex-start;gap:6px;
  padding:7px 10px;border-radius:7px;
  background:#f8fafc;border:1px solid #e2e8f0;
  min-width:180px;max-width:260px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.doc-applicant{margin-bottom:4mm}
.doc-app-name{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#3b82f6;margin-bottom:3mm;padding-left:2px;border-left:2px solid #3b82f6;padding-left:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.doc-tick{color:#16a34a;font-size:9pt;font-weight:800;line-height:1.3;flex-shrink:0}
.doc-label{font-size:8pt;font-weight:700;color:#0f172a;line-height:1.3}
.doc-names{font-size:7.5pt;color:#64748b;margin-left:2px;font-style:italic}

/* Disease pills */
.pill{display:inline-block;font-size:7pt;font-weight:600;padding:2px 9px;background:#fef3c7;color:#92400e;border-radius:99px;border:1px solid #fde68a;margin:2px 2px 0 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pills-label{font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;display:block;margin:3mm 0 2mm}

/* Disclaimer */
.disclaimer{
  margin-top:8mm;padding:9px 13px;background:#f8fafc;
  border-radius:5px;font-size:7pt;color:#94a3b8;line-height:1.8;
  border:1px solid #e2e8f0;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}

/* Screen wrapper */
@media screen{
  body{background:#e5e7eb;padding:20px;display:flex;flex-direction:column;align-items:center}
  .page{background:#fff;width:210mm;padding:15mm 18mm 18mm;box-shadow:0 4px 24px rgba(0,0,0,0.12);border-radius:4px;margin-bottom:16px}
  .header{border-radius:12px}
}
@media print{
  body{background:#fff}
  .page{width:100%}
}
</style>
</head>
<body>
<div class="page">

  <!-- ═══ COMPACT HEADER ═══ -->
  <div class="header">
    <div class="h-top">
      <div class="h-brand">
        <img src="${LOGO_DATA_URI}" class="h-logo" alt="Fintness Finserv" />
        <div class="h-brand-text">
          <div class="h-brand-name">Fintness Finserv</div>
          <div class="h-brand-sub">Wealth Management</div>
        </div>
      </div>
      <span class="h-badge">Insurance Prospect Report</span>
    </div>

    <div class="h-divider"></div>

    <div class="h-client">
      <div class="h-name">${prospect.applicant || 'Client'}</div>
      <div class="h-type">${coverType}</div>
    </div>

    <div class="h-meta">
      <div class="h-meta-item">
        <span class="h-meta-label">Stage</span>
        <span class="h-meta-val">${prospect.stage || 'Qualified'}</span>
      </div>
      <div class="h-meta-item">
        <span class="h-meta-label">Annual Premium</span>
        <span class="h-meta-val">${prospect.amount ? fmtINR(prospect.amount) : '—'}</span>
      </div>
      ${prospect.pan ? `<div class="h-meta-item">
        <span class="h-meta-label">PAN</span>
        <span class="h-meta-val">${prospect.pan}</span>
      </div>` : ''}
      <div class="h-meta-item">
        <span class="h-meta-label">Prepared On</span>
        <span class="h-meta-val">${today}</span>
      </div>
    </div>
    <div class="h-bar"></div>
  </div>

  <!-- ═══ CLIENT DETAILS ═══ -->
  <div class="section">
    <h3 class="sec-title">Client &amp; Prospect Details</h3>
    <div class="grid3">
      ${row2('Applicant', prospect.applicant)}
      ${row2('Group Leader', prospect.groupLeader)}
      ${row2('PAN', prospect.pan)}
      ${row2('Stage', prospect.stage || 'Qualified')}
      ${row2('Annual Premium', prospect.amount ? fmtINR(prospect.amount) : '')}
      ${row2('Closing Date', fmtDate(prospect.closingDate))}
      ${row2('Created On', fmtDate(prospect.createdAt))}
    </div>
  </div>

  <!-- ═══ PROPOSALS ═══ -->
  ${proposalSections}

  <!-- ═══ DOCUMENTS ═══ -->
  ${docsSection}

  <!-- ═══ PERSONAL KYC ═══ -->
  ${(kyc.email || kyc.mobile || kyc.placeOfBirth || kyc.motherName || kyc.fatherName || kyc.maritalStatus || kyc.occupation || kyc.height || kyc.weight) ? `
  <div class="section">
    <h3 class="sec-title">Personal Information</h3>
    <div class="grid3">
      ${row2('Email', kyc.email)}
      ${row2('Mobile', kyc.mobile)}
      ${row2('Occupation', kyc.occupation)}
      ${row2('Marital Status', kyc.maritalStatus)}
      ${row2('Place of Birth', kyc.placeOfBirth)}
      ${row2("Mother's Name", kyc.motherName)}
      ${row2("Father's Name", kyc.fatherName)}
      ${row2('Height', kyc.height ? kyc.height + ' cm' : '')}
      ${row2('Weight', kyc.weight ? kyc.weight + ' kg' : '')}
    </div>
  </div>` : ''}

  <!-- ═══ NOMINEE ═══ -->
  ${(kyc.nomineeName || kyc.nomineeRelation) ? `
  <div class="section">
    <h3 class="sec-title">Nominee Details</h3>
    <div class="grid2">
      ${row2('Nominee Name', kyc.nomineeName)}
      ${row2('Relationship', kyc.nomineeRelation)}
    </div>
  </div>` : ''}

  <!-- ═══ HEALTH ═══ -->
  ${(kyc.smoking || kyc.tobacco || kyc.alcohol || kyc.medicalHistory) ? `
  <div class="section">
    <h3 class="sec-title">Health Questionnaire</h3>
    <div class="grid3">
      ${row2('Smoking', kyc.smoking)}
      ${row2('Tobacco Use', kyc.tobacco)}
      ${row2('Alcohol Use', kyc.alcohol)}
      ${row2('PED', kyc.medicalHistory)}
    </div>
    ${kyc.diseases && kyc.diseases.length ? `
      <span class="pills-label">Declared Diseases</span>
      ${kyc.diseases.map(d => `<span class="pill">${d.name}</span>`).join('')}
    ` : ''}
  </div>` : ''}

  <!-- ═══ ADDRESS ═══ -->
  ${(kyc.officeAddress1 || kyc.officeCity || kyc.officeState) ? `
  <div class="section">
    <h3 class="sec-title">Communication Address</h3>
    <div class="grid3">
      ${row2('Address Line 1', kyc.officeAddress1)}
      ${row2('Address Line 2', kyc.officeAddress2)}
      ${row2('City', kyc.officeCity)}
      ${row2('State', kyc.officeState)}
      ${row2('Pincode', kyc.officePincode)}
      ${row2('Country', kyc.officeCountry)}
    </div>
  </div>` : ''}

  <!-- ═══ TEAM ═══ -->
  ${(prospect.relationshipManager || prospect.serviceManager || prospect.insuranceManager || prospect.portfolioManager || prospect.owner) ? `
  <div class="section">
    <h3 class="sec-title">Advisory Team</h3>
    <div class="grid3">
      ${row2('Relationship Manager', teamName(prospect.relationshipManager))}
      ${row2('Service Manager', teamName(prospect.serviceManager))}
      ${row2('Insurance Manager', teamName(prospect.insuranceManager))}
      ${row2('Portfolio Manager', teamName(prospect.portfolioManager))}
      ${row2('Owner', teamName(prospect.owner))}
      ${row2('Internal Manager', teamName(prospect.internalManager))}
    </div>
  </div>` : ''}

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This document is prepared by Fintness Finserv for internal advisory purposes only. Premium figures are indicative and subject to final underwriting approval. Verify all client details before submission. Insurance products are subject to market and underwriting risks. Please read the policy document carefully before signing.
  </div>

</div>
<script>
  if (document.fonts) {
    document.fonts.ready.then(() => window.print());
  } else {
    window.onload = () => setTimeout(() => window.print(), 400);
  }
</script>
</body>
</html>`;
};

export const triggerInsuranceProspectDownload = (prospect, items = null) => {
  const html = generateHTML({ prospect, items });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.addEventListener('load', () => URL.revokeObjectURL(url));
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
};
