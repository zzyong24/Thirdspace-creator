# Module 17 — Positioning (七步 ①② · Wave 5) — Executable TDD Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` + `superpowers:executing-plans`. Steps use `- [ ]`; each is RED→GREEN, do not batch. This plan follows the **keystone** conventions in `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture: modules under `frontend/src/server/modules/<module>/`, user-scoped repos, transport registry, `globalThis` pglite singleton; §5 per-module template). It implements §3 of `docs/CreatorOS-七步整合设计.md` and is bound by that spec's **hard constraints C-1…C-6** (§1). Do NOT deviate from the file paths or op ids below — they are grepped, not guessed.

**Goal:** Add the account-level **positioning** module — the upstream constraint source for downstream 选题/评分/变现. Persist **`CreatorProfile`** (七步① 账号自我认知) and **`PositioningStatement`** (七步② 定位陈述，**不可变版本链**, ArtifactVersion-style), expose **`PositioningGate`** as a value-object service (given a Candidate/Project → `positioning_fit` 0–100 + 理由, AI-free deterministic scorer at this wave), add `Project.positioning_statement_id` FK, and wire the new global **「定位中心」** page (Sidebar 第 2 项, 排在「项目」前) plus a 「定位契合度」 Badge injected into New-Project / Research / Planning / Review surfaces. End state: every `needs-backend` button on `/positioning` is wired FE-island → contract op → user-scoped SQL → `router.refresh()` render; the gate scores deterministically; the version chain is append-only.

**Architecture:** Modular monolith inside the one Next app (SPEC §22). Module code lives under `frontend/src/server/modules/positioning/` (foundation §1 layout). `@creatoros/backend` remains shared infra (pglite/Drizzle `createDb`, `RequestContext`, module transport registry, `UnsupportedOperationError`). The module exports `{ opId → (ctx, input) => envelope }` into the composite registry; `PERSISTED_OPS` gains the new ids via the union — **no edit to the composite body** (foundation §1: "Adding a module = register it"). Every repository query is user-scoped: `eq(table.userId, ctx.userId)` (foundation §1, SPEC §10/§20); cross-user/missing → `OwnershipError` → 404. The **immutability invariant** (no UPDATE/DELETE of a `positioning_statements` row; a new "version" is a new row with `version_number = prev+1`) lives in the **service**, mirroring Artifacts' `ArtifactVersion` rule (data-model §rules 6–7; module-08/15 precedent). `PositioningGate` is a pure scoring function in the service layer (no table) — deterministic, **no `Date.now`/`Math.random`/`fetch`** (C-5).

**Tech stack:** TypeScript strict · Drizzle ORM over `@electric-sql/pglite` (`globalThis` singleton) · Zod DTOs from `@creatoros/contract` (the new positioning resources land in **contract v0.4** — see "Contract dependency" below) · Vitest (service unit, repository pglite-integration, contract-conformance) · Next.js App Router (server components read via `client.*`; client islands mutate via `HttpTransport` → `/api/v1/dispatch` → `compositeTransport` then `router.refresh()`). Timestamps stored as ISO-8601 `text`; enums as `text`, validated by Zod on output — same conventions as the proven Projects slice.

**Dependency note (must be GREEN first):**
- **Wave 0** (registry generalization + Identity/auth giving real `RequestContext.userId` + mock adapters) — gates everything.
- **Wave 2 Projects** — this module ADDs `Project.positioning_statement_id` (a column on the `projects` table owned by module-05) and injects the fit Badge into New-Project; it imports `modules/projects/index.ts` only (never its repository). The column add is an intentional cross-module schema touch coordinated with Projects (precedent: Ingestion adding `user_id` to its rows; module-05 OQ4 for projects-table extensions).
- **P0 product/rubric** — per spec §8, positioning is **P1**, sequenced AFTER the P0 `monetization` (`Product`/`Offer`) and `calibration` (`Rubric`) modules so `PositioningStatement.product_anchor_ids[]` references real `Product` ids and the gate can later read rubric dimensions. At this wave the gate is a **self-contained deterministic scorer** (keyword/role overlap); the rubric-weighted upgrade is deferred (OQ3). `product_anchor_ids` are validated as ids but cross-module existence-check against `monetization` is **soft** (accept-and-store) until monetization lands.
- This is a **new module** appended after the base 16 (foundation roster) as Wave 5 per spec §1 ("6 个新模块作为 Wave 5-7"). It does NOT block any base module.

