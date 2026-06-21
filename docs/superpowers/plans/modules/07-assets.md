# Module 07 — Assets (素材库) — Executable TDD Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` + `superpowers:executing-plans`. Steps are `- [ ]`, TDD-ordered (red → green). This plan follows the KEYSTONE `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 per-module template and §1 architecture verbatim. Do **not** write implementation code into the app from this doc — this is the plan; a later execution wave runs it.

## Goal

Wire the **Assets** module end-to-end: FE button → contract op → user-scoped SQL → render. Own SPEC §13 「知识与素材 / 素材库」 (the `assets.*` op group), implement the §12 Asset lifecycle state machine (`active ↔ archived`, `active → deleted` trash / `deleted → active` restore), and back the two-phase upload through the **`MockObjectStorage`** swap-seam port (foundation §4). Light up the **5 needs-backend** controls on `/assets`; leave the **28 decorative** controls intentionally inert (documented below); preserve the **1 wired-local** control. AssetsService is the **only** module allowed to touch object storage (SPEC §15).

## Architecture (per foundation §1)

- Module lives at `frontend/src/server/modules/assets/` (MODULE-ARCH §2 layout). The **only** public entry is `index.ts` (service interface + transport map). No cross-module repository imports.
- **User-scoped repositories**: every query filters `eq(assets.userId, ctx.userId)` (and joins to the owning asset for `asset_files`); every insert stamps `ctx.userId`. Cross-user access → `OwnershipError` → 404 (SPEC §14/§20, never 403 — no existence leak).
- **RequestContext** threaded from the `/api/v1/dispatch` route (foundation §2); transport handlers take `(ctx, input)`.
- **Object storage** behind `ObjectStoragePort`; this wave binds `MockObjectStorage` (in-memory map; deterministic fake `storageKey` + signed URL; no network). Real S3 is a stage-N swap, no domain change.
- **pglite singleton** on `globalThis` (shared infra `@creatoros/backend`); DDL appended to the shared init.
- Transport registered into the module registry → composite transport builds `PERSISTED_OPS` from the union (foundation §1; replaces today's hardcoded Set in `frontend/src/server/persistence-client.ts`).

## Tech Stack

Drizzle ORM + pglite (Postgres dialect), Zod DTOs re-exported from `@creatoros/contract` (`contract/src/operations/assets.ts`, `contract/src/resources/assets.ts`), Vitest (service unit + repository integration + contract conformance), Next.js App Router Server Components + Client islands.

## Dependency note (waves that must be green first)

**Wave 0** (registry generalization + Identity/auth + mock adapters incl. `MockObjectStorage`) and **Wave 2 Projects** (extends the slice + multi-tenant `RequestContext`). Runs **parallel to Knowledge**; **Artifacts** depends on this module landing. `ProjectAsset` / `ArtifactAsset` / `OutputAsset` link tables are owned by Projects/Artifacts/Production respectively and are out of scope here (this module owns `Asset` + `AssetFile` only).

---

## Contract ops owned by this module (grepped — `contract/src/operations/assets.ts`)

| op id | method · path | body / params | response DTO |
|---|---|---|---|
| `assets.list` | GET `/assets` | query `paginationQuery` | `assetResource` (list) |
| `assets.uploads.create` | POST `/assets/uploads` | `{ assetType, mimeType, fileSize }` | `assetUpload` (`{ uploadId, storageKey, uploadUrl, expiresAt }`) |
| `assets.uploads.complete` | POST `/assets/uploads/:uploadId/complete` | params `{ uploadId }`, body `{ name }` | `assetResource` |
| `assets.get` | GET `/assets/:assetId` | params `{ assetId }` | `assetResource` |
| `assets.files.create` | POST `/assets/:assetId/files` | params `{ assetId }`, body `{ storageKey }` | `assetFileResource` |
| `assets.trash` | POST `/assets/:assetId/trash` | params `{ assetId }` | `assetResource` |
| `assets.restore` | POST `/assets/:assetId/restore` | params `{ assetId }` | `assetResource` |

DTO shapes (do not re-derive — re-export from contract):
- `assetResource` = `{ id, userId, currentFileId, assetType, name, description, status: "active"|"archived"|"deleted", deletedAt: iso|null, createdAt, updatedAt }`.
- `assetFileResource` = `{ id, assetId, versionNumber:int, storageKey, mimeType, fileSize:int, checksum, width:int|null, height:int|null, durationMs:int|null, mediaMetadata: Record, createdAt }`.
- `assetType` ∈ `image | video | audio | document | subtitle` (`contract/src/primitives.ts`).

Entity fields (data-model `ASSET` / `ASSET_FILE`, lines 358–384) match the DTOs above; `Asset.current_file_id` points at the latest `AssetFile`.

State machine (SPEC §12 — Asset lifecycle, implemented by AssetsService; repository never transitions on its own):
```
active ↔ archived
active  → deleted   (trash; stamps deletedAt)
deleted → active    (restore; clears deletedAt)
```
`assets.list` returns `status = active` by default (trash/archived excluded from the default gallery scope).

---

## TDD Tasks

### A. db-schema

- [ ] **A1.** Create `frontend/src/server/modules/assets/assets.db-schema.ts`. Define two Drizzle `pgTable`s:
  - `assets`: `id` (uuid pk), `userId` (uuid, **not null**, owned row), `currentFileId` (uuid, nullable until first file), `assetType` (text), `name` (text), `description` (text, default `''`), `status` (text, default `'active'`), `deletedAt` (timestamptz, nullable), `createdAt`/`updatedAt` (timestamptz). Index on `(userId, status)`.
  - `assetFiles`: `id` (uuid pk), `assetId` (uuid, **not null**, fk → `assets.id`), `versionNumber` (int), `storageKey` (text, **unique**), `mimeType` (text), `fileSize` (bigint→`number`), `checksum` (text), `width`/`height`/`durationMs` (int, nullable), `mediaMetadata` (jsonb, default `{}`), `createdAt` (timestamptz). Unique `(assetId, versionNumber)`.
  - `assetUploads` (upload-session table; **owned**): `id` (uuid pk, == `uploadId`), `userId` (uuid not null), `assetType` (text), `mimeType` (text), `fileSize` (int), `storageKey` (text), `status` (text, default `'created'` → `'completed'`), `expiresAt` (timestamptz), `createdAt`. (`assetUpload` DTO is the projection of `created` rows.)
- [ ] **A2.** Append the three `CREATE TABLE` DDL statements to the shared init in `@creatoros/backend` (the same place Projects DDL is appended). **Test** (`assets.repository.integration.test.ts`, first red): insert one `assets` row + one `assetFiles` row on the pglite singleton and read them back; assert column round-trip and that `assetFiles.storageKey` unique constraint rejects a duplicate.

### B. repository (user-scoped ONLY)

Create `frontend/src/server/modules/assets/assets.repository.ts`. Every method takes `ctx: RequestContext`; **every query** carries `eq(assets.userId, ctx.userId)`. `assetFiles` queries scope by joining to the owning asset (`assetFiles.assetId = assets.id AND assets.userId = ctx.userId`).

- [ ] **B1.** `listAssets(ctx, { limit, cursor })` → rows where `userId = ctx.userId AND status = 'active'`, ordered `createdAt desc`, paginated by `paginationQuery`. **Test:** seed user A (3 active, 1 trashed) + user B (2 active); assert A sees exactly its 3 active rows, never B's, never the trashed one.
- [ ] **B2.** `getAsset(ctx, assetId)` → single row `id = assetId AND userId = ctx.userId`, else `null`. **Test:** user B's id under user A's ctx → `null` (→ service raises `OwnershipError`).
- [ ] **B3.** `insertAsset(ctx, { assetType, name, currentFileId })` stamping `userId = ctx.userId`, `status='active'`; returns the row. **Test:** inserted row has `userId === ctx.userId`.
- [ ] **B4.** `updateAssetStatus(ctx, assetId, { status, deletedAt, currentFileId? })` → user-scoped `UPDATE ... WHERE id = assetId AND userId = ctx.userId`; returns updated row or `null`. **Test:** update under wrong user touches 0 rows → `null`.
- [ ] **B5.** `insertAssetFile(ctx, { assetId, storageKey, mimeType, fileSize, checksum, versionNumber, width, height, durationMs, mediaMetadata })` — guarded by an existence check that `assetId` belongs to `ctx.userId` (caller passes a verified asset). Computes `versionNumber = max(existing)+1`. **Test:** two files on one asset → versions 1,2; `currentFileId` not mutated here (service does that).
- [ ] **B6.** `createUploadSession(ctx, { assetType, mimeType, fileSize, storageKey, expiresAt })` stamping `userId`, `status='created'`; `getUploadSession(ctx, uploadId)` user-scoped; `markUploadCompleted(ctx, uploadId)`. **Test:** ownership-scoped read of another user's upload → `null`.

### C. service (RequestContext + §12 state machine)

Create `frontend/src/server/modules/assets/assets.service.ts`. Depends on `assets.repository` + injected `ObjectStoragePort` (bind `MockObjectStorage`). Methods take `ctx`. Create `assets.errors.ts` (`OwnershipError`, `InvalidTransitionError`, `UploadValidationError`).

- [ ] **C1.** `listAssets(ctx, query)` → repo B1. **Test:** returns only active rows, shape matches DTO.
- [ ] **C2.** `getAsset(ctx, assetId)` → repo B2; `null` → throw `OwnershipError`. **Test:** missing/foreign id → `OwnershipError`.
- [ ] **C3.** `createUpload(ctx, { assetType, mimeType, fileSize })` (SPEC §15 phase 1): validate `assetType` ∈ enum, `fileSize > 0`, `mimeType` non-empty (else `UploadValidationError`); ask `ObjectStoragePort.createPresignedUpload()` for a deterministic `storageKey` + `uploadUrl`; persist an `assetUploads` row (B6); return `{ uploadId, storageKey, uploadUrl, expiresAt }`. **Test:** returns DTO; bad `fileSize=0` → `UploadValidationError`; row persisted with `status='created'`.
- [ ] **C4.** `completeUpload(ctx, uploadId, { name })` (SPEC §15 phase 2 + §20 validation): load session (B6, scoped) → else `OwnershipError`; verify session `status='created'` (else `ConflictError`); SPEC §20 — validate MIME/size/checksum via `ObjectStoragePort.headObject(storageKey)`; create the `Asset` (B3, `status='active'`) + first `AssetFile` (B5, `versionNumber=1`); set `asset.currentFileId = file.id` (B4); mark session `completed` (B6). Returns `assetResource`. **Test:** happy path creates asset+file and links `currentFileId`; second `complete` on same session → `ConflictError` (idempotency guard); session for wrong user → `OwnershipError`.
- [ ] **C5.** `addAssetFile(ctx, assetId, { storageKey })` (`assets.files.create`; backs 收藏 toggle wiring): verify asset ownership (C2); `headObject(storageKey)` for metadata; `insertAssetFile` at next `versionNumber`; advance `asset.currentFileId` to the new file. Returns `assetFileResource`. **Test:** appends version 2 and re-points `currentFileId`; foreign asset → `OwnershipError`.
- [ ] **C6.** `trashAsset(ctx, assetId)` (§12 `active → deleted`): load (C2); guard `status === 'active'` (else `InvalidTransitionError`); B4 set `status='deleted'`, `deletedAt = clock.now()`. Returns `assetResource`. **Test:** active→deleted sets `deletedAt`; trashing an already-deleted asset → `InvalidTransitionError`.
- [ ] **C7.** `restoreAsset(ctx, assetId)` (§12 `deleted → active`): load (C2); guard `status === 'deleted'` (else `InvalidTransitionError`); B4 set `status='active'`, `deletedAt=null`. Returns `assetResource`. **Test:** deleted→active clears `deletedAt`; restoring an active asset → `InvalidTransitionError`.
- [ ] **C8.** (archive support for the state machine completeness — not a §4 button, internal) `archiveAsset(ctx, assetId)` `active → archived` and the reverse `active`. **Test:** both transitions guarded; illegal pair → `InvalidTransitionError`. *(Mark in code: no FE wiring yet; exists to satisfy §12 `active ↔ archived`.)*

Inject a fixed `clock` (no `Date.now`) so service tests are deterministic, mirroring the Projects handler (`FIXED_NOW_ISO`).

### D. transport (register ops)

Create `frontend/src/server/modules/assets/assets.transport.ts` — `{ opId → (ctx, input) => envelope }`, throwing `UnsupportedOperationError` for anything else. Map exactly the 7 grepped ids:

- [ ] **D1.** `assets.list` → `service.listAssets(ctx, input.query)` → list envelope.
- [ ] **D2.** `assets.uploads.create` → `service.createUpload(ctx, input.body)`.
- [ ] **D3.** `assets.uploads.complete` → `service.completeUpload(ctx, input.params.uploadId, input.body)`.
- [ ] **D4.** `assets.get` → `service.getAsset(ctx, input.params.assetId)`.
- [ ] **D5.** `assets.files.create` → `service.addAssetFile(ctx, input.params.assetId, input.body)`.
- [ ] **D6.** `assets.trash` → `service.trashAsset(ctx, input.params.assetId)`.
- [ ] **D7.** `assets.restore` → `service.restoreAsset(ctx, input.params.assetId)`.
- [ ] **D8.** Create `frontend/src/server/modules/assets/index.ts` exporting `{ assetsService, assetsTransport }`. Register `assetsTransport` in the module registry so the composite transport adds these 7 ids to `PERSISTED_OPS` (remove the assets ids — if any — from the legacy hardcoded Set in `frontend/src/server/persistence-client.ts`). **Test** (`assets.contract.test.ts`): for each of the 7 ops, run the handler against a seeded pglite store and assert the output `parse`s against its contract DTO (`assetResource` / `assetFileResource` / `assetUpload`).

### E. FE island wiring (from program-roadmap §4, `/assets` — wired-local 1 · decorative 28 · needs-backend 5)

Files: server component `frontend/src/features/assets/assets-page.tsx` (switch its read), client island `frontend/src/features/assets/assets-interactive-region.tsx` (mutations). Preserve the `viewModel?` seam (`buildAssetsViewModel`). All needs-backend buttons: call the mapped op via the typed client, then `router.refresh()`.

**Server read switch**
- [ ] **E1.** Replace the `assets-page.tsx` fixture read (`buildAssetsViewModel(canonicalDataset)`) with a call to op **`assets.list`** through the server transport, mapping `assetResource[]` → `AssetsViewModel`. Keep the `viewModel?` prop override for tests.

**needs-backend (5) — wire these**
- [ ] **E2.** **`＋上传素材`** (needs-backend, two-phase): island handler runs **`assets.uploads.create`** (`POST /assets/uploads`) → upload bytes to the returned `uploadUrl` via `MockObjectStorage` → **`assets.uploads.complete`** (`POST /assets/uploads/:uploadId/complete`, body `{ name }`) → `router.refresh()`. Transition: Upload `created → completed`.
- [ ] **E3.** **`下载`** (needs-backend): handler calls **`assets.get`** (`GET /assets/:assetId`), resolves the current `AssetFile.storageKey` → signed URL via `ObjectStoragePort.getSignedUrl` → triggers browser download. (No state transition.)
- [ ] **E4.** **`复制链接`** (needs-backend): handler calls **`assets.get`**, derives the object-storage signed URL for `currentFileId`, writes it to clipboard. (No transition.)
- [ ] **E5.** **`收藏`** (needs-backend, "Toggle favorite"): per §4 row its Target op is **`assets.files.create`** (`POST /assets/:id/files`) — wire the toggle to call `assets.files.create` with the favorited file's `storageKey` (registering/advancing the file version that the favorite affordance represents), then `router.refresh()`. *(Open question Q1 — favorite has no dedicated field/op; confirm intended semantics before building.)*
- [ ] **E6.** **`更多 (detail overflow)`** menu (needs-backend, "Rename/trash/attach/version"): wire the **trash** item to **`assets.trash`** (`POST /assets/:id/trash`, transition `active→deleted`) + `router.refresh()`. Rename/attach/version items: leave inert this wave (no contract op exists for rename/attach; mark intentionally inert) — only trash is wired per the §4 Target op.

**wired-local (1) — preserve**
- [ ] **E7.** **`Asset card`** (wired-local, "Select → detail panel"): already local `useState` selection in the island; leave unchanged (no op).

**decorative (28) — intentionally inert (leave; do NOT wire)**
- [ ] **E8.** Mark the following as intentionally inert in a code comment block in the island/page (they "look interactive, do nothing" per §4; many are server-shell that would need lifting to a client island first — explicitly out of scope this wave):
  1. **Toolbar search** (form) — full-text filter; Search module surface, not Assets.
  2. **5 filter chips** (类型/来源/项目/标签/更多).
  3. **清除筛选**.
  4. **批量操作 ▾** menu (would map to `assets.trash` per row, but bulk-select isn't wired — inert this wave).
  5. **Sidebar search** (form).
  6. **9 type rows + 2 collection rows** (收藏/回收站) — scope tabs.
  7. **全选 checkbox** (no `onChange`).
  8. **网格/列表 view toggles**.
  9. **排序方式 / 每页条数** selects (`defaultValue` only).
  10. **Pagination numbers / next**.
  (Counts to the §4 total of 28 decorative controls across these grouped rows.) Each stays render-only; do not add handlers.

### F. tests (per MODULE-ARCH §2 — three suites)

- [ ] **F1.** `frontend/src/server/modules/assets/assets.service.test.ts` — state-machine guards valid + invalid for trash/restore/archive (C6/C7/C8), upload validation (C3/C4), `OwnershipError` on foreign ids (C2). Uses fixed clock + `MockObjectStorage` fake.
- [ ] **F2.** `frontend/src/server/modules/assets/assets.repository.integration.test.ts` — pglite-backed; **ownership enforced**: user A cannot read/update user B's assets, files, or upload sessions (B1–B6). Default-scope (active-only) listing verified.
- [ ] **F3.** `frontend/src/server/modules/assets/assets.contract.test.ts` — each of the 7 ops' output `parse`s against its contract DTO (D8).
- [ ] **F4.** Keep `frontend/src/features/assets/assets-page.test.tsx` green after the E1 read switch (feed `viewModel?` override so SSR stays deterministic).

### G. acceptance (SPEC §22)

- [ ] **G1.** Module has service + repository + schema + types + tests (all four files + 3 test suites present).
- [ ] **G2.** No cross-module repository import (Assets imports nothing from sibling modules' repositories; link tables excluded by design).
- [ ] **G3.** Routes don't touch the db client — only the `/api/v1/dispatch` route → composite transport → service → repository path is used.
- [ ] **G4.** `Asset` exists/persists **independent of any Project** (SPEC §22 "Knowledge、Asset、Learning 可脱离 Project 存在并被复用") — `assets` table has no required `projectId`.
- [ ] **G5.** AssetsService is the **only** object-storage caller (SPEC §15); no other module calls `ObjectStoragePort` directly (grep-assert).
- [ ] **G6.** SPEC §20 upload validation present (MIME/size/checksum at `completeUpload`); signed URLs are short-lived and never logged.
- [ ] **G7.** Multi-tenant smoke: user A cannot see user B's assets via `assets.list`/`assets.get` (covered by F2; assert at the dispatch layer too).
- [ ] **G8.** `pnpm verify` (frontend) green + the 3 module suites green.

---

### Notes on intentionally-inert controls

The 28 decorative controls on `/assets` are render-only by design this wave (roadmap §4 + §footer: "the entire Assets toolbar/sidebar… need to be *lifted from server-shell into client islands or made into links* before they can even fire"). They are tracked in **E8** and excluded from acceptance — wiring them is a later FE-lift task, not part of the Assets backend wave. The **`素材库存储` progress bar** (shell row, roadmap §4 line 345) is a decorative storage-usage indicator fed by the Settings/Storage-Usage query service (Wave 4), not by this module.
