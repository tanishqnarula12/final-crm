# Storage copy: moving the older document files into Supabase Storage

**Status, 30 Sep 2026, 9:07 AM IST**

- **Canary done.** The "Test" client's 7 documents (11 files, 4.2 MB) are copied and checked.
- **Waiting on the owner.** The owner opens 2 of those documents in the live CRM (see "Owner check" below).
- **Then the rest.** The other 37 clients (152 documents, about 60 MB) follow.

---

## What this does, in one paragraph

Since 28 Sep (commit `85bbd9a`, live), every **new** client document has been saved into the private Supabase Storage
bucket `client-documents` instead of inside the database. The first was "Cancelled Cheque_Madhu Gupta" on client Alok
Rawat, 29 Sep, 10:49 AM. This step moves the **159 older documents** (187 files, about 64 MB) the same way. Afterwards:

- the database no longer carries document files;
- a client save reads kilobytes instead of megabytes;
- the database shrinks by about 64 MB, and backups get smaller.

**Nothing looks or works differently for the team.** Documents open, print and download exactly as before.

## Are documents safe, whenever they were uploaded?

Yes. This is what happens to a document depending on when it was uploaded:

| Uploaded | What happens to it |
|---|---|
| **Before 28 Sep** (file inside the database) | Copied by this script and checked three times. The original stays in two backup files. |
| **Since 28 Sep** (already in Storage) | Not touched. The script skips any document already in Storage. |
| **While the copy is running** | If someone saves a client at that moment, that client is **skipped, never overwritten**. A re-run picks it up later. |
| **After the copy** | Goes straight to Storage, as since 28 Sep. The undo command **never touches a client whose documents changed after the copy**, so a new upload can't be undone by accident. |

- **Nothing is ever deleted**, not in the database and not in Storage. Even a document someone removes later keeps its
  file in Storage and in the backup.
- **What the app shows doesn't change.** Every document keeps its name, category, applicant, position and upload date.
  The client list the app loads is identical before and after.
- **Only one thing is affected: a browser tab left open since before 28 Sep, 4:36 PM.** That tab still runs the old
  app and can't show moved files until it's reloaded. Nothing is lost; it only needs a reload.

  Ask everyone to reload the CRM once: Ctrl+Shift+R on a computer, or close and reopen the app on a phone.

## Owner check (after the canary)

In the live CRM, open client **Test** → Documents and check that these open normally:

1. **PAN Card_Test**, a photo.
2. **insurance_Test_2026-09-03_17-16**, a generated proposal page.

Optionally, also open client **Alok Rawat** → **Cancelled Cheque_Madhu Gupta**, a PDF that has been in Storage since
29 Sep.

- **If they open:** the other 37 clients are copied.
- **If anything looks wrong:** the undo command below puts the Test client back exactly as it was, in seconds.

## The numbers (dry run, 30 Sep 8:52 AM, read-only)

