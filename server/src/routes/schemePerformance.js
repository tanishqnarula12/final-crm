// Top Performing Schemes (Others → Top Performing Schemes).
//
// Monthly mutual-fund scheme-performance workbooks: one upload per reporting
// month (re-uploads become additional versions, never overwrites), each stored
// sheet-by-sheet as a category with its raw rows plus the system-generated
// screening verdicts.
//
// Access follows the permission matrix's Top Performing Schemes row: View for
// every read, Upload to add a month's workbook, Delete to remove one ("Assigned"
// = workbooks you uploaded yourself). Defaults keep the original rules —
// everyone views and uploads; the uploader, Internal Manager or Admin removes —
// and removal is a soft delete, so a month's history can always be recovered.
//
// The endpoints are deliberately split by weight: month/summary reads stay
// small, while the heavy payloads (a category's raw rows, the original .xlsx)
// are fetched only when actually opened.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import { can } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

// Every endpoint here reads the module except upload and delete, which carry
// their own matrix rows (checked in their handlers).
router.use((req, res, next) => {
  if (can(req.user, 'topSchemes', 'view')) return next();
  res.status(403).json({ error: 'You don\'t have permission to view Top Performing Schemes.' });
});

// A workbook's uploader "owns" it — the 'creator' ownership the matrix's
// Assigned scope resolves against.
const asRecord = (upload) => ({ createdBy: upload.uploadedBy });

export const RESULT = {
  TOP: 'TOP_PERFORMING',
  BELOW: 'BELOW_THRESHOLD',
  NA: 'NOT_AVAILABLE',
};

// ---------------------------------------------------------------------------
// The screening rule, applied authoritatively here.
// ---------------------------------------------------------------------------
// The client computes the same verdicts to render its pre-save preview, but the
// stored result is ALWAYS recomputed from the submitted median/avgMedian rather
// than trusting whatever verdict arrived. One rule, one place, so a stored row
// can never disagree with the rule it claims to follow.
//
//   Median >  Average Median → TOP_PERFORMING
//   Median <= Average Median → BELOW_THRESHOLD
//   either side missing      → NOT_AVAILABLE (never guessed, never defaulted)
function screen(median, avgMedian) {
  const m = typeof median === 'number' && Number.isFinite(median) ? median : null;
  const a = typeof avgMedian === 'number' && Number.isFinite(avgMedian) ? avgMedian : null;
  if (m === null || a === null) return { result: RESULT.NA, difference: null };
  return {
    result: m > a ? RESULT.TOP : RESULT.BELOW,
    difference: Number((m - a).toFixed(4)),
  };
}

const nullableNum = z.number().finite().nullable().optional();

const schemeSchema = z.object({
  schemeName: z.string().trim().min(1).max(300),
  median: nullableNum,
  rowIndex: z.number().int().nonnegative().optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  sheetIndex: z.number().int().nonnegative().default(0),
  avgMedian: nullableNum,
  avgMedianSource: z.string().max(300).nullable().optional(),
  rawHeaders: z.array(z.string()).default([]),
  rawRows: z.array(z.array(z.string())).default([]),
  headerRowIndex: z.number().int().nonnegative().default(0),
  schemeCol: z.number().int().nonnegative().nullable().optional(),
  medianCol: z.number().int().nonnegative().nullable().optional(),
  schemes: z.array(schemeSchema).default([]),
});

const uploadSchema = z.object({
  reportingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Reporting month must look like 2026-09'),
  fileName: z.string().trim().min(1).max(260),
  fileSize: z.number().int().nonnegative().default(0),
  fileDataUrl: z.string().min(1),
  // 'replace' marks the month's previous current version as superseded (the
  // data is still kept and readable); 'new' simply adds another version.
  mode: z.enum(['new', 'replace']).default('new'),
  categories: z.array(categorySchema).min(1, 'The workbook has no readable worksheets.'),
});

const serializeUpload = (u, extra = {}) => ({
  id: u.id,
  reportingMonth: u.reportingMonth,
  version: u.version,
  isCurrent: u.isCurrent,
  supersededAt: u.supersededAt,
  fileName: u.fileName,
  fileSize: u.fileSize,
  uploadedBy: u.uploadedBy,
  createdAt: u.createdAt,
  ...extra,
});

// ---------------------------------------------------------------------------
// GET /months — every reporting month that has data, newest first, each with
// its version list. Deliberately excludes rawRows and the file blob.
// ---------------------------------------------------------------------------
router.get('/months', asyncHandler(async (req, res) => {
  const uploads = await prisma.schemePerfUpload.findMany({
    where: { deletedAt: null },
    orderBy: [{ reportingMonth: 'desc' }, { version: 'desc' }],
    select: {
      id: true, reportingMonth: true, version: true, isCurrent: true,
      supersededAt: true, fileName: true, fileSize: true, uploadedBy: true, createdAt: true,
    },
  });

  const byMonth = new Map();
  for (const u of uploads) {
    if (!byMonth.has(u.reportingMonth)) {
      byMonth.set(u.reportingMonth, { reportingMonth: u.reportingMonth, versions: [] });
    }
    byMonth.get(u.reportingMonth).versions.push(serializeUpload(u));
  }

  const months = [...byMonth.values()].map((m) => ({
    ...m,
    // The version shown by default: the flagged current one, else the newest.
    currentUploadId: (m.versions.find((v) => v.isCurrent) || m.versions[0])?.id || null,
  }));

  res.json({ months });
}));

