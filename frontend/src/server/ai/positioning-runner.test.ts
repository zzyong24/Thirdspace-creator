import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 定位生成 runner 迁 runStructuredNode(T-025b 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象,9 字段定位提案)。
// runner 解析 model(resolveModelSpec)→ runStructuredNode 拿 object → normalizeSuggestion +
// recordCandidate。这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、
// 候选被记录、归一逻辑(keywords 夹 3 / capabilities 清洗)仍按约定产出;退化对象 → 不记录 + cancel。
const runStructuredNode = vi.fn(
  async (_input: {
    model: unknown;
    template: { id: string };
    facets: Record<string, string | undefined>;
  }) => ({ object: {} as Record<string, unknown> }),
);
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
  getTemplate: (id: string) => ({ id }),
}));

import {
  runPositioningGenerate,
  parseSuggestion,
  buildPositioningPrompt,
  positioningFacets,
  type PositioningSuggestion,
  type WorksReader,
} from "./positioning-runner";
import type { CreativeContext } from "./creative-context";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

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

function makeDeps(object: Record<string, unknown>, works?: WorksReader) {
  runStructuredNode.mockResolvedValue({ object } as never);
  const markRunning = vi.fn(async () => undefined);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        resultData: { suggestion: PositioningSuggestion };
      },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  return {
    deps: {
      ai: { markRunning, recordCandidate, cancelTask } as never,
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
      works,
      resolveModelSpec,
    },
    markRunning,
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
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

  it("returns null when oneLiner + persona are both empty (no usable suggestion)", () => {
    expect(
      parseSuggestion(JSON.stringify({ persona: "", oneLiner: "", keywords: [] })),
    ).toBeNull();
  });
});

describe("runPositioningGenerate (runStructuredNode + 外置模板)", () => {
  it("resolves positioning.generate and records a positioning_profile candidate", async () => {
    const { deps, recordCandidate, markRunning, resolveModelSpec } =
      makeDeps(VALID_OBJECT);
    await runPositioningGenerate(ctx, { id: "t1", inputData: {} }, deps);

    expect(markRunning).toHaveBeenCalledWith(ctx, "t1");
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "positioning.generate");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    // runStructuredNode 被喂进 positioning.generate 模板 + 装配好的 facets(current 兜底非空)。
    const call = runStructuredNode.mock.calls[0]![0];
    expect(call.template.id).toBe("positioning.generate");
    // 定位现状 + 抖音账号画像都进了 facets(current / accounts)。
    expect(call.facets.current).toContain("现有一句话定位");
    expect(call.facets.accounts).toContain("douyin");
    expect(call.facets.accounts).toContain("@老黄说AI");

    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const [, taskId, payload] = recordCandidate.mock.calls[0]!;
    expect(taskId).toBe("t1");
    expect(payload.resultType).toBe("positioning_profile");
    expect(payload.resultData.suggestion.persona).toBe("硬核 AI 科普人");
    expect(payload.resultData.suggestion.keywords).toEqual(["论文", "代码", "工程化"]);
  });

  it("degrades gracefully when the creator has NO positioning yet (current facet 兜底)", async () => {
    const { deps, recordCandidate } = makeDeps(VALID_OBJECT);
    // 覆盖 positioning reader 成空 → assembleCreativeContext 产空 brief → current 走兜底文案。
    (deps as { positioning: unknown }).positioning = {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    } as never;

    await runPositioningGenerate(ctx, { id: "t3", inputData: {} }, deps);
    const call = runStructuredNode.mock.calls.at(-1)![0];
    expect(call.facets.current).toContain("尚未设置定位");
    expect(recordCandidate).toHaveBeenCalledTimes(1);
  });

  it("cancels the task (no candidate) when the object normalizes to no usable suggestion", async () => {
    // 合法但退化的结构化对象(persona + oneLiner 均空)→ normalizeSuggestion 返回 null → guard → cancel。
    const { deps, recordCandidate, cancelTask } = makeDeps({
      persona: "",
      oneLiner: "",
      keywords: [],
    });
    await runPositioningGenerate(ctx, { id: "t4", inputData: {} }, deps);
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t4");
  });

  it("cancels the task gracefully (no throw) when runStructuredNode throws", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(VALID_OBJECT);
    runStructuredNode.mockRejectedValueOnce(new Error("结构化节点:未得到合 schema 的对象"));
    // Must not throw out of the background runner — it swallows + cancels.
    await expect(
      runPositioningGenerate(ctx, { id: "t5", inputData: {} }, deps),
    ).resolves.toBeUndefined();
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledWith(ctx, "t5");
  });
});

