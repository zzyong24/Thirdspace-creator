import { NextResponse } from "next/server";
import type { UIMessage } from "ai";
import type { RequestContext } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
} from "@creatoros/backend/modules/identity";
import { getChatRuntime } from "@/server/persistence-client";
import { runChatStream } from "@/server/ai/chat-runner";
import type { ChatContext } from "@/server/ai/chat-context";
import { readSessionCookie } from "../v1/auth/_session";
import { resolveRequestContext } from "@/lib/request-context.server";
import { humanizeAiError } from "@/lib/ai-error-humanize";

// 上下文感知 ChatBox 的流式入口(SPEC §3.3)—— 全程 Vercel AI SDK,**不走 RPC envelope**:
// useChat 客户端 POST { messages, chatContext } 到这里 → 鉴权(同 dispatch:session cookie →
// RequestContext)→ runChatStream 装配(resolve skill + 注入 CreativeContext facets + 挂工具)
// → streamText 流式返回 → onFinish 把这轮的 user/assistant 文本落 ai_conversations/ai_messages。
//
// 铁律:AI 只产候选(工具 execute 产候选,经 tool-result part 流回前端渲 AdoptCandidateCard,
// 人采纳走 confirm 门;AI 不直接写实体)。没配 model key → runChatStream 抛 LlmCredentialError,
// 这里接住返 4xx(不假成功、不静默吞)。

export const dynamic = "force-dynamic";

// useChat(@ai-sdk/react)发来的请求体。messages 是 UIMessage[];chatContext 是会话三层注入的
// 上下文(surface 必填)。conversationId 可选(首轮缺省由路由 lazy 建一个会话复用)。
// [T-096] chatContext.scope = 会话作用域声明(前端 resolveChatScope 保证必带):
//   'global' | 'project:<id>' | 'surface:<name>'。lazy 建会话落它;续接时与库中会话的
//   scope 比对,不一致按 OwnershipError 语义 4xx 拒绝 —— 隔离锁在服务端,前端 bug/手工
//   请求都穿不透(SPEC 2026-07-03 §1.3-3)。
interface ChatRequestBody {
  messages?: UIMessage[];
  chatContext?: Partial<ChatContext> & { scope?: string };
  conversationId?: string;
}

// scope 文法校验(宽松:三段式前缀;非法声明视为未声明,回落推导)。
function isValidScope(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  if (v === "global") return true;
  if (v.startsWith("project:") && v.length > "project:".length) return true;
  if (v.startsWith("surface:") && v.length > "surface:".length) return true;
  return false;
}

