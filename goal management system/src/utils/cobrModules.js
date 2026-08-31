// The COBR workspace's sibling registers: Renewals, Claims, Fixed Deposits and
// Other Insurance Policies.
//
// Same architecture decision as COBR itself (see utils/cobr.js): each record IS
// a Task row, tagged by `relatedTo`, so all four ride the existing /api/tasks
// sync pipeline, RBAC engine, activity log and notification plumbing — no new
// Prisma model, no migration. Server-side `taskModuleFor` maps every one of
// these `relatedTo` values onto the existing `cobr` permission-matrix column,
// so the whole workspace stays governed by that single column.
//
// Only the per-type payload fields and the dedicated UI differ.

import { useState } from 'react';
import { uid } from './calc';
import { loadTasks } from './tasks';
import { canDo } from './permissions';
import { getCurrentUser } from './auth';

export const REC = {
  COBR: 'COBR',
  RENEWAL: 'RENEWAL',
  CLAIM: 'CLAIM',
  FD: 'FD',
  POLICY: 'POLICY',
};

// Every relatedTo value the COBR workspace owns — the server mirrors this list.
export const COBR_WORKSPACE_TYPES = [REC.COBR, REC.RENEWAL, REC.CLAIM, REC.FD, REC.POLICY];

export const isRenewal = (t) => t?.relatedTo === REC.RENEWAL;
export const isClaim = (t) => t?.relatedTo === REC.CLAIM;
export const isFd = (t) => t?.relatedTo === REC.FD;
export const isPolicy = (t) => t?.relatedTo === REC.POLICY;

// Other Insurance Policies keeps the original list — only Renewal/Claim's
// Insurance Type was asked to change (see RENEWAL_CLAIM_INSURANCE_TYPES).
export const INSURANCE_TYPES = [
  'Term Life',
  'Health / Medical',
  'Personal Accident',
  'Critical Illness',
  'Motor',
  'Home',
  'Travel',
  'Endowment / Savings',
  'ULIP',
  'Other',
];

// Renewal + Claim's Insurance Type list — Endowment/Savings and ULIP dropped,
// Top Up / Marine / Indemnity / Fire added.
export const RENEWAL_CLAIM_INSURANCE_TYPES = [
  'Term Life',
  'Health / Medical',
  'Top Up',
  'Personal Accident',
  'Critical Illness',
  'Motor',
  'Home',
  'Fire',
  'Marine',
  'Travel',
  'Indemnity',
  'Other',
];

// Motor's cascading Sub Type: pick the vehicle first, then — once that's
// chosen — the coverage. The second dropdown only renders once the first has
// a value.
export const MOTOR_VEHICLE_TYPES = ['Car', 'Bike'];
export const MOTOR_COVERAGE_TYPES = ['First Party', 'Third Party'];

export const CLAIM_TYPES = ['Reimbursement', 'Day Care', 'OPD', 'Cashless', 'Hospitalization', 'Health Checkup', 'Travel', 'Marine', 'Motor', 'Fire'];

// ---------------------------------------------------------------------------
// Stage tones — one shared vocabulary so a badge looks the same everywhere.
// ---------------------------------------------------------------------------
export const TONE = {
  slate: 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/50',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-900/40',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/30 dark:text-violet-400 dark:ring-violet-900/40',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40',
};

// ---------------------------------------------------------------------------
// RENEWALS
// ---------------------------------------------------------------------------
export const MODE_OF_PAYMENT_OPTIONS = ['Online', 'Auto Debit'];

export const RENEWAL_STAGES = [
  'Qualified',
  'WhatsApp Link Sent',
  'Call Done',
  'Payment Done',
  'Policy Document Upload',
  'Policy Document Shared',
  'Close Lost',
];

export const RENEWAL_STAGE_TONE = {
  Qualified: 'slate',
  'WhatsApp Link Sent': 'blue',
  'Call Done': 'blue',
  'Payment Done': 'amber',
  'Policy Document Upload': 'violet',
  'Policy Document Shared': 'emerald',
  'Close Lost': 'rose',
};

