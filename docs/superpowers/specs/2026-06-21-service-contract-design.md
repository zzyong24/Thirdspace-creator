# Stage 15 — Service Contract Design (CreatorOS)

Date: 2026-06-21 (revised after critical self-review) · Stage:
15-service-contract (orchestrator frontier) · Decision basis: user chose path B
(advance the pipeline) + approach C (Zod-first contract with a swappable
transport). Closes GAP-002.

## 0. What changed in this revision

A critical review corrected four things and split the work:
- **Read responses are resource DTOs, not ViewModels.** Only 4 endpoints are
  page-shaped (the application QueryServices, MODULE-ARCHITECTURE §5). The rest
  return domain resources; the frontend composes ViewModels from them.
- **Mock persistence is a server-side mock backend**, not island memory —
  required so reads and writes share one mutable store under SSR.
- **The read migration is mandatory, not optional churn**: once a contract
  exists, the frontend must take data via the client, not deref fixtures.
- **Scope is split** into **15a (contract package — this spec's deliverable)**
  and **15b (frontend mock-backend integration + mutations — separate spec)**.

## 1. Goal

Produce the single, executable, FE↔BE-shared **service contract** both apps
build against — the missing middle of the workflow. SPEC §3 mandates that the
frontend access the backend **only** through an approved HTTP contract and never
import backend internals; this package *is* that contract, expressed as pure
Zod schemas + a typed client, so the backend reuses the same schemas to validate
its routes (no drift) and the frontend gets a typed seam with no backend yet.

**This spec covers 15a only.** 15b (where buttons become real) is scoped at the
end and gets its own spec/plan.

Success criteria (15a):
- Every endpoint in `backend/SPEC.md §13` is a typed, validated contract operation.
- Each backend-bearing FR maps to ≥1 contract operation (GAP-002 traceability restored).
- The package is pure (zod only; no React/Next/backend internals) and both apps can import it.
- `pnpm --filter @creatoros/contract test && typecheck` green; the frontend is **unchanged** (no behaviour/visual risk in 15a).

## 2. Inputs (the contract is a convergence of existing artifacts, not green-field)

- **Endpoints**: `backend/SPEC.md §13` — ~60 REST routes under `/api/v1`, grouped by domain.
- **Envelope**: `backend/SPEC.md §14` — success `{data, meta}`, list `{data, meta:{page,pageSize,total}}`, error `{error:{code,message,details}, meta}`; error→HTTP map.
- **Schemas/types**: `backend/SPEC.md §9` (Zod-first), frontend `types/domain.ts` (58 entities), `types/view-models.ts`.
- **Resource vs page shape**: `backend/MODULE-ARCHITECTURE.md §5` — only **DashboardQueryService / ProjectOverviewQueryService / PublishingCenterQueryService / GlobalSearchQueryService** return page DTOs; all other endpoints return domain resources.
- **State machines**: `SPEC.md §12` — Project / Stage / ContentOutput / Publication / AI-task transitions (mutation semantics, for 15b).
- **Tech**: backend is Node LTS + Next.js + TypeScript strict + Zod + Drizzle + Vitest (SPEC §3) → a shared Zod package is the right contract form.

## 3. Architecture (15a)

New pure-TypeScript workspace package `contract/` (sibling of `frontend`/`backend`,
added to `pnpm-workspace.yaml`; name `@creatoros/contract`; dependency: `zod`
only).

```
contract/
├── package.json            # @creatoros/contract, exports ./, zod dep, vitest
├── src/
│   ├── envelope.ts         # Success/List/Error envelope + ErrorCode enum + error→HTTP map (SPEC §14)
│   ├── primitives.ts       # shared scalars: Id, Iso8601, PlatformId, status enums (mirror domain shapes)
│   ├── resources/          # resource DTO schemas (domain-shaped) — one file per module
│   │   ├── projects.ts artifacts.ts knowledge.ts assets.ts production.ts
│   │   ├── publishing.ts analytics.ts reviews.ts learnings.ts ai.ts
│   │   └── search.ts notifications.ts settings.ts ingestion.ts taxonomy.ts
│   ├── pages/              # the 4 page-shaped DTOs (composition endpoints)
│   │   ├── dashboard.ts project-overview.ts publishing-center.ts global-search.ts
│   ├── endpoints.ts        # operation registry: defineEndpoint({ id, method, path, params, query, body, response })
│   ├── client.ts           # createClient(transport): one typed method per endpoint; applies the envelope
│   ├── transport.ts        # Transport interface { request(endpoint, input): Promise<Envelope<unknown>> }
│   └── index.ts            # public surface
└── tests/
    ├── envelope.test.ts        # round-trip success/list/error
    ├── registry.test.ts        # every §13 route is registered exactly once; paths well-formed
    └── traceability.test.ts    # backend-bearing FR → operation id(s) map is complete
```

Key shapes:
- **Resource DTOs** mirror the domain entities the backend owns (Project, Artifact, KnowledgeItem, Asset, Publication, MetricValue, Learning, AITaskReference, …) — NOT the frontend ViewModels.
- **Page DTOs** (4) are the composition shapes for the dashboard / overview / publishing-center / search endpoints.
- **`endpoints.ts`** is the registry binding method+path (from §13) to its params/query/body/response schemas. It is the machine-checkable form of §13.
- **`client.ts`** turns the registry into typed methods; it is transport-agnostic. Transports (MockTransport in 15b, HttpTransport in stage 16) live in their consumers, not here.

15a writes NO transport and changes NO frontend code — it ships the typed boundary + tests only.

## 4. Data flow (target, realised across 15a→15b→stage16)

Read (server component, after 15b):
```
Page (server) → await client.getProjects(query)
              → Transport.request(GET /projects, query)        [15b: MockStore | s16: HTTP]
              → { data: ProjectResource[], meta:{page,…} }      ← validated by response schema
Page → buildProjectsViewModel(resources)                        ← existing selector, now fed by DTOs
```
Mutation (client island — "buttons", 15b):
```
onClick → client.transitionPublication(id,{to:'published'})
        → Transport (validate body → mutate MockStore per §12 → return resource)
        → island: router.refresh() → server re-renders from the mutated store
   (stage 16: same call → HttpTransport → real API + DB)
```
Read responses are **resource DTOs**; the frontend's `build<Page>ViewModel()`
functions move from `build(canonicalDataset)` to `build(resourcesFromClient)`,
keeping presentation in the frontend and resources in the contract/backend.

## 5. Scope

**15a (this spec — the stage-15 gate deliverable):**
1. `contract/` package: envelope, primitives, all resource DTO schemas, the 4 page DTOs, endpoint registry, typed `client`, `transport` interface.
2. Contract tests: envelope round-trip, registry completeness vs §13, FR→operation traceability.
3. Wire `pnpm-workspace.yaml`; the package builds/tests independently. **No frontend change.**

**15b (separate spec — where the buttons become real):**
- A server-side **MockBackend** in the frontend: a resettable in-memory store seeded from the canonical fixtures; deterministic ids/clock (`FIXED_NOW`, seeded counter; no `Date.now`/`Math.random`). Implements the contract operations: reads from the store, writes mutate it per §12.
- A `MockTransport` binding the client to the MockBackend; composition root selects it.
- Migrate the 17 read paths to `await client.*` (selectors recomposed over resource DTOs); verify determinism + visual parity page-by-page.
- Wire high-value mutations (stage transition, publication transition, script save/adopt, knowledge/asset create, notification read, insight→learning) with `router.refresh`.

**Stage 16 (backend):** implement routes against the same schemas (TDD per `backend/TDD-PLAN.md`); swap MockTransport→HttpTransport at the composition root.

## 6. Determinism & testing (15a)

- The package is logic-light (schemas + registry + a thin client); tests are pure Zod round-trips + registry/traceability assertions — no clock/network/randomness at all.
- It adds its own `test`/`typecheck`; it does not touch `frontend`'s `pnpm verify`, so there is zero behaviour/visual risk in 15a.

## 7. Traceability (closes GAP-002)

`tests/traceability.test.ts` asserts a complete map from each backend-bearing FR
to ≥1 operation id. The orchestrator consistency gate (upstream→downstream) can
then move toward PASS as 15b/stage-16 attach implementations + tests to the same
operation ids.

## 8. Out of scope

- Any backend implementation, DB, storage, auth (stage 16).
- Transports, the mock store, frontend read/mutation wiring (15b).
- Real AI/ingestion execution; real-time/push; rate limiting.
- Replacing visual reference baselines (stage 12).

## 9. Decisions (resolved)

- **Branch**: `feat/service-contract` off `remediation/frontend-spec-alignment` (the contract builds on the remediated frontend; rebase/merge when the remediation lands).
- **Location**: top-level `contract/` workspace package `@creatoros/contract` — the only form that lets the backend reuse the schemas without importing across the FE↔BE boundary (SPEC §3).
- **Form**: shared Zod (approach C). May additionally emit OpenAPI from the schemas later (for external-skill writers, SPEC §13 ingestion) — out of 15a scope.

## 10. Risks

- **Endpoint/response fidelity**: 15a must match §13 exactly; the registry-completeness test guards method+path coverage, but response *field* fidelity to §9/domain is reviewer-checked.
- **15b async refactor** (deferred): moving 17 pages to `await client.*` is the large, risky part — isolated to 15b and phased page-by-page there, not in 15a.
