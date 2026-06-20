# Stage 15 — Service Contract Design (CreatorOS)

Date: 2026-06-21 · Stage: 15-service-contract (orchestrator frontier) ·
Decision basis: user chose path B (advance the pipeline) + approach C
(Zod-first contract with a swappable transport). Closes GAP-002.

## 1. Goal

Produce the single, executable, FE↔BE-shared **service contract** that the
frontend and the (future) backend both build against. It is the missing
"middle" of the workflow: today the frontend runs on deterministic fixtures
with no API; mutating actions (save / publish / delete / transition) have
nowhere to go. The contract gives every operation a typed home **now** (served
by an in-memory mock) and a zero-rewrite swap to the real backend at stage 16.

Success criteria:
- Every endpoint in `backend/SPEC.md §13` exists as a typed, validated contract operation.
- Each backend-bearing FR maps to ≥1 contract operation (GAP-002 traceability restored).
- The frontend keeps running deterministically with **no backend** (visual baselines intact).
- Mutations work **now** against a `MockTransport`; swapping to `HttpTransport` at stage 16 changes one wiring line, not page code.

## 2. Inputs (already exist — the contract is a convergence, not a green-field design)

- **Endpoints**: `backend/SPEC.md §13` — ~60 REST routes under `/api/v1`, grouped by domain (projects/flow, artifacts, knowledge/assets, production/publishing, analytics/reviews/learnings, AI/search/system, ingestion).
- **Envelope**: `backend/SPEC.md §14` — success `{data, meta}`, list `{data, meta:{page,pageSize,total}}`, error `{error:{code,message,details}, meta}`; error→HTTP map (ValidationError 400 … OwnershipError 404 … UnexpectedError 500).
- **Schemas/types**: `backend/SPEC.md §9` (Zod-first), frontend `types/domain.ts` (58 entities) and `types/view-models.ts` (page ViewModels).
- **Module map**: `backend/MODULE-ARCHITECTURE.md` — 16 domain modules + application query services + page→module mapping.
- **Read logic**: frontend `fixtures/selectors/*` — 17 sync `build<Page>ViewModel()` functions that already derive every page's data from the canonical fixtures.
- **State machines**: `SPEC.md §12` — Project / Stage / ContentOutput / Publication / AI-task transitions (the mutation semantics).

## 3. Architecture

A new pure-TypeScript workspace package `contract/` (sibling of `frontend`/`backend`,
added to `pnpm-workspace.yaml`; deps: `zod` only — no React/Next), so both
apps consume it via `workspace:*`.

```
contract/
├── package.json            # name @creatoros/contract, exports, zod dep
├── src/
│   ├── envelope.ts         # Success/List/Error envelope schemas + ErrorCode enum (SPEC §14)
│   ├── primitives.ts       # shared scalar schemas (Id, Iso8601, PlatformId, enums) re-using domain shapes
│   ├── schemas/            # one file per module: request + response Zod schemas
│   │   ├── projects.ts     #   (response schemas reuse the ViewModel shapes where the FE already defines them)
│   │   ├── artifacts.ts
│   │   ├── knowledge.ts  assets.ts  production.ts  publishing.ts
│   │   ├── analytics.ts  reviews.ts  learnings.ts  ai.ts
│   │   ├── search.ts  notifications.ts  settings.ts  ingestion.ts
│   ├── endpoints.ts        # the operation registry: defineEndpoint({ id, method, path, params, query, body, response })
│   ├── client.ts           # createClient(transport): typed methods, one per endpoint, applies the envelope
│   ├── transport.ts        # Transport interface { request(endpoint, input): Promise<Envelope> }
│   └── index.ts            # public surface
└── tests/                  # contract-level Zod round-trip + traceability tests
```

Two transports (same interface, chosen at the composition root):
- **`MockTransport`** (now): an in-memory `FixtureStore` seeded from the canonical dataset. Reads delegate to the existing `build<Page>ViewModel()` selectors; writes mutate the in-memory store **deterministically** (seeded id generator, `FIXED_NOW` clock — no `Date.now`/`Math.random`). Lives in `frontend` (it imports fixtures), not in the contract package.
- **`HttpTransport`** (stage 16): `fetch` against `/api/v1`, parses the SPEC §14 envelope, maps error codes. Trivial; deferred.