// Attachments unlock at Payment Done and stay unlocked for every stage after
// it — the two later stages (Policy Document Upload / Policy Document Shared)
// are literally about the document, so locking the control back down there
// would make them impossible to complete.
const RENEWAL_ATTACH_FROM = RENEWAL_STAGES.indexOf('Payment Done');
export function renewalAttachmentsUnlocked(stage) {
  const i = RENEWAL_STAGES.indexOf(stage);
  return i >= 0 && i >= RENEWAL_ATTACH_FROM && stage !== 'Close Lost';
}

export const RENEWAL_TERMINAL = new Set(['Policy Document Shared', 'Close Lost']);

// stage -> the ONLY stages reachable from it — enforces the renewal funnel as
// a strictly sequential flow (each stage becomes available only once the one
// before it is complete) instead of a free jump-to-anything picker. Close
// Lost stays reachable from every working stage (the deal can fall through
// at any point before the policy is actually done), but drops away once the
// renewal is genuinely finished (Policy Document Shared) or already lost.
export const RENEWAL_ACTIONS = {
  Qualified: ['WhatsApp Link Sent', 'Close Lost'],
  'WhatsApp Link Sent': ['Call Done', 'Close Lost'],
  'Call Done': ['Payment Done', 'Close Lost'],
  'Payment Done': ['Policy Document Upload', 'Close Lost'],
  'Policy Document Upload': ['Policy Document Shared', 'Close Lost'],
  'Policy Document Shared': [],
  'Close Lost': [],
};

// Up Sell / Cross Sell ride alongside the stage rather than replacing it — an
// upsell is something that happens DURING a renewal, so a record can sit at
// Payment Done and still be flagged as an upsell.
export const RENEWAL_OPPORTUNITIES = ['Up Sell', 'Cross Sell'];

// ---------------------------------------------------------------------------
// CLAIMS — a looping workflow, driven by a transition map rather than a fixed
// linear stage list, so Additional Document Required can repeat any number of
// times until the claim is Settled or Rejected.
// ---------------------------------------------------------------------------
export const CLAIM_STAGES = [
  'Qualified',
  'Document Collected',
  'Claim Submitted',
  'Additional Document Required',
  'Documents Submitted',
  'Claim Approved',
  'Claim Denied',
  'Escalate to Ombudsman',
  'Ombudsman - Additional Document Required',
  'Claim Rejected',
  'Claim Settled',
];

export const CLAIM_STAGE_TONE = {
  Qualified: 'slate',
  'Document Collected': 'blue',
  'Claim Submitted': 'blue',
  'Additional Document Required': 'amber',
  'Documents Submitted': 'blue',
  'Claim Approved': 'emerald',
  'Claim Denied': 'rose',
  'Escalate to Ombudsman': 'violet',
  'Ombudsman - Additional Document Required': 'amber',
  'Claim Rejected': 'rose',
  'Claim Settled': 'emerald',
};

export const CLAIM_TERMINAL = new Set(['Claim Rejected', 'Claim Settled']);
export const claimIsClosed = (stage) => CLAIM_TERMINAL.has(stage);

// The three options offered every time a claim sits with the insurer awaiting
// a decision — right after submission, and again after every re-submission.
const INSURER_DECISION = [
  { key: 'addl', label: 'Additional Document Required', to: 'Additional Document Required', tone: 'amber' },
  { key: 'approved', label: 'Claim Approved', to: 'Claim Approved', tone: 'emerald' },
  { key: 'denied', label: 'Claim Denied', to: 'Claim Denied', tone: 'rose', requiresNote: true, noteLabel: 'Reason for denial' },
];

