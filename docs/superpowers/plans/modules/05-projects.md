# Module 05 — Projects (Wave 2) — Executable TDD Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` + `superpowers:executing-plans`. Steps use `- [ ]`. This plan follows the **keystone** conventions in `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture, §5 per-module template). Do NOT deviate from file paths or op ids below — they are grepped, not guessed.

**Goal:** Take the proven Projects slice (`@creatoros/backend` flat: pglite + `project-repository` + `persistence-transport`, currently serving 7 ops with a hardcoded `userId`) and **generalize it into the modular-monolith module `src/server/modules/projects/`** per foundation §1, then **EXTEND** it to own all 15 contract ops in the "项目与流程" group — adding **ContentOutput + OutputStage + Task + ProjectActivity** persistence and **multi-tenant `RequestContext.userId` scoping** on every query. End state: every `needs-backend` button on `/projects`, `/projects/:id`, `/projects/new` (plus the shell stepper/primary-action) is wired FE-island → contract op → user-scoped SQL → `router.refresh()` render.

**Architecture:** Modular monolith inside the one Next app (SPEC §22). Module code lives under `frontend/src/server/modules/projects/` (foundation §1 layout). `@creatoros/backend` remains the **shared infra** package (pglite/Drizzle `createDb`, `RequestContext`, the module transport registry, `UnsupportedOperationError`). The module exports `{ opId → (ctx, input) => envelope }` into the composite transport registry; `PERSISTED_OPS` becomes the union of registered module maps (no hand-edits to add ops). Every repository query is user-scoped: `eq(table.userId, ctx.userId)` (foundation §1, SPEC §10/§20). State transitions live in the **service** implementing SPEC §12 (Project, Stage, ContentOutput machines); the repository only executes service-approved writes (SPEC §12 last line).

**Tech stack:** TypeScript · Drizzle ORM over `@electric-sql/pglite` (pure-WASM Postgres, `globalThis` singleton) · Zod DTOs from `@creatoros/contract` · Vitest · Next.js App Router (server components read via `client.*`; client islands mutate via `HttpTransport` → `/api/v1/dispatch` → `compositeTransport` then `router.refresh()`).

**Dependency note (must be GREEN first):** Wave 0 (foundation §1 registry generalization + §2 Identity/auth giving real `RequestContext.userId` + §4 mock adapters) and Wave 1 Notifications + Search (roadmap §3 — Projects deps = `Identity, Notifications, Search`; Notifications/Search are only soft post-commit consumers, so their `index.ts` service interface must merely exist). Projects is the head of the Wave 2 critical path; Knowledge/Assets/Artifacts depend on it.

---

## Contract ops this module owns (grepped from `contract/src/operations/projects.ts`)

15 ops in the "项目与流程" SPEC §13 group (the page-composition `projects.get` overview DTO is in `operations/pages.ts`, owned by Wave-4 ProjectOverviewQueryService — NOT here):

| op id | method · path | repo/service method |
|---|---|---|
| `projects.list` | GET `/projects` | `repo.list(ctx)` |
| `projects.create` | POST `/projects` | `service.createProject` (seeds 6 stages + platforms + activity) |
| `projects.get` | GET `/projects/:projectId` | `repo.get(ctx, id)` |
| `projects.patch` | PATCH `/projects/:projectId` | `service.patchProject` |
| `projects.archive` | POST `/projects/:projectId/archive` | `service.archiveProject` |
| `projects.stage.transition` | POST `/projects/:projectId/stages/:stage/transition` | `service.transitionProjectStage` |
| `projects.outputs.create` | POST `/projects/:projectId/outputs` | `service.createOutput` (seeds 4 output stages) |
| `projects.outputs.list` | GET `/projects/:projectId/outputs` | `repo.listOutputs(ctx, projectId)` |
| `outputs.get` | GET `/outputs/:outputId` | `repo.getOutput(ctx, id)` |
| `outputs.patch` | PATCH `/outputs/:outputId` | `service.patchOutput` |
| `outputs.stage.transition` | POST `/outputs/:outputId/stages/:stage/transition` | `service.transitionOutputStage` |
| `projects.tasks.list` | GET `/projects/:projectId/tasks` | `repo.listTasks(ctx, projectId)` |
| `projects.tasks.create` | POST `/projects/:projectId/tasks` | `service.createTask` |
| `tasks.patch` | PATCH `/tasks/:taskId` | `service.patchTask` |
| `projects.activity.list` | GET `/projects/:projectId/activity` | `repo.listActivity(ctx, projectId)` |

