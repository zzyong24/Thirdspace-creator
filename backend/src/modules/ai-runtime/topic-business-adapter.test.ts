import { describe, it, expect, vi } from "vitest";
import {createChatBusinessGenerationPreparation} from "./chat-business-generation-preparation";
import {
  createTopicGenerateBusinessAdapter,
  prepareTopicGenerateContext,
  topicAdditionalCalls,
} from "./topic-business-adapter";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
const now = () => "2026-09-05T00:00:00.000Z";
const base = {
  positioning: {
    getPositioningCenter: async () => ({
      profile: null,
      currentStatement: { oneLiner: "定位", keywords: [] },
    }),
  },
  knowledge: {
    list: async () => [
      { title: "知识事实", knowledgeType: "evidence", createdAt: now() },
    ],
  },
  signals: {
    list: async () => [
      { source: "comment", rawText: "怎么操作？", demandTag: null },
      { source: "comment", rawText: "666", demandTag: null },
    ],
  },
  learnings: {
    getSuggestions: async () => [{ title: "经验", insight: "经验事实" }],
  },
  now,
};
const task = (basis: string) => ({ projectId: null, inputData: { basis } });
describe("topic纯准备", () => {
  it.each(["positioning", "comments", "knowledge", "trend"])(
    "四依据 %s 保留真实上下文和质量画像，不执行网络模型",
    async (basis) => {
      const listEnabledSources = vi.fn(async () => [
        {
          id: "s",
          name: "真实源",
          url: "https://example.com/news",
          domain: "example.com",
          sourceType: "web" as const,
        },
      ]);
      const frozen = await prepareTopicGenerateContext(ctx, task(basis), {
        ...base,
        sourceReader: { listEnabledSources },
      });
      expect(frozen.context.positioningBrief).toContain("定位");
      expect(frozen.context.knowledgeBrief).toContain("知识事实");
      expect(frozen.context.learningsBrief).toContain("经验事实");
      expect(frozen.qualityNow).toBe(now());
      expect(frozen.qualityProfile.trend).toEqual({
        sourceCount: 0,
        signalCount: 0,
      });
      expect(frozen.qualityProfile.knowledge.recentRatio).toBe(1);
      if (basis === "comments") {
        expect(frozen.basisBrief).toContain("怎么操作");
        expect(frozen.basisBrief).not.toContain("[comment] 666");
        expect(frozen.basisBrief).toContain("1 条噪声评论");
      }
      if (basis === "knowledge")
        expect(frozen.basisBrief).toContain("知识事实");
      expect(listEnabledSources).toHaveBeenCalledTimes(
        basis === "trend" ? 1 : 0,
      );
    },
  );
  it("项目ID冲突和归属失败均在任何来源读取前拒绝", async () => {
    const listEnabledSources = vi.fn(async () => []);
    const assertProject = vi.fn(async () => {
      throw new Error("归属拒绝");
    });
    const deps = {
      ...base,
      sourceReader: { listEnabledSources },
      assertProject,
    };
    await expect(
      prepareTopicGenerateContext(
        ctx,
        { projectId: "p", inputData: { basis: "trend", projectId: "other" } },
        deps,
      ),
    ).rejects.toThrow();
    await expect(
      prepareTopicGenerateContext(
        ctx,
        { projectId: "p", inputData: { basis: "trend" } },
        deps,
      ),
    ).rejects.toThrow("归属拒绝");
    expect(listEnabledSources).not.toHaveBeenCalled();
  });
  it("来源读取失败诚实空；没有project port不绕过项目校验", async () => {
    const result = await prepareTopicGenerateContext(ctx, task("trend"), {
      ...base,
      sourceReader: {
        listEnabledSources: async () => {
          throw Error("offline");
        },
      },
    });
    expect(result.trendSources).toEqual([]);
    await expect(
      prepareTopicGenerateContext(ctx, { projectId: "p", inputData: {} }, base),
    ).rejects.toThrow();
  });
});