// stage -> the actions available from it. `to` is the resulting stage; an
// action whose `to` equals its own stage is a deliberate loop (recorded in
// history, stage unchanged) — which is exactly the Ombudsman re-denial.
export const CLAIM_ACTIONS = {
  Qualified: [
    {
      key: 'collect', label: 'Document Collected', to: 'Document Collected', tone: 'blue', showAttachment: true,
      attachmentLabel: 'Upload Claim Document (optional)',
    },
  ],
  'Document Collected': [
    { key: 'submit', label: 'Claim Submitted', to: 'Claim Submitted', tone: 'blue' },
  ],
  'Claim Submitted': INSURER_DECISION,
  'Documents Submitted': INSURER_DECISION,
  'Additional Document Required': [
    { key: 'docs-submitted', label: 'Documents Submitted', to: 'Documents Submitted', tone: 'blue', requiresAttachment: true },
  ],
  // Settlement Type. Full Settlement needs no typed amount — it's always the
  // exact amount still owed (claimAmount minus whatever's already been
  // settled by an earlier partial round), computed and shown read-only
  // rather than asking the user to retype a number that's already known.
  // Partial keeps the manual amount entry, since only the person processing
  // it knows what was actually received.
  'Claim Approved': [
    { key: 'full', label: 'Full Settlement', to: 'Claim Settled', tone: 'emerald', autoAmount: true, amountLabel: 'Settlement Amount', closes: true },
    { key: 'partial', label: 'Partial Settlement', to: 'Claim Submitted', tone: 'amber', requiresAmount: true, amountLabel: 'Partial Settlement Amount' },
  ],
  'Claim Denied': [
    { key: 'escalate', label: 'Escalate to Ombudsman', to: 'Escalate to Ombudsman', tone: 'violet' },
  ],
  'Escalate to Ombudsman': [
    { key: 'omb-addl', label: 'Additional Document Required', to: 'Ombudsman - Additional Document Required', tone: 'amber' },
    { key: 'omb-approved', label: 'Claim Approved', to: 'Claim Approved', tone: 'emerald' },
    { key: 'omb-denied', label: 'Claim Denied', to: 'Escalate to Ombudsman', tone: 'rose', requiresNote: true, noteLabel: 'Reason for denial' },
    { key: 'omb-rejected', label: 'Claim Rejected', to: 'Claim Rejected', tone: 'rose', requiresNote: true, noteLabel: 'Reason for rejection', closes: true },
  ],
  'Ombudsman - Additional Document Required': [
    { key: 'omb-docs', label: 'Documents Submitted', to: 'Escalate to Ombudsman', tone: 'blue', requiresAttachment: true },
  ],
  'Claim Rejected': [],
  'Claim Settled': [],
};

export const claimActionsFor = (stage) => CLAIM_ACTIONS[stage] || [];

// Cumulative amount actually received across every (part-)settlement logged.
export function claimSettledTotal(history = []) {
  return (history || []).reduce((sum, h) => sum + (Number(h.settlementAmount) || 0), 0);
}

// The settlement column's display: green once the claim is genuinely fully
// settled (Claim Settled and the running total covers the claim amount),
// orange once SOME money has come in but it's still in progress, or nothing
// if no settlement has happened yet. Shared by the Claim table column and
// the in-modal settlement display so both agree on what "full" vs "partial"
// means, rather than each guessing independently.
export function claimSettlementDisplay(claim) {
  const settled = claimSettledTotal(claim?.stageHistory);
  const claimAmount = Number(claim?.claimAmount) || 0;
  if (settled <= 0) return { amount: 0, kind: 'none' };
  if (claim?.stage === 'Claim Settled' && settled >= claimAmount) return { amount: settled, kind: 'full' };
  return { amount: settled, kind: 'partial' };
}

// ---------------------------------------------------------------------------
// FIXED DEPOSITS — same action-button + transition-map architecture as
// Claims/Policies: Qualified -> WhatsApp Link Sent -> Waiting for Update,
// then one of two outcomes. FD Renewed needs nothing further; Invested With
// Us requires the Investment Amount before it can be confirmed.
// ---------------------------------------------------------------------------
export const FD_STAGES = ['Qualified', 'WhatsApp Link Sent', 'Waiting for Update', 'FD Renewed', 'Invested With Us'];

export const FD_STAGE_TONE = {
  Qualified: 'slate',
  'WhatsApp Link Sent': 'blue',
  'Waiting for Update': 'amber',
  'FD Renewed': 'emerald',
  'Invested With Us': 'violet',
};

export const FD_TERMINAL = new Set(['FD Renewed', 'Invested With Us']);
export const fdIsClosed = (stage) => FD_TERMINAL.has(stage);

