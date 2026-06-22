# Module 10 — Publishing (TDD execution plan)

> **Wave 3.** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §4 mock adapters — `PlatformPublisherPort`/`MockPublisher`). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Publishing** vertical end-to-end — `Publication` (one ContentOutput → many platform publish instances) + `PublicationRevision` (title/description/cover/category/series/tags/settings versions) — so every `needs-backend`/`wired-local` button on the Publishing Workspace (`/projects/:id/publishing`) and Publishing Center (`/publishing`) drives a real, user-scoped contract op (FE button → contract op → user-scoped SQL → envelope → render). `Publication` is an **external fact-of-record** (SPEC §13.3/§22): there is no internal publish queue — statuses mirror external platform reality, the actual platform side-effect is mocked behind `MockPublisher` (foundation §4), and publish/transition is **idempotent** (SPEC §17/§22; `Publication(platform, external_id)` unique when `external_id` non-null, data-model line 865).

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/publishing/` and registers its `{ opId → handler }` map into the composite transport registry. Owns two entities — `Publication`, `PublicationRevision` (data-model lines 509-537). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. No cross-module repository imports — cross-module reads/writes (cover validation via `AssetsService`, output `published` rollup via `ProjectsService`, search index via `SearchService`, notify via `NotificationsService`) go through other modules' public `index.ts` service interfaces. Publishing never calls a platform SDK or S3 directly — platform publish goes through the `PlatformPublisherPort`/`MockPublisher` seam (§4), cover validation through `AssetsService` (SPEC §15: "Publishing 校验封面"; "禁止 … Publishing … 直接调用 S3 SDK").

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract`, Vitest. ISO-8601 text timestamps + text enums to mirror the Projects slice (`backend/src/schema/projects.ts`).

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth `RequestContext` + §4 `PlatformPublisherPort`/`MockPublisher` mock adapter) → Wave 2 Projects (`ProjectsService` ContentOutput ownership + `recordActivity` + the `ContentOutput active→published` rollup), Assets (`AssetsService.getAsset`/cover validation), Search (`SearchService.upsertDocument`), Notifications (`NotificationsService.notify`). Roadmap §4 gate is **G9** (deps G5 Projects, G7 Assets, G3 Search/Notifications). Analytics (G11) and Reviews (G13) consume `PublishingService.getRecentPublications`/`resolvePublication` AFTER this module is green — they are downstream, not blockers.

---

## Contract ops this module owns (grepped from `contract/src/operations/publishing.ts`)

| op id | method · path | body | response DTO |
|---|---|---|---|
| `outputs.publications.list` | GET `/outputs/:outputId/publications` | — (paginationQuery) | `publicationResource` (isList) |
| `outputs.publications.create` | POST `/outputs/:outputId/publications` | `{ platform, accountReference }` | `publicationResource` |
| `publications.get` | GET `/publications/:publicationId` | — | `publicationResource` |
| `publications.revisions.create` | POST `/publications/:publicationId/revisions` | `{ title, description }` | `publicationRevisionResource` |
| `publications.transition` | POST `/publications/:publicationId/transition` | `{ status }` | `publicationResource` |

DTO field shapes are fixed by `contract/src/resources/publishing.ts` — do NOT redefine; import and validate against them. Enums (source of truth = `contract/src/primitives.ts`):
- `platformId` (publication `platform`): `youtube | bilibili | douyin | xiaohongshu | wechatVideo | x`.
- `publicationStatus` (Publication `status`, contract enum): `draft | scheduled | published | removed | failed`.

**State machine (SPEC §12 + §22 + roadmap §4) — CONTRACT/SPEC MISMATCH, resolve at Step 3:** SPEC §12 (line 318) and roadmap §4 transitions reference a `ready` state (`draft → ready → scheduled → published`; `scheduled → failed`; `published → removed`), but the contract `publicationStatus` enum has **no `ready`** (`draft | scheduled | published | removed | failed`). The transport body only accepts strings that the DTO must re-serialize as one of the 5 contract values. **Decision for this wave (Open Question 1):** persist the full SPEC machine internally but the `transitionPublication` op body `status` and the `publicationResource.status` output are constrained to the 5 contract enum values; treat `ready` as a workspace-local UI sub-state of `draft` (the 确认发布 flow drives `draft → scheduled → published` server-side). The allowed server transitions are:

