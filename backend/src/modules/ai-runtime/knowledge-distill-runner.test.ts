import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// knowledge.distill runner 单测(T-079b)—— mock ai-worker 的 runStructuredNode(动态 import
// 目标),验证:capability 按 "knowledge.distill" 解析(可配不写死)、facet 截断 8000、归一逻辑
// (空 title 原子滤掉 / atoms 全空 → 抛错诚实失败 / suggestedTags 去重截 3)、resolve 失败向上抛。

const runStructuredNode = vi.fn();
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode: (...args: unknown[]) => runStructuredNode(...args),
  getTemplate: (id: string) => ({ id }),
}));

import {
  runKnowledgeDistill,
  mergeDistillations,
  normalizeDistillation,
  truncateForDistill,
  DISTILL_CHUNK_CHARS,
  MAX_DISTILL_CONTENT_CHARS,
} from "./knowledge-distill-runner";

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
      atoms: [
        {
          type: "claim",
          title: "上下文工程比提示词工程重要",
          note: "谈 Agent 设计",
          sourceNote: "原文作者观点",
        },
        { type: "quote", title: "把模型当同事,不当算命先生", note: "", sourceNote: "" },
      ],
      suggestedTags: ["上下文工程"],
    },
  });
});

describe("truncateForDistill(防爆截断 8000)", () => {
  it("短原文原样透传(trim)", () => {
    expect(truncateForDistill("  abc  ")).toBe("abc");
  });

  it("超限截断并标注(存库全文不受影响,只截送模型的 facet)", () => {
    const long = "字".repeat(MAX_DISTILL_CONTENT_CHARS + 100);
    const out = truncateForDistill(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("已截断");
    expect(MAX_DISTILL_CONTENT_CHARS).toBe(200_000); // [T-431] 1M 上下文:只挡病态输入
  });
});

describe("normalizeDistillation(归一)", () => {
  it("空 title 原子滤掉;title 截 80;note/sourceNote trim;tags 去重滤空截 3", () => {
    const d = normalizeDistillation({
      atoms: [
        { type: "claim", title: "  留下的观点  ", note: " 评注 ", sourceNote: " 出处 " },
        { type: "quote", title: "   ", note: "空本体该滤", sourceNote: "" },
        { type: "evidence", title: "长".repeat(100), note: "", sourceNote: "" },
      ],
      suggestedTags: [" a ", "a", "", "b", "c", "d"],
    });
    expect(d).not.toBeNull();
    expect(d!.atoms).toHaveLength(2);
    expect(d!.atoms[0]).toEqual({
      type: "claim",
      title: "留下的观点",
      note: "评注",
      sourceNote: "出处",
    });
    expect(d!.atoms[1]!.title).toHaveLength(80);
    expect(d!.suggestedTags).toEqual(["a", "b", "c"]);
  });

  it("atoms 全空(或全被滤)→ null(诚实失败,不编原子)", () => {
    expect(normalizeDistillation({ atoms: [], suggestedTags: ["x"] })).toBeNull();
    expect(
      normalizeDistillation({
        atoms: [{ type: "claim", title: "  ", note: "", sourceNote: "" }],
        suggestedTags: [],
      }),
    ).toBeNull();
  });
});

describe("runKnowledgeDistill(装配)", () => {
  it("按 capability 'knowledge.distill' 解析模型 + 模板注入截断后的 content", async () => {
    const resolveModelSpec = vi.fn(async () => okSpec);
    const result = await runKnowledgeDistill(
      ctx,
      { content: "一段创作心得原文" },
      { resolveModelSpec },
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "knowledge.distill");
    const call = runStructuredNode.mock.calls[0]![0] as {
      template: { id: string };
      facets: Record<string, string>;
    };
    expect(call.template.id).toBe("knowledge.distill");
    expect(call.facets.content).toBe("一段创作心得原文");
    expect(result.atoms).toHaveLength(2);
    expect(result.atoms[0]!.type).toBe("claim");
    expect(result.suggestedTags).toEqual(["上下文工程"]);
  });

  it("空原文 → 抛错(不空跑模型)", async () => {
    const resolveModelSpec = vi.fn(async () => okSpec);
    await expect(
      runKnowledgeDistill(ctx, { content: "   " }, { resolveModelSpec }),
    ).rejects.toThrow(/原文为空/);
    expect(resolveModelSpec).not.toHaveBeenCalled();
  });

  it("模型产出全空原子 → 抛错(调用方内联展示,原始输入留给手动补录)", async () => {
    runStructuredNode.mockResolvedValue({
      object: { atoms: [], suggestedTags: [] },
    });
    await expect(
      runKnowledgeDistill(
        ctx,
        { content: "内容" },
        { resolveModelSpec: vi.fn(async () => okSpec) },
      ),
    ).rejects.toThrow(/未蒸馏出可用知识原子/);
  });

  it("resolveModelSpec 抛(无凭据)→ 原样向上抛,不静默兜底", async () => {
    const resolveModelSpec = vi.fn(async () => {
      throw new Error("无可用 LLM 凭据");
    });
    await expect(
      runKnowledgeDistill(ctx, { content: "内容" }, { resolveModelSpec }),
    ).rejects.toThrow(/无可用 LLM 凭据/);
    expect(runStructuredNode).not.toHaveBeenCalled();
  });

  it("长文按 6~8k 确定性分块逐块蒸馏，按原文顺序合并去重并报告进度", async () => {
    const content = [
      "第一部分。".repeat(900),
      "第二部分。".repeat(900),
      "第三部分。".repeat(900),
    ].join("\n\n");
    expect(content.length).toBeGreaterThan(DISTILL_CHUNK_CHARS);
    let callNo = 0;
    runStructuredNode.mockImplementation(async () => {
      callNo += 1;
      return {
        object: {
          atoms: [
            {
              type: "claim",
              title:
                callNo === 1
                  ? "上下文工程，是新的护城河"
                  : callNo === 2
                    ? "上下文工程是新的护城河。"
                    : `第 ${callNo} 块的新观点`,
              note: "",
              sourceNote: "",
            },
          ],
          suggestedTags: [`标签${callNo}`, "共同标签"],
        },
      };
    });
    const progress = vi.fn();
    const result = await runKnowledgeDistill(
      ctx,
      { content },
      {
        resolveModelSpec: vi.fn(async () => okSpec),
        onChunkProgress: progress,
      },
    );
    expect(runStructuredNode.mock.calls.length).toBeGreaterThan(1);
    const facets = runStructuredNode.mock.calls.map(
      ([arg]) => (arg as { facets: { content: string } }).facets.content,
    );
    expect(facets.join("")).toBe(content);
    expect(facets.every((part) => part.length <= DISTILL_CHUNK_CHARS)).toBe(true);
    expect(result.atoms.filter((atom) => atom.title.includes("护城河"))).toHaveLength(1);
    expect(result.coverage).toEqual({
      inputChars: content.length,
      processedChars: content.length,
      truncatedChars: 0,
      chunkCount: facets.length,
    });
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "completed",
        completed: facets.length,
        total: facets.length,
      }),
    );
  });

  it("任一长文分块失败 → 明确指出块号且不返回伪完整的部分结果", async () => {
    const content = "长文段落。\n".repeat(2_000);
    let callNo = 0;
    runStructuredNode.mockImplementation(async () => {
      callNo += 1;
      if (callNo === 2) throw new Error("provider timeout");
      return {
        object: {
          atoms: [
            { type: "claim", title: `第${callNo}块`, note: "", sourceNote: "" },
          ],
          suggestedTags: [],
        },
      };
    });
    await expect(
      runKnowledgeDistill(
        ctx,
        { content },
        { resolveModelSpec: vi.fn(async () => okSpec) },
      ),
    ).rejects.toThrow(/第 2\/\d+ 块.*未返回部分候选/);
  });

  it("超过硬上限时 coverage 如实报告处理/截断字符数", async () => {
    const content = "字".repeat(MAX_DISTILL_CONTENT_CHARS + 17);
    const result = await runKnowledgeDistill(
      ctx,
      { content },
      { resolveModelSpec: vi.fn(async () => okSpec) },
    );
    expect(result.coverage).toMatchObject({
      inputChars: MAX_DISTILL_CONTENT_CHARS + 17,
      processedChars: MAX_DISTILL_CONTENT_CHARS,
      truncatedChars: 17,
    });
  });
});

describe("mergeDistillations(跨块顺序去重)", () => {
  it("标题/内容近重保留先出现项，标签按首次出现顺序去重截 3", () => {
    const merged = mergeDistillations([
      {
        atoms: [
          {
            type: "claim",
            title: "上下文工程，是新的护城河",
            note: "模型不缺聪明，缺上下文。",
            sourceNote: "",
          },
        ],
        suggestedTags: ["上下文", "AI"],
      },
      {
        atoms: [
          {
            type: "claim",
            title: "上下文工程是新的护城河。",
            note: "模型不缺聪明,缺上下文",
            sourceNote: "第二块重复",
          },
          {
            type: "evidence",
            title: "独立的新证据",
            note: "",
            sourceNote: "",
          },
        ],
        suggestedTags: ["AI", "创作", "第四个会被截"],
      },
    ]);
    expect(merged.atoms.map((atom) => atom.title)).toEqual([
      "上下文工程，是新的护城河",
      "独立的新证据",
    ]);
    expect(merged.suggestedTags).toEqual(["上下文", "AI", "创作"]);
  });
});