// ---------------------------------------------------------------------------
// GET /uploads/:id — one snapshot's header + per-category summary. Light: the
// raw rows and the original workbook are fetched separately, on demand.
// ---------------------------------------------------------------------------
router.get('/uploads/:id', asyncHandler(async (req, res) => {
  const upload = await prisma.schemePerfUpload.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, reportingMonth: true, version: true, isCurrent: true, supersededAt: true,
      fileName: true, fileSize: true, uploadedBy: true, createdAt: true,
      categories: {
        orderBy: { sheetIndex: 'asc' },
        select: {
          id: true, name: true, sheetIndex: true, avgMedian: true, avgMedianSource: true,
          headerRowIndex: true, schemeCol: true, medianCol: true, rawHeaders: true,
        },
      },
    },
  });
  if (!upload || upload.deletedAt) return res.status(404).json({ error: 'That monthly upload was not found.' });

  // Per-category verdict tallies, in one grouped query rather than per category.
  const grouped = await prisma.schemePerfScheme.groupBy({
    by: ['categoryId', 'result'],
    where: { uploadId: upload.id },
    _count: { _all: true },
  });
  const tally = new Map();
  for (const g of grouped) {
    const t = tally.get(g.categoryId) || { total: 0, top: 0, below: 0, na: 0 };
    const n = g._count._all;
    t.total += n;
    if (g.result === RESULT.TOP) t.top += n;
    else if (g.result === RESULT.BELOW) t.below += n;
    else t.na += n;
    tally.set(g.categoryId, t);
  }

  const categories = upload.categories.map((c) => ({
    ...c,
    // How many raw rows the sheet holds, without shipping the rows themselves.
    counts: tally.get(c.id) || { total: 0, top: 0, below: 0, na: 0 },
  }));

  const totals = categories.reduce((acc, c) => ({
    categories: acc.categories + 1,
    total: acc.total + c.counts.total,
    top: acc.top + c.counts.top,
    below: acc.below + c.counts.below,
    na: acc.na + c.counts.na,
  }), { categories: 0, total: 0, top: 0, below: 0, na: 0 });

  res.json({ upload: serializeUpload(upload, { categories, totals }) });
}));

// ---------------------------------------------------------------------------
// GET /categories/:id — one worksheet in full: the RAW rows exactly as
// uploaded, plus the analysis rows derived from them, kept side by side and
// never merged into each other.
// ---------------------------------------------------------------------------
router.get('/categories/:id', asyncHandler(async (req, res) => {
  const category = await prisma.schemePerfCategory.findUnique({
    where: { id: req.params.id },
    include: {
      schemes: { orderBy: { rowIndex: 'asc' } },
      upload: { select: { id: true, reportingMonth: true, version: true, fileName: true, deletedAt: true } },
    },
  });
  if (!category || category.upload?.deletedAt) {
    return res.status(404).json({ error: 'That category was not found.' });
  }
  res.json({ category });
}));

// ---------------------------------------------------------------------------
// GET /uploads/:id/schemes — the consolidated, cross-category analysis list,
// with the module's filters applied server-side.
// ---------------------------------------------------------------------------
router.get('/uploads/:id/schemes', asyncHandler(async (req, res) => {
  const { result, category, q } = req.query;
  const where = { uploadId: req.params.id };
  if (result && Object.values(RESULT).includes(result)) where.result = result;
  if (category) where.categoryName = String(category);
  if (q && String(q).trim()) where.schemeName = { contains: String(q).trim(), mode: 'insensitive' };

  const schemes = await prisma.schemePerfScheme.findMany({
    where,
    orderBy: [{ categoryName: 'asc' }, { rowIndex: 'asc' }],
    take: 5000,
  });
  res.json({ schemes });
}));

// ---------------------------------------------------------------------------
// GET /uploads/:id/file — the original workbook, byte for byte as uploaded.
// Split out so listing months never drags a base64 blob along.
// ---------------------------------------------------------------------------
router.get('/uploads/:id/file', asyncHandler(async (req, res) => {
  const upload = await prisma.schemePerfUpload.findUnique({
    where: { id: req.params.id },
    select: { fileName: true, fileDataUrl: true, deletedAt: true },
  });
  if (!upload || upload.deletedAt) return res.status(404).json({ error: 'That file was not found.' });
  res.json({ fileName: upload.fileName, fileDataUrl: upload.fileDataUrl });
}));

