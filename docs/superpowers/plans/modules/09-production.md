# Module 09 — Production (TDD execution plan)

> **Wave 3.** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §4 mock adapters). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Production** vertical end-to-end — Production record (mode + settings + status), ProductionSegment timeline, and ExportRecord export/complete with `MockObjectStorage` — so every `needs-backend`/`wired-local` button on the Production Workspace (`/projects/:id/production`) drives a real, user-scoped contract op (FE button → contract op → user-scoped SQL → envelope → render), with the SPEC §11 `completeExport` cross-module fan-out behind a Unit of Work.

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/production/` and registers its `{ opId → handler }` map into the composite transport registry. Owns three entities — `Production`, `ProductionSegment`, `ExportRecord` (+ `SegmentAsset`, used by the decorative asset-attach path; schema created, no op wired this wave). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. No cross-module repository imports — cross-module writes (`completeExport` → Assets/Projects/Search) go through other modules' public `index.ts` service interfaces inside one UoW (foundation §1, SPEC §11/§15: Production never touches S3 directly — it calls `AssetsService.registerGeneratedAsset`; object writes go through the `ObjectStoragePort`/`MockObjectStorage` seam, §4).

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract`, Vitest. ISO-8601 text timestamps + text enums to mirror the Projects slice (`backend/src/schema/projects.ts`).

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth `RequestContext` + §4 `MockObjectStorage`/`ObjectStoragePort` mock adapter) → Wave 2 Projects (`ProjectsService.setPrimaryOutputAsset` + `recordActivity`, ContentOutput ownership), Assets (`AssetsService.registerGeneratedAsset`), Artifacts (TimelineSegment source ref for `script_section_id`); Search (`SearchService.indexAsset`/`upsertDocument`). Roadmap §4 gate is **G10** (deps G5 Projects, G8 Artifacts, G7 Assets, G3 Search).

---

## Contract ops this module owns (grepped from `contract/src/operations/production.ts`)

| op id | method · path | body | response DTO |
|---|---|---|---|
| `outputs.production.get` | GET `/outputs/:outputId/production` | — | `productionResource` |
| `outputs.production.put` | PUT `/outputs/:outputId/production` | `{ productionMode?, status?, recordingConfig?, subtitleConfig? }` | `productionResource` |
| `productions.segments.create` | POST `/productions/:productionId/segments` | `{ title, position, startMs, endMs }` | `productionSegmentResource` |
| `productions.exports.create` | POST `/productions/:productionId/exports` | `{ format, resolution, aspectRatio }` | `exportRecordResource` |
| `exports.complete` | POST `/exports/:exportId/complete` | `{ resultAssetId }` | `exportRecordResource` |

DTO field shapes are fixed by `contract/src/resources/production.ts` — do NOT redefine; import and validate against them. Enums (source of truth = contract resource):
- `productionMode`: `remote_recording | screen_capture | studio`
- Production `status`: `drafting | recording | editing | rendering | ready`
- `exportRecordStatus`: `queued | rendering | ready | failed`
- `segmentAssetUsageType`: `video | broll | overlay | audio | caption`

State machines (SPEC §12 + contract enums — §12 has no explicit Production/Export diagram, so the contract enum ordering is authoritative):
- **Production.status:** `drafting → recording → editing → rendering → ready` (forward-only, adjacent steps; illegal jump → `ConflictError`).
- **ExportRecord.status:** `queued → rendering → ready` happy path; `queued|rendering → failed` (`exports.complete` drives `queued|rendering → ready`).
- **ContentOutput** (owned by Projects, mutated via `ProjectsService` in the `completeExport` UoW): `active → ready` on export complete (roadmap §4 transition for `导出视频`).

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/production/
├── production.db-schema.ts
├── production.repository.ts
├── production.service.ts
├── production.schema.ts
├── production.transport.ts
├── production.errors.ts
├── index.ts
├── production.service.test.ts
├── production.repository.integration.test.ts
└── production.contract.test.ts
```

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/production/production.db-schema.ts`. Define four `pgTable`s mirroring `docs/CreatorOS-data-model.md` lines 464-507, with `user_id TEXT NOT NULL` on every owned row (it is NOT in the data-model ER diagram — it is the ownership column required by foundation §1/§3). Follow the Projects schema conventions exactly: timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `PRODUCTION_DDL` string for pglite init.
  - `productions`: `id` PK, `userId`, `contentOutputId`, `productionMode`, `status`, `recordingConfig` jsonb (default `{}`), `subtitleConfig` jsonb (default `{}`), `startedAt` (nullable), `completedAt` (nullable), `updatedAt` notNull. Add a UNIQUE index on `(content_output_id)` (data-model `CONTENT_OUTPUT ||--o| PRODUCTION` is 0..1).
  - `productionSegments`: `id` PK, `userId`, `productionId`, `scriptSectionId` (nullable — TimelineSegment source ref, SPEC §405 "keeps source ref"), `title`, `position` int, `startMs` int, `endMs` int, `segmentConfig` jsonb (default `{}`).
  - `segmentAssets`: `id` PK, `userId`, `productionSegmentId`, `assetId`, `usageType`, `position` int. (Schema only this wave; the asset-attach button is decorative — see Step 5.)
  - `exportRecords`: `id` PK, `userId`, `productionId`, `resultAssetId` (nullable until complete), `format`, `resolution`, `aspectRatio`, `bitrate` int (default `0`), `status`, `exportConfig` jsonb (default `{}`), `createdAt` notNull, `completedAt` (nullable).
