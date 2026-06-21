# Module 14 — Learnings (TDD execution plan)

> **Wave 3.** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §3 AI seam). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Learnings** vertical end-to-end — reusable `Learning` (strategy / hook / structure / failure / process insight, `confidenceScore` int, `validationStatus` machine) plus `LearningApplication` (a Learning applied to a Project, with an outcome) — so every `needs-backend` / `wired-local` button on the Experience Center (`/experience`) and the Learnings-fed Dashboard surfaces drives a real, user-scoped contract op (FE button → contract op → user-scoped SQL → envelope → render). A `Learning` is reusable **across projects** and exists independently of any Project (SPEC §22: "Knowledge、Asset、Learning 可脱离 Project 存在并被复用") — it is owned by the user, optionally sourced from a Review (`reviewId` nullable), and applied to many projects via `LearningApplication`.

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/learnings/` and registers its `{ opId → handler }` map into the composite transport registry. Owns two entities — `Learning` and `LearningApplication` (data-model lines 386-409). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. `LearningApplication` has no `userId` of its own in the data-model ER diagram — it is scoped transitively through its parent `Learning` (every application query joins/filters on a parent `Learning` row already constrained to `ctx.userId`; the insert additionally stamps a denormalized `user_id` for direct ownership filtering, see Step 1). No cross-module repository imports — the Reviews→Learnings promotion and the Project-application read happen through other modules' public `index.ts` service interfaces.

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract`, Vitest. ISO-8601 text timestamps + text enums to mirror the Projects slice (`backend/src/schema/projects.ts`); JSON (`outcome`) as `jsonb`.

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth `RequestContext` + ctx-threading dispatch route) → Wave 2 **Projects** (`LearningApplication.projectId` must resolve to an owned Project; `ProjectsService.recordActivity` for the application-recorded activity) → Wave 3 **Reviews** (the `reviewId` source + the Reviews→Learnings promotion bridge), **Search** + **Taxonomy** (indexing/tagging a new Learning). Roadmap §4 gate is **G14** (deps G13 Reviews, G5 Projects, G4 Search/Taxonomy). Parallel with AI (G15). Consumed by Wave 4 `DashboardQueryService` via `LearningsService.getSuggestions` (foundation §7 / SPEC §19) — that composition is Wave 4, not this plan.

---

## Contract ops this module owns (grepped from `contract/src/operations/learnings.ts`)

| op id | method · path | body | response DTO |
|---|---|---|---|
| `learnings.list` | GET `/learnings` | query `paginationQuery` | `learningResource` (isList) |
| `learnings.create` | POST `/learnings` | `{ title: string(min 1), insight: string (default "") }` | `learningResource` |
| `learnings.applications.create` | POST `/learnings/:learningId/applications` | `{ projectId: id, applicationNote: string (default "") }` | `learningApplicationResource` |
| `learnings.evaluate` | POST `/learnings/:learningId/evaluate` | `{ validationStatus?: "candidate" \| "validated" \| "discarded" }` | `learningResource` |

DTO field shapes are fixed by `contract/src/resources/learnings.ts` — do NOT redefine; import and validate against them. Enums (source of truth = contract resource):
- `learningType`: `strategy | hook | structure | failure | process`
- `validationStatus`: `candidate | validated | discarded`

`learningResource` fields (contract): `id, userId, reviewId(nullable), learningType, title, insight, recommendation, validationStatus, confidenceScore(int), createdAt, updatedAt`.
`learningApplicationResource` fields (contract, **no Timestamped**): `id, learningId, projectId, contentOutputId(nullable), applicationNote, outcome(record), appliedAt, evaluatedAt(nullable)`.

**State machine (SPEC §12 + contract `validationStatus` enum).** SPEC §12 has no explicit Learning diagram (the listed machines are Project / Stage / ContentOutput / Publication / AI Task); the authoritative Learning machine is the contract `validationStatus` enum, cross-checked against roadmap §4 line 396 (`hypothesis→validated|rejected→deprecated`). Reconcile to the **contract enum names** (which the DTO enforces) with `candidate` as the source state:

```text
candidate → validated      (evaluate, validationStatus: "validated")
candidate → discarded      (evaluate, validationStatus: "discarded")
validated → discarded      (deprecate a previously-validated learning)
```

