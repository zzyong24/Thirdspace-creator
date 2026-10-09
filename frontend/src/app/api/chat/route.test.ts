import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from "vitest";

// /api/chat 当前持久契约：身份/消息/外部内容端口为合成夹具；真实PGlite提交、租约、账本、完成与SSE。
import {createRouteDurableFixture} from '../../../../../backend/src/modules/ai/chat-route-durable.test-fixture';
import {registerAllTemplates,getOfficialSkillBase} from '@creatoros/ai-worker';
let durableFixture: Awaited<ReturnType<typeof createRouteDurableFixture>>;
const prepareChatReplySpy=vi.hoisted(()=>vi.fn());
vi.mock('@/server/prepare-chat-reply',async original=>{
 const actual=await original<typeof import('@/server/prepare-chat-reply')>();
 return {...actual,prepareChatReply:(...args:Parameters<typeof actual.prepareChatReply>)=>prepareChatReplySpy(...args)};
});
beforeAll(async()=>{registerAllTemplates();durableFixture=await createRouteDurableFixture();});
afterEach(async()=>{await durableFixture.reset();});
afterAll(async()=>{await durableFixture.close();});

const resolveContextFromToken = vi.fn();
const resolveLocalContext = vi.fn();
const createConversation = vi.fn();
const createMessage = vi.fn();
const appendAssistantMessage = vi.fn();
// [T-096] 续接校验读会话 scope 用。
const getConversation = vi.fn();
// [T-239f] user 去重的历史读(兜底路径:无 trigger 的老客户端按「最后一条=同内容 user 行」判)。
const listMessages = vi.fn();
const dispatchDouyinShare = vi.fn();
const readChatAttachment = vi.fn();
const resolveCurrentScriptSelection = vi.fn();
const resolveEffectiveSkillSnapshot = vi.fn();


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
    durable: {
      get:(...args:Parameters<typeof durableFixture.runtime.get>)=>durableFixture.runtime.get(...args),
      command:(...args:Parameters<typeof durableFixture.runtime.command>)=>durableFixture.runtime.command(...args),
      subscribe:(...args:Parameters<typeof durableFixture.runtime.subscribe>)=>durableFixture.runtime.subscribe(...args),
      submit:async(ctx:Parameters<typeof durableFixture.runtime.submit>[0],input:Parameters<typeof durableFixture.runtime.submit>[1],assemble:Parameters<typeof durableFixture.runtime.submit>[2])=>{
        const created=createConversation.mock.calls.at(-1)?.[1];
        const conversation=created??await getConversation.mock.results.at(-1)?.value??{scope:'global'};
        let history:Record<string,unknown>[]=[];
        try{history=await listMessages.mock.results.at(-1)?.value??[];}catch{}
        const saved=await createMessage.mock.results.at(-1)?.value;
        const source=saved?.id===input.sourceMessageId && createMessage.mock.calls.at(-1)?.[2]
          ? {...createMessage.mock.calls.at(-1)![2],id:saved.id,role:'user'}
          : history.find(row=>row.id===input.sourceMessageId && row.role==='user');
        if(!source)throw Error('隔离夹具没有匹配的保存回执或历史源消息');
        await durableFixture.seed(ctx,input,conversation,history,source);
        return durableFixture.runtime.submit(ctx,input,assemble);
      },
    },
    resolveModelSpec: vi.fn(),
    dispatchDouyinShare,
    readChatAttachment,
    resolveCurrentScriptSelection,
    contextReaders:{getProjectDetail:async()=>({id:"project-1",title:"项目",stage:"planning",status:"active",publish:{published:false,platform:null,publishedAt:null},brief:{},artifacts:[]})},
    searchWeb:async()=>{throw Error("装配不得访问外网")},
    context: {
      positioning: {getPositioningCenter:async()=>({profile:null,currentStatement:null})},
      learnings: {getSuggestions:async()=>[]},
      signals: {list:async()=>[]},
      knowledge: {list:async()=>[]},
      accounts:{list:async()=>[]},
    },
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