---

## Contract dependency (these ops are ADDED in contract v0.4 — not present in v0.1)

`grep` of `contract/src/operations/*` (v0.1.0) confirms **no positioning op, resource, or `positioning_fit`/`product_anchor` symbol exists yet**. Before Task 4, the contract package must publish v0.4 adding `contract/src/operations/positioning.ts`, `contract/src/resources/positioning.ts`, and the `...positioningOperations` spread into `ENDPOINTS` (`contract/src/endpoints.ts:70`), plus a `pages.positioning.get` op in `operations/pages.ts` (mirrors `pages.dashboard.get` / `pages.search.get`). Per **C-1**, the new `FR/ENT/API` ids are assigned only AFTER OPEN-001 ID-baseline freeze and appended as a NEW segment (placeholders `FR-2xx`/`ENT-1xx`/`API-positioning.*` until signed). **This plan assumes contract v0.4 is published**; if it is not, STOP and land the contract change first (do not invent DTOs in the module — the contract is the single source of truth that `*.contract.test.ts` validates against).

### Ops this module OWNS (contract v0.4 "定位" group)

| op id | method · path | params/body | response DTO | repo/service method |
|---|---|---|---|---|
| `positioning.profile.get` | GET `/positioning/profile` | — | `creatorProfileResource` (nullable / 404 if none) | `repo.getProfile(ctx)` |
| `positioning.profile.upsert` | POST `/positioning/profile` | body `{ persona, field, audience, differentiation, capabilities[] }` | `creatorProfileResource` | `service.upsertProfile` |
| `positioning.statements.list` | GET `/positioning/statements` | query `paginationQuery` | `positioningStatementResource` (isList, version-desc) | `repo.listStatements(ctx)` |
| `positioning.statements.create` | POST `/positioning/statements` | body `{ oneLiner, keywords[3], productAnchorIds[] }` | `positioningStatementResource` | `service.createStatementVersion` (append-only, `version_number = max+1`) |
| `positioning.statements.get` | GET `/positioning/statements/:statementId` | params `{ statementId }` | `positioningStatementResource` | `repo.getStatement(ctx, id)` |
| `positioning.gate.evaluate` | POST `/positioning/gate/evaluate` | body `{ subjectType: "candidate"\|"project", subjectId, statementId? }` | `positioningGateResultResource` `{ positioningFit:int 0–100, reasons:string[], statementId }` | `service.evaluateGate` (pure scorer, AI-free) |
| `pages.positioning.get` | GET `/positioning/center` | — | `positioningCenterResource` (page-composition DTO) | **Wave-5 page-query (this module)** — current statement + keywords + product anchors + version history |

> 7 ops total. `pages.positioning.get` lives in `operations/pages.ts` but is **owned and implemented here** (this module has no separate Wave-4 query service; the 定位中心 page DTO is small and account-scoped). Resource DTOs in `contract/src/resources/positioning.ts`: `creatorProfileResource`, `positioningStatementResource`, `positioningGateResultResource`, `positioningCenterResource`.

**Hard-constraint check for this op set:**
- **C-2** — every op above goes contract-op → `/api/v1/dispatch` → service → Drizzle/pglite → envelope. No frontend-fixtures-only path. All 7 ids enter `PERSISTED_OPS` via the registry union.
- **C-3** — this module owns **no candidate state machine**. When a `PositioningStatement` revision is **AI-suggested** (定位演进回流, §3.3: `ReviewInsight` 触发"建议修正定位"), the suggestion is an `AITask` with `taskType: positioning_revise` that flows through the AI module's `submit_candidate → awaiting_confirmation → confirmResult` (module-15). `confirmResult` for `resultType: "positioning_statement"` calls **`PositioningService.createStatementVersion(ctx, …, { createdByType: "ai", aiTaskId })`** (the AI-free formalize path) — exactly as `artifact_version` does today. There is NO `positioning.suggest`/`positioning.confirm` op here; do not build one (see Task 3.6 + OQ2). Human-authored statements use `positioning.statements.create` directly.
- **C-4** — positioning has no metric回收 of its own; the "calibration metric回收" reuse clause binds the `calibration` module. Positioning only **reads** the outcome: a `ReviewInsight`/`CalibrationResult` (produced via Ingestion `ExternalSource`+idempotency in `calibration`) can be the trigger that enqueues the `positioning_revise` AITask. Positioning never opens a new ingestion write path.

