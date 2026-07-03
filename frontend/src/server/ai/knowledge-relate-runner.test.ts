import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// knowledge.relate runner 单测(T-091)—— mock ai-worker 的 runStructuredNode,验证:
// capability 按 "knowledge.relate" 解析(可配不写死)、facet 拼装/截断、归一逻辑
// (未知 id / 自连 / 空 reason / 重复对滤掉;空候选诚实返回不抛错)、<2 原子不打模型。

const runStructuredNode = vi.fn();
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode: (...args: unknown[]) => runStructuredNode(...args),
  getTemplate: (id: string) => ({ id }),
}));

import {
  runKnowledgeRelate,
  normalizeRelateCandidates,
  buildAtomsFacet,
  MAX_RELATE_ATOMS,
  type RelateAtomInput,
} from "./knowledge-relate-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };
const okSpec = {
  apiFormat: "anthropic" as const,
  baseUrl: null,
  model: "claude-opus-4-8",
  token: "k",
};

const atoms: RelateAtomInput[] = [
  { id: "k-1", knowledgeType: "claim", title: "上下文工程是核心", sourceNote: null },
  { id: "k-2", knowledgeType: "evidence", title: "实测截断不降准确率", sourceNote: "亲测" },
  { id: "k-3", knowledgeType: "quote", title: "把模型当同事", sourceNote: null },
];

beforeEach(() => {
  runStructuredNode.mockReset();
});

describe("buildAtomsFacet", () => {
  it("每行 [id] (type) title — sourceNote;无出处不拼破折号", () => {
    const facet = buildAtomsFacet(atoms);
    const lines = facet.split("\n");
    expect(lines[0]).toBe("[k-1] (claim) 上下文工程是核心");
    expect(lines[1]).toBe("[k-2] (evidence) 实测截断不降准确率 — 亲测");
  });

  it("超过 MAX_RELATE_ATOMS 截断", () => {
    const many: RelateAtomInput[] = Array.from({ length: MAX_RELATE_ATOMS + 10 }, (_, i) => ({
      id: `k-${i}`,
      knowledgeType: "claim",
      title: `t${i}`,
      sourceNote: null,
    }));
    expect(buildAtomsFacet(many).split("\n")).toHaveLength(MAX_RELATE_ATOMS);
  });
});

describe("normalizeRelateCandidates", () => {
  const known = new Set(["k-1", "k-2", "k-3"]);

  it("未知 id / 自连 / 空 reason 滤掉;同对(无向)去重", () => {
    const out = normalizeRelateCandidates(
      {
        candidates: [
          { sourceId: "k-2", targetId: "k-1", relationType: "supports", reason: "实测数据支撑该观点" },
          { sourceId: "k-1", targetId: "k-2", relationType: "references", reason: "同一对反向,应去重" },
          { sourceId: "k-1", targetId: "k-1", relationType: "extends", reason: "自连该滤" },
          { sourceId: "k-9", targetId: "k-1", relationType: "supports", reason: "编造 id 该滤" },
          { sourceId: "k-3", targetId: "k-1", relationType: "extends", reason: "" },
        ],
      },
      known,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      sourceId: "k-2",
      targetId: "k-1",
      relationType: "supports",
      reason: "实测数据支撑该观点",
    });
  });

  it("空候选诚实空数组(不抛错、不硬凑)", () => {
    expect(normalizeRelateCandidates({ candidates: [] }, known)).toEqual([]);
  });
});

describe("runKnowledgeRelate", () => {
  it('capability 按 "knowledge.relate" 解析;返回归一后的候选', async () => {
    const resolveModelSpec = vi.fn().mockResolvedValue(okSpec);
    runStructuredNode.mockResolvedValue({
      object: {
        candidates: [
          { sourceId: "k-2", targetId: "k-1", relationType: "supports", reason: "实测支撑观点" },
        ],
      },
    });
    const out = await runKnowledgeRelate(ctx, { atoms }, { resolveModelSpec });
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "knowledge.relate");
    expect(out.candidates).toHaveLength(1);
    const call = runStructuredNode.mock.calls[0]![0] as {
      template: { id: string };
      facets: { atoms: string };
    };
    expect(call.template.id).toBe("knowledge.relate");
    expect(call.facets.atoms).toContain("[k-1] (claim)");
  });

  it("原子 <2 条 → 直接诚实空,不打模型", async () => {
    const resolveModelSpec = vi.fn();
    const out = await runKnowledgeRelate(
      ctx,
      { atoms: atoms.slice(0, 1) },
      { resolveModelSpec },
    );
    expect(out.candidates).toEqual([]);
    expect(resolveModelSpec).not.toHaveBeenCalled();
    expect(runStructuredNode).not.toHaveBeenCalled();
  });

  it("resolveModelSpec 失败向上抛(没配 key 诚实报错)", async () => {
    const resolveModelSpec = vi.fn().mockRejectedValue(new Error("无可用 LLM 凭据"));
    await expect(
      runKnowledgeRelate(ctx, { atoms }, { resolveModelSpec }),
    ).rejects.toThrow("无可用 LLM 凭据");
  });
});
