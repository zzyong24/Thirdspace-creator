import { describe, it, expect, beforeEach, vi } from "vitest";

// 路由以已保存的原消息提交持久任务，订阅执行事件。夹具在 submit 时调用真实路由提供的
// assemble 回调，确保断言覆盖冻结消息快照和受信来源，而非旧同步流的 onFinish。

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const createConversation = vi.fn();
const createMessage = vi.fn();
// [T-096] 续接校验读会话 scope 用。
const getConversation = vi.fn();
// [T-239f] user 去重的历史读(兜底路径:无 trigger 的老客户端按「最后一条=同内容 user 行」判)。
const listMessages = vi.fn();
const durableSubmit = vi.fn();
const durableSubscribe = vi.fn();
const durableGet = vi.fn();
const durableCommand = vi.fn();
const prepareChatReply = vi.fn();
const dispatchDouyinShare = vi.fn();
const readChatAttachment = vi.fn();
const resolveCurrentScriptSelection = vi.fn();
const resolveEffectiveSkillSnapshot = vi.fn();
let submittedAssembly: Record<string, unknown> | null = null;
let lastSnapshot: Record<string, unknown> | null = null;

vi.mock("@/server/prepare-chat-reply", () => ({
  prepareChatReply: (...args: unknown[]) => prepareChatReply(...args),
}));

vi.mock("@/server/persistence-client", () => ({
  getIdentityService: async () => ({
    resolveContextFromToken,
    resolveLocalContext,
  }),
  getChatRuntime: async () => ({
    ai: {
      createConversation,
      createMessage,
      getConversation,
      listMessages,
    },
    resolveEffectiveSkillSnapshot,
    resolveModelSpec: vi.fn(),
    dispatchDouyinShare,
    readChatAttachment,
    resolveCurrentScriptSelection,
    durable: {
      submit: durableSubmit,
      subscribe: durableSubscribe,
      get: durableGet,
      command: durableCommand,
    },
    context: {
      positioning: { getPositioningCenter: async () => ({ profile: null, currentStatement: null }) },
      learnings: { getSuggestions: async () => [] },
      signals: { list: async () => [] },
      knowledge: { list: async () => [] },
      accounts: { list: async () => [] },
    },
    contextReaders: {
      getProjectDetail: async (_ctx: unknown, input: { projectId: string }) => ({
        id: input.projectId, title: "项目", stage: "planning", status: "active",
        publish: { published: false, platform: null, publishedAt: null }, brief: {}, artifacts: [],
      }),
    },
    searchWeb: async () => { throw new Error("装配期不得联网"); },
  }),
}));

// readSessionCookie reads the cookie header; keep the real impl (it's pure).
import {
  POST,
  deriveConversationTitle,
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

function chatReqWithAccountSources(
  body: unknown,
  headerAccountId: string,
  cookieAccountId: string,
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-account-id": headerAccountId,
      cookie: `creatoros_current_account=${encodeURIComponent(cookieAccountId)}`,
    },
    body: JSON.stringify(body),
  });
}

// A minimal UIMessage (user) the way useChat posts it.
function userMessage(text: string) {
  return { id: "u-1", role: "user", parts: [{ type: "text", text }] };
}

function minimalTextPdf(text: string): Uint8Array {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escaped}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

