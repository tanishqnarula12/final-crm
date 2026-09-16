// Read-only report by default: scans every client's clientDetails.attachments
// for TRUE duplicate documents — the same file content saved under more than
// one id — caused by the syncDocumentsToClient bug (fixed alongside this
// script): a Task/Prospect's document-linking sync ran on every save
// (including a pure stage change that never touched a document) and wasn't
// idempotent, so an already-linked document could get renamed with an
// escalating "(2)", "(3)"... suffix, and in some sequences a second copy of
// the same file ended up saved under a NEW id entirely.
//
// This never guesses: two attachments only count as duplicates of each other
// when they belong to the SAME client, the SAME category, the SAME
// applicant, AND their file content hashes to the exact same SHA-256 — a
// same-name-different-content pair, or a document with no dataUrl to hash,
// is left alone and reported as unverifiable rather than assumed safe to
// touch.
//
// Usage:
//   node scripts/findDuplicateClientDocuments.mjs              # report only, deletes nothing
//   node scripts/findDuplicateClientDocuments.mjs --delete     # also delete confirmed duplicates
//
// --delete always keeps exactly one copy per duplicate group — the OLDEST
// by `date` (falling back to the lowest `id` if dates tie/are missing) —
// and only ever removes attachment entries, never touches anything else on
// the client record.
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const shouldDelete = process.argv.includes('--delete');

function contentHash(att) {
  const content = att.dataUrl || att.data || '';
  if (!content) return null;
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
  const clients = await prisma.client.findMany({ where: { deletedAt: null } });
  let totalGroups = 0;
  let totalRemovable = 0;
  let clientsAffected = 0;
  let unverifiableCount = 0;

  for (const client of clients) {
    const attachments = client.clientDetails?.attachments;
    if (!Array.isArray(attachments) || attachments.length < 2) continue;

    // Group by (category, applicantName) — the exact scope the bug renamed
    // within, so this never compares documents that were never candidates
    // for being the same upload in the first place.
    const groups = new Map();
    for (const att of attachments) {
      if (!att || typeof att !== 'object' || !att.id) continue;
      const key = `${(att.category || '').toLowerCase()}|||${att.applicantName || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(att);
    }

    let clientHeaderPrinted = false;
    const idsToRemove = new Set();

    for (const [key, docs] of groups) {
      if (docs.length < 2) continue;

      const byHash = new Map();
      for (const d of docs) {
        const h = contentHash(d);
        if (!h) { unverifiableCount++; continue; }
        if (!byHash.has(h)) byHash.set(h, []);
        byHash.get(h).push(d);
      }

      for (const dupes of byHash.values()) {
        if (dupes.length < 2) continue;
        totalGroups++;
        totalRemovable += dupes.length - 1;

        const sorted = [...dupes].sort((a, b) => {
          const ta = a.date ? new Date(a.date).getTime() : Infinity;
          const tb = b.date ? new Date(b.date).getTime() : Infinity;
          if (ta !== tb) return ta - tb;
          return String(a.id).localeCompare(String(b.id));
        });
        const [keep, ...drop] = sorted;

        if (!clientHeaderPrinted) {
          console.log(`\nClient: ${client.name} (${client.id})`);
          clientHeaderPrinted = true;
        }
        console.log(`  [${key}] ${dupes.length} byte-identical copies:`);
        console.log(`    KEEP    ${keep.id}  "${keep.name}"  (${keep.date || 'no date'})`);
        drop.forEach((d) => {
          console.log(`    ${shouldDelete ? 'DELETE ' : 'REMOVE?'} ${d.id}  "${d.name}"  (${d.date || 'no date'})`);
          idsToRemove.add(d.id);
        });
      }
    }

    if (clientHeaderPrinted) clientsAffected++;

    if (shouldDelete && idsToRemove.size > 0) {
      const newAttachments = attachments.filter((a) => !idsToRemove.has(a.id));
      await prisma.client.update({
        where: { id: client.id },
        data: { clientDetails: { ...client.clientDetails, attachments: newAttachments } },
      });
    }
  }

  console.log(
    `\n${shouldDelete ? 'Deleted' : 'Found'} ${totalRemovable} duplicate document(s) across ${totalGroups} group(s) in ${clientsAffected} client(s).`
    + (unverifiableCount ? ` (${unverifiableCount} same-category/applicant document(s) had no file content to compare and were left untouched.)` : '')
  );
  if (!shouldDelete && totalRemovable > 0) {
    console.log('Re-run with --delete to remove them (always keeps the OLDEST copy in each group; nothing else on the client is touched).');
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
