import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { RequestContext } from "@creatoros/contract";
import {
  createExecutionService,
  type ExecutionAiServicePort,
} from "./execution.service";
import type { AITaskResource, AITaskResultResource } from "../ai/ai.schema";

// [T-255a] service 单测(端口注入,零 db):create 契约校验/命名空间;confirm 采纳
// (产物真读沙箱 → createGeneratedAsset → execution_adopted → succeeded → 清沙箱);
// discard(中止 + cancelled + 清沙箱);非 exec 任务 404 门。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
} as unknown as RequestContext;

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "exec-svc-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function makeTask(over: Partial<AITaskResource> = {}): AITaskResource {
  return {
    id: "task-1",
    userId: "u1",
    projectId: null,
    contentOutputId: null,
    taskType: "exec.echo.manifest",
    status: "awaiting_confirmation",
    inputData: { spec: { taskType: "echo.manifest", goal: "g" } },
    modelKey: "none",
    idempotencyKey: "k",
    requestedAt: "2026-07-11T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    ...over,
  } as AITaskResource;
}

interface FakeAiState {
  task: AITaskResource;
  results: AITaskResultResource[];
  succeeded: string[];
  cancelled: string[];
  aux: { resultType: string; resultData: Record<string, unknown> }[];
  created: { taskType: string; inputData?: Record<string, unknown> }[];
}

function makeAiPort(state: FakeAiState): ExecutionAiServicePort {
  return {
    async createTask(_c, body) {
      state.created.push(body);
      return makeTask({
        id: "task-new",
        taskType: body.taskType,
        status: "queued",
        inputData: body.inputData ?? {},
      });
    },
    async getTask() {
      return state.task;
    },
    async listTasks() {
      return { rows: [state.task], total: 1 };
    },
    async listResults() {
      return state.results;
    },
    async recordAuxResult(_c, _t, input) {
      state.aux.push(input);
      state.results.push({
        id: `res-${state.results.length}`,
        aiTaskId: state.task.id,
        resultType: input.resultType,
        artifactId: null,
        knowledgeItemId: null,
        assetId: null,
        resultData: input.resultData,
      } as AITaskResultResource);
    },
    async markSucceeded(_c, taskId) {
      state.succeeded.push(taskId);
      state.task = { ...state.task, status: "succeeded" };
    },
    async cancelTask(_c, taskId) {
      state.cancelled.push(taskId);
      state.task = { ...state.task, status: "cancelled" };
      return state.task;
    },
  };
}

function manifestResult(artifacts: unknown[]): AITaskResultResource {
  return {
    id: "res-m",
    aiTaskId: "task-1",
    resultType: "execution_manifest",
    artifactId: null,
    knowledgeItemId: null,
    assetId: null,
    resultData: {
      manifest: { taskType: "echo.manifest", artifacts, summary: "", meta: {} },
    },
  } as AITaskResultResource;
}

function makeService(state: FakeAiState, over: Partial<Parameters<typeof createExecutionService>[0]> = {}) {
  const adopted: { assetType: string; name: string; mimeType: string }[] = [];
  const aborted: string[] = [];
  const service = createExecutionService({
    ai: makeAiPort(state),
    assets: {
      async createGeneratedAsset(_c, input) {
        adopted.push({
          assetType: input.assetType,
          name: input.name,
          mimeType: input.mimeType,
        });
        return { id: `asset-${adopted.length}` };
      },
    },
    hasExecutor: (t) => t === "echo.manifest",
    workspacesRoot: root,
    abortRun: (taskId) => {
      aborted.push(taskId);
      return true;
    },
    ...over,
  });
  return { service, adopted, aborted };
}

function baseState(): FakeAiState {
  return {
    task: makeTask(),
    results: [],
    succeeded: [],
    cancelled: [],
    aux: [],
    created: [],
  };
}