---

## Target file layout (foundation §1 / MODULE-ARCH §2)

```
frontend/src/server/modules/positioning/
├── positioning.db-schema.ts                 # creator_profiles + positioning_statements pgTables + POSITIONING_DDL + projects.positioning_statement_id ALTER
├── positioning.repository.ts                # user-scoped queries ONLY: eq(table.userId, ctx.userId)
├── positioning.service.ts                   # RequestContext methods; append-only version chain; PositioningGate scorer; upsertProfile
├── positioning.schema.ts                    # re-export contract v0.4 Zod DTOs for this module
├── positioning.transport.ts                 # { opId → (ctx,input)=>envelope }; UnsupportedOperationError otherwise
├── positioning.errors.ts                    # OwnershipError, ImmutableStatementError, ProfileRequiredError, GateSubjectError
├── index.ts                                 # ONLY public entry: service interface (incl. createStatementVersion for AI confirm) + transport map
├── positioning.service.test.ts
├── positioning.repository.integration.test.ts
└── positioning.contract.test.ts
```

No cross-module repository imports (SPEC §22). The Projects module (for the `positioning_statement_id` column and the Badge subject) and the AI module (for the confirm formalize) consume only `modules/positioning/index.ts`; positioning consumes `modules/projects/index.ts` (read subject for gate) and, when present, `modules/monetization/index.ts` (product anchor existence) only via their `index.ts`.

---

## Shared infra prerequisites (foundation §1 — confirm GREEN before Task 1)

- [ ] **0.1** Confirm `@creatoros/backend` exposes `RequestContext { userId, requestId, source }` and the module transport registry (`registerModule(opMap)` + composite building `PERSISTED_OPS` from the union). If absent → STOP, Wave 0 not green.
- [ ] **0.2** Confirm `/api/v1/dispatch` derives `ctx` from the session cookie and calls `compositeTransport.request(ctx, endpoint, input)` (transport signature has `ctx`). The positioning transport map signature is `(ctx, input) => envelope`.
- [ ] **0.3** Confirm contract **v0.4** is published with the 7 ops + 4 resources above and `...positioningOperations` is spread into `ENDPOINTS`; `registry.test.ts` (§13 match) is green for the new 定位 group. If not → land the contract change first (see "Contract dependency").
- [ ] **0.4** Confirm `modules/projects/index.ts` exists and its `projects` table is the place to add `positioning_statement_id` (coordinate the column add with module-05; precedent OQ4). Confirm the seeded canonical user id matches `canonicalDataset.user.id`.

---

## Task 1 — db-schema (`positioning.db-schema.ts`)

Drizzle pgTables for the 2 owned entities (spec §3.2 + data-model conventions). `user_id` on **both** root rows (`CreatorProfile` is account-scoped; `PositioningStatement` is owned through `profile_id` but ALSO stamps `user_id` for direct scoping — same pattern Ingestion used for child rows, foundation §1/§2).