beforeEach(async () => {
  resolveContextFromToken.mockReset();
  resolveContextFromToken.mockResolvedValue({ userId: "u-1", accountId: "acct-1" });
  resolveLocalContext.mockReset();
  resolveLocalContext.mockResolvedValue({ userId: "u-1", accountId: "acct-1" });
  createConversation.mockReset();
  let conversationSequence=0;
  createConversation.mockImplementation(async()=>({id:`conv-${++conversationSequence}`}));
  getConversation.mockReset();
  getConversation.mockResolvedValue({ id: "conv-existing", scope: "global" });
  createMessage.mockReset();
  let messageSequence=0;
  createMessage.mockImplementation(async()=>{
    let history:Array<{id:string}>=[];try{history=await listMessages.mock.results.at(-1)?.value??[];}catch{}
    let id:string;do{id=`m-${++messageSequence}`;}while(history.some(row=>row.id===id));
    return {id};
  });
  listMessages.mockReset();
  listMessages.mockResolvedValue([]);
  appendAssistantMessage.mockReset();
  appendAssistantMessage.mockResolvedValue({ id: "m-2" });
  resolveEffectiveSkillSnapshot.mockReset();
  resolveEffectiveSkillSnapshot.mockImplementation(async(ctx,ids:string[])=>({snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:'2026-09-08T00:00:00Z',platformPolicyVersion:'1',platformPolicy:'遵守用户选择',skills:[...new Set(ids)].sort().map(skillId=>{const t=getOfficialSkillBase(skillId);if(!t)throw Error(`缺少官方 Skill ${skillId}`);return {skillId,baseVersion:t.baseVersion,overlayRevision:null,overlayVersion:null,effective:{methodSystem:t.methodSystem,template:t.template,tools:t.tools??[],requiredFacets:t.requiredFacets??[],contextRequirements:t.contextRequirements??[],outputSchema:t.outputSchema??null,completionPolicy:t.completionPolicy??null,completionPolicyAdapter:t.completionPolicyAdapter??null}};})}));
  prepareChatReplySpy.mockReset();
  const {prepareChatReply}=await vi.importActual<typeof import('@/server/prepare-chat-reply')>('@/server/prepare-chat-reply');
  prepareChatReplySpy.mockImplementation(prepareChatReply);
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
    expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — 装配 + 持久化", () => {
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
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
      { userId: "u-1", accountId: "acct-1" },
      {
        artifactId: "artifact-script",
        versionId: "version-3",
        sectionId: "section-2",
        sectionIndex: 1,
        excerpt: "旧版段落正文",
      },
    );
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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

    expect((await durableFixture.rows()).execution[0].payload).toMatchObject({hostContext:{chatContext:{functionKey:'script.patch',selection:{versionId:'version-8'}}}});
    await durableFixture.fail('opaque-secret https://opaque.example/v1 stream interrupted');
    const body=await res.text();expect(body).toContain('"type":"error"');expect(body).not.toMatch(/opaque-secret|opaque\.example|stream interrupted/);
    expect((await durableFixture.rows()).execution[0].status).toBe('failed');

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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
  });

  it("有cookie保存输入后提交真实持久任务，返回原任务和会话回执", async () => {
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
      { userId: "u-1", accountId: "acct-1" },
      "conv-1",
      { content: "基于评论出 5 个选题" },
    );

    // 实际prepareChatReply只装配冻结输入，不执行模型。
    expect(resolveEffectiveSkillSnapshot).toHaveBeenCalledWith(
      { userId: "u-1", accountId: "acct-1" },
      expect.arrayContaining(["chatbox.topic", "creatoros.guide"]),
    );
    expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
    expect(input.chatContext.surface).toBe("topics");
    expect(input.messages).toHaveLength(1);
    const receipt=durableFixture.receipt()!;
    expect(res.headers.get('x-execution-task-id')).toBe(receipt.executionTaskId);
    expect((await durableFixture.rows()).business).toEqual([expect.objectContaining({id:receipt.taskId,status:'queued',executionTaskId:receipt.executionTaskId})]);
    await durableFixture.finish('stream');
    expect(await res.text()).toContain('[DONE]');
    for(const failure of [
      {message:'raw-error opaque-model opaque-secret https://opaque.example/v1 response-body',code:'MODEL_CONFIGURATION_REQUIRED',expected:'本次执行未完成，请检查模型配置后重试。'},
      {message:'AI 额度不足，请充值后再试。',code:'AI_CREDIT_EXHAUSTED',expected:'AI 额度不足，请充值后再试。'},
    ]){
      await durableFixture.reset();
      const failed=await POST(chatReq({messages:[userMessage('基于评论出 5 个选题')],chatContext:{surface:'topics'}},'creatoros_session=tok'));
      await durableFixture.fail(failure.message,failure.code);
      const body=await failed.text();expect(body).toContain(failure.expected);expect(body).toContain('[DONE]');expect(body).not.toMatch(/opaque-model|opaque-secret|opaque\.example|response-body|raw-error/);
    }

  });

  it("[T-267②] 首条消息是斜杠命令+路径 → lazy 建会话用净化后的标题(文件名),不用路径原文", async () => {
    await POST(
      chatReq(
        { messages: [userMessage("/cheat-predict scripts/2026-07-12_x.md")] },
        "creatoros_session=tok",
      ),
    );
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1", accountId: "acct-1" },
      expect.objectContaining({ title: "2026-07-12_x.md" }),
    );
  });

  it("缺 chatContext.surface → 默认 topics(选题编导)", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
      { userId: "u-1", accountId: "acct-1" },
      "conv-existing",
      { content: "hi" },
    );
  });

  it("[T-128] 已确认正文与完整工具parts由持久完成事务保存，刷新可回读", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await durableFixture.finish("给你 3 个选题",{tool:{name:"topic.generate",input:{},output:{kind:"topic.candidates",items:[{title:"A"}]}}});
    const messages=await durableFixture.messages();
    const reply=messages.find(row=>row.role==='assistant')!;
    expect(reply.content).toBe("给你 3 个选题");
    expect(reply.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:"text",text:"给你 3 个选题"}),expect.objectContaining({type:"tool-topic_generate",state:"output-available",output:{kind:"topic.candidates",items:[{title:"A"}]}})]));
    expect(messages.filter(row=>row.role==='assistant')).toHaveLength(1);
    const body=await res.text();expect(body).toContain('tool-output-available');expect(body).toContain('[DONE]');
    expect((await durableFixture.rows()).execution[0].status).toBe('succeeded');
  });

  it("[T-128/T-464] 纯空轮拒绝保存成功，不伪造兜底产物", async () => {
    await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await expect(durableFixture.finish("")).rejects.toThrow("没有可保存产物");
    expect((await durableFixture.messages()).filter(row=>row.role==='assistant')).toEqual([]);
    expect((await durableFixture.rows()).execution[0].status).toBe('running');
  });

  it("[T-464] 中断订阅的空轮保留原任务，未有产物不落空气泡", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await res.body!.cancel();
    expect((await durableFixture.messages()).filter(row=>row.role==='assistant')).toEqual([]);
    expect((await durableFixture.rows()).execution[0].status).toBe('queued');
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
      { userId: "u-1", accountId: "acct-1" },
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
      { userId: "u-1", accountId: "acct-1" },
      expect.objectContaining({ scope: "project:proj-1" }),
    );

    createConversation.mockClear();
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    expect(createConversation).toHaveBeenCalledWith(
      { userId: "u-1", accountId: "acct-1" },
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
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
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1", accountId: "acct-1" }, "conv-g", {
      content: "继续上次",
    });
  });

  it("[T-096] 非法scope按未声明推导，既有会话仍检查真实属主与有效scope", async () => {
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
    expect(getConversation).toHaveBeenCalledWith({userId:"u-1",accountId:"acct-1"},"conv-any");
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1", accountId: "acct-1" }, "conv-any", {
      content: "hi",
    });
  });

  it("装配抛错(如没配 key)→ 400(诚实,不假成功)", async () => {
    prepareChatReplySpy.mockRejectedValue(
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
    expect(body.error).toBe("本轮请求准备或提交未完成，输入已保留。请重试；仍失败时请提供诊断日志。");
    expect(JSON.stringify(body)).not.toContain("SECRET_CHANNEL_KEY");
    expect(JSON.stringify(body)).not.toContain("private-model");
    expect(JSON.stringify(body)).not.toContain("channel-model.internal");
  });

  it("持久化失败保留重试提示且不创建持久执行", async () => {
    createMessage.mockRejectedValue(new Error("db down"));
    const res = await POST(
      chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"),
    );
    expect(res.status).toBe(500);
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
    expect((await durableFixture.rows()).execution).toEqual([]);
  });
});

