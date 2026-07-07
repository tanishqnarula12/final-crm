# Lead Management Module — Product & Engineering Specification

**Product:** Fintness Finserv CRM (Financial Advisory)
**Module:** Lead Management ("Leads")
**Status:** Specification — pre-development
**Owners:** Product / Architecture
**Last updated:** 2026-06-29

> This is the canonical internal spec for the Lead Management Module. It is detailed enough for FE, BE, QA, UI/UX and DB to implement without ambiguity. It is grounded in the existing CRM (React 19 + Vite, Tailwind, Supabase-with-localStorage-fallback) and aligns with the agreed delivery model:
> - **Phase 1 (now):** full module functionality on the existing local store, with **all reads/writes behind a single `services/leads.js` seam** and a single `intakeLead()` entry point.
> - **Phase 2 (later):** swap that seam to a secure server backend (Next.js API routes + Postgres/Prisma or hardened Supabase RLS). The UI does not change.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| **Lead** | Any prospective customer who has entered the CRM but is not yet a Client. The mandatory entry point. |
| **Client** | A converted Lead (a "Group Leader" in the existing data model). Cannot exist without an originating Lead. |
| **RM** | Relationship Manager (owns the lead end-to-end). |
| **MOM** | Minutes of Meeting (generated in the existing MOM Workspace, 9-step builder). |
| **Owner** | The single user currently responsible for a lead (exactly one active owner at all times). |
| **Seam** | `services/leads.js` — the only module the rest of the app calls for lead data. Backend swaps here only. |
| **`intakeLead(payload, source)`** | The single function every inbound lead flows through (manual entry, website form, import). |
| **SLA** | Service Level Agreement — time targets for first response / follow-up. |

---

## 1. Product Overview

### 1.1 Purpose
Provide the single, governed front door through which every prospective customer enters Fintness Finserv CRM, and the workspace where leads are captured, qualified, nurtured through meetings and MOMs, and converted into Clients — with complete, immutable activity history.

### 1.2 Goals
- Guarantee the invariant: **no Client exists without an originating Lead**.
- Capture leads from all sources (Website, Social Media, Referral, Seminar, Webinar, Manual Entry) into one normalized pipeline.
- Auto-assign, auto-task, and auto-remind so no lead goes cold.
- Give management full pipeline visibility, conversion analytics, and per-RM accountability.
- Maintain an audit-grade timeline of every action for compliance (financial advisory / SEBI-style record-keeping expectations).

### 1.3 Business Value
- **Revenue:** higher lead→client conversion via enforced follow-up SLAs and structured nurturing.
- **Accountability:** every lead has one owner; every action is logged; no "lost in inbox".
- **Compliance:** complete, tamper-evident history of advisory interactions and consent.
- **Efficiency:** automation removes manual task creation, reminders, and client-record entry.

### 1.4 Module Responsibilities
1. Lead capture (multi-source) + duplicate detection.
2. Lead qualification, ownership, and lifecycle management.
3. Follow-up scheduling engine with escalation.
4. Meeting orchestration (delegates to Meetings module).
5. MOM lifecycle (delegates to MOM Workspace).
6. Conversion to Client (creates Client/Group Leader record).
7. Activity timeline + audit logging.
8. Notifications + reminders.
9. Lead analytics for the Dashboard and Reports.

### 1.5 Dependencies (existing modules)
| Module | Relationship |
|---|---|
| **Dashboard** (`DashboardView.jsx`) | Consumes lead KPIs (counts by stage/source, conversion rate). |
| **Meetings** (`MeetingsView.jsx`, `utils/meetings.js`) | Lead "Schedule Meeting" creates a meeting linked to the lead. |
| **Tasks** (`TasksView.jsx`, `utils/tasks.js`) | Automations create tasks (Initial Call, Draft MOM). |
| **MOM** (`MomWorkspace.jsx`) | "Meeting Done → Draft MOM" opens the MOM builder for the lead. |
| **Clients** (`services/db.js`, `ClientProfile.jsx`) | Conversion writes a Client (Group Leader) record. |
| **Documents** (`DocumentsView.jsx`) | Lead documents surface in the Documents module after conversion. |
| **Insurance / Business Prospects** (`BusinessProspects.jsx`) | Post-conversion proposals reference the originating lead. |
| **Reports** (`ReportsView.jsx`) | Source/stage/RM performance reports. |
| **Notifications** (top dock bell) | Reminder + assignment notifications. |
| **Team roster** (`utils/team.js`) | Owner/assignment picklists (`TEAM_MEMBERS`, `FIXED_ROLES`). |

### 1.6 Success Metrics
- Lead→Client conversion rate ≥ baseline + 20% within 2 quarters.
- 100% of leads have an owner within 5 minutes of creation (auto-assign).
- ≥ 95% of leads receive first contact within SLA (configurable, default 2 business days).
- 0 orphan Clients (Clients without `leadId`).

### 1.7 KPIs
- New leads / day / week / month (by source).
- Active leads by stage.
- Average time-in-stage and total cycle time (Created → Converted).
- Conversion rate by source, by RM, by client type.
- Follow-ups due / overdue / completed.
- Dormant & Junk rates.
- SLA breach count.

---

## 2. User Personas

| Persona | Name | Core needs | Primary actions |
|---|---|---|---|
| **Operations Head** | Mehul Khandelwal | Full pipeline visibility, SLA compliance, reassign across team, audit. | View all leads, reassign, export, approve, monitor KPIs. |
| **Team Leader** | Vaishali Choudhary | Distribute leads, watch team SLAs, unblock RMs. | Assign/reassign within team, review timelines, escalate. |
| **Relationship Manager** | Nitesh Luthra | Own & nurture leads, schedule meetings, convert. | Create/edit/qualify, follow-up, schedule meeting, MOM, convert. |
| **Insurance & Estate Planner** | Preksha Jain | See insurance-intent leads, contribute on insurance needs. | View assigned/insurance-tagged leads, add remarks, co-own meetings. |
| **Portfolio Manager** | Manish Sharma | See investment-intent leads, advise on portfolio. | View assigned/investment-tagged leads, add remarks, join meetings. |

> Roles map onto the existing `utils/team.js` roster. Each lead carries an **owner** (RM) plus optional **contributors** (Insurance Planner / Portfolio Manager).

---

## 3. User Stories (52)

