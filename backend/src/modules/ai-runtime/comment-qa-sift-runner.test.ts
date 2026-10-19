import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// T-1238：归一工具保持原合同；公共 runner 只向原持久任务端口提交。

import {
  runCommentQaSift,
  normalizeQaCandidates,
  buildCommentsFacet,
  type SiftCommentInput,
} from "./comment-qa-sift-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };


const comments: SiftCommentInput[] = [
  { signalId: "sig-1", rawText: "本地模型怎么装?", likeCount: 57 },
  { signalId: "sig-2", rawText: "求本地部署教程", likeCount: 31 },
  { signalId: "sig-3", rawText: "显存不够能跑吗", likeCount: null },
];



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

describe("runCommentQaSift（受控任务端口）", () => {
  it("保留原响应形状并透传请求信号", {timeout:120_000,retry:0}, async () => {
    const output={ candidates: [] }; const runKnowledgeGeneration=vi.fn(async()=>output),signal=new AbortController().signal;
    const input={ comments };
    expect(await runCommentQaSift(ctx, {...input,signal}, {runKnowledgeGeneration})).toEqual(output);
    expect(runKnowledgeGeneration).toHaveBeenCalledWith(ctx, {skillId:"comment.qa-sift",inputData:input}, signal);
  });
  it("空输入不创建执行任务", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(); expect(await runCommentQaSift(ctx, { comments: [] }, {runKnowledgeGeneration})).toEqual({candidates: []});
    expect(runKnowledgeGeneration).not.toHaveBeenCalled();
  });
  it("原任务失败向上透传，不在宿主绕过配置调用模型", {timeout:120_000,retry:0}, async () => {
    const runKnowledgeGeneration=vi.fn(async()=>{throw Error("原知识任务等待核对");});
    await expect(runCommentQaSift(ctx, { comments }, {runKnowledgeGeneration})).rejects.toThrow("原知识任务等待核对");
  });
});
