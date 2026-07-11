import { describe, it, expect, vi } from "vitest";
import type { Tool } from "ai";
import {
  buildChatTools,
  allChatTools,
  ALL_CHAT_TOOL_NAMES,
  clampContextLimit,
  clampExtraBrief,
  clampDistillContent,
  MAX_DISTILL_TOOL_CONTENT_CHARS,
  compactTitle,
  knowledgeRelevanceScore,
  truncateDetailText,
  DETAIL_TEXT_PREVIEW_CHARS,
  readTextWindow,
  clampWindowMaxChars,
  TEXT_WINDOW_DEFAULT_MAX_CHARS,
  TEXT_WINDOW_CAP_CHARS,
  type ChatToolDeps,
} from "./chat-tools";

// 首波工具单测(SPEC §3.4 / §7「工具 execute 复用 runner 产候选」+「tools 挂载」)。
// 不真跑模型:注入 fake 的 generateTopics / enrichTopic,断言
//   1) 白名单过滤:只挂 skill 白名单里、且本切片已实现的工具;
//   2) execute 复用注入的 runner 核心,返回**候选**(非实体)。

function makeDeps(over: Partial<ChatToolDeps> = {}): {
  deps: ChatToolDeps;
  generateTopics: ReturnType<typeof vi.fn>;
  enrichTopic: ReturnType<typeof vi.fn>;
  captureScreenshot: ReturnType<typeof vi.fn>;
  readWeb: ReturnType<typeof vi.fn>;
  dispatchGenerateAsset: ReturnType<typeof vi.fn>;
  dispatchScriptReview: ReturnType<typeof vi.fn>;
  diagnoseContent: ReturnType<typeof vi.fn>;
  analyzeReview: ReturnType<typeof vi.fn>;
  generatePositioning: ReturnType<typeof vi.fn>;
  distillKnowledge: ReturnType<typeof vi.fn>;
  getProjectBrief: ReturnType<typeof vi.fn>;
  listProjects: ReturnType<typeof vi.fn>;
  listComments: ReturnType<typeof vi.fn>;
  searchKnowledge: ReturnType<typeof vi.fn>;
  searchMaterials: ReturnType<typeof vi.fn>;
  getProjectDetail: ReturnType<typeof vi.fn>;
  getPositioningDetail: ReturnType<typeof vi.fn>;
  getKnowledgeDetail: ReturnType<typeof vi.fn>;
  listProjectArtifacts: ReturnType<typeof vi.fn>;
  getArtifactText: ReturnType<typeof vi.fn>;
  getKnowledgeText: ReturnType<typeof vi.fn>;
  listPublications: ReturnType<typeof vi.fn>;
  getMetrics: ReturnType<typeof vi.fn>;
  listLearnings: ReturnType<typeof vi.fn>;
  listCandidates: ReturnType<typeof vi.fn>;
  getPredictions: ReturnType<typeof vi.fn>;
} {
  const generateTopics = vi.fn(async () => [
    {
      title: "反直觉开头",
      angle: "用数据打破直觉",
      contentRole: "traffic",
      // [T-149] 出题渠道透传给工具结果 → 采纳落成候选 source(此例评论依据 → demand)。
      source: "demand",
      predictedScore: 80,
      reason: "评论反复问",
      // [T-066] 基于评论出题贴原始评论 —— 工具结果透传给候选卡渲「依据评论」。
      sourceComments: ["博主,反直觉的开头到底怎么写?求教"],
    },
  ]);
  const enrichTopic = vi.fn(async () => ({
    oneLiner: "一句话",
    targetAudience: "一线开发者",
    audiencePain: "落不了地",
    coreConflict: "看懂≠会用",
    hook: "前 3 秒抛结果",
    contentStructure: ["问题", "方案", "落地"],
    format: "口播",
    materialBasis: "现成 demo",
    riskNote: "同质化",
    proposal: "做",
    audiencePainScore: 70,
    materialScore: 60,
    productionDifficulty: "mid" as const,
  }));
  const diagnoseContent = vi.fn(async () => ({
    dimensions: [{ key: "hook", score: 4, reason: "强", suggestion: "保持" }],
    verdict: "可发",
    mainIssues: ["结尾弱"],
    priorityFixes: ["加 CTA"],
  }));
  const analyzeReview = vi.fn(async () => ({
    items: [{ title: "前3秒给结果", insight: "完播更高" }],
    error: null,
  }));
  const generatePositioning = vi.fn(async () => ({
    persona: "硬核工程师",
    field: "AI 工程",
    audience: "一线开发者",
    differentiation: "可运行代码",
    capabilities: ["论文拆解"],
    oneLiner: "把论文落成代码",
    keywords: ["代码", "论文", "落地"],
  }));
  const listProjects = vi.fn(async () => ({
    total: 1,
    rows: [
      {
        id: "proj-1",
        title: "上下文工程",
        stage: "planning",
        status: "active",
        publishedAt: null,
      },
    ],
  }));
  const listComments = vi.fn(async () => ({
    total: 1,
    rows: [
      {
        text: "求带,怎么入门",
        likeCount: 12,
        source: "comment",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  }));
  const searchKnowledge = vi.fn(async () => [
    { id: "kn-1", title: "RAG 实战", snippet: "检索增强要点" },
  ]);
  const searchMaterials = vi.fn(async () => [
    { id: "as-1", title: "封面图 A", kind: "image" },
  ]);
  // [T-099b] 详情类读端口 fake(单实体全档)。
  const getProjectDetail = vi.fn(async () => ({
    id: "proj-1",
    title: "上下文工程",
    stage: "planning",
    status: "active",
    publish: {
      published: true,
      platform: "douyin",
      publishedAt: "2026-07-01T00:00:00.000Z",
    },
    brief: { targetAudience: "一线开发者", coreMessage: "上下文是护城河" },
    artifacts: [
      {
        artifactType: "output_script",
        versionCount: 3,
        updatedAt: "2026-07-01T00:00:00.000Z",
        charCount: 1200,
      },
    ],
    metricsSummary: "播放 8.5万",
  }));
  const getPositioningDetail = vi.fn(async () => ({
    profile: {
      persona: "硬核工程师",
      field: "AI 工程",
      audience: "一线开发者",
      differentiation: "可运行代码",
      capabilities: ["论文拆解"],
      facets: { contentScope: "只做 AI 工程", avoid: "不追泛热点" },
      downstreamRules: { forbidRule: "禁标题党" },
    },
    currentStatement: { oneLiner: "把论文落成代码", keywords: ["代码", "论文", "落地"] },
    statementCount: 4,
    accounts: [
      { platform: "douyin", accountHandle: "@硬核老王", followerBaseline: 12000 },
    ],
  }));
  const getKnowledgeDetail = vi.fn(async () => ({
    id: "kn-1",
    title: "上下文工程是护城河",
    knowledgeType: "claim",
    note: "短正文",
    sourceNote: "作者原话",
    sourceType: "manual",
    sourceUrl: null,
    tags: ["上下文工程"],
    usedCount: 5,
    usedInPublished: true,
    relations: [{ targetKnowledgeId: "kn-2", relationType: "supports" }],
  }));
  // [T-099c] 全文类读端口 fake（产物清单 + 正文全文 + 知识长文）。
  const listProjectArtifacts = vi.fn(async () => ({
    projectId: "proj-1",
    projectTitle: "上下文工程",
    items: [
      {
        artifactType: "output_script",
        currentVersion: 3,
        updatedAt: "2026-07-01T00:00:00.000Z",
        totalChars: 1200,
      },
      {
        artifactType: "content_outline",
        currentVersion: 1,
        updatedAt: null,
        totalChars: 420,
      },
    ],
  }));
  const getArtifactText = vi.fn(async () => ({
    artifactType: "output_script",
    fullText: "这是逐字稿正文全文。".repeat(50),
  }));
  const getKnowledgeText = vi.fn(async () => ({
    id: "kn-1",
    title: "上下文工程逐字稿",
    knowledgeType: "quote",
    fullText: "这是知识条目的长文正文。".repeat(40),
  }));
  // [T-099 切片四] 发布/指标读端口 fake。
  const listPublications = vi.fn(async () => ({
    rows: [
      {
        id: "pub-1",
        platform: "douyin",
        url: "https://v.douyin.com/x",
        publishedAt: "2026-07-01T00:00:00.000Z",
        projectTitle: "上下文工程",
        status: "published",
      },
    ],
    total: 3,
  }));
  const getMetrics = vi.fn(async () => ({
    subject: "上下文工程",
    rows: [
      {
        title: "上下文工程",
        plays: 85000,
        likes: 3000,
        comments: 420,
        shares: 120,
      },
    ],
    retention: [{ atSeconds: 3, retentionRate: 0.82 }],
  }));
  // [T-099 切片五] 经验/候选/校准读端口 fake。
  const listLearnings = vi.fn(async () => ({
    rows: [
      {
        id: "lrn-1",
        title: "前3秒给结果",
        insight: "完播更高",
        learningType: "hook",
        status: "validated",
        reuseCount: 4,
      },
    ],
    total: 1,
  }));
  const listCandidates = vi.fn(async () => ({
    rows: [
      {
        id: "cand-1",
        title: "反直觉开头",
        status: "candidate",
        score: 80,
        source: "ai",
      },
    ],
    total: 5,
  }));
  const getPredictions = vi.fn(async () => ({
    rubric: { name: "校准评分标准", versionNumber: 2, dimensionCount: 5 },
    rows: [
      {
        predictionId: "pred-1",
        subjectTitle: "上下文工程",
        hasResult: true,
        deviationBand: "low",
        finding: "钩子维度偏差最大",
        dimensions: [
          {
            key: "hook",
            label: "开头钩子",
            predicted: 4,
            actual: 5,
            deviation: 1,
          },
        ],
      },
    ],
    total: 1,
  }));
  const draftScript = vi.fn(async () => [
    { heading: "1. 开场", body: "口播：90% 文档没人看" },
  ]);
  const gatherMaterials = vi.fn(async () => ({
    grounding: "model_memory" as const,
    items: [
      {
        title: "RAG 落地案例",
        url: "https://example.com",
        source: "案例",
        whyRelevant: "同赛道",
        category: "案例",
      },
    ],
  }));
  const generateHooks = vi.fn(async () => [
    { text: "你们公司那堆文档,90% 没人看", angle: "反常识断言" },
  ]);
  // [T-077b] brief.fill 的现状读端口(fake:现有选题卡只填了目标观众)。
  const getProjectBrief = vi.fn(async () => ({
    targetAudience: "一线开发者",
    targetPlatforms: ["douyin"],
  }));
  // [T-094] 对话蒸馏核心(fake:两个原子 + 标签)。
  const distillKnowledge = vi.fn(async () => ({
    atoms: [
      {
        type: "claim" as const,
        title: "上下文工程是新的护城河",
        note: "",
        sourceNote: "",
      },
      {
        type: "quote" as const,
        title: "「模型不缺聪明,缺的是你的上下文」",
        note: "",
        sourceNote: "作者原话",
      },
    ],
    suggestedTags: ["上下文工程"],
  }));
  // [T-084b] material.screenshot 核心(fake:真开浏览器截图 → 落 asset,返回摘要)。
  const captureScreenshot = vi.fn(async () => ({
    assetId: "as-shot-1",
    name: "截图·示例页",
    previewUrl: "/api/v1/blob/k?token=t",
    sourceUrl: "https://example.com/post",
  }));
  // [T-217c] web.read 核心(fake:带登录态读正文 → 落逐字稿素材,返回摘要)。默认成功态;
  // 需登录/失败态由用例经 over 覆盖。
  const readWeb = vi.fn(async () => ({
    needLogin: false as const,
    assetId: "as-read-1",
    name: "正文·示例文章",
    previewUrl: "/api/v1/blob/kk?token=t",
    sourceUrl: "https://example.com/article",
    title: "示例文章",
    excerpt: "这是正文摘要…",
    extractor: "readability",
  }));
  // [T-084c] material.generate 核心(fake:dispatch asset.generate task → 返回 taskId)。
  const dispatchGenerateAsset = vi.fn(async () => ({ taskId: "task-gen-1" }));
  // [T-103b] review.script 核心(fake:dispatch script.review → 返回 taskId + projectId)。
  const dispatchScriptReview = vi.fn(async () => ({
    taskId: "task-rev-1",
    projectId: "proj-1",
    error: null as string | null,
  }));
  const deps: ChatToolDeps = {
    // [T-163] humanizeError 端口(下沉 backend 后经注入,原直连前端 ai-error-humanize)。测试
    // 复刻其对 new_sensitive(内容安全审核)的映射,使 distill 失败用例断言不变即过;其余回落 null。
    humanizeError: (err) => {
      const text = err instanceof Error ? err.message : String(err);
      if (/new_sensitive|sensitive|1026/i.test(text)) {
        return {
          message:
            "输入被模型平台的内容安全审核拦截(new_sensitive),建议换一个模型或改写后重试",
          suggestSwitchModel: true,
        };
      }
      return null;
    },
    generateTopics,
    enrichTopic,
    generateHooks,
    draftScript,
    gatherMaterials,
    captureScreenshot,
    readWeb,
    dispatchGenerateAsset,
    dispatchScriptReview,
    diagnoseContent,
    analyzeReview,
    generatePositioning,
    distillKnowledge,
    getProjectBrief,
    listProjects,
    listComments,
    searchKnowledge,
    searchMaterials,
    getProjectDetail,
    getPositioningDetail,
    getKnowledgeDetail,
    listProjectArtifacts,
    getArtifactText,
    getKnowledgeText,
    listPublications,
    getMetrics,
    listLearnings,
    listCandidates,
    getPredictions,
    ...over,
  };
  return {
    deps,
    generateTopics,
    enrichTopic,
    captureScreenshot,
    readWeb,
    dispatchGenerateAsset,
    dispatchScriptReview,
    diagnoseContent,
    analyzeReview,
    generatePositioning,
    distillKnowledge,
    getProjectBrief,
    listProjects,
    listComments,
    searchKnowledge,
    searchMaterials,
    getProjectDetail,
    getPositioningDetail,
    getKnowledgeDetail,
    listProjectArtifacts,
    getArtifactText,
    getKnowledgeText,
    listPublications,
    getMetrics,
    listLearnings,
    listCandidates,
    getPredictions,
  };
}

// chatbox.topic 的真实白名单(与 ai-worker registry 一致)。
const TOPIC_WHITELIST = ["topic.generate", "topic.enrich"] as const;

// 调一个工具的 execute(SDK 的 execute 泛型很严:input 是该工具的 typed input、第二参要带运行
// 上下文)。单测里用宽松签名直接调,绕开泛型摩擦(我们断言的是 execute 的行为,不是它的类型)。
async function runExecute(tool: Tool, input: unknown): Promise<unknown> {
  const exec = tool.execute as unknown as (
    i: unknown,
    o: unknown,
  ) => Promise<unknown>;
  return exec(input, { toolCallId: "tc", messages: [], context: {} });
}

describe("buildChatTools — 白名单过滤(tools 挂载)", () => {
  it("[T-104] ALL_CHAT_TOOL_NAMES 与 allChatTools 全实现同步(drift guard:加工具忘更新单一真值即挂)", () => {
    const { deps } = makeDeps();
    expect([...ALL_CHAT_TOOL_NAMES].sort()).toEqual(
      Object.keys(allChatTools(deps)).sort(),
    );
  });

  it("挂上白名单里、本切片已实现的工具(topic.generate + topic.enrich)", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    expect(Object.keys(tools).sort()).toEqual([
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("白名单外的工具不挂(防越权)", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(["topic.generate"], deps);
    expect(Object.keys(tools)).toEqual(["topic.generate"]);
    expect(tools["topic.enrich"]!).toBeUndefined();
  });

  it("首波 5 工具全部可挂(slice 2 补齐 calibration.diagnose / review.analyze / positioning.generate)", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(
      [
        "topic.generate",
        "topic.enrich",
        "calibration.diagnose",
        "review.analyze",
        "positioning.generate",
      ],
      deps,
    );
    expect(Object.keys(tools).sort()).toEqual([
      "calibration.diagnose",
      "positioning.generate",
      "review.analyze",
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("白名单里但仍未实现的工具(如 material.match)被跳过,不报错、不挂空壳", () => {
    // [T-057④⑤] script.draft/material.gather 已实现进对话;material.match 仍是任务链专属。
    const { deps } = makeDeps();
    const tools = buildChatTools(
      ["topic.generate", "material.match"],
      deps,
    );
    expect(Object.keys(tools)).toEqual(["topic.generate"]);
  });

  it("空白名单 → 不挂任何工具", () => {
    const { deps } = makeDeps();
    expect(Object.keys(buildChatTools([], deps))).toEqual([]);
  });
});

describe("工具 execute — 复用 runner 产候选(非实体)", () => {
  it("topic.generate.execute 调注入的 generateTopics,返回候选列表(kind=topic.candidates)", async () => {
    const { deps, generateTopics } = makeDeps();
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    const result = await runExecute(tools["topic.generate"]!, {
      basis: "comments",
    });
    expect(generateTopics).toHaveBeenCalledWith({ basis: "comments" });
    expect(result).toMatchObject({
      kind: "topic.candidates",
      items: [
        expect.objectContaining({
          title: "反直觉开头",
          // [T-066] 原始评论引用原样透传进工具结果(候选卡「依据评论」的数据源)。
          sourceComments: ["博主,反直觉的开头到底怎么写?求教"],
        }),
      ],
    });
  });

  it("topic.generate.execute basis 缺省 positioning", async () => {
    const { deps, generateTopics } = makeDeps();
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    await runExecute(tools["topic.generate"]!, {});
    expect(generateTopics).toHaveBeenCalledWith({ basis: "positioning" });
  });

  it("topic.enrich.execute 调注入的 enrichTopic,返回选题卡候选(kind=topic.card)", async () => {
    const { deps, enrichTopic } = makeDeps();
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    const result = await runExecute(tools["topic.enrich"]!, {
      title: "选题 X",
      angle: "角度 Y",
    });
    expect(enrichTopic).toHaveBeenCalledWith({
      title: "选题 X",
      angle: "角度 Y",
    });
    expect(result).toMatchObject({
      kind: "topic.card",
      card: expect.objectContaining({ oneLiner: "一句话" }),
    });
  });

  it("topic.enrich 返回 null(模型没产可解析卡)→ result.card 为 null(诚实,不假候选)", async () => {
    const { deps } = makeDeps({ enrichTopic: vi.fn(async () => null) });
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    const result = (await runExecute(tools["topic.enrich"]!, {
      title: "X",
    })) as { kind: string; card: unknown };
    expect(result.kind).toBe("topic.card");
    expect(result.card).toBeNull();
  });

  it("[T-055c] script.hooks execute → deps.generateHooks,返回 kind=script.hooks 候选组", async () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(["script.hooks"], deps);
    const result = await runExecute(tools["script.hooks"]!, {
      topic: "AI 文档",
      direction: "冲突感强一点",
    });
    expect(result).toEqual({
      kind: "script.hooks",
      items: [{ text: "你们公司那堆文档,90% 没人看", angle: "反常识断言" }],
    });
  });

  it("calibration.diagnose.execute 调注入的 diagnoseContent,返回诊断候选(kind=calibration.diagnosis)", async () => {
    const { deps, diagnoseContent } = makeDeps();
    const tools = buildChatTools(["calibration.diagnose"], deps);
    const result = (await runExecute(tools["calibration.diagnose"]!, {
      title: "标题 X",
      script: "脚本 Y",
    })) as { kind: string; diagnosis: { dimensions: unknown[] } | null };
    expect(diagnoseContent).toHaveBeenCalledWith({
      title: "标题 X",
      script: "脚本 Y",
    });
    expect(result.kind).toBe("calibration.diagnosis");
    expect(result.diagnosis?.dimensions).toHaveLength(1);
  });

  it("calibration.diagnose 返回 null(没产可解析诊断)→ diagnosis 为 null(诚实)", async () => {
    const { deps } = makeDeps({ diagnoseContent: vi.fn(async () => null) });
    const tools = buildChatTools(["calibration.diagnose"], deps);
    const result = (await runExecute(tools["calibration.diagnose"]!, {
      title: "X",
    })) as { diagnosis: unknown };
    expect(result.diagnosis).toBeNull();
  });

  it("review.analyze.execute 调注入的 analyzeReview,返回经验候选(kind=review.learnings)", async () => {
    const { deps, analyzeReview } = makeDeps();
    const tools = buildChatTools(["review.analyze"], deps);
    const result = (await runExecute(tools["review.analyze"]!, {
      subject: "我的某条视频",
    })) as { kind: string; items: unknown[]; error: string | null };
    expect(analyzeReview).toHaveBeenCalledWith({ subject: "我的某条视频" });
    expect(result.kind).toBe("review.learnings");
    expect(result.items).toHaveLength(1);
    expect(result.error).toBeNull();
  });

  it("[T-224 诚实门] review.analyze:analyzeReview 无真逐字稿 → 空 items + 非空 error(不产经验卡)", async () => {
    const analyzeReview = vi.fn(async () => ({
      items: [] as Array<{ title: string; insight: string }>,
      error: "我没读到这条作品的真实逐字稿,请把 projectId 告诉我或贴逐字稿。",
    }));
    const { deps } = makeDeps({ analyzeReview });
    const tools = buildChatTools(["review.analyze"], deps);
    const result = (await runExecute(tools["review.analyze"]!, {
      subject: "11.5W 爆款",
    })) as { kind: string; items: unknown[]; error: string | null };
    expect(result.kind).toBe("review.learnings");
    expect(result.items).toHaveLength(0);
    expect(result.error).toContain("逐字稿");
  });

  it("[T-062a] learning.capture 可挂 + execute 纯回显候选(kind=learning.capture,模型填参、不跑二次 LLM)", async () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(["learning.capture"], deps);
    expect(Object.keys(tools)).toEqual(["learning.capture"]);
    const result = await runExecute(tools["learning.capture"]!, {
      title: "完播率高的都在前 3 秒放结论",
      insight: "观众耐心极短,开头给答案再展开论证,留存曲线明显更平。",
      learningType: "structure",
    });
    // 纯回显:入参原样进 suggestion(不写库 —— 落库由人点卡上「存为经验」触发)。
    expect(result).toEqual({
      kind: "learning.capture",
      suggestion: {
        title: "完播率高的都在前 3 秒放结论",
        insight: "观众耐心极短,开头给答案再展开论证,留存曲线明显更平。",
        learningType: "structure",
      },
    });
  });

  it("[T-077b] brief.fill 可挂 + execute 回显建议(清洗空字段)+ 读现状 current(不写库)", async () => {
    const { deps, getProjectBrief } = makeDeps();
    const tools = buildChatTools(["brief.fill"], deps);
    expect(Object.keys(tools)).toEqual(["brief.fill"]);
    const result = await runExecute(tools["brief.fill"]!, {
      targetAudience: " AI 新手 ",
      contentGoal: "涨粉",
      coreMessage: "   ", // 空白 → 清洗掉(不摆假建议)
    });
    // 建议 = 模型填参回显(trim + 只留非空);现状 = 注入的读端口给的 briefDetail。
    // 不写库:落库由人点卡上「写入选题卡」触发(铁律②)。
    expect(getProjectBrief).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: "brief.fill",
      suggestion: { targetAudience: "AI 新手", contentGoal: "涨粉" },
      current: { targetAudience: "一线开发者", targetPlatforms: ["douyin"] },
    });
  });

  it("[T-077b] brief.fill:现状读端口回 null(无项目上下文)→ current=null(诚实,不编现状)", async () => {
    const { deps } = makeDeps({ getProjectBrief: async () => null });
    const tools = buildChatTools(["brief.fill"], deps);
    const result = (await runExecute(tools["brief.fill"]!, {
      contentGoal: "涨粉",
    })) as { current: unknown };
    expect(result.current).toBeNull();
  });

  it("positioning.generate.execute 调注入的 generatePositioning,返回定位候选(kind=positioning.suggestion)", async () => {
    const { deps, generatePositioning } = makeDeps();
    const tools = buildChatTools(["positioning.generate"], deps);
    const result = (await runExecute(tools["positioning.generate"]!, {})) as {
      kind: string;
      suggestion: { oneLiner: string } | null;
    };
    expect(generatePositioning).toHaveBeenCalled();
    expect(result.kind).toBe("positioning.suggestion");
    expect(result.suggestion?.oneLiner).toBe("把论文落成代码");
  });
});

// [T-084b] material.screenshot 工具:真截图落 asset(成功);逐类报错(打不开/HTTP/登录墙)
// 不抛给 SDK,转 error 随结果卡返回;空 URL 诚实报错不调端口。
describe("[T-084b] material.screenshot 工具 — 自动化截图", () => {
  const WHITELIST = ["material.screenshot"] as const;

  it("execute 调注入的 captureScreenshot,返回落库 asset + sourceUrl(kind=material.screenshot)", async () => {
    const { deps, captureScreenshot } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.screenshot"]!, {
      url: "https://example.com/post",
      fullPage: true,
    })) as {
      kind: string;
      asset: { id: string; sourceUrl: string; previewUrl: string | null } | null;
      error: string | null;
    };
    expect(captureScreenshot).toHaveBeenCalledWith({
      url: "https://example.com/post",
      fullPage: true,
    });
    expect(result.kind).toBe("material.screenshot");
    expect(result.error).toBeNull();
    expect(result.asset?.id).toBe("as-shot-1");
    expect(result.asset?.sourceUrl).toBe("https://example.com/post");
  });

  it("截图抛错(登录墙/打不开)→ 不抛,asset=null + error 人话(诚实,不假截到图)", async () => {
    const { deps } = makeDeps({
      captureScreenshot: async () => {
        throw new Error("该页面需要登录 / 有反爬验证,当前只支持公开页面");
      },
    });
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.screenshot"]!, {
      url: "https://paywalled.example.com",
    })) as { asset: unknown; error: string | null };
    expect(result.asset).toBeNull();
    expect(result.error).toContain("需要登录");
  });

  it("空 URL → 诚实报错,不调截图端口", async () => {
    const { deps, captureScreenshot } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.screenshot"]!, {
      url: "   ",
    })) as { asset: unknown; error: string | null };
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(result.asset).toBeNull();
    expect(result.error).toContain("URL");
  });
});