- [ ] **1.1 (RED)** In `positioning.repository.integration.test.ts`, write a round-trip test: create the tables via `POSITIONING_DDL`, insert one `creator_profiles` row and two `positioning_statements` rows (v1, v2), select them back. Assert column names/values survive (ISO text timestamps, jsonb `capabilities`/`keywords`/`product_anchor_ids`). Fails (no DDL).
- [ ] **1.2** Define `creator_profiles`: `id PK, user_id, persona TEXT default '', field TEXT default '' (领域/赛道), audience TEXT default '' (目标人群), differentiation TEXT default '' (差异化), capabilities JSONB default '[]' (能力清单), created_at, updated_at`. UNIQUE `(user_id)` — spec §3.2 "user 级单条或少量"; this wave models **one profile per user** (OQ1 if multi-profile needed). No `account_id` FK to `PlatformAccount` yet (that module is Wave 5+ §7.1; OQ1).
- [ ] **1.3** Define `positioning_statements` (**immutable version chain**, ArtifactVersion-style): `id PK, user_id, profile_id FK→creator_profiles, one_liner TEXT (我是谁+帮谁+解决什么+怎么表达), keywords JSONB (3 strings), product_anchor_ids JSONB default '[]' (Product id array), version_number INT, created_by_type TEXT default 'human' (human|ai), ai_task_id (nullable, FK soft to ai_tasks), created_at`. **No `updated_at`** (rows never update). UNIQUE `(profile_id, version_number)` (one row per version — mirrors `ArtifactVersion (artifact_id, version_number)`, data-model rule 6). Index `(user_id, profile_id, version_number DESC)` for "current = max version" reads.
- [ ] **1.4** Export `POSITIONING_DDL` = `CREATE TABLE IF NOT EXISTS` for both tables + the two indexes + **`ALTER TABLE projects ADD COLUMN IF NOT EXISTS positioning_statement_id TEXT`** (FK soft to `positioning_statements`, nullable — spec §3.3 "可空"; "项目锚定的定位版本"). Register `POSITIONING_DDL` into the shared init list `createDb` applies (foundation §1: per-module DDL). The `ALTER` runs after `PROJECTS_DDL` (ordering note in the shared init).
- [ ] **1.5** Timestamps ISO-8601 `text`; `created_by_type` enum stored as text, validated by Zod on output.
- [ ] **1.6 (GREEN)** Round-trip test passes; the v1/v2 statements come back with distinct `version_number` and the same `profile_id`.

---

## Task 2 — repository (`positioning.repository.ts`) — USER-SCOPED ONLY

Every method takes `ctx: RequestContext` first. **Every** root query filters `eq(table.userId, ctx.userId)`; inserts stamp `ctx.userId`. The repository performs **only service-approved writes** — it exposes an `insertStatement` (no `updateStatement`/`deleteStatement` exists, enforcing immutability at the data-access layer, not just the service).

- [ ] **2.1 (RED)** In `positioning.repository.integration.test.ts`, write the **multi-tenant ownership** test (foundation §5 step 2): seed profile + statements for user A and user B; assert `repo.getProfile(ctxA)` returns only A's; `repo.getStatement(ctxB, "<A's statementId>")` throws `OwnershipError`; `repo.listStatements(ctxB)` excludes A's rows. Fails first against an unscoped query.
- [ ] **2.2** Implement profile reads/writes: `getProfile(ctx)` → `where(eq(creatorProfiles.userId, ctx.userId))` (single or undefined); `insertProfile(ctx, row)` (stamps `user_id`); `updateProfileRow(ctx, set)` (re-assert ownership via `getProfile` first; profiles ARE mutable — only statements are immutable).
- [ ] **2.3** Implement statement reads: `listStatements(ctx)` → `where(eq(positioningStatements.userId, ctx.userId)).orderBy(desc(versionNumber))`; `getStatement(ctx, id)` → `where(and(eq(id, id), eq(userId, ctx.userId)))`, empty → `OwnershipError`; `getCurrentStatement(ctx, profileId)` → ownership via profile then max `version_number`; `maxVersionNumber(ctx, profileId)` → for the next-version computation.
- [ ] **2.4** Implement `insertStatement(ctx, row)` ONLY (stamps `user_id`; row already carries the service-computed `version_number`). **No update/delete method** — grep guard in 2.6.
- [ ] **2.5** Seed helpers for fixtures: `seedProfiles(rows)`, `seedStatements(rows)` (explicit `user_id` on the row, `onConflictDoNothing`). Add a `setProjectPositioningStatement(ctx, projectId, statementId)` that delegates to **`projectsService.patchProject`** (NOT a direct `projects` UPDATE — positioning must not write the projects table directly; foundation §1 no-cross-module-repo). If projects' patch doesn't accept the field yet, file the cross-module follow-up (OQ4) and gate the project-anchor wiring behind it.
- [ ] **2.6 (GREEN)** Ownership test passes; grep guard: every `from(creatorProfiles)`/`from(positioningStatements)` co-occurs with `eq(..userId, ctx.userId)`; the file contains **no** `update(positioningStatements)` / `delete(positioningStatements)`.

