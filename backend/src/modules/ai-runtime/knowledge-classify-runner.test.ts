import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// T-1238：归一工具保持原合同；公共 runner 只向原持久任务端口提交。

import {
  runKnowledgeClassify,
  normalizeClassification,
  truncateForClassify,
  MAX_CLASSIFY_CONTENT_CHARS,
} from "./knowledge-classify-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };





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

describe("runKnowledgeClassify（受控任务端口）", () => {
  it("保留原响应形状并透传请求信号", {timeout:120_000,retry:0}, async () => {
    const output={ knowledgeType: "note", title: "候选", tags: [], summary: "摘要" }; const runKnowledgeGeneration=vi.fn(async()=>output),signal=new AbortController().signal;
    const input={ content: "原文" };
    expect(await runKnowledgeClassify(ctx, {...input,signal}, {runKnowledgeGeneration})).toEqual(output);
    expect(runKnowledgeGeneration).toHaveBeenCalledWith(ctx, {skillId:"knowledge.classify",inputData:input}, signal);
  });
  it("空输入不创建执行任务", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(); await expect(runKnowledgeClassify(ctx, { content: "   " }, {runKnowledgeGeneration})).rejects.toThrow(/原文为空/);
    expect(runKnowledgeGeneration).not.toHaveBeenCalled();
  });
  it("原任务失败向上透传，不在宿主绕过配置调用模型", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(async()=>{throw Error("原知识任务等待核对");});
    await expect(runKnowledgeClassify(ctx, { content: "原文" }, {runKnowledgeGeneration})).rejects.toThrow("原知识任务等待核对");
  });
});
