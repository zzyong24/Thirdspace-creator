# Module 13 — Reviews (TDD execution plan)

> **Wave 3.** Follows the keystone foundation `docs/superpowers/plans/2026-06-21-program-foundation.md` (§5 per-module template, §1 architecture, §4 mock adapters). Steps use `- [ ]` and are executed in order by a single dispatched agent that HALTS on the first failing step.

**Goal:** Wire the **Reviews** vertical end-to-end — `Review` (a project- or output-scoped retrospective with a status lifecycle) and `ReviewInsight` (success / issue / action / hypothesis findings) — so the greenfield review-authoring surface on the Review Workspace (`/projects/:id/review`) drives real, user-scoped contract ops (FE button → contract op → user-scoped SQL → envelope → render). Reviews pulls Analytics + Publishing windows for the review period and emits confirmed insights that **unblock the Learnings + AI verticals** (roadmap §4 G13 → G14/G15): a completed `ReviewInsight` is the source a `learnings.create` later promotes from, and the same Review/Insight rows are read by the AI review-analysis node.

**Architecture:** Modular monolith under the Next app (foundation §1). This module lives at `frontend/src/server/modules/reviews/` and registers its `{ opId → handler }` map into the composite transport registry. Owns three entities — `Review`, `ReviewInsight`, `ReviewPublication` (`ReviewPublication` schema created this wave; its `添加发布` attach path is decorative — see Step 5). Every repository query is user-scoped: `eq(table.userId, ctx.userId)`. No cross-module repository imports — cross-module reads (Analytics snapshots, Publishing publications, Artifacts report) and writes go through other modules' public `index.ts` service interfaces (foundation §1, SPEC §11/§22).

**Tech stack:** TypeScript, Drizzle ORM over the `globalThis` pglite singleton (foundation §1), Zod DTOs from `@creatoros/contract`, Vitest. ISO-8601 text timestamps + text enums to mirror the Projects slice (`backend/src/schema/projects.ts`).

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth `RequestContext`) → Wave 2 Projects (`ProjectsService` ContentOutput ownership + `recordActivity`), Artifacts (`ArtifactsService` for the optional `review_report` `reportArtifactId`) → Wave 3 Publishing (`PublishingService.listPublicationsForProject` for the `ReviewPublication` set + period bounds) and **Analytics** (`AnalyticsService.getProjectSnapshots` for period metrics that seed insight `evidence`). Roadmap §4 gate is **G13** (deps G5 Projects, G9 Publishing, G11 Analytics, G8 Artifacts). Reviews itself gates **G14 Learnings** and **G15 AI**.

---

## Contract ops this module owns (grepped from `contract/src/operations/reviews.ts`)

| op id | method · path | params · body | response DTO |
|---|---|---|---|
| `reviews.create` | POST `/projects/:projectId/reviews` | params `{ projectId }`; body `{ reviewType: "project"\|"output", contentOutputId?: id\|null }` | `reviewResource` |
| `reviews.get` | GET `/reviews/:reviewId` | params `{ reviewId }` | `reviewResource` |
| `reviews.insights.create` | POST `/reviews/:reviewId/insights` | params `{ reviewId }`; body `{ insightType: "success"\|"issue"\|"action"\|"hypothesis", title: string(min 1), description: string(default "") }` | `reviewInsightResource` |
| `reviews.complete` | POST `/reviews/:reviewId/complete` | params `{ reviewId }` | `reviewResource` |

DTO field shapes are fixed by `contract/src/resources/reviews.ts` — do NOT redefine; import and validate against them.
- `reviewResource`: `{ id, projectId, contentOutputId: id|null, reportArtifactId: id|null, reviewType, status, periodStart: iso, periodEnd: iso, createdAt: iso, completedAt: iso|null }`.
- `reviewInsightResource`: `{ id, reviewId, insightType, title, description, evidence: Record<string,unknown>, priority: int }`.
- Enums (source of truth = contract resource): `reviewType = project | output`; `reviewStatus = in_progress | completed | abandoned`; `insightType = success | issue | action | hypothesis`.

> Note the **input/output gap**: the request bodies do NOT carry `periodStart`/`periodEnd`/`reportArtifactId` (Review) or `evidence`/`priority` (ReviewInsight). These are **derived server-side** — see Step 3 (period from Publishing/Analytics window; `priority` from insert order; `evidence` from the pulled Analytics snapshot). This is the determinate recipe, not a placeholder.