```text
draft → scheduled → published
draft → published            (immediate-publish, 立即发布 intent collapses ready+scheduled)
scheduled → failed
published → removed
```

- `removed` deletes platform content via `MockPublisher` but **retains metrics history** (SPEC §13.3; no row delete — only `removedAt` stamp).
- `ContentOutput.published` rollup (owned by Projects): `ContentOutput` reaches `published` when **≥1** of its Publications is `published` (not all) — driven through `ProjectsService`, not a Publishing repo write (data-model + roadmap §4 line 403; SPEC §22 ContentOutput machine).

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/publishing/
├── publishing.db-schema.ts
├── publishing.repository.ts
├── publishing.service.ts
├── publishing.schema.ts
├── publishing.transport.ts
├── publishing.errors.ts
├── index.ts
├── publishing.service.test.ts
├── publishing.repository.integration.test.ts
└── publishing.contract.test.ts
```

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/publishing/publishing.db-schema.ts`. Define two `pgTable`s mirroring `docs/CreatorOS-data-model.md` lines 509-537, with `user_id TEXT NOT NULL` on every owned row (NOT in the ER diagram — it is the ownership column required by foundation §1/§3). Follow the Projects schema conventions exactly (`backend/src/schema/projects.ts`): timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `PUBLISHING_DDL` string for pglite init.
  - `publications`: `id` PK (text), `userId`, `contentOutputId`, `platform`, `accountReference`, `status` (default `'draft'`), `currentRevisionId` (nullable until first revision), `externalId` (nullable), `externalUrl` (nullable), `scheduledAt` (nullable), `publishedAt` (nullable), `removedAt` (nullable), `createdAt` notNull, `updatedAt` notNull.
    - UNIQUE partial index `(platform, external_id)` WHERE `external_id IS NOT NULL` (data-model line 865; idempotency anchor — a re-publish to the same platform reuses the row, never duplicates).
  - `publicationRevisions`: `id` PK (text), `userId`, `publicationId`, `revisionNumber` int, `title`, `description` text (default `''`), `coverAssetId` (nullable), `category` (default `''`), `series` (default `''`), `platformTags` jsonb (default `[]`), `platformSettings` jsonb (default `{}`), `createdAt` notNull. **No `updatedAt`** — `publicationRevisionResource` extends BaseEntity only (contract resource line 24, revisions are append-only/immutable; new edits = new revision).