### Capture & Intake
1. As an RM, I want to create a lead manually so that walk-in/phone enquiries are captured.
2. As the system, I want to ingest website-form submissions automatically so that no enquiry is missed.
3. As an RM, I want duplicate detection on mobile/email at creation so that I don't create redundant leads.
4. As a Team Leader, I want to bulk-import leads from CSV/Excel so that seminar/webinar lists load quickly.
5. As an RM, I want each lead tagged with its source so that I know where it came from.
6. As an RM, I want a referral lead to capture "referred by" so that I can credit the referrer.
7. As the system, I want to reject malformed inbound payloads so that bad data never enters the pipeline.

### Assignment & Ownership
8. As the system, I want to auto-assign a new lead to an RM so that ownership is immediate.
9. As a Team Leader, I want to reassign a lead so that workload is balanced.
10. As an Operations Head, I want to bulk-reassign all leads of a departed RM so that nothing is orphaned.
11. As an RM, I want to see only my leads by default so that my list is focused.
12. As a Team Leader, I want to add contributors (Insurance/Portfolio) to a lead so that specialists can collaborate.
13. As an RM, I want a notification when a lead is assigned to me so that I act quickly.

### Qualification & Lifecycle
14. As an RM, I want to mark a lead Qualified so that it enters active nurturing.
15. As an RM, I want the system to create an "Initial Call" task on qualification so I don't forget first contact.
16. As an RM, I want to mark a lead Connected after first contact so the stage reflects reality.
17. As an RM, I want to move a lead to Lost with a mandatory reason so that we learn why.
18. As an RM, I want stale leads auto-flagged Dormant so I can re-engage or close them.
19. As an RM, I want to mark spam leads as Junk so that my pipeline stays clean.
20. As an RM, I want to reopen a Lost/Dormant lead so that re-engaged prospects continue.
21. As the system, I want to block invalid stage transitions so the lifecycle integrity holds.

### Follow-up
22. As an RM, I want to schedule a follow-up (Call/WhatsApp/Email/Meeting) so I keep momentum.
23. As an RM, I want recurring follow-ups (every 15 days in month 1) so cadence is automatic.
24. As an RM, I want overdue follow-ups highlighted so I prioritize them.
25. As a Team Leader, I want overdue follow-ups escalated to me so SLAs are protected.
26. As an RM, I want to complete a follow-up with an outcome note so the timeline is accurate.
27. As an RM, I want a "No Response → after 2 days" auto follow-up so dead air is handled.

### Meetings
28. As an RM, I want to schedule a meeting from a lead so the lead and meeting are linked.
29. As an RM, I want a calendar event + reminder created automatically so I and the client are reminded.
30. As an RM, I want to reschedule a meeting (same record) so history is preserved.
31. As an RM, I want to record meeting attendance/outcome so the next step is clear.
32. As an RM, I want "Meeting Done" to auto-create a "Draft MOM" task so MOM is never skipped.
33. As an RM, I want a missed meeting to trigger a follow-up so we recover the client.

### MOM
34. As an RM, I want to draft a MOM from the lead so discussion is documented.
35. As a Team Leader, I want to review/approve a MOM before send so quality is controlled.
36. As an RM, I want to send the MOM to the client so they have a record.
37. As the system, I want "MOM Sent" to enable "Convert to Client" so conversion is gated correctly.
38. As an RM, I want MOM versions retained so edits are traceable.

### Conversion
39. As an RM, I want to convert a lead to a Client once MOM is sent so the relationship formalizes.
40. As the system, I want conversion to map lead fields to the client record so data isn't re-entered.
41. As the system, I want conversion blocked if mandatory client fields are missing so records stay valid.
42. As the system, I want a conversion failure rolled back so we never half-create a client.
43. As an RM, I want the converted client linked back to its lead so lineage is auditable.

### Timeline, Notes, Documents
44. As an RM, I want every action auto-logged to the timeline so I can see full history.
45. As an RM, I want to add freeform remarks so context is captured.
46. As an RM, I want to attach documents (KYC, ID) to a lead so they carry into the client.
47. As a compliance reviewer, I want an immutable audit log so actions are tamper-evident.

### Search, Views, Reporting
48. As an RM, I want to search leads by name/mobile/email/PAN so I find them fast.
49. As an RM, I want to filter by stage/source/owner/date so I segment my work.
50. As a Team Leader, I want saved views so recurring segments are one click.
51. As an Operations Head, I want conversion & SLA dashboards so I manage performance.
52. As an Operations Head, I want to export filtered leads so I can report externally.

---

## 4. Functional Requirements

| # | Capability | Requirement |
|---|---|---|
| FR-01 | **Lead Creation** | Create via manual form, website intake, or import. All paths funnel through `intakeLead()`. Auto-assign owner, set stage = `New`, stamp source + createdAt + createdBy. |
| FR-02 | **Lead Editing** | Edit any non-system field; system fields (id, createdAt, audit) immutable. Edits logged with before/after. |
| FR-03 | **Lead Assignment** | Set/changes `ownerId`; exactly one active owner. Optional contributors list. |
| FR-04 | **Lead Reassignment** | Single + bulk reassign (Team Leader / Ops Head). Generates timeline + notification to new owner. |
| FR-05 | **Lead Search** | Full-text across name, mobile, email, PAN, company. Debounced, case-insensitive, "starts-with" ranked. |
| FR-06 | **Lead Filters** | Stage, status, source, owner, client type, date range, tags, SLA state (due/overdue), score band. |
| FR-07 | **Lead Sorting** | By createdAt, updatedAt, next follow-up, stage, score, owner. Asc/desc. |
| FR-08 | **Lead Merge** | Merge duplicate leads → one survivor; timelines, notes, docs, meetings re-parented; losers archived with pointer. |
| FR-09 | **Duplicate Detection** | On create/import, match on normalized mobile (E.164) and email; warn + offer merge/link. |
| FR-10 | **Lead Import** | CSV/XLSX upload → field mapping → validation preview → commit. Per-row error report. |
| FR-11 | **Lead Export** | Export current filtered view to CSV/XLSX (respects column visibility + permissions). |
| FR-12 | **Lead Archive** | Soft-archive (hidden from default lists, retained for audit). |
| FR-13 | **Lead Restore** | Restore archived lead to prior stage. |
| FR-14 | **Lead Delete** | Hard delete only by Ops Head, only for Junk, with confirm + audit. Default is archive, not delete. |
| FR-15 | **Lead Conversion** | Gated by stage = `MOM Sent` and mandatory fields; creates Client; sets stage = `Converted`. |
| FR-16 | **Lead Timeline** | Auto + manual events, chronological, filterable by type. |
| FR-17 | **Lead Notes** | Freeform remarks with author + timestamp; editable by author/managers; never deleted (struck-through). |
| FR-18 | **Lead Documents** | Multi-file attach per category; carry into client Documents on conversion. |
| FR-19 | **Lead Activities** | Calls, follow-ups, tasks, meetings tied to lead; surface in timeline. |
| FR-20 | **Lead Tags** | Free + suggested tags (e.g. `insurance-intent`, `sip-intent`, `hot`). |
| FR-21 | **Lead Labels** | System labels (SLA-breach, Reopened, Imported). |
| FR-22 | **Lead Ownership** | One owner; transfer logged; contributors optional. |
| FR-23 | **Status Management** | Lifecycle stages + parallel statuses (Lost/Dormant/Junk). Enforced transitions. |
| FR-24 | **Lead Aging** | Days-in-stage + days-since-last-activity; drives Dormant auto-flag. |
| FR-25 | **Lead Score** | 0–100 computed score (source weight + client type + engagement + recency). Banded Hot/Warm/Cold. |
| FR-26 | **Saved Views** | Persist filter+sort+columns per user; share to team (managers). |
| FR-27 | **Bulk Actions** | Multi-select → reassign / tag / status / export. |