// ── [T-239c S2] 中断真一致:signal 贯通 + 中断轮部分产出落库 ─────────────────────────
describe("[T-239c] POST /api/chat — 中断真一致", () => {
  it("req.signal贯通当前准备阶段，持久执行取消由明确命令控制", async () => {
    await POST(chatReq({ messages: [userMessage("hi")] }, "creatoros_session=tok"));
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
    // Request.signal 是 AbortSignal 实例,原样透传给 streamText。
    expect(input.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("断开SSE订阅不取消持久任务，原任务仍能完成并回读", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    const original=res.headers.get('x-execution-task-id');
    const reader=res.body!.getReader();expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"start"');
    await reader.cancel();
    expect((await durableFixture.rows()).execution[0]).toMatchObject({id:original,status:'queued'});
    await durableFixture.finish('断开后保存的回复');
    expect((await durableFixture.rows()).execution[0]).toMatchObject({id:original,status:'succeeded'});
    expect((await durableFixture.messages()).find(row=>row.role==='assistant')?.content).toBe('断开后保存的回复');
  });

  it("长度中断轮保留部分正文与已确认工具卡，原任务投影partial", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await durableFixture.finish('已产出的半截回答',{reason:'length',tool:{name:'material.gather',input:{query:'隔离资料'},output:{kind:'material.gather',items:[],grounding:'web'}}});
    const reply=(await durableFixture.messages()).find(row=>row.role==='assistant')!;
    expect(reply).toMatchObject({content:'已产出的半截回答',modelMetadata:{completeness:'partial',stopReason:'length'}});
    expect(reply.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:'tool-material_gather',state:'output-available',output:{kind:'material.gather',items:[],grounding:'web'}})]));
    expect((await durableFixture.rows()).execution[0].status).toBe('partial');
    expect(await res.text()).toContain('"status":"partial"');
  });

  it("主动停止空轮提交明确cancel命令，不保存空气泡", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    const receipt=durableFixture.receipt()!;await res.body!.cancel();
    await durableFixture.runtime.command({userId:'u-1',accountId:'acct-1',requestId:'cancel',source:'user'},receipt.executionTaskId,'cancel');
    expect((await durableFixture.rows()).execution[0]).toMatchObject({id:receipt.executionTaskId,status:'cancelled'});
    expect((await durableFixture.messages()).filter(row=>row.role==='assistant')).toEqual([]);
  });
});

