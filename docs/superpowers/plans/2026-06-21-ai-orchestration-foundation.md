# AI Orchestration Foundation + Script-Rewrite Vertical — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CreatorOS AI execution layer — each `AITask` runs as a Claude Agent SDK `query()` on a worker that may read domain context and propose a candidate but never formalize it — delivered foundation-first with the Script-Rewrite node as the first working vertical.

**Architecture:** A new `@creatoros/ai-worker` package. The orchestration core (state machine, candidate validation, in-process `creatoros` tools, config resolver, confirm path) is built against **ports** and a deterministic **FakeAgentRunner**, so the whole control plane is unit-tested under `pnpm verify` with no network/subprocess. The real Agent SDK `query()` lives behind one `AgentRunner` adapter exercised by a manual smoke script (excluded from vitest, exactly like the visual suite). The agent's only write tool is `submit_candidate`; `confirmResult` is a separate AI-free path.

**Tech Stack:** TypeScript (NodeNext, strict), Zod 4, Vitest 4, `@anthropic-ai/claude-agent-sdk` (real runner only). Mirrors the `@creatoros/contract` package conventions.

**Spec:** `docs/superpowers/specs/2026-06-21-ai-orchestration-agent-sdk-design.md` (commit b89cd50). Substrate decision: unified Agent SDK.

**Scope note:** This is the foundation + **one** vertical (Script-Rewrite). The other nodes (research, planning, copy, review, copilot) reuse this foundation and are follow-on plans — the same way 15b shipped foundation + the Projects vertical.

---

## File Structure

All paths are under the `feat/service-contract` worktree root (`.worktrees/frontend-implementation/`).

| File | Responsibility |
|---|---|
| `frontend/src/types/domain.ts` (modify) | Add `awaiting_confirmation` to `AITaskStatus` |
| `contract/src/primitives.ts` (modify) | Add `awaiting_confirmation` to `aiTaskStatus` enum |
| `ai-worker/package.json` | New workspace package `@creatoros/ai-worker` |
| `ai-worker/tsconfig.json` · `ai-worker/vitest.config.ts` | TS + test config (smoke excluded) |
| `ai-worker/src/state-machine.ts` | `AiTaskStatus` union + allowed transitions |
| `ai-worker/src/candidate-schemas.ts` | Zod candidate schema per `resultType` |
| `ai-worker/src/ports.ts` | `DomainReadPort` / `DomainWritePort` / `AiTaskStore` / `AgentRunner` interfaces + record types |
| `ai-worker/src/fixtures/fixture-store.ts` | In-memory deterministic implementations of the ports (tests + smoke) |
| `ai-worker/src/context-tools.ts` | `creatoros` read tools (scope-enforced) + `submit_candidate` capture + audit + `toolSpecs`/`allowedTools` (SDK-free) |
| `ai-worker/src/agent-config-resolver.ts` | `AgentConfiguration` + `ModelConfiguration` → `AgentRunOptions` |
| `ai-worker/src/runner/fake-agent-runner.ts` | Deterministic scripted `AgentRunner` (tests) |
| `ai-worker/src/orchestrator.ts` | `runTask()` — claim → run → capture candidate → status |
| `ai-worker/src/confirm.ts` | `confirmResult()` / `rejectResult()` — AI-free formalization |
| `ai-worker/src/runner/claude-agent-runner.ts` | Real `AgentRunner` wrapping `query()` (SDK) |
| `ai-worker/skills/script-rewrite/SKILL.md` | The Script-Rewrite node's prompt/procedure |
| `ai-worker/smoke/script-rewrite-smoke.ts` | Manual end-to-end smoke (excluded from vitest) |

---

## Task 1: Reconcile `AITaskStatus` (add `awaiting_confirmation`)

The candidate-confirm flow (storage §7) requires a state between `running` and `succeeded`. The data-model ER block (`AI_TASK { string status }`) does not enumerate values, so adding it aligns the two enumerating sites with the documented flow.

**Files:**
- Modify: `contract/src/primitives.ts:69-76`
- Modify: `frontend/src/types/domain.ts:643-648`
- Test: `contract/tests/primitives.test.ts` (add a case)

- [ ] **Step 1: Write the failing test**

Append to `contract/tests/primitives.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aiTaskStatus } from "../src/primitives.js";

describe("aiTaskStatus", () => {
  it("includes the candidate-confirm state between running and succeeded", () => {
    expect(aiTaskStatus.options).toEqual([
      "queued",
      "running",
      "awaiting_confirmation",
      "succeeded",
      "failed",
      "cancelled",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd contract && pnpm vitest run tests/primitives.test.ts`
Expected: FAIL — array lacks `"awaiting_confirmation"`.

- [ ] **Step 3: Add the enum value (contract)**

In `contract/src/primitives.ts`, change the `aiTaskStatus` enum to:

```ts
export const aiTaskStatus = z.enum([
  "queued",
  "running",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled",
]);
```

- [ ] **Step 4: Add the union value (frontend domain)**

In `frontend/src/types/domain.ts`, change `AITaskStatus` to:

```ts
export type AITaskStatus =
  | "queued"
  | "running"
  | "awaiting_confirmation"
  | "succeeded"
  | "failed"
  | "cancelled";
```

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `cd contract && pnpm vitest run tests/primitives.test.ts && pnpm typecheck`
Expected: PASS, tsc 0 errors.
Run: `cd ../frontend && pnpm typecheck`
Expected: tsc 0 errors (no consumer enumerates the union exhaustively; a `switch` without `awaiting_confirmation` would surface here).

- [ ] **Step 6: Commit**

```bash
git add contract/src/primitives.ts contract/tests/primitives.test.ts frontend/src/types/domain.ts
git commit -m "feat(contract): add awaiting_confirmation to AITaskStatus (candidate-confirm state)"
```

---

## Task 2: Scaffold the `@creatoros/ai-worker` package

**Files:**
- Create: `ai-worker/package.json`
- Create: `ai-worker/tsconfig.json`
- Create: `ai-worker/vitest.config.ts`
- Create: `ai-worker/src/index.ts`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Register the package in the workspace**

In `pnpm-workspace.yaml`, add `ai-worker`:

```yaml
packages:
  - frontend
  - backend
  - contract
  - ai-worker
```

- [ ] **Step 2: Create `ai-worker/package.json`**

```json
{
  "name": "@creatoros/ai-worker",
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
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 3: Create `ai-worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "smoke"]
}
```

- [ ] **Step 4: Create `ai-worker/vitest.config.ts`**

The smoke script spawns the real binary; keep it out of the deterministic suite.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["smoke/**"],
  },
});
```

- [ ] **Step 5: Create `ai-worker/src/index.ts` (placeholder export)**

