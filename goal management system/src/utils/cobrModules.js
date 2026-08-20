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

import { uid } from './calc';

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

export const CLAIM_TYPES = ['Death', 'Health / Hospitalisation', 'Accident', 'Critical Illness', 'Maturity', 'Motor', 'Other'];

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
    { key: 'collect', label: 'Document Collected', to: 'Document Collected', tone: 'blue' },
  ],
  'Document Collected': [
    { key: 'submit', label: 'Claim Submitted', to: 'Claim Submitted', tone: 'blue' },
  ],
  'Claim Submitted': INSURER_DECISION,
  'Documents Submitted': INSURER_DECISION,
  'Additional Document Required': [
    { key: 'docs-submitted', label: 'Documents Submitted', to: 'Documents Submitted', tone: 'blue', requiresAttachment: true },
  ],
  'Claim Approved': [
    { key: 'full', label: 'Full Settlement', to: 'Claim Settled', tone: 'emerald', requiresAmount: true, amountLabel: 'Settlement amount received', closes: true },
    { key: 'partial', label: 'Partial Settlement', to: 'Claim Submitted', tone: 'amber', requiresAmount: true, amountLabel: 'Amount received in this part-settlement' },
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

// ---------------------------------------------------------------------------
// FIXED DEPOSITS
// ---------------------------------------------------------------------------
export const FD_STAGES = ['Qualified', 'WhatsApp Message Sent', 'FD Renewed by Client', 'Invested With Us'];

export const FD_STAGE_TONE = {
  Qualified: 'slate',
  'WhatsApp Message Sent': 'blue',
  'FD Renewed by Client': 'blue',
  'Invested With Us': 'emerald',
};

export const FD_TERMINAL = new Set(['FD Renewed by Client', 'Invested With Us']);

// ---------------------------------------------------------------------------
// OTHER INSURANCE POLICIES — a register of policies held outside the
// renewal/claim flows.
// ---------------------------------------------------------------------------
export const POLICY_STAGES = ['Qualified', 'Active', 'Due for Renewal', 'Lapsed', 'Matured', 'Surrendered', 'Closed'];

export const POLICY_STAGE_TONE = {
  Qualified: 'slate',
  Active: 'emerald',
  'Due for Renewal': 'amber',
  Lapsed: 'rose',
  Matured: 'blue',
  Surrendered: 'violet',
  Closed: 'slate',
};

export const POLICY_TERMINAL = new Set(['Matured', 'Surrendered', 'Closed']);

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