// ── [T-239e] 用量可见:onUsage 回报的 tokens 随 assistant 落库 ────────────────────────
describe("[T-239e] POST /api/chat — usage 落库", () => {
  it("已确认调用用量随完成事务落库，不以route回调冒调用回执", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await durableFixture.finish('好的',{usage:{inputTokens:2100,outputTokens:480,cachedTokens:1500}});
    expect((await durableFixture.messages()).find(row=>row.role==='assistant')).toMatchObject({content:'好的',inputTokens:2100,outputTokens:480,cachedTokens:1500});
    expect(await res.text()).toContain('[DONE]');
  });

  it("部分产物仍保留已确认真实用量，partial与usage并存", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await durableFixture.finish('半截',{reason:'length',usage:{inputTokens:900,outputTokens:120,cachedTokens:0}});
    expect((await durableFixture.messages()).find(row=>row.role==='assistant')).toMatchObject({content:'半截',inputTokens:900,outputTokens:120,cachedTokens:0,modelMetadata:{completeness:'partial'}});
    expect(await res.text()).toContain('"status":"partial"');
  });

  it("整轮没有provider用量回执时保持null，不伪造零用量", async () => {
    const res=await POST(chatReq({messages:[userMessage("hi")]},"creatoros_session=tok"));
    await durableFixture.finish('无用量轮');
    expect((await durableFixture.messages()).find(row=>row.role==='assistant')).toMatchObject({content:'无用量轮',inputTokens:null,outputTokens:null,cachedTokens:null});
    expect(await res.text()).toContain('[DONE]');
  });
});

