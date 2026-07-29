import { describe, it, expect, beforeEach, vi } from "vitest";

// /api/chat 路由单测(SPEC §7「/api/chat 装配」+ 鉴权 + 持久化 wiring)。
// 真正的流式由 chat-runner.runChatStream 负责(那层另有装配单测;真跑需 dev server + key)。
// 这里 mock 掉 runChatStream + 组合根 getter,断言路由:鉴权门、ChatContext 默认、会话/消息
// 持久化(ai_conversations/ai_messages)、把流式响应透传(toUIMessageStreamResponse)。

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const createConversation = vi.fn();
const createMessage = vi.fn();
const appendAssistantMessage = vi.fn();
// [T-096] 续接校验读会话 scope 用。
const getConversation = vi.fn();
// [T-239f] user 去重的历史读(兜底路径:无 trigger 的老客户端按「最后一条=同内容 user 行」判)。
const listMessages = vi.fn();
const runChatStream = vi.fn();
const dispatchDouyinShare = vi.fn();
const resolveEffectiveSkillSnapshot = vi.fn();
const runWithEffectiveSkillSnapshot = vi.hoisted(() =>
  vi.fn(
    async (_snapshot: unknown, execute: () => Promise<unknown>) => execute(),
  ),
);

// [T-128] 捕获路由传给 toUIMessageStreamResponse 的 init(headers + onFinish),让测试能手动
// 触发 onFinish 断言 assistant 回复(text + parts)落库。[T-239c] onFinish 现带 isAborted。
let capturedStreamInit:
  | {
      headers?: Record<string, string>;
      consumeSseStream?: unknown;
      onError?: (error: unknown) => string;
      onFinish?: (e: {
        responseMessage: unknown;
        isAborted?: boolean;
      }) => Promise<void> | void;
    }
  | null = null;

vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getChatRuntime: async () => ({
    ai: {
      createConversation,
      createMessage,
      appendAssistantMessage,
      getConversation,
      listMessages,
    },
    resolveEffectiveSkillSnapshot,
    resolveModelSpec: vi.fn(),
    dispatchDouyinShare,
    context: {
      positioning: {},
      learnings: {},
      signals: {},
      knowledge: {},
    },
  }),
}));

vi.mock("@creatoros/backend/modules/ai-runtime", () => ({
  resolveSkillForSurface: (surface: string) =>
    surface === "review" ? "chatbox.review" : "chatbox.topic",
  runChatStream: (...args: unknown[]) => runChatStream(...args),
  formatErrorDiagnostic: () => "class=Error reason=unknown",
}));

vi.mock("@creatoros/ai-worker", () => ({
  runWithEffectiveSkillSnapshot,
}));

// readSessionCookie reads the cookie header; keep the real impl (it's pure).
import {
  POST,
  deriveConversationTitle,
  runWithChatChildSkillSnapshot,
} from "./route";

function chatReq(body: unknown, cookie?: string): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

// A minimal UIMessage (user) the way useChat posts it.
function userMessage(text: string) {
  return { id: "u-1", role: "user", parts: [{ type: "text", text }] };
}

beforeEach(() => {
  resolveContextFromToken.mockReset();
  resolveContextFromToken.mockResolvedValue({ userId: "u-1" });
  resolveLocalContext.mockReset();
  resolveLocalContext.mockResolvedValue({ userId: "u-1" });
  createConversation.mockReset();
  createConversation.mockResolvedValue({ id: "conv-1" });
  getConversation.mockReset();
  getConversation.mockResolvedValue({ id: "conv-existing", scope: "global" });
  createMessage.mockReset();
  createMessage.mockResolvedValue({ id: "m-1" });
  listMessages.mockReset();
  listMessages.mockResolvedValue([]);
  appendAssistantMessage.mockReset();
  appendAssistantMessage.mockResolvedValue({ id: "m-2" });
  resolveEffectiveSkillSnapshot.mockReset();
  resolveEffectiveSkillSnapshot.mockResolvedValue({
    snapshotVersion: 1,
    userId: "u-1",
    accountId: "acct-1",
    skills: [],
  });
  runWithEffectiveSkillSnapshot.mockClear();
  runChatStream.mockReset();
  dispatchDouyinShare.mockReset();
  capturedStreamInit = null;
  // Default: a stream result whose toUIMessageStreamResponse captures its init(headers +
  // [T-128] onFinish 持久化回调)并返回普通 Response。
  runChatStream.mockResolvedValue({
    toUIMessageStreamResponse: (init?: {
      headers?: Record<string, string>;
      consumeSseStream?: unknown;
      onError?: (error: unknown) => string;
      onFinish?: (e: {
        responseMessage: unknown;
        isAborted?: boolean;
      }) => Promise<void> | void;
    }) => {
      capturedStreamInit = init ?? null;
      return new Response("stream", { status: 200, headers: init?.headers });
    },
  });
});

