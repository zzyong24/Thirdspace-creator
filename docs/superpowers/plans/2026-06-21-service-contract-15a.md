# Service Contract (Stage 15a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@creatoros/contract` — a pure-TypeScript, Zod-based workspace package that is the executable FE↔BE service contract for every `backend/SPEC.md §13` endpoint, with no frontend behaviour change.

**Architecture:** A new top-level workspace package `contract/` holds the response envelope, shared primitives, per-module **resource DTO** Zod schemas, 4 **page DTO** schemas (the composition endpoints), a machine-checkable **endpoint registry**, a transport-agnostic typed **client**, and a `Transport` interface. Transports and frontend wiring are stage 15b — out of scope here. Resource schemas mirror the shapes in `frontend/src/types/domain.ts`; `z.infer` derives the DTO types.

**Tech Stack:** TypeScript strict, Zod, Vitest, pnpm workspace. (Matches backend baseline SPEC §3 so the backend reuses these schemas at stage 16.)

---

## Source-of-truth references (read before starting)

- Endpoints + groups: `backend/SPEC.md §13` (paths/methods), `§14` (envelope + error→HTTP).
- Resource shapes: `frontend/src/types/domain.ts` (97 exported types; entity interfaces are the schema spec).
- Page DTOs: `backend/MODULE-ARCHITECTURE.md §5` (the 4 QueryServices) + `frontend/src/types/view-models.ts` for the page shapes.
- Traceability targets: `orchestrator/ID_REGISTRY.md` (FR ids) + `orchestrator/TRACEABILITY_MATRIX.md` (GAP-002).

## File structure (created in `contract/`)

```
contract/
├── package.json              # @creatoros/contract; deps: zod; devDeps: vitest, typescript
├── tsconfig.json             # strict; emits .d.ts; module NodeNext
├── vitest.config.ts          # node env
├── src/
│   ├── envelope.ts           # success/list/error envelope schemas + ErrorCode + ERROR_HTTP map
│   ├── primitives.ts         # Id, Iso8601, Pagination, shared enum schemas
│   ├── transport.ts          # Transport interface + EndpointInvocation type
│   ├── endpoints.ts          # defineEndpoint() + ENDPOINTS registry (assembled from module endpoint files)
│   ├── client.ts             # createClient(transport)
│   ├── resources/<module>.ts # resource DTO schemas, one file per module (projects, artifacts, …)
│   ├── pages/<page>.ts       # 4 page DTO schemas
│   ├── operations/<module>.ts# defineEndpoint() calls for that module (imports resources/* + pages/*)
│   └── index.ts              # public surface
└── tests/
    ├── envelope.test.ts
    ├── client.test.ts
    ├── registry.test.ts      # every §13 route registered once; paths well-formed
    └── traceability.test.ts  # backend-bearing FR → operation id(s) complete
```

