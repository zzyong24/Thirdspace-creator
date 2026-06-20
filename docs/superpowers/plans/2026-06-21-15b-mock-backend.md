# Stage 15b — Mock-Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the frontend to `@creatoros/contract` through a deterministic server-side MockBackend so reads come from a mutable store and buttons (mutations) actually work session-scoped, with a one-line swap to the real backend at stage 17.

**Architecture:** A cloned-from-fixtures, deterministic in-memory store + per-module handlers behind a `MockTransport`; a `client` composition root; selectors parameterized over data (default `canonicalDataset` for back-compat); pages `await client.*` while keeping the `viewModel?` test-override seam. Foundation proves the loop on Dashboard; the Projects vertical lights up the highest-value buttons.

**Tech Stack:** Next.js App Router (async server components), TypeScript, `@creatoros/contract` (Zod), Vitest.

---

## References
- Design: `docs/superpowers/specs/2026-06-21-15b-mock-backend-design.md`
- Contract: `contract/src/{endpoints,client,transport}.ts`, `contract/src/resources/*`, `contract/src/pages/*`
- Fixtures/selectors: `frontend/src/fixtures/canonical.ts`, `frontend/src/fixtures/selectors/index.ts`
- State machines: `backend/SPEC.md §12`

## File structure (new, in `frontend/`)
```
src/server/mock-backend/
├── store.ts            # MockStore type, createStore(), seeded id/clock, reset
├── handlers/
│   ├── projects.ts     # projects module reads + writes (per §12)
│   └── pages.ts        # the 4 page-DTO composers (dashboard first)
├── mock-transport.ts   # implements contract Transport; id → handler dispatch
└── index.ts            # getStore()/resetStore() + the handler registry
src/lib/contract-client.ts   # composition root: client = createClient(ENDPOINTS, mockTransport)
```

---

## FOUNDATION

### Task 1: MockBackend store (clone + determinism)

**Files:**
- Create: `frontend/src/server/mock-backend/store.ts`
- Test: `frontend/src/server/mock-backend/store.test.ts`

- [ ] **Step 1: Write the failing test** — `store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createStore, nextId, FIXED_NOW_ISO } from "./store";
import { canonicalDataset } from "@/fixtures/canonical";

describe("mock-backend store", () => {
  it("clones the canonical dataset (independent copy)", () => {
    const a = createStore();
    expect(a.projects.length).toBe(canonicalDataset.projects.length);
    a.projects.push({ ...a.projects[0]!, id: "x" });
    // mutating the store must not touch the shared fixtures
    expect(canonicalDataset.projects.some((p) => p.id === "x")).toBe(false);
  });

  it("two fresh stores are value-equal (deterministic seed)", () => {
    expect(JSON.stringify(createStore().projects)).toBe(
      JSON.stringify(createStore().projects),
    );
  });

  it("generates deterministic ids and a fixed clock", () => {
    const s = createStore();
    expect(nextId(s, "project")).toBe("project-mock-1");
    expect(nextId(s, "project")).toBe("project-mock-2");
    expect(FIXED_NOW_ISO).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `pnpm --filter creatoros-frontend exec vitest run src/server/mock-backend/store.test.ts` → cannot find `./store`.

- [ ] **Step 3: Implement `store.ts`**

```ts
import { canonicalDataset, FIXED_NOW } from "@/fixtures/canonical";

// FIXED clock — never Date.now(); mirrors the fixtures' deterministic time.
export const FIXED_NOW_ISO = new Date(FIXED_NOW.getTime()).toISOString();

// A MockStore is a deep, mutable copy of the canonical dataset plus per-prefix
// id counters. Structurally identical to `canonicalDataset` so selectors read it.
export type MockStore = typeof canonicalDataset extends infer T
  ? { -readonly [K in keyof T]: T[K] } & { __counters: Record<string, number> }
  : never;

