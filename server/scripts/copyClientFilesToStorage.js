// One-off: copy client document files that are still inline in the database
// (clients.clientDetails.attachments[].dataUrl/html/data) into Supabase
// Storage, the same way new saves have stored them since 28 Sep 2026.
//
//   node scripts/copyClientFilesToStorage.js                 dry run (default): lists, changes nothing
//   node scripts/copyClientFilesToStorage.js --apply --backup-dir <dir>
//   node scripts/copyClientFilesToStorage.js --restore <backup.json>
//
// Needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and optionally
// SUPABASE_STORAGE_BUCKET) in the environment. Safe to re-run: documents
// already in Storage are skipped.
//
// --apply, per client:
//   1. Before anything: every affected client's attachments are written to a
//      backup file (and read back to check it's complete).
//   2. Each inline document is uploaded, then DOWNLOADED again and compared,
//      string for string, with what the database holds. Any difference: that
//      client is left exactly as it was.
//   3. The client's attachments are replaced in one statement that only
//      succeeds if the list is still exactly what was read — a user saving
//      that client in between is never overwritten (the client is reported
//      as skipped; run again later). Nothing else in the record changes, not
//      even updatedAt.
//   4. Read back and checked once more: every file rebuilds exactly.
// --restore puts the attachments from a backup file back (same guard: only
// where the list is unchanged since the copy).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../src/db.js';
import { storageEnabled, getObject, decodeFileString } from '../src/lib/storage.js';
import { storeAttachmentFiles, loadFiles } from '../src/lib/clientFiles.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const RESTORE = args.includes('--restore') ? args[args.indexOf('--restore') + 1] : null;
const BACKUP_DIR = args.includes('--backup-dir') ? args[args.indexOf('--backup-dir') + 1] : null;
const KEYS = ['dataUrl', 'html', 'data'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const inlineKeys = (a) => (isObj(a) && a.id && !a.storage ? KEYS.filter((k) => typeof a[k] === 'string') : []);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

// Replace a client's attachments only if they are still exactly `expected`.
const swapAttachments = async (id, expected, next) => prisma.$executeRaw`
  UPDATE clients SET "clientDetails" = jsonb_set("clientDetails", '{attachments}', ${JSON.stringify(next)}::jsonb)
  WHERE id = ${id} AND md5(("clientDetails"->'attachments')::text) = md5(${JSON.stringify(expected)}::jsonb::text)`;

async function affectedClients() {
  const rows = await prisma.client.findMany({ select: { id: true, name: true, deletedAt: true, clientDetails: true } });
  return rows.filter((r) => Array.isArray(r.clientDetails?.attachments) && r.clientDetails.attachments.some((a) => inlineKeys(a).length));
}

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  let restored = 0, skipped = 0;
  for (const c of backup.clients) {
    const row = await prisma.client.findUnique({ where: { id: c.id }, select: { clientDetails: true } });
    const current = row?.clientDetails?.attachments;
    if (!Array.isArray(current) || md5(JSON.stringify(current)) !== c.afterMd5) { skipped++; console.log(`  skipped ${c.id} (changed since the copy)`); continue; }
    const n = await swapAttachments(c.id, current, c.attachments);
    if (n === 1) restored++; else skipped++;
  }
  console.log(`restored ${restored} client(s), skipped ${skipped}`);
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  if (APPLY && !storageEnabled()) throw new Error('Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  if (APPLY && !BACKUP_DIR) throw new Error('--apply needs --backup-dir <dir>');

  const clients = await affectedClients();
  const docs = clients.flatMap((c) => c.clientDetails.attachments.filter((a) => inlineKeys(a).length));
  const bytes = docs.reduce((n, a) => n + inlineKeys(a).reduce((m, k) => m + a[k].length, 0), 0);
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${clients.length} client(s), ${docs.length} document(s) with inline files, ${mb(bytes)} inline`);
  if (!APPLY) { for (const c of clients) console.log(`  ${c.id}${c.deletedAt ? ' (deleted)' : ''}: ${c.clientDetails.attachments.filter((a) => inlineKeys(a).length).length} document(s)`); return; }

  // 1. Backup first, and prove it's complete.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `client-attachments-before-storage-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), clients: clients.map((c) => ({ id: c.id, attachments: c.clientDetails.attachments })) }));
  const check = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  if (check.clients.length !== clients.length || check.clients.some((c, i) => JSON.stringify(c.attachments) !== JSON.stringify(clients[i].clientDetails.attachments))) throw new Error('backup check failed — nothing changed');
  console.log(`backup: ${backupFile} (${mb(fs.statSync(backupFile).size)}), verified`);

  let moved = 0, clientsDone = 0;
  const skipped = [];
  const done = [];
  for (const c of clients) {
    const before = c.clientDetails.attachments;
    try {
      // 2. Upload, then download and compare every file.
      const next = [];
      for (const a of before) {
        if (!inlineKeys(a).length) { next.push(a); continue; }
        const stored = await storeAttachmentFiles(c.id, a);
        for (const k of inlineKeys(a)) {
          const ref = stored.storage[k];
          const back = decodeFileString(await getObject(ref.path), ref);
          if (back !== a[k]) throw new Error(`download of ${a.id}/${k} didn't match`);
        }
        next.push(stored);
      }
      // 3. Swap, only if nobody changed the list meanwhile.
      const n = await swapAttachments(c.id, before, next);
      if (n !== 1) { skipped.push(`${c.id}: changed while copying — run again`); continue; }
      // 4. Read back and rebuild every file.
      const row = await prisma.client.findUnique({ where: { id: c.id } });
      const files = await loadFiles(row, before.filter((a) => inlineKeys(a).length).map((a) => a.id));
      for (const a of before) for (const k of inlineKeys(a)) {
        if (files[a.id]?.[k] !== a[k]) throw new Error(`after the swap ${a.id}/${k} doesn't rebuild — restore from the backup`);
      }
      const count = before.filter((a) => inlineKeys(a).length).length;
      moved += count; clientsDone++;
      done.push({ id: c.id, afterMd5: md5(JSON.stringify(row.clientDetails.attachments)) });
      console.log(`  ✓ ${c.id}: ${count} document(s)`);
    } catch (err) {
      skipped.push(`${c.id}: ${err.message}`);
      console.log(`  ✗ ${c.id}: ${err.message}`);
    }
  }
  // Record, per client, what the list looked like after the copy — --restore
  // only puts a backup back where nothing has changed since.
  const b = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  for (const c of b.clients) c.afterMd5 = done.find((d) => d.id === c.id)?.afterMd5 || null;
  b.clients = b.clients.filter((c) => c.afterMd5);
  fs.writeFileSync(backupFile.replace(/\.json$/, '.restore.json'), JSON.stringify(b));
  console.log(`done: ${moved} document(s) on ${clientsDone} client(s) copied to Storage${skipped.length ? `; ${skipped.length} skipped:\n  ${skipped.join('\n  ')}` : ''}`);
}

main()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