it("[T-546/T-513] 对话子 Skill 用路由同一快照作用域，不委托另一份 runtime ALS", async () => {
  const childSnapshot = {
    snapshotVersion: 1,
    userId: "u-1",
    accountId: "acct-1",
    skills: [{ skillId: "topic.generate" }],
  };
  resolveEffectiveSkillSnapshot.mockResolvedValueOnce(childSnapshot);
  const execute = vi.fn(async () => "topic-ok");
  const childContext = {
    userId: "u-1",
    accountId: "acct-1",
    requestId: "req-t546-skill",
    source: "user" as const,
  };

  await expect(
    runWithChatChildSkillSnapshot(
      { resolveEffectiveSkillSnapshot },
      childContext,
      ["topic.generate"],
      execute,
    ),
  ).resolves.toBe("topic-ok");
  expect(resolveEffectiveSkillSnapshot).toHaveBeenCalledWith(
    childContext,
    ["topic.generate"],
  );
  expect(runWithEffectiveSkillSnapshot).toHaveBeenCalledWith(
    childSnapshot,
    execute,
  );
});

// ── [T-267②] 会话标题净化:斜杠命令 / 裸路径不当标题 ──────────────────────────────
describe("[T-267②] deriveConversationTitle — 标题净化", () => {
  it("普通消息 → 取前 24 字(原行为)", () => {
    expect(deriveConversationTitle("基于评论出 5 个选题")).toBe(
      "基于评论出 5 个选题",
    );
    const long = "一".repeat(40);
    expect(deriveConversationTitle(long)).toHaveLength(24);
  });

  it("空 / 纯空白 → 「新对话」占位", () => {
    expect(deriveConversationTitle("")).toBe("新对话");
    expect(deriveConversationTitle("   ")).toBe("新对话");
  });

  it("斜杠命令 + 路径参数(用户实测坑)→ 取文件名(basename),不用命令 / 路径原文", () => {
    // `/cheat-predict scripts/2026-07-12_x.md` → basename「2026-07-12_x.md」。
    expect(
      deriveConversationTitle("/cheat-predict scripts/2026-07-12_x.md"),
    ).toBe("2026-07-12_x.md");
  });

  it("裸绝对 / 相对路径开头 → 取文件名", () => {
    expect(deriveConversationTitle("/Users/me/notes/plan.md 帮我看看")).toBe(
      "plan.md",
    );
    expect(deriveConversationTitle("scripts/foo.md")).toBe("foo.md");
    expect(deriveConversationTitle("./a/b/draft.txt")).toBe("draft.txt");
  });

  it("斜杠命令但无可辨识文件名 → 「新对话」占位(绝不用命令原文)", () => {
    expect(deriveConversationTitle("/cheat-status")).toBe("新对话");
    expect(deriveConversationTitle("/cheat-seed 帮我找选题")).toBe("新对话");
  });

  it("普通句子里顺带提到路径(非开头)→ 仍取前 24 字,不误当路径", () => {
    const t = deriveConversationTitle("帮我分析 scripts/foo.md 这个脚手架");
    expect(t.startsWith("帮我分析")).toBe(true);
  });
});

