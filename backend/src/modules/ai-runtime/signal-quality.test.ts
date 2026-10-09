import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  isStrongSignal,
  isNoiseSignal,
  splitCommentSignals,
  formatFilteredSignalsBrief,
  buildSignalQualityProfile,
  renderSignalQualityBrief,
} from "./signal-quality";
import { workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import type { ZodType } from "zod";
import { modelFor, registerAllTemplates, getTemplate, runWithEffectiveSkillSnapshot } from "@creatoros/ai-worker";
import { runTopicWorkerPipeline } from "../../../../ai-worker/src/execution/topic-worker-pipeline";
import { topicGenerateFrozenSchema } from "../../../../ai-worker/src/execution/topic-worker-input";
const { structuredNode, qualityObservation } = vi.hoisted(() => ({
 qualityObservation: vi.fn<(trend: {sourceCount:number;signalCount:number})=>void>(),
 structuredNode: vi.fn<(input: {facets: Record<string,string>; outputSchema: ZodType}) => Promise<{object: unknown}>>(),
}));
vi.mock("../../../../ai-worker/src/nodes/structured-node", () => ({runStructuredNode: structuredNode}));
vi.mock("../../../../ai-worker/src/nodes/topic-signal-quality", async original => {
 const actual=await original<typeof import("../../../../ai-worker/src/nodes/topic-signal-quality")>();
 return {...actual,renderSignalQualityBrief:(profile:Parameters<typeof actual.renderSignalQualityBrief>[0])=>{
  qualityObservation(profile.trend);return actual.renderSignalQualityBrief(profile);
 }};
});
beforeEach(() => {
 registerAllTemplates();
 structuredNode.mockReset();qualityObservation.mockReset();
 structuredNode.mockImplementation(async input => ({object: input.outputSchema.parse({topics: [{title: "真实计数选题"}]})}));
});
async function readActualTrendQuality(populated: boolean) {
 const qualityProfile=buildSignalQualityProfile({signals:[],positioning:null,knowledge:[],trend:{sourceCount:0,signalCount:0},nowIso:"2026-10-09T00:00:00.000Z"});
 const input=topicGenerateFrozenSchema.parse({version:1,basis:"trend",projectId:null,context:{positioningBrief:"真实定位",knowledgeBrief:"",learningsBrief:""},qualityNow:"2026-10-09T00:00:00.000Z",qualityInputs:{signals:[],positioning:null,knowledge:[]},qualityProfile,basisBrief:"",trendSources:[
  {id:"source-a",name:"来源甲",url:"https://source-a.example/feed",domain:"source-a.example",sourceType:"rss"},
  {id:"source-b",name:"来源乙",url:"https://source-b.example/feed",domain:"source-b.example",sourceType:"rss"},
 ]});
 const template=getTemplate("topic.generate");
 await runWithEffectiveSkillSnapshot(workerSkillSnapshotSchema.parse({snapshotVersion:1,userId:"quality-owner",accountId:"quality-account",resolvedAt:input.qualityNow,platformPolicyVersion:"fixture-policy",platformPolicy:"真实计数边界",skills:[{
  skillId:template.id,baseVersion:template.version,overlayRevision:null,overlayVersion:null,
  effective:{methodSystem:template.system,template:template.template,tools:template.tools,requiredFacets:template.requiredFacets,contextRequirements:template.contextRequirements??[],outputSchema:null,completionPolicy:null,completionPolicyAdapter:null},
 }]}),()=>runTopicWorkerPipeline(input,{
  model:modelFor({apiFormat:"openai_chat",baseUrl:"http://127.0.0.1:1",model:"fixture",token:"fixture"}),
  signal:new AbortController().signal,maxOutputTokens:1000,
  read:async target=>{
   if(target.kind==="search")return {kind:"search",results:populated?Array.from({length:4},(_,i)=>({title:`搜索${i}`,url:`https://search.example/${i}`,snippet:"真实搜索摘要"})):[]};
   const source=input.trendSources.find(item=>item.id===target.sourceId);
   if(!source)throw Error("来源不在真实冻结输入中");
   return {kind:"rss",sourceUrl:source.url,title:source.name,text:populated?`<rss><channel>${Array.from({length:3},(_,i)=>`<item><title>条目${i}</title><link>${source.url}/${i}</link></item>`).join("")}</channel></rss>`:"<rss><channel/></rss>"};
  },
 }));
 expect(structuredNode).toHaveBeenCalledTimes(1);
 expect(qualityObservation).toHaveBeenCalledTimes(1);
 return {trend:qualityObservation.mock.calls[0]![0],brief:structuredNode.mock.calls[0]![0].facets.signalQuality};
}
import type { SignalRow } from "./creative-context";

// [T-238] 信号质量画像纯函数测试:评论强信号/噪声启发式、各源边界(空/满)、画像渲染、
// 滤噪 brief。画像 = 确定性可测;AI 判断只吃渲染出的段(不在此测模型行为)。

const sig = (rawText: string, extra?: Partial<SignalRow>): SignalRow => ({
  source: "comment",
  rawText,
  demandTag: null,
  ...extra,
});

describe("isStrongSignal(问题/诉求启发式)", () => {
  it.each([
    "这个用什么软件做的?",
    "怎么把逐字稿导出来",
    "为什么我的号没流量",
    "求教程!",
    "一个月能赚多少",
    "有没有适合新手的路线",
    "能不能出一期讲剪辑的",
  ])("含问题/诉求 → 强信号:%s", (text) => {
    expect(isStrongSignal(text)).toBe(true);
  });

  it("纯夸赞/灌水不算强信号", () => {
    expect(isStrongSignal("太棒了")).toBe(false);
    expect(isStrongSignal("666")).toBe(false);
  });
});

describe("isNoiseSignal(666/纯 emoji/夸赞)", () => {
  it.each(["666", "6666666", "😂😂😂", "👍", "太美了", "好看!", "牛逼", "哈哈哈哈", "支持支持", "加油!!"])(
    "噪声:%s",
    (text) => {
      expect(isNoiseSignal(text)).toBe(true);
    },
  );

  it("含问题的评论即使短也不算噪声(强信号优先)", () => {
    expect(isNoiseSignal("好看!用的什么软件?")).toBe(false);
  });

  it("有实质内容的长评论不算噪声", () => {
    expect(isNoiseSignal("我照着这条做了三天,涨了两千粉,但是评论区开始吵起来了")).toBe(
      false,
    );
  });
});

describe("splitCommentSignals / formatFilteredSignalsBrief(强信号过滤)", () => {
  const rows = [
    sig("666"),
    sig("怎么起号?", { demandTag: "起号" }),
    sig("太美了"),
    sig("我按这个方法试了一周,确实有效"),
    sig("😂😂"),
  ];

  it("三分:强信号/normal/噪声", () => {
    const { strong, normal, noise } = splitCommentSignals(rows);
    expect(strong.map((s) => s.rawText)).toEqual(["怎么起号?"]);
    expect(normal.map((s) => s.rawText)).toEqual([
      "我按这个方法试了一周,确实有效",
    ]);
    expect(noise).toHaveLength(3);
  });

  it("噪声不进 brief;强信号带 ★ 排前;末尾带滤噪说明", () => {
    const brief = formatFilteredSignalsBrief(rows);
    expect(brief).toContain("★强信号 [comment] (起号) 怎么起号?");
    expect(brief).toContain("我按这个方法试了一周");
    // 噪声条目本体不进 brief(滤噪说明行的「666/纯表情/纯夸赞」字样除外)
    expect(brief).not.toContain("· [comment] 666");
    expect(brief).not.toContain("太美了");
    expect(brief).toContain("另有 3 条噪声评论");
    // 强信号行在 normal 行之前
    expect(brief.indexOf("怎么起号")).toBeLessThan(brief.indexOf("试了一周"));
  });

  it("全是噪声 → 空串(整段省略,不注空壳)", () => {
    expect(formatFilteredSignalsBrief([sig("666"), sig("👍")])).toBe("");
  });

  it("空输入 → 空串", () => {
    expect(formatFilteredSignalsBrief([])).toBe("");
  });
});

describe("buildSignalQualityProfile(各源边界)", () => {
  it("全空输入 → 全零画像(诚实,不编)", () => {
    const p = buildSignalQualityProfile({
      signals: [],
      positioning: null,
      knowledge: [],
      trend: { sourceCount: 0, signalCount: 0 },
    });
    expect(p.comments).toEqual({
      count: 0,
      coveredWorks: 0,
      strongSignalRatio: 0,
      noiseRatio: 0,
    });
    expect(p.positioning.filledFacets).toBe(0);
    expect(p.positioning.completeness).toBe(0);
    expect(p.knowledge).toEqual({ count: 0, recentRatio: null });
    expect(p.trend).toEqual({ sourceCount: 0, signalCount: 0 });
  });

  it("评论:条数/覆盖作品(distinct publicationId)/强信号占比/噪声占比(用户实录:5 条覆盖 1 作品半数 666)", () => {
    const p = buildSignalQualityProfile({
      signals: [
        sig("666", { publicationId: "pub-1" }),
        sig("666!", { publicationId: "pub-1" }),
        sig("太好看了", { publicationId: "pub-1" }),
        sig("怎么弄的?", { publicationId: "pub-1" }),
        sig("我也遇到过这个问题,后来换了个思路", { publicationId: null }),
      ],
      positioning: null,
      knowledge: [],
      trend: { sourceCount: 0, signalCount: 0 },
    });
    expect(p.comments.count).toBe(5);
    expect(p.comments.coveredWorks).toBe(1);
    expect(p.comments.strongSignalRatio).toBeCloseTo(1 / 5);
    expect(p.comments.noiseRatio).toBeCloseTo(3 / 5);
  });

  it("定位:9 facets + 5 规则计数;完整画像 → completeness 高", () => {
    const p = buildSignalQualityProfile({
      signals: [],
      positioning: {
        profile: {
          persona: "工程师老张",
          field: "AI 工程",
          audience: "开发者",
          differentiation: "只讲跑通过的",
          capabilities: ["编码"],
          facets: {
            contentScope: "AI 工具实测",
            avoid: "不聊八卦",
            corePain: "学了不会用",
            coreValue: "抄作业级教程",
            tone: "直接",
          },
          downstreamRules: { topicRule: "选题贴痛点", forbidRule: "不编数据" },
        },
        currentStatement: { oneLiner: "x", keywords: [] },
      },
      knowledge: [],
      trend: { sourceCount: 0, signalCount: 0 },
    });
    expect(p.positioning.filledFacets).toBe(9);
    expect(p.positioning.totalFacets).toBe(9);
    expect(p.positioning.rulesFilled).toBe(2);
    expect(p.positioning.completeness).toBe(1);
  });

  it("知识:count + 近 30 天占比;读源不带 createdAt → recentRatio=null(诚实「未知」)", () => {
    const now = "2026-07-11T00:00:00.000Z";
    const withDates = buildSignalQualityProfile({
      signals: [],
      positioning: null,
      knowledge: [
        { title: "a", knowledgeType: "claim", createdAt: "2026-07-01T00:00:00.000Z" },
        { title: "b", knowledgeType: "claim", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      trend: { sourceCount: 0, signalCount: 0 },
      nowIso: now,
    });
    expect(withDates.knowledge.count).toBe(2);
    expect(withDates.knowledge.recentRatio).toBeCloseTo(0.5);

    const noDates = buildSignalQualityProfile({
      signals: [],
      positioning: null,
      knowledge: [{ title: "a", knowledgeType: "claim" }],
      trend: { sourceCount: 0, signalCount: 0 },
      nowIso: now,
    });
    expect(noDates.knowledge.count).toBe(1);
    expect(noDates.knowledge.recentRatio).toBeNull();
  });
});

describe("当前topic Worker热点画像指标派生", () => {
  it("distinct 信源名 + web 搜索算一路(有命中才算)", async () => {
    const {brief,trend}=await readActualTrendQuality(true);
    expect(trend).toEqual({sourceCount:3,signalCount:10});
    expect(brief).toContain("热点信号:10 条(来自 3 路信源)");
    expect(brief).toContain("多源佐证");
  });
  it("两路全空 → 0/0", async () => {
    const {brief,trend}=await readActualTrendQuality(false);
    expect(trend).toEqual({sourceCount:0,signalCount:0});
    expect(brief).toContain("热点信号:本次未拉到实时信号");
    expect(brief).toContain("不要声称候选基于实时热榜");
    expect(brief).not.toContain("多源佐证");
  });
});

describe("renderSignalQualityBrief(依据质量说明段)", () => {
  it("用户实录场景:评论少+噪声高+覆盖窄 → 降权提示;定位完整 → 当骨架", () => {
    const brief = renderSignalQualityBrief(
      buildSignalQualityProfile({
        signals: [
          sig("666", { publicationId: "p1" }),
          sig("666", { publicationId: "p1" }),
          sig("好看", { publicationId: "p1" }),
          sig("怎么做到的?", { publicationId: "p1" }),
          sig("学到了,谢谢分享这个思路", { publicationId: "p1" }),
        ],
        positioning: {
          profile: {
            persona: "p",
            field: "f",
            audience: "a",
            differentiation: "d",
            capabilities: [],
            facets: {
              contentScope: "s",
              avoid: "v",
              corePain: "c",
              coreValue: "cv",
              tone: "t",
            },
          },
          currentStatement: null,
        },
        knowledge: [],
        trend: { sourceCount: 0, signalCount: 0 },
      }),
    );
    expect(brief).toContain("【依据质量画像");
    expect(brief).toContain("共 5 条");
    expect(brief).toContain("覆盖 1 个作品");
    expect(brief).toContain("样本少");
    expect(brief).toContain("噪声高");
    expect(brief).toContain("只取 ★强信号");
    expect(brief).toContain("完整度 9/9");
    expect(brief).toContain("当出题骨架");
    expect(brief).toContain("知识库:空");
    expect(brief).toContain("不要声称候选基于实时热榜");
  });

  it("全空画像也恒非空(让模型知道依据有多薄)", () => {
    const brief = renderSignalQualityBrief(
      buildSignalQualityProfile({
        signals: [],
        positioning: null,
        knowledge: [],
        trend: { sourceCount: 0, signalCount: 0 },
      }),
    );
    expect(brief).toContain("评论信号:无");
    expect(brief).toContain("定位:未设置");
  });

  it("多源热点 → 证据密度可;新鲜度未知如实标注", () => {
    const brief = renderSignalQualityBrief(
      buildSignalQualityProfile({
        signals: [],
        positioning: null,
        knowledge: [{ title: "a", knowledgeType: "claim" }],
        trend: { sourceCount: 3, signalCount: 12 },
      }),
    );
    expect(brief).toContain("12 条(来自 3 路信源)");
    expect(brief).toContain("多源佐证");
    expect(brief).toContain("新鲜度未知");
  });
});
