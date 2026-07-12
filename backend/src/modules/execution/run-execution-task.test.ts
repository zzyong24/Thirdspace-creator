import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { RequestContext } from "@creatoros/contract";
import {
  abortExecutionTask,
  runExecutionTask,
  type ExecutionAiPort,
} from "./run-execution-task";
import {
  createExecutorRegistry,
  registerBuiltinExecutors,
  type ExecutorRegistry,
} from "./executor-registry";

// [T-255a] 编排单测:demo executor 端到端(fake AI/资产端口 + 真临时目录沙箱)/
// 超时/abort(丢弃)/步骤流/未注册 executor 诚实失败。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
} as unknown as RequestContext;

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "exec-run-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

interface FakeAi extends ExecutionAiPort {
  statuses: string[];
  steps: { kind: string; text: string }[];
  candidates: { resultType: string; resultData: Record<string, unknown> }[];
  failures: string[];
}

function makeFakeAi(): FakeAi {
  const fake: FakeAi = {
    statuses: [],
    steps: [],
    candidates: [],
    failures: [],
    async markRunning() {
      fake.statuses.push("running");
    },
    async recordStep(_c, _t, input) {
      fake.steps.push({ kind: input.kind, text: input.text });
    },
    async recordCandidate(_c, _t, input) {
      fake.statuses.push("awaiting_confirmation");
      fake.candidates.push(input);
      return {};
    },
    async markFailed(_c, _t, msg) {
      fake.statuses.push("failed");
      fake.failures.push(msg ?? "");
    },
  };
  return fake;
}

const assets = {
  async getAssetBytes(_c: RequestContext, assetId: string) {
    if (assetId === "missing") return null;
    return {
      bytes: new TextEncoder().encode(`bytes-of-${assetId}`),
      mimeType: "text/plain",
    };
  },
};

function depsWith(registry: ExecutorRegistry, ai: FakeAi) {
  return { ai, assets, registry, workspacesRoot: root };
}

function specInput(extra: Record<string, unknown> = {}) {
  return {
    spec: {
      taskType: "echo.manifest",
      goal: "框架自检",
      inputs: [{ assetId: "a1", mountAs: "notes.txt" }],
      ...extra,
    },
  };
}

describe("runExecutionTask (echo.manifest end-to-end)", () => {
  it("materializes inputs, runs the executor, harvests the manifest, awaits confirmation", async () => {
    const registry = createExecutorRegistry();
    registerBuiltinExecutors(registry);
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "task-1", inputData: specInput() }, depsWith(registry, ai));

    expect(ai.statuses).toEqual(["running", "awaiting_confirmation"]);
    expect(ai.failures).toEqual([]);
    // 步骤流:建沙箱 → 物化 → 执行 → executor 内步 → 收割 → final。
    expect(ai.steps.map((s) => s.kind).at(-1)).toBe("final");
    expect(ai.steps.some((s) => s.text.includes("建沙箱"))).toBe(true);
    expect(ai.steps.some((s) => s.text.includes("物化输入 1 项"))).toBe(true);

    const manifest = ai.candidates[0]!.resultData.manifest as {
      taskType: string;
      artifacts: { path: string; fileName: string; size: number }[];
      summary: string;
    };
    expect(ai.candidates[0]!.resultType).toBe("execution_manifest");
    expect(manifest.taskType).toBe("echo.manifest");
    expect(manifest.artifacts.map((a) => a.path)).toEqual(["manifest.json"]);
    expect(manifest.summary).toContain("1 项输入清单");

    // 沙箱里真有产物,内容含 inputs 清单(demo executor 真跑了)。
    const written = JSON.parse(
      await fs.readFile(path.join(root, "task-1", "out", "manifest.json"), "utf8"),
    ) as { goal: string; inputs: { assetId: string; mountAs: string }[] };
    expect(written.goal).toBe("框架自检");
    expect(written.inputs).toEqual([
      expect.objectContaining({ assetId: "a1", mountAs: "notes.txt" }),
    ]);
  });

  it("fails honestly on an unregistered executor / invalid spec / missing asset", async () => {
    const registry = createExecutorRegistry(); // 空注册表
    const ai = makeFakeAi();
    await runExecutionTask(ctx, { id: "t-a", inputData: specInput() }, depsWith(registry, ai));
    expect(ai.failures[0]).toContain("未注册的 executor");

    registerBuiltinExecutors(registry);
    const ai2 = makeFakeAi();
    await runExecutionTask(
      ctx,
      { id: "t-b", inputData: { spec: { taskType: "rm.rf", goal: "x" } } },
      depsWith(registry, ai2),
    );
    expect(ai2.failures[0]).toContain("任务契约不合法");

    const ai3 = makeFakeAi();
    await runExecutionTask(
      ctx,
      {
        id: "t-c",
        inputData: {
          spec: {
            taskType: "echo.manifest",
            goal: "x",
            inputs: [{ assetId: "missing", mountAs: "gone.txt" }],
          },
        },
      },
      depsWith(registry, ai3),
    );
    expect(ai3.failures[0]).toContain("输入资产读取失败");
    // 失败即清沙箱(孤儿 sweep 只是兜底)。
    expect(await fs.stat(path.join(root, "t-c")).catch(() => null)).toBeNull();
  });

  it("times out a hung executor via Promise.race + abort signal", async () => {
    const registry = createExecutorRegistry();
    let sawAbort = false;
    registry.register({
      taskType: "echo.manifest",
      async run(_sandbox, _params, { signal }) {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            resolve();
          });
        });
        throw new Error("aborted");
      },
    });
    const ai = makeFakeAi();
    await runExecutionTask(
      ctx,
      {
        id: "t-timeout",
        inputData: {
          spec: {
            taskType: "echo.manifest",
            goal: "hang",
            constraints: { timeoutSec: 1, network: "deny", maxOutputMB: 8 },
          },
        },
      },
      depsWith(registry, ai),
    );
    expect(sawAbort).toBe(true);
    expect(ai.failures[0]).toContain("执行超时");
  }, 10_000);

  it("abortExecutionTask (discard) interrupts an in-flight run", async () => {
    const registry = createExecutorRegistry();
    let started: (() => void) | null = null;
    const startedPromise = new Promise<void>((r) => {
      started = r;
    });
    registry.register({
      taskType: "echo.manifest",
      async run(_sandbox, _params, { signal }) {
        started!();
        await new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("用户丢弃任务,执行已中止")));
        });
        return {};
      },
    });
    const ai = makeFakeAi();
    const run = runExecutionTask(
      ctx,
      { id: "t-abort", inputData: { spec: { taskType: "echo.manifest", goal: "g" } } },
      depsWith(registry, ai),
    );
    await startedPromise;
    expect(abortExecutionTask("t-abort")).toBe(true);
    await run;
    expect(ai.failures[0]).toContain("已中止");
    // in-flight 表已清:重复 abort 不再命中。
    expect(abortExecutionTask("t-abort")).toBe(false);
  });
});
