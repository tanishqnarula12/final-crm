// One-off: copy client document files that are still inline in the database
// (clients.clientDetails.attachments[].dataUrl/html/data) into Supabase
// Storage, the same way new saves have stored them since 28 Sep 2026.
//
//   node scripts/copyClientFilesToStorage.js                 dry run (default): lists, changes nothing
//   node scripts/copyClientFilesToStorage.js --apply --backup-dir <dir> [--backup-copy <dir2>] [--only <id,id>]
//   node scripts/copyClientFilesToStorage.js --verify <backup.json>      read-only check after a copy
//   node scripts/copyClientFilesToStorage.js --restore <backup.json> [--only <id,id>]
//
// Needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and optionally
// SUPABASE_STORAGE_BUCKET) in the environment. Safe to re-run: documents
// already in Storage are skipped. --only limits a run to some clients (e.g.
// one client first, checked in the app, then the rest).
//
// --apply, per client:
//   1. Before anything: every affected client's attachments are written to a
//      backup file, read back to check it's complete, and (with
//      --backup-copy) copied to a second folder and checked by SHA-256.
//   2. Each inline document is uploaded, then DOWNLOADED again and compared,
//      string for string, with what the database holds. Any difference: that
//      client is left exactly as it was.
//   3. The client's attachments are replaced in one statement that only
//      succeeds if the list is still exactly what was read — a user saving
//      that client in between is never overwritten (the client is reported
//      as skipped; run again later). Nothing else in the record changes, not
//      even updatedAt.
//   4. Read back and checked once more: every file rebuilds exactly.
//   5. The client is written to a journal (<backup>.done.jsonl) straight
//      away, so --restore works even if the run is interrupted.
// Nothing is ever deleted: not in the database, not in Storage.
// --verify checks, without downloading any file, that every copied document
// still has the same details and position, and that its Storage object exists,
// has the right size and holds exactly the backed-up content (by hash).
// --restore puts the attachments from a backup file back (same guard: only
// where the list is unchanged since the copy).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../src/db.js';
import { config } from '../src/config.js';
import { storageEnabled, getObject, encodeFileString, decodeFileString, contentHash, pathSegment } from '../src/lib/storage.js';
import { storeAttachmentFiles, loadFiles } from '../src/lib/clientFiles.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
};
const APPLY = args.includes('--apply');
const RESTORE = opt('--restore');
const VERIFY = opt('--verify');
const BACKUP_DIR = opt('--backup-dir');
const BACKUP_COPY = opt('--backup-copy');
const ONLY = opt('--only') ? opt('--only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const KEYS = ['dataUrl', 'html', 'data'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const inlineKeys = (a) => (isObj(a) && a.id && !a.storage ? KEYS.filter((k) => typeof a[k] === 'string') : []);
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const stable = (v) => JSON.stringify(v, (_k, val) => (isObj(val)
  ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
  : val));
// A document's details — everything but the file itself (what the app shows).
const details = (a) => (isObj(a) ? Object.fromEntries(Object.entries(a).filter(([k]) => !KEYS.includes(k) && k !== 'storage' && k !== 'fileStripped')) : a);
const journalOf = (file) => file.replace(/(\.restore)?\.json$/, '.done.jsonl');

// Postgres's own fingerprint of an attachments list (key order doesn't matter).
const listMd5 = async (list) => (await prisma.$queryRaw`SELECT md5(${JSON.stringify(list)}::jsonb::text) AS h`)[0].h;
// Replace a client's attachments only if they are still exactly the list
// with fingerprint `expectedMd5`.
const swapAttachments = async (id, expectedMd5, next) => prisma.$executeRaw`
  UPDATE clients SET "clientDetails" = jsonb_set("clientDetails", '{attachments}', ${JSON.stringify(next)}::jsonb)
  WHERE id = ${id} AND md5(("clientDetails"->'attachments')::text) = ${expectedMd5}`;

// Size of a stored object, from Storage's info endpoint (no file download;
// a HEAD comes back compressed for text files, without a length).
async function objectSize(p) {
  const { url, serviceKey, bucket } = config.storage;
  const res = await fetch(`${url}/storage/v1/object/info/${encodeURIComponent(bucket)}/${p.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }, signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Storage info failed (${res.status})`);
  const size = Number((await res.json())?.size);
  return Number.isFinite(size) ? size : null;
}

async function affectedClients() {
  const rows = await prisma.client.findMany({
    where: ONLY ? { id: { in: ONLY } } : undefined,
    select: { id: true, name: true, deletedAt: true, clientDetails: true },
    orderBy: { createdAt: 'asc' },
  });
  if (ONLY) for (const id of ONLY) if (!rows.some((r) => r.id === id)) console.log(`  (no client ${id})`);
  return rows.filter((r) => Array.isArray(r.clientDetails?.attachments) && r.clientDetails.attachments.some((a) => inlineKeys(a).length));
}

const readJournal = (file) => {
  const done = new Map();
  const j = journalOf(file);
  if (fs.existsSync(j)) for (const line of fs.readFileSync(j, 'utf8').split('\n')) if (line.trim()) { const e = JSON.parse(line); done.set(e.id, e.afterMd5); }
  return done;
};

async function restore(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const journal = readJournal(file);
  let restored = 0, skipped = 0, notCopied = 0;
  for (const c of backup.clients) {
    if (ONLY && !ONLY.includes(c.id)) continue;
    const afterMd5 = c.afterMd5 || journal.get(c.id);
    if (!afterMd5) { notCopied++; continue; } // never swapped — nothing to put back
    // Only where the list is still exactly what the copy wrote: a document
    // someone added or changed since is never undone.
    const n = await swapAttachments(c.id, afterMd5, c.attachments);
    if (n === 1) { restored++; console.log(`  ↺ ${c.id}`); } else { skipped++; console.log(`  skipped ${c.id} (its documents changed since the copy — restore it by hand from the backup)`); }
  }
  console.log(`restored ${restored} client(s), skipped ${skipped}${notCopied ? `, ${notCopied} never copied (nothing to undo)` : ''}`);
}

async function verify(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  const journal = readJournal(file);
  const list = backup.clients.filter((c) => (!ONLY || ONLY.includes(c.id)) && (c.afterMd5 || journal.has(c.id)));
  const rows = new Map((await prisma.client.findMany({ where: { id: { in: list.map((c) => c.id) } }, select: { id: true, clientDetails: true } })).map((r) => [r.id, r]));
  const problems = [];
  let files = 0, docs = 0, changedSince = 0;
  for (const c of list) {
    const cur = rows.get(c.id)?.clientDetails?.attachments;
    if (!Array.isArray(cur)) { problems.push(`${c.id}: no attachments list any more`); continue; }
    // Same documents, same order, same details — what the app shows is unchanged
    // (unless someone has edited the list since, which is theirs to do).
    const edited = stable(cur.map(details)) !== stable(c.attachments.map(details));
    if (edited) {
      changedSince++;
      console.log(`  note ${c.id}: its document list was edited after the copy (checking the copied files still)`);
    }
    const curById = new Map(cur.filter((a) => isObj(a) && a.id).map((a) => [a.id, a]));
    for (const a of c.attachments) {
      const now = isObj(a) && a.id ? curById.get(a.id) : null;
      if (!inlineKeys(a).length) {
        if (now && !edited && stable(now) !== stable(a)) problems.push(`${c.id}/${a.id}: a document that wasn't copied changed`);
        continue;
      }
      if (!now) {
        if (edited) console.log(`  note ${c.id}/${a.id}: removed from the client after the copy (its file is still in Storage and in the backup)`);
        else problems.push(`${c.id}/${a.id}: document no longer on the client`);
        continue;
      }
      docs++;
      for (const k of inlineKeys(a)) {
        const ref = now.storage?.[k];
        if (!isObj(ref)) { problems.push(`${c.id}/${a.id}/${k}: no Storage reference`); continue; }
        const { bytes, ref: want } = encodeFileString(a[k], k);
        const bad = [];
        if (ref.enc !== want.enc || (ref.prefix ?? null) !== (want.prefix ?? null)) bad.push('encoding');
        if (ref.size !== bytes.length) bad.push('size');
        if (ref.path !== `clients/${pathSegment(c.id)}/${pathSegment(a.id)}/${k}-${contentHash(bytes)}`) bad.push('path/hash');
        if (decodeFileString(bytes, ref) !== a[k]) bad.push('rebuild');
        const size = await objectSize(ref.path);
        if (size !== bytes.length) bad.push(size === null ? 'object missing' : `object size ${size}`);
        if (bad.length) problems.push(`${c.id}/${a.id}/${k}: ${bad.join(', ')}`); else files++;
      }
    }
  }
  console.log(`verify: ${list.length} client(s), ${docs} document(s), ${files} file(s) OK${changedSince ? `, ${changedSince} list(s) edited since` : ''}`);
  if (problems.length) { console.log(`PROBLEMS (${problems.length}):\n  ${problems.join('\n  ')}`); process.exitCode = 1; } else console.log('no problems');
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  if (VERIFY) return verify(VERIFY);
  if (APPLY && !storageEnabled()) throw new Error('Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  if (APPLY && !BACKUP_DIR) throw new Error('--apply needs --backup-dir <dir>');

  const clients = await affectedClients();
  const docs = clients.flatMap((c) => c.clientDetails.attachments.filter((a) => inlineKeys(a).length));
  const bytes = docs.reduce((n, a) => n + inlineKeys(a).reduce((m, k) => m + a[k].length, 0), 0);
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}${ONLY ? ` (only ${ONLY.join(', ')})` : ''}: ${clients.length} client(s), ${docs.length} document(s) with inline files, ${mb(bytes)} inline — bucket "${config.storage.bucket}"`);
  if (!APPLY) { for (const c of clients) console.log(`  ${c.id}${c.deletedAt ? ' (deleted)' : ''}: ${c.clientDetails.attachments.filter((a) => inlineKeys(a).length).length} document(s)`); return; }
  if (!clients.length) { console.log('nothing to copy'); return; }

  // 1. Backup first, and prove it's complete.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `client-attachments-before-storage-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ takenAt: new Date().toISOString(), bucket: config.storage.bucket, clients: clients.map((c) => ({ id: c.id, name: c.name, attachments: c.clientDetails.attachments })) }));
  const check = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  if (check.clients.length !== clients.length || check.clients.some((c, i) => JSON.stringify(c.attachments) !== JSON.stringify(clients[i].clientDetails.attachments))) throw new Error('backup check failed — nothing changed');
  const sha = sha256File(backupFile);
  console.log(`backup: ${backupFile} (${mb(fs.statSync(backupFile).size)}), verified, sha256 ${sha.slice(0, 16)}…`);
  let copyFile = null;
  if (BACKUP_COPY) {
    fs.mkdirSync(BACKUP_COPY, { recursive: true });
    copyFile = path.join(BACKUP_COPY, path.basename(backupFile));
    fs.copyFileSync(backupFile, copyFile);
    if (sha256File(copyFile) !== sha) throw new Error('second backup copy does not match — nothing changed');
    console.log(`backup copy: ${copyFile}, sha256 matches`);
  }
  const journal = journalOf(backupFile);

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
      if (next.length !== before.length || stable(next.map(details)) !== stable(before.map(details))) throw new Error('new list would differ in documents or details — left as it was');
      // 3. Swap, only if nobody changed the list meanwhile.
      const afterMd5 = await listMd5(next);
      const n = await swapAttachments(c.id, await listMd5(before), next);
      if (n !== 1) { skipped.push(`${c.id}: changed while copying — run again`); console.log(`  – ${c.id}: changed while copying, left as it was`); continue; }
      // 5. Journal straight away, so an undo is possible whatever happens next.
      fs.appendFileSync(journal, `${JSON.stringify({ id: c.id, afterMd5 })}\n`);
      done.push({ id: c.id, afterMd5 });
      // 4. Read back and rebuild every file.
      const row = await prisma.client.findUnique({ where: { id: c.id } });
      const files = await loadFiles(row, before.filter((a) => inlineKeys(a).length).map((a) => a.id));
      for (const a of before) for (const k of inlineKeys(a)) {
        if (files[a.id]?.[k] !== a[k]) throw new Error(`after the swap ${a.id}/${k} doesn't rebuild — restore from the backup`);
      }
      const count = before.filter((a) => inlineKeys(a).length).length;
      moved += count; clientsDone++;
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
  const restoreFile = backupFile.replace(/\.json$/, '.restore.json');
  fs.writeFileSync(restoreFile, JSON.stringify(b));
  if (copyFile) {
    fs.copyFileSync(restoreFile, path.join(BACKUP_COPY, path.basename(restoreFile)));
    fs.copyFileSync(journal, path.join(BACKUP_COPY, path.basename(journal)));
  }
  console.log(`done: ${moved} document(s) on ${clientsDone} client(s) copied to Storage${skipped.length ? `; ${skipped.length} skipped:\n  ${skipped.join('\n  ')}` : ''}`);
  console.log(`undo: node scripts/copyClientFilesToStorage.js --restore "${restoreFile}"`);
}

main()
  .catch((err) => { console.error('FAILED:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