---

## Task 3 — service (`positioning.service.ts`) — RequestContext + immutable version chain + Gate scorer

All public methods `(ctx, command)`. Service owns the immutability invariant + the deterministic gate. It is the **only** entry other modules import (via `index.ts`), and exposes `createStatementVersion` for the AI confirm formalize (C-3).

- [ ] **3.1 (RED — upsertProfile)** In `positioning.service.test.ts`: `upsertProfile(ctx, { persona, field, audience, differentiation, capabilities })` — first call inserts (one profile per user); second call updates the same row (no duplicate, UNIQUE `(user_id)` holds). Returns the `creatorProfileResource` shape.
- [ ] **3.2** Implement `upsertProfile`: `getProfile` → if none `insertProfile` else `updateProfileRow`. Deterministic `now()`/`nextId(prefix)` injected (as the slice does).
- [ ] **3.3 (RED — append-only version chain)** Test `createStatementVersion(ctx, { oneLiner, keywords, productAnchorIds, createdByType?, aiTaskId? })`: requires a profile (`ProfileRequiredError` if `getProfile` is empty — §3 "下游约束源" needs a profile first); first statement gets `version_number: 1`; a second `createStatementVersion` gets `version_number: 2` and leaves v1 **unchanged** (re-read v1, assert byte-identical); `keywords` must be exactly 3 (guard else validation error); `createdByType` defaults `"human"`. There is **no** `updateStatement` method — assert the service exposes none (immutability, mirrors Artifacts).
- [ ] **3.4** Implement `createStatementVersion`: `requireProfile` → `version_number = maxVersionNumber(ctx, profileId) + 1` → `insertStatement`. `product_anchor_ids` accepted as id[] and stored; cross-module existence-check against `monetization` is **soft** at this wave (OQ3 — when monetization lands, add a `productsService.assertExist(ctx, ids)` guard via its `index.ts`).
- [ ] **3.5 (RED — PositioningGate, value object · AI-free deterministic)** Test `evaluateGate(ctx, { subjectType, subjectId, statementId? })` → returns `{ positioningFit: int 0–100, reasons: string[], statementId }`. Resolve the statement: explicit `statementId` (ownership-checked) else the user's current (max-version) statement; if none → `GateSubjectError`. Resolve the subject: `subjectType: "project"` → `projectsService.getProject(ctx, subjectId)` (read title/brief); `"candidate"` → the candidate (module §5, Wave 5) — until that module lands, accept a `{ title, angle, contentRole, productAnchorId }` inline payload (OQ5). Score **deterministically** from overlap signals (keyword hits in subject text, product-anchor match, content-role alignment) — a pure function, **no `Date.now`/`Math.random`/`fetch`** (C-5). Same input → same score (assert twice). `reasons[]` explains the score ("命中关键词 X/3", "锚定产品一致", "未强化主线"). Spec §3.3: gate is **advisory** — it returns a score, it does NOT mutate/block the subject.
- [ ] **3.6 (RED — AI-revision formalize boundary, C-3)** Test that the AI 定位演进回流 path formalizes through THIS service, not a parallel state machine: `createStatementVersion(ctx, { …, createdByType: "ai", aiTaskId })` produces a normal next-version row tagged `created_by_type: "ai"` + `ai_task_id`. Assert positioning exposes **no** `submitCandidate`/`confirm`/`awaiting_confirmation` symbol (grep) — that lifecycle is owned by module-15; positioning only provides the AI-free formalize callee. (Wiring the `positioning_revise` taskType + `resultType:"positioning_statement"` branch of `confirmResult` is a module-15 change referenced in OQ2, not implemented here.)
- [ ] **3.7 (RED — page DTO)** Test `getPositioningCenter(ctx)` → `positioningCenterResource`: `{ profile (nullable), currentStatement (nullable), keywords[], productAnchors[], history: statement[] (version-desc) }`. Empty-state (no profile) returns nulls + empty arrays, not an error (the 定位中心 page must render for a brand-new user).
- [ ] **3.8 (GREEN)** All service tests pass: upsert idempotent; version chain append-only & immutable; gate deterministic & advisory; AI formalize tagged correctly with no parallel candidate machine; page DTO empty-state safe.