Each `resources/<module>.ts` owns one domain module's DTO schemas; each `operations/<module>.ts` owns that module's endpoint registrations. Files that change together live together (a module's schemas + its endpoints are split only because endpoints import resources).

---

### Task 1: Scaffold the `contract/` workspace package

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `contract/package.json`, `contract/tsconfig.json`, `contract/vitest.config.ts`, `contract/src/index.ts`

- [ ] **Step 1: Add the package to the workspace**

Edit `pnpm-workspace.yaml` to:

```yaml
packages:
  - frontend
  - backend
  - contract
```

- [ ] **Step 2: Create `contract/package.json`**

```json
{
  "name": "@creatoros/contract",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

If the repo does not use a pnpm catalog, replace `"catalog:"` with the exact versions used by `frontend/package.json` (`zod`, `typescript`, `vitest`). Check with: `node -e "const p=require('../frontend/package.json');console.log(p.dependencies.zod, p.devDependencies.typescript, p.devDependencies.vitest)"` run from `contract/`.

- [ ] **Step 3: Create `contract/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `contract/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 5: Create `contract/src/index.ts` (placeholder export so typecheck has an entry)**

```ts
export const CONTRACT_API_BASE = "/api/v1";
```

- [ ] **Step 6: Install and verify the workspace resolves**

Run from repo root: `pnpm install`
Then from `contract/`: `pnpm typecheck`
Expected: install succeeds; typecheck passes (no errors).

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml contract/
git commit -m "feat(contract): scaffold @creatoros/contract workspace package"
```

---

### Task 2: Response envelope (SPEC §14)

**Files:**
- Create: `contract/src/envelope.ts`
- Test: `contract/tests/envelope.test.ts`

- [ ] **Step 1: Write the failing test**

`contract/tests/envelope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  successEnvelope,
  listEnvelope,
  errorEnvelope,
  ErrorCode,
  ERROR_HTTP,
} from "../src/envelope.js";

describe("envelope", () => {
  it("wraps a single datum with a requestId", () => {
    const schema = successEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({ data: { id: "p1" }, meta: { requestId: "r1" } });
    expect(parsed.data.id).toBe("p1");
  });

  it("wraps a list with pagination meta", () => {
    const schema = listEnvelope(z.object({ id: z.string() }));
    const parsed = schema.parse({
      data: [{ id: "p1" }],
      meta: { requestId: "r1", page: 1, pageSize: 20, total: 1 },
    });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.meta.total).toBe(1);
  });

  it("models an error with a known code and maps it to HTTP", () => {
    const parsed = errorEnvelope.parse({
      error: { code: "PROJECT_NOT_FOUND", message: "nope", details: {} },
      meta: { requestId: "r1" },
    });
    expect(parsed.error.code).toBe("PROJECT_NOT_FOUND");
    expect(ERROR_HTTP[ErrorCode.OwnershipError]).toBe(404);
    expect(ERROR_HTTP[ErrorCode.ValidationError]).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @creatoros/contract test`
Expected: FAIL — cannot find module `../src/envelope.js`.

- [ ] **Step 3: Implement `contract/src/envelope.ts`**

```ts
import { z } from "zod";

export const requestId = z.string();

export const successMeta = z.object({ requestId });
export const listMeta = z.object({
  requestId,
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: successMeta });
}

export function listEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: listMeta });
}

export enum ErrorCode {
  ValidationError = "ValidationError",
  AuthenticationError = "AuthenticationError",
  OwnershipError = "OwnershipError",
  ConflictError = "ConflictError",
  RateLimitError = "RateLimitError",
  ExternalDependencyError = "ExternalDependencyError",
  UnexpectedError = "UnexpectedError",
}

export const ERROR_HTTP: Record<ErrorCode, number> = {
  [ErrorCode.ValidationError]: 400,
  [ErrorCode.AuthenticationError]: 401,
  [ErrorCode.OwnershipError]: 404,
  [ErrorCode.ConflictError]: 409,
  [ErrorCode.RateLimitError]: 429,
  [ErrorCode.ExternalDependencyError]: 502,
  [ErrorCode.UnexpectedError]: 500,
};

// `code` is a free string (domain codes like PROJECT_NOT_FOUND) but every
// domain code maps to one ErrorCode class for HTTP status resolution.
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
  meta: successMeta,
});

export type SuccessEnvelope<T> = { data: T; meta: { requestId: string } };
export type ListEnvelope<T> = { data: T[]; meta: z.infer<typeof listMeta> };
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @creatoros/contract test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add contract/src/envelope.ts contract/tests/envelope.test.ts
git commit -m "feat(contract): response envelope + error code→HTTP map (SPEC §14)"
```

---

### Task 3: Shared primitives

**Files:**
- Create: `contract/src/primitives.ts`
- Test: extend `contract/tests/envelope.test.ts` is wrong — create `contract/tests/primitives.test.ts`

- [ ] **Step 1: Write the failing test** — `contract/tests/primitives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { id, iso8601, paginationQuery, platformId } from "../src/primitives.js";

describe("primitives", () => {
  it("accepts a non-empty id", () => {
    expect(id.parse("project-1")).toBe("project-1");
    expect(() => id.parse("")).toThrow();
  });
  it("accepts an ISO-8601 timestamp", () => {
    expect(iso8601.parse("2026-06-13T02:00:00.000Z")).toMatch(/Z$/);
  });
  it("defaults pagination", () => {
    expect(paginationQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
  it("accepts a known platform id", () => {
    expect(platformId.parse("douyin")).toBe("douyin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @creatoros/contract test tests/primitives.test.ts`
Expected: FAIL — cannot find `../src/primitives.js`.

- [ ] **Step 3: Implement `contract/src/primitives.ts`**

Mirror the scalar/enum shapes in `frontend/src/types/domain.ts`. Read that file for the exact enum members (e.g. `PlatformId`, `ProjectStatus`, `ProjectStageName`, `ContentType`, `AssetType`, `PublicationStatus`, `AITaskStatus`, etc.) and reproduce each as a `z.enum([...])`.

```ts
import { z } from "zod";

export const id = z.string().min(1);
export const iso8601 = z.string().datetime();

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// Reproduce from domain.ts (PlatformId). Keep members in sync with the source.
export const platformId = z.enum([
  "douyin",
  "xiaohongshu",
  "bilibili",
  "wechat_video",
  "youtube",
  "kuaishou",
]);

export const projectStatus = z.enum([
  "active",
  "draft",
  "completed",
  "archived",
]);

export const projectStageName = z.enum([
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
]);
```

NOTE: the enum members above MUST be verified against `frontend/src/types/domain.ts`. If the source differs, the source wins — update these and the test. Add the remaining shared enums used by ≥2 modules (stage/task/output/publication/ai statuses, content/asset/knowledge types) the same way.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @creatoros/contract test tests/primitives.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add contract/src/primitives.ts contract/tests/primitives.test.ts
git commit -m "feat(contract): shared id/iso/pagination/enum primitives"
```

---

### Task 4: Transport interface + endpoint definition helper

**Files:**
- Create: `contract/src/transport.ts`, `contract/src/endpoints.ts`

- [ ] **Step 1: Implement `contract/src/transport.ts`**

```ts
import type { z } from "zod";
import type { Endpoint } from "./endpoints.js";

export interface Transport {
  request<E extends Endpoint>(
    endpoint: E,
    input: EndpointInput<E>,
  ): Promise<unknown>;
}

export type EndpointInput<E extends Endpoint> = {
  params: E["params"] extends z.ZodTypeAny ? z.infer<E["params"]> : undefined;
  query: E["query"] extends z.ZodTypeAny ? z.infer<E["query"]> : undefined;
  body: E["body"] extends z.ZodTypeAny ? z.infer<E["body"]> : undefined;
};
```

- [ ] **Step 2: Implement `contract/src/endpoints.ts` (helper only; the registry is assembled in Task 21)**

```ts
import type { z } from "zod";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface Endpoint<
  Params extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Query extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Body extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string; // e.g. "/projects/:projectId"
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
  readonly response: Response;
  readonly isList: boolean;
  readonly fr: readonly string[]; // FR ids this operation serves
}

