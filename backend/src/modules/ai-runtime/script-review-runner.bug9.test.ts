import { beforeEach, describe, it, expect, vi } from "vitest";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  isCompleteRawScriptReview,
  runScriptReview,
  type ScriptReviewDeps,
  type ScriptReviewTask,
} from "./script-review-runner";

// [T-766] 文案审核是通用文本模型的一项任务；L1 + L2 才是一份完整报告。
// 解析或语义调用失败必须失败关闭，禁止再落 L1-only 假成功报告。

const baseTask: ScriptReviewTask = {
  id: "task-bug9",
  projectId: "p-1",
  inputData: { projectId: "p-1" },
};

beforeEach(() => {
  vi.resetModules();
});

// [T-022 测试] 简化 ai mock:只覆写 runner 用的 4 个方法,其余不关心(用 Pick + as unknown as 强转,
function makeDeps(overrides: Partial<ScriptReviewDeps> = {}): {
  deps: ScriptReviewDeps;
  reports: Array<{
    verdict: string;
    summary: string;
    modelLabel: string;
    artifactId: string | null;
    artifactVersion: number;
  }>;
  steps: Array<{ text: string }>;
  failed: Array<{ reason: string }>;
  /** counter ref — read .current after runScriptReview completes。 */
  counters: { succeedCount: number };
  resolvedCapabilities: string[];
} {
  const reports: Array<{
    verdict: string;
    summary: string;
    modelLabel: string;
    artifactId: string | null;
    artifactVersion: number;
  }> = [];
  const steps: Array<{ text: string }> = [];
  const failed: Array<{ reason: string }> = [];
  const counters = { succeedCount: 0 };
  const resolvedCapabilities: string[] = [];
  // 简化 ai mock:只覆写 runner 用到的 4 个方法,其余方法 `as never` 占位(测试不调,类型也能过)。
  const deps: ScriptReviewDeps = {
    ai: {
      markRunning: async () => undefined,
      recordStep: async (_c: unknown, _id: unknown, step: { text: string }) => {
        steps.push({ text: step.text });
      },
      markSucceeded: async () => {
        counters.succeedCount += 1;
      },
      markFailed: async (_c: unknown, _id: unknown, reason: string | undefined) => {
        failed.push({ reason: reason ?? "" });
      },
    } as unknown as AiService,
    scriptSource: {
      getLatestScript: async () => ({
        artifactId: "art-1",
        version: 1,
        text: "今天介绍加微信领资料。",
      }),
    },
    lintRules: {
      // 让 L1 命中「加微信」(official_hard)→ verdict=block
      listActiveLintRules: async () => [
        {
          id: "r-1",
          tier: "official_hard",
          category: "导流",
          matchType: "word",
          pattern: "加微信",
          replacement: "关注主页",
          note: "",
        },
      ],
    },
    reportSink: {
      saveReport: async (_c, input) => {
        reports.push({
          verdict: input.verdict,
          summary: input.summary,
          modelLabel: input.modelLabel,
          artifactId: input.artifactId,
          artifactVersion: input.artifactVersion,
        });
        return { id: "rep-1" };
      },
    },
    resolveModelSpec: async (_ctx, capability) => {
      resolvedCapabilities.push(capability);
      return {
        apiFormat: "anthropic",
        baseUrl: null,
        model: "minimax-mock",
        authStyle: "bearer",
        token: "sk-mock",
        settings: {},
      } as Awaited<ReturnType<NonNullable<ScriptReviewDeps["resolveModelSpec"]>>>;
    },
    ...overrides,
  };
  return { deps, reports, steps, failed, counters, resolvedCapabilities };
}

