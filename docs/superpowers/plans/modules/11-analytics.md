# Module 11 — Analytics — Executable TDD Plan (Wave 3)

> **Keystone:** follow `docs/superpowers/plans/2026-06-21-program-foundation.md` §1 (architecture) and §5 (per-module template). This plan is the ordered TDD task list for the Analytics module. Steps use `- [ ]`. Output is working, user-scoped, contract-conformant code under the Next app — **not** a redesign.

**Goal:** Light up the **read** side of analytics for CreatorOS: persist append-only platform metrics (`MetricSnapshot` / `MetricValue` / `RetentionPoint` / `AudienceSnapshot`) and serve them, user-scoped, through the two contract ops the module owns — `analytics.publications.get` and `analytics.projects.get`. Wire the Analytics Review page (`/projects/:id/review`) and the Dashboard analytics widgets to those ops via the existing `viewModel?` seam. The **write** path (metric ingestion) is exercised here only as an internal `AnalyticsService.appendSnapshot` seam called by Ingestion (module 12); Analytics owns the idempotent append + storage, Ingestion owns the run/idempotency-key envelope (SPEC §17).

**Architecture (per foundation §1):**
- Module lives at `frontend/src/server/modules/analytics/` (MODULE-ARCH §2 template).
- Repositories are **user-scoped only** — every query filters `eq(table.userId, ctx.userId)`. Metric rows carry a denormalized `user_id` (stamped at append time from `ctx.userId`) so reads never cross-module-join to publications.
- Service methods take `RequestContext`; transport handlers are `(ctx, input) => envelope` and register into the module transport registry (no edits to the composite).
- pglite is the `globalThis` singleton from the shared infra (`@creatoros/backend` `createDb`); the module adds its DDL to the shared init.
- DTOs come from `@creatoros/contract` resources (`contract/src/resources/analytics.ts`) — never return Drizzle row types (SPEC §9).

**Tech stack:** TypeScript · Drizzle ORM over pglite (`@electric-sql/pglite`) · Zod (contract) · Vitest · Next App Router (Server Components + client islands).

**Dependency note (must be GREEN first):** Wave 0 (registry generalization + Identity/auth + mock adapters), Wave 2 **Projects** (project ownership + `/projects/:id/review` route shell), Wave 3 **Publishing** (Publication entity + `resolvePublication`). Analytics is consumed downstream by **Ingestion** (12), **Reviews** (13), and the Wave-4 **DashboardQueryService**; those are NOT prerequisites for this plan.

**Contract ops this module owns (grepped from `contract/src/operations/analytics.ts`):**
| op id | method · path | response | isList |
|---|---|---|---|
| `analytics.publications.get` | `GET /analytics/publications/:publicationId` | `metricSnapshotResource` | yes (`paginationQuery`) |
| `analytics.projects.get` | `GET /analytics/projects/:projectId` | `metricSnapshotResource` | yes (`paginationQuery`) |

> `pages.dashboard.get` (`GET /analytics/dashboard`) shares the `/analytics` path prefix but is a **Wave-4 page-composition op owned by DashboardQueryService** (SPEC §19, foundation §7 row Q) — **out of scope here**. Likewise `ingestion.runs.metrics` (`ingestion.runs.metrics`) is owned by module 12; it merely *calls into* `AnalyticsService.appendSnapshot`.