**Resource DTOs** (`contract/src/resources/projects.ts`): `projectResource`, `contentOutputResource`, `taskResource`, `projectActivityResource`. **Note** the contract `contentOutputResource.status` enum is `["drafting","recording","editing","ready","published"]` while SPEC §12 ContentOutput machine is `draft→active→ready→published→retired (active→cancelled)` — see Open Question 1; the service maps SPEC states onto the DTO enum and the DTO is the contract truth that the `*.contract.test.ts` validates against.

---

## Target file layout (foundation §1 / MODULE-ARCH §2)

```
frontend/src/server/modules/projects/
├── projects.db-schema.ts                 # 6 pgTables + PROJECTS_DDL (extends today's schema)
├── projects.repository.ts                # user-scoped queries ONLY: eq(table.userId, ctx.userId)
├── projects.service.ts                   # RequestContext methods; §12 machines; create UoW seeds
├── projects.schema.ts                    # re-export contract Zod DTOs for this module
├── projects.transport.ts                 # { opId → (ctx,input)=>envelope }; UnsupportedOperationError otherwise
├── projects.errors.ts                    # OwnershipError, StageTransitionError, OutputStateError, TaskStateError
├── index.ts                              # ONLY public entry: service interface + transport map
├── projects.service.test.ts
├── projects.repository.integration.test.ts
└── projects.contract.test.ts
```

Migrate (not copy-then-orphan) the proven slice: today's `backend/src/schema/projects.ts`, `backend/src/repositories/project-repository.ts`, `backend/src/persistence-transport.ts` become the seeds of `projects.db-schema.ts` / `projects.repository.ts` / `projects.transport.ts`. `createDb` stays in `@creatoros/backend` but its DDL list moves to per-module DDL contributed into the shared init (Task 1.4).

---

## Shared infra prerequisites (foundation §1 — confirm GREEN before Task 1)

- [ ] **0.1** Confirm `@creatoros/backend` exposes `RequestContext { userId, requestId, source }` and a **module transport registry** (`registerModule(opMap)` + a composite that builds `PERSISTED_OPS` from the union). If Wave 0 delivered only the registry shell, this module registers into it; if absent, STOP — Wave 0 is not green (foundation §6: "nothing parallelizes before it").
- [ ] **0.2** Confirm the `/api/v1/dispatch` route derives `ctx` from the session cookie and calls `compositeTransport.request(ctx, endpoint, input)` (foundation §2: the transport signature gained a `ctx` param). The Projects transport map signature is `(ctx, input) => envelope`.
- [ ] **0.3** Confirm the seeded canonical user id (from Identity) is the same id today's `canonicalDataset.user.id` uses, so seeded fixtures keep round-tripping under user-scope.

---

## Task 1 — db-schema (`projects.db-schema.ts`)

