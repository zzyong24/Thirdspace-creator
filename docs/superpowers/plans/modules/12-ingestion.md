# Module 12 — Ingestion — Executable TDD Plan (Wave 3)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` (red→green per task) and `superpowers:executing-plans`. Steps use `- [ ]`. This plan obeys the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` (§1 architecture, §2 multi-tenant auth, §4 external-mock adapters, §5 per-module template, §6 wave order). Do NOT re-spec anything in `backend/SPEC.md` or `@creatoros/contract` — reference and conform. **Plan only: no implementation code lands from this document; it is the ordered task list a later wave runs.**

## Goal

Wire the **Ingestion** module end-to-end so that external Skills/scripts can push batches of records (metrics, knowledge, assets, artifacts) into CreatorOS through a **protected, idempotent batch-push API** that **fans out to other modules' Services** (never their repositories). Deliver: `external_sources` + `ingestion_runs` + `ingestion_errors` tables; a user-scoped repository; an `IngestionService` that implements the **IngestionRun lifecycle**, the **two uniqueness invariants** (`(external_source_id, idempotency_key)` and `(run_id, record_key)`), **idempotent re-submission returns the original result**, and **partial-success** batches with per-record errors saved (SPEC §17); the 7 contract dispatch ops registered into the module transport registry; and a `MockIngestionSource` (foundation §4) for deterministic fake imports. Ingestion has **no UI page** (roster row 12; roadmap §4 G12 "no page; external skill writes only") — its FE surface is exactly the wiring noted in §FE below (decorative/observability only).

**Candidate-style external writes (foundation §4 / roadmap §401):** when Ingestion pushes **artifacts**, it creates a *candidate version*, never overwriting `current_version` — only the downstream `confirmResult`/adopt gate promotes it. Ingestion's writes go through `ArtifactsService`/`KnowledgeService`/`AssetsService`/`AnalyticsService`/`PublishingService`, which own those rules.

## Architecture (per foundation §1)

- Module code lives under `frontend/src/server/modules/ingestion/` following MODULE-ARCH §2:
  - `ingestion.db-schema.ts` · `ingestion.repository.ts` · `ingestion.service.ts` · `ingestion.schema.ts` · `ingestion.transport.ts` · `ingestion.errors.ts` · `index.ts`
  - `ingestion.service.test.ts` · `ingestion.repository.integration.test.ts` · `ingestion.contract.test.ts`
  - plus the mock adapter: `ingestion.mock-source.ts` (+ `ingestion.mock-source.test.ts`).
- `index.ts` is the **only** public entry (service interface + transport map). **No cross-module repository imports** (SPEC §22): Ingestion imports `PublishingService`, `AnalyticsService`, `KnowledgeService`, `AssetsService`, `ArtifactsService` **only via each module's `index.ts`** (SPEC §17 rules 6–7).
- **Every repository query is user-scoped** — `eq(externalSources.userId, ctx.userId)`, `eq(ingestionRuns.userId, ctx.userId)`, `eq(ingestionErrors.userId, ctx.userId)`. Inserts stamp `ctx.userId` (foundation §2 ownership). Cross-user access → `OwnershipError` → **404** (SPEC §14, no existence leak). **Note (data-model deviation, decided here):** `INGESTION_RUN`/`INGESTION_ERROR` in `docs/CreatorOS-data-model.md` (L749-767) FK only to `external_source_id`/`ingestion_run_id` and carry **no `user_id`**; foundation §1/§2 require `user_id` on every owned row, so this plan **adds `user_id` to all three tables** and scopes directly (avoids a join-through-source on every query). Documented as an intentional infra addition, identical in spirit to the Identity plan adding `session`/`password_hash`.
- The module's transport map `{ opId → (ctx,input) => envelope }` is **registered into the module transport registry** (foundation §1: the generalized `compositeTransport` builds `PERSISTED_OPS` from the union of registered maps; adding Ingestion = register it, no edits to the composite). The Projects exemplar transport (`backend/src/persistence-transport.ts`) is the shape to mirror, now `(ctx, input) => envelope`.
- Shared infra (pglite/Drizzle db factory, `RequestContext`, `UnitOfWork`, the registry) comes from `@creatoros/backend`; the **globalThis pglite singleton** (`frontend/src/server/persistence-client.ts`) is reused — do NOT introduce a module-level `let` store. The three Ingestion tables' DDL is appended to the shared init applied at `createDb()` (mirror `PROJECTS_DDL` in `backend/src/schema/projects.ts`).
- `RequestContext { userId, requestId, source, ingestionRunId? }` is threaded by the `/api/v1/dispatch` route (foundation §2; SPEC §10 — note the optional `ingestionRunId` slot). External Skills use **the corresponding User's service identity** and do NOT bypass user scope (SPEC §10, §17). The `source` is `"ingestion"` for fan-out calls so downstream Services can attribute provenance.
- **External I/O is mocked (foundation §4):** `IngestionSourcePort` with `MockIngestionSource` returns deterministic fake imports; idempotent per SPEC §17. No network. Real source adapters are a stage-N swap.

