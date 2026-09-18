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

// ---- Global (un-scoped) figures behind the Managed Portfolio cards --------
// These are deliberately computed over EVERY record, not the caller's
// RBAC-visible subset: the Managed Portfolio row is a firm-level headline
// that must read identically for every user. (The dashboard's own lists stay
// view-scoped as before — this endpoint is the one exception, and it exposes
// only three aggregate totals, never individual records.)

const num = (v) => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;

// Investment/insurance proposal buckets — must stay in step with
// DashboardView.jsx's SIP_IN_TYPES / SIP_OUT_TYPES and computeIns().
// "Purchase with SIP" is itself a SIP registration, same as the
// "SIP Registration" proposal type.
const SIP_IN_TYPES = ['SIP Registration', 'Purchase with SIP'];
const SIP_OUT_TYPES = ['SIP Cancellation'];
const INSURANCE_PREMIUM_TYPES = [
  'Term Insurance', 'Medical Insurance', 'Accidental Insurance',
  'Travel Insurance', 'Marine Insurance', 'Motor Insurance',
];

// Indian financial year (1 April – 31 March), server-local — mirrors the
// dashboard's fyStartYearFor()/rangeForFilter(). Always the CURRENT FY: these
// cards deliberately ignore whatever period filter a user has set elsewhere.
function currentFy(now = new Date()) {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    startYear,
    start: new Date(startYear, 3, 1, 0, 0, 0, 0),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
  };
}

// Mirrors the frontend's hasAllocation() (utils/assets.js): a client counts as
// "mapped" once any holding carries a positive amount, or a remark was written.
function hasAllocation(alloc) {
  if (!alloc || typeof alloc !== 'object') return false;
  const groups = [alloc.values, alloc.custom].filter((g) => g && typeof g === 'object');
  for (const group of groups) {
    for (const entry of Object.values(group)) {
      if (Array.isArray(entry)) {
        if (entry.some((x) => String(x?.label || '').trim() && Number(x?.amount) > 0)) return true;
      } else if (entry && typeof entry === 'object') {
        if (Object.values(entry).some((v) => Number(v) > 0)) return true;
      }
    }
  }
  return typeof alloc.remark === 'string' && alloc.remark.trim().length > 0;
}

async function computeGlobals() {
  const fy = currentFy();

  // A prospect's authoritative fields live in `payload` (that's all the
  // dashboard ever sees — see routes/prospects.js), with the promoted columns
  // as a fallback for anything written before they were mirrored there.
  const prospectRows = await prisma.prospect.findMany({
    where: { deletedAt: null },
    select: { proposalCategory: true, stage: true, payload: true, createdAt: true },
  });
  const inFy = prospectRows.filter((r) => {
    const iso = r.payload?.createdAt ?? r.createdAt;
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) && d >= fy.start && d <= fy.end;
  });
  const categoryOf = (r) => r.payload?.proposalCategory ?? r.proposalCategory;

  const investment = inFy.filter((r) => categoryOf(r) === 'investment');
  const sumInv = (types) => investment
    .filter((r) => types.includes(r.payload?.proposalType))
    .reduce((s, r) => s + num(r.payload?.amount), 0);
  const netSipFy = sumInv(SIP_IN_TYPES) - sumInv(SIP_OUT_TYPES);

  // Net insurance flow = premium across the six policy types, less anything
  // that ended up rejected (rejections count whatever their type).
  const insurance = inFy.filter((r) => categoryOf(r) === 'insurance');
  const premium = insurance
    .filter((r) => INSURANCE_PREMIUM_TYPES.includes(r.payload?.proposalType))
    .reduce((s, r) => s + num(r.payload?.amount), 0);
  const rejected = insurance
    .filter((r) => (r.payload?.stage ?? r.stage) === 'Policy Rejected')
    .reduce((s, r) => s + num(r.payload?.amount), 0);
  const netInsuranceFy = premium - rejected;

  const clientRows = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { assetAllocation: true, goals: { where: { deletedAt: null }, select: { currentInv: true } } },
  });
  const aum = clientRows.reduce((s, c) => s + c.goals.reduce((g, x) => g + (x.currentInv || 0), 0), 0);

  return {
    aum,
    clientGroups: clientRows.length,
    mappedClients: clientRows.filter((c) => hasAllocation(c.assetAllocation)).length,
    netSipFy,
    netInsuranceFy,
    fyLabel: fy.label,
  };
}

// GET /api/managed-portfolio — open to any signed-in user (the dashboard
// itself is open to everyone; only the *edit* actions are RBAC-gated below).
// Returns the manual entries alongside the firm-wide computed figures they
// combine with, so every dashboard renders the same headline numbers.
router.get('/', asyncHandler(async (req, res) => {
  const [row, computed] = await Promise.all([
    prisma.managedPortfolioOverride.findUnique({ where: { id: SINGLETON_ID } }),
    computeGlobals(),
  ]);
  res.json({ override: serialize(row), computed });
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