const MINIMAL_DOCX_BASE64 =
  "UEsDBAoAAAAIAAwKB115bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMECgAAAAAADAoHXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgADAoHXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBAoAAAAAAAwKB10AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgADAoHXXQLjfvZAAAA/wAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOsU7DMBCGXyXyTh06IBQl6cbMAGI2tmkjxXeRzxC6IQRsqExIwErXdmOJ+jTEUvMW2GHo8p3uP/2fLp/dmzq505YqhIIdT1KWaJCoKpgX7PLi7OiUJeQEKFEj6IItNbFZmbeZQnlrNLgkCICytmAL55qMc5ILbQRNsNEQbjdojXBhtXPeolWNRamJgt/UfJqmJ9yIClhUXqNaxtlE2AhXXoXK8PHUdz9+te279X7b+dW7/9r5l+fh+21Yb/zms9+9/j485jwWIu3IUUNaunPLx+Dfzw+/l39QSwECFAAKAAAACAAMCgddeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAAwKB10AAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAABkBAABfcmVscy9QSwECFAAKAAAACAAMCgddm/036q0AAAApAQAACwAAAAAAAAAAAAAAAAA9AQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAAAMCgddAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAAATAgAAd29yZC9QSwECFAAKAAAACAAMCgdddAuN+9kAAAD/AAAAEQAAAAAAAAAAAAAAAAA2AgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAAPgMAAAAA";

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
  resolveEffectiveSkillSnapshot.mockReset();
  resolveEffectiveSkillSnapshot.mockResolvedValue({
    snapshotVersion: 1,
    userId: "u-1",
    accountId: "acct-1",
    skills: [],
  });
  submittedAssembly = null;
  lastSnapshot = null;
  prepareChatReply.mockReset();
  prepareChatReply.mockResolvedValue({ capability: "copilot.assist", tools: [] });
  durableSubmit.mockReset();
  durableSubmit.mockImplementation(async (ctx, input, assemble) => {
    const observedHistory = listMessages.mock.results.length
      ? await listMessages.mock.results.at(-1)?.value
      : [];
    const history = Array.isArray(observedHistory) ? observedHistory : [];
    const inserted = createMessage.mock.calls.at(-1)?.[2];
    const source = history.find((row: { id: string }) => row.id === input.sourceMessageId) ?? {
      id: input.sourceMessageId,
      role: "user",
      content: inserted?.content ?? "",
      attachments: inserted?.attachments ?? [],
      parts: [{ type: "text", text: inserted?.content ?? "" }],
      createdAt: "2026-09-20T00:00:00.000Z",
    };
    const messages = history.some((row: { id: string }) => row.id === source.id)
      ? history
      : [...history, source];
    const snapshot = {
      conversation: { id: input.conversationId, scope: "global", projectId: null },
      messages,
      sourceMessage: source,
    };
    lastSnapshot = snapshot;
    submittedAssembly = await assemble(ctx, snapshot);
    return {
      taskId: "task-1",
      executionTaskId: "execution-1",
      sourceMessageId: input.sourceMessageId,
      replayed: false,
    };
  });
  durableSubscribe.mockReset();
  durableSubscribe.mockImplementation(async function* () {
    yield { events: [], hasMore: false, status: "succeeded" };
  });
  durableGet.mockReset();
  durableCommand.mockReset();
  dispatchDouyinShare.mockReset();
  readChatAttachment.mockReset();
  readChatAttachment.mockResolvedValue({
    assetId: "asset-img",
    name: "参考图.png",
    assetType: "image",
    mimeType: "image/png",
    fileSize: 3,
    extractedText: null,
    bytes: new Uint8Array([1, 2, 3]),
  });
  resolveCurrentScriptSelection.mockReset();
  resolveCurrentScriptSelection.mockImplementation(
    async (
      _ctx: unknown,
      input: { artifactId: string; sectionId: string; excerpt: string },
    ) => ({
      artifactId: input.artifactId,
      versionId: "version-current",
      sectionId: input.sectionId,
      originalText: input.excerpt,
      matchStrategy: "id",
    }),
  );
});