- A Learning is born `candidate` on `learnings.create` (and on Reviews→Learnings promotion).
- `discarded` is terminal (no transition out → `ConflictError`).
- `validated → candidate` (re-open) is **not** allowed → `ConflictError`.
- `learnings.evaluate` with no `validationStatus` in body = a no-op re-evaluation (recompute `confidenceScore` only, see Step 3) — the status guard is skipped.

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/learnings/
├── learnings.db-schema.ts
├── learnings.repository.ts
├── learnings.service.ts
├── learnings.schema.ts
├── learnings.transport.ts
├── learnings.errors.ts
├── index.ts
├── learnings.service.test.ts
├── learnings.repository.integration.test.ts
└── learnings.contract.test.ts
```

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/learnings/learnings.db-schema.ts`. Define two `pgTable`s mirroring `docs/CreatorOS-data-model.md` lines 386-409, following the Projects schema conventions exactly (`backend/src/schema/projects.ts`): timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `LEARNINGS_DDL` string for pglite init. `user_id TEXT NOT NULL` on every owned row (foundation §1/§3).
  - `learnings`: `id` PK (text), `userId` notNull, `reviewId` (text, **nullable** — a Learning can exist without a Review per SPEC §22 reuse rule), `learningType` text notNull (one of the 5 enum values; default `"strategy"` since `learnings.create` body has no type — see Step 3 derivation), `title` text notNull, `insight` text notNull (default `""`), `recommendation` text notNull (default `""`), `validationStatus` text notNull (default `"candidate"`), `confidenceScore` integer notNull (default `0`), `createdAt` text notNull, `updatedAt` text notNull.
  - `learningApplications`: `id` PK (text), `userId` text notNull (denormalized ownership column — NOT in the data-model ER diagram; required by foundation §1 so application queries filter `eq(table.userId, ctx.userId)` without a parent join), `learningId` text notNull, `projectId` text notNull, `contentOutputId` text **nullable**, `applicationNote` text notNull (default `""`), `outcome` jsonb notNull (default `{}`), `appliedAt` text notNull, `evaluatedAt` text **nullable**.
  - Add an index on `learnings (user_id, validation_status)` (backs the list-by-status / `getSuggestions` read) and on `learningApplications (user_id, learning_id)` (backs per-learning reuse count).
