// One-off backfill: attach templateKind/templateData to LEAVE-type Notice rows
// that were created BEFORE the dynamic-wording fix shipped, so they too start
// reading the correct today/future/past tense instead of staying frozen with
// whatever text was true at the moment they were approved.
//
// Never touches the stored title/message columns — only adds templateKind +
// templateData (both previously null). Safe to run more than once: rows that
// already have templateKind set are skipped.
//
// Matching a Notice back to the Leave request that created it: Notice has no
// direct foreign key to Leave, so this correlates by timing — postLeaveNotice()
// fires (fire-and-forget) immediately after the /respond handler sets
// respondedAt, in the same request, so the Notice's createdAt normally lands
// well under a second after the Leave's respondedAt. A ±4s window that
// matches exactly ONE approved Leave is treated as a match; anything with
// zero or multiple candidates in that window (e.g. an admin approving several
// requests back-to-back within the same few seconds) is left untouched — a
// safe no-op, same as if this script never ran for that row, and it will
// still resolve naturally via its own expiry either way.
//
// Usage: node scripts/backfillLeaveNoticeTemplates.mjs [--dry-run]
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const WINDOW_MS = 4000;

async function main() {
  const notices = await prisma.notice.findMany({
    where: { type: 'LEAVE', templateKind: null, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${notices.length} un-templated LEAVE notice(s).`);

  let fixed = 0, skippedAmbiguous = 0, skippedNoMatch = 0;
  const userNameCache = new Map();

  for (const n of notices) {
    const candidates = await prisma.leave.findMany({
      where: {
        status: 'Approved',
        respondedAt: {
          gte: new Date(n.createdAt.getTime() - WINDOW_MS),
          lte: new Date(n.createdAt.getTime() + WINDOW_MS),
        },
      },
    });

    if (candidates.length === 0) {
      skippedNoMatch++;
      console.log(`  SKIP (no candidate) — notice ${n.id} "${n.title}" @ ${n.createdAt.toISOString()}`);
      continue;
    }
    if (candidates.length > 1) {
      skippedAmbiguous++;
      console.log(`  SKIP (${candidates.length} candidates, ambiguous) — notice ${n.id} "${n.title}" @ ${n.createdAt.toISOString()}`);
      continue;
    }

    const leave = candidates[0];
    if (!userNameCache.has(leave.createdBy)) {
      const u = await prisma.user.findUnique({ where: { id: leave.createdBy }, select: { name: true } });
      userNameCache.set(leave.createdBy, u?.name || 'A teammate');
    }
    const name = userNameCache.get(leave.createdBy);
    const templateData = {
      name, fromDate: leave.fromDate, toDate: leave.toDate,
      leaveType: leave.leaveType, halfDaySlot: leave.halfDaySlot, timeValue: leave.timeValue,
    };

    console.log(`  MATCH — notice ${n.id} "${n.title}" -> leave ${leave.id} (${name}, ${leave.fromDate}${leave.toDate !== leave.fromDate ? ' to ' + leave.toDate : ''})`);
    if (!dryRun) {
      await prisma.notice.update({ where: { id: n.id }, data: { templateKind: 'LEAVE', templateData } });
    }
    fixed++;
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${fixed}, skipped ${skippedAmbiguous} ambiguous, skipped ${skippedNoMatch} with no match. Total: ${notices.length}.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
