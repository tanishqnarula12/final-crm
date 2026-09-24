// UI-gating helpers, now backed by the admin-configurable matrix engine
// (services/permissions.js). The named helpers keep their old signatures so
// existing component call-sites don't change; the `me` argument is ignored (the
// engine reads the current user internally). The server remains the hard gate.

import { can, canMoveToStage } from '../services/permissions';

export { can, canMoveToStage };

// The stages a picker should offer: the current stage (so it still displays)
// plus only the stages this user could actually save. Anything the permission
// matrix wouldn't allow simply isn't shown, rather than being selectable and
// then silently reverted or blocked on save.
export const allowedStageOptions = (module, record, currentStage, stages) =>
  stages.filter((s) => s === currentStage || canMoveToStage(module, record, currentStage, s));

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

export const isAdmin = (me) => Array.isArray(me?.roles) && me.roles.includes('ADMIN');

// ---- Leads -----------------------------------------------------------------
export const canCreateLead = () => can('leads', 'create');
export const canEditLead = (_me, lead) => can('leads', 'edit', lead);
// Pass the lead so an "Assigned" scope on Assign RM resolves against it, the
// same record the server checks (routes/leads.js → syncModule's 'matrix' mode).
export const canAssignLead = (_me, lead) => can('leads', 'assignRm', lead);
export const canDeleteLead = (_me, lead) => can('leads', 'delete', lead);

// ---- Clients ---------------------------------------------------------------
export const canCreateClient = () => can('clients', 'create');
export const canEditClient = () => can('clients', 'editPersonal');
export const canDeleteClient = () => can('clients', 'delete');

// ---- Tasks -----------------------------------------------------------------
export const canCreateTask = () => can('tasks', 'create');
export const canEditTask = (_me, task) => can('tasks', 'editDetails', task);
export const canDeleteTask = (_me, task) => can('tasks', 'delete', task);
export const canChangeTaskStage = (_me, task, fromStage, toStage) =>
  can('tasks', 'changeStage', task, { fromStage, toStage });

// ---- Queries -----------------------------------------------------------------
export const canCreateQuery = () => can('queries', 'create');
export const canEditQuery = (_me, query) => can('queries', 'editDetails', query);
export const canChangeQueryStage = (_me, query, fromStage, toStage) =>
  can('queries', 'changeStage', query, { fromStage, toStage });
export const canLogQuery = (_me, query) => can('queries', 'editLog', query);

// ---- Meetings ---------------------------------------------------------------
// Only the creator, host, or an attendee (or Admin/Internal Manager per the
// matrix) may edit, mark-done, cancel, or reschedule a meeting — everyone
// else can view it.
export const canEditMeeting = (_me, meeting) => can('meetings', 'edit', meeting);
export const canDeleteMeeting = (_me, meeting) => can('meetings', 'delete', meeting);

// ---- Leave -----------------------------------------------------------------
export const canCreateLeave = () => can('leave', 'create');
export const canEditLeave = (_me, leaveRequest) => can('leave', 'editDetails', leaveRequest);
// respond's scope is only ever NONE or ALL (never ASSIGNED — see permissionCatalog.js),
// so no record/ownership check is needed here.
export const canRespondToLeave = () => can('leave', 'respond');

// Generic fallback for any module/action.
export const canDo = (module, action, record) => can(module, action, record);