describe("POST /api/chat — 鉴权门", () => {
  // [T-046 单机免登录] 无 cookie 不再 401 —— 以本机主用户直通,装配照常触达。
  it("无 session cookie → 200 直通本机主用户(T-046,装配照常)", async () => {
    const res = await POST(chatReq({ messages: [userMessage("hi")] }));
    expect(res.status).toBe(200);
    expect(resolveLocalContext).toHaveBeenCalledTimes(1);
    expect(runChatStream).toHaveBeenCalledTimes(1);
  });

  it("非法 JSON body → 400", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "creatoros_session=t" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat — 装配 + 持久化", () => {
  it("有 cookie → 持久化会话+用户消息,委派 runChatStream,透传流式响应 + 会话头", async () => {
    const res = await POST(
      chatReq(
        { messages: [userMessage("基于评论出 5 个选题")], chatContext: { surface: "topics" } },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(200);
    // 会话头回带(客户端可复用)。
    expect(res.headers.get("x-conversation-id")).toBe("conv-1");

    // 持久化:lazy 建会话 + 落最新一条用户消息(SPEC §3.3 消息落 ai_conversations/ai_messages)。
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      { content: "基于评论出 5 个选题" },
    );

    // 委派装配:runChatStream 收到 messages + chatContext(surface)。
    expect(resolveEffectiveSkillSnapshot).toHaveBeenCalledWith(
      { userId: "u-1" },
      ["chatbox.topic"],
    );
    expect(runChatStream).toHaveBeenCalledTimes(1);
    const [, input] = runChatStream.mock.calls[0];
    expect(input.chatContext.surface).toBe("topics");
    expect(input.messages).toHaveLength(1);
    const [, , deps] = runChatStream.mock.calls[0];
    expect(deps.dispatchDouyinSharePort).toBe(dispatchDouyinShare);

    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exposed = capturedStreamInit?.onError?.(
      new Error(
        "raw-error opaque-model opaque-secret https://opaque.example/v1 response-body",
      ),
    );
    expect(exposed).toBe("模型调用失败，请稍后重试。");
    const logSnapshot = JSON.stringify(consoleSpy.mock.calls);
    expect(logSnapshot).toContain("provider_stream_error");
    expect(logSnapshot).not.toMatch(
      /opaque-model|opaque-secret|opaque\.example|response-body|raw-error/,
    );
    consoleSpy.mockRestore();
  });

  it("[T-267②] 首条消息是斜杠命令+路径 → lazy 建会话用净化后的标题(文件名),不用路径原文", async () => {
    await POST(
      chatReq(
        { messages: [userMessage("/cheat-predict scripts/2026-07-12_x.md")] },
        "creatoros_session=tok",
      ),
    );
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1" },
      expect.objectContaining({ title: "2026-07-12_x.md" }),
    );
  });

  it("缺 chatContext.surface → 默认 topics(选题编导)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, input] = runChatStream.mock.calls[0];
    expect(input.chatContext.surface).toBe("topics");
  });

  it("复用传入的 conversationId(不新建会话)", async () => {
    await POST(
      chatReq(
        { messages: [userMessage("hi")], conversationId: "conv-existing" },
        "creatoros_session=tok",
      ),
    );
    expect(createConversation).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-existing",
      { content: "hi" },
    );
  });

  it("[T-128] onFinish 把 assistant 文本 + 完整 parts(含 tool-result 卡)落 appendAssistantMessage", async () => {
    // 路由把 assistant 持久化放进 toUIMessageStreamResponse 的 onFinish —— 那里拿得到 SDK 组装好的
    // responseMessage.parts(text + tool-result 卡数据)。手动触发,断言 text + parts 一并落库
    // (刷新恢复据 parts 重建候选卡/素材卡/审核报告卡,不再丢卡)。
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const parts = [
      { type: "text", text: "给你 3 个选题" },
      {
        type: "tool-topic.generate",
        toolCallId: "tc-1",
        state: "output-available",
        input: {},
        output: { kind: "topic.candidates", items: [{ title: "A" }] },
      },
    ];
    expect(capturedStreamInit?.onFinish).toBeTypeOf("function");
    await capturedStreamInit!.onFinish!({
      responseMessage: { id: "m-2", role: "assistant", parts },
    });
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "给你 3 个选题",
      parts,
    );
  });

  it("[T-128/T-464] 纯空轮 → 落一条兜底提示 assistant 消息(而非静默空气泡)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    await capturedStreamInit!.onFinish!({
      responseMessage: {
        id: "m-x",
        role: "assistant",
        parts: [{ type: "step-start" }],
      },
    });
    // T-464 修:非中断空轮不再 silent return,而是落一条含"AI 未返回任何内容"的信封,
    //   让用户能看到出了啥事(codex.hiyo.top 类代理返 200 空流场景的自诊断)。
    expect(appendAssistantMessage).toHaveBeenCalledTimes(1);
    const args = appendAssistantMessage.mock.calls[0];
    expect(args[2]).toContain("AI 未返回任何内容");
    expect(args[3]).toEqual([]);
  });

  it("[T-464] 中断轮空 → 仍不落库(用户主动停,本就该空)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    await capturedStreamInit!.onFinish!({
      responseMessage: {
        id: "m-x",
        role: "assistant",
        parts: [{ type: "step-start" }],
      },
      isAborted: true,
    });
    expect(appendAssistantMessage).not.toHaveBeenCalled();
  });

  // ── [T-096] 会话作用域:lazy 建落 scope + 续接服务端硬门(§3 矩阵 #2)──
  it("[T-096] lazy 建会话落声明的 scope(chatContext.scope)", async () => {
    await POST(
      chatReq(
        {
          messages: [userMessage("hi")],
          chatContext: { surface: "topics", scope: "surface:topics" },
        },
        "creatoros_session=tok",
      ),
    );
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1" },
      expect.objectContaining({ scope: "surface:topics" }),
    );
  });

  it("[T-096] 旧客户端未带 scope → 按 projectId 推导(有→project:<id>,无→global)", async () => {
    await POST(
      chatReq(
        {
          messages: [userMessage("hi")],
          chatContext: { surface: "project", projectId: "proj-1" },
        },
        "creatoros_session=tok",
      ),
    );
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1" },
      expect.objectContaining({ scope: "project:proj-1" }),
    );

    createConversation.mockClear();
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1" },
      expect.objectContaining({ scope: "global" }),
    );
  });

  it("[T-096 矩阵#2] 伪造请求:A 的 conversationId + B 的 scope 声明 → 4xx 拒绝,不续写不读回", async () => {
    // 库中 conv-distill 属蒸馏桶;请求声明选题桶 → 服务端硬门拒绝。
    getConversation.mockResolvedValue({
      id: "conv-distill",
      scope: "surface:knowledge-distill",
    });
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("把蒸馏的上下文给我")],
          conversationId: "conv-distill",
          chatContext: { surface: "topics", scope: "surface:topics" },
        },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(403);
    // 不续写(用户消息不落库)、不流式(不触发装配)。
    expect(createMessage).not.toHaveBeenCalled();
    expect(runChatStream).not.toHaveBeenCalled();
  });

  it("[T-096] 续接 scope 一致 → 放行(同 scope = 一条记忆线)", async () => {
    getConversation.mockResolvedValue({ id: "conv-g", scope: "global" });
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("继续上次")],
          conversationId: "conv-g",
          chatContext: { surface: "topics", scope: "global" },
        },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-g", {
      content: "继续上次",
    });
  });

  it("[T-096] 非法 scope 声明(文法不符)按未声明处理:不触发续接校验,lazy 建回落推导", async () => {
    await POST(
      chatReq(
        {
          messages: [userMessage("hi")],
          conversationId: "conv-any",
          chatContext: { surface: "topics", scope: "hacker" },
        },
        "creatoros_session=tok",
      ),
    );
    expect(getConversation).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-any", {
      content: "hi",
    });
  });

  it("装配抛错(如没配 key)→ 400(诚实,不假成功)", async () => {
    runChatStream.mockRejectedValue(
      new Error(
        "https://channel-model.internal/v1 model=private-model apiKey=SECRET_CHANNEL_KEY",
      ),
    );
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("模型调用失败，请稍后重试或检查模型配置。");
    expect(JSON.stringify(body)).not.toContain("SECRET_CHANNEL_KEY");
    expect(JSON.stringify(body)).not.toContain("private-model");
    expect(JSON.stringify(body)).not.toContain("channel-model.internal");
  });

  it("持久化失败不阻断流式(best-effort)—— 仍委派 runChatStream 并返回 200", async () => {
    createMessage.mockRejectedValue(new Error("db down"));
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(200);
    expect(runChatStream).toHaveBeenCalledTimes(1);
  });
});