## Tech Stack

Next.js App Router · TypeScript strict · Drizzle ORM over pglite (`@electric-sql/pglite`, in-memory on `globalThis`) · Zod (contract DTOs from `@creatoros/contract` resources) · Vitest. Timestamps stored as **ISO-8601 text**, enums/status as **text** (mirror Projects exemplar). IDs via the injected `nextId(prefix)` deterministic generator (mirror `RepoDeps`).

## Dependency note

**Depends on (must be GREEN first):** Wave 0 (registry generalization + Identity/auth `ctx.userId` + mock-adapter seam) and the **downstream target modules Ingestion fans out into** — per roadmap §503 (`Deps: G9, G11, G6, G7, G8, G3`): **Publishing (10), Analytics (11), Knowledge (06), Assets (07), Artifacts (08)** and **Taxonomy (04)** — each must expose its `Service` via `index.ts` (`PublishingService.resolvePublication`, `AnalyticsService.appendSnapshot`, `KnowledgeService.ingest/register`, `AssetsService.registerExternalAsset`, `ArtifactsService.createCandidateVersion`). Ingestion is in **Wave 3, parallel with Reviews, after Analytics** (foundation §6 / roadmap §80). **Blocks:** nothing downstream (terminal external-write module); "lights up" real metrics flowing into Analytics (roadmap §503).

---

## Grepped facts this plan is keyed to (no guesses)

- **Contract op ids this module owns** (`contract/src/operations/ingestion.ts`, `export const ingestionOperations`):
  - `ingestion.runs.create` — `POST /ingestion/runs` — body `{ externalSourceId: id, runType: string(min1), idempotencyKey: string(min1) }` → `ingestionRunResource`. FR-INGESTION-CREATE.
  - `ingestion.runs.metrics` — `POST /ingestion/runs/:runId/metrics` — params `{ runId }`, body `{ records: Record<string,unknown>[] }` → `ingestionRunResource`. FR-INGESTION-METRICS.
  - `ingestion.runs.knowledge` — `POST /ingestion/runs/:runId/knowledge` — same body shape → `ingestionRunResource`. FR-INGESTION-KNOWLEDGE.
  - `ingestion.runs.assets` — `POST /ingestion/runs/:runId/assets` — same body shape → `ingestionRunResource`. FR-INGESTION-ASSETS.
  - `ingestion.runs.artifacts` — `POST /ingestion/runs/:runId/artifacts` — same body shape → `ingestionRunResource`. FR-INGESTION-ARTIFACTS.
  - `ingestion.runs.complete` — `POST /ingestion/runs/:runId/complete` — body `{ status?: string }` → `ingestionRunResource`. FR-INGESTION-COMPLETE.
  - `ingestion.runs.get` — `GET /ingestion/runs/:runId` — params `{ runId }` → `ingestionRunResource`. FR-INGESTION-GET.
  - **No `externalSource.*` contract op exists** (`grep` of `contract/src/operations/ingestion.ts` shows only the 7 run ops). `ExternalSource` registration is **seeded/internal**, not a dispatch op (consistent with SPEC §17 "注册一个 ExternalSource" being a setup step). This plan seeds one canonical `MockIngestionSource` row; a registration op is an open question below.
