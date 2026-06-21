# Module 02 — Search · Executable TDD Plan (Wave 1)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` + `superpowers:executing-plans`. This plan follows the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 per-module template and §1 architecture verbatim. Steps use `- [ ]`. Do **not** write implementation into the app outside the file paths named here. Each task is red→green→commit.

## Goal

Make CreatorOS Search **real, user-scoped, and contract-conformant**: a `SearchDocument` derived index + `SearchHistory` log over user-owned entities, a `SearchService` exposing the SPEC §16 internal API (`upsertDocument` / `removeDocument` / `search` / `recordSearch` / `rebuildUserIndex`), and the composed `GET /search` read (`pages.search.get`) served by the grouped global-search DTO. FE: light up the shell global search input and the `/search` page (re-run-history + result-tab/facet behavior), per program-roadmap §4.

## Architecture

- Module lives at `.worktrees/frontend-implementation/frontend/src/server/modules/search/` (MODULE-ARCH §2 layout; foundation §1).
- `@creatoros/backend` is shared infra (pglite/Drizzle `createDb`, `RequestContext`, the module **transport registry**, `UnsupportedOperationError`). Search registers its `{ opId → handler }` map into the registry; the composite transport builds `PERSISTED_OPS` from the union (foundation §1 — no edits to `compositeTransport` per module).
- **Every repository query is user-scoped:** `eq(table.userId, ctx.userId)` on every select/update/delete; every insert stamps `ctx.userId`. Cross-user → `OwnershipError` (404).
- pglite is the `globalThis` singleton (foundation §1; never a module-level `let`).
- Search index is **derived data** (SPEC §16): may be dropped and rebuilt; never the source of business truth; **index failure must not roll back the owning module's write** and must produce a retryable record. Search runs **post-commit** (SPEC §11 / roadmap §289).

## Tech Stack

Next.js (App Router) · Drizzle ORM over pglite (pure-WASM Postgres) · `@creatoros/contract` Zod DTOs · vitest. FTS in pglite via SQL `LIKE`/`ILIKE` over a denormalized `search_text` column (Postgres `tsvector`/`pg_trgm`/`pgvector` is the stage-N production swap per roadmap §59; the column + service seam stay identical). `embedding` column persisted but **not** queried in this wave (vector search deferred).

## Dependency note

**Blocked by:** Wave 0 — foundation §1 registry generalization + §2 Identity/auth (`RequestContext.userId` threaded through `/api/v1/dispatch`) must be green first. Search itself has **zero module deps** (roadmap §61: deps = none) and runs concurrently in Wave 1. The composed `GET /search` page DTO (`pages.search.get`) is **owned by the Wave 4 GlobalSearchQueryService**; this plan ships the Search module + a deterministic interim composer for `pages.search.get` so the page wires now, and hands the composed read to Wave 4 (foundation §6, roadmap §81/§523).

## Contract op ids this module owns (grepped, not guessed)

- `pages.search.get` — `GET /search?q&type` → `globalSearchPage` DTO. Source: `contract/src/operations/pages.ts:30-37`. **This is the only HTTP op for the Search surface.**
- `contract/src/operations/search.ts` exports `searchOperations = {}` (empty by design) — Search owns **no standalone dispatch endpoint**; its internal API (`upsertDocument`/`removeDocument`/`search`/`recordSearch`/`rebuildUserIndex`) is an **in-process service interface** consumed by other modules' services, not a contract endpoint (SPEC §16; `search.ts:1-6`).
- Resource DTOs the module persists/returns: `searchDocumentResource`, `searchHistoryResource` (`contract/src/resources/search.ts`).
- Page DTO shape: `globalSearchPage` (`contract/src/pages/global-search.ts`).

> **Spec gap (decide before wiring history):** SPEC §13 has **no** saved-search/history-persistence HTTP endpoint (roadmap §299, §425, §542). The "Search-history rows → re-run prior query (persist history)" button (roadmap §296, the only `needs-backend` control on `/search`) therefore has **no contract op to call for persistence**. Resolution adopted by this plan: history is **written server-side as a post-commit side-effect of `recordSearch`** during the `pages.search.get` read (every executed search appends a `SearchHistory` row, user-scoped), and the history rows **re-run by navigating `/search?q=<row.query>`** (a link, served by `pages.search.get`). No new endpoint is invented; if the program later adds `POST /search/history`, it slots behind `SearchService.recordSearch` unchanged. **Confirm this with the user before executing Task 11.**

---

## Tasks

### Task 1 — db-schema: `search_documents` + `search_history`