export function defineEndpoint<
  Params extends z.ZodTypeAny | undefined,
  Query extends z.ZodTypeAny | undefined,
  Body extends z.ZodTypeAny | undefined,
  Response extends z.ZodTypeAny,
>(e: {
  id: string;
  method: HttpMethod;
  path: string;
  params?: Params;
  query?: Query;
  body?: Body;
  response: Response;
  isList?: boolean;
  fr?: readonly string[];
}): Endpoint<Params, Query, Body, Response> {
  return {
    id: e.id,
    method: e.method,
    path: e.path,
    params: e.params as Params,
    query: e.query as Query,
    body: e.body as Body,
    response: e.response,
    isList: e.isList ?? false,
    fr: e.fr ?? [],
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @creatoros/contract typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add contract/src/transport.ts contract/src/endpoints.ts
git commit -m "feat(contract): Transport interface + defineEndpoint helper"
```

---

### Task 5: Typed client

**Files:**
- Create: `contract/src/client.ts`
- Test: `contract/tests/client.test.ts`

- [ ] **Step 1: Write the failing test** — `contract/tests/client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { defineEndpoint } from "../src/endpoints.js";
import { createClient } from "../src/client.js";
import type { Transport } from "../src/transport.js";

const getThing = defineEndpoint({
  id: "things.get",
  method: "GET",
  path: "/things/:thingId",
  params: z.object({ thingId: z.string() }),
  response: z.object({ id: z.string(), name: z.string() }),
});

describe("createClient", () => {
  it("invokes the transport and validates the response", async () => {
    const transport: Transport = {
      request: vi.fn(async () => ({
        data: { id: "t1", name: "Widget" },
        meta: { requestId: "r1" },
      })),
    };
    const client = createClient({ getThing }, transport);
    const result = await client.getThing({ params: { thingId: "t1" }, query: undefined, body: undefined });
    expect(result.id).toBe("t1");
    expect(transport.request).toHaveBeenCalledOnce();
  });

  it("throws when the transport returns a shape that fails the response schema", async () => {
    const transport: Transport = {
      request: vi.fn(async () => ({ data: { id: 1 }, meta: { requestId: "r1" } })),
    };
    const client = createClient({ getThing }, transport);
    await expect(
      client.getThing({ params: { thingId: "t1" }, query: undefined, body: undefined }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @creatoros/contract test tests/client.test.ts`
Expected: FAIL — cannot find `../src/client.js`.

- [ ] **Step 3: Implement `contract/src/client.ts`**

```ts
import { z } from "zod";
import type { Endpoint } from "./endpoints.js";
import type { EndpointInput, Transport } from "./transport.js";
import { successEnvelope, listEnvelope } from "./envelope.js";

type EndpointMap = Record<string, Endpoint>;

type ClientMethod<E extends Endpoint> = (
  input: EndpointInput<E>,
) => Promise<E extends Endpoint<any, any, any, infer R> ? z.infer<R> : never>;

export type Client<M extends EndpointMap> = {
  [K in keyof M]: ClientMethod<M[K]>;
};

export function createClient<M extends EndpointMap>(
  endpoints: M,
  transport: Transport,
): Client<M> {
  const client = {} as Client<M>;
  for (const key of Object.keys(endpoints) as (keyof M)[]) {
    const endpoint = endpoints[key];
    (client[key] as unknown) = async (input: EndpointInput<Endpoint>) => {
      const raw = await transport.request(endpoint, input);
      const envelope = endpoint.isList
        ? listEnvelope(endpoint.response)
        : successEnvelope(endpoint.response);
      const parsed = envelope.parse(raw) as { data: unknown };
      return parsed.data;
    };
  }
  return client;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @creatoros/contract test tests/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add contract/src/client.ts contract/tests/client.test.ts
git commit -m "feat(contract): typed client that validates responses via the envelope"
```

---

### Task 6: EXEMPLAR module — Projects resources + operations

This task is the **pattern** every later module copies. It shows: interface→Zod resource, endpoint registration, and the per-module test.

**Files:**
- Create: `contract/src/resources/projects.ts`, `contract/src/operations/projects.ts`
- Test: `contract/tests/modules/projects.test.ts`

- [ ] **Step 1: Write the failing test** — `contract/tests/modules/projects.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { projectResource } from "../../src/resources/projects.js";
import { projectsOperations } from "../../src/operations/projects.js";

describe("projects contract", () => {
  it("parses a Project resource", () => {
    const p = projectResource.parse({
      id: "project-1",
      userId: "user-1",
      title: "AI Native Browser 深度解析",
      brief: "…",
      contentCategory: "tech",
      creationMode: "standard",
      status: "active",
      currentStage: "script",
      progressPct: 58,
      starred: true,
      startedAt: "2026-01-01T02:00:00.000Z",
      targetCompletedAt: null,
      completedAt: null,
      archivedAt: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-06-13T02:00:00.000Z",
    });
    expect(p.currentStage).toBe("script");
  });

  it("registers the project list + transition endpoints with FR ids", () => {
    expect(projectsOperations.listProjects.method).toBe("GET");
    expect(projectsOperations.listProjects.path).toBe("/projects");
    expect(projectsOperations.transitionProjectStage.path).toBe(
      "/projects/:projectId/stages/:stage/transition",
    );
    expect(projectsOperations.listProjects.fr.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @creatoros/contract test tests/modules/projects.test.ts`
Expected: FAIL — missing resource/operation modules.

- [ ] **Step 3: Implement `contract/src/resources/projects.ts`**

Translate the `Project`, `ProjectStage`, `ContentOutput`, `OutputStage`, `Task`, `Milestone`, `ProjectActivity`, `ProjectRelation`, `ProjectTargetPlatform` interfaces from `frontend/src/types/domain.ts` into Zod. Pattern (BaseEntity = `{id}`, Timestamped = `{createdAt, updatedAt}`):

```ts
import { z } from "zod";
import { id, iso8601, projectStatus, projectStageName } from "../primitives.js";

const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

export const projectResource = z.object({
  id,
  userId: id,
  title: z.string(),
  brief: z.string(),
  contentCategory: z.string(),
  creationMode: z.enum(["standard", "quick", "imported"]), // verify members vs domain CreationMode
  status: projectStatus,
  currentStage: projectStageName,
  progressPct: z.number().int().min(0).max(100),
  starred: z.boolean(),
  startedAt: iso8601,
  targetCompletedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  archivedAt: iso8601.nullable(),
  ...timestamps,
});
export type ProjectResource = z.infer<typeof projectResource>;

// …repeat the same interface→z.object translation for ProjectStage, ContentOutput,
// OutputStage, Task, Milestone, ProjectActivity, ProjectRelation,
// ProjectTargetPlatform — each field copied from domain.ts, nullable() for `| null`,
// the shared enums from primitives.ts, and `...timestamps` when the interface
// extends Timestamped. Export a `*Resource` const + inferred type for each.
```

- [ ] **Step 4: Implement `contract/src/operations/projects.ts`**

Register the §13 "项目与流程" group. Attach the FR ids each serves (look them up in `orchestrator/ID_REGISTRY.md` / `TRACEABILITY_MATRIX.md`; if a precise id is unknown, attach the nearest project-flow FR and leave a `// TODO(traceability)` — Task 22 reconciles).

```ts
import { z } from "zod";
import { defineEndpoint } from "../endpoints.js";
import { id, paginationQuery, projectStageName } from "../primitives.js";
import {
  projectResource,
  taskResource,
  projectActivityResource,
  contentOutputResource,
} from "../resources/projects.js";

const projectParams = z.object({ projectId: id });

export const projectsOperations = {
  listProjects: defineEndpoint({
    id: "projects.list",
    method: "GET",
    path: "/projects",
    query: paginationQuery,
    response: projectResource,
    isList: true,
    fr: ["FR-PROJECTS-LIST"], // replace with real FR id from ID_REGISTRY
  }),
  createProject: defineEndpoint({
    id: "projects.create",
    method: "POST",
    path: "/projects",
    body: z.object({ title: z.string().min(1), brief: z.string().default("") }),
    response: projectResource,
    fr: ["FR-PROJECTS-CREATE"],
  }),
  getProject: defineEndpoint({
    id: "projects.get",
    method: "GET",
    path: "/projects/:projectId",
    params: projectParams,
    response: projectResource,
    fr: ["FR-PROJECTS-GET"],
  }),
  patchProject: defineEndpoint({
    id: "projects.patch",
    method: "PATCH",
    path: "/projects/:projectId",
    params: projectParams,
    body: z.object({ title: z.string().optional(), brief: z.string().optional(), starred: z.boolean().optional() }),
    response: projectResource,
    fr: ["FR-PROJECTS-UPDATE"],
  }),
  archiveProject: defineEndpoint({
    id: "projects.archive",
    method: "POST",
    path: "/projects/:projectId/archive",
    params: projectParams,
    response: projectResource,
    fr: ["FR-PROJECTS-ARCHIVE"],
  }),
  transitionProjectStage: defineEndpoint({
    id: "projects.stage.transition",
    method: "POST",
    path: "/projects/:projectId/stages/:stage/transition",
    params: z.object({ projectId: id, stage: projectStageName }),
    body: z.object({ reason: z.string().optional() }),
    response: projectResource,
    fr: ["FR-STAGE-TRANSITION"],
  }),
  // …continue for: GET /projects/:projectId/overview (page DTO, Task 20),
  // outputs CRUD + transition, tasks (list/create/patch), activity (list).
} as const;
```

- [ ] **Step 5: Run the module test**

Run: `pnpm --filter @creatoros/contract test tests/modules/projects.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add contract/src/resources/projects.ts contract/src/operations/projects.ts contract/tests/modules/projects.test.ts
git commit -m "feat(contract): projects resources + operations (exemplar module)"
```

---

### Tasks 7–20: Remaining resource modules (mechanical — copy the Task 6 pattern)

Each task below = one module. For each: create `resources/<module>.ts` (translate the listed `domain.ts` interfaces to Zod exactly as in Task 6 Step 3), create `operations/<module>.ts` (register the listed §13 endpoints exactly as in Task 6 Step 4), add `tests/modules/<module>.test.ts` (one resource-parse assert with a fixture row copied from `frontend/src/fixtures/canonical.ts`, one endpoint path/method assert), run that test green, commit `feat(contract): <module> resources + operations`.

- [ ] **Task 7 — artifacts**: resources `Artifact, ArtifactVersion, ArtifactRelation, ThesisNode, ScriptSection, EvidenceLink, TimelineSegment`. Endpoints (§13 产物): `GET/POST /projects/:projectId/artifacts`, `GET /artifacts/:artifactId`, `POST/GET /artifacts/:artifactId/versions`, `POST /artifacts/:artifactId/restore`, `POST /artifacts/:artifactId/relations`.
- [ ] **Task 8 — knowledge**: resources `KnowledgeItem, KnowledgeRevision, KnowledgeRelation, ProjectKnowledge, ArtifactKnowledge`. Endpoints: `GET/POST /knowledge`, `GET /knowledge/:knowledgeId`, `POST /knowledge/:knowledgeId/revisions`, `POST /knowledge/:knowledgeId/relations`.
- [ ] **Task 9 — assets**: resources `Asset, AssetFile, ProjectAsset, ArtifactAsset, OutputAsset`. Endpoints: `GET /assets`, `POST /assets/uploads`, `POST /assets/uploads/:uploadId/complete`, `GET /assets/:assetId`, `POST /assets/:assetId/files`, `POST /assets/:assetId/trash`, `POST /assets/:assetId/restore`.
- [ ] **Task 10 — production**: resources `Production, ProductionSegment, SegmentAsset, ExportRecord`. Endpoints: `GET/PUT /outputs/:outputId/production`, `POST /productions/:productionId/segments`, `POST /productions/:productionId/exports`, `POST /exports/:exportId/complete`.
- [ ] **Task 11 — publishing**: resources `Publication, PublicationRevision`. Endpoints: `GET/POST /outputs/:outputId/publications`, `GET /publications/:publicationId`, `POST /publications/:publicationId/revisions`, `POST /publications/:publicationId/transition` (body `{ to: PublicationStatus }`, honour §12 state machine).
- [ ] **Task 12 — analytics**: resources `MetricSnapshot, MetricValue, RetentionPoint, AudienceSnapshot`. Endpoints: `GET /analytics/publications/:publicationId`, `GET /analytics/projects/:projectId`. (`GET /analytics/dashboard` = page DTO, Task 20.)
- [ ] **Task 13 — reviews**: resources `Review, ReviewPublication, ReviewInsight`. Endpoints: `POST /projects/:projectId/reviews`, `GET /reviews/:reviewId`, `POST /reviews/:reviewId/insights`, `POST /reviews/:reviewId/complete`.
- [ ] **Task 14 — learnings**: resources `Learning, LearningApplication`. Endpoints: `GET/POST /learnings`, `POST /learnings/:learningId/applications`, `POST /learnings/:learningId/evaluate`.
- [ ] **Task 15 — ai**: resources `AIConversation, AIMessage, AITask, AITaskReference, AITaskResult, AgentConfiguration, ModelConfiguration`. Endpoints: `GET/POST /ai/conversations`, `POST /ai/conversations/:conversationId/messages`, `POST /ai/tasks`, `POST /ai/tasks/:taskId/confirm`, `POST /ai/tasks/:taskId/cancel`.
- [ ] **Task 16 — search**: resources `SearchDocument, SearchHistory`. Endpoint: `GET /search` (query `{ q, type? }`; result is page DTO `GlobalSearch`, Task 20 — here register only the endpoint shell pointing at the page DTO).
- [ ] **Task 17 — notifications**: resource `Notification`. Endpoints: `GET /notifications`, `POST /notifications/:notificationId/read`.
- [ ] **Task 18 — settings**: resources `User, UserPreference, ModelConfiguration, AgentConfiguration`. Endpoints: `GET /settings`, `PATCH /settings/preferences`, `PUT /settings/models/:capability`, `POST /settings/agents`.
- [ ] **Task 19 — ingestion**: resources `ExternalSource, IngestionRun, IngestionError`. Endpoints: `POST /ingestion/runs`, `POST /ingestion/runs/:runId/metrics`, `POST /ingestion/runs/:runId/knowledge`, `POST /ingestion/runs/:runId/assets`, `POST /ingestion/runs/:runId/artifacts`, `POST /ingestion/runs/:runId/complete`, `GET /ingestion/runs/:runId`.
- [ ] **Task 20 — pages (4 composition DTOs)**: create `contract/src/pages/{dashboard,project-overview,publishing-center,global-search}.ts` modelling each page DTO from `frontend/src/types/view-models.ts` (DashboardViewModel, ProjectOverviewViewModel, PublishingCenterViewModel, the grouped search result). Register their endpoints: `GET /analytics/dashboard`, `GET /projects/:projectId/overview`, the publishing-center read (the existing publishing-center selector's shape), `GET /search`. Test: parse each page DTO against the matching `build<Page>ViewModel()` output imported from `frontend/src/fixtures/selectors` (this proves the page DTO matches what the FE renders). Commit `feat(contract): 4 page composition DTOs`.

---

### Task 21: Assemble the endpoint registry + completeness test

**Files:**
- Modify: `contract/src/endpoints.ts` (export `ENDPOINTS`)
- Modify: `contract/src/index.ts`
- Test: `contract/tests/registry.test.ts`

- [ ] **Step 1: Export the combined registry** — append to `contract/src/endpoints.ts`:

```ts
import { projectsOperations } from "./operations/projects.js";
import { artifactsOperations } from "./operations/artifacts.js";
// …import every operations/<module>.ts and pages operations…

export const ENDPOINTS = {
  ...projectsOperations,
  ...artifactsOperations,
  // …spread every module's operations + page operations…
} as const;

export type Endpoints = typeof ENDPOINTS;
```

- [ ] **Step 2: Export the public surface** — `contract/src/index.ts`:

```ts
export const CONTRACT_API_BASE = "/api/v1";
export * from "./envelope.js";
export * from "./primitives.js";
export * from "./endpoints.js";
export * from "./transport.js";
export * from "./client.js";
```

- [ ] **Step 3: Write the registry-completeness test** — `contract/tests/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ENDPOINTS } from "../src/endpoints.js";

// The authoritative §13 surface: paste every "METHOD /path" line from
// backend/SPEC.md §13 here, verbatim.
const SPEC_13: ReadonlyArray<[string, string]> = [
  ["GET", "/projects"],
  ["POST", "/projects"],
  ["GET", "/projects/:projectId"],
  ["PATCH", "/projects/:projectId"],
  ["POST", "/projects/:projectId/archive"],
  ["POST", "/projects/:projectId/stages/:stage/transition"],
  ["GET", "/projects/:projectId/overview"],
  // … paste the remaining ~53 lines from SPEC §13 …
];

describe("endpoint registry", () => {
  const registered = Object.values(ENDPOINTS).map((e) => `${e.method} ${e.path}`);

  it("registers every SPEC §13 route exactly once", () => {
    for (const [method, path] of SPEC_13) {
      const matches = registered.filter((r) => r === `${method} ${path}`);
      expect(matches, `${method} ${path}`).toHaveLength(1);
    }
  });

  it("registers no routes outside SPEC §13", () => {
    const allowed = new Set(SPEC_13.map(([m, p]) => `${m} ${p}`));
    for (const r of registered) expect(allowed.has(r), r).toBe(true);
  });

  it("gives every endpoint a unique id", () => {
    const ids = Object.values(ENDPOINTS).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 4: Run + make green**

Run: `pnpm --filter @creatoros/contract test tests/registry.test.ts`
Expected: FAIL first if any §13 route is missing or extra; add/fix the missing `defineEndpoint` calls until PASS. This test is the guarantee that the contract covers exactly §13.

- [ ] **Step 5: Commit**

```bash
git add contract/src/endpoints.ts contract/src/index.ts contract/tests/registry.test.ts
git commit -m "feat(contract): assemble endpoint registry + §13 completeness test"
```

---

### Task 22: FR → operation traceability test (closes GAP-002)

**Files:**
- Create: `contract/tests/traceability.test.ts`

- [ ] **Step 1: Build the FR list** — from `orchestrator/ID_REGISTRY.md`, collect the FR ids that are **backend-bearing** (every FR whose behaviour needs an API; the ratification pass marked these — they are the ones flagged in `TRACEABILITY_MATRIX.md`'s GAP-002 orphan scan). Paste them into the test.

- [ ] **Step 2: Write the test** — `contract/tests/traceability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ENDPOINTS } from "../src/endpoints.js";

// Backend-bearing FR ids from orchestrator/ID_REGISTRY.md (GAP-002 set).
const BACKEND_FRS: readonly string[] = [
  "FR-PROJECTS-LIST",
  "FR-PROJECTS-CREATE",
  // … paste the full backend-bearing FR id set …
];

describe("FR → operation traceability (GAP-002)", () => {
  const covered = new Set(Object.values(ENDPOINTS).flatMap((e) => e.fr));

  it("maps every backend-bearing FR to at least one operation", () => {
    const uncovered = BACKEND_FRS.filter((fr) => !covered.has(fr));
    expect(uncovered, `uncovered FRs: ${uncovered.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 3: Reconcile** — fill the real FR ids into each `operations/<module>.ts` `fr: [...]` until this test passes. Replace any `// TODO(traceability)` placeholders from Task 6+ with real ids.

- [ ] **Step 4: Run + commit**

Run: `pnpm --filter @creatoros/contract test tests/traceability.test.ts`
Expected: PASS.

```bash
git add contract/src/operations contract/tests/traceability.test.ts
git commit -m "test(contract): FR→operation traceability closes GAP-002"
```

---

### Task 23: Package verification + orchestrator manifest update

**Files:**
- Modify: `orchestrator/ARTIFACT_MANIFEST.yaml` (stage 15), `orchestrator/TRACEABILITY_MATRIX.md` (GAP-002)

- [ ] **Step 1: Full package gate**

Run: `pnpm --filter @creatoros/contract typecheck && pnpm --filter @creatoros/contract test`
Expected: typecheck 0 errors; all tests pass (envelope, primitives, client, every module, registry, traceability).

- [ ] **Step 2: Confirm the frontend is untouched**

Run: `pnpm --filter creatoros-frontend verify`
Expected: GREEN — 15a added a package and changed no frontend file.

- [ ] **Step 3: Promote stage 15 in the manifest**

Edit `orchestrator/ARTIFACT_MANIFEST.yaml` stage `15-service-contract`: `status: "draft"`, `gate_status: "pass"` (15a contract artifact complete; 15b frontend integration pending), and note `contract/` package + the completeness/traceability tests. Update `frontier` to `16-backend-tdd`. Add a DEC-008 entry to `DECISION_LOG.md` recording 15a completion.

- [ ] **Step 4: Update GAP-002 in `TRACEABILITY_MATRIX.md`**

Note that every backend-bearing FR now maps to a contract operation id (orphan scan upstream→downstream improves; full closure still needs stage-16 backend tests attached to the same operation ids).

- [ ] **Step 5: Commit**

```bash
git add orchestrator/ARTIFACT_MANIFEST.yaml orchestrator/DECISION_LOG.md orchestrator/TRACEABILITY_MATRIX.md
git commit -m "chore(orchestrator): promote stage-15a service contract; GAP-002 mapped"
```

---

## Self-review notes

- **Spec coverage**: §3 architecture → Tasks 1–6 (framework) + 7–20 (all modules + pages); §5 scope 15a items 1–3 → Tasks 1–22; §7 traceability → Task 22; §6 determinism → no clock/network/random anywhere (schemas + registry only); §9 decisions (branch/location) are operational (done at execution start). 15b explicitly excluded.
- **Placeholder note**: Tasks 7–20 are deliberately recipe-style (exact types + exact §13 endpoints + the Task 6 pattern) rather than 90 inlined Zod objects; this is mechanical translation of a cited source (`domain.ts`), not an underspecified step. The exemplar (Task 6) and all framework tasks carry complete code.
- **Type consistency**: `Endpoint`/`defineEndpoint`/`createClient`/`Transport`/`EndpointInput` names are consistent across Tasks 4–6, 21. Envelope helpers `successEnvelope`/`listEnvelope`/`errorEnvelope` consistent across Tasks 2, 5.
- **FR ids**: the `FR-*` strings in Task 6 are placeholders to be replaced from `ID_REGISTRY.md` during Tasks 6–22; Task 22's test fails until they are real, which forces reconciliation.
