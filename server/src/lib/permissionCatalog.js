// Permission catalog — the single source of truth for the configurable RBAC
// matrix: which modules/actions exist, the default scope per (role, module,
// action), and how "ownership" is resolved per module.
//
// ADMIN is never stored in the matrix — it bypasses every check and is not
// editable/locked open. The roles below are the columns the admin edits,
// INCLUDING `INTERNAL_MANAGER` — a deliberately high-privilege role that
// ships with "close to Admin" default rights (ALL on every action across
// every module) EXCEPT delete, which defaults to NONE like every other role.
// Unlike Admin, every one of its cells is still just a normal, editable
// matrix entry — an admin can dial it down at any time. RM's permissions
// live here too, but a user only *acts as* RM on records assigned to them
// (contextual — see the engine).

export const MATRIX_ROLES = [
  'RM', 'PORTFOLIO_MANAGER', 'INSURANCE_MANAGER', 'SERVICE_MANAGER', 'OPERATIONS_MANAGER', 'INTERNAL_MANAGER', 'INTERNAL_USER',
];
export const ALL_ROLES = ['ADMIN', ...MATRIX_ROLES];

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  RM: 'Relationship Manager',
  PORTFOLIO_MANAGER: 'Portfolio Manager',
  INSURANCE_MANAGER: 'Insurance Manager',
  SERVICE_MANAGER: 'Service Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  INTERNAL_MANAGER: 'Internal Manager',
  INTERNAL_USER: 'Internal User',
};

// Modules (grouped in the editor, in this order) and their action rows.
export const MODULES = [
  { key: 'leads', label: 'Leads', actions: ['create', 'view', 'edit', 'assignRm', 'convert', 'delete'] },
  { key: 'clients', label: 'Clients', actions: ['create', 'view', 'editPersonal', 'delete'] },
  { key: 'goals', label: 'Goal Report', actions: ['create', 'view', 'edit', 'delete'] },
  { key: 'assetAllocation', label: 'Asset Allocation', actions: ['view', 'edit'] },
  { key: 'investmentProposal', label: 'Investment Proposal', actions: ['create', 'view', 'edit'] },
  { key: 'insuranceProposal', label: 'Insurance Proposal', actions: ['create', 'view', 'edit'] },
  { key: 'mom', label: 'MOM', actions: ['create', 'view', 'edit'] },
  { key: 'portfolioReview', label: 'Portfolio Review', actions: ['create', 'view', 'edit'] },
  { key: 'policyReview', label: 'Policy Review', actions: ['view', 'edit'] },
  { key: 'tasks', label: 'Tasks', actions: ['create', 'view', 'editDetails', 'changeStage', 'editLog', 'delete'] },
  { key: 'cobr', label: 'Change of Broker (COBR)', actions: ['create', 'view', 'editDetails', 'changeStage', 'editLog', 'delete'] },
  { key: 'investmentProspects', label: 'Investment Prospects', actions: ['create', 'view', 'editDetails', 'changeStage'] },
  { key: 'insuranceProspects', label: 'Insurance Prospects', actions: ['create', 'view', 'editDetails', 'changeStage'] },
  { key: 'documents', label: 'Documents', actions: ['upload', 'view', 'delete'] },
  { key: 'meetings', label: 'Meetings', actions: ['create', 'view', 'edit', 'delete'] },
  { key: 'queries', label: 'Queries', actions: ['create', 'view', 'editDetails', 'changeStage', 'editLog', 'delete'] },
];

export const ACTION_LABELS = {
  create: 'Create', view: 'View', edit: 'Edit', editPersonal: 'Edit Personal Details',
  editDetails: 'Edit Details', changeStage: 'Change Stage', editLog: 'Edit / Add Log',
  assignRm: 'Assign RM', convert: 'Convert', delete: 'Delete', upload: 'Upload',
};

// How "owned / assigned" and "is RM of this record" are computed per module.
//   self    — record.assignedTo / createdBy is a user id (leads, clients)
//   creator — only the creator (createdBy) owns it (mom, meetings)
//   task    — assigner = departmentOwner, assignee = assignedTo (handled by overlay)
//   client  — ownership flows from the parent client's RM / createdBy
export const OWNERSHIP = {
  leads: 'self', clients: 'self', tasks: 'task', cobr: 'task', queries: 'task', mom: 'creator', meetings: 'creator',
  goals: 'client', assetAllocation: 'client', investmentProposal: 'client', insuranceProposal: 'client',
  portfolioReview: 'client', policyReview: 'client', investmentProspects: 'client', insuranceProspects: 'client',
  documents: 'client',
};