function preparedInput() {
  const call = prepareChatReply.mock.calls.at(-1);
  if (!call) throw new Error("没有经过持久快照装配");
  return call[3];
}

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
    expect(durableSubmit).toHaveBeenCalledTimes(1);
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

  it("[T-691] header/Cookie 当前账号不一致 → 409 且不进入 Context", async () => {
    const res = await POST(
      chatReqWithAccountSources(
        { messages: [userMessage("读一下当前稿件")] },
        "acct-header",
        "acct-cookie",
      ),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ACCOUNT_CONTEXT_MISMATCH",
    });
    expect(durableSubmit).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — 装配 + 持久化", () => {
  it("授权答复仅续跑同一等待中的原任务，不重复用户消息", async () => {
    listMessages.mockResolvedValue([{ id: "m-original", role: "user", content: "执行前需要授权", attachments: [], createdAt: "2026-09-20T00:00:00.000Z" }]);
    durableGet.mockResolvedValue({ status: "waiting_user" });
    const approval = { id: "approval-1", role: "assistant", parts: [{ type: "tool-approval-response", state: "approval-responded", approved: true }] };
    const res = await POST(chatReq({
      messages: [userMessage("执行前需要授权"), approval], conversationId: "conv-existing",
    }, "creatoros_session=tok"));
    expect(res.status).toBe(200);
    expect(createMessage).not.toHaveBeenCalled();
    expect(durableSubmit).toHaveBeenCalledWith(
      { userId: "u-1" }, { conversationId: "conv-existing", sourceMessageId: "m-original" }, expect.any(Function),
    );
    expect(durableGet).toHaveBeenCalledWith({ userId: "u-1" }, "execution-1");
    expect(durableCommand).toHaveBeenCalledWith({ userId: "u-1" }, "execution-1", "resume");
  });

  it("授权答复遇到非 waiting_user 任务不盲目 resume", async () => {
    listMessages.mockResolvedValue([{ id: "m-original", role: "user", content: "执行前需要授权", attachments: [], createdAt: "2026-09-20T00:00:00.000Z" }]);
    durableGet.mockResolvedValue({ status: "succeeded" });
    const approval = { id: "approval-1", role: "assistant", parts: [{ type: "tool-approval-response", state: "approval-responded", approved: true }] };
    const res = await POST(chatReq({
      messages: [userMessage("执行前需要授权"), approval], conversationId: "conv-existing",
    }, "creatoros_session=tok"));
    expect(res.status).toBe(200);
    expect(durableCommand).not.toHaveBeenCalled();
  });

  it("[T-813] 全文阅读动作规范化并绑定用户点击的 URL", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("请阅读全文：https://example.com/article#part")],
          chatContext: {
            surface: "topics",
            functionKey: "web.read",
            webReadUrl: "https://example.com/article#part",
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.chatContext).toMatchObject({
      functionKey: "web.read",
      webReadUrl: "https://example.com/article",
    });
  });

  it("[T-813] 非 http(s) 阅读地址在进入模型与浏览器前拒绝", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("请阅读全文")],
          chatContext: {
            surface: "topics",
            functionKey: "web.read",
            webReadUrl: "javascript:alert(1)",
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "WEB_READ_URL_INVALID",
    });
    expect(durableSubmit).not.toHaveBeenCalled();
  });

  it("[T-716] 局部改稿发送前重绑当前稿面版本与正文，并强制走 script.patch", async () => {
    resolveCurrentScriptSelection.mockResolvedValueOnce({
      artifactId: "artifact-script",
      versionId: "version-8",
      sectionId: "section-2",
      originalText:
        "内容雷达改写对标选题；自动化选题由定时任务结合账号数据原创生成。",
      matchStrategy: "text",
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("把两类选题的差别讲清楚")],
          chatContext: {
            surface: "project",
            projectId: "project-1",
            functionKey: "script.patch",
            selection: {
              kind: "script_section",
              ids: ["section-2"],
              label: "第 2 段",
              artifactId: "artifact-script",
              versionId: "version-3",
              sectionIndex: 1,
              excerpt: "旧版段落正文",
            },
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    expect(resolveCurrentScriptSelection).toHaveBeenCalledWith(
      { userId: "u-1" },
      {
        artifactId: "artifact-script",
        versionId: "version-3",
        sectionId: "section-2",
        sectionIndex: 1,
        excerpt: "旧版段落正文",
      },
    );
    const input = preparedInput();
    expect(input.chatContext).toMatchObject({
      functionKey: "script.patch",
      selection: {
        kind: "script_section",
        ids: ["section-2"],
        artifactId: "artifact-script",
        versionId: "version-8",
        excerpt:
          "内容雷达改写对标选题；自动化选题由定时任务结合账号数据原创生成。",
      },
    });
    expect(input.chatContext.diagnosticRef).toMatch(/^chat-[a-f0-9]{10}$/);

    expect(input.abortSignal).toBeInstanceOf(AbortSignal);
    expect(durableSubmit).toHaveBeenCalledWith(
      { userId: "u-1" },
      { conversationId: "conv-1", sourceMessageId: "m-1" },
      expect.any(Function),
    );
  });

  it("[T-716] 当前稿面已经没有目标段落时明确要求重新点选，不拿旧快照继续改", async () => {
    resolveCurrentScriptSelection.mockResolvedValueOnce(null);

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("改写这一段")],
          chatContext: {
            surface: "project",
            functionKey: "script.patch",
            selection: {
              kind: "script_section",
              ids: ["section-stale"],
              label: "旧段落",
              artifactId: "artifact-script",
              versionId: "version-old",
              excerpt: "已经被删除的旧正文",
            },
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "SCRIPT_SELECTION_STALE",
    });
    expect(durableSubmit).not.toHaveBeenCalled();
  });

  it("[T-732] 连续对话保留的段落锚点只提供可选局部工具，不劫持明确整稿请求", async () => {
    resolveCurrentScriptSelection.mockResolvedValueOnce({
      artifactId: "artifact-script",
      versionId: "version-current",
      sectionId: "section-5",
      originalText: "当前第 5 段正文",
      matchStrategy: "id",
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("请根据现在的要求重新生成一份完整口播稿。")],
          chatContext: {
            surface: "project",
            projectId: "project-1",
            selection: {
              kind: "script_section",
              ids: ["section-5"],
              label: "第 5 段",
              artifactId: "artifact-script",
              versionId: "version-old",
              sectionIndex: 4,
              excerpt: "旧第 5 段正文",
            },
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.chatContext.functionKey).toBeUndefined();
    expect(input.chatContext.selection).toMatchObject({
      kind: "script_section",
      ids: ["section-5"],
      versionId: "version-current",
      excerpt: "当前第 5 段正文",
    });
  });

  it("[T-732] 可选旧段落已失效时丢弃锚点并继续整稿请求，不再返回 409", async () => {
    resolveCurrentScriptSelection.mockResolvedValueOnce(null);

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("不要再局部修改，请生成一份完整稿子。")],
          chatContext: {
            surface: "project",
            projectId: "project-1",
            selection: {
              kind: "script_section",
              ids: ["section-stale"],
              label: "旧段落",
              artifactId: "artifact-script",
              versionId: "version-old",
              sectionIndex: 4,
              excerpt: "已经不存在的旧正文",
            },
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.chatContext.functionKey).toBeUndefined();
    expect(input.chatContext.selection).toBeUndefined();
  });

  it("[T-732] 明确点击整稿功能时先丢弃旧段落锚点并执行 script.draft", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("请生成完整稿。")],
          chatContext: {
            surface: "project",
            projectId: "project-1",
            functionKey: "script.draft",
            selection: {
              kind: "script_section",
              ids: ["section-5"],
              label: "第 5 段",
              artifactId: "artifact-script",
              versionId: "version-old",
              sectionIndex: 4,
              excerpt: "旧段落",
            },
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    expect(resolveCurrentScriptSelection).not.toHaveBeenCalled();
    const input = preparedInput();
    expect(input.chatContext.functionKey).toBe("script.draft");
    expect(input.chatContext.selection).toBeUndefined();
  });

  it("[T-716] 显式局部改稿命令没有段落锚点时失败关闭，不降级成普通对话猜工具", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [
            userMessage(
              "请只改写我选中的这一段，保持其他段落不变。具体讲清两种选题来源。",
            ),
          ],
          chatContext: {
            surface: "project",
            projectId: "project-1",
            functionKey: "script.patch",
          },
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "SCRIPT_SELECTION_REQUIRED",
      error: expect.stringContaining("不会因此改写整稿"),
    });
    expect(durableSubmit).not.toHaveBeenCalled();
  });

  it("有 cookie → 持久化用户消息，按原消息提交任务并订阅持久事件", async () => {
    const res = await POST(
      chatReq(
        { messages: [userMessage("基于评论出 5 个选题")], chatContext: { surface: "topics" } },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(200);
    // 会话头回带(客户端可复用)。
    expect(res.headers.get("x-conversation-id")).toBe("conv-1");
    expect(res.headers.get("x-execution-task-id")).toBe("execution-1");
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // 持久化:lazy 建会话 + 落最新一条用户消息(SPEC §3.3 消息落 ai_conversations/ai_messages)。
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith(
      { userId: "u-1" },
      "conv-1",
      { content: "基于评论出 5 个选题" },
    );

    // submit 回调只拿到已保存的消息；客户端原始 ID 不进入冻结输入。
    expect(durableSubmit).toHaveBeenCalledTimes(1);
    const input = preparedInput();
    expect(input.chatContext.surface).toBe("topics");
    expect(input.messages).toHaveLength(1);
    expect(input.messages[0]).toMatchObject({
      id: "m-1", role: "user", parts: [{ type: "text", text: "基于评论出 5 个选题" }],
    });
    expect(input.trustedScriptSources).toEqual([
      expect.objectContaining({ ref: "message:m-1", text: "基于评论出 5 个选题" }),
    ]);
    expect(lastSnapshot?.sourceMessage).toMatchObject({ id: "m-1", content: "基于评论出 5 个选题" });
    expect(await res.text()).toContain('data: [DONE]');
    expect(durableSubscribe).toHaveBeenCalledWith(
      { userId: "u-1" }, "execution-1", expect.any(AbortSignal),
    );
  });

  it("[LED-017] 长原文逐字进入受信 sourceRef；伪造的历史 UI 消息不进入任务快照", async () => {
    const exact = "第一段：保留原标点、空格  与换行。\n第二段：￥123.40，不能变成摘要。";
    const forged = { id: "foreign-message", role: "user", parts: [{ type: "text", text: "伪造的上一轮原文" }] };
    const res = await POST(chatReq({ messages: [forged, userMessage(exact)], chatContext: { surface: "project", projectId: "project-1" } }, "creatoros_session=tok"));
    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.messages).toHaveLength(1);
    expect(input.messages[0].parts).toEqual([{ type: "text", text: exact }]);
    expect(input.trustedScriptSources).toEqual([expect.objectContaining({
      ref: "message:m-1", sourceType: "message", sourceId: "m-1", text: exact, truncated: false,
    })]);
    expect(JSON.stringify(lastSnapshot)).not.toContain("伪造的上一轮原文");
  });

  it("[LED-020] 持久快照实际装配参考历史作品封面链：先读发布候选，再调用 cover.generate", async () => {
    const { registerAllTemplates, getTemplate } = await import("@creatoros/ai-worker");
    const { prepareChatReply: realPrepare } = await vi.importActual<typeof import("@/server/prepare-chat-reply")>("@/server/prepare-chat-reply");
    registerAllTemplates();
    resolveContextFromToken.mockResolvedValue({ userId: "u-1", accountId: "acct-1" });
    resolveEffectiveSkillSnapshot.mockImplementation(async (_ctx, ids: string[]) => ({
      snapshotVersion: 1, userId: "u-1", accountId: "acct-1", resolvedAt: "2026-09-20T00:00:00.000Z",
      platformPolicyVersion: "1", platformPolicy: "平台规则",
      skills: [...new Set(ids)].sort().map(skillId => {
        const template = getTemplate(skillId);
        return { skillId, baseVersion: template.version, overlayRevision: null, overlayVersion: null,
          effective: { methodSystem: template.system, template: template.template, tools: template.tools ?? [],
            requiredFacets: template.requiredFacets ?? [], contextRequirements: template.contextRequirements ?? [],
            outputSchema: null, completionPolicy: null, completionPolicyAdapter: null } };
      }),
    }));
    prepareChatReply.mockImplementation(realPrepare);
    const res = await POST(chatReq({
      messages: [userMessage("先找到我最新且最关联的已发布作品，用它的封面作为参考图生成新封面")],
      chatContext: { surface: "project", projectId: "project-1" },
    }, "creatoros_session=tok"));
    expect(res.status).toBe(200);
    expect(submittedAssembly?.forcedToolSequence).toEqual(["context.publications", "cover.generate"]);
    const names = (submittedAssembly?.tools as Array<{ name: string }>).map(tool => tool.name);
    expect(names).toContain("context.publications");
    expect(names).toContain("cover.generate");
    expect(names).not.toContain("local.tools");
    expect(submittedAssembly?.system).toContain("cover.generate.referenceAssetId");
  });

  it("原路由提交 → 真实执行账本完成：assistant 正文、用量、任务终态和事件原子落库", async () => {
    const { createDb, aiMessages, aiTasks, aiTaskResults, executionTasks, executionStreamEvents, eq } = await import("@creatoros/backend");
    const { createAiRepository, createChatTurnSubmissionService, createChatTurnCompletionService } = await import("@creatoros/backend/modules/ai");
    const { createPersistentTaskService, createExecutionCallLedgerService, createExecutionCheckpointService } = await import("@creatoros/backend/modules/execution");
    const { createExecutionGenerationPorts } = await import("../../../../../backend/src/modules/execution/execution-generation-ports.service");
    const instance = await createDb();
    const { db, client } = instance;
    let sequence = 0;
    const ctx = { userId: "t1017-user", accountId: "t1017-account", requestId: "t1017", source: "user" as const };
    const now = () => new Date().toISOString();
    const repo = createAiRepository(db, { userId: ctx.userId, accountId: ctx.accountId, now, nextId: prefix => `${prefix}-t1017-${++sequence}` });
    try {
      resolveContextFromToken.mockResolvedValue(ctx);
      createConversation.mockImplementation((_ctx, input) => repo.createConversation(input));
      createMessage.mockImplementation((_ctx, conversationId, input) => repo.createMessage(conversationId, { role: "user", content: input.content, attachments: input.attachments ?? [], modelMetadata: {} }));
      getConversation.mockImplementation((_ctx, id) => repo.requireConversation(id));
      listMessages.mockImplementation((_ctx, id) => repo.listMessages(id));
      prepareChatReply.mockImplementation(async (_runtime, owner, snapshot, input) => ({
        capability: "copilot.assist", system: "固定回归策略", maxSteps: 6, maxOutputTokens: 128, tools: [],
        messages: input.messages.map((message: { role: string; parts: Array<{ type: string; text?: string }> }) => ({
          role: message.role,
          content: message.parts.filter(part => part.type === "text").map(part => part.text).join(""),
        })),
      }));
      durableSubmit.mockImplementation((owner, input, assemble) =>
        createChatTurnSubmissionService(db, { assemble }).submit(owner, input));
      const response = await POST(chatReq({ messages: [userMessage("真实回合问题")] }, "creatoros_session=tok"));
      expect(response.status).toBe(200);
      const executionTaskId = response.headers.get("x-execution-task-id")!;
      const conversationId = response.headers.get("x-conversation-id")!;
      const source = (await repo.listMessages(conversationId))[0]!;
      expect(source).toMatchObject({ id: expect.any(String), role: "user", content: "真实回合问题", modelMetadata: { chatTaskId: expect.any(String) } });
      const replay = await POST(chatReq({
        messages: [userMessage("真实回合问题")], conversationId, trigger: "regenerate-message",
      }, "creatoros_session=tok"));
      expect(replay.status).toBe(200);
      expect(replay.headers.get("x-execution-task-id")).toBe(executionTaskId);
      expect(await repo.listMessages(conversationId)).toHaveLength(1);
      const task = (await db.select().from(executionTasks).where(eq(executionTasks.id, executionTaskId)))[0]!;
      expect(task).toMatchObject({ ownerType: "ai_task", payload: { modelInput: { sourceMessageId: source.id, conversationId } } });
      const claim = (await createPersistentTaskService(db).claimTask({ taskId: executionTaskId, workerId: "t1017-worker" }))!;
      const ref = { executionTaskId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken };
      const budget = { maxCalls: 6, maxTokens: 10000, deadlineMs: 60000 };
      const generation = createExecutionGenerationPorts(db, { budget });
      const ledger = createExecutionCallLedgerService(db, { budget });
      const call = await generation.reserveGenerationCall(ref, { operationKey: `chat:${source.id}/model/1`, request: { maxOutputTokens: 128 } });
      await ledger.start(ref, call.callId);
      await generation.settleGenerationCall(ref, {
        callId: call.callId, status: "settled",
        providerResult: { content: [{ type: "text", text: "真实完成回复" }], finishReason: { unified: "stop" }, usage: { inputTokens: { total: 21, cacheRead: 5 }, outputTokens: { total: 8 } }, warnings: [] },
        usage: { inputTokens: 21, outputTokens: 8 },
      });
      await createExecutionCheckpointService(db).save(ref, { expectedRevision: 0, expectedLedgerSequence: 1, messages: [{ role: "assistant", callId: call.callId }] });
      const result = await createChatTurnCompletionService(db).commitResult(ref, { lastModelCallId: call.callId, toolCallIds: [] });
      expect(result).toMatchObject({ outcome: "succeeded", messageId: `chat:${source.id}` });
      const messages = await repo.listMessages(conversationId);
      expect(messages).toHaveLength(2);
      expect(messages[1]).toMatchObject({ role: "assistant", content: "真实完成回复", inputTokens: 21, outputTokens: 8, cachedTokens: 5, modelMetadata: { sourceMessageId: source.id, chatTaskId: result.aiTaskId } });
      expect((await db.select().from(aiTasks).where(eq(aiTasks.id, result.aiTaskId)))[0]?.status).toBe("succeeded");
      expect((await db.select().from(executionTasks).where(eq(executionTasks.id, executionTaskId)))[0]?.status).toBe("succeeded");
      expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.id, result.resultId))).toHaveLength(1);
      expect((await db.select().from(executionStreamEvents).where(eq(executionStreamEvents.executionTaskId, executionTaskId))).at(-1)?.chunk).toMatchObject({ type: "finish", finishReason: "stop" });
      expect(await response.text()).toContain("data: [DONE]");
    } finally {
      await client.close();
    }
  }, 30000);

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
    const input = preparedInput();
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

  it("[T-128] 原任务订阅完整重放文本、工具卡和完成事件", async () => {
    const chunks = [
      { type: "text-delta", id: "text-1", delta: "给你 3 个选题" },
      { type: "tool-output-available", toolCallId: "tc-1", output: { kind: "topic.candidates", items: [{ title: "A" }] } },
      { type: "finish", finishReason: "stop" },
    ];
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: chunks.map(chunk => ({ chunk })), hasMore: false, status: "succeeded" };
    });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const body = await res.text();
    for (const chunk of chunks) expect(body).toContain(`data: ${JSON.stringify(chunk)}`);
    expect(body).toContain("data: [DONE]");
  });

  it("[T-128/T-464] 纯空模型结果不可伪装成功，原任务返回失败事件", async () => {
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: [], hasMore: false, status: "failed" };
    });
    durableGet.mockResolvedValue({ errorCode: "MODEL_EMPTY_RESULT", errorMessage: "AI 未返回任何内容" });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(await res.text()).toContain('"type":"error"');
    expect(durableGet).toHaveBeenCalledWith({ userId: "u-1" }, "execution-1");
  });

  it("[T-464] 空取消轮只回传 abort，不造 assistant 正文", async () => {
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: [], hasMore: false, status: "cancelled" };
    });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const body = await res.text();
    expect(body).toContain('data: {"type":"abort"}');
    expect(body).not.toContain('"type":"text-delta"');
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
    expect(durableSubmit).not.toHaveBeenCalled();
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

  it("[T-096] 非法 scope 声明回落推导后仍核对已有会话归属", async () => {
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
    expect(getConversation).toHaveBeenCalledWith({ userId: "u-1" }, "conv-any");
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-any", {
      content: "hi",
    });
  });

  it("装配抛错(如没配 key)→ 400(诚实,不假成功)", async () => {
    prepareChatReply.mockRejectedValue(
      new Error(
        "https://channel-model.internal/v1 model=private-model apiKey=SECRET_CHANNEL_KEY",
      ),
    );
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("x-conversation-id")).toBe("conv-1");
    const body = await res.json();
    expect(body.error).toContain("输入已保留");
    expect(durableSubmit).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("SECRET_CHANNEL_KEY");
    expect(JSON.stringify(body)).not.toContain("private-model");
    expect(JSON.stringify(body)).not.toContain("channel-model.internal");
  });

  it("用户消息保存失败禁止提交持久任务，并返回可重试错误", async () => {
    createMessage.mockRejectedValue(new Error("db down"));
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "消息保存失败，请重试。" });
    expect(durableSubmit).not.toHaveBeenCalled();
  });
});