- [ ] **RED** Write `frontend/src/server/modules/search/search.repository.integration.test.ts` first asserting both tables round-trip (insert→select) once the repo exists; for now write only the schema-level assertion in a `search.db-schema.test.ts` sibling: applying `SEARCH_DDL` to a fresh `createDb()` then `INSERT … RETURNING` on each table succeeds and column names match snake_case.
- [ ] Create `frontend/src/server/modules/search/search.db-schema.ts` mirroring `backend/src/schema/projects.ts` conventions (ISO-8601 text timestamps, text enums). Define two `pgTable`s + a `SEARCH_DDL` string:
  - `searchDocuments` (`search_documents`): `id text pk`, `user_id text NOT NULL`, `entity_type text NOT NULL`, `entity_id text NOT NULL`, `title text NOT NULL`, `body text NOT NULL DEFAULT ''`, `search_text text NOT NULL`, `embedding jsonb NOT NULL DEFAULT '[]'` (array-of-number per `searchDocumentResource.embedding`; jsonb to avoid a pgvector dep this wave), `indexed_at text NOT NULL`. Add `CREATE UNIQUE INDEX IF NOT EXISTS search_documents_user_entity_uniq ON search_documents (user_id, entity_type, entity_id)` — enforces data-model §868 (`SearchDocument(entity_type, entity_id)` unique within User).
  - `searchHistory` (`search_history`): `id text pk`, `user_id text NOT NULL`, `query text NOT NULL`, `filters jsonb NOT NULL DEFAULT '{}'`, `result_count integer NOT NULL DEFAULT 0`, `searched_at text NOT NULL`.
  - Both entities extend BaseEntity only (no `created_at`/`updated_at`) per `contract/src/resources/search.ts` comments.