export const FD_ACTIONS = {
  Qualified: [
    { key: 'whatsapp', label: 'WhatsApp Link Sent', to: 'WhatsApp Link Sent', tone: 'blue' },
  ],
  'WhatsApp Link Sent': [
    { key: 'waiting', label: 'Waiting for Update', to: 'Waiting for Update', tone: 'amber' },
  ],
  'Waiting for Update': [
    // FD Renewed means there's nothing to settle, just a future check-in to
    // schedule — same reminderFlow as Policy Continued (asks for a Next
    // Reminder Date, which auto-creates a follow-up Task on confirm).
    { key: 'renewed', label: 'FD Renewed', to: 'FD Renewed', tone: 'emerald', reminderFlow: true, closes: true },
    { key: 'invested', label: 'Invested With Us', to: 'Invested With Us', tone: 'violet', requiresAmount: true, amountLabel: 'Investment Amount', closes: true },
  ],
  'FD Renewed': [],
  'Invested With Us': [],
};

export const fdActionsFor = (stage) => FD_ACTIONS[stage] || [];

// ---------------------------------------------------------------------------
// OTHER INSURANCE POLICIES — a register of policies held outside the
// renewal/claim flows. Same action-button + transition-map architecture as
// Claims: the working stages progress one after another, then "Waiting For
// Update" branches into whichever of the three outcomes actually happened.
// ---------------------------------------------------------------------------
// Real-world status of the underlying policy itself — plain descriptive
// metadata, independent of (and not read by) the CRM workflow stage above.
export const POLICY_STATUS_OPTIONS = ['Active', 'Due for Renewal', 'Lapsed', 'Matured', 'Surrendered', 'Closed'];
export const PAYMENT_FREQUENCY_OPTIONS = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Single'];

export const POLICY_STAGES = [
  'Qualified',
  'Policy Working Done',
  'Shared With Client',
  'Waiting For Update',
  'Policy Surrendered',
  'Policy Matured',
  'Policy Continued',
];

export const POLICY_STAGE_TONE = {
  Qualified: 'slate',
  'Policy Working Done': 'blue',
  'Shared With Client': 'blue',
  'Waiting For Update': 'amber',
  'Policy Surrendered': 'rose',
  'Policy Matured': 'violet',
  'Policy Continued': 'emerald',
};

export const POLICY_TERMINAL = new Set(['Policy Surrendered', 'Policy Matured', 'Policy Continued']);
export const policyIsClosed = (stage) => POLICY_TERMINAL.has(stage);

// stage -> the actions available from it. The three outcomes off "Waiting For
// Update" each capture something different:
//  - `outcomeFlow`: asks "Amount Received?" (Yes/No) first, THEN reveals
//    either an Amount field (Yes) or a Reason field (No) — Policy Surrendered
//    and Policy Matured both work this way, since either can come with or
//    without money changing hands.
//  - `reminderFlow`: asks for a Next Reminder Date instead — Policy Continued
//    means there's nothing to settle, just a future check-in to schedule
//    (which auto-creates a follow-up Task on confirm — see OtherPolicyModal).
// The plain forward hops (Qualified -> ... -> Waiting For Update) need no
// mandatory reason, unlike Renewal's every-step convention — there's nothing
// decision-worthy to record until an actual outcome happens.
export const POLICY_ACTIONS = {
  Qualified: [
    { key: 'working', label: 'Policy Working Done', to: 'Policy Working Done', tone: 'blue' },
  ],
  'Policy Working Done': [
    { key: 'shared', label: 'Shared With Client', to: 'Shared With Client', tone: 'blue' },
  ],
  'Shared With Client': [
    { key: 'waiting', label: 'Waiting For Update', to: 'Waiting For Update', tone: 'amber' },
  ],
  'Waiting For Update': [
    { key: 'surrendered', label: 'Policy Surrendered', to: 'Policy Surrendered', tone: 'rose', outcomeFlow: true, closes: true },
    { key: 'matured', label: 'Policy Matured', to: 'Policy Matured', tone: 'violet', outcomeFlow: true, closes: true },
    { key: 'continued', label: 'Policy Continued', to: 'Policy Continued', tone: 'emerald', reminderFlow: true, closes: true },
  ],
  'Policy Surrendered': [],
  'Policy Matured': [],
  'Policy Continued': [],
};

export const policyActionsFor = (stage) => POLICY_ACTIONS[stage] || [];

