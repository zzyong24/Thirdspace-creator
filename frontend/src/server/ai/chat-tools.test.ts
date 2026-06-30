import { describe, it, expect, vi } from "vitest";
import type { Tool } from "ai";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";

// 首波工具单测(SPEC §3.4 / §7「工具 execute 复用 runner 产候选」+「tools 挂载」)。
// 不真跑模型:注入 fake 的 generateTopics / enrichTopic,断言
//   1) 白名单过滤:只挂 skill 白名单里、且本切片已实现的工具;
//   2) execute 复用注入的 runner 核心,返回**候选**(非实体)。

function makeDeps(over: Partial<ChatToolDeps> = {}): {
  deps: ChatToolDeps;
  generateTopics: ReturnType<typeof vi.fn>;
  enrichTopic: ReturnType<typeof vi.fn>;
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
  const deps: ChatToolDeps = { generateTopics, enrichTopic, ...over };
  return { deps, generateTopics, enrichTopic };
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

  it("白名单里但本切片未实现的工具(后续波)被跳过,不报错、不挂空壳", () => {
    const { deps } = makeDeps();
    const tools = buildChatTools(
      ["topic.generate", "calibration.diagnose", "review.analyze"],
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
});