---

## 5. Lead Fields

### 5.1 Field catalogue

| Group | Field | Type | Mandatory | Unique | Default | Validation |
|---|---|---|---|---|---|---|
| Basic | `id` | UUID | system | yes | uuid() | — |
| Basic | `firstName` | string | yes | no | — | 1–60 chars |
| Basic | `lastName` | string | no | no | — | 0–60 chars |
| Basic | `salutation` | enum | no | no | — | Mr/Ms/Mrs/Dr |
| Contact | `mobile` | string | yes | **yes** | — | E.164; Indian default +91; 10-digit core |
| Contact | `altMobile` | string | no | no | — | E.164 |
| Contact | `email` | string | conditional | **yes** | — | RFC 5322; required if source = Website |
| Contact | `whatsappOptIn` | bool | no | no | true | — |
| Contact | `preferredChannel` | enum | no | no | Call | Call/WhatsApp/Email/SMS |
| Contact | `bestTimeToCall` | enum | no | no | — | Morning/Afternoon/Evening |
| Classification | `clientType` | enum | no | no | Retail | Retail/HNI/Ultra HNI |
| Classification | `leadSource` | enum | yes | no | Manual Entry | Website/Social Media/Referral/Seminar/Webinar/Manual Entry |
| Classification | `referredBy` | string | conditional | no | — | required if source = Referral |
| Classification | `interestArea` | multi-enum | no | no | — | Investment/Insurance/Estate/Tax/Retirement |
| Classification | `tags` | string[] | no | no | [] | — |
| Classification | `leadScore` | int | system | no | computed | 0–100 |
| Assignment | `ownerId` | FK→users | yes | no | auto-assign | must be active user |
| Assignment | `contributorIds` | FK[]→users | no | no | [] | — |
| Assignment | `teamId` | FK→teams | system | no | from owner | — |
| Business | `estimatedAUM` | numeric | no | no | — | ≥ 0 |
| Business | `monthlyInvestmentCapacity` | numeric | no | no | — | ≥ 0 |
| Business | `occupation` | string | no | no | — | — |
| Business | `annualIncomeBand` | enum | no | no | — | <5L/5–15L/15–50L/50L–1Cr/1Cr+ |
| Business | `pan` | string | no | **yes (if present)** | — | `[A-Z]{5}[0-9]{4}[A-Z]` |
| Location | `addressLine` | string | no | no | — | — |
| Location | `city` / `state` / `country` | string | no | no | India | from LocationPicker |
| Location | `pincode` | string | no | no | — | 6 digit |
| Status | `stage` | enum | yes | no | New | lifecycle stages |
| Status | `status` | enum | yes | no | Active | Active/Lost/Dormant/Junk |
| Status | `lostReason` | enum | conditional | no | — | required if status = Lost |
| Status | `nextFollowUpAt` | timestamptz | no | no | — | future when set |
| Metadata | `createdAt` | timestamptz | system | — | now() | — |
| Metadata | `createdBy` | FK→users | system | — | — | — |
| Metadata | `updatedAt` | timestamptz | system | — | now() | — |
| Metadata | `convertedAt` | timestamptz | system | — | — | — |
| Metadata | `clientId` | FK→clients | system | no | — | set on conversion |
| Metadata | `archivedAt` | timestamptz | system | — | — | — |

### 5.2 Rules
- **Unique constraints:** normalized `mobile` (global), `email` (global, when present), `pan` (when present).
- **Mandatory minimum to save a draft:** `firstName`, `mobile`, `leadSource`.
- **Mandatory to qualify:** + `email` OR confirmed alt contact, `interestArea`.
- **Mandatory to convert:** + `pan`, `clientType`, full name, address city/state.
- **Default values:** stage `New`, status `Active`, country `India`, score computed.

---

## 6. Lead Lifecycle

Stages (ordered): `New → Qualified → Connected → Meeting Scheduled → Meeting Done → Draft MOM → MOM Sent → Converted`.
Parallel statuses (can apply from most stages): `Lost`, `Dormant`, `Junk`.

For each stage:

### New (Lead Created)
- **Purpose:** capture + assign.
- **Entry:** created via any intake path.
- **Exit:** RM qualifies → `Qualified`, or marks `Junk`/`Lost`.
- **Allowed:** edit, assign, add remark, add tag, qualify, mark junk.
- **Blocked:** schedule meeting, draft MOM, convert.
- **System actions:** auto-assign RM; compute score; dedup check.
- **Automation:** `Lead Created → Auto Assign RM`.
- **Notifications:** "New lead assigned" → owner.
- **Audit:** `LEAD_CREATED`, `LEAD_ASSIGNED`.
- **Validation:** min fields present.
- **KPIs:** new-lead count, time-to-assign.

### Qualified
- **Purpose:** confirm genuine prospect worth pursuing.
- **Entry:** RM action with qualification fields.
- **Exit:** first contact made → `Connected`; or `Lost`/`Dormant`.
- **Allowed:** create follow-up, log call, edit, schedule meeting (allowed early), add contributors.
- **Blocked:** convert.
- **System actions:** create **Initial Call task** (Tasks module).
- **Automation:** `Qualified → Create Initial Call Task`.
- **Notifications:** task assigned to owner.
- **Audit:** `LEAD_QUALIFIED`, `TASK_CREATED`.
- **KPIs:** qualification rate, time New→Qualified.

### Connected
- **Purpose:** record that first meaningful contact happened.
- **Entry:** RM marks connected (after call/whatsapp).
- **Exit:** `Meeting Scheduled`; or `Dormant`/`Lost`.
- **Allowed:** schedule meeting, follow-ups, remarks.
- **System actions:** none beyond logging.
- **KPIs:** connect rate, attempts-to-connect.