// [T-217c] web.read 工具:带登录态读正文 → 落逐字稿素材(pending);需登录降级 needLogin;
// 失败转 error 不抛;空 URL 诚实报错不调端口。
describe("[T-217c] web.read 工具 — 带登录态读网页正文", () => {
  const WHITELIST = ["web.read"] as const;

  it("execute 调注入的 readWeb,读到正文 → asset + excerpt(kind=web.read,needLogin/error 为 null)", async () => {
    const { deps, readWeb } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["web.read"]!, {
      url: "https://example.com/article",
    })) as {
      kind: string;
      asset: { id: string; sourceUrl: string; excerpt: string } | null;
      needLogin: { domain: string } | null;
      error: string | null;
    };
    expect(readWeb).toHaveBeenCalledWith({ url: "https://example.com/article" });
    expect(result.kind).toBe("web.read");
    expect(result.error).toBeNull();
    expect(result.needLogin).toBeNull();
    expect(result.asset?.id).toBe("as-read-1");
    expect(result.asset?.sourceUrl).toBe("https://example.com/article");
  });

  it("无会话/过期(needLogin)→ 不落库,返回 needLogin.domain(编导引导去保管库登录)", async () => {
    const { deps } = makeDeps({
      readWeb: async () => ({ needLogin: true as const, domain: "chatgpt.com" }),
    });
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["web.read"]!, {
      url: "https://chatgpt.com/share/x",
    })) as { asset: unknown; needLogin: { domain: string } | null; error: string | null };
    expect(result.asset).toBeNull();
    expect(result.needLogin?.domain).toBe("chatgpt.com");
    expect(result.error).toBeNull();
  });

  it("读取抛错(打不开/HTTP/抽不出正文)→ 不抛,asset=null + error 人话", async () => {
    const { deps } = makeDeps({
      readWeb: async () => {
        throw new Error("页面返回 HTTP 404:该链接不可访问");
      },
    });
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["web.read"]!, {
      url: "https://dead.example.com",
    })) as { asset: unknown; needLogin: unknown; error: string | null };
    expect(result.asset).toBeNull();
    expect(result.error).toContain("HTTP 404");
  });

  it("空 URL → 诚实报错,不调读取端口", async () => {
    const { deps, readWeb } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["web.read"]!, { url: "  " })) as {
      asset: unknown;
      error: string | null;
    };
    expect(readWeb).not.toHaveBeenCalled();
    expect(result.asset).toBeNull();
    expect(result.error).toContain("URL");
  });
});