- **`ingestionRunResource`** (`contract/src/resources/ingestion.ts`): `{ id, externalSourceId, runType, idempotencyKey, status, recordsReceived:int, recordsWritten:int, recordsRejected:int, startedAt: iso8601|null, completedAt: iso8601|null }`. **This is the exact output shape all 7 ops must validate against** (no `userId` in the DTO — `userId` is a DB column, never leaked; mirror Projects' "no Drizzle row as API type", SPEC §9).
- **`externalSourceResource`** (`contract/src/resources/ingestion.ts`): `{ id, userId, sourceType, name, sourceIdentifier, secretReference, configuration: Record, createdAt }`.
- **`ingestionErrorResource`** (`contract/src/resources/ingestion.ts`): `{ id, ingestionRunId, recordKey, errorCode, errorMessage, rejectedPayload: Record }`.
- **Entity fields** (`docs/CreatorOS-data-model.md` L738-767): `EXTERNAL_SOURCE { id, user_id, source_type, name, source_identifier, secret_reference, configuration json, created_at }`; `INGESTION_RUN { id, external_source_id, run_type, idempotency_key, status, records_received, records_written, records_rejected, started_at, completed_at }`; `INGESTION_ERROR { id, ingestion_run_id, record_key, error_code, error_message, rejected_payload json }`. Relations (L625-626): `EXTERNAL_SOURCE ||--o{ INGESTION_RUN`; `INGESTION_RUN ||--o{ INGESTION_ERROR`.
- **SPEC §17 invariants** (`backend/SPEC.md` L562-580): (1) `(external_source_id, idempotency_key)` UNIQUE; (2) `(run_id, record_key)` UNIQUE; (3) duplicate batch re-submission returns the **original** result; (4) batches allow **partial success**; (5) each failure saves error code + original payload; (6) IngestionService does NOT write target repositories directly; (7) IngestionService calls Publishing/Analytics/Knowledge/Assets/Artifacts **Service**.
- **Metrics fan-out path** (`backend/SPEC.md` L277-281): `IngestionService.ingestMetrics → PublishingService.resolvePublication → AnalyticsService.appendSnapshot → IngestionRepository.markRecordResult`. **Idempotency at the Analytics seam** (roadmap §404): duplicate idempotency key **or identical `captured_at`** must not create a duplicate snapshot.
- **No IngestionRun state machine in SPEC §12** (`backend/SPEC.md` L300-330 lists Project/Stage/ContentOutput/Publication/AITask only). The run lifecycle is therefore **defined here** from the resource `status` field + endpoints (decision below); it is NOT a §12 machine to re-spec — the only §12 machines Ingestion *triggers indirectly* are Publication (via `resolvePublication`) and ContentOutput, owned by their modules.
- **Projects exemplar** (`backend/src/{db,schema/projects,repositories/project-repository,persistence-transport}.ts`): `RepoDeps { now, nextId, userId }`; ISO-8601 **text** timestamps; enums as **text**; raw `*_DDL` string applied at `createDb()`; `UnsupportedOperationError(operationId)` thrown for unowned ops; envelope `{ data, meta }` with `singleMeta = { requestId }`. Ingestion mirrors all of this.
- **Composite transport** (`frontend/src/server/persistence-client.ts`): `PERSISTED_OPS` Set + `buildPersistence()` + `globalThis.__creatorosPersistence` singleton + `__resetPersistenceForTests()`. Ingestion registers its map here (or via the generalized registry if Wave 0 has already converted the Set to a union-of-maps registry — prefer the registry).
- **Roadmap §4 / G12 button rows:** `Ingestion | … | (external skill; no page) | 7` (L69) and G12 "External skill writes only … no direct UI" (L502-504). **There are zero `wired-local`/`needs-backend` button rows for Ingestion** — confirmed by grep (only the external-skill note). All FE in §FE below is therefore decorative/observability, marked intentionally inert.

---

## Run lifecycle (defined here; not a SPEC §12 machine)

`ingestion_runs.status` text column, transitions implemented by `IngestionService` only (repository performs only service-approved updates, SPEC §12 closing rule):

```text
pending → running → completed
                 ↘ partial      (some records rejected, run closed)
                 ↘ failed       (terminal error or explicit complete status="failed")
```

- `createRun` → `pending` (sets nothing else; `startedAt = null`).
- first push op (`metrics`/`knowledge`/`assets`/`artifacts`) → `running`, stamps `startedAt` if null.
- `completeRun` → `completed` if `recordsRejected == 0`, else `partial`; honors explicit `body.status` when provided (e.g. `"failed"`); stamps `completedAt`.
- Re-submitting `createRun` with an existing `(external_source_id, idempotency_key)` → returns the **original** run row unchanged (SPEC §17.3). Re-submitting a record with an existing `(run_id, record_key)` → skipped, counts toward original result, not double-written (§17.2/.3).

---

## Tasks (TDD, ordered; each red→green under `pnpm verify` + module tests)

### Task 1 — db-schema (`ingestion.db-schema.ts`)
- [ ] Write `ingestion.repository.integration.test.ts` first asserting the three tables round-trip: insert an `external_sources` row, an `ingestion_runs` row referencing it, an `ingestion_errors` row referencing the run; select them back; assert column values survive (ISO text timestamps, jsonb `configuration`/`rejected_payload`).
- [ ] Define Drizzle `pgTable`s mirroring `backend/src/schema/projects.ts` style (text PK, text `user_id NOT NULL`, jsonb for json fields, ISO-8601 text for datetimes):
  - `externalSources`: `id, userId, sourceType, name, sourceIdentifier, secretReference, configuration(jsonb), createdAt`.
  - `ingestionRuns`: `id, userId, externalSourceId, runType, idempotencyKey, status, recordsReceived(int default 0), recordsWritten(int default 0), recordsRejected(int default 0), startedAt(nullable), completedAt(nullable)`.
  - `ingestionErrors`: `id, userId, ingestionRunId, recordKey, errorCode, errorMessage, rejectedPayload(jsonb)`.
  - Also an internal **`ingestionRecords`** ledger table (not in the contract DTO, internal to enforce §17.2): `id, userId, ingestionRunId, recordKey, result(text: written|rejected), createdAt`. UNIQUE `(ingestion_run_id, record_key)`.
- [ ] Export `INGESTION_DDL` raw string (mirror `PROJECTS_DDL`) with: the four `CREATE TABLE IF NOT EXISTS`; `CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_source_idem ON ingestion_runs (external_source_id, idempotency_key)` (SPEC §17.1); `CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_records_run_key ON ingestion_records (ingestion_run_id, record_key)` (SPEC §17.2).
- [ ] Append `INGESTION_DDL` to the shared init in the db factory consumed by `createDb()` (the place `PROJECTS_DDL` is applied / the registry's DDL union). *(test: round-trip green)*

### Task 2 — repository, user-scoped (`ingestion.repository.ts`)
- [ ] Extend `ingestion.repository.integration.test.ts`: assert **ownership** — seed a run owned by `user-A`; a repository built with `userId: "user-B"` returns `undefined`/throws `OwnershipError` on `getRun(thatRunId)` and `listErrors(thatRunId)`; user A sees it. Assert the two UNIQUE constraints reject duplicates at the DB layer.
- [ ] Define `RepoDeps { now, nextId, userId }` (mirror Projects). Implement `createIngestionRepository(db, deps)` with **every query user-scoped** (`eq(table.userId, deps.userId)`):
  - `seedExternalSources(rows)` / `getExternalSource(id)` (scoped).
  - `findRunByIdempotency(externalSourceId, idempotencyKey)` → original run or `undefined` (powers §17.3).
  - `createRun({ externalSourceId, runType, idempotencyKey })` → stamps `userId`, `status:"pending"`, zero counters, `startedAt:null, completedAt:null`.
  - `getRun(runId)` (scoped; throws `OwnershipError` 404 if missing/cross-user).
  - `markRunRunning(runId)` (sets `status:"running"`, `startedAt` if null).
  - `recordExists(runId, recordKey)` → bool (§17.2 pre-check).
  - `markRecordResult(runId, recordKey, result)` → insert into `ingestionRecords` `onConflictDoNothing`; bump `recordsReceived`, and `recordsWritten`/`recordsRejected` accordingly on the run.
  - `appendError({ ingestionRunId, recordKey, errorCode, errorMessage, rejectedPayload })` (§17.5).
  - `listErrors(runId)` (scoped).
  - `completeRun(runId, { status, completedAt })`.
- [ ] **No unscoped query anywhere.** *(integration test: ownership + uniqueness green)*

### Task 3 — service: RequestContext + run lifecycle + fan-out (`ingestion.service.ts`)
- [ ] Write `ingestion.service.test.ts` first (in-memory pglite + **fake downstream Services** injected as ports) covering:
  - `createRun` returns `pending`; **re-submit same `(externalSourceId, idempotencyKey)` returns the identical original run** (§17.3) — no second row.
  - `ingestMetrics([recA, recB])` with `recB` malformed → run goes `running`; `recA` → `PublishingService.resolvePublication` then `AnalyticsService.appendSnapshot` then `markRecordResult(written)`; `recB` → `appendError(...)` + `markRecordResult(rejected)`; result `recordsWritten:1, recordsRejected:1` (**partial success**, §17.4).
  - Re-pushing a record with the same `record_key` is **skipped** (counts unchanged), proving §17.2/.3 idempotency.
  - `ingestArtifacts` calls `ArtifactsService.createCandidateVersion` (**candidate**, never `current_version`) — assert the fake records a candidate, not a promotion (roadmap §401).
  - Analytics idempotency: two snapshots with identical `captured_at` for the same publication do not double-append (assert fake invoked with dedupe key) (roadmap §404).
  - `completeRun` → `completed` when no rejects, `partial` when rejects > 0, honors explicit `status:"failed"`.
  - All service methods take `ctx: RequestContext` and build the repository with `ctx.userId`; a `ctx.source` of `"ingestion"` is threaded into downstream Service calls; downstream calls receive a `ctx` carrying `ingestionRunId` (SPEC §10).
- [ ] Implement `createIngestionService({ deps, ports })` where `ports = { publishing, analytics, knowledge, assets, artifacts, source }` are the **public Service interfaces from each module's `index.ts`** (SPEC §17.6/.7 — never their repositories) plus the `IngestionSourcePort`. Methods: `createRun`, `ingestMetrics`, `ingestKnowledge`, `ingestAssets`, `ingestArtifacts`, `completeRun`, `getRun`, each `(ctx, input)`.
- [ ] Per-record loop pattern for the four push methods: derive `recordKey` (from `record.recordKey ?? record.id ?? stable hash`); if `recordExists` → skip; validate against the per-type Zod shape (Task 4); on success call the mapped downstream Service then `markRecordResult(written)`; on validation/downstream failure call `appendError` + `markRecordResult(rejected)`. **Use `UnitOfWork`** (shared infra) so the run-counter bump + downstream write + record-ledger insert are atomic per record (foundation §1; SPEC §11). *(service test: all cases green)*

### Task 4 — schema (`ingestion.schema.ts`)
- [ ] Re-export the contract DTOs for this module from `@creatoros/contract`: `ingestionRunResource`, `ingestionErrorResource`, `externalSourceResource`, and the 7 op input bodies. **Do not redefine** — import and re-export (foundation §5 step "re-export/usage of the contract Zod DTOs").
- [ ] Define the **internal per-record payload Zod schemas** the service validates opaque records against (the contract only validates `records: Record<string,unknown>[]`, so the typed shape lives here): `metricRecordSchema` (`{ recordKey?, publicationRef|externalPublicationId, capturedAt, metrics:{...} }`), `knowledgeRecordSchema`, `assetRecordSchema`, `artifactRecordSchema`. These drive partial-success rejection with a stable `errorCode` (e.g. `"SCHEMA_INVALID"`). *(covered by service test rejections)*

### Task 5 — transport (`ingestion.transport.ts`) + registry
- [ ] Write `ingestion.contract.test.ts` first: for each of the 7 op ids, call the transport map handler with a valid `(ctx, input)` and assert the returned `data` **`.parse()`s against `ingestionRunResource`** (the contract DTO) and `meta` carries `requestId`. Assert an unknown op id throws `UnsupportedOperationError`.
- [ ] Implement `ingestionTransport(service)` returning `{ opId → (ctx,input)=>envelope }` mirroring `backend/src/persistence-transport.ts` (now `(ctx, input)`), one case per id:
  - `ingestion.runs.create` → `service.createRun(ctx, body)`
  - `ingestion.runs.metrics` → `service.ingestMetrics(ctx, { runId: params.runId, records: body.records })`
  - `ingestion.runs.knowledge` → `service.ingestKnowledge(ctx, …)`
  - `ingestion.runs.assets` → `service.ingestAssets(ctx, …)`
  - `ingestion.runs.artifacts` → `service.ingestArtifacts(ctx, …)`
  - `ingestion.runs.complete` → `service.completeRun(ctx, { runId, status: body.status })`
  - `ingestion.runs.get` → `service.getRun(ctx, params.runId)`
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
  - Each returns `{ data: <run row mapped to ingestionRunResource>, meta: { requestId: ctx.requestId } }`.
- [ ] Export the map from `index.ts` and **register it in the module transport registry** (`frontend/src/server/persistence-client.ts` — add the 7 ids to the registry/`PERSISTED_OPS` union; no edits to the composite switch beyond registration, foundation §1). *(contract test green)*

### Task 6 — mock external source (`ingestion.mock-source.ts`, foundation §4)
- [ ] Write `ingestion.mock-source.test.ts`: `MockIngestionSource.fetchBatch(externalSourceId, runType)` returns a **deterministic** fixed array of fake records keyed by `runType`; calling twice with the same args returns identical records (idempotent, no network). Used only in dev/seeds and the acceptance smoke; the contract ops accept pushed records directly, so the mock is the *producer* side.
- [ ] Implement `MockIngestionSource implements IngestionSourcePort` (`IngestionSourcePort` defined in shared `@creatoros/backend` adapter seam per foundation §4). Seed one canonical `external_sources` row (`sourceType:"mock"`, owned by the canonical seeded user) in the persistence seed alongside the Projects seed. *(mock test green)*

### Task 7 — FE wiring (from roadmap §4 — Ingestion has NO page)
- [ ] **No `needs-backend` / `wired-local` button rows exist for Ingestion** (grep of roadmap §4 → only the "external skill writes only; no page" note, L69/L502-504). Therefore **no FE island wiring is required**.
- [ ] **Intentionally inert (decorative):** if the Settings/observability surface renders any "数据源 / External Sources" or "导入历史 / Ingestion runs" read-only panel, leave it static — it is **decorative** per roadmap §4 (no button maps to an Ingestion op). Note in the panel's source comment: `// decorative: Ingestion has no FE write surface (roadmap §4 G12); reads are observability-only`.
- [ ] **Optional observability read (only if a Settings sub-tab already exists):** a server read may call `ingestion.runs.get` for a known run id to display status; this rides the existing op, requires no new island, and uses `router.refresh()` semantics already established. If no such surface exists, skip — do not build one (Ingestion is "no page").

### Task 8 — tests (per MODULE-ARCH §2 / foundation §5)
- [ ] `ingestion.service.test.ts` — state-lifecycle guards (pending→running→completed/partial/failed), §17 idempotency (both unique keys + re-submit-returns-original), partial success, candidate-not-promotion for artifacts, Analytics `captured_at` dedupe — **valid + invalid paths** (Task 3).
- [ ] `ingestion.repository.integration.test.ts` — pglite-backed: ownership enforced (user A ≠ user B), both UNIQUE indexes reject dupes, counters bump correctly (Tasks 1–2).
- [ ] `ingestion.contract.test.ts` — each of the 7 op outputs `.parse()`s against `ingestionRunResource`; unknown id → `UnsupportedOperationError` (Task 5).
- [ ] `ingestion.mock-source.test.ts` — determinism/idempotency (Task 6).
- [ ] All green under `pnpm verify` (frontend) + the module's vitest.

### Task 9 — acceptance (SPEC §22)
- [ ] Module has `service` + `repository` + `schema` + `types` + `tests` (the 7 files + 4 test files above).
- [ ] **No cross-module repository import** — `grep -rE "repositories/(publishing|analytics|knowledge|assets|artifacts)" frontend/src/server/modules/ingestion` returns nothing; only `…/modules/<m>/index.ts` Service imports (SPEC §17.6/.7, §22).
- [ ] Routes don't touch the db client — only the dispatch route → registry → transport → service → repository (SPEC §22).
- [ ] **Idempotency for metrics import** holds (SPEC §22 "Publication 与指标导入支持幂等"): re-submitting a batch returns the original result; `(external_source_id, idempotency_key)` and `(run_id, record_key)` UNIQUE enforced; partial-success batches preserved with per-record errors (§17).
- [ ] **AI/candidate gate** respected for artifact pushes — Ingestion creates a candidate version via `ArtifactsService`, never overwriting `current_version` (SPEC §22 "AI 候选内容必须确认后才进入正式业务数据"; roadmap §401).
- [ ] Multi-tenant smoke: a run + records ingested under user A are invisible to user B (`getRun`/`listErrors` 404).
- [ ] No Drizzle row returned as an API type — all 7 op outputs are the explicit `ingestionRunResource` DTO (SPEC §9).

---

## Open questions (flag to orchestrator before execution)

1. **ExternalSource registration op:** SPEC §17 says each Skill "注册一个 ExternalSource," but `contract/src/operations/ingestion.ts` exposes **no** `externalSource.create` op. This plan **seeds** one canonical mock source. Confirm registration stays seed-only (no contract op) for Wave 3, or whether a later contract addition is expected.
2. **`metricRecord` → Publication resolution key:** the fan-out is `resolvePublication` (SPEC §277-281), but the opaque metric record's join key to a `Publication` (external publication id? platform + url?) is not specified in the contract (records are `Record<string,unknown>`). Needs the Publishing module's `resolvePublication` signature (from module 10's `index.ts`) to fix `metricRecordSchema`'s required fields — confirm once Publishing is green.
3. **`auth`/rate-limit seam:** SPEC §20/§639 require Ingestion to use **hashed secret references** and **separate rate-limiting**. Wave 3 mocks the source; confirm whether secret verification + rate-limit middleware on the ingestion dispatch path is in-scope for this module's plan or deferred to a hardening stage (this plan assumes deferred; `secretReference` column is present but not verified at the mock stage).
