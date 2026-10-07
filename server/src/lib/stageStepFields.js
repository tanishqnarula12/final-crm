// What a stage step records (owner decision #14, 7 Oct 2026).
//
// A stage step on a Renewal / Claim / Fixed Deposit / Other Insurance Policy
// writes a few fields of its own: the renewal's policy document, a claim's
// documents and settlement, an FD's investment or next reminder, a policy's
// outcome. Those are detail fields, so for someone who may make the stage
// move but not edit details (the usual assignee) syncBulk kept the move and
// dropped what it recorded. stageStepKeys() names the detail keys of one save
// that are exactly what its step recorded — each checked against the step
// itself (its new history entry, the stage it reached) — and syncBulk keeps
// those along with the move. Everything else still needs Edit Details.
//
// Mirrors the record forms (goal management system/src/components/cobr/
// *Modal.jsx: confirmAction + handleSave) — change both together.

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// Key-order-insensitive JSON (Postgres jsonb reorders keys).
const stable = (v) => JSON.stringify(v, (_k, val) => (isObj(val)
  ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
  : val));
const same = (a, b) => stable(a) === stable(b);
const num = (v) => Number(v) || 0;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (v) => v === undefined || v === null || v === '';
// When the record last arrived at `stage` (the forms' stageLastReachedAt).
const lastReachedAt = (history, stage) => [...history].reverse().find((h) => h?.stage === stage)?.at || '';

// The history entries this save added at the end, or null when the stored
// history isn't kept exactly as it was in front of them.
function appendedEntries(before, after) {
  if (!Array.isArray(after)) return null;
  const kept = Array.isArray(before) ? before : [];
  if (after.length <= kept.length) return null;
  for (let i = 0; i < kept.length; i++) if (!same(kept[i], after[i])) return null;
  return after.slice(kept.length);
}

/**
 * @param mod     the record's permission module ('renewals', 'claims', …)
 * @param stored  the stored payload
 * @param rec     the incoming payload (files already restored)
 * @param from    stored stage
 * @param to      incoming stage — a move the actor may make (checked by caller)
 * @returns Set of payload keys the step itself recorded
 */
export function stageStepKeys(mod, stored, rec, from, to) {
  const keep = new Set();
  const added = appendedEntries(stored?.stageHistory, rec?.stageHistory);
  if (!added) return keep;
  const step = added[added.length - 1];
  // The step that reached the new stage; a "moved back" entry is Edit Mode's.
  if (!isObj(step) || step.back || step.stage !== to) return keep;
  const history = rec.stageHistory;

  // Files uploaded with a step join the record's attachments (Renewal: Policy
  // Document Upload's required document; Claim: a step's documents). Only
  // new files at the end, each one carried by a step of this save; every
  // file already on the record must come back exactly as stored.
  if (mod === 'renewals' || mod === 'claims') {
    const stepFiles = new Set(added.flatMap((h) => (Array.isArray(h?.attachments) ? h.attachments : [])
      .map((a) => a?.id).filter(Boolean)));
    const was = Array.isArray(stored?.attachments) ? stored.attachments : [];
    const now = Array.isArray(rec.attachments) ? rec.attachments : [];
    if (now.length > was.length
      && was.every((a, i) => same(a, now[i]))
      && now.slice(was.length).every((a) => isObj(a) && a.id && !a.deletedAt && stepFiles.has(a.id))) {
      keep.add('attachments');
    }
  }

  // Claim Approved → Full Settlement (Claim Settled) / Partial Settlement
  // (back to Claim Submitted): the settled total is the sum the history
  // holds; a full settlement also stamps when it was reached.
  if (mod === 'claims' && from === 'Claim Approved' && (to === 'Claim Settled' || to === 'Claim Submitted') && num(step.settlementAmount) > 0) {
    const total = history.reduce((sum, h) => sum + num(h?.settlementAmount), 0);
    if (num(rec.settlementAmount) === total) keep.add('settlementAmount');
    if (to === 'Claim Settled' && rec.settlementDate && rec.settlementDate === lastReachedAt(history, 'Claim Settled')) keep.add('settlementDate');
  }

  // FD: Invested With Us (the amount typed in the step, stamped when reached)
  // or FD Renewed (its next reminder date). Each clears the other's field.
  if (mod === 'fixedDeposits') {
    if (to === 'Invested With Us' && num(step.settlementAmount) > 0) {
      if (num(rec.investmentAmount) === num(step.settlementAmount)) keep.add('investmentAmount');
      if (rec.investmentDate && rec.investmentDate === lastReachedAt(history, 'Invested With Us')) keep.add('investmentDate');
      if (blank(rec.nextReminderDate)) keep.add('nextReminderDate');
    }
    if (to === 'FD Renewed' && DATE.test(String(rec.nextReminderDate || ''))) {
      keep.add('nextReminderDate');
      if (blank(rec.investmentAmount)) keep.add('investmentAmount');
      if (blank(rec.investmentDate)) keep.add('investmentDate');
    }
  }

  // Other Policy: Surrendered / Matured record the outcome — the amount
  // typed in the step, or why it wasn't received; Continued records the next
  // reminder. The fields of the other outcome are cleared.
  if (mod === 'otherInsurancePolicies') {
    const outcomeKeys = ['outcome', 'amountReceived', 'reasonNotReceived', 'nextReminderDate'];
    if (to === 'Policy Surrendered' || to === 'Policy Matured') {
      const received = rec.outcome === 'Amount Received' && num(step.settlementAmount) > 0
        && num(rec.amountReceived) === num(step.settlementAmount) && blank(rec.reasonNotReceived);
      const notReceived = rec.outcome === 'Amount Not Received' && blank(rec.amountReceived)
        && typeof rec.reasonNotReceived === 'string' && rec.reasonNotReceived.trim() && rec.reasonNotReceived.length <= 2000;
      if ((received || notReceived) && blank(rec.nextReminderDate)) outcomeKeys.forEach((k) => keep.add(k));
    }
    if (to === 'Policy Continued' && rec.outcome === 'Continued' && DATE.test(String(rec.nextReminderDate || ''))
      && blank(rec.amountReceived) && blank(rec.reasonNotReceived)) {
      outcomeKeys.forEach((k) => keep.add(k));
    }
  }

  return keep;
}