// [T-084c] material.generate 工具:dispatch 既有 asset.generate task(不直接生成),立即返回
// taskId + status=queued;空 prompt 诚实报错;dispatch 失败转 error。
describe("[T-084c] material.generate 工具 — AI 生成素材对话化", () => {
  const WHITELIST = ["material.generate"] as const;

  it("execute 调注入的 dispatchGenerateAsset,返回 taskId + queued(kind=material.generate)", async () => {
    const { deps, dispatchGenerateAsset } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.generate"]!, {
      kind: "image",
      prompt: "  一张赛博朋克风格的城市夜景  ",
      style: "赛博朋克",
    })) as {
      kind: string;
      taskId: string | null;
      kindOf: string;
      status: string;
      error: string | null;
    };
    // prompt trim + style 透传(折进 prompt 由 chat-runner 端口做,工具层只透传原参)。
    expect(dispatchGenerateAsset).toHaveBeenCalledWith({
      kind: "image",
      prompt: "一张赛博朋克风格的城市夜景",
      style: "赛博朋克",
    });
    expect(result.kind).toBe("material.generate");
    expect(result.taskId).toBe("task-gen-1");
    expect(result.kindOf).toBe("image");
    expect(result.status).toBe("queued");
    expect(result.error).toBeNull();
  });

  it("kind=video 透传(视频异步不阻塞);无 style 时不传该键", async () => {
    const { deps, dispatchGenerateAsset } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.generate"]!, {
      kind: "video",
      prompt: "海边日落的空镜",
    })) as { kindOf: string; taskId: string | null };
    expect(dispatchGenerateAsset).toHaveBeenCalledWith({
      kind: "video",
      prompt: "海边日落的空镜",
      style: undefined,
    });
    expect(result.kindOf).toBe("video");
    expect(result.taskId).toBe("task-gen-1");
  });

  it("空 prompt → 诚实报错,不 dispatch", async () => {
    const { deps, dispatchGenerateAsset } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.generate"]!, {
      kind: "image",
      prompt: "   ",
    })) as { taskId: string | null; error: string | null };
    expect(dispatchGenerateAsset).not.toHaveBeenCalled();
    expect(result.taskId).toBeNull();
    expect(result.error).toContain("生成");
  });

  it("dispatch 抛错(端口未接入)→ 不抛,taskId=null + error(诚实降级)", async () => {
    const { deps } = makeDeps({
      dispatchGenerateAsset: async () => {
        throw new Error("AI 生成能力当前未接入");
      },
    });
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["material.generate"]!, {
      kind: "image",
      prompt: "一张配图",
    })) as { taskId: string | null; error: string | null };
    expect(result.taskId).toBeNull();
    expect(result.error).toContain("未接入");
  });
});