export function createStore(): MockStore {
  const clone = structuredClone(canonicalDataset) as Record<string, unknown>;
  clone.__counters = {};
  return clone as MockStore;
}

export function nextId(store: MockStore, prefix: string): string {
  const n = (store.__counters[prefix] ?? 0) + 1;
  store.__counters[prefix] = n;
  return `${prefix}-mock-${n}`;
}
```

If `FIXED_NOW` is not exported from canonical, read it: `grep "FIXED_NOW" frontend/src/fixtures/canonical.ts` and export/import accordingly (it is defined there).

- [ ] **Step 4: Run it; expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(mock-backend): deterministic cloned store + seeded ids"`

---

### Task 2: MockTransport + client composition root

**Files:**
- Create: `frontend/src/server/mock-backend/index.ts`, `frontend/src/server/mock-backend/mock-transport.ts`, `frontend/src/lib/contract-client.ts`
- Test: `frontend/src/server/mock-backend/mock-transport.test.ts`

- [ ] **Step 1: Write the failing test** — `mock-transport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetStore } from "./index";
import { client } from "@/lib/contract-client";

describe("mock transport", () => {
  beforeEach(() => resetStore());

  it("serves a registered read through the typed client", async () => {
    const projects = await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 20 },
      body: undefined,
    });
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
  });

  it("throws a typed error for an unimplemented operation", async () => {
    await expect(
      client.listLearnings?.({ params: undefined, query: undefined as never, body: undefined }),
    ).rejects.toThrow(/not implemented/i);
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (missing modules).

- [ ] **Step 3: Implement `mock-transport.ts`**

```ts
import type { Endpoint, Transport } from "@creatoros/contract";
import { getStore } from "./index";
import { projectsHandlers } from "./handlers/projects";
import { pagesHandlers } from "./handlers/pages";

export type Handler = (input: {
  params: unknown;
  query: unknown;
  body: unknown;
  store: ReturnType<typeof getStore>;
}) => unknown;

// id → handler. Returns `{ data, meta }` envelopes (lists include page meta).
const HANDLERS: Record<string, Handler> = {
  ...projectsHandlers,
  ...pagesHandlers,
};

export const mockTransport: Transport = {
  async request(endpoint: Endpoint, input) {
    const handler = HANDLERS[endpoint.id];
    if (!handler) {
      throw new Error(`MockBackend: operation not implemented: ${endpoint.id}`);
    }
    const data = handler({ ...input, store: getStore() });
    if (endpoint.isList) {
      const arr = data as unknown[];
      return {
        data: arr,
        meta: { requestId: "mock", page: 1, pageSize: 20, total: arr.length },
      };
    }
    return { data, meta: { requestId: "mock" } };
  },
};
```

- [ ] **Step 4: Implement `index.ts`**

```ts
import { createStore, type MockStore } from "./store";

let store: MockStore | null = null;
export function getStore(): MockStore {
  if (!store) store = createStore();
  return store;
}
export function resetStore(): void {
  store = createStore();
}
```

- [ ] **Step 5: Implement `src/lib/contract-client.ts`**

```ts
import { ENDPOINTS, createClient } from "@creatoros/contract";
import { mockTransport } from "@/server/mock-backend/mock-transport";

// Composition root. Stage 17 swaps `mockTransport` for an `httpTransport`
// pointing at /api/v1 — no page code changes.
export const client = createClient(ENDPOINTS, mockTransport);
```

- [ ] **Step 6: Add the `@creatoros/contract` dependency to the frontend** — in `frontend/package.json` dependencies add `"@creatoros/contract": "workspace:*"`, then `pnpm install`. Verify `pnpm --filter creatoros-frontend exec tsc --noEmit` resolves the import.

- [ ] **Step 7: Stub the handler files so the import resolves** — create `handlers/projects.ts` exporting `export const projectsHandlers = {}` and `handlers/pages.ts` exporting `export const pagesHandlers = {}` (filled in Tasks 4/6). Re-run the test: the "throws for unimplemented" case passes; the "listProjects" case still fails (no handler yet) — that is expected; it goes green in Task 6. Mark only the unimplemented-error assertion now; split the test if needed.

- [ ] **Step 8: Commit** — `git commit -m "feat(mock-backend): MockTransport + client composition root"`

---

### Task 3: Parameterize the Dashboard selector (read seam)

**Files:**
- Modify: `frontend/src/fixtures/selectors/index.ts` (`buildDashboardViewModel` + any helper it calls that reads `canonicalDataset`)
- Test: `frontend/src/fixtures/selectors/dashboard-param.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from "vitest";
import { buildDashboardViewModel } from "@/fixtures/selectors";
import { canonicalDataset } from "@/fixtures/canonical";

