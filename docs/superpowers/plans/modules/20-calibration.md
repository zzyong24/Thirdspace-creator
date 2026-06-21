# Module 20 — Calibration (Rubric + Prediction + CalibrationResult) — Executable TDD Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` (red→green per task) and `superpowers:executing-plans`. Steps use `- [ ]` and run in order by a single dispatched agent that HALTS on the first failing step. This plan obeys the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture, §2 multi-tenant auth, §4 external-mock adapters, §5 per-module template, §6 wave order). It implements the seven-step **calibration闭环** of `docs/CreatorOS-七步整合设计.md` §6 (七步⑤⑥). **Plan only: no implementation code lands from this document; it is the ordered task list a later wave runs.** Do NOT re-spec `backend/SPEC.md` or `@creatoros/contract` — reference and conform.

## Goal

Wire the **校准闭环** (calibration loop) end-to-end so the system can answer §9-Q5: *"我发布前预测准不准？我的判断标准在进化吗？"* Deliver the three §6.2 entities as a user-scoped vertical:

- **`Rubric` + `RubricVersion`** — a **变现加权** scoring formula (维度: hook 强度 / 利他性 / 人群匹配 / CTA 清晰度 / 为产品铺路程度 — **NOT 播放量预估**, §6.2 / §2.0). `RubricVersion` is an **immutable version chain** (沿用 `ArtifactVersion` 不可变范式, data-model 约束 6).
- **`Prediction`** — a **发布前盲预测 locked at creation, DB-immutable** (§6.2: "创建后锁定不可改", DB 约束 + ArtifactVersion 不可变范式, 等价 cheat-predict 的 hook). Scores a `contentOutputId` or `publicationId` against a `rubricVersionId`, carries `predictedMetrics` + `predictedConversion` (变现加权) + `confidence`, stamps `lockedAt`.
- **`CalibrationResult`** — 预测 vs 实际偏差. **The actual metrics are recycled via §C-4 Ingestion** (`ExternalSource` + `IngestionRun` + 双重幂等), never a new write path. `deviation` is computed at confirm; the result **feeds back** to bump a new `RubricVersion` and update `Learning.confidence_score` (the calibration → learning bridge, §6.3).

The closed loop (§6.3): `Score(rubric) → Blind-Predict(锁死) → Publish → Retro(T+N 经 Ingestion 抓数) → CalibrationResult → RubricVersion bump / 更新 Learning → 下一个 Candidate 排序`.