// ---------------------------------------------------------------------------
// Excel import/export field specs — one entry per Sub-Form field, in the
// exact order/labels used for BOTH Download and Upload (utils/cobrExcel.js),
// so the two formats can never drift apart.
//
// `pan` is the actual unique identifier — a client's (or family member's)
// NAME is not guaranteed unique, so PAN alone drives the upload match;
// `groupLeader`/`applicant` stay in the sheet purely as human-readable
// labels, auto-filled from whichever PAN matched (not required, not used
// for matching). `assignedTo` (every module's team-member field, via
// AssignmentFields) is likewise resolved specially by the Excel engine.
// ---------------------------------------------------------------------------
export const RENEWAL_EXCEL_FIELDS = [
  { key: 'groupLeader', label: 'Client / Group Leader', type: 'text' },
  { key: 'applicant', label: 'Applicant', type: 'text' },
  { key: 'pan', label: 'Applicant PAN', type: 'text', required: true },
  { key: 'insuranceType', label: 'Insurance Type', type: 'select', options: RENEWAL_CLAIM_INSURANCE_TYPES },
  { key: 'motorVehicleType', label: 'Sub Type (Vehicle)', type: 'select', options: MOTOR_VEHICLE_TYPES },
  { key: 'motorCoverageType', label: 'Sub Type (Coverage)', type: 'select', options: MOTOR_COVERAGE_TYPES },
  { key: 'companyName', label: 'Company Name', type: 'text' },
  { key: 'policyName', label: 'Policy Name', type: 'text' },
  { key: 'policyNumber', label: 'Policy Number', type: 'text' },
  { key: 'sumAssured', label: 'Sum Assured', type: 'number' },
  { key: 'premiumAmount', label: 'Premium Amount', type: 'number' },
  { key: 'paymentLink', label: 'Payment Link', type: 'text' },
  { key: 'modeOfPayment', label: 'Mode of Payment', type: 'select', options: MODE_OF_PAYMENT_OPTIONS },
  { key: 'brokerCode', label: 'Broker Code', type: 'text' },
  { key: 'dueDate', label: 'Due Date', type: 'date' },
  { key: 'assignedTo', label: 'Assigned To', type: 'text', required: true },
  { key: 'upSell', label: 'Up Sell', type: 'boolean' },
  { key: 'upSellAmount', label: 'Up Sell Amount', type: 'number' },
  { key: 'crossSell', label: 'Cross Sell', type: 'boolean' },
  { key: 'crossSellCompany', label: 'Cross Sell Company', type: 'text' },
  { key: 'crossSellPolicy', label: 'Cross Sell Policy Name', type: 'text' },
  { key: 'crossSellAmount', label: 'Cross Sell Amount', type: 'number' },
];
export const renewalDedupeKey = (r) => (r.groupLeaderId && r.applicant ? `${r.groupLeaderId}|${r.applicant}|${(r.policyNumber || '').toLowerCase()}` : '');

export const CLAIM_EXCEL_FIELDS = [
  { key: 'groupLeader', label: 'Client / Group Leader', type: 'text' },
  { key: 'applicant', label: 'Applicant', type: 'text' },
  { key: 'pan', label: 'Applicant PAN', type: 'text', required: true },
  { key: 'insuranceType', label: 'Insurance Type', type: 'select', options: RENEWAL_CLAIM_INSURANCE_TYPES },
  { key: 'motorVehicleType', label: 'Sub Type (Vehicle)', type: 'select', options: MOTOR_VEHICLE_TYPES },
  { key: 'motorCoverageType', label: 'Sub Type (Coverage)', type: 'select', options: MOTOR_COVERAGE_TYPES },
  { key: 'policyName', label: 'Policy Name', type: 'text' },
  { key: 'policyNumber', label: 'Policy Number', type: 'text' },
  { key: 'sumAssured', label: 'Sum Assured', type: 'number' },
  { key: 'claimType', label: 'Claim Type', type: 'select', options: CLAIM_TYPES },
  { key: 'claimAmount', label: 'Claim Amount', type: 'number' },
  { key: 'dueDate', label: 'Target Date', type: 'date' },
  { key: 'assignedTo', label: 'Assigned To', type: 'text', required: true },
];
export const claimDedupeKey = (r) => (r.groupLeaderId && r.applicant ? `${r.groupLeaderId}|${r.applicant}|${(r.policyNumber || '').toLowerCase()}|${(r.claimType || '').toLowerCase()}` : '');