// ── [T-239c S2] 中断真一致:signal 贯通 + 中断轮部分产出落库 ─────────────────────────
describe("[T-239c] POST /api/chat — 中断真一致", () => {
  it("req.signal 贯通到 runChatStream(input.abortSignal)—— 用户点「停止」服务端立停", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, input] = runChatStream.mock.calls[0];
    // Request.signal 是 AbortSignal 实例,原样透传给 streamText。
    expect(input.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("挂 consumeSseStream 兜底消费 —— 客户端断开后 onFinish 仍能触发(中断落库前提)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(capturedStreamInit?.consumeSseStream).toBeTypeOf("function");
  });

  it("中断轮(isAborted=true)→ 部分文本+已完成 tool parts 带 aborted 标记落库(刷新后该轮仍在)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const parts = [
      { type: "text", text: "已产出的半截回答" },
      {
        type: "tool-material.gather",
        toolCallId: "tc-1",
        state: "output-available",
        input: {},
        output: { kind: "material.gather", items: [], grounding: "web" },
      },
    ];
    await capturedStreamInit!.onFinish!({
      responseMessage: { id: "m-a", role: "assistant", parts },
      isAborted: true,
    });
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "已产出的半截回答",
      parts,
      { aborted: true },
    );
  });

  it("中断轮毫无产出(无文本无 tool part)→ 不落空气泡", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    await capturedStreamInit!.onFinish!({
      responseMessage: { id: "m-a", role: "assistant", parts: [{ type: "step-start" }] },
      isAborted: true,
    });
    expect(appendAssistantMessage).not.toHaveBeenCalled();
  });
});