- [ ] Append `LEARNINGS_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep for `PROJECTS_DDL` usage in the shared init list; register `LEARNINGS_DDL` in the same `CREATE TABLE IF NOT EXISTS` init).
- [ ] **Test (in `learnings.repository.integration.test.ts`, first red):** a row inserted into each table round-trips via `db.select()` with all columns intact — `learnings` defaults (`learningType "strategy"`, `validationStatus "candidate"`, `confidenceScore 0`, `insight`/`recommendation` `""`); `learningApplications` defaults (`outcome {}`, `contentOutputId null`, `evaluatedAt null`).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/learnings/learnings.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createLearningsRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. A private `getLearningRowById(learningId)` throws `OwnershipError` (message `OwnershipError: learning not found: <id>`) when the scoped select returns empty — never reveal cross-user existence (foundation §2: 404 not 403).
  - `listLearnings({ limit, offset }): Promise<{ rows: LearningRow[]; total: number }>` — `where(eq(learnings.userId, deps.userId))`, `orderBy(desc(learnings.updatedAt))`, `limit`/`offset` from `paginationQuery`; `total` is a scoped `count()`. (Backs `learnings.list`; the §4 category tabs are applied **client-side** — see Step 5 — so list is NOT filtered by type here.)
  - `createLearning({ title, insight, learningType, recommendation, reviewId, confidenceScore }): Promise<LearningRow>` — insert `{ id: nextId("learning"), userId, reviewId: reviewId ?? null, learningType, title, insight, recommendation, validationStatus: "candidate", confidenceScore, createdAt: now(), updatedAt: now() }`; return row.
  - `updateLearningStatus(learningId, { validationStatus, confidenceScore }): Promise<LearningRow>` — scoped `get` first (ownership), then scoped `update … set { validationStatus, confidenceScore, updatedAt: now() } where eq(id) and eq(userId)`; return row. (The status-machine guard lives in the service — repository only executes service-approved updates, SPEC §12.)
  - `createApplication(learningId, { projectId, applicationNote }): Promise<LearningApplicationRow>` — scoped ownership check on the parent `learning` via `getLearningRowById`, then insert `{ id: nextId("learning-app"), userId, learningId, projectId, contentOutputId: null, applicationNote, outcome: {}, appliedAt: now(), evaluatedAt: null }`; return row.
  - `countApplications(learningId): Promise<number>` — scoped `count()` over `learningApplications` where `eq(userId, deps.userId) and eq(learningId, learningId)`. (Backs the `confidenceScore` recompute in Step 3 and the reuse-count read.)
- [ ] **Tests (`learnings.repository.integration.test.ts`, pglite-backed):**
  - ownership: build repo with `userId: "user-a"`, `createLearning`; build a second repo with `userId: "user-b"`; `getLearningRowById` for user-A's id from repo-B throws `OwnershipError`, and repo-B `listLearnings` returns `total: 0` (user A's row invisible to B).
  - `createApplication` against a learning owned by another user throws `OwnershipError` (cross-user apply blocked — the parent ownership check fires before insert).
  - `listLearnings` returns `desc(updatedAt)` order and honors `limit`/`offset` (insert 3, request `limit:2,offset:1` → middle row).
  - `countApplications` returns the per-learning scoped count (two apps on learning X, zero on learning Y).

## Step 3 — service (RequestContext + §12 state machine)

- [ ] Create `frontend/src/server/modules/learnings/learnings.errors.ts`: re-use the foundation shared error types (`OwnershipError`, `ConflictError`, `UnsupportedOperationError`) — import from shared infra; do not redefine if they already exist there.
- [ ] Create `frontend/src/server/modules/learnings/learnings.service.ts`. Every public method takes `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId` (`createLearningsRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. Methods:
  - `listLearnings(ctx, { limit, offset })` → `repo.listLearnings(...)`; map each row → `learningResource` DTO (Step 4 mapper); return the list + `total` for list meta. Backs `learnings.list`.
  - `createLearning(ctx, { title, insight })` — the contract body has only `title` + `insight`. Fill the non-input DTO fields deterministically: `learningType: "strategy"` (default; richer typing comes from the Reviews bridge or a later type-select — note as open question), `recommendation: ""`, `reviewId: null`, `confidenceScore: 0`, `validationStatus: "candidate"`. `repo.createLearning(...)`; return DTO. Backs `learnings.create` and the §4 `快速记录` quick-record button (`Learning none→candidate`).
  - `promoteReviewInsight(ctx, { reviewId, insightTitle, insightBody, learningType, recommendation })` — the Reviews→Learnings bridge (roadmap §4 G13 "confirmed insight → Learnings bridge" / G14 "promoteReviewInsight"). Called by `ReviewsService` **via this module's `index.ts` public interface only** (no Reviews repo import here, no Learnings repo import there). `repo.createLearning({ reviewId, title: insightTitle, insight: insightBody, learningType, recommendation, confidenceScore: 0 })`; return DTO. (Wired by Reviews this same wave; the op surface here is the service method, not a new contract op.)
  - `applyLearning(ctx, learningId, { projectId, applicationNote })` — verify the target project is owned by `ctx.userId` via `ProjectsService.assertOwnsProject(ctx, projectId)` (public service interface, no repo import); on cross-user project → propagate `OwnershipError`. Then `repo.createApplication(learningId, { projectId, applicationNote })`. Record activity through `ProjectsService.recordActivity(ctx, { projectId, type: "learning_applied", refId: learningId })` (public interface). Return `learningApplicationResource` DTO. Backs `learnings.applications.create`.
  - `evaluateLearning(ctx, learningId, { validationStatus })` — load the current learning via `repo.getLearningRowById(learningId)` (ownership). Enforce the **validationStatus machine** (see header): allowed transitions are `candidate→validated`, `candidate→discarded`, `validated→discarded`; same-state and any other transition (e.g. `discarded→*`, `validated→candidate`) → `ConflictError`. If `validationStatus` is omitted, skip the status guard and keep the current status. **Recompute `confidenceScore`** deterministically (Learning is "validated by reuse"): `confidenceScore = min(100, applicationCount * 20 + (nextStatus === "validated" ? 40 : 0))` where `applicationCount = repo.countApplications(learningId)` — a pure, testable formula (int per the module note; NO `Math.random`, NO `Date.now` beyond the injected `now`). `repo.updateLearningStatus(learningId, { validationStatus: nextStatus, confidenceScore })`; return DTO. Backs `learnings.evaluate`.
  - `getSuggestions(ctx, { limit })` — for the Wave-4 `DashboardQueryService` (foundation §7): scoped `repo.listLearnings` filtered to `validationStatus === "validated"`, sorted by `confidenceScore desc`, capped at `limit` (default 3); return `learningResource[]`. (Defined here so Wave 4 composes it; no contract op — it is a public service method consumed only by the query service.)