| | |
|---|---|
| Clients holding files in the database | 38 (one of them deleted) |
| Documents with a file in the database | 159 |
| Already in Storage | 1 (Madhu Gupta's cheque) |
| Reference without any file | 1 (left as it is) |
| Size | 64.2 MB inline in the database → about 50.7 MB in Storage |
| Clients with documents edited in the last 24 h | 0 |

Unchanged since the 29 Sep dry run.

## How it is kept safe

1. **Backup first, in two places.** Every affected client's document list is written to a backup file and read back
   to check it's complete. It's then copied to a second folder, and the two copies are compared by SHA-256 fingerprint.
   If either check fails, the script stops and nothing changes.
2. **Copy, then prove it.** Each file is uploaded, then **downloaded again and compared character for character**
   with what the database holds. If anything differs, that client is left exactly as it was.
3. **Never overwrite someone's work.** A client's document list is swapped in one statement, and only if it's still
   exactly what the script read. Nothing else in the record changes: not the notes, not the details, not even the
   "last updated" time.
4. **Check again.** After the swap, every file of that client is rebuilt from Storage through the same code the app
   uses, and compared once more.
5. **Undo is always possible.** Each client is written to a journal right after its swap, so the undo works even if
   the run is interrupted halfway (power cut, network drop).
6. **Independent check afterwards.** `--verify` confirms each copied document without downloading anything:
   - its details and position are unchanged;
   - its Storage object exists and has the right size;
   - the object holds exactly the backed-up content, checked by content hash.

## Rehearsals

- **28 Sep**, on the local copy with a separate test bucket: copy, re-run, edit guard, restore byte-identical.
- **30 Sep morning**, the same again with today's extra safety. Everything passed:
  - One client first, then the rest; the re-run found nothing left to do.
  - `--verify` found no problems.
  - Through the app's own API (8/8): every file opens byte-identical; names, order, notes and "last updated" are
    untouched.
  - **A document uploaded after the copy** went straight to Storage and opens.
  - A personal-details save left every document exactly as it was.
  - The **undo, from an interrupted run** (journal only), put a client back byte-identical.
  - The **undo skipped** the client that had a new upload, so the new document was kept.

## Progress log

| When (IST) | What | Result |
|---|---|---|
| 30 Sep 08:52 | Pre-flight: API `ok` (rev `a88a47b`); no activity in the last hour; dry run as above | ✓ |
| 30 Sep 09:06 | **Canary**: client "Test" (`id_aay0t0e`), 7 documents / 11 files, 4.2 MB | ✓ 7 copied, 0 skipped |
| 30 Sep 09:06 | Backup written, read back, second copy matches by SHA-256 | ✓ |
| 30 Sep 09:07 | `--verify`: 11 of 11 files OK, no problems | ✓ |
| next | Owner opens 2 documents of "Test" in the live CRM | waiting |
| next | The rest: 37 clients, 152 documents | — |

## Steps (the developer runs these)

The script is `server/scripts/copyClientFilesToStorage.js`, run from `server/`. It reads its settings from environment
variables set in the terminal only (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Keys are never written
into files.

1. **Pre-flight**
   - `https://crm-api.fintness.in/health` answers `ok`.
   - The activity log shows who is working.
   - `node scripts/copyClientFilesToStorage.js`, a dry run, shows the production numbers above.
2. **Canary**: `node scripts/copyClientFilesToStorage.js --apply --backup-dir <folder> --backup-copy <second folder>
   --only <clientId>`. Then `--verify <backup>.restore.json`, and the owner opens a document.
3. **The rest**: the same command without `--only`. It prints `✓ <client>` for each client, then a total, plus any
   skipped clients and why.
4. **Re-run** the same command if anything was skipped. It only picks up what's left.
5. **Verify**, read-only: `node scripts/copyClientFilesToStorage.js --verify <backup>.restore.json` for each run.
6. **Report** the numbers back to the owner.

Backup folders, outside the code and outside OneDrive:

- `C:\Users\aniln\FintnessBackups\2026-09-30-storage-copy\`
- `C:\Users\aniln\AppData\Local\FintnessBackups\2026-09-30-storage-copy\`

Each run leaves three files there: the backup (`…Z.json`), the undo file (`….restore.json`) and the journal
(`….done.jsonl`). They contain clients' KYC documents, so keep them private.

## If anything looks wrong: undo

`node scripts/copyClientFilesToStorage.js --restore <backup>.restore.json` puts each client's original document list
back, files inline in the database, exactly as before.

- **Interrupted run:** if the run was cut off before the undo file was written, pass the plain backup file (`…Z.json`)
  instead. The journal next to it tells the undo which clients were copied.
- **Only some clients:** `--only <id,id>` restores just those.
- **Never overwrites later work:** a client whose documents changed after the copy is skipped and reported, so a newer
  upload is never undone.

## After the copy

- **Rotate the Supabase `service_role` key.** The old one was shared in a chat for setup. Do it in this order, so
  documents never stop opening:
  1. Create a **new** secret key in Supabase (Project Settings → API Keys).
  2. Put it in Render → `SUPABASE_SERVICE_ROLE_KEY` and let the server redeploy.
  3. Open one stored document in the app to confirm it still works.
  4. Only then turn off the old key.

  If the old key is turned off first, stored documents can't be opened until Render has the new one. New uploads
  would fall back to the database, so they stay safe either way.
- Delete the temporary test bucket `client-documents-test`, used only for rehearsals.
- Keep both backup folders for at least 2 weeks. For an extra copy off this computer, put one on an encrypted pen drive.
- Later: the same treatment for task/Servicing attachments, chat images and query attachments (NEXT_STEPS §3 step 3).
