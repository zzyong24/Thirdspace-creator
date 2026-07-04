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
  diagnoseContent: ReturnType<typeof vi.fn>;
  analyzeReview: ReturnType<typeof vi.fn>;
  generatePositioning: ReturnType<typeof vi.fn>;
  distillKnowledge: ReturnType<typeof vi.fn>;
  getProjectBrief: ReturnType<typeof vi.fn>;
  listProjects: ReturnType<typeof vi.fn>;
  listComments: ReturnType<typeof vi.fn>;
  searchKnowledge: ReturnType<typeof vi.fn>;
  searchMaterials: ReturnType<typeof vi.fn>;
} {
  const generateTopics = vi.fn(async () => [
    {
      title: "反直觉开头",
      angle: "用数据打破直觉",
      contentRole: "traffic",
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
  const analyzeReview = vi.fn(async () => [
    { title: "前3秒给结果", insight: "完播更高" },
  ]);
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
  const deps: ChatToolDeps = {
    generateTopics,
    enrichTopic,
    generateHooks,
    draftScript,
    gatherMaterials,
    diagnoseContent,
    analyzeReview,
    generatePositioning,
    distillKnowledge,
    getProjectBrief,
    listProjects,
    listComments,
    searchKnowledge,
    searchMaterials,
    ...over,
  };
  return {
    deps,
    generateTopics,
    enrichTopic,
    diagnoseContent,
    analyzeReview,
    generatePositioning,
    distillKnowledge,
    getProjectBrief,
    listProjects,
    listComments,
    searchKnowledge,
    searchMaterials,
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
    expect(tools["topic.enrich"]).toBeUndefined();
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
    const result = await runExecute(tools["topic.generate"], {
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
    await runExecute(tools["topic.generate"], {});
    expect(generateTopics).toHaveBeenCalledWith({ basis: "positioning" });
  });

  it("topic.enrich.execute 调注入的 enrichTopic,返回选题卡候选(kind=topic.card)", async () => {
    const { deps, enrichTopic } = makeDeps();
    const tools = buildChatTools(TOPIC_WHITELIST, deps);
    const result = await runExecute(tools["topic.enrich"], {
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
    const result = (await runExecute(tools["topic.enrich"], {
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
    const result = (await runExecute(tools["calibration.diagnose"], {
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
    const result = (await runExecute(tools["calibration.diagnose"], {
      title: "X",
    })) as { diagnosis: unknown };
    expect(result.diagnosis).toBeNull();
  });

  it("review.analyze.execute 调注入的 analyzeReview,返回经验候选(kind=review.learnings)", async () => {
    const { deps, analyzeReview } = makeDeps();
    const tools = buildChatTools(["review.analyze"], deps);
    const result = (await runExecute(tools["review.analyze"], {
      subject: "我的某条视频",
    })) as { kind: string; items: unknown[] };
    expect(analyzeReview).toHaveBeenCalledWith({ subject: "我的某条视频" });
    expect(result.kind).toBe("review.learnings");
    expect(result.items).toHaveLength(1);
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
    const result = (await runExecute(tools["positioning.generate"], {})) as {
      kind: string;
      suggestion: { oneLiner: string } | null;
    };
    expect(generatePositioning).toHaveBeenCalled();
    expect(result.kind).toBe("positioning.suggestion");
    expect(result.suggestion?.oneLiner).toBe("把论文落成代码");
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
    const result = (await runExecute(tools["context.projects"], {
      limit: 3,
    })) as { kind: string; items: unknown[] };
    expect(listProjects).toHaveBeenCalledWith({ limit: 3, offset: 0 });
    expect(result.kind).toBe("context.projects");
    expect(result.items).toHaveLength(1);
  });

  it("[T-058②] context.projects limit 缺省 20、封顶 50,offset 兜 0", async () => {
    const { deps, listProjects } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    await runExecute(tools["context.projects"], {}); // 缺省 → 20
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
    await runExecute(tools["context.projects"], { limit: 999, offset: 30 }); // 超界 → 50
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 50, offset: 30 });
    await runExecute(tools["context.projects"], { limit: 0, offset: -3 }); // ≤0 → 20/0
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });
  });

  it("[T-058③] context.comments.execute 调 listComments,带 total/hasMore", async () => {
    const { deps, listComments } = makeDeps();
    const tools = buildChatTools(["context.comments"], deps);
    const result = (await runExecute(tools["context.comments"], {})) as {
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
    const result = (await runExecute(tools["context.knowledge"], {
      query: "RAG",
    })) as { kind: string; items: unknown[] };
    expect(searchKnowledge).toHaveBeenCalledWith({ query: "RAG", limit: 20 });
    expect(result.kind).toBe("context.knowledge");
    expect(result.items).toHaveLength(1);
    await runExecute(tools["context.knowledge"], {});
    expect(searchKnowledge).toHaveBeenLastCalledWith({ query: "", limit: 20 });
  });

  it("context.materials.execute 调 searchMaterials(query 缺省空串)", async () => {
    const { deps, searchMaterials } = makeDeps();
    const tools = buildChatTools([...CONTEXT_WHITELIST], deps);
    const result = (await runExecute(tools["context.materials"], {
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
    const result = (await runExecute(tools["context.projects"], {})) as {
      items: unknown[];
    };
    expect(result.items).toEqual([]);
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
    await runExecute(tools["positioning.generate"], {
      extraBrief: "定位应转向 AI 工程实战,粉丝评论都在问落地",
    });
    expect(generatePositioning).toHaveBeenCalledWith({
      extraBrief: "定位应转向 AI 工程实战,粉丝评论都在问落地",
    });
  });

  it("topic.generate:extraBrief 透传到 deps.generateTopics(原 schema 未暴露该参)", async () => {
    const { deps, generateTopics } = makeDeps();
    const tools = buildChatTools([...ALL], deps);
    await runExecute(tools["topic.generate"], {
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
    await runExecute(tools["script.hooks"], {
      topic: "RAG",
      extraBrief: "hook 要带真实数据",
    });
    expect(deps.generateHooks).toHaveBeenCalledWith({
      topic: "RAG",
      direction: undefined,
      extraBrief: "hook 要带真实数据",
    });
    await runExecute(tools["script.draft"], {
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
    await runExecute(tools["calibration.diagnose"], {
      title: "标题",
      extraBrief: "重点看转化引导",
    });
    expect(diagnoseContent).toHaveBeenCalledWith({
      title: "标题",
      script: undefined,
      extraBrief: "重点看转化引导",
    });
    await runExecute(tools["review.analyze"], {
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
    await runExecute(tools["positioning.generate"], {});
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
    await runExecute(tools["context.projects"], { compact: true }); // 缺省 → 200
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 200, offset: 0 });
    await runExecute(tools["context.projects"], { compact: true, limit: 999 });
    expect(listProjects).toHaveBeenLastCalledWith({ limit: 200, offset: 0 });
    await runExecute(tools["context.projects"], { compact: true, limit: 80 });
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
    const result = (await runExecute(tools["context.projects"], {
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
    const result = (await runExecute(tools["context.projects"], {})) as {
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
    const result = await runExecute(tools["knowledge.distill"], {
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
    const result = (await runExecute(tools["knowledge.distill"], {
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
    const result = (await runExecute(tools["knowledge.distill"], {
      content: "原文",
    })) as { error: string | null; suggestSwitchModel: boolean };
    expect(result.error).toBe("ECONNREFUSED 127.0.0.1:11434");
    expect(result.suggestSwitchModel).toBe(false);
  });

  it("空原文 → 诚实报错引导粘贴,不调蒸馏引擎", async () => {
    const { deps, distillKnowledge } = makeDeps();
    const tools = buildChatTools(WHITELIST, deps);
    const result = (await runExecute(tools["knowledge.distill"], {
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
