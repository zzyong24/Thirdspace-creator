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
  // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
  getTemplate: (id: string) => ({ id }),
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
    // 结构化对象(已被 outputSchema 校验):两个平台草稿,各带发布审核 SOP 的 auditFlags
    // (L6:硬规则改动记录 + 经验建议;含需 trim/滤空的脏项验证归一透传)。
    const object = {
      drafts: [
        {
          platform: "douyin",
          title: "抖音标题",
          body: "正文",
          tags: ["a", "b"],
          coverIdea: "封面",
          auditFlags: ["  标签去掉品牌词→泛称  ", "", "营销词『变现』→『跑通』"],
        },
        {
          platform: "bilibili",
          title: "B站标题",
          body: "正文2",
          tags: [],
          coverIdea: "",
          auditFlags: ["✅ 无命中,合规"],
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
    const drafts = input.resultData.drafts as Array<{
      platform: string;
      auditFlags: string[];
    }>;
    expect(Array.isArray(drafts)).toBe(true);
    expect(drafts.length).toBe(2);
    // L6:auditFlags 透传到 recordCandidate 的 resultData.drafts(既有字段不动,只加这一项)。
    // 脏项被 trim + 滤空:第一条剩 2 条,第二条是 ✅ 类。
    expect(drafts[0]!.auditFlags).toEqual([
      "标签去掉品牌词→泛称",
      "营销词『变现』→『跑通』",
    ]);
    expect(drafts[1]!.auditFlags).toEqual(["✅ 无命中,合规"]);
  });

  it("透传缺省:草稿不带 auditFlags 时归一为空数组(向后兼容)", async () => {
    // 老 provider / 文本兜底可能不吐 auditFlags —— schema default([]) + 归一滤空,应得 []。
    const { deps, recordCandidate } = makeDeps({
      drafts: [
        {
          platform: "douyin",
          title: "抖音标题",
          body: "正文",
          tags: ["a"],
          coverIdea: "封面",
          // 无 auditFlags 字段
        },
      ],
    });
    await runPlatformAdapt(
      ctx,
      { id: "t1", projectId: "p1", inputData: { outputId: "o1" } },
      deps,
    );
    const input = recordCandidate.mock.calls[0]![2];
    const drafts = input.resultData.drafts as Array<{ auditFlags: string[] }>;
    expect(drafts[0]!.auditFlags).toEqual([]);
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
