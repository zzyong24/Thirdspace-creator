import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// T-1238：归一工具保持原合同；公共 runner 只向原持久任务端口提交。

import {
  runKnowledgeRelate,
  normalizeRelateCandidates,
  buildAtomsFacet,
  MAX_RELATE_ATOMS,
  type RelateAtomInput,
} from "./knowledge-relate-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };


const atoms: RelateAtomInput[] = [
  { id: "k-1", knowledgeType: "claim", title: "上下文工程是核心", sourceNote: null },
  { id: "k-2", knowledgeType: "evidence", title: "实测截断不降准确率", sourceNote: "亲测" },
  { id: "k-3", knowledgeType: "quote", title: "把模型当同事", sourceNote: null },
];



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

describe("runKnowledgeRelate（受控任务端口）", () => {
  it("保留原响应形状并透传请求信号", {timeout:120_000,retry:0}, async () => {
    const output={ candidates: [] }; const runKnowledgeGeneration=vi.fn(async()=>output),signal=new AbortController().signal;
    const input={ atoms };
    expect(await runKnowledgeRelate(ctx, {...input,signal}, {runKnowledgeGeneration})).toEqual(output);
    expect(runKnowledgeGeneration).toHaveBeenCalledWith(ctx, {skillId:"knowledge.relate",inputData:input}, signal);
  });
  it("空输入不创建执行任务", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(); expect(await runKnowledgeRelate(ctx, { atoms: atoms.slice(0, 1) }, {runKnowledgeGeneration})).toEqual({candidates: []});
    expect(runKnowledgeGeneration).not.toHaveBeenCalled();
  });
  it("原任务失败向上透传，不在宿主绕过配置调用模型", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(async()=>{throw Error("原知识任务等待核对");});
    await expect(runKnowledgeRelate(ctx, { atoms }, {runKnowledgeGeneration})).rejects.toThrow("原知识任务等待核对");
  });
});
