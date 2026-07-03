import { describe, it, expect, vi } from "vitest";
import type { Tool } from "ai";
import {
  buildChatTools,
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
  const gatherMaterials = vi.fn(async () => [
    {
      title: "RAG 落地案例",
      url: "https://example.com",
      source: "案例",
      whyRelevant: "同赛道",
      category: "案例",
    },
  ]);
  const generateHooks = vi.fn(async () => [
    { text: "你们公司那堆文档,90% 没人看", angle: "反常识断言" },
  ]);
  const deps: ChatToolDeps = {
    generateTopics,
    enrichTopic,
    generateHooks,
    draftScript,
    gatherMaterials,
    diagnoseContent,
    analyzeReview,
    generatePositioning,
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
      items: [expect.objectContaining({ title: "反直觉开头" })],
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