// ── [T-239c] 中断仅释放订阅；持久任务由显式命令控制 ──
describe("[T-239c] POST /api/chat — 中断与恢复", () => {
  it("请求信号进入装配，但断开事件连接不向原任务发送 cancel", async () => {
    const controller = new AbortController();
    durableSubscribe.mockImplementationOnce(async function* (_ctx, _id, signal: AbortSignal) {
      yield { events: [{ chunk: { type: "text-delta", id: "t", delta: "已写" } }], hasMore: true, status: "running" };
      await new Promise<void>(resolve => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    const req = new Request(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"), {
      signal: controller.signal,
    });
    const res = await POST(req);
    expect(preparedInput().abortSignal).toBe(req.signal);
    controller.abort();
    expect(await res.text()).toContain("已写");
    expect(durableCommand).not.toHaveBeenCalled();
  });

  it("取消轮保留原任务已确认的文本与工具事件，不补造结束消息", async () => {
    const chunks = [
      { type: "text-delta", id: "t", delta: "已产出的半截回答" },
      { type: "tool-output-available", toolCallId: "tc-1", output: { kind: "material.gather", items: [] } },
    ];
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: chunks.map(chunk => ({ chunk })), hasMore: false, status: "cancelled" };
    });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const body = await res.text();
    for (const chunk of chunks) expect(body).toContain(JSON.stringify(chunk));
    expect(body).toContain('data: {"type":"abort"}');
    expect(body).not.toContain('"type":"finish"');
    expect(res.headers.get("x-execution-task-id")).toBe("execution-1");
  });

  it("空取消轮只有 abort，用户消息仍已绑定原任务", async () => {
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: [], hasMore: false, status: "cancelled" };
    });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(await res.text()).toContain('data: {"type":"abort"}');
    expect(durableSubmit).toHaveBeenCalledWith(
      { userId: "u-1" }, { conversationId: "conv-1", sourceMessageId: "m-1" }, expect.any(Function),
    );
  });

  it("供应商失败只发可行动的安全文案，不把原始配置或密钥推给客户端", async () => {
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: [], hasMore: false, status: "failed" };
    });
    durableGet.mockResolvedValue({ errorMessage: "apiKey=SECRET_CHANNEL_KEY https://private.example/v1" });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const body = await res.text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toMatch(/SECRET_CHANNEL_KEY|private\.example/);
  });

  it("回执未知显式标记，不能把待确认任务当成成功", async () => {
    durableSubscribe.mockImplementationOnce(async function* () {
      yield { events: [], hasMore: false, status: "unknown_result" };
    });
    durableGet.mockResolvedValue({ errorCode: "CHAT_RESULT_UNCONFIRMED" });
    const res = await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(await res.text()).toContain("CHAT_RESULT_UNCONFIRMED");
  });
});

