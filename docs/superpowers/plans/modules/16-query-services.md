# Module 16 — Query services (Dashboard / Project Overview / Publishing Center / Global Search DTOs) · Executable TDD Plan (Wave 4)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:test-driven-development` + `superpowers:executing-plans`. This plan follows the **keystone** `docs/superpowers/plans/2026-06-21-program-foundation.md` §5 per-module template and §1 architecture verbatim. Steps use `- [ ]`. Do **not** write implementation into the app outside the file paths named here. Each task is red→green→commit.

## Goal

Take final ownership of the **4 page-composition reads** (SPEC §19 "查询组合"). These are **application query services** that compose page-specific DTOs by calling **public module services only** — never repositories, never cross-module repository joins (SPEC §19 bullets 1–2; foundation §1 module-arch). This module owns:

- `pages.dashboard.get` → `dashboardPage` DTO (composes Projects + Publishing + Analytics + Learnings + Notifications services per SPEC §19).
- `pages.projectOverview.get` → `projectOverviewPage` DTO (composes Projects + Assets + Production/Activity + Publishing + Analytics services).
- `pages.search.get` → `globalSearchPage` DTO (**takes over** the interim composer the Search module shipped in Wave 1; foundation §6, roadmap §523).
- `publishingCenterPage` DTO → **no HTTP endpoint** (SPEC §13 has no read path; `contract/src/operations/pages.ts:7-10`). Composed **client-side** from `GET /publications` + analytics. This module ships the **selector/composer** that builds the DTO for the FE; it registers **no** transport op for it.

FE: switch the Dashboard, Project Overview, and Publishing Center server reads from fixture-composed view models to the composed ops, preserving the `viewModel?` seam; wire the Publishing Center batch/search rows per program-roadmap §4.

## Architecture

- Module lives at `.worktrees/frontend-implementation/frontend/src/server/modules/query-services/` (MODULE-ARCH §2 layout; foundation §1). It is a **composition module**: it has **no `db-schema.ts` and no `repository.ts`** — it owns **no entities and no SQL** (SPEC §19: "组合层只能调用 service … 不允许跨模块 repository join … 组合层 DTO 专门面向页面"). This is the one deliberate deviation from the §5 template (db-schema/repository steps below are **explicitly N/A** and documented as such, not skipped silently).
- `@creatoros/backend` is shared infra (`RequestContext`, the module **transport registry**, `UnsupportedOperationError`, the `Envelope` type). The query services register their `{ opId → handler }` map into the registry; the composite transport builds `PERSISTED_OPS` from the union (foundation §1 — no edits to `compositeTransport` per module).
- **User scope is inherited, not re-enforced.** This module issues **no SQL**, so there is no `eq(table.userId, ctx.userId)` here. Instead it **threads the same `RequestContext`** into every downstream service call; each consumed service enforces its own user scope at its own repository. The query service's invariant: **every downstream call receives `ctx` unchanged** (no ctx mutation, no userId override) — proven by test, not by a WHERE clause.
- **Consume only `index.ts` public entries.** Each upstream module is imported **only** via `frontend/src/server/modules/<module>/index.ts` (foundation §1: "modules import each other only via `index.ts`"). No `*.repository.ts` import from this module — a grep-guard test enforces it (Task 6).
- pglite `globalThis` singleton is used **only** transitively through the downstream services (foundation §1); this module never constructs `createDb()` itself.

## Tech Stack

Next.js (App Router) · `@creatoros/contract` Zod page DTOs (`dashboardPage`, `projectOverviewPage`, `globalSearchPage`, `publishingCenterPage`) · vitest. No Drizzle, no ORM in this module — composition only.

## Dependency note

**Blocked by (must be GREEN first):** Wave 0 (foundation §1 registry + §2 Identity/auth — `ctx`-threaded `/api/v1/dispatch`) **and all upstream service modules whose public methods this composes:** Projects (05), Knowledge (06), Assets (07), Publishing (10), Analytics (11), Learnings (14), Notifications (01), Search (02), Production (09). This is **Wave 4** — runs after every module `index.ts` is frozen (roadmap §521). The 4 contract page ops already exist (15a, `contract/src/operations/pages.ts` + `contract/src/pages/*.ts`).

## Contract op ids this module owns (grepped, not guessed)

