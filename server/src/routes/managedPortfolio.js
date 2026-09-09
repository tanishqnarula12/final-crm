// Manual admin overrides for the Dashboard's Managed Portfolio KPIs — Total
// AUM Managed, Total SIP Book and Managed Insurance are normally computed
// live from client goals / policy tasks; this lets an admin (or a role
// granted the managedPortfolio.edit* permission via the Permission Matrix)
// punch in a corrected figure instead. Singleton row, upserted — see
// ManagedPortfolioOverride in schema.prisma.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { can } from '../lib/permissions.js';
import { logActivity } from '../lib/activityLog.js';

const router = Router();
router.use(requireAuth);

const SINGLETON_ID = 'singleton';
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const serialize = (row) => ({
  aumAmount: row?.aumAmount ?? null,
  aumAsOfDate: row?.aumAsOfDate ?? null,
  aumUpdatedBy: row?.aumUpdatedBy ?? null,
  aumUpdatedAt: row?.aumUpdatedAt ?? null,
  sipAmount: row?.sipAmount ?? null,
  sipUpdatedBy: row?.sipUpdatedBy ?? null,
  sipUpdatedAt: row?.sipUpdatedAt ?? null,
  insuranceAmount: row?.insuranceAmount ?? null,
  insuranceUpdatedBy: row?.insuranceUpdatedBy ?? null,
  insuranceUpdatedAt: row?.insuranceUpdatedAt ?? null,
});

// GET /api/managed-portfolio — open to any signed-in user (the dashboard
// itself is open to everyone; only the *edit* actions are RBAC-gated below).
router.get('/', asyncHandler(async (req, res) => {
  const row = await prisma.managedPortfolioOverride.findUnique({ where: { id: SINGLETON_ID } });
  res.json({ override: serialize(row) });
}));

const aumSchema = z.object({
  amount: z.number().finite().nonnegative().nullable(),
  asOfDate: z.string().regex(dateRe, 'Invalid date').nullable(),
}).refine((d) => d.amount === null || d.asOfDate !== null, {
  message: '"As of" date is required when setting an amount.',
  path: ['asOfDate'],
});

// PUT /api/managed-portfolio/aum — amount: null clears the override (the
// dashboard reverts to the computed figure); a non-null amount requires
// asOfDate alongside it.
router.put('/aum', asyncHandler(async (req, res) => {
  if (!can(req.user, 'managedPortfolio', 'editAum')) {
    return res.status(403).json({ error: 'You do not have permission to edit the Total AUM figure.' });
  }
  const { amount, asOfDate } = parseBody(aumSchema, req.body);
  const before = await prisma.managedPortfolioOverride.findUnique({ where: { id: SINGLETON_ID } });
  const data = { aumAmount: amount, aumAsOfDate: amount === null ? null : asOfDate, aumUpdatedBy: req.user.id, aumUpdatedAt: new Date() };
  const row = await prisma.managedPortfolioOverride.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  await logActivity(prisma, {
    module: 'managedPortfolio', recordId: 'aum', action: 'UPDATE',
    oldValue: { aumAmount: before?.aumAmount ?? null, aumAsOfDate: before?.aumAsOfDate ?? null },
    newValue: { aumAmount: row.aumAmount, aumAsOfDate: row.aumAsOfDate },
    performedBy: req.user.id,
  });
  res.json({ override: serialize(row) });
}));

const amountSchema = z.object({ amount: z.number().finite().nonnegative().nullable() });

// PUT /api/managed-portfolio/sip — amount: null clears the override.
router.put('/sip', asyncHandler(async (req, res) => {
  if (!can(req.user, 'managedPortfolio', 'editSip')) {
    return res.status(403).json({ error: 'You do not have permission to edit the Total SIP Book figure.' });
  }
  const { amount } = parseBody(amountSchema, req.body);
  const before = await prisma.managedPortfolioOverride.findUnique({ where: { id: SINGLETON_ID } });
  const data = { sipAmount: amount, sipUpdatedBy: req.user.id, sipUpdatedAt: new Date() };
  const row = await prisma.managedPortfolioOverride.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  await logActivity(prisma, {
    module: 'managedPortfolio', recordId: 'sip', action: 'UPDATE',
    oldValue: { sipAmount: before?.sipAmount ?? null }, newValue: { sipAmount: row.sipAmount },
    performedBy: req.user.id,
  });
  res.json({ override: serialize(row) });
}));

// PUT /api/managed-portfolio/insurance — amount: null clears the override.
router.put('/insurance', asyncHandler(async (req, res) => {
  if (!can(req.user, 'managedPortfolio', 'editInsurance')) {
    return res.status(403).json({ error: 'You do not have permission to edit the Managed Insurance figure.' });
  }
  const { amount } = parseBody(amountSchema, req.body);
  const before = await prisma.managedPortfolioOverride.findUnique({ where: { id: SINGLETON_ID } });
  const data = { insuranceAmount: amount, insuranceUpdatedBy: req.user.id, insuranceUpdatedAt: new Date() };
  const row = await prisma.managedPortfolioOverride.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
  await logActivity(prisma, {
    module: 'managedPortfolio', recordId: 'insurance', action: 'UPDATE',
    oldValue: { insuranceAmount: before?.insuranceAmount ?? null }, newValue: { insuranceAmount: row.insuranceAmount },
    performedBy: req.user.id,
  });
  res.json({ override: serialize(row) });
}));

export default router;