// ── [T-239f S6] regenerate 幂等:user 消息不重复落库 ────────────────────────────────
describe("[T-239f] POST /api/chat — user 消息去重", () => {
  it("trigger='regenerate-message'(useChat regenerate 重发同一条 user)→ 不重复 insert,流式照跑", async () => {
    listMessages.mockResolvedValue([{ id: "m-original", role: "user", content: "hi", attachments: [], createdAt: "2026-09-20T00:00:00.000Z" }]);
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
    expect(durableSubmit).toHaveBeenCalledWith(
      { userId: "u-1" },
      { conversationId: "conv-existing", sourceMessageId: "m-original" },
      expect.any(Function),
    );
  });

  it("regenerate 找不到原用户消息时拒绝新建任务，不把重复发送变成新回合", async () => {
    listMessages.mockResolvedValue([]);
    const res = await POST(chatReq({
      messages: [userMessage("hi")], conversationId: "conv-existing", trigger: "regenerate-message",
    }, "creatoros_session=tok"));
    expect(res.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
    expect(durableSubmit).not.toHaveBeenCalled();
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
    expect(durableSubmit).toHaveBeenCalledTimes(1);
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
    listMessages.mockRejectedValueOnce(new Error("db down")).mockResolvedValue([]);
    const res = await POST(
      chatReq(
        { messages: [userMessage("hi")], conversationId: "conv-existing" },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(durableSubmit).toHaveBeenCalledTimes(1);
  });

  it("首轮新会话(无 conversationId)不读历史,直接落 user 消息", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(listMessages).not.toHaveBeenCalled();
    expect(createMessage).toHaveBeenCalledTimes(1);
  });
});

describe("[T-716] POST /api/chat — 附件上下文", () => {
  it("图片经素材归属门读取，只把 assetId 落消息，模型临时收到 file part", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("看看这张图")],
          attachmentIds: ["asset-img"],
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    expect(readChatAttachment).toHaveBeenCalledWith(
      { userId: "u-1" },
      "asset-img",
    );
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-1", {
      content: "看看这张图",
      attachments: ["asset-img"],
    });
    const input = preparedInput();
    const last = input.messages.at(-1);
    expect(last.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          mediaType: "image/png",
          filename: "参考图.png",
          url: "data:image/png;base64,AQID",
        }),
      ]),
    );
  });

  it("文档抽取内容作为 user_data 注入，不把正文写进 attachments", async () => {
    readChatAttachment.mockResolvedValueOnce({
      assetId: "asset-doc",
      name: "brief.md",
      assetType: "document",
      mimeType: "text/markdown",
      fileSize: 12,
      extractedText: "目标用户是国内餐饮老板。",
      bytes: new TextEncoder().encode("目标用户是国内餐饮老板。"),
    });
    await POST(
      chatReq(
        {
          messages: [userMessage("结合资料给建议")],
          attachmentIds: ["asset-doc"],
        },
        "creatoros_session=tok",
      ),
    );
    const input = preparedInput();
    const injected = input.messages.at(-1).parts.at(-1);
    expect(injected.type).toBe("text");
    expect(injected.text).toContain("<user_data>");
    expect(injected.text).toContain("目标用户是国内餐饮老板");
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1" }, "conv-1", {
      content: "结合资料给建议",
      attachments: ["asset-doc"],
    });
    expect(input.trustedScriptSources).toEqual([
      expect.objectContaining({
        ref: "message:m-1",
        sourceType: "message",
        sourceId: "m-1",
        text: "结合资料给建议",
      }),
      expect.objectContaining({
        ref: "attachment:asset-doc",
        sourceType: "attachment",
        sourceId: "asset-doc",
        text: "目标用户是国内餐饮老板。",
        truncated: false,
      }),
    ]);
  });

  it("Markdown 无预抽取结果时仍直接读取原始字节", async () => {
    readChatAttachment.mockResolvedValueOnce({
      assetId: "asset-md-raw",
      name: "访谈记录.md",
      assetType: "document",
      mimeType: "text/markdown",
      fileSize: 30,
      extractedText: null,
      bytes: new TextEncoder().encode("# 前采\n用户希望服务国内餐饮老板。"),
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("文件内容是什么？")],
          attachmentIds: ["asset-md-raw"],
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.messages.at(-1).parts.at(-1).text).toContain(
      "用户希望服务国内餐饮老板",
    );
  });

  it("PDF 无预抽取结果时可直接抽取文本", async () => {
    const bytes = minimalTextPdf("PDF attachment works");
    readChatAttachment.mockResolvedValueOnce({
      assetId: "asset-pdf-raw",
      name: "research.pdf",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: bytes.byteLength,
      extractedText: null,
      bytes,
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("读取 PDF")],
          attachmentIds: ["asset-pdf-raw"],
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.messages.at(-1).parts.at(-1).text).toContain(
      "PDF attachment works",
    );
  });

  it("DOCX 无预抽取结果时可直接抽取文本", async () => {
    const bytes = new Uint8Array(Buffer.from(MINIMAL_DOCX_BASE64, "base64"));
    readChatAttachment.mockResolvedValueOnce({
      assetId: "asset-docx-raw",
      name: "定位说明.docx",
      assetType: "document",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: bytes.byteLength,
      extractedText: null,
      bytes,
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("读取 Word")],
          attachmentIds: ["asset-docx-raw"],
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(200);
    const input = preparedInput();
    expect(input.messages.at(-1).parts.at(-1).text).toContain(
      "Word附件可以读取国内餐饮定位",
    );
  });

  it("损坏 PDF 不泄漏解析器内部错误，返回明确的文件提示", async () => {
    readChatAttachment.mockResolvedValueOnce({
      assetId: "asset-pdf-broken",
      name: "损坏文件.pdf",
      assetType: "document",
      mimeType: "application/pdf",
      fileSize: 12,
      extractedText: null,
      bytes: new TextEncoder().encode("not-a-pdf"),
    });

    const res = await POST(
      chatReq(
        {
          messages: [userMessage("读取文件")],
          attachmentIds: ["asset-pdf-broken"],
        },
        "creatoros_session=tok",
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "附件内容解析失败，请确认文件未损坏后重试。",
    });
    expect(durableSubmit).not.toHaveBeenCalled();
  });

  it("拒绝超过五个附件，且不会启动模型", async () => {
    const res = await POST(
      chatReq(
        {
          messages: [userMessage("读取")],
          attachmentIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
        },
        "creatoros_session=tok",
      ),
    );
    expect(res.status).toBe(400);
    expect(durableSubmit).not.toHaveBeenCalled();
  });
});