export const FD_EXCEL_FIELDS = [
  { key: 'groupLeader', label: 'Client / Group Leader', type: 'text' },
  { key: 'applicant', label: 'Applicant', type: 'text' },
  { key: 'pan', label: 'Applicant PAN', type: 'text', required: true },
  { key: 'bankName', label: 'Bank Name', type: 'text' },
  { key: 'startingDate', label: 'Starting Date', type: 'date' },
  { key: 'maturityDate', label: 'Maturity Date', type: 'date' },
  { key: 'maturityAmount', label: 'Maturity Amount', type: 'number' },
  { key: 'assignedTo', label: 'Assigned To', type: 'text', required: true },
];
export const fdDedupeKey = (r) => (r.groupLeaderId && r.applicant ? `${r.groupLeaderId}|${r.applicant}|${(r.bankName || '').toLowerCase()}|${r.startingDate || ''}` : '');

export const POLICY_EXCEL_FIELDS = [
  { key: 'groupLeader', label: 'Client / Group Leader', type: 'text' },
  { key: 'applicant', label: 'Applicant', type: 'text' },
  { key: 'pan', label: 'Applicant PAN', type: 'text', required: true },
  { key: 'issuingDate', label: 'Issuing Date', type: 'date' },
  { key: 'insuranceType', label: 'Insurance Type', type: 'select', options: INSURANCE_TYPES },
  { key: 'companyName', label: 'Company Name', type: 'text' },
  { key: 'policyName', label: 'Policy Name', type: 'text' },
  { key: 'policyNumber', label: 'Policy Number', type: 'text' },
  { key: 'policyStatus', label: 'Policy Status', type: 'select', options: POLICY_STATUS_OPTIONS },
  { key: 'sumAssured', label: 'Sum Assured', type: 'number' },
  { key: 'premiumAmount', label: 'Premium Amount', type: 'number' },
  { key: 'accidentalDeathBenefitAmount', label: 'Accidental Death Benefit Amount', type: 'number' },
  { key: 'currentValue', label: 'Current Value', type: 'number' },
  { key: 'paymentFrequency', label: 'Payment Frequency', type: 'select', options: PAYMENT_FREQUENCY_OPTIONS },
  { key: 'premiumPayingTerm', label: 'Premium Paying Term', type: 'number' },
  { key: 'policyTerm', label: 'Term', type: 'number' },
  { key: 'moneyBack', label: 'Money Back', type: 'text' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'maturityDate', label: 'Maturity Date', type: 'date' },
  { key: 'dueDate', label: 'Renewal Date', type: 'date' },
  { key: 'assignedTo', label: 'Assigned To', type: 'text', required: true },
];
export const policyDedupeKey = (r) => (r.groupLeaderId && r.applicant ? `${r.groupLeaderId}|${r.applicant}|${(r.policyNumber || '').toLowerCase()}` : '');

export const COBR_EXCEL_SPEC = {
  [REC.RENEWAL]: { type: REC.RENEWAL, fields: RENEWAL_EXCEL_FIELDS, dedupeKey: renewalDedupeKey, sheetName: 'Renewals', label: 'Renewal' },
  [REC.CLAIM]: { type: REC.CLAIM, fields: CLAIM_EXCEL_FIELDS, dedupeKey: claimDedupeKey, sheetName: 'Claims', label: 'Claim' },
  [REC.FD]: { type: REC.FD, fields: FD_EXCEL_FIELDS, dedupeKey: fdDedupeKey, sheetName: 'Fixed Deposits', label: 'Fixed Deposit' },
  [REC.POLICY]: { type: REC.POLICY, fields: POLICY_EXCEL_FIELDS, dedupeKey: policyDedupeKey, sheetName: 'Other Insurance Policies', label: 'Policy' },
};

const EXCEL_INITIAL_STAGE = {
  [REC.RENEWAL]: RENEWAL_STAGES[0],
  [REC.CLAIM]: CLAIM_STAGES[0],
  [REC.FD]: FD_STAGES[0],
  [REC.POLICY]: POLICY_STAGES[0],
};