---

## Task 4 — schema + transport (`positioning.schema.ts`, `positioning.transport.ts`) — register ops

- [ ] **4.1** `positioning.schema.ts` re-exports the 4 contract v0.4 DTOs (`creatorProfileResource`, `positioningStatementResource`, `positioningGateResultResource`, `positioningCenterResource`) + the command Zod shapes from `operations/positioning.ts` for in-service input parsing. No new schema — contract is truth.
- [ ] **4.2 (RED — contract test)** In `positioning.contract.test.ts`, for **each of the 7 op ids**, drive the transport with valid input and assert the envelope `data` validates against the op's contract response schema (`endpoint.response.parse(envelope.data)`; per-item for `isList` `statements.list`). Foundation §5 step 4.
- [ ] **4.3** Implement `positioning.transport.ts` as `{ opId → (ctx, input) => envelope }`. Map: `positioning.profile.get`→`repo.getProfile` (single, 404 if null), `positioning.profile.upsert`→`service.upsertProfile`, `positioning.statements.list`→`repo.listStatements` (list), `positioning.statements.create`→`service.createStatementVersion`, `positioning.statements.get`→`repo.getStatement`, `positioning.gate.evaluate`→`service.evaluateGate`, `pages.positioning.get`→`service.getPositioningCenter`. List ops `{ data: rows, meta: listMeta(rows.length) }`; singles `{ data, meta: singleMeta }`. Read `:statementId` from `input.params`, `body` for upsert/create/evaluate. `UnsupportedOperationError(opId)` in `default`.
- [ ] **4.4** `index.ts` exports the public service interface (incl. `createStatementVersion` + `evaluateGate` for cross-module consumers) + the transport op map; calls `registerModule(positioningTransportMap)` so `PERSISTED_OPS` gains all 7 ids via the union — **no edit to `persistence-client.ts`'s Set** (foundation §1). Repository is NOT exported from `index.ts`.
- [ ] **4.5** Seed hydration: in `buildPersistence()` (`persistence-client.ts`), pass `ctx` (canonical user) and call `seedProfiles`/`seedStatements` from `canonicalDataset` (add a canonical profile + 1–2 statement versions + one `projects` row carrying `positioning_statement_id`). Deterministic `now: () => FIXED_NOW_ISO` + `nextId` counter.
- [ ] **4.6 (GREEN)** Contract test passes for all 7 ops; `route.test.ts` still green.

---

## Task 5 — FE island wiring (新增「定位中心」全局页 + 契合度 Badge injection)

Reads stay server-side via `client.*` (preserve the `viewModel?` test seam). Mutations move to client islands calling the op via `HttpTransport` → `/api/v1/dispatch`, then `router.refresh()`. **C-5 front-end constraints apply:** server outer shell + `*-interactive-region.tsx` island; only `ui/*` primitives + existing AppShell/Sidebar/TopHeader; render/selectors/fixtures contain **no `Date.now`/`Math.random`/`fetch`**. Visual baseline: this page is NEW and not yet baselined (R2-9) — explicitly **mark `/positioning` as "暂不纳入视觉门禁"** until stage-12 re-baseline (C-5).

### New global page `/positioning` 「定位中心」 (spec §3.4 — Sidebar 第 2 项, 排在「项目」前)
- [ ] **5.1** Add the **Sidebar nav item「定位中心」** as the 2nd entry (before「项目」). File: the Sidebar nav config used by AppShell. `<Link href="/positioning">`. Mark the active state.
- [ ] **5.2** Create `frontend/src/app/(creator)/positioning/page.tsx` (server shell) reading `client.getPositioningCenter()` → renders current 定位 (one-liner), 关键词 chips, 产品锚 list, 历史版本 timeline. Empty-state (no profile) renders a 「创建定位」 CTA. File the feature module `frontend/src/features/positioning/positioning-center.tsx` with the `viewModel?` seam.
- [ ] **5.3** **「编辑账号画像」 form (persona/领域/目标人群/差异化/能力清单)** [`needs-backend`] → island `positioning-profile-interactive-region.tsx` calls `client.upsertProfile({ body })` + `router.refresh()`.
- [ ] **5.4** **「保存新版本定位」 (one-liner + 3 keywords + product anchors)** [`needs-backend`] → island calls `client.createStatementVersion({ body })`; on success a NEW version row appears in the 历史版本 timeline (append-only — the prior版本保留). `router.refresh()`.
- [ ] **5.5** **历史版本 timeline rows** [`wired-local`] — each row links to/expands `client.getStatement({ params: { statementId } })` (read-only diff view); leave non-mutating. **「设为当前」** is **intentionally inert** — current = max version by construction (no "activate" concept); note it.