// ── [T-239e] 用量可见:onUsage 回报的 tokens 随 assistant 落库 ────────────────────────
describe("[T-239e] POST /api/chat — usage 落库", () => {
  it("runChatStream 收到 onUsage 回报口;回报后 onFinish 落库带 usage + modelKey", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, input] = runChatStream.mock.calls[0];
    expect(input.onUsage).toBeTypeOf("function");
    // 模拟 chat-runner 流式中回报累计用量(finish 时的权威值)。
    input.onUsage({
      inputTokens: 2100,
      outputTokens: 480,
      cachedTokens: 1500,
      modelKey: "deepseek-chat",
    });
    await capturedStreamInit!.onFinish!({
      responseMessage: {
        id: "m-2",
        role: "assistant",
        parts: [{ type: "text", text: "好的" }],
      },
    });
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "好的",
      [{ type: "text", text: "好的" }],
      {
        usage: { inputTokens: 2100, outputTokens: 480, cachedTokens: 1500 },
        modelKey: "deepseek-chat",
      },
    );
  });

  it("中断轮也带已回报的 usage(aborted 与 usage 并存)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, input] = runChatStream.mock.calls[0];
    input.onUsage({
      inputTokens: 900,
      outputTokens: 120,
      cachedTokens: 0,
      modelKey: "glm-4",
    });
    await capturedStreamInit!.onFinish!({
      responseMessage: {
        id: "m-a",
        role: "assistant",
        parts: [{ type: "text", text: "半截" }],
      },
      isAborted: true,
    });
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "半截",
      [{ type: "text", text: "半截" }],
      {
        aborted: true,
        usage: { inputTokens: 900, outputTokens: 120, cachedTokens: 0 },
        modelKey: "glm-4",
      },
    );
  });

  it("整轮没回报 usage → 维持 4 参调用(不带空 opts,老语义原样)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    await capturedStreamInit!.onFinish!({
      responseMessage: {
        id: "m-2",
        role: "assistant",
        parts: [{ type: "text", text: "无用量轮" }],
      },
    });
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "无用量轮",
      [{ type: "text", text: "无用量轮" }],
    );
  });
});

// ── [T-239f S6] regenerate 幂等:user 消息不重复落库 ────────────────────────────────
describe("[T-239f] POST /api/chat — user 消息去重", () => {
  it("trigger='regenerate-message'(useChat regenerate 重发同一条 user)→ 不重复 insert,流式照跑", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("hi")],
          conversationId: "conv-existing",
          trigger: "regenerate-message",
          messageId: "u-1",
        },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(200);
    expect(createMessage).not.toHaveBeenCalled();
    expect(runChatStream).toHaveBeenCalledTimes(1);
  });

  it("兜底(无 trigger 的老客户端):续接会话且库中最后一条=同内容 user 行 → 不重插", async () => {
    listMessages.mockResolvedValue([
      { id: "m-0", role: "assistant", content: "上一轮回答" },
      { id: "m-1", role: "user", content: "hi" },
    ]);
    await POST(
      chatReq(
        { messages: [userMessage("hi")], conversationId: "conv-existing" },
        "creatoros_session=tok",
      ),
    );
    expect(createMessage).not.toHaveBeenCalled();
    expect(runChatStream).toHaveBeenCalledTimes(1);
  });

  it("兜底不误伤:最后一条是 assistant(正常新一轮,即使内容与更早 user 相同)→ 照常 insert", async () => {
    listMessages.mockResolvedValue([
      { id: "m-1", role: "user", content: "hi" },
      { id: "m-2", role: "assistant", content: "答" },
    ]);
    await POST(
      chatReq(
        { messages: [userMessage("hi")], conversationId: "conv-existing" },
        "creatoros_session=tok",
      ),
    );
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-existing", {
      content: "hi",
    });
  });

  it("兜底读历史失败(best-effort)→ 照常 insert(宁多勿丢,不阻断)", async () => {
    listMessages.mockRejectedValue(new Error("db down"));
    await POST(
      chatReq(
        { messages: [userMessage("hi")], conversationId: "conv-existing" },
        "creatoros_session=tok",
      ),
    );
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("首轮新会话(无 conversationId)不读历史,直接落 user 消息", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(listMessages).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledTimes(1);
  });
});