**State machines (SPEC §12):** Analytics owns **none**. `MetricSnapshot` / `MetricValue` / `RetentionPoint` / `AudienceSnapshot` are **append-only** metric facts with no lifecycle (roadmap §4 closing note: "No machine for … append-only"). The only invariant is **idempotency**: `MetricSnapshot(publication_id, source, captured_at)` is UNIQUE (data-model §9 #11; roadmap §4 note 4) — duplicate idempotency key **or identical `captured_at`** must not create a duplicate snapshot; re-submission returns the original.

---

## Task 1 — db-schema (append-only metric tables + DDL)

- [ ] Create `frontend/src/server/modules/analytics/analytics.db-schema.ts`. Define four Drizzle `pgTable`s mirroring `contract/src/resources/analytics.ts` field-for-field, plus a denormalized `user_id TEXT NOT NULL` on **every** table (the ownership boundary; SPEC §10/§20). Timestamps stored as ISO-8601 **text** to match the contract `iso8601` strings (same convention as `backend/src/schema/projects.ts`). JSON columns as `jsonb`.
  - `metric_snapshots`: `id` (pk), `user_id`, `publication_id`, `ingestion_run_id` (nullable), `captured_at`, `source`, `raw_metrics jsonb`, `created_at`.
  - `metric_values`: `id` (pk), `user_id`, `metric_snapshot_id`, `metric_key`, `numeric_value` (`doublePrecision`), `unit`, `dimensions jsonb`.
  - `retention_points`: `id` (pk), `user_id`, `publication_id`, `captured_at`, `position_ms integer`, `retention_rate doublePrecision`, `viewer_count integer`.
  - `audience_snapshots`: `id` (pk), `user_id`, `publication_id`, `captured_at`, `dimension_type`, `dimension_value`, `percentage doublePrecision`, `audience_count integer`.
- [ ] Export `ANALYTICS_DDL` (raw `CREATE TABLE IF NOT EXISTS …`, same style as `PROJECTS_DDL`). Include the **idempotency UNIQUE index**: `CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshot_pub_source_captured ON metric_snapshots (publication_id, source, captured_at);` (data-model §9 #11). Add read-path indexes `idx_metric_snapshots_pub ON metric_snapshots (user_id, publication_id, captured_at)` and `idx_metric_snapshots_user ON metric_snapshots (user_id)`.
- [ ] Register `ANALYTICS_DDL` into the shared db init (the `createDb` schema-init list per foundation §1 — the module adds its DDL string; do not fork `createDb`).
- [ ] **Test** `frontend/src/server/modules/analytics/analytics.db-schema.test.ts`: spin up `createDb()`, insert one row per table for a fixed `user_id`, select it back, assert round-trip equality of every column (esp. `raw_metrics`/`dimensions` jsonb and ISO-8601 text). Assert a second insert with the same `(publication_id, source, captured_at)` triggers the UNIQUE violation.

## Task 2 — repository (user-scoped, append-idempotent)

- [ ] Create `frontend/src/server/modules/analytics/analytics.repository.ts` exporting `createAnalyticsRepository(db, deps)` where `deps = { now: () => string; nextId: (prefix) => string }` (same `RepoDeps` shape as `project-repository.ts`, minus the per-repo `userId` — ownership now comes from `ctx.userId` passed per call). Interface:
  - `seedSnapshots(rows): Promise<void>` — bulk insert with `onConflictDoNothing()` (fixture seeding parity).
  - `appendSnapshot(userId, input): Promise<{ snapshot; created: boolean }>` — **idempotent append**: `INSERT … ON CONFLICT (publication_id, source, captured_at) DO NOTHING RETURNING *`; if nothing returned, `SELECT` the existing row scoped by `eq(metricSnapshots.userId, userId)` and return it with `created: false`. Inserts the child `metric_values` only when `created` (no duplicate value rows). Stamps `user_id = userId` on snapshot and every value row.
  - `listSnapshotsByPublication(userId, publicationId, page, pageSize): Promise<{ rows; total }>` — `WHERE eq(metricSnapshots.userId, userId) AND eq(metricSnapshots.publicationId, publicationId)`, `ORDER BY capturedAt DESC`, paginated.
  - `listSnapshotsByProject(userId, publicationIds, page, pageSize): Promise<{ rows; total }>` — `WHERE eq(metricSnapshots.userId, userId) AND inArray(metricSnapshots.publicationId, publicationIds)`, `ORDER BY capturedAt DESC`, paginated. (Project→publication resolution happens in the service via `PublishingService`; the repo only takes an already-scoped id list so it never cross-module-joins, SPEC §22.)
- [ ] **Every** select/insert filters or stamps `user_id`. No method accepts a query without a `userId`.
- [ ] **Test** `frontend/src/server/modules/analytics/analytics.repository.integration.test.ts` (pglite-backed):
  - Ownership: seed snapshots for user A and user B on the same `publication_id`; `listSnapshotsByPublication(userA, pub, …)` returns ONLY A's rows.
  - Idempotency: `appendSnapshot(userA, x)` twice with identical `(publicationId, source, capturedAt)` → second returns `{ created: false }` and `listSnapshotsByPublication` count is 1; child `metric_values` count unchanged.
  - Idempotency by distinct `captured_at`: same publication+source, different `captured_at` → two distinct snapshots.
  - Pagination: `total` reflects full match count, `rows` capped at `pageSize`.

## Task 3 — service (RequestContext; no state machine; cross-module resolve)

- [ ] Create `frontend/src/server/modules/analytics/analytics.service.ts` exporting `createAnalyticsService({ repo, publishing })` where `publishing` is the **public** `PublishingService` interface (imported via module 10's `index.ts` only — no repo import; SPEC §22). Methods all take `ctx: RequestContext` first:
  - `appendSnapshot(ctx, input): Promise<{ snapshot; created }>` — the SPEC §11 "指标导入" seam (`AnalyticsService.appendSnapshot`). Delegates to `repo.appendSnapshot(ctx.userId, input)`. **No** state transition (append-only). This is the method `IngestionService.ingestMetrics` calls inside the shared UoW (module 12); Analytics does not own the run/idempotency-key envelope.
  - `getPublicationAnalytics(ctx, publicationId, page, pageSize)` — `await publishing.resolvePublication(ctx, publicationId)` to confirm the publication is owned by `ctx.userId` (throws `OwnershipError` → 404 if not; SPEC §20, no existence leak), then `repo.listSnapshotsByPublication(ctx.userId, publicationId, …)`.
  - `getProjectAnalytics(ctx, projectId, page, pageSize)` — `await publishing.listPublicationIdsByProject(ctx, projectId)` (user-scoped resolve via Publishing's public service), then `repo.listSnapshotsByProject(ctx.userId, ids, …)`. Empty id list → empty page (valid, not error).
- [ ] **Test** `frontend/src/server/modules/analytics/analytics.service.test.ts` with a fake `publishing` and a real pglite repo:
  - `getPublicationAnalytics` for a publication owned by another user → `OwnershipError` (resolve rejects), no rows leaked.
  - `getProjectAnalytics` resolves project→publication ids via the fake and returns only matching snapshots.
  - `appendSnapshot` returns `created:false` on the second identical call (delegated idempotency holds through the service).
  - `getProjectAnalytics` with zero resolved publications → `{ rows: [], total: 0 }`, no throw.

## Task 4 — transport (register the two owned ops)

- [ ] Create `frontend/src/server/modules/analytics/analytics.transport.ts` exporting a `{ opId → (ctx, input) => envelope }` map (pattern from `backend/src/persistence-transport.ts`, generalized to take `ctx`). Throw `UnsupportedOperationError(endpoint.id)` for any other id.
  - `"analytics.publications.get"`: read `params.publicationId`, `query.page`/`query.pageSize` (`paginationQuery`), call `service.getPublicationAnalytics(ctx, …)`, return `{ data: rows, meta: { requestId: ctx.requestId, page, pageSize, total } }` (list envelope, SPEC §14; `isList: true`).
  - `"analytics.projects.get"`: read `params.projectId` + pagination, call `service.getProjectAnalytics(ctx, …)`, same list envelope.
- [ ] Map each Drizzle row → `metricSnapshotResource` DTO shape explicitly (`id`, `publicationId`, `ingestionRunId`, `capturedAt`, `source`, `rawMetrics`, `createdAt`) — drop `user_id`; never leak the row type (SPEC §9).
- [ ] Create `frontend/src/server/modules/analytics/index.ts` exporting the public service interface + the transport map. Register the transport map into the module transport registry (foundation §1: union builds `PERSISTED_OPS`; no edit to `compositeTransport`). Add `"analytics.publications.get"` and `"analytics.projects.get"` to the persisted set via the registry.
- [ ] Create `frontend/src/server/modules/analytics/analytics.schema.ts` re-exporting the contract Zod DTOs (`metricSnapshotResource`, `metricValueResource`, `retentionPointResource`, `audienceSnapshotResource`) for module-local use.
- [ ] Create `frontend/src/server/modules/analytics/analytics.errors.ts` (`OwnershipError` re-export/usage; no module-specific error codes needed beyond ownership).
- [ ] **Test** (contract conformance) `frontend/src/server/modules/analytics/analytics.contract.test.ts`: drive each op through the transport against a seeded pglite store; `metricSnapshotResource.array().parse(envelope.data)` succeeds for both ops; assert `meta.total`/`page`/`pageSize` present on the list envelope.

## Task 5 — FE island wiring (from roadmap §4 button rows)

Rows below are the **exact** §4 inventory for Analytics' pages. Preserve the `viewModel?` seam in `frontend/src/features/review/analytics-review-page.tsx` (currently defaults to `buildAnalyticsReviewViewModel(projectId)`); server reads switch to the real op, tests still pass a `viewModel`.

### `/projects/:id/review` — Analytics Review (roadmap §4: wired-local 7 · decorative 2 · needs-backend 0)
- [ ] **Server read switch:** in the review route (`frontend/src/app/(creator)/projects/[projectId]/review/page.tsx` → `AnalyticsReviewPage`), build the `viewModel` from the real op `analytics.projects.get` via `contract-client.server` (replacing the static `buildAnalyticsReviewViewModel` fixture default) — windowed metric set + views trend derive from the returned `MetricSnapshot[]`. Keep `viewModel?` as the test override.
- [ ] **`7 page tabs (整体/平台/观众/内容/收益/对比/体验)`** — `wired-local`. Re-scopes the window over the already-fetched `analytics.projects.get` result inside the existing client island `frontend/src/features/review/analytics-review-interactive-region.tsx`. **No new fetch per tab** (the island re-derives over loaded data). Leave the local tab state; confirm it reads from the real-op-backed `viewModel`.
- [ ] **`趋势 / 漏斗 chart tabs`** — `wired-local`. Pure client UI emphasis (line vs funnel); **no op**. Leave as-is.
- [ ] **`Key-moment rows`** — `wired-local`. Local highlight selection; **no op**. Leave as-is.
- [ ] **`查看全部 (top-published)`** — **`decorative`**. Maps to `analytics.projects.get` in §4 but is an "open full published list" affordance with no destination this wave. **Mark intentionally inert** (add `data-inert="decorative"`; no `onClick`). Do NOT fabricate a route.
- [ ] **`Top-published cards`** — **`decorative`**. Maps to `analytics.publications.get` (publication drill-down) but the drill-down surface is not built this wave. **Mark intentionally inert.** (The op itself IS wired/tested in Task 4; only this card's navigation is inert.)
- [ ] **`Review-history rows`** — `wired-local`, **Reviews-owned** (`GET /reviews/:id`). Out of this module's scope; leave the local-select behavior, do not wire (Reviews = module 13).

### Dashboard `/` — analytics widgets (roadmap §4: all three `decorative`)
- [ ] **`最近发布 row (×4)`** — **`decorative`** (maps to `analytics.projects.get`). **Mark intentionally inert** — the row's "open publication analytics" navigation is not built this wave; the op stays available for Wave-4 DashboardQueryService.
- [ ] **`数据概览 MetricCards`** — **`decorative`** (KPI tiles, no drill-down; maps to `analytics.projects.get`). **Mark intentionally inert.** KPI values are populated by the Wave-4 `pages.dashboard.get` composition, not by this module directly.
- [ ] **`本周播放趋势 sparkline`** — **`decorative`** (static SVG trend; maps to `analytics.projects.get`). **Mark intentionally inert** (static asset, no handler).
- [ ] **No Dashboard server read switch this wave:** Dashboard's data arrives via the Wave-4 `pages.dashboard.get` query op, which composes `AnalyticsService.getDashboardMetrics` — out of scope here. This plan leaves Dashboard analytics widgets decorative-and-documented (matching §4's `needs-backend 0` for Dashboard).

> **§4 reconciliation:** Analytics has **0 `needs-backend`** controls across both pages — every analytics control is `wired-local` (re-scopes loaded data) or `decorative` (no destination this wave). The module's real product value is the two **read ops** powering the review page's server-built `viewModel` + future Dashboard composition, not a button mutation.

## Task 6 — tests (per MODULE-ARCH §2)

Already authored inline above; consolidate and confirm all run under `pnpm verify`:
- [ ] `analytics.db-schema.test.ts` — table round-trip + UNIQUE constraint.
- [ ] `analytics.repository.integration.test.ts` — ownership isolation (A≠B), append idempotency (dup key & dup `captured_at`), pagination totals.
- [ ] `analytics.service.test.ts` — ownership 404 on cross-user publication, project→publication resolve, append idempotency through service, empty-project empty-page.
- [ ] `analytics.contract.test.ts` — both ops' `data` validate against `metricSnapshotResource.array()`, list `meta` present.
- [ ] FE: extend `frontend/src/features/review/analytics-review-interactions.test.tsx` to assert the review page renders from a `viewModel` derived from an `analytics.projects.get`-shaped payload, and that the two decorative cards carry `data-inert="decorative"` and fire no navigation.

## Task 7 — acceptance (SPEC §22)

- [ ] Module has `service` + `repository` + `schema` + `errors` + `index` + tests under `frontend/src/server/modules/analytics/`.
- [ ] **No cross-module repository import** — Analytics reaches Publishing only via `publishing` public service (module 10 `index.ts`).
- [ ] **Routes don't touch the db client** — the `/api/v1/dispatch` route resolves `ctx` and calls the registered transport; only the repository touches `db`.
- [ ] **Idempotency for metrics** (SPEC §22 "Publication 与指标导入支持幂等"): `MetricSnapshot(publication_id, source, captured_at)` UNIQUE enforced at DDL + `ON CONFLICT DO NOTHING` in the repo; re-submission returns the original snapshot (`created:false`); append-only (no update/delete methods exist).
- [ ] **User scope everywhere** (SPEC §20): every repository select/insert filters/stamps `user_id = ctx.userId`; a multi-tenant smoke confirms user A cannot read user B's snapshots through either op.
- [ ] DTO boundary: ops return `metricSnapshotResource` shape, never Drizzle rows (SPEC §9).
- [ ] `analytics.publications.get` and `analytics.projects.get` registered into `PERSISTED_OPS` via the module registry; mock fallback for these two ids is removed.

**Exit:** `pnpm verify` (frontend) green + all five Analytics test files green.

---

### Open questions (flag at execution, do not block planning)
1. **`PublishingService.listPublicationIdsByProject`** is assumed on Publishing's public interface (module 10). If module 10 exposes only `getRecentPublications`/`resolvePublication`, add the project→publication-ids resolver to module 10's `index.ts` (not an Analytics repo join). Confirm the exact method name when Publishing lands.
2. **`MetricValue` / `RetentionPoint` / `AudienceSnapshot` read exposure:** the two contract ops both respond with `metricSnapshotResource` only — the value/retention/audience tables are persisted (for Ingestion writes + future tab data) but have **no** owned read op this wave. The review page's per-tab charts (观众/收益/体验) currently derive from fixture `viewModel`; whether they read live `MetricValue`/`RetentionPoint` is deferred until a contract op for them exists. Confirm no new contract op is expected of Analytics in this wave.
3. **`ingestion_run_id` provenance:** snapshots appended outside an ingestion run (e.g. seed/fixtures) carry `ingestion_run_id = null`; confirm that nullable is acceptable to module 12's reconciliation.