- [ ] Register `SEARCH_DDL` into the shared init: append to the DDL set `createDb()` applies (foundation §1 — the shared infra applies every module's DDL). If `backend/src/db.ts` still applies only `PROJECTS_DDL`, the Wave-0 registry task generalizes this to a `MODULE_DDLS` array; add `SEARCH_DDL` to it. Do **not** fork `createDb`.
- [ ] **GREEN** test passes. **Commit:** `feat(search): db-schema for search_documents + search_history`.

### Task 2 — repository (user-scoped ONLY)

- [ ] **RED** Flesh out `search.repository.integration.test.ts` (pglite-backed, mirrors `backend/src/repositories/project-repository.test.ts`): seed user A + user B docs/history, assert:
  1. `upsert` inserts then **updates** on `(user_id, entity_type, entity_id)` conflict (no duplicate row).
  2. `search('hook')` for user A returns only A's matching docs; user B's identical-text doc is **never** returned (ownership).
  3. `remove(entityType, entityId)` scoped to ctx.userId — calling as user B does not delete A's doc.
  4. `appendHistory` + `listHistory` return only the caller's rows, newest first.
  5. `deleteAllForUser` (rebuild support) clears only ctx.userId's documents.
- [ ] Create `frontend/src/server/modules/search/search.repository.ts` following the `createProjectRepository(db, deps)` shape (`RepoDeps { now, nextId, userId }`). **Every** query carries `eq(searchDocuments.userId, deps.userId)` / `eq(searchHistory.userId, deps.userId)`. Methods:
  - `upsertDocument(input: { entityType; entityId; title; body; searchText; embedding? })` — `INSERT … ON CONFLICT (user_id, entity_type, entity_id) DO UPDATE SET title, body, search_text, embedding, indexed_at`. Stamps `userId = deps.userId`, `indexedAt = deps.now()`, `id = deps.nextId("searchdoc")`.
  - `removeDocument(entityType, entityId)` — `DELETE … WHERE user_id = deps.userId AND entity_type = ? AND entity_id = ?`.
  - `search(query, opts?: { entityType?; limit? })` — `SELECT … WHERE user_id = deps.userId AND search_text ILIKE '%'||query||'%'` (+ optional `AND entity_type = ?`), `ORDER BY indexed_at DESC`, `LIMIT opts.limit ?? 50`. Empty/whitespace query → return `[]` (no full-table dump).
  - `appendHistory(input: { query; filters; resultCount })` — insert stamped row; `searchedAt = deps.now()`, `id = deps.nextId("searchhist")`.
  - `listHistory(limit = 10)` — `WHERE user_id = deps.userId ORDER BY searched_at DESC LIMIT ?`.
  - `deleteAllDocuments()` — `DELETE … WHERE user_id = deps.userId` (rebuild step).
  - `seedDocuments(rows)` / `seedHistory(rows)` — `onConflictDoNothing()` for fixture seeding (mirrors `seedProjects`).
- [ ] **GREEN** all 5 ownership assertions pass. **Commit:** `feat(search): user-scoped repository`.

### Task 3 — service (RequestContext + derived-index rules)

> **State machine:** Search has **no business state machine** (foundation roadmap §398 explicitly: "No machine for … Search"). The service's invariants are the SPEC §16 derived-index rules, not a transition table. Encode those as guards, not a state enum.

- [ ] **RED** Write `frontend/src/server/modules/search/search.service.test.ts` asserting:
  1. Every public method takes `RequestContext` first arg and constructs the repo with `userId = ctx.userId` (call with ctx for user A, assert writes/reads are A-scoped via a stub repo or a real pglite repo).
  2. `upsertDocument(ctx, input)` derives `searchText` deterministically as `` `${title}\n${body}`.toLowerCase().trim() `` when caller omits it (so owning modules pass title+body; the index column is computed here, single source).
  3. `search(ctx, query, opts)` returns `SearchDocumentResource[]` validating against `searchDocumentResource`.
  4. `recordSearch(ctx, { query, filters, resultCount })` appends history AND **swallows repo errors into a returned `{ indexed: false, retryable: true, error }` shape** rather than throwing — proving "index/history failure never rolls back business truth" (SPEC §16/§11). Test: inject a repo whose `appendHistory` throws → `recordSearch` resolves, does not throw, returns the retryable record.
  5. `rebuildUserIndex(ctx, docs)` calls `deleteAllDocuments` then `upsertDocument` per doc, all under `ctx.userId`; returns `{ count }`.
  6. `removeDocument(ctx, entityType, entityId)` is a no-op (not an error) when the doc is absent (idempotent removal of derived data).
- [ ] Create `frontend/src/server/modules/search/search.service.ts`. Public interface (SPEC §16, names verbatim): `upsertDocument`, `removeDocument`, `search`, `recordSearch`, `rebuildUserIndex`. Each takes `(ctx: RequestContext, …)`, builds the repo via `createSearchRepository(db, { now, nextId, userId: ctx.userId })`. `search` maps rows → `searchDocumentResource`-shaped objects. `recordSearch` wraps the `appendHistory` call in try/catch and returns a `SearchIndexOutcome` (`{ ok: true } | { ok: false; retryable: true; error: string }`) — **never throws** (foundation §4 / SPEC §16 derived-data rule). Add `search.errors.ts` with `OwnershipError` (re-export or local) used by the repo's not-found path → surfaced as 404.
- [ ] Create `frontend/src/server/modules/search/search.schema.ts` re-exporting `searchDocumentResource`, `searchHistoryResource`, `globalSearchPage` from `@creatoros/contract` for module-local use (foundation §5 layout).
- [ ] **GREEN** service tests pass. **Commit:** `feat(search): SearchService (RequestContext + derived-index guards)`.

### Task 4 — transport: register `pages.search.get` + interim composer

> Search owns no contract dispatch endpoint (Task 0 note). The **only** HTTP op on the Search surface is the composed page read `pages.search.get`. This module ships an **interim composer** for it (foundation §6: Wave 4's GlobalSearchQueryService takes final ownership; until then Search provides a deterministic composer so `/search` wires now).

- [ ] **RED** Write `frontend/src/server/modules/search/search.contract.test.ts`: build the transport, call the `pages.search.get` handler with `{ query: { q: "钩子", type: undefined } }` for a seeded user, assert the returned `data` **validates against `globalSearchPage`** (`globalSearchPage.parse(data.data)` does not throw) and that `data.data.query === "钩子"`, `data.data.kind === "search"`, `resultTabs` has the 4 locked ids (`项目/知识/素材/视频`), and `history` reflects the user's `SearchHistory` rows.
- [ ] Create `frontend/src/server/modules/search/search.transport.ts` exporting `searchTransport: Record<string, (ctx, input) => Promise<Envelope>>` with the single entry `"pages.search.get"`. Handler:
  1. Read `q` (+ optional `type`) from `input.query`.
  2. `const docs = await service.search(ctx, q, { entityType: typeFilter })`.
  3. Group `docs` by `entityType` into `projects` / `knowledge` / `assets` / `videos` arrays, mapping each to the `searchResult*Card` shapes in `contract/src/pages/global-search.ts` (project: `{id,title,stage,progressPct,snippet}`; knowledge: `{id,title,excerpt,tags}`; asset: `{id,title,assetType}`; video: `{id,title,platform,durationLabel}`). Fields not in `SearchDocument` (stage/progressPct/assetType/platform/durationLabel) come from the doc's `body`-encoded denormalized payload the owning module wrote at upsert time — store them as JSON in `body` and parse here; if absent, fall back to deterministic defaults so the DTO always validates.
  4. `recordSearch(ctx, { query: q, filters: type ? { type } : {}, resultCount: docs.length })` (post-read history write; non-throwing).
  5. `const history = await service.listHistory(ctx, 10)` → map to `{ id, query, searchedAt }`.
  6. Assemble the full `globalSearchPage` object: `scenario: q ? "default" : "empty"`, `kind: "search"`, `loading: false`, `error: null`, `query: q`, `resultTabs` (4 locked tabs with per-group counts), `projects/knowledge/assets/videos`, static `filters` (type/stage/tag facet definitions), `quickActions`, `history`, `tips`.
  7. Return `{ data: <page>, meta: { requestId: ctx.requestId } }`.
- [ ] Add `index.ts` (the ONLY public entry): export the service factory + `searchTransport` map. Register `searchTransport` into the module registry (foundation §1) so `compositeTransport` includes `pages.search.get` in `PERSISTED_OPS`. **Do not** hand-edit `persistence-client.ts`'s `PERSISTED_OPS` Set — use the registry; if the Wave-0 registry isn't merged yet, add `pages.search.get` to the registry source, not the legacy Set.
- [ ] **GREEN** contract test passes (`globalSearchPage.parse` clean). **Commit:** `feat(search): pages.search.get transport + registry`.

### Task 5 — FE wiring (from program-roadmap §4 button rows)

Two pages own Search rows: **Shell** (roadmap §107, §346-347) and **`/search`** (roadmap §286-298). Wire each per its state. Files: `frontend/src/app/(creator)/search/page.tsx`, `search-query-client.tsx`, `frontend/src/features/search/search-page.tsx`, `search-interactive-region.tsx`, and the shell header island.

- [ ] **Server read switch** — Convert `/search` from fixture-composed to op-backed. In `search/page.tsx` (currently a Server Component delegating to `SearchQueryClient`), fetch `pages.search.get` server-side via the contract server client with `{ query: { q } }`, pass the resulting `globalSearchPage` into `SearchPage` as `viewModel`. **Preserve the `viewModel?` seam** (foundation §5): keep `buildSearchViewModel()` as the default when no op data (tests/SSR-fallback). Map `globalSearchPage` → the page's `SearchViewModel` shape (`search-page.tsx:84-94`) in a small adapter (the contract DTO and the FE VM differ in field names: DTO `projects[].snippet/stage` → VM `brief/currentStage`).
- [ ] **§346 — `Global search input (/search)`** · `form` · **needs-backend** · "Global search (preventDefault today)" · target `GET /search`. In `search-interactive-region.tsx` the input already mirrors `?q=` via `router.replace`. Upgrade: on submit (Enter), call `router.push('/search?q='+value)` (push, not replace, so it lands in history) so the server `pages.search.get` read re-runs. The input is already a client island — no preventDefault dead-end remains.
- [ ] **§347 / §107 — `Search trigger / dashboard+projects search pills` & `搜索项目 (header search)`** · `link` · **wired-local** · "Navigate to /search". Confirm the shell header search affordance is a `<Link href="/search">` (or `router.push`). If it's an inert button, lift it to a `Link`. The `⌘K kbd hint` (§348) stays **decorative — intentionally inert** (no keydown listener; mark in code comment).
- [ ] **§296 — `Search-history rows`** · `other` · **needs-backend** · "Re-run prior query (persist history)" · target `GET /search`. Make each history row in `SearchHistory` (`search-page.tsx:761-789`) a `<Link href={`/search?q=${encodeURIComponent(item.query)}`}>`. Re-running navigates → server `pages.search.get` re-reads → `recordSearch` re-appends history. **Persistence of history itself happens server-side in the transport (Task 4 step 4)** per the spec-gap resolution above — the row needs no mutation endpoint.
- [ ] **§292 — `查看全部 ×4`** · `link` · **wired-local** · already `<Link>`/`<a>` to `/projects` `/knowledge` `/assets` `/publishing` (`search-page.tsx:386,468,534,601`). Leave as-is; confirm hrefs match roadmap targets.
- [ ] **§295 — `Quick-action links`** · `link` · **wired-local** · already `<a href={action.href}>` (`search-page.tsx:743`). Leave.
- [ ] **Decorative — intentionally inert (leave, annotate in a code comment "decorative per roadmap §4"):**
  - §290 `Result type tabs (项目/知识/素材/视频)` (`search-page.tsx:288-307`, no onClick) — scope facet, no handler.
  - §291 `Topic filter chips (AI/教程/提示词/Agent/变现/出海)` (`FILTER_CHIPS`, `search-page.tsx:261-268,327`).
  - §293 `Project/knowledge/asset/video result cards` — open-detail not wired (cards are not links yet).
  - §294 `Side facet rows (type/stage/tag)` (`SearchFilters`, `search-page.tsx:697-727`).
  - §297 `Search-tips rows` (`SearchTips`, `search-page.tsx:791-812`) — static syntax tips.
- [ ] After each `needs-backend` island mutation/navigation that changes server state, the page re-read happens via navigation (`router.push`/`Link` → server `pages.search.get`); no manual `router.refresh()` needed since the query is URL-driven.
- [ ] **Commit:** `feat(search): wire shell global search + /search page reads/history`.

### Task 6 — tests (per MODULE-ARCH §2: service / repository-integration / contract)

- [ ] Confirm the three module test files exist and are green: `search.service.test.ts` (Task 3), `search.repository.integration.test.ts` (Task 2, pglite-backed, ownership enforced), `search.contract.test.ts` (Task 4, `globalSearchPage.parse`). Add a **multi-tenant smoke**: in the integration test, seed user A + B, run `pages.search.get` as A, assert B's documents never appear in any group (foundation §9 multi-tenant smoke).
- [ ] Add a FE test alongside `frontend/src/features/search/search-page.test.tsx`: render `SearchPage` with a `viewModel` built from a `globalSearchPage` fixture and assert history rows render as links to `/search?q=…` and the result groups render the op-supplied data (not the fixture).
- [ ] **GREEN** all green. **Commit:** `test(search): service + repository-integration + contract + FE wiring`.

### Task 7 — acceptance (SPEC §22)

- [ ] Verify, checkbox by checkbox, against SPEC §22 + foundation §5.6:
  - [ ] Module has `service` + `repository` + `schema` + `types` + `tests` (the §2 file set under `modules/search/`).
  - [ ] **No cross-module repository import** — Search imports nothing from other modules (it owns `SearchDocument`; owning modules call `SearchService`, not vice-versa; SPEC §16: "SearchService 不反向读取其他模块 repository").
  - [ ] **Route does not touch the db client** — `/search` route and `/api/v1/dispatch` go through `compositeTransport` → service → repo only.
  - [ ] **Derived-index invariants:** index failure does not roll back business truth (proven by Task 3 test #4); index is rebuildable (`rebuildUserIndex`); `SearchDocument(entity_type, entity_id)` unique per user (Task 1 unique index, data-model §868).
  - [ ] **Idempotency:** `upsertDocument` is idempotent (ON CONFLICT update); `removeDocument` idempotent (no-op when absent).
  - [ ] Every repository query is user-scoped (`eq(table.userId, ctx.userId)`) — grep the repo for any unscoped `db.select`/`db.update`/`db.delete` and fail if found.
  - [ ] `pages.search.get` output validates against `globalSearchPage` for `default` and `empty` scenarios.
- [ ] Run module tests + `pnpm verify` (frontend) — **must be GREEN**. **Commit:** `chore(search): acceptance — SPEC §22 green`.

---

## Open questions (resolve before/at execution)

1. **Search-history persistence has no §13 endpoint** (roadmap §299/§425/§542). This plan resolves it by writing history as a post-commit side-effect of the `pages.search.get` read inside `SearchService.recordSearch` (no invented endpoint). **Confirm acceptable** before Task 4/Task 11, or supply a `POST /search/history` contract op to wire instead.
2. **Denormalized result-card fields** (project `stage`/`progressPct`, asset `assetType`, video `platform`/`durationLabel`) are not on `SearchDocument`. Plan stores them as a JSON payload inside `body` at upsert time (owning module supplies them). Confirm this denormalization vs. having the Wave-4 GlobalSearchQueryService re-read the owning services (foundation §6 says the query service "consumes only public services, never repositories") — the final composer may prefer the latter. The interim composer must not block on Wave-2 modules existing.
3. **`embedding` / vector search** is persisted but not queried this wave (pglite has no pgvector here; roadmap §59 lists pgvector as the stack). Confirm FTS-via-`ILIKE` is acceptable for Wave 1 and vector ranking is a stage-N swap behind the unchanged `SearchService.search` seam.
4. **Who upserts documents?** SPEC §16: "索引内容由拥有数据的模块 service 提交." Search ships `upsertDocument`/`rebuildUserIndex`, but Wave-2+ modules (Projects/Knowledge/Assets/Publishing) must **call** them post-commit. This plan seeds the index from the canonical dataset so `/search` returns results in Wave 1; the producer wiring lands in those modules' plans. Confirm the Wave-1 seed approach.
