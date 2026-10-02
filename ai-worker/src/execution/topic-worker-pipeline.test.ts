import { beforeEach, describe, it, expect, vi } from "vitest";
import { GenerationFailure } from "./generation-error";
import { emptyTopicWorkspaceConfig } from "@creatoros/contract";
import type { TopicGenerateFrozen } from "./topic-worker-input";
const { node } = vi.hoisted(() => ({ node: vi.fn() }));
vi.mock("../nodes/structured-node", () => ({ runStructuredNode: node }));
vi.mock("../prompt/effective-skill-runtime", () => ({
  getEffectiveTemplate: (id: string) => ({ id }),
}));
import {
  runTopicWorkerPipeline,
  type TopicReadData,
  type TopicReadTarget,
} from "./topic-worker-pipeline";
const model = {} as never;
function input(
  basis: TopicGenerateFrozen["basis"] = "trend",
): TopicGenerateFrozen {
  return {
    version: 1,
    basis,
    projectId: null,
    context: {
      positioningBrief: "真实定位",
      knowledgeBrief: "真实知识",
      learningsBrief: "真实经验",
    },
    qualityNow: "2026-09-05T00:00:00.000Z",
    qualityInputs: { signals: [], positioning: null, knowledge: [] },
    qualityProfile: {
      comments: {
        count: 0,
        coveredWorks: 0,
        strongSignalRatio: 0,
        noiseRatio: 0,
      },
      positioning: {
        filledFacets: 0,
        totalFacets: 9,
        rulesFilled: 0,
        completeness: 0,
      },
      knowledge: { count: 0, recentRatio: null },
      trend: { sourceCount: 0, signalCount: 0 },
    },
    basisBrief: "冻结依据",
    trendSources: [],
  };
}
function deps(
  read: (target: TopicReadTarget) => Promise<TopicReadData | null> = vi.fn(
    async () => null,
  ),
  signal = new AbortController().signal,
) {
  return { model, signal, read, maxOutputTokens: 321, timeoutMs: 2000 };
}
beforeEach(() => {
  node.mockReset();
  node.mockImplementation(async (arg) => ({
    object: arg.outputSchema.parse({ topics: [{ title: "真实选题" }] }),
  }));
});
describe("topic Worker纯流水线（非fork）", () => {
  it.each(["positioning", "comments", "knowledge", "trend"] as const)(
    "依据%s仅最终一次模型，无额外planner",
    async (basis) => {
      const d = deps();
      await runTopicWorkerPipeline(input(basis), d);
      expect(node).toHaveBeenCalledTimes(1);
      expect(d.read).toHaveBeenCalledTimes(basis === "trend" ? 1 : 0);
      expect(node.mock.calls[0]![0]).toMatchObject({
        template: { id: "topic.generate" },
        model,
        maxOutputTokens: 321,
        timeoutMs: 2000,
        signal: d.signal,
      });
    },
  );
  it("搜索+网页正文+RSS原文经真实解析和提取进入最终依据，画像替换零值", async () => {
    const raw = input();
    raw.trendSources = [
      {
        id: "web",
        name: "网页源",
        url: "https://news.example/page",
        domain: "news.example",
        sourceType: "web",
      },
      {
        id: "rss",
        name: "RSS源",
        url: "https://rss.example/feed",
        domain: "rss.example",
        sourceType: "rss",
      },
    ];
    const read = vi.fn(
      async (target: {
        kind: string;
        sourceId?: string;
      }): Promise<TopicReadData> =>
        target.kind === "search"
          ? {
              kind: "search",
              results: [
                {
                  title: "真实搜索标题",
                  url: "https://search.example/story",
                  snippet: "真实搜索摘要",
                },
              ],
            }
          : target.sourceId === "web"
            ? {
                kind: "web",
                sourceUrl: "https://news.example/page",
                title: "网页标题",
                text: "原始网页全文，供真实抽取使用",
              }
            : {
                kind: "rss",
                sourceUrl: "https://rss.example/feed",
                title: "RSS",
                text: '<rss version="2.0"><channel><item><title>真实RSS标题</title><link>https://rss.example/story</link><description>RSS正文</description></item></channel></rss>',
              },
    );
    node.mockImplementation(async (arg) => ({
      object: arg.outputSchema.parse(
        arg.template.id === "trend.extract"
          ? {
              signals: [
                {
                  title: "网页抽取信号",
                  url: "https://news.example/story",
                  heat: null,
                  publishedAt: null,
                },
              ],
            }
          : { topics: [{ title: "最终选题" }] },
      ),
    }));
    await runTopicWorkerPipeline(raw, deps(read));
    expect(read.mock.calls.map((c) => c[0])).toEqual([
      { kind: "search" },
      { kind: "source", sourceId: "web" },
      { kind: "source", sourceId: "rss" },
    ]);
    expect(node).toHaveBeenCalledTimes(2);
    expect(node.mock.calls[0]![0].facets).toEqual({
      sourceName: "网页源",
      pageText: "原始网页全文，供真实抽取使用",
    });
    const facets = node.mock.calls[1]![0].facets;
    for (const value of [
      "真实搜索标题",
      "真实搜索摘要",
      "网页抽取信号",
      "真实RSS标题",
      "网页源",
      "RSS源",
    ])
      expect(facets.basisContext).toContain(value);
    expect(facets.signalQuality).toContain("3 条(来自 3 路信源)");
    expect(facets.knowledgeRef).toContain("真实知识");
    expect(facets.learningsConstraint).toContain("真实经验");
  });
  it("空源保留诚实热点降级并继续一次出题", async () => {
    const d = deps();
    await runTopicWorkerPipeline(input(), d);
    expect(node.mock.calls[0]![0].facets.signalQuality).toContain(
      "本次未拉到实时信号",
    );
    expect(node.mock.calls[0]![0].facets.basisContext).toBe("");
  });
  it.each([
    new GenerationFailure("unknown_result", "UNKNOWN"),
    new GenerationFailure("failed", "BUDGET_EXHAUSTED"),
    new GenerationFailure("waiting_user", "NEEDS_LOGIN"),
  ])("读取明确停止$ errorCode不再模型", async (error) => {
    const d = deps(
      vi.fn(async () => {
        throw error;
      }),
    );
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toBe(error);
    expect(node).not.toHaveBeenCalled();
  });
  it.each([
    new GenerationFailure("unknown_result", "UNKNOWN"),
    new GenerationFailure("failed", "BUDGET_EXHAUSTED"),
    new GenerationFailure("waiting_user", "NEEDS_LOGIN"),
  ])("提取停止$errorCode不进入最终模型", async (error) => {
    const raw = input();
    raw.trendSources = [
      {
        id: "s",
        name: "源",
        url: "https://example.com",
        domain: "example.com",
        sourceType: "web",
      },
    ];
    node.mockRejectedValue(error);
    const d = deps(
      vi.fn(async () => ({
        kind: "web" as const,
        sourceUrl: "https://example.com",
        title: "源",
        text: "正文",
      })),
    );
    await expect(runTopicWorkerPipeline(raw, d)).rejects.toBe(error);
    expect(node).toHaveBeenCalledTimes(1);
  });
  it("已取消不可发出首次读取", async () => {
    const controller = new AbortController();
    controller.abort();
    const d = deps(undefined, controller.signal);
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toThrow();
    expect(d.read).not.toHaveBeenCalled();
    expect(node).not.toHaveBeenCalled();
  });
  it("读取完成同时取消，不再抽取或最终生成", async () => {
    const controller = new AbortController();
    const d = deps(
      vi.fn(async () => {
        controller.abort();
        return null;
      }),
      controller.signal,
    );
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toThrow();
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(node).not.toHaveBeenCalled();
  });
  it("已确认结构错误只跳过该源，普通未知异常不得降级", async () => {
    const raw = input();
    raw.trendSources = [
      {
        id: "s",
        name: "源",
        url: "https://example.com",
        domain: "example.com",
        sourceType: "web",
      },
    ];
    const read = vi.fn(async () => ({
      kind: "web" as const,
      sourceUrl: "https://example.com",
      title: "源",
      text: "正文",
    }));
    node.mockRejectedValueOnce(new Error("结构化节点: schema失败"));
    await runTopicWorkerPipeline(raw, deps(read));
    expect(node).toHaveBeenCalledTimes(2);
    node.mockReset();
    const error = new Error("transport lost");
    node.mockRejectedValue(error);
    await expect(runTopicWorkerPipeline(raw, deps(read))).rejects.toBe(error);
    expect(node).toHaveBeenCalledTimes(1);
  });
  it("最终空输出使用真实schema拒绝", async () => {
    node.mockImplementation(async (arg) => ({
      object: arg.outputSchema.parse({ topics: [] }),
    }));
    await expect(
      runTopicWorkerPipeline(input("positioning"), deps()),
    ).rejects.toThrow("至少返回一条");
    expect(node).toHaveBeenCalledTimes(1);
  });
});
it('daily定位依据仍搜读热点，拼接冻结评论且仅最终一次生成',async()=>{
 const raw={...input('positioning'),mode:'daily',basisBrief:'冻结受众真实评论'};
 const read=vi.fn(async():Promise<TopicReadData>=>({kind:'search',results:[{title:'实际热点',url:'https://example.com',snippet:'热点正文'}]}));
 await runTopicWorkerPipeline(raw,deps(read));expect(read).toHaveBeenCalledTimes(1);expect(node).toHaveBeenCalledTimes(1);const facets=node.mock.calls[0]![0].facets;expect(facets.basisContext).toContain('【受众评论信号】\n冻结受众真实评论');expect(facets.basisContext).toContain('实际热点');expect(facets.basisHint).toContain('围绕定位');expect(facets.signalQuality).toContain('1 条(来自 1 路信源)');
});
it('daily热点未知立即停止，不以定位依据绕过',async()=>{const error=new GenerationFailure('unknown_result','UNKNOWN');await expect(runTopicWorkerPipeline({...input('positioning'),mode:'daily',basisBrief:''},deps(vi.fn(async()=>{throw error})))).rejects.toBe(error);expect(node).not.toHaveBeenCalled();});
it('daily仍执行网页抽取再最终生成，保留评论与抽取事实',async()=>{
 const raw={...input('positioning'),mode:'daily' as const,basisBrief:'每日真实评论',trendSources:[{id:'web',name:'每日源',url:'https://example.com',domain:'example.com',sourceType:'web' as const}]};
 const read=vi.fn(async(target:TopicReadTarget):Promise<TopicReadData|null>=>target.kind==='search'?null:{kind:'web',sourceUrl:'https://example.com',title:'每日页',text:'每日网页原始全文'});
 node.mockImplementation(async(arg)=>({object:arg.outputSchema.parse(arg.template.id==='trend.extract'?{signals:[{title:'每日网页事实',url:'https://example.com',heat:null,publishedAt:null}]}:{topics:[{title:'每日结果'}]})}));
 await runTopicWorkerPipeline(raw,deps(read));expect(node).toHaveBeenCalledTimes(2);expect(node.mock.calls[0]![0].facets.pageText).toBe('每日网页原始全文');expect(node.mock.calls[1]![0].facets.basisContext).toContain('每日真实评论');expect(node.mock.calls[1]![0].facets.basisContext).toContain('每日网页事实');
});