State machine (SPEC §12 has **no** explicit Review diagram; roadmap §4 "State machines" line is authoritative: **`Review: open → completed`**, plus the contract `reviewStatus` enum adds `abandoned`):
- **Review.status:** `in_progress → completed` (via `reviews.complete`); `in_progress → abandoned` (terminal; no op this wave — `abandoned` reachable only by a future `reviews.abandon`, so it is schema-valid but unwired). Re-completing an already-`completed` review is idempotent (returns the existing row, no re-stamp). Completing an `abandoned` review → `ConflictError`.

---

## File layout to create (foundation §1 template)

```
frontend/src/server/modules/reviews/
├── reviews.db-schema.ts
├── reviews.repository.ts
├── reviews.service.ts
├── reviews.schema.ts
├── reviews.transport.ts
├── reviews.errors.ts
├── index.ts
├── reviews.service.test.ts
├── reviews.repository.integration.test.ts
└── reviews.contract.test.ts
```

---

## Step 1 — db-schema

- [ ] Create `frontend/src/server/modules/reviews/reviews.db-schema.ts`. Define three `pgTable`s mirroring `docs/CreatorOS-data-model.md` lines 577-602 (`REVIEW`, `REVIEW_PUBLICATION`, `REVIEW_INSIGHT`), with `user_id TEXT NOT NULL` on every owned row (NOT in the data-model ER diagram — it is the ownership column required by foundation §1/§2). Follow the Projects schema conventions exactly: timestamps as ISO-8601 `text`, enums as `text`, JSON as `jsonb`, plus a raw `REVIEWS_DDL` string for pglite init.
  - `reviews`: `id` PK text, `userId` text notNull, `projectId` text notNull, `contentOutputId` text (nullable — only set when `reviewType="output"`), `reportArtifactId` text (nullable — optional `review_report` ArtifactVersion link), `reviewType` text notNull, `status` text notNull, `periodStart` text notNull, `periodEnd` text notNull, `createdAt` text notNull, `completedAt` text (nullable).
  - `reviewInsights`: `id` PK text, `userId` text notNull, `reviewId` text notNull, `insightType` text notNull, `title` text notNull, `description` text notNull default `''`, `evidence` jsonb notNull default `{}`, `priority` integer notNull default `0`.
  - `reviewPublications`: `id` PK text (the contract DTO `reviewPublicationResource` has an `id`; the data-model ER omits it — add `id` so the row is addressable), `userId` text notNull, `reviewId` text notNull, `publicationId` text notNull. Add a UNIQUE index on `(review_id, publication_id)` (a publication is included in a review at most once — backs idempotent attach).
- [ ] Append `REVIEWS_DDL` to the shared pglite init wherever `PROJECTS_DDL` is consumed (grep for `PROJECTS_DDL` usage; register `REVIEWS_DDL` in the same `CREATE TABLE IF NOT EXISTS` init list, with the `CREATE UNIQUE INDEX IF NOT EXISTS reviews_review_publication_uq ON review_publications (review_id, publication_id)`).
- [ ] **Test (in `reviews.repository.integration.test.ts`, first red):** a row inserted into each of the three tables round-trips via `db.select()` with all columns intact (jsonb default `{}`, nullable `contentOutputId`/`reportArtifactId`/`completedAt` = `null`, `priority` default `0`).

## Step 2 — repository (user-scoped ONLY)

