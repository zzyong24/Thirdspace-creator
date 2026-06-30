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
    ...over,
  };
  return { deps, resolveModelSpec };
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

  it("工具白名单层:挂上 chatbox.topic 的白名单工具(topic.generate + topic.enrich)", async () => {
    const { deps } = makeDeps();
    const a = await buildChatAssembly(ctx, { surface: "topics" }, deps);
    expect(Object.keys(a.tools).sort()).toEqual([
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
});
