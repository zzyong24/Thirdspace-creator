import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// knowledge.classify runner 单测(T-062c)—— mock ai-worker 的 runStructuredNode(动态 import
// 目标),验证:capability 按 "knowledge.classify" 解析(可配不写死)、facet 截断、归一逻辑
// (tags 去重截 5 / title 空 → 抛错诚实失败)、resolve 失败向上抛(调用方内联展示)。

const runStructuredNode = vi.fn();
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode: (...args: unknown[]) => runStructuredNode(...args),
  getTemplate: (id: string) => ({ id }),
}));

import {
  runKnowledgeClassify,
  normalizeClassification,
  truncateForClassify,
  MAX_CLASSIFY_CONTENT_CHARS,
} from "./knowledge-classify-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const okSpec = {
  apiFormat: "anthropic" as const,
  baseUrl: null,
  model: "claude-opus-4-8",
  token: "k",
};

beforeEach(() => {
  runStructuredNode.mockReset();
  runStructuredNode.mockResolvedValue({
    object: {
      knowledgeType: "snippet",
      title: "Hook 模板",
      tags: ["Hook"],
      summary: "开头钩子。",
    },
  });
});

describe("truncateForClassify(防爆截断)", () => {
  it("短原文原样透传(trim)", () => {
    expect(truncateForClassify("  abc  ")).toBe("abc");
  });

  it("超限截断并标注(存库全文不受影响,只截送模型的 facet)", () => {
    const long = "字".repeat(MAX_CLASSIFY_CONTENT_CHARS + 100);
    const out = truncateForClassify(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("已截断");
  });
});

describe("normalizeClassification(归一)", () => {
  it("tags 去重 + 滤空 + 截 5;title/summary trim", () => {
    const c = normalizeClassification({
      knowledgeType: "note",
      title: "  一条笔记  ",
      tags: [" a ", "a", "", "b", "c", "d", "e", "f"],
      summary: "  摘要  ",
    });
    expect(c).not.toBeNull();
    expect(c!.title).toBe("一条笔记");
    expect(c!.tags).toEqual(["a", "b", "c", "d", "e"]);
    expect(c!.summary).toBe("摘要");
  });

  it("title 空 → null(诚实失败,不编标题)", () => {
    expect(
      normalizeClassification({
        knowledgeType: "note",
        title: "   ",
        tags: [],
        summary: "s",
      }),
    ).toBeNull();
  });
});

describe("runKnowledgeClassify(装配)", () => {
  it("按 capability 'knowledge.classify' 解析模型 + 模板注入截断后的 content", async () => {
    const resolveModelSpec = vi.fn(async () => okSpec);
    const result = await runKnowledgeClassify(
      ctx,
      { content: "把素材都拖进去自动归类" },
      { resolveModelSpec },
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "knowledge.classify");
    const call = runStructuredNode.mock.calls[0]![0] as {
      template: { id: string };
      facets: Record<string, string>;
    };
    expect(call.template.id).toBe("knowledge.classify");
    expect(call.facets.content).toBe("把素材都拖进去自动归类");
    expect(result).toEqual({
      knowledgeType: "snippet",
      title: "Hook 模板",
      tags: ["Hook"],
      summary: "开头钩子。",
    });
  });

  it("空原文 → 抛错(不空跑模型)", async () => {
    const resolveModelSpec = vi.fn(async () => okSpec);
    await expect(
      runKnowledgeClassify(ctx, { content: "   " }, { resolveModelSpec }),
    ).rejects.toThrow(/原文为空/);
    expect(resolveModelSpec).not.toHaveBeenCalled();
  });

  it("模型产出空 title → 抛错(调用方内联展示,原始输入留给手动补录)", async () => {
    runStructuredNode.mockResolvedValue({
      object: { knowledgeType: "note", title: "", tags: [], summary: "" },
    });
    await expect(
      runKnowledgeClassify(
        ctx,
        { content: "内容" },
        { resolveModelSpec: vi.fn(async () => okSpec) },
      ),
    ).rejects.toThrow(/未产出可用归类/);
  });

  it("resolveModelSpec 抛(无凭据)→ 原样向上抛,不静默兜底", async () => {
    const resolveModelSpec = vi.fn(async () => {
      throw new Error("无可用 LLM 凭据");
    });
    await expect(
      runKnowledgeClassify(ctx, { content: "内容" }, { resolveModelSpec }),
    ).rejects.toThrow(/无可用 LLM 凭据/);
    expect(runStructuredNode).not.toHaveBeenCalled();
  });
});