### Meeting Scheduled
- **Purpose:** a meeting exists for this lead.
- **Entry:** meeting created (Meetings module) with `leadId`.
- **Exit:** `Meeting Done` (completed) or back to `Connected` (cancelled).
- **Allowed:** reschedule, cancel, reminder.
- **System actions:** calendar event + reminder.
- **Automations:** `Meeting Scheduled → Calendar Event`; `Reminder → Notification`.
- **Audit:** `MEETING_SCHEDULED`.
- **KPIs:** meetings scheduled, show-up rate.

### Meeting Done
- **Purpose:** meeting completed; outcome captured.
- **Entry:** meeting status = Completed.
- **Exit:** `Draft MOM`.
- **Allowed:** create MOM, record outcome.
- **System actions:** create **Draft MOM task**.
- **Automation:** `Meeting Done → Create Draft MOM Task`.
- **Audit:** `MEETING_COMPLETED`, `TASK_CREATED`.
- **KPIs:** meeting completion rate.

### Draft MOM
- **Purpose:** MOM authored in MOM Workspace.
- **Entry:** MOM created/linked to lead.
- **Exit:** `MOM Sent` after review/approve + send.
- **Allowed:** edit MOM, submit for review.
- **Blocked:** convert (MOM not sent).
- **Audit:** `MOM_DRAFTED`, `MOM_VERSIONED`.

### MOM Sent
- **Purpose:** client has the MOM; conversion unlocked.
- **Entry:** MOM sent action.
- **Exit:** `Converted`.
- **Allowed:** **Convert to Client**.
- **Automation:** `MOM Sent → Enable Convert Client`.
- **Audit:** `MOM_SENT`.

### Converted
- **Purpose:** lead became a client.
- **Entry:** successful conversion.
- **Exit:** terminal (lead is read-only; client takes over).
- **System actions:** create Client (Group Leader) record; link `clientId`.
- **Automation:** `Lead Converted → Create Client Record`.
- **Audit:** `LEAD_CONVERTED`, `CLIENT_CREATED`.
- **KPIs:** conversion rate, cycle time.

### Parallel statuses
- **Lost:** mandatory `lostReason`; reopenable. Audit `LEAD_LOST`.
- **Dormant:** auto after inactivity threshold; reopenable. Audit `LEAD_DORMANT`.
- **Junk:** spam/invalid; excluded from KPIs; deletable by Ops Head. Audit `LEAD_JUNK`.

### Transition matrix (allowed →)
| From | Allowed to |
|---|---|
| New | Qualified, Junk, Lost |
| Qualified | Connected, Dormant, Lost |
| Connected | Meeting Scheduled, Dormant, Lost |
| Meeting Scheduled | Meeting Done, Connected (cancel), Lost |
| Meeting Done | Draft MOM, Lost |
| Draft MOM | MOM Sent, Lost |
| MOM Sent | Converted, Lost |
| Lost/Dormant | (reopen) → previous active stage |
| Junk | (Ops Head) → delete |
| Converted | — terminal |

---

## 7. Activity Timeline

Every lead has an append-only timeline. Each event:

| Field | Notes |
|---|---|
| `id` | UUID |
| `leadId` | FK |
| `type` | enum (see below) |
| `actorId` | user who triggered (or `SYSTEM`) |
| `action` | short verb, e.g. "Meeting scheduled" |
| `description` | human sentence with details |
| `meta` | JSON (e.g. {from, to} for stage changes) |
| `source` | `manual` / `system` / `website` / `import` |
| `visibility` | `team` / `private` / `management` |
| `createdAt` | timestamptz, immutable |

**Event types:** `LEAD_CREATED, LEAD_ASSIGNED, OWNER_CHANGED, REMARK_ADDED, TAG_ADDED, CALL_LOGGED, FOLLOWUP_SCHEDULED, FOLLOWUP_COMPLETED, FOLLOWUP_MISSED, MEETING_SCHEDULED, MEETING_RESCHEDULED, MEETING_CANCELLED, MEETING_COMPLETED, MOM_DRAFTED, MOM_VERSIONED, MOM_SENT, DOCUMENT_UPLOADED, TASK_CREATED, TASK_COMPLETED, STATUS_CHANGED, STAGE_CHANGED, LEAD_LOST, LEAD_DORMANT, LEAD_JUNK, LEAD_REOPENED, LEAD_CONVERTED, LEAD_MERGED, LEAD_ARCHIVED, LEAD_RESTORED`.

Rules: timeline events are **never edited or deleted** (audit integrity). UI shows newest-first with type filter chips and a "system vs. human" toggle.

---

## 8. Follow-Up Engine

### 8.1 Follow-up types
Call, WhatsApp, Email, Physical Meeting, Reminder.

### 8.2 Follow-up record
`id, leadId, type, dueAt, assignedTo, priority(Low/Med/High/Urgent), status(Pending/Done/Missed/Cancelled), outcome, recurrenceRule, createdAt, completedAt`.

### 8.3 Cadence rules (from business spec)
- **No Response → after 2 days:** auto-schedule a follow-up call.
- **Month 1:** recurring every 15 days.
- **Month 2:** one follow-up.
- **Beyond:** occasional follow-up (monthly).
- **Unsubscribe:** stop cadence → move to Junk/Dormant per reason.

### 8.4 Priority & escalation
- Priority defaults by score band (Hot=High, Warm=Med, Cold=Low).
- **Missed follow-up:** mark `Missed` + timeline event + notify owner; **2 consecutive misses → escalate to Team Leader**; **3 → Ops Head** + lead flagged SLA-breach.

### 8.5 Scheduling & recurrence
- Manual schedule or rule-driven. Recurrence via RRULE-style string.
- A completed recurring follow-up spawns the next occurrence automatically until cadence ends or stage advances.

### 8.6 Completion flow
Complete → require outcome (Connected / No answer / Reschedule / Not interested) → outcome may auto-advance stage (e.g. "Connected" → stage Connected) or auto-create the next follow-up.

### 8.7 Missed logic
Cron/poll (Phase 2: server cron; Phase 1: on-load + interval sweep) marks past-due `Pending` as `Missed`, logs, notifies, escalates.

---

## 9. Meeting Management (integration with Meetings module)

Reuses existing `MeetingsView` / `utils/meetings.js`. A lead meeting carries `leadId`.