- [ ] Create `frontend/src/server/modules/reviews/reviews.repository.ts` mirroring `createProjectRepository` (`backend/src/repositories/project-repository.ts`): `RepoDeps { now, nextId, userId }`, factory `createReviewsRepository(db, deps)`. **Every** query filters `eq(table.userId, deps.userId)`; **every** insert stamps `userId: deps.userId`. A private `getReviewRow(reviewId)` throws `OwnershipError` (message `OwnershipError: review not found: <reviewId>`) when the scoped select returns empty — never reveal cross-user existence (foundation §2: 404 not 403). Methods:
  - `createReview(input: { projectId, reviewType, contentOutputId, periodStart, periodEnd, reportArtifactId })` — insert `{ id: nextId("review"), userId: deps.userId, projectId, reviewType, contentOutputId: contentOutputId ?? null, reportArtifactId: reportArtifactId ?? null, status: "in_progress", periodStart, periodEnd, createdAt: now(), completedAt: null }`; `.returning()` → row. (`periodStart/periodEnd/reportArtifactId` are computed by the service and passed in — repository never reaches into Analytics/Publishing.)
  - `getReview(reviewId)` → `getReviewRow` (scoped `where(and(eq(reviews.userId, deps.userId), eq(reviews.id, reviewId)))`).
  - `completeReview(reviewId)` — scoped ownership via `getReviewRow`, then scoped `update reviews set status="completed", completedAt=now() where eq(id) and eq(userId)`; `.returning()` → row. (Status-machine guard lives in the service; repository only executes the service-approved update — SPEC §12.)
  - `createInsight(reviewId, input: { insightType, title, description, evidence, priority })` — scoped ownership on the parent review first (`getReviewRow`), then insert `{ id: nextId("insight"), userId: deps.userId, reviewId, insightType, title, description, evidence, priority }`; `.returning()` → row.
  - `listInsights(reviewId)` — scoped, `where(and(eq(reviewInsights.userId, deps.userId), eq(reviewInsights.reviewId, reviewId)))`, `orderBy(asc(reviewInsights.priority))`. (Backs `priority` derivation = current count, and the FE insight list render.)
  - `countInsights(reviewId)` — scoped count for the `priority` default (next priority = current count). May reuse `listInsights(...).length`.
  - `attachPublication(reviewId, publicationId)` — scoped ownership on review, insert `{ id: nextId("reviewpub"), userId, reviewId, publicationId }` with `onConflictDoNothing()` (UNIQUE `(review_id, publication_id)` makes it idempotent). (Schema/repo only this wave; the FE attach button is decorative — Step 5.)
- [ ] **Tests (`reviews.repository.integration.test.ts`, pglite-backed):**
  - ownership: build repo with `userId: "user-a"`, `createReview`; build a second repo with `userId: "user-b"`; `getReview` of user-A's review id from repo-B throws `OwnershipError` (user A's row invisible to B). Same for `createInsight` against a cross-user `reviewId`.
  - `listInsights` returns in `priority` order regardless of insert order.
  - `attachPublication` twice for the same `(reviewId, publicationId)` leaves exactly one row (idempotent UNIQUE).

## Step 3 — service (RequestContext + §12 state machine)

