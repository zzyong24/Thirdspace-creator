import { describe, it, expect, vi, beforeAll } from "vitest";
import { registerAllTemplates } from "@creatoros/ai-worker";
import { buildChatAssembly, type AssembleChatDeps } from "./chat-runner";
import type { ChatContext } from "./chat-context";

// /api/chat 装配单测(SPEC §7「/api/chat 装配:resolve skill + 注入 context + tools 挂载」+
// 「ChatContext 三层注入选对 skill」)。
//
// 不真跑模型:resolveModelSpec 给 fake spec(不会真连厂商),context readers 给 fake brief。
// buildChatAssembly 内部经 ai-worker.modelFor(spec) 造一个 LanguageModel 对象(不发请求,
// 只是 provider 句柄),故装配可单测;真正的 streamText(流式)需 dev server + key,本环境不跑。

const ctx = { userId: "u-1", correlationId: "c-1" } as never;

const FAKE_SPEC = {
  apiFormat: "anthropic" as const,
  baseUrl: null,
  model: "claude-test",
  token: "sk-test", // 不会真用 —— buildChatAssembly 不发请求,只造 provider 句柄。
};

function makeDeps(over: Partial<AssembleChatDeps> = {}): {
  deps: AssembleChatDeps;
  resolveModelSpec: ReturnType<typeof vi.fn>;
} {
  const resolveModelSpec = vi.fn(async () => FAKE_SPEC);
  const deps: AssembleChatDeps = {
    resolveModelSpec,
    positioning: {
      getPositioningCenter: async () => ({
        profile: {
          persona: "硬核创作者",
          field: "AI 工程",
          audience: "一线开发者",
          differentiation: "可运行代码",
          capabilities: ["论文拆解"],
        },
        currentStatement: { oneLiner: "把论文落成代码", keywords: ["代码"] },
      }),
    },
    learnings: {
      getSuggestions: async () => [
        { title: "反直觉开头", insight: "对你有效" },
      ],
    },
    signals: {
      list: async () => [
        { source: "douyin_comment", rawText: "怎么落地", demandTag: null },
      ],
    },
    knowledge: {
      list: async () => [{ title: "RAG 实战", knowledgeType: "note" }],
    },
    contextReaders: {
      listProjects: async () => [
        {
          id: "proj-1",
          title: "上下文工程",
          stage: "planning",
          status: "active",
          publishedAt: null,
        },
      ],
      searchKnowledge: async () => [
        { id: "kn-1", title: "RAG 实战", snippet: "检索增强要点" },
      ],
      searchMaterials: async () => [
        { id: "as-1", title: "封面图 A", kind: "image" },
      ],
    },
    ...over,
  };
  return { deps, resolveModelSpec };
}

// 调一个工具的 execute(绕开 SDK execute 的严格泛型,断言行为而非类型)。
async function runToolExecute(
  tool: { execute?: unknown },
  input: unknown,
): Promise<unknown> {
  const exec = tool.execute as (i: unknown, o: unknown) => Promise<unknown>;
  return exec(input, { toolCallId: "tc", messages: [], context: {} });
}

beforeAll(() => {
  // 让 getTemplate("chatbox.topic") / getTools 能取到内置 skill。
  registerAllTemplates();
});

