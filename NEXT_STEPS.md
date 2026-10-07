# Fintness CRM: planned follow-up work

Written 28 Sep 2026, right after the speed fix (commit `c17870d`) went live, and updated as each item ships.
Do the items in the order of section 5, one at a time. Each gets tested and deployed the way section 6 describes.

## Progress log

| When (UTC) | Item | Commit | Status |
|---|---|---|---|
| 28 Sep, 15:19 | §2 Sessions stay signed in while used + sign-in box when a session ends | `c981013` | ✅ Live |
| 28 Sep, 15:32 | §4-B Permission matrix re-check sends "unchanged" (58 bytes) instead of 23 KB | `49ce31b` | ✅ Live |
| 28 Sep, 15:38 | §4-H step 1 (server): a client save that leaves `notes` out keeps the stored notes | `46fcf65` | ✅ Live |
| 28 Sep, ~15:50 | §4-H step 2 (app): client saves stop sending notes; Edit Client form stops sending documents | `7eec589` | ✅ Live (website only — Render doesn't redeploy for non-`server/` changes, so `/health` stays on `46fcf65`) |
| 28 Sep, 16:11 | §4-A step 1 (server): `?slim=1` task lists, `GET /tasks/:id/files`, files restored on save | `4537cf0` | ✅ Live |
| 28 Sep, 16:35 | §4-A step 2 (app): tasks load slim (9.7 MB → 0.29 MB); files open on click | `41f4ae1` | ✅ Live (website) |
| 28 Sep, 16:41 | §4-F part 1: activity logs never store or send file contents | `92222c4` | ✅ Live — storing part reversed, see next row |
| 28 Sep, 17:22 | §4-F: logs stored **complete** again (owner: logs protect the system's integrity); the log *screens* still show a label instead of files. Plus a nightly clean-up of read notifications older than 60 days | `9dcc3a8`, `c17c20c` | ✅ Live |
| 28 Sep, 18:09 | §3 step 1 (server): newly saved client document files go to Supabase Storage; existing files untouched (+ `62a05a7`, content-hash file names, 18:13) | `85bbd9a` | ✅ Live. First real upload stored on 29 Sep 10:47 IST |
| 29 Sep | Investigated Preksha's "reverted" renewals and missing up-sell (see §8). Restored 3 records deleted on 25 Aug | — | ✅ Done (data fix, owner-approved) |
| 29 Sep, 16:25 IST | Delete safety, server (§8 prevention 0–2): only named records deleted; people on a record told about a delete; admin `GET /api/deleted` + restore | `a88a47b` | ✅ Live |
| 29 Sep, 16:49 IST | Delete safety, app: Leads/Meetings/Queries saves name their deletes; admin **Recently deleted** screen (Account menu) with Restore; delete questions name the record; failed saves announced on every screen | `963e6eb` | ✅ Live |
| 30 Sep, 03:36–03:50 (9:06–9:20 AM IST) | §3 step 2: **all 159 older client documents (187 files, 64 MB) copied to Storage.** One client first ("Test"), which the owner opened in the live CRM, then the other 37. Verify 187/187, nothing left inline, 0 skipped. Client data in the database is now 999 kB instead of 64 MB | script `a15ab95` | ✅ Done. Log + undo: [STORAGE_COPY_TONIGHT.md](STORAGE_COPY_TONIGHT.md) |
| 30 Sep, 05:37 (11:07 AM IST) | **Reminder scheduler reads less.** The owner spotted ~59 "duplicate key" errors a minute in the Supabase log. Every minute of the 9/13/17 o'clock hours the task-due job re-read all 152 tasks whole (14.6 MB, attachments included) and re-offered the 59 reminders already sent. The birthday jobs read every profile twice a minute. Now: only the fields used (25 KB and 0.9 KB), already-sent reminders skipped before inserting. About **2.9 GB/day less egress**, 0 errors. Reminders identical, checked old vs new on the same data | `cffac8a` | ✅ Live. Confirmed 1 PM: 59 reminders sent once (13:00:36–54), 0 rejected repeats 13:15–13:18 |
| 30 Sep, 13:19 (6:49 PM IST) | **Phones, tablets, foldables.** Below 768px: bottom tab bar (Dash · Leads · Clients · Tasks · More) instead of the rail, card lists instead of wide tables (Tasks, Queries, Meetings, Clients, all Servicing registers, admin logs, client-profile boxes), headers that wrap, popups as bottom sheets, row actions visible on touch, no iOS zoom on fields, Notice Board first on the dashboard below 1280px. **Phone chat, WhatsApp-style:** full-screen list/conversation sized to the keyboard, swipe right to reply, press-and-hold sheet (reactions, Reply, Copy, Select text, Pin, Edit, Delete). Everywhere: part of a message can be selected; the composer shrinks back after sending. Checked: 13 screen sizes 280–1920px × 18 screens + 32 forms/sub-screens, 0 overflow; chat 20/20; **desktop 1280/1440/1920 pixel-identical to before** (54/54, frozen clock, old vs new build on the same data) | `6e606da` | ✅ Live (website only) |
| 30 Sep, evening IST | **Back button steps through the CRM** instead of closing it (owner: "on Leads, Back closes the CRM"). Back closes the open popup/sheet/menu, then the goal / client / Clients sub-tab, then the chat conversation, then goes from any module to the Dashboard; on the Dashboard "Press back again to exit", a second Back within 2 s leaves. Same on the laptop browser's Back. No address or screen change. Checked 50/50 (phone + desktop: modules, popups closed by Back and by Cancel, client → goal, chat sheet → conversation → list, More sheet, after a reload, double-Back exit). Later option: real page addresses (refresh keeps your place, shareable links) — builds on this | `4c5b032` | ✅ Live (website only) |
| 30 Sep, evening IST | **Phone sheets drag down to close** (owner: the More sheet opened smoothly but its handle didn't pull it down, and it vanished instead of sliding away). Shared `BottomSheet`: follows the finger, closes past ~30% or on a flick, springs back otherwise; tap outside / More / a module / Back all slide it away. Also chat's press-and-hold and Select text sheets. Checked 18/18 + Back test 50/50 | `75f7d84` | ✅ Live (website only) |
| 1 Oct, IST | **Phone popups open on top** (owner: the Goal Planner / Asset Allocation forms and some Servicing forms opened under the top bar and tab bar — heading covered, Save hidden — while the Task form was perfect). The affected screens' animated containers trapped their popups; every full-screen popup now renders into `<body>`. Phone: the shared form popup is the Task-style centred card, Asset Allocation capped to the visible height, full-screen forms leave room for the iPhone status/home bar. Checked 444/444 popup checks on 6 phone sizes (old build failed them), Back 50/50, sheets 18/18; desktop popups pixel-identical at 1440/1024 | `3b713a0` | ✅ Live (website only) |
| 1 Oct, IST | **Servicing Excel import: Sub Type is Motor-only** (owner: non-Motor Renewal/Claim rows failed with `Sub Type (Vehicle) "NA" is not a valid option`). Like the forms, the import now ignores both Sub Type columns unless Insurance Type is Motor, and requires them for Motor. Dropdown cells also match ignoring spacing ("Health/ Medical" → "Health / Medical"). Checked 25/25 end to end (upload → import → re-download); the previous version failed the same sheet | `7cea19a` | ✅ Live (website only) |
| 1 Oct, IST | **Renewals & Claims: own module** (owner's structural change, part 1 of 2). Renewals and Claims moved out of Servicing into a new sidebar module "Renewals & Claims" (rail label "Renewals"); Servicing keeps COBR / Fixed Deposit / Other Insurance Policies. Records, editors, Excel, stages, permissions and notifications unchanged — only where they show; old notification links open the right module. Checked 22/22 (every record reachable, DB byte-for-byte unchanged) + Back 50, popups 74, sheets 18, import 25; desktop diff vs live: only the rail item + Servicing tab bar | `d495a50` | ✅ Live (website only) |
| 1 Oct, IST | **Servicing → Other Assets** (owner's structural change, part 2 of 2). Assets an applicant owns outside MF/Insurance: + Add Asset (Group Leader → that GL's own applicants with relation → PAN/relation read-only → Financial/Physical → sub-type → ₹ value, created date, attachment, remarks); one entry per applicant per sub-type ("Asset Already Exists" → View Existing / Cancel; server backstop; empty reference-number slot for future multiple holdings); list with quick filters, search, filters, total; view/edit/delete per new matrix row "Other Assets" (view+create everyone, edit the creator / Internal Manager, delete Admin). Feeds Asset Allocation (own lines, totals, PDF, list, dashboard net worth, reports) and goal Map Asset automatically — never written into the stored allocation. Task rows (OTHER_ASSET), kept out of every task list by utils/tasks.js. Checked: app 51/51 (owner's tests 1-11), server 26/26, Back 50, Renewals & Claims 22, popups 156, sheets 18, import 25; desktop 68/72 identical, only Servicing differs | `39e7a1a` server, `fcaa7fb` app | ✅ Live |
| 3 Oct, IST | **Insurance Proposal print tidied** (owner: "so messy"; keep the layout — header, tables, footer). Same design, but Print / Save PDF now prints the standalone page Save Document stores, in its own window, after its fonts load (the app's own Google Fonts link answers HTTP 400, so prints were in fallback Times). Margins on every page (page-1 banner stays flush), sections flow instead of each starting a fresh page, headings stay with their tables, rows never split, print-sized tables, ₹ joined to its amount, table borders drawn on all sides; Proposal Type box wraps instead of running off the banner (screen too). All 7 types: 6 pages → 3; Medical only: 1 page | `8a44e82` | ✅ Live (website only) |
| 3 Oct, IST | **Portfolio Review Report in the shared report layout** (owner: match the Goal / Asset Allocation reports). Print and Save to Profile both produce A4 portrait pages with the same letterhead and "Page X of Y" footer: at a glance (invested, current, gain, SIP, XIRR), asset class mix, category breakdown, scheme holdings + totals (member's SIPs on a member tab), All Members consolidated tables, advisory notes as edited. Figures are the ones the dashboard drew; pages packed from measured heights (repeated table headers, no lone rows). Checked: All Members / member tabs / 36-scheme statement, no page overflows, edited note carried, typed HTML escaped, saved copy prints the same 6 pages | `d90787b` | ✅ Live (website only) |
| 3 Oct, IST | **Goal Mapping assumptions table in target-date order** (owner: the goal completing first on top). Same order as the goal cards and the Goal Report. Checked with goals created out of order (2050 / 2041 / Nov 2038 → shown 2038, 2041, 2050). Desktop main screens 72/72 pixel-identical to live for all three changes | `d24f460` | ✅ Live (website only) — Vercel didn't start a build for this push (no deployment at all, status page clear); the empty commit `583e50f` re-triggered it, live 12:25 UTC |
| 3 Oct, IST | **Insurance Proposal: header and footer on every page** (owner: like the Investment Proposal; footer at the bottom of the page, not straight after the last table or on a page of its own). Printed and saved proposal: Team Fintness header ("Insurance Proposal · client", logo, gradient rule) pinned to the top edge of every page, the disclaimer footer pinned to the bottom edge; repeating empty table header/footer rows keep content clear of them. Saved copy on screen: header above, footer below. Checked all 7 types (4 pages) and Medical only (1 page) | `a24eb98` | ✅ Live (website only) |
| 3 Oct, IST | **Create Prospect warns before a duplicate** (owner: clicking Create Prospect twice by accident made the same prospect twice). Before creating, the form checks for a prospect with the same client + applicant + proposal type + amount — on screen and on the server (new read-only `POST /prospects/duplicates`, which also sees prospects the user can't open, e.g. someone else's Pre-Qualified one; stage hidden then; only clients the user may create for). If found: "Prospect already created — Do you want to create a duplicate prospect?" with the existing one(s); **Yes** creates, **No** creates nothing and closes the form; with several types where only some exist, "Create only the N new". Confirm is locked while checking, so a double click creates once. The prospect list's own Duplicate action isn't asked twice. Checked: API 19/19, app 14/14 (incl. phone 390px) | `df79bf0` server, `7f2c34d` app | ✅ Live |
| 5 Oct, IST | **UI round, owner's list** — (1) **Clients module header:** title first ("Clients Directory" + count, blue icon tile like every module), then the Clients / Goals Summary / Asset Allocation / Timeline Reports tabs with search + Filter + Add Client on the same row (search a bit narrower so it fits from 1280px; controls drop below on tablets/phones); same order on all four tabs so the tab bar doesn't jump; admin-only "Delete all clients" moved to the title row. Shared `PageTitle` in UI.jsx | `5b3537f` | ✅ Live (website only) |
| 5 Oct, IST | (2) **Servicing / Renewals & Claims look like the other modules:** standard blue header with the sidebar icon and module name (tab description below), Clients-style pill tabs, grey/black quick chips — no purple left | `049277b` | ✅ Live (website only) |
| 5 Oct, IST | (3) **Filters behind a Filter button** in every register (Clients' pattern): Other Assets (group leader, applicant, category, sub-type, created date), Renewals / Claims / Fixed Deposit / Other Policies (group leader + applicant new, status, date range with Apply), COBR (group leader + applicant new, stage). Active filters show as removable chips while the panel is closed — Renewals' default "due this month" stays visible. Then (owner) Other Assets' All / Financial / Physical chips and search + Filter on one row. Checked 16/16 incl. phone | `acfb712`, `fbddef5` | ✅ Live (website only) |
| 5 Oct, IST | (4) **Profile photo always round + PAN masked:** photos carry their own round, square shape (top bar, account menu, My Profile — couldn't reproduce the oval in Chrome; this rules out the known Safari causes); photo cropper's circle fits narrow phones (was a fixed 300px); My Profile PAN shows XXXXXX234F with the eye to reveal, like Aadhaar; masked Aadhaar now reads XXXX XXXX 1234 (showed "1234"). Checked 20/20 at 360/390/1440 | `b8feee7` | ✅ Live (website only) |
| 5 Oct, IST | **Leads: "Simulate Web Lead" removed** (owner: of no use) | `14d45b0` | ✅ Live (website only) |
| 5 Oct, IST | (5) **Goal Planner / Asset Allocation demos: "Reset"** instead of "Refresh" (same action, reset icon). Checked 8/8 | `d204ff8` | ✅ Live (website only) |
| 5 Oct, IST | **Renewals & Claims: tabs, search and Filter on one row; Excel inside the Filter panel.** Renewals / Claim tabs lead the row, search + Filter on its right (Servicing keeps its tab row). Download / Upload Excel moved from the toolbar to the foot of the Filter panel (Renewals, Claims, Fixed Deposit, Other Insurance Policies); Other Assets and COBR gained Download Excel there (download only). Downloads still = the records shown. Checked 47/47 at 360/390/1024/1280/1440, files opened and columns verified | `c9af548` | ✅ Live (website only) |
| 6 Oct, IST | **Full backup of production taken** (read-only): `C:\Users\aniln\FintnessBackups\2026-10-06_1556-full-backup\` — database dump (45 MB, 25 tables, 18,278 rows; restored into a fresh PostgreSQL with matching row counts) + all 210 client documents (52 MB, every database reference present). Supabase's own daily backups are *physical* and can't be downloaded from the dashboard — and "Restore" there rolls the live CRM back, it does not download | — | ✅ Done (nothing changed in production) |
| 6 Oct, IST | (1) **Renewals Broker Code is a dropdown:** Fintness Finserv / SLA / Dev / Kishan Sir / Square for new entries; codes typed before stay on their records (and stay selectable there). Excel upload accepts only these (any capitalisation). Renewals table has a **Broker Code** column, and search matches it. Checked 11/11 | `1d989da` | ✅ Live (website only) |
| 6 Oct, IST | (2) **Renewal last stage named by place:** a renewal at *Policy Document Shared* (stored value unchanged — no data touched) reads **Policy Renewed** in the table, phone cards, Status filter/chip and the dashboard's renewal stages, and **WhatsApp Document Shared** in the form (current stage, next-step button, reason prompt, new log lines). Checked 15/15. *Corrected the same day (owner): the form keeps "Policy Document Shared" — see item (5)'s row.* | `d66856b` | ✅ Live (website only) |
| 6 Oct, IST | (3) **Commission Received from the Renewals table:** Yes / No buttons in the Commission cell (clicking the selected one clears it); every click asks for confirmation, Cancel changes nothing; logged in Comments & Logs like the form. Shown only to people whose change the server keeps — Renewals **Edit Details** (Insurance Manager = All in production); others see plain text. Checked 21/21 incl. RM / Service Manager / Insurance Manager logins | `2b45532` | ✅ Live (website only) |
| 6 Oct, IST | (4) **Renewals & Claims: pick the columns; columns + filters remembered.** A **Columns** button beside Filter opens the Clients directory's picker (Always shown: S.No., Client / Applicant, Status; optional columns ticked as before by default; Reset). New optional columns — Renewals: Group Leader, Company Name, Policy Name, Policy Number, Sum Assured, Mode of Payment, Assigned To, Created; Claims: Group Leader, Policy Name, Policy Number, Sum Assured, Target Date, Assigned To, Created. Columns and Filter-panel choices are kept per user in the browser (survive reload and sign-out / sign-in); a due-date range left on "this month" moves on to the new month. Phone cards follow the chosen columns. Servicing tables unchanged. Checked 22/22 | `c7aab46` | ✅ Live (website only) |
| 6 Oct, IST | (5) **Back stage in Edit Mode** — Renewals, Claims, Fixed Deposits, Other Insurance Policies: a **Back to ‹stage›** button (only in Edit Mode, i.e. the assigner or an All scope) takes the record one step back along the path it actually took (its own history — a claim's loops are walked back step by step), after a required reason. Nothing is erased: a *Moved back* history entry and a log line are added. Stepping back over a claim settlement takes that amount off the settled total and clears the settlement date (settling again stamps the new date); leaving an FD outcome clears the investment amount/date or reminder; leaving a policy outcome clears outcome/amount/reason/reminder (a follow-up task already created stays). **COBR:** *Back to Open* beside *Reopen Task* for an In Process COBR, for whoever may edit it and move it back (server rule), reason required. Also: the Renewal **form** keeps **Policy Document Shared** (owner correction; the table still says Policy Renewed — and no live record ever logged the short-lived "WhatsApp Document Shared" name: 0 of 42 renewals, checked read-only). Checked 27/27 + regressions 11/15/21 | `f98de14` | ✅ Live (website only) |
| 6 Oct | **Found, not changed (owner decision #13):** the Renewal *form* lets an assignee without Edit Details click Commission / Up Sell / Cross Sell, but the server only lets them change the stage, so those three quietly snap back on save. Either hide them for such users in the form too, or let the server accept those three fields from whoever may change the stage. *Decided the same day: hide — see the next rows.* | — | ✅ Decided |
| 6 Oct, IST | **Renewals & Claims open on the current month again.** Since `c7aab46`, clearing the due-date range (the *Clear* beside search, the date chip's ×, or *Clear filters*) was saved, so the table never opened on this month again. A cleared range is no longer kept — the next visit opens on this month, also for anyone whose browser had already saved a cleared range. Dates someone picks themselves are still remembered, as are the other filters and columns. Checked 9/9 (Renewals + Claims) | `db412cc` | ✅ Live (website only) |
| 6 Oct, IST | (#13) **Buttons the server would undo are hidden.** Renewal form: Up Sell / Cross Sell (+ amounts) and Commission Received stay settable without Edit Mode, but only for someone with Renewals **Edit Details**; an assignee who may only move the stage now sees them read-only (*None recorded* / *Not marked yet* when blank). Fixed Deposit form: **Attachments** follow the same rule (they were open to anyone who could move the stage and vanished on save). Stage moves unchanged. Checked 15/15 with Admin, Insurance Manager, Service Manager and Operations Manager logins | `4e5a740` | ✅ Live (website only) |
| 6 Oct | **Found, not changed (owner decision #14):** when an assignee without Edit Details does a stage step that records something, the server keeps the new stage but drops what the step recorded. Seen locally with the production matrix: Renewal *Payment Done → Policy Document Upload* — the required policy document lands only in the stage history, not in the record's Attachment list; FD *Invested With Us* — investment amount/date; Claim *Claim Settled* — settlement date (the settled total is still right, it's read from the history); Other Policy outcome — outcome / amount received. Affects Service / Operations / Internal Managers working a record someone else assigned; Insurance Manager (All) and the assigner are not affected. | — | ⏳ Owner decision |
| 7 Oct, IST | **Servicing files named in the client profile + Documents module.** A file uploaded in a Renewal, Claim, FD, Other Policy or Other Asset (incl. a stage step's required document) showed under its raw file name; it now reads `Policy_Renew_Document-<applicant>-<policy name>-<year>` (Claim_Document / FD_Document with the bank / Policy_Document / Asset_Document with the asset sub-type). Year = the record's own (renewal due date, claim opened, FD start, policy issue, asset date), else the upload's; files that would share a name get "(2)", "(3)" in upload order. **Display only** — no file or stored name changes; the record's own form still shows the file's own name. Documents search also matches the original file name; the profile wraps a long name on phones (desktop unchanged). COBR has no upload box, so nothing to name there. Checked locally 22/23 (real renewal stage-step + Attachment uploads, all five types on one client, preview opens the PDF, phone 390 px); the one miss is an existing dev-console warning on the Documents page (a card's Delete button sits inside the card's button — same on live, not from this change). | `8def2d7` | ✅ Live |

**Checked after the last release (read-only, 28 Sep 16:37 UTC):** 241 tasks, 14 task files all present, no
`fileStripped` marker stored anywhere, 159 live client documents (158 with a file, same as before), 122 notes on
85 clients. Nobody had used the CRM since 15:19 UTC (evening in India), so tomorrow morning is the first real use.

## Your tasks (owner)

| # | What | Why | How |
|---|---|---|---|
| 1 | **Ask Preksha to reload the CRM once** (and anyone with a tab open since before 28 Sep 15:19 UTC). | Session renewal only starts in a freshly loaded app. | The update banner offers it, or close and reopen the tab / installed app. If "not authorised" ever appears again, get a screenshot. |
| 2 | **Watch Supabase egress** for the next 2–3 days. | Confirms the fixes: expect ~1–2 GB/day instead of ~32 GB/day. | Supabase → Usage → Egress, daily view. |
| 3 | ✅ **Done 28 Sep:** bucket `client-documents` (private) + Render `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. The key was shared in the chat for testing, so **rotate it** after §3 is finished (Supabase → Project Settings → API) and update Render. (Was: create the Storage bucket + Render keys, which unblocked §3.) | Moves the ~60 MB of client files out of the database. | §3 "Setup": bucket `client-documents` (Public OFF); Render → API → Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never paste the key into chat or git. Tell the developer when done. |
| 4 | ✅ **Decided 28 Sep** (§4-F). | — | (a) Activity logs: **keep everything** — they protect the system's integrity; no log row is ever edited or deleted. (b) Notifications: **yes, carefully** → nightly clean-up of *read* ones older than 60 days (built; unread never touched). |
| 5 | *Optional:* **more database connections** (§4-D). | Only if the app ever feels slow when many people save at once. | Render → API → Environment → `DATABASE_URL`: add `connection_limit=8&pool_timeout=20` (use `&` if the URL already has a `?`). Today the pool is 3 on a 1-CPU server; the database allows 60 and uses ~9. Redeploy afterwards. |
| 6 | *Optional:* clear the **Member since** date on the "Fintness Finserv" admin account. | Otherwise it gets a work-anniversary post on 16 Apr. | My Profile of that account → Member since. |
| 7 | ✅ **Decided 30 Sep: not rotating** the Supabase `service_role` key (#3) — the chat it was shared in stays on the owner's laptop. | If that ever changes, rotate then. | In this order, so documents never stop opening: new key in Supabase → Render `SUPABASE_SERVICE_ROLE_KEY` → wait for the redeploy → open one document in the CRM → only then turn off the old key. |
| 8 | **Ask everyone to reload the CRM once** (30 Sep). | A tab open since before 28 Sep 16:36 IST runs the old app, which can't show documents that moved to Storage until reloaded. Nothing is lost. | Ctrl+Shift+R on a computer; close and reopen the app on a phone. |
| 9 | **Keep the document backups private and for ≥ 2 weeks.** | They hold clients' KYC files: the undo for the copy. | `C:\Users\aniln\FintnessBackups\2026-09-30-storage-copy\` and a second copy in `C:\Users\aniln\AppData\Local\FintnessBackups\2026-09-30-storage-copy\`. An encrypted pen drive copy is a good extra. |
| 10 | **Decide on the 36 queries deleted on 3 Aug** (§8). | They were deleted by a test, not by a person. | Say yes and they're restored the same careful way as the 3 records on 29 Sep. |
| 11 | *Optional:* **decide whether the CRM screens should get their intended fonts** (found 3 Oct). | The font link in `index.html` has been invalid since the first version (Google answers HTTP 400), so every screen shows the computer's own fonts instead of Inter / Outfit. Printed reports and proposals now load their fonts themselves, so they're not affected. | Say yes and the link is corrected — every screen's lettering then changes at once, so it's a look decision, not a bug fix. |
| 12 | *Optional:* **Portfolio Review, single-member tab: Category breakdown** (found 3 Oct). | The tab shows the family-level category split (the statement's sub-category table), both on screen and in the report — unchanged behaviour. | Say if a member's tab should show only that member's categories. |
| 13 | ✅ **Decided 6 Oct: hide** them from people without Edit Details (`4e5a740`). (Was: Renewal form Commission / Up Sell / Cross Sell for an assignee without Edit Details.) | — | — |
| 14 | **Stage steps by an assignee without Edit Details lose what they record** (found 6 Oct). | The stage move is kept, but the step's own details are dropped on save: the Renewal policy document (only in the history, not the Attachment list), FD investment amount/date, Claim settlement date, Other Policy outcome / amount. These steps are the assignee's job, so hiding them isn't an option. | Say yes and the server keeps exactly the fields that step records, when the person may make that stage move (nothing else opens up). |

---

## 1. Where things stand today

**What was wrong.** Every uploaded document (PDFs, photos, generated proposals and MOMs) is stored inside the
client's record in the database (`clients.clientDetails.attachments`, as base64 text). The 417 clients came to
61.9 MB, and 99% of that was document files. The app downloaded all of it:

- on login,
- after most saves,
- every 12 seconds while anyone had the Dashboard, Clients, Documents or a client profile open.

This made saves slow, and it used **681 GB of Supabase's 250 GB monthly egress**. The billing cycle runs from the 7th to the 7th.

**What `c17870d` changed (live 28 Sep 2026, 11:13 UTC):**

| Change | Result |
|---|---|
| The client list no longer carries files. A file loads only when someone opens it. | 61.9 MB → 908 KB |
| Background refresh asks "changed since?" first. | 58 bytes when nothing changed |
| Note, document and proposal saves update only that client on screen. | A note shows in ~60 ms instead of after a full reload |
| Saving a task sends only that task. | Was the full 9 MB task list |
| A background refresh can no longer undo a save in progress. | Fixed the prospect Qualified → Close Won flicker |
| `https://crm-api.fintness.in/health` now shows the deployed commit (`rev`). | Server deploys can be confirmed from outside |

**Also live since 28 Sep 2026, 12:37 UTC (`eeb4bea` + `4aaa6d4`):**

- **Note saves.** Notes save on their own (`POST/PATCH/DELETE /api/clients/:id/notes`). A note no longer rewrites
  the whole client with its documents: ~700 ms → ~50 ms on a 10 MB client in testing.
- **Save buttons.** Waiting saves go **Save → Saving… → ✓ Saved** and ignore repeat clicks (`utils/useSaveAction.js`,
  `SaveLabel`). This covers notes, document rename/delete/upload, and "Save Document" on proposals, MOM, policy
  review and portfolio review.
- **Work anniversaries**, the same way as birthdays. They come from the profile's **Member since** date
  (`teamMemberSince`).
  - What happens on the day: from 8 AM (server time) a Notice Board post appears and expires at the end of that day,
    and every other teammate gets a notification.
  - The wording lives in `workAnniversaryText` in `server/src/lib/notificationScheduler.js`.
  - The first real one is 10 Nov 2026.
  - The "Fintness Finserv" admin account also has a Member since date, so it gets a post on 16 Apr. Clear that date
    if you don't want it.

**Keep an eye on:**

- Supabase → **Usage → Egress**, daily view. It should drop from about 32 GB/day to about 1–2 GB/day.
- The 681 GB already used stays counted until 7 Oct.
- If Supabase restricts the project before then, turn off the spend cap (about $0.09 per extra GB) or contact their support.

**No upgrade is needed** on Render or Supabase.

---

## 2. Preksha: "Not authenticated" when saving a proposal document  *(✅ done: `c981013`, live 28 Sep 15:19 UTC)*

**What shipped:**

- **Sessions renew while in use.** `POST /api/auth/renew` and `GET /api/auth/me` re-issue the cookie once the token
  is 12 hours old (`renewSessionIfOld` in `server/src/lib/jwt.js`). The app calls renew about hourly and when a tab
  comes back into view. Someone who uses the CRM daily now stays signed in; 7 days of no use still ends the session.
- **Only those two routes renew**, never ordinary data requests. Otherwise a background refresh that finished just
  after "Log out" could set a fresh cookie and quietly sign the user back in.
- **A sign-in box when a session ends** (`SessionExpiredModal.jsx`). Any 401 outside the sign-in calls says "Your
  session has ended. Please sign in again, then try once more." The box sits over the current screen, locked to the
  same account, so a half-filled proposal or note is kept. The 12-second refresh notices within seconds.
- **Other tabs follow.** Log out in one tab and the others show the box at once. Sign back in anywhere and the box
  closes everywhere. If a *different* account signs in, other tabs reload.
- **Sign-in attempt limit fixed.** It counted every `/api/auth/*` call per address, including the page-load session
  check. Behind the proxy many teammates can share one address. Now only password attempts (`POST /login`,
  `/change-password`) count, still 30 per 15 minutes.

**Tested:**

- 17 server checks with 2-minute sessions: renewal timing, an expired token can't be revived, logout, and the limit.
- 16 browser checks as an Insurance Manager with the production permission matrix: a note typed before expiry
  survives, it saves after signing in, the background refresh notices, other tabs follow, Sign out works.

**Conclusions / what to watch:**

- Most users won't see anything new. The box appears only if a session actually ends.
- Anyone with a CRM tab that was open before 15:19 UTC gets renewal only after the tab reloads. The update banner
  prompts a reload.
- **Ask Preksha** to reload once. If "not authorised" ever appears again, it will now be the sign-in box (session)
  or a different, specific message. Get a screenshot of that message.

<details><summary>Original analysis (kept for reference)</summary>


**Symptom.** Preksha Jain (Insurance Manager) can browse, but "Save Document" on a proposal opened from a client's
profile fails with an authorisation-style message.

**Already ruled out (checked 28 Sep, read-only):**

- **Permissions.** Her matrix has Documents → Upload = All and Clients → Edit Personal = All. The server cannot refuse
  this save for permission reasons. Even the built-in fallback defaults allow uploads for every role.
- **The proposal screen.** An Insurance Manager gets the Insurance Proposal tab (`ProposalWorkspace.jsx`).
- **Cloudflare.** Save-shaped requests (1 MB and 279 KB) sent to the live API reached the server, which replied
  401 "Not authenticated" as expected with no login. No Cloudflare block.
- **The save path.** It works for everyone else: Manish saved 10 documents on 28 Sep. Her own proposal saves on
  19 and 21 Sep are stored correctly.

**Most likely cause: the session ends while the app stays open.**

- A login lasts a fixed 7 days (`server/src/config.js` `tokenTtl`, `server/src/lib/jwt.js` cookie `maxAge`). Using the
  CRM does not extend it.
- The app checks the session only when the page first loads (`refreshSession()` in `src/utils/auth.js`).
- If a tab or the installed app stays open past 7 days, or the user logs out in another tab, the browser drops the cookie.
- Background refreshes then fail silently and keep showing old data.
- The first save fails with **"⚠️ Not authenticated"**.

**Confirm first.** Ask Preksha for a screenshot of the exact message. "Not authenticated" or "Session invalid or
expired" confirms this cause.

**Workaround until it's fixed.** Close every CRM tab and the installed app, reopen crm.fintness.in, sign in, then save.

**Fix to build:**

1. **Server: renew the session while in use.**
   - In `server/src/middleware/auth.js` `requireAuth`, when the token is older than about 12 hours, sign a new
     token and set the cookie again. Use the same `cookieOptions()`.
   - Active users then stay signed in. A session still ends after 7 days of no use.
   - Chat uses the same cookie (`server/src/chat/socket.js`), and nothing there needs to change.
2. **Frontend: a clear sign-in prompt.**
   - In `src/services/api.js`, a 401 from any endpoint (except login, change-password and the startup `/auth/me`)
     fires a `crm:session-expired` event.
   - `App.jsx` shows a small **sign-in box on top of the current screen**. It does not switch to the login page, so
     a half-filled proposal is not lost. After signing in, the user clicks Save again.
   - The 12-second background refreshes would trigger the same prompt, so an expired session is noticed within
     seconds, not at the next save.
3. **Test locally.**
   - Set `TOKEN_TTL=2m` and confirm the prompt appears, form state survives, and the save works after signing in.
   - Confirm the cookie is re-issued after the renewal threshold.
   - Confirm logout in another tab triggers the prompt.

</details>

---

## 3. Move document files into Supabase Storage  *(step 1 live 28 Sep; ✅ step 2 done 30 Sep; step 3 next)*

### Status (28 Sep)

**Step 1, shipped: new files go to Storage.** Server-only (`server/src/lib/storage.js`, `lib/clientFiles.js`,
`routes/clients.js`); the app didn't change.

- **Saving.** When a client save (`POST`/`PATCH /api/clients`) carries a file that isn't on record yet — an upload,
  a generated proposal/MOM, a document copied in — the server stores it in the private bucket as real bytes at
  `clients/<clientId>/<documentId>/<dataUrl|html|data>`. The document keeps a small `storage` reference instead of
  the base64. That covers every upload path in the app, because they all save through these two routes.
- **Opening.** `GET /api/clients/:id/files` fetches the file and rebuilds the exact string the app used to store,
  so previews, print and download are unchanged.
- **Hidden from browsers.** Browsers never see the reference (the slim list hides it) and one sent in a request is
  ignored, so nobody can point a document at someone else's file.
- **Existing inline documents** are left exactly as they are until step 2.
- **Deleting a document** removes it from the client, but **the file stays in Storage**, so nothing is ever lost.
- **Safety.** If Storage can't be reached, the file is saved inline as before, so a save never fails because of
  Storage. Without the Render keys the feature is simply off.
- **Tested.** On a separate test bucket: 28 API checks (uploads, generated docs byte-identical including unicode,
  legacy docs untouched, rename, delete, forged references, copies between clients, missing-file error, notes) and
  fallback when Storage is broken or off. In the browser: open, upload, reopen after reload, Save Document and
  rename. Read-only on production: all 857 client records round-trip byte-identical and the slim list is unchanged
  for all 417 live clients.

**Step 2, done 30 Sep 9:06–9:20 AM IST: the 159 existing documents copied.** Script
`server/scripts/copyClientFilesToStorage.js`; full log, safety steps and undo in
[STORAGE_COPY_TONIGHT.md](STORAGE_COPY_TONIGHT.md).

- **How it ran.** Two backups first, checked by SHA-256. Each file was uploaded, downloaded again and compared, then
  swapped in, guarded so a user's edit in between is never overwritten. It was rebuilt through the app's own code,
  then checked again with a read-only `--verify`.
- **Order.** One client first ("Test"). The owner opened its photo and proposal page, and a PDF already in Storage,
  in the live CRM. Then the other 37 clients.
- **Result:**
  - 159 documents and 187 files are in Storage, 188 references in total with the 29 Sep upload. Every reference
    points at an object that exists; no objects are unreferenced.
  - 0 documents are left inline; 1 reference never had a file.
  - Client data in the database went from 64 MB to 999 kB, with the largest client record at 3.7 KB. The table's
    disk space is reused by Postgres rather than returned at once.
- **Found along the way** (nothing lost):
  - **3 pairs of documents share one id on the same client** ("PAN Card_Test" / "Nominee PAN Card_Test"; two
    duplicate "Nominee PAN Card" entries on Anand bansal). Their files are identical, so each pair points at one
    object.
  - **Deleting one entry of a pair removes both from the list** (ClientProfile/DocumentsView filter by id). The files
    stay in Storage and the backup. This predates the copy and is worth a small fix: give every document its own id.
  - **"Cancelled Cheque_Madhu Gupta" asks for a password** because the PDF has its own password, as bank PDFs often
    do. Its stored bytes match the upload exactly.

**Step 3, later:** task attachments, chat images, query attachments, and optionally signed links so files download
straight from Storage.

### Original plan

### What Supabase Storage is

File storage built into the Supabase project, like a Google Drive for the app. The Pro plan includes **100 GB**;
we use 0 GB today. Files live in **buckets** (top-level folders). A **private** bucket's files can only be opened
through a temporary **signed link**, which our server creates after checking the CRM's normal permissions.

### How to use it in the dashboard

- **Storage** (left menu) → **New bucket** → name `client-documents` → leave **Public bucket OFF** → Create.
- Click a bucket to browse folders and files. You can upload, download, rename and delete by hand. The API path
  (`clients/<clientId>/<documentId>`) will show up as folders.
- **Project Settings → API** holds the project URL and the **`service_role`** key.
  - The `service_role` key bypasses all security rules. It goes **only** into Render's environment settings.
    Never put it in the website, git, or a chat.
- Check **Storage → Settings** for the upload size limit. We currently cap uploads at 5 MB in the app, and can raise that.
- Egress: downloading a file counts toward the same egress quota, but only when someone actually opens a document.

### Setup (the account owner does this)

1. Create the private bucket `client-documents` as above.
2. In Render → the API service → **Environment**, add two variables:
   - `SUPABASE_URL` (Project Settings → API → Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → `service_role`)

### Build plan (developer)

- **Library.** Add `@supabase/supabase-js` to `server/` only:
  ```js
  import { createClient } from '@supabase/supabase-js';
  const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }).storage.from('client-documents');
  await storage.upload(path, buffer, { contentType, upsert: false });   // store
  const { data } = await storage.createSignedUrl(path, 60);             // 60-second link
  await storage.remove([path]);                                         // delete
  ```
- **Document shape.** Keep today's metadata (`id, name, fileName, fileType, category, applicantName, docNumber,
  date, uploadedBy, source`). Add `storagePath` and `size`. Stop storing `dataUrl` / `html` inline.
- **Upload.** New `POST /api/clients/:id/documents`, with the same permission rule as today (Documents → Upload). The
  server stores the file at `clients/<clientId>/<documentId>` and appends the metadata.
  - Optional later: the server hands the browser a signed *upload* URL so large files skip the API.
- **Open.** `GET /api/clients/:id/files` returns signed URLs instead of base64. On the frontend, only
  `src/services/clientFiles.js` changes much, because the app already loads files on demand since `c17870d`.
  - HTML documents (proposals/MOMs) are fetched as text for preview and print.
- **Generated documents.** `saveGeneratedDocument` in `src/utils/documents.js` uploads the HTML to Storage.
- **Delete.** Removing a document also removes the file. Consider a 30-day "trash" folder instead of an immediate delete.
- **During rollout, support both kinds of document** (inline `dataUrl` and `storagePath`). Old documents and old
  browser tabs then keep working until the copy below finishes.
- **One-time copy of existing documents** (about 160 documents, about 60 MB). Must be resumable and safe to re-run:
  1. **Full backup first**: a Supabase backup and a JSON export of the `clients` table kept off-site.
  2. **Dry run**: list every document and its size, and change nothing.
  3. For each document: upload its bytes → download them again and compare checksums → only then update that
     client, setting `storagePath` and removing the inline copy. Guard the update with `updatedAt` so a user edit
     in between isn't overwritten.
  4. Run off-hours. Keep the backup until everything has been checked in the app.
  5. Reversible: a reverse script can re-inline files from Storage if ever needed.
- **Same treatment later** for:
  - task attachments (`tasks.payload.attachments` and `stageHistory[].attachments`, about 7.5 MB)
  - chat images (`chat_messages`, 7.6 MB)
  - query attachments (`query_attachments`, 2.1 MB)

**Also fixes** the last stale-copy risk from §4-H. Document rename, delete and upload still send the screen's whole
document list. Per-document routes (upload one, delete one) mean an admin can never remove a colleague's upload that
hasn't reached their screen yet.

**Result.** The database shrinks from about 122 MB to about 50 MB. Documents open faster, uploads over 5 MB become
possible, and backups get smaller.

---

## 4. Other speed and cost improvements

| # | Improvement | Why | Effort |
|---|---|---|---|
| A | ✅ **Done 28 Sep (`4537cf0` server, then the app).** The files sit in the Renewal / Claim / FD / Other-Policy registers (Task rows): `payload.attachments[]` 5.1 MB and `payload.stageHistory[].attachments[]` 4.3 MB (copies of the same files, never shown on screen). `?slim=1` lists drop them (`server/src/lib/taskFiles.js`); `GET /api/tasks/:id/files` serves one when clicked (register chips, and the client's Documents tab via `cobrWorkspaceDocuments` → `taskId`); saves put them back (`restoreTaskFiles`). Checks: 27 server + 4 access checks locally, all 241 production tasks round-trip byte-identical (read-only), 13 browser checks each as Admin and Insurance Manager, click-through of every section as 4 roles. **Found while testing, for §4-F:** when a register's attachments change, the activity log stores the *full files* in `oldValue`/`newValue`. | — | — |
| A (original) | **Task attachments on demand.** Same approach as clients in `c17870d` (slim list + restore on save), or Storage (§3). | The task list is 9 MB (attachments 3.75 MB + stage-history attachments 3.82 MB). Any task change makes every open Tasks/Dashboard/Profile screen download it once. | Small–medium |
| B | ✅ **Done 28 Sep.** "Changed since?" for the permission matrix. `GET /api/permissions?since=<version>` answers `{unchanged:true}` (58 bytes, no table read) until an admin saves the matrix or the server restarts (`permissionsVersion()`). The editor screen still always loads the full matrix. 16/16 tests. | Every open tab downloaded the full matrix (23 KB + a 567-row table read) every 30 s. | Small |
| C | ⏸ **Checked 28 Sep, deferred.** At startup the browser loads only `index-*.js`: 3.3 MB, ~930 KB gzipped. The 8.5 MB `lib-*.js` chunk is already loaded on demand, and its file name (content hash) stayed the same across every build on 28 Sep, so app updates don't re-download it. Splitting the main file further (`React.lazy` for Chat, Reports, Others, Portfolio Review, proposals, admin screens) touches every screen for a moderate gain on phones. Do it in a quiet week with a full click-through. | Startup speed on phones. Not a database or egress issue. | Medium |
| D | **More database connections** — owner's setting, see "Your tasks" #5. Production (28 Sep): Postgres `max_connections` 60, ~9 in use of all kinds; the API connects through Supavisor. Only worth doing if saves feel slow when many people work at once. | On a 1-CPU server Prisma opens only 3 connections by default, so one slow request makes others wait. | Small (settings) |
| E | **Fewer database round trips on hot paths.** For example, a client save does read + update + include + logs one after another. | The API likely runs in Singapore (Render has no India region) and the DB is in Mumbai: about 50–60 ms per query, 5–8 queries per save. Longer term, host the API in Mumbai. | Medium |
| F | ✅ **Done 28 Sep.** Production survey (read-only): `activity_logs` 6,090 rows / 11.4 MB, 9 of them holding 8.8 MB (register attachment changes logged with their files). **Activity logs are kept complete and are never edited or deleted.** The owner's rule: they protect the system's integrity, and they keep a copy of anything later removed from a record. Only the log *screens* hide files: `listActivity` swaps file contents for a label such as `[file · 400 KB]` on the way out (`withoutFileData` in `server/src/lib/activityLog.js`), so the Activity Log screen never downloads files. **Notifications:** a nightly clean-up (`runNotificationCleanup` in `server/src/lib/notificationScheduler.js`) deletes *read* notifications older than 60 days in the 21:00 UTC hour (02:30 IST). Unread ones are never touched. Scheduled reminders can't re-fire, because their keys carry the date or only match a meeting in the next 10 minutes. Set `NOTIFICATION_RETENTION_DAYS` on Render to change the age; `0` turns it off. Dry run on 28 Sep: 6,507 notifications, 297 read and >60 days. Before the first run, a backup of all 352 read notifications older than 59 days was saved outside the repo (`backup_notifications_read_over59d_2026-09-28.json`, 128 KB, in the session scratchpad). Tests: 12 local checks (ages, read/unread, 21:00 window, once a night, switch-off; logs stored complete, shown with labels). Not needed yet: an index on `activity_logs.timestamp` (6k rows sort instantly). | — | — |
| F (original) | **Housekeeping.** Retention or cleanup for `activity_logs` and `notifications` (about 6,000 rows each and growing), paging in their screens, and an index check. | Keeps queries and backups fast as data grows. | Small–medium |
| G | **Checked 28 Sep, low priority now.** The 76,544 `advisor_profiles` reads come from `GET /api/team` and `GET /api/chat/users`. Each reads every profile's whole `data`, profile photos included (the table is 0.36 MB). Since `c17870d` these run only at sign-in, when adding or deleting a client, and when the chat screen opens, not after every save. That's now a few MB a day. If it's ever worth it: give `/team` the same "changed since?" version as the lists, or serve photos separately with caching. | Less repeated work. | Small |
| H | ✅ **Done 28 Sep (`46fcf65` server, then the app).** The server keeps the stored notes when a client save leaves `notes` out, and `updateClient()` (`services/db.js`) no longer sends them, so only the notes routes change notes. The Edit Client form also stops sending documents, so an upload made while it's open is kept (for admins it used to count as a delete). Read-only prod check: the form sends back every other field real clients use. Tests: 11 server checks, plus 13 browser checks each as Admin and as Insurance Manager, with a colleague adding a note and a document while the form or a rename is open. The notes/save-button regression tests pass (15/15). **Still open:** document rename/delete/upload send the screen's whole document list; if an *admin* does that while a colleague's brand-new upload hasn't reached their screen yet (up to 12 s), it is treated as a delete. The per-document routes in §3 remove this. | — | — |
| H (original) | **The Edit Client form can undo a note added meanwhile.** The form (`ClientFormModal` in `Modals.jsx`) sends back the notes it loaded when it opened, and `PATCH /clients/:id` saves the whole `clientDetails`. So a note a colleague adds while the form is open is lost when the form is saved. Fix: leave notes out of that save and let only the notes routes (added 28 Sep 2026) change them. | Prevents silently lost notes. | Small |

---

## 5. Suggested order

1. ✅ **§2 Preksha's session fix.** Small, and it unblocks a user.
2. ✅ **§4-B permission refresh and §4-A task attachments** (+ ✅ §4-H notes). Small, with a big effect on egress.
3. ✅ **§3 Supabase Storage, steps 1–2**: every client document is in Storage (30 Sep). Next: rotate the key ("Your
   tasks" #7), then step 3 (task/Servicing attachments, chat images, query attachments), done the same way.
4. ✅ **§4-F** (logs kept complete, screens file-free; nightly clean-up of old read notifications) · §4-D is your setting, optional · ⏸ §4-C checked and deferred (see §4).
5. **§4-E** only if saves still feel slow after the above. Judge after a few days on the new code.

**Conclusions from 28 Sep:**

- **Data moved per screen.** Every list the app polls now answers "unchanged" (tens of bytes) unless something changed:
  clients, tasks, prospects, leads, meetings, queries and the permission matrix. The two lists that carried files,
  clients and tasks, now send no files at all. What's left to move is the files themselves (§3).
- **Deploy pattern that worked.** When the app and server must agree, ship the server half first (compatible with
  today's app), confirm `/health` shows it, then ship the app half. That was used for §4-H and §4-A.
- **Render redeploys only for `server/` changes.** A website-only push leaves `/health` on the previous commit, which
  is expected. Check the website by its bundle instead.
- **Before touching stored data**, run a read-only round-trip check on production. It found no differences on any
  of the 417 clients or 241 tasks.

---

## 6. How each change should be shipped (same as `c17870d`)

- **Branch cleanly.** Work in a fresh git worktree from `final-crm/main`. The local `crm 2.0` checkout is on an old
  branch with unrelated edits, so never push from it.
- **Test locally.**
  - Docker DB `fintness-pg-dev` on port 5433, with the **production permission matrix** copied in (read-only from prod).
  - Test users in every role.
  - Browser tests of the affected screens.
  - A click-through of every sidebar section as several roles.
- **Check mixed versions.** Test the new app against the old server, and the old app against the new server. Users
  keep old tabs open, and Vercel deploys before Render.
- **Anything that touches stored data** also needs a read-only check against real production data before deploy.
  For `c17870d` that was the 417-client save round-trip: every document byte-identical.
- **Before pushing:**
  - Confirm no migration is pending and nothing writes on startup.
  - Get the owner's OK.
- **After pushing:**
  - Confirm `/health` shows the new `rev` and the live bundle contains the new code.
  - Run read-only checks on production.
- **Credentials.** Database passwords and keys are never written into files or commits.

---

## 7. Useful facts

- **Hosting.**
  - Website on Vercel (crm.fintness.in).
  - API on Render, Standard plan, 1 CPU / 2 GB, probably Singapore (crm-api.fintness.in).
  - Database on Supabase Pro, Micro compute, ap-south-1 Mumbai.
- **Production permission notes (28 Sep 2026).**
  - Documents → Delete is **None for every role except Admin**.
  - Insurance Manager has Clients → Edit Personal = All, Documents → Upload = All, Investment Proposal = None.
- **Duplicate client names are normal.** Some clients exist twice because of the 22 Jul re-import. The soft-deleted
  copies have no documents, which is expected. For example, "Praveen Singh Sikarwar" has a deleted duplicate; the
  live record holds all 3 documents.
- **Servicing permissions (29 Sep).** Insurance Manager has Renewals → view, edit, change stage, log and delete = All.

---

## 8. Incident 29 Sep: "stage reverted, documents gone" and a missing up-sell

**Reported:**

- Preksha moved renewals to *Policy Document Shared* with the policy PDFs on Monday 28 Sep. By Tuesday the stage was
  back and the files were gone.
- An up/cross-sell entry she made in Servicing weeks earlier had also disappeared.

**Found (read-only, activity log + records):**

1. **Nothing was reverted.** The server never received Monday's changes: there are **zero** logged changes by
   anyone on any Servicing record on 28 Sep.
   - Her 7-day sign-in had expired. This is the same cause as the "not authorised" message she reported that day.
   - The Servicing screen shows a change straight away and saves in the background. The save was refused, and on
     Servicing screens a failed save showed **no message** (the warning only existed on the Tasks screen).
   - When she signed in again at 5:00 PM IST, the app loaded the real saved state.
   - On 29 Sep at 3:27–3:28 PM she redid Anil Kumar Sharma and Nimmi Chhabra (HDFC Click 2 Protect Plus). Both
     saved correctly.
   - Session expiry itself was fixed on 28 Sep (`c981013`): sessions renew while in use, and a sign-in box appears if
     one ends. Other failures (e.g. a dropped connection) were still silent on Servicing; see "Prevention" below.
2. **The up-sell was deleted, along with two other real records.** On **25 Aug, 4:46–4:47 PM IST**, the **admin
   account (mail@fintness.in)** deleted about 12 records in a test-data clean-up. Three of them were real records
   Preksha had created, and none was re-entered afterwards:
   - *Renewal – Manish Trigunayak – TATA Medicare Plus*: Policy Document Shared, **Up Sell ₹2,000**, premium ₹18,099,
     one photo.
   - *Claim – Manisha Sharma – Health / Hospitalisation*: at Escalate to Ombudsman, 7 history entries, one photo.
   - *Policy – Ishwar Dutt Pathak – ICICI Health Shield 360*: Active, the policy PDF.

   Deletes are soft (the record is hidden, not erased), so all three were intact.

**Fixed on 29 Sep (owner-approved data change):**

- The three records were **restored**. `deletedAt` was cleared only where it still matched the recorded deletion
  time, and a `RESTORE` entry was added to each record's activity log.
- Data and files were verified byte-identical to a backup taken just before (`backup_restore_3_records_before.json`,
  session scratchpad).
- The restored Claim is open and overdue (due 21 Aug), so Preksha gets the normal due reminders for it.

3. **36 real Queries were deleted in one save on 3 Aug, 5:45 PM IST**, from the admin account. They were the team's
   feedback and requests (Nitesh, Vimla, Manish, Mehul, Vaishali), some still Open.
   - At that minute an automated test ran against the live CRM with the admin login. Its "ZZTEST" client, goal,
     query and task were created and removed within a minute.
   - It saved a Queries list containing only its own query, and the server treated every query missing from that
     list as deleted. Leads, Meetings and Queries still saved whole lists that way, so a stale or partial list could
     delete records.
   - All 36 are intact (soft-deleted). They were **not restored yet: waiting for the owner's OK.**
4. **15 older tasks deleted from the admin account (Jul–Sep) had been created by someone else.** For example: Nitesh's
   "Vijaya Rani Agrawal – Capital Report is not correct" and "Krishna Ahuja – HUF investments status", Vaishali's
   "Harendra Deeg – Initial Call" and "Rachana Sahu – Initial Call", and Manish's "Rachana Sahu – IIN, Mandate and
   FATCA Creation". Some are probably intentional (duplicates, tests), so the owner should review them in *Recently
   deleted* once that screen is live.

**How the 25 Aug deletions happened.** They were clicked one by one, 2–9 seconds apart, register by register. That
is someone deleting what they took for test records, not a software fault. 94 of the 95 task/Servicing deletions
ever were made from the shared admin account.

**Prevention (planned 29 Sep, see progress log):**

0. **Only named records are ever deleted (server, 29 Sep).** Whole-list saves now say exactly what they delete
   (`deletedIds`); a record merely missing from a list is kept. Older app versions still delete by leaving a record
   out, but at most one per save (one Delete click). If more are missing, nothing is deleted and a warning is
   logged. Tested: 29 API checks, including the exact 3 Aug case.

1. **Notify the owner.** When someone deletes a Servicing record or task that another person created or is
   assigned to, those people get a notification naming who deleted it.
2. **Recently deleted → Restore.** Admins get this in Servicing, so a mistaken delete is undone in one click, with
   no database work.
3. **A clearer delete question.** It names the record, client, stage and number of files, and no longer claims it
   "cannot be undone".
4. **Make failed saves visible everywhere.** Not only on the Tasks screen: the screen goes back to the saved state
   with a clear message.
5. **Use personal admin accounts.** The shared `mail@fintness.in` login makes the log say "Fintness Finserv"
   instead of who actually did it. For test data, use one clearly named test client (e.g. "ZZ Test Client") so
   clean-ups can't catch real records.
