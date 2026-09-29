# Tonight: copy the existing document files into Supabase Storage

Planned for the night of **29 Sep 2026**, when nobody is using the CRM (after about 11 PM IST).
It needs the owner's final "go ahead" at run time. Expected duration: 5–10 minutes.

---

## What this does, in one paragraph

Since 28 Sep (commit `85bbd9a`, live), every **new** client document is saved into the private Supabase Storage
bucket `client-documents` instead of inside the database. The first real one went in on 29 Sep at 10:47 AM:
"Cancelled Cheque_Madhu Gupta" on client Alok Rawat, now a 10 KB PDF in the bucket. Tonight's step moves the **159
older documents** (187 files, about 64 MB) the same way. Afterwards the database no longer carries document files. A
client save then reads kilobytes instead of megabytes, the database shrinks by about 64 MB, and backups get smaller.
**Nothing looks or works differently for the team.** Documents open, print and download exactly as before.

## What the dry run found (29 Sep, read-only)

| | |
|---|---|
| Clients holding files | 38 (one of them deleted) |
| Documents with a file | 159 of 160 (1 is a reference with no file) |
| Files to copy | 187: 93 photos (JPEG), 38 PDFs, 28 proposal/MOM pages + 28 copies of them |
| Size | 64.2 MB inline in the database → 50.7 MB in Storage |
| Rebuilds exactly | 187 / 187 |
| Duplicates / missing ids | none |

## How it is kept safe

1. **Backup first.** Before touching anything, every affected client's document list is written to a backup file.
   It's read back and compared; if the check fails, the script stops and nothing changes.
2. **Copy, then prove it.** Each file is uploaded, then **downloaded again and compared character for character**
   with what the database holds. If anything differs, that client is left exactly as it was.
3. **Never overwrite someone's work.** A client's document list is swapped in one statement, and only if it's still
   exactly what the script read. If anyone saves that client in between, the swap doesn't happen and the client is
   listed as "skipped" for a re-run. Nothing else in the record changes: not the notes, not the details, not even
   the "last updated" time.
4. **Check again.** After the swap, every file of that client is rebuilt from Storage and compared once more.
5. **Nothing is ever deleted.** Files stay in Storage even if a document is later removed. The backup file makes a
   full undo possible (below).

The same script was rehearsed on 28 Sep on the local copy with a separate test bucket:

- copy: all files moved and opened byte-identical; names, order, notes and "last updated" untouched;
- run again: found nothing left to do;
- edit guard: a changed list was never overwritten;
- restore: everything back byte-identical.

## Steps (the developer runs these)

The script is `server/scripts/copyClientFilesToStorage.js`, committed with this change. It reads its settings from
environment variables in the terminal only (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Keys are
never written into files.

1. **Pre-flight**
   - `https://crm-api.fintness.in/health` answers `ok`.
   - Nobody is working. Check the activity log for the last 30 minutes.
   - A new read-only dry run matches the numbers above, allowing for documents added during the day.
2. **Dry run**: `node scripts/copyClientFilesToStorage.js`. Lists the clients and documents, and changes nothing.
3. **Copy**: `node scripts/copyClientFilesToStorage.js --apply --backup-dir <folder outside the repo>`.
   Prints `✓ <client>` per client, then a total, plus any clients skipped and why.
4. **Re-run** the same command if anything was skipped. It picks up only what's left.
5. **Verify**, all read-only:
   - Every document is now either in Storage or listed as intentionally inline (no id or no file).
   - Every stored file rebuilds byte-identical against the backup.
   - The slim client list is unchanged for all live clients.
   - A few documents open in the live app: a PDF, a photo, a proposal.
6. **Report** the numbers back to the owner.

## If anything looks wrong: undo

`node scripts/copyClientFilesToStorage.js --restore <backup>.restore.json` puts each client's original document list
back, with the files inline in the database exactly as before. It only touches clients whose list hasn't changed
since the copy. Supabase's own daily backup (Dashboard → Database → Backups) is a second safety net.

## After tonight

- **Rotate the Supabase `service_role` key.** The old one was shared in a chat for setup. Do it in this order, so
  documents never stop opening:
  1. Create a **new** secret key in Supabase (Project Settings → API Keys).
  2. Put it in Render → `SUPABASE_SERVICE_ROLE_KEY` and let the server redeploy.
  3. Open one stored document in the app to confirm it still works.
  4. Only then turn off the old key.

  If the old key is turned off first, stored documents can't be opened until Render has the new one. New uploads
  would fall back to the database, so they stay safe either way.
- Delete the temporary test bucket `client-documents-test` (used only for rehearsals).
- Keep the backup file for at least 2 weeks.
- Later: the same treatment for task/Servicing attachments, chat images and query attachments (NEXT_STEPS §3 step 3).