describe("buildDashboardViewModel(dataset)", () => {
  it("defaults to the canonical dataset (back-compat)", () => {
    expect(JSON.stringify(buildDashboardViewModel())).toBe(
      JSON.stringify(buildDashboardViewModel(canonicalDataset)),
    );
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (signature does not accept an arg yet — or passes trivially; make the arg meaningful).

- [ ] **Step 3: Refactor** — change the signature to
`export function buildDashboardViewModel(dataset: DashboardSource = canonicalDataset): DashboardViewModel`
where `DashboardSource = Pick<typeof canonicalDataset, "projects" | "tasks" | "publications" | …the keys it reads>`. Inside the function body, replace every `canonicalDataset.X` with `dataset.X`, and replace `listProjects()` calls with `dataset.projects` (and `getProjectById(id)` with `dataset.projects.find(p => p.id === id)`). Do NOT change any other selector in this task.

- [ ] **Step 4: Run; expect PASS.**

- [ ] **Step 5: Commit** — `git commit -m "refactor(selectors): parameterize buildDashboardViewModel over its data source"`

---

### Task 4: Dashboard handler + page DTO + prove the loop

**Files:**
- Modify: `frontend/src/server/mock-backend/handlers/pages.ts`
- Modify: `frontend/src/features/dashboard/dashboard-page.tsx`
- Test: `frontend/src/server/mock-backend/handlers/pages.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetStore } from "../index";
import { client } from "@/lib/contract-client";
import { dashboardPage } from "@creatoros/contract"; // if not exported, import from the page module path

describe("dashboard via the client", () => {
  beforeEach(() => resetStore());
  it("returns a dashboard DTO composed from the store", async () => {
    const dto = await client.getDashboard({ params: undefined, query: undefined, body: undefined });
    // structural sanity: it carries the dashboard sections
    expect(dto).toHaveProperty("metrics");
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (no dashboard handler).

- [ ] **Step 3: Implement the dashboard handler** — in `handlers/pages.ts`:

```ts
import { buildDashboardViewModel } from "@/fixtures/selectors";
import type { Handler } from "../mock-transport";

const getDashboard: Handler = ({ store }) => buildDashboardViewModel(store);

export const pagesHandlers: Record<string, Handler> = {
  "pages.dashboard.get": getDashboard, // use the real endpoint id from contract/src/operations/pages.ts
};
```
Confirm the endpoint id with `grep "analytics/dashboard" contract/src/operations/pages.ts` and use that exact `id`.

- [ ] **Step 4: Wire the page** — `dashboard-page.tsx`: make it async and source from the client, keeping the test seam:

```ts
import { client } from "@/lib/contract-client";
export async function DashboardPage({ viewModel }: DashboardPageProps = {}) {
  const vm = viewModel ?? (await client.getDashboard({ params: undefined, query: undefined, body: undefined }));
  …unchanged render…
}
```
The dashboard route (`src/app/(creator)/page.tsx`) already renders `<DashboardPage />`; an async component is fine. Existing `dashboard-page.test.tsx` passes a `viewModel` prop, so it stays sync and unchanged.

- [ ] **Step 5: Run the dashboard handler test + the existing dashboard page tests + the full suite** — `pnpm --filter creatoros-frontend test` → all green (the DTO from the store equals the fixture-composed VM, so render parity holds).

- [ ] **Step 6: Commit** — `git commit -m "feat(mock-backend): dashboard read through the client (loop proven)"`

**Foundation done: store + transport + client + one read path proven end-to-end, frontend still green.**

---

## PROJECTS VERTICAL

### Task 5: Projects read handlers

**Files:** Modify `handlers/projects.ts`; Test `handlers/projects.test.ts`.

- [ ] **Step 1: Failing test** — assert `client.listProjects()` returns the store's projects; `client.getProject({params:{projectId}})` returns one; `client.listTasks`/`listOutputs`/`listActivity` return arrays.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetStore, getStore } from "../index";
import { client } from "@/lib/contract-client";

describe("projects reads via client", () => {
  beforeEach(() => resetStore());
  it("lists projects from the store", async () => {
    const projects = await client.listProjects({ params: undefined, query: { page: 1, pageSize: 50 }, body: undefined });
    expect(projects.length).toBe(getStore().projects.length);
  });
  it("gets one project", async () => {
    const id = getStore().projects[0]!.id;
    const p = await client.getProject({ params: { projectId: id }, query: undefined, body: undefined });
    expect(p.id).toBe(id);
  });
});
```

- [ ] **Step 2: Run; FAIL. Step 3: Implement** the read handlers in `handlers/projects.ts` keyed by the real endpoint ids (from `contract/src/operations/projects.ts`): `projects.list` → `store.projects`; `projects.get` → find by `params.projectId` (throw "OwnershipError"-style Error if missing); `projects.outputs.list` → filter `store.contentOutputs` by projectId; `projects.tasks.list` → filter `store.tasks`; `projects.activity.list` → filter `store.projectActivities` (confirm the store key name). Export `projectsHandlers`.
- [ ] **Step 4: Run; PASS. Step 5: Commit** `feat(mock-backend): projects read handlers`.

### Task 6: Projects write handlers (per SPEC §12)

**Files:** Modify `handlers/projects.ts`; Test extend `handlers/projects.test.ts`.

- [ ] **Step 1: Failing tests** — `createProject` appends a project (status `active`, 6 stages seeded if the design requires; minimally a valid Project) and returns it with a `*-mock-*` id; `transitionProjectStage` from a valid current stage updates `currentStage` and appends a `ProjectActivity`; an INVALID transition throws.

```ts
it("creates a project", async () => {
  const before = getStore().projects.length;
  const p = await client.createProject({ params: undefined, query: undefined, body: { title: "新选题" } });
  expect(p.id).toMatch(/-mock-/);
  expect(getStore().projects.length).toBe(before + 1);
});
it("transitions a project stage", async () => {
  const id = getStore().projects[0]!.id;
  const p = await client.transitionProjectStage({ params: { projectId: id, stage: "planning" }, query: undefined, body: {} });
  expect(p.currentStage).toBe("planning");
});
```

- [ ] **Step 2: Run; FAIL. Step 3: Implement** writes using `nextId(store,'project')` + `FIXED_NOW_ISO`; for `transitionProjectStage` honor SPEC §12 (set `currentStage`, push a `ProjectActivity` with eventType `stage_transition`); `archiveProject` sets status `archived` + `archivedAt`; `patchProject` shallow-merges allowed fields. Throw `new Error("ConflictError: …")` for illegal transitions.
- [ ] **Step 4: Run; PASS. Step 5: Commit** `feat(mock-backend): projects write handlers (§12 transitions)`.

### Task 7: Migrate the Projects page reads (+ reconcile DESIGN_PROJECT_ROWS)

**Files:** Modify `frontend/src/features/projects/projects-page.tsx`; parameterize `buildProjectsViewModel` in `selectors/index.ts`; Test update `projects-page.test.tsx`.

- [ ] **Step 1:** Parameterize `buildProjectsViewModel(rows: ReadonlyArray<Project> = listProjects(), opts = {})` (replace internal `listProjects()`/`canonicalDataset.projects` with `rows`). Back-compat test: `buildProjectsViewModel()` unchanged.
- [ ] **Step 2:** Make `ProjectsPage` async: `const vm = viewModel ?? buildProjectsViewModel(await client.listProjects({query:{page:1,pageSize:50}, params:undefined, body:undefined}))`. **Remove the `DESIGN_PROJECT_ROWS` fallback** — the list now always comes from the store. The page-spec rows now equal the canonical projects.
- [ ] **Step 3:** Reconcile the page test + visual: update `projects-page.test.tsx` expectations to the canonical projects (they were asserting the design rows); flag the Projects visual reference for re-baseline in the stage-12 list (the row content changes deterministically). Keep the `viewModel?` override tests intact.
- [ ] **Step 4:** Run the projects suite; green. **Step 5: Commit** `feat(projects): read the project list from the mock backend`.

### Task 8: Wire the Projects buttons (mutations)

**Files:** Modify `frontend/src/components/overlays/new-project-dialog.tsx` (create), the project-overview / workspace header islands (stage transition), `projects` interactive controls (archive/favorite). Tests: interaction specs.

- [ ] **Step 1:** New Project create — in the dialog `onCreate`, call `await client.createProject({ body: { title: values.name }, params: undefined, query: undefined })`, then `router.replace(\`/projects/${created.id}/research\`)` (replaces the slug guess with the real created id). Add a test (mock the client) asserting create is called and navigation uses the returned id.
- [ ] **Step 2:** 进入工作台 / 进入下一步 — in the Project Overview header island (or workspace stepper action), call `await client.transitionProjectStage({ params: { projectId, stage: nextStage }, query: undefined, body: {} })` then `router.refresh()`. Test the handler is invoked with the right stage.
- [ ] **Step 3:** archive / favorite — wire to `archiveProject` / `patchProject` + `router.refresh()`.
- [ ] **Step 4:** Run the affected suites + `pnpm verify`; green. **Step 5: Commit** `feat(projects): wire create + stage-transition + archive buttons to the mock backend`.

### Task 9: Verify + manifest

- [ ] **Step 1:** `pnpm --filter creatoros-frontend verify` GREEN; `pnpm --filter @creatoros/contract test` GREEN.
- [ ] **Step 2:** Manually (or via an e2e) confirm in a running app: New Project creates a row that persists across navigation; 进入工作台 transitions the stage and the stepper reflects it after refresh.
- [ ] **Step 3:** Promote in `orchestrator/ARTIFACT_MANIFEST.yaml`: note 15b-foundation + Projects vertical done; add DEC-009. Update the program roadmap's Projects goal (G5 FE half) to done.
- [ ] **Step 4: Commit** `chore(orchestrator): 15b foundation + Projects vertical landed`.

---

## Self-review notes
- **Spec coverage:** §2.1 store → T1; §2.3 transport/client → T2; §2.4 selector seam → T3,T7; §2.2/§2.6 handlers+mutations → T4,T5,T6,T8; §3 deliverables → T1–T9; §4 determinism → T1 + the `viewModel?` seam kept in every page task; §6 Projects/DESIGN_PROJECT_ROWS risk → T7 explicitly.
- **Placeholder note:** handler internals (T5/T6) are recipes keyed to the real endpoint ids in `contract/src/operations/*` + the store collections — mechanical given the contract; the framework files (store, transport, client, dashboard loop) carry complete code.
- **Type consistency:** `client`, `mockTransport`, `getStore`/`resetStore`, `createStore`/`nextId`/`MockStore`, `Handler`, `projectsHandlers`/`pagesHandlers` names are consistent across T1–T8.
- **Open verification:** confirm exact store collection key names (`projectActivities` vs `activity`) and the real endpoint ids during T5 (`grep` the contract operations) — noted inline.