describe("只读 context 工具 execute — 拉真数据(纯读、非候选)", () => {
  const CONTEXT_WHITELIST = [
    "context.projects",
    "context.knowledge",
    "context.materials",
  ] as const;

  it("三个 context 工具全部可挂", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    expect(Object.keys(tools).sort()).toEqual([
      "context.knowledge",
      "context.materials",
      "context.projects",
    ]);
  });

  it("context.projects.execute 调 listProjects,返回真数据(kind=context.projects)", async () => {
    const { deps, listProjects } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.projects"]!, {
      limit: 3,
    })) as { kind: string; items: unknown[] };
    expect(listProjects).toHaveBeenCalledWith({ limit: 3, offset: 0 });
    expect(result.kind).toBe("context.projects");
    expect(result.items).toHaveLength(1);
  });

  it("[T-058②] context.projects limit 缺省 20、封顶 50,offset 兜 0", async () => {
    const { deps, listProjects } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    await runExecute(tools["context.projects"]!, {}); // 缺省 → 20
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    await runExecute(tools["context.projects"]!, { limit: 999, offset: 30 }); // 超界 → 50
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 50, offset: 30 });
    await runExecute(tools["context.projects"]!, { limit: 0, offset: -3 }); // ≤0 → 20/0
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
  });

  it("[T-058③] context.comments.execute 调 listComments,带 total/hasMore", async () => {
    const { deps, listComments } = makeDeps();
    const tools = buildChatTools(["context.comments"], deps);
    const result = (await runExecute(tools["context.comments"]!, {})) as {
      kind: string;
      items: unknown[];
      total: number;
      hasMore: boolean;
    };
    expect(listComments).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(result.kind).toBe("context.comments");
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
  });

  it("context.knowledge.execute 调 searchKnowledge(query 缺省空串)", async () => {
    const { deps, searchKnowledge } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.knowledge"]!, {
      query: "RAG",
    })) as { kind: string; items: unknown[] };
    expect(searchKnowledge).toHaveBeenCalledWith({ query: "RAG", limit: 20 });
    expect(result.kind).toBe("context.knowledge");
    expect(result.items).toHaveLength(1);
    await runExecute(tools["context.knowledge"]!, {});
    expect(searchKnowledge).toHaveBeenLastCalledWith({ query: "", limit: 20 });
  });

  it("context.materials.execute 调 searchMaterials(query 缺省空串)", async () => {
    const { deps, searchMaterials } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.materials"]!, {
      query: "封面",
      limit: 2,
    })) as { kind: string; items: unknown[] };
    expect(searchMaterials).toHaveBeenCalledWith({ query: "封面", limit: 2 });
    expect(result.kind).toBe("context.materials");
    expect(result.items).toHaveLength(1);
  });

  it("context 工具返回空(端口无数据)→ items 为空数组(诚实,不塞假数据)", async () => {
    const { deps } = makeDeps({ listProjects: vi.fn(async () => ({ rows: [], total: 0 })) });
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.projects"]!, {})) as {
      items: unknown[];
    };
    expect(result.items).toEqual([]);
  });
});

