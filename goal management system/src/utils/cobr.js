// COBR (Change of Broker) — a specialized extension of the Task module.
//
// A COBR record IS a Task row (relatedTo: 'COBR', its own `cobr` permission-
// matrix column server-side) — it shares Tasks' storage, sync, activity log,
// and notification pipeline entirely; only its own extra payload fields
// (cobrType, cobrEntries) and a dedicated UI are unique to it. Reuses
// `loadTasks`/`saveTasks` from utils/tasks.js directly — no separate service.

export const COBR_TYPES = ['COBR IN', 'COBR OUT'];

// COBR only ever moves through these three (of Tasks' full five) stages.
export const COBR_STAGES = ['Open', 'In Process', 'Completed'];

export const isCobrTask = (t) => t?.relatedTo === 'COBR';

// cobrEntries shape: { [amc]: [{ id, schemeName, folioNo, amount, status }] }
// status: 'pending' (default/untouched) | 'done' | 'rejected'.
export const emptyCobrRow = () => ({ schemeName: '', folioNo: '', amount: '', status: 'pending' });

// Sums (by amount) across every AMC/scheme row — Total always meaningful;
// Done/Rejected/Pending are only SHOWN once the task is Completed (per spec),
// though they're always computed the same way regardless of stage.
export function cobrTotals(cobrEntries = {}) {
  let total = 0, done = 0, rejected = 0, pending = 0;
  Object.values(cobrEntries || {}).forEach((rows) => {
    (rows || []).forEach((row) => {
      const amt = Number(row.amount) || 0;
      total += amt;
      if (row.status === 'done') done += amt;
      else if (row.status === 'rejected') rejected += amt;
      else pending += amt;
    });
  });
  return { total, done, rejected, pending };
}

// Reopening a Completed COBR task clears every rejected entry back to
// pending, so it can be reprocessed (per spec) — done entries are untouched.
export function clearRejectedEntries(cobrEntries = {}) {
  const next = {};
  for (const [amc, rows] of Object.entries(cobrEntries || {})) {
    next[amc] = (rows || []).map((r) => (r.status === 'rejected' ? { ...r, status: 'pending' } : r));
  }
  return next;
}

export const cobrTaskName = (cobrType, groupLeader) => `${cobrType || 'COBR'} - ${groupLeader || 'Unknown'}`;