- **Scheduling:** from lead → opens Meeting form pre-filled (lead as the party, RM as host); mode Online/Offline; sets lead stage → `Meeting Scheduled`.
- **Rescheduling:** mutates the same meeting record (existing reschedule flow), requires reason, logs to both meeting history and lead timeline. Never spawns a duplicate.
- **Cancellation:** sets meeting Cancelled, returns lead to `Connected`, triggers recovery follow-up.
- **Attendance/Outcome:** "Mark as Done" → lead stage `Meeting Done`; capture outcome notes.
- **Calendar integration:** Phase 1 in-app calendar (existing). Phase 2 optional Google/Outlook sync.
- **Reminder system:** notifications at T-24h and T-1h (configurable).
- **Meeting history:** all lead meetings listed on the lead detail + timeline.

### Meeting scenarios
| Scenario | System behavior |
|---|---|
| Client confirms | Meeting stays Scheduled; reminder armed. |
| Client reschedules | Same meeting record updated + reason logged; reminder re-armed. |
| Client doesn't respond | Auto follow-up after 2 days; lead may → Dormant if repeated. |
| Client misses | Meeting → Cancelled/No-show; recovery follow-up created; timeline `MEETING_CANCELLED`. |

---

## 10. MOM Workflow (integration with MOM Workspace)

- **Draft:** "Meeting Done" auto-creates Draft MOM task → opens 9-step MOM builder linked to lead.
- **Review:** RM submits; Team Leader reviews (status `In Review`).
- **Upload/Approval:** approver marks `Approved`; rejections return to Draft with comments.
- **Versioning:** each save increments version; prior versions retained read-only.
- **Send:** "Send MOM" → emails/links to client; sets lead stage `MOM Sent`; **enables Convert**.
- **History & storage:** all versions stored; surfaced in Documents module post-conversion.
- **Permissions:** RM draft/send; Team Leader/Ops Head approve; others read.

---

## 11. Client Conversion

### 11.1 Preconditions / validation
- Stage must be `MOM Sent`.
- Mandatory client fields present: full name, mobile, PAN, clientType, city/state.
- No existing **active** Client with same PAN/mobile (else prompt link/merge).

### 11.2 Business rules
- Conversion is **one-way** and **single** (a lead converts once).
- Converted lead becomes read-only; further activity happens on the Client.

### 11.3 Data mapping (Lead → Client / Group Leader)
| Lead field | Client field |
|---|---|
| firstName + lastName | `name` |
| mobile | `clientDetails.mobile` |
| email | `clientDetails.email` |
| pan | `pan` |
| clientType | `clientDetails.clientType` |
| address/city/state/country/pincode | `clientDetails.address*` |
| ownerId | `clientDetails.relationshipManager` |
| interestArea | seeds holdings flags / tags |
| documents | client Documents/Attachments |
| (link) | `clientDetails.leadId = lead.id` and `lead.clientId = client.id` |

### 11.4 Default status
New Client created with `status = Active`, empty goals/allocation, ready for onboarding.

### 11.5 Rollback strategy
Conversion is transactional: if Client creation fails after partial writes, **roll back** (no client row, lead stays `MOM Sent`), log `CONVERSION_FAILED`, surface error toast. Phase 2: DB transaction; Phase 1: guard + revert in `services/leads.js`.

### 11.6 Error handling
- Validation errors → inline, conversion blocked.
- Duplicate client → offer "Link to existing" instead of create.
- Backend error → retry-safe (idempotency key = leadId).

---

## 12. Notification System

### 12.1 Channels
In-App (dock bell), Email, WhatsApp, SMS. Phase 1: In-App (+ event seam for others); Phase 2: real providers.

### 12.2 Triggers → recipients
| Trigger | Recipients | Priority | Channel |
|---|---|---|---|
| Lead assigned | new owner | High | In-App + Email |
| New website lead | owner + Team Leader | High | In-App + WhatsApp |
| Follow-up due (T-0) | owner | Med | In-App |
| Follow-up overdue | owner → TL (escalation) | High | In-App + Email |
| Meeting reminder T-24h/T-1h | owner + (client) | High | In-App + WhatsApp/SMS |
| Meeting rescheduled/cancelled | owner | Med | In-App |
| MOM approved/sent | owner + TL | Med | In-App + Email |
| Lead converted | owner + Ops Head | Low | In-App |
| SLA breach | TL + Ops Head | Urgent | In-App + Email |

### 12.3 Templates
Parameterized templates per trigger/channel (e.g. `meeting_reminder_whatsapp`), with merge fields `{leadName}`, `{rmName}`, `{datetime}`, `{joinLink}`.

### 12.4 Retries
Failed external sends retry with backoff (3 attempts); after final failure log + in-app fallback.

---

## 13. Dashboard Requirements

### 13.1 Widgets / KPIs
- New Leads (today / week / month) with source split.
- Active leads by stage (funnel).
- Conversion rate (overall, by source, by RM).
- Avg cycle time + time-in-stage.
- Follow-ups: due / overdue / completed.
- Dormant & Junk counts.
- SLA breaches.

### 13.2 Charts
- Pipeline funnel (stage counts).
- Source breakdown (stacked bar/donut).
- Conversion trend (line, monthly).
- RM leaderboard (bar).

### 13.3 Tables / Quick actions
- "My overdue follow-ups", "Unassigned leads", "Hot leads".
- Quick actions: + New Lead, Import, Reassign, Export.

### 13.4 Filters / saved views / role-based
- Global filters: date range, team, RM, source.
- Saved views per user.
- **Role-based:** RM sees own; TL sees team; Ops Head sees all.

---

## 14. Database Design (Phase 2 target — Postgres)

> Phase 1 uses `localStorage` key `crm:leads` with the same shape; Phase 2 introduces these tables. DDL is the source of truth for the schema.