const skillSnapshot = {
  snapshotVersion: 1 as const,
  userId: "u",
  accountId: "a",
  resolvedAt: now(),
  platformPolicyVersion: "1",
  platformPolicy: "候选",
  skills: [
    {
      skillId: "topic.generate",
      baseVersion: "1",
      overlayRevision: null,
      overlayVersion: null,
      effective: {
        methodSystem: "",
        template: "",
        tools: [],
        requiredFacets: [],
        contextRequirements: [],
        outputSchema: { type: "object" },
        completionPolicy: null,
        completionPolicyAdapter: null,
      },
    },
  ],
};
describe("topic候选投影", () => {
  it("冻结输入消费共享schema和归一，保留真实评论、评分与候选类型", async () => {
    const adapter = createTopicGenerateBusinessAdapter(base);
    const facets = await adapter.prepare(ctx, {
      ...task("comments"),
      id: "t",
      retryOfTaskId: null,
      skillSnapshot,
    });
    const execution = {
      frozenInput: {
        kind: "model.structured",
        operationKey: "topic.generate",
        skillId: "topic.generate",
        capability: "topic.generate",
        maxOutputTokens: 100,
        skillSnapshot,
        facets,
      },
    };
    const result = adapter.project(
      { basis: "forged" },
      {
        topics: [
          {
            title: "  真实标题  ",
            angle: "切入",
            contentRole: "trust",
            source: "demand",
            predictedScore: 3,
            reason: "理由",
            sourceComments: ["怎么操作？", "怎么操作？", ""],
          },
        ],
      },
      execution,
    );
    expect(result).toEqual({
      resultType: "candidate_list",
      resultData: {
        items: [
          {
            title: "真实标题",
            angle: "切入",
            contentRole: "trust",
            source: "demand",
            predictedScore: 3,
            reason: "理由",
            sourceComments: ["怎么操作？"],
          },
        ],
      },
    });
    expect(() => adapter.project({}, { topics: [] }, execution)).toThrow(
      "至少返回一条",
    );
    expect(() =>
      adapter.project(
        {},
        { topics: [{ title: "正常" }] },
        { frozenInput: { ...execution.frozenInput, facets: {} } },
      ),
    ).toThrow();
  });
  it("缺省依据保留positioning，输入projectId验证后进入冻结", async () => {
    const assertProject = vi.fn(async () => {});
    const result = await prepareTopicGenerateContext(
      ctx,
      { projectId: null, inputData: { basis: "invalid", projectId: "p" } },
      { ...base, assertProject },
    );
    expect(result.basis).toBe("positioning");
    expect(result.projectId).toBe("p");
    expect(assertProject).toHaveBeenCalledWith(ctx, "p");
  });
});

it("trend纯prepare即使附带旧模型/搜索依赖也不执行，冻结定位供Worker派生query", async () => {
  const trendSearch = vi.fn(async () => {
    throw Error("不得联网");
  });
  const resolveModelSpec = vi.fn(async () => {
    throw Error("不得解析模型");
  });
  const deps = { ...base, trendSearch, resolveModelSpec };
  const result = await prepareTopicGenerateContext(ctx, task("trend"), deps);
  expect(result.context.positioningBrief).toContain("定位");
  expect(result.basisBrief).toBe("");
  expect(result.trendSources).toEqual([]);
  expect(trendSearch).not.toHaveBeenCalled();
  expect(resolveModelSpec).not.toHaveBeenCalled();
});

it('必要调用容量只由冻结来源计数，普通定位0、trend搜索加web抽取或rss读取',async()=>{
 const adapter=createTopicGenerateBusinessAdapter({...base,sourceReader:{listEnabledSources:async()=>[{id:'w',name:'网页',url:'https://example.com',domain:'example.com',sourceType:'web'},{id:'r',name:'RSS',url:'https://example.com/feed',domain:'example.com',sourceType:'rss'}]}});
 const makeTask=(basis:string)=>({...task(basis),id:'t',retryOfTaskId:null,skillSnapshot});
 expect(topicAdditionalCalls(await adapter.prepare(ctx,makeTask('positioning')))).toBe(0);
 expect(topicAdditionalCalls(await adapter.prepare(ctx,makeTask('trend')))).toBe(4);
});

it("T-957 助手给子任务的建议不冒充优先用户指令",async()=>{
 const business=createChatBusinessGenerationPreparation({...base,assertProject:async()=>{},readTrend:vi.fn()});
 const prepared=await business.prepareTopic(ctx,{basis:"positioning",extraBrief:"生成八条，我曾踩过算法串台"});
 expect(prepared.facets.basisContext).toContain("助手建议（不是用户原话或已核实事实）");
 expect(prepared.facets.basisContext).not.toContain("本次生成指令");
});