describe("create", () => {
  it("validates the spec and creates an exec.* namespaced ai_task", async () => {
    const state = baseState();
    const { service } = makeService(state);
    const dto = await service.create(ctx, {
      spec: { taskType: "echo.manifest", goal: "自检" },
      projectId: "p1",
    });
    expect(state.created[0]!.taskType).toBe("exec.echo.manifest");
    expect(state.created[0]!.inputData!.projectId).toBe("p1");
    expect(dto.execType).toBe("echo.manifest");
    expect(dto.spec.constraints.timeoutSec).toBe(600);
  });

  it("rejects invalid specs and unregistered executors (400)", async () => {
    const state = baseState();
    const { service } = makeService(state);
    await expect(
      service.create(ctx, { spec: { taskType: "echo.manifest" } }),
    ).rejects.toMatchObject({ name: "ExecutionValidationError" });
    const { service: noExec } = makeService(state, { hasExecutor: () => false });
    await expect(
      noExec.create(ctx, { spec: { taskType: "echo.manifest", goal: "g" } }),
    ).rejects.toThrow(/未注册的 executor/);
  });
});

describe("get / namespace gate", () => {
  it("404s a non-exec task (no existence leak)", async () => {
    const state = baseState();
    state.task = makeTask({ taskType: "topic.generate" });
    const { service } = makeService(state);
    await expect(service.get(ctx, "task-1")).rejects.toMatchObject({
      name: "OwnershipError",
    });
  });
});

describe("confirm (采纳)", () => {
  it("adopts out/ artifacts into the asset library, records adopted ids, succeeds, cleans sandbox", async () => {
    // 真沙箱:out/ 里放两个产物。
    const outDir = path.join(root, "task-1", "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "manifest.json"), "{}");
    await fs.writeFile(path.join(outDir, "clip.mp4"), "vv");

    const state = baseState();
    state.results = [
      manifestResult([
        { path: "manifest.json", fileName: "manifest.json", size: 2, mimeType: "application/json" },
        { path: "clip.mp4", fileName: "clip.mp4", size: 2, mimeType: "video/mp4" },
      ]),
    ];
    const { service, adopted } = makeService(state);
    const dto = await service.confirm(ctx, "task-1");

    expect(adopted).toEqual([
      { assetType: "document", name: "manifest.json", mimeType: "application/json" },
      { assetType: "video", name: "clip.mp4", mimeType: "video/mp4" },
    ]);
    expect(state.aux[0]).toEqual({
      resultType: "execution_adopted",
      resultData: { adoptedAssetIds: ["asset-1", "asset-2"] },
    });
    expect(state.succeeded).toEqual(["task-1"]);
    expect(dto.status).toBe("succeeded");
    expect(dto.adoptedAssetIds).toEqual(["asset-1", "asset-2"]);
    // 采纳后沙箱已清。
    expect(await fs.stat(path.join(root, "task-1")).catch(() => null)).toBeNull();
  });

  it("409s when not awaiting confirmation or when an artifact is missing on disk", async () => {
    const state = baseState();
    state.task = makeTask({ status: "running" });
    const { service } = makeService(state);
    await expect(service.confirm(ctx, "task-1")).rejects.toMatchObject({
      name: "ConflictError",
    });

    const state2 = baseState();
    state2.results = [
      manifestResult([{ path: "gone.bin", fileName: "gone.bin", size: 1, mimeType: null }]),
    ];
    const { service: s2, adopted } = makeService(state2);
    await expect(s2.confirm(ctx, "task-1")).rejects.toThrow(/产物已丢失/);
    expect(adopted).toEqual([]);
    expect(state2.succeeded).toEqual([]); // 不半采半收尾
  });
});

describe("discard (丢弃)", () => {
  it("cancels a non-terminal task, aborts the in-flight run, cleans the sandbox", async () => {
    const dir = path.join(root, "task-1", "out");
    await fs.mkdir(dir, { recursive: true });
    const state = baseState();
    state.task = makeTask({ status: "running" });
    const { service, aborted } = makeService(state);
    const dto = await service.discard(ctx, "task-1");
    expect(state.cancelled).toEqual(["task-1"]);
    expect(aborted).toEqual(["task-1"]);
    expect(dto.status).toBe("cancelled");
    expect(await fs.stat(path.join(root, "task-1")).catch(() => null)).toBeNull();
  });

  it("is idempotent on a terminal task (no cancel, still cleans)", async () => {
    const state = baseState();
    state.task = makeTask({ status: "succeeded" });
    const { service, aborted } = makeService(state);
    const dto = await service.discard(ctx, "task-1");
    expect(state.cancelled).toEqual([]);
    expect(aborted).toEqual([]);
    expect(dto.status).toBe("succeeded");
  });
});
