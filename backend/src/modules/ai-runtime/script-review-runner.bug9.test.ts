import { describe, it, expect, vi } from "vitest";
import type { AiService } from "@creatoros/backend/modules/ai";
import {
  runScriptReview,
  type ScriptReviewDeps,
  type ScriptReviewTask,
} from "./script-review-runner";

// [Bug-9 T-022] resolveModelSpec 失败(T-171 master key 解不开 / 真没配 / 等) → 整次审核
// 不崩,降级为「仅 L1」报告 + 诚实 summary 告诉用户去配 key。覆盖 4 个分支:
//   ① 有 spec 且 L2 成功 → 老路径
//   ② 有 spec 但 L2 模型调用抛 → 老路径(L1 + summary 标「模型不可用」)
//   ③ resolveModelSpec 抛 → 降级到 L1-only + summary 标「未配置审核模型 / 请去设置配」
//   ④ verdict 仍按 L1 命中给(pass/risk/block),不让用户卡在「没审核」

const baseTask: ScriptReviewTask = {
  id: "task-bug9",
  projectId: "p-1",
  inputData: { projectId: "p-1" },
};

// [T-022 测试] 简化 ai mock:只覆写 runner 用的 4 个方法,其余不关心(用 Pick + as unknown as 强转,
function makeDeps(overrides: Partial<ScriptReviewDeps> = {}): {
  deps: ScriptReviewDeps;
  reports: Array<{ verdict: string; summary: string; modelLabel: string }>;
  steps: Array<{ text: string }>;
  failed: Array<{ reason: string }>;
  /** counter ref — read .current after runScriptReview completes。 */
  counters: { succeedCount: number };
} {
  const reports: Array<{ verdict: string; summary: string; modelLabel: string }> = [];
  const steps: Array<{ text: string }> = [];
  const failed: Array<{ reason: string }> = [];
  const counters = { succeedCount: 0 };
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
        });
        return { id: "rep-1" };
      },
    },
    resolveModelSpec: async () =>
      ({
        apiFormat: "anthropic",
        baseUrl: null,
        model: "minimax-mock",
        authStyle: "bearer",
        token: "sk-mock",
        settings: {},
      }) as Awaited<ReturnType<NonNullable<ScriptReviewDeps["resolveModelSpec"]>>>,
    hasDedicatedReviewModel: async () => false,
    ...overrides,
  };
  return { deps, reports, steps, failed, counters };
}

describe("runScriptReview — Bug-9 T-022 降级路径", () => {
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
    const { deps, reports, counters } = makeDeps();
    await runScriptReview({} as never, baseTask, deps);
    expect(counters.succeedCount).toBe(1);
    expect(reports[0]?.verdict).toBe("block");
    expect(reports[0]?.modelLabel).toContain("minimax-mock");
  });

  it("resolveModelSpec 抛(LlmCredentialError 等)→ 不 markFailed,降级 L1-only + summary 诚实", async () => {
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
    // [Bug-9 T-022] 关键:不 markFailed,反而 markSucceeded + 落一份 L1-only 报告。
    expect(failed).toHaveLength(0);
    expect(counters.succeedCount).toBe(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.summary).toMatch(/L2 语义审未运行|仅含 L1/);
    expect(reports[0]?.summary).toMatch(/请在「设置 → 模型」配置审核模型/);
    // verdict 仍按 L1 命中给:block(official_hard 命中)。
    expect(reports[0]?.verdict).toBe("block");
  });

  it("resolveModelSpec 返 null(包装层已静默)→ 同样降级 L1-only", async () => {
    // resolveModelSpec 显式返 null 的情况(某些降级实现可能这么做)。
    const { deps, reports, failed, counters } = makeDeps({
      resolveModelSpec: async () => null as never,
    });
    await runScriptReview({} as never, baseTask, deps);
    expect(failed).toHaveLength(0);
    expect(counters.succeedCount).toBe(1);
    expect(reports[0]?.summary).toMatch(/L2 语义审未运行/);
  });
});