```sql
-- USERS (existing team roster formalized)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL CHECK (role IN
                  ('OPERATIONS_HEAD','TEAM_LEADER','RELATIONSHIP_MANAGER',
                   'INSURANCE_PLANNER','PORTFOLIO_MANAGER')),
  team_id       UUID REFERENCES teams(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  leader_id     UUID REFERENCES users(id)
);

-- LEADS
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  salutation    TEXT,
  mobile        TEXT NOT NULL,
  alt_mobile    TEXT,
  email         TEXT,
  whatsapp_optin BOOLEAN DEFAULT true,
  preferred_channel TEXT DEFAULT 'Call',
  best_time     TEXT,
  client_type   TEXT DEFAULT 'Retail' CHECK (client_type IN ('Retail','HNI','Ultra HNI')),
  lead_source   TEXT NOT NULL CHECK (lead_source IN
                  ('Website','Social Media','Referral','Seminar','Webinar','Manual Entry')),
  referred_by   TEXT,
  interest_area TEXT[],
  tags          TEXT[] DEFAULT '{}',
  lead_score    INT DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  owner_id      UUID NOT NULL REFERENCES users(id),
  contributor_ids UUID[] DEFAULT '{}',
  team_id       UUID REFERENCES teams(id),
  estimated_aum NUMERIC,
  monthly_capacity NUMERIC,
  occupation    TEXT,
  income_band   TEXT,
  pan           TEXT,
  address_line  TEXT,
  city          TEXT,
  state         TEXT,
  country       TEXT DEFAULT 'India',
  pincode       TEXT,
  stage         TEXT NOT NULL DEFAULT 'New' CHECK (stage IN
                  ('New','Qualified','Connected','Meeting Scheduled','Meeting Done',
                   'Draft MOM','MOM Sent','Converted')),
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN
                  ('Active','Lost','Dormant','Junk')),
  lost_reason   TEXT,
  next_followup_at TIMESTAMPTZ,
  client_id     UUID REFERENCES clients(id),
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at  TIMESTAMPTZ,
  archived_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_leads_mobile ON leads (mobile) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX uq_leads_email  ON leads (lower(email)) WHERE email IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX uq_leads_pan    ON leads (pan) WHERE pan IS NOT NULL;
CREATE INDEX idx_leads_owner  ON leads (owner_id);
CREATE INDEX idx_leads_stage  ON leads (stage);
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_leads_source ON leads (lead_source);
CREATE INDEX idx_leads_followup ON leads (next_followup_at);
CREATE INDEX idx_leads_created ON leads (created_at DESC);

-- TIMELINE / ACTIVITY (append-only)
CREATE TABLE lead_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  actor_id      UUID REFERENCES users(id),     -- NULL = SYSTEM
  action        TEXT NOT NULL,
  description   TEXT,
  meta          JSONB DEFAULT '{}'::jsonb,
  source        TEXT DEFAULT 'system',
  visibility    TEXT DEFAULT 'team',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_lead ON lead_activities (lead_id, created_at DESC);

-- NOTES / REMARKS
CREATE TABLE lead_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES users(id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);

-- FOLLOW-UPS
CREATE TABLE lead_followups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('Call','WhatsApp','Email','Physical Meeting','Reminder')),
  due_at        TIMESTAMPTZ NOT NULL,
  assigned_to   UUID REFERENCES users(id),
  priority      TEXT DEFAULT 'Medium',
  status        TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Done','Missed','Cancelled')),
  outcome       TEXT,
  recurrence    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX idx_followup_due ON lead_followups (due_at) WHERE status = 'Pending';

-- DOCUMENTS
CREATE TABLE lead_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  category      TEXT,
  file_name     TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MEETINGS & TASKS reference leads via lead_id FK (existing modules extended):
ALTER TABLE meetings ADD COLUMN lead_id UUID REFERENCES leads(id);
ALTER TABLE tasks    ADD COLUMN lead_id UUID REFERENCES leads(id);

-- MOM
CREATE TABLE lead_moms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  version       INT NOT NULL DEFAULT 1,
  status        TEXT DEFAULT 'Draft' CHECK (status IN ('Draft','In Review','Approved','Sent')),
  data          JSONB NOT NULL,
  approved_by   UUID REFERENCES users(id),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT (immutable, write-once)
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  entity        TEXT NOT NULL,         -- 'lead','meeting',...
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL,
  actor_id      UUID,
  before        JSONB,
  after         JSONB,
  ip            INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 15. Entity Relationship Diagram (described)

```
users (1) ───────< (∞) leads            owner_id / created_by / contributor_ids
teams (1) ───────< (∞) users            team membership
teams (1) ───────< (∞) leads            team ownership

leads (1) ───────< (∞) lead_activities  timeline
leads (1) ───────< (∞) lead_notes       remarks
leads (1) ───────< (∞) lead_followups   follow-up engine
leads (1) ───────< (∞) lead_documents   attachments
leads (1) ───────< (∞) meetings         (meetings.lead_id)
leads (1) ───────< (∞) tasks            (tasks.lead_id)
leads (1) ───────< (∞) lead_moms        MOM versions
leads (1) ───────  (0..1) clients       conversion (leads.client_id ↔ clients.lead_id)

clients (1) ─────< (∞) business_prospects   post-conversion proposals (existing)
clients (1) ─────< (∞) insurance/holdings    (existing clientDetails)
```

Relationship notes:
- **Lead ↔ Client:** 1:0..1, bidirectional link, enforced one-time conversion.
- **Lead ↔ Meeting/Task:** 1:∞; a meeting/task may belong to a lead OR a client (xor by lifecycle stage).
- **Lead ↔ Activity/Note/Doc/Followup/MOM:** 1:∞, cascade delete only on hard-delete of Junk.
- **User ↔ Lead:** owner is 1:1 active; contributors ∞.

---

## 16. API Design (Phase 2 REST; Phase 1 mirrors signatures in `services/leads.js`)

Auth: Bearer JWT. All list endpoints support `?page=&pageSize=&sort=&order=&q=&stage=&status=&source=&ownerId=&from=&to=`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/leads` | Create lead (manual) |
| POST | `/api/leads/intake` | Public/website intake (rate-limited, captcha/honeypot) |
| GET | `/api/leads` | List (paginated/filtered/sorted/searched) |
| GET | `/api/leads/:id` | Lead detail (+ embedded timeline summary) |
| PATCH | `/api/leads/:id` | Edit fields |
| POST | `/api/leads/:id/assign` | Assign/reassign owner |
| POST | `/api/leads/:id/stage` | Transition stage (validated) |
| POST | `/api/leads/:id/status` | Set Lost/Dormant/Junk/Reopen |
| POST | `/api/leads/:id/notes` | Add remark |
| GET | `/api/leads/:id/timeline` | Activity feed (paginated) |
| POST | `/api/leads/:id/followups` | Schedule follow-up |
| PATCH | `/api/followups/:id` | Complete/miss/cancel |
| POST | `/api/leads/:id/meetings` | Schedule meeting (→ Meetings) |
| POST | `/api/leads/:id/mom` | Create/version MOM |
| POST | `/api/leads/:id/mom/:v/send` | Send MOM |
| POST | `/api/leads/:id/convert` | Convert to client (idempotent) |
| POST | `/api/leads/merge` | Merge duplicates |
| POST | `/api/leads/import` | Bulk import |
| GET | `/api/leads/export` | Export filtered |
| POST | `/api/leads/:id/documents` | Upload document |

### Example — create
`POST /api/leads`
```json
{ "firstName":"Aarav","lastName":"Sharma","mobile":"+919876543210",
  "email":"aarav@x.com","leadSource":"Website","clientType":"HNI",
  "interestArea":["Investment","Insurance"] }
```
`201`
```json
{ "id":"...","stage":"New","status":"Active","ownerId":"...",
  "leadScore":62,"createdAt":"2026-06-29T09:30:00Z" }
```

