import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

import {
  parseSuggestion,
  buildPositioningPrompt,
  normalizeSuggestion,
  positioningFacets,
  type WorksReader,
} from "./positioning-runner";
import {createPositioningGenerateBusinessAdapter} from "./calibration-positioning-business-adapters";
import type { CreativeContext } from "./creative-context";

const ctx: RequestContext = {
  userId: "u1",
  accountId: "acct-current",
  requestId: "r1",
  source: "user",
};

// A complete, valid suggestion (as a structured object). Mirrors the shape the runner
// records: {persona, field, audience, differentiation, capabilities[], oneLiner, keywords[3]}.
const VALID_OBJECT = {
  persona: "硬核 AI 科普人",
  field: "AI 工程",
  audience: "一线后端/算法开发者",
  differentiation: "把论文直接落成可跑的代码",
  capabilities: ["论文拆解", "工程化演示", "踩坑复盘"],
  oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
  keywords: ["论文", "代码", "工程化"],
};
const VALID_JSON = JSON.stringify(VALID_OBJECT);

function makeDeps(_object: Record<string, unknown>, works?: WorksReader) {
 return {deps:{
      // assembleCreativeContext reads getPositioningCenter (PositioningReader) and
      // list (AccountsReader); both degrade to "" on throw. These stubs feed the real
      // shapes so the brief assembles with positioning + 抖音账号 context.
      positioning: {
        getPositioningCenter: async () => ({
          profile: {
            persona: "现有人设",
            field: "现有领域",
            audience: "现有人群",
            differentiation: "现有差异化",
            capabilities: ["A", "B"],
          },
          currentStatement: {
            oneLiner: "现有一句话定位",
            keywords: ["关键A", "关键B", "关键C"],
          },
        }),
      } as never,
      accounts: {
        list: async () => [
          {
            platform: "douyin",
            accountHandle: "@老黄说AI",
            followerBaseline: 128000,
          },
        ],
      } as never,
      // [T-081②] 真实作品读端口(选填)—— 传入才注入 {{works}} facet。
      positioningWorks: works,
 }};
}

describe("parseSuggestion (tolerant JSON object parse — chat 文本兜底路径)", () => {
  it("parses a clean JSON object", () => {
    const s = parseSuggestion(VALID_JSON);
    expect(s).not.toBeNull();
    expect(s!.persona).toBe("硬核 AI 科普人");
    expect(s!.keywords).toEqual(["论文", "代码", "工程化"]);
    expect(s!.capabilities).toEqual(["论文拆解", "工程化演示", "踩坑复盘"]);
  });

  it("tolerates ``` fences and leading prose", () => {
    const wrapped = "好的，这是我的建议：\n```json\n" + VALID_JSON + "\n```\n希望有用。";
    const s = parseSuggestion(wrapped);
    expect(s).not.toBeNull();
    expect(s!.oneLiner).toContain("论文");
  });

  it("clamps keywords to exactly 3 (drops extras / pads when short)", () => {
    const s = parseSuggestion(
      JSON.stringify({ ...VALID_OBJECT, keywords: ["a", "b", "c", "d", "e"] }),
    );
    expect(s!.keywords).toHaveLength(3);
    expect(s!.keywords).toEqual(["a", "b", "c"]);
  });

  it("returns null on unparseable text", () => {
    expect(parseSuggestion("完全不是 JSON 的一段话")).toBeNull();
  });

  // [T-234] 硬约束透传:downstreamRules 5 键随提案归一;缺省/部分缺省 → 空串(诚实不编)。
  it("passes through downstreamRules (缺省键补空串)", () => {
    const s = parseSuggestion(
      JSON.stringify({
        ...VALID_OBJECT,
        downstreamRules: {
          topicRule: "只做 AI 工程实战题,不做行业八卦",
          forbidRule: "绝不贩卖焦虑",
        },
      }),
    );
    expect(s!.downstreamRules).toEqual({
      topicRule: "只做 AI 工程实战题,不做行业八卦",
      scriptRule: "",
      projectRule: "",
      forbidRule: "绝不贩卖焦虑",
      expressionRule: "",
    });
  });

  it("downstreamRules 整体缺省 → 全键空串(老输出不崩)", () => {
    const s = parseSuggestion(VALID_JSON);
    expect(s!.downstreamRules).toEqual({
      topicRule: "",
      scriptRule: "",
      projectRule: "",
      forbidRule: "",
      expressionRule: "",
    });
  });

  it("returns null when oneLiner + persona are both empty (no usable suggestion)", () => {
    expect(
      parseSuggestion(JSON.stringify({ persona: "", oneLiner: "", keywords: [] })),
    ).toBeNull();
  });

  it("[T-521] 定位 AI 返回动态作品计数时不再把它写回 statusNote", () => {
    const suggestion = normalizeSuggestion({
      ...VALID_OBJECT,
      facets: {
        statusNote: "80 条作品里有 49 条待审核",
      },
    } as never);

    expect(suggestion!.facets.statusNote).toBe("");
  });
});