```ts
export const AI_WORKER_PACKAGE = "@creatoros/ai-worker";
```

- [ ] **Step 6: Install and verify the package resolves**

Run: `pnpm install`
Run: `cd ai-worker && pnpm typecheck`
Expected: tsc 0 errors.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml ai-worker/package.json ai-worker/tsconfig.json ai-worker/vitest.config.ts ai-worker/src/index.ts
git commit -m "feat(ai-worker): scaffold @creatoros/ai-worker package"
```

---

## Task 3: Task state machine

**Files:**
- Create: `ai-worker/src/state-machine.ts`
- Test: `ai-worker/src/state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { canTransition, AI_TASK_STATUSES } from "./state-machine.js";

describe("canTransition", () => {
  it("allows the candidate-confirm happy path", () => {
    expect(canTransition("queued", "running")).toBe(true);
    expect(canTransition("running", "awaiting_confirmation")).toBe(true);
    expect(canTransition("awaiting_confirmation", "succeeded")).toBe(true);
  });

  it("allows the advisory path (running straight to succeeded)", () => {
    expect(canTransition("running", "succeeded")).toBe(true);
  });

  it("allows failure and rejection", () => {
    expect(canTransition("running", "failed")).toBe(true);
    expect(canTransition("awaiting_confirmation", "cancelled")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("queued", "succeeded")).toBe(false);
    expect(canTransition("failed", "succeeded")).toBe(false);
  });

  it("enumerates all six statuses", () => {
    expect(AI_TASK_STATUSES).toEqual([
      "queued",
      "running",
      "awaiting_confirmation",
      "succeeded",
      "failed",
      "cancelled",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/state-machine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `state-machine.ts`**

```ts
export const AI_TASK_STATUSES = [
  "queued",
  "running",
  "awaiting_confirmation",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AiTaskStatus = (typeof AI_TASK_STATUSES)[number];

const ALLOWED: Record<AiTaskStatus, readonly AiTaskStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_confirmation", "succeeded", "failed", "cancelled"],
  awaiting_confirmation: ["succeeded", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: AiTaskStatus, to: AiTaskStatus): boolean {
  return ALLOWED[from].includes(to);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/state-machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/state-machine.ts ai-worker/src/state-machine.test.ts
git commit -m "feat(ai-worker): AITask state machine with awaiting_confirmation + advisory path"
```

---

## Task 4: Candidate schemas (the `submit_candidate` payload shapes)

**Files:**
- Create: `ai-worker/src/candidate-schemas.ts`
- Test: `ai-worker/src/candidate-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseCandidate, RESULT_TYPES } from "./candidate-schemas.js";

describe("parseCandidate", () => {
  it("accepts a valid artifact_version candidate", () => {
    const result = parseCandidate({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1", body: "新的脚本内容", summary: "收紧开场" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an artifact_version candidate missing the body", () => {
    const result = parseCandidate({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown result type", () => {
    const result = parseCandidate({ resultType: "nonsense", resultData: {} });
    expect(result.ok).toBe(false);
  });

  it("exposes the supported result types", () => {
    expect(RESULT_TYPES).toContain("artifact_version");
    expect(RESULT_TYPES).toContain("advisory");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/candidate-schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `candidate-schemas.ts`**

`advisory` is the non-formalizing result type (Copilot suggestions) that skips `awaiting_confirmation`.

```ts
import { z } from "zod";

const artifactVersionData = z.object({
  artifactId: z.string().min(1),
  body: z.string().min(1),
  summary: z.string().default(""),
});

const advisoryData = z.object({
  message: z.string().min(1),
});

const CANDIDATE_SCHEMAS = {
  artifact_version: artifactVersionData,
  advisory: advisoryData,
} as const;

export const RESULT_TYPES = Object.keys(CANDIDATE_SCHEMAS) as Array<
  keyof typeof CANDIDATE_SCHEMAS
>;

export type ResultType = keyof typeof CANDIDATE_SCHEMAS;

export function formalizes(resultType: string): boolean {
  // advisory results never become a domain entity; they skip awaiting_confirmation
  return resultType !== "advisory" && resultType in CANDIDATE_SCHEMAS;
}

export interface CandidateInput {
  resultType: string;
  resultData: unknown;
}

export type ParseResult =
  | { ok: true; resultType: ResultType; resultData: Record<string, unknown> }
  | { ok: false; error: string };

export function parseCandidate(input: CandidateInput): ParseResult {
  const schema = (CANDIDATE_SCHEMAS as Record<string, z.ZodTypeAny>)[input.resultType];
  if (!schema) {
    return { ok: false, error: `unknown result type: ${input.resultType}` };
  }
  const parsed = schema.safeParse(input.resultData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return {
    ok: true,
    resultType: input.resultType as ResultType,
    resultData: parsed.data as Record<string, unknown>,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/candidate-schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/candidate-schemas.ts ai-worker/src/candidate-schemas.test.ts
git commit -m "feat(ai-worker): Zod candidate schemas + formalizes() gate"
```

---

## Task 5: Ports + in-memory fixture store

**Files:**
- Create: `ai-worker/src/ports.ts`
- Create: `ai-worker/src/fixtures/fixture-store.ts`
- Test: `ai-worker/src/fixtures/fixture-store.test.ts`

- [ ] **Step 1: Write `ports.ts` (interfaces + record types)**

No test — these are type declarations exercised by every later task. Create `ai-worker/src/ports.ts`:

```ts
import type { AiTaskStatus } from "./state-machine.js";

export interface AiTaskRecord {
  id: string;
  userId: string;
  projectId: string | null;
  contentOutputId: string | null;
  taskType: string;
  status: AiTaskStatus;
  inputData: Record<string, unknown>;
  modelKey: string;
  idempotencyKey: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  sessionId: string | null; // stage-16 column: Agent SDK session for resume
  costUsd: number | null; // stage-16 column: recorded run cost
}

export interface AiTaskReferenceRecord {
  id: string;
  aiTaskId: string;
  entityType: string;
  entityId: string;
  relationType: string;
}

export interface AiTaskResultRecord {
  id: string;
  aiTaskId: string;
  resultType: string;
  artifactId: string | null;
  knowledgeItemId: string | null;
  assetId: string | null;
  resultData: Record<string, unknown>;
}

export interface ProjectView {
  id: string;
  title: string;
  stage: string;
}
export interface ArtifactVersionView {
  artifactId: string;
  versionId: string;
  versionNumber: number;
  body: string;
  isCurrent: boolean;
}
export interface KnowledgeItemView {
  id: string;
  title: string;
  summary: string;
}

export interface DomainReadPort {
  getProject(id: string): Promise<ProjectView | null>;
  getCurrentArtifactVersion(artifactId: string): Promise<ArtifactVersionView | null>;
  listKnowledgeItems(ids: readonly string[]): Promise<KnowledgeItemView[]>;
}

export interface DomainWritePort {
  // Immutable append: creates a NEW version (storage §6) and marks it current on adoption.
  appendArtifactVersion(input: {
    artifactId: string;
    body: string;
    sourceTaskId: string;
  }): Promise<ArtifactVersionView>;
}

export interface AiTaskStore {
  claimNextQueued(now: string): Promise<AiTaskRecord | null>;
  getTask(id: string): Promise<AiTaskRecord | null>;
  updateTask(id: string, patch: Partial<AiTaskRecord>): Promise<AiTaskRecord>;
  listReferences(taskId: string): Promise<AiTaskReferenceRecord[]>;
  insertResult(rec: AiTaskResultRecord): Promise<AiTaskResultRecord>;
  getResult(id: string): Promise<AiTaskResultRecord | null>;
}

export interface AgentRunOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  skills: string[];
  allowedTools: string[];
  permissionMode: "default";
  settingSources: Array<"project">;
  resume?: string;
}

export interface AgentRunOutcome {
  sessionId: string | null;
  subtype: string; // "success" | "error_max_turns" | "error_during_execution" | ...
  totalCostUsd: number;
  finalText: string;
}

// The capture sink + read handlers the agent drives. Built SDK-free in context-tools.ts.
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // a Zod raw shape (kept loose to stay SDK-free)
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
}

export interface ToolInvocation {
  tool: string;
  ok: boolean;
}

export interface CapturedCandidate {
  resultType: string;
  resultData: Record<string, unknown>;
}

export interface ContextTools {
  toolSpecs: ToolSpec[];
  allowedTools: string[];
  submitCandidate(input: CapturedCandidate): void; // shared sink (fake runner calls directly)
  getCaptured(): CapturedCandidate | null;
  getAudit(): ToolInvocation[];
}

export interface AgentRunner {
  run(input: {
    prompt: string;
    options: AgentRunOptions;
    tools: ContextTools;
  }): Promise<AgentRunOutcome>;
}
```

- [ ] **Step 2: Write the failing test for the fixture store**

```ts
import { describe, it, expect } from "vitest";
import { createFixtureStore } from "./fixture-store.js";

describe("fixture store", () => {
  it("claims the queued task and flips it to running", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:00.000Z");
    expect(claimed?.status).toBe("running");
    expect(claimed?.startedAt).toBe("2026-06-21T00:00:00.000Z");
    // second claim finds nothing left
    expect(await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z")).toBeNull();
  });

  it("reads the seeded current artifact version", async () => {
    const fx = createFixtureStore();
    const ver = await fx.read.getCurrentArtifactVersion("artifact-1");
    expect(ver?.isCurrent).toBe(true);
    expect(ver?.versionNumber).toBe(1);
  });

  it("appends an immutable new version without mutating the old one", async () => {
    const fx = createFixtureStore();
    const before = await fx.read.getCurrentArtifactVersion("artifact-1");
    const next = await fx.write.appendArtifactVersion({
      artifactId: "artifact-1",
      body: "改写后的脚本",
      sourceTaskId: "task-1",
    });
    expect(next.versionNumber).toBe(2);
    expect(next.body).toBe("改写后的脚本");
    expect(before?.body).toBe("原始脚本"); // old version object untouched
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/fixtures/fixture-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `fixtures/fixture-store.ts`**

Deterministic: seeded counter ids, fixed timestamps, in-memory maps. One queued `script.rewrite` task, one artifact with a current version, one knowledge item.

```ts
import type {
  AiTaskRecord,
  AiTaskReferenceRecord,
  AiTaskResultRecord,
  AiTaskStore,
  ArtifactVersionView,
  DomainReadPort,
  DomainWritePort,
  KnowledgeItemView,
  ProjectView,
} from "../ports.js";

export interface FixtureStore {
  tasks: AiTaskStore;
  read: DomainReadPort;
  write: DomainWritePort;
}

export function createFixtureStore(): FixtureStore {
  const tasks = new Map<string, AiTaskRecord>();
  const refs = new Map<string, AiTaskReferenceRecord[]>();
  const results = new Map<string, AiTaskResultRecord>();
  const projects = new Map<string, ProjectView>();
  const knowledge = new Map<string, KnowledgeItemView>();
  // artifactId -> versions (append-only; each version object is frozen)
  const versions = new Map<string, ArtifactVersionView[]>();

  let resultSeq = 0;
  let versionSeq = 0;

  projects.set("project-1", { id: "project-1", title: "示例项目", stage: "script" });
  knowledge.set("knowledge-1", {
    id: "knowledge-1",
    title: "受众洞察",
    summary: "目标受众偏好快节奏开场",
  });
  versions.set("artifact-1", [
    Object.freeze({
      artifactId: "artifact-1",
      versionId: "version-1",
      versionNumber: 1,
      body: "原始脚本",
      isCurrent: true,
    }),
  ]);

  tasks.set("task-1", {
    id: "task-1",
    userId: "user-1",
    projectId: "project-1",
    contentOutputId: "output-1",
    taskType: "script.rewrite",
    status: "queued",
    inputData: { artifactId: "artifact-1", instructions: "收紧开场，提高节奏" },
    modelKey: "script.rewrite",
    idempotencyKey: "idem-1",
    requestedAt: "2026-06-21T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    sessionId: null,
    costUsd: null,
  });
  refs.set("task-1", [
    {
      id: "ref-1",
      aiTaskId: "task-1",
      entityType: "artifact",
      entityId: "artifact-1",
      relationType: "rewrite_source",
    },
    {
      id: "ref-2",
      aiTaskId: "task-1",
      entityType: "knowledge_item",
      entityId: "knowledge-1",
      relationType: "context",
    },
  ]);

  const store: AiTaskStore = {
    async claimNextQueued(now) {
      for (const task of tasks.values()) {
        if (task.status === "queued") {
          const updated = { ...task, status: "running" as const, startedAt: now };
          tasks.set(task.id, updated);
          return updated;
        }
      }
      return null;
    },
    async getTask(id) {
      return tasks.get(id) ?? null;
    },
    async updateTask(id, patch) {
      const cur = tasks.get(id);
      if (!cur) throw new Error(`no task ${id}`);
      const updated = { ...cur, ...patch };
      tasks.set(id, updated);
      return updated;
    },
    async listReferences(taskId) {
      return refs.get(taskId) ?? [];
    },
    async insertResult(rec) {
      const id = `result-${++resultSeq}`;
      const stored = { ...rec, id };
      results.set(id, stored);
      return stored;
    },
    async getResult(id) {
      return results.get(id) ?? null;
    },
  };

  const read: DomainReadPort = {
    async getProject(id) {
      return projects.get(id) ?? null;
    },
    async getCurrentArtifactVersion(artifactId) {
      const list = versions.get(artifactId) ?? [];
      return list.find((v) => v.isCurrent) ?? null;
    },
    async listKnowledgeItems(ids) {
      return ids.map((id) => knowledge.get(id)).filter((k): k is KnowledgeItemView => !!k);
    },
  };

  const write: DomainWritePort = {
    async appendArtifactVersion({ artifactId, body }) {
      const list = versions.get(artifactId) ?? [];
      const demoted = list.map((v) => Object.freeze({ ...v, isCurrent: false }));
      const next = Object.freeze({
        artifactId,
        versionId: `version-new-${++versionSeq}`,
        versionNumber: demoted.length + 1,
        body,
        isCurrent: true,
      });
      versions.set(artifactId, [...demoted, next]);
      return next;
    },
  };

  return { tasks: store, read, write };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/fixtures/fixture-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ai-worker/src/ports.ts ai-worker/src/fixtures/fixture-store.ts ai-worker/src/fixtures/fixture-store.test.ts
git commit -m "feat(ai-worker): ports + deterministic in-memory fixture store"
```

---

## Task 6: Context tools (`creatoros` read tools + `submit_candidate` capture)

The agent's tool surface: scope-enforced reads + one write (`submit_candidate`). SDK-free — emits `ToolSpec`s the real runner converts to SDK `tool()`s; the fake runner drives the same handlers.

**Files:**
- Create: `ai-worker/src/context-tools.ts`
- Test: `ai-worker/src/context-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createContextTools } from "./context-tools.js";
import { createFixtureStore } from "./fixtures/fixture-store.js";

function refs() {
  return [
    { id: "r1", aiTaskId: "task-1", entityType: "artifact", entityId: "artifact-1", relationType: "rewrite_source" },
  ];
}

describe("createContextTools", () => {
  it("names tools with the mcp__creatoros__ prefix", () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    expect(tools.allowedTools).toContain("mcp__creatoros__get_current_artifact_version");
    expect(tools.allowedTools).toContain("mcp__creatoros__submit_candidate");
  });

  it("reads an in-scope artifact version", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "get_current_artifact_version")!;
    const out = await spec.handler({ artifactId: "artifact-1" });
    expect(out.isError).toBeUndefined();
    expect(out.content[0]!.text).toContain("原始脚本");
    expect(tools.getAudit()).toContainEqual({ tool: "get_current_artifact_version", ok: true });
  });

  it("denies an out-of-scope artifact (not in references)", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "get_current_artifact_version")!;
    const out = await spec.handler({ artifactId: "artifact-999" });
    expect(out.isError).toBe(true);
    expect(tools.getAudit()).toContainEqual({ tool: "get_current_artifact_version", ok: false });
  });

  it("captures a submitted candidate", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs() });
    const spec = tools.toolSpecs.find((t) => t.name === "submit_candidate")!;
    await spec.handler({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "新稿" } });
    expect(tools.getCaptured()).toEqual({
      resultType: "artifact_version",
      resultData: { artifactId: "artifact-1", body: "新稿" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/context-tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `context-tools.ts`**

```ts
import type {
  AiTaskReferenceRecord,
  CapturedCandidate,
  ContextTools,
  DomainReadPort,
  ToolInvocation,
  ToolSpec,
} from "./ports.js";

const SERVER = "creatoros";

export interface ContextToolsInput {
  read: DomainReadPort;
  references: AiTaskReferenceRecord[];
}

export function createContextTools(input: ContextToolsInput): ContextTools {
  const { read, references } = input;
  const audit: ToolInvocation[] = [];
  let captured: CapturedCandidate | null = null;

  const inScope = (entityType: string, entityId: string) =>
    references.some((r) => r.entityType === entityType && r.entityId === entityId);

  const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

  const text = (value: unknown) => JSON.stringify(value);

  const toolSpecs: ToolSpec[] = [
    {
      name: "get_current_artifact_version",
      description:
        "Read the current version body of an artifact in this task's scope. Call before rewriting.",
      inputSchema: { artifactId: "string" },
      async handler(args) {
        const artifactId = String(args.artifactId ?? "");
        if (!inScope("artifact", artifactId)) {
          audit.push({ tool: "get_current_artifact_version", ok: false });
          return err(`artifact ${artifactId} is not in this task's references`);
        }
        const version = await read.getCurrentArtifactVersion(artifactId);
        audit.push({ tool: "get_current_artifact_version", ok: true });
        if (!version) return err(`no current version for ${artifactId}`);
        return ok(text(version));
      },
    },
    {
      name: "list_knowledge_items",
      description: "Read knowledge items referenced by this task for context.",
      inputSchema: { ids: "string[]" },
      async handler(args) {
        const requested = Array.isArray(args.ids) ? (args.ids as string[]).map(String) : [];
        const allowed = requested.filter((id) => inScope("knowledge_item", id));
        const items = await read.listKnowledgeItems(allowed);
        audit.push({ tool: "list_knowledge_items", ok: true });
        return ok(text(items));
      },
    },
    {
      name: "submit_candidate",
      description:
        "Submit your proposed result as a CANDIDATE. This is the only way to finish. " +
        "Provide resultType (e.g. 'artifact_version') and resultData. The result is NOT applied " +
        "until a human confirms it.",
      inputSchema: { resultType: "string", resultData: "object" },
      async handler(args) {
        captured = {
          resultType: String(args.resultType ?? ""),
          resultData: (args.resultData ?? {}) as Record<string, unknown>,
        };
        audit.push({ tool: "submit_candidate", ok: true });
        return ok("candidate recorded; awaiting human confirmation");
      },
    },
  ];

  return {
    toolSpecs,
    allowedTools: toolSpecs.map((t) => `mcp__${SERVER}__${t.name}`),
    submitCandidate(value) {
      captured = value;
      audit.push({ tool: "submit_candidate", ok: true });
    },
    getCaptured() {
      return captured;
    },
    getAudit() {
      return audit;
    },
  };
}

export const CONTEXT_SERVER_NAME = SERVER;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/context-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/context-tools.ts ai-worker/src/context-tools.test.ts
git commit -m "feat(ai-worker): creatoros context tools — scoped reads + submit_candidate capture + audit"
```

---

## Task 7: Agent config resolver

Maps an `AgentConfiguration` + `ModelConfiguration` (the data-model rows) to neutral `AgentRunOptions`.

**Files:**
- Create: `ai-worker/src/agent-config-resolver.ts`
- Test: `ai-worker/src/agent-config-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveRunOptions } from "./agent-config-resolver.js";

const agentConfig = {
  agentType: "script.rewrite",
  capabilities: { skills: ["script-rewrite"] },
  settings: { permissionMode: "default" },
};
const modelConfig = {
  capability: "script.rewrite",
  modelName: "claude-fable-5",
  settings: { effort: "high" },
};

describe("resolveRunOptions", () => {
  it("maps config rows onto run options + allowed tools", () => {
    const opts = resolveRunOptions({
      agentConfig,
      modelConfig,
      allowedTools: ["mcp__creatoros__get_current_artifact_version", "mcp__creatoros__submit_candidate"],
    });
    expect(opts.model).toBe("claude-fable-5");
    expect(opts.effort).toBe("high");
    expect(opts.skills).toEqual(["script-rewrite"]);
    expect(opts.permissionMode).toBe("default");
    expect(opts.settingSources).toEqual(["project"]);
    expect(opts.allowedTools).toContain("mcp__creatoros__submit_candidate");
  });

  it("defaults effort to high and skills to empty when unset", () => {
    const opts = resolveRunOptions({
      agentConfig: { agentType: "x", capabilities: {}, settings: {} },
      modelConfig: { capability: "x", modelName: "claude-opus-4-8", settings: {} },
      allowedTools: [],
    });
    expect(opts.effort).toBe("high");
    expect(opts.skills).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/agent-config-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `agent-config-resolver.ts`**

```ts
import type { AgentRunOptions } from "./ports.js";

export interface AgentConfigRow {
  agentType: string;
  capabilities: Record<string, unknown>;
  settings: Record<string, unknown>;
}
export interface ModelConfigRow {
  capability: string;
  modelName: string;
  settings: Record<string, unknown>;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];

function effortFrom(settings: Record<string, unknown>): Effort {
  const raw = settings.effort;
  return EFFORTS.includes(raw as Effort) ? (raw as Effort) : "high";
}

function skillsFrom(capabilities: Record<string, unknown>): string[] {
  const raw = capabilities.skills;
  return Array.isArray(raw) ? raw.map(String) : [];
}

export function resolveRunOptions(input: {
  agentConfig: AgentConfigRow;
  modelConfig: ModelConfigRow;
  allowedTools: string[];
  resume?: string;
}): AgentRunOptions {
  return {
    model: input.modelConfig.modelName,
    effort: effortFrom(input.modelConfig.settings),
    skills: skillsFrom(input.agentConfig.capabilities),
    allowedTools: input.allowedTools,
    permissionMode: "default",
    settingSources: ["project"],
    resume: input.resume,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/agent-config-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/agent-config-resolver.ts ai-worker/src/agent-config-resolver.test.ts
git commit -m "feat(ai-worker): AgentConfiguration+ModelConfiguration -> AgentRunOptions resolver"
```

---

## Task 8: Fake agent runner (deterministic, for tests)

**Files:**
- Create: `ai-worker/src/runner/fake-agent-runner.ts`
- Test: `ai-worker/src/runner/fake-agent-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createFakeAgentRunner } from "./fake-agent-runner.js";
import { createContextTools } from "../context-tools.js";
import { createFixtureStore } from "../fixtures/fixture-store.js";

const refs = [
  { id: "r1", aiTaskId: "task-1", entityType: "artifact", entityId: "artifact-1", relationType: "rewrite_source" },
];
const options = {
  model: "claude-fable-5",
  effort: "high" as const,
  skills: ["script-rewrite"],
  allowedTools: [],
  permissionMode: "default" as const,
  settingSources: ["project" as const],
};

describe("fake agent runner", () => {
  it("drives submit_candidate and returns a success outcome", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs });
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
    });
    const outcome = await runner.run({ prompt: "rewrite", options, tools });
    expect(outcome.subtype).toBe("success");
    expect(outcome.sessionId).toBe("fake-session-1");
    expect(tools.getCaptured()?.resultData.body).toBe("改写稿");
  });

  it("can simulate an error run that submits nothing", async () => {
    const fx = createFixtureStore();
    const tools = createContextTools({ read: fx.read, references: refs });
    const runner = createFakeAgentRunner({ subtype: "error_during_execution", script: () => {} });
    const outcome = await runner.run({ prompt: "x", options, tools });
    expect(outcome.subtype).toBe("error_during_execution");
    expect(tools.getCaptured()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/runner/fake-agent-runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runner/fake-agent-runner.ts`**

```ts
import type { AgentRunner, ContextTools } from "../ports.js";

export interface FakeRunnerConfig {
  script: (tools: ContextTools) => void;
  subtype?: string;
  sessionId?: string;
  totalCostUsd?: number;
  finalText?: string;
}

export function createFakeAgentRunner(config: FakeRunnerConfig): AgentRunner {
  return {
    async run({ tools }) {
      config.script(tools);
      return {
        sessionId: config.sessionId ?? "fake-session-1",
        subtype: config.subtype ?? "success",
        totalCostUsd: config.totalCostUsd ?? 0,
        finalText: config.finalText ?? "done",
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/runner/fake-agent-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/runner/fake-agent-runner.ts ai-worker/src/runner/fake-agent-runner.test.ts
git commit -m "feat(ai-worker): deterministic FakeAgentRunner for tests"
```

---

## Task 9: Orchestrator (`runTask`)

Wires it together: claim → build tools + options → run → capture candidate → status. Enforces the candidate-confirm boundary: a formalizing result ends at `awaiting_confirmation`; an advisory result ends at `succeeded`; an error or no-candidate ends at `failed`.

**Files:**
- Create: `ai-worker/src/orchestrator.ts`
- Test: `ai-worker/src/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runTask } from "./orchestrator.js";
import { createFixtureStore } from "./fixtures/fixture-store.js";
import { createFakeAgentRunner } from "./runner/fake-agent-runner.js";

const agentConfig = { agentType: "script.rewrite", capabilities: { skills: ["script-rewrite"] }, settings: {} };
const modelConfig = { capability: "script.rewrite", modelName: "claude-fable-5", settings: { effort: "high" } };
const clock = () => "2026-06-21T00:00:05.000Z";

describe("runTask", () => {
  it("lands a formalizing candidate at awaiting_confirmation", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
      totalCostUsd: 0.42,
    });
    const result = await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    const task = await fx.tasks.getTask(claimed!.id);
    expect(task?.status).toBe("awaiting_confirmation");
    expect(task?.costUsd).toBe(0.42);
    expect(task?.sessionId).toBe("fake-session-1");
    expect(result.resultId).toBeTruthy();
    const stored = await fx.tasks.getResult(result.resultId!);
    expect(stored?.resultType).toBe("artifact_version");
    expect(stored?.resultData.body).toBe("改写稿");
  });

  it("lands an advisory candidate straight at succeeded (no confirmation gate)", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "advisory", resultData: { message: "建议补充数据" } }),
    });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    expect((await fx.tasks.getTask(claimed!.id))?.status).toBe("succeeded");
  });

  it("fails the task when the run errors with no candidate", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({ subtype: "error_during_execution", script: () => {} });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    const task = await fx.tasks.getTask(claimed!.id);
    expect(task?.status).toBe("failed");
    expect(task?.errorMessage).toContain("error_during_execution");
  });

  it("fails the task when an invalid candidate is submitted", async () => {
    const fx = createFixtureStore();
    const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
    const runner = createFakeAgentRunner({
      script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1" } }),
    });
    await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
    expect((await fx.tasks.getTask(claimed!.id))?.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/orchestrator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `orchestrator.ts`**

```ts
import type { AgentRunner, AiTaskStore, DomainReadPort } from "./ports.js";
import type { AgentConfigRow, ModelConfigRow } from "./agent-config-resolver.js";
import { resolveRunOptions } from "./agent-config-resolver.js";
import { createContextTools } from "./context-tools.js";
import { parseCandidate, formalizes } from "./candidate-schemas.js";

export interface RunTaskDeps {
  tasks: AiTaskStore;
  read: DomainReadPort;
  runner: AgentRunner;
  agentConfig: AgentConfigRow;
  modelConfig: ModelConfigRow;
  now: () => string;
}

export interface RunTaskResult {
  status: string;
  resultId: string | null;
}

export async function runTask(taskId: string, deps: RunTaskDeps): Promise<RunTaskResult> {
  const task = await deps.tasks.getTask(taskId);
  if (!task) throw new Error(`no task ${taskId}`);

  const references = await deps.tasks.listReferences(taskId);
  const tools = createContextTools({ read: deps.read, references });
  const options = resolveRunOptions({
    agentConfig: deps.agentConfig,
    modelConfig: deps.modelConfig,
    allowedTools: tools.allowedTools,
    resume: task.sessionId ?? undefined,
  });

  const prompt = buildPrompt(task.taskType, task.inputData);

  const fail = async (message: string) => {
    await deps.tasks.updateTask(taskId, {
      status: "failed",
      errorMessage: message,
      completedAt: deps.now(),
    });
    return { status: "failed", resultId: null };
  };

  let outcome;
  try {
    outcome = await deps.runner.run({ prompt, options, tools });
  } catch (err) {
    return fail(`runner threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  // record cost/session regardless of outcome
  await deps.tasks.updateTask(taskId, {
    sessionId: outcome.sessionId,
    costUsd: outcome.totalCostUsd,
  });

  if (outcome.subtype !== "success") {
    return fail(`agent run ended with ${outcome.subtype}`);
  }

  const captured = tools.getCaptured();
  if (!captured) {
    return fail("agent run finished without submitting a candidate");
  }

  const parsed = parseCandidate(captured);
  if (!parsed.ok) {
    return fail(`invalid candidate: ${parsed.error}`);
  }

  const result = await deps.tasks.insertResult({
    id: "",
    aiTaskId: taskId,
    resultType: parsed.resultType,
    artifactId: typeof parsed.resultData.artifactId === "string" ? parsed.resultData.artifactId : null,
    knowledgeItemId: null,
    assetId: null,
    resultData: parsed.resultData,
  });

  const nextStatus = formalizes(parsed.resultType) ? "awaiting_confirmation" : "succeeded";
  await deps.tasks.updateTask(taskId, {
    status: nextStatus,
    completedAt: nextStatus === "succeeded" ? deps.now() : null,
  });

  return { status: nextStatus, resultId: result.id };
}

function buildPrompt(taskType: string, inputData: Record<string, unknown>): string {
  // The Skill (selected via taskType) carries the procedure; the prompt carries the task framing.
  return [
    `Task: ${taskType}.`,
    `Inputs: ${JSON.stringify(inputData)}.`,
    "Use the creatoros tools to read the context you need, then call submit_candidate exactly once.",
    "Do not attempt to finalize or apply changes yourself.",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/orchestrator.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add ai-worker/src/orchestrator.ts ai-worker/src/orchestrator.test.ts
git commit -m "feat(ai-worker): orchestrator runTask — candidate capture + awaiting_confirmation/advisory/failed"
```

---

## Task 10: Confirm / reject (AI-free formalization)

`confirmResult` turns a candidate into a real `ArtifactVersion` (immutable append, adopted as current) and flips the task to `succeeded`. No `query()` here. `rejectResult` cancels.

**Files:**
- Create: `ai-worker/src/confirm.ts`
- Test: `ai-worker/src/confirm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runTask } from "./orchestrator.js";
import { confirmResult, rejectResult } from "./confirm.js";
import { createFixtureStore } from "./fixtures/fixture-store.js";
import { createFakeAgentRunner } from "./runner/fake-agent-runner.js";

const agentConfig = { agentType: "script.rewrite", capabilities: {}, settings: {} };
const modelConfig = { capability: "script.rewrite", modelName: "claude-fable-5", settings: {} };
const clock = () => "2026-06-21T00:00:09.000Z";

async function setupAwaiting() {
  const fx = createFixtureStore();
  const claimed = await fx.tasks.claimNextQueued("2026-06-21T00:00:01.000Z");
  const runner = createFakeAgentRunner({
    script: (t) => t.submitCandidate({ resultType: "artifact_version", resultData: { artifactId: "artifact-1", body: "改写稿" } }),
  });
  const r = await runTask(claimed!.id, { tasks: fx.tasks, read: fx.read, runner, agentConfig, modelConfig, now: clock });
  return { fx, taskId: claimed!.id, resultId: r.resultId! };
}

describe("confirmResult", () => {
  it("appends a new current version and marks the task succeeded", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    const version = await confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock });
    expect(version.versionNumber).toBe(2);
    expect(version.isCurrent).toBe(true);
    expect((await fx.tasks.getTask(taskId))?.status).toBe("succeeded");
    // the original version's body is untouched (immutability)
    expect((await fx.read.getCurrentArtifactVersion("artifact-1"))?.body).toBe("改写稿");
  });

  it("refuses to confirm a task that is not awaiting confirmation", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    await confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock });
    await expect(confirmResult(resultId, { tasks: fx.tasks, write: fx.write, now: clock })).rejects.toThrow(
      /not awaiting confirmation/,
    );
    void taskId;
  });
});

describe("rejectResult", () => {
  it("cancels the task without touching domain data", async () => {
    const { fx, taskId, resultId } = await setupAwaiting();
    await rejectResult(resultId, { tasks: fx.tasks, now: clock });
    expect((await fx.tasks.getTask(taskId))?.status).toBe("cancelled");
    expect((await fx.read.getCurrentArtifactVersion("artifact-1"))?.body).toBe("原始脚本");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-worker && pnpm vitest run src/confirm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `confirm.ts`**

```ts
import type { AiTaskStore, ArtifactVersionView, DomainWritePort } from "./ports.js";
import { canTransition } from "./state-machine.js";

export interface ConfirmDeps {
  tasks: AiTaskStore;
  write: DomainWritePort;
  now: () => string;
}

export async function confirmResult(resultId: string, deps: ConfirmDeps): Promise<ArtifactVersionView> {
  const result = await deps.tasks.getResult(resultId);
  if (!result) throw new Error(`no result ${resultId}`);
  const task = await deps.tasks.getTask(result.aiTaskId);
  if (!task) throw new Error(`no task ${result.aiTaskId}`);
  if (task.status !== "awaiting_confirmation" || !canTransition(task.status, "succeeded")) {
    throw new Error(`task ${task.id} is not awaiting confirmation (status: ${task.status})`);
  }
  if (result.resultType !== "artifact_version") {
    throw new Error(`confirm not implemented for resultType ${result.resultType}`);
  }

  const artifactId = result.artifactId;
  const body = result.resultData.body;
  if (!artifactId || typeof body !== "string") {
    throw new Error("candidate is missing artifactId or body");
  }

  const version = await deps.write.appendArtifactVersion({ artifactId, body, sourceTaskId: task.id });
  await deps.tasks.updateTask(task.id, { status: "succeeded", completedAt: deps.now() });
  return version;
}

export interface RejectDeps {
  tasks: AiTaskStore;
  now: () => string;
}

export async function rejectResult(resultId: string, deps: RejectDeps): Promise<void> {
  const result = await deps.tasks.getResult(resultId);
  if (!result) throw new Error(`no result ${resultId}`);
  const task = await deps.tasks.getTask(result.aiTaskId);
  if (!task) throw new Error(`no task ${result.aiTaskId}`);
  if (!canTransition(task.status, "cancelled")) {
    throw new Error(`task ${task.id} cannot be cancelled from ${task.status}`);
  }
  await deps.tasks.updateTask(task.id, { status: "cancelled", completedAt: deps.now() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-worker && pnpm vitest run src/confirm.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole package suite + typecheck**

Run: `cd ai-worker && pnpm typecheck && pnpm test`
Expected: tsc 0 errors; all tests across the package PASS.

- [ ] **Step 6: Commit**

```bash
git add ai-worker/src/confirm.ts ai-worker/src/confirm.test.ts
git commit -m "feat(ai-worker): AI-free confirmResult/rejectResult formalization path"
```

---

## Task 11: Real Agent SDK runner + Script-Rewrite Skill + manual smoke

This is the only task that touches the SDK. The foundation (Tasks 1–10) is already green without it. The real runner is exercised by a manual smoke (network + subprocess + API key), excluded from `pnpm verify`.

**Files:**
- Modify: `ai-worker/package.json` (add the SDK dependency)
- Create: `ai-worker/src/runner/claude-agent-runner.ts`
- Create: `ai-worker/skills/script-rewrite/SKILL.md`
- Create: `ai-worker/smoke/script-rewrite-smoke.ts`

- [ ] **Step 1: Add the SDK dependency**

In `ai-worker/package.json`, add to `dependencies`:

```json
"@anthropic-ai/claude-agent-sdk": "^0.1.0"
```

Then run: `pnpm install`
Expected: installs the SDK (bundles the native binary as an optional dependency).

- [ ] **Step 2: Author the Script-Rewrite Skill**

Create `ai-worker/skills/script-rewrite/SKILL.md`:

```markdown
---
name: script-rewrite
description: Use when rewriting a CreatorOS video script artifact. Reads the current version and referenced knowledge, produces a tightened rewrite, and submits it as a candidate for human confirmation.
---

# Script Rewrite

You rewrite a video script for CreatorOS. You never apply changes directly — you propose a candidate.

## Procedure

1. Call `mcp__creatoros__get_current_artifact_version` with the `artifactId` from the task inputs to read the current script body.
2. If knowledge item ids are referenced, call `mcp__creatoros__list_knowledge_items` to load audience/context notes.
3. Rewrite the script per the task `instructions`. Preserve the creator's voice; tighten pacing; keep it production-ready.
4. Call `mcp__creatoros__submit_candidate` exactly once with:
   - `resultType`: `"artifact_version"`
   - `resultData`: `{ "artifactId": <the artifact id>, "body": <the full rewritten script>, "summary": <one line describing what you changed> }`

## Rules

- Do not call any tool other than the three `creatoros` tools.
- Do not try to finalize, save, or apply — `submit_candidate` is the end of your job.
- Submit the FULL rewritten body, not a diff.
```

- [ ] **Step 3: Implement the real runner**

Create `ai-worker/src/runner/claude-agent-runner.ts`. It converts our SDK-free `ToolSpec`s into SDK `tool()`s, builds the in-process `creatoros` server, runs `query()`, and reads session id / cost / subtype from the messages. The candidate is captured by the `submit_candidate` tool handler (the same `tools.submitCandidate` sink the orchestrator reads).

```ts
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentRunner, AgentRunOutcome, ContextTools } from "../ports.js";
import { CONTEXT_SERVER_NAME } from "../context-tools.js";

// Map a loose ToolSpec.inputSchema ("string" | "string[]" | "object") to a Zod shape.
function zodShape(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, kind] of Object.entries(schema)) {
    if (kind === "string") shape[key] = z.string();
    else if (kind === "string[]") shape[key] = z.array(z.string());
    else shape[key] = z.record(z.string(), z.unknown());
  }
  return shape;
}

function buildServer(tools: ContextTools) {
  const sdkTools = tools.toolSpecs.map((spec) =>
    tool(spec.name, spec.description, zodShape(spec.inputSchema), async (args) => {
      const out = await spec.handler(args as Record<string, unknown>);
      return out;
    }),
  );
  return createSdkMcpServer({ name: CONTEXT_SERVER_NAME, version: "1.0.0", tools: sdkTools });
}

export function createClaudeAgentRunner(): AgentRunner {
  return {
    async run({ prompt, options, tools }) {
      const server = buildServer(tools);
      let sessionId: string | null = null;
      const outcome: AgentRunOutcome = {
        sessionId: null,
        subtype: "error_during_execution",
        totalCostUsd: 0,
        finalText: "",
      };

      for await (const message of query({
        prompt,
        options: {
          model: options.model,
          effort: options.effort,
          permissionMode: options.permissionMode,
          settingSources: options.settingSources,
          // Remove ALL built-in tools — the agent may only use the creatoros server.
          tools: [],
          mcpServers: { [CONTEXT_SERVER_NAME]: server },
          allowedTools: options.allowedTools,
          ...(options.resume ? { resume: options.resume } : {}),
        },
      })) {
        if (message.type === "system" && "session_id" in message) {
          sessionId = message.session_id;
        }
        if (message.type === "result") {
          outcome.subtype = message.subtype;
          outcome.totalCostUsd = message.total_cost_usd;
          outcome.finalText = message.subtype === "success" ? message.result : "";
        }
      }

      outcome.sessionId = sessionId;
      return outcome;
    },
  };
}
```

- [ ] **Step 4: Write the manual smoke script**

Create `ai-worker/smoke/script-rewrite-smoke.ts`:

```ts
/**
 * Manual smoke — requires ANTHROPIC_API_KEY and network. NOT run by `pnpm verify`.
 * Run: cd ai-worker && ANTHROPIC_API_KEY=... npx tsx smoke/script-rewrite-smoke.ts
 */
import { runTask } from "../src/orchestrator.js";
import { confirmResult } from "../src/confirm.js";
import { createFixtureStore } from "../src/fixtures/fixture-store.js";
import { createClaudeAgentRunner } from "../src/runner/claude-agent-runner.js";

async function main() {
  const fx = createFixtureStore();
  const claimed = await fx.tasks.claimNextQueued(new Date().toISOString());
  if (!claimed) throw new Error("no queued task");

  const result = await runTask(claimed.id, {
    tasks: fx.tasks,
    read: fx.read,
    runner: createClaudeAgentRunner(),
    agentConfig: { agentType: "script.rewrite", capabilities: { skills: ["script-rewrite"] }, settings: {} },
    modelConfig: { capability: "script.rewrite", modelName: "claude-fable-5", settings: { effort: "high" } },
    now: () => new Date().toISOString(),
  });

  const task = await fx.tasks.getTask(claimed.id);
  console.log("task status:", task?.status, "cost:", task?.costUsd);
  if (result.resultId) {
    const stored = await fx.tasks.getResult(result.resultId);
    console.log("candidate body:\n", stored?.resultData.body);
    const version = await confirmResult(result.resultId, { tasks: fx.tasks, write: fx.write, now: () => new Date().toISOString() });
    console.log("confirmed version:", version.versionNumber, "isCurrent:", version.isCurrent);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Typecheck the whole package (SDK now present)**

Run: `cd ai-worker && pnpm typecheck`
Expected: tsc 0 errors. (If the SDK's option field names differ from this plan — e.g. `effort` placement — fix the `query()` options object in `claude-agent-runner.ts` against the installed SDK's types; the foundation is unaffected.)

- [ ] **Step 6: Run the deterministic suite to confirm the smoke is excluded**

Run: `cd ai-worker && pnpm test`
Expected: all `src/**` tests PASS; `smoke/**` not executed.

- [ ] **Step 7: (Optional, manual) run the real smoke**

Run: `cd ai-worker && ANTHROPIC_API_KEY=<key> npx tsx smoke/script-rewrite-smoke.ts`
Expected: prints `task status: awaiting_confirmation`, a rewritten body, then `confirmed version: 2 isCurrent: true`.

- [ ] **Step 8: Commit**

```bash
git add ai-worker/package.json ai-worker/src/runner/claude-agent-runner.ts ai-worker/skills/script-rewrite/SKILL.md ai-worker/smoke/script-rewrite-smoke.ts
git commit -m "feat(ai-worker): real Claude Agent SDK runner + script-rewrite Skill + manual smoke"
```

---

## Final Verification

- [ ] **Run the package gate**

Run: `cd ai-worker && pnpm typecheck && pnpm test`
Expected: tsc 0 errors; full deterministic suite green.

- [ ] **Run the repo gate to confirm no regressions in contract/frontend**

Run: `cd contract && pnpm typecheck && pnpm test`
Expected: green (includes the new `aiTaskStatus` test).
Run: `cd frontend && pnpm verify`
Expected: green (the `AITaskStatus` union change introduces no exhaustiveness break).

---

## Self-Review

**Spec coverage:**
- §3 mapping (AgentConfiguration/ModelConfiguration → options) → Task 7. AITaskReference → Task 6 scope + Task 9 wiring. AITaskResult candidate → Task 4 + Task 6 + Task 9.
- §4.1 worker → Task 9 `runTask` (job loop = `claimNextQueued` + `runTask`; a polling daemon wrapper is a trivial follow-on, noted below).
- §4.2 in-process MCP context server + single write tool → Task 6 + Task 11.
- §4.3 Skills → Task 11 (`script-rewrite/SKILL.md`); capability→skill mapping → Task 7.
- §4.4 audit → Task 6 (`getAudit`); SDK PreToolUse/PostToolUse hooks deferred (handler-level scope + audit covers v1 — see deferred).
- §5 `awaiting_confirmation` reconciliation + advisory-skips-gate → Task 1 + Task 3 + Task 9.
- §6 sequence (script rewrite) → Tasks 9–11 + smoke.
- §7 error/idempotency/cost → Task 9 (failure paths, cost recording); idempotency claim → Task 5 `claimNextQueued`.
- §8 determinism boundary → foundation is SDK-free and fully unit-tested; `query()` isolated to Task 11.

**Deferred (out of this plan, into follow-on plans — consistent with spec §11 and the open questions):**
- A polling daemon loop (`while (claimNextQueued) runTask`) with lease-timeout reclaim — trivial wrapper over Task 9; add when wiring the real deploy.
- SDK `PreToolUse`/`PostToolUse` hooks for richer audit (handler-level scope + `getAudit()` covers v1).
- The other AI nodes (research/planning/copy/review/copilot) — each a Skill + capability row reusing this foundation.
- Real Drizzle adapters for the ports (stage 16) — swap `fixture-store` for a `drizzle-store` implementing the same interfaces.
- Backend HTTP endpoints (`createAITask`/`confirmResult`) wiring into the contract at stage 17.

**Placeholder scan:** none — every code step is complete; no "add error handling"/"TODO".

**Type consistency:** `AiTaskStatus` (state-machine) is the single source for status strings; `ports.ts` imports it. `ContextTools`/`ToolSpec`/`AgentRunOptions`/`AgentRunOutcome` are declared once in `ports.ts` and reused by context-tools, the runners, and the orchestrator. `parseCandidate`/`formalizes` (Task 4) are the only candidate validators, used by the orchestrator (Task 9). `resolveRunOptions` (Task 7) signature matches its orchestrator call site.