### 契合度 Badge injection (spec §3.4 — New Project / Research / Planning / Review, 复用 `StatusBadge`)
- [ ] **5.6** **「定位契合度」 Badge** on the **New-Project** surface [`needs-backend`] → after title/brief entered, island calls `client.evaluateGate({ body: { subjectType: "project", subjectId } })` (or the inline candidate payload pre-create) → render `positioningFit` 0–100 via `StatusBadge` (复用, C-5), with `reasons[]` in a tooltip. 不过线 (e.g. < threshold) → 标灰/降权 styling, **不阻断** (spec §3.3). File: `frontend/src/features/projects/new-project-form.tsx` (Badge slot) — imports `modules/positioning` only via its public client op, never its repo.
- [ ] **5.7** Inject the same Badge into **Research / Planning / Review** workspace headers [`needs-backend`] (subjectType `"project"`, the workspace's projectId) — a shared `<PositioningFitBadge projectId=…/>` island reused across the three. `router.refresh()` is NOT needed (read-only score); render on load.
- [ ] **5.8** Review 「复盘沉淀」 → **「建议修正定位」** affordance (spec §3.3 定位演进回流) [`needs-backend`] → enqueues an AI task `ai.tasks.create({ taskType: "positioning_revise", inputData })` (module-15 owns the lifecycle, C-3) — show pending, poll `getTask`; on `awaiting_confirmation` the 采纳 button drives `ai.tasks.confirm` which formalizes a new `PositioningStatement` version via `createStatementVersion`. If module-15's `positioning_revise` branch isn't landed, mark this **intentionally inert + note OQ2**.

---

## Task 6 — tests (MODULE-ARCH §2: three test files)

- [ ] **6.1** `positioning.service.test.ts` — Task 3 RED cases: upsert idempotency; **append-only version chain** (v2 leaves v1 byte-identical; no update method exists); 3-keyword guard; `ProfileRequiredError`; **deterministic gate** (same input → same score, twice; advisory not mutating); AI-formalize tagging (`created_by_type:"ai"` + `ai_task_id`, no parallel candidate machine); page DTO empty-state. Deterministic clock/ids.
- [ ] **6.2** `positioning.repository.integration.test.ts` — pglite-backed: Task 1 round-trip (v1/v2 distinct version_number) + Task 2 **multi-tenant ownership** (user A cannot read/list user B's profile or statement → `OwnershipError`). This is the foundation §9 multi-tenant smoke for this module.
- [ ] **6.3** `positioning.contract.test.ts` — Task 4: all 7 op envelopes validate against their contract v0.4 response DTO (per-item for `statements.list`).
- [ ] **6.4** FE: `positioning-center.test.tsx` + `new-project-form.test.tsx` (Badge) using the `viewModel?`/mock seam — assert `client.upsertProfile`/`client.createStatementVersion`/`client.evaluateGate` are invoked and `router.refresh` called on the mutating ones; assert the gate Badge renders the returned `positioningFit` and stays non-blocking when below threshold.

---

## Task 7 — acceptance (SPEC §22 + foundation §5 step 6 + 七步整合设计 hard constraints)

- [ ] **7.1** Module has `service` + `repository` + `schema` + `errors` + 3 test files under `frontend/src/server/modules/positioning/`; `index.ts` is the only public entry (repository NOT exported).
- [ ] **7.2** No cross-module repository import (grep: no import from `modules/*/.*repository` outside `positioning/`). Positioning consumes Projects/monetization/AI only via their `index.ts`; the `projects.positioning_statement_id` write goes through `projectsService.patchProject`, never a direct `projects` UPDATE.
- [ ] **7.3 (C-2)** Every op is contract-op → dispatch → service → Drizzle/pglite → envelope; all 7 ids in `PERSISTED_OPS` via the registry union; the `/api/v1/dispatch` route touches no db client/repository directly. **No frontend-fixtures-only path** for any positioning behavior.
- [ ] **7.4 (immutability)** `positioning_statements` is append-only: the service exposes no update/delete; UNIQUE `(profile_id, version_number)`; a new "version" is a new row with `version_number = max+1` (mirrors `ArtifactVersion`, data-model rule 6). Verified by 6.1/6.2.
- [ ] **7.5 (C-3)** The AI 定位演进回流 reuses `submit_candidate → awaiting_confirmation → confirmResult` (module-15); positioning exposes ONLY the AI-free `createStatementVersion` formalize callee and **no parallel candidate state machine** (grep: no `awaiting_confirmation`/`submitCandidate` in this module).
- [ ] **7.6 (C-4)** Positioning opens no ingestion write path; the revise-trigger only consumes `ReviewInsight`/`CalibrationResult` produced via the calibration module's Ingestion `ExternalSource`+idempotency.
- [ ] **7.7 (C-5)** The 定位契合度 gate scorer and all FE render/selectors/fixtures are free of `Date.now`/`Math.random`/`fetch` (deterministic); the Badge reuses `StatusBadge`; `/positioning` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline.
- [ ] **7.8 (multi-tenant)** Every repository query user-scoped; the 6.2 smoke is green; cross-user access → 404 (`OwnershipError`).
- [ ] **7.9** `pnpm verify` (frontend: lint/tsc/tests/build) GREEN + the 3 module tests GREEN. No `viewModel?` seam regressions; seeded fixtures render deterministically off `FIXED_NOW_ISO`.

---

## Open questions (decide before/early in execution)

1. **Profile cardinality & PlatformAccount link.** Spec §3.2 says "user 级单条或少量" — this plan models **one `CreatorProfile` per user** (UNIQUE `user_id`). If 矩阵号 needs one profile per `PlatformAccount` (§7.1, Wave 5+), relax the UNIQUE to `(user_id, account_id)` and add the FK then. Confirm single-profile is acceptable for P1.
2. **`positioning_revise` AITask wiring (C-3).** Task 3.6/5.8 assume module-15 adds `taskType: "positioning_revise"` + a `resultType: "positioning_statement"` branch in `confirmResult` calling `PositioningService.createStatementVersion`. That is a **module-15 change**, not implemented here. Decide whether to land it in this wave (then 5.8 is live) or defer (then 5.8 is intentionally inert). Coordinate the contract `aiCapability`/`resultType` enum extension (v0.4).
3. **Gate scorer fidelity (rubric coupling).** Spec §3.3 + §6.2 want the fit to eventually be **变现加权 rubric**-aware. This wave ships a deterministic keyword/role/anchor-overlap scorer (self-contained). Decide the upgrade point: when `calibration`'s `RubricVersion` lands, does `evaluateGate` read rubric dimensions, and does that change the `positioningGateResultResource` shape (add `dimensionScores`)? Keep the DTO forward-compatible.
4. **`projects.positioning_statement_id` write seam.** The column add is owned by module-05's table; positioning sets it via `projectsService.patchProject`. Confirm module-05's `patchProject` body accepts `positioningStatementId` (contract `projects.patch` body extension, v0.4) — else the project-anchor wiring (2.5) is gated behind that follow-up.
5. **Candidate subject before §5 lands.** `evaluateGate` subjectType `"candidate"` needs the `Candidate` entity (spec §5, Wave 5). Until that module lands, the gate accepts an inline `{ title, angle, contentRole, productAnchorId }` payload (OQ5). Confirm whether positioning ships before or after the candidate module; sequence the `"candidate"` subject branch accordingly.
6. **`product_anchor_ids` existence check.** Cross-module validation against `monetization.Product` is soft (accept-and-store) until that P0 module lands. Confirm positioning (P1) sequences after monetization (P0) per §8 so the hard guard (3.4) can be added without a forward dependency.