describe("buildChatAssembly — 三层注入装配", () => {
  it("surface=topics → 选 chatbox.topic skill(页面层)", async () => {
    const { deps } = makeDeps();
    const chatContext: ChatContext = { surface: "topics" };
    const a = await buildChatAssembly(ctx, chatContext, deps);
    expect(a.skillId).toBe("chatbox.topic");
  });

  it("未知 surface → 回落 chatbox.topic(路由不崩)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "nope" }, deps);
    expect(a.skillId).toBe("chatbox.topic");
  });

  it("数据层:把非空 CreativeContext facets 注进 system(定位/飞轮/受众信号/知识库)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // skill 自己的 system(选题编导角色)在最前。
    expect(a.system).toContain("选题编导");
    // 数据层 facets 注入。
    expect(a.system).toContain("把论文落成代码"); // 定位
    expect(a.system).toContain("反直觉开头"); // 飞轮
    expect(a.system).toContain("怎么落地"); // 受众信号(真实评论)
    expect(a.system).toContain("RAG 实战"); // 知识库
  });

  it("工具白名单层:挂上 chatbox.topic 的白名单工具(topic.* + 3 个只读 context 工具)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(Object.keys(a.tools).sort()).toEqual([
      "context.knowledge",
      "context.materials",
      "context.projects",
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("按 skill 能力解析 model(resolveModelSpec 被以 topic.generate 调用)", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "topic.generate");
    expect(a.modelSpec).toEqual(FAKE_SPEC);
  });

  it("surface=calibration → chatbox.calibration skill + 挂 calibration.diagnose 工具", async () => {
    const { deps, resolveModelSpec } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "calibration" }, deps);
    expect(a.skillId).toBe("chatbox.calibration");
    expect(Object.keys(a.tools).sort()).toEqual([
      "calibration.diagnose",
      "context.knowledge",
      "context.materials",
      "context.projects",
    ]);
    // 主能力档按 calibration.diagnose 解析(各 surface 复用对应节点的模型配置)。
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "calibration.diagnose");
  });

  it("surface=positioning → chatbox.positioning skill + 挂 positioning.generate 工具", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "positioning" }, deps);
    expect(a.skillId).toBe("chatbox.positioning");
    expect(Object.keys(a.tools).sort()).toEqual([
      "context.knowledge",
      "context.materials",
      "context.projects",
      "positioning.generate",
    ]);
  });

  it("surface=review → chatbox.review skill + 挂 review.analyze 工具", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(a.skillId).toBe("chatbox.review");
    expect(Object.keys(a.tools).sort()).toEqual([
      "context.knowledge",
      "context.materials",
      "context.projects",
      "review.analyze",
    ]);
  });

  it("T-039a:surface=review + projectId → 装配期把 projectId 传给 reviewSubject reader(全链路后端段)", async () => {
    // 注入一个记录入参的 reviewSubject reader:证明 chatContext.projectId 真的流到 assembleCreativeContext
    // (原来 chat-runner 写死 projectId=null → 复盘永远读不到本项目)。有 projectId → reader 被以它调用。
    const seen: string[] = [];
    const reviewSubject = {
      getTitle: async (_c: unknown, projectId: string) => {
        seen.push(projectId);
        return "作品真标题";
      },
      getScript: async (_c: unknown, projectId: string) => {
        seen.push(projectId);
        return "逐字稿正文";
      },
      getMetricsSummary: async () => "播放：1000",
      getComments: async () => ["评论一"],
    };
    const { deps } = makeDeps({ reviewSubject } as Partial<AssembleChatDeps>);
    await buildChatAssembly(
      ctx,
      { surface: "review", projectId: "proj-real-1" },
      deps,
    );
    // reader 被以真实 projectId 调用(证明 projectId 打通到数据层)。
    expect(seen).toContain("proj-real-1");
    expect(seen.every((p) => p === "proj-real-1")).toBe(true);
  });

  it("T-039a:surface=review 但缺 projectId → 不调 reviewSubject reader(诚实兜底,不崩)", async () => {
    const getTitle = vi.fn(async () => "不该被调");
    const reviewSubject = {
      getTitle,
      getScript: vi.fn(async () => ""),
      getMetricsSummary: vi.fn(async () => ""),
      getComments: vi.fn(async () => []),
    };
    const { deps } = makeDeps({ reviewSubject } as Partial<AssembleChatDeps>);
    const a = await buildChatAssembly(ctx, { surface: "review" }, deps);
    expect(getTitle).not.toHaveBeenCalled();
    // 装配仍成功(skill + 工具照常)。
    expect(a.skillId).toBe("chatbox.review");
  });

  it("functionKey 叠加:把命中的专用工具置顶(按钮层,一键岛预调)", async () => {
    const { deps } = makeDeps();
    // 选题编导白名单 [topic.generate, topic.enrich];functionKey=topic.enrich → 置顶。
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "topic.enrich" },
      deps,
    );
    expect(Object.keys(a.tools)[0]).toBe("topic.enrich");
  });

  it("functionKey 越权(不在该 skill 白名单)→ 不挂越权工具(防越权)", async () => {
    const { deps } = makeDeps();
    // 选题页 functionKey 给了校准工具(越权)→ 白名单不变,只挂选题工具 + 只读 context 工具。
    const a = await buildChatAssembly(
      ctx,
      { surface: "topics", functionKey: "calibration.diagnose" },
      deps,
    );
    expect(Object.keys(a.tools).sort()).toEqual([
      "context.knowledge",
      "context.materials",
      "context.projects",
      "topic.enrich",
      "topic.generate",
    ]);
  });

  it("没配 model key(resolveModelSpec 抛错)→ 装配抛出(路由接住返 4xx,不假成功)", async () => {
    const { deps } = makeDeps({
      resolveModelSpec: vi.fn(async () => {
        throw new Error("no LLM credential");
      }),
    });
    await expect(
      buildChatAssembly(ctx, { surface: "topics" }, deps),
    ).rejects.toThrow(/no LLM credential/);
  });

  it("facets 装配失败(reader 抛)不阻断装配 —— 降级为无该 facet 的 system", async () => {
    const { deps } = makeDeps({
      positioning: {
        getPositioningCenter: async () => {
          throw new Error("positioning down");
        },
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    // 定位 facet 缺失,但 skill system + 其它 facet 仍在。
    expect(a.system).toContain("选题编导");
    expect(a.system).not.toContain("把论文落成代码");
    expect(a.system).toContain("反直觉开头");
  });

  it("只读 context 工具 execute → 经 ctx 调注入的 user-scoped 读端口(拉真数据)", async () => {
    const listProjects = vi.fn(async () => [
      {
        id: "proj-1",
        title: "上下文工程",
        stage: "planning",
        status: "active",
        publishedAt: null,
      },
    ]);
    const { deps } = makeDeps({
      contextReaders: {
        listProjects,
        searchKnowledge: async () => [],
        searchMaterials: async () => [],
      },
    });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.projects"], {
      limit: 5,
    })) as { kind: string; items: unknown[] };
    // 读端口收到本请求 ctx(user-scoping 由端口内部据 ctx.userId 收窄)。
    expect(listProjects).toHaveBeenCalledWith(ctx, { limit: 5 });
    expect(result.kind).toBe("context.projects");
    expect(result.items).toHaveLength(1);
  });

  it("contextReaders 未装配 → context 工具读到空(诚实降级,不报错、不塞假数据)", async () => {
    const { deps } = makeDeps({ contextReaders: undefined });
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    const result = (await runToolExecute(a.tools["context.knowledge"], {
      query: "x",
    })) as { kind: string; items: unknown[] };
    expect(result.kind).toBe("context.knowledge");
    expect(result.items).toEqual([]);
  });
});