- [ ] Append `PRODUCTION_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep for `PROJECTS_DDL` usage; register `PRODUCTION_DDL` in the same `CREATE TABLE IF NOT EXISTS` init list).
- [ ] **Test (in `production.repository.integration.test.ts`, first red):** a row inserted into each of the four tables round-trips via `db.select()` with all columns intact (jsonb defaults `{}`, nullable timestamps `null`).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/production/production.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createProductionRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. A private `getProductionRowById(productionId)` and `getByContentOutputId(contentOutputId)` throw `OwnershipError` (message `OwnershipError: production not found: <id>`) when the scoped select returns empty — never reveal cross-user existence (foundation §2: 404 not 403).
  - `getProductionByOutput(outputId): Promise<ProductionRow>` — `where(and(eq(productions.userId, deps.userId), eq(productions.contentOutputId, outputId)))`; throw `OwnershipError` if absent.
  - `ensureProductionForOutput(outputId): Promise<ProductionRow>` — get-or-create: select scoped by output; if none, insert a `drafting` row (`productionMode: "remote_recording"`, empty configs, `startedAt: null`, `updatedAt: now()`). (Backs the initial `GET` load when production hasn't been entered yet — roadmap §4 `导入脚本`/initial load.)
  - `updateProduction(productionId, patch: { productionMode?, status?, recordingConfig?, subtitleConfig? })` — scoped `get` first (ownership), then scoped `update … where eq(id) and eq(userId)`, set `updatedAt: now()`; return row. (Status-machine guard lives in the service, not here — repository only executes service-approved updates, SPEC §12.)
  - `createSegment(productionId, { title, position, startMs, endMs })` — scoped ownership check on the parent production, then insert `{ id: nextId("segment"), userId, productionId, scriptSectionId: null, segmentConfig: {} }`; return row.
  - `listSegments(productionId)` — scoped, `orderBy(asc(productionSegments.position))`.
  - `createExport(productionId, { format, resolution, aspectRatio })` — scoped ownership on production, insert `{ id: nextId("export"), userId, productionId, resultAssetId: null, bitrate: 0, status: "queued", exportConfig: {}, createdAt: now(), completedAt: null }`; return row.
  - `getExport(exportId)` / `completeExportRow(exportId, { resultAssetId, status })` — both scoped by `eq(exportRecords.userId, deps.userId)`; `completeExportRow` sets `resultAssetId`, `status`, `completedAt: now()`; return row.
- [ ] **Tests (`production.repository.integration.test.ts`, pglite-backed):**
  - ownership: build repo with `userId: "user-a"`, insert a production; build a second repo with `userId: "user-b"`; `getProductionByOutput` for the same output from repo-B throws `OwnershipError` (user A's row invisible to B).
  - `ensureProductionForOutput` is idempotent: two calls for the same `outputId` return the SAME `id` (no duplicate row; UNIQUE on `content_output_id`).
  - `listSegments` returns in `position` order regardless of insert order.

## Step 3 — service (RequestContext + §12 state machines)

- [ ] Create `frontend/src/server/modules/production/production.errors.ts`: `OwnershipError`, `ConflictError`, `UnsupportedOperationError` re-use the foundation error types (import from shared infra; do not redefine if they already exist there).
- [ ] Create `frontend/src/server/modules/production/production.service.ts`. Every public method takes `(ctx: RequestContext, …)`; it builds a repository bound to `ctx.userId` (`createProductionRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. Methods:
  - `getProduction(ctx, outputId)` → `repo.ensureProductionForOutput(outputId)` then map row → `productionResource` DTO (see Step 4 mapper). Backs `outputs.production.get`.
  - `updateProduction(ctx, outputId, patch)` — resolve production via `repo.getProductionByOutput(outputId)`; if `patch.status` present, enforce the **Production.status machine**: allowed only when `STATUS_ORDER.indexOf(next) - STATUS_ORDER.indexOf(current) === 1` where `STATUS_ORDER = ["drafting","recording","editing","rendering","ready"]` (no skips, no backward), else throw `ConflictError`. On entering `recording` from `drafting`, stamp `startedAt = now()` if null; on reaching `ready`, stamp nothing here (export-complete owns ContentOutput). Then `repo.updateProduction(production.id, patch)`. Backs `outputs.production.put`.
  - `createSegment(ctx, productionId, body)` — `repo.createSegment`; return DTO. Backs `productions.segments.create`.
  - `requestExport(ctx, productionId, body)` — `repo.createExport` (status `queued`); return DTO. Backs `productions.exports.create`. (Mock render is async/out-of-band; the export sits `queued` until `completeExport`.)
  - `completeExport(ctx, exportId, { resultAssetId })` — the SPEC §11 cross-module UoW. Inside one `UnitOfWork.run` (foundation §1, SPEC §11):
    1. `repo.getExport(exportId)` (ownership); guard status is `queued | rendering` else `ConflictError` (idempotency: if already `ready`, return the existing row without re-running fan-out — SPEC §22 idempotency).
    2. `repo.completeExportRow(exportId, { resultAssetId, status: "ready" })`.
    3. fan-out via **public service interfaces** (no repo imports): `AssetsService.registerGeneratedAsset(ctx, { assetId: resultAssetId, … })` (the file itself was staged through `MockObjectStorage` per §4; Production never calls S3 — SPEC §15), `ProjectsService.setPrimaryOutputAsset(ctx, { outputId, assetId: resultAssetId })`, `SearchService.indexAsset(ctx, resultAssetId)`, `ProjectsService.recordActivity(ctx, { … export_completed … })`. Drive the ContentOutput `active → ready` transition through `ProjectsService` (roadmap §4 transition for `导出视频`).
    4. Post-commit side-effects (Search index, Notifications) run AFTER the main transaction succeeds; a post-effect failure records a retryable state, never rolls back the export fact (SPEC §11). Return the completed `exportRecordResource` DTO.