// 从 UIMessage 里抽纯文本(useChat v7 的消息是 parts 数组)。只取 text part 拼起来 —— 落库
// ai_messages.content 是纯文本;工具调用/结果不进 content(它们随流回前端渲卡)。
function textOf(message: UIMessage | undefined): string {
  if (!message) return "";
  const parts = (message as { parts?: Array<{ type: string; text?: string }> })
    .parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim();
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // 鉴权:同 dispatch —— [T-046 单机免登录] 有 cookie 验 token,无/失效 cookie 以本机
  // 主用户直通;401 仅剩「库中无任何用户」的异常态兜底。
  const rawToken = readSessionCookie(req);
  let ctx: RequestContext;
  try {
    ctx = await resolveRequestContext(rawToken);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  // surface 必填(页面层注入);缺省回落 topics(当前唯一落地的 ChatBox skill)—— 路由不因
  // 缺 surface 崩,resolveSkillForSurface 也会兜底。
  const chatContext: ChatContext = {
    surface:
      typeof body.chatContext?.surface === "string"
        ? body.chatContext.surface
        : "topics",
    functionKey: body.chatContext?.functionKey,
    projectId: body.chatContext?.projectId ?? null,
    selection: body.chatContext?.selection,
  };

  const runtime = await getChatRuntime();

  // 持久化(SPEC §3.3:消息落 ai_conversations/ai_messages)——
  //   会话:body.conversationId 复用;缺省 lazy 建一个(标题取首条用户消息前缀)。
  //   本轮用户消息:落 createMessage(最新一条 user)。
  //   assistant 回复:streamText.onFinish 落 appendAssistantMessage(纯文本)。
  // 持久化失败绝不阻断流式(对话优先);best-effort + 记日志。
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = textOf(lastUser);

  // [T-096] 会话作用域:显式声明(前端 resolver 保证)优先;旧客户端未带时按迁移同款语义推导
  // (有 projectId → project:<id>,否则 global),保证 lazy 建的会话永远有归属。
  const rawScope = body.chatContext?.scope;
  const declaredScope = isValidScope(rawScope) ? rawScope : null;
  const scope =
    declaredScope ??
    (chatContext.projectId ? `project:${chatContext.projectId}` : "global");

  let conversationId = body.conversationId ?? "";

  // [T-096] 续接校验(服务端硬门,SPEC §1.3-3):带 conversationId 且显式声明了 scope 时,
  // 核对库中会话的 scope 与声明一致。不一致 = 跨作用域续接(泄漏路径)→ 4xx 拒绝,不续写、
  // 不读回。校验在持久化/流式之前 —— 该门失败绝不算 best-effort。
  if (conversationId && declaredScope) {
    try {
      const conv = await runtime.ai.getConversation(ctx, conversationId);
      if (conv.scope !== declaredScope) {
        return NextResponse.json(
          {
            error: `conversation scope mismatch: conversation belongs to "${conv.scope}", request declared "${declaredScope}"`,
          },
          { status: 403 },
        );
      }
    } catch (err) {
      // 跨用户/未知 conversationId(OwnershipError)→ 404(不泄漏存在性,原语义)。
      if (err instanceof OwnershipError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  }

  try {
    if (!conversationId) {
      const title = userText.slice(0, 24) || "AI 助手";
      const conv = await runtime.ai.createConversation(ctx, {
        title,
        projectId: chatContext.projectId ?? null,
        // [T-096] lazy 建会话落作用域 —— 会话从出生起就有归属桶。
        scope,
      });
      conversationId = conv.id;
    }
    if (userText) {
      await runtime.ai.createMessage(ctx, conversationId, { content: userText });
    }
  } catch (err) {
    console.error("[api/chat] persist user turn failed:", err);
  }

  try {
    const result = await runChatStream(
      ctx,
      { messages, chatContext },
      {
        // 展开 runtime.context 里所有已绑定的 CreativeContext reader(positioning / learnings /
        // signals / knowledge / accounts / reviewSubject …)。原来手列 4 个,漏了 reviewSubject
        // (T-039a 复盘对象)与 accounts(T-039b 账号画像)—— 装配点 assembleCreativeContext 拿不到
        // 就跳过对应 facet。改为整体展开:composition root 绑什么,装配层就能读什么,不再逐个漏接。
        ...runtime.context,
        resolveModelSpec: runtime.resolveModelSpec,
        // 只读 context 工具(context.projects/knowledge/materials)的真数据读端口(user-scoped)。
        contextReaders: runtime.contextReaders,
        // [T-084a] 联网检索端口 —— gatherMaterials 先真搜索、honestyBlock 探测未配诚实降级。
        probeSearchConfigured: runtime.probeSearchConfigured,
        searchWeb: runtime.searchWeb,
        // [T-084b] material.screenshot 端口 —— 真无头浏览器截公开页 → 落 asset(带 sourceUrl)。
        captureScreenshotPort: runtime.captureScreenshot,
        // [T-084c] material.generate 端口 —— dispatch 既有 asset.generate task(立即返回 taskId)。
        dispatchGenerateAssetPort: runtime.dispatchGenerateAsset,
      },
      async (finalText) => {
        // assistant 回复落库(best-effort,失败不影响已流给前端的内容)。
        const text = finalText.trim();
        if (!text || !conversationId) return;
        try {
          await runtime.ai.appendAssistantMessage(ctx, conversationId, text);
        } catch (err) {
          console.error("[api/chat] persist assistant reply failed:", err);
        }
      },
    );
    // 流式回前端(useChat 消费 UIMessage stream);回带 conversationId 头供客户端复用会话。
    // [T-094] onError:流中错误(如 MiniMax 内容安全审核拦截整轮输入 new_sensitive/1026)
    // 转人话再进 error part —— 不用 SDK 默认掩码("An error occurred"),也不裸吐机器码;
    // 人话规则未命中时回落原始 message(诚实)。前端错误气泡直接渲这段文案。
    return result.toUIMessageStreamResponse({
      headers: { "x-conversation-id": conversationId },
      onError: (error) => {
        console.error("[api/chat] stream errored:", error);
        const human = humanizeAiError(error);
        if (human) return human.message;
        return error instanceof Error ? error.message : String(error);
      },
    });
  } catch (err) {
    if (err instanceof OwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    // 没配 model key(LlmCredentialError)等装配期错误 → 诚实 4xx(不假绿、不静默)。
    // [T-094] 平台类错误(内容审核/限流/配额)先过人话映射,用户拿到能行动的说明。
    const message =
      humanizeAiError(err)?.message ??
      (err instanceof Error ? err.message : String(err));
    console.error("[api/chat] stream failed:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