| Op id | Method · Path | Response DTO | Source |
|---|---|---|---|
| `pages.dashboard.get` | `GET /analytics/dashboard` | `dashboardPage` | `contract/src/operations/pages.ts:23-29` |
| `pages.projectOverview.get` | `GET /projects/:projectId/overview` | `projectOverviewPage` | `contract/src/operations/pages.ts:15-22` |
| `pages.search.get` | `GET /search?q&type` | `globalSearchPage` | `contract/src/operations/pages.ts:30-37` (final ownership; Search shipped the interim composer) |
| *(none — DTO only)* | — | `publishingCenterPage` | `contract/src/operations/pages.ts:7-10` (re-export only; **no endpoint registered** — composed client-side from `GET /publications` + analytics) |

- DTO field shapes consumed: `contract/src/pages/dashboard.ts` (`dashboardPage`, `metricCard`), `contract/src/pages/project-overview.ts` (`projectOverviewPage`), `contract/src/pages/global-search.ts` (`globalSearchPage`), `contract/src/pages/publishing-center.ts` (`publishingCenterPage`).
- `contract/src/operations/search.ts` exports `searchOperations = {}` (empty by design) — Search owns no standalone dispatch endpoint; `pages.search.get` is the only HTTP op on the Search surface and this module owns it now.

> **Coordination with Wave 1 Search (02):** the Search plan (`modules/02-search.md` Task 4) ships an **interim** `pages.search.get` composer registered into the registry, explicitly handing final ownership here (foundation §6; `02-search.md:23,83`). Task 4 of **this** plan **replaces** that interim handler: the registry entry for `pages.search.get` must resolve to **this** module's transport, and the interim Search transport entry is removed (or this module's registration overrides it — pick override-then-delete; Task 4 step 3). Do **not** leave two handlers competing for the same op id.

> **SPEC §19 composition map (verbatim — names are the public service methods to call):**
> ```
> DashboardQueryService
> ├── ProjectsService.getDashboardSummary
> ├── PublishingService.getRecentPublications
> ├── AnalyticsService.getDashboardMetrics
> ├── LearningsService.getSuggestions
> └── NotificationsService.getUnreadCount
> ```
> If a named upstream method does not yet exist on the frozen `index.ts`, that is a **blocking open question** (see end), not an excuse to read the repository.

---

## Tasks

### Task 1 — db-schema: **N/A (composition module owns no entities)**

- [ ] **No file.** Per SPEC §19, query services own no schema. Add a one-line module README note `frontend/src/server/modules/query-services/README.md`: "Composition module — no db-schema, no repository, no entities. Owns 3 page-read ops + 1 client-composed DTO selector. SPEC §19." This task exists only to make the §5 template's db-schema step an explicit, recorded N/A (not a silent omission).
- [ ] **Commit:** `docs(query-services): record composition module owns no schema/repository`.

### Task 2 — repository: **N/A (no SQL; consumes services only)**

