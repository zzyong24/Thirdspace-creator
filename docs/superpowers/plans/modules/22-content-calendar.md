# Module 22 — Content Calendar (TDD execution plan)

> **Wave 5–7 (七步整合 §8 — `§7.1 PlatformAccount + §7.2 ContentCalendar` band, after the base 16 modules).** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §2 multi-tenant `RequestContext`). Implements spec `docs/CreatorOS-七步整合设计.md` **§7.2** (发布节奏 / 内容日历). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Content Calendar** vertical end-to-end — `ContentCalendarEntry` (a per-account planned/published/missed slot, optionally bound to a `ContentOutput` OR a `Candidate`) + `PublishingCadence` (a per-account target frequency + preferred slots) — so the planning/operations question **"我这周该发什么？哪个账号断更了？"** (§9 验收 #4) is answerable from real, user-scoped data: FE button → contract op → user-scoped SQL → envelope → render. The module owns the **节奏达成率 (cadence attainment)** + **断更检测 (gap/missed detection)** logic: given a `PublishingCadence` and the entries in a window, compute planned-vs-published-vs-missed and an attainment ratio. It backs the currently-**decorative** `内容日历 cells` and `发布前检查` surfaces on the Publishing Workspace (see `modules/10-publishing.md` lines 158–159) and a new calendar view.

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/content-calendar/` and registers its `{ opId → handler }` map into the composite transport registry (foundation §1 — adding a module = register it; no edit to the composite switch). Owns two entities — `ContentCalendarEntry`, `PublishingCadence` (七步整合 §7.2; data-model is the host spec, these are new ENT-1xx placeholders pending C-1 ID freeze). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. **No cross-module repository imports** — cross-module reads/writes go through other modules' public `index.ts` service interfaces only:
- `PlatformAccountService` (module 21, §7.1) — `account_id` ownership/existence validation; an entry/cadence references a real account the caller owns.
- `PublishingService` (module 10) — resolve a `content_output_id`'s publication status to reconcile a `planned` entry into `published` (the calendar mirrors publishing reality; it never re-implements the publish state machine, C-2).
- `CandidateService` (module 18, §5) — validate a `candidate_id` reference (a slot can be planned around an un-promoted Candidate).
- `NotificationsService` (module 01) — emit "账号断更" / "data-refresh due" notifications.

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract` (added in contract **v0.4**, see below), Vitest. ISO-8601 text timestamps + text enums, mirroring the Projects slice (`backend/src/schema/projects.ts`) and the Publishing module schema conventions (`frontend/src/server/modules/publishing/publishing.db-schema.ts`). **Determinism (C-5):** all "today / window / overdue" computation takes an injected `now()` (`RepoDeps.now` / a `clock` service dep) — **no `Date.now` / `Math.random` / `fetch`** in schema/repository/service/selectors/fixtures; the "this week" window is derived from the request's supplied reference instant, never wall-clock.

---

## Hard constraints inherited from the host spec (七步整合 §1)

- **C-2 (落库样板):** this module MUST go contract-op → `/api/v1/dispatch` → Drizzle/pglite repository → envelope from day one — NOT a frontend-fixtures-only layer. Every op below ships schema + repository + service + the three-test trio. The calendar surface is forbidden from holding its own client-side source of truth for entries; it reads the real op.
- **C-3 (复用候选确认流 — applies when a slot's `candidate_id` is AI-generated):** this module does **NOT** create Candidates and does **NOT** build a parallel candidate state machine. When a calendar slot is planned around an AI-suggested topic, the Candidate is produced upstream via `submit_candidate → awaiting_confirmation → confirmResult` (module 18 / `@creatoros/ai-worker`); this module only stores a `candidate_id` FK to an already-formalized Candidate (validated via `CandidateService`). Auto-suggesting "fill this empty slot from the pool" returns existing Candidate ids — it never mints one.
- **C-4 (校准回收复用 Ingestion):** this module does **NOT** open a new external-write path. The `planned → published`/`missed` reconciliation reads **already-ingested** publishing/metric reality via `PublishingService` (which itself is fed by the Ingestion `ExternalSource` + `(source, idempotency_key)` idempotency contract). The "data-refresh due" reminder (七步整合 §6.5: "发布后 N 天回来看数据") only schedules a Notification/Todo; the actual metric回收 stays in Ingestion. No `ingestion_run_id` is written here — if a reconcile needs a run, it asks Ingestion; we never dangle a fake `ingestionRunId` (RISK-005).
- **Multi-tenant everywhere (foundation §2/§3):** every row carries `user_id`; every query filters `eq(table.userId, ctx.userId)`; cross-user access → `OwnershipError` (404, not 403).

---

## Contract ops this module owns (to be ADDED in contract v0.4 — `contract/src/operations/content-calendar.ts` + `contract/src/resources/content-calendar.ts`)

> Grep confirmed NO existing calendar/cadence ops in `contract/src/operations` (current contract is v0.1.0; `calendar`/`cadence` appear only as decorative FE strings). These are NEW. IDs follow the existing `defineEndpoint` convention (dotted resource path id, `fr` placeholder). **Do not author the contract in this module's wave if contract v0.4 already shipped them — import and conform.** If v0.4 has not landed, Step 0 adds them (the only contract edit this module makes).

| op id | method · path | body / query | response DTO |
|---|---|---|---|
| `accounts.calendar.list` | GET `/accounts/:accountId/calendar` | query `{ from, to }` (ISO window) + pagination | `contentCalendarEntryResource` (isList) |
| `accounts.calendar.entries.create` | POST `/accounts/:accountId/calendar/entries` | `{ plannedAt, contentOutputId?, candidateId?, note? }` | `contentCalendarEntryResource` |
| `calendar.entries.update` | PATCH `/calendar/entries/:entryId` | `{ plannedAt?, contentOutputId?, candidateId?, note? }` | `contentCalendarEntryResource` |
| `calendar.entries.transition` | POST `/calendar/entries/:entryId/transition` | `{ status }` (`planned`/`published`/`missed`) | `contentCalendarEntryResource` |
| `calendar.entries.delete` | DELETE `/calendar/entries/:entryId` | — | `{ id, deleted: true }` |
| `accounts.cadence.get` | GET `/accounts/:accountId/cadence` | — | `publishingCadenceResource` (nullable) |
| `accounts.cadence.upsert` | PUT `/accounts/:accountId/cadence` | `{ frequency, preferredSlots }` | `publishingCadenceResource` |
| `accounts.cadence.attainment` | GET `/accounts/:accountId/cadence/attainment` | query `{ from, to }` | `cadenceAttainmentResource` |

**Owned op-id list (8):**
`accounts.calendar.list`, `accounts.calendar.entries.create`, `calendar.entries.update`, `calendar.entries.transition`, `calendar.entries.delete`, `accounts.cadence.get`, `accounts.cadence.upsert`, `accounts.cadence.attainment`.

DTO field shapes (added in contract v0.4 — author once in `resources/content-calendar.ts`, import everywhere, do NOT redefine):
- `contentCalendarEntryResource`: BaseEntity + `accountId`, `userId`, `plannedAt` (ISO), `contentOutputId?` (nullable id), `candidateId?` (nullable id), `status` (`calendarEntryStatus` enum), `note` (default `""`), `publishedAt?` (nullable), `createdAt`, `updatedAt`. **Exactly-one-of `contentOutputId`/`candidateId` may be set, or neither** (an unbound "intent" slot) — never both.
- `publishingCadenceResource`: BaseEntity + `accountId`, `userId`, `frequency` (`cadenceFrequency` enum: `daily | weekly | biweekly | monthly | custom`), `preferredSlots` (jsonb array of `{ weekday, time }`), `createdAt`, `updatedAt`. One per account (unique `(userId, accountId)`).
- `cadenceAttainmentResource` (derived, computed — NOT a stored table): `{ accountId, from, to, plannedCount, publishedCount, missedCount, expectedCount, attainmentRatio (0–1, decimal), gapDays (int — consecutive days since last published within window), isLagging (bool) }`.
- Enums (add to `contract/src/primitives.ts`): `calendarEntryStatus = planned | published | missed`; `cadenceFrequency = daily | weekly | biweekly | monthly | custom`.

**Calendar entry state machine (§7.2 `planned`/`published`/`missed`):**
```text
planned → published     (the bound ContentOutput's Publication reached `published` — reconciled from PublishingService, or manual confirm)
planned → missed        (plannedAt is past the grace window AND no published Publication — gap/断更 detection)
missed  → published     (late publish — recovered)
missed  → planned        (rescheduled: plannedAt moved into the future)
published → (terminal)
```
- A `planned → published`/`missed` flip is driven by the **reconcile pass** reading publishing reality (C-4), not by re-implementing publishing's machine. `published` is set only when a real `Publication` is `published` (resolved via `PublishingService`), OR by an explicit manual `calendar.entries.transition { status: "published" }` for an off-platform/manual record.
- `missed` (断更) is computed deterministically from injected `now()` + the cadence grace window — never wall-clock.

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/content-calendar/
├── content-calendar.db-schema.ts
├── content-calendar.repository.ts
├── content-calendar.service.ts
├── content-calendar.schema.ts
├── content-calendar.transport.ts
├── content-calendar.errors.ts
├── index.ts
├── content-calendar.service.test.ts
├── content-calendar.repository.integration.test.ts
└── content-calendar.contract.test.ts
```

---

## Dependency note (must be GREEN first)

- **Wave 0:** registry generalization + Identity/auth `RequestContext` threading (foundation §1/§2) + `OwnershipError`/`ConflictError`/`ValidationError`/`UnsupportedOperationError` shared infra.
- **Module 10 Publishing** (Wave 3) — green; provides `PublishingService.resolvePublication` / a published-status read for the reconcile pass.
- **Module 21 PlatformAccount** (§7.1, the sibling横切 module) — green; provides `PlatformAccountService.getAccount(ctx, accountId)` ownership validation. **This is the primary new-module blocker** — calendar entries hang off `account_id`. If 21 is not yet green, this module HALTS at Step 3 (account validation cannot be stubbed away — it is the ownership boundary for the account FK).
- **Module 18 Candidate** (§5) — green (or its `CandidateService.exists(ctx, candidateId)` interface declared); needed only for the optional `candidate_id` reference validation. If a slot never references a Candidate this is a soft dep, but the FK validation path needs the interface.
- **Module 01 Notifications** (Wave 1) — green; for 断更 / data-refresh-due notifications.
- **Contract v0.4** — the 8 ops + 3 resources + 2 enums above must exist (Step 0 authors them if absent).

Base modules that must be green before this one: **00-identity-auth, 01-notifications, 10-publishing, 18-candidate, 21-platform-account.**

---

## Step 0 — contract v0.4 ops (only if not already shipped)

- [ ] Check `contract/src/operations/content-calendar.ts` exists with the 8 ops. If absent, author it mirroring `contract/src/operations/publishing.ts` (`defineEndpoint`, `id`/`paginationQuery` primitives), plus `contract/src/resources/content-calendar.ts` (BaseEntity-extending Zod resources above) and the 2 enums in `contract/src/primitives.ts`. Export `contentCalendarOperations` from the operations index. Bump `contract/package.json` to `0.4.0`.
- [ ] **Test (contract package):** `contentCalendarOperations` round-trips through the existing contract op-registry test; each resource parses a hand-built fixture; `calendarEntryStatus`/`cadenceFrequency` enums reject unknown values.

> If contract v0.4 already shipped these (check first), SKIP Step 0 and import them as-is — do not redefine.

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.db-schema.ts`. Two `pgTable`s, `user_id TEXT NOT NULL` on every owned row (the ownership column, foundation §1/§3). Follow `publishing.db-schema.ts` conventions exactly: timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `CONTENT_CALENDAR_DDL` string for pglite init.
  - `contentCalendarEntries`: `id` PK (text), `userId`, `accountId`, `plannedAt` text notNull, `contentOutputId` (nullable), `candidateId` (nullable), `status` text default `'planned'`, `note` text default `''`, `publishedAt` (nullable), `createdAt` notNull, `updatedAt` notNull.
    - CHECK-style invariant (enforced in repository if pglite CHECK is awkward): NOT (`contentOutputId IS NOT NULL AND candidateId IS NOT NULL`) — never both bound.
    - Index on `(user_id, account_id, planned_at)` for the window list.
  - `publishingCadences`: `id` PK (text), `userId`, `accountId`, `frequency` text notNull, `preferredSlots` jsonb default `[]`, `createdAt` notNull, `updatedAt` notNull.
    - UNIQUE `(user_id, account_id)` — one cadence per account per user (upsert anchor).
- [ ] Append `CONTENT_CALENDAR_DDL` to the shared pglite init list (grep `PUBLISHING_DDL` usage; register alongside in the same `CREATE TABLE IF NOT EXISTS` init).
- [ ] **Test (`content-calendar.repository.integration.test.ts`, first red):** a row inserted into each table round-trips via `db.select()` with all columns intact (`status` defaults `'planned'`, `preferredSlots` defaults `[]`, nullable cols `null`); the `(user_id, account_id)` unique on cadences rejects a duplicate insert.

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.repository.ts` mirroring `createProjectRepository`/`createPublishingRepository`: `RepoDeps { now, nextId, userId }`, factory `createContentCalendarRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. Private `getEntryRowById(entryId)` / `getCadenceRowByAccount(accountId)` throw `OwnershipError` (`OwnershipError: calendar entry not found: <id>`) on empty scoped select (404 not 403).
  - `createEntry(accountId, { plannedAt, contentOutputId?, candidateId?, note? })` — reject if both `contentOutputId` and `candidateId` set (`ValidationError`); insert `{ id: nextId("cal"), userId, accountId, plannedAt, contentOutputId: contentOutputId ?? null, candidateId: candidateId ?? null, status: "planned", note: note ?? "", publishedAt: null, createdAt: now(), updatedAt: now() }`; return row.
  - `listEntries(accountId, { from, to, limit, offset })` — `where(and(eq(userId), eq(accountId), gte(plannedAt, from), lte(plannedAt, to)))`, `orderBy(asc(plannedAt))`, paginated.
  - `getEntry(entryId)` — scoped get, `OwnershipError` if absent.
  - `updateEntry(entryId, patch)` — scoped get (ownership) then scoped update of provided fields + `updatedAt: now()`; re-validate the not-both-bound invariant on the resulting row.
  - `setEntryStatus(entryId, { status, publishedAt? })` — scoped update (service-approved; the machine guard lives in the service).
  - `deleteEntry(entryId)` — scoped delete; return `{ id, deleted: true }`.
  - `upsertCadence(accountId, { frequency, preferredSlots })` — scoped `(userId, accountId)` lookup; UPDATE if present else INSERT `{ id: nextId("cad"), … createdAt: now() }`; always set `updatedAt: now()`; return row.
  - `getCadence(accountId)` — scoped get, returns row or **null** (cadence is optional; do NOT throw — the resource is nullable).
  - `entriesForAttainment(accountId, { from, to })` — scoped select of all entries in window (no pagination) for the attainment computation.
- [ ] **Tests (`content-calendar.repository.integration.test.ts`, pglite-backed):**
  - ownership: repo `userId: "user-a"` creates an entry; repo `userId: "user-b"` `getEntry(sameId)` throws `OwnershipError`.
  - `createEntry` with BOTH `contentOutputId` and `candidateId` throws `ValidationError`.
  - `listEntries` returns ascending-by-`plannedAt`, respects the `from`/`to` window (excludes out-of-window rows) and `limit`/`offset`.
  - `upsertCadence` twice for the same `(user, account)` updates the SAME row (no duplicate; unique holds), changing `frequency`.
  - `getCadence` returns `null` for an account with no cadence (no throw).

## Step 3 — service (RequestContext + state machine + attainment logic)

- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.errors.ts`: re-use shared `OwnershipError`/`ConflictError`/`ValidationError`/`UnsupportedOperationError` (import from shared infra; do not redefine).
- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.service.ts`. Every public method takes `(ctx: RequestContext, …)` and builds a repo bound to `ctx.userId` (`createContentCalendarRepository(db, { now, nextId, userId: ctx.userId })`). Peer services injected via constructor deps (never repo import): `platformAccounts: PlatformAccountService`, `publishing: PublishingService`, `candidates: CandidateService`, `notifications: NotificationsService`, and a `clock: { now(): string }` (deterministic, C-5). Transition table:
  ```ts
  const ALLOWED: Record<string, ReadonlyArray<string>> = {
    planned: ["published", "missed"],
    missed: ["published", "planned"],
    published: [],
  };
  ```
  Methods:
  - `listCalendar(ctx, accountId, { from, to }, pagination)` — first `platformAccounts.getAccount(ctx, accountId)` (ownership/existence; throws `OwnershipError` if not the caller's account); `repo.listEntries` → `contentCalendarEntryResource[]`. Backs `accounts.calendar.list`.
  - `createEntry(ctx, accountId, body)` — validate account ownership; if `contentOutputId` set, `publishing`-side existence is the Output's owner check (delegate via `PublishingService`/`ProjectsService` interface — confirm the Output belongs to ctx.user); if `candidateId` set, `candidates.exists(ctx, candidateId)` (C-3: the Candidate must already be formalized — we never create one here); reject not-both-bound; `repo.createEntry`; return DTO. Backs `accounts.calendar.entries.create`.
  - `updateEntry(ctx, entryId, patch)` — ownership; same FK validations as create; if `plannedAt` moves into the future on a `missed` entry, allow the implicit `missed → planned` reschedule (set status `planned`); `repo.updateEntry`. Backs `calendar.entries.update`.
  - `transition(ctx, entryId, { status: next })` — `repo.getEntry` (ownership); **idempotency:** if `next === current`, return existing DTO. Guard `ALLOWED[current].includes(next)` else `ConflictError` (`ConflictError: calendar entry <id> cannot transition <current> → <next>`). On `→ published` stamp `publishedAt = clock.now()`. `repo.setEntryStatus`. Backs `calendar.entries.transition`.
  - `deleteEntry(ctx, entryId)` — ownership; `repo.deleteEntry`. Backs `calendar.entries.delete`.
  - `getCadence(ctx, accountId)` — account ownership; `repo.getCadence` → `publishingCadenceResource | null`. Backs `accounts.cadence.get`.
  - `upsertCadence(ctx, accountId, { frequency, preferredSlots })` — account ownership; guard `frequency` parses as `cadenceFrequency`; validate `preferredSlots` shape; `repo.upsertCadence` → DTO. Backs `accounts.cadence.upsert`.
  - `reconcile(ctx, accountId, { from, to })` (internal, called by attainment + a scheduled/Todo pass) — for each `planned` entry in window with a `contentOutputId`: ask `publishing.resolvePublication`/published-status (C-4 — read already-ingested reality, no new write path); if a bound Output has a `published` Publication, `transition → published`; else if `plannedAt + grace < clock.now()`, `transition → missed`. **Deterministic** on `clock.now()`. On a fresh `missed` flip, `notifications.notify(ctx, { type: "cadence_gap", accountId, … "账号断更" })` (idempotent — only on the planned→missed edge, not re-fired for already-missed).
  - `attainment(ctx, accountId, { from, to })` — account ownership; run `reconcile`; `repo.entriesForAttainment`; load cadence; compute `cadenceAttainmentResource`: `expectedCount` from `frequency`×window length (deterministic from `from`/`to`, NOT wall-clock), `publishedCount`/`missedCount`/`plannedCount` from entries, `attainmentRatio = publishedCount / max(expectedCount, 1)`, `gapDays` = consecutive days from the last `published.publishedAt` to `to` (or window start if none), `isLagging = gapDays > graceForFrequency(cadence.frequency)`. Backs `accounts.cadence.attainment`. **No `Date.now`** — all dates from `from`/`to`/entry timestamps/`clock`.
- [ ] **Tests (`content-calendar.service.test.ts`, fake `now`/`nextId`, fixed `clock`, pglite db, stubbed peer services):**
  - account-ownership guard: `listCalendar`/`createEntry` for an account the stubbed `PlatformAccountService` reports as not-owned throws `OwnershipError`.
  - transition valid: `planned → published` stamps `publishedAt`; `planned → missed` allowed; `missed → published` (late recover) allowed.
  - transition invalid: `published → planned` throws `ConflictError`; `planned → planned` is an idempotent no-op (returns existing DTO).
  - C-3 guard: `createEntry { candidateId }` for a candidate the stubbed `CandidateService.exists` returns false → `ValidationError`; service NEVER calls any candidate-create path.
  - not-both-bound: `createEntry { contentOutputId, candidateId }` → `ValidationError`.
  - `reconcile` with a fixed `clock`: a `planned` entry whose bound Output the stubbed `PublishingService` reports `published` flips to `published`; a `planned` entry with `plannedAt + grace < clock.now()` and no publication flips to `missed` AND fires exactly one `notifications.notify` (`cadence_gap`); a second `reconcile` does NOT re-fire (idempotent on the edge).
  - `attainment` math: with a `weekly` cadence over a 4-week window and 3 published / 1 missed entries, `expectedCount === 4`, `attainmentRatio === 0.75`, `gapDays`/`isLagging` deterministic from the fixed `clock`. No `Date.now`/`Math.random` anywhere (assert via a lint/grep check in the test or a wall-clock-injection probe).
  - cadence: `getCadence` returns `null` (not throw) when none set; `upsertCadence` twice updates the same row.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.schema.ts`: re-export the contract DTOs/enums/ops used (`contentCalendarEntryResource`, `publishingCadenceResource`, `cadenceAttainmentResource`, `contentCalendarOperations`, `calendarEntryStatus`, `cadenceFrequency`) — single import surface.
- [ ] Create `frontend/src/server/modules/content-calendar/content-calendar.transport.ts` mirroring `frontend/src/server/modules/publishing/publishing.transport.ts` — **ctx-taking** (foundation §2). Export `createContentCalendarTransport(service)` returning `{ request(ctx, endpoint, input) }` with `switch (endpoint.id)`:
  - `"accounts.calendar.list"` → `service.listCalendar(ctx, params.accountId, query, query)`, `meta: listMeta`.
  - `"accounts.calendar.entries.create"` → `service.createEntry(ctx, params.accountId, body)`, `meta: singleMeta`.
  - `"calendar.entries.update"` → `service.updateEntry(ctx, params.entryId, body)`.
  - `"calendar.entries.transition"` → `service.transition(ctx, params.entryId, body)`.
  - `"calendar.entries.delete"` → `service.deleteEntry(ctx, params.entryId)`.
  - `"accounts.cadence.get"` → `service.getCadence(ctx, params.accountId)`.
  - `"accounts.cadence.upsert"` → `service.upsertCadence(ctx, params.accountId, body)`.
  - `"accounts.cadence.attainment"` → `service.attainment(ctx, params.accountId, query)`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/content-calendar/index.ts` exporting the public `ContentCalendarService` interface + the 8 op-id list + `registerContentCalendar(registry)` that adds the transport map. Register in the composite transport registry (foundation §1 — union builds `PERSISTED_OPS`; no edit to the composite switch). Also export `getCalendarForDashboard(ctx, …)` / `getLaggingAccounts(ctx)` thin reads for the Wave-4 Dashboard query service (§9 验收 #4 "哪个账号断更了" surfaces on Dashboard) — declare signatures, implement `getLaggingAccounts` (scoped scan of cadence attainment per owned account).
- [ ] **Tests (`content-calendar.contract.test.ts`):** for EACH of the 8 op ids, drive the transport with a seeded ctx + valid input and assert the contract DTO parses the envelope data (`contentCalendarOperations.listCalendar.response.parse(item)` per list item; `…create`/`…update`/`…transition`/`…delete`/`…cadenceGet`/`…cadenceUpsert`/`…attainment` against their DTOs). Include an `accounts.cadence.attainment` happy path whose `cadenceAttainmentResource` parses with `attainmentRatio` in `[0,1]`.

## Step 5 — FE island wiring

Preserve the `viewModel?` seam; server reads switch from fixture to the real op. Two surfaces.

### 5a — Publishing Workspace `/projects/:id/publishing` — promote the inert calendar (从 module 10 接管)

`modules/10-publishing.md` (lines 158–159) leaves `内容日历 cells` and `发布前检查 rows` **intentionally inert** ("no contract op backs them this wave"). This module supplies the ops; wire them now in `frontend/src/features/project-publishing/publishing-interactive-region.tsx` (+ server shell `publishing-workspace-page.tsx` for the initial read).

| §4 label | prior state | new wiring |
|---|---|---|
| `内容日历 cells` (7-day overview) | decorative | server read via `accounts.calendar.list { from, to }` for the active account → render planned/published/missed badges per cell. Clicking an empty cell opens a create-entry affordance → `accounts.calendar.entries.create { plannedAt }`; `router.refresh()`. Status colours from the real `status` enum (no client-invented state, C-2). |
| `发布前检查 rows` | decorative | keep **decorative** this wave UNLESS it maps to a real check — note explicitly: pre-publish checklist is a publishing concern, not calendar; leave inert, documented. |

- [ ] Update `frontend/src/features/project-publishing/publishing-interactions.test.tsx`: assert clicking an empty calendar cell issues `accounts.calendar.entries.create` via the HttpTransport mock + `router.refresh()`; assert the calendar render reflects server `status` (no `Date.now` in the region/selectors — grep guard).

### 5b — Cadence / Calendar view (new account-scoped surface, §9 验收 #4)

A calendar/cadence panel keyed by `PlatformAccount` (lives on the PlatformAccount detail surface from module 21, or a new `/calendar` route — confirm with module 21's FE owner; Open Question 2). New island `frontend/src/features/content-calendar/content-calendar-interactive-region.tsx` (+ server shell doing the initial `accounts.calendar.list` + `accounts.cadence.get` + `accounts.cadence.attainment` reads).

| control | state | wiring |
|---|---|---|
| Month/week calendar grid | needs-backend (read) | server `accounts.calendar.list { from, to }`; entries rendered by `status`. |
| `新增计划` (add slot) | needs-backend | `accounts.calendar.entries.create { plannedAt, contentOutputId?/candidateId? }` → `router.refresh()`. |
| Entry drag/reschedule, edit note | needs-backend | `calendar.entries.update { plannedAt?, note? }` → `router.refresh()`. |
| Entry mark published / delete | needs-backend | `calendar.entries.transition { status }` / `calendar.entries.delete`. |
| Cadence editor (frequency + preferred slots) | needs-backend | `accounts.cadence.upsert { frequency, preferredSlots }` → `router.refresh()`. |
| 节奏达成率 badge + 断更 banner | needs-backend (read) | `accounts.cadence.attainment { from, to }` → render `attainmentRatio` % + `isLagging`/`gapDays` "已断更 N 天" banner. |
| "从候选池补位" suggest-fill (optional) | wired-local→backend (read) | lists existing Candidate ids from `CandidateService` to bind into an empty slot — **never mints a Candidate** (C-3). |

- [ ] Create `frontend/src/features/content-calendar/content-calendar-interactions.test.tsx`: assert add-slot issues `accounts.calendar.entries.create`; reschedule issues `calendar.entries.update`; cadence editor issues `accounts.cadence.upsert`; attainment badge renders from the `accounts.cadence.attainment` envelope; assert NO `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures (C-5 grep guard).

## Step 6 — tests (MODULE-ARCH §2 trio) + acceptance (SPEC §22 + 七步整合 §1)

- [ ] All three test files green: `content-calendar.service.test.ts` (state-machine valid+invalid, idempotent transition, reconcile planned→published/missed via stubbed PublishingService, single 断更 notification on the edge, attainment math, C-3 candidate-validation-only), `content-calendar.repository.integration.test.ts` (pglite, ownership user-A-vs-B, not-both-bound, window list ordering/pagination, cadence unique + null-not-throw), `content-calendar.contract.test.ts` (each of 8 ops validates against its contract DTO).
- [ ] **Acceptance checklist:**
  - **C-2:** every op goes contract → dispatch → Drizzle/pglite repository → envelope; the calendar FE holds no independent source of truth for entries (reads the real op). Module ships service + repository + schema + the test trio; the dispatch route does not touch the db client (threads `ctx`).
  - **C-3:** module creates NO Candidate and has NO parallel candidate state machine — `candidate_id` is a validated FK to an already-formalized Candidate (via `CandidateService`); suggest-fill returns existing ids only. (Asserted by the service test that NO candidate-create path is reachable.)
  - **C-4:** `planned → published`/`missed` reconciliation reads already-ingested publishing reality via `PublishingService`; the module opens NO new external-write path and writes NO `ingestion_run_id`; data-refresh reminders only schedule Notifications/Todos (the actual 指标回收 stays in Ingestion).
  - **Multi-tenant:** every row `user_id`-stamped; every query `eq(userId)`-scoped; cross-user → `OwnershipError` (404); account FK ownership validated via `PlatformAccountService` (no cross-module repo import — peer access only via `index.ts` service interfaces: `PlatformAccountService`/`PublishingService`/`CandidateService`/`NotificationsService`).
  - **C-5 determinism:** no `Date.now`/`Math.random`/`fetch` in schema/repository/service/selectors/fixtures — all time from injected `clock`/`from`/`to`/timestamps; 断更/attainment reproducible. New page is server-shell + `*-interactive-region.tsx` island using `ui/*` primitives + AppShell/Sidebar/TopHeader; mark "暂不纳入视觉门禁" pending the stage-12 re-baseline (C-5).
  - State machine: entry transitions only along the allowed edges; transition is idempotent (same-status no-op); `published` is terminal.
  - §9 验收 #4 closes: "我这周该发什么？哪个账号断更了？" answerable from `accounts.calendar.list` + `accounts.cadence.attainment`/`getLaggingAccounts`.
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. **Contract v0.4 authorship ownership.** The 8 ops + 3 resources + 2 enums are NEW (grep confirmed none exist; contract is v0.1.0). Confirm whether contract v0.4 is authored centrally (a contract-team wave) or this module's Step 0 owns it. Default: Step 0 authors them if absent at execution time, mirroring `publishing.ts`.
2. **Calendar FE home.** Does the account-scoped calendar/cadence view live on module 21's PlatformAccount detail page, a new top-level `/calendar` route, or as a Publishing-Center tab? Coordinate with module 21's FE owner. Default: new `frontend/src/features/content-calendar/` island, mountable on the PlatformAccount detail surface.
3. **`expectedCount` for `frequency = custom`.** With `custom` frequency, `expectedCount` can't be derived from a simple multiplier. Recommend: `custom` derives `expectedCount` from the count of `preferredSlots` projected across the window; confirm the projection rule.
4. **Grace window for 断更.** `planned → missed` needs a grace period after `plannedAt` (e.g. same-day vs +1 day). Recommend per-frequency grace (`daily`→+1d, `weekly`→+2d, …) as a deterministic `graceForFrequency(frequency)` helper; confirm the values.
5. **Reconcile trigger cadence.** `reconcile` runs inside `attainment` (read-time). Should there also be a scheduled/Todo-driven background reconcile (七步整合 §6.5 "发布后 N 天回来看数据" Dashboard TodoCard)? Default: read-time only this wave; the Dashboard Todo reminder is a Notifications concern wired via `getLaggingAccounts`, deferred to the Wave-4 Dashboard query service.