// Compact default scopes. `_` is the fallback for any role not listed.
// A = ALL, S = ASSIGNED, N = NONE.
const A = 'ALL', S = 'ASSIGNED', N = 'NONE';
const DEF = {
  leads: {
    create: { _: A },
    view: { _: A, RM: S },
    edit: { _: N, RM: S, INTERNAL_MANAGER: A },
    assignRm: { _: N, INTERNAL_MANAGER: A },
    convert: { _: N, RM: S, INTERNAL_MANAGER: A },
    delete: { _: N },
  },
  clients: {
    create: { _: N, OPERATIONS_MANAGER: A, INTERNAL_MANAGER: A },
    view: { _: A },
    editPersonal: { _: N, OPERATIONS_MANAGER: A, INTERNAL_MANAGER: A },
    delete: { _: N },
  },
  goals: { create: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, view: { _: A }, edit: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, delete: { _: N } },
  assetAllocation: { view: { _: A }, edit: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A } },
  investmentProposal: { create: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, view: { _: A }, edit: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A } },
  insuranceProposal: { create: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A }, view: { _: A }, edit: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A } },
  mom: { create: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, view: { _: A }, edit: { _: N, PORTFOLIO_MANAGER: S, RM: S, INTERNAL_MANAGER: A } },
  portfolioReview: { create: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, view: { _: A }, edit: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A } },
  policyReview: { view: { _: A }, edit: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A } },
  // Tasks are private to the two people on them: the assigner (departmentOwner)
  // and the assignee (assignedTo). Nobody else can see or edit a task, at any
  // role, by default — "view" is ASSIGNED-only for every role, not just an
  // option an admin has to remember to turn on. Internal Manager is the
  // deliberate exception (oversight, "close to Admin") — it can see/manage
  // every task, not just ones it's on.
  tasks: { create: { _: A }, view: { _: S, INTERNAL_MANAGER: A }, editDetails: { _: S, INTERNAL_MANAGER: A }, changeStage: { _: S, INTERNAL_MANAGER: A }, editLog: { _: S, INTERNAL_MANAGER: A }, delete: { _: N } },
  // COBR (Change of Broker) records ARE Task rows (relatedTo: 'COBR') — same
  // assigner/assignee overlay and stage rules as Tasks, just a separately
  // admin-configurable matrix column so who may create/edit a broker-change
  // request can be tuned independently of generic task rights. Defaults
  // mirror Tasks' own defaults exactly (no behavior change until an admin
  // customizes this row).
  cobr: { create: { _: A }, view: { _: S, INTERNAL_MANAGER: A }, editDetails: { _: S, INTERNAL_MANAGER: A }, changeStage: { _: S, INTERNAL_MANAGER: A }, editLog: { _: S, INTERNAL_MANAGER: A }, delete: { _: N } },
  // Prospects have no separate "create" step in the original spec — a prospect
  // is created as a side effect of building the proposal that spawns it. We
  // still give it its own explicit, independently-editable matrix cell
  // (rather than silently inheriting the Proposal's create rule) so the
  // admin can see and tune it directly here — defaults mirror the matching
  // Proposal's create rule for a sane out-of-the-box behavior.
  investmentProspects: { create: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, view: { _: A }, editDetails: { _: N, PORTFOLIO_MANAGER: A, RM: S, INTERNAL_MANAGER: A }, changeStage: { _: N, SERVICE_MANAGER: A, INTERNAL_MANAGER: A } },
  insuranceProspects: { create: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A }, view: { _: A }, editDetails: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A }, changeStage: { _: N, INSURANCE_MANAGER: A, INTERNAL_MANAGER: A } },
  documents: { upload: { _: A }, view: { _: A }, delete: { _: N } },
  meetings: { create: { _: A }, view: { _: A }, edit: { _: S, INTERNAL_MANAGER: A }, delete: { _: N } },
  // Queries are private to the two people on them: whoever raised it
  // (departmentOwner) and whoever it's raised to (assignedTo) — same overlay
  // as Tasks (see permissions.js), same defaults.
  queries: { create: { _: A }, view: { _: S, INTERNAL_MANAGER: A }, editDetails: { _: S, INTERNAL_MANAGER: A }, changeStage: { _: S, INTERNAL_MANAGER: A }, editLog: { _: S, INTERNAL_MANAGER: A }, delete: { _: N } },
};

export function defaultScope(role, module, action) {
  const cell = DEF[module]?.[action];
  if (!cell) return 'NONE';
  return cell[role] ?? cell._ ?? 'NONE';
}

// Every (role, module, action) row with its default scope — used to seed and to
// backfill missing cells when the matrix is read.
export function buildDefaultRows() {
  const rows = [];
  for (const { key: module, actions } of MODULES) {
    for (const action of actions) {
      for (const role of MATRIX_ROLES) {
        rows.push({ role, module, action, scope: defaultScope(role, module, action) });
      }
    }
  }
  return rows;
}
