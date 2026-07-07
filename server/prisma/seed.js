// Seed script: creates the first ADMIN account so someone can log in and then
// provision the rest of the team from the in-app Admin -> Users screen.
// Idempotent: re-running only ensures the admin exists (won't duplicate).
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { buildDefaultRows } from '../src/lib/permissionCatalog.js';

const prisma = new PrismaClient();

async function seedPermissionMatrix() {
  const count = await prisma.rolePermission.count();
  if (count > 0) {
    console.log(`[seed] Permission matrix already has ${count} cells (no changes made).`);
    return;
  }
  await prisma.rolePermission.createMany({ data: buildDefaultRows() });
  console.log('[seed] Seeded permission matrix with default scopes.');
}

async function main() {
  await seedPermissionMatrix();

  const email = config.seedAdmin.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`[seed] Admin already exists: ${email} (no changes made).`);
    return;
  }

  const passwordHash = await bcrypt.hash(config.seedAdmin.password, config.bcryptRounds);
  await prisma.user.create({
    data: {
      name: config.seedAdmin.name,
      email,
      passwordHash,
      roles: ['ADMIN'],
      active: true,
    },
  });

  console.log('[seed] Created initial admin account:');
  console.log(`         email:    ${email}`);
  console.log(`         password: ${config.seedAdmin.password}`);
  console.log('       >>> Log in and change this password immediately. <<<');
}

main()
  .catch((e) => {
    console.error('[seed] Failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