// ── [T-099b] 切片二:详情类 context 工具 execute(单实体全字段 + 详情档预算)────────────
describe("[T-099b] 详情类 context 工具 execute — 单实体全档 + 长文本截断 + 空态", () => {
  const DETAIL_WHITELIST = [
    "context.project.detail",
    "context.positioning.detail",
    "context.knowledge.detail",
  ] as const;

  it("三个详情工具全部可挂", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    expect(Object.keys(tools).sort()).toEqual([
      "context.knowledge.detail",
      "context.positioning.detail",
      "context.project.detail",
    ]);
  });

  it("context.project.detail.execute 调 getProjectDetail 拼全档(found + project 直渲字段)", async () => {
    const { deps, getProjectDetail } = makeDeps();
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const result = (await runExecute(tools["context.project.detail"]!, {
      projectId: "proj-1",
    })) as {
      kind: string;
      found: boolean;
      project: { title: string; publish: { published: boolean }; artifacts: unknown[] };
    };
    expect(getProjectDetail).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(result.kind).toBe("context.project.detail");
    expect(result.found).toBe(true);
    expect(result.project.title).toBe("上下文工程");
    expect(result.project.publish.published).toBe(true);
    expect(result.project.artifacts).toHaveLength(1);
  });

  it("context.project.detail.execute 空 projectId → found:false(不调端口,诚实空态)", async () => {
    const { deps, getProjectDetail } = makeDeps();
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const result = (await runExecute(tools["context.project.detail"]!, {
      projectId: "   ",
    })) as { found: boolean; project: unknown };
    expect(getProjectDetail).not.toHaveBeenCalled();
    expect(result.found).toBe(false);
    expect(result.project).toBeNull();
  });

  it("context.positioning.detail.execute 调 getPositioningDetail(无入参,全 facets/rules/账号画像)", async () => {
    const { deps, getPositioningDetail } = makeDeps();
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const result = (await runExecute(tools["context.positioning.detail"]!, {})) as {
      kind: string;
      found: boolean;
      positioning: {
        profile: { facets: { contentScope?: string } } | null;
        statementCount: number | null;
        accounts: unknown[];
      };
    };
    expect(getPositioningDetail).toHaveBeenCalled();
    expect(result.kind).toBe("context.positioning.detail");
    expect(result.found).toBe(true);
    expect(result.positioning.profile?.facets.contentScope).toBe("只做 AI 工程");
    expect(result.positioning.statementCount).toBe(4);
    expect(result.positioning.accounts).toHaveLength(1);
  });

  it("context.knowledge.detail.execute 调 getKnowledgeDetail,长正文走详情档预算(≤200+totalChars+指针)", async () => {
    const longNote = "字".repeat(360);
    const { deps } = makeDeps({
      getKnowledgeDetail: vi.fn(async () => ({
        id: "kn-1",
        title: "长正文知识",
        knowledgeType: "evidence",
        note: longNote,
        sourceNote: "短出处",
        sourceType: "manual",
        sourceUrl: null,
        tags: [],
        usedCount: 0,
        usedInPublished: false,
        relations: [],
      })),
    });
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const result = (await runExecute(tools["context.knowledge.detail"]!, {
      id: "kn-1",
    })) as {
      kind: string;
      found: boolean;
      item: {
        note: { preview: string; totalChars: number; fullTextTool: string | null };
        sourceNote: { preview: string; totalChars: number; fullTextTool: string | null };
      };
    };
    expect(result.kind).toBe("context.knowledge.detail");
    expect(result.found).toBe(true);
    // 长正文:preview 恰 200 字 + totalChars=360 + 指针到 context.knowledge.text。
    expect(result.item.note.preview.length).toBe(DETAIL_TEXT_PREVIEW_CHARS);
    expect(result.item.note.totalChars).toBe(360);
    expect(result.item.note.fullTextTool).toBe("context.knowledge.text");
    // 短出处:未截断 → fullTextTool=null(全文即 preview)。
    expect(result.item.sourceNote.fullTextTool).toBeNull();
    expect(result.item.sourceNote.preview).toBe("短出处");
  });

  it("context.knowledge.detail.execute 读不到 → found:false + item:null(诚实空态)", async () => {
    const { deps } = makeDeps({ getKnowledgeDetail: vi.fn(async () => null) });
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const result = (await runExecute(tools["context.knowledge.detail"]!, {
      id: "nope",
    })) as { found: boolean; item: unknown };
    expect(result.found).toBe(false);
    expect(result.item).toBeNull();
  });

  it("详情端口未装配(deps 缺省)→ 工具诚实空态(不抛、不塞假)", async () => {
    const { deps } = makeDeps({
      getProjectDetail: undefined,
      getPositioningDetail: undefined,
      getKnowledgeDetail: undefined,
    });
    const tools = buildChatTools([...DETAIL_WHITELIST], deps);
    const proj = (await runExecute(tools["context.project.detail"]!, {
      projectId: "p",
    })) as { found: boolean };
    const pos = (await runExecute(tools["context.positioning.detail"]!, {})) as {
      found: boolean;
      positioning: { profile: unknown };
    };
    const kn = (await runExecute(tools["context.knowledge.detail"]!, {
      id: "k",
    })) as { found: boolean };
    expect(proj.found).toBe(false);
    expect(pos.found).toBe(false);
    expect(pos.positioning.profile).toBeNull();
    expect(kn.found).toBe(false);
  });
});

// ── [T-099c] 切片三:全文类 context 工具 execute(产物清单 + 长文本窗口 + §3 全文档预算)────
describe("[T-099c] 全文类 context 工具 execute — 产物清单 + 正文窗口 + 8000 封顶 + 空态", () => {
  const FULLTEXT_WHITELIST = [
    "context.artifacts",
    "context.artifact.text",
    "context.knowledge.text",
  ] as const;

  it("三个全文工具全部可挂", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    expect(Object.keys(tools).sort()).toEqual([
      "context.artifact.text",
      "context.artifacts",
      "context.knowledge.text",
    ]);
  });

  it("context.artifacts.execute 调 listProjectArtifacts,返回产物清单(kind + found + items)", async () => {
    const { deps, listProjectArtifacts } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.artifacts"]!, {
      projectId: "proj-1",
    })) as {
      kind: string;
      found: boolean;
      projectTitle: string;
      items: Array<{ artifactType: string; totalChars: number }>;
    };
    expect(listProjectArtifacts).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(result.kind).toBe("context.artifacts");
    expect(result.found).toBe(true);
    expect(result.projectTitle).toBe("上下文工程");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.artifactType).toBe("output_script");
  });

  it("context.artifacts.execute 空 projectId → found:false(不调端口,诚实空态)", async () => {
    const { deps, listProjectArtifacts } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.artifacts"]!, {
      projectId: "   ",
    })) as { found: boolean; items: unknown[] };
    expect(listProjectArtifacts).not.toHaveBeenCalled();
    expect(result.found).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("context.artifact.text.execute 调 getArtifactText,返回窗口(text/offset/totalChars/hasMore)", async () => {
    const { deps, getArtifactText } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.artifact.text"]!, {
      projectId: "proj-1",
      artifactType: "output_script",
      maxChars: 100,
    })) as {
      kind: string;
      found: boolean;
      artifactType: string;
      text: string;
      offset: number;
      totalChars: number;
      hasMore: boolean;
    };
    expect(getArtifactText).toHaveBeenCalledWith({
      projectId: "proj-1",
      artifactType: "output_script",
    });
    expect(result.kind).toBe("context.artifact.text");
    expect(result.found).toBe(true);
    expect(result.artifactType).toBe("output_script");
    // fullText 长度 = "这是逐字稿正文全文。"(10 字)×50 = 500 字;maxChars=100 → 窗口 100 字 + hasMore。
    expect(result.text.length).toBe(100);
    expect(result.offset).toBe(0);
    expect(result.totalChars).toBe(500);
    expect(result.hasMore).toBe(true);
  });

  it("context.artifact.text.execute:超长正文 maxChars 强制封顶 8000(execute 侧,非君子协定)", async () => {
    const { deps } = makeDeps({
      getArtifactText: vi.fn(async () => ({
        artifactType: "output_script",
        fullText: "字".repeat(20000),
      })),
    });
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    // maxChars 请求 15000 → 强制夹到 8000。
    const result = (await runExecute(tools["context.artifact.text"]!, {
      projectId: "proj-1",
      artifactType: "output_script",
      maxChars: 15000,
    })) as { text: string; totalChars: number; hasMore: boolean };
    expect(result.text.length).toBe(TEXT_WINDOW_CAP_CHARS); // 8000
    expect(result.totalChars).toBe(20000);
    expect(result.hasMore).toBe(true);
  });

  it("context.artifact.text.execute:offset 翻窗读到末尾 → hasMore:false", async () => {
    const { deps } = makeDeps({
      getArtifactText: vi.fn(async () => ({
        artifactType: "output_script",
        fullText: "字".repeat(500),
      })),
    });
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.artifact.text"]!, {
      projectId: "proj-1",
      artifactType: "output_script",
      offset: 480,
      maxChars: 100,
    })) as { text: string; offset: number; totalChars: number; hasMore: boolean };
    expect(result.offset).toBe(480);
    expect(result.text.length).toBe(20); // 500 - 480
    expect(result.hasMore).toBe(false);
  });

  it("context.artifact.text.execute:缺 artifactType / 读不到 → found:false + 空窗口(诚实空态)", async () => {
    const { deps, getArtifactText } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    // 缺 artifactType → 不调端口。
    const miss = (await runExecute(tools["context.artifact.text"]!, {
      projectId: "proj-1",
      artifactType: "   ",
    })) as { found: boolean; text: string; totalChars: number };
    expect(getArtifactText).not.toHaveBeenCalled();
    expect(miss.found).toBe(false);
    expect(miss.text).toBe("");
    expect(miss.totalChars).toBe(0);
    // 端口回 null(项目/产物不存在)→ found:false。
    const { deps: deps2 } = makeDeps({
      getArtifactText: vi.fn(async () => null),
    });
    const tools2 = buildChatTools([...FULLTEXT_WHITELIST], deps2);
    const gone = (await runExecute(tools2["context.artifact.text"]!, {
      projectId: "p",
      artifactType: "output_script",
    })) as { found: boolean };
    expect(gone.found).toBe(false);
  });

  it("context.knowledge.text.execute 调 getKnowledgeText,返回窗口 + 元数据(title/knowledgeType)", async () => {
    const { deps, getKnowledgeText } = makeDeps();
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.knowledge.text"]!, {
      id: "kn-1",
      maxChars: 50,
    })) as {
      kind: string;
      found: boolean;
      id: string;
      title: string;
      knowledgeType: string;
      text: string;
      totalChars: number;
      hasMore: boolean;
    };
    expect(getKnowledgeText).toHaveBeenCalledWith({ id: "kn-1" });
    expect(result.kind).toBe("context.knowledge.text");
    expect(result.found).toBe(true);
    expect(result.title).toBe("上下文工程逐字稿");
    expect(result.knowledgeType).toBe("quote");
    // "这是知识条目的长文正文。"(12 字)×40 = 480 字;maxChars=50 → 窗口 50 字 + hasMore。
    expect(result.text.length).toBe(50);
    expect(result.totalChars).toBe(480);
    expect(result.hasMore).toBe(true);
  });

  it("context.knowledge.text.execute:读不到 → found:false + 空窗口(诚实空态)", async () => {
    const { deps } = makeDeps({ getKnowledgeText: vi.fn(async () => null) });
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.knowledge.text"]!, {
      id: "nope",
    })) as { found: boolean; text: string; totalChars: number };
    expect(result.found).toBe(false);
    expect(result.text).toBe("");
    expect(result.totalChars).toBe(0);
  });

  it("全文端口未装配(deps 缺省)→ 三工具诚实空态(不抛、不塞假)", async () => {
    const { deps } = makeDeps({
      listProjectArtifacts: undefined,
      getArtifactText: undefined,
      getKnowledgeText: undefined,
    });
    const tools = buildChatTools([...FULLTEXT_WHITELIST], deps);
    const arts = (await runExecute(tools["context.artifacts"]!, {
      projectId: "p",
    })) as { found: boolean };
    const atext = (await runExecute(tools["context.artifact.text"]!, {
      projectId: "p",
      artifactType: "output_script",
    })) as { found: boolean };
    const ktext = (await runExecute(tools["context.knowledge.text"]!, {
      id: "k",
    })) as { found: boolean };
    expect(arts.found).toBe(false);
    expect(atext.found).toBe(false);
    expect(ktext.found).toBe(false);
  });
});