describe("runScriptReview — T-766 通用文本模型与失败关闭", () => {
  it("任务绑定的稿件版本已变化时真实失败，不拿新稿冒充旧 attempt 的审核结果", async () => {
    vi.doMock("@creatoros/ai-worker", async () => {
      const actual =
        await vi.importActual<typeof import("@creatoros/ai-worker")>(
          "@creatoros/ai-worker",
        );
      return {
        ...actual,
        runStructuredNode: vi.fn(async () => ({
          object: { verdict: "pass", findings: [], summary: "不应执行" },
        })),
      };
    });
    const { deps, reports, failed, counters, resolvedCapabilities } = makeDeps({
      scriptSource: {
        getLatestScript: async () => ({
          artifactId: "art-1",
          version: 4,
          text: "这是改稿后的第四版文案。",
        }),
      },
    });
    await runScriptReview(
      {} as never,
      {
        ...baseTask,
        inputData: {
          projectId: "p-1",
          artifactId: "art-1",
          artifactVersion: 3,
        },
      },
      deps,
    );
    expect(failed[0]?.reason).toContain("稿件已更新");
    expect(counters.succeedCount).toBe(0);
    expect(reports).toHaveLength(0);
    expect(resolvedCapabilities).toHaveLength(0);
  });

  it("有 spec 且 L2 成功 → 老路径:verdict=block + summary 显 L2 结果", async () => {
    // mock ai-worker:runStructuredNode 返 block verdict
    vi.doMock("@creatoros/ai-worker", async () => {
      const actual =
        await vi.importActual<typeof import("@creatoros/ai-worker")>(
          "@creatoros/ai-worker",
        );
      return {
        ...actual,
        runStructuredNode: async () => ({
          object: {
            verdict: "block" as const,
            findings: [
              {
                severity: "block",
                quote: "加微信",
                explanation: "禁止导流",
                suggestion: "改写",
              },
            ],
            summary: "L2 命中:加微信",
          },
        }),
      };
    });
    const { deps, reports, counters, resolvedCapabilities } = makeDeps();
    await runScriptReview({} as never, baseTask, deps);
    expect(counters.succeedCount).toBe(1);
    expect(reports[0]?.verdict).toBe("block");
    expect(reports[0]?.modelLabel).toBe("minimax-mock");
    expect(resolvedCapabilities).toEqual(["default"]);
  });

  it("resolveModelSpec 抛 → markFailed，且不落 L1-only 报告", async () => {
    // resolveModelSpec 永远抛(T-171 master key 解不开 / 真没配 / 真没 key)。
    const { deps, reports, failed, counters } = makeDeps({
      resolveModelSpec: async () => {
        throw new Error(
          'capability "script.review" 无可用 LLM 凭据',
        );
      },
    });
    // ai-worker 不应被调到(L2 跳过)。如果被调 → 抛 fake 失败让测挂。
    vi.doMock("@creatoros/ai-worker", async () => {
      const actual =
        await vi.importActual<typeof import("@creatoros/ai-worker")>(
          "@creatoros/ai-worker",
        );
      return {
        ...actual,
        runStructuredNode: async () => {
          throw new Error("L2 不该被调用(resolveModelSpec 已失败)");
        },
      };
    });
    await runScriptReview({} as never, baseTask, deps);
    expect(failed).toHaveLength(1);
    expect(counters.succeedCount).toBe(0);
    expect(reports).toHaveLength(0);
  });

  it("L2 调用失败 → markFailed，且不落 L1-only 报告", async () => {
    vi.doMock("@creatoros/ai-worker", async () => {
      const actual =
        await vi.importActual<typeof import("@creatoros/ai-worker")>(
          "@creatoros/ai-worker",
        );
      return {
        ...actual,
        runStructuredNode: async () => {
          throw new Error("模型未返回完整语义审核结果");
        },
      };
    });
    const { deps, reports, failed, counters } = makeDeps();
    await runScriptReview({} as never, baseTask, deps);
    expect(failed).toHaveLength(1);
    expect(counters.succeedCount).toBe(0);
    expect(reports).toHaveLength(0);
  });

  it("内容雷达首存前的口播稿可在没有正式 artifact 时先完成审核", async () => {
    vi.doMock("@creatoros/ai-worker", async () => {
      const actual =
        await vi.importActual<typeof import("@creatoros/ai-worker")>(
          "@creatoros/ai-worker",
        );
      return {
        ...actual,
        runStructuredNode: async () => ({
          object: {
            verdict: "pass" as const,
            findings: [],
            summary: "语义审核完成。",
          },
        }),
      };
    });
    const { deps, reports, failed, counters } = makeDeps({
      scriptSource: {
        getLatestScript: async () => ({
          artifactId: null,
          version: 0,
          text: "这是内容雷达已经确认并带进项目的口播稿。",
        }),
      },
    });

    await runScriptReview({} as never, baseTask, deps);

    expect(failed).toHaveLength(0);
    expect(counters.succeedCount).toBe(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({ artifactId: null, artifactVersion: 0 }),
    );
  });
});

describe("isCompleteRawScriptReview", () => {
  it("拒绝依靠 schema 默认值的空对象，只接受显式完整报告", () => {
    expect(isCompleteRawScriptReview({})).toBe(false);
    expect(
      isCompleteRawScriptReview({ verdict: "pass", summary: "", findings: [] }),
    ).toBe(false);
    expect(
      isCompleteRawScriptReview({
        verdict: "pass",
        summary: "语义审核完成。",
        findings: [],
      }),
    ).toBe(true);
  });
});