The contract package itself stays transport-agnostic and dependency-light so the backend can import the **same** schemas to validate its route handlers — one source of truth, no drift.

## 4. Data flow

Read (server component):
```
Page (server) → await client.getDashboard()
              → MockTransport.request(GET /analytics/dashboard)
              → buildDashboardViewModel()  (existing selector)
              → {data: DashboardViewModel, meta}   ← validated by response schema
```
Mutation (client island — the "buttons"):
```
Button onClick → client.transitionPublication(id, {to:'published'})
              → MockTransport (validate body → mutate FixtureStore per §12 state machine → return new entity)
              → island updates URL/local state on success
   (stage 16: same call → HttpTransport → real API)
```

The response **types are the existing ViewModels** for read endpoints, so the
frontend's render code is unchanged in shape — only the data *source* moves
from a direct `canonicalDataset` deref to `await client.*`.

## 5. Scope & phasing

Stage 15 deliverable = **the contract package (all endpoints typed) + the client + MockTransport framework + one page proven end-to-end**. Frontend adoption and mutations are phased so every step stays green and visually stable:

- **P1 — Contract package**: envelope, primitives, all module schemas, endpoint registry, `client`, `transport` interface. Contract tests: every §13 endpoint is registered; every backend-bearing FR maps to an operation (traceability table). No frontend change yet.
- **P2 — MockTransport + one read path**: `FixtureStore` + read handlers delegating to selectors; convert **one** page (Dashboard or Projects) to `await client.*`; prove determinism + visual parity.
- **P3 — Reads sweep**: migrate remaining 16 read paths page-by-page (each verified).
- **P4 — Mutations (the buttons)**: wire high-value mutations through the client against MockTransport, honoring §12 state machines — e.g. stage transition (`进入工作台`/next stage), publication transition (draft→ready→published), script version save+adopt, knowledge/asset create, notification read, review-insight→learning. Replaces decorative buttons with real in-memory interactions.
- **P5 — Stage 16 handoff**: backend implements routes against the shared schemas (TDD per `backend/TDD-PLAN.md`); composition root swaps MockTransport→HttpTransport.

P1–P3 are the stage-15 gate; P4 is where the user's "buttons don't work" is actually resolved; P5 is stage 16.

## 6. Determinism & testing

- MockTransport uses `FIXED_NOW` + a seeded counter for any new ids; **no** `Date.now`/`Math.random`/network — same rule as fixtures/selectors. Visual baselines and existing tests stay valid.
- Contract tests (in `contract/tests`): Zod round-trip per schema; endpoint-registry completeness vs §13; FR→operation traceability map.
- Frontend: each migrated page keeps its existing unit + (eventually) visual tests; mutation islands get new interaction tests (don't weaken existing assertions).
- `pnpm verify` stays the gate for the frontend; the contract package adds its own `test`/`typecheck`.

## 7. Traceability (closes GAP-002)

A `contract/tests/traceability.ts` table maps each backend-bearing FR → contract operation id(s). The orchestrator consistency gate (upstream→downstream) can then flip from FAIL toward PASS as operations land, and stage 16 tests attach to the same operation ids.

## 8. Out of scope (explicit)

- Real backend implementation, DB, object storage, auth (stage 16).
- Real AI task execution / ingestion pipeline (mock returns deterministic canned results).
- Real-time/push, pagination beyond the envelope shape, rate limiting.
- Replacing the visual reference baselines (stage 12, separate).

## 9. Risks / open decisions

- **Async read refactor**: moving server components from sync fixture derefs to `await client.*` touches every page. Mitigated by phasing (P2 proves the pattern on one page before the sweep) and by keeping response types = existing ViewModels.
- **Branch**: this is a new stage; recommend a `feat/service-contract` branch off `remediation/frontend-spec-alignment` (or main once the remediation merges). To confirm with user.
- **Package name/location**: `contract/` workspace pkg `@creatoros/contract`. If a flat `frontend/src/contract` is preferred short-term, it can be promoted later — but the shared-package form is what lets the backend reuse it without a bad dependency direction.