### Status codes
`200` ok · `201` created · `202` accepted (intake queued) · `400` validation · `401` unauth · `403` forbidden (permission/role) · `404` not found · `409` conflict (duplicate mobile/email/PAN, illegal transition) · `422` business-rule violation (e.g. convert before MOM Sent) · `429` rate-limited (intake) · `500` server.

### Validation / pagination
- Server-side schema validation (zod/Joi) mirrors §5.
- Pagination cursor or offset; default `pageSize=25`, max `100`.
- Search debounced client-side; server uses trigram/`ILIKE` indexes.

---

## 17. UI/UX Specification

**Design language:** matches existing CRM — rounded-2xl/3xl cards, gradient icon chips, `CoolSelect` dropdowns, status badges with ring themes, tabular-nums, airy spacing, dark-mode parity. Replaces the current "Leads — coming soon" placeholder.

- **Lead List:** table with columns Name (avatar), Mobile/Email, Source badge, Owner, Stage badge, Score chip, Next follow-up, Last activity. Manage-columns + saved views + bulk-select. Stage filter chips + status + source + owner filters; search bar; "+ New Lead", Import, Export. Card/table toggle.
- **Lead Details:** two-pane — left: identity card (name, score, stage stepper, owner, quick actions: Call/WhatsApp/Schedule Meeting/Convert), classification, business, contact. Right: tabbed Timeline / Follow-ups / Meetings / MOM / Documents / Notes.
- **Stage stepper:** horizontal progress (New→…→Converted) with allowed next-stage actions; blocked stages greyed with tooltip reason.
- **Lead Timeline:** newest-first feed, type filter chips, system/human toggle, infinite scroll.
- **Create Lead Modal:** sectioned (Basic, Contact, Classification, Business, Location); live duplicate-warning on mobile/email blur; source-conditional fields (referredBy, email-required for Website).
- **Edit Lead:** same modal in edit mode; dirty-tracking; field-level audit.
- **Follow-Up Panel:** list of upcoming/overdue with priority colors; "Schedule follow-up" (type, datetime, recurrence, priority); complete with outcome.
- **Meeting Panel:** embeds Meetings scheduler pre-linked to lead; shows lead's meetings + statuses + Join button.
- **Document Panel:** category upload (KYC, PAN, Aadhar, Other), file chips, preview.
- **Activity Feed:** compact variant for dashboard "recent lead activity".
- **Quick Actions bar:** Call, WhatsApp, Email, Schedule Meeting, Add Note, Convert (enabled only at MOM Sent).
- **Responsive:** ≥1280 two-pane; 768–1280 stacked tabs; mobile single-column with sticky action bar; tables → cards on small screens.
- **Empty/again states:** graceful "No leads yet / No follow-ups due" with primary CTA.
- **Realtime:** new inbound lead animates into the list + toast + sidebar badge (driven by `crm:lead-received` event in Phase 1, websocket/Supabase realtime in Phase 2).

---

## 18. Permissions Matrix

| Action | Ops Head | Team Leader | RM | Insurance Planner | Portfolio Manager |
|---|---|---|---|---|---|
| Create | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read (all) | ✅ | team only | own + contributed | assigned/insurance-tagged | assigned/investment-tagged |
| Update | ✅ | team | own | contributed fields | contributed fields |
| Delete (hard, Junk only) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Archive/Restore | ✅ | ✅ | own | ❌ | ❌ |
| Assign | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reassign | ✅ | team | ❌ | ❌ | ❌ |
| Convert | ✅ | ✅ | own | ❌ | ❌ |
| Export | ✅ | team | own | ❌ | ❌ |
| Import | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve MOM | ✅ | ✅ | ❌ | ❌ | ❌ |
| View dashboards | all | team | own | own scope | own scope |

> Enforced server-side (Phase 2 RLS/policy middleware); mirrored client-side for UX (hide/disable). Client checks are never the security boundary.

---

## 19. Business Rules

1. **No Client without a Lead** — every Client must have `leadId`; Client creation outside conversion is forbidden.
2. **Single active owner** — every Active lead has exactly one `ownerId`.
3. **Conversion gate** — a lead cannot convert unless `stage = MOM Sent` and mandatory client fields are present.
4. **One-time conversion** — a lead converts exactly once; converted leads are read-only.
5. **Unique mobile** — normalized mobile is unique across non-archived leads.
6. **Unique email/PAN** — unique when present.
7. **Lost requires reason** — `status = Lost` requires `lostReason`.
8. **Stage transitions** — only transitions in the matrix (§6) are allowed; others → `409/422`.
9. **Meeting not in past** — a meeting `startAt` must be in the future at creation.
10. **Reschedule, not recreate** — rescheduling edits the same meeting; never spawns a duplicate.
11. **Meeting Done → MOM** — completing a meeting always creates a Draft MOM task.
12. **Every action audited** — every create/update/transition writes `audit_log` + a timeline event.
13. **Auto-assign on create** — no lead remains unassigned beyond creation transaction.
14. **Qualification → Initial Call task** — auto-created and assigned to owner.
15. **Dormancy** — a lead with no activity for N days (default 30) auto-flags Dormant.
16. **Junk excluded from KPIs** — Junk/archived leads never count in conversion/pipeline metrics.
17. **Follow-up escalation** — 2 misses → Team Leader, 3 → Ops Head + SLA-breach label.
18. **Notes immutable-ish** — notes are never hard-deleted; edits keep history.
19. **Timeline immutable** — activity events cannot be edited or deleted.
20. **RM departure** — deactivating a user forces bulk reassignment of their active leads before deactivation completes.
21. **Consent** — Website leads must carry privacy-consent flag; WhatsApp/SMS only if `whatsappOptIn`.
22. **Idempotent intake** — duplicate website submissions within a short window collapse to one lead (dedupe by mobile+source+time bucket).
23. **Score recompute** — lead score recomputes on every qualifying engagement event.

---

## 20. Edge Cases