**Module identity (§6.4 decision):** this plan stands `calibration` up as an **independent module** under `frontend/src/server/modules/calibration/` (the spec permits "独立模块，或并入 reviews + learnings"; independent is chosen so the immutable Prediction/Rubric invariants and the Ingestion-recycle wiring don't bloat the already-large Reviews/Learnings modules — same rationale Module 13 used to keep its bridge in `index.ts`). It **consumes** Reviews/Learnings/Analytics/Ingestion **only via their `index.ts` service interfaces** (no cross-module repository imports, SPEC §22).

## Hard-constraint compliance (七步整合设计 §1)

- **C-1 (ID freeze):** all new FR/ENT/API ids for this module are **placeholders** (`FR-CALIB-*`, `ENT-1xx`) until OPEN-001 signs off and the existing ID段 freezes; they are appended as a NEW段, never inserted mid-segment. The contract op ids below are the load-bearing identifiers this plan keys to (they land in **contract v0.4**, see "Contract ops this module owns").
- **C-2 (落库样板):** every op goes contract-op → `/api/v1/dispatch` → ctx-taking module transport → Drizzle/pglite repository → envelope. **NO frontend-fixtures-only layer.** The module ships db-schema + repository + service + transport + the three-test trio and registers into `PERSISTED_OPS` via the registry (foundation §1).
- **C-3 (复用 AI 候选确认流):** when a `Prediction` (or a rubric维度建议) is **AI-generated** (e.g. the `topic_score` capability, §7.4), it **MUST** flow through the existing `submit_candidate → awaiting_confirmation → confirmResult` machine owned by the **AI module (15)** and `AITaskResult`. This module does **NOT** build a parallel candidate state machine: `Prediction.lock` is the AI-free `confirmResult` formalization step (AI proposes a candidate prediction; the human `采纳` confirm calls `calibration.lockPrediction`). Human-authored predictions go straight through the normal service write (mirrors §C-3 "人工录入的 Candidate 走普通 service 写入").
- **C-4 (校准回收复用 Ingestion):** `CalibrationResult.actualMetrics` is sourced **only** from metrics that arrived through `IngestionService` (`ExternalSource` + `IngestionRun`, 双重幂等 `(source, idempotency_key)` / `(run, record_key)`). This module **reads** Analytics/Ingestion via `index.ts`; it never opens a new external write path. **RISK-005 guard:** when a CalibrationResult references an `ingestionRunId`, verify the run is real & owned (`IngestionService.getRun(ctx, runId)` resolves) — no 悬空 `ingestionRunId`.
- **C-5 (前端):** the calibration FE surface (data-回流 TodoCard + Prediction badge in Review) is a server外壳 + `*-interactive-region.tsx` island, `ui/*` primitives only, NO `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures. New surface marked **"暂不纳入视觉门禁"** until stage-12 re-baseline (R2-9).
- **C-6 (manifest):** before execution, confirm `ARTIFACT_MANIFEST.yaml` / frontier are aligned with the DECISION_LOG (DEC-010/011) so this module is not planned against a stale "backend not started" assumption.
- **Multi-tenant:** every repository query filters `eq(table.userId, ctx.userId)`; every insert stamps `ctx.userId`; cross-user access → `OwnershipError` → 404 (foundation §2, no existence leak).

## Architecture (per foundation §1)

Module code lives under `frontend/src/server/modules/calibration/` following MODULE-ARCH §2:

```
frontend/src/server/modules/calibration/
├── calibration.db-schema.ts          # rubrics, rubric_versions, predictions, calibration_results (+ user_id on all)
├── calibration.repository.ts         # user-scoped queries ONLY
├── calibration.service.ts            # RequestContext methods; immutability guards; Ingestion-recycle; bridges
├── calibration.schema.ts             # re-export contract DTOs + row→DTO mappers
├── calibration.transport.ts          # ctx-taking { opId → (ctx,input) => envelope }; UnsupportedOperationError otherwise
├── calibration.errors.ts             # re-use shared OwnershipError/ConflictError/ValidationError/ImmutableError/UnsupportedOperationError
├── index.ts                          # ONLY public entry (service interface + transport map + registerCalibration)
├── calibration.service.test.ts
├── calibration.repository.integration.test.ts
└── calibration.contract.test.ts
```

- `index.ts` is the **only** public entry. **No cross-module repository imports** (SPEC §22): consume `ReviewsService`, `LearningsService`, `AnalyticsService`, `IngestionService` **only via each module's `index.ts`** (`AnalyticsService.getProjectSnapshots`, `IngestionService.getRun`, `LearningsService.adjustConfidence`/`getLearning`, `ReviewsService.getReview`). AI candidate flow is consumed via the **AI module `index.ts`** (`ai.confirm` → `confirmResult` calls back into `calibration.lockPrediction`).
- Shared infra (pglite/Drizzle db factory, `RequestContext`, `UnitOfWork`, the registry) comes from `@creatoros/backend`; reuse the **globalThis pglite singleton** (`frontend/src/server/persistence-client.ts`) — NO module-level `let` store. The four tables' DDL is appended to the shared init applied at `createDb()` (mirror `PROJECTS_DDL`).
- Transport map registered into the module transport registry (foundation §1: composite builds `PERSISTED_OPS` from the union; adding calibration = register it, no edits to the composite switch). Mirror the Projects exemplar `backend/src/persistence-transport.ts`, now `(ctx, input) => envelope`.

## Tech stack

Next.js App Router · TypeScript strict · Drizzle ORM over pglite (`@electric-sql/pglite`, in-memory on `globalThis`) · Zod (contract DTOs from `@creatoros/contract` resources) · Vitest. Timestamps as **ISO-8601 text**, enums/status as **text**, structured payloads as **jsonb** (mirror Projects exemplar). IDs via the injected `nextId(prefix)` deterministic generator (`RepoDeps`).

## Dependency note (must be GREEN first)

- **Wave 0:** registry generalization + Identity/auth `ctx.userId` + mock-adapter seam.
- **Wave 3 base modules (consumed via `index.ts`):** **Ingestion (12)** — `getRun` + the metrics-recycle path (§C-4); **Analytics (11)** — `getProjectSnapshots` for `actualMetrics`; **Reviews (13)** — `getReview` (the data-回流 TodoCard drills into the Project's Review); **Learnings (14)** — a confidence-adjust read/write for the §6.3 feedback (`Learning.confidence_score`).
- **Wave 3 AI (15):** the `submit_candidate → awaiting_confirmation → confirmResult` machine + `AITaskResult` (§C-3). Calibration's `topic_score` AI predictions ride this; **AI (15) must be green** before the AI-generated prediction path is wired (the human-authored path does not depend on AI).
- **Wave placement:** this is a **Wave 5–7 new module** (七步整合设计 §8 / foundation roadmap), after the base 16 modules. Per §8 priority, the **变现加权 rubric + 校准闭环 is P0** within the seven-step program (gated only on C-1 ID freeze + C-2 样板). Sibling new modules: `monetization`, `candidate`, `positioning`, `platform-account`, `content-calendar`.
- **Blocks:** the **Candidate** module's 变现加权 ranking reads `Prediction.predictedScore` + the current `RubricVersion` to order the 选题候选池 (七步整合设计 §5.3 cheat-recommend → §6.2). Calibration "lights up" the predict-vs-actual flywheel.

---

## Contract ops this module owns (to be ADDED in contract v0.4 — `contract/src/operations/calibration.ts`)

> These ops do **not** exist yet (grep of `contract/src/operations/` shows `ingestion.ts` + `learnings.ts` as the only calibration-adjacent files; there is **no** `predict`/`rubric`/`calibration` op today). They land in **contract v0.4** as `export const calibrationOperations`, with matching `contract/src/resources/calibration.ts` DTOs. SPEC §13 group placement: **"分析、复盘和经验"** (alongside Reviews/Learnings). This plan's Step 4 conforms to these shapes; if v0.4 finalizes differently, the transport switch follows v0.4 verbatim.

| op id | method · path | params · body | response DTO | FR (placeholder) |
|---|---|---|---|---|
| `calibration.rubrics.create` | POST `/calibration/rubrics` | body `{ name: string(min1), dimensions: RubricDimension[] }` (each `{ key, label, weight }`, 变现加权维度) | `rubricResource` (with embedded `currentVersion`) | FR-CALIB-RUBRIC-CREATE |
| `calibration.rubrics.bumpVersion` | POST `/calibration/rubrics/:rubricId/versions` | params `{ rubricId }`; body `{ dimensions: RubricDimension[], changeSummary: string }` | `rubricVersionResource` (new immutable version) | FR-CALIB-RUBRIC-BUMP |
| `calibration.rubrics.get` | GET `/calibration/rubrics/:rubricId` | params `{ rubricId }` | `rubricResource` | FR-CALIB-RUBRIC-GET |
| `calibration.predictions.create` | POST `/calibration/predictions` | body `{ subjectType: "content_output"\|"publication", subjectId: id, rubricVersionId: id, predictedMetrics: Record, predictedConversion: Record, confidence: "high"\|"med"\|"low" }` | `predictionResource` (status `draft`, `lockedAt: null`) | FR-CALIB-PRED-CREATE |
| `calibration.predictions.lock` | POST `/calibration/predictions/:predictionId/lock` | params `{ predictionId }` | `predictionResource` (status `locked`, `lockedAt` set) | FR-CALIB-PRED-LOCK |
| `calibration.predictions.get` | GET `/calibration/predictions/:predictionId` | params `{ predictionId }` | `predictionResource` | FR-CALIB-PRED-GET |
| `calibration.results.create` | POST `/calibration/predictions/:predictionId/result` | params `{ predictionId }`; body `{ ingestionRunId: id, actualMetrics: Record }` | `calibrationResultResource` (deviation computed server-side) | FR-CALIB-RESULT-CREATE |

DTO field shapes are fixed by the v0.4 `contract/src/resources/calibration.ts` — do NOT redefine; import and validate against them. Expected resource shapes (the recipe Step 4 conforms to):
- `rubricResource`: `{ id, name, currentVersionId: id, currentVersion: rubricVersionResource, createdAt: iso }`.
- `rubricVersionResource`: `{ id, rubricId, versionNumber: int, dimensions: { key, label, weight }[], changeSummary, createdAt: iso }` — **immutable**.
- `predictionResource`: `{ id, subjectType, subjectId, rubricVersionId, predictedMetrics: Record, predictedConversion: Record, predictedScore: number, confidence, status, lockedAt: iso|null, createdAt: iso }`.
- `calibrationResultResource`: `{ id, predictionId, ingestionRunId, actualMetrics: Record, deviation: Record, createdAt: iso }`.
- Enums (source of truth = v0.4 contract resource): `predictionStatus = draft | locked`; `confidence = high | med | low`; `subjectType = content_output | publication`.

**Input/output gap (determinate recipes, not placeholders):**
- `predictionResource.predictedScore` is **not** in the create body — it is **derived server-side** by applying the `rubricVersionId` 维度权重 to `predictedMetrics`/`predictedConversion` (变现加权 weighted sum), Step 3.
- `calibrationResultResource.deviation` is **not** in the create body — it is **computed server-side** as `predicted vs actual` per metric key (Step 3); `actualMetrics` is only accepted when sourced from a verified Ingestion run (§C-4 / RISK-005 guard).

## State machines (immutable invariants)

- **Prediction.status:** `draft → locked` (via `calibration.predictions.lock`). **`locked` is terminal & immutable** (§6.2 "创建后锁定不可改"): any `predictions.create`-style update or re-lock of a `locked` prediction → `ImmutableError`/`ConflictError`. There is **no** `unlock`/`edit` op (DB约束 + ArtifactVersion 不可变范式). A `CalibrationResult` may only be created against a **`locked`** prediction (Step 3 guard) — recycling actuals against an unlocked, still-editable prediction is rejected (`ConflictError`).
- **RubricVersion:** immutable once written (data-model 约束 6, ArtifactVersion 范式). Editing a rubric = `bumpVersion` creates a NEW `rubric_versions` row with `versionNumber = current + 1` and re-points `rubrics.current_version_id`; the old version row is never updated. `(rubric_id, version_number)` UNIQUE (concurrency: assign under row lock / sequence — §7.5 工程债, add the concurrency test).
- **CalibrationResult:** one result per prediction (UNIQUE `prediction_id`); idempotent re-submit of the same `(prediction_id, ingestion_run_id)` returns the existing row (`onConflictDoNothing` + read-back) — never double-bumps the rubric/Learning.

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/calibration/calibration.db-schema.ts`. Define four `pgTable`s mirroring 七步整合设计 §6.2 + data-model conventions, with `user_id TEXT NOT NULL` on **every** owned row (the ownership column required by foundation §1/§2 — same intentional infra addition Module 12/13 documented; §6.2 ER omits it). Follow Projects schema conventions exactly: timestamps as ISO-8601 `text`, enums as `text`, structured payloads as `jsonb`, plus a raw `CALIBRATION_DDL` string for pglite init.
  - `rubrics`: `id` PK text, `userId` text notNull, `name` text notNull, `currentVersionId` text (nullable until first version inserted — circular-FK first-insert order, §7.5 工程债: insert rubric with NULL `currentVersionId`, insert version, then patch `currentVersionId`; document the deferred/NULL strategy), `createdAt` text notNull.
  - `rubricVersions`: `id` PK text, `userId` text notNull, `rubricId` text notNull, `versionNumber` integer notNull, `dimensions` jsonb notNull (array of `{ key, label, weight }` — 变现加权: hook 强度 / 利他性 / 人群匹配 / CTA 清晰度 / 为产品铺路程度), `changeSummary` text notNull default `''`, `createdAt` text notNull. **UNIQUE `(rubric_id, version_number)`.** Rows are **never updated** (immutable, 约束 6).
  - `predictions`: `id` PK text, `userId` text notNull, `subjectType` text notNull (`content_output`|`publication`), `subjectId` text notNull, `rubricVersionId` text notNull, `predictedMetrics` jsonb notNull default `{}`, `predictedConversion` jsonb notNull default `{}` (变现加权 conversion 预测), `predictedScore` text notNull (decimal-as-text, mirror data-model decimal storage), `confidence` text notNull (`high`|`med`|`low`), `status` text notNull (`draft`|`locked`), `lockedAt` text (nullable — set only at lock), `createdAt` text notNull. Rows are **never updated after `status="locked"`** (immutable盲预测).
  - `calibrationResults`: `id` PK text, `userId` text notNull, `predictionId` text notNull, `ingestionRunId` text notNull (§C-4: references a real `IngestionRun`), `actualMetrics` jsonb notNull default `{}`, `deviation` jsonb notNull default `{}`, `createdAt` text notNull. **UNIQUE `prediction_id`** (one result per prediction). Add an index on `ingestion_run_id` for the RISK-005 reverse lookup.
- [ ] Append `CALIBRATION_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep `PROJECTS_DDL` usage; register `CALIBRATION_DDL` in the same `CREATE TABLE IF NOT EXISTS` init list, including `CREATE UNIQUE INDEX IF NOT EXISTS rubric_versions_rubric_ver_uq ON rubric_versions (rubric_id, version_number)`, `CREATE UNIQUE INDEX IF NOT EXISTS calibration_results_prediction_uq ON calibration_results (prediction_id)`, and `CREATE INDEX IF NOT EXISTS calibration_results_run_idx ON calibration_results (ingestion_run_id)`).
- [ ] **Test (`calibration.repository.integration.test.ts`, first red):** a row inserted into each of the four tables round-trips via `db.select()` with all columns intact (jsonb defaults, nullable `lockedAt`/`currentVersionId` = `null`, `dimensions` array preserved order, `versionNumber` integer).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/calibration/calibration.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createCalibrationRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. Private getters (`getRubricRow`, `getRubricVersionRow`, `getPredictionRow`) throw `OwnershipError` (`OwnershipError: prediction not found: <id>`) on empty scoped select — never reveal cross-user existence (404 not 403). Methods:
  - `createRubric({ name })` — insert rubric `{ id: nextId("rubric"), userId, name, currentVersionId: null, createdAt: now() }`; `.returning()`.
  - `insertRubricVersion({ rubricId, versionNumber, dimensions, changeSummary })` — insert `{ id: nextId("rubricver"), userId, rubricId, versionNumber, dimensions, changeSummary, createdAt: now() }`; `.returning()`. **Never an update** (immutable).
  - `setRubricCurrentVersion(rubricId, versionId)` — scoped `update rubrics set current_version_id=versionId where id and userId` (the ONLY rubric mutation — re-points the pointer; the version rows stay immutable).
  - `getRubric(rubricId)` / `getRubricVersion(versionId)` / `listRubricVersions(rubricId)` (scoped, `orderBy(asc(versionNumber))`); `countRubricVersions(rubricId)` for the next `versionNumber`.
  - `createPrediction({ subjectType, subjectId, rubricVersionId, predictedMetrics, predictedConversion, predictedScore, confidence })` — insert `{ id: nextId("pred"), userId, …, status: "draft", lockedAt: null, createdAt: now() }`; `.returning()`.
  - `lockPrediction(predictionId)` — scoped ownership via `getPredictionRow`; **only** `update predictions set status="locked", locked_at=now() where id and userId and status='draft'` (the SQL `status='draft'` guard backs the immutability invariant at the DB layer too); `.returning()`. (The service enforces the state machine; the repo executes the service-approved transition — SPEC §12.)
  - `getPrediction(predictionId)`.
  - `createResult({ predictionId, ingestionRunId, actualMetrics, deviation })` — insert `{ id: nextId("calibres"), userId, predictionId, ingestionRunId, actualMetrics, deviation, createdAt: now() }` with `onConflictDoNothing()` on the UNIQUE `prediction_id`; then read-back the row (idempotent: existing or new). `.returning()` / read-back.
  - `getResultByPrediction(predictionId)`.
- [ ] **Tests (`calibration.repository.integration.test.ts`, pglite-backed):**
  - ownership: repo `userId:"user-a"` creates a rubric + prediction; repo `userId:"user-b"` `getPrediction`/`getRubric` of A's ids → `OwnershipError` (A's rows invisible to B).
  - immutability: `insertRubricVersion` twice with the same `(rubricId, versionNumber)` → UNIQUE violation; `listRubricVersions` returns ascending `versionNumber`.
  - `createResult` twice for the same `predictionId` leaves exactly one row (idempotent UNIQUE); second call read-back returns the first row.

## Step 3 — service (RequestContext + immutability state machine + §C-4 recycle + bridges)

- [ ] Create `frontend/src/server/modules/calibration/calibration.errors.ts`: re-use shared `OwnershipError`, `ConflictError`, `ValidationError`, `UnsupportedOperationError`, and add/`re-use` an `ImmutableError` (for locked-prediction / version-edit attempts). Do not redefine types that already exist in shared infra.
- [ ] Create `frontend/src/server/modules/calibration/calibration.service.ts`. Every public method takes `(ctx: RequestContext, …)` and builds a repo bound to `ctx.userId` (`createCalibrationRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. Peer services (`AnalyticsService`, `IngestionService`, `LearningsService`, `ReviewsService`) injected via constructor deps as their **public `index.ts` interfaces** (no repository imports). Methods:
  - `createRubric(ctx, { name, dimensions })` — backs `calibration.rubrics.create`. **Validate 变现加权维度** (§6.2 / §2.0): `dimensions` non-empty; weights sum to a fixed normalizer (e.g. 1.0 or 100 — pick in v0.4 and assert); reject a dimension set that is purely 播放量预估 with no conversion/铺路 dimension (a `ValidationError` enforcing the §2.0 direction — at minimum require at least one of `{人群匹配, CTA清晰度, 为产品铺路程度}` present). UoW: insert rubric (NULL `currentVersionId`) → `insertRubricVersion(versionNumber=1)` → `setRubricCurrentVersion`. Map → `rubricResource` (with embedded `currentVersion`).
  - `bumpRubricVersion(ctx, rubricId, { dimensions, changeSummary })` — backs `calibration.rubrics.bumpVersion`. Ownership via `getRubric`; `versionNumber = countRubricVersions + 1` (assign under row lock — §7.5 concurrency); `insertRubricVersion` → `setRubricCurrentVersion`. Old version untouched (immutable). → `rubricVersionResource`.
  - `getRubric(ctx, rubricId)` → `rubricResource`. Backs `calibration.rubrics.get`.
  - `createPrediction(ctx, { subjectType, subjectId, rubricVersionId, predictedMetrics, predictedConversion, confidence })` — backs `calibration.predictions.create`:
    1. Ownership: `getRubricVersion(rubricVersionId)` (cross-user rubric invisible). Validate `subjectType`/`subjectId` shape (subject ownership is the AI/Projects module's concern; this module trusts the scoped reference but records it).
    2. **Derive `predictedScore`** (the body omits it): apply the rubric version's 维度权重 (变现加权 weighted sum over `predictedMetrics` ∪ `predictedConversion`) → a deterministic number. Pure function, NO `Math.random` (C-5).
    3. `repo.createPrediction(...)` with `status:"draft"`, `lockedAt:null`. → `predictionResource`.
  - `lockPrediction(ctx, predictionId)` — backs `calibration.predictions.lock` AND is the AI-free formalization callback for §C-3 (`ai.confirm` → `confirmResult` invokes this to formalize an AI-proposed candidate prediction; the human `采纳` button does the same). Ownership via `getPrediction`; enforce **Prediction.status machine**: if `status==="locked"` → **`ImmutableError`/return-existing decision per v0.4** (recommend: idempotent return of the already-locked row WITHOUT re-stamping `lockedAt`, mirroring Reviews `complete` idempotency; a *content edit* of a locked prediction is the hard-error path); else `repo.lockPrediction` (`draft → locked`, stamps `lockedAt`). → `predictionResource`. **No edit/unlock method exists** (§6.2 盲预测不可改).
  - `recordResult(ctx, predictionId, { ingestionRunId, actualMetrics })` — backs `calibration.results.create`. **The §C-4 + RISK-005 core:**
    1. Ownership: `getPrediction(predictionId)`; **guard `status==="locked"`** (cannot calibrate an unlocked, still-editable prediction → `ConflictError`).
    2. **§C-4 / RISK-005 guard:** verify the Ingestion run is real & owned — `IngestionService.getRun(ctx, ingestionRunId)` MUST resolve (throws `OwnershipError` otherwise); reject a 悬空 `ingestionRunId`. The `actualMetrics` must trace to that run (the recycle path; this module never opens a new external write — §C-4). Optionally cross-check against `AnalyticsService.getProjectSnapshots` for the subject's period.
    3. **Compute `deviation`** (the body omits it): per metric key, `deviation[key] = actual - predicted` (and a conversion-weighted aggregate). Deterministic.
    4. `repo.createResult(...)` (idempotent UNIQUE `prediction_id` — re-submit of same `(predictionId, ingestionRunId)` returns existing row, no double feedback).
    5. **§6.3 feedback bridges (post-commit, failures must NOT roll back the result fact — SPEC §11):** (a) if `deviation` exceeds a threshold, **suggest a `RubricVersion` bump** — recommend surfacing this as an AI candidate via the AI module (§C-3) rather than auto-mutating the rubric, so a human confirms; at minimum emit a domain signal / `ReviewsService`/activity note. (b) **update `Learning.confidence_score`** via `LearningsService.adjustConfidence(ctx, …)` (the `Learning.confidence_score` is "静态字段, 不随效果自动演进" today — §6.1; this is the演进 bridge). Calibration does NOT import the Learnings repository — it calls the public service. → `calibrationResultResource`.
- [ ] **Tests (`calibration.service.test.ts`, fake `now`/`nextId`, pglite db, stubbed peer services):**
  - `createRubric`: 变现加权 validation rejects a 播放量-only dimension set (`ValidationError`); happy path creates v1 + points `currentVersion`; `predictedScore` weighting is deterministic for fixed input.
  - `bumpRubricVersion`: creates `versionNumber=2`, re-points `currentVersionId`, leaves v1 row byte-identical (immutable).
  - `createPrediction`: derives `predictedScore` from the rubric version weights; row is `draft`, `lockedAt:null`.
  - `lockPrediction`: `draft → locked` stamps `lockedAt`; second call idempotent (same `lockedAt`, no re-stamp); attempting a content edit of a `locked` prediction → `ImmutableError` (no edit method — assert none is exported / the lock SQL `status='draft'` guard makes a re-lock a no-op).
  - `recordResult`: rejects when prediction is `draft` (`ConflictError`); rejects when `IngestionService.getRun` throws (RISK-005 悬空 run → `OwnershipError` bubbles); happy path computes `deviation = actual - predicted` per key; calls `LearningsService.adjustConfidence` with `ctx` (post-commit bridge); idempotent re-submit returns the same result WITHOUT a second `adjustConfidence` call.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/calibration/calibration.schema.ts`: re-export the v0.4 contract DTOs/enums used (`rubricResource`, `rubricVersionResource`, `predictionResource`, `calibrationResultResource`, `calibrationOperations`) — single import surface. Add row→DTO mappers (`toRubricDto`, `toRubricVersionDto`, `toPredictionDto`, `toCalibrationResultDto`) here so service + contract test share one mapping (DTO is explicitly built, never the Drizzle row — SPEC §9; note `predictedScore` text→number coercion in the mapper).
- [ ] Create `frontend/src/server/modules/calibration/calibration.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2). Export `createCalibrationTransport(service)` returning `{ request(ctx, endpoint, input) }` with `switch (endpoint.id)`:
  - `"calibration.rubrics.create"` → `service.createRubric(ctx, body)`.
  - `"calibration.rubrics.bumpVersion"` → `service.bumpRubricVersion(ctx, params.rubricId, body)`.
  - `"calibration.rubrics.get"` → `service.getRubric(ctx, params.rubricId)`.
  - `"calibration.predictions.create"` → `service.createPrediction(ctx, body)`.
  - `"calibration.predictions.lock"` → `service.lockPrediction(ctx, params.predictionId)`.
  - `"calibration.predictions.get"` → `service.getPrediction(ctx, params.predictionId)`.
  - `"calibration.results.create"` → `service.recordResult(ctx, params.predictionId, body)`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`. All `meta: singleMeta`.
- [ ] Create `frontend/src/server/modules/calibration/index.ts` exporting the public `CalibrationService` interface (the methods the **Candidate** module consumes for 变现加权 ranking: at least `getPrediction`, `getRubric`, plus a read `listLockedPredictionsForSubject(ctx, subjectType, subjectId)` and `getCurrentRubricVersion(ctx, rubricId)`) + the op-id list (the 7 ids above) + `registerCalibration(registry)` adding the transport map. Register in the composite transport registry (foundation §1: union builds `PERSISTED_OPS` — no edit to the composite switch).
- [ ] **Tests (`calibration.contract.test.ts`):** for EACH of the 7 op ids, drive the transport with a seeded `ctx` + valid input and assert `calibrationOperations[<key>].response.parse(envelope.data)` succeeds. Specifically: `calibration.rubrics.create` → `rubricResource.parse` (embedded `currentVersion`, `versionNumber:1`); `calibration.predictions.create` → `predictionResource.parse` (`status:"draft"`, `lockedAt:null`, numeric `predictedScore`); `calibration.predictions.lock` → `predictionResource.parse` (`status:"locked"`, non-null `lockedAt`); `calibration.results.create` → `calibrationResultResource.parse` (`deviation` is an object, `ingestionRunId` present).

## Step 5 — FE island wiring (§6.5 + roadmap §4 review page)

§6.5 defines the calibration FE surface: (a) the **「数据回流任务」** — 发布后 N 天自动在 Dashboard `TodoCard` 生成 "回来看 XX 的数据", 直达该 Project 的 Review; (b) Review 的 **「复盘沉淀」** 动作 + the **Prediction-vs-actual** display. This module owns the prediction/calibration controls; Analytics/Reviews own the metric panels.

- [ ] Server外壳 + `calibration-interactive-region.tsx` island (C-5: `ui/*` primitives only; NO `Date.now`/`Math.random`/`fetch` in render/selectors/fixtures; mark the new surface **"暂不纳入视觉门禁"** until stage-12 re-baseline). Preserve the `viewModel?` seam. Surfaces:

| Control (label) | op | body / params | transition |
|---|---|---|---|
| `盲预测` (create blind prediction, pre-publish) | `calibration.predictions.create` | body `{ subjectType, subjectId, rubricVersionId, predictedMetrics, predictedConversion, confidence }` → `router.refresh()` | creates `draft` |
| `锁定预测` (lock — 发布前写死) | `calibration.predictions.lock` | params `{ predictionId }` → `router.refresh()` | `draft → locked` (irreversible) |
| `回流校准` (record actual vs predicted) | `calibration.results.create` | params `{ predictionId }`; body `{ ingestionRunId, actualMetrics }` → `router.refresh()` | computes `deviation` |
| `新建评分维度版本` (bump rubric) | `calibration.rubrics.bumpVersion` | params `{ rubricId }`; body `{ dimensions, changeSummary }` → `router.refresh()` | new immutable RubricVersion |
| Prediction-vs-actual badge / `数据回流` TodoCard | `calibration.predictions.get` + `calibration.results.create` drill | read-only drill into the Project's Review (§6.5) | — |
| `据此修正定位 / 新增选题` (§6.5 飞轮) | **decorative (this wave)** | belongs to `positioning`/`candidate` modules — inert here, wired in those plans | — |
| `采纳 AI 盲预测` (AI-proposed prediction) | **AI vertical (15) — `ai.confirm`** | `confirmResult` → `calibration.lockPrediction` (§C-3); NOT a parallel candidate machine | formalizes candidate |

- [ ] Add `calibration-interactions.test.tsx`: assert each wired button issues the mapped op via the HttpTransport mock (`盲预测`→`predictions.create`; `锁定预测`→`predictions.lock`; `回流校准`→`results.create`; `新建评分维度版本`→`rubrics.bumpVersion`), and that decorative controls (`据此修正定位`, `采纳 AI 盲预测`) issue **no** Calibration network call. No `Date.now`/`Math.random`/`fetch` in the island's deterministic paths.

## Step 6 — tests (MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `calibration.service.test.ts` (变现加权 validation, predictedScore/deviation determinism, lock idempotency + immutability, recordResult RISK-005 guard + Learning bridge), `calibration.repository.integration.test.ts` (pglite, ownership A-vs-B, RubricVersion UNIQUE + ascending order, CalibrationResult idempotent UNIQUE), `calibration.contract.test.ts` (each of 7 ops validates against its v0.4 contract DTO).
- [ ] **Concurrency test (§7.5 工程债):** `(rubric_id, version_number)` assignment under simulated concurrent `bumpRubricVersion` yields no duplicate `versionNumber` (row-lock / sequence).
- [ ] **Acceptance checklist (SPEC §22 + 七步整合设计 §1):**
  - ships service + repository + schema + the test trio; **no cross-module repository import** (Analytics/Ingestion/Learnings/Reviews/AI accessed only via `index.ts`).
  - the dispatch route does not touch the db client (threads `ctx` into `compositeTransport.request`); every repository query is user-scoped (`eq(table.userId, ctx.userId)`).
  - the API DTO is built by an explicit mapper, never the Drizzle row (SPEC §9).
  - **C-2:** all 7 ops reachable via contract-op → dispatch → Drizzle/pglite (no fixtures-only path).
  - **C-3:** AI-generated predictions ride `submit_candidate → awaiting_confirmation → confirmResult` (AI module 15); `lockPrediction` is the AI-free formalization — **no parallel candidate state machine** in this module.
  - **C-4 / RISK-005:** `CalibrationResult.actualMetrics` only from a verified, owned `IngestionRun` (`IngestionService.getRun` resolves); no new external write path; no 悬空 `ingestionRunId`.
  - **immutability (§6.2):** `RubricVersion` rows never updated; a `locked` Prediction is never edited/unlocked (no op exists; DB `status='draft'` lock guard + service `ImmutableError`).
  - **§6.3 feedback:** a `CalibrationResult` updates `Learning.confidence_score` (via `LearningsService`) and surfaces a RubricVersion-bump suggestion — closing the flywheel to the Candidate module's 变现加权 ranking.
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution / contract v0.4, do not block planning)

1. **Contract v0.4 op shapes.** This plan defines the 7 calibration ops the module owns; v0.4 must add `contract/src/operations/calibration.ts` + `contract/src/resources/calibration.ts`. If v0.4 finalizes different names/shapes, Step 4's transport switch follows v0.4 verbatim. Recommend the ids/shapes above.
2. **Rubric-bump auto vs human-confirmed.** §6.3 says CalibrationResult "自动喂回更新 rubric". This plan recommends surfacing the bump as an **AI candidate** (§C-3 confirm gate) rather than silently auto-mutating the active rubric, so the 评分标准 evolution is auditable. Confirm direction.
3. **`Learning.confidence_score` adjustment contract.** Needs a `LearningsService.adjustConfidence(ctx, learningId, delta|newScore)` on the Learnings `index.ts`. Confirm Module 14 exposes it (grep shows `learnings.evaluate` sets `validationStatus`, not `confidence_score` — a new public service method, not necessarily a new contract op, is the lighter path).
4. **Rubric scope (account-level vs per-Project).** §6.2 implies a user-level evolving rubric. Confirm a single active rubric per user (or per content_role) vs many — affects how the Candidate module picks "the current RubricVersion" for ranking. Recommend: one active rubric per user, `content_role`-aware dimensions inside it.
5. **Module independence vs merge into reviews+learnings (§6.4).** This plan chose independent. Confirm that's still desired given Wave 5–7 sequencing, or whether `Prediction`/`Rubric` should fold into Reviews to share its period/Publishing reads.
6. **`predictedScore`/`deviation` storage type.** Stored as decimal-text per data-model decimal convention; mapper coerces to number for the DTO. Confirm the precision/normalizer (weights sum to 1.0 vs 100).