// ── [T-099 切片四/五] 指标/发布/经验/候选/校准类 context 工具 execute(清单读 + 分页 + 空态)──
describe("[T-099 切片四/五] 清单类 context 工具 execute — 读端口 + 分页真相 + 空态", () => {
  const LIST_WHITELIST = [
    "context.publications",
    "context.metrics",
    "context.learnings",
    "context.candidates",
    "context.predictions",
  ] as const;

  it("五个清单工具全部可挂", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    expect(Object.keys(tools).sort()).toEqual([
      "context.candidates",
      "context.learnings",
      "context.metrics",
      "context.predictions",
      "context.publications",
    ]);
  });

  it("[切片四] context.publications.execute 调 listPublications,带 total/offset/hasMore", async () => {
    const { deps, listPublications } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.publications"]!, {})) as {
      kind: string;
      items: Array<{ platform: string }>;
      total: number;
      offset: number;
      hasMore: boolean;
    };
    // limit 缺省 20、offset 兜 0(clampContextLimit)。
    expect(listPublications).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(result.kind).toBe("context.publications");
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.offset).toBe(0);
    // total=3 > offset+items(0+1) → hasMore。
    expect(result.hasMore).toBe(true);
  });

  it("[切片四] context.publications limit 封顶 50、offset 兜 0", async () => {
    const { deps, listPublications } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    await runExecute(tools["context.publications"]!, { limit: 999, offset: -5 });
    expect(listPublications).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it("[切片四] context.metrics.execute 给 projectId → 单作品快照(subject + rows + 留存点)", async () => {
    const { deps, getMetrics } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.metrics"]!, {
      projectId: "proj-1",
    })) as {
      kind: string;
      subject: string | null;
      rows: Array<{ plays: number | null }>;
      retention: unknown[];
    };
    expect(getMetrics).toHaveBeenCalledWith({ projectId: "proj-1", limit: 20 });
    expect(result.kind).toBe("context.metrics");
    expect(result.subject).toBe("上下文工程");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.plays).toBe(85000);
    expect(result.retention).toHaveLength(1);
  });

  it("[切片四] context.metrics.execute 不给 projectId → 账号级(projectId=undefined)", async () => {
    // 覆盖 getMetrics(makeDeps 用 over 的这个 fn),断言执行的就是它。
    const accountMetrics = vi.fn(async () => ({
      subject: null as string | null,
      rows: [
        // [T-223] 账号级每行带 projectId + 真实作品标题(治「编导认不出作品」)。
        { projectId: "proj-A", externalId: "aw-1", title: "作品A", plays: 100, likes: 10, comments: 2, shares: 1 },
        { projectId: "proj-B", externalId: "aw-2", title: "作品B", plays: 200, likes: 20, comments: 4, shares: 3 },
      ],
      retention: [] as Array<{ atSeconds: number; retentionRate: number }>,
    }));
    const { deps } = makeDeps({ getMetrics: accountMetrics });
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.metrics"]!, {})) as {
      subject: string | null;
      rows: Array<{ projectId?: string | null; title: string }>;
    };
    expect(accountMetrics).toHaveBeenCalledWith({
      projectId: undefined,
      limit: 20,
    });
    expect(result.subject).toBeNull();
    expect(result.rows).toHaveLength(2);
    // [T-223] projectId + 真标题透传给模型(据此调 context.artifact.text 读该作品逐字稿)。
    expect(result.rows[0]!.projectId).toBe("proj-A");
    expect(result.rows[0]!.title).toBe("作品A");
    expect(result.rows[1]!.projectId).toBe("proj-B");
  });

  it("[切片五] context.learnings.execute 调 listLearnings(透传 query/type/status)", async () => {
    const { deps, listLearnings } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.learnings"]!, {
      query: "钩子",
      learningType: "hook",
      status: "validated",
    })) as {
      kind: string;
      items: Array<{ status: string }>;
      total: number;
    };
    expect(listLearnings).toHaveBeenCalledWith({
      query: "钩子",
      learningType: "hook",
      status: "validated",
      limit: 20,
    });
    expect(result.kind).toBe("context.learnings");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.status).toBe("validated");
    expect(result.total).toBe(1);
  });

  it("[切片五] context.candidates.execute 调 listCandidates,带 total/offset/hasMore", async () => {
    const { deps, listCandidates } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.candidates"]!, {
      offset: 0,
    })) as {
      kind: string;
      items: Array<{ score: number | null }>;
      total: number;
      hasMore: boolean;
    };
    expect(listCandidates).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(result.kind).toBe("context.candidates");
    expect(result.items[0]!.score).toBe(80);
    expect(result.total).toBe(5);
    // total=5 > 0+1 → hasMore。
    expect(result.hasMore).toBe(true);
  });

  it("[切片五] context.predictions.execute 调 getPredictions,拼 rubric 摘要 + 对照行", async () => {
    const { deps, getPredictions } = makeDeps();
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const result = (await runExecute(tools["context.predictions"]!, {})) as {
      kind: string;
      rubric: { versionNumber: number; dimensionCount: number } | null;
      items: Array<{ subjectTitle: string; dimensions: unknown[] }>;
      total: number;
    };
    expect(getPredictions).toHaveBeenCalledWith({ limit: 20 });
    expect(result.kind).toBe("context.predictions");
    expect(result.rubric?.versionNumber).toBe(2);
    expect(result.rubric?.dimensionCount).toBe(5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.subjectTitle).toBe("上下文工程");
    expect(result.items[0]!.dimensions).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("清单端口未装配(deps 缺省)→ 五工具诚实空态(不抛、不塞假)", async () => {
    const { deps } = makeDeps({
      listPublications: undefined,
      getMetrics: undefined,
      listLearnings: undefined,
      listCandidates: undefined,
      getPredictions: undefined,
    });
    const tools = buildChatTools([...LIST_WHITELIST], deps);
    const pub = (await runExecute(tools["context.publications"]!, {})) as {
      items: unknown[];
      total: number;
    };
    const met = (await runExecute(tools["context.metrics"]!, {})) as {
      subject: string | null;
      rows: unknown[];
    };
    const lrn = (await runExecute(tools["context.learnings"]!, {})) as {
      items: unknown[];
    };
    const cand = (await runExecute(tools["context.candidates"]!, {})) as {
      items: unknown[];
    };
    const pred = (await runExecute(tools["context.predictions"]!, {})) as {
      rubric: unknown;
      items: unknown[];
    };
    expect(pub.items).toEqual([]);
    expect(pub.total).toBe(0);
    expect(met.subject).toBeNull();
    expect(met.rows).toEqual([]);
    expect(lrn.items).toEqual([]);
    expect(cand.items).toEqual([]);
    expect(pred.rubric).toBeNull();
    expect(pred.items).toEqual([]);
  });
});

// [T-099c] 全文档窗口读取纯函数(SPEC §3):offset 按字符 clamp、maxChars 默认 4000/封顶 8000、
// hasMore 真相、空文本诚实空窗口。
describe("readTextWindow / clampWindowMaxChars — 全文档窗口预算(§3)", () => {
  const long = "字".repeat(10000);

  it("默认 maxChars=4000,offset=0 → 窗口 4000 字 + hasMore", () => {
    const w = readTextWindow(long, {});
    expect(w.text.length).toBe(TEXT_WINDOW_DEFAULT_MAX_CHARS); // 4000
    expect(w.offset).toBe(0);
    expect(w.totalChars).toBe(10000);
    expect(w.hasMore).toBe(true);
  });

  it("maxChars 超 8000 → 封顶 8000(硬约束)", () => {
    const w = readTextWindow(long, { maxChars: 99999 });
    expect(w.text.length).toBe(TEXT_WINDOW_CAP_CHARS); // 8000
    expect(w.hasMore).toBe(true);
  });

  it("offset 翻窗:读到末尾 → hasMore:false,窗口只剩尾段", () => {
    const w = readTextWindow(long, { offset: 9800, maxChars: 4000 });
    expect(w.offset).toBe(9800);
    expect(w.text.length).toBe(200); // 10000 - 9800
    expect(w.hasMore).toBe(false);
  });

  it("offset 越界(> totalChars)→ clamp 到末尾,空窗口 + hasMore:false", () => {
    const w = readTextWindow("短文", { offset: 999 });
    expect(w.offset).toBe(2);
    expect(w.text).toBe("");
    expect(w.hasMore).toBe(false);
  });

  it("offset 负数/非数 → 兜 0", () => {
    expect(readTextWindow("abcdef", { offset: -5, maxChars: 3 }).offset).toBe(0);
    expect(
      readTextWindow("abcdef", { offset: NaN as unknown as number }).offset,
    ).toBe(0);
  });

  it("空文本/非串 → 空窗口 + 0 字 + hasMore:false(诚实,不编)", () => {
    expect(readTextWindow("", { maxChars: 100 })).toEqual({
      text: "",
      offset: 0,
      totalChars: 0,
      hasMore: false,
    });
    expect(readTextWindow(null, {}).totalChars).toBe(0);
    expect(readTextWindow(undefined, {}).text).toBe("");
  });

  it("恰好读完(offset+maxChars == totalChars)边界 → hasMore:false", () => {
    const w = readTextWindow("字".repeat(100), { offset: 0, maxChars: 100 });
    expect(w.text.length).toBe(100);
    expect(w.hasMore).toBe(false);
  });

  it("clampWindowMaxChars:缺省/≤0/非数 → 4000;>8000 → 8000;区间内取整", () => {
    expect(clampWindowMaxChars(undefined)).toBe(4000);
    expect(clampWindowMaxChars(0)).toBe(4000);
    expect(clampWindowMaxChars(-10)).toBe(4000);
    expect(clampWindowMaxChars(NaN)).toBe(4000);
    expect(clampWindowMaxChars(99999)).toBe(8000);
    expect(clampWindowMaxChars(2500.7)).toBe(2500);
  });
});

