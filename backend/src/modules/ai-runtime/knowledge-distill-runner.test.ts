import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// T-1238：归一工具保持原合同；公共 runner 只向原持久任务端口提交。

import {
  runKnowledgeDistill,
  mergeDistillations,
  normalizeDistillation,
  truncateForDistill,
  DISTILL_CHUNK_CHARS,
  MAX_DISTILL_CONTENT_CHARS,
} from "./knowledge-distill-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };





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

describe("runKnowledgeDistill（受控任务端口）", () => {
  it("保留原响应形状并透传请求信号", {timeout:120_000,retry:0}, async () => {
    const output={ atoms: [{type: "claim", title: "候选", note: "", sourceNote: ""}], suggestedTags: [] }; const runKnowledgeGeneration=vi.fn(async()=>output),signal=new AbortController().signal;
    const input={ content: "原文" };
    expect(await runKnowledgeDistill(ctx, {...input,signal}, {runKnowledgeGeneration})).toEqual(output);
    expect(runKnowledgeGeneration).toHaveBeenCalledWith(ctx, {skillId:"knowledge.distill",inputData:input}, signal);
  });
  it("空输入不创建执行任务", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(); await expect(runKnowledgeDistill(ctx, { content: "   " }, {runKnowledgeGeneration})).rejects.toThrow(/原文为空/);
    expect(runKnowledgeGeneration).not.toHaveBeenCalled();
  });
  it("原任务失败向上透传，不在宿主绕过配置调用模型", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(async()=>{throw Error("原知识任务等待核对");});
    await expect(runKnowledgeDistill(ctx, { content: "原文" }, {runKnowledgeGeneration})).rejects.toThrow("原知识任务等待核对");
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