// ---------------------------------------------------------------------------
// GET /scheme-history?name=… — how one scheme has screened month over month.
// Reads only each month's CURRENT version, so superseded re-uploads don't show
// the same month twice.
// ---------------------------------------------------------------------------
router.get('/scheme-history', asyncHandler(async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) return res.json({ history: [] });

  const rows = await prisma.schemePerfScheme.findMany({
    where: {
      schemeName: { equals: name, mode: 'insensitive' },
      upload: { deletedAt: null, isCurrent: true },
    },
    orderBy: { reportingMonth: 'desc' },
    take: 240,
  });
  res.json({ history: rows });
}));

// ---------------------------------------------------------------------------
// GET /scheme-names?q=… — distinct scheme names for the history search box.
// ---------------------------------------------------------------------------
router.get('/scheme-names', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = await prisma.schemePerfScheme.findMany({
    where: {
      upload: { deletedAt: null, isCurrent: true },
      ...(q ? { schemeName: { contains: q, mode: 'insensitive' } } : {}),
    },
    distinct: ['schemeName'],
    select: { schemeName: true },
    orderBy: { schemeName: 'asc' },
    take: 60,
  });
  res.json({ names: rows.map((r) => r.schemeName) });
}));

// ---------------------------------------------------------------------------
// POST /uploads — store a monthly snapshot.
//
// Never overwrites: a month that already has data gets the next version
// number. 'replace' additionally marks the previous current version as
// superseded, which changes only which version is shown by default — the
// superseded rows, their raw data and their original file all remain.
// ---------------------------------------------------------------------------
router.post('/uploads', asyncHandler(async (req, res) => {
  if (!can(req.user, 'topSchemes', 'upload')) {
    return res.status(403).json({ error: 'You don\'t have permission to upload scheme performance workbooks.' });
  }
  const body = parseBody(uploadSchema, req.body);

  const prior = await prisma.schemePerfUpload.findFirst({
    where: { reportingMonth: body.reportingMonth, deletedAt: null },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  });
  const version = (prior?.version || 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    if (prior) {
      await tx.schemePerfUpload.updateMany({
        where: { reportingMonth: body.reportingMonth, deletedAt: null, isCurrent: true },
        data: {
          isCurrent: false,
          ...(body.mode === 'replace' ? { supersededAt: new Date() } : {}),
        },
      });
    }

    const upload = await tx.schemePerfUpload.create({
      data: {
        reportingMonth: body.reportingMonth,
        version,
        isCurrent: true,
        fileName: body.fileName,
        fileSize: body.fileSize,
        fileDataUrl: body.fileDataUrl,
        uploadedBy: req.user.id,
      },
    });

    for (const cat of body.categories) {
      const avgMedian = typeof cat.avgMedian === 'number' && Number.isFinite(cat.avgMedian)
        ? cat.avgMedian
        : null;

      const category = await tx.schemePerfCategory.create({
        data: {
          uploadId: upload.id,
          name: cat.name,
          sheetIndex: cat.sheetIndex,
          avgMedian,
          avgMedianSource: cat.avgMedianSource ?? null,
          rawHeaders: cat.rawHeaders,
          rawRows: cat.rawRows,
          headerRowIndex: cat.headerRowIndex,
          schemeCol: cat.schemeCol ?? null,
          medianCol: cat.medianCol ?? null,
        },
      });

      if (cat.schemes.length) {
        await tx.schemePerfScheme.createMany({
          data: cat.schemes.map((s, i) => {
            const median = typeof s.median === 'number' && Number.isFinite(s.median) ? s.median : null;
            const { result, difference } = screen(median, avgMedian);
            return {
              categoryId: category.id,
              uploadId: upload.id,
              reportingMonth: body.reportingMonth,
              categoryName: cat.name,
              schemeName: s.schemeName,
              median,
              avgMedian,
              difference,
              result,
              rowIndex: s.rowIndex ?? i,
            };
          }),
        });
      }
    }

    return upload;
  }, { timeout: 120000, maxWait: 20000 });

  res.status(201).json({ upload: serializeUpload(created), replacedVersion: prior?.version ?? null });
}));

// ---------------------------------------------------------------------------
// DELETE /uploads/:id — soft delete, per the matrix's Delete row (Assigned =
// the uploader; defaults: the uploader, Internal Manager or Admin).
// If the removed version was the current one, the next newest version for that
// month is promoted so the month keeps showing its most recent surviving data.
// ---------------------------------------------------------------------------
router.delete('/uploads/:id', asyncHandler(async (req, res) => {
  const upload = await prisma.schemePerfUpload.findUnique({ where: { id: req.params.id } });
  if (!upload || upload.deletedAt) return res.status(404).json({ error: 'That monthly upload was not found.' });

  if (!can(req.user, 'topSchemes', 'delete', asRecord(upload))) {
    return res.status(403).json({ error: 'You don\'t have permission to remove this uploaded workbook.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.schemePerfUpload.update({
      where: { id: upload.id },
      data: { deletedAt: new Date(), isCurrent: false },
    });
    if (upload.isCurrent) {
      const next = await tx.schemePerfUpload.findFirst({
        where: { reportingMonth: upload.reportingMonth, deletedAt: null },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
      if (next) await tx.schemePerfUpload.update({ where: { id: next.id }, data: { isCurrent: true } });
    }
  });

  res.json({ ok: true });
}));

export default router;