// [T-099b] 详情档预算纯函数:长文本 ≤200 字 + totalChars + 指针,未超则全文即 preview。
describe("truncateDetailText — 详情档长文本预算(§3)", () => {
  it("超 200 字 → preview 截 200 + totalChars 原长 + fullTextTool 指针", () => {
    const raw = "字".repeat(500);
    const f = truncateDetailText(raw, "context.knowledge.text");
    expect(f.preview.length).toBe(DETAIL_TEXT_PREVIEW_CHARS);
    expect(f.totalChars).toBe(500);
    expect(f.fullTextTool).toBe("context.knowledge.text");
  });

  it("恰 200 字(边界)→ 不截断,fullTextTool=null(全文即 preview)", () => {
    const raw = "字".repeat(200);
    const f = truncateDetailText(raw, "context.knowledge.text");
    expect(f.preview).toBe(raw);
    expect(f.totalChars).toBe(200);
    expect(f.fullTextTool).toBeNull();
  });

  it("空/非串 → 空 preview + 0 字 + null 指针(不编)", () => {
    expect(truncateDetailText("", "x")).toEqual({
      preview: "",
      totalChars: 0,
      fullTextTool: null,
    });
    expect(truncateDetailText(null, "x")).toEqual({
      preview: "",
      totalChars: 0,
      fullTextTool: null,
    });
    expect(truncateDetailText(undefined, "x").preview).toBe("");
  });
});

// ── T-039a:知识库匹配放宽(knowledgeRelevanceScore 分词 OR 模糊)──────────────────────
// 原 context.knowledge 只做整串 title.includes(query),复盘拿主题/标题当 query 时命中率极低
// (用户反馈「匹配太死」)。改成分词 OR:任一 query 词命中 haystack 即算相关,命中词数即相关度。
// 诚实:完全不相关 → 0(调用方据此空,不塞无关)。
describe("knowledgeRelevanceScore — 分词 OR 模糊匹配(T-039a 放宽)", () => {
  it("整串不子串包含,但分词后有词命中 → 判为相关(放宽的关键)", () => {
    // query「上下文工程 复盘」整串不在标题里,但「上下文工程」这个词命中 → 相关。
    expect(
      knowledgeRelevanceScore("上下文工程实战手册", "上下文工程 复盘方法"),
    ).toBeGreaterThan(0);
  });

  it("命中词越多相关度越高(用于排序)", () => {
    const many = knowledgeRelevanceScore("RAG 检索增强 与 上下文工程", "RAG 上下文工程");
    const few = knowledgeRelevanceScore("RAG 检索增强", "RAG 上下文工程");
    expect(many).toBeGreaterThan(few);
  });

  it("摘要参与匹配:词只在摘要里也算命中", () => {
    // haystack 拼了标题 + 摘要;query 词只在摘要段命中。
    expect(
      knowledgeRelevanceScore("随手记\n关于 Agent 记忆架构的笔记", "记忆架构"),
    ).toBeGreaterThan(0);
  });

  it("完全不相关 → 0(诚实空,不塞无关资料)", () => {
    expect(knowledgeRelevanceScore("烘焙面包的十个技巧", "分布式数据库一致性")).toBe(0);
  });

  it("query 为空 / 全是噪声分隔符 → 0(交调用方走「不过滤」分支)", () => {
    expect(knowledgeRelevanceScore("任意内容", "")).toBe(0);
    expect(knowledgeRelevanceScore("任意内容", "  ,、/  ")).toBe(0);
  });

  it("大小写不敏感", () => {
    expect(knowledgeRelevanceScore("React 性能优化", "react")).toBeGreaterThan(0);
  });
});

// [T-081①] 产内容工具统一 extraBrief 入参 —— 对话洞察经工具入参透传到 deps(修「模型有洞察、
// 工具零入参无通道」的上下文断裂)。逐工具断言 execute 把 extraBrief 传给注入的 runner 核心。
describe("[T-081①] extraBrief 透传 — 产内容工具的对话洞察通道", () => {
  const ALL = [
    "topic.generate",
    "script.hooks",
    "script.draft",
    "calibration.diagnose",
    "review.analyze",
    "positioning.generate",
  ] as const;

  it("positioning.generate:extraBrief 透传到 deps.generatePositioning(原零入参 → 洞察永远进不去)", async () => {
    const { deps, generatePositioning } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["positioning.generate"]!, {
      extraBrief: "定位应转向 AI 工程实战,粉丝评论都在问落地",
    });
    expect(generatePositioning).toHaveBeenCalledWith({
      extraBrief: "定位应转向 AI 工程实战,粉丝评论都在问落地",
    });
  });

  it("topic.generate:extraBrief 透传到 deps.generateTopics(原 schema 未暴露该参)", async () => {
    const { deps, generateTopics } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["topic.generate"]!, {
      basis: "comments",
      extraBrief: "围绕「上下文工程」出题",
    });
    expect(generateTopics).toHaveBeenCalledWith({
      basis: "comments",
      extraBrief: "围绕「上下文工程」出题",
    });
  });

  it("script.hooks / script.draft:extraBrief 透传到 generateHooks / draftScript", async () => {
    const { deps } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["script.hooks"]!, {
      topic: "RAG",
      extraBrief: "hook 要带真实数据",
    });
    expect(deps.generateHooks).toHaveBeenCalledWith({
      topic: "RAG",
      direction: undefined,
      extraBrief: "hook 要带真实数据",
    });
    await runExecute(tools["script.draft"]!, {
      topic: "RAG",
      extraBrief: "按我们刚聊的三段式结构写",
    });
    expect(deps.draftScript).toHaveBeenCalledWith({
      topic: "RAG",
      angle: undefined,
      extraBrief: "按我们刚聊的三段式结构写",
    });
  });

  it("calibration.diagnose / review.analyze:extraBrief 透传到 diagnoseContent / analyzeReview", async () => {
    const { deps, diagnoseContent, analyzeReview } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["calibration.diagnose"]!, {
      title: "标题",
      extraBrief: "重点看转化引导",
    });
    expect(diagnoseContent).toHaveBeenCalledWith({
      title: "标题",
      script: undefined,
      extraBrief: "重点看转化引导",
    });
    await runExecute(tools["review.analyze"]!, {
      subject: "某条作品",
      extraBrief: "聚焦评论区的负反馈",
    });
    expect(analyzeReview).toHaveBeenCalledWith({
      subject: "某条作品",
      extraBrief: "聚焦评论区的负反馈",
    });
  });

  it("extraBrief 缺省 → 透传 undefined(行为与旧零入参一致,不注空噪声)", async () => {
    const { deps, generatePositioning } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["positioning.generate"]!, {});
    expect(generatePositioning).toHaveBeenCalledWith({ extraBrief: undefined });
  });
});

// [T-081] extraBrief 清洗纯函数。
describe("clampExtraBrief", () => {
  it("trim + 原样保留", () => {
    expect(clampExtraBrief("  洞察内容  ")).toBe("洞察内容");
  });
  it("超 2000 字截断(schema maxLength 的运行时兜底)", () => {
    const long = "长".repeat(2500);
    expect(clampExtraBrief(long)).toHaveLength(2000);
  });
  it("空串/空白/非串 → undefined(prompt 整段省略)", () => {
    expect(clampExtraBrief("")).toBeUndefined();
    expect(clampExtraBrief("   ")).toBeUndefined();
    expect(clampExtraBrief(42)).toBeUndefined();
    expect(clampExtraBrief(undefined)).toBeUndefined();
  });
});