it('每日quota跳过必须冻结实际达到配额的计数',async()=>{const {dailyTopicInputSchema}=await import('./topic-worker-input');const value={jobId:'j',jobRunId:'r',dayKey:'2026-09-05',dailyLimit:3,preferences:[],rankingNow:'2026-09-05T00:00:00.000Z',skipReason:'quota'};expect(()=>dailyTopicInputSchema.parse(value)).toThrow('实际已满计数');expect(()=>dailyTopicInputSchema.parse({...value,observedCount:2})).toThrow();expect(dailyTopicInputSchema.parse({...value,observedCount:3}).observedCount).toBe(3);});

describe('观众任务规划与真实读取回执',()=>{
 it('公开规划保留允许的格子，不暴露私有作者/来源；来源失败仍生成研究候选',async()=>{
  const raw=input();
  raw.audienceTaskContext={version:2,positioningVersionId:null,rejected:[],config:{...emptyTopicWorkspaceConfig(),audience:'小白',audienceGrid:[{id:'allowed',text:'把录屏变成教程',position:0,basis:'私人索引',version:2,evidence:'hypothesis',sourceRefs:['author'],publicQueryAllowed:true},{id:'private-cell',text:'私有业务内容',version:1,basis:'',evidence:'hypothesis',sourceRefs:[],publicQueryAllowed:false}],authorMaterials:[{id:'author',text:'秘密作者数据',sourceRef:'secret-path',projectId:null,contextRef:null,entryVerification:null,result:null}]}};
  raw.trendSources=[{id:'denied',name:'受限源',url:'https://example.org',domain:'example.org',sourceType:'web'}];
  node.mockImplementation(async(arg)=>({object:arg.template.id==='topic.query-plan'?{query:'录屏 教程 方法',rationale:'公开任务'}:{topics:[{title:'乱录屏变教程'}],sourceReads:[{id:'denied',status:'success'}]}}));
  const read=vi.fn(async(target:TopicReadTarget):Promise<TopicReadData>=>target.kind==='source'?{kind:'error',code:'NEEDS_LOGIN'}:{kind:'search',results:[]});
  const result=await runTopicWorkerPipeline(raw,deps(read));
  const planner=node.mock.calls[0]![0].facets.publicTaskContext;
  expect(planner).toContain('把录屏变成教程');
  for(const secret of ['秘密作者数据','secret-path','私有业务内容','私人索引'])expect(planner).not.toContain(secret);
  expect(read.mock.calls[0]![0]).toEqual({kind:'search',query:'录屏 教程 方法',allowPartial:true});
  expect(result.object).toMatchObject({sourceReads:[{id:'denied',status:'permission_denied'},{id:'web-search',status:'partial'}]});
 });
});