// [T-081①②] buildPositioningPrompt 可选第二参:extraBrief(对话洞察,优先遵循)+ worksBrief
// (真实作品画像)—— chat 路径经此注入;零参调用行为不变(签名 additive)。
describe("buildPositioningPrompt — extraBrief / worksBrief 注入 (T-081)", () => {
  const makeContext = (over: Partial<CreativeContext> = {}): CreativeContext => ({
    positioningBrief: "定位一句话：把论文落成代码",
    learningsBrief: "",
    assetsBrief: "",
    accountsBrief: "· douyin | @硬核老王 | 粉丝 12000",
    signalsBrief: "",
    knowledgeBrief: "",
    thesisBrief: "",
    contractBrief: "",
    outlineBrief: "",
    orientationHint: "",
    reviewTitle: "",
    reviewScript: "",
    reviewMetrics: "",
    reviewComments: "",
    topic: { title: "", angle: "" },
    projectId: null,
    ...over,
  });

  it("worksBrief 非空 → 注入【我的真实作品(定位必须扎根于此)】段", () => {
    const prompt = buildPositioningPrompt(makeContext(), {
      worksBrief: "· 上下文工程实战（已发布）\n· AI 编导流程（planning）",
    });
    expect(prompt).toContain("【我的真实作品（定位必须扎根于此）】");
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
    expect(prompt).not.toContain("我的真实作品");
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
    expect(prompt).not.toContain("我的真实作品");
    expect(prompt).not.toContain("本次生成指令");
  });
});

// [T-081②] 后台 task 路径的真实作品画像注入 —— runPositioningGenerate 经 deps.works 读作品,
// formatWorksBrief 压缩后进模板 {{works}} facet(与对话链路同一口径);未装配/读失败 → 空 facet
// (诚实降级,不阻断生成)。runStructuredNode 已 mock,直接断言它收到的 facets。
describe("runPositioningGenerate — works facet 注入 (T-081②)", () => {
  const lastFacets = () =>
    (
      runStructuredNode.mock.calls.at(-1)![0] as {
        facets: Record<string, string | undefined>;
      }
    ).facets;

  it("deps.works 装配 → facets.works 带【我的真实作品】段(截 40 字 + 发布状态标记)", async () => {
    const longTitle =
      "这条标题其实是整篇口播文案,长到远超四十个字的展示上限,必须被截断后才能进定位提示词不然会爆";
    const works: WorksReader = {
      listProjects: async () => ({
        total: 2,
        rows: [
          {
            title: longTitle,
            stage: "publishing",
            status: "published",
            publishedAt: "2026-06-01",
          },
          { title: "AI 编导流程", stage: "planning", status: "active", publishedAt: null },
        ],
      }),
    };
    const { deps, recordCandidate } = makeDeps(VALID_OBJECT, works);
    await runPositioningGenerate(ctx, { id: "tw1", inputData: {} }, deps);
    const facets = lastFacets();
    expect(facets.works).toContain("【我的真实作品（定位必须扎根于此）】");
    expect(facets.works).toContain(`${longTitle.slice(0, 40)}…`);
    expect(facets.works).toContain("（已发布）");
    expect(facets.works).toContain("AI 编导流程（planning）");
    expect(recordCandidate).toHaveBeenCalled();
  });

  it("deps.works 未装配 → facets.works 空串(facet 整段省略,老路径行为不变)", async () => {
    const { deps } = makeDeps(VALID_OBJECT);
    await runPositioningGenerate(ctx, { id: "tw2", inputData: {} }, deps);
    expect(lastFacets().works).toBe("");
  });

  it("works 读端口抛错 → facets.works 空串且生成不受阻(best-effort,候选照记)", async () => {
    const works: WorksReader = {
      listProjects: async () => {
        throw new Error("projects repo down");
      },
    };
    const { deps, recordCandidate, cancelTask } = makeDeps(VALID_OBJECT, works);
    await runPositioningGenerate(ctx, { id: "tw3", inputData: {} }, deps);
    expect(lastFacets().works).toBe("");
    expect(recordCandidate).toHaveBeenCalled();
    expect(cancelTask).not.toHaveBeenCalled();
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
      "\n\n【我的真实作品（定位必须扎根于此）】\n· 作品A（已发布）",
    );
    expect(positioningFacets(context).works).toBe("");
    expect(positioningFacets(context, "  ").works).toBe("");
  });
});
