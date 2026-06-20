# Stage 15b — Frontend Mock-Backend Integration Design (CreatorOS)

Date: 2026-06-21 · Stage: 15b (consumes the stage-15a `@creatoros/contract`) ·
Decision basis: user chose approach B — **foundation-first + per-vertical**,
starting with the **Projects** vertical. This is the stage that makes the
buttons real (against an in-memory mock) with a zero-rewrite swap to the real
backend at stage 17.

## 1. Goal

Wire the frontend to the contract through a deterministic, server-side
**MockBackend** so that:
- reads flow `page → await client.* → MockTransport → MockBackend (store) → DTO`, replacing direct `canonicalDataset` derefs;
- mutations (buttons) flow `island → client.* → MockBackend mutates the store (per SPEC §12) → island router.refresh() → server re-renders the changed data`;
- the swap to the real backend at stage 17 is one line at the composition root (`MockTransport → HttpTransport`), no page changes.

**Scope of this spec:** the foundation + the **Projects** vertical. Remaining
verticals (Knowledge, Assets, Artifacts, Publishing, …) reuse the foundation and
are folded into their roadmap goals (each its own small plan).

Success criteria:
- `pnpm verify` stays GREEN (398+ tests, build) — the migration keeps the `viewModel?` test-override seam, so unit tests stay sync and fixture-driven.
- Default-state render is byte-identical (store is seeded from the same fixtures) → visual baselines + existing tests unaffected.
- On the Projects pages, the high-value buttons actually work in a running app: **新建项目** creates a project that appears in the list; **进入工作台 / 进入下一步** performs a real stage transition that the workspace + stepper reflect after refresh.

## 2. Mechanism

### 2.1 MockBackend store (`frontend/src/server/mock-backend/`)

- `store.ts` — `createStore()` returns a fresh, mutable, deep-cloned copy of `canonicalDataset` (so mutations never corrupt the shared fixtures). A module singleton `getStore()` backs the running app; tests call `createStore()` / `resetStore()`.
- Determinism: ids from a **seeded counter** per entity (`nextId('project') → "project-mock-1"`); timestamps from `FIXED_NOW`. **No `Date.now`/`Math.random`/network** — same rule as fixtures/selectors.
- The store exposes typed collections (projects, contentOutputs, artifacts, …) keyed by id, plus small query helpers.

### 2.2 Handlers (`frontend/src/server/mock-backend/handlers/<module>.ts`)

One handler module per contract module. Each implements its operations:
- **reads** query the store and return the contract's **resource DTOs** (validated by the contract response schema);
- **writes** mutate the store honoring the SPEC §12 state machine (e.g. `transitionProjectStage` checks the allowed transition, stamps `FIXED_NOW`, appends a `ProjectActivity`), then return the updated resource.
The 4 **page-DTO** endpoints compose their view shape from the store via the (parameterized) selectors.

### 2.3 MockTransport + composition root

- `mock-backend/mock-transport.ts` — implements the contract `Transport`: validates input, dispatches `endpoint.id → handler`, returns the enveloped result.
- `src/lib/contract-client.ts` — the composition root: `export const client = createClient(ENDPOINTS, mockTransport)`. Stage 17 changes only this line to `httpTransport`.

### 2.4 Selector parameterization (the read seam)

Selectors currently `import { canonicalDataset } from "../canonical"` and deref it directly (14 sites). Refactor each `build<Page>ViewModel()` to take its data as input with a default for back-compat:
```ts
// before: reads canonicalDataset internally
export function buildProjectsViewModel(opts = {}): ProjectsViewModel { … listProjects() … }
// after: composes from supplied resources (default keeps existing callers working)
export function buildProjectsViewModel(rows: ReadonlyArray<ProjectResource>, opts = {}): ProjectsViewModel { … }
```
- For **resource pages** (Projects, Script, Planning, …): the page awaits the resource endpoint(s) and passes the DTOs to the selector.
- For **page-DTO pages** (Dashboard, Overview, Publishing Center, Search): the MockBackend handler composes the page DTO from the store using the selector; the page just awaits `client.getDashboard()`.

### 2.5 Page wiring pattern (keeps tests sync)

