# Query services (Wave 4 — composition module)

Composition module — **no db-schema, no repository, no entities**. Owns the 3
page-read ops + 1 client-composed DTO selector. SPEC §19.

| Op id | DTO | Notes |
|---|---|---|
| `pages.dashboard.get` | `dashboardPage` | composes Projects + Publishing + Analytics + Learnings + Notifications + Knowledge |
| `pages.projectOverview.get` | `projectOverviewPage` | composes Projects + Assets + Production + Publishing + Analytics; `OwnershipError` propagates → 404 |
| `pages.search.get` | `globalSearchPage` | **takes over** the Search module's Wave-1 interim composer (foundation §6) |
| _(no endpoint)_ | `publishingCenterPage` | composed **server-side** via `PublishingCenterQueryService` (Task 5 decision (a)); no transport op registered |

## Why no schema/repository (the §5-template deviation)

SPEC §19: "组合层只能调用 service … 不允许跨模块 repository join … 组合层 DTO 专门面向页面."
This module issues **no SQL**. User scope is **inherited**, not re-enforced: every
downstream service call receives the request's `RequestContext` unchanged (no ctx
mutation, no userId override); each consumed service enforces its own
`eq(table.userId, ctx.userId)` at its own repository. The §5 "repository
integration test" obligation is satisfied at this module's boundary by the
ctx-propagation + no-repository-import + multi-tenant-smoke tests, not by a pglite
repo here.

## Composition contract

Each composer is constructed with **facade interfaces** (`query-services.service.ts`)
declaring exactly the upstream public methods it calls. The composition root
(`persistence-client.ts`) binds those facades to the real public services (via each
module's `index.ts` — never a deep `*.service`/`*.repository` import). The
no-repository-import guard (`query-services.architecture.test.ts`) enforces this.

## Publishing Center composition (Task 5 decision (a))

`publishingCenterPage` has **no read endpoint** in SPEC §13. Rather than forcing the
FE to fan out `outputs.publications.list` + analytics, the Publishing Center page is
composed **server-side, same-process** via `PublishingCenterQueryService` (still
touching **no repository** — only public services). If a `pages.publishingCenter.get`
endpoint is later added to the contract, this composer slots behind it unchanged.