// Turns one parsed-and-validated Excel row into a full Task-shaped record —
// the same scaffolding every modal's handleSave already builds for a
// brand-new record (initial stage, a creation history entry, a creation
// comment — noting it came from an Excel import so that's visible in
// Comments & Logs).
export function buildImportedRecord(type, resolved, me) {
  const now = new Date().toISOString();
  const stage = EXCEL_INITIAL_STAGE[type];
  const by = me?.name || 'System';
  const extra = type === REC.RENEWAL || type === REC.POLICY ? resolved.policyName
    : type === REC.CLAIM ? resolved.claimType
      : resolved.bankName;
  const record = {
    id: uid(),
    relatedTo: type,
    taskName: recordTaskName(type, resolved.applicant, extra),
    ...resolved,
    stage,
    stageHistory: [makeHistoryEntry({ stage, action: stage, note: 'Imported from Excel', by })],
    comments: [{ at: now, by, text: `Record created via Excel import at stage "${stage}".` }],
    subPersons: [],
    subPerson: '',
    attachments: [],
    assignedBy: me?.id || '',
    createdAt: now,
    updatedAt: now,
  };
  // FD's due date is the maturity date itself, not its own sub-form column.
  if (type === REC.FD) record.dueDate = resolved.maturityDate;
  return record;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
export const STAGE_SETS = {
  [REC.RENEWAL]: { stages: RENEWAL_STAGES, tone: RENEWAL_STAGE_TONE, terminal: RENEWAL_TERMINAL },
  [REC.CLAIM]: { stages: CLAIM_STAGES, tone: CLAIM_STAGE_TONE, terminal: CLAIM_TERMINAL },
  [REC.FD]: { stages: FD_STAGES, tone: FD_STAGE_TONE, terminal: FD_TERMINAL },
  [REC.POLICY]: { stages: POLICY_STAGES, tone: POLICY_STAGE_TONE, terminal: POLICY_TERMINAL },
};

// Outline pill-button tone classes for the stage picker — the same look
// used for Claim's "What happened next?" action buttons, reused verbatim by
// Renewal/FD/Policy's stage picker so every register's stage control looks
// identical, not just Claim's.
export const STAGE_BTN_TONE = {
  slate: 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60',
  amber: 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-950/40',
  emerald: 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-900/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
  rose: 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40',
  blue: 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-950/40',
  violet: 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-900/50 hover:bg-violet-50 dark:hover:bg-violet-950/40',
};

export const stageBadgeCls = (type, stage) => {
  const tone = STAGE_SETS[type]?.tone?.[stage];
  return TONE[tone] || TONE.slate;
};

export const isOpenStage = (type, stage) => !(STAGE_SETS[type]?.terminal?.has(stage));

// One immutable history row. A claim never overwrites a stage — every
// transition appends one of these, carrying whatever that transition captured.
export const makeHistoryEntry = ({ stage, action, note, attachments, settlementAmount, by }) => ({
  id: uid(),
  at: new Date().toISOString(),
  by: by || 'System',
  stage,
  action: action || '',
  note: note || '',
  attachments: attachments || [],
  ...(settlementAmount != null && settlementAmount !== '' ? { settlementAmount: Number(settlementAmount) || 0 } : {}),
});

// Task-shaped name, so these rows read sensibly anywhere the generic Tasks
// module or a notification renders `taskName`.
export const recordTaskName = (type, applicant, extra) => {
  const label = { [REC.RENEWAL]: 'Renewal', [REC.CLAIM]: 'Claim', [REC.FD]: 'Fixed Deposit', [REC.POLICY]: 'Policy' }[type] || 'Record';
  return [label, applicant || 'Unknown', extra].filter(Boolean).join(' - ');
};

// ---------------------------------------------------------------------------
// Documents module integration — every attachment uploaded inside a Renewal /
// Claim / FD / Other-Policy record surfaces in the client's Documents tab and
// the app-wide Documents module as an ordinary "Documents"-type entry, same
// as anything uploaded there directly. The record stays the single source of
// truth (no copy is written anywhere) — this only READS it into the shape
// DocumentsView.jsx / ClientProfile.jsx already expect (`type: 'custom'`, the
// same bucket a manually-uploaded document lands in).
const COBR_RECORD_LABEL = {
  [REC.RENEWAL]: (r) => `Renewal — ${r.insuranceType || 'Insurance'}${r.policyNumber ? ` (${r.policyNumber})` : ''}`,
  [REC.CLAIM]: (r) => `Claim — ${r.claimType || r.insuranceType || 'Insurance'}${r.policyNumber ? ` (${r.policyNumber})` : ''}`,
  [REC.FD]: (r) => `Fixed Deposit — ${r.bankName || 'Bank'}`,
  [REC.POLICY]: (r) => `Policy — ${r.insuranceType || 'Insurance'}${r.companyName ? ` (${r.companyName})` : ''}`,
};
export function cobrWorkspaceDocuments(clients) {
  const workspaceTasks = loadTasks().filter((t) => isRenewal(t) || isClaim(t) || isFd(t) || isPolicy(t));
  const docs = [];
  workspaceTasks.forEach((r) => {
    const client = clients.find((c) => c.id === r.groupLeaderId) || clients.find((c) => c.name === r.groupLeader);
    if (!client) return;
    const recordLabel = (COBR_RECORD_LABEL[r.relatedTo] || (() => 'Record'))(r);
    (r.attachments || []).forEach((item) => {
      docs.push({
        id: `cobr-${r.id}-${item.id}`,
        type: 'custom',
        client,
        title: item.name || item.fileName || 'Untitled Document',
        date: item.date || r.updatedAt || '',
        isLegacy: false,
        attachment: item,
        sourceLabel: `${recordLabel} · ${r.applicant || ''}`.trim(),
        // Lives on the Renewal/Claim/FD/Policy record, not clientDetails
        // .attachments — deleting/renaming it belongs to that record's own
        // editor, not the Documents view.
        deletable: false,
      });
    });
  });
  return docs;
}

// ---------------------------------------------------------------------------
// Shared edit-gate + change-logging helpers for every record editor in the
// COBR workspace (Renewal/Claim/FD/Policy — COBR itself is unchanged).
// ---------------------------------------------------------------------------

// Every record opens read-only ("View Mode") once it exists — only the
// assigner (Assigned By) may unlock full editing (the "Edit" button);
// Assigned By/Assigned To may change the Stage regardless, since that's a
// separate right from editing the record's other fields.
export function useEditGate(module, record, isEdit) {
  const [isEditingMode, setIsEditingMode] = useState(!isEdit);
  const canEditThis = !isEdit || canDo(module, 'editDetails', record);
  const canChangeStageThis = !isEdit || canDo(module, 'changeStage', record);
  const fieldsUnlocked = isEditingMode && canEditThis;
  return { isEditingMode, setIsEditingMode, canEditThis, canChangeStageThis, fieldsUnlocked };
}

// Diffs `original` (the record as loaded) against `updated` (local form
// state) over a curated set of fields, producing one human-readable
// "Changed X: old -> new" line per changed field — e.g. "Changed Premium
// Amount: ₹50,000 -> ₹55,000". `fieldDefs` is [{ key, label, format? }];
// `format` defaults to showing the raw value (or "—" for empty).
export function buildFieldChangeLog(original, updated, fieldDefs) {
  const lines = [];
  for (const { key, label, format } of fieldDefs) {
    const oldV = original?.[key];
    const newV = updated?.[key];
    const oldNorm = oldV == null ? '' : oldV;
    const newNorm = newV == null ? '' : newV;
    if (String(oldNorm) === String(newNorm)) continue;
    const fmt = format || ((v) => (v === '' || v == null ? '—' : String(v)));
    lines.push(`Changed ${label}: ${fmt(oldNorm)} → ${fmt(newNorm)}`);
  }
  return lines;
}

// Attachments are an array, not a scalar — diffed separately by id so an
// add/remove reads as its own log line instead of a raw array dump.
export function diffAttachmentLog(original = [], updated = []) {
  const before = new Map((original || []).map((a) => [a.id, a]));
  const after = new Map((updated || []).map((a) => [a.id, a]));
  const lines = [];
  for (const [id, a] of after) if (!before.has(id)) lines.push(`Attachment added: ${a.fileName || a.name || 'file'}`);
  for (const [id, a] of before) if (!after.has(id)) lines.push(`Attachment removed: ${a.fileName || a.name || 'file'}`);
  return lines;
}

// Turns a list of change-log lines into ready-to-append comment entries.
export function toLogComments(lines) {
  const now = new Date().toISOString();
  const by = getCurrentUser()?.name || 'System';
  return lines.map((text) => ({ at: now, by, text }));
}
