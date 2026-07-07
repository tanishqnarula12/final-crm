// Permission matrix API.
//   GET  /api/permissions        — the catalog + current matrix (any authed user; the
//                                  frontend needs it to gate the UI).
//   PUT  /api/permissions        — Admin only: upsert changed cells, refresh cache.
//   POST /api/permissions/reset  — Admin only: reset the whole matrix to defaults.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parseBody } from '../lib/validate.js';
import {
  MODULES, MATRIX_ROLES, ALL_ROLES, ROLE_LABELS, ACTION_LABELS, OWNERSHIP,
  buildDefaultRows, defaultScope,
} from '../lib/permissionCatalog.js';
import { refreshPermissions } from '../lib/permissions.js';

const router = Router();
router.use(requireAuth);

// Build the full matrix (every role×module×action) from stored rows, filling any
// gaps with catalog defaults so the client always gets a complete grid.
async function readMatrix() {
  const rows = await prisma.rolePermission.findMany();
  const stored = new Map(rows.map((r) => [`${r.role}:${r.module}:${r.action}`, r.scope]));
  const matrix = {};
  for (const { key: module, actions } of MODULES) {
    matrix[module] = {};
    for (const action of actions) {
      matrix[module][action] = {};
      for (const role of MATRIX_ROLES) {
        matrix[module][action][role] = stored.get(`${role}:${module}:${action}`) ?? defaultScope(role, module, action);
      }
    }
  }
  return matrix;
}

router.get('/', asyncHandler(async (req, res) => {
  res.json({
    catalog: { modules: MODULES, roles: MATRIX_ROLES, allRoles: ALL_ROLES, roleLabels: ROLE_LABELS, actionLabels: ACTION_LABELS, ownership: OWNERSHIP },
    matrix: await readMatrix(),
  });
}));

const scopeEnum = z.enum(['NONE', 'ASSIGNED', 'ALL']);
const cellSchema = z.object({
  role: z.enum(MATRIX_ROLES),
  module: z.string().min(1),
  action: z.string().min(1),
  scope: scopeEnum,
});
const putSchema = z.object({ cells: z.array(cellSchema) });

router.put('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { cells } = parseBody(putSchema, req.body);
  const valid = new Set();
  for (const { key, actions } of MODULES) for (const a of actions) valid.add(`${key}:${a}`);

  await prisma.$transaction(
    cells
      .filter((c) => valid.has(`${c.module}:${c.action}`))
      .map((c) => prisma.rolePermission.upsert({
        where: { role_module_action: { role: c.role, module: c.module, action: c.action } },
        create: c,
        update: { scope: c.scope },
      }))
  );
  await refreshPermissions();
  res.json({ ok: true, matrix: await readMatrix() });
}));

router.post('/reset', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const rows = buildDefaultRows();
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({}),
    prisma.rolePermission.createMany({ data: rows }),
  ]);
  await refreshPermissions();
  res.json({ ok: true, matrix: await readMatrix() });
}));

export default router;
