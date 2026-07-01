import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 一稿多平台 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象,顶层 { drafts:[...] })。
// runner 解析 model(resolveModelSpec)→ runStructuredNode 拿 object → normalizePlatformDrafts +
// recordCandidate。这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、
// 候选被记录、归一逻辑(多平台草稿)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: { drafts: [] } }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  PLATFORM_ADAPT_TEMPLATE: { id: "platform.adapt" },
}));

import { runPlatformAdapt } from "./platform-adapt-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(object: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        recordStep: vi.fn(async () => undefined),
        cancelTask,
      } as never,
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      resolveModelSpec,
    },
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
}

describe("runPlatformAdapt (runStructuredNode + 外置模板)", () => {
  it("resolves script.rewrite and records a publication_drafts candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):两个平台草稿。
    const object = {
      drafts: [
        {
          platform: "douyin",
          title: "抖音标题",
          body: "正文",
          tags: ["a", "b"],
          coverIdea: "封面",
        },
        {
          platform: "bilibili",
          title: "B站标题",
          body: "正文2",
          tags: [],
          coverIdea: "",
        },
      ],
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(object);
    await runPlatformAdapt(
      ctx,
      { id: "t1", projectId: "p1", inputData: { outputId: "o1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "script.rewrite");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("publication_drafts");
    expect(input.resultData.outputId).toBe("o1");
    const drafts = input.resultData.drafts as unknown[];
    expect(Array.isArray(drafts)).toBe(true);
    expect(drafts.length).toBe(2);
  });

  it("cancels the task (no candidate) when the object normalizes to no drafts", async () => {
    // 合法但退化的结构化对象(缺 platform/title)→ normalizePlatformDrafts 产 0 项 → guard → cancel。
    const { deps, recordCandidate, cancelTask } = makeDeps({
      drafts: [{ platform: "", title: "", body: "", tags: [], coverIdea: "" }],
    });
    await runPlatformAdapt(
      ctx,
      { id: "t1", projectId: "p1", inputData: { outputId: "o1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
