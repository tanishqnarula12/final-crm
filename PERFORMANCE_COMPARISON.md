# Fintness CRM: before and after the speed and egress fixes

Written 30 Sep 2026, covering the fixes shipped on 28–30 Sep.

- **Measured** figures come from production, read-only, or from tests on a copy.
- **Estimated** figures are calculated from those measurements.
- The real daily egress is on the Supabase dashboard (see "How to check" at the end).

---

## In short

- **Egress:** about **32 GB/day before → about 1–2 GB/day now** (estimate), roughly **95% less**. The monthly limit is
  250 GB. Before, the CRM was on course for about 970 GB a month; now it's about 30–60 GB.
- **Data per screen and per save:** 33× to 1,000× less, depending on the action (table below).
- **Speed:** the reminder check went from 18.8 s to 0.09 s. Saving a note on a big client went from ~700 ms to ~50 ms.
  Login and the Clients screen download 68× less.
- **Database errors:** about 10,000 a day from repeat reminders → 0.
- **Documents:** all 159 older client documents moved to Supabase Storage on 30 Sep, checked file by file. Nothing was
  lost.

---

## 1. Egress (data sent out of Supabase)

| Period | Per day | Per month | Status |
|---|---|---|---|
| **Before 28 Sep:** 681 GB used in the first 21 days of the 7 Sep–7 Oct cycle | **~32 GB** | ~970 GB against a 250 GB limit | Measured (Supabase bill) |
| After the 28–29 Sep fixes, before the reminder fix | ~3–5 GB | ~100–150 GB | Estimate |
| **Now, all fixes live (from 30 Sep, 11:07 AM IST)** | **~1–2 GB** | **~30–60 GB** | Estimate |

The 28 Sep estimate of 1–2 GB/day missed the reminder job's ~2.9 GB/day. That was only found on 30 Sep, from the
Supabase logs, and it's fixed now. So 1–2 GB/day is the realistic figure from 1 Oct on.

**Where the egress was going, and what stopped it:**

| Cause | Egress it caused | Fix | Commit |
|---|---|---|---|
| Every open Dashboard / Clients / Documents / profile screen re-downloaded the full client list (61.9 MB, document files inside) every 12 seconds, plus on login and after most saves | Most of the ~32 GB/day | Client list without files; refresh asks "changed since?" first | `c17870d` |
| Task list re-downloaded with its attachments (9.7 MB) | Part of the rest | Task list without files; files open on click | `4537cf0`, `41f4ae1` |
| Permission matrix re-downloaded every 30 s by every tab (23 KB) | Small | Answers "unchanged" (58 bytes) | `49ce31b` |
| Reminder job read all tasks whole (14.6 MB) every minute for 3 hours a day | **~2.6 GB/day** | Reads only the 4 fields it uses (25 KB) | `cffac8a` |
| Birthday/anniversary job read every profile with photos twice a minute from 8 AM | ~0.25 GB/day | Reads only the 2 dates it uses (0.9 KB) | `cffac8a` |
| Every client save/open read the whole client with its documents (up to 4.7 MB) | Per save | Document files moved to Storage; a client record is now ≤ 4.7 KB | `85bbd9a`, copy on 30 Sep |

---

## 2. Data moved per action (measured)

| What happens | Before | Now | Smaller by |
|---|---|---|---|
| Client list: login / Clients screen | 61.9 MB | 908 KB | **68×** |
| Background refresh when nothing changed (every 12 s) | 61.9 MB | 58 bytes | ~1,000,000× |
| Task list | 9.7 MB | 0.29 MB | **33×** |
| Permission re-check (every 30 s, every open tab) | 23 KB | 58 bytes | 400× |
| All client data in the database | 64 MB | 1 MB | **64×** |
| Biggest client record (Abhilasha Gahlawat), read on every save | 4.7 MB | 4.7 KB | **1,000×** |
| Reminder check (every minute in the 9, 1 and 5 o'clock hours) | 14.6 MB | 25 KB | **600×** |
| Birthday / anniversary check (twice a minute from 8 AM) | 133 KB | 0.9 KB | 150× |
| Opening one document | the file, as base64 text | the same file as a real file | ~20% smaller |

---

## 3. Speed (measured)

| What | Before | Now | How measured |
|---|---|---|---|
| Reminder check | **18.8 s** | **0.09 s** (200× faster) | Production, read-only, timed from the developer's laptop on 30 Sep |
| Opening the biggest client record | had to move 4.7 MB | **87 ms** | Production, same way |
| Saving a note on a client with many documents | ~700 ms | **~50 ms** (14× faster) | Test copy, 10 MB client, 28 Sep |
| A saved note showing on screen | after a full reload of all clients | **~60 ms** | Test copy, 28 Sep |
| Server time lost to repeat reminders | ~19 s of every minute, 3 hours a day | none | Supabase log, 30 Sep |

On the real server (Render ↔ Supabase), the absolute times are shorter than from a laptop. The before/after ratios
still hold.

**What the team notices:**

- Login and the Clients screen open quickly. 62 MB on a typical office connection took close to a minute; 0.9 MB
  takes under a second. This line is a calculation, not a timing.
- Saves on clients with many documents are quicker.
- The 9–10, 1–2 and 5–6 o'clock hours are no longer slowed by the reminder job.

---

## 4. Database health

| | Before | Now |
|---|---|---|
| "duplicate key" errors in the Supabase Postgres log | ~10,000 a day (about 59 a minute in the 9, 1 and 5 o'clock hours) | 0 (tested; the 1 PM production check is below) |
| Client document files inside the database | 159 documents, 64 MB | 0; all in Storage (bucket `client-documents`, 185 objects, 49.4 MB) |
| Largest client record | 4.7 MB | 3.7 KB |
| Whole database on disk | 118 MB | 118 MB for now. Postgres reuses the freed space rather than handing it back, which doesn't affect speed or egress |

**1 PM production check of the reminder fix:** *to be filled in after 1:06 PM IST, 30 Sep.*

---

## 5. What still carries files in the database (next step)

NEXT_STEPS.md §3, step 3 moves these into Storage the same way as the client documents:

| Where | Size |
|---|---|
| Task / Servicing attachments (incl. stage history) | ~7.5 MB |
| Chat images | ~7.6 MB |
| Query attachments | ~2.1 MB |

They're no longer sent with any list, so they only cost egress when someone opens one. Once they're moved as well, the
data held in the database comes to about 50 MB, against about 122 MB on 28 Sep (NEXT_STEPS.md §3 estimate).

---

## How to check the real egress

1. Supabase → your project → **Usage** → **Egress**, daily view.
2. Compare:
   - **28 Sep or earlier**: the old pattern, about 32 GB/day.
   - **29 Sep**: the first full day after the 28 Sep fixes, still with the old reminder job.
   - **1 Oct and later**: every fix live. Expect about 1–2 GB/day.
3. The 681 GB already used stays on this cycle until 7 Oct. The new cycle from 7 Oct should end well under 250 GB.

## Commits

| Commit | What |
|---|---|
| `c17870d` | Client list without files, "changed since?" refresh, per-client updates, partial task saves |
| `49ce31b` | Permission re-check answers "unchanged" |
| `4537cf0`, `41f4ae1` | Task list without files |
| `eeb4bea`, `46fcf65`, `7eec589` | Notes save on their own |
| `85bbd9a`, `62a05a7` | New client documents go to Supabase Storage |
| `a15ab95`, `94a3e7a` | Copy of the 159 older documents into Storage (30 Sep) |
| `cffac8a` | Reminder job reads only what it needs; no repeat-reminder errors |
