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

describe("previewArtifact (先预览后采纳)", () => {
  it("只读取 awaiting_confirmation manifest 中声明的视频，且不产生资产", async () => {
    const outDir = path.join(root, "task-1", "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "clip.mp4"), "video-bytes");
    const state = baseState();
    state.results = [
      manifestResult([
        { path: "clip.mp4", fileName: "clip.mp4", size: 11, mimeType: "video/mp4" },
      ]),
    ];
    const { service, adopted } = makeService(state);

    const preview = await service.previewArtifact(ctx, "task-1", "clip.mp4");
    expect(new TextDecoder().decode(preview.bytes)).toBe("video-bytes");
    expect(preview.mimeType).toBe("video/mp4");
    expect(adopted).toEqual([]);
    expect(state.task.status).toBe("awaiting_confirmation");
  });

  it("拒绝非待确认状态、非 manifest 路径和非视频产物", async () => {
    const outDir = path.join(root, "task-1", "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "clip.mp4"), "vv");
    await fs.writeFile(path.join(outDir, "notes.txt"), "nn");
    const state = baseState();
    state.results = [
      manifestResult([
        { path: "clip.mp4", fileName: "clip.mp4", size: 2, mimeType: "video/mp4" },
        { path: "notes.txt", fileName: "notes.txt", size: 2, mimeType: "text/plain" },
      ]),
    ];
    const { service } = makeService(state);

    await expect(service.previewArtifact(ctx, "task-1", "other.mp4")).rejects.toMatchObject({
      name: "OwnershipError",
    });
    await expect(service.previewArtifact(ctx, "task-1", "notes.txt")).rejects.toMatchObject({
      name: "OwnershipError",
    });
    state.task = makeTask({ status: "succeeded" });
    await expect(service.previewArtifact(ctx, "task-1", "clip.mp4")).rejects.toMatchObject({
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
    // [RT-H10] 逐项日志行(每采纳完一个产物立刻记)+ 最终聚合行。
    expect(state.aux).toEqual([
      {
        resultType: "execution_adopted_item",
        resultData: { path: "manifest.json", assetId: "asset-1" },
      },
      {
        resultType: "execution_adopted_item",
        resultData: { path: "clip.mp4", assetId: "asset-2" },
      },
      {
        resultType: "execution_adopted",
        resultData: { adoptedAssetIds: ["asset-1", "asset-2"] },
      },
    ]);
    expect(state.succeeded).toEqual(["task-1"]);
    expect(dto.status).toBe("succeeded");
    expect(dto.adoptedAssetIds).toEqual(["asset-1", "asset-2"]);
    // 采纳后沙箱已清。
    expect(await fs.stat(path.join(root, "task-1")).catch(() => null)).toBeNull();
  });

  // [RT-H10] 逐项幂等:第 N 个产物入库失败 → 重试跳过前 N-1 个,不重复建 asset。
  it("retries after a mid-batch failure without re-adopting already adopted artifacts (RT-H10)", async () => {
    const outDir = path.join(root, "task-1", "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "a.txt"), "aa");
    await fs.writeFile(path.join(outDir, "b.txt"), "bb");
    await fs.writeFile(path.join(outDir, "c.txt"), "cc");

    const state = baseState();
    state.results = [
      manifestResult([
        { path: "a.txt", fileName: "a.txt", size: 2, mimeType: "text/plain" },
        { path: "b.txt", fileName: "b.txt", size: 2, mimeType: "text/plain" },
        { path: "c.txt", fileName: "c.txt", size: 2, mimeType: "text/plain" },
      ]),
    ];
    // 资产端口:第 2 次调用(b.txt)首跑时炸,之后恢复 —— 模拟批中失败 + 用户重试。
    const createdNames: string[] = [];
    let failNextB = true;
    const { service } = makeService(state, {
      assets: {
        async createGeneratedAsset(_c, input) {
          if (failNextB && input.name === "b.txt") {
            failNextB = false;
            throw new Error("对象存储抖了");
          }
          createdNames.push(input.name);
          return { id: `asset-${input.name}` };
        },
      },
    });

    // 首跑:a 落库 + 记逐项日志;b 炸 → 整单失败,任务留在 awaiting_confirmation,沙箱保留。
    await expect(service.confirm(ctx, "task-1")).rejects.toThrow("对象存储抖了");
    expect(createdNames).toEqual(["a.txt"]);
    expect(state.aux).toEqual([
      {
        resultType: "execution_adopted_item",
        resultData: { path: "a.txt", assetId: "asset-a.txt" },
      },
    ]);
    expect(state.succeeded).toEqual([]); // 不半采半收尾
    expect(state.task.status).toBe("awaiting_confirmation");
    expect(await fs.stat(path.join(root, "task-1")).catch(() => null)).not.toBeNull();

    // 重试:a 按日志跳过(不重复建 asset),只补 b、c;终态 succeeded,聚合行含全部 3 个 id。
    const dto = await service.confirm(ctx, "task-1");
    expect(createdNames).toEqual(["a.txt", "b.txt", "c.txt"]); // a 只建了一次
    expect(state.succeeded).toEqual(["task-1"]);
    expect(dto.status).toBe("succeeded");
    expect(dto.adoptedAssetIds).toEqual([
      "asset-a.txt", // 复用首跑已建的 id
      "asset-b.txt",
      "asset-c.txt",
    ]);
    expect(await fs.stat(path.join(root, "task-1")).catch(() => null)).toBeNull();
  });

  it("资产已创建但 journal 写入前崩溃，重试复用稳定 adoptionId 只保留一份资产 (T-731 H-05)", async () => {
    const outDir = path.join(root, "task-1", "out");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "only.txt"), "ok");
    const state = baseState();
    state.results = [
      manifestResult([
        {
          path: "only.txt",
          fileName: "only.txt",
          size: 2,
          mimeType: "text/plain",
        },
      ]),
    ];
    const physicallyCreated = new Map<string, string>();
    const baseAi = makeAiPort(state);
    let crashBeforeJournal = true;
    const { service } = makeService(state, {
      ai: {
        ...baseAi,
        async recordAuxResult(c, taskId, input) {
          if (
            crashBeforeJournal &&
            input.resultType === "execution_adopted_item"
          ) {
            crashBeforeJournal = false;
            throw new Error("模拟 create 返回后进程在 journal 前崩溃");
          }
          return baseAi.recordAuxResult(c, taskId, input);
        },
      },
      assets: {
        async createGeneratedAsset(_c, input) {
          const prior = physicallyCreated.get(input.idempotencyKey);
          if (prior) return { id: prior };
          const id = `asset-stable-${physicallyCreated.size + 1}`;
          physicallyCreated.set(input.idempotencyKey, id);
          return { id };
        },
      },
    });

    await expect(service.confirm(ctx, "task-1")).rejects.toThrow(/journal 前崩溃/);
    expect(physicallyCreated.size).toBe(1);
    expect(state.aux).toEqual([]);

    const dto = await service.confirm(ctx, "task-1");
    expect(physicallyCreated.size).toBe(1);
    expect([...physicallyCreated.keys()]).toEqual([
      "execution-adoption:task-1:only.txt",
    ]);
    expect(dto.adoptedAssetIds).toEqual(["asset-stable-1"]);
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