```ts
export async function ProjectsPage({ viewModel }: Props = {}) {
  // `??` short-circuits: when a test passes `viewModel`, the client is never awaited.
  const vm = viewModel ?? buildProjectsViewModel(
    (await client.listProjects({ query: { page: 1, pageSize: 20 }, params: undefined, body: undefined })),
  );
  …
}
```
Existing unit tests pass `viewModel` → sync, fixture-driven, unchanged. Production (no prop) → awaits the client → store. Server components may be async (several already are).

### 2.6 Mutations (the buttons)

Client islands call the typed mutation and refresh:
```ts
async function onCreate(values) {
  const project = await client.createProject({ body: { title: values.name } , params: undefined, query: undefined });
  router.replace(`/projects/${project.id}/research`); // server re-renders from the mutated store
}
```
`router.refresh()` (or a route change) re-runs the server component, which re-reads the now-mutated store. Session-scoped persistence (resets on server restart) — exactly the deterministic mock semantics.

## 3. Deliverables

**15b-foundation:**
1. `mock-backend/store.ts` (+ seeded id/clock helpers) + a determinism test (two `createStore()` reads are byte-equal; a mutation changes only the intended slice).
2. `mock-backend/mock-transport.ts` + `lib/contract-client.ts`.
3. Parameterize the selectors (default = canonicalDataset, so nothing breaks yet).
4. Prove the loop on **one page (Dashboard)**: `await client.getDashboard()` returns the page DTO from the store; render unchanged; visual/unit parity.

**Projects vertical:**
5. MockBackend `projects` handler: reads (list/get/outputs/tasks/activity) + writes (create, patch, archive, **stage transition**, output create/transition) per §12.
6. Migrate Projects, Project Overview, and the workspace stepper/header reads to `await client.*` (keep `viewModel?` override).
7. Wire the buttons: New Project create → `createProject` (then enter research); 进入工作台/进入下一步 → `transitionProjectStage`; archive/favorite → patch/archive. Each island refreshes; add interaction tests (the store + a `viewModel`-less integration test).

## 4. Determinism & testing

- Unit/page tests keep using the `viewModel?` prop → no client/store, fully deterministic, no behaviour change.
- New MockBackend tests: store determinism; each mutation's §12 guard (valid + invalid transition); a small integration test rendering a page WITHOUT the prop (exercises client→store→DTO→selector).
- Visual: default render reads the seeded store = same data = same pixels → baselines hold. Mutations only fire on interaction.
- `pnpm verify` remains the gate; add a `mock-backend` test group.

## 5. Out of scope (follow-on, per roadmap goals)

- The other module verticals' FE wiring (Knowledge/Assets/Artifacts/Production/Publishing/Analytics/Reviews/Learnings/AI) — same foundation, separate plans.
- Real backend (stage 16) and the `MockTransport→HttpTransport` swap (stage 17).
- Auth, real AI/ingestion execution, cross-session persistence.

## 6. Risks

- **Async read refactor breadth** — mitigated: foundation proves the pattern on one page; Projects is the first real vertical; `viewModel?` override keeps every existing test green; selectors stay pure (parameterized).
- **Store residence** — a server-module singleton persists per process (session-scoped, resets on restart). This is the intended mock semantics, not app state; the frontend keeps no client store (URL-state-only preserved).
- **Selector signature churn** — changing `build<Page>ViewModel()` signatures touches their callers; the default parameter limits the blast radius to the pages being migrated in each vertical.
- **Projects page hardcodes `DESIGN_PROJECT_ROWS`** — unlike most pages, the Projects list renders a hardcoded design array by default, not the canonical projects. Migrating it to store reads surfaces the canonical/store projects instead, so that page's tests + visual baseline must be aligned (seed the store to match, or re-baseline the Projects page). Plan step: reconcile in the Projects vertical, not the foundation. The byte-identical claim holds for the selector-driven pages; Projects is the one known exception.

## 7. Decisions

- **Branch:** continue on `feat/service-contract` (15b is the contract's first consumer; tightly coupled). Can split to `feat/mock-backend` if preferred.
- **Composition root:** `src/lib/contract-client.ts` exporting a singleton `client` bound to `MockTransport` now; one-line swap at stage 17.
- **First proof page:** Dashboard (has a page DTO → smallest read change). **First vertical:** Projects (highest-value buttons).