- [ ] **No file.** SPEC §19: "组合层只能调用 service … 不允许跨模块 repository join." The user-scope guarantee is **inherited** by threading `ctx` into downstream services (each enforces `eq(table.userId, ctx.userId)` in its own repo). The §5 "repository integration test (ownership enforced)" obligation is satisfied **at this module's boundary** by Task 6's ctx-propagation + no-repository-import tests, not by a pglite repo here.
- [ ] **No commit** (covered by Task 1's README note).

### Task 3 — service (RequestContext + composition; no state machine)

> **State machine:** query services have **no business state machine** (foundation roadmap §398: read-only composition). Their invariants are SPEC §19's composition rules (services-only, no cross-module repo join, page-shaped DTO, ctx threaded unchanged). Encode those as the service contract + tests, not a transition table.

Create one composer per page DTO. File: `frontend/src/server/modules/query-services/query-services.service.ts` exporting four factories, each taking the **already-resolved public service interfaces** as deps (constructor-injected via `index.ts`, so this module never reaches into another module's internals):

```ts
// shape (illustrative — exact upstream method names per each module's frozen index.ts)
createDashboardQueryService(deps: {
  projects: ProjectsServiceFacade;      // getDashboardSummary, getContinueCreating, listTodos
  publishing: PublishingServiceFacade;  // getRecentPublications
  analytics: AnalyticsServiceFacade;    // getDashboardMetrics, getDataOverview, getTrend
  learnings: LearningsServiceFacade;    // getSuggestions
  notifications: NotificationsServiceFacade; // getUnreadCount
  topics: KnowledgeServiceFacade;       // getTrendingTopics (热门选题)
}): { getDashboard(ctx: RequestContext): Promise<DashboardPage> }
```

- [ ] **RED** Write `frontend/src/server/modules/query-services/query-services.service.test.ts`. Use **stub upstream services** (plain objects implementing each facade) so the test asserts composition wiring, not downstream logic:

  **DashboardQueryService.getDashboard(ctx):**
  1. Calls each SPEC §19 method **with the same `ctx`** (assert each stub received `ctx` by identity — proves ctx threaded unchanged, no userId override).
  2. Maps results into a `dashboardPage` object that **validates against `dashboardPage`** (`dashboardPage.parse(result)` does not throw).
  3. Sets `kind: "dashboard"`, `loading: false`, `error: null`, `scenario: "default"`; `metrics` from `analytics.getDashboardMetrics`, `continueCreating` from projects, `todos` from projects, `trendingTopics` from knowledge, `recentPublications` from `publishing.getRecentPublications`, `dataOverview` from analytics, `suggestions` from learnings, `assistantPrompt` deterministic string. (Note: `dashboardPage` has no field for unread count; `notifications.getUnreadCount` feeds the shell badge composition, not the dashboard DTO body — call it but assert it is **not** dropped into `dashboardPage` fields. If a future DTO field needs it, slot there; for now its consumer is the shell, out of this DTO.)
  4. **Empty scenario:** when projects/publications/etc. are all empty, returns `scenario: "empty"`, empty arrays, `continueCreating` a zero-value object that still satisfies the DTO (heading/projectId/projectTitle/stage/progressPct/updatedAt present) — DTO must validate in the empty case too.
  5. **Error isolation:** if one upstream (e.g. `analytics.getDashboardMetrics`) throws, `getDashboard` returns `scenario: "error"`, `error: { code, message }`, and **still returns a DTO-valid object** (other sections best-effort or empty) — the page renders an error state, it does not 500. (Test: inject a throwing analytics stub → resolves with `error` set, `dashboardPage.parse` clean.)

  **ProjectOverviewQueryService.getProjectOverview(ctx, projectId):**
  6. Threads `ctx` + `projectId` into projects/assets/production/publishing/analytics services; result validates against `projectOverviewPage`; `kind: "project-overview"`, `projectId` echoed.
  7. **Ownership pass-through:** when the projects service raises `OwnershipError` (project not owned by ctx.userId → 404), `getProjectOverview` **propagates** it (does not swallow) — cross-user reads must 404, not render an empty page (SPEC §20; foundation §2). Test: stub projects service throwing `OwnershipError` → assert it propagates.

  **GlobalSearchQueryService.getGlobalSearch(ctx, q, type?):**
  8. Calls `search.search(ctx, q, { entityType: type })` (the Search module's public method), groups by entity type into `projects/knowledge/assets/videos`, calls `search.recordSearch(ctx, …)` + `search.listHistory(ctx, 10)`; result validates against `globalSearchPage`; `query === q`, `kind: "search"`, 4 locked `resultTabs` ids (`项目/知识/素材/视频`) with per-group counts. Empty/whitespace `q` → `scenario: "empty"`, empty groups.
  9. **Parity with the interim composer:** add one assertion that a known fixture query produces the **same grouped shape** the Search-module interim composer produced (so the ownership handoff is behavior-preserving). Reference `02-search.md` Task 4 step 3 grouping.

  **PublishingCenterQueryService.getPublishingCenter(ctx, opts?):**
  10. Composes `publishingCenterPage` from `publishing.listPublicationsForUser(ctx)` (or the publishing service's recent/all method) + `analytics.getPublishingMetrics(ctx)`; result validates against `publishingCenterPage`; `kind: "publishing-center"`. This composer is **not** registered as a transport op (no endpoint) — it is exported for the FE selector to call server-side (Task 5 step "Publishing Center server read"). Test validates `publishingCenterPage.parse`.

- [ ] Create `frontend/src/server/modules/query-services/query-services.service.ts` with the four factories above. Each method takes `(ctx: RequestContext, …)` first, calls only the injected service facades, and returns a parsed/parse-able page DTO. **No `createDb`, no Drizzle import, no `*.repository` import.** Add `frontend/src/server/modules/query-services/query-services.errors.ts` re-exporting `OwnershipError` from shared infra (for the propagation path; not thrown locally except re-raise).
- [ ] Create `frontend/src/server/modules/query-services/query-services.schema.ts` re-exporting `dashboardPage`, `projectOverviewPage`, `globalSearchPage`, `publishingCenterPage` from `@creatoros/contract` for module-local use (foundation §5 layout).
- [ ] **GREEN** all service tests pass. **Commit:** `feat(query-services): Dashboard/Overview/PublishingCenter/Search composers`.

### Task 4 — transport: register `pages.dashboard.get` + `pages.projectOverview.get` + take over `pages.search.get`

> Three HTTP ops; `publishingCenterPage` has **no endpoint** (composed client-side, Task 5).

- [ ] **RED** Write `frontend/src/server/modules/query-services/query-services.contract.test.ts`. Build the transport with real (or pglite-backed) upstream services seeded for one user, then:
  1. `pages.dashboard.get` handler with `{}` → `data.data` validates against `dashboardPage`; `kind === "dashboard"`.
  2. `pages.projectOverview.get` handler with `{ params: { projectId: <seeded id> } }` → validates against `projectOverviewPage`; `data.data.projectId` echoes the param. Calling with **another user's** project id → handler surfaces a 404/`OwnershipError` envelope (not a leaked page).
  3. `pages.search.get` handler with `{ query: { q: "钩子", type: undefined } }` → validates against `globalSearchPage`; `query === "钩子"`, `kind === "search"`, 4 locked `resultTabs`.
- [ ] Create `frontend/src/server/modules/query-services/query-services.transport.ts` exporting `queryServicesTransport: Record<string, (ctx, input) => Promise<Envelope>>` with **exactly three** entries:
  - `"pages.dashboard.get"` → `dashboardService.getDashboard(ctx)`, wrap `{ data, meta: { requestId: ctx.requestId } }`.
  - `"pages.projectOverview.get"` → read `input.params.projectId`, `overviewService.getProjectOverview(ctx, projectId)`, wrap envelope. Let `OwnershipError` bubble so the dispatch route maps it to 404 (foundation §2).
  - `"pages.search.get"` → read `input.query.q` (+ optional `input.query.type`), `searchService.getGlobalSearch(ctx, q, type)`, wrap envelope.
  - **No** `publishingCenterPage` entry (no op id exists; registering one would violate the contract). Add a code comment: `// publishingCenterPage: no endpoint per contract/src/operations/pages.ts:7-10 — composed client-side via PublishingCenterQueryService (Task 5).`
- [ ] Add `frontend/src/server/modules/query-services/index.ts` (the ONLY public entry): export the four service factories + `queryServicesTransport`. Register `queryServicesTransport` into the module registry (foundation §1) so `compositeTransport` includes the three ops in `PERSISTED_OPS`. **Take over `pages.search.get`:** ensure this registration is the resolved handler for `pages.search.get` and **remove the Search module's interim registration** of that op (per the coordination note above) so exactly one handler owns it. Do **not** hand-edit `persistence-client.ts`'s `PERSISTED_OPS` Set — use the registry.
- [ ] **GREEN** contract test passes (all three `*.parse` clean; ownership 404 path proven). **Commit:** `feat(query-services): register dashboard/overview/search page-read ops`.

### Task 5 — FE wiring (from program-roadmap §4 button rows)

Four pages composed here: **Dashboard `/`** (roadmap §91-102), **Project Overview `/projects/:id`** (§131-138), **Publishing Center `/publishing`** (§264-276), **Global Search `/search`** (§286-298, server read already converted in `02-search.md` Task 5 — confirm it now points at this module's op). Switch each server read to the composed op while **preserving the `viewModel?` seam** (foundation §5; all four features already accept an optional `viewModel` prop — verified: `dashboard-page.tsx:53`, `project-overview-page.tsx:62`, `publishing-center-page.tsx:72`).

**Dashboard `/` — wired-local 2 · decorative 7 · needs-backend 0 (roadmap §91-102):**
- [ ] **Server read switch** — `frontend/src/app/(creator)/page.tsx` (currently `<DashboardPage />` with no data) → fetch `pages.dashboard.get` server-side via the contract server client, pass the `dashboardPage` result into `DashboardPage` as `viewModel` through a small adapter mapping `dashboardPage` → `DashboardViewModel` (`frontend/src/types/view-models.ts:137`). Keep `buildDashboardViewModel()` as the fixture default when no op data (the existing `viewModel ?? buildDashboardViewModel(...)` fallback at `dashboard-page.tsx:79` — do not remove it; tests/SSR rely on it).
- [ ] **§94 — `开始对话 (AI CTA Link)`** · `link` · **wired-local** · "Open copilot via `?copilot=open`". Already a Link; leave (owned by AI module, not changed here).
- [ ] **§95 — `新项目 (entry Link)`** · `link` · **wired-local** · "Open `/projects/new` modal". Already a Link to `/projects/new`; leave (Projects module flow).
- [ ] **Decorative — intentionally inert (leave; annotate `// decorative per roadmap §4` at each render site):** §96 `继续创作 row`, §97 `待办事项 row (×4)`, §98 `热门选题 row`, §99 `最近发布 row (×4)`, §100 `数据概览 MetricCards`, §101 `本周播放趋势 sparkline`, §102 `创作建议 row`. These now render **real composed data** (from `pages.dashboard.get`) but remain non-interactive (no drill-down/onClick) — they are display projections, not buttons. The data is live; the click is intentionally absent.

**Project Overview `/projects/:id` — wired-local 1 · decorative 4 · needs-backend 0 (roadmap §131-138):**
- [ ] **Server read switch** — `frontend/src/app/(creator)/projects/[projectId]/page.tsx` → fetch `pages.projectOverview.get` with `{ params: { projectId } }`, pass the `projectOverviewPage` into `ProjectOverviewPage` as `viewModel` via an adapter mapping `projectOverviewPage` → `ProjectOverviewViewModel` (`view-models.ts:223`). Preserve the `viewModel ?? buildProjectOverviewViewModel(projectId)` default (`project-overview-page.tsx:73`). Cross-user project id → the op 404s → render `not-found.tsx` (foundation §2 — no existence leak).
- [ ] **§138 — `进入工作台`** · `link` · **wired-local** · "Enter workspace at current stage". Already a Link; confirm its href derives from the composed `stage` field. Leave behavior; just feed it real `stage`.
- [ ] **Decorative — intentionally inert (leave; annotate):** §134 `编辑信息` (PATCH /projects/:id — no edit island this wave), §135 `收藏` (favorite toggle — no endpoint wired), §136 `分享` (no §13 endpoint — **spec gap**, see open questions), §137 `更多` (overflow/archive — owned by Projects module, not here).

**Publishing Center `/publishing` — wired-local 12 · decorative 0 · needs-backend 3 (roadmap §264-276):**
- [ ] **Server read switch** — `frontend/src/app/(creator)/publishing/page.tsx` → call `PublishingCenterQueryService.getPublishingCenter(ctx)` **server-side** (not a dispatch op — there is no `pages.publishingCenter.get` endpoint). Two acceptable wirings, pick one and note it: **(a)** call the composer directly in the Server Component via the module's `index.ts` (server-only import), passing the `publishingCenterPage` as `viewModel` to `PublishingCenterPage` (`publishing-center-page.tsx:140`, preserving `viewModel ?? buildPublishingCenterViewModel()` at `:142`); **(b)** if the FE may only reach the backend via the transport, compose client-side from `outputs.publications.list` + analytics as the contract comment prescribes. **Decision:** use **(a)** server-side composer (the DTO comment says "composed client-side via GET /publications + analytics", but server-side composition of the same services is the cleaner same-process path and still touches **no repository**; record this in the README). Either way the FE renders the `publishingCenterPage` DTO shape.
- [ ] **§267 — `内容类型 tabs (全部/视频/图文/音频)`** · `tab` · **wired-local** · "Filter by content type". Client-side filter over the composed `rows` in `publishing-center-interactive-region.tsx`; already wired-local — confirm it filters the op-supplied rows (not fixtures).
- [ ] **§268 — `搜索发布内容`** · `form` · **wired-local** · "Free-text filter + ?q=" · target `GET /search`. Client filter over `rows`; if it escalates to a global search, `router.push('/search?q='+value)` (lands in `pages.search.get`). Confirm wired-local filter remains.
- [ ] **§269 — `4 filter chips (全部/7天/30天/待优化)`** · `filter` · **wired-local** · date/engagement filter over composed rows. Client-side; leave wired-local.
- [ ] **§270 — `全选 checkbox`** · `toggle` · **wired-local** · select all visible rows. Client state; leave.
- [ ] **§271 — `批量发布`** · `button` · **needs-backend** · "Batch-publish selected" · target `POST /publications/:id/transition` (op `publications.transition`, `contract/src/operations/publishing.ts`) · transition **scheduled/ready→published**. In `publishing-center-interactive-region.tsx`, for each selected row call `client.transitionPublication({ params: { publicationId }, body: { status: "published" } })` (Publishing module op), then `router.refresh()` so the server `getPublishingCenter` recomposes. Guard: only rows whose current status ∈ {ready, scheduled} are eligible (SPEC §12 Publication machine `ready → scheduled → published`); ineligible selections are skipped with an inline notice.
- [ ] **§272 — `批量下架`** · `button` · **needs-backend** · "Batch-remove" · target `POST /publications/:id/transition` · transition **published→removed**. Same loop, `body: { status: "removed" }`; eligible only when current status = published (SPEC §12 `published → removed`). `router.refresh()` after.
- [ ] **§273 — `修改时间`** · `button` · **needs-backend** · "Batch-reschedule" · target `POST /publications/:id/revisions` (op `publications.revisions.create`) · transition **ready→scheduled**. For each selected row call `client.createPublicationRevision({ params: { publicationId }, body: { title, description } })` carrying the new schedule; then `router.refresh()`. (Note: the roadmap maps reschedule to the revisions op; the status move to `scheduled` is the Publishing service's effect of the revision, SPEC §12.)
- [ ] **§274 — `Row checkbox`** · `toggle` · **wired-local** · add/remove from batch. Client state; leave.
- [ ] **§275 — `查看 (row action)`** · `button` · **wired-local** · "Highlight row (detail not wired)". Client highlight only; leave wired-local (detail page not in scope).
- [ ] **§276 — `Pagination prev/page/next`** · `button` · **wired-local** · client-side paging over composed `rows`. Leave.

**Global Search `/search` (handoff confirmation):**
- [ ] Confirm `frontend/src/app/(creator)/search/page.tsx`'s server read (converted in `02-search.md` Task 5) now resolves `pages.search.get` to **this** module's transport (Task 4 takeover). No FE code change beyond verifying the op handler identity; the `/search` button rows (§286-298) were wired in the Search plan and stay as-is. If the Search interim transport was removed (Task 4 step 3), run the Search FE tests to confirm no regression.
- [ ] **Commit:** `feat(query-services): wire Dashboard/Overview/PublishingCenter server reads + publishing batch ops`.

### Task 6 — tests (per MODULE-ARCH §2: service / repository-integration / contract)

> Repository-integration is **reinterpreted** for a composition module (no repo): the equivalent guarantees are ctx-propagation, services-only, and multi-tenant isolation through the downstream stack.

- [ ] Confirm the module test files exist and are green: `query-services.service.test.ts` (Task 3 — all four composers, ctx-threading, empty + error scenarios, ownership propagation), `query-services.contract.test.ts` (Task 4 — three ops `*.parse` clean + 404 path).
- [ ] **No-repository-import guard** (`query-services.architecture.test.ts`): grep this module's source for any import matching `*.repository`, `createDb`, `drizzle`, or `eq(` from `drizzle-orm` → assert **zero** hits (SPEC §19 "不允许跨模块 repository join"; SPEC §22 "没有跨模块 repository import"). Also assert imports of other modules resolve only to their `index.ts` (no deep `modules/<m>/<m>.service` paths).
- [ ] **Multi-tenant smoke** (in `query-services.contract.test.ts`): seed user A + user B in the real upstream services (pglite). Run `pages.dashboard.get` as A → assert B's projects/publications/metrics never appear. Run `pages.projectOverview.get` as A on B's project id → assert 404/`OwnershipError` (no leak). Run `pages.search.get` as A → assert B's documents absent. This proves the inherited-scope invariant end-to-end (foundation §9 multi-tenant smoke).
- [ ] **FE adapter tests:** alongside `frontend/src/features/dashboard/dashboard-page.test.tsx`, `project-overview/project-overview-page.test.tsx`, `publishing-center/publishing-center-page.test.tsx` — render each with a `viewModel` built from the corresponding **contract page DTO fixture** (not the fixture selector) and assert the page renders the op-supplied data; for Publishing Center, assert `批量发布`/`批量下架`/`修改时间` call the mapped Publishing ops on selected rows and trigger `router.refresh()`.
- [ ] **GREEN** all green. **Commit:** `test(query-services): composer + contract + no-repo-import + multi-tenant smoke + FE adapters`.

### Task 7 — acceptance (SPEC §22 + §19)

- [ ] Verify, checkbox by checkbox:
  - [ ] Module has `service` + `schema` + `tests` (the §2 file set under `modules/query-services/`, **minus db-schema/repository which are documented N/A per SPEC §19** — Task 1/2 README note).
  - [ ] **No cross-module repository import** — the no-repository-import guard (Task 6) is green; imports of upstream modules are via `index.ts` only.
  - [ ] **No cross-module repository join** — this module issues no SQL at all (grep: zero `db.select`/`drizzle`/`createDb`).
  - [ ] **Composition layer calls services only**, returns **page-specific DTOs** (SPEC §19 bullets 1+3) — each handler output validates against its contract page DTO.
  - [ ] **Route does not touch the db client** — `/`, `/projects/:id`, `/publishing` routes and `/api/v1/dispatch` go through `compositeTransport` → query service → upstream services only.
  - [ ] **Ctx threaded unchanged** — every downstream call receives the request's `ctx` (Task 3 identity assertions); user scope is enforced downstream.
  - [ ] **17 frontend pages have a defined API or query service** (SPEC §22 bullet) — this module closes Dashboard / Project Overview / Publishing Center / Global Search, the last 4 composed reads.
  - [ ] **Publication transitions idempotent + state-machine-guarded** (SPEC §22; §12) — the `批量发布`/`批量下架` loops respect `ready/scheduled→published` and `published→removed`; re-running on an already-transitioned row is a safe no-op at the Publishing service.
  - [ ] All 4 page DTOs validate for `default` and `empty` scenarios; `error` scenario validates for Dashboard.
- [ ] Run module tests + `pnpm verify` (frontend) — **must be GREEN**. **Commit:** `chore(query-services): acceptance — SPEC §19/§22 green`.

---

## Open questions (resolve before/at execution)

1. **Exact upstream public method names.** SPEC §19 names `ProjectsService.getDashboardSummary`, `PublishingService.getRecentPublications`, `AnalyticsService.getDashboardMetrics`, `LearningsService.getSuggestions`, `NotificationsService.getUnreadCount`. Several DTO fields (Dashboard `continueCreating`/`todos`/`trendingTopics`; Overview `stages`/`recentFiles`/`activities`/`milestones`; Publishing Center `platformComparison`/`trend`/`topContent`) need **additional** public methods that may not all be on the frozen `index.ts` of Projects/Knowledge/Assets/Production/Analytics. **Before coding Task 3, grep each module's `index.ts` for the method surface and list any gap** — a missing method is a blocking dependency on that module's plan, **not** a license to read its repository. (Notifications' `getUnreadCount` is confirmed built per `01-notifications.md:104`.)
2. **`pages.search.get` ownership takeover.** Task 4 removes the Search module's interim registration so exactly one handler owns the op. Confirm the registry supports override/replace (foundation §1 union) and decide: delete the interim Search transport entry, or have the query-services registration win deterministically. Coordinate with whoever executed `02-search.md`.
3. **Publishing Center has no read endpoint.** The DTO is composed server-side here (Task 5 option (a)) rather than client-side via `GET /publications` as the contract comment suggests (`pages.publishing-center.ts:6-10`). Confirm server-side same-process composition (touching no repository) is acceptable vs. forcing the FE to fan out `outputs.publications.list` + analytics calls. If a `pages.publishingCenter.get` endpoint is later added to the contract, this composer slots behind it unchanged.
4. **`修改时间` (reschedule) → revisions op.** Roadmap §273 maps batch-reschedule to `publications.revisions.create` (not `transition`). Confirm the Publishing service moves status `ready→scheduled` as a side-effect of creating a revision (SPEC §12), and what `title`/`description` the batch action supplies for the revision body.
5. **`分享` (Project Overview §136) spec gap.** No §13 endpoint exists (roadmap §136, §542 lists Share as undecided: "drop vs add"). Left **decorative — intentionally inert** here; confirm drop-vs-add so it is not silently forgotten.
6. **Notifications unread count placement.** `dashboardPage` has no unread-count field; `getUnreadCount` is called (SPEC §19) but its consumer is the shell badge, not the Dashboard DTO body. Confirm it is composed into the shell (Identity/Shell wiring), not expected in `pages.dashboard.get`.