- [ ] **Tests (`production.service.test.ts`, fake `now`/`nextId`, in-memory/pglite db, stubbed peer services):**
  - status machine valid path: `drafting → recording` stamps `startedAt`; `recording → editing → rendering → ready` each succeed.
  - status machine invalid: `drafting → editing` (skip) throws `ConflictError`; `editing → recording` (backward) throws `ConflictError`.
  - `requestExport` yields a `queued` ExportRecord with `resultAssetId: null`.
  - `completeExport` happy path: stubbed `ProjectsService`/`AssetsService`/`SearchService` each called exactly once with `ctx`; returned DTO is `status: "ready"` with `completedAt` set.
  - `completeExport` idempotency: calling twice does NOT call the fan-out twice; second call returns the already-`ready` row.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/production/production.schema.ts`: re-export the contract DTOs/enums used (`productionResource`, `productionSegmentResource`, `exportRecordResource`, `productionOperations`) — single import surface for this module.
- [ ] Create `frontend/src/server/modules/production/production.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2: transport signature gains `ctx`). Export `createProductionTransport(service)` returning a `{ request(ctx, endpoint, input) }` with a `switch (endpoint.id)`:
  - `"outputs.production.get"` → `service.getProduction(ctx, params.outputId)`, `meta: singleMeta`.
  - `"outputs.production.put"` → `service.updateProduction(ctx, params.outputId, body)`.
  - `"productions.segments.create"` → `service.createSegment(ctx, params.productionId, body)`.
  - `"productions.exports.create"` → `service.requestExport(ctx, params.productionId, body)`.
  - `"exports.complete"` → `service.completeExport(ctx, params.exportId, body)`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/production/index.ts` exporting the public service interface + the op-id list `["outputs.production.get","outputs.production.put","productions.segments.create","productions.exports.create","exports.complete"]` and a `registerProduction(registry)` that adds the transport map. Register this module in the composite transport registry (foundation §1: union builds `PERSISTED_OPS` — no edit to the composite switch).
- [ ] **Tests (`production.contract.test.ts`):** for EACH of the five op ids, drive the transport with a seeded ctx + valid input and assert `productionOperations[<key>].response.parse(envelope.data)` succeeds (output validates against the contract DTO). Include the `exports.complete` happy path producing a DTO whose `status` parses as `"ready"`.

## Step 5 — FE island wiring (from roadmap §4 `/projects/:id/production` rows)

Edit `frontend/src/features/production/production-interactive-region.tsx` (+ the server shell `production-workspace-page.tsx` for the initial read). Preserve the `viewModel?` seam. Server read switches from fixture to the real op: load via `outputs.production.get`, hydrate `productionId`/`status`/segments into the `ProductionViewModel`. Each row below is wired exactly per §4:

| §4 label | §4 state | wiring |
|---|---|---|
| `真人口播 mode` | wired-local→backend | mode card select → on click call `outputs.production.put` `{ productionMode: "remote_recording" }`, then `router.refresh()`. |
| `知识演示 mode` | wired-local→backend | mode card → `outputs.production.put` `{ productionMode: "screen_capture" }` + `router.refresh()`. |
| `AI 数字人 mode (disabled)` | **decorative** | `comingSoon` card stays `disabled` — **intentionally inert** (no op). |
| `导入脚本` | **decorative** | `href="#"` link — inert; initial production load is the server `outputs.production.get` (not this link). |
| `Asset category tab` | wired-local (Assets) | client-only filter; reads `GET /assets` (Assets module) — no Production op. |
| `Asset thumbnail` | **decorative** | attach-asset-to-segment is **not wired this wave** (`segmentAssets` schema exists, no op) — **intentionally inert**. |
| `Preview aspect 16:9` | **decorative** | inert toggle — intentionally inert. |
| `Preview play / pause / reset` | wired-local | local `playing` state only — no network (keep as-is). |
| `设备检测 / 预览字幕效果` | **decorative** | `href="#"` settings links — intentionally inert. |
| `Recording overlay toggle` | wired-local→backend | `rec-overlay` switch → `outputs.production.put` `{ recordingConfig: { overlay: <checked> } }` + `router.refresh()`. |
| `AI subtitle toggle` | wired-local→backend | `sub-ai-generate` switch → `outputs.production.put` `{ subtitleConfig: { aiGenerate: <checked> } }` + `router.refresh()`. |
| `Settings value chips` | **decorative** | fixed non-toggle chips — intentionally inert (§4 notes "should be selects"; not wired this wave). |
| `导出视频` | **needs-backend** | export button → `productions.exports.create` `{ format: "mp4", resolution: "1080p", aspectRatio: "16:9" }`; on the returned export id, the mock-render completion calls `exports.complete` `{ resultAssetId }` (`MockObjectStorage` returns the fake asset). Surface the resulting state, then `router.refresh()`. Transition: ContentOutput `active → ready`. Replace the local `idle→done` stub. |
| `添加章节 / 添加新片段` | wired-local→backend | both "add" buttons → `productions.segments.create` `{ title: "新章节 N", position: <next>, startMs, endMs }` (derive ms from the existing `parseTimestamp`/`formatTimestamp` helpers) + `router.refresh()`. |
| `Timeline segment card` | wired-local | select-only client state (drag-reorder NOT impl) — no op (keep as-is). |

- [ ] Update `production-interactions.test.tsx`: assert the wired buttons issue the mapped op via the HttpTransport mock (mode select → `outputs.production.put`; 导出视频 → `productions.exports.create` then `exports.complete`; 添加章节 → `productions.segments.create`), and that decorative controls (AI 数字人, asset thumbnail, aspect 16:9, 设备检测, value chips, 导入脚本) issue **no** network call.

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `production.service.test.ts` (state-machine guards valid+invalid, completeExport UoW + idempotency), `production.repository.integration.test.ts` (pglite, ownership user-A-vs-user-B, ensure idempotency, position ordering), `production.contract.test.ts` (each of 5 ops validates against its contract DTO).
- [ ] **Acceptance checklist (SPEC §22):** module ships service + repository + schema + tests; **no cross-module repository import** (peer access only via `index.ts` service interfaces); the dispatch route does not touch the db client (it threads `ctx` into `compositeTransport.request`); ExportRecord export/complete is **idempotent** (SPEC §22); `completeExport` fan-out atomic within one UoW with post-commit Search/Notifications; ContentOutput `active → ready` driven only through `ProjectsService`; Production never calls S3 — object writes go through `MockObjectStorage` (§4).
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. `completeExport` is triggered by a mock render finishing — does the FE poll for completion or does `productions.exports.create` synchronously stage + immediately call `exports.complete` in dev (simplest deterministic path for the §4 `导出视频` button)? Recommend: synchronous stage→complete in the dev mock; real async render is a stage-N swap.
2. `resultAssetId` for `exports.complete` — confirm `AssetsService.registerGeneratedAsset` returns the asset id BEFORE `completeExport` stamps it, or whether Production mints the asset id and Assets registers against it (ordering inside the UoW). Recommend: Assets mints + returns id, Production stamps it.
3. `bitrate` has no contract input field but is a non-null DTO field — confirm derivation from `resolution` (e.g. a fixed lookup `1080p → 8_000_000`) vs default `0` at request and real value at complete.
