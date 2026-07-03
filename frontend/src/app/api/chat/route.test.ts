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
const runChatStream = vi.fn();

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
    },
    resolveModelSpec: vi.fn(),
    context: {
      positioning: {},
      learnings: {},
      signals: {},
      knowledge: {},
    },
  }),
}));

vi.mock("@/server/ai/chat-runner", () => ({
  runChatStream: (...args: unknown[]) => runChatStream(...args),
}));

// readSessionCookie reads the cookie header; keep the real impl (it's pure).
import { POST } from "./route";

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
  appendAssistantMessage.mockReset();
  appendAssistantMessage.mockResolvedValue({ id: "m-2" });
  runChatStream.mockReset();
  // Default: a stream result whose toUIMessageStreamResponse returns a plain Response.
  runChatStream.mockResolvedValue({
    toUIMessageStreamResponse: (init?: { headers?: Record<string, string> }) =>
      new Response("stream", { status: 200, headers: init?.headers }),
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
    expect(runChatStream).toHaveBeenCalledTimes(1);
    const [, input] = runChatStream.mock.calls[0];
    expect(input.chatContext.surface).toBe("topics");
    expect(input.messages).toHaveLength(1);
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

  it("onFinish 回调把 assistant 文本落 appendAssistantMessage", async () => {
    // 捕获路由传给 runChatStream 的 onFinish,手动触发它,断言落库。
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const onFinish = runChatStream.mock.calls[0][3] as (t: string) => Promise<void>;
    await onFinish("编导的回复");
    expect(appendAssistantMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      "编导的回复",
    );
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
    runChatStream.mockRejectedValue(new Error("no LLM credential"));
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(400);
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
