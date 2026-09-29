// "Recently deleted" — Admin only. Every delete in the CRM is soft (the row
// gets a deletedAt and disappears from every list), so a mistaken delete can
// always be undone; until now that took a database script. On 25 Aug 2026
// three real Servicing records were deleted during a test-data clean-up and
// nobody noticed for five weeks.
//
//   GET  /api/deleted?days=90              deleted tasks, Servicing records,
//                                          queries, leads and meetings (details only)
//   POST /api/deleted/:kind/:id/restore    un-delete one; logged as RESTORE
//
// A restore changes only deletedAt. The record comes back exactly as it was,
// files included, and the activity log keeps both the DELETE and the RESTORE.
import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { logActivity } from '../lib/activityLog.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// Servicing records are Task rows too; each register has its own module name.
const TASK_MODULE = { COBR: 'cobr', RENEWAL: 'renewals', CLAIM: 'claims', FD: 'fixedDeposits', POLICY: 'otherInsurancePolicies' };
const TASK_LABEL = { COBR: 'COBR', RENEWAL: 'Renewal', CLAIM: 'Claim', FD: 'Fixed Deposit', POLICY: 'Policy' };

// Table names are fixed here, never taken from the request.
const KINDS = {
  tasks: { model: 'task', table: 'tasks', module: (p) => TASK_MODULE[p?.relatedTo] || 'tasks', label: (p) => TASK_LABEL[p?.relatedTo] || 'Task',
    title: (p) => p.taskName || 'Untitled task', who: (p) => p.groupLeader || p.applicant || '', state: (p) => p.stage || '' },
  queries: { model: 'query', table: 'queries', module: () => 'queries', label: () => 'Query',
    title: (p) => [p.category, (p.query || '').slice(0, 90)].filter(Boolean).join(' — ') || 'Query', who: (p) => p.relatedClient || p.clientName || '', state: (p) => p.stage || '' },
  leads: { model: 'lead', table: 'leads', module: () => 'leads', label: () => 'Lead',
    title: (p) => [p.firstName || p.name, p.lastName].filter(Boolean).join(' ') || p.mobile || 'Lead', who: (p) => p.mobile || '', state: (p) => p.stage || p.status || '' },
  meetings: { model: 'meeting', table: 'meetings', module: () => 'meetings', label: () => 'Meeting',
    title: (p) => p.title || p.agenda || 'Meeting', who: (p) => p.clientName || p.leadName || '', state: (p) => [p.date, p.status].filter(Boolean).join(' · ') },
};

router.get('/', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const items = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    // Details only — the payload without its file-carrying arrays.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, "createdBy", "createdAt", "deletedAt",
              payload - 'attachments' - 'stageHistory' - 'comments' - 'remarks' AS p,
              CASE WHEN jsonb_typeof(payload->'attachments') = 'array' THEN jsonb_array_length(payload->'attachments') ELSE 0 END AS files
         FROM ${k.table} WHERE "deletedAt" IS NOT NULL AND "deletedAt" >= $1 ORDER BY "deletedAt" DESC`,
      since,
    );
    if (!rows.length) continue;
    const dels = await prisma.activityLog.findMany({
      where: { action: 'DELETE', recordId: { in: rows.map((r) => r.id) } },
      orderBy: { timestamp: 'desc' }, select: { recordId: true, performedBy: true },
    });
    const deletedBy = new Map();
    for (const d of dels) if (!deletedBy.has(d.recordId)) deletedBy.set(d.recordId, d.performedBy);
    for (const r of rows) {
      const p = r.p || {};
      items.push({
        kind, id: r.id, module: k.module(p), type: k.label(p),
        title: k.title(p), who: k.who(p), state: k.state(p), files: Number(r.files) || 0,
        createdBy: nameOf.get(r.createdBy) || '', createdAt: r.createdAt,
        deletedBy: nameOf.get(deletedBy.get(r.id)) || '', deletedAt: r.deletedAt,
      });
    }
  }
  items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  res.set('Cache-Control', 'no-store');
  res.json({ items, days });
}));

router.post('/:kind/:id/restore', asyncHandler(async (req, res) => {
  const k = KINDS[req.params.kind];
  if (!k) return res.status(404).json({ error: 'Unknown record type.' });
  const row = await prisma[k.model].findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Record not found.' });
  if (!row.deletedAt) return res.status(409).json({ error: 'This record is not deleted.' });
  await prisma.$transaction(async (tx) => {
    // Only if it's still deleted — two admins clicking Restore at once is fine.
    const n = await tx[k.model].updateMany({ where: { id: row.id, deletedAt: { not: null } }, data: { deletedAt: null } });
    if (n.count !== 1) return;
    await logActivity(tx, {
      module: k.module(row.payload), recordId: row.id, action: 'RESTORE',
      oldValue: { deletedAt: row.deletedAt.toISOString() }, newValue: { restored: true },
      performedBy: req.user.id,
    });
  });
  res.json({ ok: true, id: row.id });
}));

export default router;
