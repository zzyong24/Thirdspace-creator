# Module 08 — Artifacts — Executable TDD Plan (Wave 2)

> **For agentic workers:** REQUIRED SUB-SKILL `superpowers:test-driven-development` + `superpowers:executing-plans`. This plan follows the **keystone** conventions in `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 (per-module template) and §1 (module file layout, user-scoped repos, transport registry, globalThis pglite singleton). Steps use `- [ ]`. Each step is RED→GREEN; do not batch.

**Goal:** Wire the Artifacts module end-to-end (FE button → contract op → user-scoped SQL → render) for the **Script** and **Planning** workspaces (+ Research evidence links it owns), with **ArtifactVersion immutable** (new candidate version, never overwrite current) and **restore = clone-to-new-version**. AI-adopt promotes an AI candidate version through the AI confirm path (owned by Module 15; this plan exposes the version-create seam it calls).

**Architecture:** Modular monolith under the Next app. New module dir `frontend/src/server/modules/artifacts/` per foundation §1 layout. Repository queries are **user-scoped only** (`eq(table.userId, ctx.userId)`); the artifact-owned child tables (versions/relations/thesis/script/evidence/timeline) are scoped transitively via a parent-artifact ownership guard that itself filters on `ctx.userId`. Service takes `RequestContext`, implements the append-only version invariant (data-model §9 rules 6–7; SPEC §18) and the no-state-machine append-only versioning callout (roadmap §5). Transport exposes the 7 contract ops below and is registered into the module registry; no edits to `compositeTransport` logic — Artifacts ops are added to `PERSISTED_OPS` via the registry union.

**Tech Stack:** TypeScript strict · Drizzle ORM over pglite (pure-WASM Postgres, `globalThis` singleton) · Zod DTOs re-exported from `@creatoros/contract` · Vitest (service unit, repository pglite-integration, contract-conformance). Timestamps stored as ISO-8601 text (matches `iso8601` contract primitive; no tz round-tripping), enums as text validated by the contract Zod on output — same conventions as the proven Projects slice (`backend/src/schema/projects.ts`, `backend/src/repositories/project-repository.ts`, `backend/src/persistence-transport.ts`).

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth + mock adapters) → Wave 2 **Projects** (artifacts hang off `projectId`/`contentOutputId`) → **Knowledge** + **Assets** (evidence-link targets validated via their public services) → **Search** (index on version create). Artifacts joins Wave 2 only after Projects, Knowledge, and Assets land. AI (Module 15) consumes the version-create seam this module exposes; it is a downstream consumer, not a blocker.

---

## Contract ops this module owns (grepped from `contract/src/operations/artifacts.ts`)

| Op id | Method · path | Body / params | Response DTO |
|---|---|---|---|
| `artifacts.list` | GET `/projects/:projectId/artifacts` | params `{projectId}`, query pagination | `artifactResource` (list) |
| `artifacts.create` | POST `/projects/:projectId/artifacts` | body `{title, artifactType, stage}` | `artifactResource` |
| `artifacts.get` | GET `/artifacts/:artifactId` | params `{artifactId}` | `artifactResource` |
| `artifacts.versions.create` | POST `/artifacts/:artifactId/versions` | body `{contentText, changeSummary}` | `artifactVersionResource` |
| `artifacts.versions.list` | GET `/artifacts/:artifactId/versions` | params `{artifactId}`, query pagination | `artifactVersionResource` (list) |
| `artifacts.restore` | POST `/artifacts/:artifactId/restore` | body `{versionId}` | `artifactResource` |
| `artifacts.relations.create` | POST `/artifacts/:artifactId/relations` | body `{targetArtifactId, relationType}` | `artifactRelationResource` |

Resource DTOs live in `contract/src/resources/artifacts.ts`: `artifactResource`, `artifactVersionResource`, `artifactRelationResource` (+ structured `thesisNodeResource`, `scriptSectionResource`, `evidenceLinkResource`, `timelineSegmentResource` for the structured-content tables this module owns but which have no top-level §13 op — they are written via `replaceStructuredContent` invoked inside `versions.create`).

---

## Step 1 — db-schema (`artifacts.db-schema.ts`)

**File:** `frontend/src/server/modules/artifacts/artifacts.db-schema.ts`

- [ ] RED: write `artifacts.repository.integration.test.ts` case `"schema round-trips: insert artifact + version, select back"` — fails (no table).
- [ ] GREEN: define Drizzle `pgTable`s + raw DDL (`ARTIFACTS_DDL`), mirroring the proven `schema/projects.ts` style (text PK, `user_id` text NOT NULL on the **owned-root** table, ISO-8601 text timestamps, enums as text, `jsonb` for `content_data`/`production_data`). Tables:
  - `artifacts` — `id` PK, `userId` (owner), `projectId`, `contentOutputId` (nullable), `currentVersionId` (nullable until first version), `stage`, `artifactType`, `title`, `status` (`drafting|in_review|approved|archived`, default `drafting`), `archivedAt` (nullable), `createdAt`, `updatedAt`.
  - `artifact_versions` — `id` PK, `artifactId`, `versionNumber` integer, `contentText`, `contentData` jsonb (default `{}`), `changeSummary`, `createdByType` (`user|ai|import`, default `user`), `aiTaskId` (nullable), `createdAt`. **No `updatedAt`** (immutable per data-model §9 rule 6).
  - `artifact_relations` — `id` PK, `sourceArtifactId`, `targetArtifactId`, `relationType` (`derived_from|references|replaces|supports|summarizes`), `createdAt`.
  - `thesis_nodes` — `id` PK, `artifactVersionId`, `parentNodeId` (nullable), `nodeType` (`root|core_thesis|supporting|evidence|counterpoint`), `title`, `content`, `position` integer.
  - `script_sections` — `id` PK, `artifactVersionId`, `parentSectionId` (nullable), `sectionType` (`hook|intro|body|transition|outro|golden_quote`), `title`, `content`, `position` integer, `startSeconds` (nullable real), `endSeconds` (nullable real).
  - `evidence_links` — `id` PK, `artifactVersionId`, `thesisNodeId` (nullable), `knowledgeItemId` (nullable), `assetId` (nullable), `excerpt`, `relationType` text, `confidence` real, `position` integer.
  - `timeline_segments` — `id` PK, `artifactVersionId`, `scriptSectionId` (nullable), `title`, `position` integer, `startMs` integer, `endMs` integer, `productionData` jsonb (default `{}`).
  - Ownership note: only `artifacts` carries `user_id`. Child tables (`artifact_versions`, structured tables) are owned transitively through `artifactId`/`artifactVersionId` → guarded by the repo's `requireArtifact(ctx, id)` which filters `eq(artifacts.userId, ctx.userId)`. `artifact_relations` is guarded by ownership of `sourceArtifactId`.
- [ ] GREEN: export `ARTIFACTS_DDL` (single `CREATE TABLE IF NOT EXISTS` block per table); register it into the shared db init alongside `PROJECTS_DDL` (extend `backend/src/db.ts` `createDb` to `await client.exec(ARTIFACTS_DDL)`, or the registry's DDL aggregator if Wave-0 introduced one).
- [ ] Verify: integration test schema round-trip GREEN.

## Step 2 — repository (`artifacts.repository.ts`) — USER-SCOPED ONLY

**File:** `frontend/src/server/modules/artifacts/artifacts.repository.ts`

Pattern: `createArtifactRepository(db, deps: { now, nextId, userId })` exactly like `createProjectRepository`. **Every** query that reads/writes an `artifacts` row filters `eq(artifacts.userId, deps.userId)`. The private `requireArtifact(artifactId)` is the single ownership gate (throws `OwnershipError` → 404, never 403, per SPEC §14); every child-table method calls it first, so child rows are never reachable cross-user.

- [ ] RED: `artifacts.repository.integration.test.ts` case `"user A cannot read user B's artifact (OwnershipError)"` — seed an artifact for user B, build repo with user A's id, expect `requireArtifact` to throw OwnershipError. (Foundation §5 mandated ownership test.)
- [ ] GREEN: implement methods (all user-scoped):
  - `seedArtifacts(rows)` — `insert(...).onConflictDoNothing()` (deterministic seed parity, like `seedProjects`).
  - `listByProject(projectId)` — `where(and(eq(artifacts.userId, userId), eq(artifacts.projectId, projectId)))`, `orderBy(asc(createdAt))`.
  - `requireArtifact(artifactId)` — `where(and(eq(artifacts.id, artifactId), eq(artifacts.userId, userId)))`; `[0]` or throw `OwnershipError`.
  - `create({projectId, title, artifactType, stage})` — insert artifact with `userId`, `status:"drafting"`, `currentVersionId: null`, ts; then create version 1 (empty contentText) and set `currentVersionId`. Returns the artifact row.
  - `createVersion(artifactId, {contentText, changeSummary, createdByType?, aiTaskId?})` — `requireArtifact` first; compute `versionNumber = (max existing for artifactId) + 1`; insert immutable `artifact_versions` row (`createdByType` default `"user"`); **then** `update(artifacts).set({currentVersionId: newId, updatedAt: ts})` — promotion is a parent-row pointer move, the version itself is never mutated. Returns the new version row.
  - `listVersions(artifactId)` — `requireArtifact`; `where(eq(artifactVersions.artifactId, artifactId))`, `orderBy(asc(versionNumber))`.
  - `restore(artifactId, versionId)` — `requireArtifact`; load the target version (assert `artifactId` matches — data-model §9 rule 7); **clone its content into a NEW version** (`versionNumber = max+1`, `changeSummary: "restore v{n}"`, `createdByType:"user"`); set `currentVersionId` to the clone. Never re-point to the old id. Returns the artifact row.
  - `createRelation(sourceArtifactId, {targetArtifactId, relationType})` — `requireArtifact(sourceArtifactId)` AND `requireArtifact(targetArtifactId)` (both must be owned by `userId`); insert `artifact_relations` row. Returns it.
  - `replaceStructuredContent(artifactVersionId, {thesisNodes?, scriptSections?, evidenceLinks?, timelineSegments?})` — internal; delete-then-insert the structured rows for that version id (version-scoped, immutable plan: only ever called when minting a NEW version, never on an existing live one).
  - `getScriptSections(artifactVersionId)` — `orderBy(asc(position))`.
- [ ] GREEN: `RepoDeps` = `{ now: () => string; nextId: (prefix) => string; userId: string }` (same shape as Projects).
- [ ] Verify: ownership test + each-method round-trip GREEN; grep the file for `db.select`/`db.update`/`db.insert` on `artifacts` and confirm **every** one is gated by `userId` or by a prior `requireArtifact`.

## Step 3 — service (`artifacts.service.ts`) — RequestContext + invariants

**File:** `frontend/src/server/modules/artifacts/artifacts.service.ts`

Artifacts has **no lifecycle state machine** (roadmap §5: "No machine for Knowledge/Artifacts — append-only versioning"). The invariants the service enforces are the **append-only version** rules (SPEC §18, data-model §9 rules 6–7), not status transitions. The `artifactStatus` enum (`drafting→in_review→approved→archived`) is set by `createVersion`/explicit approve commands but is monotonic metadata, not a guarded FSM in this wave.

- [ ] RED: `artifacts.service.test.ts` cases:
  1. `"createVersion appends and re-points currentVersionId; prior version row is byte-identical after"` (immutability).
  2. `"restoreVersion creates a NEW version (max+1), does not re-point to the old id"`.
  3. `"createVersion with createdByType 'ai' + aiTaskId records candidate provenance"` (the AI-adopt seam).
  4. `"createRelation rejects a target the ctx.userId does not own (OwnershipError)"`.
  5. `"replaceStructuredContent only runs against a freshly-minted version id"` (guard: refuse if `artifactVersionId !== artifact.currentVersionId` AND it is not the just-created one — keeps the immutable plan rule of roadmap §5 callout 5).
- [ ] GREEN: methods take `(ctx: RequestContext, ...)`, derive the user-scoped repo via `repoFor(ctx)` (`createArtifactRepository(db, { now, nextId, userId: ctx.userId })`):
  - `listProjectArtifacts(ctx, projectId)` → `repo.listByProject`.
  - `getArtifact(ctx, artifactId)` → `repo.requireArtifact`.
  - `createArtifact(ctx, {projectId, title, artifactType, stage})` → `repo.create`.
  - `createVersion(ctx, artifactId, {contentText, changeSummary, createdByType?, aiTaskId?})` → `repo.createVersion`; post-commit (SPEC §11) call `SearchService.upsertDocument` with the artifact DTO (failure is retryable, never rolls back). For Script saves, this is the **保存** path.
  - `listVersions(ctx, artifactId)` → `repo.listVersions`.
  - `restoreVersion(ctx, artifactId, versionId)` → `repo.restore`.
  - `createRelation(ctx, artifactId, {targetArtifactId, relationType})` → `repo.createRelation`. For evidence/derivation wiring (Planning EvidenceMap, Script derived-from).
  - `replaceStructuredContent(ctx, artifactVersionId, payload)` → after validating evidence targets via `KnowledgeService.assertKnowledgeOwned` / `AssetsService.assertAssetOwned` for any `knowledgeItemId`/`assetId` in `evidenceLinks` (MODULE-ARCH §4.3 dependency note — Knowledge/Assets never depend back on Artifacts), then `repo.replaceStructuredContent`.
  - `getScriptSections(ctx, artifactVersionId)` → `repo.getScriptSections`.
  - `assertArtifactOwned(ctx, artifactId)` → guard for AI/Ingestion callers (returns the artifact ref or throws OwnershipError).
- [ ] GREEN: `confirmResult` integration (SPEC §18) — the AI module's `AiService.confirmResult` calls `artifactsService.createVersion(ctx, artifactId, { contentText: candidate.text, changeSummary: candidate.summary, createdByType: "ai", aiTaskId })`. Artifacts does **not** import AI; AI imports Artifacts via `index.ts`. Document this seam; no code in this module beyond accepting `createdByType:"ai"`.
- [ ] Verify: 5 service tests GREEN.

## Step 4 — transport (`artifacts.transport.ts`) + registry

**File:** `frontend/src/server/modules/artifacts/artifacts.transport.ts`

Pattern: `createArtifactsTransport(service)` returning `{ request(endpoint, ctx, input) }`, a `switch (endpoint.id)` over the 7 op ids; `default` throws `UnsupportedOperationError(endpoint.id)`. Mirror `backend/src/persistence-transport.ts` exactly, but the handler signature now threads `ctx` (foundation §2: the transport gains a `ctx` param). `listMeta`/`singleMeta` envelope helpers identical to the proven slice.

- [ ] RED: `artifacts.contract.test.ts` case per op `"<opId> output validates against <DTO>.parse()"` — fails (no transport).
- [ ] GREEN: implement the switch:
  - `artifacts.list` → `service.listProjectArtifacts(ctx, params.projectId)` → `{ data: rows, meta: listMeta(rows.length) }`.
  - `artifacts.create` → `service.createArtifact(ctx, { projectId: params.projectId, ...body })` → single.
  - `artifacts.get` → `service.getArtifact(ctx, params.artifactId)` → single.
  - `artifacts.versions.create` → `service.createVersion(ctx, params.artifactId, body)` → single (`artifactVersionResource`).
  - `artifacts.versions.list` → `service.listVersions(ctx, params.artifactId)` → list.
  - `artifacts.restore` → `service.restoreVersion(ctx, params.artifactId, body.versionId)` → single (`artifactResource`).
  - `artifacts.relations.create` → `service.createRelation(ctx, params.artifactId, body)` → single (`artifactRelationResource`).
- [ ] GREEN: export the `{ opId → handler }` map from `index.ts`; register into the module transport registry (foundation §1) so the union adds these 7 ids to `PERSISTED_OPS`. **No edit to `compositeTransport`'s body.** Until Wave-0 registry lands, the interim wiring adds the 7 ids to the `PERSISTED_OPS` Set in `frontend/src/server/persistence-client.ts` and routes them to the artifacts transport — but the registry path is the target.
- [ ] Verify: contract tests GREEN — each op's `data` parses against its DTO (lists parse element-wise).

## Step 5 — FE island wiring (from program-roadmap §4 button rows)

Server reads switch to the real ops (`artifacts.list` / `artifacts.get` / `artifacts.versions.list`) via `await client.*`; the `viewModel?` seam is preserved. Each mutation island calls the mapped op then `router.refresh()`.

### Script Workspace `/projects/:id/script` (roadmap §4 Script table)
- [ ] **保存 / Save** (`needs-backend`) → `artifacts.versions.create` with `{contentText, changeSummary}`; on success clear the dirty flag + `router.refresh()`. Transition per row: edits → new `current_version`.
- [ ] **Section body editor** (textarea per section, `needs-backend`) → its edits feed the same **保存** version-create payload (one new ArtifactVersion per save, not per keystroke); dirty → new version on save.
- [ ] **AI 写作建议 rows** (`needs-backend`) → adopt path `POST /ai/tasks/:id/confirm` (Module 15) → which calls `artifacts.versions.create` with `createdByType:"ai"`. This module's job: ensure `artifacts.versions.create` accepts the AI-minted candidate and promotes it. Transition: AI Task `awaiting_confirmation→completed`; candidate→current.
- [ ] **版本记录 cards** (`decorative` today) → lift to a client island: list via `artifacts.versions.list`; **Restore** action → `artifacts.restore` `{versionId}` + `router.refresh()`. (Inventory marks decorative; this is the planned uplift — note in PR that it becomes interactive.)
- [ ] **4 tabs (主脚本/章节/引用/摘要)** (`decorative`) → read-only sub-view switch off `artifacts.get`; **keep inert as panel-switch only** (no mutation) — no version write. Mark intentionally inert beyond local tab state.
- [ ] **16 toolbar buttons** (bold/italic/.../link, `wired-local`) → leave as `aria-pressed` visual-only; **intentionally inert** (no RTE in this wave). Documented decorative.
- [ ] **大纲结构 rows / 金句 rows** (`decorative`) → jump-to-section / display off `artifacts.get`; **intentionally inert** (navigation only, no op).

### Planning Workspace `/projects/:id/planning` (roadmap §4 Planning table — all rows currently `decorative`; this is the greenfield uplift)
- [ ] **5 planning tabs (合同/论点树/证据/受众/差异化)** → read-only sub-view off `artifacts.list` (filter by `artifactType`); panel-switch only, **intentionally inert** beyond local tab state.
- [ ] **ContractCard ×4** (`decorative`) → "approve contract dimension" lifts to island → `artifacts.versions.create` on the `content_contract` artifact (records the edited contract as a new version). Transition noted in row: ContentOutput `draft→active` is owned by **Projects** (`outputs.stage.transition`), not Artifacts — Artifacts only mints the version; the output transition is a Projects-module call. Mark the cross-module half as Projects-owned.
- [ ] **CoreThesisCard** (`decorative`) → edit → `artifacts.versions.create` on the `thesis_tree` artifact (core thesis lives in `thesis_nodes` of the new version via `replaceStructuredContent`).
- [ ] **ThesisTree root / column nodes** (`decorative`) → edit/create ThesisNodes → `artifacts.versions.create` on the `thesis_tree` artifact, structured payload routed through `replaceStructuredContent` (thesis tree is immutable-per-version; editing mints a new version). This is the module's **Planning thesis tree** focus.
- [ ] **EvidenceMap rows** (`decorative`) → attach/detach EvidenceLink → `artifacts.relations.create` for cross-artifact `supports`/`references` relations; intra-version evidence (`evidence_links` rows pointing at knowledge/asset) goes through `replaceStructuredContent` on a new version. Targets validated via Knowledge/Assets services (Step 3).
- [ ] **查看全部 (contract)** (`decorative`) → opens the contract artifact via `artifacts.get`; **intentionally inert** as a read-only deep-link until an editor surface exists.
- [ ] **KeyMaterials rows / 全部素材 / Status·type TagChips** (`decorative`, Assets/Taxonomy-owned) → **intentionally inert** for Artifacts; KeyMaterials/全部素材 read via `assets.*` (Module 07), pills are presentational. Not this module's ops.

### Research Workspace `/projects/:id/research` (roadmap §4 Research — evidence rows)
- [ ] **证据收藏行 (Link/unlink evidence)** — roadmap maps this to `knowledge.relations.create` (Knowledge-owned). Where the evidence is an **artifact-to-artifact** support relation it instead uses `artifacts.relations.create`. Coordinate with Module 06; Artifacts owns only the artifact-side relation. Note the split.

## Step 6 — tests (per MODULE-ARCH §2)

- [ ] `artifacts.service.test.ts` — the 5 cases in Step 3 (immutability, restore-as-new, AI candidate provenance, relation ownership, structured-content guard) all GREEN.
- [ ] `artifacts.repository.integration.test.ts` — pglite-backed: schema round-trip (Step 1), cross-user OwnershipError (Step 2), version-number monotonicity, restore clones content, `replaceStructuredContent` delete-then-insert, `getScriptSections` ordered by position. **Ownership: user A cannot read user B** — required by foundation §5.
- [ ] `artifacts.contract.test.ts` — each of the 7 ops' output validates against its contract DTO (`artifactResource` / `artifactVersionResource` / `artifactRelationResource`); list ops validate element-wise; `meta` matches the envelope (`requestId`; list adds `page`/`pageSize`/`total`).
- [ ] Architecture guard: no cross-module repository import (only `index.ts` of Knowledge/Assets/Search imported); route does not touch the db client (dependency-cruiser/ESLint boundary test from Wave 0 covers it — add Artifacts to its scope).

## Step 7 — acceptance (SPEC §22)

- [ ] Module has service + repository + schema + types + tests (the 3 test files above).
- [ ] No cross-module repository import; routes/RSC do not touch the db client (only `index.ts` public service + transport map are imported outward).
- [ ] **ArtifactVersion immutable** (SPEC §22, data-model §9 rule 6): assert no `update`/`delete` is ever issued against `artifact_versions`; edits/restores only ever `insert` a new row and move `artifacts.currentVersionId`. A test greps the repo source for `update(artifactVersions)` / `delete(artifactVersions)` and fails if present.
- [ ] `Artifact.currentVersionId` always points at a version of the SAME artifact (rule 7) — covered by restore + createVersion tests.
- [ ] AI candidate-confirm gate (SPEC §18): AI never writes the current version directly; it only supplies a candidate to `createVersion(createdByType:"ai")` through `AiService.confirmResult`. Artifacts exposes no AI-bypass path.
- [ ] `pnpm verify` (frontend: lint/tsc/tests/build) GREEN + the 3 module test files GREEN; multi-tenant smoke (user A cannot see user B's artifacts) passes.

---

### Decorative / intentionally-inert (documented, no op)

- Script: 16 toolbar formatting buttons (visual `aria-pressed` only, no RTE), 4 sub-view tabs (panel-switch), 大纲结构 rows, 金句 rows, AI 写作建议 *display* (the adopt action is wired; the static rows are display).
- Planning: 5 sub-view tabs (panel-switch), 查看全部 (read-only deep-link), KeyMaterials/全部素材 (Assets-owned), Status/type TagChips (presentational).
- These are marked inert per roadmap §4 state; uplifts noted where this plan lifts a `decorative` row to a real island (版本记录 restore, ContractCard/CoreThesisCard/ThesisTree/EvidenceMap edits).