// ── [T-239f S6] regenerate 幂等:user 消息不重复落库 ────────────────────────────────
describe("[T-239f] POST /api/chat — user 消息去重", () => {
  it("trigger='regenerate-message'(useChat regenerate 重发同一条 user)→ 不重复 insert,流式照跑", async () => {
    listMessages.mockResolvedValue([{id:'m-saved',role:'user',content:'hi'}]);
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
    expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
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
    expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
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
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1", accountId: "acct-1" }, "conv-existing", {
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
      { userId: "u-1", accountId: "acct-1" },
      "asset-img",
    );
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1", accountId: "acct-1" }, "conv-1", {
      content: "看看这张图",
      attachments: ["asset-img"],
    });
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
    const injected = input.messages.at(-1).parts.at(-1);
    expect(injected.type).toBe("text");
    expect(injected.text).toContain("<user_data>");
    expect(injected.text).toContain("目标用户是国内餐饮老板");
    expect(createMessage).toHaveBeenCalledWith({ userId: "u-1", accountId: "acct-1" }, "conv-1", {
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    const [, , , input] = prepareChatReplySpy.mock.calls[0];
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
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
    expect(prepareChatReplySpy).not.toHaveBeenCalled();
  });
});

// 原50个场景之外补当前恢复边界，不把明确再次生成混成同键恢复。
describe('持久source恢复反例',()=>{
  it.each([
    {name:'源消息不存在',history:[]},
    {name:'源正文已改变',history:[{id:'m-saved',role:'user',content:'不同输入'}]},
    {name:'源附件已改变',history:[{id:'m-saved',role:'user',content:'hi',attachments:['other-asset']}]},
  ])('$name拒绝重试，不补造user或换key',async({history})=>{
    listMessages.mockResolvedValue(history);
    const res=await POST(chatReq({messages:[userMessage('hi')],conversationId:'conv-existing',trigger:'regenerate-message'},'creatoros_session=tok'));
    expect(res.status).toBe(409);expect(await res.json()).toMatchObject({code:'CHAT_RETRY_SOURCE_MISMATCH'});
    expect(createMessage).not.toHaveBeenCalled();expect(prepareChatReplySpy).not.toHaveBeenCalled();expect((await durableFixture.rows()).execution).toEqual([]);
  });
  it('已成功原source只回读同一回答与回执，不重复模型或伪装成明确新生成',async()=>{
    listMessages.mockResolvedValue([{id:'m-saved',role:'user',content:'hi'}]);
    const input={messages:[userMessage('hi')],conversationId:'conv-existing'};
    const first=await POST(chatReq(input,'creatoros_session=tok'));const receipt=durableFixture.receipt()!;
    await durableFixture.finish('原答案',{usage:{inputTokens:2,outputTokens:3}});expect(await first.text()).toContain('原答案');
    const again=await POST(chatReq({...input,trigger:'regenerate-message'},'creatoros_session=tok'));
    expect(durableFixture.receipt()).toMatchObject({...receipt,replayed:true});expect(await again.text()).toContain('原答案');
    expect(createMessage).not.toHaveBeenCalled();expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
    const rows=await durableFixture.rows();expect(rows.execution).toHaveLength(1);expect(rows.calls).toHaveLength(1);
    expect((await durableFixture.messages()).filter(row=>row.role==='user')).toHaveLength(1);
  });
  it('未知原调用重发只观察同任务，不换键、不再请求模型',async()=>{
    listMessages.mockResolvedValue([{id:'m-saved',role:'user',content:'hi'}]);
    const input={messages:[userMessage('hi')],conversationId:'conv-existing'};
    const first=await POST(chatReq(input,'creatoros_session=tok'));const receipt=durableFixture.receipt()!;
    await durableFixture.unknown();await first.body!.cancel();
    const before=await durableFixture.rows();
    const again=await POST(chatReq({...input,trigger:'regenerate-message'},'creatoros_session=tok'));
    expect(durableFixture.receipt()).toMatchObject({...receipt,replayed:true});
    const body=await again.text();expect(body).toContain('CHAT_MODEL_RESPONSE_INTERRUPTED');expect(body).toContain('unknown_result');
    const after=await durableFixture.rows();expect(after.execution).toHaveLength(1);expect(after.calls).toEqual(before.calls);
    expect(after.execution[0]).toMatchObject({id:receipt.executionTaskId,status:'unknown_result',deadlineAt:before.execution[0].deadlineAt,executionBudget:before.execution[0].executionBudget});
    expect(createMessage).not.toHaveBeenCalled();expect(prepareChatReplySpy).toHaveBeenCalledTimes(1);
  });
  it.each([false,true])('主动停止已有正文与工具卡，确认用量=$0，原事件和账本保留且迟到成功拒绝',async(withUsage)=>{
    const res=await POST(chatReq({messages:[userMessage('hi')]},'creatoros_session=tok'));
    const prepared=await durableFixture.finish('停止前保存的半段',{deferCompletion:true,tool:{name:'material.gather',input:{query:'隔离资料'},output:{kind:'material.gather',items:[],grounding:'web'}},...(withUsage?{usage:{inputTokens:900,outputTokens:120,cachedTokens:0}}:{})});
    if(!('acknowledgeCancel' in prepared))throw Error('取消测试缺少待完成原调用');
    const receipt=durableFixture.receipt()!;
    await durableFixture.runtime.command({userId:'u-1',accountId:'acct-1',requestId:'cancel',source:'user'},receipt.executionTaskId,'cancel');
    await prepared.acknowledgeCancel();await expect(prepared.commit()).rejects.toThrow();
    const rows=await durableFixture.rows();expect(rows.execution[0]).toMatchObject({id:receipt.executionTaskId,status:'cancelled'});
    expect(JSON.stringify(rows.events)).toContain('停止前保存的半段');expect(JSON.stringify(rows.events)).toContain('tool-output-available');
    const model=rows.calls.filter(call=>call.kind==='model').at(-1)!;
    expect(model.status).toBe('settled');expect(model.providerResult).toMatchObject({usage:{inputTokens:withUsage?{total:900,cacheRead:0}:{},outputTokens:withUsage?{total:120}:{}}});
    expect((await durableFixture.messages()).filter(row=>row.role==='assistant')).toEqual([]);
    const body=await res.text();expect(body).toContain('停止前保存的半段');expect(body).toContain('"type":"abort"');expect(body).toContain('[DONE]');
  });
  it('夹具本身拒绝缺失ID或非user源，不补造消息修好错误请求',async()=>{
    for(const source of [{id:'wrong',role:'user',content:'hi'},{id:'m',role:'assistant',content:'hi'},{}]){
      await expect(durableFixture.seed({userId:'u-1',accountId:'acct-1',requestId:'source',source:'user'},{conversationId:'c',sourceMessageId:'m'},{scope:'global'},[],source)).rejects.toThrow('源消息与保存回执不符');
    }
    expect((await durableFixture.rows()).execution).toEqual([]);
  });
});