- [ ] Append `PUBLISHING_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep `PROJECTS_DDL` usage; register `PUBLISHING_DDL` in the same `CREATE TABLE IF NOT EXISTS` init list).
- [ ] **Test (in `publishing.repository.integration.test.ts`, first red):** a row inserted into each table round-trips via `db.select()` with all columns intact (jsonb defaults `[]`/`{}`, nullable timestamps `null`, `status` defaults `'draft'`).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/publishing/publishing.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createPublishingRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. A private `getPublicationRowById(publicationId)` throws `OwnershipError` (message `OwnershipError: publication not found: <id>`) when the scoped select returns empty — never reveal cross-user existence (foundation §2: 404 not 403).
  - `createPublication(outputId, { platform, accountReference })` — insert `{ id: nextId("pub"), userId, contentOutputId: outputId, platform, accountReference, status: "draft", currentRevisionId: null, externalId: null, externalUrl: null, scheduledAt: null, publishedAt: null, removedAt: null, createdAt: now(), updatedAt: now() }`; return row.
  - `listPublicationsByOutput(outputId, { limit, offset })` — `where(and(eq(publications.userId, deps.userId), eq(publications.contentOutputId, outputId)))`, `orderBy(desc(publications.createdAt))`, paginated.
  - `getPublication(publicationId)` — scoped `get`, throws `OwnershipError` if absent.
  - `createRevision(publicationId, { title, description, coverAssetId?, category?, series?, platformTags?, platformSettings? })` — scoped ownership check on the parent publication, compute `revisionNumber = (max existing for this publication) + 1` (scoped select), insert `{ id: nextId("rev"), userId, publicationId, revisionNumber, ..., platformTags: platformTags ?? [], platformSettings: platformSettings ?? {}, createdAt: now() }`; return row. **Append-only** (never UPDATE a revision row).
  - `setCurrentRevision(publicationId, revisionId)` — scoped update `currentRevisionId`, `updatedAt: now()`.
  - `updatePublicationStatus(publicationId, patch: { status, externalId?, externalUrl?, scheduledAt?, publishedAt?, removedAt? })` — scoped `get` first (ownership), then scoped `update … where eq(id) and eq(userId)`, set provided fields + `updatedAt: now()`; return row. (The status-machine guard lives in the service — repository only executes service-approved updates, SPEC §12.)
  - `findByExternalKey(platform, externalId)` — scoped select for idempotency lookups (returns row or null; used by the publish flow to detect re-publish).
- [ ] **Tests (`publishing.repository.integration.test.ts`, pglite-backed):**
  - ownership: build repo with `userId: "user-a"`, `createPublication` for an output; build a second repo with `userId: "user-b"`; `getPublication(sameId)` from repo-B throws `OwnershipError` (user A's row invisible to B).
  - `createRevision` increments `revisionNumber` 1 → 2 → 3 across calls for the same publication, and starts at 1 again for a different publication.
  - `listPublicationsByOutput` returns newest-first and respects `limit`/`offset`.
  - `findByExternalKey` finds the row only for the owning user.

## Step 3 — service (RequestContext + §12 state machine)

- [ ] Create `frontend/src/server/modules/publishing/publishing.errors.ts`: re-use the foundation error types (`OwnershipError`, `ConflictError`, `UnsupportedOperationError`, `ValidationError`) — import from shared infra; do not redefine if they already exist there.
- [ ] Create `frontend/src/server/modules/publishing/publishing.service.ts`. Every public method takes `(ctx: RequestContext, …)`; it builds a repository bound to `ctx.userId` (`createPublishingRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. It receives a `PlatformPublisherPort` instance (foundation §4, default `MockPublisher`) and peer service interfaces (`AssetsService`, `ProjectsService`, `SearchService`, `NotificationsService`) via constructor deps — never via repo import. Define the transition table:
  ```ts
  const ALLOWED: Record<string, ReadonlyArray<string>> = {
    draft: ["scheduled", "published"],
    scheduled: ["published", "failed"],
    published: ["removed"],
    removed: [],
    failed: [],
  };
  ```
  Methods:
  - `listPublications(ctx, outputId, pagination)` → `repo.listPublicationsByOutput` then map rows → `publicationResource[]`. Backs `outputs.publications.list`.
  - `createPublication(ctx, outputId, { platform, accountReference })` — guard `platform` parses as `platformId`; `repo.createPublication`; return DTO (`status: "draft"`, `currentRevisionId` serialized — see mapper note). Backs `outputs.publications.create`.
  - `getPublication(ctx, publicationId)` → `repo.getPublication` → DTO. Backs `publications.get`.
  - `createRevision(ctx, publicationId, { title, description })` — resolve publication (ownership). If a `coverAssetId` is ever supplied (not in the contract body this wave — see Open Question 3), validate it via `AssetsService.getAsset(ctx, coverAssetId)` (SPEC §15 "Publishing 校验封面"); throws `ValidationError` if the asset is missing/not an image. `repo.createRevision` then `repo.setCurrentRevision(publicationId, revision.id)` (newest revision becomes current). Return `publicationRevisionResource` DTO. Backs `publications.revisions.create`.
  - `transition(ctx, publicationId, { status: next })` — the §12 state machine + external fact-of-record + idempotency:
    1. `repo.getPublication` (ownership). Let `current = pub.status`.
    2. **Idempotency (SPEC §17/§22):** if `next === current`, return the existing DTO unchanged (no re-publish, no duplicate side-effect). Also: when entering `published`, first `repo.findByExternalKey(pub.platform, pub.externalId)` — if a published row already carries that external key, return it (re-submission returns the original).
    3. Guard `ALLOWED[current].includes(next)`; else `ConflictError` (message `ConflictError: publication <id> cannot transition <current> → <next>`).
    4. Side-effects per target status, behind `PlatformPublisherPort` (no network/SDK in this module):
       - `→ scheduled`: stamp `scheduledAt = now()` (the schedule time supplied by the FE 修改时间 flow is carried in the revision/`platformSettings`; the op body only has `status` — see Open Question 2). No publisher call.
       - `→ published`: call `publisher.publish(ctx, { publicationId, platform, accountReference, revision })` → returns `{ externalId, externalUrl }` (MockPublisher mints a deterministic fake id, records the fact, no network). `repo.updatePublicationStatus(publicationId, { status: "published", externalId, externalUrl, publishedAt: now() })`.
       - `→ removed`: call `publisher.remove(ctx, { externalId: pub.externalId })` (MockPublisher records removal). `repo.updatePublicationStatus(publicationId, { status: "removed", removedAt: now() })` — **retain** `externalId`/metrics history (no row delete; SPEC §13.3).
       - `→ failed`: `repo.updatePublicationStatus(publicationId, { status: "failed" })`.
    5. **Cross-module fan-out via public service interfaces (no repo imports):** on `→ published`, drive the ContentOutput `active → published` rollup through `ProjectsService.markOutputPublished(ctx, pub.contentOutputId)` (idempotent on the Projects side — `published` iff ≥1 Publication published), `SearchService.upsertDocument(ctx, { type: "publication", id: publicationId, … })`, `ProjectsService.recordActivity(ctx, { kind: "publication_published", … })`, and `NotificationsService.notify(ctx, { … published … })`. Post-commit side-effects (Search, Notifications) run AFTER the main status write succeeds; a post-effect failure records a retryable state and never rolls back the publish fact (SPEC §11/§16).
    6. Return the updated `publicationResource` DTO.