describe("定位准备与候选投影",()=>{
 it("保持当前定位与抖音账号画像，不执行模型或写库",async()=>{
  const {deps}=makeDeps(VALID_OBJECT);const adapter=createPositioningGenerateBusinessAdapter(deps);
  const facets=await adapter.prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});
  expect(adapter.capability).toBe("positioning.generate");expect(facets.current).toContain("现有一句话定位");expect(facets.accounts).toContain("douyin");expect(facets.accounts).toContain("@老黄说AI");
  const suggestion=normalizeSuggestion(VALID_OBJECT as never);expect(suggestion?.persona).toBe("硬核 AI 科普人");expect(suggestion?.keywords).toEqual(["论文","代码","工程化"]);
 });
 it("没有定位仍可准备，current保留原兜底",async()=>{
  const {deps}=makeDeps(VALID_OBJECT);deps.positioning={getPositioningCenter:async()=>({profile:null,currentStatement:null})} as never;
  const facets=await createPositioningGenerateBusinessAdapter(deps).prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});expect(facets.current).toContain("尚未设置定位");
 });
});

// [T-081①②] buildPositioningPrompt 可选第二参:extraBrief(对话洞察,优先遵循)+ worksBrief
// (真实作品画像)—— chat 路径经此注入;零参调用行为不变(签名 additive)。
describe("buildPositioningPrompt — extraBrief / worksBrief 注入 (T-081)", () => {
  const makeContext = (over: Partial<CreativeContext> = {}): CreativeContext => ({
    positioningBrief: "定位一句话：把论文落成代码",
    learningsBrief: "",
    assetsBrief: "",
    userMaterialHardBrief: "",
    userMaterialRefBrief: "",
    userMaterialQueryTerms: [],
    accountsBrief: "· douyin | @硬核老王 | 粉丝 12000",
    signalsBrief: "",
    knowledgeBrief: "",
    thesisBrief: "",
    contractBrief: "",
    outlineBrief: "",
    orientationHint: "",
    projectBriefHard: "",
    benchmarkRefBrief: "",
    reviewTitle: "",
    reviewScript: "",
    reviewMetrics: "",
    reviewComments: "",
    topic: { title: "", angle: "" },
    projectId: null,
    ...over,
  });

  it("worksBrief 非空 → 注入只作证据的历史作品段", () => {
    const prompt = buildPositioningPrompt(makeContext(), {
      worksBrief: "· 上下文工程实战（已发布）\n· AI 编导流程（planning）",
    });
    expect(prompt).toContain("【历史作品证据（只说明过去发生了什么，不能替用户决定未来）】");
    expect(prompt).toContain("上下文工程实战（已发布）");
    expect(prompt).toContain("真实作品列表");
  });

  it("extraBrief 非空 → 注入【本次生成指令(来自对话,优先遵循)】段", () => {
    const prompt = buildPositioningPrompt(makeContext(), {
      extraBrief: "结合我实际发布的内容:观众要的是落地教程,定位收窄到 AI 落地",
    });
    expect(prompt).toContain("【本次生成指令（来自对话，优先遵循）】");
    expect(prompt).toContain("定位收窄到 AI 落地");
    expect(prompt).toContain("优先遵循上方本次生成指令");
  });

  it("零参调用行为不变:无新段落(空则整段省略)", () => {
    const prompt = buildPositioningPrompt(makeContext());
    expect(prompt).not.toContain("历史作品证据");
    expect(prompt).not.toContain("本次生成指令");
    // 原有 facet 仍在。
    expect(prompt).toContain("把论文落成代码");
    expect(prompt).toContain("@硬核老王");
  });

  it("空串/空白的 opts → 同零参(不注空噪声)", () => {
    const prompt = buildPositioningPrompt(makeContext(), {
      extraBrief: "  ",
      worksBrief: "",
    });
    expect(prompt).not.toContain("历史作品证据");
    expect(prompt).not.toContain("本次生成指令");
  });
});