Drizzle pgTables for the 6 owned entities (data-model §3 + SPEC §9). `user_id` on **project-owned root rows**; child rows reach ownership through their parent FK (queries always join/filter via the parent's `userId`, never expose a child to another tenant).

- [ ] **1.1 (RED)** In `projects.repository.integration.test.ts`, write a round-trip test: create the 6 tables via the module DDL, insert one row per table, select it back. Assert column names match the DTOs.
- [ ] **1.2** Keep the existing `projects` table verbatim (already has `user_id`, all 15 cols per data-model §3 lines 67-85). Keep `project_activities` verbatim.
- [ ] **1.3** ADD four tables (exact columns from data-model §3):
  - `project_stages`: `id PK, project_id, stage, status, progress_pct INT default 0, skipped BOOLEAN default false, started_at, completed_at, updated_at`. UNIQUE `(project_id, stage)` (data-model rule 3: ≤1 row per stage).
  - `project_target_platforms`: `id PK, project_id, platform, priority INT, planning_note TEXT default '', created_at`. UNIQUE `(project_id, platform)` (rule 4: intent only).
  - `content_outputs`: `id PK, project_id, title, content_type, format default '', aspect_ratio default '', target_duration_seconds INT default 0, status, primary_asset_id (nullable), created_at, updated_at`.
  - `output_stages`: `id PK, content_output_id, stage, status, progress_pct INT default 0, skipped BOOLEAN default false, started_at, completed_at, updated_at`. UNIQUE `(content_output_id, stage)`; CHECK/guard stage ∈ `{script, production, publishing, review}` (data-model rule 5).
  - `tasks`: `id PK, project_id, content_output_id (nullable), stage, title, description TEXT default '', status, priority INT default 3, due_at (nullable), completed_at (nullable)`.
- [ ] **1.4** Export `PROJECTS_DDL` = the `CREATE TABLE IF NOT EXISTS` block for all 6 tables (text DDL like today's, since pglite has no migration runner). Register this DDL into the shared init list `createDb` applies (foundation §1: per-module DDL contributed to shared init).
- [ ] **1.5** Timestamps stored as ISO-8601 `text` (matching today's slice + `iso8601` DTO primitive) — no driver tz round-tripping. Enums stored as `text`, validated by Zod on output.
- [ ] **1.6 (GREEN)** Round-trip test passes.

---

## Task 2 — repository (`projects.repository.ts`) — USER-SCOPED ONLY

Every method takes `ctx: RequestContext` first. **Every** root query filters `eq(projects.userId, ctx.userId)`; child reads first resolve+ownership-check the parent, then filter by the parent FK. Inserts stamp `ctx.userId` on root rows. Cross-user / missing → `OwnershipError` (→ 404, SPEC §11/§20: no existence leak).

- [ ] **2.1 (RED)** In `projects.repository.integration.test.ts`, write the **multi-tenant ownership** test (foundation §5 step 2): seed project `P_A` for user A and `P_B` for user B; assert `repo.list(ctxA)` returns only A's; `repo.get(ctxB, "P_A")` throws `OwnershipError`; `repo.listTasks(ctxB, "P_A")` throws `OwnershipError` (parent owned by A). This test MUST fail first against an unscoped query.
- [ ] **2.2** Port today's methods to user-scoped signatures:
  - `list(ctx)` → `... where(eq(projects.userId, ctx.userId)).orderBy(asc(projects.createdAt))`.
  - `get(ctx, projectId)` → `where(and(eq(projects.id, projectId), eq(projects.userId, ctx.userId)))`; empty → `OwnershipError`.
  - `insertProject(ctx, row)`, `patchProjectRow(ctx, id, set)`, `updateProjectStatus(ctx, id, set)` — all re-assert ownership via `get(ctx, id)` before the `update`.
  - `listActivity(ctx, projectId)` → `get(ctx, projectId)` first (ownership), then `where(eq(projectActivities.projectId, projectId))`.
  - `appendActivity(ctx, row)` (used by service inside the create/transition UoW).
- [ ] **2.3** ADD stage methods: `insertStages(ctx, rows[])`, `getStage(ctx, projectId, stage)` (ownership via parent), `updateStage(ctx, stageId, set)`, `listStages(ctx, projectId)`.
- [ ] **2.4** ADD platform methods: `insertTargetPlatforms(ctx, rows[])`, `listTargetPlatforms(ctx, projectId)`.
- [ ] **2.5** ADD output methods: `insertOutput(ctx, row)`, `listOutputs(ctx, projectId)` (ownership via parent project), `getOutput(ctx, outputId)` (JOIN `content_outputs→projects` filter `projects.userId = ctx.userId`), `patchOutputRow(ctx, outputId, set)`, `insertOutputStages(ctx, rows[])`, `getOutputStage(ctx, outputId, stage)`, `updateOutputStage(ctx, stageId, set)`.
- [ ] **2.6** ADD task methods: `insertTask(ctx, row)`, `listTasks(ctx, projectId)` (ownership via parent), `getTask(ctx, taskId)` (JOIN `tasks→projects` filter on `userId`), `patchTaskRow(ctx, taskId, set)`.
- [ ] **2.7** Keep `seedProjects(rows[])` + ADD `seedStages/seedPlatforms/seedOutputs/seedOutputStages/seedTasks/seedActivities` for fixture hydration (insert with explicit `user_id` already on the row; `onConflictDoNothing`).
- [ ] **2.8 (GREEN)** Ownership test passes; no method issues an unscoped root query (grep guard: every `from(projects)` co-occurs with `eq(projects.userId, ctx.userId)`).

---

## Task 3 — service (`projects.service.ts`) — RequestContext + §12 state machines + create-UoW

All public methods `(ctx, command)`. Service owns the state machines (SPEC §12); repository only executes approved writes. Cross-row create runs in one Unit-of-Work (SPEC §11). Service is the **only** entry other modules import (via `index.ts`).

- [ ] **3.1 (RED — createProject UoW)** In `projects.service.test.ts`: `createProject(ctx, { title, brief })` returns a project with `status: "active"`, `currentStage: "research"`, AND seeds **6 ProjectStage rows** (`research…review`, the first `in_progress`/started, rest `not_started`), **the target platforms** passed in the command (or none), and **one ProjectActivity** (`event_type: "project_created"`). Mirrors SPEC §11 createProject fan-out (`create → createFixedStages → createTargetPlatforms → appendActivity`). Roadmap §4 New-Project row: transition `→draft` + "Stage research→in_progress" + "seed 6 stages".
- [ ] **3.2** Implement `createProject` in one UoW: `insertProject` → `insertStages([6])` → `insertTargetPlatforms(...)` → `appendActivity`. Use injected `now()`/`nextId(prefix)` (deterministic, as today's slice). `progressPct` starts 0.
- [ ] **3.3 (RED — Stage machine, SPEC §12)** Test `transitionProjectStage(ctx, projectId, stage, { reason })`: legal `not_started→in_progress`, `in_progress→completed`, `in_progress↔blocked`; `→skipped` from `not_started|in_progress` **requires `reason`** (guard: reason + timestamp — roadmap §5 tricky-logic 2) else `StageTransitionError`. Illegal target → `StageTransitionError`. On success: update the `project_stages` row, recompute `projects.current_stage`/`progress_pct` (avg of 6 stage progresses; skipped counts as completed for the math — roadmap §5 tricky-logic 2), append a `stage_transition` activity. Keep today's adjacency check only as the default progression; the machine is per-stage status, not a linear index.
- [ ] **3.4** Implement `transitionProjectStage` accordingly. `progress_pct` is a **query cache** recomputed here, not a stored fact you trust elsewhere.
- [ ] **3.5 (RED — Project machine)** Test `archiveProject(ctx, id)`: only from `completed` per SPEC §12 (`completed→archived`); from `active` it must first be `completed`. **Decision needed** — today's slice archives directly from active; align to §12 (see Open Question 2). On archive: set `status: "archived"`, `archived_at`; archived ⇒ read-only (subsequent `patch`/`transition` throw). `patchProject(ctx, id, { title?, brief?, starred? })` allowed unless archived.
- [ ] **3.6 (RED — ContentOutput machine, SPEC §12)** Test `createOutput(ctx, projectId, { title })`: creates a `content_outputs` row `status: "draft"` (maps to DTO enum — OQ1) and seeds **4 OutputStage rows** (`script, production, publishing, review`, first `in_progress`). `transitionOutputStage(ctx, outputId, stage, { reason })`: same Stage machine as 3.3 over `output_stages`. `patchOutput(ctx, outputId, { title?, primaryAssetId? })`. Guard `primary_asset_id` (data-model rule 8: must reference an OutputAsset of THIS output) — defer the cross-module check to Assets (Wave 2 parallel); here accept the id and append activity.
- [ ] **3.7 (RED — Task machine, SPEC §12 Review row: open→done analog)** Test `createTask(ctx, projectId, { title, stage })` → `status: "todo"`, `priority: 3`. `patchTask(ctx, taskId, { status?, title? })`: status ∈ `todo|in_progress|done|blocked`; `→done` stamps `completed_at`; reopening clears it.
- [ ] **3.8 (GREEN)** All service tests pass: createProject UoW, stage/output/task machines, archive read-only, ownership errors propagate from the repo unchanged.

---

## Task 4 — schema + transport (`projects.schema.ts`, `projects.transport.ts`) — register ops

- [ ] **4.1** `projects.schema.ts` re-exports the 4 contract DTOs (`projectResource`, `contentOutputResource`, `taskResource`, `projectActivityResource`) + the command Zod shapes from `operations/projects.ts` for in-service input parsing. No new schema — the contract is truth.
- [ ] **4.2 (RED — contract test)** In `projects.contract.test.ts`, for **each of the 15 op ids**, drive the transport with a valid input and assert the envelope `data` validates against the op's contract response schema (`endpoint.response.parse(envelope.data)` per item for `isList`). This is foundation §5 step 4 / MODULE-ARCH §2 `*.contract.test.ts`.
- [ ] **4.3** Implement `projects.transport.ts` as `{ opId → (ctx, input) => envelope }` (port today's `switch`, extend to all 15). Map each op to the repo/service method in the ops table above. List ops return `{ data: rows, meta: listMeta(rows.length) }`; singles `{ data, meta: singleMeta }`. Throw `UnsupportedOperationError(opId)` in `default`. Read the `:stage`/`:taskId`/`:outputId` params from `input.params`; `body` for create/patch/transition.
- [ ] **4.4** `index.ts` exports the public service interface + the transport op map; registers the map into the shared composite registry (`registerModule(projectsTransportMap)`) so `PERSISTED_OPS` gains all 15 ids via the union — **no edit to `persistence-client.ts`'s hardcoded Set** (foundation §1: "Adding a module = register it"). Delete the 7-id literal Set in `frontend/src/server/persistence-client.ts` in favor of the registry union (or, if the registry isn't landed yet, extend the Set to the 15 ids as a bridge and file a follow-up — see OQ3).
- [ ] **4.5** Seed hydration: in `buildPersistence()` (`persistence-client.ts`), pass `ctx` (canonical user) and call the new `seed*` methods from `canonicalDataset` (projects already seeded; add stages/platforms/outputs/tasks/activities from the canonical fixture). Keep deterministic `now: () => FIXED_NOW_ISO` and the `nextId` counter scheme.
- [ ] **4.6 (GREEN)** Contract test passes for all 15 ops; `route.test.ts` still green.

---

## Task 5 — FE island wiring (from roadmap §4 button rows)

Reads stay server-side via `client.*` in `features/projects/*` (preserve the `viewModel?` test seam — `projects-page.tsx` already reads `client.listProjects`). Mutations move to **client islands** that call the op via `HttpTransport` → `/api/v1/dispatch`, then `router.refresh()`. Below, every row is a roadmap §4 entry for `/projects`, `/projects/:id`, `/projects/new`, or the Shell stepper. EXACT labels quoted.

### `/projects/new` overlay + `/projects` New-Project dialog (roadmap §4 "New Project Overlay" / "Projects")
- [ ] **5.1** **「创建」 (submit)** [`needs-backend`] → `client.createProject({ body: { title, brief } })` then route into the workspace if 「创建后进入工作区」 is checked. File: `frontend/src/features/projects/new-project-form.tsx` (wire `handleSubmit` at line ~216). Transition: `→draft` + seed 6 stages (Task 3.2). On success `router.refresh()` so `/projects` shows the new row.
- [ ] **5.2** Capture-only fields **「项目名称」 input**, **「一句话描述」 textarea**, **「内容类型」/「创作模式」 radio cards** [`wired-local`] feed the create body (title, brief, contentType, creationMode). **「目标平台」 radio cards** [`wired-local`] → include as `targetPlatforms` in a follow-up (contract `createProject` body is `{ title, brief }` only — platform is NOT in the contract body; record it client-side and seed via a later `patch`/platform op, OR file OQ4). **「创建后进入工作区」 checkbox, 「取消」, 「关闭 X」, Overlay backdrop, 「创作模式」 badge** [`wired-local`/decorative] — leave; the badge is **intentionally inert**.

### `/projects` list page (roadmap §4 "Projects")
- [ ] **5.3** **7 status tabs** [`needs-backend`] → re-query `client.listProjects` with a status filter param and `router.refresh()`. File: `frontend/src/features/projects/status-tabs-bar.tsx`. NOTE: contract `listProjects.query` is `paginationQuery` only (no status filter) — filter client-side over the fetched list for now, OR file OQ4 to extend the query schema. Mark as **client-side filter** until the query param lands.
- [ ] **5.4** **「排序」 SortSelect** [`needs-backend`] → same: client-side re-sort over the list (contract query has no sort key). File: `view-and-sort-controls.tsx`. **「网格视图」/「列表视图」 toggles** [`wired-local`] — leave (layout, not persisted).
- [ ] **5.5** **「打开」 (per row)** [`wired-local`] — already a `<Link>` to the workspace; leave. **「⋯ more」 (per row)** [decorative] → wire to `client.patchProject` (rename/star) only if a menu exists; otherwise mark **intentionally inert** (no menu rendered). **Pagination prev/numbers/next, 「筛选」 (TopHeader)** [decorative] — **intentionally inert** (no handler/href in the design); leave + note.
- [ ] **5.6** **「全部标记为已读」** [`needs-backend`] and the **「通知」 bell** [`wired-local`] belong to **Notifications** (Wave 1), not this module — do NOT wire here.
- [ ] **5.7** **「搜索项目」 (header search)** [`wired-local`] → navigates to `/search` (Search module); leave.

### `/projects/:id` overview (roadmap §4 "Project Overview")
- [ ] **5.8** **「进入工作台」** [`wired-local`] — `<Link>` into the workspace at `current_stage`; leave. **「编辑信息」** [decorative] → wire to `client.patchProject({ body: { title?, brief? } })` if an edit affordance is built; else **intentionally inert**. **「收藏」** [decorative] → `client.patchProject({ body: { starred: true|false } })` (toggle) + `router.refresh()`. **「更多」** menu [decorative] → archive item → `client.archiveProject` (transition `active/completed→archived` per Task 3.5). **「分享」** [decorative] → **intentionally inert — spec gap** (no §13 endpoint; roadmap §6 "Share" gap).

### Shell stepper + primary action (roadmap §4 "Shell")
- [ ] **5.9** **「进入工作台」 / 「进入下一步」** [`wired-local` today — navigates only] → ADD a real `client.transitionProjectStage({ params: { projectId, stage }, body: { reason? } })` call before/with navigation (transition `in_progress→completed`; next `not_started→in_progress`). File: the shell primary-action island. `router.refresh()` to update the stepper. **Six-stage stepper** [decorative] — display only (not clickable); leave + note **intentionally inert**.
- [ ] **5.10** **「完成制作」/「查看数据」/「导出报告」** (terminal-stage) [decorative] belong to Production/Analytics (Wave 3); **intentionally inert** here.

### Dashboard continue/todo rows (roadmap §4 "Dashboard") — these read Projects ops
- [ ] **5.11** **「继续创作」 row** [decorative] → could read `GET /projects/:id/overview` (Wave-4 query service) — leave **intentionally inert** here; **「待办事项」 row (×4)** [decorative] → `client.listTasks` / `client.patchTask` to open/complete — wire only if a task island exists on the dashboard; else mark inert + note Dashboard owns the page-DTO read (Wave 4). The **「新项目」 entry Link** is the same `/projects/new` flow as 5.1.

---

## Task 6 — tests (MODULE-ARCH §2: three test files)

- [ ] **6.1** `projects.service.test.ts` — Task 3 RED cases (createProject UoW seeds 6 stages + platforms + activity; Stage machine valid+invalid incl. skip-needs-reason; Project archive read-only; ContentOutput create seeds 4 stages; Task machine `→done` stamps `completed_at`). Use in-memory `createDb` + deterministic clock/ids.
- [ ] **6.2** `projects.repository.integration.test.ts` — pglite-backed: Task 1 round-trip + Task 2 **multi-tenant ownership** (user A cannot read/list/transition user B's project, output, task, or activity → `OwnershipError`). This is the foundation §9 multi-tenant smoke for this module.
- [ ] **6.3** `projects.contract.test.ts` — Task 4: all 15 op envelopes validate against their contract response DTO (per-item for `isList`).
- [ ] **6.4** FE: extend `frontend/src/features/projects/new-project-form.test.tsx` + `projects-page.test.tsx` for the wired create/tab/sort behavior using the `viewModel?`/mock seam; assert `client.createProject` is invoked and `router.refresh` called on success.

---

## Task 7 — acceptance (SPEC §22 + foundation §5 step 6)

- [ ] **7.1** Module has `service` + `repository` + `schema` + `types` + 3 test files under `src/server/modules/projects/`; `index.ts` is the only public entry (repository NOT exported from `index.ts`).
- [ ] **7.2** No cross-module repository import (grep: no `import` from `modules/*/(.*)repository` outside `projects/`). Other modules consuming Projects (Knowledge/Assets/Artifacts) import only `modules/projects/index.ts`.
- [ ] **7.3** The `/api/v1/dispatch` route touches **no** db client/repository directly — only `compositeTransport` (already true; keep it true).
- [ ] **7.4** Project six stages + ContentOutput independent four stages (`script/production/publishing/review`) modeled and enforced (SPEC §22 line 674; data-model rule 5).
- [ ] **7.5** Every repository query is user-scoped; the multi-tenant smoke (6.2) is green; cross-user access surfaces as 404 (OwnershipError → `/not found/` 400→ map to 404 in the route's error mapping, SPEC §11).
- [ ] **7.6** `pnpm verify` (frontend: lint/tsc/tests/build) GREEN + the 3 module tests GREEN. No `viewModel?` seam regressions; seeded fixtures still render deterministically off `FIXED_NOW_ISO`.

---

## Open questions (decide before/early in execution)

1. **ContentOutput status enum mismatch.** Contract `contentOutputResource.status` = `["drafting","recording","editing","ready","published"]`; SPEC §12 machine = `draft→active→ready→published→retired (active→cancelled)`. The service must map §12 internal states onto the DTO enum (e.g. `active`→`drafting`/`recording`/`editing` by output-stage, `retired`/`cancelled`→no DTO value). Confirm the mapping or amend the contract before Task 3.6.
2. **Project archive source state.** SPEC §12 allows `completed→archived` only, but today's slice + roadmap §4 「更多」 archive from `active`. Confirm whether `archiveProject` is allowed from `active` (convenience) or must go through `completed`. Affects Task 3.5.
3. **Registry vs hardcoded `PERSISTED_OPS`.** Task 4.4 assumes Wave 0 delivered the module transport registry (foundation §1). If it didn't land, the bridge is extending the 7-id Set in `persistence-client.ts` to the 15 ids — confirm which, so the composite-transport edit is determinate.
4. **Contract gaps for list filter/sort + target platforms.** `listProjects.query` is `paginationQuery` only (no status/sort), and `createProject.body` is `{ title, brief }` (no `targetPlatforms`/`contentType`/`creationMode`). The status-tab/sort wiring (5.3/5.4) and platform seeding (5.2) are therefore client-side-only until the contract is extended. Decide: extend the contract (re-run 15a traceability) or keep client-side. Until then those buttons are wired but non-persistent for the filter dimension.