- [ ] **DTO mapper note:** `publicationResource.currentRevisionId` is a required `id` (non-nullable) but a brand-new publication has none yet. Resolve per Open Question 4: either (a) the FE always creates the first revision in the same flow as createPublication (so it's never serialized null), or (b) map `null → ""` is **invalid** (`id` is a non-empty string) — instead default `currentRevisionId` to the publication's own id sentinel until a revision exists, OR adjust createPublication to auto-mint an empty revision-0. Recommend (b-auto): `createPublication` auto-creates `revisionNumber: 1` empty revision and sets it current, so `currentRevisionId` is always a real id. Document the choice in the service.
- [ ] **Tests (`publishing.service.test.ts`, fake `now`/`nextId`, in-memory/pglite db, stubbed `MockPublisher` + peer services):**
  - transition valid path: `draft → scheduled` stamps `scheduledAt`; `scheduled → published` calls `publisher.publish` once, stamps `externalId`/`externalUrl`/`publishedAt`, and calls `ProjectsService.markOutputPublished` exactly once.
  - transition invalid: `draft → removed` (illegal) throws `ConflictError`; `published → scheduled` (backward) throws `ConflictError`.
  - **idempotency:** `transition` to `published` twice does NOT call `publisher.publish` twice and does NOT call `markOutputPublished` twice; the second call returns the already-`published` DTO (same `externalId`). `transition(current === next)` is a no-op returning the existing DTO.
  - `removed` retains `externalId` (not nulled) and stamps `removedAt`; `publisher.remove` called once.
  - `createRevision` increments `revisionNumber` and updates `currentRevisionId` to the new revision.
  - `createPublication` with an invalid platform string throws `ValidationError`.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/publishing/publishing.schema.ts`: re-export the contract DTOs/enums/ops used (`publicationResource`, `publicationRevisionResource`, `publishingOperations`, `platformId`, `publicationStatus`) — single import surface for this module.
- [ ] Create `frontend/src/server/modules/publishing/publishing.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2: transport signature gains `ctx`). Export `createPublishingTransport(service)` returning `{ request(ctx, endpoint, input) }` with a `switch (endpoint.id)`:
  - `"outputs.publications.list"` → `service.listPublications(ctx, params.outputId, query)`, `meta: listMeta` (pagination).
  - `"outputs.publications.create"` → `service.createPublication(ctx, params.outputId, body)`, `meta: singleMeta`.
  - `"publications.get"` → `service.getPublication(ctx, params.publicationId)`.
  - `"publications.revisions.create"` → `service.createRevision(ctx, params.publicationId, body)`.
  - `"publications.transition"` → `service.transition(ctx, params.publicationId, body)`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/publishing/index.ts` exporting the public service interface + the op-id list `["outputs.publications.list","outputs.publications.create","publications.get","publications.revisions.create","publications.transition"]` and a `registerPublishing(registry)` that adds the transport map. Register this module in the composite transport registry (foundation §1: union builds `PERSISTED_OPS` — no edit to the composite switch). Also export `getRecentPublications(ctx, …)` and `resolvePublication(ctx, externalSourceRef)` stubs on the public service interface — required by DashboardQueryService (SPEC §19 line 618) and IngestionService/Analytics (SPEC §11 line 279); implement `getRecentPublications` now (thin scoped list across outputs), leave `resolvePublication` for the Ingestion wave but declare its signature.
- [ ] **Tests (`publishing.contract.test.ts`):** for EACH of the five op ids, drive the transport with a seeded ctx + valid input and assert the contract DTO parses the envelope data: `publishingOperations.listPublications.response.parse(item)` for each list item; `…createPublication.response.parse(envelope.data)`; `…getPublication`; `…createPublicationRevision`; `…transitionPublication`. Include a `publications.transition` happy path producing a DTO whose `status` parses as `"published"` with non-null `externalId`/`externalUrl`/`publishedAt`.

## Step 5 — FE island wiring

Two pages. Preserve the `viewModel?` seam; server reads switch from fixture to the real op.

### 5a — Publishing Workspace `/projects/:id/publishing` (roadmap §4 lines 197-215; wired-local 8 · decorative 15 · needs-backend 1)

Edit `frontend/src/features/project-publishing/publishing-interactive-region.tsx` (+ server shell `publishing-workspace-page.tsx` for the initial read via `outputs.publications.list`, hydrating per-platform publish cards into the view model).

| §4 label | §4 state | wiring |
|---|---|---|
| `Publishing tabs (设置/记录/平台/批量)` | wired-local | client sub-view switch only — no op (keep as-is). |
| `Title input` (+counter) | wired-local→backend | on commit, call `publications.revisions.create` `{ title, description }` for the active publication + `router.refresh()`. (counter stays client-local.) |
| `Description / Cover / Category / Series` | **decorative** | look editable, no handler — **intentionally inert** this wave. (`description` rides the Title-input revision call; cover/category/series need extended revision body — Open Question 3.) |
| `Tag chips × remove` | **decorative** | `×` glyph has no remove handler — **intentionally inert** (would map to `publications.revisions.create` with a new `platformTags` set; not wired this wave). |
| `Option toggles (评论/草稿/通知粉丝)` | wired-local | per-publication option state held locally; flushed into the next revision's `platformSettings` when 确认发布 fires — no standalone op. |
| `Extra option checkboxes (评论/弹幕/转发)` | **decorative** | static ✓ spans — **intentionally inert**. |
| `Platform select checkbox` | wired-local | pick platforms for batch — local selection state, no op. |
| `Platform publish card` | wired-local→backend (read) | selected styling + status badge; data comes from the server `outputs.publications.list` read (replaces fixture mirror). |
| `批量设置时间 / 清空时间 / 立即发布 pill` | **decorative** | bulk-time pills have no handler — **intentionally inert** (schedule time isn't in the transition body — Open Question 2). |
| `确认发布` | **needs-backend** | THE one needs-backend control. For each selected platform's publication: ensure a publication exists (`outputs.publications.create` if none), flush pending options into `publications.revisions.create`, then `publications.transition` `{ status: "scheduled" }` → `{ status: "published" }` (or directly `{ status: "published" }` for 立即发布 intent). Then `router.refresh()`. Transition: `draft → scheduled → published`. Replace the current CLIENT-only local status flip (region line ~515). Idempotent on re-click. |
| `Confirm result status text` | wired-local | `role=status` reflection of the result — keep client (now reflects real returned status). |
| `内容日历 cells` | **decorative** | 7-day schedule overview — **intentionally inert**. |
| `发布前检查 rows` | **decorative** | pre-publish checklist — **intentionally inert**. |
| `Preview platform tabs (B站/抖音/视频号/小红书)` | **decorative** | **GOTCHA (§4):** look wired but have NO onClick — leave **intentionally inert** this wave (roadmap §489 "wire the inert preview tabs" is a stretch goal; not a needs-backend op — no contract op backs a pure preview swap). |
| `发布清单 / 发布提示 / 查看更多提议` | **decorative** | static lists, `href="#"` — **intentionally inert**. |

- [ ] Update `frontend/src/features/project-publishing/publishing-interactions.test.tsx`: assert 确认发布 issues `publications.transition` (and `outputs.publications.create`/`publications.revisions.create` as needed) via the HttpTransport mock and triggers `router.refresh()`; assert Title-input commit issues `publications.revisions.create`; assert decorative controls (Description/Cover/Category/Series, tag-chip ×, extra checkboxes, 批量时间 pills, 内容日历, 发布前检查, preview platform tabs, 发布清单 links) issue **no** network call.

### 5b — Publishing Center `/publishing` (roadmap §4 lines 264-276; wired-local 12 · decorative 0 · needs-backend 3)

Edit `frontend/src/features/publishing-center/publishing-center-interactive-region.tsx`. **Note (§4 line 267/292):** the Center's primary read is `GET /publications` (a cross-output list), which has **no single contract op** in `publishing.ts` — it is composed by the Wave 4 **PublishingCenterQueryService** (foundation §6 wave 4; SPEC §19, data-model line 883 "发布中心 = Publication + ContentOutput + 最新 MetricSnapshot"). This wave wires the **3 needs-backend batch mutations** against `publications.transition`/`publications.revisions.create` (which ARE owned here); the list read stays on the existing fixture/query-service seam until Wave 4. Free-text search (`搜索发布内容`) maps to the Search module's `GET /search`, not Publishing.

| §4 label | §4 state | wiring |
|---|---|---|
| `内容类型 tabs (全部/视频/图文/音频)` | wired-local | client filter — no Publishing op (keep). |
| `搜索发布内容` | wired-local (Search) | free-text filter + `?q=`; backed by Search `GET /search` — no Publishing op. |
| `4 filter chips (全部/7天/30天/待优化)` | wired-local | date/engagement client filter — no op (keep). |
| `全选 checkbox` | wired-local | select all visible rows — local state. |
| `批量发布` | **needs-backend** | for each selected row, `publications.transition` `{ status: "published" }` (rows already `scheduled`/`ready`→`published`); skip rows already `published` (idempotent no-op); `router.refresh()`. Replace the disabled `BatchActionButton` (region line 470). |
| `批量下架` | **needs-backend** | for each selected `published` row, `publications.transition` `{ status: "removed" }` (`published → removed`); `router.refresh()`. (region line 471.) |
| `修改时间` | **needs-backend** | for each selected row, set new schedule then `publications.transition` `{ status: "scheduled" }` (`ready/draft → scheduled`); the new time rides `publications.revisions.create` `platformSettings.scheduledAt` (Open Question 2); `router.refresh()`. (region line 472.) |
| `Row checkbox` | wired-local | add/remove from batch — local state. |
| `查看 (row action)` | wired-local→backend (read) | highlight row; optional detail fetch via `publications.get` (detail panel not wired — highlight only this wave). |
| `Pagination prev/page/next` | wired-local | client-side paging — no op (keep). |

- [ ] Update `frontend/src/features/publishing-center/publishing-center-interactions.test.tsx`: assert 批量发布/批量下架/修改时间 each issue `publications.transition` with the correct target status per selected row and call `router.refresh()`; assert already-`published` rows under 批量发布 issue no redundant transition (idempotency at the FE batch level); assert 内容类型 tabs / filter chips / pagination issue **no** Publishing network call.

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `publishing.service.test.ts` (state-machine guards valid+invalid, publish side-effect via MockPublisher, idempotency, removed retains externalId), `publishing.repository.integration.test.ts` (pglite, ownership user-A-vs-user-B, revisionNumber increment, list ordering/pagination, findByExternalKey scoping), `publishing.contract.test.ts` (each of 5 ops validates against its contract DTO; transition→published DTO carries non-null externalId/publishedAt).
- [ ] **Acceptance checklist (SPEC §22):** module ships service + repository + schema + tests; **no cross-module repository import** (peer access only via `index.ts` service interfaces — `AssetsService`/`ProjectsService`/`SearchService`/`NotificationsService`); the dispatch route does not touch the db client (it threads `ctx` into `compositeTransport.request`); **Publication publish/remove is idempotent** (re-publish returns original via `(platform, external_id)` uniqueness; same-status transition is a no-op; SPEC §17/§22); `PublicationRevision` is append-only/immutable (new edits → new revision row, never UPDATE); `removed` retains metrics history (no row delete); ContentOutput `active → published` driven only through `ProjectsService.markOutputPublished` (≥1 published, not all); Publishing never calls a platform SDK or S3 — platform publish goes through `MockPublisher`, cover validation through `AssetsService` (SPEC §15); post-commit Search/Notifications failures don't roll back the publish fact.
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. **`ready` state mismatch (contract vs SPEC §12/roadmap).** The contract `publicationStatus` enum omits `ready` but SPEC §12 + roadmap §4 transitions reference it. Recommend: treat `ready` as a workspace-local UI sub-state of `draft`; server machine is `draft → scheduled → published`, `scheduled → failed`, `published → removed` (the 5 contract enum values only). Confirm before wiring the Center 修改时间 (`ready→scheduled`) row.
2. **Schedule time has no transport field.** `publications.transition` body is `{ status }` only; `修改时间`/`批量设置时间` need a timestamp. Recommend: carry `scheduledAt` in `publications.revisions.create` `platformSettings.scheduledAt` (the transition then reads it from the current revision), OR petition contract for a `scheduledAt?` on the transition body. Default to `platformSettings` to avoid a contract change this wave.
3. **Revision body is `{ title, description }` only** — cover/category/series/tags (data-model fields + §4 Description/Cover/Category/Series + tag-chip rows) are not in the contract body, so those §4 controls are marked **decorative** this wave. Confirm whether to extend the contract `publications.revisions.create` body or keep them inert until a contract bump.
4. **`currentRevisionId` non-nullable in DTO but null at creation.** Recommend `createPublication` auto-mints an empty `revisionNumber: 1` revision and sets it current so the DTO always serializes a real id (avoids `id`-parse failure on a null). Confirm vs. always-create-first-revision in the FE flow.
5. **`MockPublisher` external id determinism for idempotency.** Recommend a deterministic id (e.g. `mock:{platform}:{publicationId}`) so a re-publish hits the `(platform, external_id)` unique index and returns the original — confirm the format with the §4 mock-adapter author.