- [ ] **Tests (`learnings.service.test.ts`, fake `now`/`nextId`, pglite db, stubbed `ProjectsService`):**
  - `createLearning` yields a `candidate` learning with `learningType "strategy"`, `confidenceScore 0`, `recommendation ""`, `reviewId null`.
  - status machine valid: `candidate → validated` succeeds and bumps `confidenceScore` (with 0 apps → `40`; with 2 apps → `min(100, 2*20+40)=80`); `candidate → discarded` succeeds; `validated → discarded` succeeds.
  - status machine invalid: `discarded → validated` throws `ConflictError`; `validated → candidate` throws `ConflictError`; same-state `candidate → candidate` throws `ConflictError`.
  - `evaluate` with omitted `validationStatus` keeps status, recomputes `confidenceScore` from app count only (2 apps → `40`), no `ConflictError`.
  - `applyLearning` cross-user project: stubbed `ProjectsService.assertOwnsProject` throws `OwnershipError` → `applyLearning` propagates it and inserts **no** application row.
  - `applyLearning` happy path: stubbed `ProjectsService.assertOwnsProject` + `recordActivity` each called once with `ctx`; returns an application DTO with `outcome {}`, `evaluatedAt null`.
  - `getSuggestions` returns only `validated` learnings, `confidenceScore desc`, length ≤ `limit`.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/learnings/learnings.schema.ts`: re-export the contract DTOs/enums used (`learningResource`, `learningApplicationResource`, `learningsOperations`, `learningType`, `validationStatus`) — single import surface for this module.
- [ ] Create `frontend/src/server/modules/learnings/learnings.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2: transport signature gains `ctx`). Export `createLearningsTransport(service)` returning `{ request(ctx, endpoint, input) }` with a `switch (endpoint.id)`:
  - `"learnings.list"` → `service.listLearnings(ctx, { limit: query.limit, offset: query.offset })`, list `meta` with `total`.
  - `"learnings.create"` → `service.createLearning(ctx, body)`, single `meta`.
  - `"learnings.applications.create"` → `service.applyLearning(ctx, params.learningId, body)`, single `meta`.
  - `"learnings.evaluate"` → `service.evaluateLearning(ctx, params.learningId, body)`, single `meta`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/learnings/index.ts` exporting the public service interface (incl. `promoteReviewInsight` + `getSuggestions` for cross-module/Wave-4 consumers) + the op-id list `["learnings.list","learnings.create","learnings.applications.create","learnings.evaluate"]` and a `registerLearnings(registry)` that adds the transport map. Register this module in the composite transport registry (foundation §1: the union builds `PERSISTED_OPS` — no edit to the composite switch).
- [ ] **Tests (`learnings.contract.test.ts`):** for EACH of the four op ids, drive the transport with a seeded ctx + valid input and assert the response validates against the contract DTO:
  - `learnings.list` → `learningsOperations.listLearnings.response.parse(item)` succeeds for each item in `envelope.data`.
  - `learnings.create` → `learningsOperations.createLearning.response.parse(envelope.data)` succeeds (status `"candidate"`).
  - `learnings.applications.create` → `learningsOperations.createLearningApplication.response.parse(envelope.data)` succeeds (`evaluatedAt null`).
  - `learnings.evaluate` → `learningsOperations.evaluateLearning.response.parse(envelope.data)` succeeds with `validationStatus "validated"` and `confidenceScore` an int.

## Step 5 — FE island wiring (from roadmap §4 `/experience` + Dashboard rows)

Server reads switch from fixture to the real op while preserving the `viewModel?` seam in `frontend/src/features/experience/experience-page.tsx` (the page stays a Server Component; it gains an interactive client island for the wired buttons). The §4 inventory for `/experience` is **wired-local 7 · decorative 0 · needs-backend 3 (n quick actions)**, plus the Dashboard `创作建议` row (Learnings-fed but routed through AI per §4). Each row below is wired exactly per §4:

| §4 label (page) | §4 state | wiring |
|---|---|---|
| `7 category tabs (全部/选题/脚本/拍摄/剪辑/运营/复盘)` (`/experience`) | **wired-local** | Tabs filter the rendered list **client-side only** (§4: "Filter learnings (visual only)"). Read source is `learnings.list` (server). The 7 tab ids are `all/topic/script/shoot/edit/engage/review` (from `experience.ts DEFAULT_TABS`); they are creator-stage labels, NOT the contract `learningType` enum — filter on a derived display category, not the raw enum (mapping = open question). No network call on tab switch. |
| `快速记录 action buttons (×N)` (`/experience`, `QuickRecordActions`) | **needs-backend** | Each quick-record button → `learnings.create` `{ title: <action.label>, insight: "" }` via the HttpTransport, then `router.refresh()`. Transition: `Learning none→candidate`. Replaces the current inert `<button>` in `QuickRecordActions` (today it renders a `+` glyph with no handler). |
| `应用经验` (apply affordance, §4 Gap "build apply") (`/experience`) | **needs-backend (new affordance)** | Per roadmap §4 G14 "build apply + evaluate affordances" — the page-spec marks NO existing UI; add a minimal apply control on each record/popular-experience row → `learnings.applications.create` `{ projectId: <selected owned project>, applicationNote: "" }` + `router.refresh()`. Project picker is sourced from `projects.list` (Projects module). |
| `验证/废弃` (evaluate affordance, §4 Gap "build evaluate") (`/experience`) | **needs-backend (new affordance)** | Per §4 G14 — add an evaluate control on each candidate record → `learnings.evaluate` `{ validationStatus: "validated" }` (验证) or `{ validationStatus: "discarded" }` (废弃) + `router.refresh()`. Drives `candidate→validated`/`candidate→discarded`. |
| `创作建议 row` (Dashboard `/`) | **decorative** | Per §4 the Dashboard `创作建议` row targets `POST /ai/tasks` (AI module), NOT a Learnings op — **leave inert for the Learnings wave (intentionally inert here)**. The Learnings contribution to the Dashboard is the data feed via `LearningsService.getSuggestions`, composed by the Wave-4 `DashboardQueryService` (not a button). |
| `开始对话 / 新项目` (Dashboard `/`) | wired-local (other modules) | AI / Projects ops — **not owned by Learnings**, no change here. |

- [ ] Create/extend the experience interactive island (`frontend/src/features/experience/experience-interactive-region.tsx` if absent, else extend `experience-page.tsx`'s `QuickRecordActions`/`RecentRecordsTable`/`PopularExperienceList` into `"use client"` islands that receive the wired props). Add `experience-interactions.test.tsx`: assert each quick-record button issues `learnings.create` via the HttpTransport mock; the apply control issues `learnings.applications.create`; 验证/废弃 issue `learnings.evaluate` with the correct `validationStatus`; and tab switching issues **no** network call (client-side filter only).

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `learnings.service.test.ts` (validationStatus machine valid+invalid, `confidenceScore` recompute formula, cross-user apply guard, `getSuggestions`), `learnings.repository.integration.test.ts` (pglite, ownership user-A-vs-user-B, cross-user apply blocked, pagination order, `countApplications`), `learnings.contract.test.ts` (each of the 4 ops validates against its contract DTO).
- [ ] **Acceptance checklist (SPEC §22):** module ships service + repository + schema + tests; **no cross-module repository import** (Projects/Reviews access only via `index.ts` service interfaces; the Reviews→Learnings promotion is a Learnings public method called from Reviews); the dispatch route does not touch the db client (it threads `ctx` into `compositeTransport.request`); a `Learning` is reusable and exists independently of a Project (`reviewId` nullable, applied to many projects via `LearningApplication`); AI candidate-confirm rule is N/A here (no AI op in this module — the Dashboard `创作建议` AI surface is the AI module's responsibility); idempotency rule is N/A (no Publication/metrics op).
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. **Tab-to-type mapping.** The `/experience` 7 tabs (`all/topic/script/shoot/edit/engage/review`, creator-stage labels) do NOT line up 1:1 with the contract `learningType` enum (`strategy/hook/structure/failure/process`). The client-side filter (Step 5) needs a deterministic display-category derived from `learningType` (e.g. `structure→脚本`, `failure→复盘`, `hook→选题`) — confirm the exact mapping table at execution, or render an explicit `displayCategory` from the DTO. Recommend: a fixed lookup `learningType → tabId` in the selector.
2. **`learningType` on `learnings.create`.** The contract body has only `{ title, insight }` — no type. Step 3 defaults `"strategy"`. Confirm whether the quick-record buttons should carry the type (e.g. a `data-learning-type` per action) so created learnings land in the right tab, or whether typing is exclusively a Reviews-promotion / later-edit concern. Recommend: default `"strategy"` now; type-select is a stage-N FE enhancement.
3. **`confidenceScore` formula.** SPEC gives no formula; this plan uses `min(100, applicationCount*20 + (validated?40:0))` (deterministic, int, reuse-driven). Confirm the desired ceiling/weights at execution, or whether `confidenceScore` should instead be supplied by the AI/Reviews promotion. Recommend: keep the deterministic formula as the source-of-truth until an AI signal exists.
4. **`validationStatus` reconciliation.** Roadmap §4 line 396 names `hypothesis→validated|rejected→deprecated`; the contract enum is `candidate|validated|discarded`. This plan uses the **contract** names (DTO-enforced) with `candidate`≈hypothesis, `discarded`≈rejected/deprecated. Confirm no separate `deprecated` state is required beyond `discarded`.
