import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// [T-271] 制作封面链 runner 单测。runner 内 `await import("@creatoros/ai-worker")` 取:
//   - runStructuredNode(封面**文案方案**结构化生成)—— 桩住,返回固定 object;
//   - generateImage(封面**图**生成)—— 桩住,返回固定 bytes(不打真 provider);
//   - modelFor / getTemplate —— 桩;
//   - buildGroundingHaystack / annotateUngroundedClaims —— 用**真实**实现(纯叶子,importActual),
//     让**封面文案诚实门**在 runner 里真跑,单测能断言未溯源标注真被追加、可溯的不误标。
// assembleCreativeContext 是静态 import(非 ai-worker)→ 真跑,读注入的 brief/reviewSubject fake。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
const generateImage = vi.fn(async () => ({ assetBytes: new Uint8Array([1, 2, 3]) }));

vi.mock("@creatoros/ai-worker", async () => {
  const actual = await vi.importActual<typeof import("@creatoros/ai-worker")>(
    "@creatoros/ai-worker",
  );
  return {
    modelFor: vi.fn(() => ({}) as never),
    runStructuredNode,
    getTemplate: (id: string) => ({ id }),
    buildGroundingHaystack: actual.buildGroundingHaystack,
    annotateUngroundedClaims: actual.annotateUngroundedClaims,
    generateImage,
  };
});

import {
  runCoverGenerate,
  composeCoverImagePrompt,
  clampCoverPlan,
  COVER_KEYPOINTS_MAX,
} from "./cover-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

interface PlanObject {
  headline?: string;
  subheadline?: string;
  keyPoints?: string[];
  visualConcept?: string;
  composition?: string;
  palette?: string;
}