// [T-081③] context.projects compact 模式 —— 盘点全量:标题截 40 字、单页上限 200。
describe("[T-081③] context.projects compact 模式", () => {
  const CONTEXT_WHITELIST = ["context.projects"] as const;

  it("compact=true:limit 缺省与封顶放宽到 200", async () => {
    const { deps, listProjects } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    await runExecute(tools["context.projects"]!, { compact: true }); // 缺省 → 200
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 200, offset: 0 });
    await runExecute(tools["context.projects"]!, { compact: true, limit: 999 });
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 200, offset: 0 });
    await runExecute(tools["context.projects"]!, { compact: true, limit: 80 });
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 80, offset: 0 });
  });

  it("compact=true:超 40 字标题截断加 …(title 可能是整篇文案)", async () => {
    const longTitle = "这是一条特别长的作品标题,长到像把整篇口播文案都塞进了标题字段里,远超四十个字的展示上限,必须被截断";
    const listProjects = vi.fn(async () => ({
      total: 1,
      rows: [
        {
          id: "p1",
          title: longTitle,
          stage: "publishing",
          status: "published",
          publishedAt: "2026-06-01",
        },
      ],
    }));
    const { deps } = makeDeps({ listProjects });
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.projects"]!, {
      compact: true,
    })) as { items: Array<{ title: string }> };
    expect(result.items[0]!.title).toHaveLength(41); // 40 字 + …
    expect(result.items[0]!.title.endsWith("…")).toBe(true);
    expect(result.items[0]!.title.startsWith("这是一条特别长的作品标题")).toBe(true);
  });

  it("默认(不带 compact)行为不变:limit 20/封顶 50、标题不截", async () => {
    const longTitle = "又".repeat(60);
    const listProjects = vi.fn(async () => ({
      total: 1,
      rows: [
        { id: "p1", title: longTitle, stage: "planning", status: "active", publishedAt: null },
      ],
    }));
    const { deps } = makeDeps({ listProjects });
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.projects"]!, {})) as {
      items: Array<{ title: string }>;
    };
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    expect(result.items[0]!.title).toBe(longTitle); // 不截断
  });

  it("clampContextLimit / compactTitle 纯函数口径", () => {
    expect(clampContextLimit(undefined)).toBe(20);
    expect(clampContextLimit(999)).toBe(50);
    expect(clampContextLimit(undefined, true)).toBe(200);
    expect(clampContextLimit(999, true)).toBe(200);
    expect(clampContextLimit(30, true)).toBe(30);
    expect(compactTitle("短标题")).toBe("短标题");
    expect(compactTitle("超".repeat(41))).toBe(`${"超".repeat(40)}…`);
  });
});

// [T-094] knowledge.distill 工具:蒸馏走 Copilot 对话 —— execute 成功产原子候选;
// 失败(如 MiniMax 内容安全拦截)不抛给 SDK,转人话随结果卡返回(error + suggestSwitchModel)。
describe("[T-094] knowledge.distill 工具 — 对话蒸馏", () => {
  const WHITELIST = ["knowledge.distill"] as const;

  it("execute 调注入的 distillKnowledge,返回原子候选 + 原文(kind=knowledge.distill)", async () => {
    const { deps, distillKnowledge } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = await runExecute(tools["knowledge.distill"]!, {
      content: "  上下文工程是新的护城河。模型不缺聪明,缺的是你的上下文。  ",
    });
    expect(distillKnowledge).toHaveBeenCalledWith({
      content: "上下文工程是新的护城河。模型不缺聪明,缺的是你的上下文。",
    });
    expect(result).toMatchObject({
      kind: "knowledge.distill",
      error: null,
      suggestSwitchModel: false,
      suggestedTags: ["上下文工程"],
      originalText: "上下文工程是新的护城河。模型不缺聪明,缺的是你的上下文。",
      atoms: [
        expect.objectContaining({ type: "claim" }),
        expect.objectContaining({ type: "quote", sourceNote: "作者原话" }),
      ],
    });
  });

  it("蒸馏失败(MiniMax new_sensitive/1026)→ 不抛,error 转人话 + suggestSwitchModel", async () => {
    const { deps } = makeDeps();
    deps.distillKnowledge = async () => {
      throw new Error(
        "Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)",
      );
    };
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["knowledge.distill"]!, {
      content: "一段被平台审核拦截的原文",
    })) as {
      kind: string;
      atoms: unknown[];
      error: string | null;
      suggestSwitchModel: boolean;
      originalText: string;
    };
    expect(result.kind).toBe("knowledge.distill");
    expect(result.atoms).toEqual([]);
    expect(result.error).toContain("内容安全审核");
    expect(result.error).toContain("换一个模型");
    expect(result.suggestSwitchModel).toBe(true);
    // 原文随结果保留(卡上提示「原文还在对话里」语义的数据面)。
    expect(result.originalText).toBe("一段被平台审核拦截的原文");
  });

  it("未知错误 → error 回落原始 message(诚实,不装懂),不建议换模型", async () => {
    const { deps } = makeDeps();
    deps.distillKnowledge = async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:11434");
    };
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["knowledge.distill"]!, {
      content: "原文",
    })) as { error: string | null; suggestSwitchModel: boolean };
    expect(result.error).toBe("ECONNREFUSED 127.0.0.1:11434");
    expect(result.suggestSwitchModel).toBe(false);
  });

  it("空原文 → 诚实报错引导粘贴,不调蒸馏引擎", async () => {
    const { deps, distillKnowledge } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["knowledge.distill"]!, {
      content: "   ",
    })) as { error: string | null };
    expect(distillKnowledge).not.toHaveBeenCalled();
    expect(result.error).toContain("粘进对话");
  });

  it("clampDistillContent:trim + 截 12000 字;非串 → 空串", () => {
    expect(clampDistillContent("  x  ")).toBe("x");
    expect(clampDistillContent(42)).toBe("");
    const long = "长".repeat(MAX_DISTILL_TOOL_CONTENT_CHARS + 10);
    expect(clampDistillContent(long).length).toBe(MAX_DISTILL_TOOL_CONTENT_CHARS);
  });
});

// ── [T-240③] 场景工具白名单(静态层)—— 映射表锚定 + 阶段感知 + 兜底 ─────────────────
describe("[T-240③] getSurfaceToolScope — 场景工具白名单", () => {
  it("映射表每个场景:全部工具名合法(∈ ALL_CHAT_TOOL_NAMES)、无重复、context.* 全量保留(drift guard)", async () => {
    const { SURFACE_TOOL_SCOPES, CONTEXT_TOOL_NAMES } = await import("./chat-tools");
    const contextAll = ALL_CHAT_TOOL_NAMES.filter((n) => n.startsWith("context."));
    expect([...CONTEXT_TOOL_NAMES].sort()).toEqual([...contextAll].sort());
    for (const [surface, scope] of Object.entries(SURFACE_TOOL_SCOPES)) {
      // 工具名全部真实存在(加工具改名忘同步映射表即挂)。
      for (const n of scope) expect(ALL_CHAT_TOOL_NAMES).toContain(n);
      // 无重复。
      expect(new Set(scope).size).toBe(scope.length);
      // context.* 只读全量保留(读上下文无害,S1 无稿门依赖它找真稿)。
      for (const n of contextAll) {
        expect(scope, `${surface} 缺只读工具 ${n}`).toContain(n);
      }
      // material.* + web.read 全场景保留(任何场景都可能中途搜素材)。
      for (const n of ["material.gather", "material.screenshot", "web.read", "material.generate"]) {
        expect(scope, `${surface} 缺素材工具 ${n}`).toContain(n);
      }
    }
  });

  it("场景收窄语义:topics 无复盘/审核;review/calibration/positioning 无创作产出;distill 聚焦蒸馏", async () => {
    const { SURFACE_TOOL_SCOPES } = await import("./chat-tools");
    expect(SURFACE_TOOL_SCOPES.topics).not.toContain("review.analyze");
    expect(SURFACE_TOOL_SCOPES.topics).not.toContain("review.script");
    expect(SURFACE_TOOL_SCOPES.review).not.toContain("topic.generate");
    expect(SURFACE_TOOL_SCOPES.review).toContain("review.analyze");
    expect(SURFACE_TOOL_SCOPES.calibration).not.toContain("script.draft");
    expect(SURFACE_TOOL_SCOPES.calibration).toContain("calibration.diagnose");
    expect(SURFACE_TOOL_SCOPES.positioning).toContain("positioning.generate");
    expect(SURFACE_TOOL_SCOPES.positioning).not.toContain("review.analyze");
    expect(SURFACE_TOOL_SCOPES["knowledge-distill"]).toContain("knowledge.distill");
    expect(SURFACE_TOOL_SCOPES["knowledge-distill"]).not.toContain("topic.generate");
    // project 双场景全集(创作 + 审核 + 复盘)。
    expect(SURFACE_TOOL_SCOPES.project).toContain("review.analyze");
    expect(SURFACE_TOOL_SCOPES.project).toContain("review.script");
    expect(SURFACE_TOOL_SCOPES.project).toContain("calibration.diagnose");
  });

  it("阶段感知:project + 明确未发布 → 砍 review.analyze;已发布/未知 → 保留;未知 surface → null(回落全量)", async () => {
    const { getSurfaceToolScope } = await import("./chat-tools");
    expect(
      getSurfaceToolScope("project", { projectPublished: false }),
    ).not.toContain("review.analyze");
    expect(
      getSurfaceToolScope("project", { projectPublished: true }),
    ).toContain("review.analyze");
    expect(
      getSurfaceToolScope("project", { projectPublished: null }),
    ).toContain("review.analyze");
    expect(getSurfaceToolScope("project")).toContain("review.analyze");
    // 未知 surface(global 全局唤醒等)→ null,调用方回落全量(向后兼容兜底)。
    expect(getSurfaceToolScope("global")).toBeNull();
    expect(getSurfaceToolScope("somepane")).toBeNull();
    // 非 project 场景不受 projectPublished 影响(阶段感知只作用于 project 双场景)。
    expect(
      getSurfaceToolScope("review", { projectPublished: false }),
    ).toContain("review.analyze");
  });
});
