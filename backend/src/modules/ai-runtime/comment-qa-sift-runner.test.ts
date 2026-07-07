import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// comment.qa-sift runner 单测(T-092)—— mock ai-worker 的 runStructuredNode,验证:
// capability 按 "comment.qa-sift" 解析(可配不写死)、facet 拼装、归一逻辑
// (空 title / 无真实支撑 signalIds 滤掉;sourceNote 缺省自动拼;同义合并 signalIds 保留)、
// 空输入不打模型。

const runStructuredNode = vi.fn();
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode: (...args: unknown[]) => runStructuredNode(...args),
  getTemplate: (id: string) => ({ id }),
}));

import {
  runCommentQaSift,
  normalizeQaCandidates,
  buildCommentsFacet,
  type SiftCommentInput,
} from "./comment-qa-sift-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const okSpec = {
  apiFormat: "anthropic" as const,
  baseUrl: null,
  model: "claude-opus-4-8",
  token: "k",
};

const comments: SiftCommentInput[] = [
  { signalId: "sig-1", rawText: "本地模型怎么装?", likeCount: 57 },
  { signalId: "sig-2", rawText: "求本地部署教程", likeCount: 31 },
  { signalId: "sig-3", rawText: "显存不够能跑吗", likeCount: null },
];

beforeEach(() => {
  runStructuredNode.mockReset();
});

describe("buildCommentsFacet", () => {
  it("每行 [signalId] (赞 N) 原文;null 赞按 0", () => {
    const facet = buildCommentsFacet(comments);
    const lines = facet.split("\n");
    expect(lines[0]).toBe("[sig-1] (赞 57) 本地模型怎么装?");
    expect(lines[2]).toBe("[sig-3] (赞 0) 显存不够能跑吗");
  });
});

describe("normalizeQaCandidates", () => {
  it("空 title / 无真实支撑 signalIds 滤掉;同义合并 signalIds 保留去重", () => {
    const out = normalizeQaCandidates(
      {
        candidates: [
          {
            title: "怎么在本地部署大模型?",
            note: "",
            sourceNote: "抖音评论 ×2,最高赞 57",
            signalIds: ["sig-1", "sig-2", "sig-2", "sig-fake"],
          },
          { title: "", note: "空标题该滤", sourceNote: "", signalIds: ["sig-3"] },
          { title: "编造的问题", note: "", sourceNote: "", signalIds: ["sig-nope"] },
        ],
      },
      comments,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.signalIds).toEqual(["sig-1", "sig-2"]);
    expect(out[0]!.sourceNote).toBe("抖音评论 ×2,最高赞 57");
  });

  it("sourceNote 缺省按支撑评论自动拼(多条 ×N + 最高赞;单条 赞 N)", () => {
    const out = normalizeQaCandidates(
      {
        candidates: [
          { title: "Q1", note: "", sourceNote: "", signalIds: ["sig-1", "sig-2"] },
          { title: "Q2", note: "", sourceNote: "", signalIds: ["sig-3"] },
        ],
      },
      comments,
    );
    expect(out[0]!.sourceNote).toBe("抖音评论 ×2,最高赞 57");
    expect(out[1]!.sourceNote).toBe("抖音评论,赞 0");
  });

  it("空候选诚实空数组(全是水评就空,不编问题)", () => {
    expect(normalizeQaCandidates({ candidates: [] }, comments)).toEqual([]);
  });
});

describe("runCommentQaSift", () => {
  it('capability 按 "comment.qa-sift" 解析;facet 带评论批', async () => {
    const resolveModelSpec = vi.fn().mockResolvedValue(okSpec);
    runStructuredNode.mockResolvedValue({
      object: {
        candidates: [
          {
            title: "怎么在本地部署大模型?",
            note: "",
            sourceNote: "",
            signalIds: ["sig-1", "sig-2"],
          },
        ],
      },
    });
    const out = await runCommentQaSift(ctx, { comments }, { resolveModelSpec });
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "comment.qa-sift");
    expect(out.candidates).toHaveLength(1);
    const call = runStructuredNode.mock.calls[0]![0] as {
      template: { id: string };
      facets: { comments: string };
    };
    expect(call.template.id).toBe("comment.qa-sift");
    expect(call.facets.comments).toContain("[sig-1] (赞 57)");
  });

  it("空输入 → 直接诚实空,不打模型", async () => {
    const resolveModelSpec = vi.fn();
    const out = await runCommentQaSift(ctx, { comments: [] }, { resolveModelSpec });
    expect(out.candidates).toEqual([]);
    expect(resolveModelSpec).not.toHaveBeenCalled();
  });

  it("resolveModelSpec 失败向上抛(没配 key 诚实报错)", async () => {
    const resolveModelSpec = vi.fn().mockRejectedValue(new Error("无可用 LLM 凭据"));
    await expect(
      runCommentQaSift(ctx, { comments }, { resolveModelSpec }),
    ).rejects.toThrow("无可用 LLM 凭据");
  });
});