describe("定位准备 — works facet 注入 (T-081②)", () => {
  it("[T-578] positioningWorks 按当前 account 读取已排序可见作品并原序注入", async () => {
    const longTitle =
      "这条标题其实是整篇口播文案,长到远超四十个字的展示上限,必须被截断后才能进定位提示词不然会爆";
    const listProjects = vi.fn(
      async (receivedCtx: RequestContext, opts: { limit: number; offset: number }) => {
        expect(receivedCtx.accountId).toBe("acct-current");
        expect(opts).toEqual({ limit: 100, offset: 0 });
        return {
          total: 2,
          rows: [
            {
              title: "最新可见作品",
              stage: "review",
              status: "completed",
              publishedAt: "2026-07-20T00:00:00.000Z",
            },
            {
              title: longTitle,
              stage: "review",
              status: "completed",
              publishedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        };
      },
    );
    const works: WorksReader = {
      listProjects,
    };
    const { deps } = makeDeps(VALID_OBJECT, works);
    const facets = await createPositioningGenerateBusinessAdapter(deps).prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});
    const rendered = facets.works ?? "";
    expect(facets.works).toContain("【历史作品证据（只说明过去发生了什么，不能替用户决定未来）】");
    expect(facets.works).toContain(`${longTitle.slice(0, 40)}…`);
    expect(facets.works).toContain("已发布");
    expect(rendered.indexOf("最新可见作品")).toBeLessThan(
      rendered.indexOf(longTitle.slice(0, 40)),
    );
  });

  it("positioningWorks 未装配 → facets.works 空串(facet 整段省略,老路径行为不变)", async () => {
    const { deps } = makeDeps(VALID_OBJECT);
    const facets = await createPositioningGenerateBusinessAdapter(deps).prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});
    expect(facets.works).toBe("");
  });

  it("works 读端口抛错 → facets.works 空串且生成不受阻(best-effort,候选照记)", async () => {
    const works: WorksReader = {
      listProjects: async () => {
        throw new Error("projects repo down");
      },
    };
    const { deps } = makeDeps(VALID_OBJECT, works);
    const facets = await createPositioningGenerateBusinessAdapter(deps).prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});
    expect(facets.works).toBe("");
  });

  it("works 端口返回空数据 → facets.works 诚实空串", async () => {
    const works: WorksReader = {
      listProjects: async () => ({ rows: [], total: 0 }),
    };
    const { deps } = makeDeps(VALID_OBJECT, works);
    const facets = await createPositioningGenerateBusinessAdapter(deps).prepare(ctx,{id:"t",projectId:null,retryOfTaskId:null,inputData:{},skillSnapshot:{} as never});
    expect(facets.works).toBe("");
  });
});

// [T-081②] positioningFacets 纯函数 —— works 段拼装口径(与对话链路 buildPositioningPrompt 同措辞)。
describe("positioningFacets — works 段拼装", () => {
  const context = {
    positioningBrief: "定位一句话:X",
    accountsBrief: "",
  } as CreativeContext;

  it("worksBrief 非空 → 拼段头整块;空/空白 → 空串", () => {
    expect(positioningFacets(context, "· 作品A（已发布）").works).toBe(
      "\n\n【历史作品证据（只说明过去发生了什么，不能替用户决定未来）】\n· 作品A（已发布）",
    );
    expect(positioningFacets(context).works).toBe("");
    expect(positioningFacets(context, "  ").works).toBe("");
  });
});