- [ ] Create `frontend/src/server/modules/reviews/reviews.errors.ts`: `OwnershipError`, `ConflictError`, `ValidationError`, `UnsupportedOperationError` — re-use the foundation shared error types (import from shared infra; do not redefine if they already exist there).
- [ ] Create `frontend/src/server/modules/reviews/reviews.service.ts`. Every public method takes `(ctx: RequestContext, …)`; it builds a repository bound to `ctx.userId` (`createReviewsRepository(db, { now, nextId, userId: ctx.userId })`) so scoping is structural. Peer services (`ProjectsService`, `PublishingService`, `AnalyticsService`, `ArtifactsService`) are injected via constructor deps as their **public `index.ts` interfaces** (no repository imports). Methods:
  - `createReview(ctx, projectId, { reviewType, contentOutputId })` — backs `reviews.create`:
    1. Validate scope: when `reviewType === "output"`, `contentOutputId` MUST be present → else `ValidationError`; when `reviewType === "project"`, force `contentOutputId = null`. Verify the project is owned by calling `ProjectsService.getProject(ctx, projectId)` (throws `OwnershipError` if not — cross-user project invisible); when output-scoped, verify the output via `ProjectsService.getOutput(ctx, contentOutputId)`.
    2. **Derive the review period** (the contract body omits it): pull the publication window for the scope from `PublishingService.listPublicationsForProject(ctx, projectId)` (output-scoped → filter to `contentOutputId`). `periodStart = min(publishedAt)` / `periodEnd = max(publishedAt)` across published publications; if none published yet, default both to `now()` (an empty-period in_progress review is valid — insights can be authored before metrics land). `reportArtifactId = null` at creation (a `review_report` artifact is linked later via the optional Artifacts path; not in the create body).
    3. `repo.createReview({ projectId, reviewType, contentOutputId, periodStart, periodEnd, reportArtifactId: null })`; map row → `reviewResource` DTO (Step 4 mapper). Optionally `ProjectsService.recordActivity(ctx, { projectId, eventType: "review_created", entityType: "review", entityId: review.id })` (post-commit; activity failure must not roll back the review fact — SPEC §11).
  - `getReview(ctx, reviewId)` → `repo.getReview(reviewId)` → DTO. Backs `reviews.get`.
  - `createInsight(ctx, reviewId, { insightType, title, description })` — backs `reviews.insights.create`:
    1. `repo.getReview(reviewId)` (ownership) — and **guard the review is `in_progress`** (cannot add insights to a `completed`/`abandoned` review → `ConflictError`).
    2. **Derive `priority`** = `repo.countInsights(reviewId)` (0-based insert order — the contract body has no priority field).
    3. **Derive `evidence`** = the relevant Analytics snapshot for the review period: `AnalyticsService.getProjectSnapshots(ctx, review.projectId, { from: review.periodStart, to: review.periodEnd })`, reduced to a small `Record<string,unknown>` (e.g. `{ source: "analytics", metric: "...", value: ... }`). If Analytics has no data, default `evidence = {}`. (Determinate: `evidence` is never user-supplied; it is the metric context the AI review node will also read.)
    4. `repo.createInsight(reviewId, { insightType, title, description, evidence, priority })` → DTO.
  - `completeReview(ctx, reviewId)` — backs `reviews.complete`. `repo.getReview(reviewId)` (ownership); enforce the **Review.status machine**: if `status === "completed"` return the existing DTO unchanged (**idempotent**); if `status === "abandoned"` throw `ConflictError`; else `repo.completeReview(reviewId)` (sets `completed` + `completedAt = now()`) → DTO. Post-commit: `ProjectsService.recordActivity(ctx, { … "review_completed" … })`. (Completing the review is the signal G14 Learnings consumes — a completed review's insights become promotable `learnings.create` sources; Reviews does NOT call Learnings — the bridge is owned by the Learnings module reading completed reviews.)
- [ ] **Tests (`reviews.service.test.ts`, fake `now`/`nextId`, in-memory/pglite db, stubbed peer services):**
  - `createReview` project-scope: `ProjectsService.getProject` called with `ctx`; row is `in_progress`, `contentOutputId: null`, `reportArtifactId: null`; period derived from stubbed `PublishingService.listPublicationsForProject` (min/max `publishedAt`).
  - `createReview` output-scope without `contentOutputId` → `ValidationError`; with `contentOutputId` → output verified via `ProjectsService.getOutput`.
  - `createReview` with no published publications → `periodStart === periodEnd === now()` (empty-period default).
  - `createInsight` derives `priority` = current count (1st insight `priority 0`, 2nd `priority 1`) and `evidence` from the stubbed `AnalyticsService.getProjectSnapshots`; adding an insight to a `completed` review → `ConflictError`.
  - `completeReview` happy path: `in_progress → completed`, stamps `completedAt`; idempotent second call returns the same `completed` row WITHOUT re-stamping `completedAt`; completing an `abandoned` review → `ConflictError`.

## Step 4 — transport (register ops) + schema

- [ ] Create `frontend/src/server/modules/reviews/reviews.schema.ts`: re-export the contract DTOs/enums used (`reviewResource`, `reviewInsightResource`, `reviewPublicationResource`, `reviewsOperations`) — single import surface for this module. Add the row→DTO mappers (`toReviewDto(row)`, `toReviewInsightDto(row)`) here so the service and contract test share one mapping (DTO must be explicitly built, never the Drizzle row — SPEC §9).
- [ ] Create `frontend/src/server/modules/reviews/reviews.transport.ts` mirroring `createPersistenceTransport` (`backend/src/persistence-transport.ts`) but **ctx-taking** (foundation §2: transport signature gains `ctx`). Export `createReviewsTransport(service)` returning `{ request(ctx, endpoint, input) }` with a `switch (endpoint.id)`:
  - `"reviews.create"` → `service.createReview(ctx, params.projectId, body)`, `meta: singleMeta`.
  - `"reviews.get"` → `service.getReview(ctx, params.reviewId)`, `meta: singleMeta`.
  - `"reviews.insights.create"` → `service.createInsight(ctx, params.reviewId, body)`, `meta: singleMeta`.
  - `"reviews.complete"` → `service.completeReview(ctx, params.reviewId)`, `meta: singleMeta`.
  - default → `throw new UnsupportedOperationError(endpoint.id)`.
- [ ] Create `frontend/src/server/modules/reviews/index.ts` exporting the public service interface (`ReviewsService` — the methods Learnings/AI consume: at least `getReview`, plus a `listCompletedReviewInsights(ctx, projectId)` read added here for the G14 bridge) + the op-id list `["reviews.create","reviews.get","reviews.insights.create","reviews.complete"]` and a `registerReviews(registry)` that adds the transport map. Register this module in the composite transport registry (foundation §1: union builds `PERSISTED_OPS` — no edit to the composite switch).
- [ ] **Tests (`reviews.contract.test.ts`):** for EACH of the four op ids, drive the transport with a seeded `ctx` + valid input and assert `reviewsOperations[<key>].response.parse(envelope.data)` succeeds (output validates against the contract DTO). Specifically: `reviews.create` → `reviewResource.parse` (status `"in_progress"`, `completedAt: null`); `reviews.insights.create` → `reviewInsightResource.parse` (`evidence` is an object, `priority` an int); `reviews.complete` → `reviewResource.parse` with `status: "completed"` and non-null `completedAt`.

## Step 5 — FE island wiring (from roadmap §4 `/projects/:id/review` rows)

Roadmap §4 for this page is **wired-local 7 · decorative 2 · needs-backend 0**, with an explicit **Gap**: "no UI to create review / add insight / complete review … review-authoring surface is **greenfield**" (G13 FE task: "build the greenfield review-authoring surface (create review, add insight, complete) + review-history drill-down"). So Step 5 = (a) keep the existing wired-local analytics interactions untouched, (b) **build the new authoring surface** mapped to this module's ops, (c) wire the one Reviews-owned existing row (`Review-history rows` → `reviews.get` drill-down).

Edit `frontend/src/features/review/analytics-review-interactive-region.tsx` (+ server shell `analytics-review-page.tsx` for the initial read). Preserve the `viewModel?` seam. The server read for the review-history list switches from fixture to a real op when available (list of the project's reviews); the new authoring controls call the Reviews ops then `router.refresh()`.

Existing §4 rows (verbatim labels) — wiring:

| §4 label | §4 state | wiring |
|---|---|---|
| `7 page tabs (整体/平台/观众/内容/收益/对比/体验)` | wired-local | Analytics-owned re-scope (`buildAnalyticsReviewViewModel`); **no Reviews op** — keep as-is. |
| `趋势 / 漏斗 chart tabs` | wired-local | local chart emphasis — keep as-is. |
| `Key-moment rows` | wired-local | local highlight — keep as-is. |
| `查看全部 (top-published)` | **decorative** | Analytics drill (`GET /analytics/projects/:id`) — **intentionally inert** for Reviews (not a Reviews op). |
| `Top-published cards` | **decorative** | Analytics publication drill — **intentionally inert** for Reviews. |
| `Review-history rows` | wired-local → backend | `data-history-id` row in `ReviewHistoryCard` (`analytics-review-interactive-region.tsx` ~L717). On select, call `reviews.get` `{ reviewId: <history-id> }` and render the returned review + its insights in a detail panel (the §4 note "open detail not wired" becomes wired). `router.refresh()` not needed (read-only drill). |

New authoring surface (greenfield — the §4 **Gap**), added as a `ReviewAuthoringPanel` client island inside the right rail (next to `ReviewHistoryCard`). Each control maps to exactly one Reviews op:

| New control (label) | op | body / params | transition |
|---|---|---|---|
| `开始复盘` (start review) | `reviews.create` | params `{ projectId }`; body `{ reviewType: "project", contentOutputId: null }` (project-scope default; an output-scope variant passes `reviewType:"output"` + the selected `contentOutputId`) → then `router.refresh()` | — (creates `in_progress`) |
| `添加洞察` (add insight) | `reviews.insights.create` | params `{ reviewId }`; body `{ insightType, title, description }` from the insight form (the `insightType` select offers 成功亮点→`success` / 待优化→`issue` / 行动项→`action` / 假设→`hypothesis`) → `router.refresh()` | — |
| `完成复盘` (complete review) | `reviews.complete` | params `{ reviewId }` → `router.refresh()` | `in_progress → completed` |
| `添加发布` (attach publication) | **decorative** | `reviewPublications` schema + `repo.attachPublication` exist but **no contract op** this wave — render the control `disabled`/inert, **intentionally inert** (note in code). |
| `生成复盘报告` / `采纳 AI 洞察` (AI report / adopt) | **decorative (this wave)** | belongs to the **AI vertical** (G15) — the `reportArtifactId` link + AI-suggested insights land via `ai.createTask`/`ai.confirm`, NOT a Reviews op. Leave inert here; wired in `modules/15-ai.md`. |

- [ ] Add/extend `frontend/src/features/review/analytics-review-interactions.test.tsx`: assert the new authoring buttons issue the mapped op via the HttpTransport mock (`开始复盘` → `reviews.create`; `添加洞察` → `reviews.insights.create`; `完成复盘` → `reviews.complete`; `Review-history row` select → `reviews.get`), and that decorative controls (`查看全部`, `Top-published cards`, `添加发布`, `生成复盘报告`) issue **no** network call. Existing wired-local analytics interaction tests stay green (unchanged behavior).

## Step 6 — tests (per MODULE-ARCH §2 trio) + acceptance (SPEC §22)

- [ ] All three test files green: `reviews.service.test.ts` (state-machine guards valid+invalid, period/priority/evidence derivation, complete idempotency, insight-on-completed guard), `reviews.repository.integration.test.ts` (pglite, ownership user-A-vs-user-B, insight `priority` ordering, `attachPublication` idempotent UNIQUE), `reviews.contract.test.ts` (each of 4 ops validates against its contract DTO).
- [ ] **Acceptance checklist (SPEC §22):** module ships service + repository + schema + tests; **no cross-module repository import** (peer access only via `index.ts` service interfaces — Projects/Publishing/Analytics/Artifacts); the dispatch route does not touch the db client (it threads `ctx` into `compositeTransport.request`); every repository query is user-scoped (`eq(table.userId, ctx.userId)`); the API DTO is built by an explicit mapper, never the Drizzle row (SPEC §9); `reviews.complete` is idempotent (SPEC §22); a completed review's insights are exposed via `index.ts` so **Learnings (G14) + AI (G15)** can consume them without a repo import (the unblock contract).
- [ ] Module ends GREEN under `pnpm verify` (frontend) + the module's own Vitest files.

---

## Open questions (resolve at execution, do not block planning)

1. **Period derivation source of truth.** The contract `reviews.create` body omits `periodStart`/`periodEnd`; this plan derives them from `PublishingService.listPublicationsForProject` (min/max `publishedAt`). Confirm Publishing exposes that read on its `index.ts` (or whether the window should instead come from `AnalyticsService` snapshot bounds). Recommend: Publishing for bounds, Analytics for `evidence`.
2. **`evidence` shape.** `reviewInsightResource.evidence` is `Record<string,unknown>` (free-form). Confirm the canonical reduction of an Analytics snapshot into `evidence` (e.g. `{ metric, value, capturedAt }`) so the AI review node (G15) and the FE render agree on keys. Recommend: `{ source: "analytics", window: {from,to}, metrics: {...} }`.
3. **`reportArtifactId` linkage.** A `review_report` ArtifactVersion is an optional Review field but has no Reviews op to set it. Confirm it is owned by the AI vertical (`ai.confirm` formalizing the report artifact then patching the review) vs. a future `reviews.linkReport` op. Recommend: AI vertical owns it (keep Reviews create/complete artifact-agnostic this wave).
4. **`abandoned` status.** The contract enum includes `abandoned` but no op reaches it. Confirm it stays schema-valid-but-unwired this wave (no `reviews.abandon` op exists in `contract/src/operations/reviews.ts`).
5. **Learnings bridge direction.** This plan keeps Reviews ignorant of Learnings (Learnings reads completed reviews via `ReviewsService.listCompletedReviewInsights`). Confirm the G14 `promoteReviewInsight` flow lives in the Learnings module, not as a Reviews op (grep confirms `contract/src/operations/learnings.ts` has `learnings.create`, no `reviews.promote`).