| Case | Handling |
|---|---|
| Duplicate lead (same mobile) | Block create; show existing; offer Link/Merge. |
| Duplicate email | Warn; allow if mobile differs (flag for review). |
| Duplicate PAN | Block; likely existing client/lead — offer link. |
| Lead merge | Pick survivor; re-parent activities/notes/docs/meetings/MOMs; losers archived with `mergedInto`. |
| Lead reopen | Lost/Dormant → previous active stage; new timeline event; follow-up cadence resumes. |
| Meeting missed | Meeting → Cancelled/No-show; recovery follow-up; lead may → Dormant after repeats. |
| RM left company | Block user deactivation until active leads reassigned (bulk tool); audit owner change. |
| Lead owner changed mid-cadence | Pending follow-ups/tasks reassign to new owner; notify both. |
| Conversion failure | Transactional rollback; lead stays MOM Sent; `CONVERSION_FAILED` logged. |
| Deleted meeting | If a lead meeting is deleted, lead stage recalculated (→ back to Connected) + timeline note. |
| Missing MOM at convert | Convert blocked (stage gate). |
| Inactive lead | No activity → reminder to owner; then Dormant. |
| Dormant lead re-engages (inbound) | Auto-reopen to Connected + notify owner. |
| Website intake spam | Honeypot + rate-limit + score 0 → auto-Junk candidates queued for review. |
| Converted lead receives new website form | Do not create new lead; attach enquiry as activity to the Client (or new lead flagged "existing client"). |
| Import with partial bad rows | Commit valid rows; downloadable error report for failures. |
| Timezone | Store UTC; render IST; meeting reminders computed in IST. |

---

## 21. Non-Functional Requirements

- **Performance:** lead list p95 < 400ms for 50k leads; search < 300ms; detail < 250ms.
- **Security:** server-side authz on every endpoint; RLS in DB; PII encrypted at rest; no secrets in client bundle (**replaces current hardcoded auth in `utils/auth.js`**); HTTPS only; input sanitization; rate-limited public intake.
- **Availability:** 99.9% target; graceful degradation (read-only) on backend outage.
- **Scalability:** stateless API; indexed queries; pagination everywhere; horizontal scale.
- **Logging:** structured request logs + domain events; correlation IDs.
- **Monitoring:** dashboards for intake rate, error rate, SLA breaches; alerts on intake-down / conversion-drop.
- **Auditability:** immutable `audit_log` + append-only timeline; 7-year retention (financial compliance).
- **Compliance:** consent capture; data-subject export/delete (DPDP-aware); access logging.
- **Backup:** daily automated DB backups, PITR; tested restores.
- **Recovery:** RPO ≤ 24h, RTO ≤ 4h; documented runbook.

---

## 22. Acceptance Criteria (per feature)

- **Creation:** Given valid fields, when I submit, then a lead is created with stage `New`, an owner is auto-assigned within the same transaction, and a `LEAD_CREATED` + `LEAD_ASSIGNED` timeline event exist.
- **Duplicate detection:** Given a mobile that already exists, when I submit, then creation is blocked with a `409` and the existing lead is shown with Link/Merge options.
- **Website intake:** Given a valid website submission, when received, then a lead appears in the CRM within 5s with `source = Website` and a "new lead" notification fires; malformed payloads return `400` and create nothing.
- **Assignment:** Given I am a Team Leader, when I reassign a lead, then `ownerId` updates, the new owner is notified, and an `OWNER_CHANGED` event is logged.
- **Qualification:** When a lead is set `Qualified`, then an "Initial Call" task is created and assigned to the owner.
- **Stage guard:** When I attempt an illegal transition, then it is rejected (`422`) and no change is persisted.
- **Follow-up:** Given a follow-up is due and not completed, when the due time passes, then it is marked `Missed`, the owner is notified, and after 2 misses it escalates to the Team Leader.
- **Meeting:** When I schedule a meeting from a lead, then a linked meeting exists, the lead stage = `Meeting Scheduled`, and a reminder is armed; a past datetime is rejected.
- **Meeting done:** When a linked meeting is completed, then the lead stage = `Meeting Done` and a "Draft MOM" task is created.
- **MOM gate:** Convert action is disabled until stage = `MOM Sent`; attempting via API before that returns `422`.
- **Conversion:** Given stage `MOM Sent` and complete mandatory fields, when I convert, then a Client is created, `lead.clientId` and `client.leadId` are linked, the lead becomes read-only, and conversion is idempotent (re-calling returns the same client).
- **Conversion rollback:** Given client creation fails mid-way, then no client row remains and the lead stays `MOM Sent` with `CONVERSION_FAILED` logged.
- **Permissions:** Given I am an RM, when I request another RM's lead, then I receive `403` (server-enforced).
- **Audit:** For every mutating action, an `audit_log` row with before/after and a timeline event are created.
- **Search/filter:** Given 10k leads, a search by mobile returns the match in < 300ms; filters combine (AND) correctly and are reflected in export.
- **Realtime UI:** When a new lead is intaken, the open Leads list prepends it without a manual refresh.

---

## Appendix A — Phase 1 implementation notes (current stack)

- **Store:** `services/leads.js` wrapping `localStorage` key `crm:leads` (mirrors `utils/tasks.js`/`utils/meetings.js`). Exposes `loadLeads`, `saveLeads`, `addLead`, `updateLead`, `intakeLead(payload, source)`, `convertLeadToClient(leadId)`.
- **Single seam:** all UI imports from `services/leads.js` only. **No component reads `localStorage` directly** — this is the discipline that makes the Phase 2 backend swap a one-file change.
- **Realtime:** `intakeLead()` dispatches `window` event `crm:lead-received`; `LeadsView` + sidebar badge listen (same pattern as `crm:prospects-updated` / `crm:meetings-updated`).
- **Automations (Phase 1):** implemented as helper calls inside `services/leads.js` transitions (e.g., on Qualified → `addTask(...)` from `utils/tasks.js`; on Meeting Done → create Draft MOM task; on convert → `addClient(...)` from `services/db.js`).
- **Org roster:** reuse `utils/team.js`; formalize the 5 roles (Ops Head, Team Leader, RM, Insurance Planner, Portfolio Manager) as a `ROLES` map for the permissions matrix.
- **Auth caveat:** current `utils/auth.js` (hardcoded credentials) is **build/demo only** and must be replaced in Phase 2 before real PII/leads go live.

## Appendix B — Phase 2 migration checklist

1. Stand up DB (§14) in Next.js app (API routes) or hardened Supabase with RLS.
2. Implement REST endpoints (§16) + zod validation + JWT auth + role policies (§18).
3. Point `services/leads.js` at the API (swap localStorage calls for fetch). UI untouched.
4. Wire website `/api/leads/intake` (Next.js) → `intakeLead` → DB; add honeypot + rate limit + captcha.
5. Replace `utils/auth.js` with real sessions.
6. Add server cron for follow-up/dormancy sweeps + reminders.
7. Migrate any existing `crm:leads` localStorage data via one-time importer.
8. Enable realtime (Supabase channel / websocket) replacing the `crm:lead-received` window event.
