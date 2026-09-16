// Read-only diagnostic: lists every client document whose name carries a
// "(n)" suffix (e.g. "PAN Card (3)_Reena Bansal") — the mark left by the
// syncDocumentsToClient bug — alongside how many OTHER documents actually
// share its (category, applicantName) group.
//
// This exists to tell apart the two things that bug could have done:
//   - group size 1: the suffix is pure cosmetic drift — this is the ONLY
//     document of its kind, so it should just be "PAN Card_Reena Bansal"
//     with no suffix at all. Nothing was ever duplicated.
//   - group size 2+: there really are multiple documents here (could be a
//     genuine re-upload, or a true duplicate the hash-based dedupe script
//     didn't catch because the content isn't byte-identical, e.g. a
//     re-compressed copy of the same photo).
//
// Changes nothing — for deciding what (if anything) a follow-up fix needs
// to do.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SUFFIX_RE = /^(.*) \((\d+)\)_(.*)$/;

async function main() {
  const clients = await prisma.client.findMany({ where: { deletedAt: null } });
  let suspectCount = 0;
  let soleCopyCount = 0;
  let multiCopyCount = 0;

  for (const client of clients) {
    const attachments = client.clientDetails?.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) continue;

    const groups = new Map();
    for (const att of attachments) {
      if (!att || typeof att !== 'object' || !att.id) continue;
      const key = `${(att.category || '').toLowerCase()}|||${att.applicantName || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(att);
    }

    let header = false;
    for (const att of attachments) {
      if (!att || typeof att !== 'object' || !SUFFIX_RE.test(att.name || '')) continue;
      suspectCount++;
      const key = `${(att.category || '').toLowerCase()}|||${att.applicantName || ''}`;
      const groupSize = groups.get(key)?.length || 1;
      if (groupSize <= 1) soleCopyCount++; else multiCopyCount++;

      if (!header) { console.log(`\nClient: ${client.name} (${client.id})`); header = true; }
      console.log(`  ${att.id}  "${att.name}"  — group size ${groupSize}${groupSize <= 1 ? '  [SOLE COPY — suffix is pure drift]' : '  [multiple in this category/applicant]'}`);
    }
  }

  console.log(`\n${suspectCount} document(s) with a "(n)" suffix in their name: ${soleCopyCount} are the sole copy of their kind (drift only, nothing duplicated), ${multiCopyCount} share their category/applicant with at least one other document.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
