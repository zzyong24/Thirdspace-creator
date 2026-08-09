import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, ReconstructProjectOutput } from "@creatoros/ai-worker";
import {
  runReconstruct,
  type ReconstructRunnerDeps,
  type ReconstructTask,
} from "./reconstruct-runner";

// reconstruct.project runner 单测(T-030-D4,SPEC §4.5/§6/§7)。全 fake 端口(fake 模型经
// runNode 注入、fake source/transcript/metrics/materialize),**不碰真模型/真 repo**。覆盖:
//   测1(核心)imported 项目 + 逐字稿 → 只产 research(trend_analysis)，不再新建 thesis_tree。
//   测2(§5 守卫)manual/新建项目 → auto-fill **不触发**(markFailed,materialize 0 次,断言仅 imported)。
//   + 无逐字稿 → 失败不物化(没有事实依据不凭空编)。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const SPEC: ModelSpec = {
  apiFormat: "openai",
  baseUrl: null,
  model: "fake-model",
  token: "sk-fake",
} as unknown as ModelSpec;

// 固定 fake 重建包(测试注入 runNode 直接返回它,不跑真模型)。
const FAKE_PKG: ReconstructProjectOutput = {
  research: {
    coreTopic: "AI 工作流拆解",
    keyPoints: ["先拆输入输出", "端到端可视化"],
    cases: [{ title: "销售朋友案例", note: "3 天问清 + 2 小时实操" }],
    dataPoints: [{ stat: "装了 5 个工具只用 1 个", note: "需核实" }],
  },
};

interface MaterializedCall {
  projectId: string;
  artifactType: string;
  stage: string;
  title: string;
  contentText: string;
  contentData: Record<string, unknown>;
  origin: "reconstructed"; // materializeReconstructed 恒为 reconstructed(端口语义)
}

function makeDeps(opts: {
  source: string | null;
  transcript?: string | null;
  metrics?: string;
  /** runNode 抛错(模拟模型失败);默认返回 FAKE_PKG。 */
  runNodeThrows?: Error | null;
  /** runNode 返回的包(默认 FAKE_PKG)。 */
  pkg?: ReconstructProjectOutput;
}) {
  const markRunning = vi.fn(async (_c: RequestContext, _id: string) => undefined);
  const recordStep = vi.fn(
    async (
      _c: RequestContext,
      _id: string,
      _input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ) => undefined,
  );
  const markSucceeded = vi.fn(
    async (_c: RequestContext, _id: string) => undefined,
  );
  const markFailed = vi.fn(
    async (_c: RequestContext, _id: string, _err?: string) => undefined,
  );

  const materialized: MaterializedCall[] = [];
  let counter = 0;

  const deps: ReconstructRunnerDeps = {
    ai: { markRunning, recordStep, markSucceeded, markFailed },
    // positioning reader — 最小 fake(无 profile,brief 走兜底空)。
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    resolveModelSpec: async () => SPEC,
    getProjectSource: async () => opts.source,
    getTranscript: async () =>
      opts.transcript === undefined ? "这是这条视频的逐字稿正文……" : opts.transcript,
    getMetricsSummary: async () => opts.metrics ?? "播放：12000 · 点赞：800 · 评论：60",
    artifacts: {
      materializeReconstructed: async (_c, input) => {
        materialized.push({ ...input, origin: "reconstructed" });
        counter += 1;
        return { id: `artifact-recon-${counter}` };
      },
    },
    // 注入 fake 结构化节点:不跑真模型,直接返回固定包(或抛)。
    runNode: async () => {
      if (opts.runNodeThrows) throw opts.runNodeThrows;
      return opts.pkg ?? FAKE_PKG;
    },
  };

  return { deps, materialized, markRunning, recordStep, markSucceeded, markFailed };
}

const task: ReconstructTask = {
  id: "task-recon-1",
  taskType: "reconstruct.project",
  projectId: "proj-imported-1",
  inputData: { projectId: "proj-imported-1" },
};

describe("reconstruct-runner — imported auto-fill (测1 核心)", () => {
  it("[T-726] imported 项目 + 逐字稿 → 只重建 research，不物化 thesis_tree", async () => {
    const { deps, materialized, markRunning, recordStep, markSucceeded, markFailed } =
      makeDeps({ source: "imported" });

    await runReconstruct(ctx, task, deps);

    expect(markRunning).toHaveBeenCalledOnce();
    expect(markSucceeded).toHaveBeenCalledOnce();
    expect(markFailed).not.toHaveBeenCalled();

    expect(materialized).toHaveLength(1);
    const research = materialized.find((m) => m.stage === "research");
    const planning = materialized.find((m) => m.stage === "planning");
    expect(research).toBeDefined();
    expect(planning).toBeUndefined();
    expect(materialized[0]).toBe(research);

    // artifactType 落在 validateStageGate 白名单(research→trend_analysis;planning→thesis_tree)。
    expect(research!.artifactType).toBe("trend_analysis");
    expect(materialized.some((m) => m.artifactType === "thesis_tree")).toBe(false);

    // F1 铁律:所有 auto-fill 产物必带 origin='reconstructed'。
    expect(materialized.every((m) => m.origin === "reconstructed")).toBe(true);

    // 重建内容确实来自 fake 包(逐字稿反推的研究 + 策划),且 contentData 标 reconstructed。
    expect(research!.contentText).toContain("AI 工作流拆解");
    expect(research!.contentData.reconstructed).toBe(true);
    expect(recordStep).toHaveBeenCalledWith(
      ctx,
      task.id,
      expect.objectContaining({ text: expect.not.stringContaining("策划") }),
    );
  });
});

describe("reconstruct-runner — §5 守卫:仅 imported(测2)", () => {
  it("manual 项目 → auto-fill 不触发(markFailed,0 物化)", async () => {
    const { deps, materialized, markSucceeded, markFailed } = makeDeps({
      source: "manual",
    });

    await runReconstruct(
      ctx,
      { ...task, projectId: "proj-manual-1", inputData: { projectId: "proj-manual-1" } },
      deps,
    );

    // 断言:非 imported → 直接失败,绝不写任何 artifact。
    expect(materialized).toHaveLength(0);
    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
    const failMsg = markFailed.mock.calls[0]![2] as string;
    expect(failMsg).toContain("imported");
  });

  it("topic(非 imported)项目 → 同样不触发", async () => {
    const { deps, materialized, markFailed } = makeDeps({ source: "topic" });
    await runReconstruct(ctx, task, deps);
    expect(materialized).toHaveLength(0);
    expect(markFailed).toHaveBeenCalledOnce();
  });

  it("新建/未知 source(null)→ 不触发", async () => {
    const { deps, materialized, markFailed } = makeDeps({ source: null });
    await runReconstruct(ctx, task, deps);
    expect(materialized).toHaveLength(0);
    expect(markFailed).toHaveBeenCalledOnce();
  });
});

describe("reconstruct-runner — 无逐字稿则失败不物化", () => {
  it("imported 但无逐字稿(D3 未绑)→ markFailed,0 物化(不凭空编)", async () => {
    const { deps, materialized, markSucceeded, markFailed } = makeDeps({
      source: "imported",
      transcript: null,
    });
    await runReconstruct(ctx, task, deps);
    expect(materialized).toHaveLength(0);
    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
    const failMsg = markFailed.mock.calls[0]![2] as string;
    expect(failMsg).toContain("逐字稿");
  });
});