function makeDeps(
  planObject: PlanObject,
  opts: {
    reviewScript?: string;
    brief?: Record<string, unknown>;
    resolveImageThrows?: boolean;
    noBytes?: boolean;
  } = {},
) {
  runStructuredNode.mockResolvedValue({ object: planObject } as never);
  generateImage.mockClear();
  generateImage.mockResolvedValue({
    assetBytes: opts.noBytes ? new Uint8Array() : new Uint8Array([1, 2, 3]),
  } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        assetId?: string | null;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const recordStep = vi.fn(async () => undefined);
  const cancelTask = vi.fn(async () => undefined);
  const createGeneratedAsset = vi.fn(
    async (
      _c: RequestContext,
      input: {
        assetType: "image";
        name: string;
        bytes: Uint8Array;
        mimeType: string;
      },
    ) => ({ id: "asset-cover-1", name: input.name, assetType: input.assetType }),
  );
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  const resolveMultimodalSpec = vi.fn(async () => {
    if (opts.resolveImageThrows) {
      throw new Error('capability "image.generate" 未配置生图模型');
    }
    return {
      provider: "fake",
      baseUrl: null,
      model: "image-01",
      token: "k",
      kind: "image" as const,
    };
  });
  const deps: Record<string, unknown> = {
    ai: {
      markRunning: vi.fn(async () => undefined),
      recordCandidate,
      recordStep,
      cancelTask,
    },
    // assembleCreativeContext 读 PositioningReader(空定位诚实降级为空串)。
    positioning: {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    },
    resolveModelSpec,
    resolveMultimodalSpec,
    registry: {},
    generatedAssets: { createGeneratedAsset },
  };
  if (opts.reviewScript !== undefined) {
    // reviewSubject.getScript 读口播稿 → context.reviewScript → coverFacets.scriptClaim。
    deps.reviewSubject = {
      getTitle: async () => "",
      getScript: async () => opts.reviewScript,
      getMetricsSummary: async () => "",
      getComments: async () => [],
    };
  }
  if (opts.brief) {
    deps.brief = { getBriefDetail: async () => opts.brief };
  }
  return {
    deps: deps as never,
    recordCandidate,
    recordStep,
    cancelTask,
    resolveModelSpec,
    resolveMultimodalSpec,
    createGeneratedAsset,
  };
}

const FULL_PLAN: PlanObject = {
  headline: "别再囤工具了",
  subheadline: "真正稀缺的是判断力",
  keyPoints: ["先想清楚", "再动手"],
  visualConcept: "一个人站在堆满工具的房间里发呆",
  composition: "主体居中偏下,主标题占上 1/3",
  palette: "高对比暖色、大字号无衬线",
};

describe("[T-271] runCoverGenerate —— 结构化封面方案 + 文案诚实门 + 结构化组装生图", () => {
  it("产结构化封面方案 → 结构化组装生图 prompt → 记 generated_asset 候选(带 coverPlan)", async () => {
    const { deps, recordCandidate, resolveModelSpec, resolveMultimodalSpec, createGeneratedAsset } =
      makeDeps(FULL_PLAN);
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    // 文案方案走文本模型 copy.generate;封面图走多模态 image.generate(模型可配)。
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "copy.generate");
    expect(resolveMultimodalSpec).toHaveBeenCalledWith(ctx, "image.generate");
    // 生图 prompt 由结构化方案确定性组装(含主视觉/构图/封面文案),不是裸自由文本。
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { prompt: string },
      unknown,
    ];
    const imagePrompt = imgCall[1].prompt;
    expect(imagePrompt).toContain("主视觉");
    expect(imagePrompt).toContain("一个人站在堆满工具的房间里发呆");
    expect(imagePrompt).toContain("别再囤工具了"); // 封面文案叠加到画面
    expect(createGeneratedAsset).toHaveBeenCalledTimes(1);
    // 候选:generated_asset(复用既有采纳门)+ 结构化封面方案回传前端渲染。
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("generated_asset");
    expect(input.assetId).toBe("asset-cover-1");
    const coverPlan = input.resultData.coverPlan as { headline: string; keyPoints: string[] };
    expect(coverPlan.headline).toContain("别再囤工具了");
    expect(coverPlan.keyPoints).toEqual(["先想清楚", "再动手"]);
  });

  it("硬注入立项 brief(核心信息/内容形式)+ 口播稿主张进封面方案生成上下文", async () => {
    const { deps } = makeDeps(FULL_PLAN, {
      brief: {
        coreMessage: "纪律是最后的护城河",
        contentFormat: "口播 + 分镜",
      },
      reviewScript: "这条口播稿的主张是:工具越多越焦虑,纪律才是护城河。",
    });
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    const lastCall = runStructuredNode.mock.calls.at(-1) as unknown as [
      { facets: Record<string, string | undefined> },
    ];
    const facets = lastCall[0].facets;
    // 立项硬锚:核心信息 = 封面必须承载的钦定主张。
    expect(facets.projectBriefHard).toContain("纪律是最后的护城河");
    // 口播稿主张进上下文(封面要与正片说同一件事)。
    expect(facets.scriptClaim).toContain("工具越多越焦虑");
  });

  it("用户画面要求同时进入封面策划 Skill 与最终生图 prompt，并写入候选诊断", async () => {
    const { deps, recordCandidate } = makeDeps(FULL_PLAN);
    await runCoverGenerate(
      ctx,
      {
        id: "t1",
        projectId: "p1",
        inputData: {
          visualRequirements: "画面里要有一把剪刀切断混乱流程，人物在右侧，不要电脑",
        },
      },
      deps,
    );
    const lastCall = runStructuredNode.mock.calls.at(-1) as unknown as [
      { facets: Record<string, string | undefined> },
    ];
    expect(lastCall[0].facets.userVisualRequirements).toContain("剪刀切断混乱流程");
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { prompt: string },
      unknown,
    ];
    expect(imgCall[1].prompt).toContain("用户明确画面要求（硬约束");
    expect(imgCall[1].prompt).toContain("人物在右侧，不要电脑");
    expect(recordCandidate.mock.calls[0]![2].resultData.visualRequirements).toBe(
      "画面里要有一把剪刀切断混乱流程，人物在右侧，不要电脑",
    );
  });

  it("未传用户画面要求时不注入空白硬约束块，保持旧 prompt", async () => {
    const { deps } = makeDeps(FULL_PLAN);
    await runCoverGenerate(ctx, { id: "t1", projectId: "p1", inputData: {} }, deps);
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { prompt: string },
      unknown,
    ];
    expect(imgCall[1].prompt).not.toContain("用户明确画面要求（硬约束）");
  });

  it("封面文案诚实门:headline 含语料里没有的编造数字 → coverPlan 追加未溯源标注(原文保留)", async () => {
    // 口播稿/brief 里都没有「月入 10 万」——封面自创的成绩数字,应被标注未溯源。
    const { deps, recordCandidate } = makeDeps(
      { ...FULL_PLAN, headline: "靠这招月入10万" },
      { reviewScript: "这条讲的是选题方法,没有任何收入数字。" },
    );
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    const input = recordCandidate.mock.calls[0]![2];
    const coverPlan = input.resultData.coverPlan as { headline: string };
    expect(coverPlan.headline).toContain("月入10万"); // 原文不删
    expect(coverPlan.headline).toContain("未溯源"); // 追加诚实标注
    expect((input.resultData.ungroundedClaims as string[]).length).toBeGreaterThan(0);
  });

  it("封面文案诚实门:数字能在口播稿溯源 → 不误标(可溯的不加⚠️)", async () => {
    const { deps, recordCandidate } = makeDeps(
      { ...FULL_PLAN, headline: "3个方法立刻能用" },
      { reviewScript: "正片给了 3个方法:先定选题、再搭结构、最后打磨钩子。" },
    );
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    const input = recordCandidate.mock.calls[0]![2];
    const coverPlan = input.resultData.coverPlan as { headline: string };
    expect(coverPlan.headline).toBe("3个方法立刻能用"); // 可溯 → 原样,不标注
    expect((input.resultData.ungroundedClaims as string[]).length).toBe(0);
  });

  it("未配生图模型(resolveMultimodalSpec 抛错)→ cancelTask,不落候选(诚实终态)", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(FULL_PLAN, {
      resolveImageThrows: true,
    });
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("生图返回空 bytes → cancelTask,不落候选", async () => {
    const { deps, recordCandidate, cancelTask } = makeDeps(FULL_PLAN, {
      noBytes: true,
    });
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("provider 明确返回可重试 503 时使用同一幂等键短重试，不重复生成封面方案", async () => {
    const made = makeDeps(FULL_PLAN);
    const structuredCallsBefore = runStructuredNode.mock.calls.length;
    const explicit503 = Object.assign(new Error("HTTP 503"), {
      status: 503,
      stage: "submit",
      retryable: true,
    });
    generateImage
      .mockRejectedValueOnce(explicit503)
      .mockResolvedValueOnce({ assetBytes: new Uint8Array([1, 2, 3]) } as never);
    const sleep = vi.fn(async () => undefined);
    (made.deps as Record<string, unknown>).sleep = sleep;

    await runCoverGenerate(
      ctx,
      { id: "t-503", projectId: "p1", inputData: {} },
      made.deps,
    );

    expect(runStructuredNode.mock.calls.length - structuredCallsBefore).toBe(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const imageCalls = generateImage.mock.calls as unknown as Array<[
      unknown,
      { idempotencyKey?: string },
      unknown,
    ]>;
    const firstOptions = imageCalls[0]?.[1] as {
      idempotencyKey?: string;
    };
    const secondOptions = imageCalls[1]?.[1] as {
      idempotencyKey?: string;
    };
    expect(firstOptions.idempotencyKey).toBeTruthy();
    expect(secondOptions.idempotencyKey).toBe(firstOptions.idempotencyKey);
    expect(made.recordCandidate).toHaveBeenCalledTimes(1);
    expect(made.cancelTask).not.toHaveBeenCalled();
  });

  // ── [T-380] 以图生图风格参考 ────────────────────────────────────────────
  it("inputData.referenceAssetId → host 端口读素材字节 → referenceImage 喂进 generateImage", async () => {
    const made = makeDeps(FULL_PLAN);
    const getAssetBytes = vi.fn(async () => ({
      bytes: new Uint8Array([5, 6, 7]),
      mimeType: "image/png",
    }));
    (made.deps as Record<string, unknown>).referenceAssets = { getAssetBytes };
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: { referenceAssetId: "asset-ref-1" } },
      made.deps,
    );
    expect(getAssetBytes).toHaveBeenCalledWith(ctx, "asset-ref-1");
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { referenceImage?: { bytes: Uint8Array; mimeType: string } },
      unknown,
    ];
    expect(imgCall[1].referenceImage).toEqual({
      bytes: new Uint8Array([5, 6, 7]),
      mimeType: "image/png",
    });
    // 步骤流注记「已读取参考封面」(诚实观测)。
    const stepTexts = made.recordStep.mock.calls.map(
      (c) => (c as unknown as [unknown, unknown, { text: string }])[2].text,
    );
    expect(stepTexts.some((t) => t.includes("参考封面"))).toBe(true);
    expect(made.recordCandidate).toHaveBeenCalledTimes(1);
    const candidate = made.recordCandidate.mock.calls[0]![2];
    expect(candidate.resultData.referenceImage).toEqual({
      requestedAssetId: "asset-ref-1",
      status: "used",
      used: true,
    });
  });

  it("referenceAssetId 读不到(null)→ 诚实降级纯文生图 + 步骤注记「未使用参考图」,不失败", async () => {
    const made = makeDeps(FULL_PLAN);
    const getAssetBytes = vi.fn(async () => null);
    (made.deps as Record<string, unknown>).referenceAssets = { getAssetBytes };
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: { referenceAssetId: "asset-gone" } },
      made.deps,
    );
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { referenceImage?: unknown },
      unknown,
    ];
    expect(imgCall[1].referenceImage).toBeUndefined();
    const stepTexts = made.recordStep.mock.calls.map(
      (c) => (c as unknown as [unknown, unknown, { text: string }])[2].text,
    );
    expect(stepTexts.some((t) => t.includes("未使用参考图"))).toBe(true);
    // 降级不阻断:候选照记,任务不 cancel。
    expect(made.recordCandidate).toHaveBeenCalledTimes(1);
    expect(made.cancelTask).not.toHaveBeenCalled();
    const candidate = made.recordCandidate.mock.calls[0]![2];
    expect(candidate.resultData.referenceImage).toEqual({
      requestedAssetId: "asset-gone",
      status: "not_used",
      used: false,
    });
  });

  it("无 referenceAssetId → 不读端口、generateImage 不带 referenceImage(零回归)", async () => {
    const made = makeDeps(FULL_PLAN);
    const getAssetBytes = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    }));
    (made.deps as Record<string, unknown>).referenceAssets = { getAssetBytes };
    await runCoverGenerate(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      made.deps,
    );
    expect(getAssetBytes).not.toHaveBeenCalled();
    const imgCall = generateImage.mock.calls.at(-1) as unknown as [
      unknown,
      { referenceImage?: unknown },
      unknown,
    ];
    expect(imgCall[1].referenceImage).toBeUndefined();
  });
});

describe("[T-271] composeCoverImagePrompt —— 生图 prompt 由结构化 facet 确定性组装", () => {
  it("从结构化方案字段拼画面(主视觉/构图/封面文案/色调),非裸自由文本", () => {
    const prompt = composeCoverImagePrompt(
      clampCoverPlan({
        headline: "别再囤工具了",
        subheadline: "判断力才稀缺",
        keyPoints: ["先想清楚"],
        visualConcept: "堆满工具的房间",
        composition: "主体居中偏下",
        palette: "暖色高对比",
      }),
      { orientation: "竖屏" },
    );
    expect(prompt).toContain("主视觉：堆满工具的房间");
    expect(prompt).toContain("构图：主体居中偏下");
    expect(prompt).toContain("主标题「别再囤工具了」");
    expect(prompt).toContain("副标题「判断力才稀缺」");
    expect(prompt).toContain("色调风格：暖色高对比");
    expect(prompt).toContain("竖版短视频封面（9:16）"); // 竖屏 → 9:16
    expect(prompt).toContain("第一眼看懂");
    expect(prompt).toContain("只保留一个主视觉冲突或关系");
    expect(prompt).toContain("除指定封面文案外，不生成任何额外文字");
    expect(prompt).toContain("无水印、无无关 logo");
  });

  it("横屏 → 16:9;无方向 → 通用封面(画幅自适应)", () => {
    const land = composeCoverImagePrompt(clampCoverPlan({ headline: "x" }), {
      orientation: "横屏",
    });
    expect(land).toContain("横版封面（16:9）");
    const none = composeCoverImagePrompt(clampCoverPlan({ headline: "x" }), {});
    expect(none).toContain("短视频封面");
    expect(none).not.toContain("9:16");
    expect(none).not.toContain("16:9");
  });
});

describe("[T-271] clampCoverPlan —— 封面文案裁到封面可用长度", () => {
  it("超长 headline 截断、keyPoints 去空 + 封顶条数", () => {
    const clamped = clampCoverPlan({
      headline: "这是一个非常非常非常非常非常长的封面主标题会被裁掉尾巴",
      keyPoints: ["a", "  ", "b", "c", "d", "e"],
    });
    expect(clamped.headline.length).toBeLessThanOrEqual(20);
    expect(clamped.keyPoints).not.toContain("  ");
    expect(clamped.keyPoints.length).toBeLessThanOrEqual(COVER_KEYPOINTS_MAX);
  });
});
